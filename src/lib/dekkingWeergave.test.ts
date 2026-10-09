import { describe, expect, it } from 'vitest';
import type { Course, CourseSection } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import {
  dekkingMinimumdoelen,
  setsAlsKader,
  type CursusBijdrage,
  type MdDekking,
  type MdRij,
  type MdStatus,
} from './dekkingMinimumdoelen';
import {
  EERSTE_GRAAD_ZIN,
  FOUT_LADEN_DEKKING,
  FOUT_SETS_DEKKING,
  GEEN_SETS_TEKST,
  KADER_LEEG_NOOT,
  KADER_NOG_NIET_NOOT,
  KIES_JAAR_HINT,
  RICHTING_ONBEKEND_NOOT,
  buitenJaarTekst,
  buitenKaderTekst,
  cursusRegel,
  enkelOfMeer,
  geenDekkingTekst,
  geplandeRegel,
  groepeerPerSet,
  isNogNietGedekt,
  kortTekst,
  legeSetTekst,
  leerplanHeeftVerwijzingen,
  nogNietGedektZin,
  optioneelZin,
  redenTekst,
  richtingLinkNaar,
  richtingLinkTekst,
  richtingMetGraad,
  samenvattingCursus,
  samenvattingRichting,
  setSamenvatting,
  somLijst,
  statusTekst,
  titelsLijst,
  uniekeSetNamen,
  veiligeSetNaam,
  zelfdeNummerZin,
  zichtbareSets,
  type DekkingTelling,
} from './dekkingWeergave';
import type { MinimumdoelenSetBestand } from './minimumdoelen';

// ── Hulpen ──────────────────────────────────────────────────────────────────

function telling(p: Partial<DekkingTelling> = {}): DekkingTelling {
  return {
    totaal: 229, gedekt: 200, gepland: 10, verdieping: 4, open: 15, percent: 87,
    optioneel: { totaal: 0, gedekt: 0 }, zelfdeNummerAndereSet: 0,
    rijen: new Array<unknown>(229), cursussen: [{}],
    ...p,
  };
}

/** Geen enkele tekst van het scherm mag een set-id, een groepnummer of "structuuronderdeel" bevatten. */
function nooitIds(tekst: string): void {
  expect(tekst).not.toMatch(/ODS_\d|G-\d|structuuronderdeel/i);
}

// ── Kleine hulpen ───────────────────────────────────────────────────────────

describe('kleine hulpen', () => {
  it('enkelOfMeer kiest enkelvoud bij 1 en meervoud bij de rest, ook bij 0', () => {
    expect(enkelOfMeer(1, 'doel', 'doelen')).toBe('1 doel');
    expect(enkelOfMeer(0, 'doel', 'doelen')).toBe('0 doelen');
    expect(enkelOfMeer(16, 'doel', 'doelen')).toBe('16 doelen');
  });

  it('somLijst en titelsLijst', () => {
    expect(somLijst([])).toBe('');
    expect(somLijst(['a'])).toBe('a');
    expect(somLijst(['a', 'b'])).toBe('a en b');
    expect(somLijst(['a', 'b', 'c'])).toBe('a, b en c');
    expect(titelsLijst(['Biologie', 'Chemie', 'Biologie'])).toBe('‘Biologie’ en ‘Chemie’');
  });

  it('kortTekst knipt op een woordgrens en laat korte tekst met rust', () => {
    expect(kortTekst('  De leerlingen\n beschrijven de cel.  ')).toBe('De leerlingen beschrijven de cel.');
    const lang = `${'woord '.repeat(60)}einde`;
    const kort = kortTekst(lang, 50);
    expect(kort.endsWith('…')).toBe(true);
    expect(kort.length).toBeLessThanOrEqual(51);
    expect(kort).not.toMatch(/wo…$/);
    expect(kortTekst('x'.repeat(300), 40)).toBe(`${'x'.repeat(40)}…`);
  });

  it('veiligeSetNaam haalt set-id\'s weg', () => {
    expect(veiligeSetNaam('Biologie (ODS_3343)')).toBe('Biologie');
    expect(veiligeSetNaam('ODS_3343')).toBe('Een set');
    expect(veiligeSetNaam('')).toBe('Een set');
    expect(veiligeSetNaam('Set ODS_12 van mij')).toBe('Set een set van mij');
    expect(veiligeSetNaam('  Wiskunde  ')).toBe('Wiskunde');
  });

  it('uniekeSetNamen laat unieke namen staan en onderscheidt dubbele met de context, anders met een volgnummer', () => {
    const sets = [
      { set: 'ODS_1', setNaam: 'Biologie' },
      { set: 'ODS_2', setNaam: 'Biologie' },
      { set: 'ODS_3', setNaam: 'Chemie' },
    ];
    expect(uniekeSetNamen(sets, (s) => (s === 'ODS_1' ? 'Pool' : 'Domein'))).toEqual(
      new Map([['ODS_1', 'Biologie (Pool)'], ['ODS_2', 'Biologie (Domein)'], ['ODS_3', 'Chemie']]),
    );
    // Geen context: een volgnummer, zodat twee rijen nooit dezelfde naam dragen.
    expect(uniekeSetNamen(sets)).toEqual(new Map([['ODS_1', 'Biologie (1)'], ['ODS_2', 'Biologie (2)'], ['ODS_3', 'Chemie']]));
    // Dezelfde context: ook dan een volgnummer.
    expect(uniekeSetNamen(sets, () => 'Pool')).toEqual(new Map([['ODS_1', 'Biologie (Pool) (1)'], ['ODS_2', 'Biologie (Pool) (2)'], ['ODS_3', 'Chemie']]));
    expect([...uniekeSetNamen([{ set: 'ODS_9', setNaam: 'ODS_9' }]).values()]).toEqual(['Een set']);
  });
});

// ── De status van een doel ──────────────────────────────────────────────────

describe('statusTekst', () => {
  it('geeft de vier zinnen van § 14.3', () => {
    expect(statusTekst({ status: 'gedekt', via: [{ courseTitle: 'Biologie 3', status: 'gedekt' }] })).toBe('Gedekt in ‘Biologie 3’');
    expect(statusTekst({ status: 'gepland', via: [{ courseTitle: 'Biologie 3', status: 'gepland' }] })).toBe('Gepland in ‘Biologie 3’ (de sectie is nog leeg)');
    expect(statusTekst({ status: 'verdieping', via: [{ courseTitle: 'Biologie 3', status: 'verdieping' }] })).toBe('Alleen in verdieping (‘Biologie 3’)');
    expect(statusTekst({ status: 'open', via: [] })).toBe('Nog niet gedekt');
  });

  it('noemt alleen de cursussen met de beste status, elk één keer', () => {
    expect(statusTekst({
      status: 'gedekt',
      via: [
        { courseTitle: 'A', status: 'gedekt' },
        { courseTitle: 'B', status: 'gepland' },
        { courseTitle: 'C', status: 'gedekt' },
        { courseTitle: 'A', status: 'gedekt' },
      ],
    })).toBe('Gedekt in ‘A’ en ‘C’');
    expect(statusTekst({ status: 'gepland', via: [{ courseTitle: 'B', status: 'gepland' }, { courseTitle: 'C', status: 'verdieping' }] }))
      .toBe('Gepland in ‘B’ (de sectie is nog leeg)');
  });

  it('"nog niet gedekt" is alles wat niet gedekt is', () => {
    const uitkomst: Record<MdStatus, boolean> = { gedekt: false, gepland: true, verdieping: true, open: true };
    for (const [status, verwacht] of Object.entries(uitkomst)) expect(isNogNietGedekt(status as MdStatus)).toBe(verwacht);
  });
});

// ── Groeperen per set ───────────────────────────────────────────────────────

function rij(set: string, id: string, status: MdStatus): MdRij {
  return {
    doel: { set, setNaam: set, id, code: id, tekst: `Doel ${id}`, optioneel: false, verplichteSet: true },
    status, via: [],
  };
}

describe('groepeerPerSet', () => {
  const dekking = {
    rijen: [rij('A', '1', 'gedekt'), rij('A', '2', 'open'), rij('B', '3', 'gedekt'), rij('A', '4', 'gepland'), rij('C', '5', 'verdieping')],
    perSet: [
      { set: 'A', setNaam: 'Set A', totaal: 3, gedekt: 1, gepland: 1, verdieping: 0 },
      { set: 'B', setNaam: 'Set B', totaal: 1, gedekt: 1, gepland: 0, verdieping: 0 },
      { set: 'C', setNaam: 'Set C', totaal: 1, gedekt: 0, gepland: 0, verdieping: 1 },
    ],
  };

  it('houdt de volgorde van het kader en de rijen van elke set bij elkaar', () => {
    const groepen = groepeerPerSet(dekking, 'alle');
    expect(groepen.map((g) => [g.set, g.setNaam, g.totaal, g.gedekt, g.rijen.map((r) => r.doel.id)])).toEqual([
      ['A', 'Set A', 3, 1, ['1', '2', '4']],
      ['B', 'Set B', 1, 1, ['3']],
      ['C', 'Set C', 1, 0, ['5']],
    ]);
  });

  it('"nog niet gedekt" laat gedekte doelen weg, maar houdt de sets en hun tellers', () => {
    const groepen = groepeerPerSet(dekking, 'open');
    expect(groepen.map((g) => [g.set, g.totaal, g.gedekt, g.rijen.map((r) => r.doel.id)])).toEqual([
      ['A', 3, 1, ['2', '4']],
      ['B', 1, 1, []],
      ['C', 1, 0, ['5']],
    ]);
  });

  it('een lege dekking geeft geen groepen', () => {
    expect(groepeerPerSet({ rijen: [], perSet: [] }, 'alle')).toEqual([]);
  });

  it('zichtbareSets: bij "nog niet gedekt" blijven alleen de sets met iets open, bij "alle" blijven alle sets staan', () => {
    const groepen = groepeerPerSet(dekking, 'open');
    expect(zichtbareSets(groepen, 'open').map((g) => g.set)).toEqual(['A', 'C']);
    expect(zichtbareSets(groepeerPerSet(dekking, 'alle'), 'alle').map((g) => g.set)).toEqual(['A', 'B', 'C']);
    // Een set zonder doelen blijft bij "alle" staan: haar samenvatting zegt "0 van 0 gedekt".
    expect(zichtbareSets([{ set: 'Z', setNaam: 'Z', totaal: 0, gedekt: 0, rijen: [] }], 'alle')).toHaveLength(1);
    expect(zichtbareSets([], 'open')).toEqual([]);
    // De invoer wordt niet aangepast.
    expect(groepen.map((g) => g.set)).toEqual(['A', 'B', 'C']);
  });

  it('nogNietGedektZin: enkelvoud en meervoud, en niets meer open', () => {
    expect(nogNietGedektZin(0, 0)).toBe('Alle doelen zijn gedekt.');
    expect(nogNietGedektZin(1, 1)).toBe('1 doel in 1 set is nog niet gedekt. Open de set om het te zien.');
    expect(nogNietGedektZin(4, 1)).toBe('4 doelen in 1 set zijn nog niet gedekt. Open de set om ze te zien.');
    expect(nogNietGedektZin(31, 5)).toBe('31 doelen in 5 sets zijn nog niet gedekt. Open een set om ze te zien.');
    expect(nogNietGedektZin(2, 2)).toBe('2 doelen in 2 sets zijn nog niet gedekt. Open een set om ze te zien.');
  });

  it('de zin klopt met wat er na openen te zien is', () => {
    const open = zichtbareSets(groepeerPerSet(dekking, 'open'), 'open');
    const doelen = open.reduce((n, g) => n + g.rijen.length, 0);
    // A: doelen 2 (open) en 4 (gepland); C: doel 5 (verdieping): drie doelen in twee sets.
    expect(nogNietGedektZin(doelen, open.length)).toBe('3 doelen in 2 sets zijn nog niet gedekt. Open een set om ze te zien.');
  });

  it('zinnen bij een set', () => {
    expect(setSamenvatting('Biologie', 6, 8)).toBe('Biologie: 6 van 8 gedekt');
    expect(legeSetTekst('open')).toBe('Alle doelen van deze set zijn gedekt.');
    expect(legeSetTekst('alle')).toBe('Deze set heeft geen doelen.');
  });
});

// ── De samenvatting ─────────────────────────────────────────────────────────

describe('samenvattingRichting', () => {
  it('geeft de twee zinnen van § 14.3', () => {
    expect(samenvattingRichting(telling())).toBe(
      'Je cursussen dekken 200 van de 229 minimumdoelen (87 %). 10 doelen staan al gepland op een sectie die nog leeg is, 4 komen alleen in verdieping aan bod, 15 nog niet.',
    );
  });

  it('enkelvoud: 1 doel gepland, 1 in verdieping', () => {
    expect(samenvattingRichting(telling({ gedekt: 225, gepland: 1, verdieping: 1, open: 2, percent: 98 }))).toBe(
      'Je cursussen dekken 225 van de 229 minimumdoelen (98 %). 1 doel staat al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 2 nog niet.',
    );
  });

  it('alles gedekt: alleen de eerste zin', () => {
    expect(samenvattingRichting(telling({ gedekt: 229, gepland: 0, verdieping: 0, open: 0, percent: 100 })))
      .toBe('Je cursussen dekken 229 van de 229 minimumdoelen (100 %).');
  });

  it('één verplicht doel', () => {
    expect(samenvattingRichting(telling({ totaal: 1, gedekt: 0, gepland: 0, verdieping: 0, open: 1, percent: 0 })))
      .toBe('Je cursussen dekken 0 van het enige minimumdoel (0 %). 0 doelen staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 1 nog niet.');
  });

  it('zonder cursussen: de dekking is 0, met het jaar als de telling tot een jaar beperkt is', () => {
    const leeg = telling({ gedekt: 0, gepland: 0, verdieping: 0, open: 229, percent: 0, cursussen: [] });
    expect(samenvattingRichting(leeg)).toBe('Nog geen cursus voor deze richting: de dekking is 0 van de 229 doelen.');
    expect(samenvattingRichting(leeg, 4)).toBe('Nog geen cursus voor het 4de jaar: de dekking is 0 van de 229 doelen.');
    expect(samenvattingRichting(telling({ totaal: 1, gedekt: 0, open: 1, gepland: 0, verdieping: 0, percent: 0, cursussen: [] })))
      .toBe('Nog geen cursus voor deze richting: de dekking is 0 van het enige doel.');
  });

  it('een kader zonder (verplichte) doelen', () => {
    expect(samenvattingRichting(telling({ rijen: [], totaal: 0 }))).toBe('Er zijn geen minimumdoelen om te dekken.');
    expect(samenvattingRichting(telling({ totaal: 0 }))).toBe('Er zijn geen verplichte minimumdoelen om te dekken.');
  });
});

describe('samenvattingCursus', () => {
  it('noemt de richting met de graad, of de sets van het leerplan', () => {
    const t = telling({ totaal: 40, gedekt: 3, gepland: 5, verdieping: 0, open: 32, percent: 8, rijen: new Array<unknown>(41) });
    expect(samenvattingCursus(t, richtingMetGraad('Latijn', 2))).toBe(
      'Deze cursus dekt 3 van de 40 minimumdoelen van Latijn (2de graad). 5 doelen staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 32 nog niet.',
    );
    expect(samenvattingCursus(t, 'de sets van je leerplan')).toMatch(/^Deze cursus dekt 3 van de 40 minimumdoelen van de sets van je leerplan\. /);
  });

  it('alles gedekt, één doel en geen doelen', () => {
    expect(samenvattingCursus(telling({ totaal: 12, gedekt: 12, gepland: 0, verdieping: 0, open: 0, percent: 100 }), 'X (1ste graad)'))
      .toBe('Deze cursus dekt 12 van de 12 minimumdoelen van X (1ste graad).');
    expect(samenvattingCursus(telling({ totaal: 1, gedekt: 1, gepland: 0, verdieping: 0, open: 0, percent: 100 }), 'X'))
      .toBe('Deze cursus dekt 1 van het enige minimumdoel van X.');
    expect(samenvattingCursus(telling({ rijen: [], totaal: 0 }), 'X')).toBe('Er zijn geen minimumdoelen om te dekken.');
  });

  it('richtingMetGraad laat de graad weg als ze er niet is', () => {
    expect(richtingMetGraad('Kantoor', undefined)).toBe('Kantoor');
    expect(richtingMetGraad('Kantoor', 3)).toBe('Kantoor (3de graad)');
    expect(richtingMetGraad('Handel', 1)).toBe('Handel (1ste graad)');
  });
});

describe('zinnen over optionele doelen en andere versies', () => {
  it('optioneelZin: meervoud, enkelvoud en leeg', () => {
    expect(optioneelZin({ totaal: 7, gedekt: 2 })).toBe('Daarnaast zijn er 7 optionele doelen en uitbreidingsdoelen. Die tellen niet mee in het percentage (2 gedekt).');
    expect(optioneelZin({ totaal: 1, gedekt: 0 })).toBe('Daarnaast is er 1 optioneel doel of uitbreidingsdoel. Dat telt niet mee in het percentage (0 gedekt).');
    expect(optioneelZin({ totaal: 0, gedekt: 0 })).toBe('');
  });

  it('zelfdeNummerZin: meervoud, enkelvoud en leeg', () => {
    expect(zelfdeNummerZin(3)).toBe('3 doelen zouden ook meetellen als verwijzingen naar een andere versie of soort van dezelfde set meetellen.');
    expect(zelfdeNummerZin(1)).toBe('1 doel zou ook meetellen als verwijzingen naar een andere versie of soort van dezelfde set meetellen.');
    expect(zelfdeNummerZin(0)).toBe('');
  });

  it('de vaste zinnen', () => {
    expect(EERSTE_GRAAD_ZIN).toBe('In de 1ste graad tellen de cursussen van het 1ste en het 2de jaar samen: de minimumdoelen gelden voor de hele graad.');
    expect(geenDekkingTekst('nog-niet-opgehaald')).toMatch(/nog niet opgehaald/);
    expect(geenDekkingTekst('geen')).toMatch(/koppelt geen minimumdoelen/);
    expect(FOUT_SETS_DEKKING).toMatch(/dekking kan nu niet berekend worden/);
    expect(KIES_JAAR_HINT).toBe('Kies bij ‘Voor welk jaar?’ een jaar om alleen dat jaar te tellen.');
    expect(GEEN_SETS_TEKST).toMatch(/noemt geen sets met minimumdoelen/);
    expect(RICHTING_ONBEKEND_NOOT).toMatch(/niet \(meer\) in de officiële matrix/);
    expect(KADER_LEEG_NOOT).toMatch(/koppelt geen minimumdoelen/);
  });
});

// ── De cursussen ────────────────────────────────────────────────────────────

describe('cursussen bij een richting', () => {
  it('de drie redenen van § 14.3', () => {
    expect(redenTekst('geen-leerplan')).toBe('Telt niet mee: deze cursus hangt aan geen leerplan. Kies er een in de instellingen van de cursus.');
    expect(redenTekst('leerplan-ontbreekt')).toBe('Telt niet mee: het leerplan van deze cursus staat niet op dit toestel.');
    expect(redenTekst('geen-verwijzingen', 'Mijn lijst')).toBe('Telt niet mee: het leerplan ‘Mijn lijst’ verwijst niet naar minimumdoelen.');
    expect(redenTekst('geen-verwijzingen')).toBe('Telt niet mee: het leerplan van deze cursus verwijst niet naar minimumdoelen.');
  });

  it('buitenKaderTekst: meervoud, enkelvoud en leeg', () => {
    expect(buitenKaderTekst(4)).toBe('4 verwijzingen van deze cursus horen niet bij deze richting, of wijzen naar een andere versie van een set.');
    expect(buitenKaderTekst(1)).toBe('1 verwijzing van deze cursus hoort niet bij deze richting, of wijst naar een andere versie van een set.');
    expect(buitenKaderTekst(0)).toBe('');
  });

  it('cursusRegel: telt mee (met enkelvoud en meervoud), met of zonder verwijzingen buiten het kader, of de reden', () => {
    expect(cursusRegel({ telt: true, draagtBij: 16, buitenKader: 0 })).toEqual({ hoofd: 'Telt mee voor 16 doelen' });
    expect(cursusRegel({ telt: true, draagtBij: 1, buitenKader: 0 })).toEqual({ hoofd: 'Telt mee voor 1 doel' });
    expect(cursusRegel({ telt: true, draagtBij: 0, buitenKader: 0 })).toEqual({ hoofd: 'Telt mee voor 0 doelen' });
    expect(cursusRegel({ telt: true, draagtBij: 2, buitenKader: 3 })).toEqual({
      hoofd: 'Telt mee voor 2 doelen',
      extra: '3 verwijzingen van deze cursus horen niet bij deze richting, of wijzen naar een andere versie van een set.',
    });
    expect(cursusRegel({ telt: false, reden: 'leerplan-ontbreekt', draagtBij: 0, buitenKader: 0 }))
      .toEqual({ hoofd: 'Telt niet mee: het leerplan van deze cursus staat niet op dit toestel.' });
    expect(cursusRegel({ telt: false, reden: 'geen-verwijzingen', draagtBij: 0, buitenKader: 0, leerplanTitel: 'Lijst' }).hoofd)
      .toBe('Telt niet mee: het leerplan ‘Lijst’ verwijst niet naar minimumdoelen.');
  });

  it('een cursus van een ander jaar', () => {
    expect(buitenJaarTekst(3)).toBe('Telt nu niet mee: je telt alleen het 3de jaar.');
  });
});

// ── De editor ───────────────────────────────────────────────────────────────

describe('geplandeRegel', () => {
  it('meervoud en enkelvoud', () => {
    expect(geplandeRegel(5)).toBe('5 doelen staan alleen op secties die nog leeg zijn: die zijn gepland, nog niet uitgewerkt.');
    expect(geplandeRegel(1)).toBe('1 doel staat alleen op secties die nog leeg zijn: dat is gepland, nog niet uitgewerkt.');
  });
});

describe('leerplanHeeftVerwijzingen', () => {
  const doel = (refs: unknown) => ({ id: 'g', code: 'A', text: 'x', refs });
  const lp = (...goals: unknown[]) => ({ goals }) as unknown as Pick<Curriculum, 'goals'>;

  it('ja bij minstens één bruikbare verwijzing', () => {
    expect(leerplanHeeftVerwijzingen(lp(doel(undefined), doel([{ set: 'ODS_1', id: '1001', code: '01' }])))).toBe(true);
    expect(leerplanHeeftVerwijzingen(lp(doel([{ set: 'ODS_1', id: 1001 }])))).toBe(true);
  });

  it('nee zonder verwijzingen, bij lege of kapotte verwijzingen en zonder leerplan', () => {
    expect(leerplanHeeftVerwijzingen(undefined)).toBe(false);
    expect(leerplanHeeftVerwijzingen(lp())).toBe(false);
    expect(leerplanHeeftVerwijzingen(lp(doel(undefined), doel([])))).toBe(false);
    expect(leerplanHeeftVerwijzingen(lp(doel([{ set: '', id: '1' }, { set: 'ODS_1', id: ' ' }, null, 'x', { set: 'ODS_1' }])))).toBe(false);
    expect(leerplanHeeftVerwijzingen(lp(doel('ODS_1'), null, 5))).toBe(false);
    expect(leerplanHeeftVerwijzingen({ goals: 'kapot' } as unknown as Pick<Curriculum, 'goals'>)).toBe(false);
  });
});

describe('de link naar de richting', () => {
  it('met het jaar, en het soort alleen als het buitengewoon is', () => {
    expect(richtingLinkNaar({ groep: 'G-0193', jaar: 4, soort: 'so' })).toBe('/cursussen/richtingen/G-0193?jaar=4');
    expect(richtingLinkNaar({ groep: 'G-0193', soort: 'so' })).toBe('/cursussen/richtingen/G-0193');
    expect(richtingLinkNaar({ groep: 'G-0193', jaar: 3, soort: 'buso' })).toBe('/cursussen/richtingen/G-0193?jaar=3&soort=buso');
  });

  it('de tekst van de link', () => {
    expect(richtingLinkTekst('Latijn-Wiskunde')).toBe('Bekijk wat al je cursussen voor Latijn-Wiskunde samen dekken');
  });
});

// ── Gelijk met de berekening zelf ───────────────────────────────────────────

/** Een set met vijf doelen en een cursus die er één dekt, één plant en één in verdieping heeft: zo komen alle zinnen voor. */
describe('gelijk met dekkingMinimumdoelen', () => {
  const SET = 'ODS_900';
  const bestand: MinimumdoelenSetBestand = {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id: SET, naam: 'Secundair onderwijs 2de graad - Biologie - Cesuurdoelen', korteNaam: 'Biologie', geldigheid: 'Geldig', graad: '2de graad',
      sleutelcompetenties: [], bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x', opgehaald: '2026-10-05T10:00:00Z', aantal: 5, sha256: 'ab'.repeat(32),
    },
    doelen: ['1', '2', '3', '4', '5'].map((n) => ({ id: `90${n}`, code: `0${n}`, tekst: `Doel ${n}` })),
  } as unknown as MinimumdoelenSetBestand;

  const goals = ['1', '2', '3'].map((n) => ({ id: `g${n}`, code: `BIO${n}`, text: `Doel ${n}`, refs: [{ set: SET, id: `90${n}`, code: `0${n}` }] }));
  const leerplan = {
    id: 'lp', title: 'Lijst', net: 'eigen', subject: 'Biologie', level: '2de graad', createdAt: 0, updatedAt: 0, goals,
  } as unknown as Curriculum;
  const sectie = (id: string, goalCodes: string[], blocks: unknown[], optional = false): CourseSection =>
    ({ id, title: id, goalCodes, blocks, ...(optional ? { optional: true } : {}) }) as unknown as CourseSection;
  const cursus = {
    id: 'c', title: 'Biologie 3', author: '', coverEmoji: '📘', code: 'ABC123', curriculumId: 'lp',
    settings: { accentColor: '#000', requireName: true, showProgressToStudent: true }, createdAt: 0, updatedAt: 0,
    chapters: [{
      id: 'h', title: 'H', sections: [
        sectie('s1', ['BIO1'], [{ id: 't', type: 'text', markdown: 'Uitleg' }]),
        sectie('s2', ['BIO2'], [{ id: 'd', type: 'callout', kind: 'goal', text: '…' }]),
        sectie('s3', ['BIO3'], [{ id: 't3', type: 'text', markdown: 'Uitleg' }], true),
      ],
    }],
  } as unknown as Course;

  const kader = setsAlsKader([SET], new Map([[SET, bestand]]));
  const bijdragen: CursusBijdrage[] = [{ course: cursus, leerplan }];

  it('de zinnen van het scherm zijn die van de berekening', () => {
    const dekking: MdDekking = dekkingMinimumdoelen(kader, bijdragen, []);
    expect([dekking.gedekt, dekking.gepland, dekking.verdieping, dekking.open]).toEqual([1, 1, 1, 2]);
    expect(samenvattingRichting(dekking)).toBe(dekking.samenvatting);
    expect(dekking.samenvatting).toContain('1 doel staat al gepland');
    expect(dekking.samenvatting).toContain('1 komt alleen in verdieping aan bod');
  });

  it('zonder cursussen en met alleen gedekte doelen', () => {
    const zonder = dekkingMinimumdoelen(kader, [], []);
    expect(samenvattingRichting(zonder)).toBe(zonder.samenvatting);
    const leeg = dekkingMinimumdoelen([], bijdragen, []);
    expect(samenvattingRichting(leeg)).toBe(leeg.samenvatting);
  });

  it('de status per doel en de groepen komen uit de rijen', () => {
    const dekking = dekkingMinimumdoelen(kader, bijdragen, []);
    expect(dekking.rijen.map((r) => statusTekst(r))).toEqual([
      'Gedekt in ‘Biologie 3’',
      'Gepland in ‘Biologie 3’ (de sectie is nog leeg)',
      'Alleen in verdieping (‘Biologie 3’)',
      'Nog niet gedekt',
      'Nog niet gedekt',
    ]);
    const open = groepeerPerSet(dekking, 'open');
    expect(open).toHaveLength(1);
    expect(open[0].rijen.map((r) => r.doel.code)).toEqual(['02', '03', '04', '05']);
    expect(setSamenvatting(open[0].setNaam, open[0].gedekt, open[0].totaal)).toBe('Biologie: 1 van 5 gedekt');
  });
});

// ── Nooit een set-id of groepnummer op het scherm ───────────────────────────

describe('de noten in de editor', () => {
  it('"nog niet opgehaald" krijgt een eigen noot en beweert niet dat de bron geen doelen koppelt', () => {
    expect(KADER_NOG_NIET_NOOT).toBe('De doelen van de studierichting van deze cursus zijn nog niet opgehaald. Hieronder staan de sets van je leerplan.');
    expect(KADER_NOG_NIET_NOOT).not.toBe(KADER_LEEG_NOOT);
    expect(KADER_NOG_NIET_NOOT).toMatch(/nog niet opgehaald/);
    expect(KADER_NOG_NIET_NOOT).not.toMatch(/koppelt geen/);
    expect(KADER_LEEG_NOOT).toMatch(/koppelt geen/);
    // Dezelfde onderscheiding als op het richtingenscherm.
    expect(geenDekkingTekst('nog-niet-opgehaald')).toMatch(/nog niet opgehaald/);
    expect(geenDekkingTekst('geen')).toMatch(/koppelt geen/);
  });

  it('de melding bij een mislukt laden vraagt om te herladen, niet om opnieuw te klikken', () => {
    expect(FOUT_LADEN_DEKKING).toBe('De dekking op de minimumdoelen kon niet geladen worden. Controleer je verbinding en herlaad de pagina.');
    expect(FOUT_LADEN_DEKKING).not.toMatch(/probeer opnieuw/);
  });
});

describe('geen ids in de teksten', () => {
  it('geen enkele zin bevat een set-id of groepnummer', () => {
    const teksten = [
      samenvattingRichting(telling()), samenvattingCursus(telling(), richtingMetGraad('Latijn', 2)), optioneelZin({ totaal: 3, gedekt: 1 }),
      zelfdeNummerZin(2), geenDekkingTekst('geen'), geenDekkingTekst('nog-niet-opgehaald'), FOUT_SETS_DEKKING, EERSTE_GRAAD_ZIN,
      GEEN_SETS_TEKST, RICHTING_ONBEKEND_NOOT, KADER_LEEG_NOOT, KADER_NOG_NIET_NOOT, KIES_JAAR_HINT, FOUT_LADEN_DEKKING,
      nogNietGedektZin(0, 0), nogNietGedektZin(1, 1), nogNietGedektZin(31, 5),
      redenTekst('geen-leerplan'), redenTekst('leerplan-ontbreekt'), redenTekst('geen-verwijzingen', 'Lijst'), buitenKaderTekst(2),
      geplandeRegel(3), buitenJaarTekst(4), richtingLinkTekst('Latijn'), legeSetTekst('open'),
    ];
    for (const t of teksten) nooitIds(t);
  });
});
