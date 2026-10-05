import { describe, expect, it } from 'vitest';
import {
  bronZonderOpmaak,
  gatenInNummering,
  haalVerwijzingenUit,
  kopEnVoetregels,
  leesLeerplan,
  naarCurriculumGoals,
  voegRegelsSamen,
} from './leerplanLezer';

// Alle teksten hieronder zijn NAGEMAAKT in de opmaak van leerplannen. Er staat bewust geen echte
// leerplantekst in de repo (auteursrecht, docs/LEERPLANNEN.md § 11).

/** Opmaak (a): "LPD n", rubriekskoppen, verwijzingen eronder of tussen haakjes, paginamarkeringen. */
const OPMAAK_A = [
  'Nagemaakt leerplan aardrijkskunde',
  'Dit leerplan is verzonnen om de lezer te testen. Het beschrijft wat leerlingen leren.',
  '',
  'Bodem en gesteenten',
  'LPD 1 De leerlingen beschrijven de verwe-',
  'ring van gesteenten en de vorming van bodems.',
  '(MD 09.02)',
  'LPD 2 De leerlingen onderscheiden bodemtypes op basis van',
  'textuur en kleur (MD 09.02, 09.03).',
  '— p. 2 —',
  'Testleerplan AAR – niet officieel',
  'LPD 3 De leerlingen leggen verbanden tussen natuur-',
  'en milieufactoren en het bodemgebruik',
  'in hun eigen omgeving.',
  'Minimumdoelen: 09.03',
  'Wenken',
  'Laat leerlingen zelf bodemstalen verzamelen.',
  '',
  'Landschappen',
  '• LPD 4 De leerlingen situeren landschappen op een kaart.',
  'MD 09.01-09.03',
  '— p. 3 —',
  'Testleerplan AAR – niet officieel',
  'Uitbreiding',
  'LPD 5 De leerlingen vergelijken ﬂoodplains in verschillende klimaten.',
  'LPD 6 De leerlingen verklaren het ontstaan van een rivier-',
  '— p. 4 —',
  'Testleerplan AAR – niet officieel',
  'vallei aan de hand van een kaart. (ET 9.1)',
].join('\n');

/** Opmaak (b): "1.2.3 De leerlingen …" met "(ET 9.1)" achteraan, genummerde rubrieken, form feeds. */
const OPMAAK_B = [
  'TESTLEERPLAN NATUURWETENSCHAPPEN',
  '1 Materie',
  '1.1 Deeltjesmodel',
  '1.1.1 De leerlingen beschrijven stoffen met het deeltjesmodel (ET 1.1)',
  '1.1.2 De leerlingen verklaren aggregatietoestanden met de be-',
  'weging van deeltjes en de onderlinge afstand tussen die deel-',
  'tjes in een vaste stof, een vloeistof en een gas (ET 1.2; ET 1.3)',
  'Kopregel testleerplan NW',
  '\fKopregel testleerplan NW',
  '1.2 Mengsels',
  '1.2.1 De leerlingen onderscheiden zuivere stoffen en mengsels (ET 1.4)',
  '1.2.2U De leerlingen scheiden een mengsel met een \u00adzelfgekozen techniek (ET 1.5)',
  '12',
  '\fKopregel testleerplan NW',
  '2 Energie',
  '2.1 Energieomzettingen',
  '2.1.1 De leerlingen herkennen energieomzettingen in “alledaagse” toestellen (ET 2.1)',
  '2.1.3 De leerlingen berekenen het rendement van een toestel (ET 2.3)',
  '13',
  '\fKopregel testleerplan NW',
].join('\n');

/** Opmaak (c): eenvoudige nummering, pagina's als blokken tussen lege regels, paginanummers. */
function opmaakC(): string {
  const kop = 'Testleerplan Frans – graad 1';
  const pagina1 = [
    kop,
    'Inleiding bij dit verzonnen leerplan.',
    'Het telt enkele doelen.',
    'Spreken',
    '1. De leerlingen stellen zichzelf voor in eenvoudige zinnen.',
    '2. De leerlingen vragen en geven informatie over',
    'hun familie, hun school en hun vrije-',
    'tijd.',
    '1',
  ];
  const pagina2 = [
    kop,
    'Luisteren',
    '3. De leerlingen begrijpen korte, duidelijke boodschappen.',
    '4. De leerlingen halen informatie uit een kort gesprek',
    'over vertrouwde onderwerpen.',
    'Uitbreidingsdoel bij luisteren:',
    'Dit staat los.',
    '2',
  ];
  const pagina3 = [
    kop,
    'Lezen',
    '5. De leerlingen lezen eenvoudige teksten over het dagelijks leven',
    'en halen er de hoofdzaak uit.',
    '6. De leerlingen zoeken specifieke informatie op in een folder.',
    'Een regel om de pagina te vullen.',
    '3',
  ];
  return [pagina1.join('\n'), pagina2.join('\n'), pagina3.join('\n')].join('\n\n');
}

describe('leesLeerplan: opmaak (a) met LPD-nummers', () => {
  const res = leesLeerplan(OPMAAK_A);

  it('kiest het LPD-patroon en vindt alle doelen in volgorde', () => {
    expect(res.patroon).toEqual({ naam: 'LPD-nummers', voorbeeld: 'LPD 1' });
    expect(res.doelen.map((d) => d.code)).toEqual(['LPD 1', 'LPD 2', 'LPD 3', 'LPD 4', 'LPD 5', 'LPD 6']);
  });

  it('herstelt de afbreking en houdt "natuur- en"', () => {
    expect(res.doelen[0].tekst).toBe('De leerlingen beschrijven de verwering van gesteenten en de vorming van bodems.');
    expect(res.doelen[2].tekst).toBe(
      'De leerlingen leggen verbanden tussen natuur- en milieufactoren en het bodemgebruik in hun eigen omgeving.',
    );
  });

  it('haalt verwijzingen eronder en tussen haakjes uit de tekst, letterlijk', () => {
    expect(res.doelen[0].refsBron).toBe('MD 09.02');
    expect(res.doelen[1]).toMatchObject({ tekst: 'De leerlingen onderscheiden bodemtypes op basis van textuur en kleur.', refsBron: 'MD 09.02, 09.03' });
    expect(res.doelen[2].refsBron).toBe('Minimumdoelen: 09.03');
    expect(res.doelen[3].refsBron).toBe('MD 09.01-09.03');
    expect(res.doelen[4]).not.toHaveProperty('refsBron');
  });

  it('kent rubrieken toe, ook na een paginagrens, en laat wenken buiten het doel', () => {
    expect(res.doelen.map((d) => d.rubriek)).toEqual([
      'Bodem en gesteenten', 'Bodem en gesteenten', 'Bodem en gesteenten', 'Landschappen', 'Landschappen', 'Landschappen',
    ]);
    expect(res.doelen[2].tekst).not.toContain('Wenken');
    expect(res.doelen[3].tekst).toBe('De leerlingen situeren landschappen op een kaart.');
  });

  it('houdt een doel heel over een paginagrens met kopregel, en schrijft ligaturen uit', () => {
    expect(res.doelen[5].tekst).toBe('De leerlingen verklaren het ontstaan van een riviervallei aan de hand van een kaart.');
    expect(res.doelen[5].refsBron).toBe('ET 9.1');
    expect(res.doelen[4].tekst).toBe('De leerlingen vergelijken floodplains in verschillende klimaten.');
  });

  it('herkent uitbreiding onder een kop "Uitbreiding" en meldt dat als onzeker', () => {
    expect(res.doelen.map((d) => d.niveau)).toEqual([undefined, undefined, undefined, undefined, 'uitbreiding', 'uitbreiding']);
    expect(res.waarschuwingen.some((w) => w.includes('"Uitbreiding"'))).toBe(true);
  });

  it('geeft regelnummers en ruwe bronfragmenten', () => {
    expect(res.doelen[0].regel).toBe(5);
    expect(res.doelen[0].bronFragment).toBe('LPD 1 De leerlingen beschrijven de verwe-\nring van gesteenten en de vorming van bodems.\n(MD 09.02)');
    expect(res.doelen[5].bronFragment.split('\n')).toHaveLength(4);
  });

  it('slaat paginamarkeringen en de herhaalde kopregel over en telt ze', () => {
    expect(res.genegeerdeRegels).toBe(6);
    expect(res.doelen.some((d) => d.tekst.includes('Testleerplan'))).toBe(false);
  });
});

describe('leesLeerplan: opmaak (b) met samengestelde nummers', () => {
  const res = leesLeerplan(OPMAAK_B);

  it('kiest de nummers met drie delen en gebruikt die met twee delen als rubriek', () => {
    expect(res.patroon?.naam).toBe('samengestelde nummers met 3 delen');
    expect(res.doelen.map((d) => d.code)).toEqual(['1.1.1', '1.1.2', '1.2.1', '1.2.2U', '2.1.1', '2.1.3']);
    expect(res.doelen.map((d) => d.rubriek)).toEqual([
      '1.1 Deeltjesmodel', '1.1 Deeltjesmodel', '1.2 Mengsels', '1.2 Mengsels', '2.1 Energieomzettingen', '2.1 Energieomzettingen',
    ]);
  });

  it('leest een doel over drie regels met afbreking en de verwijzing achteraan', () => {
    expect(res.doelen[1].tekst).toBe(
      'De leerlingen verklaren aggregatietoestanden met de beweging van deeltjes en de onderlinge afstand tussen die deeltjes in een vaste stof, een vloeistof en een gas',
    );
    expect(res.doelen[1].refsBron).toBe('ET 1.2; ET 1.3');
    expect(res.doelen[0]).toMatchObject({ tekst: 'De leerlingen beschrijven stoffen met het deeltjesmodel', refsBron: 'ET 1.1' });
  });

  it('herkent "U" achter de code als uitbreiding en haalt zachte afbreekstreepjes weg', () => {
    expect(res.doelen[3]).toMatchObject({ code: '1.2.2U', niveau: 'uitbreiding' });
    expect(res.doelen[3].tekst).toBe('De leerlingen scheiden een mengsel met een zelfgekozen techniek');
    expect(res.doelen.filter((d) => d.niveau === 'uitbreiding')).toHaveLength(1);
  });

  it('laat typografische aanhalingstekens staan zoals in de bron', () => {
    expect(res.doelen[4].tekst).toContain('“alledaagse”');
  });

  it('meldt het gat in de nummering en negeert kopregels en paginanummers', () => {
    expect(res.waarschuwingen.some((w) => w.startsWith('2.1.2 ontbreekt'))).toBe(true);
    expect(res.genegeerdeRegels).toBe(6);
  });
});

describe('leesLeerplan: opmaak (c) met eenvoudige nummers', () => {
  const res = leesLeerplan(opmaakC());

  it('kiest eenvoudige nummers en vindt de doelen', () => {
    expect(res.patroon).toEqual({ naam: 'eenvoudige nummers', voorbeeld: '1' });
    expect(res.doelen.map((d) => d.code)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(res.doelen.map((d) => d.rubriek)).toEqual(['Spreken', 'Spreken', 'Luisteren', 'Luisteren', 'Lezen', 'Lezen']);
  });

  it('leest een doel over drie regels; "vrije-" + "tijd" wordt "vrijetijd" (kleine letters aan beide kanten)', () => {
    expect(res.doelen[1].tekst).toBe('De leerlingen vragen en geven informatie over hun familie, hun school en hun vrijetijd.');
    expect(res.doelen[4].tekst).toBe('De leerlingen lezen eenvoudige teksten over het dagelijks leven en halen er de hoofdzaak uit.');
  });

  it('negeert de kopregel op elke pagina en de paginanummers', () => {
    expect(res.genegeerdeRegels).toBe(6);
    expect(res.doelen.some((d) => d.tekst.includes('Testleerplan'))).toBe(false);
  });

  it('meldt "uitbreidingsdoel" in de tekst als onzekere herkenning, zonder zelf een niveau te raden', () => {
    expect(res.doelen.every((d) => d.niveau === undefined)).toBe(true);
    expect(res.waarschuwingen.some((w) => w.includes('"uitbreiding"'))).toBe(true);
  });
});

describe('leesLeerplan: randgevallen', () => {
  it('lege tekst', () => {
    const res = leesLeerplan('');
    expect(res.doelen).toEqual([]);
    expect(res.patroon).toBeUndefined();
    expect(res.waarschuwingen).toHaveLength(1);
    expect(res.genegeerdeRegels).toBe(0);
  });

  it('alleen proza', () => {
    const res = leesLeerplan(
      'Dit is een inleiding zonder doelen.\nZe vertelt over de visie van het leerplan.\n\nOok de tweede alinea heeft geen nummering.',
    );
    expect(res.doelen).toEqual([]);
    expect(res.waarschuwingen[0]).toContain('geen nummering');
  });

  it('één doel', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tekenen een eenvoudige plattegrond.');
    expect(res.doelen).toEqual([
      {
        code: 'LPD 1',
        tekst: 'De leerlingen tekenen een eenvoudige plattegrond.',
        regel: 1,
        bronFragment: 'LPD 1 De leerlingen tekenen een eenvoudige plattegrond.',
      },
    ]);
    expect(res.waarschuwingen).toEqual([]);
  });

  it('meldt dubbele codes', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\nLPD 2 De leerlingen wegen.');
    expect(res.doelen).toHaveLength(3);
    expect(res.waarschuwingen.some((w) => w.includes('LPD 2 komt 2 keer voor (regels 2, 3)'))).toBe(true);
  });

  it('meldt mogelijke tweekoloms opmaak', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tellen. LPD 4 De leerlingen wegen.\nLPD 2 De leerlingen meten. LPD 5 De leerlingen gieten.\nLPD 3 De leerlingen rekenen.');
    expect(res.waarschuwingen.some((w) => w.includes('twee kolommen') && w.includes('LPD 1 en LPD 4'))).toBe(true);
  });

  it('meldt twee patronen die ongeveer even sterk zijn', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\nAAR 1 De leerlingen lezen kaarten.\nAAR 2 De leerlingen tekenen.');
    expect(res.waarschuwingen.some((w) => w.startsWith('Twee nummeringen'))).toBe(true);
    expect(res.patroon?.naam).toBe('LPD-nummers');
  });

  it('herkent afkorting en nummer, ook "LPD12" zonder spatie, en code alleen op een regel', () => {
    expect(leesLeerplan('AAR 2.1 De leerlingen lezen kaarten.\nAAR 2.2 De leerlingen tekenen.').doelen.map((d) => d.code)).toEqual(['AAR 2.1', 'AAR 2.2']);
    expect(leesLeerplan('LPD12 De leerlingen tellen.').doelen[0].code).toBe('LPD 12');
    const los = leesLeerplan('LPD 7\nDe leerlingen tekenen\neen kaart.\nLPD 8 (U) De leerlingen meten.');
    expect(los.doelen).toMatchObject([
      { code: 'LPD 7', tekst: 'De leerlingen tekenen een kaart.' },
      { code: 'LPD 8', tekst: 'De leerlingen meten.', niveau: 'uitbreiding' },
    ]);
  });

  it('een kop "Uitbreiding" geldt tot de volgende rubriek, ook als er meteen een rubriek op volgt', () => {
    const res = leesLeerplan(
      ['Bodem', 'LPD 1 De leerlingen tellen.', 'Uitbreiding', 'Klimaat', 'LPD 2 De leerlingen meten.', 'LPD 3 De leerlingen wegen.', 'Water', 'LPD 4 De leerlingen gieten.'].join('\n'),
    );
    expect(res.doelen.map((d) => [d.code, d.rubriek, d.niveau])).toEqual([
      ['LPD 1', 'Bodem', undefined],
      ['LPD 2', 'Klimaat', 'uitbreiding'],
      ['LPD 3', 'Klimaat', 'uitbreiding'],
      ['LPD 4', 'Water', undefined],
    ]);
    expect(res.waarschuwingen.some((w) => w.startsWith('2 doelen staan onder een kop "Uitbreiding"'))).toBe(true);
  });

  it('neemt een opsomming onder een doel mee, maar niet de toelichting erna', () => {
    const res = leesLeerplan(
      ['LPD 1 De leerlingen onderscheiden:', '• gesteenten;', '• bodems.', 'Toelichting', '• geen doel', 'LPD 2 De leerlingen meten.'].join('\n'),
    );
    expect(res.doelen[0].tekst).toBe('De leerlingen onderscheiden: gesteenten; bodems.');
    expect(res.doelen[1].tekst).toBe('De leerlingen meten.');
  });
});

describe('naarCurriculumGoals', () => {
  it('maakt gesaneerde leerplandoelen zonder refs', () => {
    const goals = naarCurriculumGoals(leesLeerplan(OPMAAK_A));
    expect(goals).toHaveLength(6);
    expect(goals[0]).toMatchObject({ code: 'LPD 1', theme: 'Bodem en gesteenten', refsBron: 'MD 09.02' });
    expect(goals[4]).toMatchObject({ level: 'uitbreiding' });
    expect(goals.every((g) => g.refs === undefined && typeof g.id === 'string' && g.id.length > 0)).toBe(true);
    expect(new Set(goals.map((g) => g.id)).size).toBe(6);
  });
});

describe('gedeelde tekstregels', () => {
  it('voegRegelsSamen herstelt afbreking volgens de regels', () => {
    expect(voegRegelsSamen(['verwe-', 'ring'])).toBe('verwering');
    expect(voegRegelsSamen(['natuur-', 'en milieu'])).toBe('natuur- en milieu');
    expect(voegRegelsSamen(['lees-', 'of schrijftaal'])).toBe('lees- of schrijftaal');
    expect(voegRegelsSamen(['Noord-', 'Amerika'])).toBe('Noord-Amerika');
    expect(voegRegelsSamen(['CO2-', 'uitstoot'])).toBe('CO2-uitstoot');
    expect(voegRegelsSamen(['verwe\u00ad', 'ring'])).toBe('verwering');
    expect(voegRegelsSamen(['een - ', 'streep'])).toBe('een - streep');
    expect(voegRegelsSamen(['• eerste', '', '– tweede', '-3 graden'])).toBe('eerste tweede -3 graden');
  });

  it('haalVerwijzingenUit laat haakjes met gewone tekst staan', () => {
    expect(haalVerwijzingenUit('De leerlingen (bv. MD 09.01 of later) meten.')).toEqual({ tekst: 'De leerlingen (bv. MD 09.01 of later) meten.', blokken: [] });
    expect(haalVerwijzingenUit('De leerlingen meten (zie MD 09.01).')).toEqual({ tekst: 'De leerlingen meten.', blokken: ['zie MD 09.01'] });
    expect(haalVerwijzingenUit('De leerlingen meten – MD 09.01')).toEqual({ tekst: 'De leerlingen meten', blokken: ['MD 09.01'] });
    expect(haalVerwijzingenUit('De leerlingen (ET 9.1) meten.')).toEqual({ tekst: 'De leerlingen meten.', blokken: ['ET 9.1'] });
  });

  it('kopEnVoetregels vindt paginanummers, markeringen en herhaalde randregels', () => {
    const regels = ['Kop', 'a', 'b', '— p. 2 —', 'Kop', 'c', '— p. 3 —', 'Kop', 'd', 'Pagina 4 van 9'];
    expect([...kopEnVoetregels(regels)].sort((x, y) => x - y)).toEqual([0, 3, 4, 6, 7, 9]);
    // Zonder paginagrenzen en met korte blokken: geen kopregels raden.
    expect([...kopEnVoetregels(['Wenken', 'x', '', 'Wenken', 'y', '', 'Wenken', 'z'])]).toEqual([]);
  });

  it('bronZonderOpmaak voegt een doel over een paginagrens weer samen', () => {
    expect(bronZonderOpmaak(OPMAAK_A)).toContain('een riviervallei aan de hand van een kaart.');
  });

  it('gatenInNummering vindt gaten per reeks, ook vooraan, en telt dieper genummerde codes mee', () => {
    const gaten = gatenInNummering(['LPD 1', 'LPD 2', 'LPD 6', 'LPD 8', '2.1', '2.2', '2.4', '3.2']);
    expect(gaten.map((g) => [g.reeks, g.ontbrekend, g.voorIndex])).toEqual([
      ['LPD ', ['LPD 3', 'LPD 4', 'LPD 5'], 2],
      ['LPD ', ['LPD 7'], 3],
      ['2.', ['2.3'], 6],
      ['3.', ['3.1'], 7],
    ]);
    expect(gatenInNummering(['1.1', '1.2.1', '1.3'])).toEqual([]);
    expect(gatenInNummering(['LPD 1', 'LPD 2U', 'LPD 3'])).toEqual([]);
    expect(gatenInNummering(['09.01', '09.03'])[0].ontbrekend).toEqual(['09.02']);
    expect(gatenInNummering([])).toEqual([]);
  });
});
