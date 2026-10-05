import { describe, expect, it } from 'vitest';
import {
  bronZonderOpmaak,
  gatenInNummering,
  haalVerwijzingenUit,
  haalVerwijzingenUitMetPosities,
  kopEnVoetregels,
  leesLeerplan,
  naarCurriculumGoals,
  regelsMetDoelcode,
  samengevoegdeCode,
  splitsRegels,
  voegRegelsSamen,
  voegRegelsSamenMetAfbrekingen,
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
    expect(res.waarschuwingen.some((w) => w.includes('De code LPD 2 komt 2 keer voor.'))).toBe(true);
    // Het doel wordt genoemd, geen regelnummer.
    expect(res.waarschuwingen.every((w) => !/\bregels?\s+\d/i.test(w))).toBe(true);
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

  it('gatenInNummering blijft snel bij een heel lange code', () => {
    const start = performance.now();
    expect(gatenInNummering([`${'1'.repeat(20000)}a1`, 'x'.repeat(20000)])).toEqual([]);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

// ── Ronde 2: bevindingen van de review (scenario's van de rechter, nagemaakt) ──

const ZACHT = String.fromCharCode(0xad);

describe('splitsRegels', () => {
  it('kent alle regeleinden en houdt een form feed vooraan zijn regel', () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    expect(splitsRegels(`a\r\nb\rc\nd${LS}e${PS}f`)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(splitsRegels('a\fb\n\fc')).toEqual(['a', '\fb', '\fc']);
    expect(splitsRegels('')).toEqual(['']);
  });

  it('de lezer leest doelen die met U+2028 gescheiden zijn als aparte doelen', () => {
    const LS = String.fromCharCode(0x2028);
    const res = leesLeerplan(`LPD 1 De leerlingen kunnen A.${LS}LPD 2 De leerlingen kunnen B.${LS}LPD 3 De leerlingen kunnen C.`);
    expect(res.doelen.map((d) => [d.code, d.tekst])).toEqual([
      ['LPD 1', 'De leerlingen kunnen A.'], ['LPD 2', 'De leerlingen kunnen B.'], ['LPD 3', 'De leerlingen kunnen C.'],
    ]);
  });
});

describe('leesLeerplan: een regel met een kleine letter loopt door', () => {
  it('ook na een afkorting met een punt ("o.a.", "t.o.v."), met en zonder lege regel', () => {
    for (const tussen of ['\n', '\n\n']) {
      const oa = leesLeerplan(`LPD 1 De leerlingen kunnen verschillende reliëfvormen benoemen, o.a.${tussen}bergen, dalen en vlakten, op een kaart aanduiden.\nLPD 2 De leerlingen kunnen een kaart lezen.`);
      expect(oa.doelen[0].tekst).toBe('De leerlingen kunnen verschillende reliëfvormen benoemen, o.a. bergen, dalen en vlakten, op een kaart aanduiden.');
      expect(oa.doelen[1].tekst).toBe('De leerlingen kunnen een kaart lezen.');
      const tov = leesLeerplan(`LPD 1 De leerlingen situeren België t.o.v.${tussen}de buurlanden op een kaart.\nLPD 2 De leerlingen kunnen een kaart lezen.`);
      expect(tov.doelen[0].tekst).toBe('De leerlingen situeren België t.o.v. de buurlanden op een kaart.');
    }
  });

  it('ook na een verwijzing op een eigen regel, maar niet na een regel die er niet bij hoort', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tellen, o.a.\n(MD 09.01)\nappels en peren.\nWenken\nde leerkracht toont dit.\nLPD 2 De leerlingen meten.');
    expect(res.doelen[0]).toMatchObject({ tekst: 'De leerlingen tellen, o.a. appels en peren.', refsBron: 'MD 09.01' });
    expect(res.doelen[1].tekst).toBe('De leerlingen meten.');
  });

  it('een tweede zin met een hoofdletter na een punt hoort er niet bij (zoals vroeger)', () => {
    const res = leesLeerplan('LPD 1 De leerlingen kunnen een kaart lezen.\nZe gebruiken daarbij de legende.\nLPD 2 De leerlingen kunnen een kompas gebruiken.');
    expect(res.doelen.map((d) => d.tekst)).toEqual(['De leerlingen kunnen een kaart lezen.', 'De leerlingen kunnen een kompas gebruiken.']);
  });
});

describe('leesLeerplan: wat niet gelezen werd, wordt gemeld', () => {
  it('een regel met een code van het patroon die geen doel werd, met het doel erbij (geen regelnummer)', () => {
    const res = leesLeerplan('LPD 1 De leerlingen kunnen een kaart lezen.\nLPD 2 De leerlingen kunnen een kompas gebruiken.\nLPD 3 aan de hand van een kaart de ligging bepalen.');
    expect(res.doelen.map((d) => d.code)).toEqual(['LPD 1', 'LPD 2']);
    expect(res.waarschuwingen).toContain(
      'Bij LPD 3 las Boosterz geen doel ("LPD 3 aan de hand van een kaart de ligging bepalen."). Kijk na of daar een doel staat.',
    );
    const drieD = leesLeerplan('LPD 1 De leerlingen kunnen een kaart lezen.\nLPD 2 De leerlingen kunnen een kompas gebruiken.\nLPD 3 3D-vormen herkennen.');
    expect(drieD.waarschuwingen.some((w) => w.startsWith('Bij LPD 3 las Boosterz geen doel'))).toBe(true);
  });

  it('werkt ook bij samengestelde nummers, maar meldt geen kop met minder delen ("1.2 Mengsels")', () => {
    const res = leesLeerplan('1.1.1 De leerlingen tellen.\n1.1.2 De leerlingen meten.\n1.2 Mengsels\n1.2.1 (zie bijlage 3)\n1.2.2 De leerlingen wegen.');
    expect(res.doelen.map((d) => d.code)).toEqual(['1.1.1', '1.1.2', '1.2.2']);
    expect(res.waarschuwingen.some((w) => w.startsWith('Bij 1.2 '))).toBe(false);
    expect(res.waarschuwingen.some((w) => w.startsWith('Bij 1.2.1 las Boosterz geen doel'))).toBe(true);
  });

  it('meldt elke code: de eerste 20 apart, de rest samen met hun codes', () => {
    const regels = ['LPD 1 De leerlingen tellen.', ...Array.from({ length: 25 }, (_, i) => `LPD ${i + 2} en verder`)];
    const res = leesLeerplan(regels.join('\n'));
    expect(res.waarschuwingen.filter((w) => /^Bij LPD \d+ las Boosterz geen doel/.test(w)).length).toBe(20);
    expect(res.waarschuwingen).toContain('Nog meer codes staan vooraan een regel maar werden geen doel: LPD 22, LPD 23, LPD 24, LPD 25, LPD 26. Kijk na of daar doelen staan.');
  });

  it('een tweede nummering met "De leerlingen", ook onder de drempel van 80 %', () => {
    const lpd = [1, 2, 3, 4, 5].map((n) => `LPD ${n} De leerlingen kunnen ding ${n} doen.`).join('\n');
    const res = leesLeerplan(`${lpd}\n1.2.3 De leerlingen kunnen iets anders doen.\n1.2.4 De leerlingen kunnen nog iets doen.`);
    expect(res.doelen).toHaveLength(5);
    expect(res.waarschuwingen.some((w) => w.startsWith('Twee nummeringen'))).toBe(false);
    expect(res.waarschuwingen).toContain(
      'Er staan ook doelen in een andere nummering: nummers zoals 1.2.3 (2 keer). Boosterz las alleen nummers zoals LPD 1; kijk na of die doelen erbij horen.',
    );
  });

  it('codes vooraan zonder doelzin (de stam staat erboven): een hint', () => {
    const res = leesLeerplan('De leerlingen kunnen\nLPD 1 een kaart lezen.\nLPD 2 een kompas gebruiken.\nLPD 3 de ligging bepalen.');
    expect(res.doelen).toEqual([]);
    expect(res.waarschuwingen[1]).toContain('Er staan wel codes vooraan een regel (bv. LPD 1, LPD 2, LPD 3)');
    // Geen "voeg de doelen met de hand toe": wel de vraag of de tekst de doelen met hun code bevat.
    expect(res.waarschuwingen.join(' ')).not.toMatch(/met de hand/);
    expect(res.waarschuwingen[0]).toContain('Kijk na of de tekst de doelen met hun code bevat.');
  });
});

describe('leesLeerplan: afbreking en paginanummers', () => {
  it('herstelt een afbreking niet stil: elk samengevoegd woord staat bij het doel en in de waarschuwingen', () => {
    const res = leesLeerplan('LPD 1 De leerlingen kunnen een e-\nmail versturen.\nLPD 2 De leerlingen kunnen een auto-\nongeluk melden over sociaal-\neconomische zaken.');
    expect(res.doelen[0]).toMatchObject({ tekst: 'De leerlingen kunnen een email versturen.', afbrekingen: ['e-|mail → email'] });
    expect(res.doelen[1].afbrekingen).toEqual(['auto-|ongeluk → autoongeluk', 'sociaal-|economische → sociaaleconomische']);
    expect(res.waarschuwingen).toContain('LPD 1: afbreking hersteld: e-|mail → email; kijk na of het streepje bij het woord hoort.');
    // Een streepje dat blijft ("Noord-Amerika") of een voegwoord ("natuur- en") is geen herstel.
    expect(leesLeerplan('LPD 1 De leerlingen situeren Noord-\nAmerika en natuur-\nen milieu.').doelen[0]).not.toHaveProperty('afbrekingen');
  });

  it('voegt een zacht afbreekstreepje aan het regeleinde samen, en meldt het', () => {
    const res = leesLeerplan(`LPD 1 De leerlingen kunnen de verwe${ZACHT}\nring van gesteenten uitleggen.\nLPD 2 De leerlingen kunnen B.`);
    expect(res.doelen[0]).toMatchObject({ tekst: 'De leerlingen kunnen de verwering van gesteenten uitleggen.', afbrekingen: ['verwe-|ring → verwering'] });
    // Ook over een lege regel, en midden in een vervolgregel.
    const twee = leesLeerplan(`LPD 1 De leerlingen kunnen de verwe${ZACHT}\n\nring en de ero${ZACHT}\nsie uitleggen.`);
    expect(twee.doelen[0].tekst).toBe('De leerlingen kunnen de verwering en de erosie uitleggen.');
  });

  it('een getal alleen op een regel midden in een zin is geen paginanummer', () => {
    const res = leesLeerplan('LPD 1 De leerlingen kunnen getallen tot\n1000\nordenen.\nLPD 2 De leerlingen kunnen een hoek van\n90\ngraden tekenen.');
    expect(res.doelen.map((d) => d.tekst)).toEqual(['De leerlingen kunnen getallen tot 1000 ordenen.', 'De leerlingen kunnen een hoek van 90 graden tekenen.']);
    expect(res.genegeerdeRegels).toBe(0);
  });

  it('een paginanummer aan een paginagrens midden in een doel valt weg, met een waarschuwing', () => {
    const res = leesLeerplan('LPD 1 De leerlingen kunnen getallen tot\n12\n\fordenen en vergelijken.\nLPD 2 De leerlingen meten.');
    expect(res.doelen[0].tekst).toBe('De leerlingen kunnen getallen tot ordenen en vergelijken.');
    expect(res.waarschuwingen).toContain(
      'LPD 1: Boosterz sloeg het getal "12" over als paginanummer, midden in het doel. Kijk na of dat getal bij de tekst hoort.',
    );
  });

  it('kopEnVoetregels: een getal is alleen een paginanummer aan de rand van een pagina', () => {
    const pagina = (n: number) => ['Kop', `LPD ${n} De leerlingen tellen.`, 'a', 'b', 'c', 'd', 'e', String(n)];
    const regels = [...pagina(1), '', ...pagina(2), '', ...pagina(3)];
    const opmaak = kopEnVoetregels(regels);
    expect([7, 16, 25].every((i) => opmaak.has(i))).toBe(true);
    // Midden op een pagina: inhoud.
    const midden = ['LPD 1 De leerlingen tellen.', 'a', 'b', 'c', '42', 'd', 'e', 'f', 'g'];
    expect(kopEnVoetregels(midden).has(4)).toBe(false);
  });
});

describe('leesLeerplan: de berichten zijn voor de leerkracht (geen "de lezer", geen regelnummer)', () => {
  const LASTIGE_TEKSTEN = [
    'Dit is een inleiding zonder doelen.\nZe vertelt over de visie.',
    'De leerlingen kunnen\nLPD 1 een kaart lezen.\nLPD 2 een kompas gebruiken.',
    'LPD 1 De leerlingen tellen.\nLPD 2\nLPD 3 De leerlingen meten.',
    'LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\nLPD 2 De leerlingen wegen.',
    'LPD 1 De leerlingen tellen. LPD 4 De leerlingen wegen.\nLPD 2 De leerlingen meten. LPD 5 De leerlingen gieten.',
    'LPD 1 De leerlingen kunnen een e-\nmail versturen.',
    'LPD 1 De leerlingen kunnen getallen tot\n12\n\fordenen en vergelijken.\nLPD 2 De leerlingen meten.',
    'LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\n1.2.3 De leerlingen kunnen iets anders doen.\n1.2.4 De leerlingen kunnen nog iets doen.',
  ];

  it('geen enkele melding noemt "de lezer", een regelnummer of "met de hand"', () => {
    for (const tekst of LASTIGE_TEKSTEN) {
      for (const w of leesLeerplan(tekst).waarschuwingen) {
        expect(w, w).not.toMatch(/\blezer\b|\bregels?\s+\d|\(regel|met de hand/i);
      }
    }
  });

  it('een doel zonder tekst: bij welk doel', () => {
    const res = leesLeerplan('LPD 1 De leerlingen tellen.\nLPD 2\nLPD 3 De leerlingen meten.');
    expect(res.waarschuwingen).toContain('LPD 2 ontbreekt: staat het niet in de bron, of vond Boosterz het niet?');
    expect(res.waarschuwingen).toContain('Bij LPD 2 las Boosterz geen doel ("LPD 2"). Kijk na of daar een doel staat.');
  });

  it('het woord "uitbreiding" op een onbekende plaats: bij het doel, anders op de bladzijde, anders zonder plaats', () => {
    const inDoel = leesLeerplan('LPD 1 De leerlingen kunnen tellen (uitbreidingsdoel voor sterke leerlingen).\nLPD 2 De leerlingen meten.');
    expect(inDoel.waarschuwingen[0]).toMatch(/^Bij LPD 1 staat het woord "uitbreiding" op een plaats die Boosterz niet kon thuisbrengen\./);
    const opPagina = leesLeerplan('— p. 2 —\nLPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\n\n— p. 3 —\nToelichting: (uitbreiding) voor wie sneller werkt.');
    expect(opPagina.waarschuwingen[0]).toMatch(/^Op bladzijde 3 staat het woord "uitbreiding"/);
    const zonderPlaats = leesLeerplan('LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.\n\nToelichting: (uitbreiding) voor wie sneller werkt.');
    expect(zonderPlaats.waarschuwingen[0]).toMatch(/^In de tekst staat het woord "uitbreiding"/);
  });

  it('zonder nummering: kijk na of de tekst de doelen met hun code bevat', () => {
    const res = leesLeerplan('Dit is een inleiding zonder doelen.');
    expect(res.waarschuwingen).toEqual([
      'Boosterz vond geen nummering van doelen (zoals "LPD 12", "1.2.3" of "AAR 2.1") vooraan een regel. Kijk na of de tekst de doelen met hun code bevat.',
    ]);
  });
});

describe('voegRegelsSamenMetAfbrekingen en haalVerwijzingenUitMetPosities', () => {
  it('legt elke herstelde afbreking vast met de plaats in de tekst', () => {
    const r = voegRegelsSamenMetAfbrekingen(['een e-', 'mail en de verwe' + ZACHT, 'ring', 'Noord-', 'Amerika']);
    expect(r.tekst).toBe('een email en de verweringNoord-Amerika'.replace('verweringNoord', 'verwering Noord'));
    expect(r.afbrekingen.map((a) => [a.links, a.rechts, a.woord, r.tekst.slice(a.plaats, a.plaats + a.rechts.length)])).toEqual([
      ['e-', 'mail', 'email', 'mail'],
      ['verwe-', 'ring', 'verwering', 'ring'],
    ]);
  });

  it('is lineair: 1 MB tekst samenvoegen duurt niet lang', () => {
    const regels = Array.from({ length: 20000 }, (_, i) => `regel ${i} met wat tekst die afgebroken wordt aan het einde van de re-`);
    const start = performance.now();
    const r = voegRegelsSamenMetAfbrekingen(regels);
    expect(performance.now() - start).toBeLessThan(300);
    expect(r.afbrekingen).toHaveLength(19999);
  });

  it('geeft voor elk teken zonder verwijzingen de plaats in de oorspronkelijke tekst', () => {
    const tekst = '  De leerlingen  meten (MD 09.01), wegen (zie ET 9.1) en  tellen – MD 09.02 ';
    const r = haalVerwijzingenUitMetPosities(tekst);
    expect(r.tekst).toBe(haalVerwijzingenUit(tekst).tekst);
    expect(r.tekst).toBe('De leerlingen meten, wegen en tellen');
    expect(r.bron).toHaveLength(r.tekst.length);
    r.bron.forEach((p, i) => {
      if (r.tekst[i] === ' ') expect(/\s/.test(tekst[p])).toBe(true);
      else expect(tekst[p]).toBe(r.tekst[i]);
      if (i > 0) expect(p).toBeGreaterThan(r.bron[i - 1]);
    });
  });
});

describe('voor de controlepoort: regelsMetDoelcode en samengevoegdeCode', () => {
  it('regelsMetDoelcode geeft elke regel die met een doelcode begint, zonder opmaak', () => {
    const regels = ['Kop', 'LPD 3 aan de hand van een kaart', '2.3 Energie', '2.3.1 De leerlingen meten.', '12'];
    const uit = regelsMetDoelcode(regels, new Set([4]));
    expect(uit.map((c) => [c.regel, c.code, c.telt])).toEqual([
      [2, 'LPD 3', true],
      [3, '2.3', false],
      [4, '2.3.1', true],
    ]);
  });

  it('samengevoegdeCode vindt een tweede doel in een doeltekst', () => {
    expect(samengevoegdeCode('De leerlingen kunnen A. LPD 2 De leerlingen kunnen B.', 'LPD 1')).toBe('LPD 2');
    expect(samengevoegdeCode('De leerlingen kunnen A. LPD 2 Ze kunnen B.', 'LPD 1')).toBe('LPD 2');
    expect(samengevoegdeCode('De leerlingen tellen 1.2.4 De leerlingen meten.', '1.2.3')).toBe('1.2.4');
    expect(samengevoegdeCode('De leerlingen tellen. 4. De leerlingen meten.', '3')).toBe('4');
    // Geen tweede doel: een verwijzing, een getal in de tekst, een code zonder doelzin.
    expect(samengevoegdeCode('De leerlingen tellen (MD 09.01) De leerlingen.', 'LPD 1')).toBeUndefined();
    expect(samengevoegdeCode('De leerlingen zien LPD 2 Bodem als basis.', 'LPD 1')).toBeUndefined();
    expect(samengevoegdeCode('De leerlingen tellen tot 1.2 meter.', '1.2')).toBeUndefined();
    expect(samengevoegdeCode('De leerlingen kunnen A.', 'LPD 1')).toBeUndefined();
    expect(samengevoegdeCode('x', '')).toBeUndefined();
  });
});

describe('leesLeerplan: snelheid', () => {
  it('leest 1 MB tekst ruim binnen de tijd', () => {
    const regels: string[] = [];
    let lengte = 0;
    for (let n = 0; lengte < 1024 * 1024; n++) {
      // Per rubriek opnieuw nummeren ("AAR 1.1" … "AAR 9.500"): zo blijven de codes geldig.
      const code = `AAR ${Math.floor(n / 500) + 1}.${(n % 500) + 1}`;
      for (const r of [`${code} De leerlingen kunnen een kaart lezen en daarbij de legende`, 'gebruiken om de ligging van plaatsen te bepalen in hun eigen omgeving.', 'Wenken: gebruik een atlas en oefen regelmatig met verschillende kaarten.', '']) {
        regels.push(r);
        lengte += r.length + 1;
      }
    }
    const start = performance.now();
    const res = leesLeerplan(regels.join('\n'));
    // Doel ±300 ms; de grens is ruim, zodat de test niet wiebelt op een trage machine.
    expect(performance.now() - start).toBeLessThan(900);
    expect(res.doelen.length).toBeGreaterThan(4000);
    expect(res.doelen[0].tekst).toBe('De leerlingen kunnen een kaart lezen en daarbij de legende gebruiken om de ligging van plaatsen te bepalen in hun eigen omgeving.');
  });
});
