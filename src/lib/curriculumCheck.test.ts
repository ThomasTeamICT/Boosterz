import { describe, expect, it } from 'vitest';
import { sanitizeCurriculum } from './curriculum';
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

function leerplan(goals: CurriculumGoal[], extra: Partial<Curriculum> = {}): Curriculum {
  return {
    id: 'lp', title: 'Testleerplan', net: 'eigen', subject: 'Aardrijkskunde', level: '1e graad', goals, createdAt: 1, updatedAt: 1, ...extra,
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
    expect(r.bevindingen.filter((b) => b.soort === 'letterlijk')).toEqual([]);
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

  it('zonder bron: letterlijk onbekend en één info-bevinding', () => {
    const r = controleerLeerplan(leerplan(GOED), {});
    expect(Object.values(r.perDoel).every((d) => d.letterlijk === 'onbekend')).toBe(true);
    const letterlijk = r.bevindingen.filter((b) => b.soort === 'letterlijk');
    expect(letterlijk).toHaveLength(1);
    expect(letterlijk[0].ernst).toBe('info');
    expect(r.tellers.letterlijk).toBe(0);
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
    expect(r.kanBevestigen).toBe(true);
  });

  it('meldt gaten binnen een rubriek (2.1, 2.2, 2.4)', () => {
    const r = controleerLeerplan(leerplan(['2.1', '2.2', '2.4'].map((c) => doel(c, `Doel ${c}.`))), {});
    expect(r.bevindingen.find((b) => b.soort === 'volledig')?.code).toBe('2.3');
  });

  it('een afgekapte bron, een leerplan zonder doelen en een doel zonder code zijn fouten', () => {
    expect(controleerLeerplan(leerplan(GOED), { bronTekst: BRON, bronAfgekapt: true }).kanBevestigen).toBe(false);
    const leeg = controleerLeerplan(leerplan([]), {});
    expect(leeg.bevindingen.some((b) => b.ernst === 'fout' && b.bericht.includes('geen doelen'))).toBe(true);
    expect(leeg.samenvatting).toBe('0 doelen, letterlijk niet nagekeken (geen bron), geen verwijzingen, 1 fout.');
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

  it('een onbekend minimumdoel is een fout, een afwijkende code een waarschuwing', () => {
    const goals = [
      doel('LPD 1', 'Een.', { refs: [{ set: 'ODS_3287', id: '99999', code: '09.09' }] }),
      doel('LPD 2', 'Twee.', { refs: [{ set: 'ODS_3287', id: '92186', code: '9.1' }] }),
    ];
    const r = controleerLeerplan(leerplan(goals), { sets: [SET] });
    const v = r.bevindingen.filter((b) => b.soort === 'verwijzing');
    expect(v.map((b) => [b.ernst, b.doelId])).toEqual([['fout', 'id-LPD1'], ['waarschuwing', 'id-LPD2']]);
    expect(v[0].bericht).toContain('bestaat niet in de set Ruimtelijk bewustzijn');
    expect(v[1].bericht).toContain('noemt het "9.1"');
    expect(r.tellers).toMatchObject({ verwijzingen: 2, verwijzingenOk: 0 });
    expect(r.perDoel['id-LPD2'].verwijzingen).toBe('probleem');
  });

  it('een verwijzing in de bron die nog niet gekoppeld is, is een waarschuwing', () => {
    const r = controleerLeerplan(leerplan([doel('LPD 1', 'Een.', { refsBron: 'MD 09.01' })]), { sets: [SET] });
    const b = r.bevindingen.find((x) => x.soort === 'verwijzing');
    expect(b?.ernst).toBe('waarschuwing');
    expect(b?.bericht).toContain('nog niet gekoppeld');
    expect(r.perDoel['id-LPD1'].verwijzingen).toBe('probleem');
  });

  it('een set die niet meegegeven is: info zonder sets, fout als er wel sets zijn', () => {
    const goals = [doel('LPD 1', 'Een.', { refs: [{ set: 'ODS_1', id: '1', code: '1.1' }] })];
    const zonder = controleerLeerplan(leerplan(goals), {});
    expect(zonder.bevindingen.find((b) => b.soort === 'verwijzing')?.ernst).toBe('info');
    expect(zonder.kanBevestigen).toBe(true);
    const met = controleerLeerplan(leerplan(goals), { sets: [SET] });
    expect(met.bevindingen.find((b) => b.soort === 'verwijzing')?.ernst).toBe('fout');
    expect(met.kanBevestigen).toBe(false);
  });
});

describe('controleerLeerplan: herkomst', () => {
  it('een leerplan zonder herkomst is een fout', () => {
    const r = controleerLeerplan(leerplan(GOED, { kind: 'leerplan' }), {});
    expect(r.bevindingen.some((b) => b.soort === 'herkomst' && b.ernst === 'fout')).toBe(true);
    expect(r.kanBevestigen).toBe(false);
  });

  it('pdf zonder vingerafdruk en een net zonder leerplancode zijn waarschuwingen', () => {
    const r = controleerLeerplan(leerplan(GOED, { kind: 'leerplan', net: 'kov', herkomst: { methode: 'pdf', ingelezenOp: 1 } }), {});
    expect(r.bevindingen.filter((b) => b.soort === 'herkomst').map((b) => b.ernst)).toEqual(['waarschuwing', 'waarschuwing']);
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
    expect(r.samenvatting).toBe('3 van 3 doelen letterlijk, 3 van 3 verwijzingen in orde, geen fouten of waarschuwingen.');
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
    expect(fouten.map((b) => b.doelId)).toEqual([undefined, 'id-LPD1', 'id-LPD3', 'id-LPD4']);
    expect(r.samenvatting).toBe('1 van 3 doelen letterlijk, 0 van 1 verwijzing in orde, 4 fouten, 3 waarschuwingen.');
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
