import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canoniek, vergelijkCodes } from './minimumdoelen';
import {
  GROEP_NUMMER,
  KOPPEL_PARAMETER,
  STRUCTUUR_API,
  STRUCTUUR_BRON,
  STRUCTUUR_NAAMSVERMELDING,
  groepnummersVanDoel,
  isAfgebouwd,
  jaarVan,
  kruiscontrole,
  lijstVanPagina,
  normaliseerGroep,
  onderwijssoortVanRecord,
  soortVanGroep,
  stroomVanEersteGraad,
  totaalVanPagina,
  valideerMatrixBestand,
  valideerRichtingDoelenBestand,
  valideerRichtingDoelenIndex,
  vergelijkGroepnummer,
  vergelijkNatuurlijk,
  volgendeLink,
  type MatrixBestand,
  type RichtingDoelenBestand,
  type RichtingDoelenIndex,
  type RichtingDoelenSet,
  type StudierichtingGroep,
  type Structuuronderdeel,
} from './studierichtingen';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODULE = join(ROOT, 'src', 'lib', 'studierichtingen.ts');
const MINIMUMDOELEN = join(ROOT, 'public', 'leerplannen', 'minimumdoelen');
const MINIMUMDOELEN_INDEX = join(MINIMUMDOELEN, 'index.json');
const ODS_3116 = join(MINIMUMDOELEN, 'ODS_3116.json');
const API_SO = `${STRUCTUUR_API}/structuuronderdeel`;
const DOELEN_BRON = 'https://www.onderwijsdoelen.be/';
const DOELEN_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)';

function sha256Van(waarde: unknown): string {
  return createHash('sha256').update(canoniek(waarde), 'utf8').digest('hex');
}

function kopie<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

/** Normaliseert en eist dat er geen problemen zijn. */
function normaal(raw: unknown): { groep: StudierichtingGroep; onderdelen: Structuuronderdeel[] } {
  const uit = normaliseerGroep(raw);
  expect(uit.problemen).toEqual([]);
  if (uit.groep === undefined) throw new Error('geen groep');
  return { groep: uit.groep, onderdelen: uit.onderdelen };
}

// ── Fixtures in de vorm van de echte API (docs/ONDERWIJS-API.md § 2, verkenning run 2 en 3) ──

const code = (c: string, omschrijving = 'x') => ({ code: c, omschrijving });
const HOOFD_GEWOON = [code('311', 'Secundair onderwijs'), code('321', 'Buitengewoon secundair onderwijs')];
/** Wat van HOOFD_GEWOON in `extra` komt: de omschrijvingen, op de plaats van de gesorteerde codes. */
const REST_HOOFD_GEWOON = { hoofdstructuren: [{ omschrijving: 'Secundair onderwijs' }, { omschrijving: 'Buitengewoon secundair onderwijs' }] };
const leerjaar = (c: string, begindatum = '2021-09-01') => ({ code: c, omschrijving: c === '1' ? 'Eerste leerjaar' : 'Tweede leerjaar', begindatum });

/** G-0001 bijna letterlijk zoals de API het gaf: een gewone en een duale variant. */
const G0001 = {
  structuuronderdeel_groep_nummer: 'G-0001',
  titel: 'Afwerking bouw',
  finaliteit: { code: 'A', omschrijving: 'Arbeidsmarktfinaliteit' },
  graad: { code: '3', omschrijving: 'Derde graad' },
  onderwijsniveau: { code: '3', omschrijving: 'Secundair Onderwijs' },
  soort_leerjaar: { code: '1', omschrijving: 'Leerjaar' },
  structuuronderdelen: [
    {
      structuuronderdeel_nummer: 1,
      titel: 'Afwerking bouw duaal',
      api_url: `${API_SO}/1`,
      begindatum: '2017-09-01',
      ov4_mogelijk: true,
      studierichting_nummer_oud: '1099',
      duaal: true,
      aanloop: false,
      discipline: 'Hout en bouw',
      coefficient: 3.05,
      stem_classificatie: 'STEM',
      niche: false,
      datum_laatste_wijziging: '2026-09-08',
      onderwijsvorm: { code: 'BSO', omschrijving: 'Beroepssecundair onderwijs' },
      studiedomein: { code: '2', omschrijving: 'STEM' },
      voorbereidende_structuuronderdelen: [{ structuuronderdeel_nummer: 564, titel: 'Aanloop afwerking bouw duaal', api_url: `${API_SO}/564` }],
      onderwijsstelsels: [code('L', 'Lineair'), code('M', 'Modulair')],
      instellingstypes: [code('122'), code('123'), code('121'), code('126'), code('125')],
      hoofdstructuren: [code('311', 'Secundair onderwijs'), code('312'), code('315'), code('321')],
      leerjaren: [leerjaar('1', '2017-09-01'), leerjaar('2', '2017-09-01')],
      structuuronderdeel_details: [
        { structuuronderdeel_detail_nummer: 'ADV-1193', structuuronderdeel_detail_versie: 'S-1-V1', begindatum: '2017-09-01', einddatum: '2024-08-31', status: code('ERKEND', 'Erkend') },
        { structuuronderdeel_detail_nummer: 'ADV-1608', structuuronderdeel_detail_versie: 'S-1-V2', begindatum: '2023-09-01', status: code('ERKEND', 'Erkend') },
      ],
    },
    {
      structuuronderdeel_nummer: 505,
      titel: 'Afwerking bouw',
      api_url: `${API_SO}/505`,
      begindatum: '2023-09-01',
      ov4_mogelijk: true,
      studierichting_nummer_oud: '1432',
      duaal: false,
      discipline: 'Hout en bouw',
      coefficient: 3.05,
      stem_classificatie: 'STEM',
      niche: false,
      datum_laatste_wijziging: '2026-09-08',
      onderwijsvorm: { code: 'BSO', omschrijving: 'Beroepssecundair onderwijs' },
      studiedomein: { code: '2', omschrijving: 'STEM' },
      onderwijsstelsels: [code('L', 'Lineair')],
      instellingstypes: [code('121'), code('122'), code('126')],
      hoofdstructuren: HOOFD_GEWOON,
      leerjaren: [leerjaar('1', '2023-09-01'), leerjaar('2', '2024-09-01')],
      structuuronderdeel_details: [
        { structuuronderdeel_detail_nummer: 'ADV-0843', structuuronderdeel_detail_versie: 'S-505-V1', begindatum: '2023-09-01', status: code('ERKEND', 'Erkend') },
      ],
    },
  ],
};

function toerismeOnderdeel(nr: number, domein: string, oud: string) {
  return {
    structuuronderdeel_nummer: nr,
    titel: 'Toerisme',
    api_url: `${API_SO}/${nr}`,
    begindatum: '2021-09-01',
    ov4_mogelijk: true,
    studierichting_nummer_oud: oud,
    duaal: false,
    stem_classificatie: 'NIET-STEM',
    discipline: 'Toerisme, taal en cultuur',
    onderwijsvorm: code('TSO', 'Technisch secundair onderwijs'),
    studiedomein: { code: '9', omschrijving: domein },
    hoofdstructuren: HOOFD_GEWOON,
    // bewust in de verkeerde volgorde
    leerjaren: [leerjaar('2'), leerjaar('1')],
  };
}

/** Toerisme (2de graad): één richting in drie studiedomeinen, drie nummers. Bewust door elkaar. */
const G0280 = {
  structuuronderdeel_groep_nummer: 'G-0280',
  titel: 'Toerisme',
  finaliteit: code('DU', 'Dubbele finaliteit'),
  graad: code('2', 'Tweede graad'),
  structuuronderdelen: [
    toerismeOnderdeel(345, 'VOEDING EN HORECA', '1332'),
    toerismeOnderdeel(343, 'ECONOMIE EN ORGANISATIE', '1330'),
    toerismeOnderdeel(344, 'TAAL EN CULTUUR', '1331'),
  ],
};

/** BuSO zonder graad, met de opleidingsvorm als tekst en een onderdeel met een opvolger. */
const G0009 = {
  structuuronderdeel_groep_nummer: 'G-0009',
  titel: 'Assistent plantaardige productie',
  finaliteit: code('A', 'Arbeidsmarktfinaliteit'),
  opleidingsvorm: 'Beroepsonderwijs',
  structuuronderdelen: [
    {
      structuuronderdeel_nummer: 11,
      titel: 'Assistent plantaardige productie duaal',
      begindatum: '2019-09-01',
      einddatum: '2025-08-31',
      duaal: true,
      fase_buso: code('I'),
      hoofdstructuren: [code('321')],
      leerjaren: [{ code: '1', omschrijving: 'Eerste leerjaar', begindatum: '2019-09-01', einddatum: '2025-08-31' }],
      historiek_structuuronderdelen: { volgende_structuuronderdelen: [{ structuuronderdeel_nummer: 931, titel: 'x', api_url: `${API_SO}/931` }] },
    },
    {
      structuuronderdeel_nummer: 931,
      titel: 'Assistent plantaardige productie duaal',
      begindatum: '2025-09-01',
      duaal: true,
      fase_buso: code('I'),
      hoofdstructuren: [code('321')],
      leerjaren: [leerjaar('1', '2025-09-01')],
      historiek_structuuronderdelen: { vorige_structuuronderdelen: [{ structuuronderdeel_nummer: 11 }] },
    },
  ],
};

/** 7de jaar (Animator), afgebouwd sinds 2025-08-31, met een opvolger en een onbekend veld. */
const G0002 = {
  structuuronderdeel_groep_nummer: 'G-0002',
  titel: 'Animator',
  graad: code('3', 'Derde graad'),
  onderwijsniveau: code('3', 'Secundair Onderwijs'),
  soort_leerjaar: code('1', 'Leerjaar'),
  type_7de_leerjaar: { code: 'BSO_TIJDELIJK', omschrijving: '7de leerjaar gericht op instroom arbeidsmarkt bso (geldig tot 31/8/2025)' },
  structuuronderdelen: [
    {
      structuuronderdeel_nummer: 2,
      titel: 'Animator duaal',
      api_url: `${API_SO}/2`,
      begindatum: '2020-09-01',
      einddatum: '2025-08-31',
      ov4_mogelijk: true,
      studierichting_nummer_oud: '1257',
      duaal: true,
      aanloop: false,
      discipline: 'Administratie en distributie',
      coefficient: 2.45,
      stem_classificatie: 'NIET-STEM',
      niche: true,
      aantal_semesters_7de_leerjaar: 2,
      datum_laatste_wijziging: '2025-07-30',
      onderwijsvorm: code('BSO', 'Beroepssecundair onderwijs'),
      hoofdstructuren: [code('311'), code('312'), code('315'), code('321')],
      leerjaren: [{ code: '3', omschrijving: 'Derde leerjaar', begindatum: '2020-09-01', einddatum: '2025-08-31' }],
      historiek_structuuronderdelen: {
        volgende_structuuronderdelen: [{ structuuronderdeel_nummer: 680, titel: 'Animator duaal', api_url: `${API_SO}/680` }],
      },
    },
  ],
};

/** Eerste leerjaar A (1ste graad, geen finaliteit). */
const G0307 = {
  structuuronderdeel_groep_nummer: 'G-0307',
  titel: 'Eerste leerjaar A',
  graad: code('1', 'Eerste graad'),
  structuuronderdelen: [
    { structuuronderdeel_nummer: 379, titel: 'Eerste leerjaar A', begindatum: '2019-09-01', stem_classificatie: 'Niet van toepassing', hoofdstructuren: HOOFD_GEWOON, leerjaren: [leerjaar('1', '2019-09-01')] },
  ],
};

/** OKAN: hoofdstructuur 311, maar geen graad (echte gegevens). */
const G0561 = {
  structuuronderdeel_groep_nummer: 'G-0561',
  titel: 'Onthaalonderwijs voor anderstalige nieuwkomers',
  structuuronderdelen: [
    { structuuronderdeel_nummer: 923, titel: 'Onthaaljaar voor anderstalige nieuwkomers', begindatum: '1994-09-01', hoofdstructuren: [code('311')], leerjaren: [leerjaar('1', '1994-09-01')] },
  ],
};

/** Natuurwetenschappen met velden als tekst, als getal en als lijst met één element, en `__proto__`. */
const G0193_TEKST = `{
  "structuuronderdeel_groep_nummer": " G-0193 ",
  "titel": "Natuurwetenschappen",
  "graad": ["2"],
  "finaliteit": "DO",
  "onderwijsniveau": "Secundair Onderwijs",
  "soort_leerjaar": [{"code": "1", "omschrijving": "Leerjaar"}],
  "nieuw_groepveld": {"a": 1},
  "__proto__": {"vervuild": true},
  "structuuronderdelen": {
    "structuuronderdeel_nummer": "247",
    "titel": "Natuurwetenschappen",
    "api_url": "${API_SO}/247",
    "onderwijsvorm": "ASO",
    "studiedomein": "DOMEINOVERSCHRIJDEND",
    "stem_classificatie": [{"code": "STEM"}],
    "ov4_mogelijk": "true",
    "begindatum": "2021-09-01T00:00:00Z",
    "hoofdstructuren": ["311", 321],
    "leerjaren": ["2", {"code": 1}],
    "nieuw_veld": "  iets  ",
    "leeg_veld": "   ",
    "null_veld": null,
    "__proto__": {"ook": "vervuild"}
  }
}`;

// ── Laadbaar in Node ────────────────────────────────────────────────────────

describe('laden', () => {
  it('laadt in Node zonder bundler (type stripping), zoals het ophaalscript het doet', () => {
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./src/lib/studierichtingen.ts')"], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }),
    ).not.toThrow();
    const uit = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const m = await import('./src/lib/studierichtingen.ts'); console.log(typeof m.normaliseerGroep, m.vergelijkGroepnummer('G-0009', 'G-0010'))"],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    );
    expect(uit.trim()).toBe('function -1');
  }, 30_000);

  it('heeft geen imports (pure module)', () => {
    const bron = readFileSync(MODULE, 'utf8');
    expect(bron).not.toMatch(/^\s*import\s/m);
    expect(bron).not.toMatch(/\brequire\(/);
  });
});

// ── Sorteren ────────────────────────────────────────────────────────────────

describe('vergelijkGroepnummer en vergelijkNatuurlijk', () => {
  it('sorteert groepnummers numeriek: G-0009 < G-0010 < G-01000', () => {
    const lijst = ['G-01000', 'G-0010', 'G-0193', 'G-0009', 'G-0117'];
    expect([...lijst].sort(vergelijkGroepnummer)).toEqual(['G-0009', 'G-0010', 'G-0117', 'G-0193', 'G-01000']);
    expect(vergelijkGroepnummer('G-0009', 'G-0010')).toBeLessThan(0);
    expect(vergelijkGroepnummer('G-0010', 'G-01000')).toBeLessThan(0);
    expect(vergelijkGroepnummer('G-0193', 'G-0193')).toBe(0);
  });

  it('sorteert ids en codes natuurlijk, zoals vergelijkCodes', () => {
    expect(['10', '9', '100', '91020', '1'].sort(vergelijkNatuurlijk)).toEqual(['1', '9', '10', '100', '91020']);
    expect(vergelijkNatuurlijk('1.2', '1.10')).toBeLessThan(0);
    expect(vergelijkNatuurlijk('9.2', '10.1')).toBeLessThan(0);
    expect(vergelijkNatuurlijk('ODS_999', 'ODS_3132')).toBeLessThan(0);
    const codes = ['1.10', '1.2', '10.1', '9.2', '1.1.1', '07.01', '7.1', '08.01.01', '8.1', '12', '2', '120', '91020', '90011'];
    for (const a of codes) {
      for (const b of codes) {
        if (a === b) continue;
        // Zelfde richting als vergelijkCodes waar die een verschil ziet.
        const c = vergelijkCodes(a, b);
        if (c !== 0) expect(Math.sign(vergelijkNatuurlijk(a, b))).toBe(Math.sign(c));
      }
    }
  });

  it('is een totale orde: nooit 0 voor verschillende teksten, antisymmetrisch en transitief', () => {
    const lijst = ['', '0', '00', '01', '1', '1a', '01a', 'a', 'A', 'a1', 'ab', 'G-0009', 'G-9', 'G-00009', 'G-0010', '1.2', '1.10', '1-2', 'ODS_3132', 'x10y2', 'x10y10', 'x9', ' 1', 'é'];
    for (const a of lijst) {
      for (const b of lijst) {
        const ab = Math.sign(vergelijkNatuurlijk(a, b));
        expect(Math.sign(vergelijkNatuurlijk(b, a))).toBe(ab === 0 ? 0 : -ab);
        if (a !== b) expect(ab).not.toBe(0);
        for (const c of lijst) {
          if (ab < 0 && vergelijkNatuurlijk(b, c) < 0) expect(vergelijkNatuurlijk(a, c)).toBeLessThan(0);
        }
      }
    }
  });
});

// ── normaliseerGroep ────────────────────────────────────────────────────────

describe('normaliseerGroep', () => {
  it('G-0001: een gewone en een duale variant, alle velden zoals de API ze geeft', () => {
    const { groep, onderdelen } = normaal(G0001);
    expect(groep).toStrictEqual({
      nummer: 'G-0001',
      titel: 'Afwerking bouw',
      graad: '3',
      finaliteit: 'A',
      onderwijsniveau: 'Secundair Onderwijs',
      soortLeerjaar: 'Leerjaar',
      onderdelen: [1, 505],
    });
    expect(onderdelen.map((o) => o.nummer)).toEqual([1, 505]);
    expect(onderdelen[0]).toStrictEqual({
      nummer: 1,
      groep: 'G-0001',
      titel: 'Afwerking bouw duaal',
      onderwijsvorm: 'BSO',
      studiedomein: { code: '2', omschrijving: 'STEM' },
      stem: 'STEM',
      discipline: 'Hout en bouw',
      coefficient: 3.05,
      duaal: true,
      ov4: true,
      begindatum: '2017-09-01',
      leerjaren: [
        { code: '1', omschrijving: 'Eerste leerjaar', begindatum: '2017-09-01' },
        { code: '2', omschrijving: 'Tweede leerjaar', begindatum: '2017-09-01' },
      ],
      hoofdstructuren: ['311', '312', '315', '321'],
      onderwijsstelsels: ['L', 'M'],
      instellingstypes: ['121', '122', '123', '125', '126'],
      erkenningen: [
        { nummer: 'ADV-1193', versie: 'S-1-V1', status: 'ERKEND', begindatum: '2017-09-01', einddatum: '2024-08-31' },
        { nummer: 'ADV-1608', versie: 'S-1-V2', status: 'ERKEND', begindatum: '2023-09-01' },
      ],
      voorbereidend: [564],
      oudNummer: '1099',
      laatsteWijziging: '2026-09-08',
      // De omschrijvingen uit de lijsten blijven bewaard, op de plaats van het gesorteerde element.
      extra: {
        hoofdstructuren: [{ omschrijving: 'Secundair onderwijs' }, { omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }],
        instellingstypes: [{ omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }],
        onderwijsstelsels: [{ omschrijving: 'Lineair' }, { omschrijving: 'Modulair' }],
        structuuronderdeel_details: [{ status: { omschrijving: 'Erkend' } }, { status: { omschrijving: 'Erkend' } }],
      },
    });
    // `aanloop: false` en `niche: false` vallen weg; de gewone variant is niet duaal.
    expect(onderdelen[1].duaal).toBeUndefined();
    expect(onderdelen[1].aanloop).toBeUndefined();
    expect(onderdelen[1].niche).toBeUndefined();
    expect(onderdelen[1].ov4).toBe(true);
    // `api_url` valt weg, ook niet in `extra`.
    for (const o of onderdelen) expect(Object.prototype.hasOwnProperty.call(o.extra ?? {}, 'api_url')).toBe(false);
    expect(JSON.stringify(onderdelen)).not.toContain('api_url');
  });

  it('Toerisme: één richting in drie studiedomeinen geeft drie onderdelen, gesorteerd', () => {
    const { groep, onderdelen } = normaal(G0280);
    expect(groep.onderdelen).toEqual([343, 344, 345]);
    expect(onderdelen.map((o) => o.studiedomein?.omschrijving)).toEqual(['ECONOMIE EN ORGANISATIE', 'TAAL EN CULTUUR', 'VOEDING EN HORECA']);
    expect(onderdelen.map((o) => o.oudNummer)).toEqual(['1330', '1331', '1332']);
    expect(onderdelen.every((o) => o.groep === 'G-0280' && o.titel === 'Toerisme')).toBe(true);
    // leerjaren gesorteerd op code
    expect(onderdelen[0].leerjaren.map((l) => l.code)).toEqual(['1', '2']);
    expect(groep.graad).toBe('2');
    expect(groep.finaliteit).toBe('DU');
  });

  it('BuSO zonder graad: opleidingsvorm als tekst wordt {omschrijving}, historiek wordt nummers', () => {
    const { groep, onderdelen } = normaal(G0009);
    expect(groep.graad).toBeUndefined();
    expect(groep.opleidingsvorm).toStrictEqual({ omschrijving: 'Beroepsonderwijs' });
    expect(groep.onderdelen).toEqual([11, 931]);
    expect(onderdelen[0].volgende).toEqual([931]);
    expect(onderdelen[0].vorige).toBeUndefined();
    expect(onderdelen[1].vorige).toEqual([11]);
    expect(onderdelen[0].faseBuso).toBe('I');
    expect(onderdelen[0].hoofdstructuren).toEqual(['321']);
    expect(soortVanGroep(groep, onderdelen)).toBe('buso');
  });

  it('7de jaar met een leerjaar met einddatum, een opvolger en een onbekend veld in extra', () => {
    const { groep, onderdelen } = normaal(G0002);
    expect(groep.type7).toBe('BSO_TIJDELIJK');
    expect(groep.finaliteit).toBeUndefined();
    const [o] = onderdelen;
    expect(o.einddatum).toBe('2025-08-31');
    expect(o.leerjaren).toStrictEqual([{ code: '3', omschrijving: 'Derde leerjaar', begindatum: '2020-09-01', einddatum: '2025-08-31' }]);
    expect(o.volgende).toEqual([680]);
    expect(o.niche).toBe(true);
    expect(o.extra).toStrictEqual({
      aantal_semesters_7de_leerjaar: 2,
      hoofdstructuren: [{ omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }, { omschrijving: 'x' }],
    });
    expect(soortVanGroep(groep, onderdelen)).toBe('zevende');
    expect(jaarVan(groep.graad, o.leerjaren[0].code)).toBe(7);
    expect(isAfgebouwd(o, '2026-10-09')).toBe(true);
  });

  it('tekst, getal, object en een lijst met één element; onbekend veld naar extra; api_url weg; __proto__ veilig', () => {
    const raw: unknown = JSON.parse(G0193_TEKST);
    const { groep, onderdelen } = normaal(raw);
    expect(groep.nummer).toBe('G-0193');
    expect(groep.graad).toBe('2');
    expect(groep.finaliteit).toBe('DO');
    expect(groep.soortLeerjaar).toBe('Leerjaar');
    expect(groep.onderwijsniveau).toBe('Secundair Onderwijs');
    const [o] = onderdelen;
    expect(o.nummer).toBe(247);
    expect(o.onderwijsvorm).toBe('ASO');
    expect(o.studiedomein).toStrictEqual({ omschrijving: 'DOMEINOVERSCHRIJDEND' });
    expect(o.stem).toBe('STEM');
    expect(o.ov4).toBe(true);
    expect(o.begindatum).toBe('2021-09-01');
    expect(o.hoofdstructuren).toEqual(['311', '321']);
    expect(o.leerjaren).toEqual([{ code: '1' }, { code: '2' }]);

    // Onbekende velden: getrimd in extra; lege tekst en null vallen weg; api_url valt weg.
    expect(Object.keys(o.extra ?? {}).sort()).toEqual(['__proto__', 'nieuw_veld']);
    expect(o.extra?.nieuw_veld).toBe('iets');
    expect(Object.keys(groep.extra ?? {}).sort()).toEqual(['__proto__', 'nieuw_groepveld']);

    // __proto__ is een gewoon veld geworden, geen prototype.
    for (const extra of [groep.extra, o.extra]) {
      expect(extra).toBeDefined();
      expect(Object.getPrototypeOf(extra)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(extra, '__proto__')).toBe(true);
    }
    expect(Object.getOwnPropertyDescriptor(groep.extra, '__proto__')?.value).toEqual({ vervuild: true });
    expect((groep.extra as Record<string, unknown>).vervuild).toBeUndefined();
    expect(({} as Record<string, unknown>).vervuild).toBeUndefined();
    expect(({} as Record<string, unknown>).ook).toBeUndefined();
  });

  it('een nummer als tekst "505" wordt 505; "abc" is een probleem en valt weg', () => {
    const uit = normaliseerGroep({
      ...G0001,
      structuuronderdelen: [
        { structuuronderdeel_nummer: '505', titel: 'Afwerking bouw', hoofdstructuren: HOOFD_GEWOON },
        { structuuronderdeel_nummer: 'abc', titel: 'Kapot', hoofdstructuren: HOOFD_GEWOON },
      ],
    });
    expect(uit.onderdelen.map((o) => o.nummer)).toEqual([505]);
    expect(uit.groep?.onderdelen).toEqual([505]);
    expect(uit.problemen).toHaveLength(1);
    expect(uit.problemen[0]).toMatch(/G-0001.*"abc".*geen geheel getal/);
  });

  it('een onderdeel zonder nummer, met 0, met een kommagetal of geen object: telkens een probleem', () => {
    const uit = normaliseerGroep({
      ...G0001,
      structuuronderdelen: [{ titel: 'Zonder nummer' }, { structuuronderdeel_nummer: 0, titel: 'Nul' }, { structuuronderdeel_nummer: 2.5, titel: 'Komma' }, 'tekst', { structuuronderdeel_nummer: 7, titel: 'Goed' }],
    });
    expect(uit.onderdelen.map((o) => o.nummer)).toEqual([7]);
    expect(uit.problemen).toHaveLength(4);
    expect(uit.problemen[0]).toMatch(/Zonder nummer.*geen nummer/);
  });

  it('een dubbel onderdeel is een probleem; het staat er maar één keer in', () => {
    const uit = normaliseerGroep({
      ...G0280,
      structuuronderdelen: [toerismeOnderdeel(343, 'A', '1'), toerismeOnderdeel(344, 'B', '2'), toerismeOnderdeel(343, 'A', '1')],
    });
    expect(uit.groep?.onderdelen).toEqual([343, 344]);
    expect(uit.onderdelen).toHaveLength(2);
    expect(uit.problemen).toEqual(['Groep G-0280: onderdeel 343 staat er meer dan één keer in.']);
  });

  it('een groep zonder geldig nummer geeft geen groep en een probleem', () => {
    for (const nummer of [undefined, '', 'G-12', 'g-0001', 'G-0001x', 1, ['G-0001', 'G-0002']]) {
      const uit = normaliseerGroep({ ...G0001, structuuronderdeel_groep_nummer: nummer });
      expect(uit.groep).toBeUndefined();
      expect(uit.onderdelen).toEqual([]);
      expect(uit.problemen).toHaveLength(1);
      expect(uit.problemen[0]).toMatch(/Afwerking bouw.*geen geldig nummer/);
    }
    expect(normaliseerGroep(null).problemen).toEqual(['Een groep is geen object (null).']);
    expect(normaliseerGroep([G0001]).problemen[0]).toMatch(/geen object/);
  });

  it('een groep zonder onderdelen of zonder titel is een probleem', () => {
    expect(normaliseerGroep({ structuuronderdeel_groep_nummer: 'G-0100', titel: 'Leeg' }).problemen).toEqual(['Groep G-0100: de groep heeft geen onderdelen.']);
    expect(normaliseerGroep({ structuuronderdeel_groep_nummer: 'G-0100', titel: 'Leeg', structuuronderdelen: [] }).problemen).toHaveLength(1);
    const zonderTitel = normaliseerGroep({ ...G0307, titel: '  ' });
    expect(zonderTitel.problemen).toEqual(['Groep G-0307: de titel ontbreekt.']);
  });

  it('wat nodig is maar niet te lezen valt (graad, datum, ja/nee, verwijzing, leerjaar, hoofdstructuur): probleem, en de waarde blijft in extra', () => {
    const gevallen: [Record<string, unknown>, Record<string, unknown>, RegExp][] = [
      [{ graad: code('4', 'Vierde graad') }, {}, /onbekende graad/],
      [{ graad: [code('2'), code('3')] }, {}, /"graad" heeft meer dan één waarde/],
      [{ graad: true }, {}, /"graad" heeft een onbekende vorm/],
      [{ type_7de_leerjaar: [code('A'), code('B')] }, {}, /type_7de_leerjaar/],
      [{}, { einddatum: '31/08/2025' }, /"einddatum" is geen geldige datum/],
      [{}, { begindatum: '2025-02-30' }, /"begindatum" is geen geldige datum/],
      [{}, { aanloop: 'misschien' }, /"aanloop" is geen ja\/nee-waarde/],
      [{}, { ov4_mogelijk: { ja: 1 } }, /"ov4_mogelijk" is geen ja\/nee-waarde/],
      [{}, { vervolg_structuuronderdelen: [{ structuuronderdeel_nummer: 'x' }] }, /vervolg_structuuronderdelen/],
      [{}, { historiek_structuuronderdelen: { volgende_structuuronderdelen: [{ titel: 'zonder nummer' }] } }, /volgende_structuuronderdelen/],
      [{}, { leerjaren: [{ omschrijving: 'zonder code' }] }, /"leerjaren"/],
      [{}, { leerjaren: [{ code: '1', einddatum: 'morgen' }] }, /"leerjaren"/],
      [{}, { leerjaren: [{ code: '1', begindatum: ['2021-09-01', '2022-09-01'] }] }, /"leerjaren"/],
      [{}, { leerjaren: [{ code: '1', semesters: 1 }, { code: '1', semesters: 2 }] }, /"leerjaren" staat een leerjaar meer dan één keer, met andere gegevens/],
      [{}, { hoofdstructuren: [code('311', 'Secundair onderwijs'), code('311', 'Gewoon secundair onderwijs')] }, /"hoofdstructuren" staat een code meer dan één keer, met andere gegevens/],
      [{}, { hoofdstructuren: [{ omschrijving: 'Secundair onderwijs' }] }, /"hoofdstructuren"/],
    ];
    for (const [groepVelden, onderdeelVelden, melding] of gevallen) {
      const raw = { ...G0307, ...groepVelden, structuuronderdelen: [{ ...G0307.structuuronderdelen[0], ...onderdeelVelden }] };
      const uit = normaliseerGroep(raw);
      expect(uit.problemen, JSON.stringify(groepVelden) + JSON.stringify(onderdeelVelden)).toHaveLength(1);
      expect(uit.problemen[0]).toMatch(melding);
      const opGroep = Object.keys(groepVelden).length > 0;
      const [sleutel] = Object.keys(opGroep ? groepVelden : onderdeelVelden);
      const extra = opGroep ? uit.groep?.extra : uit.onderdelen[0]?.extra;
      if (sleutel === 'historiek_structuuronderdelen') {
        expect(extra?.historiek_structuuronderdelen).toEqual({ volgende_structuuronderdelen: [{ titel: 'zonder nummer' }] });
      } else {
        expect(extra?.[sleutel], sleutel).toEqual(opGroep ? groepVelden[sleutel] : onderdeelVelden[sleutel]);
      }
    }
  });

  it('een veld dat niet nodig is en niet te lezen valt, gaat zonder probleem naar extra', () => {
    const uit = normaliseerGroep({
      ...G0307,
      finaliteit: [code('DO'), code('DU')],
      structuuronderdelen: [{ ...G0307.structuuronderdelen[0], coefficient: 'veel', niche: 'soms', datum_laatste_wijziging: 'gisteren', instellingstypes: [{ omschrijving: 'zonder code' }] }],
    });
    expect(uit.problemen).toEqual([]);
    expect(uit.groep?.finaliteit).toBeUndefined();
    expect(uit.groep?.extra).toStrictEqual({ finaliteit: [code('DO'), code('DU')] });
    const [o] = uit.onderdelen;
    expect(o.coefficient).toBeUndefined();
    expect(o.niche).toBeUndefined();
    expect(o.instellingstypes).toBeUndefined();
    expect(o.extra).toStrictEqual({
      ...REST_HOOFD_GEWOON,
      coefficient: 'veel',
      datum_laatste_wijziging: 'gisteren',
      instellingstypes: [{ omschrijving: 'zonder code' }],
      niche: 'soms',
    });
  });

  it('lege waarden tellen als ontbrekend: null, lege tekst, lege lijst, leeg object', () => {
    const { groep, onderdelen } = normaal({
      ...G0307,
      finaliteit: { code: null, omschrijving: '' },
      type_7de_leerjaar: null,
      opleidingsvorm: [],
      structuuronderdelen: [{ ...G0307.structuuronderdelen[0], einddatum: '', voorbereidende_structuuronderdelen: [], historiek_structuuronderdelen: { vorige_structuuronderdelen: [], volgende_structuuronderdelen: [] } }],
    });
    expect(groep.finaliteit).toBeUndefined();
    expect(groep.type7).toBeUndefined();
    expect(groep.opleidingsvorm).toBeUndefined();
    expect(groep.extra).toBeUndefined();
    expect(onderdelen[0].einddatum).toBeUndefined();
    expect(onderdelen[0].voorbereidend).toBeUndefined();
    expect(onderdelen[0].extra).toStrictEqual(REST_HOOFD_GEWOON);
  });

  it('historiek: elke sleutel die met vorige of volgende begint; de rest van de historiek blijft in extra', () => {
    const { onderdelen } = normaal({
      ...G0307,
      structuuronderdelen: [{
        ...G0307.structuuronderdelen[0],
        historiek_structuuronderdelen: { vorige: [12, '3'], vorige_structuuronderdelen: [{ structuuronderdeel_nummer: 12 }], volgende_nummers: 99, opmerking: 'x' },
      }],
    });
    expect(onderdelen[0].vorige).toEqual([3, 12]);
    expect(onderdelen[0].volgende).toEqual([99]);
    expect(onderdelen[0].extra).toStrictEqual({ ...REST_HOOFD_GEWOON, historiek_structuuronderdelen: { opmerking: 'x' } });
  });

  it('voorbereidend en vervolg: alleen de nummers, gesorteerd en zonder dubbels', () => {
    const { onderdelen } = normaal({
      ...G0307,
      structuuronderdelen: [{
        ...G0307.structuuronderdelen[0],
        voorbereidende_structuuronderdelen: [{ structuuronderdeel_nummer: 30, titel: 'C' }, 7, { structuuronderdeel_nummer: '12' }, '7'],
        vervolg_structuuronderdelen: [99, { structuuronderdeel_nummer: 5, api_url: `${API_SO}/5` }, 99, 41],
      }],
    });
    expect(onderdelen[0].voorbereidend).toEqual([7, 12, 30]);
    expect(onderdelen[0].vervolg).toEqual([5, 41, 99]);
    expect(onderdelen[0].extra).toStrictEqual(REST_HOOFD_GEWOON);
  });

  it('twee verschillende oude nummers: het tweede blijft in extra', () => {
    const { onderdelen } = normaal({ ...G0307, structuuronderdelen: [{ ...G0307.structuuronderdelen[0], studierichting_nummer_oud: '1', afdeling_nummer_oud: 187 }] });
    expect(onderdelen[0].oudNummer).toBe('1');
    expect(onderdelen[0].extra).toStrictEqual({ ...REST_HOOFD_GEWOON, afdeling_nummer_oud: 187 });
    const alleenAfdeling = normaal({ ...G0307, structuuronderdelen: [{ ...G0307.structuuronderdelen[0], afdeling_nummer_oud: '187' }] });
    expect(alleenAfdeling.onderdelen[0].oudNummer).toBe('187');
    expect(alleenAfdeling.onderdelen[0].extra).toStrictEqual(REST_HOOFD_GEWOON);
  });

  it('ov4 komt alleen uit ov4_mogelijk, nooit uit hoofdstructuur 321', () => {
    const onderdeelMet = (velden: Record<string, unknown>) => normaal({ ...G0307, structuuronderdelen: [{ ...G0307.structuuronderdelen[0], ...velden }] }).onderdelen[0];
    // 311 en 321, zonder ov4_mogelijk: geen ov4
    const zonder = onderdeelMet({ hoofdstructuren: [code('311'), code('321')] });
    expect(zonder.hoofdstructuren).toEqual(['311', '321']);
    expect(zonder.ov4).toBeUndefined();
    // 311 en 321, met ov4_mogelijk false (ook als tekst of als 0): geen ov4, en niets in extra
    for (const nee of [false, 'false', 0]) {
      const o = onderdeelMet({ hoofdstructuren: [code('311'), code('321')], ov4_mogelijk: nee });
      expect(o.hoofdstructuren).toEqual(['311', '321']);
      expect(o.ov4, String(nee)).toBeUndefined();
      expect(o.extra?.ov4_mogelijk).toBeUndefined();
    }
    // alleen 311, met ov4_mogelijk true: wel ov4
    const ja = onderdeelMet({ hoofdstructuren: [code('311')], ov4_mogelijk: true });
    expect(ja.hoofdstructuren).toEqual(['311']);
    expect(ja.ov4).toBe(true);
    // alleen 321 (BuSO), zonder ov4_mogelijk: geen ov4
    expect(onderdeelMet({ hoofdstructuren: [code('321')] }).ov4).toBeUndefined();
  });

  it('api_url van de groep valt weg, ook niet in extra; andere onbekende velden van de groep blijven', () => {
    const api = `${STRUCTUUR_API}/structuuronderdeelgroep/G-0307`;
    expect(normaal({ ...G0307, api_url: api }).groep.extra).toBeUndefined();
    expect(normaal({ ...G0307, api_url: api, nieuw: { b: 1, a: 2 } }).groep.extra).toStrictEqual({ nieuw: { a: 2, b: 1 } });
  });

  it('extra heeft gesorteerde sleutels, ook in geneste objecten: de volgorde in de API maakt niets uit', () => {
    const basis = { ...G0307.structuuronderdelen[0], hoofdstructuren: ['311'] };
    const a = { ...G0307, zz_groep: 1, aa_groep: { z: 1, a: 2 }, structuuronderdelen: [{ ...basis, zeta: { y: [{ d: 1, c: 2 }], b: 0 }, alfa: 'x' }] };
    const b = { ...G0307, aa_groep: { a: 2, z: 1 }, zz_groep: 1, structuuronderdelen: [{ ...basis, alfa: 'x', zeta: { b: 0, y: [{ c: 2, d: 1 }] } }] };
    const uitA = normaal(a);
    expect(JSON.stringify(uitA.groep.extra)).toBe('{"aa_groep":{"a":2,"z":1},"zz_groep":1}');
    expect(JSON.stringify(uitA.onderdelen[0].extra)).toBe('{"alfa":"x","zeta":{"b":0,"y":[{"c":2,"d":1}]}}');
    expect(JSON.stringify(normaal(b))).toBe(JSON.stringify(uitA));
    // Lijsten in extra houden hun volgorde.
    const lijst = normaal({ ...G0307, nieuw: [3, 1, 2] });
    expect(lijst.groep.extra).toStrictEqual({ nieuw: [3, 1, 2] });
  });

  it('de uitkomst hangt niet af van de volgorde in de invoer, en deelt geen objecten met de invoer', () => {
    const a = normaal(G0001);
    const omgekeerd = kopie(G0001);
    omgekeerd.structuuronderdelen.reverse();
    for (const o of omgekeerd.structuuronderdelen) {
      o.leerjaren.reverse();
      o.instellingstypes.reverse();
      o.structuuronderdeel_details.reverse();
    }
    expect(JSON.stringify(normaal(omgekeerd))).toBe(JSON.stringify(a));

    const raw = kopie(G0002) as typeof G0002 & { structuuronderdelen: Record<string, unknown>[] };
    raw.structuuronderdelen[0].nieuw = { diep: [1] };
    const uit = normaal(raw);
    (raw.structuuronderdelen[0].nieuw as { diep: number[] }).diep.push(2);
    expect(uit.onderdelen[0].extra?.nieuw).toEqual({ diep: [1] });
  });
});

describe('normaliseerGroep: de rest van de elementen van een lijst blijft in extra', () => {
  const basis = G0307.structuuronderdelen[0];
  const onderdeelMet = (velden: Record<string, unknown>) => normaal({ ...G0307, structuuronderdelen: [{ ...basis, ...velden }] }).onderdelen[0];

  it('hoofdstructuren, onderwijsstelsels en instellingstypes: omschrijving en onbekende velden staan op de plaats van de gesorteerde code', () => {
    const hoofdstructuren = [code('321', 'Buitengewoon secundair onderwijs'), '312', { code: '311', omschrijving: ' Secundair onderwijs ', zz: 1, aa: { y: 1, b: 2 }, leeg: null }];
    const o = onderdeelMet({ hoofdstructuren, onderwijsstelsels: [code('M', 'Modulair'), code('L', 'Lineair')], instellingstypes: ['121', { code: '122' }] });
    expect(o.hoofdstructuren).toEqual(['311', '312', '321']);
    expect(o.onderwijsstelsels).toEqual(['L', 'M']);
    expect(o.instellingstypes).toEqual(['121', '122']);
    // 312 kwam als tekst: {} op zijn plaats. Van de instellingstypes bleef niets over: geen sleutel.
    expect(o.extra).toStrictEqual({
      hoofdstructuren: [{ aa: { b: 2, y: 1 }, omschrijving: 'Secundair onderwijs', zz: 1 }, {}, { omschrijving: 'Buitengewoon secundair onderwijs' }],
      onderwijsstelsels: [{ omschrijving: 'Lineair' }, { omschrijving: 'Modulair' }],
    });
    // De sleutels van een rest zijn gesorteerd, ook genest.
    expect(JSON.stringify(o.extra?.hoofdstructuren)).toBe('[{"aa":{"b":2,"y":1},"omschrijving":"Secundair onderwijs","zz":1},{},{"omschrijving":"Buitengewoon secundair onderwijs"}]');
    // Een andere volgorde in de invoer geeft precies dezelfde uitvoer.
    const omgekeerd = onderdeelMet({ hoofdstructuren: [...hoofdstructuren].reverse(), onderwijsstelsels: [code('L', 'Lineair'), code('M', 'Modulair')], instellingstypes: [{ code: '122' }, '121'] });
    expect(JSON.stringify(omgekeerd)).toBe(JSON.stringify(o));
  });

  it('leerjaren: een onbekend veld, een omschrijving die geen tekst is en een tijd bij de datum', () => {
    const o = onderdeelMet({
      leerjaren: [
        { code: '2', omschrijving: 'Tweede leerjaar', begindatum: '2021-09-01', semesters: 2 },
        { code: '1', omschrijving: { nl: 'Eerste leerjaar' }, begindatum: ['2021-09-01T00:00:00Z'] },
      ],
    });
    expect(o.leerjaren).toStrictEqual([
      { code: '1', begindatum: '2021-09-01' },
      { code: '2', omschrijving: 'Tweede leerjaar', begindatum: '2021-09-01' },
    ]);
    expect(o.extra).toStrictEqual({ ...REST_HOOFD_GEWOON, leerjaren: [{ omschrijving: { nl: 'Eerste leerjaar' } }, { semesters: 2 }] });
  });

  it('erkenningen: de rest van de status, een tweede nummer en een versie die we niet kunnen lezen', () => {
    const o = onderdeelMet({
      structuuronderdeel_details: [
        { structuuronderdeel_detail_nummer: 'ADV-2', structuuronderdeel_detail_versie: { v: 2 }, begindatum: '2023-09-01', status: code('ERKEND', 'Erkend'), opmerking: 'nieuw' },
        { structuuronderdeel_detail_nummer: 'ADV-1', nummer: 'oud-1', versie: null, status: 'GEANNULEERD', begindatum: '2017-09-01' },
        { structuuronderdeel_detail_nummer: null, nummer: 'ADV-3', status: { omschrijving: 'In aanvraag' } },
      ],
    });
    expect(o.erkenningen).toStrictEqual([
      { nummer: 'ADV-1', status: 'GEANNULEERD', begindatum: '2017-09-01' },
      { nummer: 'ADV-2', status: 'ERKEND', begindatum: '2023-09-01' },
      { nummer: 'ADV-3', status: 'In aanvraag' },
    ]);
    expect(o.extra).toStrictEqual({
      ...REST_HOOFD_GEWOON,
      structuuronderdeel_details: [
        { nummer: 'oud-1' },
        { opmerking: 'nieuw', status: { omschrijving: 'Erkend' }, structuuronderdeel_detail_versie: { v: 2 } },
        {},
      ],
    });
  });

  it('een status die we niet kunnen lezen, blijft letterlijk in de rest', () => {
    const o = onderdeelMet({ structuuronderdeel_details: [{ structuuronderdeel_detail_nummer: 'ADV-1', status: { soort: 'x' } }] });
    expect(o.erkenningen).toStrictEqual([{ nummer: 'ADV-1' }]);
    expect(o.extra?.structuuronderdeel_details).toStrictEqual([{ status: { soort: 'x' } }]);
  });

  it('een dubbel element: één getypt element; dezelfde rest of geen rest is in orde', () => {
    const o = onderdeelMet({ hoofdstructuren: [code('311', 'Secundair onderwijs'), '311', code('311', 'Secundair onderwijs'), code('321', 'B')] });
    expect(o.hoofdstructuren).toEqual(['311', '321']);
    expect(o.extra?.hoofdstructuren).toStrictEqual([{ omschrijving: 'Secundair onderwijs' }, { omschrijving: 'B' }]);
    for (const volgorde of [['311', code('311', 'S')], [code('311', 'S'), '311']]) {
      expect(onderdeelMet({ hoofdstructuren: volgorde }).extra?.hoofdstructuren).toStrictEqual([{ omschrijving: 'S' }]);
    }
  });

  it('een dubbel element met een andere rest: de lijst blijft letterlijk in extra (probleem als het veld nodig is)', () => {
    const dubbel = [code('121', 'A'), code('121', 'B')];
    // instellingstypes zijn niet nodig: geen probleem, wel letterlijk bewaard
    const o = onderdeelMet({ instellingstypes: dubbel });
    expect(o.instellingstypes).toBeUndefined();
    expect(o.extra?.instellingstypes).toEqual(dubbel);
    // hoofdstructuren zijn wel nodig: een probleem, en de lijst blijft letterlijk bewaard
    for (const volgorde of [dubbel, [...dubbel].reverse(), [dubbel[0], '121', dubbel[1]]]) {
      const uit = normaliseerGroep({ ...G0307, structuuronderdelen: [{ ...basis, hoofdstructuren: volgorde }] });
      expect(uit.problemen).toHaveLength(1);
      expect(uit.problemen[0]).toMatch(/onderdeel 379: in het veld "hoofdstructuren" staat een code meer dan één keer, met andere gegevens \("121"\)/);
      expect(uit.onderdelen[0].hoofdstructuren).toEqual([]);
      expect(uit.onderdelen[0].extra?.hoofdstructuren).toEqual(volgorde);
    }
  });
});

// ── Pagina's ────────────────────────────────────────────────────────────────

describe('lijstVanPagina, volgendeLink en totaalVanPagina', () => {
  const groepA = { [KOPPEL_PARAMETER]: 'G-0001', titel: 'A' };
  const groepB = { [KOPPEL_PARAMETER]: 'G-0002', titel: 'B' };

  it('vindt de lijst met groepen onder elke sleutel, en zegt waar', () => {
    expect(lijstVanPagina({ structuuronderdeel_groepen: [groepA, groepB], meta: { total_elements: 2 } })).toEqual({ lijst: [groepA, groepB], pad: 'structuuronderdeel_groepen' });
    expect(lijstVanPagina({ _embedded: { groepen: [groepA] }, links: {} })).toEqual({ lijst: [groepA], pad: '_embedded.groepen' });
    expect(lijstVanPagina({ gegevens: { member: [groepA] } })).toEqual({ lijst: [groepA], pad: 'gegevens.member' });
    expect(lijstVanPagina([groepA, groepB])).toEqual({ lijst: [groepA, groepB], pad: '(hoofdniveau)' });
    // een lijst met ook kapotte elementen telt: normaliseerGroep meldt die
    expect(lijstVanPagina({ x: [groepA, 'kapot', { titel: 'zonder nummer' }] })).toMatchObject({ pad: 'x' });
  });

  it('doorzoekt een gevonden lijst niet verder (onderdelen met een groepnummer tellen niet dubbel)', () => {
    const groep = { ...groepA, structuuronderdelen: [{ structuuronderdeel_nummer: 1, [KOPPEL_PARAMETER]: 'G-0001' }] };
    expect(lijstVanPagina({ structuuronderdeel_groepen: [groep] })).toEqual({ lijst: [groep], pad: 'structuuronderdeel_groepen' });
  });

  it('twee lijsten met groepen: een fout, met beide paden', () => {
    const uit = lijstVanPagina({ structuuronderdeel_groepen: [groepA], ook: { groepen: [groepB] } });
    expect(uit).toHaveProperty('fout');
    expect('fout' in uit && uit.fout).toMatch(/2 lijsten.*ook\.groepen, structuuronderdeel_groepen/);
    // een lijst van pagina's bevat meer dan één lijst
    expect(lijstVanPagina([{ structuuronderdeel_groepen: [groepA] }, { structuuronderdeel_groepen: [groepB] }])).toHaveProperty('fout');
  });

  it('geen lijst met groepen (ook een lege lijst): een fout', () => {
    for (const pagina of [{}, { structuuronderdeel_groepen: [] }, { lijst: [{ titel: 'x' }] }, { groep: groepA }, null, 'tekst', 5]) {
      const uit = lijstVanPagina(pagina);
      expect(uit, JSON.stringify(pagina)).toHaveProperty('fout');
      expect('fout' in uit && uit.fout).toMatch(/geen lijst met groepen/);
    }
  });

  it('volgendeLink: links.next.href, met spaties als %20', () => {
    const href = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeelgroep?page=2&sort=titel asc';
    expect(volgendeLink({ links: { self: { href: 'x' }, next: { href } }, meta: { last: false } })).toBe(href.replace(' ', '%20'));
    expect(volgendeLink({ links: { next: { href: ' a b c ' } } })).toBe('a%20b%20c');
    expect(volgendeLink({ links: { next: 'https://x/2' } })).toBe('https://x/2');
    expect(volgendeLink({ links: [{ rel: 'self', href: 'https://x/1' }, { rel: 'next', href: 'https://x/2' }] })).toBe('https://x/2');
  });

  it('volgendeLink: geen volgende pagina zonder link, met een lege link of als meta.last true is', () => {
    expect(volgendeLink({ links: { self: { href: 'x' } } })).toBeUndefined();
    expect(volgendeLink({ links: { next: { href: '' } } })).toBeUndefined();
    expect(volgendeLink({ links: { next: { href: 5 } } })).toBeUndefined();
    expect(volgendeLink({ links: { next: { href: 'https://x/29' } }, meta: { last: true } })).toBeUndefined();
    expect(volgendeLink(null)).toBeUndefined();
    expect(volgendeLink([])).toBeUndefined();
  });

  it('totaalVanPagina: meta.total_elements als getal of als tekst', () => {
    expect(totaalVanPagina({ meta: { total_elements: 545, total_pages: 28 } })).toBe(545);
    expect(totaalVanPagina({ meta: { total_elements: ' 545 ' } })).toBe(545);
    expect(totaalVanPagina({ meta: { total_elements: 0 } })).toBe(0);
    for (const fout of [{}, { meta: {} }, { meta: { total_elements: -1 } }, { meta: { total_elements: 1.5 } }, { meta: { total_elements: 'veel' } }, { meta: { total_elements: null } }, { total_elements: 545 }, null]) {
      expect(totaalVanPagina(fout), JSON.stringify(fout)).toBeUndefined();
    }
  });
});

// ── onderwijssoortVanRecord ─────────────────────────────────────────────────

describe('onderwijssoortVanRecord', () => {
  /** Een doel zoals de Onderwijsdoelen-API het geeft (verkenning run 2). */
  const record = {
    '@id': 92119,
    '@type': 'onderwijsdoelen:onderwijsdoel.jsonld',
    code: '07.01',
    omschrijving: '<p>De leerlingen lichten de betekenis … toe.</p>',
    onderwijsdoel_type: 'Eindtermen',
    onderwijsdoelenset: {
      onderwijsdoelenset_id: 3301,
      onderwijsdoelenset: 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 - Burgerschapscompetenties met inbegrip van competenties inzake samenleven - Eindtermen',
      versie: '2.1',
      onderwijsstructuur: { onderwijsniveau: 'Secundair onderwijs', onderwijssoort: 'Buitengewoon', graad: '1ste graad', stroom: 'A-stroom', opleidingsvorm: 'Opleidingsvorm 4' },
    },
    titels: {},
  };

  it('geeft de letterlijke onderwijssoort', () => {
    expect(onderwijssoortVanRecord(record)).toBe('Buitengewoon');
    const metSpaties = kopie(record);
    metSpaties.onderwijsdoelenset.onderwijsstructuur.onderwijssoort = '  Gewoon ';
    expect(onderwijssoortVanRecord(metSpaties)).toBe('Gewoon');
  });

  it('is tolerant: een object of een lijst met één element', () => {
    const alsObject = kopie(record) as unknown as { onderwijsdoelenset: { onderwijsstructuur: Record<string, unknown> } };
    alsObject.onderwijsdoelenset.onderwijsstructuur.onderwijssoort = { naam: 'Buitengewoon' };
    expect(onderwijssoortVanRecord(alsObject)).toBe('Buitengewoon');
    const alsLijst = kopie(record) as unknown as { onderwijsdoelenset: unknown };
    alsLijst.onderwijsdoelenset = [record.onderwijsdoelenset];
    expect(onderwijssoortVanRecord(alsLijst)).toBe('Buitengewoon');
  });

  it('leeg of afwezig geeft undefined', () => {
    const leeg = kopie(record);
    leeg.onderwijsdoelenset.onderwijsstructuur.onderwijssoort = '';
    expect(onderwijssoortVanRecord(leeg)).toBeUndefined();
    expect(onderwijssoortVanRecord({ ...record, onderwijsdoelenset: { onderwijsdoelenset_id: 1 } })).toBeUndefined();
    expect(onderwijssoortVanRecord({ code: '1' })).toBeUndefined();
    expect(onderwijssoortVanRecord(null)).toBeUndefined();
    expect(onderwijssoortVanRecord('Buitengewoon')).toBeUndefined();
  });
});

// ── Gedeelde regels ─────────────────────────────────────────────────────────

describe('stroomVanEersteGraad', () => {
  it('leest de stroom uit de titel van de vier groepen van de 1ste graad', () => {
    expect(stroomVanEersteGraad('Eerste leerjaar A')).toBe('A');
    expect(stroomVanEersteGraad('Eerste leerjaar B')).toBe('B');
    expect(stroomVanEersteGraad('Tweede leerjaar A')).toBe('A');
    expect(stroomVanEersteGraad('Tweede leerjaar B')).toBe('B');
    expect(stroomVanEersteGraad('Tweede leerjaar A: Stem-wetenschappen')).toBe('A');
    expect(stroomVanEersteGraad('  eerste  leerjaar b ')).toBe('B');
  });

  it('andere titels geven undefined', () => {
    for (const titel of ['Natuurwetenschappen', 'Eerste leerjaar', 'Eerste leerjaar Ab', 'Derde leerjaar A', 'Het eerste leerjaar A', '']) {
      expect(stroomVanEersteGraad(titel), titel).toBeUndefined();
    }
  });
});

describe('soortVanGroep', () => {
  const groep = (velden: Partial<StudierichtingGroep> = {}): StudierichtingGroep => ({ nummer: 'G-0100', titel: 'X', graad: '2', onderdelen: [1, 2], ...velden });
  const onderdeel = (nummer: number, velden: Partial<Structuuronderdeel> = {}): Structuuronderdeel => ({ nummer, groep: 'G-0100', titel: 'X', leerjaren: [], hoofdstructuren: ['311', '321'], ...velden });

  it('beslist in de volgorde van het ontwerp', () => {
    // 1. opleidingsvorm gaat voor alles
    expect(soortVanGroep(groep({ opleidingsvorm: { omschrijving: 'Opleidingsvorm 4' }, type7: 'X' }), [onderdeel(1, { aanloop: true })])).toBe('buso');
    // 2. type 7de leerjaar gaat voor aanloop en 311
    expect(soortVanGroep(groep({ type7: 'BSO_TIJDELIJK' }), [onderdeel(1, { aanloop: true })])).toBe('zevende');
    // 3. alle onderdelen aanloop
    expect(soortVanGroep(groep(), [onderdeel(1, { aanloop: true }), onderdeel(2, { aanloop: true })])).toBe('aanloop');
    // niet alle aanloop (G-0008: een duaal en een aanloop-onderdeel) → gewoon
    expect(soortVanGroep(groep({ finaliteit: 'A' }), [onderdeel(1, { duaal: true }), onderdeel(2, { aanloop: true, duaal: true })])).toBe('gewoon');
    // 4. hoofdstructuur 311, ook 1ste graad en alleen duaal
    expect(soortVanGroep(groep({ graad: '1' }), [onderdeel(1)])).toBe('gewoon');
    expect(soortVanGroep(groep(), [onderdeel(1, { duaal: true, hoofdstructuren: ['311', '312'] })])).toBe('gewoon');
    // 5. anders
    expect(soortVanGroep(groep(), [onderdeel(1, { hoofdstructuren: ['312'] })])).toBe('ander');
    expect(soortVanGroep(groep(), [])).toBe('ander');
  });

  it('OKAN en Basisverpleegkunde (311, maar zonder graad) zijn "ander"', () => {
    const okan = normaal(G0561);
    expect(okan.onderdelen[0].hoofdstructuren).toContain('311');
    expect(soortVanGroep(okan.groep, okan.onderdelen)).toBe('ander');
  });

  it('telt alleen de onderdelen van de groep zelf (ook als je alle onderdelen meegeeft)', () => {
    const alle = [onderdeel(1, { groep: 'G-0100', aanloop: true }), onderdeel(2, { groep: 'G-0200' })];
    expect(soortVanGroep(groep(), alle)).toBe('aanloop');
    expect(soortVanGroep(groep({ nummer: 'G-0300' }), alle)).toBe('ander');
  });

  it('op de fixtures: G-0001 gewoon, G-0009 buso, G-0002 zevende, G-0307 gewoon', () => {
    for (const [raw, soort] of [[G0001, 'gewoon'], [G0009, 'buso'], [G0002, 'zevende'], [G0307, 'gewoon'], [G0280, 'gewoon']] as const) {
      const { groep: g, onderdelen } = normaal(raw);
      expect(soortVanGroep(g, onderdelen), g.nummer).toBe(soort);
    }
  });
});

describe('jaarVan', () => {
  it('geeft de jaren 1 tot 7', () => {
    expect(jaarVan('1', '1')).toBe(1);
    expect(jaarVan('1', '2')).toBe(2);
    expect(jaarVan('2', '1')).toBe(3);
    expect(jaarVan('2', '2')).toBe(4);
    expect(jaarVan('3', '1')).toBe(5);
    expect(jaarVan('3', '2')).toBe(6);
    expect(jaarVan('3', '3')).toBe(7);
    expect(jaarVan('2', ' 01 ')).toBe(3);
  });

  it('geen jaar zonder graad (BuSO), buiten de graad of met een rare code', () => {
    expect(jaarVan(undefined, '1')).toBeUndefined();
    expect(jaarVan('1', '3')).toBeUndefined();
    expect(jaarVan('2', '3')).toBeUndefined();
    expect(jaarVan('3', '4')).toBeUndefined();
    expect(jaarVan('3', '0')).toBeUndefined();
    expect(jaarVan('4', '1')).toBeUndefined();
    expect(jaarVan('2', 'A')).toBeUndefined();
    expect(jaarVan('2', '1.5')).toBeUndefined();
    expect(jaarVan('2de graad', '1')).toBeUndefined();
  });
});

describe('isAfgebouwd', () => {
  it('afgebouwd als de einddatum vóór vandaag ligt; op de einddatum zelf nog niet', () => {
    expect(isAfgebouwd({ einddatum: '2025-08-31' }, '2025-09-01')).toBe(true);
    expect(isAfgebouwd({ einddatum: '2025-08-31' }, '2025-08-31')).toBe(false);
    expect(isAfgebouwd({ einddatum: '2025-08-31' }, '2025-08-30')).toBe(false);
    expect(isAfgebouwd({ einddatum: '2025-08-31' }, '2026-10-09T12:00:00Z')).toBe(true);
  });

  it('zonder (geldige) einddatum niet afgebouwd', () => {
    expect(isAfgebouwd({}, '2026-10-09')).toBe(false);
    expect(isAfgebouwd({ einddatum: 'nooit' }, '2026-10-09')).toBe(false);
  });

  it('een geannuleerd onderdeel (einde vóór begin) is afgebouwd', () => {
    expect(isAfgebouwd({ einddatum: '2025-07-14' }, '2026-10-09')).toBe(true);
  });

  it('een ongeldige dag van vandaag is een fout van de oproeper', () => {
    expect(() => isAfgebouwd({ einddatum: '2025-08-31' }, 'vandaag')).toThrow(TypeError);
    expect(() => isAfgebouwd({ einddatum: '2025-08-31' }, '2025-02-30')).toThrow(TypeError);
  });
});

// ── groepnummersVanDoel en kruiscontrole ────────────────────────────────────

/** Een doel uit ODS_3116 (Biologie, 3de graad), letterlijk overgenomen. */
const DOEL_3116 = {
  id: '91020',
  code: '08.01.01',
  tekst: '<p>De leerlingen beschrijven transport van water en assimilaten in relatie tot de morfologie van de plant.</p>',
  type: 'Specifieke eindtermen',
  extra: {
    attitude: 0,
    geldigheid: { type: 'Geldig', geldig_van_dt: '2023-09-01T00:00:00Z', publicatie_dt: '2023-07-13T09:42:13Z' },
    optioneel: false,
    titels: {
      '1': {
        titel: 'Uitgebreide biologie',
        ordeningskader: {
          type: 'wetenschapsdomein_onderdeel',
          versie: '2.1',
          nummer: 'wdo8.1',
          studierichtingen: [
            { waarde: 'Biotechnologische en chemische STEM-wetenschappen', structuuronderdeel_groep_nummer: 'G-0339' },
            { waarde: 'Biotechnologische en chemische wetenschappen', structuuronderdeel_groep_nummer: 'G-0350' },
            { waarde: 'Latijn-Wetenschappen', structuuronderdeel_groep_nummer: 'G-0329' },
            { waarde: 'Moderne talen-Wetenschappen', structuuronderdeel_groep_nummer: 'G-0331' },
            { waarde: 'Sportwetenschappen', structuuronderdeel_groep_nummer: 'G-0333' },
            { waarde: 'Wetenschappen-Wiskunde', structuuronderdeel_groep_nummer: 'G-0334' },
          ],
        },
      },
    },
  },
};

/** Een doel met tags in de vorm van het ordeningskader. */
function doelMetTags(id: string, groepen: string[]): { id: string; extra: Record<string, unknown> } {
  return {
    id,
    extra: {
      titels: {
        '1': { titel: 'Rubriek', ordeningskader: { type: 'pakket', studierichtingen: groepen.map((g) => ({ waarde: `Richting ${g}`, structuuronderdeel_groep_nummer: g })) } },
      },
    },
  };
}

describe('groepnummersVanDoel', () => {
  it('leest de groepnummers uit het ordeningskader (vorm van ODS_3116), gesorteerd en uniek', () => {
    expect(groepnummersVanDoel(DOEL_3116)).toEqual(['G-0329', 'G-0331', 'G-0333', 'G-0334', 'G-0339', 'G-0350']);
  });

  it('over meerdere rubrieken, met dubbels, een lijst van titels en een lijst van kaders', () => {
    const doel = {
      extra: {
        titels: [
          { titel: 'a', ordeningskader: { studierichtingen: [{ structuuronderdeel_groep_nummer: 'G-0193' }, { structuuronderdeel_groep_nummer: 'G-0010' }] } },
          { titel: 'b', ordeningskader: [{ studierichtingen: { structuuronderdeel_groep_nummer: 'G-0009' } }, { studierichtingen: [{ structuuronderdeel_groep_nummer: ' G-0193 ' }] }] },
        ],
      },
    };
    expect(groepnummersVanDoel(doel)).toEqual(['G-0009', 'G-0010', 'G-0193']);
  });

  it('slaat een richting zonder nummer (Tandtechnieken) of met een ongeldig nummer over', () => {
    const doel = { extra: { titels: { '1': { ordeningskader: { studierichtingen: [{ waarde: 'Tandtechnieken' }, { structuuronderdeel_groep_nummer: 'G-12' }, { structuuronderdeel_groep_nummer: 193 }, null, { structuuronderdeel_groep_nummer: 'G-0193' }] } } } } };
    expect(groepnummersVanDoel(doel)).toEqual(['G-0193']);
  });

  it('zonder titels, met lege titels of zonder ordeningskader: geen nummers', () => {
    expect(groepnummersVanDoel({})).toEqual([]);
    expect(groepnummersVanDoel({ extra: {} })).toEqual([]);
    expect(groepnummersVanDoel({ extra: { titels: {} } })).toEqual([]);
    expect(groepnummersVanDoel({ extra: { titels: { '1': { titel: 'x', nr: '1' } } } })).toEqual([]);
    expect(groepnummersVanDoel({ extra: { titels: { '1': { ordeningskader: { type: 'x', studierichtingen: null } } } } })).toEqual([]);
    expect(groepnummersVanDoel({ extra: { titels: 'tekst' } })).toEqual([]);
  });

  it.runIf(existsSync(ODS_3116))('op het echte setbestand ODS_3116: alleen geldige nummers, en minstens één doel met nummers', () => {
    const bestand = JSON.parse(readFileSync(ODS_3116, 'utf8')) as { doelen: { id?: string; extra?: Record<string, unknown> }[] };
    const perDoel = bestand.doelen.map(groepnummersVanDoel);
    expect(perDoel.some((g) => g.length > 0)).toBe(true);
    for (const groepen of perDoel) {
      for (const g of groepen) expect(g).toMatch(GROEP_NUMMER);
      expect([...groepen].sort(vergelijkGroepnummer)).toEqual(groepen);
    }
  });
});

describe('kruiscontrole', () => {
  const ids = (van: number, tot: number) => Array.from({ length: tot - van + 1 }, (_, i) => String(van + i));
  // ODS_3132: 13 doelen; 90001-90004 voor G-0193 (90004 ook G-0117), 90005-90008 voor G-0117, de rest zonder tag.
  const ods3132 = [
    ...ids(90001, 90003).map((id) => doelMetTags(id, ['G-0193'])),
    doelMetTags('90004', ['G-0193', 'G-0117']),
    ...ids(90005, 90008).map((id) => doelMetTags(id, ['G-0117'])),
    ...ids(90009, 90013).map((id) => ({ id, extra: { titels: {} } })),
  ];
  // ODS_3000: basisvorming, zonder tags.
  const ods3000 = ids(80001, 80005).map((id) => ({ id }));
  const setDoelen = new Map([['ODS_3132', ods3132], ['ODS_3000', ods3000]]);
  const set = (naam: string, lijst: string[]): RichtingDoelenSet => ({ set: naam, setSha: '0123456789abcdef', setAantal: 13, ids: lijst });

  it('geen verschillen als de API precies geeft wat het ordeningskader zegt (hele sets zonder tags tellen niet)', () => {
    const koppeling = new Map([
      ['G-0193', [set('ODS_3000', ids(80001, 80005)), set('ODS_3132', ids(90001, 90004))]],
      ['G-0117', [set('ODS_3132', ids(90004, 90008))]],
    ]);
    expect(kruiscontrole(koppeling, setDoelen)).toEqual([]);
  });

  it('meldt per groep en set wat alleen in de API en alleen in het ordeningskader staat', () => {
    const koppeling = new Map([
      ['G-0193', [set('ODS_3132', ['90001', '90002', '90003', '90004', '90009'])]],
      ['G-0117', [set('ODS_3132', ['90004', '90005', '90007', '90008', '90010'])]],
    ]);
    expect(kruiscontrole(koppeling, setDoelen)).toEqual([
      { groep: 'G-0117', set: 'ODS_3132', alleenApi: ['90010'], alleenOrdeningskader: ['90006'] },
      { groep: 'G-0193', set: 'ODS_3132', alleenApi: ['90009'], alleenOrdeningskader: [] },
    ]);
  });

  it('een getagde set die de API niet koppelt, of een groep zonder sets: alles alleen in het ordeningskader', () => {
    const koppeling = new Map([['G-0193', [set('ODS_3000', ids(80001, 80005))]], ['G-0117', []]]);
    expect(kruiscontrole(koppeling, setDoelen)).toEqual([
      { groep: 'G-0117', set: 'ODS_3132', alleenApi: [], alleenOrdeningskader: ['90004', '90005', '90006', '90007', '90008'] },
      { groep: 'G-0193', set: 'ODS_3132', alleenApi: [], alleenOrdeningskader: ['90001', '90002', '90003', '90004'] },
    ]);
  });

  it('een groep die het ordeningskader niet noemt, maar die de API een getagde set geeft: alleen in de API', () => {
    const koppeling = new Map([['G-0327', [set('ODS_3132', ['90012', '90013', '90001'])]]]);
    expect(kruiscontrole(koppeling, setDoelen)).toEqual([{ groep: 'G-0327', set: 'ODS_3132', alleenApi: ['90001', '90012', '90013'], alleenOrdeningskader: [] }]);
  });

  it('een set die niet in de setbestanden staat, telt niet mee (dat vangt poort D3); de volgorde is numeriek', () => {
    const koppeling = new Map([
      ['G-01000', [set('ODS_9999', ['1'])]],
      ['G-0010', [set('ODS_3132', ['90013'])]],
      ['G-0009', [set('ODS_3132', ['90013'])]],
    ]);
    expect(kruiscontrole(koppeling, setDoelen).map((v) => v.groep)).toEqual(['G-0009', 'G-0010']);
    // dezelfde set twee keer in de koppeling: de nummers worden samen bekeken
    expect(kruiscontrole(new Map([['G-0193', [set('ODS_3132', ['90001', '90002']), set('ODS_3132', ['90003', '90004'])]]]), setDoelen)).toEqual([]);
  });

  it.runIf(existsSync(ODS_3116))('op het echte ODS_3116: een koppeling volgens het ordeningskader geeft 0 verschillen, één nummer minder geeft er 1', () => {
    const bestand = JSON.parse(readFileSync(ODS_3116, 'utf8')) as { doelen: { id?: string; extra?: Record<string, unknown> }[] };
    const perGroep = new Map<string, string[]>();
    for (const doel of bestand.doelen) {
      for (const g of groepnummersVanDoel(doel)) {
        if (doel.id === undefined) continue;
        perGroep.set(g, [...(perGroep.get(g) ?? []), doel.id]);
      }
    }
    expect(perGroep.size).toBeGreaterThan(0);
    const echteSet = new Map([['ODS_3116', bestand.doelen]]);
    const koppeling = new Map([...perGroep].map(([g, lijst]) => [g, [set('ODS_3116', [...lijst].sort(vergelijkNatuurlijk))]]));
    expect(kruiscontrole(koppeling, echteSet)).toEqual([]);
    const [eerste, lijst] = [...perGroep][0];
    koppeling.set(eerste, [set('ODS_3116', lijst.slice(1))]);
    expect(kruiscontrole(koppeling, echteSet)).toEqual([{ groep: eerste, set: 'ODS_3116', alleenApi: [], alleenOrdeningskader: [lijst[0]] }]);
  });
});

// ── Validators ──────────────────────────────────────────────────────────────

/** Een matrixbestand zoals het script het hoort te schrijven (zonder `expect`: dit draait ook buiten een test). */
function maakMatrix(raws: unknown[]): MatrixBestand {
  const groepen: StudierichtingGroep[] = [];
  const onderdelen: Structuuronderdeel[] = [];
  for (const raw of raws) {
    const uit = normaliseerGroep(raw);
    if (uit.groep === undefined || uit.problemen.length > 0) throw new Error(`fixture met problemen: ${uit.problemen.join(' ')}`);
    groepen.push(uit.groep);
    onderdelen.push(...uit.onderdelen);
  }
  groepen.sort((a, b) => vergelijkGroepnummer(a.nummer, b.nummer));
  onderdelen.sort((a, b) => a.nummer - b.nummer);
  return {
    app: 'boosterz',
    kind: 'studierichtingen',
    v: 1,
    bron: STRUCTUUR_BRON,
    api: `${STRUCTUUR_API}/structuuronderdeelgroep`,
    naamsvermelding: STRUCTUUR_NAAMSVERMELDING,
    licentie: 'nog te bevestigen',
    opgehaald: '2026-10-09T00:00:00Z',
    aantalGroepen: groepen.length,
    aantalOnderdelen: onderdelen.length,
    sha256: sha256Van({ groepen, onderdelen }),
    groepen,
    onderdelen,
  };
}

const ALLE_FIXTURES = [G0001, G0280, G0009, G0002, G0307, G0561, JSON.parse(G0193_TEKST) as unknown];

describe('valideerMatrixBestand', () => {
  const geldig = maakMatrix(ALLE_FIXTURES);

  it('positief: de matrix uit de fixtures, ook na een rondreis door JSON', () => {
    expect(valideerMatrixBestand(geldig)).toEqual([]);
    expect(valideerMatrixBestand(JSON.parse(JSON.stringify(geldig)))).toEqual([]);
    expect(geldig.groepen.map((g) => g.nummer)).toEqual(['G-0001', 'G-0002', 'G-0009', 'G-0193', 'G-0280', 'G-0307', 'G-0561']);
  });

  it('positief: met nietMeerInBron, extra en een tijdstip met milliseconden', () => {
    const m = kopie(geldig);
    m.groepen[0].nietMeerInBron = '2026-11-03';
    m.onderdelen[0].nietMeerInBron = '2026-11-03';
    m.onderdelen[0].extra = { nieuw: { a: 1 } };
    m.opgehaald = '2026-11-03T05:41:12.123Z';
    expect(valideerMatrixBestand(m)).toEqual([]);
  });

  it('positief: een onderdeel met een einddatum vóór de begindatum (geannuleerd 7de jaar, echte gegevens)', () => {
    const m = kopie(geldig);
    const o = m.onderdelen.find((x) => x.nummer === 2);
    if (!o) throw new Error('onderdeel 2 ontbreekt');
    o.begindatum = '2025-09-01';
    o.einddatum = '2025-07-14';
    o.leerjaren = [{ code: '3', begindatum: '2025-09-01', einddatum: '2025-07-14' }];
    expect(valideerMatrixBestand(m)).toEqual([]);
  });

  it('positief: een matrix met één groep', () => {
    expect(valideerMatrixBestand(maakMatrix([G0307]))).toEqual([]);
  });

  /** Past een kopie aan en geeft de fouten. */
  function fouten(aanpassing: (m: MatrixBestand & Record<string, unknown>) => void): string[] {
    const m = kopie(geldig) as MatrixBestand & Record<string, unknown>;
    aanpassing(m);
    return valideerMatrixBestand(m);
  }

  it('negatief: geen object, verkeerde kop of verkeerde aantallen', () => {
    expect(valideerMatrixBestand(null)).toEqual(['Het bestand bevat geen object.']);
    expect(valideerMatrixBestand([geldig])).toEqual(['Het bestand bevat geen object.']);
    expect(fouten((m) => { (m as Record<string, unknown>).kind = 'minimumdoelen'; })).toEqual(['Kop: "kind" moet "studierichtingen" zijn.']);
    expect(fouten((m) => { (m as Record<string, unknown>).v = 2; })).toEqual(['Kop: "v" moet 1 zijn.']);
    expect(fouten((m) => { m.aantalGroepen = 6; })).toEqual(['Kop zegt 6 groepen, maar het bestand bevat er 7.']);
    expect(fouten((m) => { m.sha256 = 'abc'; })).toEqual(['Kop: "sha256" is geen sha256 (64 hex-tekens).']);
    expect(fouten((m) => { m.opgehaald = '2026-10-09'; })).toEqual(['Kop: "opgehaald" is geen tijdstip (JJJJ-MM-DDTUU:MM:SSZ).']);
    expect(fouten((m) => { m.licentie = ''; })).toEqual(['Kop: "licentie" ontbreekt of is leeg.']);
    expect(fouten((m) => { m.rapport = {}; })).toEqual(['Kop: onbekende velden "rapport".']);
    expect(fouten((m) => { m.groepen = []; m.onderdelen = []; m.aantalGroepen = 0; m.aantalOnderdelen = 0; })).toEqual(['Er staan geen groepen in het bestand.']);
    expect(fouten((m) => { delete (m as Record<string, unknown>).onderdelen; })).toEqual(['"onderdelen" ontbreekt of is geen lijst.']);
  });

  it('negatief: verkeerde volgorde en dubbels', () => {
    expect(fouten((m) => { m.groepen.reverse(); })[0]).toMatch(/verkeerde volgorde/);
    expect(fouten((m) => { [m.onderdelen[0], m.onderdelen[1]] = [m.onderdelen[1], m.onderdelen[0]]; })).toEqual(['Onderdelen: het onderdeel 1 staat na 2, dat is de verkeerde volgorde.']);
    expect(fouten((m) => { m.groepen.splice(1, 0, kopie(m.groepen[0])); m.aantalGroepen++; })).toEqual(['Groepen: de groep "G-0001" staat er meer dan één keer in.']);
    expect(fouten((m) => { m.onderdelen[0].hoofdstructuren.reverse(); })[0]).toMatch(/"hoofdstructuren" de code "315" staat na "321"/);
    expect(fouten((m) => { m.onderdelen[0].leerjaren.reverse(); })[0]).toMatch(/het leerjaar .* verkeerde volgorde/);
  });

  it('negatief: de samenhang tussen groepen en onderdelen (M3)', () => {
    expect(fouten((m) => { m.onderdelen[0].groep = 'G-0999'; })).toEqual([
      'Onderdeel 1: de groep G-0999 staat niet in de lijst met groepen.',
      'Groep G-0001: noemt onderdeel 1, maar dat hoort niet bij deze groep (of bestaat niet).',
    ]);
    expect(fouten((m) => { m.groepen[0].onderdelen = [1]; })).toEqual(['Groep G-0001: onderdeel 505 hoort bij deze groep, maar staat niet in "onderdelen".']);
    expect(fouten((m) => { m.groepen[0].onderdelen = [1, 2, 505]; })).toEqual(['Groep G-0001: noemt onderdeel 2, maar dat hoort niet bij deze groep (of bestaat niet).']);
    expect(fouten((m) => { m.groepen[0].onderdelen = []; })).toContain('Groep G-0001: de groep heeft geen onderdelen.');
  });

  it('negatief: velden met een verkeerde vorm', () => {
    expect(fouten((m) => { m.groepen[0].nummer = 'G-1'; })[0]).toMatch(/het nummer "G-1" past niet/);
    expect(fouten((m) => { (m.groepen[0] as unknown as Record<string, unknown>).graad = '4'; })).toEqual(['Groep G-0001: de graad "4" is niet "1", "2" of "3".']);
    expect(fouten((m) => { m.onderdelen[0].nummer = 0; })[0]).toMatch(/geen geheel getal groter dan 0/);
    expect(fouten((m) => { (m.onderdelen[0] as unknown as Record<string, unknown>).ov4 = false; })).toEqual(['Onderdeel 1: "ov4" staat er alleen als het true is.']);
    expect(fouten((m) => { m.onderdelen[0].begindatum = '2017-13-01'; })).toEqual(['Onderdeel 1: "begindatum" is geen geldige datum (JJJJ-MM-DD).']);
    expect(fouten((m) => { m.onderdelen[0].onderwijsstelsels = []; })).toEqual(['Onderdeel 1: "onderwijsstelsels" is een lege lijst (die hoort weg te vallen).']);
    expect(fouten((m) => { m.onderdelen[0].titel = ' Afwerking'; })).toEqual(['Onderdeel 1: de titel ontbreekt of is leeg.']);
    expect(fouten((m) => { m.onderdelen[0].studiedomein = {}; })).toEqual(['Onderdeel 1: "studiedomein" is leeg.']);
    expect(fouten((m) => { m.onderdelen[0].vorige = [3, 3]; })).toEqual(['Onderdeel 1: in "vorige" het nummer 3 staat er meer dan één keer in.']);
    expect(fouten((m) => { m.onderdelen[0].leerjaren = [{ code: '1', begindatum: 'x' }]; })).toEqual(['Onderdeel 1, leerjaar 1: "begindatum" is geen geldige datum (JJJJ-MM-DD).']);
  });

  it('negatief: api_url mag nergens staan, ook niet in extra (van een onderdeel of een groep); onbekende velden horen in extra', () => {
    expect(fouten((m) => { (m.onderdelen[0] as unknown as Record<string, unknown>).api_url = 'https://x'; })).toEqual(['Onderdeel 1: onbekende velden "api_url".']);
    expect(fouten((m) => { m.onderdelen[0].extra = { api_url: 'https://x' }; })).toEqual(['Onderdeel 1: "extra" bevat "api_url".']);
    expect(fouten((m) => { (m.groepen[0] as unknown as Record<string, unknown>).api_url = 'https://x'; })).toEqual(['Groep G-0001: onbekende velden "api_url".']);
    expect(fouten((m) => { m.groepen[0].extra = { api_url: 'https://x' }; })).toEqual(['Groep G-0001: "extra" bevat "api_url".']);
    expect(fouten((m) => { m.groepen[0].extra = {}; })).toEqual(['Groep G-0001: "extra" is geen (niet-leeg) object.']);
  });

  it('negatief: de rest van de elementen van een lijst is één object per element', () => {
    // Onderdeel 1 (G-0001) heeft 4 hoofdstructuren en 2 erkenningen, met hun rest in extra.
    const extraVan = (m: MatrixBestand) => m.onderdelen[0].extra as Record<string, unknown>;
    expect(fouten((m) => { extraVan(m).hoofdstructuren = [{}]; })).toEqual(['Onderdeel 1: "extra.hoofdstructuren" is geen lijst van 4 objecten, één per element van "hoofdstructuren".']);
    expect(fouten((m) => { extraVan(m).structuuronderdeel_details = ['x', {}]; })).toEqual(['Onderdeel 1: "extra.structuuronderdeel_details" is geen lijst van 2 objecten, één per element van "erkenningen".']);
    expect(fouten((m) => { extraVan(m).leerjaren = { code: '1' }; })).toEqual(['Onderdeel 1: "extra.leerjaren" is geen lijst van 2 objecten, één per element van "leerjaren".']);
  });

  it('positief: een lijst die we niet konden lezen, staat letterlijk in extra en de getypte lijst ontbreekt', () => {
    const raw = { ...G0307, structuuronderdelen: [{ ...G0307.structuuronderdelen[0], instellingstypes: [{ omschrijving: 'zonder code' }, code('121')] }] };
    const m = maakMatrix([raw]);
    expect(m.onderdelen[0].instellingstypes).toBeUndefined();
    expect(m.onderdelen[0].extra?.instellingstypes).toEqual([{ omschrijving: 'zonder code' }, code('121')]);
    expect(valideerMatrixBestand(m)).toEqual([]);
  });

  it('beperkt een lange reeks fouten van dezelfde soort', () => {
    const uit = fouten((m) => { for (const o of m.onderdelen) o.begindatum = 'kapot'; });
    expect(uit).toHaveLength(11);
    expect(uit[10]).toMatch(/… en nog \d+ van dezelfde soort/);
  });

  it('gooit nooit, ook niet op rare invoer', () => {
    for (const raar of [{ groepen: [null, 5, 'x'], onderdelen: [null, [], {}] }, { groepen: {}, onderdelen: 'x' }, { groepen: [{ onderdelen: 'x', extra: [] }], onderdelen: [{ leerjaren: [null], erkenningen: [5] }] }]) {
      expect(() => valideerMatrixBestand(raar)).not.toThrow();
      expect(valideerMatrixBestand(raar).length).toBeGreaterThan(0);
    }
  });
});

const GELDIGE_INDEX: RichtingDoelenIndex = {
  app: 'boosterz',
  kind: 'richtingdoelen-index',
  v: 1,
  bron: DOELEN_BRON,
  api: `https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel?${KOPPEL_PARAMETER}=`,
  naamsvermelding: DOELEN_NAAMSVERMELDING,
  licentie: 'nog te bevestigen',
  matrixSha256: 'a'.repeat(64),
  groepen: [
    { groep: 'G-0009', status: 'geen', opgehaald: '2026-11-03T05:53:02Z' },
    { groep: 'G-0010', status: 'nog-niet-opgehaald' },
    { groep: 'G-0117', status: 'gekoppeld', methode: 'api', aantal: 796, sets: 86, sha256: 'b'.repeat(64), opgehaald: '2026-11-03T05:52:40Z', bestand: 'G-0117.json' },
    { groep: 'G-0307', status: 'gekoppeld', methode: 'graad-en-stroom', aantal: 250, sets: 20, sha256: 'c'.repeat(64), opgehaald: '2026-11-03T05:52:41Z', bestand: 'G-0307.json' },
    { groep: 'G-0500', status: 'geen', opgehaald: '2026-11-03T05:53:02Z', nietMeerInBron: '2026-11-03', bestand: 'G-0500.json' },
    { groep: 'G-01000', status: 'nog-niet-opgehaald' },
  ],
};

describe('valideerRichtingDoelenIndex', () => {
  function fouten(aanpassing: (i: RichtingDoelenIndex & Record<string, unknown>) => void): string[] {
    const i = kopie(GELDIGE_INDEX) as RichtingDoelenIndex & Record<string, unknown>;
    aanpassing(i);
    return valideerRichtingDoelenIndex(i);
  }
  const regel = (i: RichtingDoelenIndex, groep: string) => {
    const r = i.groepen.find((x) => x.groep === groep);
    if (!r) throw new Error(groep);
    return r as unknown as Record<string, unknown>;
  };

  it('positief: alle drie de statussen, numeriek gesorteerd', () => {
    expect(valideerRichtingDoelenIndex(GELDIGE_INDEX)).toEqual([]);
  });

  it('positief: alleen groepen die nog niet opgehaald zijn (een run met alleen de matrix)', () => {
    expect(fouten((i) => { i.groepen = i.groepen.map((r) => ({ groep: r.groep, status: 'nog-niet-opgehaald' as const })); })).toEqual([]);
  });

  it('positief: een gekoppelde groep met 0 doelen (graad-en-stroom vóór de echte aantallen) en een gekoppelde groep die uit de matrix verdween', () => {
    expect(fouten((i) => {
      Object.assign(regel(i, 'G-0307'), { aantal: 0, sets: 0 });
      regel(i, 'G-0117').nietMeerInBron = '2026-12-03';
    })).toEqual([]);
  });

  it('negatief: kop', () => {
    expect(valideerRichtingDoelenIndex('x')).toEqual(['Het bestand bevat geen object.']);
    expect(fouten((i) => { (i as Record<string, unknown>).kind = 'richtingdoelen'; })).toEqual(['Kop: "kind" moet "richtingdoelen-index" zijn.']);
    expect(fouten((i) => { i.matrixSha256 = 'A'.repeat(64); })).toEqual(['Kop: "matrixSha256" is geen sha256 (64 hex-tekens).']);
    expect(fouten((i) => { i.groepen = []; })).toEqual(['Er staan geen groepen in de index.']);
    expect(fouten((i) => { i.opgehaald = '2026-11-03T05:53:02Z'; })).toEqual(['Kop: onbekende velden "opgehaald".']);
  });

  it('negatief: volgorde en dubbels (G-01000 hoort na G-0307)', () => {
    expect(fouten((i) => { i.groepen.sort((a, b) => (a.groep < b.groep ? -1 : 1)); })[0]).toMatch(/verkeerde volgorde/);
    expect(fouten((i) => { i.groepen.splice(1, 0, { groep: 'G-0009', status: 'nog-niet-opgehaald' }); })).toEqual(['Index: de groep "G-0009" staat er meer dan één keer in.']);
  });

  it('negatief: status, methode en groepnummer', () => {
    expect(fouten((i) => { regel(i, 'G-0010').status = 'onbekend'; })).toEqual(['Regel G-0010: de status "onbekend" is niet "gekoppeld", "geen" of "nog-niet-opgehaald".']);
    expect(fouten((i) => { regel(i, 'G-0117').methode = 'naam'; })).toEqual(['Regel G-0117: de methode "naam" is niet "api" of "graad-en-stroom".']);
    expect(fouten((i) => { regel(i, 'G-0010').groep = 'G-10'; })[0]).toMatch(/de groep "G-10" past niet/);
  });

  it('negatief: een gekoppelde groep zonder sha256, bestand of met onmogelijke aantallen', () => {
    expect(fouten((i) => { delete regel(i, 'G-0117').sha256; })).toEqual(['Regel G-0117: "sha256" is geen sha256.']);
    expect(fouten((i) => { delete regel(i, 'G-0117').bestand; })).toEqual(['Regel G-0117: "bestand" ontbreekt bij een gekoppelde groep.']);
    expect(fouten((i) => { regel(i, 'G-0117').bestand = 'G-0193.json'; })).toEqual(['Regel G-0117: "bestand" moet "G-0117.json" zijn.']);
    expect(fouten((i) => { regel(i, 'G-0117').sets = 900; })).toEqual(['Regel G-0117: 900 sets met samen 796 doelen kan niet.']);
    expect(fouten((i) => { regel(i, 'G-0117').aantal = -1; })[0]).toBe('Regel G-0117: "aantal" is geen geheel getal ≥ 0.');
    expect(fouten((i) => { regel(i, 'G-0117').opgehaald = 'gisteren'; })).toEqual(['Regel G-0117: "opgehaald" is geen tijdstip.']);
  });

  it('negatief: velden die niet bij de status horen', () => {
    expect(fouten((i) => { regel(i, 'G-0009').aantal = 3; })).toEqual(['Regel G-0009: "aantal" hoort alleen bij een gekoppelde groep.']);
    expect(fouten((i) => { delete regel(i, 'G-0500').nietMeerInBron; })).toEqual(['Regel G-0500: een laatst bekend bestand hoort "nietMeerInBron" te hebben.']);
    expect(fouten((i) => { delete regel(i, 'G-0009').opgehaald; })).toEqual(['Regel G-0009: "opgehaald" ontbreekt.']);
    expect(fouten((i) => { regel(i, 'G-0010').bestand = 'G-0010.json'; })).toEqual(['Regel G-0010: "bestand" hoort niet bij een groep die nog niet opgehaald is.']);
    expect(fouten((i) => { regel(i, 'G-0010').extra = 1; })).toEqual(['Regel G-0010: onbekende velden "extra".']);
  });
});

const GELDIG_BESTAND: RichtingDoelenBestand = {
  app: 'boosterz',
  kind: 'richtingdoelen',
  v: 1,
  groep: 'G-0193',
  titel: 'Natuurwetenschappen',
  graad: '2',
  methode: 'api',
  filter: `${KOPPEL_PARAMETER}=G-0193`,
  bron: DOELEN_BRON,
  api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel',
  naamsvermelding: DOELEN_NAAMSVERMELDING,
  licentie: 'nog te bevestigen',
  opgehaald: '2026-11-03T05:52:40Z',
  aantal: 7,
  sha256: 'd'.repeat(64),
  sets: [
    // natuurlijk gesorteerd: ODS_999 vóór ODS_3132, 998 vóór 1001
    { set: 'ODS_999', setSha: '0123456789abcdef', setAantal: 2, ids: ['998', '1001'] },
    { set: 'ODS_3132', setSha: '3f9c0a1b2c3d4e5f', setAantal: 13, ids: ['90011', '90012', '90100', '90101'] },
    { set: 'ODS_3244', onderwijssoort: 'Buitengewoon', setSha: 'fedcba9876543210', setAantal: 13, ids: ['92001'] },
  ],
};

interface IndexSet { id: string; naam: string; graad?: string; stroom?: string; aantal: number; sha256: string; bestand: string }

/** De sets van de 1ste graad met deze stroom uit `minimumdoelen/index.json`, gewoon én BuSO, alle versies (§ 3.4). */
function eersteGraadSets(stroom: 'A' | 'B'): IndexSet[] {
  const index = JSON.parse(readFileSync(MINIMUMDOELEN_INDEX, 'utf8')) as { sets: IndexSet[] };
  return index.sets.filter((s) => s.graad === '1ste graad' && s.stroom === `${stroom}-stroom`).sort((a, b) => vergelijkNatuurlijk(a.id, b.id));
}

const EERSTE_GRAAD_AANWEZIG =
  existsSync(MINIMUMDOELEN_INDEX) && (['A', 'B'] as const).every((s) => eersteGraadSets(s).every((set) => existsSync(join(MINIMUMDOELEN, set.bestand))));

/** Een bestand met methode `graad-en-stroom` zoals § 3.4 het beschrijft, uit de echte setbestanden: alle ids per set. */
function eersteGraadBestand(groep: string, titel: string, stroom: 'A' | 'B'): { bestand: RichtingDoelenBestand; sets: IndexSet[] } {
  const sets = eersteGraadSets(stroom);
  const lijst: RichtingDoelenSet[] = sets.map((s) => {
    const { doelen } = JSON.parse(readFileSync(join(MINIMUMDOELEN, s.bestand), 'utf8')) as { doelen: { id: string }[] };
    const ids = [...new Set(doelen.map((d) => d.id))].sort(vergelijkNatuurlijk);
    return { set: s.id, setSha: s.sha256.slice(0, 16), setAantal: s.aantal, ids };
  });
  const bestand: RichtingDoelenBestand = {
    app: 'boosterz',
    kind: 'richtingdoelen',
    v: 1,
    groep,
    titel,
    graad: '1',
    methode: 'graad-en-stroom',
    filter: `graad=1ste graad; stroom=${stroom}-stroom (regel van Boosterz: de bron koppelt de 1ste graad niet per richting)`,
    bron: DOELEN_BRON,
    api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel',
    naamsvermelding: DOELEN_NAAMSVERMELDING,
    licentie: 'nog te bevestigen',
    opgehaald: '2026-10-09T00:00:00Z',
    aantal: lijst.reduce((n, s) => n + s.ids.length, 0),
    sha256: sha256Van(lijst),
    sets: lijst,
  };
  return { bestand, sets };
}

describe('valideerRichtingDoelenBestand', () => {
  function fouten(aanpassing: (b: RichtingDoelenBestand & Record<string, unknown>) => void, groep?: string): string[] {
    const b = kopie(GELDIG_BESTAND) as RichtingDoelenBestand & Record<string, unknown>;
    aanpassing(b);
    return valideerRichtingDoelenBestand(b, groep);
  }

  it('positief: methode api, met en zonder de verwachte groep', () => {
    expect(valideerRichtingDoelenBestand(GELDIG_BESTAND)).toEqual([]);
    expect(valideerRichtingDoelenBestand(GELDIG_BESTAND, 'G-0193')).toEqual([]);
  });

  it('positief: methode graad-en-stroom in de 1ste graad', () => {
    expect(fouten((b) => {
      Object.assign(b, { groep: 'G-0307', titel: 'Eerste leerjaar A', graad: '1', methode: 'graad-en-stroom', filter: 'graad=1ste graad; stroom=A-stroom (regel van Boosterz: de bron koppelt de 1ste graad niet per richting)' });
    }, 'G-0307')).toEqual([]);
  });

  it('positief: zonder graad (BuSO), met nietMeerInBron, en zonder sets', () => {
    expect(fouten((b) => { delete b.graad; b.nietMeerInBron = '2026-11-03'; })).toEqual([]);
    expect(fouten((b) => { b.sets = []; b.aantal = 0; })).toEqual([]);
  });

  it('negatief: kop, groep en filter', () => {
    expect(valideerRichtingDoelenBestand(undefined)).toEqual(['Het bestand bevat geen object.']);
    expect(fouten(() => {}, 'G-0117')).toEqual(['Kop: het bestand hoort bij "G-0193", niet bij "G-0117".']);
    expect(fouten((b) => { b.filter = 'studierichting=Natuurwetenschappen'; })).toEqual([`Kop: de filter moet "${KOPPEL_PARAMETER}=G-0193" zijn.`]);
    expect(fouten((b) => { b.methode = 'graad-en-stroom'; })).toEqual([
      'Kop: de methode "graad-en-stroom" kan alleen in de 1ste graad.',
      'Kop: de filter van "graad-en-stroom" moet met "graad=1ste graad; stroom=A-stroom" of "…B-stroom" beginnen.',
    ]);
    expect(fouten((b) => { (b as Record<string, unknown>).methode = 'naam'; })).toEqual(['Kop: de methode "naam" is niet "api" of "graad-en-stroom".']);
    expect(fouten((b) => { b.opgehaald = '2026-11-03 05:52:40'; })).toEqual(['Kop: "opgehaald" is geen tijdstip (JJJJ-MM-DDTUU:MM:SSZ).']);
    expect(fouten((b) => { b.titel = ''; })).toEqual(['Kop: "titel" ontbreekt of is leeg.']);
  });

  it('negatief: aantal en volgorde', () => {
    expect(fouten((b) => { b.aantal = 6; })).toEqual(['Kop zegt 6 doelen, maar de sets bevatten er samen 7.']);
    expect(fouten((b) => { b.sets[1].ids.reverse(); })[0]).toMatch(/Set ODS_3132: het nummer "90100" staat na "90101"/);
    expect(fouten((b) => { b.sets[0].ids = ['1001', '998']; })[0]).toMatch(/verkeerde volgorde/);
    expect(fouten((b) => { b.sets.reverse(); })[0]).toMatch(/Sets: de set .* verkeerde volgorde/);
    expect(fouten((b) => { b.sets[1].ids.push('90101'); b.aantal = 8; })).toEqual(['Set ODS_3132: het nummer "90101" staat er meer dan één keer in.']);
  });

  it('positief: hetzelfde nummer in een gewone en een BuSO-set (de BuSO-kopie en een andere versie delen hun vaste nummers)', () => {
    // ODS_3132 (gewoon) en ODS_3244 (Buitengewoon) met dezelfde vier nummers
    expect(fouten((b) => { b.sets[2].ids = ['90011', '90012', '90100', '90101']; b.aantal = 10; })).toEqual([]);
    // en hetzelfde nummer in drie sets tegelijk
    expect(fouten((b) => { b.sets[0].ids = ['90011', '90012']; b.sets[2].ids = ['90011']; })).toEqual([]);
  });

  it('negatief: meer nummers dan de set telt, en dezelfde set twee keer', () => {
    expect(fouten((b) => { b.sets[0].setAantal = 1; })).toEqual(['Set ODS_999: 2 nummers, maar de set telt er maar 1.']);
    expect(fouten((b) => { b.sets.splice(1, 0, kopie(b.sets[0])); b.aantal = 9; })).toEqual(['Sets: de set "ODS_999" staat er meer dan één keer in.']);
  });

  it.runIf(EERSTE_GRAAD_AANWEZIG)('positief: echte bestanden voor de 1ste graad (A- en B-stroom) uit alle sets van minimumdoelen/index.json, ook BuSO en oude versies', () => {
    for (const [groep, titel] of [['G-0307', 'Eerste leerjaar A'], ['G-0308', 'Eerste leerjaar B']] as const) {
      const stroom = stroomVanEersteGraad(titel);
      if (stroom === undefined) throw new Error(titel);
      const { bestand, sets } = eersteGraadBestand(groep, titel, stroom);
      expect(sets.length, titel).toBeGreaterThan(0);
      // Op de gegevens van oktober 2026 deelt een gewone set vaste nummers met haar BuSO-kopie (wat de oude
      // controle weigerde). Dat is een eigenschap van de bron, geen regel van Boosterz: een maandelijkse update
      // mag dat veranderen zonder dat deze test faalt. De regel zelf bewaakt de synthetische test hierboven.
      // Elke set staat er volledig in (F4).
      for (const s of bestand.sets) expect(s.ids.length, s.set).toBe(s.setAantal);
      expect(valideerRichtingDoelenBestand(bestand, groep)).toEqual([]);
      expect(valideerRichtingDoelenBestand(JSON.parse(JSON.stringify(bestand)), groep)).toEqual([]);
    }
  });

  it('negatief: de vorm van een set', () => {
    expect(fouten((b) => { b.sets[0].set = 'BIOLOGIE'; })[0]).toMatch(/past niet op ODS_<getal>/);
    expect(fouten((b) => { b.sets[0].setSha = 'a'.repeat(64); })).toEqual(['Set ODS_999: het versiemerk "setSha" is niet 16 hex-tekens.']);
    expect(fouten((b) => { b.sets[0].setAantal = 0; })).toEqual(['Set ODS_999: "setAantal" is geen geheel getal groter dan 0.']);
    expect(fouten((b) => { b.sets[0].ids = []; b.aantal = 5; })).toEqual(['Set ODS_999: "ids" ontbreekt of is leeg.']);
    expect(fouten((b) => { (b.sets[0] as unknown as Record<string, unknown>).ids = [998, 1001]; })).toEqual(['Set ODS_999: "ids" bevat iets anders dan (niet-lege) tekst.', 'Kop zegt 7 doelen, maar de sets bevatten er samen 5.']);
    expect(fouten((b) => { b.sets[2].onderwijssoort = ''; })).toEqual(['Set ODS_3244: "onderwijssoort" is geen tekst (of leeg).']);
    expect(fouten((b) => { (b.sets[0] as unknown as Record<string, unknown>).volledig = true; })).toEqual(['Set ODS_999: onbekende velden "volledig".']);
  });

  it('gooit nooit, ook niet op rare invoer', () => {
    for (const raar of [{ sets: [null, 5, { ids: [null] }] }, { sets: 'x' }, { methode: 'graad-en-stroom', sets: [{ ids: 'x' }] }]) {
      expect(() => valideerRichtingDoelenBestand(raar, 'G-0001')).not.toThrow();
      expect(valideerRichtingDoelenBestand(raar).length).toBeGreaterThan(0);
    }
  });
});
