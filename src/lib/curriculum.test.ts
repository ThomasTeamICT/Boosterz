import { beforeEach, describe, expect, it } from 'vitest';
import {
  bevestigLeerplan,
  bewaakControle,
  doelenVingerafdruk,
  exportCurriculumJson,
  getCurriculum,
  importCurriculumJson,
  importCurriculumJsonMetRapport,
  isVeiligDoelId,
  maakEigenKopie,
  MAX_DOELEN,
  MAX_DOELTEKST,
  MAX_DOELTHEMA,
  MAX_DOELTOELICHTING,
  sanitizeCurriculum,
  sanitizeGoal,
  sanitizeGoals,
  saveCurriculum,
  type BevestigOpties,
} from './curriculum';
import { controleerLeerplan, type ControleRapport } from './curriculumCheck';
import type { Curriculum } from './curriculumTypes';

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
