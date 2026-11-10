// Stap 2 van de import van het GO! leerplan en de lesplannen (docs/basisonderwijs/GO-LEERPLAN.md, "Import"):
// ruwe JSON (lees_docx.py, lees_xlsx.py) → de bestanden van public/basis/go/, met de officiële koppeling, alle
// controles en de rondgang.
//
// Gebruik:
//   npx vite-node tools/basis/go/maak.ts --werkmap <map> --uit <map> [--aanvaard-wijzigingen]
//     [--ingelezen JJJJ-MM-DD] [--minimumdoelen <map>] [--bekende <bekende-afwijkingen.json>]
//
//   --werkmap  buiten de repo: bron/ (de originele docx en xlsx, ook in submappen), ruw/ (de JSON van de lezers; het
//              veld bron, bytes en sha256 van het gelezen bestand, moet bij het origineel in bron/ horen),
//              eventueel manifest.json (decodeer.py; bytes en sha256 worden nagekeken) en beelden/ (de beelden die
//              bekende-afwijkingen.json als 'getoond' opgeeft: een png met de sha1 als naam moet byte-gelijk zijn aan
//              het origineel, elk ander beeld (de WebP) aan de sha256 van zijn regel). Ontbreekt een beeld in
//              beelden/, dan neemt maak.ts het uit --uit als het daar met de juiste sha1 of sha256 staat.
//              Het rapport komt in <werkmap>/rapport.json.
//   --uit      waar de bestanden komen (index.json, leerplan/, bij-minimumdoel/, lesplannen/, beelden/). Verplicht:
//              buiten de repo, of precies public/basis/go van deze repo (de echte import, pakket G4).
//   --aanvaard-wijzigingen  elke wijziging aan een bestaande code, een bestaand lesplan of een rubriek (andere tekst,
//              koppeling, leeftijd, niveau, vlaggen of schakels, rubriek of inhoud; een verdwenen code of lesplan) is
//              bewust aanvaard. Een verdwenen doelenset en een bestand in --uit dat de nieuwe index niet noemt, stoppen
//              ook met deze vlag; alleen het bestand van een aanvaard verdwenen lesplan (en zijn beelden) wordt gewist.
//
// Uitgangscodes: 0 geschreven (een ongewijzigd bestand blijft onaangeroerd); 1 fout (gebruik, lezen, schrijven);
// 3 de vorm wijkt af of de gegevens zijn niet betrouwbaar: er is niets geschreven behalve <werkmap>/rapport.json.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlNaarTekst, metUitbreidingOpDoelzin, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from '../../../src/lib/minimumdoelen';
import { controleerTweelingen, maakOpzoektabel } from '../../../src/lib/basis/go/koppelen';
import {
  Afwijkingen,
  Bekende,
  controleerLesplanTegenLeerplan,
  controleerLessenlijnen,
  controleerRuwDocx,
  controleerRuwXlsx,
  leesBekendeAfwijkingen,
  maakBijMinimumdoel,
  maakIndex,
  shaVan,
  telDoelzinnen,
  vakVanBlad,
  zetLeerplanOm,
  zetLesplanOm,
  type Afwijking,
  type LeerplanTellingen,
  type LesplanExtra,
  type MinimumdoelRij,
  type RuwDocx,
  type RuwXlsx,
  type RuwBron,
} from '../../../src/lib/basis/go/omzetten';
import { rondgangLeerplan, rondgangLesplan, type RondgangUitkomst, type XlsxRondgangUitkomst } from '../../../src/lib/basis/go/rondgang';
import { GO_VAKKEN, leerplanShaInvoer, type GoBijMinimumdoelBestand, type GoIndex, type GoLeerplanBestand, type GoLesplanBestand, type GoVak } from '../../../src/lib/basis/go/types';
import { valideerGoBijMinimumdoel, valideerGoIndex, valideerGoLeerplan, valideerGoLesplan, isZonderMinimumdoel } from '../../../src/lib/basis/go/valideer';
import {
  schermAfwijkingen,
  schermWijzigingen,
  tellingWijzigingen,
  wijzigingenDoelensets,
  wijzigingenLeerplan,
  wijzigingenLesplannen,
  type Wijziging,
} from '../../../src/lib/basis/go/wijzigingen';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STANDAARD_BEKENDE = join(REPO, 'tools', 'basis', 'go', 'bekende-afwijkingen.json');
const STANDAARD_MINIMUMDOELEN = join(REPO, 'public', 'leerplannen', 'minimumdoelen');
const ECHT_UIT = join(REPO, 'public', 'basis', 'go');

class Gebruik extends Error {}

// ── Argumenten ───────────────────────────────────────────────────────
interface Opties {
  werkmap: string;
  uit: string;
  aanvaard: boolean;
  ingelezen: string;
  minimumdoelen: string;
  bekende: string;
}

function vandaag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function leesOpties(argv: string[]): Opties {
  const o: Partial<Opties> = { aanvaard: false, ingelezen: vandaag(), minimumdoelen: STANDAARD_MINIMUMDOELEN, bekende: STANDAARD_BEKENDE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const waarde = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Gebruik(`${a} mist een waarde`);
      return v;
    };
    if (a === '--werkmap') o.werkmap = resolve(waarde());
    else if (a === '--uit') o.uit = resolve(waarde());
    else if (a === '--aanvaard-wijzigingen') o.aanvaard = true;
    else if (a === '--ingelezen') o.ingelezen = waarde();
    else if (a === '--minimumdoelen') o.minimumdoelen = resolve(waarde());
    else if (a === '--bekende') o.bekende = resolve(waarde());
    else throw new Gebruik(`onbekend argument ${a}`);
  }
  if (!o.werkmap) throw new Gebruik('--werkmap ontbreekt');
  if (!o.uit) throw new Gebruik('--uit ontbreekt (bv. een map in de scratchpad, of public/basis/go voor de echte import)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.ingelezen ?? '')) throw new Gebruik('--ingelezen heeft de vorm JJJJ-MM-DD');
  return o as Opties;
}

/** Ligt dit pad binnen een git-repository (een .git in een bovenliggende map)? */
function binnenRepo(pad: string): boolean {
  let p = existsSync(pad) ? realpathSync(pad) : resolve(pad);
  for (;;) {
    if (existsSync(join(p, '.git'))) return true;
    const ouder = dirname(p);
    if (ouder === p) return false;
    p = ouder;
  }
}

// ── Bestanden ────────────────────────────────────────────────────────
const sha256Bestand = (pad: string) => createHash('sha256').update(readFileSync(pad)).digest('hex');
const leesJson = (pad: string): unknown => JSON.parse(readFileSync(pad, 'utf8'));

function alleBestanden(map: string): string[] {
  if (!existsSync(map)) return [];
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const p = join(map, naam);
    if (statSync(p).isDirectory()) uit.push(...alleBestanden(p));
    else uit.push(p);
  }
  return uit.sort();
}

/** JSON met de grote lijsten één element per regel: leesbare diffs, zonder het bestand te doen zwellen. */
function schrijfJsonTekst(o: Record<string, unknown>): string {
  const regels = Object.entries(o).map(([k, v]) => {
    let w: string;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') w = `[\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n ]`;
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => Array.isArray(x)) && Object.keys(v).length > 0) {
      w = `{\n${Object.entries(v)
        .map(([kk, vv]) => `  ${JSON.stringify(kk)}: ${JSON.stringify(vv)}`)
        .join(',\n')}\n }`;
    } else w = JSON.stringify(v);
    return ` ${JSON.stringify(k)}: ${w}`;
  });
  return `{\n${regels.join(',\n')}\n}\n`;
}

interface Manifestregel {
  naam: string;
  bytes?: number;
  sha256?: string;
}

function leesManifest(werkmap: string): Manifestregel[] {
  const p = join(werkmap, 'manifest.json');
  if (!existsSync(p)) return [];
  const data = leesJson(p);
  if (!Array.isArray(data)) throw new Error('manifest.json is geen lijst');
  return data.flatMap((r: Record<string, unknown>) => {
    const naam = typeof r.naam === 'string' ? r.naam : typeof r.docx === 'string' ? basename(r.docx) : typeof r.xlsx === 'string' ? basename(r.xlsx) : typeof r.code === 'string' ? `${r.code}.docx` : undefined;
    return naam ? [{ naam, bytes: typeof r.bytes === 'number' ? r.bytes : undefined, sha256: typeof r.sha256 === 'string' ? r.sha256 : undefined }] : [];
  });
}

// ── Rapport ──────────────────────────────────────────────────────────
interface Rapport {
  datum: string;
  uitkomst: 'geschreven' | 'gestopt' | 'fout';
  uitleg: string[];
  invoer: { naam: string; ruw: string; bytes: number; sha256: string; manifest: 'bevestigd' | 'onbevestigd' | 'afwijkend' }[];
  koppeling?: Record<string, unknown>;
  afwijkingen: { nieuw: Afwijking[]; bekend: Afwijking[]; verouderd: unknown[] };
  validatie: Record<string, string[]>;
  rondgang: { lesplannen: Record<string, RondgangUitkomst>; leerplannen: Record<string, Omit<XlsxRondgangUitkomst, 'verschillen'> & { verschillen: string[] }> };
  lesplannen: Record<string, { vorm?: string; tellingen: LesplanExtra['tellingen']; beelden: LesplanExtra['beelden'] }>;
  leerplannen: Record<string, LeerplanTellingen & { doelen: number; zonderMinimumdoel: number }>;
  minimumdoelRijen: { vak: GoVak; rijen: MinimumdoelRij[] }[];
  /** De tekst van de minimumdoel-rijen in de Excel naast die van de API (alleen ter controle; de app toont die van de API). */
  minimumdoelTekst?: { vergeleken: number; gelijk: number; witruimteOfTekens: number; anders: { vak: GoVak; rij: number; moment: string; code: string; doel: string }[] };
  tweelingen: string[];
  wijzigingen: Wijziging[];
  /** verwijderd: alleen het bestand (en de beelden) van een aanvaard verdwenen lesplan. */
  bestanden: { geschreven: string[]; ongewijzigd: string[]; verwijderd: string[] };
}

function nieuwRapport(o: Opties): Rapport {
  return {
    datum: o.ingelezen,
    uitkomst: 'fout',
    uitleg: [],
    invoer: [],
    afwijkingen: { nieuw: [], bekend: [], verouderd: [] },
    validatie: {},
    rondgang: { lesplannen: {}, leerplannen: {} },
    lesplannen: {},
    leerplannen: {},
    minimumdoelRijen: [],
    tweelingen: [],
    wijzigingen: [],
    bestanden: { geschreven: [], ongewijzigd: [], verwijderd: [] },
  };
}

function schrijfRapport(werkmap: string, r: Rapport): void {
  const p = join(werkmap, 'rapport.json');
  writeFileSync(`${p}.tmp`, `${JSON.stringify(r, null, 1)}\n`);
  renameSync(`${p}.tmp`, p);
}

// ── De import ────────────────────────────────────────────────────────
function maak(o: Opties, rapport: Rapport): 0 | 3 {
  const stop = (reden: string): 3 => {
    rapport.uitleg.push(reden);
    return 3;
  };

  // 1. Invoer: elke ruwe JSON met zijn origineel (bytes en sha256), nagekeken tegen manifest.json als dat er is.
  const ruwMap = join(o.werkmap, 'ruw');
  const ruwBestanden = alleBestanden(ruwMap).filter((p) => p.endsWith('.json'));
  if (ruwBestanden.length === 0) throw new Gebruik(`geen ruwe JSON in ${ruwMap}`);
  const originelen = new Map(alleBestanden(join(o.werkmap, 'bron')).map((p) => [basename(p), p]));
  const manifest = leesManifest(o.werkmap);
  const docx: { ruw: RuwDocx; bytes: number; sha256: string }[] = [];
  const xlsx: { ruw: RuwXlsx; bytes: number; sha256: string; vak: GoVak }[] = [];
  let invoerFout = false;
  for (const p of ruwBestanden) {
    const json = leesJson(p) as Record<string, unknown>;
    const isDocx = Array.isArray(json.body);
    const fouten = isDocx ? controleerRuwDocx(json) : controleerRuwXlsx(json);
    if (fouten.length > 0) {
      rapport.validatie[`ruw/${basename(p)}`] = fouten;
      invoerFout = true;
      continue;
    }
    const naam = json.bestand as string;
    const origineel = originelen.get(naam);
    if (!origineel) {
      rapport.uitleg.push(`Het origineel ${naam} van ${basename(p)} staat niet in ${join(o.werkmap, 'bron')}.`);
      invoerFout = true;
      continue;
    }
    const bytes = statSync(origineel).size;
    const sha256 = sha256Bestand(origineel);
    // De ruwe JSON moet uit dit origineel gelezen zijn: anders hoort de bronvermelding niet bij de tekst.
    const ruwBron = json.bron as RuwBron;
    if (ruwBron.bytes !== bytes || ruwBron.sha256 !== sha256) {
      rapport.uitleg.push(`${naam}: de ruwe JSON ${basename(p)} is niet uit dit bestand gelezen (bytes of sha256 wijken af); lees het opnieuw.`);
      invoerFout = true;
      continue;
    }
    const regel = manifest.find((m) => m.naam === naam);
    let staat: Rapport['invoer'][number]['manifest'] = 'onbevestigd';
    if (regel && regel.bytes !== undefined && regel.sha256 !== undefined) staat = regel.bytes === bytes && regel.sha256 === sha256 ? 'bevestigd' : 'afwijkend';
    if (staat === 'afwijkend') {
      rapport.uitleg.push(`${naam}: bytes of sha256 wijken af van manifest.json.`);
      invoerFout = true;
    }
    rapport.invoer.push({ naam, ruw: basename(p), bytes, sha256, manifest: staat });
    if (isDocx) docx.push({ ruw: json as unknown as RuwDocx, bytes, sha256 });
    else {
      const vak = vakVanBlad((json as unknown as RuwXlsx).blad);
      if (!vak) {
        rapport.uitleg.push(`${naam}: het tabblad "${String(json.blad)}" is geen vakdiscipline van het GO!.`);
        invoerFout = true;
        continue;
      }
      if (xlsx.some((x) => x.vak === vak)) {
        rapport.uitleg.push(`${naam}: een tweede doelenset voor ${vak}.`);
        invoerFout = true;
        continue;
      }
      xlsx.push({ ruw: json as unknown as RuwXlsx, bytes, sha256, vak });
    }
  }
  if (invoerFout) return stop('De invoer is niet volledig of niet betrouwbaar.');
  if (docx.length === 0 && xlsx.length === 0) return stop('Geen invoer.');

  // 2. Bekende afwijkingen en de minimumdoelen.
  const bekendeJson = leesBekendeAfwijkingen(leesJson(o.bekende));
  if (bekendeJson.fouten.length > 0) {
    rapport.validatie['bekende-afwijkingen.json'] = bekendeJson.fouten;
    throw new Error('bekende-afwijkingen.json is ongeldig');
  }
  const bekende = new Bekende(bekendeJson.afwijkingen);
  const indexPad = join(o.minimumdoelen, 'index.json');
  const index = (leesJson(indexPad) as { sets: MinimumdoelenIndexSet[] }).sets;
  const setCache = new Map<string, MinimumdoelenSetBestand | undefined>();
  const laadSet = (s: MinimumdoelenIndexSet) => {
    if (!setCache.has(s.id)) {
      const p = join(o.minimumdoelen, s.bestand);
      setCache.set(s.id, existsSync(p) && /^[A-Za-z0-9_.-]+\.json$/.test(s.bestand) ? (leesJson(p) as MinimumdoelenSetBestand) : undefined);
    }
    return setCache.get(s.id);
  };
  const { tabel, meldingen } = maakOpzoektabel(index, laadSet);
  if (meldingen.length > 0) {
    rapport.validatie.minimumdoelen = meldingen;
    return stop('De minimumdoelen in public/leerplannen/minimumdoelen zijn niet volledig.');
  }

  // 3. De doelensets.
  const aantalPerVak = new Map(xlsx.map((x) => [x.vak, telDoelzinnen(x.ruw)]));
  const bestaat = (code: string) => {
    const m = /^([A-Z]{2})\.(\d{3})$/.exec(code);
    const n = m ? aantalPerVak.get(m[1] as GoVak) : undefined;
    return n !== undefined && Number(m?.[2]) >= 1 && Number(m?.[2]) <= n;
  };
  const alleAfwijkingen: Afwijking[] = [];
  const leerplannen = new Map<GoVak, GoLeerplanBestand>();
  for (const x of [...xlsx].sort((a, b) => (a.vak < b.vak ? -1 : 1))) {
    const r = zetLeerplanOm(x.ruw, {
      bekende,
      tabel,
      bestaat,
      // De naam van het origineel op de Drive ('Doelenset BaO <vak>.xlsx', zo schrijft decodeer.py het weg); heet het
      // bestand in de werkmap anders, dan de naam die het GO! gebruikt, met de vakdiscipline uit GO_VAKKEN.
      bronBestand: { naam: /^Doelenset BaO [^/\\]+\.xlsx$/.test(x.ruw.bestand) ? x.ruw.bestand : `Doelenset BaO ${GO_VAKKEN[x.vak].doelenset}.xlsx`, bytes: x.bytes, sha256: x.sha256, datum: x.ruw.gewijzigd ?? '' },
      ingelezen: o.ingelezen,
    });
    alleAfwijkingen.push(...r.afwijkingen.lijst);
    if (r.minimumdoelRijen.some((m) => m.status !== 'gevonden')) rapport.minimumdoelRijen.push({ vak: x.vak, rijen: r.minimumdoelRijen.filter((m) => m.status !== 'gevonden') });
    // De tekst van de gevonden minimumdoel-rijen naast de API: gelijk, alleen witruimte of tekens anders, of anders.
    const mt = (rapport.minimumdoelTekst ??= { vergeleken: 0, gelijk: 0, witruimteOfTekens: 0, anders: [] });
    for (const m of r.minimumdoelRijen) {
      if (m.status !== 'gevonden' || !m.set || !m.id) continue;
      const kop = index.find((s) => s.id === m.set);
      const set = kop ? laadSet(kop) : undefined;
      const doel = set ? metUitbreidingOpDoelzin(set).doelen.find((d) => d.id === m.id) : undefined;
      if (!doel) continue;
      const gewoonTekst = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\u200b\u00ad]/g, '').replace(/\s+/g, ' ').trim();
      const zonderTekens = (t: string) => gewoonTekst(t).replace(/[\s•◦*.,;:’'"…-]/g, '').replace(/^o(?=[A-Za-z])/g, '');
      const api = htmlNaarTekst(doel.tekst);
      mt.vergeleken++;
      if (gewoonTekst(api) === gewoonTekst(m.tekst)) mt.gelijk++;
      else if (zonderTekens(api).toLowerCase() === zonderTekens(m.tekst).toLowerCase()) mt.witruimteOfTekens++;
      else mt.anders.push({ vak: x.vak, rij: m.rij, moment: m.moment, code: m.nummer, doel: `${m.set}/${m.id}` });
    }
    if (!r.bestand) continue;
    leerplannen.set(x.vak, r.bestand);
    rapport.leerplannen[x.vak] = { ...r.tellingen, doelen: r.bestand.doelen.length, zonderMinimumdoel: r.bestand.doelen.filter(isZonderMinimumdoel).length };
    // Rondgang: elke niet-lege cel van een inhoudsrij komt terug.
    const alsInhoud = new Map(bekende.lijst.flatMap((a) => (a.soort === 'minimumdoelrij-is-inhoud' && a.vak === x.vak ? [[a.rij, a.als] as const] : [])));
    const genegeerd = new Set(bekende.lijst.flatMap((a) => (a.soort === 'rubriek-met-leeftijd' && a.vak === x.vak ? [a.rij] : [])));
    const rg = rondgangLeerplan(x.ruw, r.bestand, { typeVan: (rij) => alsInhoud.get(rij), leeftijdGenegeerd: (rij) => genegeerd.has(rij) });
    rapport.rondgang.leerplannen[x.vak] = rg;
    const v = valideerGoLeerplan(JSON.parse(JSON.stringify(r.bestand)));
    if (v.length > 0) rapport.validatie[`leerplan/${x.vak}.json`] = v;
    if (shaVan(leerplanShaInvoer(r.bestand)) !== r.bestand.sha256) rapport.validatie[`leerplan/${x.vak}.json`] = [...v, 'de sha256 klopt niet'];
  }

  // 4. De lesplannen, en de controles over lesplan en doelenset heen.
  const lesplannen: GoLesplanBestand[] = [];
  for (const d of [...docx].sort((a, b) => (a.ruw.bestand < b.ruw.bestand ? -1 : 1))) {
    const r = zetLesplanOm(d.ruw, { bekende, bron: { bytes: d.bytes, sha256: d.sha256, ingelezen: o.ingelezen } });
    rapport.lesplannen[d.ruw.bestand.replace(/\.docx$/, '')] = { vorm: r.extra.trainenVorm, tellingen: r.extra.tellingen, beelden: r.extra.beelden };
    if (r.bestand) {
      controleerLesplanTegenLeerplan(r.bestand, r.extra, leerplannen, bekende, r.afwijkingen);
      rapport.rondgang.lesplannen[r.bestand.code] = rondgangLesplan(d.ruw, r.bestand);
      const v = valideerGoLesplan(JSON.parse(JSON.stringify(r.bestand)));
      if (v.length > 0) rapport.validatie[`lesplannen/${r.bestand.code}.json`] = v;
      lesplannen.push(r.bestand);
    }
    alleAfwijkingen.push(...r.afwijkingen.lijst);
  }
  // Twee schrijfwijzen van dezelfde lessenlijn of lessenreeks geven in de app twee lijnen met een verschoven adres.
  alleAfwijkingen.push(...controleerLessenlijnen(lesplannen, bekende));

  // 5. Omgekeerde index en index.
  const bij = maakBijMinimumdoel([...leerplannen.values()], lesplannen);
  for (const b of bij) {
    const v = valideerGoBijMinimumdoel(JSON.parse(JSON.stringify(b)));
    if (v.length > 0) rapport.validatie[`bij-minimumdoel/${b.vak}.json`] = v;
  }
  const bestaandeIndex = existsSync(join(o.uit, 'index.json')) ? (leesJson(join(o.uit, 'index.json')) as GoIndex) : undefined;
  let gidsIndex = maakIndex([...leerplannen.values()], bij, lesplannen, bestaandeIndex?.ingelezen ?? o.ingelezen);
  if (bestaandeIndex && JSON.stringify(gidsIndex) !== JSON.stringify(bestaandeIndex)) gidsIndex = maakIndex([...leerplannen.values()], bij, lesplannen, o.ingelezen);
  const vi = valideerGoIndex(JSON.parse(JSON.stringify(gidsIndex)));
  if (vi.length > 0) rapport.validatie['index.json'] = vi;

  // 6. Tellingen van de koppeling, de twijfels en de dekking van de minimumdoelen.
  const t = (k: keyof LeerplanTellingen) => [...Object.values(rapport.leerplannen)].reduce((n, x) => n + (typeof x[k] === 'number' ? (x[k] as number) : 0), 0);
  const metTwijfel = [...leerplannen.values()].flatMap((l) => l.doelen.filter((d) => d.minimumdoelen.refs.some((r) => r.twijfel?.includes('moment-buiten-leeftijden'))).map((d) => d.code));
  const gekoppeld = new Set<string>();
  for (const l of leerplannen.values()) {
    for (const d of l.doelen) {
      for (const r of d.minimumdoelen.refs) if (r.status === 'officieel') gekoppeld.add(`${r.set}/${r.id}`);
      for (const i of d.inhoud) if ('koppeling' in i && i.koppeling) for (const r of i.koppeling.refs) if (r.status === 'officieel') gekoppeld.add(`${r.set}/${r.id}`);
    }
  }
  const alleMinimumdoelen = tabel.alle();
  const nietGenoemd = alleMinimumdoelen.filter((k) => !gekoppeld.has(`${k.set}/${k.id}`));
  const voorstellen = [...leerplannen.values()].flatMap((l) => l.doelen.flatMap((d) => d.minimumdoelen.refs.filter((r) => r.status === 'voorstel').map((r) => `${d.code} ${r.moment} "${r.bronCode}" → ${r.code} (${r.set}/${r.id})`)));
  rapport.koppeling = {
    doelzinCodes: t('doelzinCodes'),
    doelzinOfficieel: t('doelzinOfficieel'),
    doelzinVoorstel: t('doelzinVoorstel'),
    doelzinProblemen: t('doelzinProblemen'),
    voorstellen,
    inhoudCodes: t('inhoudCodes'),
    inhoudOfficieel: t('inhoudOfficieel'),
    inhoudProblemen: t('inhoudProblemen'),
    twijfelMomentBuitenLeeftijden: { verwijzingen: t('twijfelLeeftijd'), doelen: metTwijfel.length, uitleg: 'officieel, maar het moment past niet bij de leeftijden van het doel (regel momentPastBijLeeftijden, WERKT_NAAR): gemeld, niet verbeterd' },
    twijfelAnderVak: t('twijfelAnderVak'),
    leerplandoelen: [...leerplannen.values()].reduce((n, l) => n + l.doelen.length, 0),
    zonderMinimumdoel: [...leerplannen.values()].reduce((n, l) => n + l.doelen.filter(isZonderMinimumdoel).length, 0),
    minimumdoelenGewoon: alleMinimumdoelen.length,
    minimumdoelenGenoemd: alleMinimumdoelen.length - nietGenoemd.length,
    minimumdoelenNietGenoemd: nietGenoemd.map((k) => `${k.set}/${k.id} ${k.code}`),
    begrippenZonderLeeftijd: t('begrippenZonderLeeftijd'),
    witruimteCellen: Object.fromEntries(Object.entries(rapport.leerplannen).map(([v, x]) => [v, x.witruimteCellen])),
  };

  // 7. Tweelingen in het buitengewoon onderwijs: hetzelfde nummer en dezelfde code.
  for (const l of leerplannen.values()) for (const d of l.doelen) rapport.tweelingen.push(...controleerTweelingen(d.minimumdoelen.refs.filter((r) => r.status === 'officieel'), tabel));

  // 8. Afwijkingen.
  rapport.afwijkingen.nieuw = alleAfwijkingen.filter((a) => !a.bekend);
  rapport.afwijkingen.bekend = alleAfwijkingen.filter((a) => a.bekend);
  rapport.afwijkingen.verouderd = bekende.ongebruikt();

  // 9. Wijzigingen tegenover wat er al in --uit staat (src/lib/basis/go/wijzigingen.ts): elke wijziging aan iets dat
  // al bestaat stopt, tenzij --aanvaard-wijzigingen; een verdwenen doelenset stopt altijd.
  rapport.wijzigingen.push(...wijzigingenDoelensets(bestaandeIndex, [...leerplannen.keys()]));
  for (const l of leerplannen.values()) {
    const p = join(o.uit, 'leerplan', `${l.vak}.json`);
    if (existsSync(p)) rapport.wijzigingen.push(...wijzigingenLeerplan(leesJson(p) as GoLeerplanBestand, l, lesplannen));
    else if (bestaandeIndex?.leerplan?.some((x) => x.vak === l.vak)) rapport.wijzigingen.push({ soort: 'andere doelenset', wat: `${l.vak}: de vorige index noemt het, maar het bestand in --uit ontbreekt`, stopt: true });
  }
  const oudLesplan = (code: string) => {
    const p = join(o.uit, 'lesplannen', `${code}.json`);
    return existsSync(p) ? (leesJson(p) as GoLesplanBestand) : undefined;
  };
  rapport.wijzigingen.push(...wijzigingenLesplannen(bestaandeIndex, oudLesplan, lesplannen));
  const wijzigingStopt = rapport.wijzigingen.some((w) => w.stopt);
  const wijzigingStoptAltijd = rapport.wijzigingen.filter((w) => w.altijd);

  // 10. Beelden die getoond worden. Een png met de sha1 van het origineel als naam moet byte-gelijk zijn aan dat origineel;
  // elk ander beeld (de WebP van de mindmap) moet de sha256 van zijn regel in bekende-afwijkingen.json hebben. Het beeld
  // komt uit <werkmap>/beelden, of anders uit --uit als het daar al met de juiste inhoud staat.
  const getoond = new Set<string>();
  const getoondIn = (lp: GoLesplanBestand) => {
    const uit = new Set<string>();
    const zoek = (blokken: GoLesplanBestand['delen'][number]['blokken']) => {
      for (const b of blokken) {
        if (b.soort === 'beeld' && b.status === 'getoond') uit.add(b.bestand);
        if (b.soort === 'tabel') for (const rij of b.rijen) for (const c of rij) zoek(c.blokken as typeof blokken);
      }
    };
    for (const d of lp.delen ?? []) zoek(d.blokken);
    return uit;
  };
  for (const lp of lesplannen) for (const b of getoondIn(lp)) getoond.add(b);
  const beelden = new Map<string, string>();
  const ontbrekendeBeelden: string[] = [];
  for (const bestand of [...getoond].sort()) {
    const png = /^beelden\/([0-9a-f]{40})\.png$/.exec(bestand);
    const regel = bekende.lijst.find((a): a is Extract<typeof a, { soort: 'lesplan-beeld' }> => a.soort === 'lesplan-beeld' && a.bestand === bestand);
    if (!png && !regel?.sha256) {
      ontbrekendeBeelden.push(`${bestand} (geen sha256 in bekende-afwijkingen.json)`);
      continue;
    }
    const klopt = (pad: string) => (png ? createHash('sha1').update(readFileSync(pad)).digest('hex') === png[1] : sha256Bestand(pad) === regel?.sha256);
    const inWerkmap = join(o.werkmap, bestand);
    const inUit = join(o.uit, bestand);
    if (existsSync(inWerkmap)) {
      if (klopt(inWerkmap)) beelden.set(bestand, inWerkmap);
      else ontbrekendeBeelden.push(`${bestand} (${png ? 'sha1 wijkt af van het origineel' : 'sha256 wijkt af van bekende-afwijkingen.json'})`);
    } else if (existsSync(inUit) && klopt(inUit)) {
      beelden.set(bestand, inUit);
    } else {
      ontbrekendeBeelden.push(`${bestand} (niet in de werkmap${existsSync(inUit) ? ', en in --uit met een andere inhoud' : ''})`);
    }
  }

  // De bestanden die geschreven worden, en wat er in --uit staat zonder dat de nieuwe index het noemt (een wees).
  const doelen: { pad: string; object: Record<string, unknown> }[] = [
    { pad: 'index.json', object: gidsIndex as unknown as Record<string, unknown> },
    ...[...leerplannen.values()].map((l) => ({ pad: `leerplan/${l.vak}.json`, object: l as unknown as Record<string, unknown> })),
    ...bij.map((b: GoBijMinimumdoelBestand) => ({ pad: `bij-minimumdoel/${b.vak}.json`, object: b as unknown as Record<string, unknown> })),
    ...lesplannen.map((l) => ({ pad: `lesplannen/${l.code}.json`, object: l as unknown as Record<string, unknown> })),
  ];
  const verwacht = new Set([...doelen.map((d) => d.pad), ...getoond]);
  // Alleen een lesplan dat als 'verdwenen lesplan' gemeld is (en dus aanvaard moet worden), en de beelden die alleen dat
  // lesplan toonde, mogen weg; elke andere wees stopt de import.
  const verdwenenLesplannen = new Set(rapport.wijzigingen.flatMap((w) => (w.soort === 'verdwenen lesplan' && w.lesplan ? [w.lesplan] : [])));
  const mag = new Set<string>();
  for (const code of verdwenenLesplannen) {
    mag.add(`lesplannen/${code}.json`);
    const vorig = oudLesplan(code);
    if (vorig) for (const b of getoondIn(vorig)) if (!getoond.has(b)) mag.add(b);
  }
  const teVerwijderen: string[] = [];
  const wezen: string[] = [];
  for (const map of ['leerplan', 'bij-minimumdoel', 'lesplannen', 'beelden']) {
    for (const pad of alleBestanden(join(o.uit, map))) {
      const rel = relative(o.uit, pad).split(sep).join('/');
      if (verwacht.has(rel)) continue;
      if (mag.has(rel)) teVerwijderen.push(rel);
      else wezen.push(rel);
    }
  }

  // 11. Beslissen.
  const redenen: string[] = [];
  if (rapport.afwijkingen.nieuw.length > 0) redenen.push(`${rapport.afwijkingen.nieuw.length} nieuwe afwijkingen (niet in bekende-afwijkingen.json)`);
  if (Object.keys(rapport.validatie).length > 0) redenen.push(`de validator meldt fouten in ${Object.keys(rapport.validatie).join(', ')}`);
  const rgLes = Object.entries(rapport.rondgang.lesplannen).filter(([, r]) => !r.gelijk).map(([k]) => k);
  const rgLeer = Object.entries(rapport.rondgang.leerplannen).filter(([, r]) => !r.gelijk).map(([k]) => k);
  if (rgLes.length > 0 || rgLeer.length > 0) redenen.push(`de rondgang is niet gelijk voor ${[...rgLes, ...rgLeer].join(', ')}`);
  if (lesplannen.length !== docx.length) redenen.push(`${docx.length - lesplannen.length} lesplannen konden niet omgezet worden`);
  if (leerplannen.size !== xlsx.length) redenen.push(`${xlsx.length - leerplannen.size} doelensets konden niet omgezet worden`);
  if (rapport.tweelingen.length > 0) redenen.push(`${rapport.tweelingen.length} koppelingen zonder gelijke tweeling in het buitengewoon onderwijs`);
  if (ontbrekendeBeelden.length > 0) redenen.push(`getoonde beelden ontbreken of kloppen niet: ${ontbrekendeBeelden.join(', ')}`);
  if (wezen.length > 0) redenen.push(`bestanden in --uit die de nieuwe index niet noemt: ${wezen.join(', ')} (een ontbrekende doelenset of een oud bestand; dit stopt ook met --aanvaard-wijzigingen)`);
  if (wijzigingStoptAltijd.length > 0) redenen.push(`${wijzigingStoptAltijd.map((w) => w.wat).join('; ')}: dit stopt altijd, ook met --aanvaard-wijzigingen`);
  if (wijzigingStopt && !o.aanvaard) redenen.push('bestaande codes, rubrieken of lesplannen zijn veranderd of verdwenen (zie de regels WIJZIGING): geef --aanvaard-wijzigingen mee als dat bewust is');
  if (redenen.length > 0) {
    for (const r of redenen) rapport.uitleg.push(r);
    return 3;
  }

  // 12. Schrijven: alleen wat veranderd is. Een bestand dat op de datum van inlezen na gelijk is aan wat er al staat,
  // blijft onaangeroerd (met zijn oude datum): zo verandert er niets zolang de bron niet verandert.
  for (const d of doelen) {
    const p = join(o.uit, d.pad);
    const inhoud = schrijfJsonTekst(d.object);
    if (existsSync(p)) {
      const tekst = readFileSync(p, 'utf8');
      let oudeDatum: unknown;
      try {
        const oud = JSON.parse(tekst) as { bron?: { ingelezen?: unknown } };
        oudeDatum = oud.bron?.ingelezen;
      } catch {
        oudeDatum = undefined;
      }
      const bron = d.object.bron as Record<string, unknown> | undefined;
      const vergelijk = bron && typeof oudeDatum === 'string' ? schrijfJsonTekst({ ...d.object, bron: { ...bron, ingelezen: oudeDatum } }) : inhoud;
      if (tekst === vergelijk) {
        rapport.bestanden.ongewijzigd.push(d.pad);
        continue;
      }
    }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(`${p}.tmp`, inhoud);
    renameSync(`${p}.tmp`, p);
    rapport.bestanden.geschreven.push(d.pad);
  }
  for (const [bestand, bron] of beelden) {
    const p = join(o.uit, bestand);
    if (existsSync(p) && sha256Bestand(p) === sha256Bestand(bron)) {
      rapport.bestanden.ongewijzigd.push(bestand);
      continue;
    }
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(bron, p);
    rapport.bestanden.geschreven.push(bestand);
  }
  for (const rel of teVerwijderen) {
    unlinkSync(join(o.uit, rel));
    rapport.bestanden.verwijderd.push(rel);
  }
  return 0;
}

function samenvatting(r: Rapport): string[] {
  const k = r.koppeling ?? {};
  const uit = [
    `Invoer: ${r.invoer.length} bestanden (${r.invoer.filter((x) => x.manifest === 'bevestigd').length} bevestigd tegen manifest.json, ${r.invoer.filter((x) => x.manifest === 'onbevestigd').length} onbevestigd).`,
  ];
  if (r.koppeling) {
    uit.push(
      `Koppeling op doelzin-rijen: ${String(k.doelzinOfficieel)} van ${String(k.doelzinCodes)} vinden precies één doel; ${String(k.doelzinVoorstel)} voorstel (${(k.voorstellen as string[]).join('; ')}); ${String(k.doelzinProblemen)} problemen.`,
      `Koppeling op MIA- en voorbeeldrijen: ${String(k.inhoudOfficieel)} van ${String(k.inhoudCodes)}.`,
      `Twijfel 'moment buiten de leeftijden': ${String((k.twijfelMomentBuitenLeeftijden as { verwijzingen: number }).verwijzingen)} verwijzingen bij ${String((k.twijfelMomentBuitenLeeftijden as { doelen: number }).doelen)} doelen (gemeld, niet verbeterd). Twijfel 'ander vak': ${String(k.twijfelAnderVak)}.`,
      `Leerplandoelen: ${String(k.leerplandoelen)}, zonder minimumdoel ${String(k.zonderMinimumdoel)}. Minimumdoelen van het gewoon basisonderwijs genoemd: ${String(k.minimumdoelenGenoemd)} van ${String(k.minimumdoelenGewoon)}.`,
    );
  }
  const les = Object.values(r.rondgang.lesplannen);
  const leer = Object.values(r.rondgang.leerplannen);
  uit.push(`Rondgang: lesplannen ${les.filter((x) => x.gelijk).length} van ${les.length} gelijk; doelensets ${leer.filter((x) => x.gelijk).length} van ${leer.length} gelijk.`);
  uit.push(`Afwijkingen: ${r.afwijkingen.nieuw.length} nieuw, ${r.afwijkingen.bekend.length} bekend, ${r.afwijkingen.verouderd.length} verouderde regels in bekende-afwijkingen.json.`);
  if (r.wijzigingen.length > 0) uit.push(`Wijzigingen tegenover --uit: ${r.wijzigingen.length} (${tellingWijzigingen(r.wijzigingen)}).`);
  uit.push(`Bestanden: ${r.bestanden.geschreven.length} geschreven, ${r.bestanden.ongewijzigd.length} ongewijzigd${r.bestanden.verwijderd.length > 0 ? `, ${r.bestanden.verwijderd.length} verwijderd (${r.bestanden.verwijderd.join(', ')})` : ''}.`);
  return uit;
}

function hoofd(argv: string[]): number {
  let o: Opties;
  try {
    o = leesOpties(argv);
  } catch (e) {
    console.error(`FOUT: ${e instanceof Error ? e.message : String(e)}`);
    console.error('Gebruik: npx vite-node tools/basis/go/maak.ts --werkmap <map> --uit <map> [--aanvaard-wijzigingen] [--ingelezen JJJJ-MM-DD]');
    return 1;
  }
  if (binnenRepo(o.werkmap)) {
    console.error(`FOUT: de werkmap ${o.werkmap} ligt binnen een git-repository; gebruik een map buiten de repo (bv. in de scratchpad).`);
    return 1;
  }
  const uitEcht = resolve(o.uit) === ECHT_UIT || (existsSync(o.uit) && realpathSync(o.uit) === ECHT_UIT);
  if (binnenRepo(o.uit) && !uitEcht) {
    console.error(`FOUT: --uit ${o.uit} ligt binnen een git-repository, maar is niet ${ECHT_UIT}.`);
    return 1;
  }
  if (!existsSync(o.werkmap) || !statSync(o.werkmap).isDirectory()) {
    console.error(`FOUT: de werkmap ${o.werkmap} bestaat niet.`);
    return 1;
  }
  const rapport = nieuwRapport(o);
  let code: number;
  try {
    code = maak(o, rapport);
    rapport.uitkomst = code === 0 ? 'geschreven' : 'gestopt';
  } catch (e) {
    rapport.uitkomst = 'fout';
    rapport.uitleg.push(e instanceof Error ? e.message : String(e));
    code = 1;
  }
  try {
    schrijfRapport(o.werkmap, rapport);
  } catch (e) {
    console.error(`FOUT: het rapport kon niet geschreven worden (${e instanceof Error ? e.message : String(e)}).`);
    return 1;
  }
  for (const regel of samenvatting(rapport)) console.log(regel);
  for (const regel of rapport.uitleg) console.log(`${code === 0 ? '' : 'GESTOPT: '}${regel}`);
  for (const regel of schermWijzigingen(rapport.wijzigingen)) console.log(regel);
  for (const regel of schermAfwijkingen(rapport.afwijkingen.nieuw)) console.log(regel);
  for (const [k, v] of Object.entries(rapport.validatie)) console.log(`  VALIDATIE ${k}: ${v.slice(0, 3).join(' | ')}${v.length > 3 ? ` … (${v.length})` : ''}`);
  console.log(`Rapport: ${join(o.werkmap, 'rapport.json')}`);
  console.log(`Uitgangscode ${code}.`);
  return code;
}

process.exitCode = hoofd(process.argv.slice(2));
