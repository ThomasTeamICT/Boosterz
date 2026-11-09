"""Van tool-uitvoer van de Drive naar een bestand en manifest.json, en controle van de bestanden.

Twee gebruiken, altijd met `python3 -I`:

1. Decoderen van één download_file_content-resultaat (JSON met base64):
   python3 -I decodeer.py --werkmap <map> --drive-id <id> --bytes <fileSize> --gewijzigd <modifiedTime> <toolresult.json>
   - controleert id, mimeType en titel (LP0000[a-z].docx of 'Doelenset BaO <vak>.xlsx');
   - decodeert en eist dat het aantal bytes gelijk is aan --bytes;
   - eist een geldige zip, zonder absolute paden of '..', met een redelijk totaal na het uitpakken;
   - schrijft <werkmap>/bron/<naam> en een regel in <werkmap>/manifest.json
     (naam, soort, bytes, sha256, drive_id, gewijzigd).

2. Controle van alle bestanden in een werkmap tegen manifest.json:
   python3 -I decodeer.py --controleer <werkmap> [--sta-onbevestigd-toe] [--aanvulling <uit.json>]
   - zoekt elk bestand van het manifest in <werkmap>/bron, /docx en /xlsx en vergelijkt bytes en sha256;
   - elk docx- of xlsx-bestand in die mappen dat NIET in het manifest staat, of waarvan het manifest
     geen bytes of sha256 heeft, is 'onbevestigd': dat geeft exit 3, tenzij --sta-onbevestigd-toe;
   - --aanvulling schrijft de berekende bytes en sha256 van de onbevestigde bestanden naar een
     bestand, zodat de hoofdsessie ze bewust kan overnemen. Dat is geen bevestiging tegen de Drive.

De werkmap ligt altijd buiten de repo; een werkmap binnen een git-repository wordt geweigerd.
Exit 0: alles klopt. Exit 3: een afwijking. Exit 2: verkeerd gebruik.
"""
import base64
import binascii
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # geen __pycache__ in de repo
sys.path.insert(0, str(Path(__file__).resolve().parent))  # met -I staat de scriptmap niet vanzelf op het pad
import veilig_zip as vz  # noqa: E402

MIME = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
NAAM_DOCX = re.compile(r"^LP[0-9]{4}[a-z]?\.docx$")
NAAM_XLSX = re.compile(r"^Doelenset BaO [A-Za-zÀ-ÿ ]+\.xlsx$")
VOLLEDIGE_ID = re.compile(r"^[A-Za-z0-9_-]{10,100}$")


def soort_van_naam(naam):
    if NAAM_DOCX.match(naam):
        return "docx"
    if NAAM_XLSX.match(naam):
        return "xlsx"
    return None


def lees_manifest(werkmap):
    pad = Path(werkmap) / "manifest.json"
    if not pad.exists():
        return []
    data = json.loads(pad.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise vz.Onveilig("manifest.json is geen lijst")
    return data


def schrijf_manifest(werkmap, lijst):
    pad = Path(werkmap) / "manifest.json"
    tmp = pad.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(lijst, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(pad)


def naam_van_regel(regel):
    """Naam van een manifestregel: nieuw formaat 'naam', ouder formaat via 'docx' of 'code'."""
    if regel.get("naam"):
        return regel["naam"]
    if regel.get("docx"):
        return Path(regel["docx"]).name
    if regel.get("xlsx"):
        return Path(regel["xlsx"]).name
    if regel.get("code"):
        return regel["code"] + ".docx"
    return None


def decodeer(werkmap, drive_id, verwacht_bytes, gewijzigd, resultaat):
    vz.weiger_in_repo(werkmap, "werkmap")
    vz.weiger_in_repo(resultaat, "toolresultaat")
    data = json.loads(Path(resultaat).read_text(encoding="utf-8"))
    if not VOLLEDIGE_ID.match(drive_id or ""):
        raise vz.Onveilig("ongeldig Drive-id")
    if data.get("id") != drive_id:
        raise vz.Onveilig(f"id {data.get('id')!r} is niet het verwachte {drive_id!r}")
    naam = data.get("title")
    if not isinstance(naam, str) or "/" in naam or "\\" in naam:
        raise vz.Onveilig(f"ongeldige titel {naam!r}")
    soort = soort_van_naam(naam)
    if soort is None:
        raise vz.Onveilig(f"titel {naam!r} is geen LPxxxx.docx of 'Doelenset BaO <vak>.xlsx'")
    if data.get("mimeType") != MIME[soort]:
        raise vz.Onveilig(f"mimeType {data.get('mimeType')!r} past niet bij {soort}")
    try:
        raw = base64.b64decode(data["content"], validate=True)
    except (KeyError, binascii.Error, TypeError) as e:
        raise vz.Onveilig(f"inhoud is geen geldige base64 ({e})")
    if len(raw) != verwacht_bytes:
        raise vz.Onveilig(f"{len(raw)} bytes gedecodeerd, verwacht {verwacht_bytes}")
    bron = Path(werkmap) / "bron"
    bron.mkdir(parents=True, exist_ok=True)
    doel = bron / naam
    tmp = bron / (naam + ".tmp")
    tmp.write_bytes(raw)
    try:
        z = vz.open_veilig(tmp)
        namen = z.namelist()
        z.close()
        vereist = "word/document.xml" if soort == "docx" else "xl/workbook.xml"
        if vereist not in namen:
            raise vz.Onveilig(f"{vereist} ontbreekt in {naam}")
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(doel)
    sha = vz.sha256_bestand(doel)
    lijst = [r for r in lees_manifest(werkmap) if naam_van_regel(r) != naam]
    lijst.append({"naam": naam, "soort": soort, "bytes": len(raw), "sha256": sha,
                  "drive_id": drive_id, "gewijzigd": gewijzigd})
    schrijf_manifest(werkmap, lijst)
    return naam, len(raw), sha


def vind_bestand(werkmap, naam):
    for sub in ("bron", "docx", "xlsx", "."):
        p = Path(werkmap) / sub / naam
        if p.is_file():
            return p
    return None


def controleer(werkmap, sta_onbevestigd_toe=False, aanvulling=None):
    vz.weiger_in_repo(werkmap, "werkmap")
    lijst = lees_manifest(werkmap)
    meldingen = []
    bevestigd = set()
    for regel in lijst:
        naam = naam_van_regel(regel)
        if naam is None:
            meldingen.append(f"manifestregel zonder naam: {regel!r}")
            continue
        p = vind_bestand(werkmap, naam)
        if p is None:
            meldingen.append(f"{naam}: bestand ontbreekt")
            continue
        if not isinstance(regel.get("bytes"), int) or not regel.get("sha256"):
            continue  # onbevestigd, hieronder gemeld
        grootte = p.stat().st_size
        if grootte != regel["bytes"]:
            meldingen.append(f"{naam}: {grootte} bytes, manifest zegt {regel['bytes']}")
            continue
        sha = vz.sha256_bestand(p)
        if sha != regel["sha256"]:
            meldingen.append(f"{naam}: sha256 {sha[:12]}... wijkt af van manifest {regel['sha256'][:12]}...")
            continue
        bevestigd.add(naam)
    namen_in_manifest = {naam_van_regel(r) for r in lijst}
    afgekeurd = {m_.split(":", 1)[0] for m_ in meldingen}
    onbevestigd = {}
    for sub in ("bron", "docx", "xlsx"):
        map_ = Path(werkmap) / sub
        if not map_.is_dir():
            continue
        for p in sorted(map_.iterdir()):
            if p.suffix not in (".docx", ".xlsx") or not p.is_file():
                continue
            if p.name in bevestigd or p.name in afgekeurd:
                continue
            reden = "manifest heeft geen bytes of sha256" if p.name in namen_in_manifest else "niet in manifest"
            onbevestigd[p.name] = {"reden": reden, "bytes": p.stat().st_size, "sha256": vz.sha256_bestand(p)}
    if not sta_onbevestigd_toe:
        for naam, info in onbevestigd.items():
            meldingen.append(f"{naam}: onbevestigd ({info['reden']})")
    if aanvulling:
        vz.weiger_in_repo(aanvulling, "aanvulling")
        Path(aanvulling).write_text(json.dumps(onbevestigd, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return sorted(bevestigd), onbevestigd, meldingen


def main(argv):
    arg = list(argv)

    def optie(naam, waarde=True):
        if naam in arg:
            i = arg.index(naam)
            if waarde:
                if i + 1 >= len(arg):
                    raise SystemExit(f"{naam} mist een waarde")
                v = arg[i + 1]
                del arg[i:i + 2]
                return v
            del arg[i]
            return True
        return None

    try:
        controle = optie("--controleer")
        if controle:
            toe = bool(optie("--sta-onbevestigd-toe", False))
            aanv = optie("--aanvulling")
            bevestigd, onbevestigd, meldingen = controleer(controle, toe, aanv)
            print(f"bevestigd tegen bytes en sha256: {len(bevestigd)}")
            print(f"onbevestigd (niet tegen het manifest te controleren): {len(onbevestigd)}"
                  + (" (toegestaan)" if toe and onbevestigd else ""))
            for naam, info in onbevestigd.items():
                print(f"  {naam}: {info['reden']}, {info['bytes']} bytes, sha256 {info['sha256'][:12]}...")
            for m_ in meldingen:
                print("AFWIJKING:", m_, file=sys.stderr)
            return 3 if meldingen else 0
        werkmap = optie("--werkmap")
        drive_id = optie("--drive-id")
        grootte = optie("--bytes")
        gewijzigd = optie("--gewijzigd")
        if not (werkmap and drive_id and grootte and grootte.isdigit() and gewijzigd and len(arg) == 1):
            print(__doc__, file=sys.stderr)
            return 2
        naam, n, sha = decodeer(werkmap, drive_id, int(grootte), gewijzigd, arg[0])
        print(f"{naam}: {n} bytes, sha256 {sha}")
        return 0
    except (vz.Onveilig, json.JSONDecodeError, OSError) as e:
        print(f"FOUT: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
