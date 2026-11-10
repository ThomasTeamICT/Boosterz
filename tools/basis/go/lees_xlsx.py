"""Lees een xlsx naar neutrale ruwe JSON. Het script weet niets van het GO!.

Gebruik: python3 -I lees_xlsx.py <in.xlsx> <ruw.json>

Leest alleen:
- xl/workbook.xml (bladnamen), xl/_rels/workbook.xml.rels, xl/sharedStrings.xml,
  xl/styles.xml (alleen lettertypen met doorhaling of super-/subschrift) en het eerste blad;
- uit docProps/core.xml alleen dcterms:modified (nooit de maker of wie het laatst wijzigde).

Uitvoer: {bestand, bron, gewijzigd, bladnamen, blad, merged, tellingen, vreemde_cellen, verborgen_rijen,
verborgen_kolommen, opmerkingen, beelden, rijen}.
- bron: {bytes, sha256} van het gelezen bestand, zodat maak.ts nagaat dat de ruwe JSON bij het origineel hoort.
- vreemde_cellen: elke cel die geen gedeelde tekst, inlineStr of boolean is (getal, foutwaarde, formuletekst, datum),
  en elke waarde met een Excel-escape (_xHHHH_), als {r, k, soort, waarde} (k vanaf 0, waarde hoogstens 40 tekens).
- verborgen_rijen: de rijnummers van verborgen rijen met een waarde; verborgen_kolommen: [van, tot] (vanaf 0) van
  elk verborgen kolombereik; opmerkingen: het aantal leden xl/comments*.xml en xl/threadedComments/*;
  beelden: [rij, kolom] (rij vanaf 1, kolom vanaf 0; [0, 0] voor een anker zonder cel) van elk anker in de drawing
  van het eerste blad (beeld, vorm of grafiek).
Elke rij is {r, c, opmaak?}. 'c' bevat de cellen als platte tekst (alle tekst, ook
doorgehaalde), 'opmaak' bestaat alleen als een cel doorhaling (strike), super-/subschrift
(vertAlign) of een cursieve run (i) heeft, per kolomnummer (vanaf 0) met de runs:
[{t, strike?, vertAlign?, i?}]. Cursief telt alleen in een run van de gedeelde tekst, nooit via
de celstijl; vet telt nergens (vet staat in honderden cellen als celstijl en draagt geen betekenis).
Een cel met doorhaling of super-/subschrift op celniveau (via styles.xml) krijgt één run met 'cel': true.
Zo kan de omzetting beslissen wat ze met doorgehaalde tekst doet, in plaats van dat die
stil als gewone tekst wordt gelezen. Rijen zonder enige waarde worden niet geschreven.
"""
import json
import os
import posixpath
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True  # geen __pycache__ in de repo
sys.path.insert(0, str(Path(__file__).resolve().parent))  # met -I staat de scriptmap niet vanzelf op het pad
import veilig_zip as vz  # noqa: E402

NS_M = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PR = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
WAAR = ("1", "true")
RE_ESCAPE = re.compile(r"_x[0-9A-Fa-f]{4}_")
RE_OPMERKING = re.compile(r"^xl/(comments[^/]*\.xml|threadedComments/[^/]+)$")


def m(tag):
    return "{%s}%s" % (NS_M, tag)


def uit_font(rpr):
    """Haal doorhaling en vertAlign uit een rPr/font. Geeft een dict (leeg als niets)."""
    uit = {}
    if rpr is None:
        return uit
    for tag in ("strike", "dstrike"):
        el = rpr.find(m(tag))
        if el is not None and el.get("val") not in ("0", "false"):
            uit[tag] = True
    va = rpr.find(m("vertAlign"))
    if va is not None and va.get("val") in ("superscript", "subscript"):
        uit["vertAlign"] = va.get("val")
    return uit


def lees_si(si, tel):
    """Een gedeelde tekst als (tekst, runs). Fonetische runs (rPh) tellen niet mee.

    Een run krijgt doorhaling en super-/subschrift (uit_font) en ook cursief ('i': True, als rPr/i er staat en
    val niet 0 of false is). Cursief alleen hier, in een run, en niet in uit_font: de celstijl telt alleen voor
    doorhaling en super-/subschrift. 'runs' is None als geen enkele run een van die opmaak heeft.
    """
    runs = []
    for kind in si:
        if kind.tag == m("t"):
            runs.append({"t": kind.text or ""})
        elif kind.tag == m("r"):
            tekst = "".join((t.text or "") for t in kind.findall(m("t")))
            run = {"t": tekst}
            rpr = kind.find(m("rPr"))
            run.update(uit_font(rpr))
            cursief = rpr.find(m("i")) if rpr is not None else None
            if cursief is not None and cursief.get("val") not in ("0", "false"):
                run["i"] = True
            for k in (rpr if rpr is not None else []):
                tel["rpr:" + k.tag.rsplit("}", 1)[-1]] += 1
            runs.append(run)
    tekst = "".join(r["t"] for r in runs)
    opgemaakt = any(("strike" in r or "dstrike" in r or "vertAlign" in r or "i" in r) for r in runs)
    return tekst, (runs if opgemaakt else None)


def kolnr(ref):
    if ref is None:
        raise vz.Onveilig("een cel zonder r-attribuut (niet zoals verwacht)")
    if not re.match(r"^[A-Z]{1,3}[0-9]+$", ref):
        raise vz.Onveilig(f"een cel met een onleesbaar r-attribuut: {ref[:20]!r}")
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for c in letters:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def beelden_van_blad(z, sheetpad):
    """[rij, kolom] van elk anker in de drawing(s) van het blad (rij vanaf 1, kolom vanaf 0)."""
    map_, naam = posixpath.split(sheetpad)
    rels = vz.lees_xml(z, posixpath.join(map_, "_rels", naam + ".rels"), verplicht=False)
    if rels is None:
        return []
    uit = []
    for r in rels.findall("{%s}Relationship" % NS_PR):
        if not (r.get("Type") or "").endswith("/drawing"):
            continue
        if r.get("TargetMode") == "External":
            raise vz.Onveilig("een drawing buiten het bestand")
        doel = r.get("Target") or ""
        drawpad = doel.lstrip("/") if doel.startswith("/") else posixpath.normpath(posixpath.join(map_, doel))
        wsdr = vz.lees_xml(z, drawpad)
        for anker in wsdr:
            if anker.tag not in ("{%s}twoCellAnchor" % NS_XDR, "{%s}oneCellAnchor" % NS_XDR, "{%s}absoluteAnchor" % NS_XDR):
                continue
            van = anker.find("{%s}from" % NS_XDR)
            if van is None:
                uit.append([0, 0])
                continue
            rij, kol = van.find("{%s}row" % NS_XDR), van.find("{%s}col" % NS_XDR)
            if rij is None or kol is None or not (rij.text or "").isdigit() or not (kol.text or "").isdigit():
                raise vz.Onveilig("een anker in de drawing zonder geldige rij en kolom")
            uit.append([int(rij.text) + 1, int(kol.text)])
    return uit


def lees(pad):
    z = vz.open_veilig(pad)
    tel = Counter()
    try:
        shared = []
        sst = vz.lees_xml(z, "xl/sharedStrings.xml", verplicht=False)
        if sst is not None:
            for si in sst.findall(m("si")):
                shared.append(lees_si(si, tel))
        # celstijlen met doorhaling of super-/subschrift
        celstijl = {}
        st = vz.lees_xml(z, "xl/styles.xml", verplicht=False)
        if st is not None:
            fonts = []
            fe = st.find(m("fonts"))
            if fe is not None:
                fonts = [uit_font(f) for f in fe.findall(m("font"))]
            xfs = st.find(m("cellXfs"))
            if xfs is not None:
                for i, xf in enumerate(xfs.findall(m("xf"))):
                    fid = xf.get("fontId")
                    if fid and fid.isdigit() and int(fid) < len(fonts) and fonts[int(fid)]:
                        celstijl[str(i)] = fonts[int(fid)]
        wb = vz.lees_xml(z, "xl/workbook.xml")
        rels = vz.lees_xml(z, "xl/_rels/workbook.xml.rels")
        relmap = {r.get("Id"): r.get("Target") for r in rels.findall("{%s}Relationship" % NS_PR)}
        sheets = wb.find(m("sheets"))
        bladnamen = [(s.get("name"), s.get("state") or "zichtbaar") for s in sheets]
        if not bladnamen:
            raise vz.Onveilig("geen bladen in het werkboek")
        eerste = sheets[0]
        doel = relmap.get(eerste.get("{%s}id" % NS_R))
        if not doel:
            raise vz.Onveilig("het eerste blad heeft geen relatie in xl/_rels/workbook.xml.rels")
        sheetpad = doel.lstrip("/") if doel.startswith("/") else "xl/" + doel
        root = vz.lees_xml(z, sheetpad)
        rijen = []
        vreemd = []
        verborgen_rijen = []
        for row in root.iter(m("row")):
            if not (row.get("r") or "").isdigit():
                raise vz.Onveilig("een rij zonder geldig r-attribuut (niet zoals verwacht)")
            rnr = int(row.get("r"))
            waarden = {}
            opmaak = {}
            for c in row.findall(m("c")):
                t = c.get("t")
                v = c.find(m("v"))
                val = None
                runs = None
                kol = kolnr(c.get("r"))
                if t == "s" and v is not None:
                    if not (v.text or "").isdigit() or int(v.text) >= len(shared):
                        raise vz.Onveilig(f"cel {c.get('r')} verwijst naar een gedeelde tekst die niet bestaat")
                    val, runs = shared[int(v.text)]
                elif t == "inlineStr":
                    is_ = c.find(m("is"))
                    val, runs = lees_si(is_, tel) if is_ is not None else ("", None)
                elif v is not None:
                    val = v.text
                    tel["celsoort:" + (t or "n")] += 1
                    if val is not None and t != "b":
                        vreemd.append({"r": rnr, "k": kol, "soort": t or "n", "waarde": val[:40]})
                if val is None:
                    continue
                waarden[kol] = val
                if runs is None and val.strip() and c.get("s") in celstijl:
                    runs = [dict({"t": val, "cel": True}, **celstijl[c.get("s")])]
                if runs is not None:
                    opmaak[str(kol)] = runs
                    for r in runs:
                        for k in ("strike", "dstrike", "vertAlign", "i"):
                            if k in r:
                                tel["run:" + k] += 1
                if RE_ESCAPE.search(val):
                    tel["escape_x000"] += 1
                    vreemd.append({"r": rnr, "k": kol, "soort": "escape", "waarde": val[:40]})
            if waarden and row.get("hidden") in WAAR:
                verborgen_rijen.append(rnr)
            if waarden:
                n = max(waarden) + 1
                rij = {"r": rnr, "c": [waarden.get(i) for i in range(n)]}
                if opmaak:
                    rij["opmaak"] = opmaak
                rijen.append(rij)
        merged = [mc.get("ref") for mc in root.iter(m("mergeCell"))]
        verborgen_kolommen = []
        for col in root.iter(m("col")):
            if col.get("hidden") in WAAR:
                van, tot = col.get("min") or "", col.get("max") or ""
                if not (van.isdigit() and tot.isdigit()):
                    raise vz.Onveilig("een verborgen kolom zonder geldig min en max")
                verborgen_kolommen.append([int(van) - 1, int(tot) - 1])
        opmerkingen = sum(1 for li in z.infolist() if RE_OPMERKING.match(li.filename))
        tel["rijen"] = len(rijen)
        return {"bestand": Path(pad).name,
                "bron": {"bytes": os.path.getsize(pad), "sha256": vz.sha256_bestand(pad)},
                "gewijzigd": vz.kern_datum(z, "modified"),
                "bladnamen": [{"naam": n, "staat": s} for n, s in bladnamen],
                "blad": bladnamen[0][0], "merged": merged,
                "tellingen": dict(sorted(tel.items())), "vreemde_cellen": vreemd,
                "verborgen_rijen": verborgen_rijen, "verborgen_kolommen": verborgen_kolommen,
                "opmerkingen": opmerkingen, "beelden": beelden_van_blad(z, sheetpad), "rijen": rijen}
    finally:
        z.close()


def main(argv):
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    src, dst = argv
    try:
        vz.weiger_in_repo(src, "invoer")
        vz.weiger_in_repo(dst, "uitvoer")
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        ruw = lees(src)
    except vz.Onveilig as e:
        vz.fout_en_stop(e)
    except (KeyError, IndexError, TypeError, ValueError, AttributeError, RuntimeError, zipfile.BadZipFile) as e:
        vz.fout_en_stop(f"onverwachte vorm: {type(e).__name__}: {e}")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(ruw, f, ensure_ascii=False)
    t = ruw["tellingen"]
    print(ruw["bestand"], ruw["blad"], "rijen", len(ruw["rijen"]),
          "doorgehaald", t.get("run:strike", 0), "superschrift", t.get("run:vertAlign", 0))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
