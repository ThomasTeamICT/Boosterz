import { describe, expect, it } from 'vitest';
import { doelenVingerafdruk, sanitizeCurriculum } from './curriculum';
import { controleerLeerplan, normaliseerVoorVergelijking } from './curriculumCheck';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { leesLeerplan, naarCurriculumGoals } from './leerplanLezer';
import { losVerwijzingenOp, vindVerwijzingen } from './minimumdoelVerwijzing';
import type { MinimumdoelenSetBestand } from './minimumdoelen';

// Alles hieronder is nagemaakt: geen echte leerplantekst en geen echte API-gegevens.

const SET: MinimumdoelenSetBestand = {
  app: 'boosterz',
  kind: 'minimumdoelen',
  v: 1,
  set: {
    id: 'ODS_3287', naam: 'Secundair onderwijs 1ste graad A-stroom - Ruimtelijk bewustzijn - Eindtermen', korteNaam: 'Ruimtelijk bewustzijn',
    sleutelcompetenties: [], bron: '', api: '', naamsvermelding: '', licentie: '', opgehaald: '', aantal: 5, sha256: '',
  },
  doelen: [
    { id: '92186', code: '09.01', tekst: '<p>Situeren.</p>' },
    { id: '92187', code: '09.02', tekst: '<p>Beschrijven.</p>' },
    { id: '92188', code: '09.03', tekst: '<p>Analyseren.</p>' },
    // Twee doelen met dezelfde code in verschillende rubrieken (komt echt voor in laag 1).
    { id: '73778', code: '1', tekst: '<p>Muziek.</p>', extra: { titels: { '1': { titel: 'Muzikale opvoeding', nr: '1' } } } },
    { id: '73796', code: '1', tekst: '<p>Beeld.</p>', extra: { titels: { '1': { titel: 'Plastische opvoeding', nr: '2' } } } },
  ],
};

const BRON = [
  'Nagemaakt leerplan aardrijkskunde',
  'LPD 1 De leerlingen beschrijven de verwe-',
  'ring van gesteenten en de vorming van bodems.',
  '(MD 09.02)',
  'LPD 2 De leerlingen onderscheiden “bodemtypes” op basis van textuur (MD 09.02, 09.03) en kleur.',
  'LPD 3 De leerlingen leggen verbanden tussen natuur-',
  'en milieufactoren en het bodemgebruik.',
].join('\n');

function doel(code: string, text: string, extra: Partial<CurriculumGoal> = {}): CurriculumGoal {
  return { id: `id-${code.replace(/\s+/g, '')}`, code, text, ...extra };
}

/** Een nagemaakt leerplan; standaard ingelezen uit geplakte tekst, met de vingerafdruk van die tekst. */
function leerplan(goals: CurriculumGoal[], extra: Partial<Curriculum> = {}): Curriculum {
  return {
    id: 'lp', title: 'Testleerplan', net: 'eigen', subject: 'Aardrijkskunde', level: '1e graad', goals, createdAt: 1, updatedAt: 1,
    herkomst: { methode: 'tekst', ingelezenOp: 1, bronSha256: 'b'.repeat(64) },
    ...extra,
  };
}

const GOED: CurriculumGoal[] = [
  doel('LPD 1', 'De leerlingen beschrijven de verwering van gesteenten en de vorming van bodems.', {
    refs: [{ set: 'ODS_3287', id: '92187', code: '09.02' }], refsBron: 'MD 09.02',
  }),
  doel('LPD 2', 'De leerlingen onderscheiden "bodemtypes" op basis van textuur en kleur.', {
    refs: [{ set: 'ODS_3287', id: '92187', code: '09.02' }, { set: 'ODS_3287', id: '92188', code: '09.03' }],
  }),
  doel('LPD 3', 'De leerlingen leggen verbanden tussen natuur- en milieufactoren en het bodemgebruik.'),
];

describe('normaliseerVoorVergelijking', () => {
  it('trekt schrijfwijzen gelijk zonder hoofdletters te negeren', () => {
    expect(normaliseerVoorVergelijking('Café')).toBe('Café'); // NFC
    expect(normaliseerVoorVergelijking('zelf\u00adgekozen')).toBe('zelfgekozen');
    expect(normaliseerVoorVergelijking('verwe-\nring')).toBe('verwering');
    expect(normaliseerVoorVergelijking('natuur-\nen milieu')).toBe('natuur- en milieu');
    expect(normaliseerVoorVergelijking('ﬁguur, ﬂuïdum, eﬀect, eﬃciënt, ﬄ')).toBe('figuur, fluïdum, effect, efficiënt, ffl');
    expect(normaliseerVoorVergelijking('‘enkel’ “dubbel” „laag” l’eau')).toBe('\'enkel\' "dubbel" "laag" l\'eau');
    expect(normaliseerVoorVergelijking('1914–1918 — oorlog')).toBe('1914-1918 - oorlog');
    expect(normaliseerVoorVergelijking('Inleiding:\n• een\n▪ twee\n- drie\n\uf0b7 vier')).toBe('Inleiding: een twee drie vier');
    expect(normaliseerVoorVergelijking('  veel \t witruimte\u00a0\u200b hier \r\n ')).toBe('veel witruimte hier');
    expect(normaliseerVoorVergelijking('De Leerlingen')).not.toBe(normaliseerVoorVergelijking('de leerlingen'));
  });

  it('behandelt een afbreking aan het regeleinde in de bron en een samengevoegde doeltekst gelijk', () => {
    expect(normaliseerVoorVergelijking('beschrijven de verwe-\nring van')).toBe(normaliseerVoorVergelijking('beschrijven de verwering van'));
  });
});

describe('controleerLeerplan: letterlijk', () => {
  it('vindt elk doel in de bron, ook met afbreking, aanhalingstekens en een verwijzing midden in de zin', () => {
    const r = controleerLeerplan(leerplan(GOED), { bronTekst: BRON, sets: [SET] });
    expect(Object.values(r.perDoel).map((d) => d.letterlijk)).toEqual(['ja', 'ja', 'ja']);
    expect(r.tellers).toMatchObject({ doelen: 3, letterlijk: 3, nietLetterlijk: 0 });
    expect(r.perDoel['id-LPD1'].vindplaats).toContain('verwering van gesteenten');
    expect(r.bevindingen.filter((b) => b.soort === 'letterlijk' && b.ernst === 'fout')).toEqual([]);
    // De afbreking werd hersteld: dat staat bij het doel, als waarschuwing.
    expect(r.perDoel['id-LPD1'].afbrekingen).toEqual(['verwe-|ring → verwering']);
    expect(r.bevindingen.filter((b) => b.soort === 'letterlijk').map((b) => [b.ernst, b.doelId, b.bericht])).toEqual([
      ['waarschuwing', 'id-LPD1', 'LPD 1: afbreking hersteld: verwe-|ring → verwering; kijk na of het streepje bij het woord hoort.'],
    ]);
  });

  it('meldt een doel dat niet letterlijk in de bron staat, met waar het misloopt', () => {
    const goals = [doel('LPD 1', 'De leerlingen beschrijven de verwering van rotsen en de vorming van bodems.')];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: BRON });
    expect(r.perDoel['id-LPD1'].letterlijk).toBe('nee');
    const b = r.bevindingen.find((x) => x.soort === 'letterlijk');
    expect(b).toMatchObject({ ernst: 'fout', doelId: 'id-LPD1', code: 'LPD 1' });
    expect(b?.bericht).toContain('beschrijven de verwering van');
    expect(b?.bericht).toContain('loopt het mis bij "rotsen en de vorming van bodems."');
    expect(r.perDoel['id-LPD1'].vindplaats).toContain('verwering van gesteenten');
    expect(r.kanBevestigen).toBe(false);
  });

  it('kiest bij veel vindplaatsen van het begin de langste overeenkomst, ook in een grote bron', () => {
    const regels = Array.from({ length: 3000 }, (_, i) => `LPD ${i + 1} De leerlingen tellen ${i % 2 ? 'appels' : 'noten'} in de klas.`);
    regels.push('LPD 3001 De leerlingen tellen peren in de tuin.');
    const goals = Array.from({ length: 200 }, (_, i) => doel(`LPD ${i + 1}`, 'De leerlingen tellen peren in de klas.'));
    const start = Date.now();
    const r = controleerLeerplan(leerplan(goals), { bronTekst: regels.join('\n') });
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.tellers.nietLetterlijk).toBe(200);
    const b = r.bevindingen.find((x) => x.doelId === 'id-LPD1' && x.soort === 'letterlijk');
    expect(b?.bericht).toContain('Tot "De leerlingen tellen peren in de" klopt het; daarna loopt het mis bij "klas."');
    expect(r.perDoel['id-LPD1'].vindplaats).toContain('peren in de tuin');
  });

  it('meldt een doel waarvan zelfs het begin niet in de bron staat', () => {
    const r = controleerLeerplan(leerplan([doel('LPD 9', 'Verzonnen doel.')]), { bronTekst: BRON });
    expect(r.bevindingen.find((b) => b.soort === 'letterlijk')?.bericht).toContain('al het begin');
    expect(r.perDoel['id-LPD9'].vindplaats).toBeUndefined();
  });

  it('hoofdletters tellen: een andere hoofdletter is niet letterlijk', () => {
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'de leerlingen beschrijven de verwering van gesteenten')]), { bronTekst: BRON });
    expect(r.perDoel['id-LPD1'].letterlijk).toBe('nee');
  });

  it('geeft de vindplaats met hoogstens 200 tekens bron aan elke kant', () => {
    const bron = `${'a'.repeat(500)} De leerlingen tellen. ${'b'.repeat(500)}`;
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'De leerlingen tellen.')]), { bronTekst: bron });
    const plaats = r.perDoel['id-LPD1'].vindplaats ?? '';
    expect(plaats.startsWith('…')).toBe(true);
    expect(plaats.endsWith('…')).toBe(true);
    expect(plaats.length).toBe(200 + 'De leerlingen tellen.'.length + 200 + 2);
  });

  it('zonder bron: letterlijk onbekend en een fout, zodat bevestigen niet kan', () => {
    const r = controleerLeerplan(leerplan(GOED), { sets: [SET] });
    expect(Object.values(r.perDoel).every((d) => d.letterlijk === 'onbekend')).toBe(true);
    const letterlijk = r.bevindingen.filter((b) => b.soort === 'letterlijk');
    expect(letterlijk).toEqual([
      { soort: 'letterlijk', ernst: 'fout', bericht: 'Lees de bron in om te kunnen nakijken: zonder bron is niet na te gaan of de doelen letterlijk overgenomen zijn.' },
    ]);
    expect(r.tellers.letterlijk).toBe(0);
    expect(r.kanBevestigen).toBe(false);
  });

  it('een lege bron is een bron: dan staat geen enkel doel erin', () => {
    const r = controleerLeerplan(leerplan(GOED), { bronTekst: '' });
    expect(r.tellers.nietLetterlijk).toBe(3);
    expect(r.kanBevestigen).toBe(false);
  });

  it('vindt een doel over een paginagrens met kopregel en paginamarkering', () => {
    const bron = [
      'Kop van het leerplan', 'LPD 1 De leerlingen tellen.', 'LPD 2 De leerlingen verklaren het ontstaan van een rivier-',
      '— p. 2 —', 'Kop van het leerplan', 'vallei aan de hand van een kaart.',
      '— p. 3 —', 'Kop van het leerplan', 'LPD 3 De leerlingen meten.',
    ].join('\n');
    const goals = [
      doel('LPD 1', 'De leerlingen tellen.'),
      doel('LPD 2', 'De leerlingen verklaren het ontstaan van een riviervallei aan de hand van een kaart.'),
      doel('LPD 3', 'De leerlingen meten.'),
    ];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron });
    expect(Object.values(r.perDoel).map((d) => d.letterlijk)).toEqual(['ja', 'ja', 'ja']);
  });

  it('vindt een doel met regeleinden (een lijst) in de bron', () => {
    const bron = 'LPD 1 De leerlingen onderscheiden:\n• gesteenten;\n• bodems.\nLPD 2 Iets anders.';
    const goals = [doel('LPD 1', 'De leerlingen onderscheiden:\n• gesteenten;\n• bodems.'), doel('LPD 2', 'Iets anders.')];
    const cur = sanitizeCurriculum(leerplan(goals)) as Curriculum;
    expect(cur.goals[0].text).toContain('\n');
    const r = controleerLeerplan(cur, { bronTekst: bron });
    expect(r.tellers.letterlijk).toBe(2);
  });
});

describe('controleerLeerplan: volledig', () => {
  it('meldt dubbele codes als fout', () => {
    const goals = [doel('LPD 1', 'De leerlingen tellen.'), { ...doel('lpd  1', 'De leerlingen meten.'), id: 'tweede' }];
    const r = controleerLeerplan(leerplan(goals), {});
    const b = r.bevindingen.find((x) => x.soort === 'volledig' && x.ernst === 'fout');
    expect(b).toMatchObject({ doelId: 'tweede' });
    expect(b?.bericht).toContain('LPD 1 komt meer dan één keer voor');
  });

  it('meldt gaten in de nummering als waarschuwing', () => {
    const goals = ['LPD 5', 'LPD 6', 'LPD 8', 'LPD 9'].map((c) => doel(c, `Doel ${c}.`));
    const r = controleerLeerplan(leerplan(goals), {});
    const gaten = r.bevindingen.filter((b) => b.soort === 'volledig');
    expect(gaten.map((b) => [b.ernst, b.code, b.doelId])).toEqual([
      ['waarschuwing', 'LPD 1', 'id-LPD5'],
      ['waarschuwing', 'LPD 7', 'id-LPD8'],
    ]);
    expect(gaten[1].bericht).toBe('LPD 7 ontbreekt; staat het niet in de bron of las de lezer het niet?');
    expect(gaten[0].bericht).toBe('LPD 1 tot LPD 4 ontbreken (4 doelen); staan ze niet in de bron of las de lezer ze niet?');
  });

  it('meldt gaten binnen een rubriek (2.1, 2.2, 2.4)', () => {
    const r = controleerLeerplan(leerplan(['2.1', '2.2', '2.4'].map((c) => doel(c, `Doel ${c}.`))), {});
    expect(r.bevindingen.find((b) => b.soort === 'volledig')?.code).toBe('2.3');
  });

  it('een afgekapte bron, een leerplan zonder doelen en een doel zonder code zijn fouten', () => {
    expect(controleerLeerplan(leerplan(GOED), { bronTekst: BRON, bronAfgekapt: true }).kanBevestigen).toBe(false);
    const leeg = controleerLeerplan(leerplan([]), {});
    expect(leeg.bevindingen.some((b) => b.ernst === 'fout' && b.bericht.includes('geen doelen'))).toBe(true);
    expect(leeg.samenvatting).toBe('0 doelen, letterlijk niet nagekeken (geen bron), geen verwijzingen, 2 fouten.');
    const zonderCode = controleerLeerplan(leerplan([doel('', 'Doel zonder code.')]), {});
    expect(zonderCode.bevindingen.some((b) => b.ernst === 'fout' && b.bericht === 'Doel 1 heeft geen code.')).toBe(true);
  });
});

describe('controleerLeerplan: verwijzingen', () => {
  it('telt verwijzingen die in orde zijn', () => {
    const r = controleerLeerplan(leerplan(GOED), { bronTekst: BRON, sets: [SET] });
    expect(r.tellers).toMatchObject({ verwijzingen: 3, verwijzingenOk: 3 });
    expect(r.perDoel['id-LPD1'].verwijzingen).toBe('ok');
    expect(r.perDoel['id-LPD3'].verwijzingen).toBe('geen');
  });

  it('een onbekend minimumdoel en een afwijkende code zijn fouten', () => {
    const goals = [
      doel('LPD 1', 'Een.', { refs: [{ set: 'ODS_3287', id: '99999', code: '09.09' }] }),
      doel('LPD 2', 'Twee.', { refs: [{ set: 'ODS_3287', id: '92186', code: '9.1' }] }),
    ];
    const r = controleerLeerplan(leerplan(goals), { sets: [SET] });
    const v = r.bevindingen.filter((b) => b.soort === 'verwijzing');
    expect(v.map((b) => [b.ernst, b.doelId])).toEqual([['fout', 'id-LPD1'], ['fout', 'id-LPD2']]);
    expect(v[0].bericht).toContain('bestaat niet in de set Ruimtelijk bewustzijn');
    expect(v[1].bericht).toContain('noemt het "9.1"');
    expect(r.tellers).toMatchObject({ verwijzingen: 2, verwijzingenOk: 0 });
    expect(r.perDoel['id-LPD2'].verwijzingen).toBe('probleem');
  });

  it('een verwijzing in de bron die nog niet gekoppeld is, is een fout', () => {
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'Een.', { refsBron: 'MD 09.01' })]), { sets: [SET] });
    const b = r.bevindingen.find((x) => x.soort === 'verwijzing');
    expect(b?.ernst).toBe('fout');
    expect(b?.bericht).toContain('nog niet gekoppeld');
    expect(r.perDoel['id-LPD1'].verwijzingen).toBe('probleem');
  });

  it('een set die niet meegegeven is, is een fout, ook als er geen enkele set is', () => {
    const goals = [doel('LPD 1', 'Een.', { refs: [{ set: 'ODS_1', id: '1', code: '1.1' }] })];
    const zonder = controleerLeerplan(leerplan(goals), { bronTekst: 'LPD 1 Een.' });
    expect(zonder.bevindingen.find((b) => b.soort === 'verwijzing')).toMatchObject({
      ernst: 'fout', bericht: 'LPD 1 verwijst naar 1.1 (ODS_1), maar die set is niet meegegeven: zonder de set kan de verwijzing niet nagekeken worden.',
    });
    expect(zonder.kanBevestigen).toBe(false);
    const met = controleerLeerplan(leerplan(goals), { sets: [SET] });
    expect(met.bevindingen.find((b) => b.soort === 'verwijzing')?.ernst).toBe('fout');
    expect(met.kanBevestigen).toBe(false);
  });
});

describe('controleerLeerplan: herkomst', () => {
  it('een leerplan zonder herkomst is een fout, ook zonder soort', () => {
    const zonderSoort = controleerLeerplan(leerplan(GOED, { herkomst: undefined }), { bronTekst: BRON, sets: [SET] });
    expect(zonderSoort.bevindingen.filter((b) => b.soort === 'herkomst').map((b) => b.ernst)).toEqual(['fout']);
    expect(zonderSoort.kanBevestigen).toBe(false);
    const r = controleerLeerplan(leerplan(GOED, { kind: 'leerplan', herkomst: undefined }), {});
    expect(r.bevindingen.some((b) => b.soort === 'herkomst' && b.ernst === 'fout')).toBe(true);
    expect(r.kanBevestigen).toBe(false);
  });

  it('pdf of tekst zonder vingerafdruk is een fout, een net zonder leerplancode een waarschuwing', () => {
    const r = controleerLeerplan(leerplan(GOED, { kind: 'leerplan', net: 'kov', herkomst: { methode: 'pdf', ingelezenOp: 1 } }), {});
    expect(r.bevindingen.filter((b) => b.soort === 'herkomst').map((b) => b.ernst)).toEqual(['fout', 'waarschuwing']);
    const tekst = controleerLeerplan(leerplan(GOED, { herkomst: { methode: 'tekst', ingelezenOp: 1 } }), { bronTekst: BRON, sets: [SET] });
    expect(tekst.bevindingen.filter((b) => b.soort === 'herkomst').map((b) => b.ernst)).toEqual(['fout']);
    expect(tekst.kanBevestigen).toBe(false);
    const volledig = controleerLeerplan(
      leerplan(GOED, { kind: 'leerplan', net: 'kov', herkomst: { methode: 'pdf', ingelezenOp: 1, bronSha256: 'a'.repeat(64), leerplancode: 'I-Aar-a' } }),
      {},
    );
    expect(volledig.bevindingen.filter((b) => b.soort === 'herkomst')).toEqual([]);
    expect(controleerLeerplan(leerplan(GOED, { net: 'minimumdoelen' }), {}).bevindingen.filter((b) => b.soort === 'herkomst')).toEqual([]);
  });
});

describe('controleerLeerplan: dekking en rapport', () => {
  it('toont per set welke minimumdoelen niet gedekt zijn (twee doelen met dezelfde code tellen apart)', () => {
    const r = controleerLeerplan(leerplan(GOED), { bronTekst: BRON, sets: [SET, SET] });
    expect(r.dekking).toEqual([
      {
        set: 'ODS_3287',
        naam: 'Ruimtelijk bewustzijn',
        nietGedekt: [
          { set: 'ODS_3287', id: '92186', code: '09.01' },
          { set: 'ODS_3287', id: '73778', code: '1' },
          { set: 'ODS_3287', id: '73796', code: '1' },
        ],
      },
    ]);
    const info = r.bevindingen.filter((b) => b.soort === 'dekking');
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ ernst: 'info' });
    expect(info[0].bericht).toContain('3 van de 5 minimumdoelen');
  });

  it('geeft een samenvatting in één zin en laat bevestigen toe zonder fouten', () => {
    const r = controleerLeerplan(leerplan(GOED), { bronTekst: BRON, sets: [SET] });
    expect(r.kanBevestigen).toBe(true);
    expect(r.samenvatting).toBe('3 van 3 doelen letterlijk, 3 van 3 verwijzingen in orde, 1 waarschuwing.');
    expect(r.doelenSha256).toBe(doelenVingerafdruk(GOED));
  });

  it('zet fouten vóór waarschuwingen vóór info, en binnen een ernst in de volgorde van de doelen', () => {
    const goals = [
      doel('LPD 1', 'Verzonnen een.', { refsBron: 'MD 09.01' }),
      doel('LPD 3', 'Verzonnen drie.'),
      doel('LPD 4', 'De leerlingen leggen verbanden tussen natuur- en milieufactoren en het bodemgebruik.', { refs: [{ set: 'ODS_9', id: '1', code: '1' }] }),
    ];
    const r = controleerLeerplan(leerplan(goals, { kind: 'leerplan', net: 'go' }), { bronTekst: BRON, sets: [SET] });
    const ernst = r.bevindingen.map((b) => b.ernst);
    expect(ernst).toEqual([...ernst].sort((a, b) => ['fout', 'waarschuwing', 'info'].indexOf(a) - ['fout', 'waarschuwing', 'info'].indexOf(b)));
    const fouten = r.bevindingen.filter((b) => b.ernst === 'fout');
    // Eerst wat bij geen doel hoort (LPD 2 staat in de bron maar niet in het leerplan), dan per doel.
    expect(fouten.map((b) => b.doelId)).toEqual([undefined, 'id-LPD1', 'id-LPD1', 'id-LPD3', 'id-LPD4']);
    expect(r.samenvatting).toBe('1 van 3 doelen letterlijk, 0 van 1 verwijzing in orde, 5 fouten, 3 waarschuwingen.');
  });

  it('gebruikt in berichten "nakijken", nooit "controleren"', () => {
    const goals = [doel('LPD 1', 'Verzonnen.', { refsBron: 'MD 09.01', refs: [{ set: 'ODS_9', id: '1', code: '1' }] }), doel('LPD 1', 'x')];
    for (const opties of [{}, { bronTekst: BRON, sets: [SET], bronAfgekapt: true }]) {
      const r = controleerLeerplan(leerplan(goals, { kind: 'leerplan', net: 'pov', herkomst: { methode: 'tekst', ingelezenOp: 1 } }), opties);
      for (const b of r.bevindingen) expect(b.bericht).not.toMatch(/controle/i);
      expect(r.samenvatting).not.toMatch(/controle/i);
    }
  });
});

describe('van leerplantekst tot rapport (lezer, verwijzingen, poort)', () => {
  it('alle gelezen doelen staan letterlijk in de bron en hun verwijzingen kloppen', () => {
    const bron = [
      'Kop van het testleerplan',
      'Bodem',
      'LPD 1 De leerlingen beschrijven de verwe-',
      'ring van gesteenten (MD 09.02) en de ﬁjne',
      'structuur van bodems.',
      'LPD 2 De leerlingen situeren “landschappen” op een kaart (MD 09.01).',
      '— p. 2 —',
      'Kop van het testleerplan',
      'LPD 3 De leerlingen analyseren relaties tussen lagen van een land-',
      '— p. 3 —',
      'Kop van het testleerplan',
      'schap.',
      'MD 09.03',
      '— p. 4 —',
      'Kop van het testleerplan',
    ].join('\n');
    const gelezen = leesLeerplan(bron);
    expect(gelezen.doelen.map((d) => d.code)).toEqual(['LPD 1', 'LPD 2', 'LPD 3']);
    const goals = naarCurriculumGoals(gelezen).map((g) => {
      const { refs } = losVerwijzingenOp(vindVerwijzingen(g.refsBron ?? ''), [SET]);
      return refs.length > 0 ? { ...g, refs } : g;
    });
    const cur = leerplan(goals, { kind: 'leerplan', net: 'kov', herkomst: { methode: 'tekst', ingelezenOp: 1, bronSha256: 'b'.repeat(64), leerplancode: 'TEST' } });
    const r = controleerLeerplan(cur, { bronTekst: bron, sets: [SET] });
    expect(r.tellers).toEqual({ doelen: 3, letterlijk: 3, nietLetterlijk: 0, verwijzingen: 3, verwijzingenOk: 3 });
    expect(r.kanBevestigen).toBe(true);
    expect(goals[0].text).toBe('De leerlingen beschrijven de verwering van gesteenten en de fijne structuur van bodems.');
    expect(goals[2].text).toBe('De leerlingen analyseren relaties tussen lagen van een landschap.');
  });
});

// ── Ronde 2: bevindingen van de review (scenario's van de rechter, nagemaakt) ──

/** Een nagemaakte set met codes over twee rubrieken heen (voor reeksen als 09.08-10.02). */
const SET2: MinimumdoelenSetBestand = {
  ...SET,
  set: { ...SET.set, id: 'ODS_1', naam: 'S', korteNaam: undefined, aantal: 5 },
  doelen: [
    { id: '10', code: '09.01', tekst: 'x' },
    { id: '11', code: '09.02', tekst: 'y' },
    { id: '18', code: '09.08', tekst: 'a' },
    { id: '19', code: '09.09', tekst: 'b' },
    { id: '21', code: '10.01', tekst: 'c' },
    { id: '22', code: '10.02', tekst: 'd' },
  ],
};
const ref = (id: string, code: string) => ({ set: 'ODS_1', id, code });
const fouten = (r: ReturnType<typeof controleerLeerplan>) => r.bevindingen.filter((b) => b.ernst === 'fout').map((b) => b.bericht);

describe('ronde 2: verwijzingen moeten kloppen met de set en met de bron', () => {
  const bron = 'LPD 1 De leerlingen kunnen A. (MD 09.01, 09.03, 07.05)\nLPD 2 De leerlingen kunnen B. (MD 09.01)';

  it('een verwijzing in de bron zonder koppeling, en een koppeling die de bron niet noemt, zijn fouten', () => {
    const goals = [
      doel('LPD 1', 'De leerlingen kunnen A.', { refsBron: 'MD 09.01, 09.03, 07.05', refs: [ref('10', '09.01')] }),
      doel('LPD 2', 'De leerlingen kunnen B.', { refsBron: 'MD 09.01', refs: [ref('11', '09.02')] }),
    ];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron, sets: [SET2] });
    expect(r.kanBevestigen).toBe(false);
    expect(fouten(r)).toEqual([
      'LPD 1 verwijst in de bron naar 09.03, maar die verwijzing is niet gekoppeld aan een minimumdoel.',
      'LPD 1 verwijst in de bron naar 07.05, maar die verwijzing is niet gekoppeld aan een minimumdoel.',
      'LPD 2 is gekoppeld aan minimumdoel 09.02 (S), maar de bron noemt dat doel niet ("MD 09.01").',
      'LPD 2 verwijst in de bron naar 09.01, maar die verwijzing is niet gekoppeld aan een minimumdoel.',
    ]);
    expect(r.perDoel['id-LPD1'].verwijzingen).toBe('probleem');
    expect(r.tellers).toMatchObject({ verwijzingen: 2, verwijzingenOk: 1 });
  });

  it('een code die niet past bij het doel in de set is een fout', () => {
    const goals = [doel('LPD 1', 'De leerlingen kunnen A.', { refsBron: 'MD 09.01', refs: [ref('11', '09.01')] })];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: 'LPD 1 De leerlingen kunnen A. (MD 09.01)', sets: [SET2] });
    expect(fouten(r)).toContain('LPD 1 verwijst naar minimumdoel 09.02 van S, maar de verwijzing noemt het "09.01". Koppel het juiste doel.');
    expect(r.kanBevestigen).toBe(false);
  });

  it('alles gekoppeld zoals de bron het zegt: in orde', () => {
    const goals = [
      doel('LPD 1', 'De leerlingen kunnen A.', { refsBron: 'MD 09.01 t.e.m. 09.02', refs: [ref('10', '09.01'), ref('11', '09.02')] }),
      doel('LPD 2', 'De leerlingen kunnen B.', { refsBron: 'MD 09.01', refs: [ref('10', '09.01')] }),
    ];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: 'LPD 1 De leerlingen kunnen A. (MD 09.01 t.e.m. 09.02)\nLPD 2 De leerlingen kunnen B. (MD 09.01)', sets: [SET2] });
    expect(fouten(r)).toEqual([]);
    expect(r.kanBevestigen).toBe(true);
  });

  it('een reeks die niet uitgeschreven kon worden: fout tot alle doelen van de set in die reeks gekoppeld zijn', () => {
    const tekst = 'LPD 1 De leerlingen kunnen A. (MD 09.08-10.02)';
    const half = [doel('LPD 1', 'De leerlingen kunnen A.', { refsBron: 'MD 09.08-10.02', refs: [ref('18', '09.08'), ref('22', '10.02')] })];
    const r = controleerLeerplan(leerplan(half), { bronTekst: tekst, sets: [SET2] });
    expect(fouten(r)).toEqual([
      'LPD 1: de reeks MD 09.08-10.02 kon niet volledig gelezen worden; koppel de verwijzingen zelf (nog niet gekoppeld: 09.09, 10.01).',
    ]);
    const heel = [doel('LPD 1', 'De leerlingen kunnen A.', { refsBron: 'MD 09.08-10.02', refs: ['18', '19', '21', '22'].map((id) => ref(id, SET2.doelen.find((d) => d.id === id)!.code)) })];
    expect(fouten(controleerLeerplan(leerplan(heel), { bronTekst: tekst, sets: [SET2] }))).toEqual([]);
    // Zonder set kan de poort de reeks niet nakijken.
    const zonderSet = controleerLeerplan(leerplan(heel), { bronTekst: tekst });
    expect(fouten(zonderSet).some((f) => f.includes('de reeks MD 09.08-10.02 kon niet volledig gelezen worden'))).toBe(true);
  });
});

describe('ronde 2: zonder bron geen bevestiging, en een officieel leerplan tegen zijn set', () => {
  const OFFICIEEL: MinimumdoelenSetBestand = {
    ...SET2,
    doelen: [
      { id: '10', code: '09.01', tekst: '<p>De leerlingen situeren&nbsp;plaatsen.</p>' },
      { id: '11', code: '09.02', tekst: '<ul><li>een</li><li>twee</li></ul>' },
      { id: '12', code: '09.03', tekst: '<p>&nbsp;</p>' }, // zonder tekst: hoeft er niet in
    ],
  };
  const officieelLeerplan = (goals: CurriculumGoal[]) =>
    leerplan(goals, { net: 'minimumdoelen', herkomst: { methode: 'officieel', ingelezenOp: 1, bronNaam: 'ODS_1' } });
  const goed = () => [
    doel('09.01', 'De leerlingen situeren plaatsen.', { refs: [ref('10', '09.01')] }),
    doel('09.02', '• een\n• twee', { refs: [ref('11', '09.02')] }),
  ];

  it('zonder bron: een fout, voor elke methode behalve "officieel"', () => {
    for (const methode of ['pdf', 'tekst', 'export', 'ai', 'handmatig'] as const) {
      const r = controleerLeerplan(leerplan(goed(), { herkomst: { methode, ingelezenOp: 1, bronSha256: 'c'.repeat(64) } }), { sets: [OFFICIEEL] });
      expect(fouten(r)[0], methode).toBe('Lees de bron in om te kunnen nakijken: zonder bron is niet na te gaan of de doelen letterlijk overgenomen zijn.');
      expect(r.kanBevestigen, methode).toBe(false);
    }
  });

  it('officieel: elke tekst gelijk aan die van zijn minimumdoel, en alle doelen van de set aanwezig', () => {
    const r = controleerLeerplan(officieelLeerplan(goed()), { sets: [OFFICIEEL] });
    expect(fouten(r)).toEqual([]);
    expect(r.kanBevestigen).toBe(true);
    expect(r.tellers.letterlijk).toBe(2);
    expect(r.perDoel['id-09.01'].vindplaats).toBe('De leerlingen situeren plaatsen.');
  });

  it('officieel: een gewijzigde tekst, een doel zonder verwijzing of een vergeten doel is een fout', () => {
    const anders = goed();
    anders[0] = { ...anders[0], text: 'De leerlingen situeren steden.' };
    expect(fouten(controleerLeerplan(officieelLeerplan(anders), { sets: [OFFICIEEL] }))).toEqual([
      'De code 09.01 is niet gelijk aan de officiële tekst van minimumdoel 09.01 (ODS_1). Tot "De leerlingen situeren" klopt het; daarna loopt het mis bij "steden.".'
        .replace('De code 09.01 is', '09.01 is'),
    ]);
    const zonderRef = goed();
    delete zonderRef[1].refs;
    expect(fouten(controleerLeerplan(officieelLeerplan(zonderRef), { sets: [OFFICIEEL] }))).toEqual([
      '1 minimumdoel van S (ODS_1) ontbreekt in het leerplan (bv. 09.02). Een officieel leerplan bevat alle doelen van de set.',
      '09.02 verwijst niet naar een officieel minimumdoel: zonder verwijzing kan de tekst niet nagekeken worden.',
    ]);
    const vergeten = goed().slice(0, 1);
    expect(fouten(controleerLeerplan(officieelLeerplan(vergeten), { sets: [OFFICIEEL] }))).toEqual([
      '1 minimumdoel van S (ODS_1) ontbreekt in het leerplan (bv. 09.02). Een officieel leerplan bevat alle doelen van de set.',
    ]);
    // Zonder de set kan niets vergeleken worden.
    expect(controleerLeerplan(officieelLeerplan(goed()), {}).kanBevestigen).toBe(false);
  });
});

describe('ronde 2: volledig, ook wat in de bron staat maar ontbreekt', () => {
  it('een laatste doel dat de lezer niet las ("LPD 3 aan de hand van …") is een fout', () => {
    const bron = 'LPD 1 De leerlingen kunnen een kaart lezen.\nLPD 2 De leerlingen kunnen een kompas gebruiken.\nLPD 3 aan de hand van een kaart de ligging bepalen.';
    const goals = naarCurriculumGoals(leesLeerplan(bron));
    expect(goals).toHaveLength(2);
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron });
    expect(fouten(r)).toEqual([
      'Regel 3 van de bron begint met LPD 3 ("aan de hand van een kaart de ligging bep…"), maar het leerplan heeft geen doel LPD 3. Ontbreekt dat doel?',
    ]);
  });

  it('geeft geen fout voor een kop met een nummer, een andere reeks of een genummerde lijst in wenken', () => {
    const samengesteld = '1.1 Deeltjes\n1.1.1 De leerlingen tellen.\n1.1.2 De leerlingen meten.\n1.2 Mengsels\nBijlage\n09.01 De leerlingen situeren plaatsen.';
    const r1 = controleerLeerplan(leerplan(naarCurriculumGoals(leesLeerplan(samengesteld))), { bronTekst: samengesteld });
    expect(fouten(r1)).toEqual([]);
    const tweeDelen = '2.1 De leerlingen tellen.\n2.2 De leerlingen meten.\n2.3 Energie\n3.1 Ze rekenen.';
    const goals2 = [doel('2.1', 'De leerlingen tellen.'), doel('2.2', 'De leerlingen meten.')];
    expect(fouten(controleerLeerplan(leerplan(goals2), { bronTekst: tweeDelen }))).toEqual([]);
    const wenken = '1. De leerlingen tellen.\n2. De leerlingen meten.\nWenken\n3. laat ze samenwerken.\n7. gebruik een atlas.';
    const goals3 = [doel('1', 'De leerlingen tellen.'), doel('2', 'De leerlingen meten.')];
    expect(fouten(controleerLeerplan(leerplan(goals3), { bronTekst: wenken }))).toEqual([]);
    const metDoel = `${wenken}\n8. De leerlingen wegen.`;
    expect(fouten(controleerLeerplan(leerplan(goals3), { bronTekst: metDoel }))).toEqual([
      'Regel 6 van de bron begint met 8 ("De leerlingen wegen."), maar het leerplan heeft geen doel 8. Ontbreekt dat doel?',
    ]);
  });

  it('twee doelen in één doeltekst zijn een fout', () => {
    const bron = 'LPD 1 De leerlingen kunnen A. LPD 2 De leerlingen kunnen B.\nLPD 3 De leerlingen kunnen C.';
    const goals = naarCurriculumGoals(leesLeerplan(bron));
    expect(goals[0].text).toBe('De leerlingen kunnen A. LPD 2 De leerlingen kunnen B.');
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron });
    expect(fouten(r)).toContain('LPD 1 bevat ook het begin van een ander doel (LPD 2): twee doelen lijken samengevoegd. Splits ze in twee doelen.');
  });

  it('dubbele interne nummers zijn een fout (anders overschrijft het ene rapport het andere)', () => {
    const goals = [{ ...doel('LPD 1', 'De leerlingen kunnen A.'), id: 'z' }, { ...doel('LPD 2', 'De leerlingen kunnen B.'), id: 'z' }];
    const r = controleerLeerplan(leerplan(goals), { bronTekst: 'LPD 1 De leerlingen kunnen A.\nLPD 2 De leerlingen kunnen B.' });
    expect(fouten(r)).toEqual(['Doel 1 en doel 2 hebben hetzelfde interne nummer. Bewaar het leerplan opnieuw en kijk het dan na.']);
  });
});

describe('ronde 2: afgekapt, woordgrenzen en code bij de tekst', () => {
  it('een doel dat in de bron verdergaat met een kleine letter is afgekapt, ook na een afkorting of verwijzing', () => {
    const bron = 'LPD 1 De leerlingen kunnen verschillende reliëfvormen benoemen, o.a.\nbergen, dalen en vlakten, op een kaart aanduiden.\nLPD 2 De leerlingen kunnen een kaart lezen.';
    const afgekapt = [doel('LPD 1', 'De leerlingen kunnen verschillende reliëfvormen benoemen, o.a.'), doel('LPD 2', 'De leerlingen kunnen een kaart lezen.')];
    const r = controleerLeerplan(leerplan(afgekapt), { bronTekst: bron });
    expect(fouten(r)).toEqual(['LPD 1 lijkt afgekapt: in de bron loopt de tekst verder met "bergen, dalen en vlakten, op een kaart a…". Neem het volledige doel over.']);
    expect(r.perDoel['id-LPD1'].letterlijk).toBe('nee');
    // Zoals de lezer het nu leest, klopt het.
    expect(fouten(controleerLeerplan(leerplan(naarCurriculumGoals(leesLeerplan(bron))), { bronTekst: bron }))).toEqual([]);
    // Ook als er een verwijzing tussen staat.
    const metRef = 'LPD 1 De leerlingen tellen (MD 09.01) en meten.\nLPD 2 De leerlingen kunnen een kaart lezen.';
    expect(fouten(controleerLeerplan(leerplan([doel('LPD 1', 'De leerlingen tellen'), afgekapt[1]]), { bronTekst: metRef }))[0]).toContain('lijkt afgekapt');
  });

  it('een doel zonder slotteken dat midden op een regel stopt, is afgekapt', () => {
    const bron = 'LPD 1 De leerlingen kunnen A uitleggen met een voorbeeld.\nLPD 2 De leerlingen situeren België op een kaart.';
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'De leerlingen kunnen'), doel('LPD 2', 'De leerlingen situeren')]), { bronTekst: bron });
    expect(fouten(r).map((f) => f.slice(0, 22))).toEqual(['LPD 1 lijkt afgekapt: ', 'LPD 2 lijkt afgekapt: ']);
    // Een doel dat eindigt vóór een verwijzing aan het regeleinde is niet afgekapt.
    const metRef = 'LPD 1 De leerlingen beschrijven stoffen (ET 1.1)\nLPD 2 De leerlingen meten.';
    expect(fouten(controleerLeerplan(leerplan([doel('LPD 1', 'De leerlingen beschrijven stoffen'), doel('LPD 2', 'De leerlingen meten.')]), { bronTekst: metRef }))).toEqual([]);
  });

  it('een vondst moet op woordgrenzen beginnen en eindigen', () => {
    const bron = 'LPD 1 De leerlingen kunnen A uitleggen met een voorbeeld.\nLPD 2 De leerlingen kunnen B tekenen.';
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'erlingen kunnen A uitleg'), doel('LPD 2', 'De leerlingen kunnen B tekenen.')]), { bronTekst: bron });
    expect(fouten(r)).toEqual([
      'LPD 1 staat in de bron alleen als deel van een langer woord ("erlingen kunnen A uitleg"): begin en einde van het doel moeten op een woordgrens liggen.',
    ]);
  });

  it('code en tekst die niet samen in de bron staan: een waarschuwing', () => {
    const bron = 'LPD 1 De leerlingen kunnen A uitleggen met een voorbeeld.\nLPD 2 De leerlingen kunnen B tekenen.';
    const r = controleerLeerplan(
      leerplan([doel('LPD 1', 'De leerlingen kunnen B tekenen.'), doel('LPD 2', 'De leerlingen kunnen A uitleggen met een voorbeeld.')]),
      { bronTekst: bron },
    );
    expect(fouten(r)).toEqual([]);
    expect(r.bevindingen.filter((b) => b.ernst === 'waarschuwing').map((b) => b.bericht)).toEqual([
      'Bij LPD 1 staan code en tekst niet samen in de bron: vlak vóór de tekst staat niet "LPD 1". Kijk na of de tekst bij de juiste code hoort.',
      'Bij LPD 2 staan code en tekst niet samen in de bron: vlak vóór de tekst staat niet "LPD 2". Kijk na of de tekst bij de juiste code hoort.',
    ]);
    // Tolerant voor "(U)", ":", "(uitbreiding)", een opsommingsteken en "LPD12" zonder spatie.
    const tolerant = '• LPD 1 (U): De leerlingen tellen.\nLPD 2 (uitbreiding) De leerlingen meten.\nLPD3 De leerlingen wegen.';
    const goals = [doel('LPD 1', 'De leerlingen tellen.'), doel('LPD 2', 'De leerlingen meten.'), doel('LPD 3', 'De leerlingen wegen.')];
    expect(controleerLeerplan(leerplan(goals), { bronTekst: tolerant }).bevindingen.filter((b) => b.ernst !== 'info')).toEqual([]);
  });
});

describe('ronde 2: afbreking, paginanummers en regeleinden', () => {
  it('meldt per doel elke herstelde afbreking, ook "e-|mail" en een zacht afbreekstreepje', () => {
    const bron = `LPD 1 De leerlingen kunnen een e-\nmail versturen.\nLPD 2 De leerlingen kunnen de verwe${String.fromCharCode(0xad)}\nring uitleggen.`;
    const goals = naarCurriculumGoals(leesLeerplan(bron));
    expect(goals.map((g) => g.text)).toEqual(['De leerlingen kunnen een email versturen.', 'De leerlingen kunnen de verwering uitleggen.']);
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron });
    expect(r.kanBevestigen).toBe(true);
    expect(r.perDoel[goals[0].id].afbrekingen).toEqual(['e-|mail → email']);
    expect(r.bevindingen.map((b) => b.bericht)).toEqual([
      'LPD 1: afbreking hersteld: e-|mail → email; kijk na of het streepje bij het woord hoort.',
      'LPD 2: afbreking hersteld: verwe-|ring → verwering; kijk na of het streepje bij het woord hoort.',
    ]);
  });

  it('een getal midden in een doel blijft staan ("tot 1000 ordenen")', () => {
    const bron = 'LPD 1 De leerlingen kunnen getallen tot\n1000\nordenen.\nLPD 2 De leerlingen kunnen een hoek van\n90\ngraden tekenen.';
    const goals = naarCurriculumGoals(leesLeerplan(bron));
    expect(goals.map((g) => g.text)).toEqual(['De leerlingen kunnen getallen tot 1000 ordenen.', 'De leerlingen kunnen een hoek van 90 graden tekenen.']);
    expect(controleerLeerplan(leerplan(goals), { bronTekst: bron }).kanBevestigen).toBe(true);
    // Een doel zonder dat getal staat niet letterlijk in de bron.
    const zonder = [doel('LPD 1', 'De leerlingen kunnen getallen tot ordenen.'), goals[1]];
    expect(controleerLeerplan(leerplan(zonder), { bronTekst: bron }).perDoel['id-LPD1'].letterlijk).toBe('nee');
  });

  it('splitst de bron op dezelfde regeleinden als de lezer (U+2028, U+2029, \\r, form feed)', () => {
    const LS = String.fromCharCode(0x2028);
    const bron = `LPD 1 De leerlingen kunnen A.${LS}LPD 2 De leerlingen kunnen B.\rLPD 3 De leerlingen kunnen C.\fLPD 4 De leerlingen kunnen D.`;
    const goals = naarCurriculumGoals(leesLeerplan(bron));
    expect(goals.map((g) => g.code)).toEqual(['LPD 1', 'LPD 2', 'LPD 3', 'LPD 4']);
    expect(controleerLeerplan(leerplan(goals), { bronTekst: bron }).bevindingen.filter((b) => b.ernst !== 'info')).toEqual([]);
  });
});

describe('ronde 2: snelheid', () => {
  it('kijkt een bron van 1 MB met 200 doelen ruim binnen de tijd na', () => {
    const regels: string[] = [];
    let lengte = 0;
    for (let n = 0; lengte < 1024 * 1024; n++) {
      const code = `AAR ${Math.floor(n / 500) + 1}.${(n % 500) + 1}`;
      for (const r of [`${code} De leerlingen kunnen kaart ${n} lezen en daarbij de legende`, 'gebruiken om de ligging van plaatsen te bepalen (MD 09.01) in hun eigen omgeving.', 'Wenken: gebruik een atlas en oefen regelmatig met verschillende kaarten.', '']) {
        regels.push(r);
        lengte += r.length + 1;
      }
    }
    const bron = regels.join('\n');
    const goals = naarCurriculumGoals(leesLeerplan(bron)).slice(0, 200).map((g) => ({ ...g, refsBron: undefined }));
    const start = performance.now();
    const r = controleerLeerplan(leerplan(goals), { bronTekst: bron });
    // Doel ±1 s; de grens is ruim, zodat de test niet wiebelt op een trage machine.
    expect(performance.now() - start).toBeLessThan(3000);
    expect(r.tellers.letterlijk).toBe(200);
  });
});
