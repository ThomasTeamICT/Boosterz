"""Lees een xlsx naar neutrale ruwe JSON. Het script weet niets van het GO!.

Gebruik: python3 -I lees_xlsx.py <in.xlsx> <ruw.json>

Leest alleen:
- xl/workbook.xml (bladnamen), xl/_rels/workbook.xml.rels, xl/sharedStrings.xml,
  xl/styles.xml (alleen lettertypen met doorhaling of super-/subschrift) en het eerste blad;
- uit docProps/core.xml alleen dcterms:modified (nooit de maker of wie het laatst wijzigde).

Uitvoer: {bestand, gewijzigd, bladnamen, blad, merged, tellingen, rijen}.
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
import re
import sys
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True  # geen __pycache__ in de repo
sys.path.insert(0, str(Path(__file__).resolve().parent))  # met -I staat de scriptmap niet vanzelf op het pad
import veilig_zip as vz  # noqa: E402

NS_M = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PR = "http://schemas.openxmlformats.org/package/2006/relationships"


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
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for c in letters:
        n = n * 26 + (ord(c) - 64)
    return n - 1


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
        doel = relmap[eerste.get("{%s}id" % NS_R)]
        sheetpad = doel.lstrip("/") if doel.startswith("/") else "xl/" + doel
        root = vz.lees_xml(z, sheetpad)
        rijen = []
        for row in root.iter(m("row")):
            rnr = int(row.get("r"))
            waarden = {}
            opmaak = {}
            for c in row.findall(m("c")):
                t = c.get("t")
                v = c.find(m("v"))
                val = None
                runs = None
                if t == "s" and v is not None:
                    val, runs = shared[int(v.text)]
                elif t == "inlineStr":
                    is_ = c.find(m("is"))
                    val, runs = lees_si(is_, tel) if is_ is not None else ("", None)
                elif v is not None:
                    val = v.text
                    tel["celsoort:" + (t or "n")] += 1
                if val is None:
                    continue
                kol = kolnr(c.get("r"))
                waarden[kol] = val
                if runs is None and val.strip() and c.get("s") in celstijl:
                    runs = [dict({"t": val, "cel": True}, **celstijl[c.get("s")])]
                if runs is not None:
                    opmaak[str(kol)] = runs
                    for r in runs:
                        for k in ("strike", "dstrike", "vertAlign", "i"):
                            if k in r:
                                tel["run:" + k] += 1
                if re.search(r"_x[0-9A-Fa-f]{4}_", val):
                    tel["escape_x000"] += 1
            if waarden:
                n = max(waarden) + 1
                rij = {"r": rnr, "c": [waarden.get(i) for i in range(n)]}
                if opmaak:
                    rij["opmaak"] = opmaak
                rijen.append(rij)
        merged = [mc.get("ref") for mc in root.iter(m("mergeCell"))]
        tel["rijen"] = len(rijen)
        return {"bestand": Path(pad).name, "gewijzigd": vz.kern_datum(z, "modified"),
                "bladnamen": [{"naam": n, "staat": s} for n, s in bladnamen],
                "blad": bladnamen[0][0], "merged": merged,
                "tellingen": dict(sorted(tel.items())), "rijen": rijen}
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
        ruw = lees(src)
    except vz.Onveilig as e:
        vz.fout_en_stop(e)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(ruw, f, ensure_ascii=False)
    t = ruw["tellingen"]
    print(ruw["bestand"], ruw["blad"], "rijen", len(ruw["rijen"]),
          "doorgehaald", t.get("run:strike", 0), "superschrift", t.get("run:vertAlign", 0))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
