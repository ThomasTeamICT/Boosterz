"""Lees een docx naar neutrale ruwe JSON. Het script weet niets van het GO!.

Gebruik: python3 -I lees_docx.py <in.docx> <ruw.json> [--tekst]

Leest alleen:
- word/document.xml, word/numbering.xml, word/styles.xml, word/_rels/document.xml.rels;
- de namen, groottes en sha1 van word/media/*;
- uit docProps/core.xml alleen dcterms:created.

Uitvoer: {bestand, bron, gemaakt, media, stijlen, tellingen, body}. bron is {bytes, sha256} van het gelezen bestand
(maak.ts gaat na dat de ruwe JSON bij het origineel hoort). De body is een lijst blokken:
  {t:'p', stijl, stijlen_ruw, num:{numId, ilvl, fmt, start}|null, runs:[...]}
  {t:'tbl', rijen:[{cellen:[{span, vmerge, vulling, blokken:[...]}]}]}
  {t:'onbekend', tag}
Een run is een van:
  {t:'tekst', b, i, u, ...} (de tekst staat letterlijk in 'tekst', ook een regeleinde in w:t)
  {t:'br', soort}  {t:'tab'}
  {t:'beeld', rid, bestand, sha1, breed, hoog, naam, alt}
Opmaak (b, i, u, strike, vertAlign) staat alleen op een run als ze aan staan.
Met --tekst schrijft het ook <ruw>.txt, een leesbare weergave voor de nakijker.
"""
import json
import os
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True  # geen __pycache__ in de repo
sys.path.insert(0, str(Path(__file__).resolve().parent))  # met -I staat de scriptmap niet vanzelf op het pad
import veilig_zip as vz  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"


def w(tag):
    return "{%s}%s" % (W, tag)


def lokaal(el):
    return el.tag.rsplit("}", 1)[-1] if isinstance(el.tag, str) else ""


def waarde(el, attr="val"):
    return el.get(w(attr)) if el is not None else None


def aan(rpr, tag):
    """Staat een aan/uit-eigenschap aan? (w:b zonder val is aan)"""
    if rpr is None:
        return False
    el = rpr.find(w(tag))
    if el is None:
        return False
    return waarde(el) not in ("0", "false", "off", "none")


def lees_stijlen(z):
    root = vz.lees_xml(z, "word/styles.xml", verplicht=False)
    stijlen = {}
    if root is None:
        return stijlen
    for st in root.findall(w("style")):
        sid = st.get(w("styleId"))
        naam = st.find(w("name"))
        if sid:
            stijlen[sid] = waarde(naam) or ""
    return stijlen


def lees_nummering(z):
    """numId -> {ilvl: (fmt, start)}"""
    root = vz.lees_xml(z, "word/numbering.xml", verplicht=False)
    if root is None:
        return {}
    abstract = {}
    for an in root.findall(w("abstractNum")):
        niveaus = {}
        for lvl in an.findall(w("lvl")):
            ilvl = lvl.get(w("ilvl"))
            fmt = waarde(lvl.find(w("numFmt")))
            start = waarde(lvl.find(w("start")))
            niveaus[ilvl] = (fmt, int(start) if start and start.isdigit() else None)
        abstract[an.get(w("abstractNumId"))] = niveaus
    num = {}
    for n in root.findall(w("num")):
        a = waarde(n.find(w("abstractNumId")))
        niveaus = dict(abstract.get(a, {}))
        for ov in n.findall(w("lvlOverride")):
            so = ov.find(w("startOverride"))
            ilvl = ov.get(w("ilvl"))
            if so is not None and ilvl in niveaus:
                v = waarde(so)
                niveaus[ilvl] = (niveaus[ilvl][0], int(v) if v and v.isdigit() else niveaus[ilvl][1])
        num[n.get(w("numId"))] = niveaus
    return num


def lees_relaties(z):
    root = vz.lees_xml(z, "word/_rels/document.xml.rels", verplicht=False)
    rel = {}
    if root is None:
        return rel
    for r in root.findall("{%s}Relationship" % PR):
        rel[r.get("Id")] = {"doel": r.get("Target"), "soort": (r.get("Type") or "").rsplit("/", 1)[-1],
                            "extern": r.get("TargetMode") == "External"}
    return rel


def media_lijst(z):
    uit = []
    for info in z.infolist():
        if info.filename.startswith("word/media/") and not info.filename.endswith("/"):
            data = vz.lees_lid(z, info.filename)
            uit.append({"naam": info.filename, "bytes": len(data), "sha1": vz.sha1(data)})
    return uit


class Lezer:
    def __init__(self, z):
        self.stijlen = lees_stijlen(z)
        self.nummering = lees_nummering(z)
        self.rel = lees_relaties(z)
        self.media = {m["naam"]: m for m in media_lijst(z)}
        self.tel = Counter()

    # -- runs
    def beeld(self, drawing):
        blip = None
        for el in drawing.iter("{%s}blip" % A):
            blip = el
            break
        rid = blip.get("{%s}embed" % R) if blip is not None else None
        link = blip.get("{%s}link" % R) if blip is not None else None
        extent = None
        for el in drawing.iter("{%s}extent" % WP):
            extent = el
            break
        docpr = None
        for el in drawing.iter("{%s}docPr" % WP):
            docpr = el
            break
        bestand = None
        sha = None
        if rid and rid in self.rel:
            doel = self.rel[rid]["doel"]
            bestand = doel.lstrip("/") if doel.startswith("/") else "word/" + doel
            if bestand in self.media:
                sha = self.media[bestand]["sha1"]
        return {"t": "beeld", "rid": rid, "link": link, "bestand": bestand, "sha1": sha,
                "breed": int(extent.get("cx")) if extent is not None and (extent.get("cx") or "").isdigit() else None,
                "hoog": int(extent.get("cy")) if extent is not None and (extent.get("cy") or "").isdigit() else None,
                "naam": docpr.get("name") if docpr is not None else None,
                "alt": docpr.get("descr") if docpr is not None else None}

    def run(self, r):
        rpr = r.find(w("rPr"))
        opmaak = {}
        for tag, sleutel in (("b", "b"), ("i", "i"), ("strike", "strike"), ("dstrike", "dstrike")):
            if aan(rpr, tag):
                opmaak[sleutel] = True
        u = rpr.find(w("u")) if rpr is not None else None
        if u is not None and waarde(u) not in ("none", "0", "false"):
            opmaak["u"] = True
        va = rpr.find(w("vertAlign")) if rpr is not None else None
        if va is not None and waarde(va) in ("superscript", "subscript"):
            opmaak["vertAlign"] = waarde(va)
        if rpr is not None:
            for kind in rpr:
                self.tel["rpr:" + lokaal(kind)] += 1
        uit = []
        for kind in r:
            tag = lokaal(kind)
            if tag == "t":
                uit.append(dict(opmaak, t="tekst", tekst=kind.text or ""))
                if "\n" in (kind.text or "") or "\r" in (kind.text or ""):
                    self.tel["regeleinde_in_t"] += 1
            elif tag == "br":
                soort = kind.get(w("type")) or "regel"
                uit.append({"t": "br", "soort": soort})
            elif tag == "cr":
                uit.append({"t": "br", "soort": "regel"})
            elif tag == "tab":
                uit.append({"t": "tab"})
                self.tel["tab"] += 1
            elif tag == "drawing":
                uit.append(self.beeld(kind))
            elif tag in ("rPr", "lastRenderedPageBreak"):
                pass
            else:
                self.tel["run_kind:" + tag] += 1
        return uit

    def alinea_runs(self, p):
        runs = []
        for kind in p:
            tag = lokaal(kind)
            if tag == "r":
                runs += self.run(kind)
            elif tag in ("hyperlink", "ins", "smartTag", "sdt", "fldSimple"):
                self.tel[tag] += 1
                zoek = kind
                if tag == "sdt":
                    zoek = kind.find(w("sdtContent")) or kind
                for r in zoek.iter(w("r")):
                    runs += self.run(r)
            elif tag in ("pPr", "bookmarkStart", "bookmarkEnd", "proofErr", "del"):
                if tag == "del":
                    self.tel["del"] += 1
            else:
                self.tel["p_kind:" + tag] += 1
        return runs

    def alinea(self, p):
        ppr = p.find(w("pPr"))
        ruw = [waarde(s) for s in ppr.findall(w("pStyle"))] if ppr is not None else []
        stijl = next((s for s in ruw if s in self.stijlen), None)
        num = None
        if ppr is not None:
            numpr = ppr.find(w("numPr"))
            if numpr is not None:
                nid = waarde(numpr.find(w("numId")))
                ilvl = waarde(numpr.find(w("ilvl"))) or "0"
                fmt, start = self.nummering.get(nid, {}).get(ilvl, (None, None))
                num = {"numId": nid, "ilvl": int(ilvl) if ilvl.isdigit() else ilvl, "fmt": fmt, "start": start}
        self.tel["alineas"] += 1
        if num:
            self.tel["lijstalineas"] += 1
        return {"t": "p", "stijl": stijl, "stijlen_ruw": ruw, "num": num, "runs": self.alinea_runs(p)}

    # -- tabellen
    def tabel(self, tbl, diepte=0):
        self.tel["tabellen" if diepte == 0 else "tabellen_genest"] += 1
        rijen = []
        for tr in tbl.findall(w("tr")):
            cellen = []
            for tc in tr.findall(w("tc")):
                pr = tc.find(w("tcPr"))
                span = waarde(pr.find(w("gridSpan"))) if pr is not None and pr.find(w("gridSpan")) is not None else None
                vm = None
                if pr is not None and pr.find(w("vMerge")) is not None:
                    vm = waarde(pr.find(w("vMerge"))) or "voort"
                shd = pr.find(w("shd")) if pr is not None else None
                vulling = shd.get(w("fill")) if shd is not None else None
                cellen.append({"span": int(span) if span and span.isdigit() else 1, "vmerge": vm,
                               "vulling": vulling, "blokken": self.blokken(tc, diepte + 1)})
                self.tel["cellen"] += 1
            rijen.append({"cellen": cellen})
            self.tel["rijen"] += 1
        return {"t": "tbl", "rijen": rijen}

    def blokken(self, ouder, diepte=0):
        uit = []
        for el in ouder:
            tag = lokaal(el)
            if tag == "p":
                uit.append(self.alinea(el))
            elif tag == "tbl":
                uit.append(self.tabel(el, diepte))
            elif tag in ("sectPr", "tcPr", "bookmarkStart", "bookmarkEnd"):
                pass
            else:
                self.tel["blok_onbekend:" + tag] += 1
                uit.append({"t": "onbekend", "tag": tag})
        return uit


def tel_ruw(root, tel):
    """Tellingen over de hele body voor dingen die de validator moet kunnen weigeren."""
    for tag, sleutel in (("txbxContent", "tekstvakken"), ("commentRangeStart", "commentaar_ankers"),
                         ("commentReference", "commentaar_verwijzingen"), ("instrText", "velden"),
                         ("fldChar", "veldtekens"), ("ins", "ins"), ("del", "del"), ("sdt", "sdt"),
                         ("hyperlink", "hyperlinks"), ("pict", "pict")):
        n = len(list(root.iter(w(tag))))
        if n:
            tel[sleutel] = n


def lees(pad):
    z = vz.open_veilig(pad)
    try:
        lezer = Lezer(z)
        doc = vz.lees_xml(z, "word/document.xml")
        body = doc.find(w("body"))
        if body is None:
            raise vz.Onveilig("word/document.xml heeft geen body")
        blokken = lezer.blokken(body)
        tel_ruw(body, lezer.tel)
        gemaakt = vz.kern_datum(z, "created")
        return {"bestand": Path(pad).name,
                "bron": {"bytes": os.path.getsize(pad), "sha256": vz.sha256_bestand(pad)},
                "gemaakt": gemaakt,
                "media": sorted(lezer.media.values(), key=lambda m: m["naam"]),
                "stijlen": lezer.stijlen, "tellingen": dict(sorted(lezer.tel.items())),
                "body": blokken}
    finally:
        z.close()


# -- leesbare weergave
def run_tekst(runs):
    s = ""
    for r in runs:
        if r["t"] == "tekst":
            s += r["tekst"].replace("\n", "\\n")
        elif r["t"] == "br":
            s += "\\n" if r["soort"] == "regel" else f"[{r['soort']}]"
        elif r["t"] == "tab":
            s += "\\t"
        elif r["t"] == "beeld":
            s += f"[beeld: {(r['bestand'] or '?').rsplit('/', 1)[-1]}]"
    return s


def als_tekst(ruw):
    regels = []

    def blok(b, inspring):
        if b["t"] == "p":
            kop = f"[{b['stijl']}] " if b["stijl"] and b["stijl"] not in ("ListParagraph",) else ""
            if b["num"]:
                teken = "-" if b["num"]["fmt"] == "bullet" else "#"
                kop = f"{teken} " + kop
            regels.append(inspring + kop + run_tekst(b["runs"]))
        elif b["t"] == "tbl":
            regels.append(inspring + "[tabel]")
            for ri, rij in enumerate(b["rijen"]):
                for ci, cel in enumerate(rij["cellen"]):
                    extra = f" vmerge={cel['vmerge']}" if cel["vmerge"] else ""
                    regels.append(f"{inspring}  [rij {ri + 1} kolom {ci + 1}{extra}]")
                    for sub in cel["blokken"]:
                        blok(sub, inspring + "    ")
            regels.append(inspring + "[einde tabel]")
        else:
            regels.append(inspring + f"[onbekend: {b.get('tag')}]")

    for b in ruw["body"]:
        blok(b, "")
    return "\n".join(regels) + "\n"


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2 or any(a.startswith("--") and a != "--tekst" for a in argv):
        print(__doc__, file=sys.stderr)
        return 2
    src, dst = args
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
    if "--tekst" in argv:
        with open(re.sub(r"\.json$", "", dst) + ".txt", "w", encoding="utf-8") as f:
            f.write(als_tekst(ruw))
    t = ruw["tellingen"]
    print(ruw["bestand"], "alineas", t.get("alineas", 0), "lijstalineas", t.get("lijstalineas", 0),
          "tabellen", t.get("tabellen", 0), "beelden", sum(1 for _ in iter_beelden(ruw["body"])))
    return 0


def iter_beelden(blokken):
    for b in blokken:
        if b["t"] == "p":
            for r in b["runs"]:
                if r["t"] == "beeld":
                    yield r
        elif b["t"] == "tbl":
            for rij in b["rijen"]:
                for cel in rij["cellen"]:
                    yield from iter_beelden(cel["blokken"])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
