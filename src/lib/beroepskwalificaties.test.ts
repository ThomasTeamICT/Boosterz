// Tests voor src/lib/beroepskwalificaties.ts (docs/STUDIERICHTINGEN.md § 23.5.3, pakket K1).
//
// De nagebootste antwoorden volgen de vorm uit het uittreksel van de verkenning (ronde 6 en 7, zie
// tests/fixtures/kwalificaties/api/ruw/): veldnamen en soorten zoals daar, teksten ingekort. Wat niet in
// het uittreksel staat (bv. de meeste competentiecodes), is herkenbaar verzonnen testdata (BK-9999-…,
// bkc9…), geen officiële koppeling.
//
// Per normalisatie- en validatiefunctie staan de gevallen in een tabel POSITIEF (≥ 3) en NEGATIEF (≥ 6).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADV_NUMMER,
  BK_API,
  BK_INDEX_API,
  BK_NUMMER,
  BK_VERSIE,
  COMPETENTIE_CODE,
  DBK_NUMMER,
  KOPPELING_API,
  KOPPELING_NAAMSVERMELDING,
  BK_NAAMSVERMELDING,
  BK_BRON,
  LICENTIE,
  MAX_EXTRA_VELD,
  bevatHtml,
  bkApiVan,
  bkBestandVan,
  bkVersieVan,
  doelcodesVanBestand,
  erkenningenOp,
  geldtOp,
  gelijkZonderVolgorde,
  lijstVanBkPagina,
  normaliseerBkDetail,
  normaliseerBkLijstItem,
  normaliseerOnderdeelDetail,
  splitsBk,
  valideerBkBestand,
  valideerBkIndex,
  valideerKoppelingBestand,
  veldenVan,
  vergelijkBekrachtiging,
  vergelijkBkVersie,
  vergelijkErkenning,
  type BkBestand,
  type Erkenning,
} from './beroepskwalificaties';
import { normalizeGoalCode } from './curriculum';
import { GROEP_NUMMER } from './studierichtingen';

type Rec = Record<string, any>;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODULE = join(ROOT, 'src', 'lib', 'beroepskwalificaties.ts');
const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);
const NU = '2026-10-10T00:00:00Z';

/** Een diepe kopie (JSON), zodat elke test zijn eigen invoer heeft. */
const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ── Nagebootste antwoorden (vorm van ronde 6 en 7) ──────────────────────────

const API = 'https://onderwijs.api.vlaanderen.be';

/** Een element van `beroepskwalificaties[]` van een erkenning (ronde 6 en 7). */
const bkVerwijzing = (nr: string, kort: number, titel: string): Rec => ({
  beroepskwalificatie_nr: nr,
  versie_nr_kort: kort,
  versie_nr_lang: `${nr}-${kort}`,
  titel,
  api_url: `${API}/beroepskwalificatie/v1/${nr}-${kort}`,
  volledigheid: 'Volledig',
});

/** Het detail van onderdeel 504 (Onthaal en recreatie, 3de graad A), zoals ronde 6 en 7 het tonen. */
function detail504(): Rec {
  return {
    structuuronderdeel_nummer: 504,
    titel: 'Onthaal en recreatie',
    structuuronderdeel_groep: {
      structuuronderdeel_groep_nummer: 'G-0393',
      titel: 'Onthaal en recreatie',
      finaliteit: { code: 'A', omschrijving: 'Arbeidsmarktfinaliteit' },
      graad: { code: '3', omschrijving: 'Derde graad' },
    },
    api_url: `${API}/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel/504`,
    begindatum: '2023-09-01',
    duaal: false,
    onderwijsvorm: { code: 'BSO', omschrijving: 'Beroepssecundair onderwijs' },
    structuuronderdeel_details: [
      {
        structuuronderdeel_detail_nummer: 'ADV-0842',
        structuuronderdeel_detail_versie: 'S-504-V1',
        omschrijving: '<p style="margin-left:0px;">De leerlingen krijgen een pakket</p>',
        doorstroomprofiel: '<p style="margin-left:0px;">Onthaal en Recreatie&nbsp;&nbsp;</p>',
        begindatum: '2023-09-01',
        curriculumdossier: `${API}/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel_detail/ADV-0842/curriculumdossier`,
        status: { code: 'ERKEND', omschrijving: 'Erkend' },
        led_onderwerp: { code: '812001', led_onderwerp_nummer: 'LED-0267', omschrijving: 'Toerisme algemeen' },
        isced: { studiegebieden: { code: '1015' } },
        beroepskwalificaties: [bkVerwijzing('BK-0464', 1, 'Recreatief medewerker'), bkVerwijzing('BK-0390', 2, 'Onthaalmedewerker')],
        leerjaren: [{ code: '1', omschrijving: 'Eerste leerjaar', begindatum: '2023-09-01' }],
        studiebekrachtigingen: [
          {
            naam: 'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3',
            uitgebreide_naam: 'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3',
            led_bewijstype: 'Diploma, onderwijskwalificatie niveau 3',
            vks_niveau: 'OK3',
            onderwijskwalificatie: true,
            categorie: 'Diploma',
            maximale_studiebekrachtiging: true,
          },
          {
            naam: 'Bewijs van slagen voor de basisvorming',
            uitgebreide_naam: 'Bewijs van slagen voor de basisvorming Onthaal en recreatie',
            led_bewijstype: 'Bewijs van slagen voor de basisvorming',
            onderwijskwalificatie: false,
            categorie: 'Bewijs',
            maximale_studiebekrachtiging: false,
          },
          {
            naam: 'Bewijs van beroepskwalificatie',
            uitgebreide_naam: 'Bewijs van beroepskwalificatie Recreatief medewerker (BK-0464-1)',
            onderwijskwalificatie: false,
            categorie: 'Bewijs',
            beroepskwalificatie: { beroepskwalificatie_nr: 'BK-0464', versie_nr_kort: 1, versie_nr_lang: 'BK-0464-1', titel: 'Recreatief medewerker', api_url: `${API}/beroepskwalificatie/v1/BK-0464-1` },
          },
        ],
      },
    ],
  };
}

/** Het detail van onderdeel 1 (Afwerking bouw duaal): twee erkenningen die een schooljaar overlappen, en een DBK. */
function detail1(): Rec {
  return {
    structuuronderdeel_nummer: 1,
    structuuronderdeel_groep: { structuuronderdeel_groep_nummer: 'G-0001' },
    structuuronderdeel_details: [
      {
        structuuronderdeel_detail_nummer: 'ADV-1608',
        structuuronderdeel_detail_versie: 'S-1-V2',
        status: { code: 'ERKEND', omschrijving: 'Erkend' },
        begindatum: '2023-09-01',
        beroepskwalificaties: [bkVerwijzing('BK-0169', 3, 'Plaatser soepele vloerbekleding'), bkVerwijzing('BK-0130', 5, 'Stukadoor'), bkVerwijzing('BK-0168', 3, 'Dekvloerlegger ')],
        studiebekrachtigingen: [
          {
            uitgebreide_naam: 'Bewijs van deelkwalificatie Plaatser buitenbepleistering (BK-0130-5-DBK-01)',
            onderwijskwalificatie: false,
            deelkwalificatie: { deelkwalificatie_nr_kort: 'DBK-01', deelkwalificatie_nr_lang: 'BK-0130-5-DBK-01', titel: 'Plaatser buitenbepleistering' },
          },
          {
            uitgebreide_naam: 'Bewijs van beroepskwalificatie Stukadoor (BK-0130-5)',
            onderwijskwalificatie: true,
            beroepskwalificatie: { beroepskwalificatie_nr: 'BK-0130', versie_nr_kort: 5, versie_nr_lang: 'BK-0130-5', titel: 'Stukadoor', api_url: `${API}/beroepskwalificatie/v1/BK-0130-5` },
          },
        ],
      },
      {
        structuuronderdeel_detail_nummer: 'ADV-1193',
        structuuronderdeel_detail_versie: 'S-1-V1',
        status: { code: 'ERKEND', omschrijving: 'Erkend' },
        begindatum: '2017-09-01',
        einddatum: '2024-08-31',
        beroepskwalificaties: [bkVerwijzing('BK-0168', 2, 'Dekvloerlegger')],
      },
    ],
  };
}

const competentie = (nr: number | undefined, code: string, waarde: string, extra: Rec = {}): Rec => ({
  competentie_type: 'Vakspecifieke competentie',
  ...(nr === undefined ? {} : { nr }),
  competentie_code: code,
  waarde,
  referenties: [{ referentie_nr: 'co 01993' }],
  vaardigheden: [
    { vaardigheid_type: 'Cognitieve vaardigheden', waarde: 'Wisselt informatie uit met collega’s en eindverantwoordelijke' },
    { vaardigheid_type: 'Motorische vaardigheden', waarde: 'Werkt ordelijk' },
  ],
  kennis: [{ kennis_type: 'Kennis', waarde: 'Kennis van de bedrijfscultuur, procedures en regels' }],
  ...extra,
});

/** Het detail van BK-0390-2 (Onthaalmedewerker) in de vorm van ronde 7, met drie competenties. */
function bk0390(): Rec {
  return {
    beroepskwalificatie: {
      versie_nr_lang: 'BK-0390-2',
      versie_nr_kort: 2,
      titel: 'Onthaalmedewerker',
      status: 'erkend',
      statuscode: 'ERKEND',
      vks_niveau: 3,
      nieuwste_versie: true,
      definitie: 'Het correct ontvangen en informeren van personen',
      omschrijving_kort: 'De onthaalmedewerker (VKS-niveau 2) ontvangt en informeert personen',
      erkenningsjaar: 2020,
      erkenningsdatum: '2020-02-28',
      led_onderwerp: { code: '812001', led_onderwerp_nummer: 'LED-0267', omschrijving: 'Toerisme algemeen' },
      synoniemen: [{ waarde: 'Balie- en informatiebediende' }],
      domeinen: [{ domein: 'Onthaal en informatie', pad: ['Toerisme', 'Onthaal en informatie'], pad_tekst: 'Toerisme > Onthaal en informatie' }],
      competenties: [
        competentie(3, 'bkc9000003', 'Onthaalt bezoekers'),
        competentie(1, 'bkc0045062', 'Werkt in teamverband'),
        competentie(2, 'bkc9000002', 'Communiceert met bezoekers'),
      ],
      omgevingscontext: [{ waarde: 'De beroepsuitoefening varieert naargelang de grootte van het bedrijf' }],
      handelingscontext: [{ waarde: 'Efficiënt, kwaliteitsvol handelen in alle omstandigheden.' }],
      autonomie: [{ autonomie_type: 'Is zelfstandig in', waarde: 'het nauwkeurig uitvoeren van de opdracht' }],
      verantwoordelijkheid: [{ waarde: 'Respecteert de bedrijfs/organisatiecultuur, procedures en regels' }],
      links: { self: { href: `${BK_API}/beroepskwalificatie/BK-0390-2` }, website: { href: 'https://app.akov.be/' } },
    },
    totalItems: 1,
  };
}

/** Een pagina van de BK-lijst in de vorm van ronde 6. */
function lijstPagina(): Rec {
  return {
    gegevens: [
      {
        beroepskwalificatie_nr: 'BK-0001',
        laatst_erkende_versie: { versie_nr_kort: 1, versie_nr_lang: 'BK-0001-1', titel: 'Eerste', erkenningsdatum: '2012-04-20', links: { self: { href: `${BK_API}/beroepskwalificatie/BK-0001-1` } } },
        versies: [{ versie_nr_kort: 1, versie_nr_lang: 'BK-0001-1', titel: 'Eerste', status: 'erkend', statuscode: 'ERKEND' }],
        geschrapt: false,
        synoniemen: [],
      },
      {
        beroepskwalificatie_nr: 'BK-0002',
        laatst_erkende_versie: { versie_nr_kort: 3, versie_nr_lang: 'BK-0002-3', titel: 'Tweede' },
        versies: [{ versie_nr_lang: 'BK-0002-1' }, { versie_nr_lang: 'BK-0002-2' }, { versie_nr_lang: 'BK-0002-3' }],
      },
    ],
    meta: { total_elements: 604, total_pages: 31, number: 0, number_of_elements: 20, size: 20, first: true, last: false },
    links: { self: { href: `${BK_API}/beroepskwalificatie` }, next: { href: `${BK_API}/beroepskwalificatie?page=1` } },
  };
}

// ── Geldige bestanden, gebouwd uit de normalisatie (zoals het script het doet) ──

function erkenningenVan(raw: Rec, nr: number): Erkenning[] {
  const n = normaliseerOnderdeelDetail(raw, nr);
  expect(n.problemen).toEqual([]);
  return n.erkenningen;
}

function geldigeKoppeling(): Rec {
  return {
    app: 'boosterz',
    kind: 'richtingkwalificaties',
    v: 1,
    bron: BK_BRON,
    api: KOPPELING_API,
    naamsvermelding: KOPPELING_NAAMSVERMELDING,
    licentie: LICENTIE,
    opgehaald: NU,
    matrixSha256: SHA,
    aantalOnderdelen: 4,
    sha256: SHA2,
    onderdelen: kopie([
      { onderdeel: 1, groep: 'G-0001', status: 'opgehaald', opgehaald: NU, erkenningen: erkenningenVan(detail1(), 1) },
      { onderdeel: 2, groep: 'G-0002', status: 'nog-niet-opgehaald' },
      { onderdeel: 504, groep: 'G-0393', status: 'opgehaald', opgehaald: NU, erkenningen: erkenningenVan(detail504(), 504) },
      { onderdeel: 931, groep: 'G-0009', status: 'niet-gevonden', nietMeerInBron: '2026-10-10' },
    ]),
  };
}

function geldigBkBestand(): Rec {
  const n = normaliseerBkDetail(bk0390(), 'BK-0390-2');
  expect(n.problemen).toEqual([]);
  const inhoud = n.inhoud as NonNullable<typeof n.inhoud>;
  return kopie({
    app: 'boosterz',
    kind: 'beroepskwalificatie',
    v: 1,
    bk: 'BK-0390-2',
    nummer: 'BK-0390',
    versie: 2,
    ...inhoud,
    bron: BK_BRON,
    api: bkApiVan('BK-0390-2'),
    naamsvermelding: BK_NAAMSVERMELDING,
    licentie: LICENTIE,
    opgehaald: NU,
    aantal: inhoud.competenties.length,
    sha256: SHA,
  });
}

function geldigeIndex(): Rec {
  return {
    app: 'boosterz',
    kind: 'beroepskwalificaties-index',
    v: 1,
    bron: BK_BRON,
    api: BK_INDEX_API,
    naamsvermelding: BK_NAAMSVERMELDING,
    licentie: LICENTIE,
    opgehaald: NU,
    lijstTotaal: 604,
    sha256: SHA,
    bks: [
      { bk: 'BK-0130-4', nummer: 'BK-0130', versie: 4, titel: 'Stukadoor', aantal: 9, sha256: SHA, opgehaald: NU, bestand: 'bk/BK-0130-4.json', nietMeerGekoppeld: '2026-12-03' },
      { bk: 'BK-0390-2', nummer: 'BK-0390', versie: 2, titel: 'Onthaalmedewerker', vks: 3, status: 'ERKEND', aantal: 12, sha256: SHA2, opgehaald: NU, bestand: 'bk/BK-0390-2.json', laatstErkend: 'BK-0390-2' },
      { bk: 'BK-0390-10', nummer: 'BK-0390', versie: 10, titel: 'Onthaalmedewerker', aantal: 12, sha256: SHA, opgehaald: NU, bestand: 'bk/BK-0390-10.json', nietMeerInBron: '2026-11-03' },
      { bk: 'BK-0611-1', nummer: 'BK-0611', versie: 1, opgehaald: NU, nietGevonden: true },
      { bk: 'BK-9999-3', nummer: 'BK-9999', versie: 3, opgehaald: NU, onbruikbaar: true },
    ],
  };
}

/** Een JSON-tekst met een eigen veld `__proto__` (JSON.parse maakt dan een gewoon eigen veld). */
const metProto = (json: string): Rec => JSON.parse(json) as Rec;

// ── Laden en constanten ─────────────────────────────────────────────────────

describe('laden en constanten', () => {
  it('laadt in Node zonder bundler (type stripping), zoals het ophaalscript het doet', () => {
    const uit = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const m = await import('./src/lib/beroepskwalificaties.ts'); console.log(typeof m.normaliseerOnderdeelDetail, m.vergelijkBkVersie('BK-0390-2', 'BK-0390-10'))"],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    );
    expect(uit.trim()).toBe('function -1');
  }, 30_000);

  it('heeft geen imports (pure module)', () => {
    const bron = readFileSync(MODULE, 'utf8');
    expect(bron).not.toMatch(/^\s*import\s/m);
    expect(bron).not.toMatch(/\brequire\(/);
  });

  it('heeft de regexen en grenzen van § 23.5.3', () => {
    expect(BK_NUMMER.source).toBe('^BK-\\d{3,6}$');
    expect(BK_VERSIE.source).toBe('^BK-\\d{3,6}-\\d{1,4}$');
    expect(DBK_NUMMER.source).toBe('^BK-\\d{3,6}-\\d{1,4}-DBK-\\d{1,4}$');
    expect(COMPETENTIE_CODE.source).toBe('^[A-Za-z0-9_.-]{1,64}$');
    expect(MAX_EXTRA_VELD).toBe(20_000);
    expect(BK_API).toBe('https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2');
    expect(ADV_NUMMER.test('ADV-0842')).toBe(true);
    expect(bkApiVan('BK-0390-2')).toBe(`${BK_API}/beroepskwalificatie/BK-0390-2`);
    expect(bkBestandVan('BK-0390-2')).toBe('bk/BK-0390-2.json');
  });

  it('gebruikt hetzelfde groepnummer als studierichtingen.ts (de module heeft geen imports)', () => {
    const bron = readFileSync(MODULE, 'utf8');
    const m = /const GROEP_NUMMER = \/(.+)\/;/.exec(bron);
    expect(m?.[1]).toBe(GROEP_NUMMER.source);
  });
});

// ── splitsBk en vergelijkBkVersie ───────────────────────────────────────────

describe('splitsBk en vergelijkBkVersie', () => {
  it('splitst een geldige versie en weigert de rest', () => {
    expect(splitsBk('BK-0390-2')).toEqual({ nummer: 'BK-0390', versie: 2 });
    expect(splitsBk('BK-123456-1234')).toEqual({ nummer: 'BK-123456', versie: 1234 });
    for (const fout of ['BK-0390', 'BK-0130-5-DBK-01', 'bk-0390-2', ' BK-0390-2', 'BK-12-1', '', '__proto__']) expect(splitsBk(fout)).toBeUndefined();
    expect(splitsBk(42 as unknown as string)).toBeUndefined();
  });

  it('sorteert numeriek op nummer en versie, en is een totale volgorde', () => {
    const lijst = ['BK-0391-1', 'BK-0390-10', 'onzin', 'BK-0390-2', 'BK-390-3', 'BK-0390-02', 'BK-0130-5'];
    expect([...lijst].sort(vergelijkBkVersie)).toEqual(['BK-0130-5', 'BK-0390-02', 'BK-0390-2', 'BK-390-3', 'BK-0390-10', 'BK-0391-1', 'onzin']);
    expect(vergelijkBkVersie('BK-0390-2', 'BK-0390-2')).toBe(0);
    expect(vergelijkBkVersie('BK-0390-2', 'BK-0390-02')).not.toBe(0);
    expect(Math.sign(vergelijkBkVersie('BK-0390-10', 'BK-0390-2'))).toBe(1);
  });
});

// ── lijstVanBkPagina ────────────────────────────────────────────────────────

describe('lijstVanBkPagina', () => {
  const POSITIEF: [string, () => unknown, string, number][] = [
    ['de vorm van ronde 6 (gegevens)', lijstPagina, 'gegevens', 2],
    ['een geneste lijst (Hydra-vorm)', () => ({ gegevens: { member: lijstPagina().gegevens, totalItems: 2 } }), 'gegevens.member', 2],
    ['een lijst op het hoofdniveau', () => lijstPagina().gegevens, '(hoofdniveau)', 2],
    ['de versies in een element tellen niet als tweede lijst', () => ({ ...lijstPagina(), extra: [{ titel: 'geen bk' }] }), 'gegevens', 2],
    ['een veld __proto__ is een gewoon veld', () => metProto('{"__proto__": [{"beroepskwalificatie_nr": "BK-0001"}]}'), '__proto__', 1],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, pagina, pad, lengte) => {
    const r = lijstVanBkPagina(pagina());
    expect(r).toMatchObject({ pad });
    expect('lijst' in r ? r.lijst.length : -1).toBe(lengte);
    expect(({} as Rec).beroepskwalificatie_nr).toBeUndefined();
  });

  const NEGATIEF: [string, unknown, RegExp][] = [
    ['null', null, /geen lijst/],
    ['tekst', 'gegevens', /geen lijst/],
    ['een leeg object', {}, /geen lijst/],
    ['een lege lijst', { gegevens: [], meta: { total_elements: 0 } }, /geen lijst/],
    ['objecten zonder beroepskwalificatie_nr', { gegevens: [{ nummer: 'BK-0001' }] }, /geen lijst/],
    ['twee lijsten', { a: [{ beroepskwalificatie_nr: 'BK-0001' }], b: [{ beroepskwalificatie_nr: 'BK-0002' }] }, /2 lijsten.*a, b/],
    ['te diep genest', { a: { b: { c: { d: { e: { f: { g: [{ beroepskwalificatie_nr: 'BK-0001' }] } } } } } } }, /geen lijst/],
    ['een geërfd veld telt niet', Object.create({ gegevens: [{ beroepskwalificatie_nr: 'BK-0001' }] }), /geen lijst/],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, pagina, fout) => {
    const r = lijstVanBkPagina(pagina);
    expect('fout' in r ? r.fout : '').toMatch(fout);
  });
});

// ── bkVersieVan (T1) ────────────────────────────────────────────────────────

describe('bkVersieVan (T1)', () => {
  const POSITIEF: [string, unknown, string | undefined, string][] = [
    ['versie_nr_lang (vorm 1 van T1)', bkVerwijzing('BK-0390', 2, 'Onthaalmedewerker'), undefined, 'BK-0390-2'],
    ['nummer en versie_nr_kort (vorm 2 van T1)', { beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: 2 }, undefined, 'BK-0390-2'],
    ['tekst', ' BK-0390-2 ', undefined, 'BK-0390-2'],
    ['een lijst met één element', [{ versie_nr_lang: 'BK-0390-2' }], undefined, 'BK-0390-2'],
    ['versie_nr_lang past niet, terugval op nummer en kort', { beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: '2', versie_nr_lang: 'BK 0390 2' }, undefined, 'BK-0390-2'],
    ['het nummer komt van buiten (laatst_erkende_versie)', { versie_nr_kort: 3 }, 'BK-0002', 'BK-0002-3'],
    ['nummer als object {code}', { beroepskwalificatie_nr: { code: 'BK-0390' }, versie_nr_lang: 'BK-0390-2' }, undefined, 'BK-0390-2'],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, v, nummer, verwacht) => {
    expect(bkVersieVan(v, nummer)).toBe(verwacht);
  });

  const NEGATIEF: [string, unknown][] = [
    ['een DBK als tekst', 'BK-0130-5-DBK-01'],
    ['een DBK als object', { deelkwalificatie_nr_kort: 'DBK-01', deelkwalificatie_nr_lang: 'BK-0130-5-DBK-01' }],
    ['een versie van een ander nummer', { beroepskwalificatie_nr: 'BK-0390', versie_nr_lang: 'BK-0391-2' }],
    ['een ander versienummer', { versie_nr_lang: 'BK-0390-2', versie_nr_kort: 3 }],
    ['een nummer zonder versie', { beroepskwalificatie_nr: 'BK-0390' }],
    ['alleen het nummer als tekst', 'BK-0390'],
    ['een lijst met twee elementen', ['BK-0390-2', 'BK-0464-1']],
    ['de versie alleen in een ander veld', { titel: 'BK-0390-2' }],
    ['een eigen veld "__proto__" (zoals JSON.parse het maakt) met een versie erin', metProto('{"__proto__": {"versie_nr_lang": "BK-0390-2"}}')],
    ['een geërfde versie (prototype)', Object.create({ versie_nr_lang: 'BK-0390-2' })],
    ['een eigen nummer met een geërfd versienummer', Object.assign(Object.create({ versie_nr_kort: 2 }), { beroepskwalificatie_nr: 'BK-0390' })],
    ['een versie_nr_kort "0"', { beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: '0' }],
    ['een versie_nr_kort 0', { beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: 0 }],
    ['leeg', null],
    ['een getal', 2],
    ['een versie_nr_kort dat geen getal is', { beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: 'twee' }],
    ['een onleesbaar nummer naast een geldige versie', { beroepskwalificatie_nr: { soort: 'BK' }, versie_nr_lang: 'BK-0390-2' }],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, v) => {
    expect(bkVersieVan(v)).toBeUndefined();
  });
});

// ── normaliseerBkLijstItem ──────────────────────────────────────────────────

describe('normaliseerBkLijstItem', () => {
  const POSITIEF: [string, unknown, { nummer?: string; laatstErkend?: string }][] = [
    ['de vorm van ronde 6', lijstPagina().gegevens[1], { nummer: 'BK-0002', laatstErkend: 'BK-0002-3' }],
    ['alleen versie_nr_kort (T1 vorm 2, nummer van het element)', { beroepskwalificatie_nr: 'BK-0002', laatst_erkende_versie: { versie_nr_kort: 3 } }, { nummer: 'BK-0002', laatstErkend: 'BK-0002-3' }],
    ['laatst erkende versie als tekst', { beroepskwalificatie_nr: 'BK-0002', laatst_erkende_versie: 'BK-0002-3' }, { nummer: 'BK-0002', laatstErkend: 'BK-0002-3' }],
    ['een lijst met één element', [{ beroepskwalificatie_nr: 'BK-0001', laatst_erkende_versie: [{ versie_nr_lang: 'BK-0001-1' }] }], { nummer: 'BK-0001', laatstErkend: 'BK-0001-1' }],
    ['zonder laatst erkende versie', { beroepskwalificatie_nr: 'BK-0600', geschrapt: true }, { nummer: 'BK-0600' }],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, raw, verwacht) => {
    const r = normaliseerBkLijstItem(raw);
    expect(r.problemen).toEqual([]);
    expect({ nummer: r.nummer, laatstErkend: r.laatstErkend }).toEqual({ nummer: verwacht.nummer, laatstErkend: verwacht.laatstErkend });
  });

  const NEGATIEF: [string, unknown, RegExp, string | undefined][] = [
    ['null', null, /geen object/, undefined],
    ['tekst', 'BK-0002', /geen object/, undefined],
    ['zonder nummer', { laatst_erkende_versie: 'BK-0002-3' }, /geen nummer/, undefined],
    ['een nummer dat niet past', { beroepskwalificatie_nr: 'BK-12' }, /geen nummer/, undefined],
    ['een versie van een ander nummer', { beroepskwalificatie_nr: 'BK-0002', laatst_erkende_versie: { versie_nr_lang: 'BK-0003-1' } }, /niet te lezen|hoort niet/, 'BK-0002'],
    ['een DBK als laatst erkende versie', { beroepskwalificatie_nr: 'BK-0130', laatst_erkende_versie: 'BK-0130-5-DBK-01' }, /onbekende vorm/, 'BK-0130'],
    ['een versie die niet past en geen kort nummer', { beroepskwalificatie_nr: 'BK-0002', laatst_erkende_versie: { versie_nr_lang: 'onzin' } }, /niet te lezen/, 'BK-0002'],
    ['een lijst met twee elementen', [{ beroepskwalificatie_nr: 'BK-0001' }, { beroepskwalificatie_nr: 'BK-0002' }], /geen object/, undefined],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, raw, fout, nummer) => {
    const r = normaliseerBkLijstItem(raw);
    expect(r.problemen.join(' ')).toMatch(fout);
    expect(r.nummer).toBe(nummer);
    expect(r.laatstErkend).toBeUndefined();
  });

  it('negatief: een laatst erkende versie in een eigen veld "__proto__" telt niet en vervuilt niets', () => {
    const r = normaliseerBkLijstItem(metProto('{"beroepskwalificatie_nr": "BK-0002", "__proto__": {"laatst_erkende_versie": "BK-0002-9"}}'));
    expect(r).toEqual({ nummer: 'BK-0002', problemen: [] });
    expect(({} as Rec).laatst_erkende_versie).toBeUndefined();
  });

  it('negatief: een geërfde laatst erkende versie (prototype) telt niet', () => {
    const item = Object.assign(Object.create({ laatst_erkende_versie: 'BK-0002-9' }) as Rec, { beroepskwalificatie_nr: 'BK-0002' });
    expect(normaliseerBkLijstItem(item)).toEqual({ nummer: 'BK-0002', problemen: [] });
    const geerfdNummer = Object.create({ beroepskwalificatie_nr: 'BK-0002' }) as Rec;
    expect(normaliseerBkLijstItem(geerfdNummer).problemen.join(' ')).toMatch(/geen nummer/);
  });
});

// ── normaliseerOnderdeelDetail ──────────────────────────────────────────────

describe('normaliseerOnderdeelDetail', () => {
  it('positief: onderdeel 504 in de vorm van ronde 6 en 7', () => {
    const r = normaliseerOnderdeelDetail(detail504(), 504);
    expect(r.problemen).toEqual([]);
    expect(r.waarschuwingen).toEqual([]);
    expect(r.nummer).toBe(504);
    expect(r.groep).toBe('G-0393');
    expect(r.vormOnbekend).toBe(0);
    expect(r.erkenningen).toHaveLength(1);
    const e = r.erkenningen[0];
    expect(e).toMatchObject({ adv: 'ADV-0842', versie: 'S-504-V1', status: 'ERKEND', begindatum: '2023-09-01' });
    expect(e.einddatum).toBeUndefined();
    expect(e.geenLijst).toBeUndefined();
    expect(e.bks).toEqual([
      { bk: 'BK-0390-2', titel: 'Onthaalmedewerker', extra: { volledigheid: 'Volledig' } },
      { bk: 'BK-0464-1', titel: 'Recreatief medewerker', extra: { volledigheid: 'Volledig' } },
    ]);
    expect(e.bekrachtigingen.map((b) => b.naam)).toEqual([
      'Bewijs van beroepskwalificatie Recreatief medewerker (BK-0464-1)',
      'Bewijs van slagen voor de basisvorming Onthaal en recreatie',
      'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3',
    ]);
    const [bewijsBk, basis, diploma] = e.bekrachtigingen;
    expect(bewijsBk).toEqual({ naam: bewijsBk.naam, bk: 'BK-0464-1', extra: { categorie: 'Bewijs', naam: 'Bewijs van beroepskwalificatie' } });
    expect(basis.onderwijskwalificatie).toBeUndefined();
    expect(basis.extra).toMatchObject({ naam: 'Bewijs van slagen voor de basisvorming', maximale_studiebekrachtiging: false });
    expect(diploma).toMatchObject({ onderwijskwalificatie: true, extra: { vks_niveau: 'OK3', categorie: 'Diploma' } });
    expect(diploma.extra).not.toHaveProperty('naam');
    // Wat nooit in de koppeling komt: adressen en wat al in de matrix staat.
    const tekst = JSON.stringify(r.erkenningen);
    for (const weg of ['api_url', 'curriculumdossier', 'omschrijving', 'doorstroomprofiel', 'leerjaren', 'onderwijs.api.vlaanderen.be']) expect(tekst).not.toContain(weg);
    expect(e.extra).toBeUndefined();
    expect(r.velden).toContain('structuuronderdeel_details[].beroepskwalificaties[].versie_nr_lang');
    expect(r.velden).toContain('structuuronderdeel_details[].curriculumdossier');
  });

  it('positief: onderdeel 1, twee erkenningen (gesorteerd op begindatum) en een deelkwalificatie bij naam', () => {
    const r = normaliseerOnderdeelDetail(detail1(), 1);
    expect(r.problemen).toEqual([]);
    expect(r.erkenningen.map((e) => e.adv)).toEqual(['ADV-1193', 'ADV-1608']);
    const [oud, nieuw] = r.erkenningen;
    expect(oud).toMatchObject({ einddatum: '2024-08-31', bks: [{ bk: 'BK-0168-2', titel: 'Dekvloerlegger' }], bekrachtigingen: [] });
    expect(nieuw.bks.map((k) => k.bk)).toEqual(['BK-0130-5', 'BK-0168-3', 'BK-0169-3']);
    expect(nieuw.bks.find((k) => k.bk === 'BK-0168-3')?.titel).toBe('Dekvloerlegger');
    const dbk = nieuw.bekrachtigingen.find((b) => b.dbk !== undefined);
    expect(dbk).toEqual({
      naam: 'Bewijs van deelkwalificatie Plaatser buitenbepleistering (BK-0130-5-DBK-01)',
      dbk: 'BK-0130-5-DBK-01',
      extra: { deelkwalificatie: { titel: 'Plaatser buitenbepleistering' } },
    });
    expect(nieuw.bekrachtigingen.find((b) => b.bk === 'BK-0130-5')).toMatchObject({ onderwijskwalificatie: true });
  });

  it('positief: tolerante vormen (tekst of object, een lijst met één element, T1 en T3 in beide vormen)', () => {
    const raw: Rec = {
      structuuronderdeel_nummer: '504',
      structuuronderdeel_groep: [{ structuuronderdeel_groep_nummer: 'G-0393' }],
      structuuronderdeel_details: {
        structuuronderdeel_detail_nummer: ['ADV-0842'],
        status: [{ code: 'erkend' }],
        begindatum: '2023-09-01T00:00:00Z',
        beroepskwalificaties: ['BK-0390-2', { beroepskwalificatie_nr: 'BK-0464', versie_nr_kort: '1' }, { code: 'BK-0500-1' }],
        studiebekrachtigingen: [
          { uitgebreide_naam: 'Bewijs A', beroepskwalificatie: 'BK-0464-1', onderwijskwalificatie: 'true' },
          { uitgebreide_naam: 'Bewijs B', beroepskwalificatie: { code: 'BK-0390-2', soort: 'BK' } },
          { naam: 'Bewijs C', deelkwalificatie: 'BK-0130-5-DBK-02' },
          'Bewijs D',
        ],
      },
    };
    const r = normaliseerOnderdeelDetail(raw, 504);
    expect(r.problemen).toEqual([]);
    expect(r.groep).toBe('G-0393');
    const e = r.erkenningen[0];
    expect(e).toMatchObject({ adv: 'ADV-0842', status: 'erkend', begindatum: '2023-09-01' });
    expect(e.bks.map((k) => k.bk)).toEqual(['BK-0390-2', 'BK-0464-1', 'BK-0500-1']);
    expect(e.bekrachtigingen).toEqual([
      { naam: 'Bewijs A', onderwijskwalificatie: true, bk: 'BK-0464-1' },
      { naam: 'Bewijs B', bk: 'BK-0390-2', extra: { beroepskwalificatie: { soort: 'BK' } } },
      { naam: 'Bewijs C', dbk: 'BK-0130-5-DBK-02' },
      { naam: 'Bewijs D' },
    ]);
    expect(geldtOp(e, '2026-10-10')).toBe(true);
  });

  it('positief: geen veld "beroepskwalificaties" is iets anders dan een lege lijst', () => {
    const zonder = detail504();
    delete zonder.structuuronderdeel_details[0].beroepskwalificaties;
    const leeg = detail504();
    leeg.structuuronderdeel_details[0].beroepskwalificaties = [];
    const metNull = detail504();
    metNull.structuuronderdeel_details[0].beroepskwalificaties = null;
    expect(normaliseerOnderdeelDetail(zonder, 504).erkenningen[0]).toMatchObject({ bks: [], geenLijst: true });
    expect(normaliseerOnderdeelDetail(metNull, 504).erkenningen[0]).toMatchObject({ bks: [], geenLijst: true });
    const l = normaliseerOnderdeelDetail(leeg, 504).erkenningen[0];
    expect(l.bks).toEqual([]);
    expect(l.geenLijst).toBeUndefined();
    expect(l.bekrachtigingen).toHaveLength(3);
  });

  // Lijsten in `extra` blijven in de volgorde van de bron: zie 'volgorde van de API (T6) en gelijkZonderVolgorde'.
  it('positief: de uitvoer hangt niet af van de volgorde van sleutels, erkenningen, BK\'s en studiebekrachtigingen in de API', () => {
    const omgekeerd = (v: unknown): unknown => {
      if (Array.isArray(v)) return [...v].reverse().map(omgekeerd);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).reverse().map(([k, w]) => [k, omgekeerd(w)]));
      return v;
    };
    for (const [raw, nr] of [[detail504(), 504], [detail1(), 1]] as const) {
      const a = normaliseerOnderdeelDetail(raw, nr);
      const b = normaliseerOnderdeelDetail(omgekeerd(raw), nr);
      expect(JSON.stringify(b.erkenningen)).toBe(JSON.stringify(a.erkenningen));
    }
  });

  const NEGATIEF: [string, () => unknown, number, RegExp][] = [
    ['geen object', () => null, 504, /geen object/],
    ['een lijst met twee elementen', () => [detail504(), detail504()], 504, /geen object/],
    ['zonder eigen nummer', () => ({ ...detail504(), structuuronderdeel_nummer: undefined }), 504, /geen eigen nummer/],
    ['een ander nummer dan gevraagd', () => detail504(), 505, /gaat over onderdeel 504.*negeert/],
    ['een ongeldig gevraagd nummer', () => detail504(), 0, /gevraagde nummer/],
    ['een BK zonder versie', () => {
      const d = detail504();
      d.structuuronderdeel_details[0].beroepskwalificaties = [{ beroepskwalificatie_nr: 'BK-0390', titel: 'Onthaalmedewerker' }];
      return d;
    }, 504, /beroepskwalificatie is niet te lezen/],
    ['een versie die niet met haar nummer begint', () => {
      const d = detail504();
      d.structuuronderdeel_details[0].beroepskwalificaties = [{ beroepskwalificatie_nr: 'BK-0390', versie_nr_lang: 'BK-0391-2' }];
      return d;
    }, 504, /BK-0391-2 begint niet met haar nummer BK-0390/],
    ['een BK-verwijzing als vrije tekst', () => {
      const d = detail504();
      d.structuuronderdeel_details[0].beroepskwalificaties = ['Onthaalmedewerker'];
      return d;
    }, 504, /past niet op BK-0000-0 en is geen deelkwalificatie/],
    ['een nummer "0" als tekst', () => ({ ...detail504(), structuuronderdeel_nummer: '0' }), 504, /geen eigen nummer/],
    ['een erkenning zonder ADV-nummer', () => {
      const d = detail504();
      delete d.structuuronderdeel_details[0].structuuronderdeel_detail_nummer;
      return d;
    }, 504, /geen ADV-nummer/],
    ['een ongeldige datum', () => {
      const d = detail504();
      d.structuuronderdeel_details[0].einddatum = '2024-02-30';
      return d;
    }, 504, /einddatum is geen geldige datum/],
    ['een onleesbare status', () => {
      const d = detail504();
      d.structuuronderdeel_details[0].status = { soort: 1 };
      return d;
    }, 504, /status is niet te lezen/],
    ['dezelfde erkenning twee keer met andere gegevens', () => {
      const d = detail504();
      d.structuuronderdeel_details.push({ ...d.structuuronderdeel_details[0], begindatum: '2024-09-01' });
      return d;
    }, 504, /ADV-0842 staat er meer dan één keer/],
    ['erkenningen in een onbekende vorm', () => ({ ...detail504(), structuuronderdeel_details: 'ADV-0842' }), 504, /onbekende vorm/],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, raw, gevraagd, fout) => {
    const r = normaliseerOnderdeelDetail(raw(), gevraagd);
    expect(r.problemen.join(' ')).toMatch(fout);
  });

  it('negatief: bij een ander nummer komen er geen erkenningen terug (P3)', () => {
    const r = normaliseerOnderdeelDetail(detail504(), 505);
    expect(r.nummer).toBe(504);
    expect(r.erkenningen).toEqual([]);
  });

  it('negatief: een DBK in de lijst van beroepskwalificaties wordt niet gekoppeld (waarschuwing, geen probleem)', () => {
    const d = detail504();
    d.structuuronderdeel_details[0].beroepskwalificaties.push({ deelkwalificatie_nr_lang: 'BK-0130-5-DBK-01' }, 'BK-0130-5-DBK-03');
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.erkenningen[0].bks.map((k) => k.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
    expect(r.waarschuwingen.filter((w) => /deelkwalificatie BK-0130-5-DBK-0[13] staat in de lijst/.test(w))).toHaveLength(2);
  });

  it('negatief: studiebekrachtigingen in een onbekende vorm worden geteld (T3) en blijven in extra', () => {
    const d = detail504();
    d.structuuronderdeel_details[0].studiebekrachtigingen.push(42, { uitgebreide_naam: 'Raar', beroepskwalificatie: { soort: 'BK' } }, { categorie: 'zonder naam' });
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.vormOnbekend).toBe(3);
    const raar = r.erkenningen[0].bekrachtigingen.find((b) => b.naam === 'Raar');
    expect(raar).toEqual({ naam: 'Raar', extra: { beroepskwalificatie: { soort: 'BK' } } });
  });

  it('negatief: __proto__ in het detail wordt een gewoon veld en vervuilt niets', () => {
    const tekst = JSON.stringify(detail504()).replace('"structuuronderdeel_detail_versie"', '"__proto__":{"vervuild":true,"bks":["BK-6666-6"]},"structuuronderdeel_detail_versie"');
    const r = normaliseerOnderdeelDetail(JSON.parse(tekst), 504);
    expect(r.problemen).toEqual([]);
    const e = r.erkenningen[0];
    expect(Object.getPrototypeOf(e.extra)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(e.extra, '__proto__')).toBe(true);
    expect(e.bks.map((k) => k.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
    expect(({} as Rec).vervuild).toBeUndefined();
    expect(valideerKoppelingBestand({ ...geldigeKoppeling(), onderdelen: [{ onderdeel: 504, groep: 'G-0393', status: 'opgehaald', opgehaald: NU, erkenningen: r.erkenningen }], aantalOnderdelen: 1 })).toEqual([]);
  });

  it('negatief: api_url en curriculumdossier vallen ook diep in extra weg (nooit een adres om te volgen)', () => {
    const d = detail504();
    const e = d.structuuronderdeel_details[0];
    e.historiek = [{ nummer: 3, api_url: `${API}/x/3`, bron: { curriculumdossier: `${API}/dossier`, naam: 'oud' } }];
    e.studiebekrachtigingen[0].bijlage = { api_url: `${API}/bijlage`, titel: 'Bijlage' };
    e.beroepskwalificaties[0].meer = { api_url: `${API}/meer`, soort: 'x' };
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    const tekst = JSON.stringify(r.erkenningen);
    expect(tekst).not.toMatch(/api_url|curriculumdossier|onderwijs\.api/);
    expect(r.erkenningen[0].extra).toEqual({ historiek: [{ bron: { naam: 'oud' }, nummer: 3 }] });
    const b = normaliseerBkDetail({ beroepskwalificatie: { ...bk0390().beroepskwalificatie, domeinen: [{ domein: 'Onthaal', api_url: `${API}/d` }] } }, 'BK-0390-2');
    expect(JSON.stringify(b.inhoud)).not.toMatch(/api_url/);
    expect(b.inhoud?.extra?.domeinen).toEqual([{ domein: 'Onthaal' }]);
  });

  it('negatief: een extra-veld van 30 kB valt weg met een waarschuwing', () => {
    const d = detail504();
    d.structuuronderdeel_details[0].bijlage = 'x'.repeat(30_000);
    d.structuuronderdeel_details[0].klein = 'blijft';
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.erkenningen[0].extra).toEqual({ klein: 'blijft' });
    expect(r.waarschuwingen.join(' ')).toMatch(/"bijlage" weegt 30002 bytes/);
  });

  it('negatief: een detail zonder erkenningen geeft een waarschuwing en een lege lijst', () => {
    const r = normaliseerOnderdeelDetail({ structuuronderdeel_nummer: 413 }, 413);
    expect(r).toMatchObject({ nummer: 413, erkenningen: [], problemen: [] });
    expect(r.waarschuwingen.join(' ')).toMatch(/geen erkenningen/);
  });

  it('negatief: een onleesbare BK in een studiebekrachtiging is "vorm onbekend" (T3, F3-B14): naam blijft, ruwe waarde in extra, geen probleem', () => {
    // P4 geldt voor de lijst `beroepskwalificaties` (die maakt de koppeling); een studiebekrachtiging telt alleen bij naam.
    const gevallen: [string, unknown, unknown][] = [
      ['een BK zonder versie', { beroepskwalificatie_nr: 'BK-0130', titel: 'Stukadoor' }, { beroepskwalificatie_nr: 'BK-0130', titel: 'Stukadoor' }],
      [
        'een versie die niet met haar nummer begint (met api_url)',
        { beroepskwalificatie_nr: 'BK-0464', versie_nr_kort: 1, versie_nr_lang: 'BK-0465-1', titel: 'Recreatief medewerker', api_url: `${API}/beroepskwalificatie/v1/BK-0465-1` },
        { beroepskwalificatie_nr: 'BK-0464', titel: 'Recreatief medewerker', versie_nr_kort: 1, versie_nr_lang: 'BK-0465-1' },
      ],
      ['twee verwijzingen waar er één hoort', ['BK-0464-1', 'BK-0390-2'], ['BK-0464-1', 'BK-0390-2']],
    ];
    for (const [naam, ruw, inExtra] of gevallen) {
      const d = detail504();
      d.structuuronderdeel_details[0].studiebekrachtigingen[2].beroepskwalificatie = ruw;
      const r = normaliseerOnderdeelDetail(d, 504);
      expect(r.problemen, naam).toEqual([]);
      expect(r.vormOnbekend, naam).toBe(1);
      expect(r.waarschuwingen.join(' '), naam).toMatch(/de beroepskwalificatie is niet te lezen: .*; de studiebekrachtiging blijft bij naam/);
      const e = r.erkenningen[0];
      expect(e.bks.map((k) => k.bk), naam).toEqual(['BK-0390-2', 'BK-0464-1']);
      const b = e.bekrachtigingen.find((x) => x.naam.startsWith('Bewijs van beroepskwalificatie'));
      expect(b, naam).toEqual({
        naam: 'Bewijs van beroepskwalificatie Recreatief medewerker (BK-0464-1)',
        extra: { beroepskwalificatie: inExtra, categorie: 'Bewijs', naam: 'Bewijs van beroepskwalificatie' },
      });
      expect(JSON.stringify(e), naam).not.toMatch(/api_url|onderwijs\.api/);
      const k = { ...geldigeKoppeling(), aantalOnderdelen: 1, onderdelen: [{ onderdeel: 504, groep: 'G-0393', status: 'opgehaald', opgehaald: NU, erkenningen: r.erkenningen }] };
      expect(valideerKoppelingBestand(k), naam).toEqual([]);
    }
  });

  it('negatief: bijkomende toelatingsvoorwaarden komen bewust niet in de koppeling (zoals omschrijving), wel in de veldinventaris', () => {
    // Vorm van ronde 6 (veldinventaris van onderdeel 5): een lijst van {omschrijving}. De tekst is verzonnen.
    const d = detail504();
    d.structuuronderdeel_details[0].bijkomende_toelatingsvoorwaarden = [{ omschrijving: '<p>Een gunstig advies van de klassenraad.</p>' }];
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.waarschuwingen).toEqual([]);
    expect(r.erkenningen[0].extra).toBeUndefined();
    expect(JSON.stringify(r.erkenningen)).not.toMatch(/toelating|klassenraad/);
    expect(r.velden).toContain('structuuronderdeel_details[].bijkomende_toelatingsvoorwaarden[].omschrijving');
  });

  it('positief: dezelfde BK twee keer met andere gegevens: de kleinste titel en de kleinste extra winnen, in elke volgorde, met een waarschuwing', () => {
    const a = { ...bkVerwijzing('BK-0390', 2, 'Onthaalmedewerker'), volledigheid: 'Gedeeltelijk' };
    const b = { ...bkVerwijzing('BK-0390', 2, 'Baliemedewerker'), volledigheid: 'Volledig' };
    const c = { beroepskwalificatie_nr: 'BK-0390', versie_nr_lang: 'BK-0390-2' }; // zonder titel en zonder extra: verliest nooit iets
    for (const lijst of [[a, b, c], [c, b, a], [b, c, a], [a, b], [b, a]]) {
      const d = detail504();
      d.structuuronderdeel_details[0].beroepskwalificaties = kopie(lijst);
      const r = normaliseerOnderdeelDetail(d, 504);
      expect(r.problemen).toEqual([]);
      // Titel en extra worden elk apart gekozen (de kleinste in tekenvolgorde), los van de volgorde in de API.
      expect(r.erkenningen[0].bks).toEqual([{ bk: 'BK-0390-2', titel: 'Baliemedewerker', extra: { volledigheid: 'Gedeeltelijk' } }]);
      expect(r.waarschuwingen.join(' ')).toMatch(/ADV-0842: BK-0390-2 staat er meer dan één keer, met andere gegevens/);
    }
  });

  it('positief: dezelfde BK twee keer met dezelfde gegevens telt één keer, zonder waarschuwing', () => {
    const d = detail504();
    d.structuuronderdeel_details[0].beroepskwalificaties.push(bkVerwijzing('BK-0390', 2, 'Onthaalmedewerker'));
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.waarschuwingen).toEqual([]);
    expect(r.erkenningen[0].bks.map((k) => k.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
  });

  it('positief: dezelfde studiebekrachtiging twee keer telt één keer, met een waarschuwing; een variant blijft apart', () => {
    const d = detail504();
    const sb = d.structuuronderdeel_details[0].studiebekrachtigingen;
    sb.push(kopie(sb[1]), { ...kopie(sb[1]), categorie: 'Ander' });
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    const lijst = r.erkenningen[0].bekrachtigingen;
    expect(lijst).toHaveLength(4);
    expect(lijst.filter((b) => b.naam === 'Bewijs van slagen voor de basisvorming Onthaal en recreatie').map((b) => b.extra?.categorie)).toEqual(['Ander', 'Bewijs']);
    expect(r.waarschuwingen.join(' ')).toMatch(/studiebekrachtiging "Bewijs van slagen.* staat er twee keer in/);
    // Zonder ontdubbeling zou de validator de koppeling weigeren (een dubbel element).
    const k = { ...geldigeKoppeling(), aantalOnderdelen: 1, onderdelen: [{ onderdeel: 504, groep: 'G-0393', status: 'opgehaald', opgehaald: NU, erkenningen: r.erkenningen }] };
    expect(valideerKoppelingBestand(k)).toEqual([]);
    k.onderdelen[0].erkenningen[0].bekrachtigingen.splice(1, 0, kopie(lijst[1]));
    expect(valideerKoppelingBestand(k).join(' ')).toMatch(/meer dan één keer/);
  });

  it('grens van MAX_EXTRA_VELD: gemeten in UTF-8-bytes van de JSON; precies 20000 blijft, 20001 valt weg; normalisatie en validator zijn het eens', () => {
    const e = 'é'; // é: 1 teken, 2 bytes
    const gevallen: [string, string, boolean][] = [
      ['precies 20000 bytes', 'x'.repeat(19_998), true],
      ['20001 bytes', 'x'.repeat(19_999), false],
      ['9999 tekens, 20000 bytes', e.repeat(9_999), true],
      ['10000 tekens, 20002 bytes', e.repeat(10_000), false],
    ];
    for (const [naam, waarde, blijft] of gevallen) {
      const d = detail504();
      d.structuuronderdeel_details[0].bijlage = waarde;
      const r = normaliseerOnderdeelDetail(d, 504);
      expect(r.problemen, naam).toEqual([]);
      expect(r.erkenningen[0].extra?.bijlage === waarde, naam).toBe(blijft);
      expect(r.waarschuwingen.some((w) => /"bijlage" weegt \d+ bytes/.test(w)), naam).toBe(!blijft);
      const k = geldigeKoppeling();
      k.onderdelen[2].erkenningen[0].extra = { bijlage: waarde };
      expect(valideerKoppelingBestand(k).some((f) => /"extra\.bijlage" weegt/.test(f)), naam).toBe(!blijft);
    }
  });

  it('negatief: een geërfd veld (prototype) telt niet: geen eigen nummer, geen geërfde status', () => {
    const onderdeel = Object.assign(Object.create({ structuuronderdeel_nummer: 504 }) as Rec, { structuuronderdeel_details: detail504().structuuronderdeel_details });
    expect(normaliseerOnderdeelDetail(onderdeel, 504).problemen.join(' ')).toMatch(/geen eigen nummer/);
    // Een status met alleen geërfde velden heeft geen eigen velden: ze is leeg, de erkenning krijgt geen status en geldt niet.
    const d = detail504();
    d.structuuronderdeel_details[0].status = Object.create({ code: 'ERKEND' });
    const r = normaliseerOnderdeelDetail(d, 504);
    expect(r.problemen).toEqual([]);
    expect(r.erkenningen[0].status).toBeUndefined();
    expect(geldtOp(r.erkenningen[0], '2026-10-10')).toBe(false);
  });
});

// ── normaliseerBkDetail ─────────────────────────────────────────────────────

describe('normaliseerBkDetail', () => {
  it('positief: BK-0390-2 in de vorm van ronde 7', () => {
    const r = normaliseerBkDetail(bk0390(), 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    expect(r.waarschuwingen).toEqual([]);
    expect(r.bk).toBe('BK-0390-2');
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect(inhoud).toMatchObject({ titel: 'Onthaalmedewerker', status: 'ERKEND', vks: 3, definitie: 'Het correct ontvangen en informeren van personen' });
    expect(inhoud.competenties.map((c) => [c.nr, c.id])).toEqual([[1, 'bkc0045062'], [2, 'bkc9000002'], [3, 'bkc9000003']]);
    expect(inhoud.competenties[0]).toEqual({
      id: 'bkc0045062',
      nr: 1,
      type: 'Vakspecifieke competentie',
      tekst: 'Werkt in teamverband',
      kennis: [{ type: 'Kennis', tekst: 'Kennis van de bedrijfscultuur, procedures en regels' }],
      vaardigheden: [
        { type: 'Cognitieve vaardigheden', tekst: 'Wisselt informatie uit met collega’s en eindverantwoordelijke' },
        { type: 'Motorische vaardigheden', tekst: 'Werkt ordelijk' },
      ],
      referenties: ['co 01993'],
    });
    const extra = inhoud.extra as Rec;
    expect(Object.keys(extra)).toEqual([...Object.keys(extra)].sort());
    for (const veld of ['autonomie', 'domeinen', 'handelingscontext', 'omgevingscontext', 'verantwoordelijkheid', 'synoniemen', 'erkenningsdatum']) expect(extra).toHaveProperty(veld);
    // Het label "erkend" is gelijk aan de code: het valt weg. Adressen en nieuwste_versie ook.
    for (const weg of ['status', 'statuscode', 'links', 'nieuwste_versie', 'competenties', 'versie_nr_lang', 'vks_niveau', 'titel']) expect(extra).not.toHaveProperty(weg);
    expect(r.velden).toContain('beroepskwalificatie.competenties[].kennis[].kennis_type');
  });

  it('positief: tolerante vormen (T1 vorm 2, lijst met één element, tekst of object)', () => {
    const raw = bk0390();
    const b = raw.beroepskwalificatie;
    delete b.versie_nr_lang;
    b.beroepskwalificatie_nr = 'BK-0390';
    delete b.statuscode;
    b.vks_niveau = '3';
    b.competenties = [
      { nr: '2', competentie_code: 'bkc9000002', competentie_type: { code: 'Vakspecifieke competentie' }, waarde: 'Communiceert', kennis: ['Kennis van talen'], vaardigheden: { vaardigheid_type: 'Sociale vaardigheden', waarde: 'Luistert' }, referenties: ['co 2', 'co 10', 'co 2'] },
      { nr: 1, competentie_code: 'bkc0045062', waarde: 'Werkt in teamverband' },
    ];
    const r = normaliseerBkDetail({ beroepskwalificatie: [b], totalItems: 1 }, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect(inhoud).toMatchObject({ status: 'erkend', vks: 3 });
    expect(inhoud.competenties).toEqual([
      { id: 'bkc0045062', nr: 1, tekst: 'Werkt in teamverband', kennis: [], vaardigheden: [] },
      { id: 'bkc9000002', nr: 2, type: 'Vakspecifieke competentie', tekst: 'Communiceert', kennis: [{ tekst: 'Kennis van talen' }], vaardigheden: [{ type: 'Sociale vaardigheden', tekst: 'Luistert' }], referenties: ['co 2', 'co 10'] },
    ]);
  });

  it('positief: zonder nr achteraan in de volgorde van de bron, met een waarschuwing; HTML blijft letterlijk met een waarschuwing', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.competenties = [
      competentie(undefined, 'bkc9000009', 'Zonder nummer B'),
      competentie(2, 'bkc9000002', 'Met nummer'),
      competentie(undefined, 'bkc9000001', 'Zonder nummer A'),
      competentie(1, 'bkc9000005', '<p>Werkt&nbsp;veilig</p>', { kennis: [{ kennis_type: 'Kennis', waarde: '<b>Kennis</b> van EHBO' }] }),
    ];
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect(inhoud.competenties.map((c) => c.id)).toEqual(['bkc9000005', 'bkc9000002', 'bkc9000009', 'bkc9000001']);
    expect(inhoud.competenties[0].tekst).toBe('<p>Werkt&nbsp;veilig</p>');
    const w = r.waarschuwingen.join('\n');
    expect(w).toMatch(/competentie 1: de competentie heeft geen nr/);
    expect(w).toMatch(/HTML in de tekst/);
    expect(w).toMatch(/HTML in kennis/);
  });

  it('positief: een competentiecode "__proto__" is een gewone sleutel; __proto__ in het object vervuilt niets', () => {
    const tekst = JSON.stringify(bk0390())
      .replace('"bkc9000003"', '"__proto__"')
      .replace('"titel":"Onthaalmedewerker"', '"titel":"Onthaalmedewerker","__proto__":{"vervuild":true}');
    const r = normaliseerBkDetail(JSON.parse(tekst), 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect(inhoud.competenties.map((c) => c.id)).toContain('__proto__');
    expect(Object.prototype.hasOwnProperty.call(inhoud.extra, '__proto__')).toBe(true);
    const codes = doelcodesVanBestand({ bk: 'BK-0390-2', competenties: inhoud.competenties });
    expect(codes.get('__proto__')).toBe('BK-0390-2.03');
    expect(({} as Rec).vervuild).toBeUndefined();
  });

  const NEGATIEF: [string, () => unknown, string, RegExp, boolean][] = [
    // [naam, antwoord, gevraagd, melding, bk bekend (onbruikbaar) of niet (P3)]
    ['geen object', () => null, 'BK-0390-2', /geen object "beroepskwalificatie"/, false],
    ['zonder beroepskwalificatie', () => ({ totalItems: 0 }), 'BK-0390-2', /geen object "beroepskwalificatie"/, false],
    ['een andere versie dan gevraagd', () => bk0390(), 'BK-0390-3', /gaat over BK-0390-2.*negeert/, false],
    ['een ongeldige gevraagde versie', () => bk0390(), 'BK-0390', /past niet op BK-0000-0/, false],
    ['een DBK als versie', () => ({ beroepskwalificatie: { versie_nr_lang: 'BK-0130-5-DBK-01', competenties: [] } }), 'BK-0130-5', /geen bruikbare versie/, false],
    ['de versie alleen in een ander veld', () => ({ beroepskwalificatie: { code: 'BK-0390-2', titel: 'x', competenties: [competentie(1, 'bkc1', 'x')] } }), 'BK-0390-2', /geen bruikbare versie/, false],
    ['een competentie zonder code (ontbrekende sleutel)', () => {
      const r = bk0390();
      delete r.beroepskwalificatie.competenties[0].competentie_code;
      return r;
    }, 'BK-0390-2', /geen geldige competentiecode/, true],
    ['een competentiecode met spaties', () => {
      const r = bk0390();
      r.beroepskwalificatie.competenties[0].competentie_code = 'bkc 1';
      return r;
    }, 'BK-0390-2', /geen geldige competentiecode/, true],
    ['een competentie zonder tekst', () => {
      const r = bk0390();
      r.beroepskwalificatie.competenties[1].waarde = '   ';
      return r;
    }, 'BK-0390-2', /geen tekst/, true],
    ['een dubbele competentiecode', () => {
      const r = bk0390();
      r.beroepskwalificatie.competenties[2].competentie_code = 'bkc0045062';
      return r;
    }, 'BK-0390-2', /bkc0045062.*meer dan één keer/, true],
    ['geen competenties', () => {
      const r = bk0390();
      r.beroepskwalificatie.competenties = [];
      return r;
    }, 'BK-0390-2', /geen competenties/, true],
    ['geen titel', () => {
      const r = bk0390();
      delete r.beroepskwalificatie.titel;
      return r;
    }, 'BK-0390-2', /geen titel/, true],
    ['kennis met een onleesbare tekst', () => {
      const r = bk0390();
      r.beroepskwalificatie.competenties[0].kennis = [{ kennis_type: 'Kennis', waarde: { html: '<p>x</p>' } }];
      return r;
    }, 'BK-0390-2', /kennis zonder leesbare tekst/, true],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, raw, gevraagd, fout, bkBekend) => {
    const r = normaliseerBkDetail(raw(), gevraagd);
    expect(r.problemen.join(' ')).toMatch(fout);
    expect(r.inhoud).toBeUndefined();
    expect(r.bk).toBe(bkBekend ? gevraagd : undefined);
  });

  it('negatief: een dubbel of ontbrekend nr is een waarschuwing; de doelcodes vallen terug op de plaats', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.competenties[0].nr = 1;
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    expect(r.waarschuwingen.join(' ')).toMatch(/het nr 1 staat er meer dan één keer/);
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect([...doelcodesVanBestand({ bk: 'BK-0390-2', competenties: inhoud.competenties }).values()]).toEqual(['BK-0390-2.01', 'BK-0390-2.02', 'BK-0390-2.03']);
  });

  it('negatief: een VKS-niveau buiten 1 tot 8 blijft in extra, met een waarschuwing', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.vks_niveau = 9;
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    expect(r.inhoud?.vks).toBeUndefined();
    expect(r.inhoud?.extra).toMatchObject({ vks_niveau: 9 });
    expect(r.waarschuwingen.join(' ')).toMatch(/VKS-niveau 9/);
  });

  it('negatief: lege kennis valt weg met een waarschuwing; referenties in een onbekende vorm blijven in extra', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.competenties[0].kennis.push({ kennis_type: 'Kennis', waarde: '' });
    raw.beroepskwalificatie.competenties[0].referenties = [{ referentie_nr: 'co 1', bron: 'ander' }];
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    const c = r.inhoud?.competenties.find((x) => x.id === 'bkc9000003');
    expect(c?.kennis).toHaveLength(1);
    expect(c?.referenties).toBeUndefined();
    expect(c?.extra).toEqual({ referenties: [{ bron: 'ander', referentie_nr: 'co 1' }] });
    expect(r.waarschuwingen.join(' ')).toMatch(/kennis zonder tekst valt weg/);
  });

  it('negatief: een te groot veld in extra valt weg (geen base64-blob in de repo)', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.document = { content: 'A'.repeat(67_000), filename: 'x.docx' };
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.inhoud?.extra).not.toHaveProperty('document');
    expect(r.waarschuwingen.join(' ')).toMatch(/"document" weegt/);
  });

  it('positief: de uitvoer hangt niet af van de volgorde van de competenties met nr of van de sleutels', () => {
    const a = normaliseerBkDetail(bk0390(), 'BK-0390-2');
    /** Keert de volgorde van de sleutels om (diep), maar niet die van lijsten: kennis houdt de volgorde van de bron (T6). */
    const sleutelsOm = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(sleutelsOm);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).reverse().map(([k, w]) => [k, sleutelsOm(w)]));
      return v;
    };
    const raw = sleutelsOm(bk0390()) as Rec;
    raw.beroepskwalificatie.competenties.reverse();
    const b = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(b.problemen).toEqual([]);
    expect(JSON.stringify(b.inhoud)).toBe(JSON.stringify(a.inhoud));
  });

  it('positief: referenties worden gesorteerd (cijfers als getallen) en ontdubbeld, ook als de bron ze anders ordent', () => {
    const raw = bk0390();
    raw.beroepskwalificatie.competenties[0].referenties = [{ referentie_nr: 'co 10' }, 'co 2', { referentie_nr: 'co 1' }, 'co 2'];
    const r = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(r.problemen).toEqual([]);
    const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
    expect(inhoud.competenties.find((c) => c.id === 'bkc9000003')?.referenties).toEqual(['co 1', 'co 2', 'co 10']);
    const bestand = { ...geldigBkBestand(), competenties: inhoud.competenties, aantal: inhoud.competenties.length };
    expect(valideerBkBestand(bestand, 'BK-0390-2')).toEqual([]);
  });

  it('negatief: een nr dat geen geheel getal groter dan 0 is ("0", 0, "-1", "1.5", 1.5, "een"), valt weg met een waarschuwing', () => {
    for (const nr of ['0', 0, '-1', '1.5', 1.5, 'een', '00']) {
      const raw = bk0390();
      raw.beroepskwalificatie.competenties[0].nr = nr;
      const r = normaliseerBkDetail(raw, 'BK-0390-2');
      expect(r.problemen, String(nr)).toEqual([]);
      const inhoud = r.inhoud as NonNullable<typeof r.inhoud>;
      const c = inhoud.competenties.find((x) => x.id === 'bkc9000003');
      expect(c?.nr, String(nr)).toBeUndefined();
      expect(r.waarschuwingen.join(' '), String(nr)).toMatch(/is geen geheel getal groter dan 0 en valt weg/);
      // Zonder nr achteraan, en de doelcodes vallen terug op de plaats.
      expect(inhoud.competenties.map((x) => x.id)).toEqual(['bkc0045062', 'bkc9000002', 'bkc9000003']);
      expect(doelcodesVanBestand({ bk: 'BK-0390-2', competenties: inhoud.competenties }).get('bkc9000003')).toBe('BK-0390-2.03');
    }
    // Een tekst met alleen cijfers is wel een nr ("007" → 7).
    const raw = bk0390();
    raw.beroepskwalificatie.competenties[0].nr = '007';
    expect(normaliseerBkDetail(raw, 'BK-0390-2').inhoud?.competenties.find((x) => x.id === 'bkc9000003')?.nr).toBe(7);
  });

  it('negatief: een geërfde titel of geërfde competenties (prototype) tellen niet', () => {
    const { titel, ...zonderTitel } = bk0390().beroepskwalificatie as Rec;
    const r = normaliseerBkDetail({ beroepskwalificatie: Object.assign(Object.create({ titel }) as Rec, zonderTitel) }, 'BK-0390-2');
    expect(r.bk).toBe('BK-0390-2');
    expect(r.inhoud).toBeUndefined();
    expect(r.problemen.join(' ')).toMatch(/geen titel/);
    const { competenties, ...zonderCompetenties } = bk0390().beroepskwalificatie as Rec;
    const s = normaliseerBkDetail({ beroepskwalificatie: Object.assign(Object.create({ competenties }) as Rec, zonderCompetenties) }, 'BK-0390-2');
    expect(s.problemen.join(' ')).toMatch(/geen competenties/);
    const geerfd = normaliseerBkDetail(Object.create({ beroepskwalificatie: bk0390().beroepskwalificatie }) as Rec, 'BK-0390-2');
    expect(geerfd.bk).toBeUndefined();
    expect(geerfd.problemen.join(' ')).toMatch(/geen object "beroepskwalificatie"/);
  });
});

// ── doelcodesVanBestand ─────────────────────────────────────────────────────

describe('doelcodesVanBestand', () => {
  const comp = (id: string, nr?: number) => ({ id, ...(nr === undefined ? {} : { nr }), tekst: 't', kennis: [], vaardigheden: [] });

  it('met nr: `${bk}.${nr}` met minstens twee cijfers', () => {
    const codes = doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [comp('a', 3), comp('b', 1), comp('c', 12), comp('d', 100)] });
    expect([...codes]).toEqual([['a', 'BK-0390-2.03'], ['b', 'BK-0390-2.01'], ['c', 'BK-0390-2.12'], ['d', 'BK-0390-2.100']]);
  });

  it('terugval op de plaats: één competentie zonder nr, een dubbel nr, of nr 0', () => {
    const verwacht = ['BK-0390-2.01', 'BK-0390-2.02', 'BK-0390-2.03'];
    expect([...doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [comp('a', 5), comp('b'), comp('c', 7)] }).values()]).toEqual(verwacht);
    expect([...doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [comp('a', 5), comp('b', 5), comp('c', 7)] }).values()]).toEqual(verwacht);
    expect([...doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [comp('a', 0), comp('b', 1), comp('c', 2)] }).values()]).toEqual(verwacht);
  });

  it('uniek, hoogstens 60 tekens, met het voorvoegsel van de eigen versie, en normalizeGoalCode verandert niets', () => {
    for (const lijst of [[comp('a', 1), comp('b', 2)], [comp('a'), comp('b')], [comp('a', Number.MAX_SAFE_INTEGER), comp('b', 1)]]) {
      const codes = [...doelcodesVanBestand({ bk: 'BK-123456-1234', competenties: lijst }).values()];
      expect(new Set(codes).size).toBe(codes.length);
      for (const c of codes) {
        expect(c.length).toBeLessThanOrEqual(60);
        expect(c.startsWith('BK-123456-1234.')).toBe(true);
        expect(normalizeGoalCode(c)).toBe(c);
        expect(c).not.toContain('a');
      }
    }
  });

  it('een ongeldige versie geeft niets; een ongeldig id telt mee voor de plaats; een dubbel id houdt zijn eerste code', () => {
    expect(doelcodesVanBestand({ bk: 'BK-0390', competenties: [comp('a', 1)] }).size).toBe(0);
    expect(doelcodesVanBestand(null as unknown as BkBestand).size).toBe(0);
    const codes = doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [comp('x y'), comp('b'), comp('b'), comp('c')] as BkBestand['competenties'] });
    expect([...codes]).toEqual([['b', 'BK-0390-2.02'], ['c', 'BK-0390-2.04']]);
  });
});

// ── geldtOp en erkenningenOp ────────────────────────────────────────────────

describe('geldtOp en erkenningenOp', () => {
  const e = (status: unknown, begindatum?: string, einddatum?: string, adv = 'ADV-0001'): Erkenning =>
    ({ adv, status, ...(begindatum ? { begindatum } : {}), ...(einddatum ? { einddatum } : {}), bks: [], bekrachtigingen: [] }) as Erkenning;

  it('de drie statussen van de matrix: alleen ERKEND geldt', () => {
    expect(geldtOp(e('ERKEND', '2023-09-01'), '2026-10-10')).toBe(true);
    expect(geldtOp(e('GEANNULEERD', '2023-09-01'), '2026-10-10')).toBe(false);
    expect(geldtOp(e('NIET_ERKEND', '2023-09-01'), '2026-10-10')).toBe(false);
  });

  it('status als tekst of {code}, een lijst met één element, hoofdletterongevoelig', () => {
    for (const s of ['erkend', ' Erkend ', { code: 'ERKEND', omschrijving: 'Erkend' }, [{ code: 'ERKEND' }], ['ERKEND']]) expect(geldtOp(e(s, '2023-09-01'), '2026-10-10')).toBe(true);
    for (const s of [undefined, '', 'ERKEND_LATER', { omschrijving: 'Niet erkend' }, ['ERKEND', 'GEANNULEERD'], 1]) expect(geldtOp(e(s, '2023-09-01'), '2026-10-10')).toBe(false);
  });

  it('grenzen van de datums: begin en einde op vandaag gelden; leeg geldt; onleesbaar niet', () => {
    expect(geldtOp(e('ERKEND', '2026-10-10'), '2026-10-10')).toBe(true);
    expect(geldtOp(e('ERKEND', '2026-10-11'), '2026-10-10')).toBe(false);
    expect(geldtOp(e('ERKEND', '2020-09-01', '2026-10-10'), '2026-10-10')).toBe(true);
    expect(geldtOp(e('ERKEND', '2020-09-01', '2026-10-09'), '2026-10-10')).toBe(false);
    expect(geldtOp(e('ERKEND'), '2026-10-10')).toBe(true);
    expect(geldtOp(e('ERKEND', '2020-02-30'), '2026-10-10')).toBe(false);
    expect(geldtOp(e('ERKEND', '2020-09-01', 'morgen'), '2026-10-10')).toBe(false);
    expect(geldtOp(e('ERKEND', '2020-09-01'), '10/10/2026')).toBe(false);
    expect(geldtOp(null as unknown as Erkenning, '2026-10-10')).toBe(false);
  });

  it('een ongeldige vandaag faalt dicht, ook bij een erkenning zonder datums (dan is die controle de enige bewaking)', () => {
    const ongeldig: unknown[] = ['morgen', '', ' ', '2026-10-10T00:00:00Z', '2026-13-40', '2026-02-29', '2026-10-1', ' 2026-10-10', '10/10/2026', undefined, null, 20261010];
    for (const vandaag of ongeldig) {
      expect(geldtOp(e('ERKEND'), vandaag as string), String(vandaag)).toBe(false);
      expect(geldtOp(e('ERKEND', '2020-09-01', '2030-08-31'), vandaag as string), String(vandaag)).toBe(false);
    }
    // Met een geldige vandaag gelden dezelfde erkenningen wel: het is de datum die faalt, niet de erkenning.
    expect(geldtOp(e('ERKEND'), '2026-10-10')).toBe(true);
    expect(geldtOp(e('ERKEND', '2020-09-01', '2030-08-31'), '2028-02-29')).toBe(true);
  });

  it('erkenningenOp met een ongeldige vandaag geeft niets, ook geen toekomst', () => {
    const lijst = [e('ERKEND', undefined, undefined, 'ADV-0001'), e('ERKEND', '2027-09-01', undefined, 'ADV-0002')];
    for (const vandaag of ['', '2026-13-40', '2026-02-29', 'morgen', '2026-10-10T00:00:00Z', '0000-00-00']) {
      expect(erkenningenOp(lijst, vandaag), vandaag).toEqual({ nu: [], toekomst: [] });
    }
    expect(erkenningenOp(lijst, '2026-10-10')).toEqual({ nu: [lijst[0]], toekomst: [lijst[1]] });
  });

  it('een geërfde status (prototype) telt niet', () => {
    expect(geldtOp({ status: Object.create({ code: 'ERKEND' }) as unknown as string }, '2026-10-10')).toBe(false);
  });

  it('overlap: twee erkenningen die een schooljaar overlappen, gelden allebei (onderdeel 1)', () => {
    const lijst = normaliseerOnderdeelDetail(detail1(), 1).erkenningen;
    expect(erkenningenOp(lijst, '2024-01-15').nu.map((x) => x.adv)).toEqual(['ADV-1193', 'ADV-1608']);
    expect(erkenningenOp(lijst, '2026-10-10').nu.map((x) => x.adv)).toEqual(['ADV-1608']);
    expect(erkenningenOp(lijst, '2020-01-01').nu.map((x) => x.adv)).toEqual(['ADV-1193']);
    expect(erkenningenOp(lijst, '2020-01-01').toekomst.map((x) => x.adv)).toEqual(['ADV-1608']);
  });

  it('toekomst: alleen erkende die later beginnen; geannuleerd, afgelopen of omgekeerde datums niet', () => {
    const lijst = [
      e('ERKEND', '2017-09-01', '2024-08-31', 'ADV-0001'),
      e('ERKEND', '2023-09-01', undefined, 'ADV-0002'),
      e('ERKEND', '2027-09-01', undefined, 'ADV-0003'),
      e('GEANNULEERD', '2027-09-01', undefined, 'ADV-0004'),
      e('NIET_ERKEND', '2025-09-01', '2025-07-14', 'ADV-0005'),
      e('ERKEND', '2027-09-01', '2027-08-31', 'ADV-0006'),
      e(undefined, '2027-09-01', undefined, 'ADV-0007'),
      e('ERKEND', undefined, undefined, 'ADV-0008'),
    ];
    const r = erkenningenOp(lijst, '2026-10-10');
    expect(r.nu.map((x) => x.adv)).toEqual(['ADV-0002', 'ADV-0008']);
    expect(r.toekomst.map((x) => x.adv)).toEqual(['ADV-0003']);
    expect(erkenningenOp(lijst, 'ongeldig')).toEqual({ nu: [], toekomst: [] });
    expect(erkenningenOp(null as unknown as Erkenning[], '2026-10-10')).toEqual({ nu: [], toekomst: [] });
  });
});

// ── Kleine hulpfuncties ─────────────────────────────────────────────────────

describe('bevatHtml en veldenVan', () => {
  it('herkent tags en entiteiten, maar geen gewone tekst', () => {
    for (const t of ['<p>x</p>', 'a<br/>b', 'Werkt&nbsp;veilig', '&#233;t&eacute;', '<b class="x">y</b>']) expect(bevatHtml(t)).toBe(true);
    for (const t of ['a < b en c > d', 'R&D', 'Werkt in teamverband', '3 < 4', 'x &y']) expect(bevatHtml(t)).toBe(false);
  });

  it('geeft de gesorteerde paden van een antwoord', () => {
    expect(veldenVan({ b: [{ c: 1 }], a: { d: null } })).toEqual(['a', 'a.d', 'b', 'b[].c']);
    expect(veldenVan(null)).toEqual([]);
  });
});

// ── Diep geneste invoer ─────────────────────────────────────────────────────

describe('diep geneste invoer (JSON.parse maakt er ook 100.000 niveaus van)', () => {
  /** n lijsten in elkaar rond `blad`, zonder recursie gebouwd. */
  const diep = (n: number, blad: unknown = 'x'): unknown => {
    let v = blad;
    for (let i = 0; i < n; i++) v = [v];
    return v;
  };
  /** n objecten {a: …} in elkaar. */
  const diepObject = (n: number): unknown => {
    let v: unknown = 'x';
    for (let i = 0; i < n; i++) v = { a: v };
    return v;
  };
  const DIEPTES = [65, 5_000, 100_000];
  const VORMEN: [string, (n: number) => unknown][] = [['lijsten', diep], ['objecten', diepObject]];

  /** Elk geval: een plaats in het detail van een onderdeel, en of het een probleem (true) of alleen een waarschuwing (false) moet geven. */
  const ONDERDEEL: [string, (d: Rec, v: unknown) => void, boolean][] = [
    ['als erkenningen', (d, v) => (d.structuuronderdeel_details = v), true],
    ['in de lijst van beroepskwalificaties (P4)', (d, v) => d.structuuronderdeel_details[0].beroepskwalificaties.push(v), true],
    ['als status', (d, v) => (d.structuuronderdeel_details[0].status = v), true],
    ['als studiebekrachtiging (vorm onbekend)', (d, v) => d.structuuronderdeel_details[0].studiebekrachtigingen.push(v), false],
    ['als BK van een studiebekrachtiging (vorm onbekend)', (d, v) => (d.structuuronderdeel_details[0].studiebekrachtigingen[2].beroepskwalificatie = v), false],
    ['als veld in extra (valt weg)', (d, v) => (d.structuuronderdeel_details[0].bijlage = v), false],
  ];
  it.each(ONDERDEEL)('normaliseerOnderdeelDetail gooit nooit: %s', (_naam, zet, probleem) => {
    for (const n of DIEPTES) {
      for (const [vorm, maak] of VORMEN) {
        const d = detail504();
        zet(d, maak(n));
        let r: ReturnType<typeof normaliseerOnderdeelDetail> | undefined;
        expect(() => (r = normaliseerOnderdeelDetail(d, 504)), `${vorm} ${n}`).not.toThrow();
        const uit = r as NonNullable<typeof r>;
        if (probleem) {
          expect(uit.problemen.length, `${vorm} ${n}`).toBeGreaterThan(0);
        } else {
          expect(uit.problemen, `${vorm} ${n}`).toEqual([]);
          expect(uit.waarschuwingen.length, `${vorm} ${n}`).toBeGreaterThan(0);
          expect(uit.erkenningen[0].bks.map((k) => k.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
        }
        for (const m of [...uit.problemen, ...uit.waarschuwingen]) expect(m.length).toBeLessThan(400);
      }
    }
  });

  const BK: [string, (b: Rec, v: unknown) => void, 'probleem' | 'waarschuwing' | 'een van beide'][] = [
    ['als competenties', (b, v) => (b.competenties = v), 'probleem'],
    ['als titel', (b, v) => (b.titel = v), 'probleem'],
    ['als kennis van een competentie', (b, v) => (b.competenties[0].kennis = v), 'een van beide'],
    ['als veld in extra (valt weg)', (b, v) => (b.domeinen = v), 'waarschuwing'],
    ['als veld in extra van een competentie (valt weg)', (b, v) => (b.competenties[0].bijlage = v), 'waarschuwing'],
  ];
  it.each(BK)('normaliseerBkDetail gooit nooit: %s', (_naam, zet, verwacht) => {
    for (const n of DIEPTES) {
      for (const [vorm, maak] of VORMEN) {
        const raw = bk0390();
        zet(raw.beroepskwalificatie, maak(n));
        let r: ReturnType<typeof normaliseerBkDetail> | undefined;
        expect(() => (r = normaliseerBkDetail(raw, 'BK-0390-2')), `${vorm} ${n}`).not.toThrow();
        const uit = r as NonNullable<typeof r>;
        expect(uit.bk).toBe('BK-0390-2');
        if (verwacht === 'probleem') expect(uit.inhoud, `${vorm} ${n}`).toBeUndefined();
        if (verwacht === 'waarschuwing') {
          expect(uit.problemen, `${vorm} ${n}`).toEqual([]);
          expect(uit.waarschuwingen.join(' '), `${vorm} ${n}`).toMatch(/te diep genest en valt weg/);
        }
        expect(uit.problemen.length + uit.waarschuwingen.length, `${vorm} ${n}`).toBeGreaterThan(0);
      }
    }
  });

  it('de andere functies gooien nooit', () => {
    for (const n of DIEPTES) {
      for (const [, maak] of VORMEN) {
        const v = maak(n);
        expect(normaliseerBkLijstItem(v).problemen.length).toBeGreaterThan(0);
        expect(normaliseerBkLijstItem({ beroepskwalificatie_nr: 'BK-0002', laatst_erkende_versie: v }).laatstErkend).toBeUndefined();
        expect('fout' in lijstVanBkPagina(v)).toBe(true);
        expect(bkVersieVan(v)).toBeUndefined();
        expect(geldtOp({ status: v as string }, '2026-10-10')).toBe(false);
        expect(doelcodesVanBestand({ bk: 'BK-0390-2', competenties: [v] as BkBestand['competenties'] }).size).toBe(0);
        expect(veldenVan(v).length).toBeLessThanOrEqual(500);
        expect(normaliseerOnderdeelDetail(v, 504).problemen.length).toBeGreaterThan(0);
        expect(normaliseerBkDetail(v, 'BK-0390-2').problemen.length).toBeGreaterThan(0);
      }
    }
  });

  it('de validators gooien nooit, ook niet bij twee gelijke studiebekrachtigingen met een diepe extra (vergelijkBekrachtiging)', () => {
    for (const n of DIEPTES) {
      const k = geldigeKoppeling();
      k.onderdelen[2].erkenningen[0].bekrachtigingen = [{ naam: 'A', extra: { x: diep(n) } }, { naam: 'A', extra: { x: diep(n) } }];
      k.onderdelen[0].erkenningen[0].extra = { y: diepObject(n) };
      let fouten: string[] = [];
      expect(() => (fouten = valideerKoppelingBestand(k))).not.toThrow();
      expect(fouten.join(' ')).toMatch(/"extra\.x" is te diep genest/);
      expect(fouten.join(' ')).toMatch(/"extra\.y" is te diep genest/);
      const b = geldigBkBestand();
      b.extra.domeinen = diep(n);
      b.competenties[0].extra = { z: diepObject(n) };
      expect(() => valideerBkBestand(b)).not.toThrow();
      expect(valideerBkBestand(b).join(' ')).toMatch(/te diep genest/);
      const i = geldigeIndex();
      i.bks.push(diep(n));
      i.bks[0].titel = diepObject(n);
      expect(() => valideerBkIndex(i)).not.toThrow();
      expect(valideerBkIndex(i).length).toBeGreaterThan(0);
    }
  });

  it('normalisatie en validator hebben dezelfde dieptegrens voor een veld in extra: 64 niveaus blijft, 65 valt weg', () => {
    for (const [n, blijft] of [[63, true], [64, true], [65, false]] as const) {
      const d = detail504();
      d.structuuronderdeel_details[0].diep = diep(n);
      const r = normaliseerOnderdeelDetail(d, 504);
      expect(r.problemen, String(n)).toEqual([]);
      expect(r.erkenningen[0].extra?.diep !== undefined, String(n)).toBe(blijft);
      expect(r.waarschuwingen.some((w) => /"diep" is te diep genest/.test(w)), String(n)).toBe(!blijft);
      // Wat de normalisatie bewaart, keurt de validator goed; één niveau dieper weigert hij.
      const k = { ...geldigeKoppeling(), aantalOnderdelen: 1, onderdelen: [{ onderdeel: 504, groep: 'G-0393', status: 'opgehaald', opgehaald: NU, erkenningen: r.erkenningen }] };
      expect(valideerKoppelingBestand(k), String(n)).toEqual([]);
      const kapot = geldigeKoppeling();
      kapot.onderdelen[2].erkenningen[0].extra = { diep: diep(n) };
      expect(valideerKoppelingBestand(kapot).some((f) => /"extra\.diep" is te diep genest/.test(f)), String(n)).toBe(!blijft);
    }
  });

  it('vangnet: een onverwachte fout bij het lezen wordt een probleem, zonder erkenningen of inhoud', () => {
    const kapot = new Proxy({}, {
      ownKeys() {
        throw new Error('kapot');
      },
    });
    const o = normaliseerOnderdeelDetail({ structuuronderdeel_nummer: 504, structuuronderdeel_details: [kapot] }, 504);
    expect(o.problemen).toEqual(['Onderdeel 504: het antwoord is niet te lezen (Error).']);
    expect(o.erkenningen).toEqual([]);
    // Na de controle van de versie: de versie is onbruikbaar (bk zonder inhoud). veldenVan kijkt naar de eerste 50 elementen.
    const raw = bk0390();
    raw.beroepskwalificatie.competenties = [...Array.from({ length: 50 }, (_, i) => competentie(i + 1, `bkc${9100000 + i}`, `Competentie ${i + 1}`)), kapot];
    const b = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(b.bk).toBe('BK-0390-2');
    expect(b.inhoud).toBeUndefined();
    expect(b.problemen).toEqual(['BK-0390-2: het antwoord is niet te lezen (Error).']);
    // Ervoor: geen bk (het detail negeert de vraag, P3).
    const c = normaliseerBkDetail({ beroepskwalificatie: kapot }, 'BK-0390-2');
    expect(c.bk).toBeUndefined();
    expect(c.problemen.join(' ')).toMatch(/niet te lezen \(Error\)/);
  });
});

// ── Volgorde van de API en gelijkZonderVolgorde ─────────────────────────────

describe('volgorde van de API (T6) en gelijkZonderVolgorde', () => {
  /** Een vaste pseudo-willekeurige reeks (mulberry32): de test doet elke keer hetzelfde. */
  const reeks = (zaad: number) => (): number => {
    zaad = (zaad + 0x6d2b79f5) | 0;
    let t = Math.imul(zaad ^ (zaad >>> 15), 1 | zaad);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Schudt diep: de volgorde van elke lijst en van de sleutels van elk object. */
  const schud = (v: unknown, r: () => number): unknown => {
    const meng = <T>(a: T[]): T[] => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    if (Array.isArray(v)) return meng(v.map((x) => schud(x, r)));
    if (v && typeof v === 'object') return Object.fromEntries(meng(Object.keys(v)).map((k) => [k, schud((v as Rec)[k], r)]));
    return v;
  };
  /** Zonder de velden die bewust in de volgorde van de bron blijven. */
  const zonder = (v: unknown, weg: readonly string[]): string => JSON.stringify(v, (k, w: unknown) => (weg.includes(k) ? undefined : w));

  /** BK-0390-2 met meer elementen in de lijsten van extra (verzonnen testdata in de vorm van ronde 7). */
  function bk0390Rijk(): Rec {
    const raw = bk0390();
    const b = raw.beroepskwalificatie;
    b.domeinen.push({ domein: 'Recreatie', pad: ['Toerisme', 'Vrije tijd', 'Recreatie'], pad_tekst: 'Toerisme > Vrije tijd > Recreatie' });
    b.synoniemen.push({ waarde: 'Receptionist' }, { waarde: 'Onthaalbediende' });
    b.autonomie.push({ autonomie_type: 'Is gebonden aan', waarde: 'de richtlijnen van de organisatie' });
    b.competenties[0].kennis.push({ kennis_type: 'Kennis', waarde: 'Kennis van talen' }, { kennis_type: 'Basiskennis', waarde: 'Basiskennis van EHBO' });
    return raw;
  }

  it('onderdeel: alleen lijsten in extra hangen af van de volgorde in de API, en gelijkZonderVolgorde ziet ze als gelijk', () => {
    const d = detail504();
    d.structuuronderdeel_details[0].historiek = [{ jaar: 2019, soort: 'aanpassing' }, { jaar: 2023, soort: 'erkenning' }];
    d.structuuronderdeel_details.push(detail1().structuuronderdeel_details[0]);
    const a = normaliseerOnderdeelDetail(d, 504);
    expect(a.problemen).toEqual([]);
    let lijstVerschilde = false;
    const r = reeks(504);
    for (let i = 0; i < 200; i++) {
      const b = normaliseerOnderdeelDetail(schud(d, r), 504);
      expect(b.problemen).toEqual([]);
      expect(zonder(b.erkenningen, ['extra'])).toBe(zonder(a.erkenningen, ['extra']));
      expect(gelijkZonderVolgorde(b.erkenningen, a.erkenningen)).toBe(true);
      if (JSON.stringify(b.erkenningen) !== JSON.stringify(a.erkenningen)) lijstVerschilde = true;
    }
    // De claim is dus niet "de uitvoer hangt nooit af van de volgorde": lijsten in extra volgen de bron.
    expect(lijstVerschilde).toBe(true);
  });

  it('BK-versie: kennis, vaardigheden, competenties zonder nr en lijsten in extra volgen de bron; de rest niet; gelijkZonderVolgorde ziet ze als gelijk', () => {
    const raw = bk0390Rijk();
    raw.beroepskwalificatie.competenties.push(competentie(undefined, 'bkc9000008', 'Zonder nummer A'), competentie(undefined, 'bkc9000009', 'Zonder nummer B'));
    const a = normaliseerBkDetail(raw, 'BK-0390-2');
    expect(a.problemen).toEqual([]);
    const geordend = (inhoud: unknown) => {
      const x = JSON.parse(JSON.stringify(inhoud)) as Rec;
      x.competenties = (x.competenties as Rec[]).filter((c) => c.nr !== undefined);
      return zonder(x, ['extra', 'kennis', 'vaardigheden']);
    };
    const r = reeks(390);
    let verschilde = false;
    for (let i = 0; i < 200; i++) {
      const b = normaliseerBkDetail(schud(raw, r), 'BK-0390-2');
      expect(b.problemen).toEqual([]);
      expect(geordend(b.inhoud)).toBe(geordend(a.inhoud));
      expect(gelijkZonderVolgorde(b.inhoud, a.inhoud)).toBe(true);
      if (JSON.stringify(b.inhoud) !== JSON.stringify(a.inhoud)) verschilde = true;
    }
    expect(verschilde).toBe(true);
  });

  it('gelijkZonderVolgorde ziet elke echte verandering', () => {
    const a = normaliseerBkDetail(bk0390Rijk(), 'BK-0390-2').inhoud as Rec;
    expect(gelijkZonderVolgorde(a, kopie(a))).toBe(true);
    const VERANDERINGEN: [string, (x: Rec) => void][] = [
      ['een andere tekst in kennis', (x) => (x.competenties[0].kennis[0].tekst += '.')],
      ['een kennis minder', (x) => x.competenties[0].kennis.pop()],
      ['een element minder in een lijst van extra', (x) => x.extra.synoniemen.pop()],
      ['een ander pad in domeinen', (x) => (x.extra.domeinen[0].pad = ['Toerisme'])],
      ['een sleutel hernoemd', (x) => ((x.extra.synoniemen2 = x.extra.synoniemen), delete x.extra.synoniemen)],
      ['een nr veranderd', (x) => (x.competenties[0].nr = 9)],
      ['een veld erbij', (x) => (x.definitie = 'Iets anders')],
      ['een getal als tekst', (x) => (x.vks = '3')],
      ['een competentie minder', (x) => x.competenties.pop()],
    ];
    for (const [naam, verander] of VERANDERINGEN) {
      const b = kopie(a);
      verander(b);
      expect(gelijkZonderVolgorde(a, b), naam).toBe(false);
    }
  });

  it('gelijkZonderVolgorde: herhaling telt, soorten tellen, undefined telt niet, en te diep is "veranderd"', () => {
    expect(gelijkZonderVolgorde(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(false);
    expect(gelijkZonderVolgorde(['a', 'b', 'a'], ['a', 'a', 'b'])).toBe(true);
    expect(gelijkZonderVolgorde([1, '1'], ['1', 1])).toBe(true);
    expect(gelijkZonderVolgorde([1], ['1'])).toBe(false);
    expect(gelijkZonderVolgorde([[1, 2], [3]], [[3], [2, 1]])).toBe(true);
    // De prijs: een geordend pad in een andere volgorde telt als gelijk (extra staat in fase 3 niet op het scherm).
    expect(gelijkZonderVolgorde({ pad: ['Toerisme', 'Recreatie'] }, { pad: ['Recreatie', 'Toerisme'] })).toBe(true);
    expect(gelijkZonderVolgorde({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(gelijkZonderVolgorde({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(gelijkZonderVolgorde('x', 'x')).toBe(true);
    expect(gelijkZonderVolgorde(null, undefined)).toBe(true);
    const diep = (n: number): unknown => {
      let v: unknown = 'x';
      for (let i = 0; i < n; i++) v = [v];
      return v;
    };
    expect(gelijkZonderVolgorde(diep(100), diep(100))).toBe(true);
    expect(gelijkZonderVolgorde(diep(100_000), diep(100_000))).toBe(false);
  });
});

// ── valideerKoppelingBestand ────────────────────────────────────────────────

describe('valideerKoppelingBestand', () => {
  const POSITIEF: [string, () => Rec][] = [
    ['de koppeling uit de normalisatie (504, 1, nog niet opgehaald, niet gevonden)', geldigeKoppeling],
    ['een erkenning zonder lijst en een lege lijst', () => {
      const k = geldigeKoppeling();
      k.onderdelen[2].erkenningen[0].bks = [];
      k.onderdelen[2].erkenningen[0].geenLijst = true;
      k.onderdelen[0].erkenningen[0].bks = [];
      k.onderdelen[0].erkenningen[0].bekrachtigingen = [];
      return k;
    }],
    ['een niet gevonden onderdeel met zijn laatst bekende erkenningen', () => {
      const k = geldigeKoppeling();
      k.onderdelen[2] = { ...k.onderdelen[2], status: 'niet-gevonden', nietMeerInBron: '2026-11-03' };
      return k;
    }],
    ['een opgehaald onderdeel zonder erkenningen', () => {
      const k = geldigeKoppeling();
      k.onderdelen[1] = { onderdeel: 2, groep: 'G-0002', status: 'opgehaald', opgehaald: NU, erkenningen: [] };
      return k;
    }],
    ['een eigen veld __proto__ in extra', () => {
      const k = geldigeKoppeling();
      k.onderdelen[2].erkenningen[0].extra = metProto('{"__proto__": {"x": 1}}');
      return k;
    }],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, bestand) => {
    expect(valideerKoppelingBestand(bestand())).toEqual([]);
  });

  const NEGATIEF: [string, (k: Rec) => void, RegExp][] = [
    ['een ander soort bestand', (k) => (k.kind = 'beroepskwalificaties-index'), /"kind" moet "richtingkwalificaties"/],
    ['een adres van een testserver in de kop', (k) => (k.api = 'http://127.0.0.1:4000/structuuronderdeel/'), /"api" moet met https:\/\/onderwijs\.api\.vlaanderen\.be\//],
    ['een fout aantal onderdelen', (k) => (k.aantalOnderdelen = 3), /Kop zegt 3 onderdelen/],
    ['onderdelen in de verkeerde volgorde', (k) => k.onderdelen.reverse(), /verkeerde volgorde/],
    ['een ongeldige status', (k) => (k.onderdelen[1].status = 'weg'), /de status "weg"/],
    ['opgehaald zonder erkenningen', (k) => delete k.onderdelen[0].erkenningen, /"erkenningen" ontbreekt/],
    ['een BK zonder versie', (k) => (k.onderdelen[2].erkenningen[0].bks[0].bk = 'BK-0390'), /"BK-0390" past niet op BK-0000-0/],
    ['een DBK als BK', (k) => (k.onderdelen[2].erkenningen[0].bks[0].bk = 'BK-0130-5-DBK-01'), /past niet op BK-0000-0/],
    ['BK\'s in de verkeerde volgorde', (k) => k.onderdelen[2].erkenningen[0].bks.reverse(), /verkeerde volgorde/],
    ['een ontbrekende lijst bks', (k) => delete k.onderdelen[2].erkenningen[0].bks, /"bks" ontbreekt/],
    ['geenLijst met beroepskwalificaties', (k) => (k.onderdelen[2].erkenningen[0].geenLijst = true), /"geenLijst" en toch/],
    ['api_url diep in extra', (k) => (k.onderdelen[2].erkenningen[0].bks[0].extra = { bron: { api_url: 'https://x' } }), /bevat "api_url"/],
    ['curriculumdossier in extra', (k) => (k.onderdelen[2].erkenningen[0].extra = { curriculumdossier: 'x' }), /bevat "curriculumdossier"/],
    ['een extra-veld van 30 kB', (k) => (k.onderdelen[2].erkenningen[0].extra = { blob: 'x'.repeat(30_000) }), /weegt 30002 bytes/],
    ['een ongeldige datum', (k) => (k.onderdelen[0].erkenningen[0].einddatum = '2024-02-30'), /"einddatum" is geen geldige datum/],
    ['een ongeldig ADV-nummer', (k) => (k.onderdelen[2].erkenningen[0].adv = 'ADV 0842'), /past niet op ADV-0000/],
    ['een studiebekrachtiging zonder naam', (k) => (k.onderdelen[2].erkenningen[0].bekrachtigingen[0].naam = ' '), /de naam ontbreekt/],
    ['nietMeerInBron bij een opgehaald onderdeel', (k) => (k.onderdelen[0].nietMeerInBron = '2026-10-10'), /hoort niet bij een opgehaald onderdeel/],
    ['een onbekend veld', (k) => (k.onderdelen[0].bron = 'x'), /onbekende velden "bron"/],
    ['studiebekrachtigingen in de verkeerde volgorde', (k) => k.onderdelen[2].erkenningen[0].bekrachtigingen.reverse(), /verkeerde volgorde/],
    ['een niet gevonden onderdeel zonder datum', (k) => delete k.onderdelen[3].nietMeerInBron, /"nietMeerInBron" ontbreekt/],
    ['een ongeldige groep', (k) => (k.onderdelen[0].groep = 'G-1'), /de groep "G-1"/],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, breek, fout) => {
    const k = geldigeKoppeling();
    breek(k);
    expect(valideerKoppelingBestand(k).join('\n')).toMatch(fout);
  });

  it('positief: na een samenvoeging sorteert het script opnieuw met de geëxporteerde volgorde (T2)', () => {
    const k = geldigeKoppeling();
    const erkenningen = k.onderdelen[0].erkenningen as Erkenning[];
    delete erkenningen[1].begindatum; // ADV-1608 zonder datum: die komt eerst
    expect(valideerKoppelingBestand(k).join(' ')).toMatch(/verkeerde volgorde/);
    erkenningen.sort(vergelijkErkenning);
    expect(erkenningen.map((e) => e.adv)).toEqual(['ADV-1608', 'ADV-1193']);
    const b = k.onderdelen[2].erkenningen[0].bekrachtigingen as Erkenning['bekrachtigingen'];
    b.reverse();
    b.sort(vergelijkBekrachtiging);
    expect(valideerKoppelingBestand(k)).toEqual([]);
  });

  it('negatief: gooit nooit, ook niet op rare invoer', () => {
    for (const raar of [null, 'x', [], 42, { onderdelen: 'x' }, { onderdelen: [null, 1, { erkenningen: [null, { adv: 3, begindatum: 5, bks: [null, 1], bekrachtigingen: [{ naam: 'a', bk: 1, dbk: {} }, null] }] }] }]) {
      expect(() => valideerKoppelingBestand(raar)).not.toThrow();
      expect(valideerKoppelingBestand(raar).length).toBeGreaterThan(0);
    }
    const k = geldigeKoppeling();
    k.onderdelen[2].erkenningen[0].bekrachtigingen[1].dbk = 7;
    k.onderdelen[2].erkenningen.push({ adv: 'ADV-0001', begindatum: 20230901, bks: [], bekrachtigingen: [] });
    expect(() => valideerKoppelingBestand(k)).not.toThrow();
  });
});

// ── valideerBkIndex ─────────────────────────────────────────────────────────

describe('valideerBkIndex', () => {
  const POSITIEF: [string, () => Rec][] = [
    ['een index met elke soort regel', geldigeIndex],
    ['zonder lijstTotaal (de lijst werd nooit opgehaald)', () => {
      const i = geldigeIndex();
      delete i.lijstTotaal;
      return i;
    }],
    ['een lege index', () => ({ ...geldigeIndex(), bks: [] })],
    ['nummer met zes cijfers en een versie met vier', () => ({ ...geldigeIndex(), bks: [{ bk: 'BK-123456-1234', nummer: 'BK-123456', versie: 1234, opgehaald: NU, nietGevonden: true }] })],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, index) => {
    expect(valideerBkIndex(index())).toEqual([]);
  });

  const NEGATIEF: [string, (i: Rec) => void, RegExp][] = [
    ['een ander soort bestand', (i) => (i.kind = 'beroepskwalificatie'), /"kind" moet "beroepskwalificaties-index"/],
    ['de verkeerde volgorde (tekst in plaats van getal)', (i) => ([i.bks[1], i.bks[2]] = [i.bks[2], i.bks[1]]), /verkeerde volgorde/],
    ['een dubbele regel', (i) => i.bks.splice(1, 0, { ...i.bks[1] }), /meer dan één keer/],
    ['nummer en versie horen niet bij bk', (i) => (i.bks[1].versie = 3), /moeten BK-0390 en 2 zijn/],
    ['een verkeerd bestand', (i) => (i.bks[1].bestand = 'bk/BK-0390-3.json'), /"bestand" moet "bk\/BK-0390-2\.json"/],
    ['een bestand zonder sha256', (i) => delete i.bks[1].sha256, /"sha256" ontbreekt bij een versie met een bestand/],
    ['zonder bestand en zonder reden', (i) => delete i.bks[3].nietGevonden, /precies één van "nietGevonden" en "onbruikbaar"/],
    ['zonder bestand met beide redenen', (i) => (i.bks[3].onbruikbaar = true), /precies één van/],
    ['laatstErkend van een ander nummer', (i) => (i.bks[1].laatstErkend = 'BK-0391-1'), /hoort bij een ander nummer/],
    ['een VKS-niveau 9', (i) => (i.bks[1].vks = 9), /"vks" is geen geheel getal van 1 tot 8/],
    ['nietMeerInBron zonder bestand', (i) => (i.bks[3].nietMeerInBron = '2026-11-03'), /"nietMeerInBron" hoort alleen bij een versie met een bestand/],
    ['zonder opgehaald', (i) => delete i.bks[0].opgehaald, /"opgehaald" ontbreekt/],
    ['een DBK als versie', (i) => (i.bks[0].bk = 'BK-0130-4-DBK-01'), /past niet op BK-0000-0/],
    ['nietGevonden niet true', (i) => (i.bks[3].nietGevonden = 'ja'), /"nietGevonden" staat er alleen als het true is/],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, breek, fout) => {
    const i = geldigeIndex();
    breek(i);
    expect(valideerBkIndex(i).join('\n')).toMatch(fout);
  });

  it('negatief: gooit nooit, ook niet op rare invoer', () => {
    for (const raar of [null, [], { bks: [null, 1, { bk: 7 }, { bk: '__proto__' }] }]) {
      expect(() => valideerBkIndex(raar)).not.toThrow();
      expect(valideerBkIndex(raar).length).toBeGreaterThan(0);
    }
  });
});

// ── valideerBkBestand ───────────────────────────────────────────────────────

describe('valideerBkBestand', () => {
  const POSITIEF: [string, () => Rec, string | undefined][] = [
    ['het bestand uit de normalisatie', geldigBkBestand, 'BK-0390-2'],
    ['zonder optionele velden', () => {
      const b = geldigBkBestand();
      for (const v of ['status', 'vks', 'definitie', 'extra']) delete b[v];
      b.competenties = b.competenties.map((c: Rec) => ({ id: c.id, tekst: c.tekst, kennis: [], vaardigheden: [] }));
      return b;
    }, undefined],
    ['competenties zonder nr achteraan, met nietMeerInBron', () => {
      const b = geldigBkBestand();
      delete b.competenties[2].nr;
      b.nietMeerInBron = '2026-11-03';
      return b;
    }, 'BK-0390-2'],
    ['een competentiecode "__proto__"', () => {
      const b = geldigBkBestand();
      b.competenties[2].id = '__proto__';
      return b;
    }, 'BK-0390-2'],
  ];
  it.each(POSITIEF)('positief: %s', (_naam, bestand, bk) => {
    expect(valideerBkBestand(bestand(), bk)).toEqual([]);
  });

  const NEGATIEF: [string, (b: Rec) => void, RegExp, string | undefined][] = [
    ['een ander bestand dan gevraagd', () => undefined, /hoort bij "BK-0390-2", niet bij "BK-0464-1"/, 'BK-0464-1'],
    ['nummer en versie horen niet bij bk', (b) => (b.versie = 3), /moeten BK-0390 en 2 zijn/, undefined],
    ['een fout aantal', (b) => (b.aantal = 12), /Kop zegt 12 competenties/, undefined],
    ['een dubbele competentiecode', (b) => (b.competenties[1].id = b.competenties[0].id), /meer dan één keer/, undefined],
    ['een ongeldige competentiecode', (b) => (b.competenties[0].id = 'bkc 1'), /geen geldige competentiecode/, undefined],
    ['een lege tekst', (b) => (b.competenties[0].tekst = ''), /de tekst ontbreekt/, undefined],
    ['geen lijst kennis', (b) => delete b.competenties[0].kennis, /"kennis" ontbreekt/, undefined],
    ['lege kennis', (b) => (b.competenties[0].kennis = [{ tekst: ' ' }]), /kennis 1: de tekst ontbreekt/, undefined],
    ['een competentie met nr na een zonder nr', (b) => delete b.competenties[0].nr, /met nr staat na een competentie zonder nr/, undefined],
    ['de verkeerde volgorde van nr', (b) => b.competenties.reverse(), /verkeerde volgorde/, undefined],
    ['referenties in de verkeerde volgorde', (b) => (b.competenties[0].referenties = ['co 10', 'co 2']), /verkeerde volgorde/, undefined],
    ['curriculumdossier in extra', (b) => (b.extra.curriculumdossier = 'x'), /bevat "curriculumdossier"/, undefined],
    ['geen titel', (b) => delete b.titel, /"titel" ontbreekt/, undefined],
    ['geen competenties', (b) => ((b.competenties = []), (b.aantal = 0)), /geen competenties/, undefined],
    ['een VKS-niveau 0', (b) => (b.vks = 0), /"vks" is geen geheel getal van 1 tot 8/, undefined],
    ['een adres van een testserver', (b) => (b.api = 'http://localhost:4000/beroepskwalificatie/BK-0390-2'), /"api" moet met/, undefined],
    ['een onbekend veld in een competentie', (b) => (b.competenties[0].code = 'x'), /onbekende velden "code"/, undefined],
  ];
  it.each(NEGATIEF)('negatief: %s', (_naam, breek, fout, bk) => {
    const b = geldigBkBestand();
    breek(b);
    expect(valideerBkBestand(b, bk).join('\n')).toMatch(fout);
  });

  it('negatief: gooit nooit, ook niet op rare invoer', () => {
    for (const raar of [null, 'x', { competenties: [null, 1, { id: 3, nr: 'een', kennis: 'x', vaardigheden: [null], referenties: [1] }] }]) {
      expect(() => valideerBkBestand(raar)).not.toThrow();
      expect(valideerBkBestand(raar).length).toBeGreaterThan(0);
    }
  });
});
