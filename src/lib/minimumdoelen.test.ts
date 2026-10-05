import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  canoniek,
  geldigheidVanDoelen,
  htmlNaarTekst,
  meerwaardigeVelden,
  normaliseerRecord,
  redenOnbruikbaar,
  setSleutelVan,
  setVan,
  tekstVan,
  typeInventaris,
  valideerSetBestand,
  veldInventaris,
  vergelijkCodes,
  type MinimumdoelenIndex,
  type MinimumdoelenSetBestand,
} from './minimumdoelen';

// Elke integratietest start Node als apart proces; op een trage machine heeft 5 seconden niet altijd genoeg.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'leerplannen', 'haal-minimumdoelen.mjs');
const DATA_MAP = join(ROOT, 'public', 'leerplannen', 'minimumdoelen');

// ── Hulpfuncties ────────────────────────────────────────────────────────────

function sha256Van(doelen: unknown): string {
  return createHash('sha256').update(canoniek(doelen), 'utf8').digest('hex');
}

function leesJson<T>(pad: string): T {
  return JSON.parse(readFileSync(pad, 'utf8')) as T;
}

/** Controleert één set uit de index tegen zijn bestand. Geeft een lijst fouten (leeg = in orde). */
function controleerSet(map: string, ingang: MinimumdoelenIndex['sets'][number]): string[] {
  const fouten: string[] = [];
  const pad = join(map, ingang.bestand);
  if (!existsSync(pad)) return [`${ingang.id}: het bestand ${ingang.bestand} bestaat niet.`];
  const bestand = leesJson<MinimumdoelenSetBestand>(pad);
  for (const f of valideerSetBestand(bestand)) fouten.push(`${ingang.id}: ${f}`);
  if (Array.isArray(bestand.doelen) && bestand.set?.sha256 !== sha256Van(bestand.doelen)) {
    fouten.push(`${ingang.id}: sha256 komt niet overeen met de doelen.`);
  }
  if (ingang.bestand !== `${ingang.id}.json`) fouten.push(`${ingang.id}: bestandsnaam ${ingang.bestand} past niet bij het id.`);
  for (const veld of ['id', 'naam', 'korteNaam', 'versie', 'geldigheid', 'geldigVan', 'geldigTot', 'graad', 'stroom', 'leerjaar', 'aantal', 'sha256', 'opgehaald'] as const) {
    if (bestand.set?.[veld] !== ingang[veld]) fouten.push(`${ingang.id}: "${veld}" in de index wijkt af van de kop van het bestand.`);
  }
  return fouten;
}

/** Controleert de index zelf en of er setbestanden in de map staan die de index niet kent. */
function controleerIndex(map: string): string[] {
  const index = leesJson<MinimumdoelenIndex>(join(map, 'index.json'));
  const fouten: string[] = [];
  if (index.app !== 'boosterz' || index.kind !== 'minimumdoelen-index' || index.v !== 1) fouten.push('index: kop klopt niet.');
  if (!index.naamsvermelding) fouten.push('index: naamsvermelding ontbreekt.');
  if (new Set(index.sets.map((s) => s.id)).size !== index.sets.length) fouten.push('index: een id komt meer dan één keer voor.');
  const inIndex = new Set(index.sets.map((s) => s.bestand));
  for (const f of readdirSync(map)) {
    if (!f.endsWith('.json') || f === 'index.json' || inIndex.has(f)) continue;
    const json = leesJson<{ kind?: string }>(join(map, f));
    if (json.kind === 'minimumdoelen') fouten.push(`${f} staat niet in de index.`);
  }
  return fouten;
}

/** Controleert een hele map: de index en elk setbestand. */
function controleerMap(map: string): string[] {
  const index = leesJson<MinimumdoelenIndex>(join(map, 'index.json'));
  return [...controleerIndex(map), ...index.sets.flatMap((ingang) => controleerSet(map, ingang))];
}

type Uitkomst = { status: number; stdout: string; stderr: string };

/** Omgeving voor het script: zonder sleutel en basis-URL van de ontwikkelaar, met `extra` erbovenop. */
function maakEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ONDERWIJSDOELEN_WACHT_FACTOR: '0' };
  delete env.ONDERWIJSDOELEN_API_KEY;
  delete env.ONDERWIJSDOELEN_API_BASE;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function eisRapport(args: string[]) {
  // Zonder --rapport of --uit schrijft het script in de repo zelf (tools/leerplannen/rapport/ en
  // public/leerplannen/): een test mag dat nooit doen.
  for (const optie of ['--rapport', '--uit']) {
    if (!args.includes(optie)) throw new Error(`Geef in een test altijd ${optie} mee.`);
  }
}

function draai(args: string[], extra: Record<string, string | undefined> = {}): Uitkomst {
  eisRapport(args);
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: maakEnv(extra),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const f = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: f.status ?? 1, stdout: f.stdout ?? '', stderr: f.stderr ?? '' };
  }
}

/** Asynchroon, zodat een http-server in dit proces ondertussen kan antwoorden. */
function draaiAsync(args: string[], extra: Record<string, string | undefined> = {}): Promise<Uitkomst> {
  eisRapport(args);
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: maakEnv(extra), encoding: 'utf8' }, (fout, stdout, stderr) => {
      resolve({ status: fout ? (typeof fout.code === 'number' ? fout.code : 1) : 0, stdout, stderr });
    });
  });
}

// ── Nagebootst API-antwoord ─────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const SET_SO = {
  id: 'so_1ste_graad_v2_1',
  onderwijsdoelenset: 'Secundair onderwijs, eerste graad',
  onderwijsstructuur: { graad: 'Eerste graad', stroom: 'A-stroom', leerjaar: { naam: 'Eerste leerjaar' } },
  vlaamse_sleutelcompetentie: { nr: 1, naam: 'Competenties in verband met Nederlands', korte_naam: 'Nederlands' },
};
const SET_SO2 = {
  onderwijsdoelenset: 'Secundair onderwijs, tweede graad',
  onderwijsstructuur: { graad: 'Tweede graad' },
  vlaamse_sleutelcompetentie: { nr: '2', naam: 'Competenties in verband met Engels' },
};
const SET_LO = {
  onderwijsdoelenset: 'Lager onderwijs',
  onderwijsstructuur: { graad: 'Lagere school' },
};

function rec(code: string | undefined, omschrijving: string, set: Rec, rest: Rec = {}): Rec {
  const r: Rec = { omschrijving, onderwijsdoel_type: 'Minimumdoel', onderwijsdoelenset: set, ...rest };
  if (code !== undefined) r.code = code;
  return r;
}

const PAGINA_1: Rec[] = [
  rec('1.10', '  Tweede doel  met   dubbele spaties.  ', SET_SO),
  rec('1.2', 'Eerste doel', SET_SO, { toelichting: ' Een toelichting ', '@id': '/doel/1', id: 7, volgorde: 3 }),
  // na het normaliseren volledig identiek aan het vorige record: enkel het id verschilt (dat telt niet mee)
  rec('1.2', 'Eerste doel', SET_SO, { toelichting: ' Een toelichting ', '@id': '/doel/1', id: 8, volgorde: 3 }),
];
const PAGINA_2: Rec[] = [
  rec(undefined, 'Een doel zonder code', SET_LO), // overgeslagen, maar in een niet-gekozen set
  rec('A.1', 'Lager doel', SET_LO),
  rec('A.2', 'Ander lager doel', SET_LO),
];
const antwoord = (member: Rec[], totalItems: number) => ({ gegevens: { member, totalItems } });
const TWEE_PAGINAS = [antwoord(PAGINA_1, 6), antwoord(PAGINA_2, 6)];

const SO_ID = 'SO_1STE_GRAAD_V2_1';

/** Zoals de echte API: een lange setnaam, een numeriek set-id, korte naam en versie. */
const LANGE_NAAM = 'Secundair onderwijs - 2de graad - A-stroom - Doorstroomfinaliteit - Basisvorming - Sleutelcompetenties - Opleidingsvorm 4';
const SET_API_A = {
  onderwijsdoelenset: LANGE_NAAM,
  onderwijsdoelenset_id: 1234,
  korte_naam: 'SO 2de graad A',
  versie: '2.0',
  onderwijsstructuur: { onderwijsniveau: 'Secundair onderwijs', graad: 'Tweede graad' },
};
const SET_API_B = { ...SET_API_A, onderwijsdoelenset_id: 1235, versie: 3 };

// ── Eenheidstests ───────────────────────────────────────────────────────────

describe('tekstVan', () => {
  it('trimt een string en geeft undefined voor lege tekst', () => {
    expect(tekstVan('  hallo  ')).toBe('hallo');
    expect(tekstVan('   ')).toBeUndefined();
    expect(tekstVan('')).toBeUndefined();
  });

  it('zet een getal om naar tekst', () => {
    expect(tekstVan(5)).toBe('5');
    expect(tekstVan(0)).toBe('0');
    expect(tekstVan(Number.NaN)).toBeUndefined();
  });

  it('leest een object: naam, dan omschrijving, code, label en waarde', () => {
    expect(tekstVan({ naam: 'N', omschrijving: 'O' })).toBe('N');
    expect(tekstVan({ naam: ' ', omschrijving: 'O' })).toBe('O');
    expect(tekstVan({ code: 'C' })).toBe('C');
    expect(tekstVan({ label: 'L' })).toBe('L');
    expect(tekstVan({ waarde: 3 })).toBe('3');
    expect(tekstVan({ naam: { naam: 'diep' } })).toBe('diep');
    expect(tekstVan({ iets: 'anders' })).toBeUndefined();
  });

  it('geeft undefined voor al het andere', () => {
    for (const v of [null, undefined, true, [], ['x'], () => 1]) expect(tekstVan(v)).toBeUndefined();
  });
});

describe('normaliseerRecord', () => {
  it('leest een record in de vorm van de API', () => {
    const n = normaliseerRecord(rec('1.2', 'Eerste doel', SET_SO));
    expect(n).toEqual({
      setSleutel: 'SO_1STE_GRAAD_V2_1',
      setNaam: 'Secundair onderwijs, eerste graad',
      structuur: { graad: 'Eerste graad', stroom: 'A-stroom', leerjaar: 'Eerste leerjaar' },
      setInfo: {},
      doel: {
        code: '1.2',
        tekst: 'Eerste doel',
        type: 'Minimumdoel',
        sleutelcompetentie: { nr: '1', naam: 'Competenties in verband met Nederlands' },
        graad: 'Eerste graad',
        stroom: 'A-stroom',
        leerjaar: 'Eerste leerjaar',
      },
    });
  });

  it('begrijpt objecten in plaats van strings', () => {
    const n = normaliseerRecord({
      code: { code: '1.1', naam: 'niet de code' },
      omschrijving: { omschrijving: 'Tekst', naam: 'Titel' },
      onderwijsdoel_type: { naam: 'Minimumdoel' },
      onderwijsdoelenset: {
        onderwijsdoelenset: { naam: 'Set A' },
        onderwijsstructuur: { graad: { naam: 'Eerste graad' }, stroom: { code: 'A' }, leerjaar: 1 },
        vlaamse_sleutelcompetentie: { nr: 2, naam: { naam: 'Digitale competentie' } },
      },
    });
    expect(n?.doel).toEqual({
      code: '1.1',
      tekst: 'Tekst',
      type: 'Minimumdoel',
      sleutelcompetentie: { nr: '2', naam: 'Digitale competentie' },
      graad: 'Eerste graad',
      stroom: 'A',
      leerjaar: '1',
    });
    expect(n?.setNaam).toBe('Set A');
    expect(n?.setSleutel).toBe('SET_A');
  });

  it('geeft null zonder code of omschrijving', () => {
    expect(normaliseerRecord({ omschrijving: 'Tekst' })).toBeNull();
    expect(normaliseerRecord({ code: '1.1' })).toBeNull();
    expect(normaliseerRecord({ code: '   ', omschrijving: 'Tekst' })).toBeNull();
    expect(normaliseerRecord({ code: '1.1', omschrijving: '' })).toBeNull();
    expect(normaliseerRecord(null)).toBeNull();
    expect(normaliseerRecord('tekst')).toBeNull();
    expect(normaliseerRecord([])).toBeNull();
  });

  it('houdt de tekst letterlijk: enkel begin en einde worden getrimd', () => {
    const tekst = 'De leerlingen   kunnen\tmet  dubbele spaties,\nnieuwe regels en  “aanhalingstekens” werken.';
    const n = normaliseerRecord(rec('1', `\n  ${tekst}  \n`, SET_SO));
    expect(n?.doel.tekst).toBe(tekst);
  });

  it('bewaart alle andere velden in extra, van elk type', () => {
    const titels = { hoofdrubriek: 'Ruimte', rubriek: null };
    const n = normaliseerRecord({
      ...rec('1', 'Tekst', SET_SO),
      toelichting: ' iets ',
      bron_url: 'x',
      '@type': 'Onderwijsdoel',
      _links: 'verborgen',
      id: 'abc',
      volgorde: 3,
      attitude: 0,
      optioneel: false,
      titels,
      geldigheid: { begin: '2021-09-01' },
      onderliggende_elementen: ['a', 'b'],
      lang: 'x'.repeat(5000),
      leeg: '   ',
      niets: null,
      oneindig: Number.POSITIVE_INFINITY,
    });
    expect(n?.doel.extra).toEqual({
      attitude: 0,
      bron_url: 'x',
      geldigheid: { begin: '2021-09-01' },
      lang: 'x'.repeat(5000),
      onderliggende_elementen: ['a', 'b'],
      optioneel: false,
      titels,
      toelichting: 'iets',
      volgorde: 3,
    });
    expect(Object.keys(n?.doel.extra ?? {})).toEqual(Object.keys(n?.doel.extra ?? {}).sort());
    expect(normaliseerRecord(rec('1', 'Tekst', SET_SO))?.doel).not.toHaveProperty('extra');
  });

  it('neemt het vaste nummer van het doel (@id) mee als id', () => {
    expect(normaliseerRecord(rec('1', 'Tekst', SET_SO, { '@id': 4567 }))?.doel.id).toBe('4567');
    expect(normaliseerRecord(rec('1', 'Tekst', SET_SO, { '@id': ' /doel/1 ' }))?.doel.id).toBe('/doel/1');
    for (const v of [undefined, null, '  ', Number.NaN, { a: 1 }]) {
      expect(normaliseerRecord(rec('1', 'Tekst', SET_SO, { '@id': v }))?.doel).not.toHaveProperty('id');
    }
  });

  it('leest een record in de echte vorm van de API: set-id, korte naam en versie', () => {
    const n = normaliseerRecord(rec('6.37', '<p>Tekst</p>', SET_API_A, { '@id': 91, '@type': 'Onderwijsdoel', optioneel: false }));
    expect(n?.setSleutel).toBe('ODS_1234');
    expect(n?.setNaam).toBe(LANGE_NAAM);
    expect(n?.setInfo).toEqual({ apiId: '1234', korteNaam: 'SO 2de graad A', versie: '2.0' });
    expect(n?.doel).toMatchObject({ id: '91', code: '6.37', tekst: '<p>Tekst</p>', graad: 'Tweede graad', extra: { optioneel: false } });
  });

  it('is tolerant voor ontbrekende set, structuur en competentie', () => {
    const n = normaliseerRecord({ code: '1', omschrijving: 'Tekst' });
    expect(n?.setSleutel).toBe('ONBEKEND');
    expect(n?.structuur).toEqual({});
    expect(n?.doel).toEqual({ code: '1', tekst: 'Tekst' });
    const alleenNaam = normaliseerRecord({ code: '1', omschrijving: 'Tekst', onderwijsdoelenset: 'Secundair onderwijs' });
    expect(alleenNaam?.setSleutel).toBe('SECUNDAIR_ONDERWIJS');
    expect(alleenNaam?.setNaam).toBe('Secundair onderwijs');
  });
});

describe('geldigheidVanDoelen', () => {
  const doel = (geldigheid: unknown) => ({ code: '1', tekst: 't', extra: { geldigheid } });
  it('neemt het meest voorkomende type, de vroegste begin- en de laatste einddatum', () => {
    expect(
      geldigheidVanDoelen([
        doel({ type: 'Niet meer geldig', geldig_van_dt: '2019-09-01T00:00:00Z', geldig_tot_dt: '2025-08-31T00:00:00Z' }),
        doel({ type: 'Niet meer geldig', geldig_van_dt: '2018-09-01T00:00:00Z', geldig_tot_dt: '2024-08-31T00:00:00Z' }),
        doel({ type: 'Geldig', geldig_van_dt: '2025-09-01T00:00:00Z', geldig_tot_dt: '2030-08-31T00:00:00Z' }),
      ]),
    ).toEqual({ geldigheid: 'Niet meer geldig', geldigVan: '2018-09-01', geldigTot: '2030-08-31' });
  });

  it('geeft geen einddatum als een doel er geen heeft, en is leeg zonder gegevens', () => {
    expect(geldigheidVanDoelen([doel({ type: 'Geldig', geldig_van_dt: '2024-09-01T00:00:00Z' }), doel({ type: 'Geldig', geldig_tot_dt: '2030-08-31' })]))
      .toEqual({ geldigheid: 'Geldig', geldigVan: '2024-09-01' });
    expect(geldigheidVanDoelen([])).toEqual({});
    expect(geldigheidVanDoelen([{ code: '1', tekst: 't' }, doel('raar'), doel({ type: 3, geldig_van_dt: 'gisteren' })])).toEqual({});
    // gelijkstand: alfabetisch
    expect(geldigheidVanDoelen([doel({ type: 'Onbekend' }), doel({ type: 'Geldig' })]).geldigheid).toBe('Geldig');
  });
});

describe('htmlNaarTekst', () => {
  it('maakt van alinea\'s, regeleinden en lijsten gewone regels', () => {
    expect(htmlNaarTekst('<p>De leerlingen situeren&nbsp;plaatsen.&nbsp;</p>')).toBe('De leerlingen situeren plaatsen.');
    expect(htmlNaarTekst('<p>Inleiding:</p><ul><li>een</li><li>twee<br/>regel</li></ul>')).toBe('Inleiding:\n\u2022 een\n\u2022 twee\nregel');
    expect(htmlNaarTekst('Zonder <strong>opmaak</strong> en <em>nadruk</em>')).toBe('Zonder opmaak en nadruk');
  });

  it('zet entiteiten om en laat onbekende staan', () => {
    expect(htmlNaarTekst('caf&eacute; &amp; &#233;&#xE9; &rsquo;s &lt;b&gt; &onbekend; &#0;')).toBe('café & éé \u2019s <b> &onbekend; &#0;');
    expect(htmlNaarTekst('af&shy;breek')).toBe('afbreek');
    // gewone tekst uit de API met Windows-regeleinden en lege regels
    expect(htmlNaarTekst('op het oog: \r\n-veilig vallen; \r\n\r\n-evenwicht')).toBe('op het oog:\n-veilig vallen;\n-evenwicht');
  });

  it('geeft tekst, geen HTML: een omgezette tag wordt nooit opnieuw een tag', () => {
    expect(htmlNaarTekst('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>');
    expect(htmlNaarTekst('<script>alert(1)</script>tekst')).toBe('alert(1)tekst');
  });
});

describe('setSleutelVan', () => {
  it('geeft ODS_ en het set-id van de API voorrang, ook boven id en naam', () => {
    expect(setSleutelVan({ onderwijsdoelenset_id: 1234, id: 'X' }, 'Naam')).toBe('ODS_1234');
    expect(setSleutelVan({ onderwijsdoelenset_id: ' 0042 ' }, 'Naam')).toBe('ODS_0042');
    expect(setSleutelVan({ onderwijsdoelenset_id: 0 }, 'Naam')).toBe('ODS_0');
    for (const ongeldig of [-1, 1.5, Number.NaN, 2 ** 60, '12a', '', null, { nr: 1 }]) {
      expect(setSleutelVan({ onderwijsdoelenset_id: ongeldig }, 'Naam')).toBe('NAAM');
    }
  });

  it('neemt het id, de code of de sleutel van het set-object, in hoofdletters', () => {
    expect(setSleutelVan({ id: 'so_1ste_graad_v2_1' }, 'iets anders')).toBe('SO_1STE_GRAAD_V2_1');
    expect(setSleutelVan({ code: 'a1' }, 'iets anders')).toBe('A1');
    expect(setSleutelVan({ sleutel: 'K_2' }, undefined)).toBe('K_2');
  });

  it('maakt anders een slug van de naam', () => {
    expect(setSleutelVan({}, 'Secundair onderwijs – 1ste graad (A-stroom)')).toBe('SECUNDAIR_ONDERWIJS_1STE_GRAAD_A_STROOM');
    expect(setSleutelVan({ id: 'met spaties' }, 'Naam')).toBe('NAAM');
    expect(setSleutelVan({ id: 12 }, 'Naam')).toBe('NAAM');
    expect(setSleutelVan(undefined, '  --Eerste__  graad--  ')).toBe('EERSTE_GRAAD');
    expect(setSleutelVan({}, 'Één graad')).toBe('EEN_GRAAD');
  });

  it('begrenst de slug op 80 tekens en kent een noodsleutel', () => {
    expect(setSleutelVan({}, 'a'.repeat(200))).toBe('A'.repeat(80));
    expect(setSleutelVan({}, undefined)).toBe('ONBEKEND');
    expect(setSleutelVan({}, '---')).toBe('ONBEKEND');
  });
});

describe('vergelijkCodes', () => {
  it('sorteert natuurlijk', () => {
    expect(vergelijkCodes('1.2', '1.10')).toBeLessThan(0);
    expect(vergelijkCodes('9.2', '10.1')).toBeLessThan(0);
    expect(vergelijkCodes('1.10', '1.2')).toBeGreaterThan(0);
    expect(vergelijkCodes('1.2', '1.2')).toBe(0);
    expect(['10.1', '1.10', '9.2', '1.2', '1.1'].sort(vergelijkCodes)).toEqual(['1.1', '1.2', '1.10', '9.2', '10.1']);
  });
});

describe('canoniek', () => {
  it('geeft dezelfde string, ongeacht de volgorde van de sleutels', () => {
    const a = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } };
    const b = { a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 };
    expect(canoniek(a)).toBe(canoniek(b));
    expect(canoniek(a)).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it('houdt arrays in volgorde en laat undefined weg', () => {
    expect(canoniek([1, 2])).not.toBe(canoniek([2, 1]));
    expect(canoniek({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canoniek([undefined])).toBe('[null]');
    expect(canoniek('x')).toBe('"x"');
    expect(canoniek(null)).toBe('null');
  });

  it('onderscheidt verschillende inhoud', () => {
    expect(canoniek({ a: 1 })).not.toBe(canoniek({ a: '1' }));
  });
});

describe('veldInventaris', () => {
  it('telt bovenste velden en paden onder onderwijsdoelenset', () => {
    const inv = veldInventaris([...PAGINA_1, ...PAGINA_2, 'geen record', null]);
    expect(inv.omschrijving).toBe(6);
    expect(inv.code).toBe(5);
    expect(inv.volgorde).toBe(2);
    expect(inv['onderwijsdoelenset']).toBe(6);
    expect(inv['onderwijsdoelenset.onderwijsstructuur']).toBe(6);
    expect(inv['onderwijsdoelenset.onderwijsstructuur.graad']).toBe(6);
    expect(inv['onderwijsdoelenset.onderwijsstructuur.leerjaar']).toBe(3);
    expect(inv['onderwijsdoelenset.vlaamse_sleutelcompetentie.korte_naam']).toBe(3);
    expect(inv['onderwijsdoelenset.onderwijsdoelenset']).toBe(6);
    expect(Object.keys(inv)).toEqual([...Object.keys(inv)].sort());
  });
});

describe('typeInventaris', () => {
  it('telt per pad het aantal per JSON-type', () => {
    const records = [
      { code: '1', onderwijsdoelenset: { onderwijsdoelenset: 'A', onderwijsstructuur: { leerjaar: '1' } } },
      { code: 2, onderwijsdoelenset: { onderwijsdoelenset: { naam: 'A' }, onderwijsstructuur: { leerjaar: ['1', '2'] } } },
      { code: null, onderwijsdoelenset: [{ onderwijsdoelenset: 'A' }], actief: true },
      'geen record',
    ];
    const types = typeInventaris(records);
    expect(types.code).toEqual({ null: 1, number: 1, string: 1 });
    expect(types.actief).toEqual({ boolean: 1 });
    expect(types.onderwijsdoelenset).toEqual({ array: 1, object: 2 });
    expect(types['onderwijsdoelenset.onderwijsdoelenset']).toEqual({ object: 1, string: 1 });
    expect(types['onderwijsdoelenset.onderwijsstructuur.leerjaar']).toEqual({ array: 1, string: 1 });
    // dezelfde paden als veldInventaris, in dezelfde volgorde
    expect(Object.keys(types)).toEqual(Object.keys(veldInventaris(records)));
    for (const [pad, aantal] of Object.entries(veldInventaris(records))) {
      expect(Object.values(types[pad]).reduce((a, b) => a + b, 0)).toBe(aantal);
    }
  });
});

describe('setVan', () => {
  it('geeft sleutel, naam en structuur van een bruikbaar record', () => {
    expect(setVan(rec('1.2', 'Tekst', SET_SO))).toEqual({
      setSleutel: 'SO_1STE_GRAAD_V2_1',
      setNaam: 'Secundair onderwijs, eerste graad',
      structuur: { graad: 'Eerste graad', stroom: 'A-stroom', leerjaar: 'Eerste leerjaar' },
      setInfo: {},
    });
  });

  it('werkt ook voor records die geen doel opleveren', () => {
    expect(setVan(rec(undefined, 'Zonder code', SET_LO)).setSleutel).toBe('LAGER_ONDERWIJS');
    expect(setVan({ code: 1.1, omschrijving: 'x', onderwijsdoelenset: 'Basis' }).setSleutel).toBe('BASIS');
    for (const v of [null, undefined, 'tekst', 5, [], {}]) {
      expect(setVan(v)).toEqual({ setSleutel: 'ONBEKEND', setNaam: 'Onbekende set', structuur: {}, setInfo: {} });
    }
  });

  it('neemt het element van een lijst met één element, en het eerste bij meer elementen', () => {
    expect(setVan({ onderwijsdoelenset: [{ onderwijsdoelenset: 'Een' }] }).setSleutel).toBe('EEN');
    const meer = setVan({ onderwijsdoelenset: [{ onderwijsdoelenset: 'Eerste', onderwijsstructuur: [{ graad: ['a', 'b'] }] }, { onderwijsdoelenset: 'Tweede' }] });
    expect(meer).toEqual({ setSleutel: 'EERSTE', setNaam: 'Eerste', structuur: { graad: 'a' }, setInfo: {} });
  });

  it('houdt twee sets met dezelfde lange naam uit elkaar dankzij hun set-id', () => {
    const a = setVan(rec('1', 'x', SET_API_A));
    const b = setVan(rec('1', 'x', SET_API_B));
    expect(a.setNaam).toBe(b.setNaam);
    expect([a.setSleutel, b.setSleutel]).toEqual(['ODS_1234', 'ODS_1235']);
    expect(b.setInfo).toEqual({ apiId: '1235', korteNaam: 'SO 2de graad A', versie: '3' });
  });
});

describe('meerwaardigeVelden en redenOnbruikbaar', () => {
  it('ziet geen probleem bij gewone records en lijsten met één element', () => {
    expect(meerwaardigeVelden(rec('1', 'Tekst', SET_SO))).toEqual([]);
    expect(meerwaardigeVelden({ onderwijsdoelenset: [{ vlaamse_sleutelcompetentie: [{ nr: 1 }] }] })).toEqual([]);
    expect(meerwaardigeVelden({ code: '1' })).toEqual([]);
    expect(meerwaardigeVelden('geen record')).toEqual([]);
  });

  it('noemt de velden met meer dan één waarde of een onleesbare waarde', () => {
    expect(
      meerwaardigeVelden({
        onderwijsdoelenset: {
          onderwijsstructuur: { graad: ['a', 'b'], stroom: true, leerjaar: '1' },
          vlaamse_sleutelcompetentie: [{ nr: 1 }, { nr: 2 }],
        },
      }),
    ).toEqual([
      'onderwijsdoelenset.onderwijsstructuur.graad',
      'onderwijsdoelenset.onderwijsstructuur.stroom',
      'onderwijsdoelenset.vlaamse_sleutelcompetentie',
    ]);
    expect(meerwaardigeVelden({ onderwijsdoelenset: [{ onderwijsdoelenset: 'A' }, { onderwijsdoelenset: 'B' }] })).toEqual(['onderwijsdoelenset']);
    expect(meerwaardigeVelden({ onderwijsdoelenset: { onderwijsstructuur: [{ graad: '1' }, {}] } })).toEqual(['onderwijsdoelenset.onderwijsstructuur']);
    expect(meerwaardigeVelden({ onderwijsdoelenset: false })).toEqual(['onderwijsdoelenset']);
  });

  it('geeft de reden waarom een record geen doel oplevert', () => {
    expect(redenOnbruikbaar(rec('1', 'Tekst', SET_SO))).toBeUndefined();
    expect(redenOnbruikbaar(rec(undefined, 'Tekst', SET_SO))).toBe('de code ontbreekt');
    expect(redenOnbruikbaar({ code: '1' })).toBe('de omschrijving ontbreekt');
    expect(redenOnbruikbaar({})).toBe('code en omschrijving ontbreken');
    expect(redenOnbruikbaar({ code: 1.1, omschrijving: 'x' })).toMatch(/JSON-getal/);
    expect(redenOnbruikbaar('tekst')).toBe('het record is geen object');
  });

  it('een code die een JSON-getal is, levert geen doel op (1.10 zou als 1.1 binnenkomen)', () => {
    expect(normaliseerRecord({ code: 1.1, omschrijving: 'Tekst' })).toBeNull();
    expect(normaliseerRecord({ code: 7, omschrijving: 'Tekst' })).toBeNull();
    expect(normaliseerRecord({ code: '1.10', omschrijving: 'Tekst' })?.doel.code).toBe('1.10');
  });

  it('normaliseerRecord leest een lijst met één element als dat element', () => {
    const n = normaliseerRecord({
      code: '1',
      omschrijving: 'Tekst',
      onderwijsdoelenset: [{ onderwijsdoelenset: 'Set A', onderwijsstructuur: [{ graad: 'Eerste graad' }], vlaamse_sleutelcompetentie: [{ nr: 3, naam: 'Drie' }] }],
    });
    expect(n?.setSleutel).toBe('SET_A');
    expect(n?.doel).toEqual({ code: '1', tekst: 'Tekst', sleutelcompetentie: { nr: '3', naam: 'Drie' }, graad: 'Eerste graad' });
  });
});

describe('valideerSetBestand', () => {
  function geldig(): MinimumdoelenSetBestand {
    return {
      app: 'boosterz',
      kind: 'minimumdoelen',
      v: 1,
      set: {
        id: 'X',
        naam: 'X',
        sleutelcompetenties: [],
        bron: 'b',
        api: 'a',
        naamsvermelding: 'n',
        licentie: 'l',
        opgehaald: '2026-10-05T00:00:00Z',
        aantal: 3,
        sha256: 'abc',
      },
      doelen: [
        { code: '1.2', tekst: 'a' },
        { code: '1.10', tekst: 'b' },
        { code: '2.1', tekst: 'c' },
      ],
    };
  }

  it('accepteert een geldig bestand', () => {
    expect(valideerSetBestand(geldig())).toEqual([]);
  });

  it('vangt een dubbele code', () => {
    const b = geldig();
    b.doelen[2].code = '1.10';
    expect(valideerSetBestand(b).join('\n')).toMatch(/"1\.10" komt meer dan één keer voor/);
  });

  it('laat dezelfde code toe bij doelen met een eigen id, maar geen dubbele id', () => {
    const b = geldig();
    b.doelen = [
      { id: '7', code: '1', tekst: 'Muzikale opvoeding' },
      { id: '12', code: '1', tekst: 'Plastische opvoeding' },
      { id: '3', code: '2', tekst: 'c' },
    ];
    expect(valideerSetBestand(b)).toEqual([]);

    b.doelen[2].id = '7';
    expect(valideerSetBestand(b).join('\n')).toMatch(/doel 3: de id "7" komt meer dan één keer voor/);

    const omgekeerd = geldig();
    omgekeerd.doelen = [
      { id: '12', code: '1', tekst: 'a' },
      { id: '7', code: '1', tekst: 'b' },
      { id: '3', code: '2', tekst: 'c' },
    ];
    expect(valideerSetBestand(omgekeerd).join('\n')).toMatch(/doel 2: id "7" staat na id "12" bij dezelfde code "1"/);

    const leeg = geldig();
    (leeg.doelen[0] as { id?: unknown }).id = '  ';
    expect(valideerSetBestand(leeg).join('\n')).toMatch(/doel 1: de id is leeg of geen tekst/);
  });

  it('vangt een lege tekst of lege code', () => {
    const b = geldig();
    b.doelen[1].tekst = '   ';
    b.doelen[2].code = '';
    const fouten = valideerSetBestand(b).join('\n');
    expect(fouten).toMatch(/doel 2 \(1\.10\): de tekst ontbreekt of is leeg/);
    expect(fouten).toMatch(/doel 3: de code ontbreekt of is leeg/);
  });

  it('vangt een verkeerd aantal', () => {
    const b = geldig();
    b.set.aantal = 4;
    expect(valideerSetBestand(b).join('\n')).toMatch(/Kop zegt 4 doelen, maar het bestand bevat er 3/);
  });

  it('vangt een verkeerde volgorde', () => {
    const b = geldig();
    b.doelen.reverse();
    expect(valideerSetBestand(b).join('\n')).toMatch(/verkeerde volgorde/);
    const natuurlijk = geldig();
    natuurlijk.doelen = [
      { code: '1.10', tekst: 'a' },
      { code: '1.2', tekst: 'b' },
      { code: '2.1', tekst: 'c' },
    ];
    expect(valideerSetBestand(natuurlijk).join('\n')).toMatch(/"1\.2" staat na "1\.10"/);
  });

  it('vangt een kapotte kop', () => {
    const b = geldig() as unknown as Record<string, unknown>;
    b.app = 'andere';
    b.kind = 'iets';
    b.v = 2;
    b.set = { aantal: 3 };
    const fouten = valideerSetBestand(b).join('\n');
    expect(fouten).toMatch(/"app"/);
    expect(fouten).toMatch(/"kind"/);
    expect(fouten).toMatch(/"v"/);
    expect(fouten).toMatch(/set\.id/);
    expect(fouten).toMatch(/set\.sha256/);
    expect(valideerSetBestand({ ...geldig(), set: undefined }).join('\n')).toMatch(/"set" ontbreekt/);
    expect(valideerSetBestand({ ...geldig(), doelen: 'x' }).join('\n')).toMatch(/"doelen"/);
    const zonderAantal = geldig() as unknown as { set: Record<string, unknown> };
    delete zonderAantal.set.aantal;
    expect(valideerSetBestand(zonderAantal).join('\n')).toMatch(/set\.aantal/);
  });

  it('weigert iets dat geen object is', () => {
    for (const v of [null, 'tekst', 5, []]) expect(valideerSetBestand(v)).toHaveLength(1);
  });

  it('beperkt een lange lijst gelijksoortige fouten', () => {
    const b = geldig();
    b.doelen = Array.from({ length: 40 }, () => ({ code: '1', tekst: 'a' }));
    b.set.aantal = 40;
    const fouten = valideerSetBestand(b);
    expect(fouten.length).toBeLessThan(15);
    expect(fouten.join('\n')).toMatch(/… en nog 29 van dezelfde soort/);
  });
});

// ── Integratie: het ophaalscript met een nagebootst antwoord ────────────────

describe('haal-minimumdoelen.mjs met --bron', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'minimumdoelen-bron-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function schrijfBron(naam: string, inhoud: unknown): string {
    const pad = join(tmp, naam);
    writeFileSync(pad, JSON.stringify(inhoud), 'utf8');
    return pad;
  }

  it('schrijft enkel de secundaire set, met een kloppende kop, index en rapport', () => {
    const bron = schrijfBron('twee-paginas.json', TWEE_PAGINAS);
    const uit = join(tmp, 'uit-1');
    const rapportPad = join(tmp, 'r.json');
    const run = draai(['--bron', bron, '--uit', uit, '--rapport', rapportPad]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Nieuw: SO_1STE_GRAAD_V2_1 \(2 doelen\)/);

    expect(readdirSync(uit).sort()).toEqual(['SO_1STE_GRAAD_V2_1.json', 'index.json']);
    expect(run.stdout).toMatch(/Volledig identieke records samengevoegd: 1/);

    const tekst = readFileSync(join(uit, `${SO_ID}.json`), 'utf8');
    expect(tekst.endsWith('\n')).toBe(true);
    expect(tekst.endsWith('\n\n')).toBe(false);
    const bestand = JSON.parse(tekst) as MinimumdoelenSetBestand;
    expect(valideerSetBestand(bestand)).toEqual([]);
    expect(bestand.set.sha256).toBe(sha256Van(bestand.doelen));
    expect(bestand.set.aantal).toBe(2);

    // opmaak: kop met 2 spaties, daarna één compact doel per regel
    const regels = tekst.split('\n');
    const start = regels.indexOf('  "doelen": [');
    expect(start).toBeGreaterThan(0);
    expect(regels.slice(start + 1, start + 3).map((r) => r.replace(/,$/, ''))).toEqual(bestand.doelen.map((d) => JSON.stringify(d)));
    expect(regels[start + 3]).toBe('  ]');
    expect(regels[1]).toBe('  "app": "boosterz",');

    expect(bestand.set).toMatchObject({
      id: SO_ID,
      naam: 'Secundair onderwijs, eerste graad',
      graad: 'Eerste graad',
      stroom: 'A-stroom',
      leerjaar: 'Eerste leerjaar',
      sleutelcompetenties: [{ nr: '1', naam: 'Competenties in verband met Nederlands' }],
      bron: 'https://www.onderwijsdoelen.be/',
      api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen',
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen',
    });
    expect(bestand.set.opgehaald).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

    // natuurlijke volgorde, letterlijke tekst, set-niveau waarden niet herhaald per doel
    expect(bestand.doelen).toEqual([
      {
        id: '/doel/1',
        code: '1.2',
        tekst: 'Eerste doel',
        type: 'Minimumdoel',
        sleutelcompetentie: { nr: '1', naam: 'Competenties in verband met Nederlands' },
        extra: { toelichting: 'Een toelichting', volgorde: 3 },
      },
      {
        code: '1.10',
        tekst: 'Tweede doel  met   dubbele spaties.',
        type: 'Minimumdoel',
        sleutelcompetentie: { nr: '1', naam: 'Competenties in verband met Nederlands' },
      },
    ]);

    const index = leesJson<MinimumdoelenIndex>(join(uit, 'index.json'));
    expect(index).toEqual({
      app: 'boosterz',
      kind: 'minimumdoelen-index',
      v: 1,
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen',
      sets: [
        {
          id: SO_ID,
          naam: 'Secundair onderwijs, eerste graad',
          graad: 'Eerste graad',
          stroom: 'A-stroom',
          leerjaar: 'Eerste leerjaar',
          aantal: 2,
          sha256: bestand.set.sha256,
          opgehaald: bestand.set.opgehaald,
          bestand: `${SO_ID}.json`,
        },
      ],
    });
    expect(controleerMap(uit)).toEqual([]);

    const rapport = leesJson<Record<string, unknown>>(rapportPad);
    expect(rapport).toMatchObject({
      bron: 'bestand',
      paginas: 2,
      records: 6,
      totalItems: 6,
      paginaSleutels: { pagina: ['gegevens'], gegevens: ['member', 'totalItems'] },
      overgeslagen: 1,
      dubbel: 1, // volledig identiek na normaliseren: enkel het id verschilt
      conflicten: [],
      nieuw: [SO_ID],
      gewijzigd: [],
      ongewijzigd: [],
      verdwenen: [],
      alleSets: [
        { id: 'LAGER_ONDERWIJS', naam: 'Lager onderwijs', aantal: 2, gekozen: false, problemen: 1 },
        { id: SO_ID, naam: 'Secundair onderwijs, eerste graad', aantal: 2, gekozen: true, problemen: 0 },
      ],
    });
    // het overgeslagen record zit in een niet-gekozen set: enkel in het rapport, met reden en veldnamen
    expect(rapport.problemen).toEqual({
      conflict: { aantal: 0, voorbeelden: [] },
      variant: { aantal: 0, voorbeelden: [] },
      overgeslagen: { aantal: 1, voorbeelden: [{ set: 'LAGER_ONDERWIJS', reden: 'de code ontbreekt', velden: ['omschrijving', 'onderwijsdoel_type', 'onderwijsdoelenset'] }] },
      meerwaardig: { aantal: 0, voorbeelden: [] },
    });
    expect(rapport.tijdstip).toMatch(/^\d{4}-/);
    const velden = rapport.veldInventaris as Record<string, number>;
    expect(velden.volgorde).toBe(2);
    expect(velden['onderwijsdoelenset.onderwijsstructuur.graad']).toBe(6);
    const types = rapport.typeInventaris as Record<string, Record<string, number>>;
    expect(types.code).toEqual({ string: 5 });
    expect(types['onderwijsdoelenset.onderwijsstructuur.leerjaar']).toEqual({ object: 3 });
    expect(types['onderwijsdoelenset.vlaamse_sleutelcompetentie.nr']).toEqual({ number: 3 });
    expect(JSON.stringify(rapport)).not.toContain('Een toelichting'); // geen inhoud van records in de inventarissen
  });

  it('raakt een ongewijzigde set niet aan (bestand, index en opgehaald blijven staan)', async () => {
    const bron = schrijfBron('twee-paginas-b.json', TWEE_PAGINAS);
    const uit = join(tmp, 'uit-2');
    const rapportPad = join(tmp, 'r2.json');
    expect(draai(['--bron', bron, '--uit', uit, '--rapport', rapportPad]).status).toBe(0);
    const bestandPad = join(uit, `${SO_ID}.json`);
    const indexPad = join(uit, 'index.json');
    const voor = { bestand: readFileSync(bestandPad), index: readFileSync(indexPad), b: statSync(bestandPad).mtimeMs, i: statSync(indexPad).mtimeMs };

    await new Promise((r) => setTimeout(r, 30));
    const tweede = draai(['--bron', bron, '--uit', uit, '--rapport', rapportPad]);
    expect(tweede.status, tweede.stderr).toBe(0);

    expect(readFileSync(bestandPad).equals(voor.bestand)).toBe(true);
    expect(readFileSync(indexPad).equals(voor.index)).toBe(true);
    expect(statSync(bestandPad).mtimeMs).toBe(voor.b);
    expect(statSync(indexPad).mtimeMs).toBe(voor.i);
    expect(leesJson<Record<string, unknown>>(rapportPad)).toMatchObject({ nieuw: [], gewijzigd: [], ongewijzigd: [SO_ID] });
    expect(tweede.stdout).toMatch(/Index: ongewijzigd/);
  });

  it('meldt een gewijzigde, nieuwe en verdwenen set, en wist niets', () => {
    const uit = join(tmp, 'uit-3');
    const rapportPad = join(tmp, 'r3.json');
    const begin = schrijfBron('begin.json', TWEE_PAGINAS);
    expect(draai(['--bron', begin, '--uit', uit, '--rapport', rapportPad]).status).toBe(0);
    const eerste = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));

    // één doeltekst verandert
    const gewijzigd = [antwoord([{ ...PAGINA_1[1], omschrijving: 'Eerste doel, herzien' }, PAGINA_1[0]], 2)];
    const run2 = draai(['--bron', schrijfBron('gewijzigd.json', gewijzigd), '--uit', uit, '--rapport', rapportPad]);
    expect(run2.status, run2.stderr).toBe(0);
    expect(leesJson<Record<string, unknown>>(rapportPad)).toMatchObject({ nieuw: [], gewijzigd: [SO_ID], ongewijzigd: [] });
    const tweede = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));
    expect(tweede.set.sha256).not.toBe(eerste.set.sha256);
    expect(tweede.doelen[0].tekst).toBe('Eerste doel, herzien');

    // een andere secundaire set; de eerste staat niet meer in de bron
    const nieuweBron = [antwoord([rec('E.1', 'Engels doel', SET_SO2)], 1)];
    const run3 = draai(['--bron', schrijfBron('nieuw.json', nieuweBron), '--uit', uit, '--rapport', rapportPad]);
    expect(run3.status, run3.stderr).toBe(0);
    expect(leesJson<Record<string, unknown>>(rapportPad)).toMatchObject({
      nieuw: ['SECUNDAIR_ONDERWIJS_TWEEDE_GRAAD'],
      verdwenen: [SO_ID],
    });
    expect(run3.stdout).toMatch(/Verdwenen uit de bron \(bestand blijft staan\): SO_1STE_GRAAD_V2_1/);
    expect(existsSync(join(uit, `${SO_ID}.json`))).toBe(true);
    const index = leesJson<MinimumdoelenIndex>(join(uit, 'index.json'));
    expect(index.sets.map((s) => s.id)).toEqual(['SECUNDAIR_ONDERWIJS_TWEEDE_GRAAD', SO_ID]);
    expect(controleerMap(uit)).toEqual([]);
  });

  it('geeft uitgangscode 2 en schrijft enkel het rapport als de filter niets kiest', () => {
    const bron = schrijfBron('filter.json', TWEE_PAGINAS);
    const uit = join(tmp, 'uit-4');
    const rapportPad = join(tmp, 'r4.json');
    const run = draai(['--bron', bron, '--uit', uit, '--rapport', rapportPad, '--filter', 'bestaat-echt-niet']);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/Geen set herkend; pas --filter aan \(zie rapport\)/);
    expect(existsSync(uit)).toBe(false);
    const rapport = leesJson<{ alleSets: { gekozen: boolean }[] }>(rapportPad);
    expect(rapport.alleSets).toHaveLength(2);
    expect(rapport.alleSets.every((s) => !s.gekozen)).toBe(true);
  });

  it('kiest met --filter . alle sets, ook die met een probleem (dan stopt het script)', () => {
    const schoon = [...PAGINA_1, PAGINA_2[1], PAGINA_2[2]];
    const uit = join(tmp, 'uit-5');
    const run = draai(['--bron', schrijfBron('alles.json', schoon), '--uit', uit, '--rapport', join(tmp, 'r5.json'), '--filter', '.']);
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(uit).sort()).toEqual(['LAGER_ONDERWIJS.json', 'SO_1STE_GRAAD_V2_1.json', 'index.json']);
    expect(controleerMap(uit)).toEqual([]);

    // TWEE_PAGINAS bevat in de lagere school een record zonder code: gekozen betekent nu een probleem
    const uit2 = join(tmp, 'uit-5b');
    const run2 = draai(['--bron', schrijfBron('alles-problemen.json', TWEE_PAGINAS), '--uit', uit2, '--rapport', join(tmp, 'r5b.json'), '--filter', '.']);
    expect(run2.status).toBe(3);
    expect(existsSync(uit2)).toBe(false);
  });

  it('houdt sets met dezelfde lange naam apart via hun set-id, met korte naam en versie in kop en index', () => {
    // Zoals in de eerste echte ophaling: dezelfde code en tekst in twee sets met dezelfde (lange) naam.
    const records = [
      rec('6.37', 'Zelfde tekst', { ...SET_API_A, vlaamse_sleutelcompetentie: { nr: 6, naam: 'Zes' } }, { '@id': 1 }),
      rec('6.37', 'Zelfde tekst', { ...SET_API_B, vlaamse_sleutelcompetentie: { nr: 10, naam: 'Tien' } }, { '@id': 2 }),
      rec('6.38', 'Andere tekst', { ...SET_API_B, korte_naam: 'SO 2de graad A (oud)' }, { '@id': 3, optioneel: true }),
    ];
    const bron = schrijfBron('zelfde-naam.json', antwoord(records, 3));
    const uit = join(tmp, 'uit-zelfde-naam');
    const rapportPad = join(tmp, 'r-zelfde-naam.json');
    const run = draai(['--bron', bron, '--uit', uit, '--rapport', rapportPad]);
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(uit).sort()).toEqual(['ODS_1234.json', 'ODS_1235.json', 'index.json']);

    const a = leesJson<MinimumdoelenSetBestand>(join(uit, 'ODS_1234.json'));
    const b = leesJson<MinimumdoelenSetBestand>(join(uit, 'ODS_1235.json'));
    expect(a.set).toMatchObject({ id: 'ODS_1234', naam: LANGE_NAAM, apiId: '1234', korteNaam: 'SO 2de graad A', versie: '2.0', graad: 'Tweede graad' });
    expect(a.doelen).toEqual([{ id: '1', code: '6.37', tekst: 'Zelfde tekst', type: 'Minimumdoel', sleutelcompetentie: { nr: '6', naam: 'Zes' } }]);
    expect(b.set).toMatchObject({ id: 'ODS_1235', apiId: '1235', korteNaam: 'SO 2de graad A', versie: '3' });
    expect(b.doelen.map((d) => [d.id, d.code, d.extra])).toEqual([['2', '6.37', undefined], ['3', '6.38', { optioneel: true }]]);
    expect(Object.keys(a.set).slice(0, 5)).toEqual(['id', 'naam', 'apiId', 'korteNaam', 'versie']);

    const index = leesJson<MinimumdoelenIndex>(join(uit, 'index.json'));
    expect(index.sets.map((s) => [s.id, s.korteNaam, s.versie])).toEqual([
      ['ODS_1234', 'SO 2de graad A', '2.0'],
      ['ODS_1235', 'SO 2de graad A', '3'],
    ]);
    expect(controleerMap(uit)).toEqual([]);

    // een afwijkende korte naam binnen één set is geen probleem, wel een waarschuwing
    const rapport = leesJson<{ waarschuwingen?: string[]; alleSets: { id: string; korteNaam?: string }[] }>(rapportPad);
    expect(rapport.waarschuwingen).toEqual([
      'Set ODS_1235 heeft meerdere waarden voor korteNaam (SO 2de graad A / SO 2de graad A (oud)); de eerste is gebruikt.',
    ]);
    expect(rapport.alleSets.map((s) => [s.id, s.korteNaam])).toEqual([
      ['ODS_1234', 'SO 2de graad A'],
      ['ODS_1235', 'SO 2de graad A'],
    ]);
  });

  it('zet de geldigheid van de set in de kop en de index', () => {
    const records = [
      rec('1', 'Een', SET_SO, { '@id': 1, geldigheid: { type: 'Geldig', geldig_van_dt: '2024-09-01T00:00:00Z' } }),
      rec('2', 'Twee', SET_SO, { '@id': 2, geldigheid: { type: 'Geldig', geldig_van_dt: '2023-09-01T00:00:00Z' } }),
    ];
    const uit = join(tmp, 'uit-geldigheid');
    const run = draai(['--bron', schrijfBron('geldigheid.json', records), '--uit', uit, '--rapport', join(tmp, 'r-geldigheid.json')]);
    expect(run.status, run.stderr).toBe(0);
    const bestand = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));
    expect(bestand.set).toMatchObject({ geldigheid: 'Geldig', geldigVan: '2023-09-01' });
    expect(bestand.set).not.toHaveProperty('geldigTot');
    expect(leesJson<MinimumdoelenIndex>(join(uit, 'index.json')).sets[0]).toMatchObject({ geldigheid: 'Geldig', geldigVan: '2023-09-01' });
    expect(controleerMap(uit)).toEqual([]);
  });

  it('geeft per doel enkel een afwijkende graad, stroom of leerjaar', () => {
    const bron = schrijfBron('afwijkend.json', [
      rec('1', 'Een', SET_SO),
      rec('2', 'Twee', { ...SET_SO, onderwijsstructuur: { graad: 'Eerste graad', stroom: 'B-stroom' } }),
    ]);
    const uit = join(tmp, 'uit-6');
    expect(draai(['--bron', bron, '--uit', uit, '--rapport', join(tmp, 'r6.json')]).status).toBe(0);
    const bestand = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));
    // graad is overal gelijk (set-niveau); stroom verschilt, en leerjaar ontbreekt bij één doel: geen set-niveau
    expect(bestand.set.graad).toBe('Eerste graad');
    expect(bestand.set.stroom).toBeUndefined();
    expect(bestand.set.leerjaar).toBeUndefined();
    expect(bestand.doelen[0]).toMatchObject({ stroom: 'A-stroom', leerjaar: 'Eerste leerjaar' });
    expect(bestand.doelen[0]).not.toHaveProperty('graad');
    expect(bestand.doelen[1]).toMatchObject({ stroom: 'B-stroom' });
    expect(bestand.doelen[1]).not.toHaveProperty('leerjaar');
    expect(controleerMap(uit)).toEqual([]);
  });

  it('leest ook een lijst losse records en één enkele pagina, met dezelfde inhoud', () => {
    const sha = (naam: string, inhoud: unknown) => {
      const uit = join(tmp, `uit-${naam}`);
      const run = draai(['--bron', schrijfBron(`${naam}.json`, inhoud), '--uit', uit, '--rapport', join(tmp, `r-${naam}.json`)]);
      expect(run.status, run.stderr).toBe(0);
      return leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`)).set.sha256;
    };
    const alsPaginas = sha('paginas', TWEE_PAGINAS);
    expect(sha('records', [...PAGINA_1, ...PAGINA_2])).toBe(alsPaginas);
    expect(sha('een-pagina', antwoord([...PAGINA_1, ...PAGINA_2], 6))).toBe(alsPaginas);
  });

  it('weigert een antwoord waarvan het aantal niet klopt, te weinig of te veel, zonder iets te schrijven', () => {
    const run = (naam: string, inhoud: unknown) => {
      const uit = join(tmp, `uit-${naam}`);
      const r = draai(['--bron', schrijfBron(`${naam}.json`, inhoud), '--uit', uit, '--rapport', join(tmp, `r-${naam}.json`)]);
      expect(existsSync(uit), `${naam}: er is iets geschreven`).toBe(false);
      return r;
    };
    const tekort = run('tekort', [antwoord(PAGINA_1, 99)]);
    expect(tekort.status).toBe(1);
    expect(tekort.stderr).toMatch(/Aantal klopt niet: 3 ontvangen, 3 uniek, totalItems = 99/);
    const teVeel = run('te-veel', [antwoord(PAGINA_1, 2)]);
    expect(teVeel.status).toBe(1);
    expect(teVeel.stderr).toMatch(/Aantal klopt niet: 3 ontvangen, 3 uniek, totalItems = 2/);
    // een letterlijk dubbel record telt maar één keer mee: 4 ontvangen, 3 uniek
    const dubbel = run('letterlijk-dubbel', [antwoord([...PAGINA_1, PAGINA_1[0]], 4)]);
    expect(dubbel.status).toBe(1);
    expect(dubbel.stderr).toMatch(/Aantal klopt niet: 4 ontvangen, 3 uniek, totalItems = 4/);
  });

  it('eist totalItems bij pagina\'s (exit 3, rapport gevuld), maar niet bij een losse lijst records', () => {
    const zonder = [{ gegevens: { member: PAGINA_1 } }, { gegevens: { member: PAGINA_2 } }];
    const uit = join(tmp, 'uit-zonder-total');
    const rapportPad = join(tmp, 'r-zonder-total.json');
    const run = draai(['--bron', schrijfBron('zonder-total.json', zonder), '--uit', uit, '--rapport', rapportPad]);
    expect(run.status).toBe(3);
    expect(run.stderr).toMatch(/geen geldig totalItems/);
    expect(existsSync(uit)).toBe(false);
    const rapport = leesJson<Record<string, unknown> & { alleSets: unknown[] }>(rapportPad);
    expect(rapport).toMatchObject({ records: 6, totalItems: null, paginaSleutels: { pagina: ['gegevens'], gegevens: ['member'] } });
    expect(rapport.fout).toMatch(/totalItems/);
    expect(Object.keys(rapport.veldInventaris as object).length).toBeGreaterThan(3);
    expect(rapport.alleSets).toHaveLength(2);
    // ongeldige waarden tellen als ontbrekend
    for (const [naam, totalItems] of [['tekst', 'veel'], ['negatief', -1], ['komma', 6.5], ['leeg', null]] as const) {
      const bron = schrijfBron(`ongeldig-${naam}.json`, [{ gegevens: { member: [...PAGINA_1, ...PAGINA_2], totalItems } }]);
      const r = draai(['--bron', bron, '--uit', join(tmp, `uit-ongeldig-${naam}`), '--rapport', join(tmp, `r-ongeldig-${naam}.json`)]);
      expect(r.status, naam).toBe(3);
    }
    // een losse lijst records heeft geen totalItems en is vrijgesteld
    const lijst = draai(['--bron', schrijfBron('lijst.json', [...PAGINA_1, ...PAGINA_2]), '--uit', join(tmp, 'uit-lijst'), '--rapport', join(tmp, 'r-lijst.json')]);
    expect(lijst.status, lijst.stderr).toBe(0);
  });

  it('noemt bij een onbekende vorm enkel de namen van de bovenste sleutels', () => {
    const bron = schrijfBron('vorm.json', { message: 'geheime-inhoud', fout: { x: 1 } });
    const run = draai(['--bron', bron, '--uit', join(tmp, 'uit-8'), '--rapport', join(tmp, 'r8.json')]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/onverwachte vorm\. Bovenste sleutels: fout, message\./);
    expect(run.stderr + run.stdout).not.toContain('geheime-inhoud');
  });

  it('geeft een nette fout voor een ongeldige filter, onbekende optie of kapot bronbestand', () => {
    const bron = schrijfBron('ok.json', TWEE_PAGINAS);
    const rapport = ['--uit', join(tmp, 'uit-fouten'), '--rapport', join(tmp, 'r-fouten.json')];
    expect(draai(['--bron', bron, ...rapport, '--filter', '(']).stderr).toMatch(/geen geldige reguliere expressie/);
    expect(draai(['--bron', bron, ...rapport, '--onzin']).stderr).toMatch(/Onbekende optie: --onzin/);
    const kapot = join(tmp, 'kapot.json');
    writeFileSync(kapot, '{ geen json', 'utf8');
    const run = draai(['--bron', kapot, ...rapport]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/kon niet gelezen worden als JSON/);
  });

  it('negeert andere json-bestanden in de doelmap (zoals het rapport) bij het bouwen van de index', () => {
    const bron = schrijfBron('rapport-in-map.json', TWEE_PAGINAS);
    const uit = join(tmp, 'uit-9');
    mkdirSync(uit, { recursive: true });
    const run = draai(['--bron', bron, '--uit', uit, '--rapport', join(uit, 'r.json')]);
    expect(run.status, run.stderr).toBe(0);
    expect(leesJson<MinimumdoelenIndex>(join(uit, 'index.json')).sets.map((s) => s.id)).toEqual([SO_ID]);
    expect(controleerMap(uit)).toEqual([]);
  });

  // ── Problemen: niets verliezen in een gekozen set ────────────────────────

  /** Een doel zoals het genormaliseerd uit SET_SO komt. */
  const doelSO = (code: string, tekst: string, rest: Record<string, unknown> = {}) => ({
    code,
    tekst,
    type: 'Minimumdoel',
    sleutelcompetentie: { nr: '1', naam: 'Competenties in verband met Nederlands' },
    graad: 'Eerste graad',
    stroom: 'A-stroom',
    leerjaar: 'Eerste leerjaar',
    ...rest,
  });
  const goedDoel = rec('1.1', 'Een goed doel', SET_SO);
  const metStroom = (stroom: string) => ({ ...SET_SO, onderwijsstructuur: { ...SET_SO.onderwijsstructuur, stroom } });

  type Soort = 'conflict' | 'variant' | 'overgeslagen' | 'meerwaardig';
  const PROBLEEM: Record<Soort, { records: Rec[]; voorbeelden: unknown[]; stderr: RegExp }> = {
    conflict: {
      records: [rec('1.2', 'Tweede tekst', SET_SO), rec('1.2', 'Eerste tekst', SET_SO)],
      voorbeelden: [{ set: SO_ID, code: '1.2', verschil: ['tekst'], varianten: [doelSO('1.2', 'Eerste tekst'), doelSO('1.2', 'Tweede tekst')] }],
      stderr: /Problemen in gekozen sets \(conflict 1; sets: SO_1STE_GRAAD_V2_1\)/,
    },
    variant: {
      records: [rec('1.3', 'Zelfde tekst', metStroom('B-stroom')), rec('1.3', 'Zelfde tekst', SET_SO)],
      voorbeelden: [{ set: SO_ID, code: '1.3', verschil: ['stroom'], varianten: [doelSO('1.3', 'Zelfde tekst'), doelSO('1.3', 'Zelfde tekst', { stroom: 'B-stroom' })] }],
      stderr: /Problemen in gekozen sets \(variant 1;/,
    },
    overgeslagen: {
      records: [rec(undefined, 'Zonder code', SET_SO), { ...rec('1.4', 'Getal als code', SET_SO), code: 1.4 }],
      voorbeelden: [
        { set: SO_ID, reden: 'de code is een JSON-getal (een code hoort tekst te zijn)', velden: ['code', 'omschrijving', 'onderwijsdoel_type', 'onderwijsdoelenset'] },
        { set: SO_ID, reden: 'de code ontbreekt', velden: ['omschrijving', 'onderwijsdoel_type', 'onderwijsdoelenset'] },
      ],
      stderr: /Problemen in gekozen sets \(overgeslagen 2;/,
    },
    meerwaardig: {
      records: [rec('1.5', 'Met twee competenties', { ...SET_SO, vlaamse_sleutelcompetentie: [{ nr: 1, naam: 'Een' }, { nr: 2, naam: 'Twee' }] })],
      voorbeelden: [{ set: SO_ID, code: '1.5', velden: ['onderwijsdoelenset.vlaamse_sleutelcompetentie'] }],
      stderr: /Problemen in gekozen sets \(meerwaardig 1;/,
    },
  };
  const SOORTEN: Soort[] = ['conflict', 'variant', 'overgeslagen', 'meerwaardig'];

  type ProbleemRapport = { problemen: Record<Soort, { aantal: number; voorbeelden: unknown[] }>; conflicten: unknown[]; alleSets: { id: string; problemen: number }[]; fout?: string };

  for (const soort of SOORTEN) {
    it(`een ${soort} in een gekozen set stopt met uitgangscode 3, schrijft niets en toont het voorbeeld`, () => {
      const p = PROBLEEM[soort];
      const uit = join(tmp, `uit-probleem-${soort}`);
      const rapportPad = join(tmp, `r-probleem-${soort}.json`);
      const run = draai(['--bron', schrijfBron(`probleem-${soort}.json`, [goedDoel, ...p.records]), '--uit', uit, '--rapport', rapportPad]);
      expect(run.status, run.stdout).toBe(3);
      expect(run.stderr).toMatch(p.stderr);
      expect(existsSync(uit)).toBe(false);

      const rapport = leesJson<ProbleemRapport>(rapportPad);
      expect(rapport.problemen[soort]).toEqual({ aantal: p.voorbeelden.length, voorbeelden: p.voorbeelden });
      for (const andere of SOORTEN.filter((s) => s !== soort)) expect(rapport.problemen[andere].aantal, andere).toBe(0);
      expect(rapport.alleSets.find((s) => s.id === SO_ID)?.problemen).toBe(p.voorbeelden.length);
      expect(rapport.fout).toMatch(/Problemen in gekozen sets/);
      if (soort === 'conflict') expect(rapport.conflicten).toEqual([{ set: SO_ID, code: '1.2' }]);
    });
  }

  it('zet conflicten en varianten van een gekozen set ook in het logboek: ids, verschillende velden en hun waarden', () => {
    const records = [
      rec('2.1', '<p>Nieuwe tekst van het doel</p>', SET_SO, { '@id': 10, geldigheid: { tot: null } }),
      rec('2.1', '<p>Oude tekst van het doel</p>', SET_SO, { '@id': 10, geldigheid: { tot: '2024-08-31' } }),
      rec('2.2', 'Zelfde', SET_SO, { '@id': 12, optioneel: true }),
      rec('2.2', 'Zelfde', SET_SO, { '@id': 12 }),
    ];
    const run = draai(['--bron', schrijfBron('probleem-log.json', [goedDoel, ...records]), '--uit', join(tmp, 'uit-probleem-log'), '--rapport', join(tmp, 'r-probleem-log.json')]);
    expect(run.status, run.stderr).toBe(3);
    const regels = run.stdout.split('\n').filter((r) => r.startsWith('- '));
    expect(regels).toEqual([
      `- ${SO_ID} (Secundair onderwijs, eerste graad) code 2.1, conflict, ids 10, 10; verschilt in extra.geldigheid, tekst. ` +
        'extra.geldigheid: "{"tot":"2024-08-31"}" | "{"tot":null}"; tekst: "Oude tekst van het doel" | "Nieuwe tekst van het doel"',
      `- ${SO_ID} (Secundair onderwijs, eerste graad) code 2.2, variant, ids 12, 12; verschilt in extra.optioneel. ` +
        'extra.optioneel: "true" | "(geen)"',
    ]);
    const rapport = leesJson<ProbleemRapport>(join(tmp, 'r-probleem-log.json'));
    expect(rapport.problemen.conflict.voorbeelden).toMatchObject([{ code: '2.1', id: '10', verschil: ['extra.geldigheid', 'tekst'] }]);
    expect(rapport.conflicten).toEqual([{ set: SO_ID, code: '2.1', id: '10' }]);
  });

  it('herkent een doel aan zijn id: dezelfde code bij verschillende doelen is geen probleem, wel gemeld', () => {
    // Zoals in de echte gegevens: de nummering begint opnieuw per rubriek.
    const muziek = { titels: { 1: { titel: 'Muzikale opvoeding', nr: '1' } } };
    const beeld = { titels: { 1: { titel: 'Plastische opvoeding', nr: '2' } } };
    const records = [
      rec('2', 'Beeld twee', SET_SO, { '@id': 97, ...beeld }),
      rec('1', 'Beeld een', SET_SO, { '@id': 96, ...beeld }),
      rec('1', 'Muziek een', SET_SO, { '@id': 78, ...muziek }),
      rec('2', 'Muziek twee', SET_SO, { '@id': 79, ...muziek }),
      rec('3', 'Enkel muziek', SET_SO, { '@id': 80, ...muziek }),
    ];
    const uit = join(tmp, 'uit-zelfde-code');
    const rapportPad = join(tmp, 'r-zelfde-code.json');
    const run = draai(['--bron', schrijfBron('zelfde-code.json', records), '--uit', uit, '--rapport', rapportPad]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Codes die binnen een set bij meer dan één doel horen \(elk met een eigen id, bv\. per rubriek\): 2 in 1 set;/);

    const bestand = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));
    expect(bestand.set.aantal).toBe(5);
    expect(bestand.doelen.map((d) => [d.code, d.id, d.tekst])).toEqual([
      ['1', '78', 'Muziek een'],
      ['1', '96', 'Beeld een'],
      ['2', '79', 'Muziek twee'],
      ['2', '97', 'Beeld twee'],
      ['3', '80', 'Enkel muziek'],
    ]);
    expect(bestand.doelen[0].extra).toEqual(muziek);
    expect(controleerMap(uit)).toEqual([]);

    const rapport = leesJson<{ dubbeleCodes: unknown; problemen: Record<string, { aantal: number }> }>(rapportPad);
    expect(rapport.dubbeleCodes).toEqual({
      aantal: 2,
      sets: 1,
      voorbeelden: [
        { set: SO_ID, code: '1', ids: ['78', '96'] },
        { set: SO_ID, code: '2', ids: ['79', '97'] },
      ],
    });
    expect(rapport.problemen.conflict.aantal + rapport.problemen.variant.aantal).toBe(0);
  });

  it('een probleem verandert niets aan een bestaande uitmap', () => {
    const uit = join(tmp, 'uit-probleem-bestaand');
    const goed = draai(['--bron', schrijfBron('goed.json', [goedDoel]), '--uit', uit, '--rapport', join(tmp, 'r-goed.json')]);
    expect(goed.status, goed.stderr).toBe(0);
    const voor = readFileSync(join(uit, `${SO_ID}.json`));
    const stuk = draai(['--bron', schrijfBron('stuk.json', [goedDoel, ...PROBLEEM.conflict.records]), '--uit', uit, '--rapport', join(tmp, 'r-stuk.json')]);
    expect(stuk.status).toBe(3);
    expect(readFileSync(join(uit, `${SO_ID}.json`)).equals(voor)).toBe(true);
    expect(readdirSync(uit).sort()).toEqual([`${SO_ID}.json`, 'index.json']);
  });

  it('problemen in een niet-gekozen set staan enkel in het rapport', () => {
    const lo = (code: string | undefined, tekst: string, set: Rec = SET_LO) => rec(code, tekst, set);
    const records = [
      goedDoel,
      lo('A.1', 'Een'),
      lo('A.1', 'Twee'), // conflict
      lo('A.2', 'Zelfde'),
      lo('A.2', 'Zelfde', { ...SET_LO, onderwijsstructuur: { graad: 'Lagere school', stroom: 'x' } }), // variant
      lo(undefined, 'Zonder code'), // overgeslagen
      { ...lo('A.4', 'Twee sets'), onderwijsdoelenset: [SET_LO, SET_LO] }, // meerwaardig
    ];
    const uit = join(tmp, 'uit-probleem-niet-gekozen');
    const rapportPad = join(tmp, 'r-probleem-niet-gekozen.json');
    const run = draai(['--bron', schrijfBron('niet-gekozen.json', records), '--uit', uit, '--rapport', rapportPad]);
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(uit).sort()).toEqual([`${SO_ID}.json`, 'index.json']);
    expect(run.stdout).toMatch(/Problemen in niet-gekozen sets: conflict 1, variant 1, overgeslagen 1, meerwaardig 1/);
    const rapport = leesJson<ProbleemRapport>(rapportPad);
    for (const soort of SOORTEN) {
      expect(rapport.problemen[soort].aantal, soort).toBe(1);
      expect(rapport.problemen[soort].voorbeelden[0], soort).toMatchObject({ set: 'LAGER_ONDERWIJS' });
    }
    expect(rapport.alleSets).toEqual([
      { id: 'LAGER_ONDERWIJS', naam: 'Lager onderwijs', aantal: 3, gekozen: false, problemen: 4 },
      { id: SO_ID, naam: 'Secundair onderwijs, eerste graad', aantal: 1, gekozen: true, problemen: 0 },
    ]);
  });

  it('geeft bij een lege uitkomst een eigen fout in plaats van "pas --filter aan"', () => {
    const records = [{ code: '1', onderwijsdoelenset: 'Secundair' }, { omschrijving: 'x' }, 'tekst', null, { code: 1.5, omschrijving: 'x' }];
    const uit = join(tmp, 'uit-niets');
    const rapportPad = join(tmp, 'r-niets.json');
    const run = draai(['--bron', schrijfBron('niets.json', records), '--uit', uit, '--rapport', rapportPad]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Geen enkel record had een herkenbare code en omschrijving; zie veldInventaris in het rapport/);
    expect(run.stderr).not.toMatch(/--filter/);
    expect(existsSync(uit)).toBe(false);
    const rapport = leesJson<ProbleemRapport & { records: number; veldInventaris: Record<string, number> }>(rapportPad);
    expect(rapport.records).toBe(5);
    expect(rapport.veldInventaris).toMatchObject({ code: 2, omschrijving: 2 });
    expect(rapport.problemen.overgeslagen.aantal).toBe(5);
  });

  it('geeft dezelfde uitkomst bij een omgekeerde invoervolgorde', () => {
    const omgekeerd = (paginas: ReturnType<typeof antwoord>[]) =>
      [...paginas].reverse().map((p) => antwoord([...p.gegevens.member].reverse(), p.gegevens.totalItems));
    const draaiBeide = (naam: string, voor: unknown, achter: unknown) =>
      (['voor', 'achter'] as const).map((richting) => {
        const uit = join(tmp, `uit-volgorde-${naam}-${richting}`);
        const rapportPad = join(tmp, `r-volgorde-${naam}-${richting}.json`);
        const run = draai(['--bron', schrijfBron(`volgorde-${naam}-${richting}.json`, richting === 'voor' ? voor : achter), '--uit', uit, '--rapport', rapportPad]);
        return { run, uit, rapport: leesJson<Record<string, unknown> & ProbleemRapport>(rapportPad) };
      });

    // een geslaagde ophaling: zelfde bestand, zelfde sha256, zelfde rapport
    const [a, b] = draaiBeide('goed', TWEE_PAGINAS, omgekeerd(TWEE_PAGINAS));
    expect(a.run.status, a.run.stderr).toBe(0);
    expect(b.run.status, b.run.stderr).toBe(0);
    const bestandA = leesJson<MinimumdoelenSetBestand>(join(a.uit, `${SO_ID}.json`));
    const bestandB = leesJson<MinimumdoelenSetBestand>(join(b.uit, `${SO_ID}.json`));
    expect(bestandB.doelen).toEqual(bestandA.doelen);
    expect(bestandB.set.sha256).toBe(bestandA.set.sha256);
    for (const veld of ['problemen', 'conflicten', 'alleSets', 'veldInventaris', 'typeInventaris', 'overgeslagen', 'dubbel'] as const) {
      expect(b.rapport[veld], veld).toEqual(a.rapport[veld]);
    }

    // alle soorten problemen tegelijk, in een gekozen set: zelfde uitgangscode en dezelfde voorbeelden
    const alle = [goedDoel, ...SOORTEN.flatMap((soort) => PROBLEEM[soort].records), rec('1.2', 'Derde tekst', SET_SO)];
    const [c, d] = draaiBeide('problemen', alle, [...alle].reverse());
    expect(c.run.status).toBe(3);
    expect(d.run.status).toBe(3);
    expect(d.rapport.problemen).toEqual(c.rapport.problemen);
    expect(d.rapport.conflicten).toEqual(c.rapport.conflicten);
    expect(d.run.stderr).toBe(c.run.stderr);
    expect(c.rapport.problemen.conflict.voorbeelden).toEqual([
      { set: SO_ID, code: '1.2', verschil: ['tekst'], varianten: [doelSO('1.2', 'Derde tekst'), doelSO('1.2', 'Eerste tekst'), doelSO('1.2', 'Tweede tekst')] },
    ]);

    // een setnaam met evenveel stemmen: de keuze hangt niet van de volgorde af
    const namen = [rec('1', 'a', { id: 'so_x', onderwijsdoelenset: 'Secundair B' }), rec('2', 'b', { id: 'so_x', onderwijsdoelenset: 'Secundair A' })];
    const [e, f] = draaiBeide('namen', namen, [...namen].reverse());
    expect(e.run.status, e.run.stderr).toBe(0);
    expect(leesJson<MinimumdoelenSetBestand>(join(e.uit, 'SO_X.json')).set.naam).toBe('Secundair A');
    expect(leesJson<MinimumdoelenSetBestand>(join(f.uit, 'SO_X.json')).set.naam).toBe('Secundair A');
    expect(f.rapport.waarschuwingen).toEqual(e.rapport.waarschuwingen);
  });

  it('werkt een set met een bestaand bestand altijd bij, ook als de filter hem mist', () => {
    const uit = join(tmp, 'uit-bestaand-gekozen');
    const eerst = draai(['--bron', schrijfBron('bestaand-1.json', TWEE_PAGINAS), '--uit', uit, '--rapport', join(tmp, 'r-bestaand-1.json')]);
    expect(eerst.status, eerst.stderr).toBe(0);

    const rapportPad = join(tmp, 'r-bestaand-2.json');
    const zelfde = draai(['--bron', schrijfBron('bestaand-2.json', TWEE_PAGINAS), '--uit', uit, '--rapport', rapportPad, '--filter', 'past-op-niets']);
    expect(zelfde.status, zelfde.stderr).toBe(0); // geen uitgangscode 2: er bestaat al een bestand
    const rapport = leesJson<{ ongewijzigd: string[]; alleSets: { id: string; gekozen: boolean }[] }>(rapportPad);
    expect(rapport.ongewijzigd).toEqual([SO_ID]);
    expect(rapport.alleSets.map((s) => [s.id, s.gekozen])).toEqual([['LAGER_ONDERWIJS', false], [SO_ID, true]]);

    // en een wijziging in de bron komt er dan ook door
    const gewijzigd = [antwoord([{ ...PAGINA_1[1], omschrijving: 'Eerste doel, herzien' }, PAGINA_1[0]], 2)];
    const rapportPad3 = join(tmp, 'r-bestaand-3.json');
    const run3 = draai(['--bron', schrijfBron('bestaand-3.json', gewijzigd), '--uit', uit, '--rapport', rapportPad3, '--filter', 'past-op-niets']);
    expect(run3.status, run3.stderr).toBe(0);
    expect(leesJson<{ gewijzigd: string[] }>(rapportPad3).gewijzigd).toEqual([SO_ID]);
  });

  it('meldt een set als gewijzigd wanneer enkel de kop verandert (bv. de graad op setniveau)', () => {
    const bron = (graad: string) => [1, 2].map((n) => rec(String(n), `Doel ${n}`, { id: 'so_x', onderwijsdoelenset: 'Secundair X', onderwijsstructuur: { graad } }));
    const uit = join(tmp, 'uit-kop');
    const eerst = draai(['--bron', schrijfBron('kop-1.json', bron('Eerste graad')), '--uit', uit, '--rapport', join(tmp, 'r-kop-1.json')]);
    expect(eerst.status, eerst.stderr).toBe(0);
    const voor = leesJson<MinimumdoelenSetBestand>(join(uit, 'SO_X.json'));
    expect(voor.set.graad).toBe('Eerste graad');

    const rapportPad = join(tmp, 'r-kop-2.json');
    const tweede = draai(['--bron', schrijfBron('kop-2.json', bron('Tweede graad')), '--uit', uit, '--rapport', rapportPad]);
    expect(tweede.status, tweede.stderr).toBe(0);
    const na = leesJson<MinimumdoelenSetBestand>(join(uit, 'SO_X.json'));
    expect(na.doelen).toEqual(voor.doelen); // de doelen zelf zijn niet veranderd: dezelfde sha256 ...
    expect(na.set.sha256).toBe(voor.set.sha256);
    expect(na.set.graad).toBe('Tweede graad'); // ... maar het bestand wel
    expect(leesJson<{ gewijzigd: string[]; ongewijzigd: string[] }>(rapportPad)).toMatchObject({ gewijzigd: ['SO_X'], ongewijzigd: [] });
    expect(leesJson<MinimumdoelenIndex>(join(uit, 'index.json')).sets[0].graad).toBe('Tweede graad');
    expect(controleerMap(uit)).toEqual([]);
  });

  it('haalt stuurtekens uit externe tekst in de uitvoer, zodat er geen valse logregels ontstaan', () => {
    const lastig = ['Secundair', '\n::error::nep-opdracht', String.fromCharCode(27), '[31m', String.fromCharCode(0x2028), 'einde'].join('');
    const records = [rec('1', 'a', { id: 'so_x', onderwijsdoelenset: lastig }), rec('2', 'b', { id: 'so_x', onderwijsdoelenset: 'Secundair gewoon' })];
    const rapportPad = join(tmp, 'r-stuurtekens.json');
    const run = draai(['--bron', schrijfBron('stuurtekens.json', records), '--uit', join(tmp, 'uit-stuurtekens'), '--rapport', rapportPad]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Let op: Set SO_X komt met meerdere namen voor/);
    expect(run.stdout).toContain('nep-opdracht'); // de tekst blijft leesbaar ...
    expect(run.stdout.split('\n').filter((regel) => regel.startsWith('::'))).toEqual([]); // ... maar is geen workflow-opdracht
    expect(run.stdout).not.toContain(String.fromCharCode(27));
    expect(run.stdout).not.toContain(String.fromCharCode(0x2028));
    expect(leesJson<{ waarschuwingen: string[] }>(rapportPad).waarschuwingen[0]).toContain('::error::nep-opdracht');
  });
});

// ── Integratie: de API, nagebootst met een lokale server ────────────────────

describe('haal-minimumdoelen.mjs met de API', () => {
  const SLEUTEL = 'geheime-testsleutel-12345';
  let tmp: string;
  let server: Server;
  let basis: string;
  let aanvragen: { url: string; headers: IncomingMessage['headers'] }[];
  let gedrag: (req: IncomingMessage, res: ServerResponse, pagina: number, nr: number) => void;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const standaard: typeof gedrag = (_req, res, pagina) => {
    if (pagina === 1) json(res, 200, TWEE_PAGINAS[0]);
    else if (pagina === 2) json(res, 200, TWEE_PAGINAS[1]);
    else json(res, 200, antwoord([], 6));
  };

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'minimumdoelen-api-'));
    server = createServer((req, res) => {
      aanvragen.push({ url: req.url ?? '', headers: req.headers });
      const pagina = Number(new URL(req.url ?? '', 'http://x').searchParams.get('paginanr'));
      gedrag(req, res, pagina, aanvragen.length);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}/onderwijsdoelen`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmp, { recursive: true, force: true });
  });

  async function haal(naam: string, extra: Record<string, string | undefined> = {}) {
    aanvragen = [];
    const uit = join(tmp, `uit-${naam}`);
    const rapportPad = join(tmp, `r-${naam}.json`);
    const run = await draaiAsync(['--uit', uit, '--rapport', rapportPad], {
      ONDERWIJSDOELEN_API_KEY: SLEUTEL,
      ONDERWIJSDOELEN_API_BASE: basis,
      ...extra,
    });
    return { run, uit, rapportPad };
  }

  it('vraagt de pagina\'s op met sleutel en paginering, en lekt de sleutel nergens', async () => {
    gedrag = standaard;
    const { run, uit, rapportPad } = await haal('ok');
    expect(run.status, run.stderr).toBe(0);

    expect(aanvragen.map((a) => a.url)).toEqual([
      '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=500',
      '/onderwijsdoelen/onderwijsdoel?paginanr=2&rijen_per_pagina=500',
    ]);
    for (const a of aanvragen) {
      expect(a.headers['x-api-key']).toBe(SLEUTEL);
      expect(a.headers.accept).toBe('application/json');
    }

    expect(readdirSync(uit).sort()).toEqual([`${SO_ID}.json`, 'index.json']);
    expect(controleerMap(uit)).toEqual([]);
    const bestand = leesJson<MinimumdoelenSetBestand>(join(uit, `${SO_ID}.json`));
    expect(bestand.set.api).toBe('https://onderwijs.api.vlaanderen.be/onderwijsdoelen'); // niet de testbasis
    expect(leesJson<Record<string, unknown>>(rapportPad)).toMatchObject({ bron: 'api', paginas: 2, records: 6, totalItems: 6 });

    const alles = [run.stdout, run.stderr, readFileSync(rapportPad, 'utf8'), ...readdirSync(uit).map((f) => readFileSync(join(uit, f), 'utf8'))].join('\n');
    expect(alles).not.toContain(SLEUTEL);
  });

  it('probeert het opnieuw bij 429 en 5xx', async () => {
    gedrag = (req, res, pagina, nr) => {
      if (nr === 1) json(res, 503, { fout: 'tijdelijk' });
      else if (nr === 2) json(res, 429, { fout: 'te snel' });
      else standaard(req, res, pagina, nr);
    };
    const { run, uit } = await haal('retry');
    expect(run.status, run.stderr).toBe(0);
    expect(aanvragen).toHaveLength(4); // 503, 429, pagina 1, pagina 2
    expect(run.stdout).toMatch(/opnieuw proberen \(1\/4\) na HTTP 503/);
    expect(run.stdout).toMatch(/opnieuw proberen \(2\/4\) na HTTP 429/);
    expect(controleerMap(uit)).toEqual([]);
  });

  it('geeft op na vier nieuwe pogingen', async () => {
    gedrag = (_req, res) => json(res, 500, {});
    const { run, uit } = await haal('stuk');
    expect(run.status).toBe(1);
    expect(aanvragen).toHaveLength(5);
    expect(run.stderr).toMatch(/Pagina 1 lukte niet na 4 nieuwe pogingen \(HTTP 500\)/);
    expect(existsSync(uit)).toBe(false);
  });

  it('stopt meteen bij 401 en 403', async () => {
    for (const status of [401, 403]) {
      gedrag = (_req, res) => json(res, status, { message: 'sleutel ' + SLEUTEL + ' ongeldig' });
      const { run } = await haal(`weigert-${status}`);
      expect(run.status).toBe(1);
      expect(aanvragen).toHaveLength(1);
      expect(run.stderr).toContain(`De API weigert de sleutel (HTTP ${status})`);
      expect(run.stdout + run.stderr).not.toContain(SLEUTEL);
    }
  });

  it('weigert een onvolledige ophaling', async () => {
    gedrag = (_req, res, pagina) => {
      if (pagina === 1) json(res, 200, antwoord(PAGINA_1, 10));
      else if (pagina === 2) json(res, 200, antwoord(PAGINA_2, 10));
      else json(res, 200, antwoord([], 10)); // lege pagina 3: de API heeft er minder dan beloofd
    };
    const { run, uit, rapportPad } = await haal('onvolledig');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Aantal klopt niet: 6 ontvangen, 6 uniek, totalItems = 10/);
    expect(existsSync(uit)).toBe(false);
    expect(leesJson<{ fout?: string }>(rapportPad).fout).toMatch(/Aantal klopt niet/);
  });

  it('merkt dat de API telkens dezelfde pagina geeft', async () => {
    gedrag = (_req, res) => json(res, 200, antwoord(PAGINA_1, 8));
    const { run } = await haal('zelfde');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/dezelfde records als op de vorige pagina/);
  });

  it('noemt bij een onbekend antwoord enkel de namen van de sleutels', async () => {
    gedrag = (_req, res) => json(res, 200, { bericht: 'Geen toegang tot dit geheim', code: 7 });
    const { run } = await haal('vorm');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Bovenste sleutels: bericht, code\./);
    expect(run.stderr).not.toContain('geheim');
  });

  type ApiRapport = {
    paginas: number;
    records: number;
    totalItems: number | null;
    paginaSleutels: unknown;
    veldInventaris: Record<string, number>;
    typeInventaris: Record<string, unknown>;
    alleSets: unknown[];
    fout?: string;
  };

  it('schrijft niets zonder totalItems, ook als de paginering nul-gebaseerd blijkt (exit 3, rapport gevuld)', async () => {
    // Een API die bij 0 begint te tellen: paginanr=1 geeft dan de tweede pagina en de eerste ontbreekt stil.
    const nulGebaseerd = [PAGINA_1, PAGINA_2];
    gedrag = (_req, res, pagina) => json(res, 200, { gegevens: { member: nulGebaseerd[pagina] ?? [] } });
    const { run, uit, rapportPad } = await haal('nul-gebaseerd');
    expect(run.status, run.stdout).toBe(3);
    expect(run.stderr).toMatch(/geen geldig totalItems/);
    expect(aanvragen).toHaveLength(2);
    expect(existsSync(uit)).toBe(false);
    const rapport = leesJson<ApiRapport>(rapportPad);
    expect(rapport).toMatchObject({ paginas: 2, records: 3, totalItems: null, paginaSleutels: { pagina: ['gegevens'], gegevens: ['member'] } });
    expect(Object.keys(rapport.veldInventaris).length).toBeGreaterThan(3);
    expect(Object.keys(rapport.typeInventaris).length).toBeGreaterThan(3);
    expect(rapport.alleSets).toHaveLength(1); // de eerste pagina, met de secundaire set, ontbreekt stil
    expect(rapport.fout).toMatch(/totalItems/);
  });

  it('weigert een instabiele pagina: een record dubbel, een ander ontbreekt', async () => {
    gedrag = (_req, res, pagina) => {
      if (pagina === 1) json(res, 200, antwoord(PAGINA_1, 6));
      else json(res, 200, antwoord([PAGINA_2[1], PAGINA_2[2], PAGINA_1[0]], 6)); // het record zonder code is verschoven
    };
    const { run, uit, rapportPad } = await haal('instabiel');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/1 letterlijk dubbele records: de paginering verschuift mogelijk/);
    expect(existsSync(uit)).toBe(false);
    expect(leesJson<ApiRapport>(rapportPad)).toMatchObject({ records: 6, paginas: 2 });
  });

  it('meldt een fout halverwege (404 op pagina 3) zonder iets te schrijven, met het rapport gevuld tot dan', async () => {
    gedrag = (_req, res, pagina) => {
      if (pagina === 1) json(res, 200, antwoord(PAGINA_1, 9));
      else if (pagina === 2) json(res, 200, antwoord(PAGINA_2, 9));
      else json(res, 404, { fout: 'niet gevonden' });
    };
    const { run, uit, rapportPad } = await haal('pagina-3-weg');
    expect(run.status).toBe(1);
    expect(aanvragen).toHaveLength(3); // een 404 wordt niet opnieuw geprobeerd
    expect(run.stderr).toMatch(/HTTP 404 op pagina 3/);
    expect(existsSync(uit)).toBe(false);
    const rapport = leesJson<ApiRapport>(rapportPad);
    expect(rapport).toMatchObject({ paginas: 2, records: 6, totalItems: 9, paginaSleutels: { pagina: ['gegevens'], gegevens: ['member', 'totalItems'] } });
    expect(rapport.veldInventaris).toMatchObject({ code: 5, omschrijving: 6 });
    expect(rapport.fout).toMatch(/HTTP 404/);
  });

  it('volgt geen doorverwijzing: de sleutel gaat nooit naar een andere host', async () => {
    const ander: { url: string }[] = [];
    const tweede = createServer((req, res) => {
      ander.push({ url: req.url ?? '' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(TWEE_PAGINAS[0]));
    });
    await new Promise<void>((resolve) => tweede.listen(0, '127.0.0.1', resolve));
    const herkomst = `http://127.0.0.1:${(tweede.address() as AddressInfo).port}`;
    try {
      for (const status of [301, 302, 307, 308]) {
        gedrag = (_req, res) => {
          res.writeHead(status, { location: `${herkomst}/doorgestuurd?geheim=1` });
          res.end('doorgestuurd');
        };
        const { run, uit } = await haal(`doorverwezen-${status}`);
        expect(run.status, String(status)).toBe(1);
        expect(run.stderr).toContain(`De API stuurt door (HTTP ${status} naar ${herkomst}). Het script volgt geen doorverwijzingen, want de sleutel zou meegaan.`);
        expect(run.stderr).not.toContain('doorgestuurd?geheim'); // enkel de herkomst, geen pad of query
        expect(aanvragen, 'geen nieuwe poging').toHaveLength(1);
        expect(ander, 'de tweede server kreeg een verzoek').toEqual([]);
        expect(existsSync(uit)).toBe(false);
      }
    } finally {
      await new Promise((resolve) => tweede.close(resolve));
    }
  });

  it('schrijft niets als de gegevens de sleutel bevatten, en zet hem nergens in het rapport', async () => {
    gedrag = (_req, res) => json(res, 200, antwoord([rec('1.2', 'Eerste doel', SET_SO, { toelichting: `Let op: ${SLEUTEL} staat in de tekst` })], 1));
    const { run, uit, rapportPad } = await haal('sleutel-in-gegevens');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/gegevens bevatten de API-sleutel\. Er is niets geschreven/);
    expect(existsSync(uit)).toBe(false);
    expect([run.stdout, run.stderr, readFileSync(rapportPad, 'utf8')].join('\n')).not.toContain(SLEUTEL);
    expect(leesJson<ApiRapport>(rapportPad).fout).toMatch(/API-sleutel/);
  });

  it('haalt de sleutel, ook in geëscapete vorm, uit het rapport (bv. in een voorbeeld van een probleem)', async () => {
    for (const sleutel of [SLEUTEL, 'sleutel-met-"aanhaling"-en-\\streep']) {
      gedrag = (_req, res) => json(res, 200, antwoord([rec('1.2', `Eerste ${sleutel}`, SET_SO), rec('1.2', 'Tweede tekst', SET_SO)], 2));
      const { run, uit, rapportPad } = await haal('sleutel-in-rapport', { ONDERWIJSDOELEN_API_KEY: sleutel });
      expect(run.status, run.stderr).toBe(3);
      expect(existsSync(uit)).toBe(false);
      const rapport = readFileSync(rapportPad, 'utf8');
      expect(rapport).not.toContain(sleutel);
      expect(rapport).not.toContain(JSON.stringify(sleutel).slice(1, -1));
      expect(rapport).toContain('Eerste ***');
      expect(run.stdout + run.stderr).not.toContain(sleutel);
    }
  });

  it('eist de sleutel: duidelijke fout, uitgangscode 1 en geen stacktrace', async () => {
    gedrag = standaard;
    aanvragen = [];
    const run = await draaiAsync(['--uit', join(tmp, 'uit-zonder'), '--rapport', join(tmp, 'r-zonder.json')]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/ONDERWIJSDOELEN_API_KEY ontbreekt/);
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(aanvragen).toHaveLength(0);
    expect(existsSync(join(tmp, 'uit-zonder'))).toBe(false);
  });
});

// ── Datatest: de meegeleverde bestanden ─────────────────────────────────────
//
// De map public/leerplannen/minimumdoelen wordt pas door de workflow "minimumdoelen" gevuld. Bestaat de
// map niet of staat er geen enkel .json-bestand in, dan is er niets te controleren en wordt de groep
// overgeslagen. Daarna blokkeert een kapot bestand (dubbele code, lege tekst, verkeerd aantal, sha256 die
// niet klopt) de uitrol. Staan er wel .json-bestanden maar geen index.json, dan faalt de test: zo valt
// een hernoemde of verdwenen index op in plaats van dat de hele controle stilletjes wegvalt.

const jsonBestanden = existsSync(DATA_MAP) ? readdirSync(DATA_MAP).filter((f) => f.endsWith('.json')) : [];
const heeftIndex = jsonBestanden.includes('index.json');
const ingangen = heeftIndex ? leesJson<MinimumdoelenIndex>(join(DATA_MAP, 'index.json')).sets : [];

it.runIf(jsonBestanden.length > 0 && !heeftIndex)('index.json ontbreekt terwijl er setbestanden staan', () => {
  expect.fail(`public/leerplannen/minimumdoelen bevat ${jsonBestanden.join(', ')} maar geen index.json`);
});

describe.runIf(heeftIndex)('meegeleverde minimumdoelen (public/leerplannen/minimumdoelen)', () => {
  it('de index is in orde en alle setbestanden staan erin', () => {
    expect(controleerIndex(DATA_MAP)).toEqual([]);
  });

  for (const ingang of ingangen) {
    it(`${ingang.id}: bestand, kop, doelen en sha256 kloppen`, () => {
      expect(controleerSet(DATA_MAP, ingang)).toEqual([]);
    });
  }
});
