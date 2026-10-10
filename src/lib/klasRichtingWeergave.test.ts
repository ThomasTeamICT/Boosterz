import { describe, expect, it } from 'vitest';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import type { Doelgroep } from './doelgroep';
import {
  CURSUSSEN_BOVENAAN_HINT,
  FOUT_KLAS_BESTAAT_NIET_MEER,
  FOUT_RICHTING_NIET_BEWAARD,
  cursusJaarMeta,
  cursussenInKlasZin,
  cursussenVanRichting,
  cursussenVoorLabel,
  foutVoorUitslag,
  klasMeta,
  klassenVoorLabel,
  leerlingenTekst,
  richtingAchterKlascode,
  richtingGekozenTekst,
  richtingWeggehaaldTekst,
  richtingZonderVak,
} from './klasRichtingWeergave';

const NW4: Doelgroep = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so' };
const NW_GRAAD: Doelgroep = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so' };

describe('leerlingenTekst', () => {
  it('kent enkelvoud, meervoud en nul', () => {
    expect(leerlingenTekst(1)).toBe('1 leerling');
    expect(leerlingenTekst(22)).toBe('22 leerlingen');
    expect(leerlingenTekst(0)).toBe('0 leerlingen');
  });
});

describe('richtingZonderVak en de labels', () => {
  it('geeft de richting met het jaar, zonder vak', () => {
    expect(richtingZonderVak({ ...NW4, vak: 'Biologie' })).toBe('Natuurwetenschappen · 4de jaar');
  });

  it('geeft de graad als het jaar ontbreekt', () => {
    expect(richtingZonderVak(NW_GRAAD)).toBe('Natuurwetenschappen · 2de graad');
  });

  it('is leeg zonder geldige doelgroep', () => {
    expect(richtingZonderVak(undefined)).toBe('');
    expect(richtingZonderVak({ groep: 'kapot', titel: 'x', soort: 'so' })).toBe('');
  });

  it('bouwt de labels van de keuzelijsten letterlijk', () => {
    expect(cursussenVoorLabel(NW4)).toBe('Voor Natuurwetenschappen · 4de jaar');
    expect(klassenVoorLabel(NW4)).toBe('Klassen voor Natuurwetenschappen · 4de jaar');
    expect(CURSUSSEN_BOVENAAN_HINT).toBe('De cursussen voor de studierichting van deze klas staan bovenaan.');
  });
});

describe('meldingen van het klasoverzicht', () => {
  it('noemt de klas en de richting letterlijk', () => {
    expect(richtingGekozenTekst('4NWA', NW4)).toBe('Studierichting van ‘4NWA’: Natuurwetenschappen · 4de jaar.');
    expect(richtingWeggehaaldTekst('4NWA')).toBe('‘4NWA’ heeft geen studierichting meer.');
  });

  it('kent twee fouten, en elke mislukking van zetKlasRichting krijgt er een', () => {
    expect(foutVoorUitslag('mislukt')).toBe(FOUT_RICHTING_NIET_BEWAARD);
    expect(foutVoorUitslag('weg')).toBe(FOUT_KLAS_BESTAAT_NIET_MEER);
    expect(FOUT_RICHTING_NIET_BEWAARD).toBe('De studierichting kon niet bewaard worden: de opslag van dit toestel is vol of geblokkeerd.');
    expect(FOUT_KLAS_BESTAAT_NIET_MEER).toBe('Deze klas bestaat niet meer op dit toestel.');
  });
});

describe('cursusJaarMeta', () => {
  it('geeft het jaar, of "hele graad" zonder jaar', () => {
    expect(cursusJaarMeta(NW4)).toBe('4de jaar');
    expect(cursusJaarMeta(NW_GRAAD)).toBe('hele graad');
  });

  it('laat niets staan bij een richting zonder graad of zonder doelgroep', () => {
    expect(cursusJaarMeta({ groep: 'G-0100', titel: 'Buitengewoon', soort: 'buso' })).toBe('');
    expect(cursusJaarMeta(undefined)).toBe('');
  });
});

describe('richtingAchterKlascode', () => {
  it('begint met " · " en geeft de richting met het jaar', () => {
    expect(richtingAchterKlascode(NW4)).toBe(' · Natuurwetenschappen · 4de jaar');
  });

  it('is leeg voor een klas zonder richting', () => {
    expect(richtingAchterKlascode(undefined)).toBe('');
  });

  it('zet buitengewoon onderwijs erbij', () => {
    expect(richtingAchterKlascode({ ...NW4, soort: 'buso' })).toBe(' · Natuurwetenschappen · 4de jaar · buitengewoon (OV4)');
  });
});

describe('klasMeta', () => {
  it('geeft het jaar en de leerlingen, met enkelvoud', () => {
    expect(klasMeta({ jaar: 4, heleGraad: true, leerlingen: 22 })).toBe('4de jaar · 22 leerlingen');
    expect(klasMeta({ jaar: 4, heleGraad: true, leerlingen: 1 })).toBe('4de jaar · 1 leerling');
  });

  it('zegt "Hele graad" voor een klas zonder jaar', () => {
    expect(klasMeta({ heleGraad: true, leerlingen: 22 })).toBe('Hele graad · 22 leerlingen');
    expect(klasMeta({ heleGraad: true, leerlingen: 1 })).toBe('Hele graad · 1 leerling');
  });

  it('laat de graad weg bij een richting zonder graad', () => {
    expect(klasMeta({ heleGraad: false, leerlingen: 5 })).toBe('5 leerlingen');
  });
});

describe('cursussenInKlasZin', () => {
  it('geeft de zin van het ontwerp letterlijk', () => {
    expect(cursussenInKlasZin(2, 3)).toBe('2 van de 3 cursussen van deze richting staan in deze klas.');
  });

  it('zegt "staat" bij één, en kent nul en alle', () => {
    expect(cursussenInKlasZin(1, 3)).toBe('1 van de 3 cursussen van deze richting staat in deze klas.');
    expect(cursussenInKlasZin(0, 3)).toBe('0 van de 3 cursussen van deze richting staan in deze klas.');
    expect(cursussenInKlasZin(3, 3)).toBe('3 van de 3 cursussen van deze richting staan in deze klas.');
  });

  it('heeft een eigen zin voor één cursus', () => {
    expect(cursussenInKlasZin(1, 1)).toBe('De cursus van deze richting staat in deze klas.');
    expect(cursussenInKlasZin(0, 1)).toBe('De cursus van deze richting staat nog niet in deze klas.');
  });

  it('zegt niets zonder cursussen en blijft binnen de grenzen', () => {
    expect(cursussenInKlasZin(0, 0)).toBe('');
    expect(cursussenInKlasZin(2, Number.NaN)).toBe('');
    expect(cursussenInKlasZin(9, 3)).toBe('3 van de 3 cursussen van deze richting staan in deze klas.');
    expect(cursussenInKlasZin(-1, 3)).toBe('0 van de 3 cursussen van deze richting staan in deze klas.');
  });
});

describe('cursussenVanRichting (de lijst en de zin tellen dezelfde cursussen)', () => {
  function cursus(id: string, doelgroep?: Doelgroep, curriculumId?: string): Course {
    return {
      id, title: `Cursus ${id}`, author: '', coverEmoji: '📘', code: 'CRS001', chapters: [],
      settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
      ...(doelgroep ? { doelgroep } : {}), ...(curriculumId ? { curriculumId } : {}),
      createdAt: 0, updatedAt: 0,
    };
  }
  const NW3: Doelgroep = { ...NW4, jaar: 3 };
  const leerplan = { id: 'lp-1', title: 'Leerplan', net: 'eigen', subject: 'Biologie', level: '2de graad', goals: [], doelgroep: NW_GRAAD } as unknown as Curriculum;

  // Het scenario van de controle: drie cursussen voor Natuurwetenschappen (3de jaar, hele graad, 4de jaar), klas 4NWA (4de jaar)
  // met 'NW derde' en 'NW vierde' als opdracht. De lijst op de richtingpagina toont er drie, dus de zin zegt "2 van de 3".
  const derde = cursus('derde', NW3);
  const graad = cursus('graad', NW_GRAAD);
  const vierde = cursus('vierde', NW4);
  const alle = [derde, graad, vierde];

  it('telt elk jaar van de richting mee, ook een cursus voor een ander jaar dan dat van de klas', () => {
    const lijst = cursussenVanRichting(alle, [], 'G-0193', 'so');
    expect(lijst.map((c) => c.id)).toEqual(['derde', 'graad', 'vierde']);
    const toegewezen = new Set(['derde', 'vierde']);
    expect(cursussenInKlasZin(lijst.filter((c) => toegewezen.has(c.id)).length, lijst.length))
      .toBe('2 van de 3 cursussen van deze richting staan in deze klas.');
  });

  it('laat cursussen van een andere richting of een ander soort onderwijs weg', () => {
    const andereRichting = cursus('andere', { groep: 'G-0001', titel: 'Latijn', graad: 2, jaar: 4, soort: 'so' });
    const buso = cursus('buso', { ...NW4, soort: 'buso' });
    const zonder = cursus('zonder');
    expect(cursussenVanRichting([...alle, andereRichting, buso, zonder], [], 'G-0193', 'so').map((c) => c.id)).toEqual(['derde', 'graad', 'vierde']);
    expect(cursussenVanRichting([buso, vierde], [], 'G-0193', 'buso').map((c) => c.id)).toEqual(['buso']);
  });

  it('neemt de doelgroep van het leerplan als de cursus er zelf geen heeft', () => {
    const viaLeerplan = cursus('via', undefined, 'lp-1');
    const losseCursus = cursus('los', undefined, 'bestaat-niet');
    expect(cursussenVanRichting([viaLeerplan, losseCursus], [leerplan], 'G-0193', 'so').map((c) => c.id)).toEqual(['via']);
  });

  it('houdt de volgorde van de cursussen en geeft niets zonder cursussen', () => {
    expect(cursussenVanRichting([vierde, derde], [], 'G-0193', 'so').map((c) => c.id)).toEqual(['vierde', 'derde']);
    expect(cursussenVanRichting([], [], 'G-0193', 'so')).toEqual([]);
  });
});
