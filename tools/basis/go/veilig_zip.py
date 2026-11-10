"""Veilig openen van docx en xlsx (zip met xml) uit een onbetrouwbare bron.

Alleen de standaardbibliotheek. Altijd draaien met `python3 -I`.

Wat dit doet:
- ledennamen zonder '..' en zonder absoluut pad (ook geen backslash of schijfletter), geen naam twee keer en
  geen versleuteld lid;
- hoogstens MAX_UITGEPAKT bytes uitgepakt en een redelijke verhouding tegen een zip-bom;
- een xml-bestand met <!DOCTYPE of <!ENTITY, of met een nulbyte (UTF-16 zonder BOM), wordt geweigerd vóór het
  parsen, want expat werkt interne entiteiten uit;
- een werkmap of uitvoerbestand binnen een git-repository wordt geweigerd, zodat een
  origineel nooit per ongeluk gecommit wordt.
"""
import hashlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

MAX_UITGEPAKT = 50 * 1024 * 1024  # totaal na het uitpakken
MAX_LID = 40 * 1024 * 1024  # één lid na het uitpakken
MAX_VERHOUDING = 120  # totaal uitgepakt gedeeld door ingepakt (bij meer dan 1 MB uitgepakt)
MAX_LEDEN = 2000

REPO_ROOT = Path(__file__).resolve().parents[3]


class Onveilig(Exception):
    """Het bestand is niet veilig of niet zoals verwacht."""


def binnen_repo(pad):
    """True als het pad binnen deze repo ligt, of binnen een map met een .git erboven."""
    p = Path(pad).resolve()
    if p == REPO_ROOT or REPO_ROOT in p.parents:
        return True
    for ouder in [p, *p.parents]:
        if (ouder / ".git").exists():
            return True
    return False


def weiger_in_repo(pad, wat="pad"):
    if binnen_repo(pad):
        raise Onveilig(f"{wat} ligt binnen een git-repository ({pad}); gebruik een map buiten de repo")
    return Path(pad)


def _naam_ok(naam):
    if not naam or naam.startswith("/") or "\\" in naam or "\x00" in naam:
        return False
    if re.match(r"^[A-Za-z]:", naam):
        return False
    return ".." not in naam.split("/")


def open_veilig(pad):
    """Open een zip en controleer namen en groottes. Geeft een ZipFile."""
    try:
        z = zipfile.ZipFile(pad)
    except zipfile.BadZipFile as e:
        raise Onveilig(f"geen geldige zip: {pad} ({e})")
    leden = z.infolist()
    if len(leden) > MAX_LEDEN:
        z.close()
        raise Onveilig(f"te veel leden in de zip: {len(leden)}")
    if len({li.filename for li in leden}) != len(leden):
        z.close()
        raise Onveilig("dubbele ledennaam in de zip (een ander programma kan een ander lid lezen)")
    uitgepakt = 0
    ingepakt = 0
    for li in leden:
        if not _naam_ok(li.filename):
            z.close()
            raise Onveilig(f"onveilige ledennaam: {li.filename!r}")
        if li.flag_bits & 0x1:
            z.close()
            raise Onveilig(f"versleuteld lid: {li.filename}")
        if li.file_size > MAX_LID:
            z.close()
            raise Onveilig(f"lid te groot: {li.filename} ({li.file_size} bytes)")
        uitgepakt += li.file_size
        ingepakt += li.compress_size
    if uitgepakt > MAX_UITGEPAKT:
        z.close()
        raise Onveilig(f"uitgepakt te groot: {uitgepakt} bytes")
    if uitgepakt > 1024 * 1024 and ingepakt > 0 and uitgepakt / ingepakt > MAX_VERHOUDING:
        z.close()
        raise Onveilig(f"verdachte verhouding uitgepakt/ingepakt: {uitgepakt}/{ingepakt}")
    bad = z.testzip()
    if bad is not None:
        z.close()
        raise Onveilig(f"zip-test mislukt bij {bad}")
    return z


def lees_lid(z, naam, verplicht=True):
    """Lees één lid als bytes, met een harde grens op het echt gelezen aantal."""
    try:
        info = z.getinfo(naam)
    except KeyError:
        if verplicht:
            raise Onveilig(f"ontbrekend lid: {naam}")
        return None
    with z.open(info) as f:
        data = f.read(MAX_LID + 1)
    if len(data) > MAX_LID or len(data) != info.file_size:
        raise Onveilig(f"lid {naam} heeft een andere grootte dan aangegeven")
    return data


def parse_xml(data, naam="xml"):
    """Parse xml-bytes, maar weiger DOCTYPE en ENTITY vóór het parsen.

    Een nulbyte komt in geldige UTF-8-xml nooit voor; xml in UTF-16 zonder BOM heeft er een na elk ASCII-teken en zou de
    zoektocht naar <!DOCTYPE en <!ENTITY hieronder ontlopen. Daarom die controle eerst.
    """
    if b"\x00" in data:
        raise Onveilig(f"{naam}: nulbyte, geen UTF-8-xml")
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        raise Onveilig(f"{naam}: UTF-16 wordt niet aanvaard")
    kop = data[:200].lower()
    if b"encoding" in kop and b"utf-8" not in kop and b"us-ascii" not in kop:
        raise Onveilig(f"{naam}: alleen UTF-8 wordt aanvaard")
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data or b"<!doctype" in data or b"<!entity" in data:
        raise Onveilig(f"{naam}: DOCTYPE of ENTITY gevonden")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        raise Onveilig(f"{naam}: geen geldige UTF-8")
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        raise Onveilig(f"{naam}: xml-fout ({e})")


def lees_xml(z, naam, verplicht=True):
    data = lees_lid(z, naam, verplicht)
    if data is None:
        return None
    return parse_xml(data, naam)


def sha1(data):
    return hashlib.sha1(data).hexdigest()


def sha256_bestand(pad):
    h = hashlib.sha256()
    with open(pad, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def kern_datum(z, tag):
    """Lees uit docProps/core.xml ALLEEN de datum met deze tag (dcterms:created of dcterms:modified).

    dc:creator en cp:lastModifiedBy worden nooit gelezen of doorgegeven.
    """
    root = lees_xml(z, "docProps/core.xml", verplicht=False)
    if root is None:
        return None
    ns = "{http://purl.org/dc/terms/}" + tag
    el = root.find(ns)
    if el is None or el.text is None:
        return None
    waarde = el.text.strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}T[\d:]+(\.\d+)?(Z|[+-]\d{2}:\d{2})?$", waarde):
        return None
    return waarde


def fout_en_stop(e, code=3):
    print(f"FOUT: {e}", file=sys.stderr)
    sys.exit(code)
