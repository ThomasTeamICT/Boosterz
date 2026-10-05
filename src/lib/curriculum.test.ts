import { beforeEach, describe, expect, it } from 'vitest';
import {
  bevestigLeerplan,
  bewaakControle,
  doelenVingerafdruk,
  exportCurriculumJson,
  getCurriculum,
  importCurriculumJson,
  maakEigenKopie,
  sanitizeCurriculum,
  sanitizeGoal,
  saveCurriculum,
} from './curriculum';
import type { Curriculum } from './curriculumTypes';

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
    const nagekeken = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An', op: 5 });
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
    const cur = bevestigLeerplan(basis(), { door: 'An' });
    expect(bewaakControle(cur)).toBe(cur);
  });

  it('zet een gewijzigd doel op "gewijzigd" en bewaart naam, tijdstip en samenvatting', () => {
    const cur = bevestigLeerplan(basis(), { door: 'An', op: 123, samenvatting: '2 van 2 doelen letterlijk' });
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
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
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
    const cur = bevestigLeerplan(sanitizeCurriculum(ruw) as Curriculum, { door: 'An' });
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
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const json = exportCurriculumJson(cur).replace('De leerlingen situeren landschappen.', 'De leerlingen situeren steden.');
    expect(json).toContain('steden');
    const terug = importCurriculumJson(json);
    expect(terug?.controle?.status).toBe('gewijzigd');
    expect(terug?.controle?.door).toBe('An');
  });

  it('ook een gewijzigde verwijzing of rubriek in het bestand geeft "gewijzigd"', () => {
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    expect(importCurriculumJson(exportCurriculumJson(cur).replace('"92187"', '"92188"'))?.controle?.status).toBe('gewijzigd');
    expect(importCurriculumJson(exportCurriculumJson(cur).replace('"Bodem"', '"Bodems"'))?.controle?.status).toBe('gewijzigd');
  });

  it('exporteert een intussen gewijzigd leerplan niet als nagekeken', () => {
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const anders = { ...cur, goals: cur.goals.slice(0, 1) };
    expect(JSON.parse(exportCurriculumJson(anders)).curriculum.controle.status).toBe('gewijzigd');
  });

  it('een eigen kopie is niet nagekeken en blijft dat na export en import', () => {
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    const kopie = importCurriculumJson(exportCurriculumJson(maakEigenKopie(cur)));
    expect(kopie?.kind).toBe('eigen');
    expect(kopie).not.toHaveProperty('controle');
    expect(kopie?.herkomst?.methode).toBe('pdf');
  });
});

describe('saveCurriculum', () => {
  it('bewaart een nagekeken leerplan met kloppende vingerafdruk als nagekeken', () => {
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    expect(saveCurriculum(cur)).toBe(true);
    expect(getCurriculum(cur.id)?.controle?.status).toBe('gecontroleerd');
  });

  it('bewaart een nagekeken leerplan met gewijzigde doelen als "gewijzigd"', () => {
    const cur = bevestigLeerplan(sanitizeCurriculum(v2Ruw()) as Curriculum, { door: 'An' });
    saveCurriculum({ ...cur, goals: cur.goals.map((g) => ({ ...g, text: `${g.text} Extra.` })) });
    const bewaard = getCurriculum(cur.id);
    expect(bewaard?.controle?.status).toBe('gewijzigd');
    expect(bewaard?.controle?.door).toBe('An');
  });
});
