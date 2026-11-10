"""Unittests voor de lezers van het GO!-materiaal. Draaien met:

    python3 -I -B -m unittest discover -s tools/basis/go

De tests bouwen zelf kleine docx- en xlsx-bestanden. Zet GO_WERKMAP op de werkmap met de echte
bestanden om ook de tellingen op de 8 lesplannen en de 12 doelensets te controleren; zonder die
variabele worden die tests overgeslagen. Beide indelingen werken: bron/ zoals decodeer.py ze maakt
(met 'Doelenset BaO <vak>.xlsx'), of de oudere docx/ en xlsx/ met korte namen.
"""
import base64
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile
from xml.sax.saxutils import escape
from pathlib import Path

sys.dont_write_bytecode = True  # geen __pycache__ in de repo
import decodeer  # noqa: E402
import lees_docx  # noqa: E402
import lees_xlsx  # noqa: E402
import veilig_zip as vz  # noqa: E402

MAP = Path(__file__).resolve().parent

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' \
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' \
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

KERN = ('<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties '
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">'
        '<dc:creator>Geheime Maker</dc:creator><cp:lastModifiedBy>Geheime Wijziger</cp:lastModifiedBy>'
        '<dcterms:created>2026-01-02T03:04:05Z</dcterms:created>'
        '<dcterms:modified>2026-05-06T07:08:09Z</dcterms:modified></cp:coreProperties>')

PNG = b"\x89PNG\r\n\x1a\nxxxx"


def run(tekst, rpr=""):
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(tekst)}</w:t></w:r>'


def bouw_docx(pad, body=None, extra=None):
    body = body or (
        '<w:p><w:pPr><w:pStyle w:val="2"/><w:pStyle w:val="Heading1"/></w:pPr>' + run("Kop") + '</w:p>'
        '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
        + run("punt <een>", "<w:b/><w:i/>") + '</w:p>'
        '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>' + run("stap") + '</w:p>'
        '<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t></w:r><w:r><w:t>regel\neinde</w:t></w:r></w:p>'
        '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="200"/><wp:docPr id="1" name="icon" descr="vlag"/>'
        '<a:graphic><a:graphicData><a:blip r:embed="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
        '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:fill="F2F2F2"/></w:tcPr>'
        '<w:p>' + run("cel1") + '</w:p><w:p>' + run("cel1b") + '</w:p></w:tc>'
        '<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p>' + run("cel2") + '</w:p></w:tc></w:tr></w:tbl>'
        '<w:sectPr/>')
    leden = {
        "[Content_Types].xml": "<Types/>",
        "word/document.xml": f'<?xml version="1.0" encoding="UTF-8"?><w:document {W}><w:body>{body}</w:body></w:document>',
        "word/styles.xml": f'<w:styles {W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>'
                           '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style></w:styles>',
        "word/numbering.xml": f'<w:numbering {W}>'
                              '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
                              '<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
                              '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>'
                              '<w:num w:numId="2"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num>'
                              '</w:numbering>',
        "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                        '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/vlag.png"/></Relationships>',
        "word/media/vlag.png": PNG,
        "docProps/core.xml": KERN,
    }
    leden.update(extra or {})
    with zipfile.ZipFile(pad, "w", zipfile.ZIP_DEFLATED) as z:
        for naam, inhoud in leden.items():
            z.writestr(naam, inhoud)


S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' \
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def zip_met_vlag(pad, leden, vlag):
    """Een zip waarin elk lid in de lokale kop en in de centrale map de algemene vlag `vlag` krijgt (bv. 0x1: versleuteld)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for naam, inhoud in leden.items():
            z.writestr(naam, inhoud)
    data = bytearray(buf.getvalue())
    for sig, plaats in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        i = data.find(sig)
        while i >= 0:
            data[i + plaats] |= vlag
            i = data.find(sig, i + 4)
    Path(pad).write_bytes(bytes(data))


def bouw_xlsx(pad, extra=None):
    leden = {
        "xl/workbook.xml": f'<workbook {S}><sheets><sheet name="Blad een" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                      '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/sharedStrings.xml": f'<sst {S}>'
                                '<si><t>TYPE</t></si>'
                                '<si><t>doelzin</t></si>'
                                '<si><r><t>1 cm</t></r><r><rPr><vertAlign val="superscript"/></rPr><t>3</t></r></si>'
                                '<si><r><t>plat</t></r><r><rPr><strike/></rPr><t> weg</t></r></si>'
                                '<si><r><t>a</t></r><r><rPr><b/></rPr><t>b</t></r><rPh><t>FONETISCH</t></rPh></si>'
                                '<si><t>vorm</t><t>_x000D_</t></si>'
                                '</sst>',
        "xl/styles.xml": f'<styleSheet {S}><fonts><font/><font><strike/></font></fonts>'
                         '<cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>',
        "xl/worksheets/sheet1.xml": f'<worksheet {S}><sheetData>'
                                    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>4</v></c></row>'
                                    '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>'
                                    '<row r="3"><c r="A3" s="1" t="inlineStr"><is><t>celstijl</t></is></c><c r="D3"><v>7</v></c></row>'
                                    '<row r="4"></row>'
                                    '<row r="5"><c r="B5" t="s"><v>5</v></c></row>'
                                    '</sheetData><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>',
        "docProps/core.xml": KERN,
    }
    leden.update(extra or {})
    with zipfile.ZipFile(pad, "w", zipfile.ZIP_DEFLATED) as z:
        for naam, inhoud in leden.items():
            z.writestr(naam, inhoud)


class Tijdelijk(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = Path(self._td.name)
        self.addCleanup(self._td.cleanup)


class VeiligZip(Tijdelijk):
    def test_weigert_pad_met_punt_punt(self):
        pad = self.dir / "slecht.docx"
        with zipfile.ZipFile(pad, "w") as z:
            z.writestr("../buiten.txt", "x")
        with self.assertRaises(vz.Onveilig):
            vz.open_veilig(pad)

    def test_weigert_absoluut_pad_en_backslash(self):
        for naam in ("/etc/passwd", "word\\document.xml", "C:/x"):
            pad = self.dir / "slecht.zip"
            with zipfile.ZipFile(pad, "w") as z:
                z.writestr(naam, "x")
            with self.assertRaises(vz.Onveilig, msg=naam):
                vz.open_veilig(pad)

    def test_weigert_zipbom(self):
        pad = self.dir / "bom.docx"
        with zipfile.ZipFile(pad, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("word/document.xml", b"\0" * (30 * 1024 * 1024))
        with self.assertRaises(vz.Onveilig):
            vz.open_veilig(pad)

    def test_weigert_te_groot_totaal(self):
        pad = self.dir / "groot.docx"
        with zipfile.ZipFile(pad, "w", zipfile.ZIP_STORED) as z:
            for i in range(3):
                z.writestr(f"w/{i}.bin", os.urandom(20 * 1024 * 1024))
        with self.assertRaises(vz.Onveilig):
            vz.open_veilig(pad)

    def test_weigert_geen_zip(self):
        pad = self.dir / "geen.docx"
        pad.write_bytes(b"dit is geen zip")
        with self.assertRaises(vz.Onveilig):
            vz.open_veilig(pad)

    def test_weigert_doctype_en_entity(self):
        for xml in (b'<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>', b'<?xml version="1.0"?><!ENTITY a "b"><x/>'):
            with self.assertRaises(vz.Onveilig):
                vz.parse_xml(xml)

    def test_weigert_utf16_en_slechte_xml(self):
        with self.assertRaises(vz.Onveilig):
            vz.parse_xml("<x/>".encode("utf-16"))
        with self.assertRaises(vz.Onveilig):
            vz.parse_xml(b"<x>")

    def test_weigert_utf16_zonder_bom_met_entity(self):
        # Zonder BOM en zonder declaratie staat er na elk ASCII-teken een nulbyte: '<!ENTITY' komt als bytes niet voor,
        # maar expat herkent UTF-16 toch en zou de entiteit uitwerken (IMP-15).
        xml = '<!DOCTYPE x [<!ENTITY a "UITGEWERKT">]><x>&a;&a;&a;</x>'
        for codering in ("utf-16-le", "utf-16-be"):
            data = xml.encode(codering)
            self.assertNotIn(b"<!ENTITY", data)
            with self.assertRaises(vz.Onveilig, msg=codering):
                vz.parse_xml(data)
        with self.assertRaises(vz.Onveilig):
            vz.parse_xml(b"<x>a\x00b</x>")

    def test_weigert_dubbele_ledennaam(self):
        pad = self.dir / "dubbel.docx"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # zipfile waarschuwt voor de dubbele naam
            with zipfile.ZipFile(pad, "w") as z:
                z.writestr("word/document.xml", "<x>EERSTE</x>")
                z.writestr("word/document.xml", "<x>TWEEDE</x>")
        with self.assertRaises(vz.Onveilig) as ctx:
            vz.open_veilig(pad)
        self.assertIn("dubbele", str(ctx.exception))

    def test_weigert_versleuteld_lid(self):
        pad = self.dir / "versleuteld.docx"
        zip_met_vlag(pad, {"word/document.xml": "<x/>"}, 0x1)
        with self.assertRaises(vz.Onveilig) as ctx:
            vz.open_veilig(pad)
        self.assertIn("versleuteld", str(ctx.exception))

    def test_docx_met_doctype_wordt_geweigerd(self):
        pad = self.dir / "d.docx"
        bouw_docx(pad, extra={"word/document.xml": f'<!DOCTYPE w:document [<!ENTITY a "b">]><w:document {W}><w:body/></w:document>'})
        with self.assertRaises(vz.Onveilig):
            lees_docx.lees(pad)

    def test_weigert_werkmap_in_repo(self):
        with self.assertRaises(vz.Onveilig):
            vz.weiger_in_repo(MAP / "uit")
        with self.assertRaises(vz.Onveilig):
            vz.weiger_in_repo(vz.REPO_ROOT)
        vz.weiger_in_repo(self.dir)  # buiten de repo mag

    def test_kern_datum_leest_geen_namen(self):
        pad = self.dir / "d.docx"
        bouw_docx(pad)
        with zipfile.ZipFile(pad) as z:
            self.assertEqual(vz.kern_datum(z, "created"), "2026-01-02T03:04:05Z")
            self.assertEqual(vz.kern_datum(z, "modified"), "2026-05-06T07:08:09Z")


class LeesDocx(Tijdelijk):
    def lees(self, **kw):
        pad = self.dir / "t.docx"
        bouw_docx(pad, **kw)
        return lees_docx.lees(pad)

    def test_kop_en_stijl_die_bestaat(self):
        ruw = self.lees()
        kop = ruw["body"][0]
        self.assertEqual(kop["stijl"], "Heading1")  # "2" bestaat niet in styles.xml
        self.assertEqual(kop["stijlen_ruw"], ["2", "Heading1"])
        self.assertEqual(kop["runs"][0]["tekst"], "Kop")

    def test_lijsten_met_formaat_en_start(self):
        ruw = self.lees()
        self.assertEqual(ruw["body"][1]["num"], {"numId": "1", "ilvl": 0, "fmt": "bullet", "start": 1})
        self.assertEqual(ruw["body"][2]["num"]["fmt"], "decimal")
        self.assertEqual(ruw["body"][2]["num"]["start"], 3)

    def test_opmaak_en_letterlijke_tekens(self):
        run1 = self.lees()["body"][1]["runs"][0]
        self.assertTrue(run1["b"] and run1["i"])
        self.assertEqual(run1["tekst"], "punt <een>")
        self.assertNotIn("u", run1)

    def test_regeleinden(self):
        alinea = self.lees()["body"][3]
        soorten = [r["t"] for r in alinea["runs"]]
        self.assertEqual(soorten, ["tekst", "br", "tekst", "tekst"])
        self.assertEqual(alinea["runs"][3]["tekst"], "regel\neinde")

    def test_beeld_met_doel_en_sha1(self):
        beeld = self.lees()["body"][4]["runs"][0]
        self.assertEqual(beeld["bestand"], "word/media/vlag.png")
        self.assertEqual(beeld["sha1"], hashlib.sha1(PNG).hexdigest())
        self.assertEqual((beeld["breed"], beeld["hoog"], beeld["alt"]), (100, 200, "vlag"))

    def test_tabel_met_span_vmerge_en_vulling(self):
        tabel = self.lees()["body"][5]
        self.assertEqual(tabel["t"], "tbl")
        cellen = tabel["rijen"][0]["cellen"]
        self.assertEqual((cellen[0]["span"], cellen[0]["vulling"]), (2, "F2F2F2"))
        self.assertEqual(len(cellen[0]["blokken"]), 2)
        self.assertEqual(cellen[1]["vmerge"], "restart")

    def test_tellingen_en_media(self):
        ruw = self.lees()
        self.assertEqual(ruw["tellingen"]["tabellen"], 1)
        self.assertEqual(ruw["tellingen"]["regeleinde_in_t"], 1)
        self.assertEqual(ruw["gemaakt"], "2026-01-02T03:04:05Z")
        self.assertEqual(ruw["media"][0]["naam"], "word/media/vlag.png")

    def test_geen_persoonsgegevens_in_de_uitvoer(self):
        tekst = json.dumps(self.lees())
        self.assertNotIn("Geheime", tekst)
        self.assertNotIn("creator", tekst)

    def test_hyperlink_en_ins_worden_geteld(self):
        body = '<w:p><w:hyperlink>' + run("link") + '</w:hyperlink></w:p><w:p><w:ins>' + run("nieuw") + '</w:ins></w:p>'
        ruw = self.lees(body=body)
        self.assertEqual(ruw["tellingen"]["hyperlinks"], 1)
        self.assertEqual(ruw["tellingen"]["ins"], 1)
        self.assertEqual(ruw["body"][0]["runs"][0]["tekst"], "link")

    def test_onbekend_blok_wordt_gemeld(self):
        ruw = self.lees(body='<w:customXml/><w:p/>')
        self.assertEqual(ruw["body"][0], {"t": "onbekend", "tag": "customXml"})

    def test_tekstweergave(self):
        pad = self.dir / "t.docx"
        bouw_docx(pad)
        uit = self.dir / "t.json"
        r = subprocess.run([sys.executable, "-I", str(MAP / "lees_docx.py"), str(pad), str(uit), "--tekst"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        tekst = (self.dir / "t.txt").read_text(encoding="utf-8")
        self.assertIn("[Heading1] Kop", tekst)
        self.assertIn("- punt <een>", tekst)
        self.assertIn("punt <een>", tekst)
        self.assertIn("[beeld: vlag.png]", tekst)
        self.assertIn("[rij 1 kolom 2 vmerge=restart]", tekst)

    def test_weigert_uitvoer_in_repo(self):
        pad = self.dir / "t.docx"
        bouw_docx(pad)
        r = subprocess.run([sys.executable, "-I", str(MAP / "lees_docx.py"), str(pad), str(MAP / "ruw.json")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)
        self.assertFalse((MAP / "ruw.json").exists())

    def test_bron_is_het_gelezen_bestand(self):
        pad = self.dir / "t.docx"
        bouw_docx(pad)
        ruw = lees_docx.lees(pad)
        data = pad.read_bytes()
        self.assertEqual(ruw["bron"], {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})

    def test_maakt_de_uitvoermap(self):
        pad = self.dir / "t.docx"
        bouw_docx(pad)
        uit = self.dir / "werk" / "ruw" / "t.json"
        r = subprocess.run([sys.executable, "-I", "-B", str(MAP / "lees_docx.py"), str(pad), str(uit)],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(uit.is_file())

    def test_vreemde_vorm_geeft_exit_3_zonder_traceback(self):
        pad = self.dir / "t.docx"
        zip_met_vlag(pad, {"word/document.xml": f"<w:document {W}><w:body/></w:document>"}, 0x1)
        r = subprocess.run([sys.executable, "-I", "-B", str(MAP / "lees_docx.py"), str(pad), str(self.dir / "t.json")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertIn("FOUT:", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


class LeesXlsx(Tijdelijk):
    def lees(self, **kw):
        pad = self.dir / "t.xlsx"
        bouw_xlsx(pad, **kw)
        return lees_xlsx.lees(pad)

    def test_rijen_cellen_en_lege_rij(self):
        ruw = self.lees()
        self.assertEqual(ruw["blad"], "Blad een")
        self.assertEqual([r["r"] for r in ruw["rijen"]], [1, 2, 3, 5])
        self.assertEqual(ruw["rijen"][0]["c"], ["TYPE", None, "ab"])  # rPh telt niet mee
        self.assertEqual(ruw["rijen"][2]["c"], ["celstijl", None, None, "7"])
        self.assertEqual(ruw["merged"], ["A1:B1"])

    def test_superschrift_blijft_bewaard(self):
        rij = self.lees()["rijen"][1]
        self.assertEqual(rij["c"][1], "1 cm3")
        self.assertEqual(rij["opmaak"]["1"], [{"t": "1 cm"}, {"t": "3", "vertAlign": "superscript"}])

    def test_doorhaling_blijft_bewaard(self):
        rij = self.lees()["rijen"][1]
        self.assertEqual(rij["c"][2], "plat weg")
        self.assertEqual(rij["opmaak"]["2"], [{"t": "plat"}, {"t": " weg", "strike": True}])

    def test_opmaak_op_celniveau(self):
        rij = self.lees()["rijen"][2]
        self.assertEqual(rij["opmaak"]["0"], [{"t": "celstijl", "cel": True, "strike": True}])

    def test_vet_alleen_telt_niet_als_opmaak(self):
        self.assertNotIn("opmaak", self.lees()["rijen"][0])

    def test_cursief_alleen_uit_een_run(self):
        # Rij 1: een cursieve run. Rij 2: <i val="0"/> is geen cursief. Rij 3: cursief via de celstijl telt niet.
        ruw = self.lees(extra={
            "xl/sharedStrings.xml": f'<sst {S}>'
                                    '<si><r><t xml:space="preserve">voorbeeld (</t></r><r><rPr><i/></rPr><t>abstractie</t></r>'
                                    '<r><t>)</t></r></si>'
                                    '<si><r><t>niet </t></r><r><rPr><i val="0"/><b/></rPr><t>cursief</t></r></si>'
                                    '<si><t>celstijl cursief</t></si>'
                                    '</sst>',
            "xl/styles.xml": f'<styleSheet {S}><fonts><font/><font><i/></font></fonts>'
                             '<cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>',
            "xl/worksheets/sheet1.xml": f'<worksheet {S}><sheetData>'
                                        '<row r="1"><c r="C1" t="s"><v>0</v></c></row>'
                                        '<row r="2"><c r="C2" t="s"><v>1</v></c></row>'
                                        '<row r="3"><c r="C3" s="1" t="s"><v>2</v></c></row>'
                                        '</sheetData></worksheet>',
        })
        r1, r2, r3 = ruw["rijen"]
        self.assertEqual(r1["c"][2], "voorbeeld (abstractie)")
        self.assertEqual(r1["opmaak"]["2"], [{"t": "voorbeeld ("}, {"t": "abstractie", "i": True}, {"t": ")"}])
        self.assertEqual(r2["c"][2], "niet cursief")
        self.assertNotIn("opmaak", r2)
        self.assertNotIn("opmaak", r3)
        self.assertEqual(ruw["tellingen"]["run:i"], 1)

    def test_tellingen(self):
        t = self.lees()["tellingen"]
        self.assertEqual(t["run:strike"], 2)  # run in gedeelde tekst en celstijl
        self.assertEqual(t["run:vertAlign"], 1)
        self.assertEqual(t["escape_x000"], 1)
        self.assertEqual(t["rijen"], 4)

    def test_gewijzigd_en_geen_namen(self):
        ruw = self.lees()
        self.assertEqual(ruw["gewijzigd"], "2026-05-06T07:08:09Z")
        self.assertNotIn("Geheime", json.dumps(ruw))

    def test_meerdere_bladen_worden_gemeld(self):
        wb = (f'<workbook {S}><sheets><sheet name="Een" sheetId="1" r:id="rId1"/>'
              '<sheet name="Twee" sheetId="2" state="hidden" r:id="rId1"/></sheets></workbook>')
        ruw = self.lees(extra={"xl/workbook.xml": wb})
        self.assertEqual([b["naam"] for b in ruw["bladnamen"]], ["Een", "Twee"])
        self.assertEqual(ruw["bladnamen"][1]["staat"], "hidden")

    def test_weigert_entity(self):
        with self.assertRaises(vz.Onveilig):
            self.lees(extra={"xl/sharedStrings.xml": '<!DOCTYPE sst [<!ENTITY a "b">]><sst/>'})

    def blad(self, rijen, na=""):
        return {"xl/worksheets/sheet1.xml": f'<worksheet {S}><sheetData>{rijen}</sheetData>{na}</worksheet>'}

    def test_bron_is_het_gelezen_bestand(self):
        pad = self.dir / "t.xlsx"
        bouw_xlsx(pad)
        data = pad.read_bytes()
        self.assertEqual(lees_xlsx.lees(pad)["bron"], {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})

    def test_vreemde_cellen_getal_fout_formule_en_escape(self):
        # Een getal (D3 = 7) en een escape (_x000D_ in B5) uit het standaardbestand, en hier een foutwaarde, een
        # formuletekst en een datum. Booleans (de leeftijdsvakjes) en gedeelde tekst zijn niet vreemd (IMP-4).
        ruw = self.lees()
        self.assertEqual(ruw["vreemde_cellen"], [
            {"r": 3, "k": 3, "soort": "n", "waarde": "7"},
            {"r": 5, "k": 1, "soort": "escape", "waarde": "vorm_x000D_"},
        ])
        ruw = self.lees(extra=self.blad(
            '<row r="2"><c r="A2" t="e"><f>1/0</f><v>#REF!</v></c><c r="B2" t="str"><f>A1</f><v>tekst</v></c>'
            '<c r="C2" t="d"><v>2026-11-09</v></c><c r="D2" t="b"><v>1</v></c><c r="E2" t="s"><v>0</v></c>'
            '<c r="F2" t="n"><v>0.5</v></c></row>'))
        self.assertEqual([(v["k"], v["soort"], v["waarde"]) for v in ruw["vreemde_cellen"]],
                         [(0, "e", "#REF!"), (1, "str", "tekst"), (2, "d", "2026-11-09"), (5, "n", "0.5")])
        self.assertEqual(ruw["tellingen"]["celsoort:b"], 1)
        lang = self.lees(extra=self.blad('<row r="2"><c r="A2"><v>' + "1" * 60 + '</v></c></row>'))
        self.assertEqual(len(lang["vreemde_cellen"][0]["waarde"]), 40)

    def test_weigert_cel_of_rij_zonder_r(self):
        for rijen in ('<row r="1"><c t="s"><v>0</v></c></row>', '<row><c r="A1" t="s"><v>0</v></c></row>',
                      '<row r="1"><c r="1A" t="s"><v>0</v></c></row>'):
            with self.assertRaises(vz.Onveilig, msg=rijen):
                self.lees(extra=self.blad(rijen))

    def test_weigert_gedeelde_tekst_buiten_bereik(self):
        for v in ("99999999", "-1", "x"):
            with self.assertRaises(vz.Onveilig, msg=v):
                self.lees(extra=self.blad(f'<row r="1"><c r="A1" t="s"><v>{v}</v></c></row>'))

    def test_weigert_werkboek_zonder_relatie_voor_het_blad(self):
        with self.assertRaises(vz.Onveilig):
            self.lees(extra={"xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'})

    def test_vreemde_vorm_geeft_exit_3_zonder_traceback(self):
        pad = self.dir / "t.xlsx"
        bouw_xlsx(pad, extra=self.blad('<row r="1"><c t="s"><v>0</v></c></row>'))
        r = subprocess.run([sys.executable, "-I", "-B", str(MAP / "lees_xlsx.py"), str(pad), str(self.dir / "uit" / "t.json")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertIn("r-attribuut", r.stderr)
        self.assertNotIn("Traceback", r.stderr)
        r = subprocess.run([sys.executable, "-I", "-B", str(MAP / "lees_xlsx.py"), str(self.dir / "t.xlsx"), str(self.dir / "w" / "ruw" / "t.json")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)  # nog altijd hetzelfde slechte bestand
        bouw_xlsx(pad)
        r = subprocess.run([sys.executable, "-I", "-B", str(MAP / "lees_xlsx.py"), str(pad), str(self.dir / "w" / "ruw" / "t.json")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)  # de uitvoermap wordt aangemaakt
        self.assertTrue((self.dir / "w" / "ruw" / "t.json").is_file())

    def test_verborgen_rij_en_kolom_en_opmerking(self):
        # Een kopie met rij 2 verborgen (met waarde), rij 4 verborgen (zonder waarde: telt niet), kolom C verborgen en
        # een opmerking: de lezer meldt ze, zodat de omzetting kan stoppen (BLP-4).
        extra = self.blad('<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2" hidden="1"><c r="A2" t="s"><v>1</v></c></row>'
                          '<row r="4" hidden="true"></row>')
        extra["xl/worksheets/sheet1.xml"] = extra["xl/worksheets/sheet1.xml"].replace(
            "<sheetData>", '<cols><col min="1" max="2" width="9"/><col min="3" max="3" hidden="1"/></cols><sheetData>')
        extra["xl/comments1.xml"] = f'<comments {S}><commentList><comment ref="A2"><text><t>Dit doel vervalt.</t></text></comment></commentList></comments>'
        extra["xl/threadedComments/threadedComment1.xml"] = "<ThreadedComments/>"
        ruw = self.lees(extra=extra)
        self.assertEqual(ruw["verborgen_rijen"], [2])
        self.assertEqual(ruw["verborgen_kolommen"], [[2, 2]])
        self.assertEqual(ruw["opmerkingen"], 2)
        gewoon = self.lees()
        self.assertEqual((gewoon["verborgen_rijen"], gewoon["verborgen_kolommen"], gewoon["opmerkingen"], gewoon["beelden"]), ([], [], 0, []))

    def test_beelden_op_het_blad(self):
        xdr = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
        extra = {
            "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vml1.vml"/>'
                '</Relationships>',
            "xl/drawings/drawing1.xml": f'<xdr:wsDr {xdr}>'
                '<xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>897</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
                '<xdr:to><xdr:col>2</xdr:col><xdr:row>897</xdr:row></xdr:to><xdr:pic/></xdr:twoCellAnchor>'
                '<xdr:oneCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:row>835</xdr:row></xdr:from><xdr:sp/></xdr:oneCellAnchor>'
                '<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:graphicFrame/></xdr:absoluteAnchor>'
                '</xdr:wsDr>',
        }
        self.assertEqual(self.lees(extra=extra)["beelden"], [[898, 2], [836, 7], [0, 0]])
        extra["xl/drawings/drawing1.xml"] = f'<xdr:wsDr {xdr}><xdr:twoCellAnchor><xdr:from><xdr:col>x</xdr:col><xdr:row>1</xdr:row></xdr:from></xdr:twoCellAnchor></xdr:wsDr>'
        with self.assertRaises(vz.Onveilig):
            self.lees(extra=extra)
        del extra["xl/drawings/drawing1.xml"]  # de relatie wijst naar een lid dat er niet is
        with self.assertRaises(vz.Onveilig):
            self.lees(extra=extra)


class Decodeer(Tijdelijk):
    def toolresultaat(self, naam="LP0001.docx", bytes_=None, id_="abc1234567890", mime=None, titel=None):
        pad = self.dir / "bron.docx"
        bouw_docx(pad)
        raw = pad.read_bytes()
        res = self.dir / "res.json"
        res.write_text(json.dumps({"content": base64.b64encode(raw).decode(), "id": id_,
                                   "mimeType": mime or decodeer.MIME["docx"], "title": titel or naam}))
        return res, raw

    def decodeer(self, res, raw, **kw):
        werk = self.dir / "werk"
        return decodeer.decodeer(werk, kw.get("id", "abc1234567890"), kw.get("n", len(raw)), "2026-09-03T10:00:00Z", res), werk

    def test_decodeert_en_schrijft_manifest(self):
        res, raw = self.toolresultaat()
        (naam, n, sha), werk = self.decodeer(res, raw)
        self.assertEqual((naam, n, sha), ("LP0001.docx", len(raw), hashlib.sha256(raw).hexdigest()))
        self.assertEqual((werk / "bron" / "LP0001.docx").read_bytes(), raw)
        regel = json.loads((werk / "manifest.json").read_text())[0]
        self.assertEqual(regel["drive_id"], "abc1234567890")
        self.assertEqual(regel["soort"], "docx")
        # nogmaals decoderen vervangt de regel in plaats van een tweede te maken
        self.decodeer(res, raw)
        self.assertEqual(len(json.loads((werk / "manifest.json").read_text())), 1)

    def test_weigert_verkeerde_grootte_id_titel_en_mime(self):
        res, raw = self.toolresultaat()
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, raw, n=len(raw) + 1)
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, raw, id="anderid123456")
        res, raw = self.toolresultaat(titel="../LP0001.docx")
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, raw)
        res, raw = self.toolresultaat(titel="lesplan.docx")
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, raw)
        res, raw = self.toolresultaat(mime="application/pdf")
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, raw)

    def test_weigert_geen_zip_en_slechte_base64(self):
        res = self.dir / "res.json"
        res.write_text(json.dumps({"content": base64.b64encode(b"niet zip").decode(), "id": "abc1234567890",
                                   "mimeType": decodeer.MIME["docx"], "title": "LP0001.docx"}))
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, b"niet zip")
        res.write_text(json.dumps({"content": "@@@", "id": "abc1234567890",
                                   "mimeType": decodeer.MIME["docx"], "title": "LP0001.docx"}))
        with self.assertRaises(vz.Onveilig):
            self.decodeer(res, b"x")
        self.assertFalse((self.dir / "werk" / "bron" / "LP0001.docx.tmp").exists())

    def test_weigert_werkmap_in_repo(self):
        res, raw = self.toolresultaat()
        with self.assertRaises(vz.Onveilig):
            decodeer.decodeer(MAP / "werk", "abc1234567890", len(raw), "x", res)

    def test_titel_xlsx(self):
        self.assertEqual(decodeer.soort_van_naam("Doelenset BaO Wetenschap en techniek.xlsx"), "xlsx")
        self.assertEqual(decodeer.soort_van_naam("LP0014a.docx"), "docx")
        self.assertIsNone(decodeer.soort_van_naam("LP14.docx"))

    def maak_werkmap(self):
        werk = self.dir / "w"
        (werk / "docx").mkdir(parents=True)
        (werk / "xlsx").mkdir()
        bouw_docx(werk / "docx" / "LP0001.docx")
        bouw_xlsx(werk / "xlsx" / "wiskunde.xlsx")
        raw = (werk / "docx" / "LP0001.docx").read_bytes()
        manifest = [{"code": "LP0001", "docx": "/ergens/anders/docx/LP0001.docx", "bytes": len(raw),
                     "sha256": hashlib.sha256(raw).hexdigest()}]
        (werk / "manifest.json").write_text(json.dumps(manifest))
        return werk

    def test_controle_oud_formaat_en_onbevestigd(self):
        werk = self.maak_werkmap()
        bevestigd, onbevestigd, meldingen = decodeer.controleer(werk)
        self.assertEqual(bevestigd, ["LP0001.docx"])
        self.assertEqual(list(onbevestigd), ["wiskunde.xlsx"])
        self.assertEqual(len(meldingen), 1)
        _, _, meldingen = decodeer.controleer(werk, sta_onbevestigd_toe=True, aanvulling=self.dir / "aanv.json")
        self.assertEqual(meldingen, [])
        aanv = json.loads((self.dir / "aanv.json").read_text())
        self.assertEqual(aanv["wiskunde.xlsx"]["reden"], "niet in manifest")

    def test_controle_ziet_gewijzigd_bestand(self):
        werk = self.maak_werkmap()
        bouw_docx(werk / "docx" / "LP0001.docx", extra={"word/extra.xml": "<x/>"})
        _, _, meldingen = decodeer.controleer(werk, sta_onbevestigd_toe=True)
        self.assertEqual(len(meldingen), 1)
        self.assertIn("LP0001.docx", meldingen[0])

    def test_controle_ziet_ontbrekend_bestand(self):
        werk = self.maak_werkmap()
        (werk / "docx" / "LP0001.docx").unlink()
        _, _, meldingen = decodeer.controleer(werk, sta_onbevestigd_toe=True)
        self.assertIn("ontbreekt", meldingen[0])

    def test_controle_exitcodes(self):
        werk = self.maak_werkmap()
        script = str(MAP / "decodeer.py")
        r = subprocess.run([sys.executable, "-I", script, "--controleer", str(werk)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)
        r = subprocess.run([sys.executable, "-I", script, "--controleer", str(werk), "--sta-onbevestigd-toe"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        r = subprocess.run([sys.executable, "-I", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)


# --- echte bestanden (alleen met GO_WERKMAP) ---

DOCX_TELLINGEN = {  # alinea's, lijstalinea's, beelden, tabellen (bovenste niveau), uit de verkenning
    "LP0001": (278, 70, 5, 6), "LP0014a": (412, 160, 10, 6), "LP0014b": (464, 123, 10, 6),
    "LP0017": (202, 78, 6, 6), "LP0065": (272, 105, 7, 6), "LP0074": (303, 127, 7, 6),
    "LP0087": (277, 89, 8, 6), "LP0094": (260, 80, 6, 6),
}
REGELEINDEN_IN_T = 18

TYPES = {
    'aardrijkskunde': {
        'MIA - aanklikbaar': 352,
        'MIA - niet aanklikbaar': 293,
        'MIA - titel': 246,
        'doelzin': 276,
        'minimumdoel': 71,
        'onderwerp': 3,
        'rubriek': 19,
        'subrubriek': 23,
        'subthema': 9,
        'te hanteren begrippen': 597,
        'voorbeelden - bullet': 125,
        'voorbeelden - titel': 51,
    },
    'burgerschap': {
        'MIA - aanklikbaar': 370,
        'MIA - niet aanklikbaar': 72,
        'MIA - titel': 160,
        'asterisk': 1,
        'doelzin': 148,
        'minimumdoel': 45,
        'onderwerp': 3,
        'rubriek': 16,
        'subrubriek': 4,
        'subthema': 5,
        'te hanteren begrippen': 217,
        'voorbeelden - bullet': 93,
        'voorbeelden - titel': 38,
    },
    'frans': {
        'MIA - aanklikbaar': 160,
        'MIA - niet aanklikbaar': 45,
        'MIA - titel': 99,
        'asterisk': 1,
        'doelzin': 112,
        'minimumdoel': 53,
        'onderwerp': 10,
        'rubriek': 10,
        'subthema': 19,
        'te hanteren begrippen': 194,
        'voorbeelden - bullet': 39,
        'voorbeelden - titel': 18,
    },
    'geschiedenis': {
        'MIA - aanklikbaar': 343,
        'MIA - niet aanklikbaar': 43,
        'MIA - titel': 153,
        'asterisk': 1,
        'doelzin': 244,
        'minimumdoel': 60,
        'onderwerp': 4,
        'rubriek': 12,
        'subrubriek': 3,
        'subthema': 6,
        'te hanteren begrippen': 559,
        'voorbeelden - bullet': 183,
        'voorbeelden - titel': 71,
    },
    'ict': {
        'MIA - aanklikbaar': 196,
        'MIA - niet aanklikbaar': 40,
        'MIA - titel': 90,
        'doelzin': 93,
        'minimumdoel': 25,
        'onderwerp': 4,
        'subthema': 7,
        'te hanteren begrippen': 116,
        'voorbeelden - bullet': 109,
        'voorbeelden - titel': 38,
    },
    'leren_leren': {
        'MIA - aanklikbaar': 298,
        'MIA - niet aanklikbaar': 82,
        'MIA - titel': 114,
        'doelzin': 114,
        'minimumdoel': 21,
        'rubriek': 10,
        'subthema': 4,
        'te hanteren begrippen': 182,
        'voorbeelden - bullet': 56,
        'voorbeelden - titel': 9,
    },
    'lichamelijke_opvoeding': {
        'MIA - aanklikbaar': 356,
        'MIA - niet aanklikbaar': 85,
        'MIA - titel': 183,
        'doelzin': 189,
        'minimumdoel': 43,
        'rubriek': 19,
        'subthema': 10,
        'te hanteren begrippen': 57,
        'voorbeelden - bullet': 123,
        'voorbeelden - titel': 22,
    },
    'muzische_vorming': {
        'MIA - aanklikbaar': 335,
        'MIA - niet aanklikbaar': 6,
        'MIA - titel': 96,
        'doelzin': 98,
        'minimumdoel': 130,
        'onderwerp': 2,
        'rubriek': 10,
        'subrubriek': 10,
        'subthema': 10,
        'te hanteren begrippen': 422,
        'voorbeelden - bullet': 115,
        'voorbeelden - titel': 78,
    },
    'nederlands': {
        'MIA - aanklikbaar': 963,
        'MIA - niet aanklikbaar': 123,
        'MIA - titel': 439,
        'asterisk': 29,
        'doelzin': 622,
        'minimumdoel': 185,
        'onderwerp': 5,
        'rubriek': 41,
        'subrubriek': 35,
        'subthema': 15,
        'te hanteren begrippen': 306,
        'voorbeelden - bullet': 377,
        'voorbeelden - titel': 177,
    },
    'sociale_vaardigheden': {
        'MIA - aanklikbaar': 102,
        'MIA - niet aanklikbaar': 16,
        'MIA - titel': 54,
        'asterisk': 7,
        'doelzin': 68,
        'minimumdoel': 19,
        'subthema': 7,
        'te hanteren begrippen': 39,
        'voorbeelden - bullet': 36,
        'voorbeelden - titel': 22,
    },
    'wetenschap_techniek': {
        'MIA - aanklikbaar': 558,
        'MIA - niet aanklikbaar': 475,
        'MIA - titel': 385,
        'doelzin': 528,
        'minimumdoel': 142,
        'onderwerp': 7,
        'rubriek': 41,
        'subrubriek': 18,
        'subthema': 13,
        'te hanteren begrippen': 1140,
        'voorbeelden - bullet': 320,
        'voorbeelden - titel': 104,
    },
    'wiskunde': {
        'MIA - aanklikbaar': 1009,
        'MIA - niet aanklikbaar': 1107,
        'MIA - titel': 1172,
        'asterisk': 6,
        'doelzin': 998,
        'minimumdoel': 348,
        'onderwerp': 6,
        'rubriek': 51,
        'subrubriek': 48,
        'subthema': 26,
        'te hanteren begrippen': 853,
        'voorbeelden - bullet': 459,
        'voorbeelden - titel': 210,
    },
}

OPMAAK_XLSX = {  # doorgehaalde en superschrift-runs per set (rechter, 9 november 2026)
    "burgerschap": (3, 0), "nederlands": (1, 0), "wiskunde": (13, 8), "geschiedenis": (0, 3),
}
BEELDEN_XLSX = {"wiskunde": [[898, 2], [1346, 2], [1367, 2], [836, 7], [846, 10]]}  # [rij, kolom] (BLP-4)
CURSIEF_XLSX = {"wiskunde": 8}  # cursieve runs: de voorbeelden van WI.971 en WI.972 (rechter, 1a-G6-1)


# De korte namen (de oudere werkmap met docx/ en xlsx/) en de namen op de Drive (bron/, zoals decodeer.py ze schrijft).
DRIVE_NAAM = {
    "aardrijkskunde": "aardrijkskunde", "burgerschap": "burgerschap", "frans": "Frans", "geschiedenis": "geschiedenis",
    "ict": "ICT", "leren_leren": "leren leren", "lichamelijke_opvoeding": "lichamelijke opvoeding",
    "muzische_vorming": "muzische vorming", "nederlands": "Nederlands", "sociale_vaardigheden": "sociale vaardigheden",
    "wetenschap_techniek": "wetenschap en techniek", "wiskunde": "wiskunde",
}


@unittest.skipUnless(os.environ.get("GO_WERKMAP"), "GO_WERKMAP niet gezet")
class EchteBestanden(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.werk = Path(os.environ["GO_WERKMAP"])

    def docx(self, code):
        p = decodeer.vind_bestand(self.werk, f"{code}.docx")
        self.assertIsNotNone(p, f"{code}.docx niet gevonden in {self.werk}")
        return p

    def xlsx(self, vak):
        p = decodeer.vind_bestand(self.werk, f"{vak}.xlsx") or decodeer.vind_bestand(self.werk, f"Doelenset BaO {DRIVE_NAAM[vak]}.xlsx")
        self.assertIsNotNone(p, f"de doelenset {vak} niet gevonden in {self.werk}")
        return p

    def test_manifest_en_bytes(self):
        bevestigd, onbevestigd, meldingen = decodeer.controleer(self.werk, sta_onbevestigd_toe=True)
        self.assertEqual(meldingen, [])
        # Het manifest van de eerste reeks heeft alleen de 8 docx; een werkmap van decodeer.py heeft alle 20.
        self.assertIn((len(bevestigd), len(onbevestigd)), [(8, 12), (20, 0)])

    def test_docx_tellingen(self):
        regeleinden = 0
        for code, (alineas, lijst, beelden, tabellen) in DOCX_TELLINGEN.items():
            ruw = lees_docx.lees(self.docx(code))
            t = ruw["tellingen"]
            self.assertEqual(
                (t["alineas"], t["lijstalineas"], sum(1 for _ in lees_docx.iter_beelden(ruw["body"])), t["tabellen"]),
                (alineas, lijst, beelden, tabellen), code)
            self.assertNotIn("tabellen_genest", t, code)
            for sleutel in ("hyperlinks", "ins", "del", "sdt", "tekstvakken", "velden", "commentaar_ankers"):
                self.assertNotIn(sleutel, t, f"{code} {sleutel}")
            regeleinden += t.get("regeleinde_in_t", 0)
        self.assertEqual(regeleinden, REGELEINDEN_IN_T)

    def test_xlsx_rijen_per_type(self):
        for vak, verwacht in TYPES.items():
            ruw = lees_xlsx.lees(self.xlsx(vak))
            self.assertEqual(len(ruw["bladnamen"]), 1, vak)
            kop = ruw["rijen"][0]["c"]
            self.assertEqual(len(kop), 24, vak)
            telling = {}
            for r in ruw["rijen"][1:]:
                typ = ((r["c"][0] if r["c"] else None) or "").strip()
                if typ:
                    telling[typ] = telling.get(typ, 0) + 1
            self.assertEqual(telling, verwacht, vak)
        self.assertEqual(sum(v["doelzin"] for v in TYPES.values()), 3490)

    def test_xlsx_opmaak(self):
        for vak in TYPES:
            ruw = lees_xlsx.lees(self.xlsx(vak))
            t = ruw["tellingen"]
            self.assertEqual((t.get("run:strike", 0), t.get("run:vertAlign", 0)), OPMAAK_XLSX.get(vak, (0, 0)), vak)
            self.assertEqual(t.get("run:i", 0), CURSIEF_XLSX.get(vak, 0), vak)

    def test_xlsx_geen_vreemde_cellen_verborgen_rijen_of_opmerkingen(self):
        # Eerste reeks: alleen booleans in de leeftijdsvakjes, niets verborgen, geen opmerkingen; wiskunde heeft vijf
        # ankers van een paar punt groot (restanten van breuken, de tekst staat in de cel ernaast; BLP-4).
        for vak in TYPES:
            ruw = lees_xlsx.lees(self.xlsx(vak))
            self.assertEqual((ruw["vreemde_cellen"], ruw["verborgen_rijen"], ruw["verborgen_kolommen"], ruw["opmerkingen"]),
                             ([], [], [], 0), vak)
            self.assertEqual(ruw["beelden"], BEELDEN_XLSX.get(vak, []), vak)


if __name__ == "__main__":
    unittest.main()
