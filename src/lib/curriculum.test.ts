import { existsSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BK_COMPETENTIE_ID,
  BK_VERSIE_ID,
  bevestigLeerplan,
  bewaakControle,
  doelenVingerafdruk,
  EXAMPLE_CURRICULUM_ID,
  exportCurriculumJson,
  getCurriculum,
  importCurriculumJson,
  importCurriculumJsonMetRapport,
  isVeiligDoelId,
  maakEigenKopie,
  MAX_BK_REFS,
  MAX_BK_VERSIES,
  MAX_DOELEN,
  MAX_DOELTEKST,
  MAX_DOELTHEMA,
  MAX_DOELTOELICHTING,
  netLabel,
  sanitizeCurriculum,
  sanitizeGoal,
  sanitizeGoals,
  saveCurriculum,
  type BevestigOpties,
} from './curriculum';
import { controleerLeerplan, type ControleRapport } from './curriculumCheck';
import { CURRICULUM_NETS, type Curriculum, type CurriculumGoal, type CurriculumMethode } from './curriculumTypes';
import { NET_KEUZES } from './leerplanNetten';
import { effectieveStatus } from './leerplanStatus';
import { ensureExampleCurriculum } from './seed';
import { sha256Hex } from './sha256';

/** Een rapport zonder fouten voor de (gesaneerde) doelen van `cur`: om opslag en export te testen. */
function geslaagd(cur: Curriculum): ControleRapport {
  const goals = sanitizeCurriculum(cur)?.goals ?? [];
  return {
    bevindingen: [], perDoel: {}, dekking: [], kanBevestigen: true, samenvatting: 'Nagemaakt rapport.',
    tellers: { doelen: goals.length, letterlijk: goals.length, nietLetterlijk: 0, verwijzingen: 0, verwijzingenOk: 0 },
    doelenSha256: doelenVingerafdruk(goals),
  };
}

function bevestig(cur: Curriculum, opts: Omit<BevestigOpties, 'rapport'> & { rapport?: ControleRapport }): Curriculum {
  return bevestigLeerplan(cur, { ...opts, rapport: opts.rapport ?? geslaagd(cur) });
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

const HEX = 'a'.repeat(64);

/** Een nagemaakt leerplan van versie 2 met alles erop en eraan (geen echte leerplantekst). */
function v2Ruw(): Record<string, unknown> {
  return {
    id: 'lp-1',
    title: '  Aardrijkskunde (nagemaakt)  ',
    net: 'kov',
    subject: 'Aardrijkskunde',
    level: '1e graad A-stroom',
    source: 'nagemaakte bron',
    kind: 'leerplan',
    herkomst: {
      methode: 'pdf',
      leerplancode: '  I-Aar-a ',
      versie: '2024',
      geldigVanaf: '2024-09-01',
      bronUrl: 'https://pro.katholiekonderwijs.vlaanderen/voorbeeld.pdf',
      bronNaam: 'voorbeeld.pdf',
      bronSha256: HEX,
      ingelezenOp: 1_700_000_000_000,
      geheim: 'valt weg',
    },
    controle: { status: 'niet-gecontroleerd', samenvatting: '  nog niet nagekeken ' },
    minimumdoelenSets: ['ODS_3287', ' ODS_3287', 'ODS_12', 'rommel', 7],
    onbekendVeld: { valt: 'weg' },
    goals: [
      {
        id: 'g1', code: 'lpd 1', text: 'De leerlingen   beschrijven de verwering.', theme: 'Bodem',
        refs: [{ set: 'ODS_3287', id: '92187', code: '09.02' }], refsBron: '  MD 09.02 ',
      },
      { id: 'g2', code: 'LPD 2', text: 'De leerlingen situeren landschappen.', level: 'uitbreiding', refs: [] },
    ],
    createdAt: 1_600_000_000_000,
    updatedAt: 1_650_000_000_000,
  };
}

// ── Gouden vingerafdrukken (fase 3, K5): bestaande leerplannen veranderen niet ──
//
// Leerplannen zoals de app ze bewaarde vóór fase 3 (beroepskwalificaties), gemaakt met de code van toen en hier
// bevroren: een officiële set (ODS_3142), een samengestelde lijst op de structuurfixtures (G-0193, Biologie en STEM, met
// de kadervelden van fase 2), een eigen kopie ervan, een ingelezen netleerplan met twee verwijzingen per doel, en een
// leerplan van vóór versie 2. Daarnaast het voorbeeldleerplan van de app (seed.ts), live. Hun vingerafdruk, hun vorm na
// het saneren, hun exportbestand en hun nakijkstatus zijn vaste waarden: ze mogen nooit veranderen (N1 en N7 in
// docs/STUDIERICHTINGEN.md § 23.6.7). Verandert er hier een waarde, dan ziet een leerkracht een bewaard leerplan
// "gewijzigd" worden zonder dat iemand iets deed.

const GOUD_LEERPLANNEN: Record<string, Record<string, unknown>> = {
  officieel: {
    "id": "0hxna2a1bkjq",
    "title": "STEM · 2de graad",
    "net": "minimumdoelen",
    "subject": "STEM",
    "level": "2de graad",
    "source": "Secundair onderwijs 2de graad -  STEM - Cesuurdoelen. Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be) (opgehaald 5 oktober 2026)",
    "goals": [
      {"id": "jawx3at0bkj9", "code": "12.01.01", "text": "De leerlingen ontwikkelen een oplossing voor een probleem door STEM-disciplines geïntegreerd toe te passen.", "theme": "STEM - Engineering", "refs": [{"set": "ODS_3142", "id": "91977", "code": "12.01.01"}]},
      {"id": "a7khcluhbkj9", "code": "12.01.02", "text": "De leerlingen gebruiken met de nodige nauwkeurigheid meetinstrumenten en hulpmiddelen.", "theme": "STEM - Engineering", "refs": [{"set": "ODS_3142", "id": "91978", "code": "12.01.02"}]},
      {"id": "3sh39d8xbkj9", "code": "12.02.01", "text": "De leerlingen gebruiken met de nodige nauwkeurigheid meetinstrumenten en hulpmiddelen.", "theme": "Onderzoeksvaardigheden wetenschappen", "refs": [{"set": "ODS_3142", "id": "91979", "code": "12.02.01"}]},
    ],
    "createdAt": 1791653645510,
    "updatedAt": 1791653645510,
    "kind": "leerplan",
    "herkomst": {"methode": "officieel", "ingelezenOp": 1791653645493, "versie": "2.1", "geldigVanaf": "2023-09-01", "bronUrl": "https://www.onderwijsdoelen.be/", "bronNaam": "ODS_3142", "bronSha256": "fec1c7701cdc9723e83378b2fd5c2c4001e229782982198b2049d2c8b3e727a7"},
    "minimumdoelenSets": ["ODS_3142"],
    "controle": {"status": "gecontroleerd", "door": "Boosterz (officiële bron)", "op": 1791653645516, "doelenSha256": "e9f1a1da82906cdd67258c2129ced09909e28374eecef8f6212db9a4c88411ef", "samenvatting": "Letterlijk overgenomen uit de officiële set ODS_3142 (3 doelen)."},
  },
  samengesteld: {
    "id": "jarxuwnlbkke",
    "title": "Biologie · Natuurwetenschappen · 2de graad",
    "net": "minimumdoelen",
    "subject": "Biologie",
    "level": "2de graad",
    "source": "Samengesteld uit de officiële minimumdoelen: Biologie (ODS_3132), STEM (ODS_3142). Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be) (opgehaald 5 oktober 2026)",
    "goals": [
      {"id": "2asu1fe1bkkd", "code": "08.01.01", "text": "De leerlingen bespreken transport van water en assimilaten in relatie tot de morfologie van de plant.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91766", "code": "08.01.01"}]},
      {"id": "ofuugkhdbkke", "code": "08.01.02", "text": "De leerlingen situeren organismen in het driedomeinensysteem.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91767", "code": "08.01.02"}]},
      {"id": "d369i4ybbkke", "code": "08.01.03", "text": "De leerlingen analyseren het gedrag van en interacties tussen organismen van dezelfde soort en van verschillende soorten.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91768", "code": "08.01.03"}]},
      {"id": "hhsoi24dbkke", "code": "08.01.04", "text": "De leerlingen leggen het voorkomen of een toepassing van micro-organismen uit aan de hand van structuur, metabolisme of voortplanting.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91769", "code": "08.01.04"}]},
      {"id": "lkpd9wk7bkke", "code": "12.02.01", "text": "De leerlingen gebruiken met de nodige nauwkeurigheid meetinstrumenten en hulpmiddelen.", "theme": "STEM › Onderzoeksvaardigheden wetenschappen", "refs": [{"set": "ODS_3142", "id": "91979", "code": "12.02.01"}]},
    ],
    "createdAt": 1791653645534,
    "updatedAt": 1791653645532,
    "kind": "leerplan",
    "herkomst": {"methode": "samengesteld", "ingelezenOp": 1791653645532},
    "minimumdoelenSets": ["ODS_3132", "ODS_3142"],
    "doelgroep": {"groep": "G-0193", "titel": "Natuurwetenschappen", "soort": "so", "graad": 2, "vak": "Biologie", "kader": "81c5deef9ec68f937a5b040c8532e75fd2572bb7251596106575da536cff854c", "kaderVolledig": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "setAfdrukken": {"ODS_3132": "0ad5821e3db60cf4", "ODS_3142": "b5c98b1728abae84"}, "volgtKader": true},
    "controle": {"status": "gecontroleerd", "door": "Boosterz (officiële bron)", "op": 1791653645537, "doelenSha256": "73295915386335e33b72b79df4b929099c7021ac6e110b3efc81c350240a7c27", "samenvatting": "Letterlijk overgenomen uit 2 officiële sets (5 doelen), zelf gekozen."},
  },
  kopie: {
    "id": "xyku1xyxbkkh",
    "title": "Biologie · Natuurwetenschappen · 2de graad (eigen kopie)",
    "net": "minimumdoelen",
    "subject": "Biologie",
    "level": "2de graad",
    "source": "Samengesteld uit de officiële minimumdoelen: Biologie (ODS_3132), STEM (ODS_3142). Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be) (opgehaald 5 oktober 2026)",
    "goals": [
      {"id": "ype0s262bkkh", "code": "08.01.01", "text": "De leerlingen bespreken transport van water en assimilaten in relatie tot de morfologie van de plant.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91766", "code": "08.01.01"}]},
      {"id": "o2hdp3rlbkkh", "code": "08.01.02", "text": "De leerlingen situeren organismen in het driedomeinensysteem.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91767", "code": "08.01.02"}]},
      {"id": "ptlflkhibkkh", "code": "08.01.03", "text": "De leerlingen analyseren het gedrag van en interacties tussen organismen van dezelfde soort en van verschillende soorten.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91768", "code": "08.01.03"}]},
      {"id": "ge6zs9hcbkkh", "code": "08.01.04", "text": "De leerlingen leggen het voorkomen of een toepassing van micro-organismen uit aan de hand van structuur, metabolisme of voortplanting.", "theme": "Biologie › Uitgebreide biologie", "refs": [{"set": "ODS_3132", "id": "91769", "code": "08.01.04"}]},
      {"id": "kgrb06txbkkh", "code": "12.02.01", "text": "De leerlingen gebruiken met de nodige nauwkeurigheid meetinstrumenten en hulpmiddelen.", "theme": "STEM › Onderzoeksvaardigheden wetenschappen", "refs": [{"set": "ODS_3142", "id": "91979", "code": "12.02.01"}]},
    ],
    "createdAt": 1791653645537,
    "updatedAt": 1791653645537,
    "kind": "eigen",
    "herkomst": {"methode": "samengesteld", "ingelezenOp": 1791653645532},
    "minimumdoelenSets": ["ODS_3132", "ODS_3142"],
    "doelgroep": {"groep": "G-0193", "titel": "Natuurwetenschappen", "soort": "so", "graad": 2, "vak": "Biologie"},
  },
  net: {
    "id": "4qjvgcxlbkkh",
    "title": "Natuurwetenschappen (nagemaakt netleerplan)",
    "net": "kov",
    "subject": "Natuurwetenschappen",
    "level": "2de graad",
    "source": "nagemaakte bron voor de gouden test, geen echt leerplan",
    "goals": [
      {"id": "n1", "code": "LPD 1", "text": "De leerlingen onderzoeken een ecosysteem.", "theme": "Biologie", "refs": [{"set": "ODS_3132", "id": "91766", "code": "08.01.01"}, {"set": "ODS_3132", "id": "91767", "code": "08.01.02"}], "refsBron": "MD 1, MD 2"},
      {"id": "n2", "code": "LPD 2", "text": "De leerlingen voeren een STEM-project uit.\nMet een verslag.", "theme": "STEM", "level": "uitbreiding", "note": "Toelichting.", "refs": [{"set": "ODS_3142", "id": "91977", "code": "12.01.01"}, {"set": "ODS_3142", "id": "91978", "code": "12.01.02"}], "refsBron": "MD 3, MD 4"},
      {"id": "n3", "code": "LPD 3", "text": "De leerlingen verklaren fotosynthese.", "refs": [{"set": "ODS_3132", "id": "91768", "code": "08.01.03"}, {"set": "ODS_3142", "id": "91979", "code": "12.02.01"}]},
    ],
    "createdAt": 1760000000000,
    "updatedAt": 1760000100000,
    "kind": "leerplan",
    "herkomst": {"methode": "pdf", "ingelezenOp": 1760000000000, "leerplancode": "TEST-NW-2", "versie": "2025", "geldigVanaf": "2025-09-01", "bronNaam": "test.pdf", "bronSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    "minimumdoelenSets": ["ODS_3132", "ODS_3142"],
    "controle": {"status": "gecontroleerd", "door": "Testleerkracht", "op": 1760000200000, "doelenSha256": "a13f848a80ab31bec0f8140cba4d96e44d324cad44a271dbb59163a0bbf1bf03", "samenvatting": "3 doelen letterlijk, 6 verwijzingen in orde."},
  },
  v1: {
    "id": "oud-v1",
    "title": "Wiskunde",
    "net": "go",
    "subject": "Wiskunde",
    "level": "1e graad",
    "source": "pro.g-o.be",
    "goals": [
      {"id": "a", "code": "WIS 9.9", "text": "Getallen lezen", "theme": "Getallen", "level": "basis", "note": "Toelichting"},
      {"id": "b", "code": "WIS 1.1", "text": "Meten", "theme": "Meten"},
    ],
    "createdAt": 1,
    "updatedAt": 2,
  },
};

/** Per bevroren leerplan: de vingerafdruk van de doelen, het versiemerk van het exportbestand na saneren, de status. */
const GOUD: Record<string, { vingerafdruk: string; export: string; status: string }> = {
  officieel: {
    vingerafdruk: 'e9f1a1da82906cdd67258c2129ced09909e28374eecef8f6212db9a4c88411ef',
    export: 'dda5376c8e6d704555ee64155b7fa456951015e24f0f605f1f8fb18939d71061',
    status: 'gecontroleerd',
  },
  samengesteld: {
    vingerafdruk: '73295915386335e33b72b79df4b929099c7021ac6e110b3efc81c350240a7c27',
    export: '9491cdfa5aaa55a210ad59279c462d9799dca7d60b4dd73024e3a3acafd59d8f',
    status: 'gecontroleerd',
  },
  kopie: {
    vingerafdruk: '73295915386335e33b72b79df4b929099c7021ac6e110b3efc81c350240a7c27',
    export: '7bfbf04600d86925ea40f1e01416d8a8de7118c1fd59f43708fd1b398deaa792',
    status: 'niet-gecontroleerd',
  },
  net: {
    vingerafdruk: 'a13f848a80ab31bec0f8140cba4d96e44d324cad44a271dbb59163a0bbf1bf03',
    export: '820f9dcf500c3b602b11add34c8c49fdc25f67d33ddce90562574c9c6a0026c9',
    status: 'gecontroleerd',
  },
  v1: {
    vingerafdruk: 'feab045f397640b59207fc634e39fae8a5397ece3d040123fcd0c188e635a4ea',
    export: '56eb03623e404bb6b71fe3521b82b8c5b82ec2c82ad1086e87d9aa6cca456b5e',
    status: 'niet-gecontroleerd',
  },
};
/** Vingerafdruk van de doelen van het voorbeeldleerplan van de app (seed.ts). */
const GOUD_VOORBEELD = '77f4cfcb1425cf122c5e7f17bec4afa96c296f64db57ef2cb5d064abe5272c10';

/** Een diepe kopie, zoals een leerplan uit localStorage of uit een bestand komt. */
function uitJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('gouden vingerafdrukken: bestaande leerplannen (N1, N7)', () => {
  for (const [naam, bevroren] of Object.entries(GOUD_LEERPLANNEN)) {
    const goud = GOUD[naam];

    it(`${naam}: dezelfde vingerafdruk, dezelfde vorm na saneren, hetzelfde exportbestand en dezelfde status`, () => {
      const cur = uitJson(bevroren) as unknown as Curriculum;
      expect(doelenVingerafdruk(cur.goals)).toBe(goud.vingerafdruk);
      if (cur.controle?.doelenSha256) expect(cur.controle.doelenSha256).toBe(goud.vingerafdruk);
      // Saneren (bewaren in een bestand, importeren) voegt geen sleutel toe en verandert geen waarde.
      const gesaneerd = sanitizeCurriculum(uitJson(bevroren)) as Curriculum;
      expect(uitJson(gesaneerd)).toStrictEqual(bevroren);
      expect(sanitizeCurriculum(uitJson(gesaneerd))).toStrictEqual(gesaneerd);
      // Het exportbestand (versie 2) is byte voor byte hetzelfde, ook na nog een keer importeren en exporteren.
      const json = exportCurriculumJson(gesaneerd);
      expect(sha256Hex(json)).toBe(goud.export);
      expect(exportCurriculumJson(importCurriculumJson(json) as Curriculum)).toBe(json);
      expect(json).not.toMatch(/bkRefs|bkVersies|beroepskwalificatie/);
      // Dezelfde nakijkstatus: rechtstreeks, na saneren en na importeren.
      expect(effectieveStatus(cur)).toBe(goud.status);
      expect(effectieveStatus(gesaneerd)).toBe(goud.status);
      expect(effectieveStatus(importCurriculumJson(json) as Curriculum)).toBe(goud.status);
      // Bewaren verandert de status niet.
      saveCurriculum(cur);
      expect(effectieveStatus(getCurriculum(cur.id) as Curriculum)).toBe(goud.status);
    });
  }

  it('een eigen kopie heeft dezelfde vingerafdruk als het origineel, maar is niet nagekeken', () => {
    for (const naam of ['samengesteld', 'net', 'officieel']) {
      const cur = uitJson(GOUD_LEERPLANNEN[naam]) as unknown as Curriculum;
      const kopie = maakEigenKopie(cur);
      expect(doelenVingerafdruk(kopie.goals), naam).toBe(GOUD[naam].vingerafdruk);
      expect(effectieveStatus(kopie), naam).toBe('niet-gecontroleerd');
      expect(Object.keys(kopie), naam).not.toContain('bkVersies');
      expect(kopie.goals.every((g) => !('bkRefs' in g)), naam).toBe(true);
    }
    expect(GOUD.kopie.vingerafdruk).toBe(GOUD.samengesteld.vingerafdruk);
  });

  it('het voorbeeldleerplan van de app (seed.ts): dezelfde vingerafdruk en dezelfde vorm na saneren', () => {
    const voorbeeld = ensureExampleCurriculum() as Curriculum;
    expect(voorbeeld.id).toBe(EXAMPLE_CURRICULUM_ID);
    expect(doelenVingerafdruk(voorbeeld.goals)).toBe(GOUD_VOORBEELD);
    expect(uitJson(sanitizeCurriculum(uitJson(voorbeeld)))).toStrictEqual(uitJson(voorbeeld));
    expect(effectieveStatus(voorbeeld)).toBe('niet-gecontroleerd');
    expect(exportCurriculumJson(voorbeeld)).not.toMatch(/bkRefs|bkVersies/);
  });
});

describe('sanitizeGoal: verwijzingen (versie 2)', () => {
  it('neemt geldige refs mee: getrimd, een getal als id wordt tekst', () => {
    const g = sanitizeGoal({
      text: 'Doel',
      refs: [
        { set: ' ODS_3287 ', id: ' 92186 ', code: ' 09.01 ' },
        { set: 'ODS_3287', id: 92187, code: '09.02' },
      ],
    });
    expect(g?.refs).toEqual([
      { set: 'ODS_3287', id: '92186', code: '09.01' },
      { set: 'ODS_3287', id: '92187', code: '09.02' },
    ]);
  });

  it('laat ongeldige refs vallen', () => {
    const g = sanitizeGoal({
      text: 'Doel',
      refs: [
        null, 'ODS_1', { set: 'SO_1STE_GRAAD', id: '1', code: '1' }, { set: 'ODS_', id: '1' }, { set: 'ODS_1234567890', id: '1' },
        { set: 'ODS_1', id: '' }, { set: 'ODS_1', id: '   ' }, { set: 'ODS_1', id: 'x'.repeat(65) }, { set: 'ODS_1', id: Infinity },
        { set: 'ODS_1', id: '5', code: 'c'.repeat(41) },
        { set: 'ODS_1', id: 'x'.repeat(64), code: 'c'.repeat(40) },
        { set: 'ODS_1', id: '6' }, // geen code: lege code
      ],
    });
    expect(g?.refs).toEqual([
      { set: 'ODS_1', id: 'x'.repeat(64), code: 'c'.repeat(40) },
      { set: 'ODS_1', id: '6', code: '' },
    ]);
  });

  it('ontdubbelt op set + id en houdt hoogstens 50 refs', () => {
    const refs = Array.from({ length: 60 }, (_, i) => ({ set: 'ODS_1', id: String(i % 55), code: String(i) }));
    const g = sanitizeGoal({ text: 'Doel', refs });
    expect(g?.refs).toHaveLength(50);
    expect(new Set(g?.refs?.map((r) => r.id)).size).toBe(50);
    const dubbel = sanitizeGoal({ text: 'Doel', refs: [{ set: 'ODS_1', id: '1', code: 'a' }, { set: 'ODS_1', id: '1', code: 'b' }, { set: 'ODS_2', id: '1', code: 'c' }] });
    expect(dubbel?.refs?.map((r) => r.code)).toEqual(['a', 'c']);
  });

  it('bewaart regeleinden in tekst en toelichting, maar vouwt witruimte per regel samen', () => {
    const g = sanitizeGoal({
      text: '  Inleiding:  \r\n•   een\r\r\n\n  • twee  \n',
      note: 'Regel  één\n\n\nRegel   twee',
    });
    expect(g?.text).toBe('Inleiding:\n• een\n• twee');
    expect(g?.note).toBe('Regel één\nRegel twee');
    expect(sanitizeGoal({ text: 'De   leerlingen \t meten.' })?.text).toBe('De leerlingen meten.');
    expect(sanitizeGoal({ text: ' \n \r\n ' })).toBeNull();
    expect(sanitizeGoal({ text: 'x', note: '\n \n' })?.note).toBeUndefined();
    const nogEens = sanitizeGoal(g);
    expect(nogEens?.text).toBe(g?.text);
    expect(nogEens?.note).toBe(g?.note);
  });

  it('bewaart geen lege refs en geen lege refsBron', () => {
    const g = sanitizeGoal({ text: 'Doel', refs: [], refsBron: '   ' });
    expect(g).not.toHaveProperty('refs');
    expect(g).not.toHaveProperty('refsBron');
    expect(sanitizeGoal({ text: 'Doel', refs: 'geen lijst' })).not.toHaveProperty('refs');
  });

  it('trimt refsBron en kort ze in tot 500 tekens', () => {
    expect(sanitizeGoal({ text: 'Doel', refsBron: '  MD 09.01, 09.03 ' })?.refsBron).toBe('MD 09.01, 09.03');
    expect(sanitizeGoal({ text: 'Doel', refsBron: 'x'.repeat(800) })?.refsBron).toHaveLength(500);
    expect(sanitizeGoal({ text: 'Doel', refsBron: 42 })).not.toHaveProperty('refsBron');
  });
});

describe('sanitizeCurriculum: versie 2', () => {
  it('neemt soort, herkomst, nakijkstatus en sets mee en laat onbekende velden vallen', () => {
    const cur = sanitizeCurriculum(v2Ruw());
    expect(cur).not.toBeNull();
    expect(cur?.kind).toBe('leerplan');
    expect(cur?.herkomst).toEqual({
      methode: 'pdf',
      leerplancode: 'I-Aar-a',
      versie: '2024',
      geldigVanaf: '2024-09-01',
      bronUrl: 'https://pro.katholiekonderwijs.vlaanderen/voorbeeld.pdf',
      bronNaam: 'voorbeeld.pdf',
      bronSha256: HEX,
      ingelezenOp: 1_700_000_000_000,
    });
    expect(cur?.controle).toEqual({ status: 'niet-gecontroleerd', samenvatting: 'nog niet nagekeken' });
    expect(cur?.minimumdoelenSets).toEqual(['ODS_3287', 'ODS_12']);
    expect(cur).not.toHaveProperty('onbekendVeld');
    expect(cur?.goals[0]).toMatchObject({ code: 'LPD 1', text: 'De leerlingen beschrijven de verwering.', refsBron: 'MD 09.02' });
    expect(cur?.goals[1]).not.toHaveProperty('refs');
  });

  it('laat ongeldige soort, herkomst, nakijkstatus en sets weg', () => {
    const ruw = {
      ...v2Ruw(),
      kind: 'officieel',
      herkomst: { methode: 'gegokt', leerplancode: 'X' },
      controle: { status: 'goedgekeurd', door: 'An' },
      minimumdoelenSets: ['rommel', ''],
    };
    const cur = sanitizeCurriculum(ruw);
    expect(cur).not.toHaveProperty('kind');
    expect(cur).not.toHaveProperty('herkomst');
    expect(cur).not.toHaveProperty('controle');
    expect(cur).not.toHaveProperty('minimumdoelenSets');
    expect(sanitizeCurriculum({ ...v2Ruw(), herkomst: 'pdf', controle: null, minimumdoelenSets: 'ODS_1' })).not.toHaveProperty('herkomst');
  });

  it('saneert de velden van de herkomst streng', () => {
    const herkomst = sanitizeCurriculum({
      ...v2Ruw(),
      herkomst: {
        methode: 'tekst',
        leerplancode: 'c'.repeat(200),
        geldigVanaf: '1 september 2024',
        bronUrl: 'javascript:alert(1)',
        bronSha256: HEX.toUpperCase(),
        ingelezenOp: Number.NaN,
      },
    })?.herkomst;
    expect(herkomst).toEqual({ methode: 'tekst', leerplancode: 'c'.repeat(80), ingelezenOp: 1_600_000_000_000 });
    for (const bronUrl of ['ftp://x', 'data:text/html,hoi', '//x.be', `https://${'x'.repeat(2000)}`, 'https://met spatie']) {
      expect(sanitizeCurriculum({ ...v2Ruw(), herkomst: { methode: 'pdf', bronUrl } })?.herkomst, bronUrl).not.toHaveProperty('bronUrl');
    }
    expect(sanitizeCurriculum({ ...v2Ruw(), herkomst: { methode: 'officieel', bronSha256: 'abc' } })?.herkomst).not.toHaveProperty('bronSha256');
  });

  it('saneert de nakijkstatus: naam ingekort, tijdstip eindig, vingerafdruk 64 hex', () => {
    const controle = sanitizeCurriculum({
      ...v2Ruw(),
      controle: { status: 'gewijzigd', door: `  ${'n'.repeat(200)} `, op: Infinity, doelenSha256: 'zz', samenvatting: 's'.repeat(900), extra: 1 },
    })?.controle;
    expect(controle).toEqual({ status: 'gewijzigd', door: 'n'.repeat(120), samenvatting: 's'.repeat(500) });
  });

  it('houdt hoogstens 50 sets', () => {
    const sets = Array.from({ length: 70 }, (_, i) => `ODS_${i + 1}`);
    expect(sanitizeCurriculum({ ...v2Ruw(), minimumdoelenSets: sets })?.minimumdoelenSets).toEqual(sets.slice(0, 50));
  });

  it('is idempotent: twee keer saneren geeft hetzelfde als één keer', () => {
    for (const ruw of [v2Ruw(), { titel: 'Oud', vak: 'Wiskunde', doelen: [{ doel: 'Rekenen', thema: 'Getallen' }, { doel: 'Meten' }] }]) {
      const een = sanitizeCurriculum(ruw);
      const twee = sanitizeCurriculum(een);
      expect(twee).toStrictEqual(een);
    }
    const nagekeken = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An', op: 5 });
    const gewijzigd = { ...nagekeken, goals: nagekeken.goals.map((g, i) => (i === 0 ? { ...g, text: 'Anders.' } : g)) };
    const een = sanitizeCurriculum(gewijzigd);
    expect(een?.controle?.status).toBe('gewijzigd');
    expect(sanitizeCurriculum(een)).toStrictEqual(een);
  });

  it('een lange tekst wordt niet midden in een emoji afgeknipt', () => {
    const door = `${'a'.repeat(119)}😀`;
    const cur = sanitizeCurriculum({ ...v2Ruw(), controle: { status: 'gewijzigd', door } });
    expect(cur?.controle?.door).toBe('a'.repeat(119));
    expect(sanitizeCurriculum(cur)).toStrictEqual(cur);
  });
});

describe('sanitizeCurriculum: weggelatenCodes', () => {
  const geldig = [{ code: 'BG02.01', set: 'ODS_3343', id: '92268' }, { code: 'BG02.02', set: 'ODS_3343', id: '92269' }];

  it('behoudt geldige elementen: code genormaliseerd, set en id getrimd, een getal als id wordt tekst', () => {
    const cur = sanitizeCurriculum({
      ...v2Ruw(),
      weggelatenCodes: [{ code: '  bg02.01 ', set: ' ODS_3343 ', id: ' 92268 ', extra: 'valt weg' }, { code: 'BG02.02', set: 'ODS_3343', id: 92269 }],
    });
    expect(cur?.weggelatenCodes).toEqual(geldig);
    expect(cur?.weggelatenCodes?.[0]).not.toHaveProperty('extra');
  });

  it('laat rommel, dubbele codes, te lange codes en ids, en verkeerde set-ids weg', () => {
    const cur = sanitizeCurriculum({
      ...v2Ruw(),
      weggelatenCodes: [
        null, 'BG02.01', 7, [], {},
        { code: 5, set: 'ODS_3343', id: '1' },
        { code: '   ', set: 'ODS_3343', id: '1' },
        { code: 'X'.repeat(61), set: 'ODS_3343', id: '1' },
        { code: 'OK1', set: 'ods_3343', id: '1' },
        { code: 'OK2', set: 'ODS_', id: '1' },
        { code: 'OK3', set: 'ODS_1234567890', id: '1' },
        { code: 'OK4', set: 'SET_X', id: '1' },
        { code: 'OK5', set: 'ODS_3343', id: '' },
        { code: 'OK6', set: 'ODS_3343', id: 'i'.repeat(65) },
        { code: 'OK7', set: 'ODS_3343', id: Number.NaN },
        { code: 'OK8', set: 'ODS_3343', id: null },
        ...geldig,
        { code: ' bg02.01', set: 'ODS_9', id: 'ander' }, // dezelfde code: alleen de eerste telt
        { code: 'X'.repeat(60), set: 'ODS_3343', id: 'i'.repeat(64) },
      ],
    });
    expect(cur?.weggelatenCodes).toEqual([...geldig, { code: 'X'.repeat(60), set: 'ODS_3343', id: 'i'.repeat(64) }]);
  });

  it('geen lijst, of niets bruikbaars: het veld valt weg', () => {
    for (const weggelatenCodes of [undefined, null, 'BG02.01', { code: 'BG02.01', set: 'ODS_1', id: '1' }, [], [null, { code: '' }]]) {
      expect(sanitizeCurriculum({ ...v2Ruw(), weggelatenCodes }), JSON.stringify(weggelatenCodes)).not.toHaveProperty('weggelatenCodes');
    }
  });

  it(`houdt hoogstens ${MAX_DOELEN} codes`, () => {
    const veel = Array.from({ length: MAX_DOELEN + 10 }, (_, i) => ({ code: `C${i}`, set: 'ODS_1', id: `${i}` }));
    const cur = sanitizeCurriculum({ ...v2Ruw(), weggelatenCodes: veel });
    expect(cur?.weggelatenCodes).toHaveLength(MAX_DOELEN);
    expect(cur?.weggelatenCodes?.[MAX_DOELEN - 1]).toEqual(veel[MAX_DOELEN - 1]);
  });

  it('is idempotent', () => {
    const een = sanitizeCurriculum({ ...v2Ruw(), weggelatenCodes: [{ code: ' a 1 ', set: 'ODS_1', id: 3 }, { code: 'A 1', set: 'ODS_2', id: '4' }] });
    expect(een?.weggelatenCodes).toEqual([{ code: 'A 1', set: 'ODS_1', id: '3' }]);
    expect(sanitizeCurriculum(een)).toStrictEqual(een);
  });

  it('telt niet mee in de vingerafdruk en verandert de nakijkstatus niet, ook niet na export en import', () => {
    const nagekeken = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const met: Curriculum = { ...nagekeken, weggelatenCodes: geldig };
    expect(bewaakControle(met)).toBe(met);
    const terug = importCurriculumJson(exportCurriculumJson(met));
    expect(terug?.controle?.status).toBe('gecontroleerd');
    expect(terug?.weggelatenCodes).toEqual(geldig);
    expect(terug?.controle?.doelenSha256).toBe(doelenVingerafdruk(nagekeken.goals));
    // Het veld wijzigen in het bestand (of weghalen) maakt een nagekeken lijst niet "gewijzigd".
    const json = exportCurriculumJson(met);
    expect(importCurriculumJson(json.replace('"92268"', '"99999"'))?.controle?.status).toBe('gecontroleerd');
    const zonder = JSON.parse(json) as { curriculum: Record<string, unknown> };
    delete zonder.curriculum.weggelatenCodes;
    const terugZonder = importCurriculumJson(JSON.stringify(zonder));
    expect(terugZonder?.controle?.status).toBe('gecontroleerd');
    expect(terugZonder).not.toHaveProperty('weggelatenCodes');
  });

  it('een eigen kopie neemt het veld mee', () => {
    const met = { ...(sanitizeCurriculum(v2Ruw()) as Curriculum), weggelatenCodes: geldig };
    expect(maakEigenKopie(met).weggelatenCodes).toEqual(geldig);
  });
});

describe('sanitizeCurriculum: doelgroep (studierichting)', () => {
  const DG = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so', kader: 'b'.repeat(64), volgtKader: true };

  it('neemt een geldige doelgroep mee, gesaneerd en altijd zonder jaar (een leerplan geldt voor de hele graad)', () => {
    const cur = sanitizeCurriculum({ ...v2Ruw(), doelgroep: { ...DG, jaar: 4, titel: ' Natuurwetenschappen\n', vreemd: 1 } });
    expect(cur?.doelgroep).toStrictEqual(DG);
    expect(cur?.doelgroep).not.toHaveProperty('jaar');
  });

  it('een ongeldige of ontbrekende doelgroep: geen sleutel "doelgroep"', () => {
    for (const doelgroep of [undefined, null, 'G-0193', { groep: 'G-19' }, { titel: 'x' }, []]) {
      const cur = sanitizeCurriculum({ ...v2Ruw(), doelgroep });
      expect(cur, JSON.stringify(doelgroep)).not.toHaveProperty('doelgroep');
    }
    expect(Object.keys(sanitizeCurriculum(v2Ruw())!)).not.toContain('doelgroep');
  });

  it('is idempotent', () => {
    const een = sanitizeCurriculum({ ...v2Ruw(), doelgroep: { ...DG, jaar: 3 } });
    expect(sanitizeCurriculum(een)).toStrictEqual(een);
    expect(sanitizeCurriculum(JSON.parse(JSON.stringify(een)))).toStrictEqual(een);
  });

  it('telt niet mee in de vingerafdruk: een nagekeken leerplan blijft nagekeken als er een doelgroep bijkomt, verandert of afgaat', () => {
    const nagekeken = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const vingerafdruk = nagekeken.controle!.doelenSha256;
    const met: Curriculum = { ...nagekeken, doelgroep: DG as Curriculum['doelgroep'] };
    expect(bewaakControle(met)).toBe(met);
    expect(doelenVingerafdruk(met.goals)).toBe(vingerafdruk);
    // Bevestigen met doelgroep geeft dezelfde vingerafdruk als zonder.
    expect(bevestig(sanitizeCurriculum({ ...v2Ruw(), doelgroep: DG }) as Curriculum, { door: 'An' }).controle!.doelenSha256).toBe(vingerafdruk);

    // Export versie 2 en import: de doelgroep reist mee en "gecontroleerd" blijft.
    const json = exportCurriculumJson(met);
    expect(JSON.parse(json).v).toBe(2);
    const terug = importCurriculumJson(json);
    expect(terug?.controle?.status).toBe('gecontroleerd');
    expect(terug?.controle?.doelenSha256).toBe(vingerafdruk);
    expect(terug?.doelgroep).toStrictEqual(DG);

    // De doelgroep in het bestand wijzigen of weghalen: nog altijd nagekeken.
    const ander = JSON.parse(json) as { curriculum: Record<string, unknown> };
    ander.curriculum.doelgroep = { groep: 'G-0200', titel: 'Andere richting', graad: 3, soort: 'buso' };
    const terugAnder = importCurriculumJson(JSON.stringify(ander));
    expect(terugAnder?.controle?.status).toBe('gecontroleerd');
    expect(terugAnder?.doelgroep?.groep).toBe('G-0200');
    delete ander.curriculum.doelgroep;
    const terugZonder = importCurriculumJson(JSON.stringify(ander));
    expect(terugZonder?.controle?.status).toBe('gecontroleerd');
    expect(terugZonder).not.toHaveProperty('doelgroep');
  });

  it('bewaren met een doelgroep laat een nagekeken leerplan nagekeken', () => {
    const nagekeken = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    saveCurriculum({ ...nagekeken, doelgroep: DG as Curriculum['doelgroep'] });
    expect(getCurriculum('lp-1')?.controle?.status).toBe('gecontroleerd');
    expect(getCurriculum('lp-1')?.doelgroep).toStrictEqual(DG);
  });

  it('een eigen kopie neemt de doelgroep mee, maar volgt de koppeling van de richting niet meer', () => {
    const met = sanitizeCurriculum({ ...v2Ruw(), doelgroep: DG }) as Curriculum;
    const kopie = maakEigenKopie(met).doelgroep;
    const { kader: _k, volgtKader: _v, ...zonder } = DG;
    void _k; void _v;
    expect(kopie).toStrictEqual(zonder);
    expect(kopie).not.toHaveProperty('kader');
    expect(kopie).not.toHaveProperty('volgtKader');
    expect(met.doelgroep).toStrictEqual(DG);
  });

  it('kaderVolledig reist mee met kader (bewaren, export en import) en valt samen met kader weg in een eigen kopie', () => {
    const MET_BEIDE = { ...DG, kaderVolledig: 'c'.repeat(64) };
    const met = sanitizeCurriculum({ ...v2Ruw(), doelgroep: MET_BEIDE }) as Curriculum;
    expect(met.doelgroep).toStrictEqual(MET_BEIDE);
    // Export en import (het leerplanbestand) houden beide afdrukken, en saneren blijft idempotent.
    expect(importCurriculumJson(exportCurriculumJson(met))?.doelgroep).toStrictEqual(MET_BEIDE);
    expect(sanitizeCurriculum(JSON.parse(JSON.stringify(met)))).toStrictEqual(met);
    saveCurriculum(met);
    expect(getCurriculum(met.id)?.doelgroep).toStrictEqual(MET_BEIDE);
    // Een eigen kopie: geen enkele afdruk meer, ook niet na bewaren, export en import.
    const kopie = maakEigenKopie(met);
    expect(kopie.doelgroep).toStrictEqual({ groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so' });
    expect(kopie.doelgroep).not.toHaveProperty('kaderVolledig');
    expect(importCurriculumJson(exportCurriculumJson(kopie))?.doelgroep).not.toHaveProperty('kaderVolledig');
    // Zonder (geldig) kader zegt kaderVolledig niets: het saneren laat het vallen.
    const zonderKader = sanitizeCurriculum({ ...v2Ruw(), doelgroep: { ...MET_BEIDE, kader: undefined } }) as Curriculum;
    expect(zonderKader.doelgroep).not.toHaveProperty('kader');
    expect(zonderKader.doelgroep).not.toHaveProperty('kaderVolledig');
  });

  describe('setAfdrukken (fase 2, § 22.3.3)', () => {
    const AFDRUKKEN = { ODS_12: '0123456789abcdef', ODS_3287: 'fedcba9876543210' };
    const MET_ALLE = { ...DG, kaderVolledig: 'c'.repeat(64), setAfdrukken: AFDRUKKEN };

    it('reist mee bij bewaren, export (versie 2) en import; "nagekeken" en de vingerafdruk blijven', () => {
      const nagekeken = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
      const vingerafdruk = nagekeken.controle!.doelenSha256;
      const met: Curriculum = { ...nagekeken, doelgroep: MET_ALLE as Curriculum['doelgroep'] };
      // Het veld telt niet mee in de vingerafdruk van de doelen.
      expect(bewaakControle(met)).toBe(met);
      expect(doelenVingerafdruk(met.goals)).toBe(vingerafdruk);
      expect(bevestig(sanitizeCurriculum({ ...v2Ruw(), doelgroep: MET_ALLE }) as Curriculum, { door: 'An' }).controle!.doelenSha256).toBe(vingerafdruk);
      // Export en import.
      const terug = importCurriculumJson(exportCurriculumJson(met));
      expect(terug?.controle?.status).toBe('gecontroleerd');
      expect(terug?.controle?.doelenSha256).toBe(vingerafdruk);
      expect(terug?.doelgroep).toStrictEqual(MET_ALLE);
      expect(sanitizeCurriculum(JSON.parse(JSON.stringify(terug)))).toStrictEqual(terug);
      // Bewaren.
      saveCurriculum(met);
      expect(getCurriculum('lp-1')?.controle?.status).toBe('gecontroleerd');
      expect(getCurriculum('lp-1')?.doelgroep).toStrictEqual(MET_ALLE);
    });

    it('een eigen kopie verliest alle kadervelden, ook setAfdrukken (ook na export en import)', () => {
      const met = sanitizeCurriculum({ ...v2Ruw(), doelgroep: MET_ALLE }) as Curriculum;
      expect(met.doelgroep).toStrictEqual(MET_ALLE);
      const kopie = maakEigenKopie(met);
      expect(kopie.doelgroep).toStrictEqual({ groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so' });
      for (const veld of ['kader', 'kaderVolledig', 'setAfdrukken', 'volgtKader']) expect(Object.keys(kopie.doelgroep!), veld).not.toContain(veld);
      expect(importCurriculumJson(exportCurriculumJson(kopie))?.doelgroep).toStrictEqual(kopie.doelgroep);
      // Het origineel blijft ongemoeid.
      expect(met.doelgroep).toStrictEqual(MET_ALLE);
    });

    it('een geknoeide afdruk valt weg bij het importeren; zonder geldig kader valt het hele veld weg', () => {
      const geknoeid = { ...MET_ALLE, setAfdrukken: { ...AFDRUKKEN, ODS_99: 'GEEN-HEX', rommel: '0123456789abcdef' } };
      expect(sanitizeCurriculum({ ...v2Ruw(), doelgroep: geknoeid })?.doelgroep).toStrictEqual(MET_ALLE);
      const zonderKader = sanitizeCurriculum({ ...v2Ruw(), doelgroep: { ...MET_ALLE, kader: 'GEEN-HEX' } });
      expect(zonderKader?.doelgroep).not.toHaveProperty('setAfdrukken');
      expect(zonderKader?.doelgroep).not.toHaveProperty('kaderVolledig');
    });

    it('een leerplanbestand van vóór fase 2 (zonder setAfdrukken) komt ongewijzigd door de sanering', () => {
      const OUD = { ...DG, kaderVolledig: 'c'.repeat(64) };
      const oud = bevestig(sanitizeCurriculum({ ...v2Ruw(), doelgroep: OUD }) as Curriculum, { door: 'An' });
      const json = exportCurriculumJson(oud);
      expect(json).not.toContain('setAfdrukken');
      const terug = importCurriculumJson(json)!;
      expect(terug.doelgroep).toStrictEqual(OUD);
      expect(terug.controle?.status).toBe('gecontroleerd');
      // Byte voor byte hetzelfde bestand na importeren en opnieuw exporteren.
      expect(exportCurriculumJson(terug)).toBe(json);
      saveCurriculum(terug);
      expect(getCurriculum('lp-1')?.doelgroep).toStrictEqual(OUD);
    });
  });
});

describe('sanitizeCurriculum: versie 1 werkt zoals vroeger', () => {
  it('leest een exportbestand van versie 1 met dezelfde velden als voorheen', () => {
    const v1 = JSON.stringify({
      app: 'boosterz', kind: 'leerplan', v: 1,
      curriculum: {
        id: 'oud', title: 'Wiskunde', net: 'go', subject: 'Wiskunde', level: '1e graad', source: 'pro.g-o.be',
        goals: [
          { id: 'a', code: 'wis 9.9', text: 'Getallen   lezen', theme: 'Getallen', level: 'basis', note: 'Toelichting' },
          { id: 'b', code: '', text: 'Meten', theme: 'Meten' },
          { id: 'c', code: 'WIS 9.9', text: 'Dubbel' },
        ],
        createdAt: 1, updatedAt: 2,
      },
    });
    expect(importCurriculumJson(v1)).toStrictEqual({
      id: 'oud', title: 'Wiskunde', net: 'go', subject: 'Wiskunde', level: '1e graad', source: 'pro.g-o.be', example: undefined,
      goals: [
        { id: 'a', code: 'WIS 9.9', text: 'Getallen lezen', theme: 'Getallen', level: 'basis', note: 'Toelichting' },
        { id: 'b', code: 'WIS 1.1', text: 'Meten', theme: 'Meten', level: undefined, note: undefined },
      ],
      createdAt: 1, updatedAt: 2,
    });
  });

  it('blijft null geven bij rommel', () => {
    for (const rommel of ['', 'geen json', '{', 'null', '42', '[]', '{"goals":[]}', '{"curriculum":{"goals":[{"text":""}]}}']) {
      expect(importCurriculumJson(rommel), rommel).toBeNull();
    }
  });
});

describe('bewaakControle', () => {
  const basis = () => sanitizeCurriculum(v2Ruw()) as Curriculum;

  it('laat een kloppend nagekeken leerplan ongemoeid (hetzelfde object)', () => {
    const cur = bevestig(basis(), { door: 'An' });
    expect(bewaakControle(cur)).toBe(cur);
  });

  it('zet een gewijzigd doel op "gewijzigd" en bewaart naam, tijdstip en samenvatting', () => {
    const cur = bevestig(basis(), { door: 'An', op: 123, samenvatting: '2 van 2 doelen letterlijk' });
    const anders = { ...cur, goals: [{ ...cur.goals[0], refsBron: 'MD 09.03' }, cur.goals[1]] };
    const uit = bewaakControle(anders);
    expect(uit).not.toBe(anders);
    expect(uit.controle).toEqual({ ...cur.controle, status: 'gewijzigd' });
    expect(anders.controle?.status).toBe('gecontroleerd'); // het origineel blijft
  });

  it('zonder vingerafdruk is "gecontroleerd" niet te geloven', () => {
    const cur: Curriculum = { ...basis(), controle: { status: 'gecontroleerd', door: 'An' } };
    expect(bewaakControle(cur).controle?.status).toBe('gewijzigd');
    expect(sanitizeCurriculum(cur)?.controle?.status).toBe('gewijzigd');
  });

  it('raakt andere statussen niet aan', () => {
    for (const status of ['niet-gecontroleerd', 'gewijzigd'] as const) {
      const cur: Curriculum = { ...basis(), controle: { status } };
      expect(bewaakControle(cur)).toBe(cur);
    }
    const zonder = basis();
    delete zonder.controle;
    expect(bewaakControle(zonder)).toBe(zonder);
  });
});

describe('exporteren en importeren', () => {
  it('exporteert versie 2 met kop', () => {
    const json = JSON.parse(exportCurriculumJson(sanitizeCurriculum(v2Ruw()) as Curriculum));
    expect(json).toMatchObject({ app: 'boosterz', kind: 'leerplan', v: 2 });
    expect(json.curriculum.herkomst.leerplancode).toBe('I-Aar-a');
    expect(json.curriculum.goals[0].refs).toEqual([{ set: 'ODS_3287', id: '92187', code: '09.02' }]);
  });

  it('de vingerafdruk overleeft export en import: "gecontroleerd" blijft', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const terug = importCurriculumJson(exportCurriculumJson(cur));
    expect(terug?.controle?.status).toBe('gecontroleerd');
    expect(terug?.controle?.doelenSha256).toBe(doelenVingerafdruk(cur.goals));
    expect(terug?.controle?.door).toBe('An');
    // Inhoudelijk gelijk (JSON laat alleen de sleutels met `undefined` weg).
    expect(terug).toEqual(cur);
  });

  it('een doel met regeleinden (lijst) overleeft bevestigen → export → import als "gecontroleerd"', () => {
    const ruw = v2Ruw();
    ruw.goals = [...(ruw.goals as unknown[]), { id: 'g3', code: 'LPD 3', text: 'Inleiding:\n• een\n• twee', note: 'Eerste  alinea.\nTweede alinea.' }];
    const cur = bevestig(sanitizeCurriculum(ruw) as Curriculum, { door: 'An' });
    expect(cur.goals[2].text).toBe('Inleiding:\n• een\n• twee');
    const terug = importCurriculumJson(exportCurriculumJson(cur));
    expect(terug?.controle?.status).toBe('gecontroleerd');
    expect(terug?.goals[2].text).toBe('Inleiding:\n• een\n• twee');
    expect(terug?.goals[2].note).toBe('Eerste alinea.\nTweede alinea.');
    // Een regeleinde weghalen in het bestand is een wijziging.
    const plat = exportCurriculumJson(cur).replace('Inleiding:\\n• een\\n• twee', 'Inleiding: • een • twee');
    expect(importCurriculumJson(plat)?.controle?.status).toBe('gewijzigd');
  });

  it('één doeltekst aanpassen in het bestand geeft "gewijzigd" bij import', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const json = exportCurriculumJson(cur).replace('De leerlingen situeren landschappen.', 'De leerlingen situeren steden.');
    expect(json).toContain('steden');
    const terug = importCurriculumJson(json);
    expect(terug?.controle?.status).toBe('gewijzigd');
    expect(terug?.controle?.door).toBe('An');
  });

  it('ook een gewijzigde verwijzing of rubriek in het bestand geeft "gewijzigd"', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    expect(importCurriculumJson(exportCurriculumJson(cur).replace('"92187"', '"92188"'))?.controle?.status).toBe('gewijzigd');
    expect(importCurriculumJson(exportCurriculumJson(cur).replace('"Bodem"', '"Bodems"'))?.controle?.status).toBe('gewijzigd');
  });

  it('exporteert een intussen gewijzigd leerplan niet als nagekeken', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const anders = { ...cur, goals: cur.goals.slice(0, 1) };
    expect(JSON.parse(exportCurriculumJson(anders)).curriculum.controle.status).toBe('gewijzigd');
  });

  it('een eigen kopie is niet nagekeken en blijft dat na export en import', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const kopie = importCurriculumJson(exportCurriculumJson(maakEigenKopie(cur)));
    expect(kopie?.kind).toBe('eigen');
    expect(kopie).not.toHaveProperty('controle');
    expect(kopie?.herkomst?.methode).toBe('pdf');
  });
});

describe('sanitizeGoals: ids, lange codes en automatische codes', () => {
  it('een automatische code neemt nooit de code van een echt doel over', () => {
    const goals = sanitizeGoals(
      [{ text: 'Doel zonder code' }, { code: 'AAR 1.1', text: 'Echt doel AAR 1.1' }, { code: 'LPD 1', text: 'x' }, { code: 'lpd 1', text: 'y' }],
      { autoPrefix: 'Aar' },
    );
    expect(goals.map((g) => `${g.code}: ${g.text}`)).toEqual(['AAR 1.2: Doel zonder code', 'AAR 1.1: Echt doel AAR 1.1', 'LPD 1: x']);
  });

  it('slaat ook later toegekende automatische codes over en blijft idempotent', () => {
    const ruw = [{ text: 'a' }, { text: 'b' }, { code: 'DOEL 1.2', text: 'c' }, { text: 'd' }];
    const een = sanitizeGoals(ruw);
    expect(een.map((g) => g.code)).toEqual(['DOEL 1.1', 'DOEL 1.3', 'DOEL 1.2', 'DOEL 1.4']);
    expect(sanitizeGoals(een)).toStrictEqual(een);
  });

  it('geeft een tweede doel met hetzelfde id een nieuw id', () => {
    const goals = sanitizeGoals([{ id: 'z', code: '1', text: 'a' }, { id: 'z', code: '2', text: 'b' }, { id: 'y', code: '3', text: 'c' }]);
    expect(goals[0].id).toBe('z');
    expect(goals[1].id).not.toBe('z');
    expect(goals[1].id.length).toBeGreaterThan(0);
    expect(goals[2].id).toBe('y');
    expect(sanitizeGoals(goals)).toStrictEqual(goals);
  });

  it('kort een code in tot 60 tekens, ook voor automatische codes met een lang voorvoegsel', () => {
    const lang = `LPD ${'1'.repeat(100)}`;
    const [g] = sanitizeGoals([{ code: lang, text: 'a' }]);
    expect(g.code).toBe(lang.slice(0, 60));
    expect(sanitizeGoal({ code: `  ${lang}  `, text: 'a' })?.code).toHaveLength(60);
    const auto = sanitizeGoals([{ text: 'a' }], { autoPrefix: 'x'.repeat(200) });
    expect(auto[0].code.length).toBeLessThanOrEqual(60);
    expect(auto[0].code.endsWith(' 1.1')).toBe(true);
  });
});

describe('importCurriculumJsonMetRapport', () => {
  it('meldt hoeveel doelen bij het saneren wegvielen', () => {
    const json = JSON.stringify({
      app: 'boosterz', kind: 'leerplan', v: 2,
      curriculum: { title: 't', subject: 'Aardrijkskunde', goals: [{ code: 'LPD 1', text: 'a' }, { code: 'LPD 1', text: 'b' }, { text: '' }, 'rommel', { code: 'LPD 2', text: 'c' }] },
    });
    const { curriculum, weggevallen } = importCurriculumJsonMetRapport(json);
    expect(curriculum?.goals.map((g) => g.code)).toEqual(['LPD 1', 'LPD 2']);
    expect(weggevallen).toBe(3);
    expect(importCurriculumJson(json)?.goals).toHaveLength(2);
  });

  it('geeft null en het aantal als er niets overblijft, en 0 bij rommel', () => {
    expect(importCurriculumJsonMetRapport('{"goals":[{"text":""},{"text":" "}]}')).toEqual({ curriculum: null, weggevallen: 2, afgekapt: 0 });
    expect(importCurriculumJsonMetRapport('geen json')).toEqual({ curriculum: null, weggevallen: 0, afgekapt: 0 });
    expect(importCurriculumJsonMetRapport(exportCurriculumJson(sanitizeCurriculum(v2Ruw()) as Curriculum)).weggevallen).toBe(0);
  });
});

describe('bevestigLeerplan', () => {
  /** Een ongesaneerd leerplan met een echte bron, en het rapport van de poort op de gesaneerde vorm. */
  function metBron() {
    const cur: Curriculum = {
      id: 'lp', title: 't', net: 'kov', subject: 'Aardrijkskunde', level: '', createdAt: 1, updatedAt: 1, kind: 'leerplan',
      herkomst: { methode: 'tekst', ingelezenOp: 1, leerplancode: 'X', bronSha256: HEX },
      goals: [{ id: 'a', code: 'lpd 1', text: 'De  leerlingen  kunnen A.', theme: ' Thema ' }],
    };
    const bron = 'LPD 1 De leerlingen kunnen A.';
    const rapport = controleerLeerplan(sanitizeCurriculum(cur) as Curriculum, { bronTekst: bron });
    return { cur, bron, rapport };
  }

  it('saneert zelf: een ongesaneerd leerplan blijft nagekeken na export en import', () => {
    const { cur, rapport } = metBron();
    expect(rapport.kanBevestigen).toBe(true);
    const b = bevestigLeerplan(cur, { door: 'Jan', rapport });
    expect(b.goals[0]).toMatchObject({ code: 'LPD 1', text: 'De leerlingen kunnen A.', theme: 'Thema' });
    expect(b.controle).toMatchObject({ status: 'gecontroleerd', door: 'Jan', doelenSha256: rapport.doelenSha256, samenvatting: rapport.samenvatting });
    const terug = importCurriculumJson(exportCurriculumJson(b));
    expect(terug?.controle?.status).toBe('gecontroleerd');
  });

  it('weigert een lege naam', () => {
    const { cur, rapport } = metBron();
    for (const door of ['', '   ', undefined as unknown as string]) {
      expect(() => bevestigLeerplan(cur, { door, rapport })).toThrow(/naam/);
    }
  });

  it('weigert een rapport met fouten of zonder rapport', () => {
    const { cur } = metBron();
    const fout = controleerLeerplan(sanitizeCurriculum(cur) as Curriculum, { bronTekst: 'Een andere bron.' });
    expect(fout.kanBevestigen).toBe(false);
    expect(() => bevestigLeerplan(cur, { door: 'Jan', rapport: fout })).toThrow(/nog niet als nagekeken/);
    expect(() => bevestigLeerplan(cur, { door: 'Jan' } as BevestigOpties)).toThrow(/nog niet als nagekeken/);
  });

  it('weigert als de poort op andere doelen liep (gewijzigd na het nakijken, of niet gesaneerd)', () => {
    const { cur, bron, rapport } = metBron();
    const anders = { ...cur, goals: [{ ...cur.goals[0], text: 'De leerlingen kunnen B.' }] };
    expect(() => bevestigLeerplan(anders, { door: 'Jan', rapport })).toThrow(/niet meer dezelfde/);
    // De poort liep op de ongesaneerde doelen ("lpd 1", dubbele spaties): de vingerafdruk past niet.
    const ongesaneerd = controleerLeerplan(cur, { bronTekst: bron });
    expect(() => bevestigLeerplan(cur, { door: 'Jan', rapport: { ...ongesaneerd, kanBevestigen: true } })).toThrow(/niet meer dezelfde/);
  });

  it('kort de naam in zoals bij saneren, zodat export en import niets veranderen', () => {
    const { cur, rapport } = metBron();
    const b = bevestigLeerplan(cur, { door: `  ${'a'.repeat(200)}  `, rapport, op: 7, samenvatting: '  eigen  ' });
    expect(b.controle).toMatchObject({ door: 'a'.repeat(120), op: 7, samenvatting: 'eigen' });
    expect(importCurriculumJson(exportCurriculumJson(b))?.controle).toEqual(b.controle);
  });
});

describe('saveCurriculum', () => {
  it('bewaart een nagekeken leerplan met kloppende vingerafdruk als nagekeken', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    expect(saveCurriculum(cur)).toBe(true);
    expect(getCurriculum(cur.id)?.controle?.status).toBe('gecontroleerd');
  });

  it('bewaart een nagekeken leerplan met gewijzigde doelen als "gewijzigd"', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    saveCurriculum({ ...cur, goals: cur.goals.map((g) => ({ ...g, text: `${g.text} Extra.` })) });
    const bewaard = getCurriculum(cur.id);
    expect(bewaard?.controle?.status).toBe('gewijzigd');
    expect(bewaard?.controle?.door).toBe('An');
  });
});

describe('doel-id: alleen letters, cijfers, "_" en "-", en geen naam uit het prototype (B7)', () => {
  it('herkent veilige en onveilige id\'s', () => {
    for (const id of ['a', 'goal-1', 'ID_2', 'x'.repeat(64), '3k9a1b2c4d5e']) expect(isVeiligDoelId(id), id).toBe(true);
    for (const id of ['', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'a b', 'a.b', 'a/b', 'é', 'x'.repeat(65), 5, null, undefined, {}]) {
      expect(isVeiligDoelId(id), String(id)).toBe(false);
    }
  });

  it('sanitizeGoal houdt een veilig id en geeft een onveilig een nieuw (veilig) id', () => {
    expect(sanitizeGoal({ id: 'goal-1', code: 'A', text: 'x' })?.id).toBe('goal-1');
    for (const id of ['constructor', '__proto__', 'toString', 'a b', 'x'.repeat(65), 12, undefined]) {
      const goal = sanitizeGoal({ id, code: 'A', text: 'x' });
      expect(goal && isVeiligDoelId(goal.id), String(id)).toBe(true);
      expect(goal?.id).not.toBe(id);
    }
  });

  it('is idempotent en geeft elk doel een eigen id, ook als meerdere hetzelfde onveilige id hadden', () => {
    const lijst = sanitizeGoals([
      { id: 'constructor', code: 'A', text: 'a' },
      { id: 'constructor', code: 'B', text: 'b' },
      { id: '__proto__', code: 'C', text: 'c' },
      { id: 'dubbel', code: 'D', text: 'd' },
      { id: 'dubbel', code: 'E', text: 'e' },
    ]);
    const ids = lijst.map((g) => g.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids.every(isVeiligDoelId)).toBe(true);
    expect(sanitizeGoals(lijst)).toEqual(lijst);
  });

  it('een geïmporteerd bestand met id "constructor" levert geen prototype-id op', () => {
    const json = JSON.stringify({ app: 'boosterz', kind: 'leerplan', v: 2, curriculum: { title: 't', goals: [{ id: 'constructor', code: 'LPD 1', text: 'a' }, { id: '__proto__', code: 'LPD 2', text: 'b' }] } });
    const cur = importCurriculumJson(json);
    expect(cur?.goals.every((g) => isVeiligDoelId(g.id))).toBe(true);
    const opId: Record<string, string> = {};
    for (const g of cur?.goals ?? []) opId[g.id] = g.code;
    expect(Object.keys(opId)).toHaveLength(2);
    expect(Object.getPrototypeOf(opId)).toBe(Object.prototype);
  });
});

describe('grenzen aan wat een bestand mag bevatten (B4)', () => {
  it('kort een te lange tekst, rubriek en toelichting in', () => {
    const goal = sanitizeGoal({ code: 'A', text: 'x'.repeat(MAX_DOELTEKST + 50), theme: 't'.repeat(MAX_DOELTHEMA + 5), note: 'n'.repeat(MAX_DOELTOELICHTING + 5) });
    expect(goal?.text).toHaveLength(MAX_DOELTEKST);
    expect(goal?.theme).toHaveLength(MAX_DOELTHEMA);
    expect(goal?.note).toHaveLength(MAX_DOELTOELICHTING);
  });

  it('laat de grootste officiële tekst (3.794 tekens) ongemoeid', () => {
    const tekst = 'De leerlingen beschrijven '.repeat(146).slice(0, 3794);
    expect(sanitizeGoal({ code: 'A', text: tekst })?.text).toBe(tekst.trim());
  });

  it('knipt geen tekenpaar (emoji) doormidden en blijft idempotent', () => {
    const goal = sanitizeGoal({ code: 'A', text: `${'x'.repeat(MAX_DOELTEKST - 1)}😀 en meer` });
    expect(goal?.text).toBe('x'.repeat(MAX_DOELTEKST - 1));
    expect(sanitizeGoal(goal)?.text).toBe(goal?.text);
  });

  it('houdt hoogstens 5.000 doelen over; de rest telt mee als weggevallen', () => {
    expect(MAX_DOELEN).toBe(5000);
    const veel = Array.from({ length: MAX_DOELEN + 3 }, (_, i) => ({ code: `D ${i + 1}`, text: `Doel ${i + 1}.` }));
    expect(sanitizeGoals(veel)).toHaveLength(MAX_DOELEN);
    const r = importCurriculumJsonMetRapport(JSON.stringify({ title: 't', goals: veel }));
    expect(r.curriculum?.goals).toHaveLength(MAX_DOELEN);
    expect(r.weggevallen).toBe(3);
  });

  it('meldt hoeveel doelen een ingekorte tekst kregen', () => {
    const json = JSON.stringify({
      title: 't',
      goals: [
        { code: 'A', text: 'x'.repeat(MAX_DOELTEKST + 1) },
        { code: 'B', text: 'kort', note: 'n'.repeat(MAX_DOELTOELICHTING + 1) },
        { code: 'C', text: 'kort' },
      ],
    });
    const r = importCurriculumJsonMetRapport(json);
    expect(r).toMatchObject({ weggevallen: 0, afgekapt: 2 });
    // Opnieuw saneren verandert niets meer: er valt niets meer in te korten.
    const nog = importCurriculumJsonMetRapport(exportCurriculumJson(r.curriculum as Curriculum));
    expect(nog.afgekapt).toBe(0);
    expect(nog.curriculum?.goals.map((g) => g.text.length)).toEqual(r.curriculum?.goals.map((g) => g.text.length));
  });
});

// ── Fase 3: beroepskwalificaties in het datamodel (K5, docs/STUDIERICHTINGEN.md § 23.6.2 en § 23.6.3) ──

const MERK_A = '0123456789abcdef';
const MERK_B = 'fedcba9876543210';

/** Een nagemaakt BK-leerplan: verzonnen competentieteksten en -codes, geen echte gegevens uit de API. */
function bkRuw(): Record<string, unknown> {
  return {
    id: 'bk-1',
    title: 'Onthaalmedewerker (nagemaakt)',
    net: 'beroepskwalificaties',
    subject: 'Onthaal',
    level: '3de graad',
    source: 'Vlaamse kwalificatiestructuur: Onthaalmedewerker (BK-0390-2)',
    kind: 'leerplan',
    herkomst: { methode: 'beroepskwalificatie', bronUrl: 'https://onderwijs-api-portaal.vlaanderen.be/', ingelezenOp: 1_760_000_000_000 },
    bkVersies: [{ bk: 'BK-0390-2', sha: MERK_A, alle: true }, { bk: 'BK-0464-1', sha: MERK_B }],
    goals: [
      { id: 'c1', code: 'BK-0390-2.01', text: 'Nagemaakte competentie één.', theme: 'Onthaalmedewerker › Vakspecifieke competentie', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000001' }] },
      { id: 'c2', code: 'BK-0390-2.02', text: 'Nagemaakte competentie twee.', theme: 'Onthaalmedewerker › Vakspecifieke competentie', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000002' }] },
      { id: 'c3', code: 'BK-0464-1.01', text: 'Nagemaakte competentie drie.', theme: 'Recreatief medewerker', bkRefs: [{ bk: 'BK-0464-1', id: 'bkc0000003' }] },
    ],
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

/** Het BK-leerplan met één doel en de gegeven `bkRefs` (rauw), gesaneerd: de `bkRefs` van dat doel. */
function bkRefsNa(bkRefs: unknown): CurriculumGoal['bkRefs'] {
  const ruw = { ...bkRuw(), goals: [{ code: 'BK-0390-2.01', text: 'x', bkRefs }] };
  return sanitizeCurriculum(ruw)?.goals[0].bkRefs;
}

/** De gesaneerde `bkVersies` van het BK-leerplan met de gegeven (rauwe) lijst. */
function bkVersiesNa(bkVersies: unknown): Curriculum['bkVersies'] {
  return sanitizeCurriculum({ ...bkRuw(), bkVersies })?.bkVersies;
}

describe('CURRICULUM_NETS en NET_KEUZES (fase 3)', () => {
  it('het net "beroepskwalificaties" staat na de minimumdoelen; de andere netten zijn ongewijzigd', () => {
    expect(CURRICULUM_NETS).toEqual([
      { id: 'minimumdoelen', label: 'Minimumdoelen (Vlaamse overheid)', hint: 'onderwijsdoelen.be — de wettelijke basis voor elk net' },
      { id: 'beroepskwalificaties', label: 'Beroepskwalificaties (Vlaamse overheid)', hint: 'Vlaamse kwalificatiestructuur' },
      { id: 'go', label: 'GO! leerplan', hint: 'pro.g-o.be' },
      { id: 'kov', label: 'Katholiek Onderwijs Vlaanderen', hint: 'leerplannen KOV / ZILL (basis)' },
      { id: 'ovsg', label: 'OVSG (stedelijk & gemeentelijk)', hint: 'ovsg.be' },
      { id: 'pov', label: 'POV (provinciaal)', hint: 'pov.be' },
      { id: 'eigen', label: 'Eigen leerplan', hint: 'vakgroep, school of jezelf' },
    ]);
    expect(netLabel('beroepskwalificaties')).toBe('Beroepskwalificaties (Vlaamse overheid)');
    expect(netLabel('onbekend')).toBe('Eigen leerplan');
  });

  it('de inleeswizard biedt geen minimumdoelen en geen beroepskwalificaties aan: zijn netten blijven dezelfde', () => {
    expect(NET_KEUZES.map((n) => n.id)).toEqual(['go', 'kov', 'ovsg', 'pov', 'eigen']);
  });

  it('een bestand met net "beroepskwalificaties" houdt dat net', () => {
    expect(sanitizeCurriculum(bkRuw())?.net).toBe('beroepskwalificaties');
    expect(sanitizeCurriculum({ ...v2Ruw(), net: 'beroepskwalificaties' })?.net).toBe('beroepskwalificaties');
  });
});

describe('BK_VERSIE_ID en BK_COMPETENTIE_ID: gelijk aan de bron', () => {
  /** De regex van `export const <naam> = /…/;` in een bronbestand, als tekst. */
  function regexUit(pad: URL, naam: string): string | undefined {
    const m = new RegExp(`export const ${naam} = /(.+)/([a-z]*);`).exec(readFileSync(pad, 'utf8'));
    return m ? `${m[1]}|${m[2]}` : undefined;
  }
  const ONTWERP = new URL('../../docs/STUDIERICHTINGEN.md', import.meta.url);
  const MODULE = new URL('./beroepskwalificaties.ts', import.meta.url);

  it('gelijk aan BK_VERSIE en COMPETENTIE_CODE in het ontwerp (§ 23.5.3)', () => {
    expect(regexUit(ONTWERP, 'BK_VERSIE')).toBe(`${BK_VERSIE_ID.source}|${BK_VERSIE_ID.flags}`);
    expect(regexUit(ONTWERP, 'COMPETENTIE_CODE')).toBe(`${BK_COMPETENTIE_ID.source}|${BK_COMPETENTIE_ID.flags}`);
    expect(readFileSync(ONTWERP, 'utf8')).toContain(`export const MAX_BK_PER_LEERPLAN = ${MAX_BK_VERSIES};`);
  });

  // beroepskwalificaties.ts komt met pakket K1; tot dan staat deze test op "overgeslagen".
  it.skipIf(!existsSync(MODULE))('gelijk aan BK_VERSIE en COMPETENTIE_CODE in beroepskwalificaties.ts', () => {
    expect(regexUit(MODULE, 'BK_VERSIE')).toBe(`${BK_VERSIE_ID.source}|${BK_VERSIE_ID.flags}`);
    expect(regexUit(MODULE, 'COMPETENTIE_CODE')).toBe(`${BK_COMPETENTIE_ID.source}|${BK_COMPETENTIE_ID.flags}`);
  });

  it('herkent een BK-versie, en geen nummer zonder versie, geen deelkwalificatie en geen ander formaat', () => {
    for (const bk of ['BK-0390-2', 'BK-123-1', 'BK-123456-1234', 'BK-0454-1']) expect(BK_VERSIE_ID.test(bk), bk).toBe(true);
    for (const bk of ['BK-0390', 'BK-12-1', 'BK-1234567-1', 'BK-0390-12345', 'BK-0390-', 'bk-0390-2', ' BK-0390-2', 'BK-0390-2\n', 'BK-0130-5-DBK-01', 'ODS_3287', 'BK-0390-2.01', '']) {
      expect(BK_VERSIE_ID.test(bk), JSON.stringify(bk)).toBe(false);
    }
  });
});

describe('sanitizeCurriculum: bkRefs en bkVersies (fase 3)', () => {
  it('een BK-leerplan houdt bkRefs ({bk, id}) op elk doel en bkVersies ({bk, sha, alle?})', () => {
    const cur = sanitizeCurriculum(bkRuw()) as Curriculum;
    expect(cur.herkomst?.methode).toBe('beroepskwalificatie');
    expect(cur.goals.map((g) => g.bkRefs)).toEqual([
      [{ bk: 'BK-0390-2', id: 'bkc0000001' }],
      [{ bk: 'BK-0390-2', id: 'bkc0000002' }],
      [{ bk: 'BK-0464-1', id: 'bkc0000003' }],
    ]);
    expect(cur.bkVersies).toStrictEqual([{ bk: 'BK-0390-2', sha: MERK_A, alle: true }, { bk: 'BK-0464-1', sha: MERK_B }]);
    expect(cur.goals.every((g) => !('refs' in g))).toBe(true);
  });

  it('bkRefs: getrimd, een getal als id wordt tekst, andere velden vallen weg', () => {
    const refs = bkRefsNa([
      { bk: ' BK-0390-2 ', id: ' bkc0000001 ', code: 'valt weg', tekst: 'valt weg' },
      { bk: 'BK-0390-2', id: 39200 },
      { bk: 'BK-0390-2', id: 'a.b_c-1' },
    ]);
    expect(refs).toStrictEqual([{ bk: 'BK-0390-2', id: 'bkc0000001' }, { bk: 'BK-0390-2', id: '39200' }, { bk: 'BK-0390-2', id: 'a.b_c-1' }]);
    for (const r of refs ?? []) expect(Object.keys(r)).toEqual(['bk', 'id']);
  });

  it('bkRefs: ongeldige vormen en te lange waarden vallen weg', () => {
    const geldig = [{ bk: 'BK-0390-2', id: 'x'.repeat(64) }, { bk: 'BK-123456-1234', id: 'bkc1' }];
    const refs = bkRefsNa([
      null, undefined, 'BK-0390-2', 7, true, [], ['BK-0390-2', 'bkc1'], {},
      { bk: 'BK-0390', id: 'bkc1' }, { bk: 'bk-0390-2', id: 'bkc1' }, { bk: 'BK-12-1', id: 'bkc1' }, { bk: 'BK-1234567-1', id: 'bkc1' },
      { bk: 'BK-0390-12345', id: 'bkc1' }, { bk: 'BK-0130-5-DBK-01', id: 'bkc1' }, { bk: 'ODS_3287', id: 'bkc1' }, { bk: 390, id: 'bkc1' },
      { bk: 'BK-0390-2' }, { bk: 'BK-0390-2', id: '' }, { bk: 'BK-0390-2', id: '   ' }, { bk: 'BK-0390-2', id: 'x'.repeat(65) },
      { bk: 'BK-0390-2', id: 'a b' }, { bk: 'BK-0390-2', id: 'a/b' }, { bk: 'BK-0390-2', id: 'bkc°1' }, { bk: 'BK-0390-2', id: 'é' },
      { bk: 'BK-0390-2', id: Infinity }, { bk: 'BK-0390-2', id: Number.NaN }, { bk: 'BK-0390-2', id: null }, { bk: 'BK-0390-2', id: true },
      { bk: 'BK-0390-2', id: { waarde: 'bkc1' } }, { bk: 'BK-0390-2', id: ['bkc1'] }, { set: 'ODS_3287', id: '92187', code: '09.02' },
      ...geldig,
    ]);
    expect(refs).toStrictEqual(geldig);
  });

  it('bkRefs: geen lijst, of niets bruikbaars, laat geen sleutel achter', () => {
    for (const bkRefs of [undefined, null, 'BK-0390-2', { bk: 'BK-0390-2', id: 'bkc1' }, [], [null, { bk: 'x' }]]) {
      const cur = sanitizeCurriculum({ ...bkRuw(), goals: [{ code: 'A', text: 'x', bkRefs }] });
      expect(cur?.goals[0], JSON.stringify(bkRefs)).not.toHaveProperty('bkRefs');
    }
  });

  it('__proto__: een naam uit het prototype als id valt weg, en niets komt uit het prototype', () => {
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(bkRefsNa([{ bk: 'BK-0390-2', id }]), id).toBeUndefined();
    }
    // Een object met "__proto__" als eigen sleutel (zo leest JSON.parse een bestand): niets van wat eronder staat telt.
    const ruw = JSON.parse(`{
      "title": "t", "herkomst": {"methode": "beroepskwalificatie", "ingelezenOp": 1},
      "__proto__": {"bkVersies": [{"bk": "BK-0390-2", "sha": "${MERK_A}"}]},
      "goals": [
        {"code": "A", "text": "a", "bkRefs": [{"__proto__": {"bk": "BK-0390-2", "id": "bkc1"}}]},
        {"code": "B", "text": "b", "__proto__": {"bkRefs": [{"bk": "BK-0390-2", "id": "bkc2"}]}},
        {"code": "C", "text": "c", "bkRefs": [{"bk": "BK-0390-2", "id": "bkc3", "__proto__": {"x": 1}}]}
      ]
    }`) as Record<string, unknown>;
    const cur = sanitizeCurriculum(ruw) as Curriculum;
    expect(cur).not.toHaveProperty('bkVersies');
    expect(cur.goals[0]).not.toHaveProperty('bkRefs');
    expect(cur.goals[1]).not.toHaveProperty('bkRefs');
    expect(cur.goals[2].bkRefs).toStrictEqual([{ bk: 'BK-0390-2', id: 'bkc3' }]);
    expect(Object.getPrototypeOf(cur.goals[2].bkRefs?.[0])).toBe(Object.prototype);
    // Overgeërfde velden (een object met een ander prototype) tellen evenmin.
    const geerfd = Object.create({ bk: 'BK-0390-2', id: 'bkc4' }) as object;
    expect(bkRefsNa([geerfd])).toBeUndefined();
    expect(bkVersiesNa([Object.create({ bk: 'BK-0390-2', sha: MERK_A }) as object])).toBeUndefined();
    // En het gedeelde prototype blijft schoon.
    expect(({} as Record<string, unknown>).bk).toBeUndefined();
    expect(({} as Record<string, unknown>).bkRefs).toBeUndefined();
  });

  it(`bkRefs: ontdubbeld op bk + id, hoogstens ${MAX_BK_REFS}`, () => {
    expect(MAX_BK_REFS).toBe(10);
    const dubbel = bkRefsNa([
      { bk: 'BK-0390-2', id: 'bkc1' }, { bk: ' BK-0390-2', id: 'bkc1 ' }, { bk: 'BK-0464-1', id: 'bkc1' }, { bk: 'BK-0390-3', id: 'bkc1' },
    ]);
    expect(dubbel).toStrictEqual([{ bk: 'BK-0390-2', id: 'bkc1' }, { bk: 'BK-0464-1', id: 'bkc1' }, { bk: 'BK-0390-3', id: 'bkc1' }]);
    const veel = Array.from({ length: 15 }, (_, i) => ({ bk: 'BK-0390-2', id: `bkc${i}` }));
    expect(bkRefsNa(veel)).toStrictEqual(veel.slice(0, MAX_BK_REFS));
    // Ongeldige elementen tellen niet mee voor de grens.
    expect(bkRefsNa([...Array.from({ length: 12 }, () => null), ...veel.slice(0, 3)])).toStrictEqual(veel.slice(0, 3));
  });

  it(`bkVersies: sha van 16 kleine hex-tekens, alle alleen true, ontdubbeld op bk, hoogstens ${MAX_BK_VERSIES}`, () => {
    expect(MAX_BK_VERSIES).toBe(20);
    expect(bkVersiesNa([
      null, 'BK-0390-2', [], {}, { bk: 'BK-0390-2' },
      { bk: 'BK-0390-2', sha: MERK_A.toUpperCase() }, { bk: 'BK-0390-2', sha: MERK_A.slice(1) }, { bk: 'BK-0390-2', sha: `${MERK_A}0` },
      { bk: 'BK-0390-2', sha: 'g'.repeat(16) }, { bk: 'BK-0390-2', sha: ` ${MERK_A}` }, { bk: 'BK-0390-2', sha: 123456789 }, { bk: 'BK-0390-2', sha: 'a'.repeat(64) },
      { bk: 'BK-0390', sha: MERK_A }, { bk: 'BK-0130-5-DBK-01', sha: MERK_A }, { bk: '__proto__', sha: MERK_A },
      { bk: ' BK-0390-2 ', sha: MERK_A, alle: 'true', extra: 'valt weg' },
      { bk: 'BK-0390-2', sha: MERK_B, alle: true }, // dezelfde BK-versie: alleen de eerste telt
      { bk: 'BK-0464-1', sha: MERK_B, alle: true },
      { bk: 'BK-0465-1', sha: MERK_A, alle: false }, { bk: 'BK-0466-1', sha: MERK_A, alle: 1 },
    ])).toStrictEqual([
      { bk: 'BK-0390-2', sha: MERK_A },
      { bk: 'BK-0464-1', sha: MERK_B, alle: true },
      { bk: 'BK-0465-1', sha: MERK_A },
      { bk: 'BK-0466-1', sha: MERK_A },
    ]);
    const veel = Array.from({ length: 25 }, (_, i) => ({ bk: `BK-0${100 + i}-1`, sha: MERK_A }));
    expect(bkVersiesNa(veel)).toStrictEqual(veel.slice(0, MAX_BK_VERSIES));
    for (const leeg of [undefined, null, 'BK-0390-2', { bk: 'BK-0390-2', sha: MERK_A }, [], [null]]) {
      expect(sanitizeCurriculum({ ...bkRuw(), bkVersies: leeg }), JSON.stringify(leeg)).not.toHaveProperty('bkVersies');
    }
  });

  it('alleen bij methode "beroepskwalificatie": op elk ander leerplan vallen bkRefs en bkVersies weg', () => {
    const anders: CurriculumMethode[] = ['officieel', 'samengesteld', 'export', 'pdf', 'tekst', 'ai', 'handmatig'];
    const herkomsten: unknown[] = [...anders.map((methode) => ({ methode, ingelezenOp: 1 })), undefined, null, 'beroepskwalificatie', { methode: 'gegokt' }, { methode: 'Beroepskwalificatie' }];
    for (const herkomst of herkomsten) {
      for (const kind of ['leerplan', 'eigen', undefined]) {
        const cur = sanitizeCurriculum({ ...bkRuw(), herkomst, kind }) as Curriculum;
        const wat = `${JSON.stringify(herkomst)} ${kind}`;
        expect(cur.goals, wat).toHaveLength(3);
        expect(cur.goals.some((g) => 'bkRefs' in g), wat).toBe(false);
        expect(cur, wat).not.toHaveProperty('bkVersies');
      }
    }
    // De methode beslist, niet het net of de soort: ook een eigen kopie, of een ander net, met die methode houdt ze.
    for (const extra of [{ kind: 'eigen' }, { net: 'kov' }, { net: 'eigen', kind: undefined }]) {
      const cur = sanitizeCurriculum({ ...bkRuw(), ...extra }) as Curriculum;
      expect(cur.goals.every((g) => g.bkRefs?.length === 1), JSON.stringify(extra)).toBe(true);
      expect(cur.bkVersies, JSON.stringify(extra)).toHaveLength(2);
    }
  });

  it('sanitizeGoal en sanitizeGoals (AI, inlezen) laten bkRefs altijd weg', () => {
    const doel = { code: 'A', text: 'x', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc1' }] };
    expect(sanitizeGoal(doel)).not.toHaveProperty('bkRefs');
    expect(sanitizeGoals([doel, { ...doel, code: 'B' }]).some((g) => 'bkRefs' in g)).toBe(false);
  });

  it('is idempotent, ook na JSON', () => {
    const een = sanitizeCurriculum(bkRuw()) as Curriculum;
    expect(sanitizeCurriculum(een)).toStrictEqual(een);
    expect(sanitizeCurriculum(JSON.parse(JSON.stringify(een)))).toStrictEqual(een);
    const rommelig = sanitizeCurriculum({ ...bkRuw(), bkVersies: [{ bk: ' BK-0390-2', sha: MERK_A, alle: 'ja' }, { bk: 'BK-0390-2', sha: MERK_B }] }) as Curriculum;
    expect(sanitizeCurriculum(rommelig)).toStrictEqual(rommelig);
  });
});

describe('doelenVingerafdruk met bkRefs (fase 3)', () => {
  it('zonder bkRefs, of met een lege lijst, is de JSON byte voor byte die van vóór fase 3', () => {
    const doel: CurriculumGoal = { id: 'a', code: 'LPD 1', text: 'Tekst.', theme: 'T', refs: [{ set: 'ODS_1', id: '7', code: '01.01' }], refsBron: 'MD 1' };
    const vroeger = sha256Hex(JSON.stringify([{ code: 'LPD 1', text: 'Tekst.', theme: 'T', refs: [{ set: 'ODS_1', id: '7', code: '01.01' }], refsBron: 'MD 1' }]));
    expect(doelenVingerafdruk([doel])).toBe(vroeger);
    expect(doelenVingerafdruk([{ ...doel, bkRefs: [] }])).toBe(vroeger);
    expect(doelenVingerafdruk([{ ...doel, bkRefs: undefined }])).toBe(vroeger);
  });

  it('het formaat staat vast: bkRefs na refsBron, als {bk, id}; andere velden tellen niet', () => {
    const doel: CurriculumGoal = { id: 'a', code: 'BK-0390-2.01', text: 't', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc1' }] };
    expect(doelenVingerafdruk([doel])).toBe(sha256Hex('[{"code":"BK-0390-2.01","text":"t","bkRefs":[{"bk":"BK-0390-2","id":"bkc1"}]}]'));
    const refMetExtra = { bk: 'BK-0390-2', id: 'bkc1', titel: 'telt niet' };
    const metExtra: CurriculumGoal = { ...doel, bkRefs: [refMetExtra] };
    expect(doelenVingerafdruk([metExtra])).toBe(doelenVingerafdruk([doel]));

    // De plaats van bkRefs tussen de andere velden ligt ook vast. De sleutels staan hier bewust in een andere volgorde
    // dan in de JSON: de functie legt de volgorde op, niet het doel. De waarden zijn met node:crypto apart berekend.
    const vol: CurriculumGoal = {
      bkRefs: [{ id: 'bkc1', bk: 'BK-0390-2' }, { id: 'bkc2', bk: 'BK-0464-1' }],
      refsBron: 'MD 1',
      refs: [{ code: '01.01', id: '7', set: 'ODS_1' }],
      note: 'Toelichting.',
      level: 'uitbreiding',
      theme: 'Onthaalmedewerker › Vakspecifieke competentie',
      text: 't',
      code: 'BK-0390-2.01',
      id: 'a',
    };
    const volJson =
      '[{"code":"BK-0390-2.01","text":"t","theme":"Onthaalmedewerker › Vakspecifieke competentie","level":"uitbreiding",' +
      '"note":"Toelichting.","refs":[{"set":"ODS_1","id":"7","code":"01.01"}],"refsBron":"MD 1",' +
      '"bkRefs":[{"bk":"BK-0390-2","id":"bkc1"},{"bk":"BK-0464-1","id":"bkc2"}]}]';
    expect(sha256Hex(volJson)).toBe('24e959999d585e46c5423b7e282d8640664c00fe4b340412b4b47d3540c76b0d');
    expect(doelenVingerafdruk([vol])).toBe(sha256Hex(volJson));

    // De vorm van een echt BK-doel (§ 23.6.4): altijd een rubriek, en bkRefs erna.
    const metThema: CurriculumGoal = { bkRefs: [{ id: 'bkc1', bk: 'BK-0390-2' }], theme: 'Onthaalmedewerker › Vakspecifieke competentie', text: 't', code: 'BK-0390-2.01', id: 'a' };
    const themaJson = '[{"code":"BK-0390-2.01","text":"t","theme":"Onthaalmedewerker › Vakspecifieke competentie","bkRefs":[{"bk":"BK-0390-2","id":"bkc1"}]}]';
    expect(sha256Hex(themaJson)).toBe('425985ab03c32eb7937f8dddf314d7a9a1198f3cd6fefe23d315d81ae175c7f1');
    expect(doelenVingerafdruk([metThema])).toBe(sha256Hex(themaJson));
  });

  it('gouden vingerafdruk van een volledig BK-leerplan: verandert nooit, ook niet na bewaren, nakijken of exporteren', () => {
    // Het nagemaakte BK-leerplan van bkRuw(), na saneren. De waarde is met node:crypto apart berekend uit deze JSON.
    const bkJson =
      '[{"code":"BK-0390-2.01","text":"Nagemaakte competentie één.","theme":"Onthaalmedewerker › Vakspecifieke competentie",' +
      '"bkRefs":[{"bk":"BK-0390-2","id":"bkc0000001"}]},' +
      '{"code":"BK-0390-2.02","text":"Nagemaakte competentie twee.","theme":"Onthaalmedewerker › Vakspecifieke competentie",' +
      '"bkRefs":[{"bk":"BK-0390-2","id":"bkc0000002"}]},' +
      '{"code":"BK-0464-1.01","text":"Nagemaakte competentie drie.","theme":"Recreatief medewerker",' +
      '"bkRefs":[{"bk":"BK-0464-1","id":"bkc0000003"}]}]';
    const GOUD_BK = '0c39c54ff5438c9ee64136dc5b08771b229a443bf4b00f4bca5d5f3b8cebe930';
    expect(sha256Hex(bkJson)).toBe(GOUD_BK);
    const cur = sanitizeCurriculum(bkRuw()) as Curriculum;
    expect(doelenVingerafdruk(cur.goals)).toBe(GOUD_BK);
    const nagekeken = bevestig(cur, { door: 'Boosterz (officiële bron)', op: 9 });
    expect(nagekeken.controle?.doelenSha256).toBe(GOUD_BK);
    const terug = importCurriculumJson(exportCurriculumJson(nagekeken)) as Curriculum;
    expect(doelenVingerafdruk(terug.goals)).toBe(GOUD_BK);
    expect(effectieveStatus(terug)).toBe('gecontroleerd');
  });

  it('een andere BK-versie, een andere competentie, een extra verwijzing of een andere volgorde geeft een andere vingerafdruk', () => {
    const goals = (sanitizeCurriculum(bkRuw()) as Curriculum).goals;
    const basis = doelenVingerafdruk(goals);
    const met = (i: number, bkRefs: CurriculumGoal['bkRefs']) => goals.map((g, j) => (j === i ? { ...g, bkRefs } : g));
    const varianten = [
      met(0, [{ bk: 'BK-0390-3', id: 'bkc0000001' }]),
      met(0, [{ bk: 'BK-0390-2', id: 'bkc0000009' }]),
      met(0, [{ bk: 'BK-0390-2', id: 'bkc0000001' }, { bk: 'BK-0390-2', id: 'bkc0000002' }]),
      met(0, undefined),
      [goals[1], goals[0], goals[2]],
    ];
    const afdrukken = varianten.map((v) => doelenVingerafdruk(v));
    for (const a of afdrukken) expect(a).not.toBe(basis);
    expect(new Set(afdrukken).size).toBe(afdrukken.length);
  });
});

describe('export en import (versie 2) van een BK-leerplan', () => {
  const nagekeken = () => bevestig(sanitizeCurriculum(bkRuw()) as Curriculum, { door: 'Boosterz (officiële bron)', op: 9 });

  it('houdt "Nagekeken", bkRefs en bkVersies; opnieuw exporteren geeft hetzelfde bestand', () => {
    const cur = nagekeken();
    expect(cur.controle?.doelenSha256).toBe(doelenVingerafdruk(cur.goals));
    expect(cur.controle?.doelenSha256).not.toBe(doelenVingerafdruk(cur.goals.map((g) => ({ ...g, bkRefs: undefined }))));
    const json = exportCurriculumJson(cur);
    expect(JSON.parse(json)).toMatchObject({ app: 'boosterz', kind: 'leerplan', v: 2 });
    const terug = importCurriculumJson(json) as Curriculum;
    expect(terug.controle?.status).toBe('gecontroleerd');
    expect(effectieveStatus(terug)).toBe('gecontroleerd');
    expect(terug).toEqual(cur);
    expect(terug.goals.map((g) => g.bkRefs)).toEqual(cur.goals.map((g) => g.bkRefs));
    expect(terug.bkVersies).toStrictEqual(cur.bkVersies);
    expect(exportCurriculumJson(terug)).toBe(json);
    saveCurriculum(terug);
    expect(effectieveStatus(getCurriculum('bk-1') as Curriculum)).toBe('gecontroleerd');
    expect(getCurriculum('bk-1')?.goals[0].bkRefs).toEqual([{ bk: 'BK-0390-2', id: 'bkc0000001' }]);
  });

  it('een andere competentie in het bestand geeft "gewijzigd" (zonder bkRefs in de vingerafdruk faalt deze test)', () => {
    const json = exportCurriculumJson(nagekeken());
    const bestand = () => JSON.parse(json) as { curriculum: { goals: { bkRefs?: { bk: string; id: string }[] }[]; bkVersies?: unknown } };
    const anderId = bestand();
    anderId.curriculum.goals[1].bkRefs = [{ bk: 'BK-0390-2', id: 'bkc0000009' }];
    expect(importCurriculumJson(JSON.stringify(anderId))?.controle?.status).toBe('gewijzigd');
    const andereVersie = bestand();
    andereVersie.curriculum.goals[2].bkRefs = [{ bk: 'BK-0464-2', id: 'bkc0000003' }];
    expect(importCurriculumJson(JSON.stringify(andereVersie))?.controle?.status).toBe('gewijzigd');
    const tweeRefs = bestand();
    tweeRefs.curriculum.goals[0].bkRefs?.push({ bk: 'BK-0464-1', id: 'bkc0000003' });
    expect(importCurriculumJson(JSON.stringify(tweeRefs))?.controle?.status).toBe('gewijzigd');
    // Een ongeldige verwijzing valt weg bij het saneren: ook dat is een wijziging.
    const ongeldig = bestand();
    ongeldig.curriculum.goals[0].bkRefs = [{ bk: 'BK-0390-2', id: 'a b' }];
    const terug = importCurriculumJson(JSON.stringify(ongeldig)) as Curriculum;
    expect(terug.goals[0]).not.toHaveProperty('bkRefs');
    expect(terug.controle?.status).toBe('gewijzigd');
  });

  it('N7: een BK-leerplan dat een oudere app zonder bkRefs bewaarde, is "gewijzigd"', () => {
    const json = exportCurriculumJson(nagekeken());
    // Een oudere app kent het veld niet en laat het weg.
    const zonderRefs = JSON.parse(json) as { curriculum: { goals: Record<string, unknown>[]; herkomst?: unknown } };
    for (const g of zonderRefs.curriculum.goals) delete g.bkRefs;
    const terug = importCurriculumJson(JSON.stringify(zonderRefs)) as Curriculum;
    expect(terug.controle?.status).toBe('gewijzigd');
    expect(effectieveStatus(terug)).toBe('gewijzigd');
    // Een oudere app kent ook de methode niet en laat de herkomst weg: dan vallen de bkRefs hier ook weg.
    const zonderHerkomst = JSON.parse(json) as { curriculum: Record<string, unknown> };
    delete zonderHerkomst.curriculum.herkomst;
    const terug2 = importCurriculumJson(JSON.stringify(zonderHerkomst)) as Curriculum;
    expect(terug2.goals.some((g) => 'bkRefs' in g)).toBe(false);
    expect(terug2).not.toHaveProperty('bkVersies');
    expect(terug2.controle?.status).toBe('gewijzigd');
    // Wie de methode in het bestand verandert, verliest de verwijzingen en het nakijken.
    const andereMethode = JSON.parse(json) as { curriculum: { herkomst: { methode: string } } };
    andereMethode.curriculum.herkomst.methode = 'pdf';
    expect(importCurriculumJson(JSON.stringify(andereMethode))?.controle?.status).toBe('gewijzigd');
  });

  it('bkVersies wijzigen, inkorten of weghalen laat het leerplan nagekeken: ze tellen niet mee in de vingerafdruk', () => {
    const json = exportCurriculumJson(nagekeken());
    const ander = JSON.parse(json) as { curriculum: Record<string, unknown> };
    ander.curriculum.bkVersies = [{ bk: 'BK-0390-2', sha: MERK_B }];
    const terug = importCurriculumJson(JSON.stringify(ander)) as Curriculum;
    expect(terug.controle?.status).toBe('gecontroleerd');
    expect(terug.bkVersies).toStrictEqual([{ bk: 'BK-0390-2', sha: MERK_B }]);
    ander.curriculum.bkVersies = [{ bk: 'BK-0390-2', sha: 'GEEN-HEX' }];
    const zonder = importCurriculumJson(JSON.stringify(ander)) as Curriculum;
    expect(zonder.controle?.status).toBe('gecontroleerd');
    expect(zonder).not.toHaveProperty('bkVersies');
    expect(bewaakControle({ ...nagekeken(), bkVersies: undefined }).controle?.status).toBe('gecontroleerd');
  });

  it('bkRefs op een leerplan van een net vallen weg; was het nagekeken met die verwijzingen, dan wordt het "gewijzigd"', () => {
    const net = sanitizeCurriculum(v2Ruw()) as Curriculum;
    const goals = net.goals.map((g, i) => ({ ...g, bkRefs: [{ bk: 'BK-0390-2', id: `bkc${i}` }] }));
    const metRefs: Curriculum = { ...net, goals, controle: { status: 'gecontroleerd', door: 'An', doelenSha256: doelenVingerafdruk(goals) } };
    expect(bewaakControle(metRefs)).toBe(metRefs);
    const terug = importCurriculumJson(exportCurriculumJson(metRefs)) as Curriculum;
    expect(terug.goals.some((g) => 'bkRefs' in g)).toBe(false);
    expect(terug.controle?.status).toBe('gewijzigd');
  });

  it('bkRefs en bkVersies in het bestand van een nagekeken netleerplan vallen weg en veranderen niets', () => {
    const cur = bevestig(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An', op: 5 });
    const json = exportCurriculumJson(cur);
    const gewoon = importCurriculumJson(json) as Curriculum;
    const geknoeid = JSON.parse(json) as { curriculum: { goals: Record<string, unknown>[]; bkVersies?: unknown } };
    for (const g of geknoeid.curriculum.goals) g.bkRefs = [{ bk: 'BK-0390-2', id: 'bkc1' }];
    geknoeid.curriculum.bkVersies = [{ bk: 'BK-0390-2', sha: MERK_A }];
    const terug = importCurriculumJson(JSON.stringify(geknoeid)) as Curriculum;
    expect(terug).toStrictEqual(gewoon);
    expect(terug.controle?.status).toBe('gecontroleerd');
    expect(exportCurriculumJson(terug)).toBe(json);
  });

  it('bevestigLeerplan saneert een BK-leerplan zoals een import: de vingerafdruk is die van wat bewaard wordt', () => {
    const ruw = { ...bkRuw(), goals: [{ id: 'c1', code: 'bk-0390-2.01', text: 'Nagemaakte  competentie.', bkRefs: [{ bk: ' BK-0390-2', id: ' bkc0000001 ', x: 1 }] }] } as unknown as Curriculum;
    const b = bevestigLeerplan(ruw, { door: 'An', rapport: geslaagd(ruw) });
    expect(b.goals[0]).toMatchObject({ code: 'BK-0390-2.01', text: 'Nagemaakte competentie.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000001' }] });
    expect(importCurriculumJson(exportCurriculumJson(b))?.controle?.status).toBe('gecontroleerd');
  });
});

describe('maakEigenKopie van een BK-leerplan', () => {
  it('houdt bkRefs (een echte kopie), bkVersies en de methode; niet nagekeken; overleeft export en import', () => {
    const cur = bevestig(sanitizeCurriculum(bkRuw()) as Curriculum, { door: 'An' });
    const kopie = maakEigenKopie(cur);
    expect(kopie.kind).toBe('eigen');
    expect(kopie).not.toHaveProperty('controle');
    expect(kopie.herkomst?.methode).toBe('beroepskwalificatie');
    expect(kopie.goals.map((g) => g.bkRefs)).toEqual(cur.goals.map((g) => g.bkRefs));
    expect(kopie.goals[0].bkRefs).not.toBe(cur.goals[0].bkRefs);
    expect(kopie.goals[0].bkRefs?.[0]).not.toBe(cur.goals[0].bkRefs?.[0]);
    expect(kopie.bkVersies).toEqual(cur.bkVersies);
    expect(kopie.bkVersies).not.toBe(cur.bkVersies);
    expect(doelenVingerafdruk(kopie.goals)).toBe(doelenVingerafdruk(cur.goals));
    const terug = importCurriculumJson(exportCurriculumJson(kopie)) as Curriculum;
    expect(terug.goals.map((g) => g.bkRefs)).toEqual(cur.goals.map((g) => g.bkRefs));
    expect(terug.bkVersies).toEqual(cur.bkVersies);
    expect(effectieveStatus(terug)).toBe('niet-gecontroleerd');
  });
});
