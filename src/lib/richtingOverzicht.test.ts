import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import {
  cursussenVoorRichting,
  dekkingMinimumdoelen,
  type CursusBijdrage,
  type KaderDoel,
  type MdDekking,
} from './dekkingMinimumdoelen';
import { sanitizeDoelgroep, type Doelgroep } from './doelgroep';
import {
  bijdragenVoorKader,
  dekkingRijZin,
  klasDekkingZin,
  kortVan,
  linkVoorRij,
  mijnRichtingMeta,
  mijnRichtingen,
  type DekkingKortGetallen,
  type MijnRichting,
} from './richtingOverzicht';
import { kaderGroepSleutel, richtingInfo, type RichtingInfo, type SoortKeuze } from './richtingKader';
import type { MatrixBestand } from './studierichtingen';

const VANDAAG = '2026-10-10';
const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const matrix = JSON.parse(readFileSync(join(WORTEL, 'tests', 'fixtures', 'structuur', 'uit', 'studierichtingen.json'), 'utf8')) as MatrixBestand;

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

function dg(groep: string, extra: Partial<Doelgroep> = {}): Doelgroep {
  return { groep, titel: `Richting ${groep}`, soort: 'so', ...extra };
}

function cursus(id: string, doelgroep?: Doelgroep, curriculumId?: string, updatedAt = 0): Course {
  return {
    id, title: `Cursus ${id}`, author: '', coverEmoji: '📘', code: 'CRS001', chapters: [],
    settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
    ...(doelgroep ? { doelgroep } : {}), ...(curriculumId ? { curriculumId } : {}),
    createdAt: 0, updatedAt,
  };
}

function leerplan(id: string, doelgroep?: Doelgroep): Curriculum {
  return { id, title: `Leerplan ${id}`, net: 'eigen', subject: 'Biologie', level: '2de graad', goals: [], ...(doelgroep ? { doelgroep } : {}) } as unknown as Curriculum;
}

type Klas = Pick<ClassGroup, 'doelgroep'> & { updatedAt?: number };
function klas(doelgroep?: Doelgroep, updatedAt?: number): Klas {
  return { ...(doelgroep ? { doelgroep } : {}), ...(updatedAt !== undefined ? { updatedAt } : {}) };
}

const NW = (jaar?: number, extra: Partial<Doelgroep> = {}): Doelgroep =>
  dg('G-0193', { titel: 'Natuurwetenschappen', graad: 2, ...(jaar !== undefined ? { jaar } : {}), ...extra });
const EEN_A = (jaar?: number): Doelgroep => dg('G-0307', { titel: 'Eerste leerjaar A', graad: 1, ...(jaar !== undefined ? { jaar } : {}) });
const TWEE_A = (jaar?: number): Doelgroep => dg('G-0311', { titel: 'Tweede leerjaar A', graad: 1, ...(jaar !== undefined ? { jaar } : {}) });

const idsVan = (lijst: readonly CursusBijdrage[]) => lijst.map((b) => b.course.id);

// ── bijdragenVoorKader ──────────────────────────────────────────────────────

/**
 * De berekening die `useRichtingDekking` (RichtingDekking.tsx, r. 104 tot 115) deed voor ze naar `bijdragenVoorKader`
 * verhuisde: een letterlijke kopie van de inline code, met alleen de React-omhulsel (`useMemo`) weggelaten.
 */
function inlineBijdragen(
  courses: readonly Course[],
  curricula: readonly Curriculum[],
  info: RichtingInfo,
  soort: SoortKeuze,
  matrixBestand: MatrixBestand,
  vandaag: string,
  telJaar: number | undefined,
): CursusBijdrage[] {
  const eigenSleutel = kaderGroepSleutel(info, soort);
  const anderen = new Map<string, RichtingInfo | undefined>();
  const hoort = (d: Doelgroep): boolean => {
    let i: RichtingInfo | undefined = info;
    if (d.groep !== info.groep.nummer) {
      if (!anderen.has(d.groep)) anderen.set(d.groep, richtingInfo(matrixBestand, d.groep, vandaag));
      i = anderen.get(d.groep);
    }
    return i !== undefined && kaderGroepSleutel(i, d.soort) === eigenSleutel;
  };
  return cursussenVoorRichting(courses, curricula, hoort, telJaar);
}

describe('bijdragenVoorKader', () => {
  // Cursussen over alle richtingen van de fixture heen, met en zonder jaar, gewoon en buitengewoon, via de cursus zelf en
  // via het leerplan, en een groep die niet in de matrix staat.
  const leerplannen = [
    leerplan('lp-nw', NW(4, { kader: 'ab'.repeat(32), volgtKader: true })),
    leerplan('lp-1a', EEN_A(2)),
    leerplan('lp-2a', TWEE_A()),
    leerplan('lp-zonder'),
    leerplan('lp-onbekend', dg('G-9999', { graad: 2 })),
  ];
  const courses: Course[] = [
    cursus('nw-3', NW(3)),
    cursus('nw-4', NW(4)),
    cursus('nw-graad', NW()),
    cursus('nw-5', NW(5)), // buiten de graad: het jaar valt weg bij het saneren
    cursus('nw-buso', NW(4, { soort: 'buso' })),
    cursus('nw-lp', undefined, 'lp-nw'),
    cursus('nw-eigen-gaat-voor', NW(3), 'lp-1a'),
    cursus('humaan-2de', dg('G-0117', { titel: 'Humane wetenschappen', graad: 2, jaar: 3 })),
    cursus('humaan-3de', dg('G-0327', { titel: 'Humane wetenschappen', graad: 3, jaar: 5 })),
    cursus('1a-1', EEN_A(1)),
    cursus('1a-2', EEN_A(2)),
    cursus('1a-graad', EEN_A()),
    cursus('2a-2', TWEE_A(2)),
    cursus('2a-buso', dg('G-0311', { graad: 1, jaar: 2, soort: 'buso' })),
    cursus('lp-1a-cursus', undefined, 'lp-1a'),
    cursus('lp-2a-cursus', undefined, 'lp-2a'),
    cursus('duaal', dg('G-0008', { graad: 2, jaar: 3 })),
    cursus('afgebouwd', dg('G-0002', { graad: 3, jaar: 7 })),
    cursus('buso-zonder-graad', dg('G-0009', { soort: 'buso' })),
    cursus('niet-in-matrix', dg('G-9999', { graad: 2, jaar: 4 })),
    cursus('lp-onbekend-cursus', undefined, 'lp-onbekend'),
    cursus('lp-zonder-cursus', undefined, 'lp-zonder'),
    cursus('lp-ontbreekt', undefined, 'bestaat-niet'),
    cursus('geen-doelgroep'),
  ];
  const groepen = ['G-0193', 'G-0117', 'G-0327', 'G-0307', 'G-0311', 'G-0008', 'G-0009', 'G-0002', 'G-0429'];
  const soorten: SoortKeuze[] = ['so', 'buso'];
  const jaren: (number | undefined)[] = [undefined, 1, 2, 3, 4, 5, 6, 7, 0, 8, 2.5];

  it('geeft op de fixture precies hetzelfde als de inline berekening van useRichtingDekking (alle richtingen, soorten en jaren)', () => {
    let gevergeleken = 0;
    for (const groep of groepen) {
      const info = richtingInfo(matrix, groep, VANDAAG);
      expect(info, groep).toBeDefined();
      for (const soort of soorten) {
        for (const jaar of jaren) {
          const verwacht = inlineBijdragen(courses, leerplannen, info!, soort, matrix, VANDAAG, jaar);
          const nu = bijdragenVoorKader({ courses, curricula: leerplannen, info: info!, soort, matrix, vandaag: VANDAAG, ...(jaar !== undefined ? { jaar } : {}) });
          expect(nu, `${groep} ${soort} ${jaar}`).toEqual(verwacht);
          // Dezelfde objecten in dezelfde volgorde, niet alleen gelijke.
          expect(nu.map((b) => b.course), `${groep} ${soort} ${jaar}`).toHaveLength(verwacht.length);
          nu.forEach((b, i) => {
            expect(b.course).toBe(verwacht[i].course);
            expect(b.leerplan).toBe(verwacht[i].leerplan);
          });
          gevergeleken += 1;
        }
      }
    }
    expect(gevergeleken).toBe(groepen.length * soorten.length * jaren.length);
  });

  it('de vergelijking is niet leeg: de verwachte cursussen zitten erin', () => {
    const per = (groep: string, soort: SoortKeuze, jaar?: number) =>
      idsVan(bijdragenVoorKader({ courses, curricula: leerplannen, info: richtingInfo(matrix, groep, VANDAAG)!, soort, matrix, vandaag: VANDAAG, ...(jaar !== undefined ? { jaar } : {}) }));
    // Natuurwetenschappen: eigen cursussen, ook die van een leerplan; niet de andere richtingen of het buitengewoon onderwijs.
    expect(per('G-0193', 'so')).toEqual(['nw-3', 'nw-4', 'nw-graad', 'nw-5', 'nw-lp', 'nw-eigen-gaat-voor']);
    // Met een jaar: alleen dat jaar en cursussen zonder jaar.
    expect(per('G-0193', 'so', 4)).toEqual(['nw-4', 'nw-graad', 'nw-5', 'nw-lp']);
    expect(per('G-0193', 'buso')).toEqual(['nw-buso']);
    // Dezelfde naam in een andere graad is een andere richting.
    expect(per('G-0117', 'so')).toEqual(['humaan-2de']);
    expect(per('G-0327', 'so')).toEqual(['humaan-3de']);
  });

  it('in de 1ste graad tellen het 1ste en het 2de leerjaar van een stroom samen, met en zonder jaar', () => {
    const per = (groep: string, jaar?: number) =>
      idsVan(bijdragenVoorKader({ courses, curricula: leerplannen, info: richtingInfo(matrix, groep, VANDAAG)!, soort: 'so', matrix, vandaag: VANDAAG, ...(jaar !== undefined ? { jaar } : {}) }));
    const hele = ['1a-1', '1a-2', '1a-graad', '2a-2', 'lp-1a-cursus', 'lp-2a-cursus'];
    expect(per('G-0307')).toEqual(hele);
    expect(per('G-0311')).toEqual(hele);
    expect(per('G-0307', 1)).toEqual(['1a-1', '1a-graad', 'lp-1a-cursus', 'lp-2a-cursus']);
    expect(per('G-0311', 2)).toEqual(['1a-2', '1a-graad', '2a-2', 'lp-1a-cursus', 'lp-2a-cursus']);
  });

  it('een groep die niet in de matrix staat, hoort nergens bij; geen doelgroep ook niet', () => {
    const alle = new Set<string>();
    for (const groep of groepen) {
      for (const soort of soorten) {
        for (const b of bijdragenVoorKader({ courses, curricula: leerplannen, info: richtingInfo(matrix, groep, VANDAAG)!, soort, matrix, vandaag: VANDAAG })) alle.add(b.course.id);
      }
    }
    for (const nergens of ['niet-in-matrix', 'lp-onbekend-cursus', 'lp-zonder-cursus', 'lp-ontbreekt', 'geen-doelgroep']) expect(alle.has(nergens), nergens).toBe(false);
  });

  it('geeft het leerplan van de cursus mee als het op het toestel staat', () => {
    const uit = bijdragenVoorKader({ courses, curricula: leerplannen, info: richtingInfo(matrix, 'G-0193', VANDAAG)!, soort: 'so', matrix, vandaag: VANDAAG });
    expect(uit.find((b) => b.course.id === 'nw-lp')?.leerplan?.id).toBe('lp-nw');
    expect(uit.find((b) => b.course.id === 'nw-3')?.leerplan).toBeUndefined();
  });
});

// ── mijnRichtingen ──────────────────────────────────────────────────────────

describe('mijnRichtingen', () => {
  it('zonder cursussen en klassen geen rijen', () => {
    expect(mijnRichtingen({ courses: [], curricula: [], klassen: [] })).toEqual([]);
    expect(mijnRichtingen({ courses: [cursus('c')], curricula: [leerplan('lp', NW())], klassen: [klas()] })).toEqual([]);
  });

  it('een richting via de cursus', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', NW(3)), cursus('c2', NW(4))], curricula: [], klassen: [] });
    expect(rijen).toEqual([{
      sleutel: 'G-0193|so', groep: 'G-0193', soort: 'so', titel: 'Natuurwetenschappen', graad: 2, cursussen: 2, klassen: 0,
      jaren: [3, 4], cursusJaren: [3, 4], zonderJaar: false,
    }]);
  });

  it('een richting via het leerplan van de cursus (zonder jaar)', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', undefined, 'lp1')], curricula: [leerplan('lp1', NW(4))], klassen: [] });
    expect(rijen).toHaveLength(1);
    expect(rijen[0]).toMatchObject({ groep: 'G-0193', cursussen: 1, klassen: 0, jaren: [], cursusJaren: [], zonderJaar: true });
  });

  it('een richting via een klas', () => {
    const rijen = mijnRichtingen({ courses: [], curricula: [], klassen: [klas(NW(4)), klas(NW(4)), klas(NW(3))] });
    expect(rijen).toEqual([{
      sleutel: 'G-0193|so', groep: 'G-0193', soort: 'so', titel: 'Natuurwetenschappen', graad: 2, cursussen: 0, klassen: 3,
      jaren: [3, 4], cursusJaren: [], zonderJaar: false,
    }]);
  });

  it('cursussen en klassen van dezelfde richting komen in één rij', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', NW(4))], curricula: [], klassen: [klas(NW(4)), klas(NW())] });
    expect(rijen).toHaveLength(1);
    expect(rijen[0]).toMatchObject({ cursussen: 1, klassen: 2, jaren: [4], cursusJaren: [4], zonderJaar: true });
  });

  it('de jaren van de klassen komen niet in de jaren van de cursussen, en een doelgroep zonder jaar telt apart (A3, ronde 2)', () => {
    // (a) een cursus zonder jaar (zoals via haar leerplan) en een klas van het 4de jaar
    const a = mijnRichtingen({ courses: [cursus('c', undefined, 'lp')], curricula: [leerplan('lp', NW())], klassen: [klas(NW(4))] })[0];
    expect(a).toMatchObject({ cursussen: 1, klassen: 1, jaren: [4], cursusJaren: [], zonderJaar: true });
    expect(mijnRichtingMeta(a)).toBe('2de graad · 1 cursus · 1 klas');
    expect(linkVoorRij(a)).toBe('/cursussen/richtingen/G-0193');
    // (b) een cursus van het 4de jaar en een klas van het 3de jaar: één cursus, één jaar
    const b = mijnRichtingen({ courses: [cursus('c', NW(4))], curricula: [], klassen: [klas(NW(3))] })[0];
    expect(b).toMatchObject({ jaren: [3, 4], cursusJaren: [4], zonderJaar: false });
    expect(mijnRichtingMeta(b)).toBe('2de graad · 1 cursus (4de jaar) · 1 klas');
    expect(linkVoorRij(b)).toBe('/cursussen/richtingen/G-0193');
    // (c) cursussen van het 3de jaar en van de hele graad delen geen jaar: geen ?jaar= in de link
    const c = mijnRichtingen({ courses: [cursus('c1', NW(3)), cursus('c2', NW())], curricula: [], klassen: [] })[0];
    expect(c).toMatchObject({ jaren: [3], cursusJaren: [3], zonderJaar: true });
    expect(linkVoorRij(c)).toBe('/cursussen/richtingen/G-0193');
    // Een klas zonder jaar naast een cursus van het 4de jaar: ook geen gedeeld jaar.
    const d = mijnRichtingen({ courses: [cursus('c', NW(4))], curricula: [], klassen: [klas(NW())] })[0];
    expect(linkVoorRij(d)).toBe('/cursussen/richtingen/G-0193');
    // Alles in hetzelfde jaar (cursussen en klassen): wel ?jaar=4.
    const e = mijnRichtingen({ courses: [cursus('c1', NW(4)), cursus('c2', NW(4))], curricula: [], klassen: [klas(NW(4))] })[0];
    expect(e).toMatchObject({ jaren: [4], cursusJaren: [4], zonderJaar: false });
    expect(linkVoorRij(e)).toBe('/cursussen/richtingen/G-0193?jaar=4');
    // Alleen klassen van één jaar: ook.
    expect(linkVoorRij(mijnRichtingen({ courses: [], curricula: [], klassen: [klas(NW(4)), klas(NW(4))] })[0])).toBe('/cursussen/richtingen/G-0193?jaar=4');
  });

  it('een richting met alleen een leerplan telt niet (V5)', () => {
    expect(mijnRichtingen({ courses: [], curricula: [leerplan('lp1', NW())], klassen: [] })).toEqual([]);
    // Een leerplan waar geen enkele cursus naar wijst, ook niet naast een andere richting.
    const rijen = mijnRichtingen({ courses: [cursus('c1', dg('G-0117', { graad: 2 }))], curricula: [leerplan('lp1', NW())], klassen: [] });
    expect(rijen.map((r) => r.groep)).toEqual(['G-0117']);
  });

  it('gewoon en buitengewoon onderwijs van dezelfde groep zijn twee rijen', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', NW(4)), cursus('c2', NW(4, { soort: 'buso' }))], curricula: [], klassen: [] });
    expect(rijen.map((r) => r.sleutel)).toEqual(['G-0193|so', 'G-0193|buso']);
  });

  it('het 1ste en het 2de leerjaar A (G-0307 en G-0311) zijn twee rijen', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', EEN_A(1)), cursus('c2', TWEE_A(2)), cursus('c3', EEN_A(2))], curricula: [], klassen: [] });
    expect(rijen.map((r) => [r.groep, r.cursussen, r.jaren, r.cursusJaren])).toEqual([['G-0307', 2, [1, 2], [1, 2]], ['G-0311', 1, [2], [2]]]);
  });

  it('een ongeldige doelgroep valt weg, bij de cursus, het leerplan en de klas', () => {
    const kapot = { groep: 'geen-groep', titel: 'x', soort: 'so' } as Doelgroep;
    const rijen = mijnRichtingen({
      courses: [cursus('c1', kapot), cursus('c2', kapot, 'lp1'), cursus('c3', undefined, 'lp2')],
      curricula: [leerplan('lp1', kapot), leerplan('lp2', kapot)],
      klassen: [klas(kapot), { doelgroep: 'tekst' as unknown as Doelgroep }, null as unknown as Klas],
    });
    expect(rijen).toEqual([]);
  });

  it('de doelgroep van de cursus zelf gaat voor die van haar leerplan', () => {
    const rijen = mijnRichtingen({ courses: [cursus('c1', NW(3), 'lp1')], curricula: [leerplan('lp1', dg('G-0117', { graad: 2 }))], klassen: [] });
    expect(rijen.map((r) => r.groep)).toEqual(['G-0193']);
  });

  it('jaren zijn uniek en oplopend', () => {
    const rijen = mijnRichtingen({ courses: [cursus('a', NW(4)), cursus('b', NW(3)), cursus('c', NW(4))], curricula: [], klassen: [klas(NW(3))] });
    expect(rijen[0].jaren).toEqual([3, 4]);
    expect(rijen[0].cursusJaren).toEqual([3, 4]);
  });

  it('de titel is die van de nieuwste doelgroep; bij gelijke tijd de eerste', () => {
    const oud = NW(4, { titel: 'Oude titel' });
    const nieuw = NW(4, { titel: 'Nieuwe titel' });
    const titel = (o: Parameters<typeof mijnRichtingen>[0]) => mijnRichtingen(o)[0].titel;
    expect(titel({ courses: [cursus('a', oud, undefined, 1), cursus('b', nieuw, undefined, 5)], curricula: [], klassen: [] })).toBe('Nieuwe titel');
    expect(titel({ courses: [cursus('a', nieuw, undefined, 5), cursus('b', oud, undefined, 1)], curricula: [], klassen: [] })).toBe('Nieuwe titel');
    // Een klas die nog nieuwer is.
    expect(titel({ courses: [cursus('a', nieuw, undefined, 5)], curricula: [], klassen: [klas(NW(4, { titel: 'Titel van de klas' }), 9)] })).toBe('Titel van de klas');
    // Gelijke tijd: de eerste blijft.
    expect(titel({ courses: [cursus('a', oud, undefined, 3), cursus('b', nieuw, undefined, 3)], curricula: [], klassen: [] })).toBe('Oude titel');
    // Een klas zonder tijd telt als de oudste.
    expect(titel({ courses: [cursus('a', nieuw, undefined, 5)], curricula: [], klassen: [klas(NW(4, { titel: 'Titel van de klas' }))] })).toBe('Nieuwe titel');
  });

  it('een doelgroep zonder titel (het groepnummer als titel) geeft nooit het groepnummer als titel (A3, ronde 2)', () => {
    const zonderTitel = (jaar?: number) => NW(jaar, { titel: 'G-0193' });
    const titel = (o: Parameters<typeof mijnRichtingen>[0]) => mijnRichtingen(o)[0].titel;
    // Door het saneren: een ruwe doelgroep zonder titel krijgt het groepnummer, en dat komt er zo ook uit.
    const ruw = sanitizeDoelgroep({ groep: 'G-0193', soort: 'so' });
    expect(ruw?.titel).toBe('G-0193');
    // Alleen een doelgroep zonder titel: een lege titel, de rij blijft.
    expect(mijnRichtingen({ courses: [cursus('c', ruw)], curricula: [], klassen: [] })).toEqual([{
      sleutel: 'G-0193|so', groep: 'G-0193', soort: 'so', titel: '', cursussen: 1, klassen: 0, jaren: [], cursusJaren: [], zonderJaar: true,
    }]);
    // Een echte titel van een andere doelgroep gaat voor, ook als de doelgroep zonder titel nieuwer is, en in elke volgorde.
    expect(titel({ courses: [cursus('a', NW(4, { titel: 'Oud' }), undefined, 1), cursus('b', zonderTitel(4), undefined, 9)], curricula: [], klassen: [] })).toBe('Oud');
    expect(titel({ courses: [cursus('a', zonderTitel(4), undefined, 9), cursus('b', NW(4, { titel: 'Oud' }), undefined, 1)], curricula: [], klassen: [] })).toBe('Oud');
    // Gelijke tijd: de eerste met een echte titel, niet de eerste doelgroep.
    expect(titel({ courses: [cursus('a', zonderTitel(4), undefined, 3), cursus('b', NW(4, { titel: 'Echt' }), undefined, 3)], curricula: [], klassen: [] })).toBe('Echt');
    // Een klas met een echte titel naast een cursus zonder.
    expect(titel({ courses: [cursus('a', zonderTitel(4), undefined, 5)], curricula: [], klassen: [klas(NW(4, { titel: 'Titel van de klas' }), 1)] })).toBe('Titel van de klas');
    // Twee echte titels: nog steeds de nieuwste.
    expect(titel({ courses: [cursus('a', NW(4, { titel: 'Oud' }), undefined, 1), cursus('b', zonderTitel(4), undefined, 5), cursus('c', NW(4, { titel: 'Nieuw' }), undefined, 3)], curricula: [], klassen: [] })).toBe('Nieuw');
  });

  it('een rij zonder titel staat achteraan, op groepnummer (A3, ronde 2)', () => {
    const rijen = mijnRichtingen({
      courses: [
        cursus('1', dg('G-0400', { titel: 'G-0400', graad: 2 })),
        cursus('2', dg('G-0100', { titel: 'G-0100', graad: 2 })),
        cursus('3', dg('G-0300', { titel: 'Zorg', graad: 2 })),
        cursus('4', dg('G-0200', { titel: 'Aardrijkskunde', graad: 2 })),
      ],
      curricula: [],
      klassen: [],
    });
    expect(rijen.map((r) => [r.sleutel, r.titel])).toEqual([['G-0200|so', 'Aardrijkskunde'], ['G-0300|so', 'Zorg'], ['G-0100|so', ''], ['G-0400|so', '']]);
  });

  it('sorteert op titel (zonder verschil in hoofdletters en accenten), dan op groepnummer, dan gewoon vóór buitengewoon', () => {
    const rijen = mijnRichtingen({
      courses: [
        cursus('1', dg('G-0327', { titel: 'Humane wetenschappen', graad: 3 })),
        // Het buitengewoon onderwijs staat in de invoer vóór het gewone: alleen de tiebreak zet het erachter.
        cursus('6', dg('G-0117', { titel: 'Humane wetenschappen', graad: 2, soort: 'buso' })),
        cursus('2', dg('G-0117', { titel: 'Humane wetenschappen', graad: 2 })),
        cursus('3', dg('G-0200', { titel: 'économie', graad: 2 })),
        cursus('4', dg('G-0300', { titel: 'Zorg', graad: 2 })),
        cursus('5', dg('G-0100', { titel: 'Elektriciteit', graad: 2 })),
        cursus('7', dg('G-0400', { titel: 'aardrijkskunde', graad: 2 })),
      ],
      curricula: [],
      klassen: [],
    });
    expect(rijen.map((r) => r.sleutel)).toEqual(['G-0400|so', 'G-0200|so', 'G-0100|so', 'G-0117|so', 'G-0117|buso', 'G-0327|so', 'G-0300|so']);
  });

  it('wijzigt zijn invoer niet', () => {
    const courses = [cursus('c1', NW(4))];
    const klassen = [klas(NW(4))];
    const kopieCourses = JSON.stringify(courses);
    const kopieKlassen = JSON.stringify(klassen);
    mijnRichtingen({ courses, curricula: [], klassen });
    expect(JSON.stringify(courses)).toBe(kopieCourses);
    expect(JSON.stringify(klassen)).toBe(kopieKlassen);
  });

  it('geen vak, kadervelden of ander veld van de doelgroep in de rij', () => {
    const rij = mijnRichtingen({ courses: [cursus('c1', NW(4, { vak: 'Biologie', kader: 'ab'.repeat(32), volgtKader: true }))], curricula: [], klassen: [] })[0];
    expect(Object.keys(rij).sort()).toEqual(['cursusJaren', 'cursussen', 'graad', 'groep', 'jaren', 'klassen', 'sleutel', 'soort', 'titel', 'zonderJaar']);
  });
});

// ── De regel onder de titel en de link ──────────────────────────────────────

function rij(extra: Partial<MijnRichting> = {}): MijnRichting {
  return { sleutel: 'G-0193|so', groep: 'G-0193', soort: 'so', titel: 'Natuurwetenschappen', graad: 2, cursussen: 3, klassen: 1, jaren: [3, 4], cursusJaren: [3, 4], zonderJaar: false, ...extra };
}

describe('mijnRichtingMeta', () => {
  it('"2de graad · 3 cursussen (3de en 4de jaar) · 1 klas"', () => {
    expect(mijnRichtingMeta(rij())).toBe('2de graad · 3 cursussen (3de en 4de jaar) · 1 klas');
  });

  it('enkelvoud en meervoud van cursussen en klassen', () => {
    expect(mijnRichtingMeta(rij({ cursussen: 1, klassen: 0, cursusJaren: [4] }))).toBe('2de graad · 1 cursus (4de jaar)');
    expect(mijnRichtingMeta(rij({ cursussen: 2, klassen: 2, cursusJaren: [4] }))).toBe('2de graad · 2 cursussen (4de jaar) · 2 klassen');
  });

  it('zonder cursus: "nog geen cursus"', () => {
    expect(mijnRichtingMeta(rij({ cursussen: 0, klassen: 2, cursusJaren: [4] }))).toBe('2de graad · nog geen cursus · 2 klassen');
    expect(mijnRichtingMeta(rij({ cursussen: 0, klassen: 1, cursusJaren: [] }))).toBe('2de graad · nog geen cursus · 1 klas');
  });

  it('zonder jaren geen haakjes; drie jaren met komma en "en"', () => {
    expect(mijnRichtingMeta(rij({ cursusJaren: [], klassen: 0 }))).toBe('2de graad · 3 cursussen');
    expect(mijnRichtingMeta(rij({ graad: 3, cursusJaren: [5, 6, 7], klassen: 0 }))).toBe('3de graad · 3 cursussen (5de, 6de en 7de jaar)');
  });

  it('de jaren in de haakjes zijn die van de cursussen, niet die van de klassen', () => {
    expect(mijnRichtingMeta(rij({ cursussen: 1, klassen: 1, jaren: [4], cursusJaren: [], zonderJaar: true }))).toBe('2de graad · 1 cursus · 1 klas');
    expect(mijnRichtingMeta(rij({ cursussen: 1, klassen: 1, jaren: [3, 4], cursusJaren: [4] }))).toBe('2de graad · 1 cursus (4de jaar) · 1 klas');
  });

  it('de 1ste graad', () => {
    expect(mijnRichtingMeta(rij({ graad: 1, cursusJaren: [1, 2], klassen: 0 }))).toBe('1ste graad · 3 cursussen (1ste en 2de jaar)');
  });

  it('buitengewoon onderwijs krijgt "buitengewoon (OV4)"; zonder graad "buitengewoon"; en met de optie "afgebouwd"', () => {
    expect(mijnRichtingMeta(rij({ soort: 'buso', klassen: 0, cursusJaren: [4] }))).toBe('2de graad · 3 cursussen (4de jaar) · buitengewoon (OV4)');
    expect(mijnRichtingMeta({ sleutel: 'G-0009|buso', groep: 'G-0009', soort: 'buso', titel: 'x', cursussen: 1, klassen: 0, jaren: [], cursusJaren: [], zonderJaar: true })).toBe('1 cursus · buitengewoon');
    expect(mijnRichtingMeta(rij({ klassen: 0, cursusJaren: [4] }), { afgebouwd: true })).toBe('2de graad · 3 cursussen (4de jaar) · afgebouwd');
    expect(mijnRichtingMeta(rij({ soort: 'buso', klassen: 0, cursusJaren: [] }), { afgebouwd: true })).toBe('2de graad · 3 cursussen · buitengewoon (OV4) · afgebouwd');
    expect(mijnRichtingMeta(rij({ klassen: 0, cursusJaren: [4] }), { afgebouwd: false })).toBe('2de graad · 3 cursussen (4de jaar)');
  });

  it('zonder graad (en niet buitengewoon) staat er geen graad', () => {
    expect(mijnRichtingMeta(rij({ graad: undefined, cursussen: 1, klassen: 0, cursusJaren: [] }))).toBe('1 cursus');
  });

  it('nooit een groepnummer', () => {
    expect(mijnRichtingMeta(rij())).not.toMatch(/G-\d/);
  });
});

describe('linkVoorRij', () => {
  it('met één gedeeld jaar: ?jaar=<j>', () => {
    expect(linkVoorRij(rij({ jaren: [4] }))).toBe('/cursussen/richtingen/G-0193?jaar=4');
  });

  it('gemengde jaren of geen jaar: geen jaar in de link', () => {
    expect(linkVoorRij(rij({ jaren: [3, 4] }))).toBe('/cursussen/richtingen/G-0193');
    expect(linkVoorRij(rij({ jaren: [] }))).toBe('/cursussen/richtingen/G-0193');
  });

  it('een cursus of klas zonder jaar (de hele graad): geen gedeeld jaar, dus geen jaar in de link', () => {
    expect(linkVoorRij(rij({ jaren: [3], zonderJaar: true }))).toBe('/cursussen/richtingen/G-0193');
    expect(linkVoorRij(rij({ soort: 'buso', jaren: [3], zonderJaar: true }))).toBe('/cursussen/richtingen/G-0193?soort=buso');
    expect(linkVoorRij(rij({ jaren: [3], zonderJaar: false }))).toBe('/cursussen/richtingen/G-0193?jaar=3');
  });

  it('buitengewoon onderwijs: &soort=buso erachter, of ?soort=buso zonder jaar', () => {
    expect(linkVoorRij(rij({ soort: 'buso', jaren: [3] }))).toBe('/cursussen/richtingen/G-0193?jaar=3&soort=buso');
    expect(linkVoorRij(rij({ soort: 'buso', jaren: [] }))).toBe('/cursussen/richtingen/G-0193?soort=buso');
  });

  it('1A en 2A hebben elk hun eigen link', () => {
    expect(linkVoorRij(rij({ groep: 'G-0307', jaren: [1] }))).toBe('/cursussen/richtingen/G-0307?jaar=1');
    expect(linkVoorRij(rij({ groep: 'G-0311', jaren: [2] }))).toBe('/cursussen/richtingen/G-0311?jaar=2');
  });
});

// ── De dekking in een zin ───────────────────────────────────────────────────

function getallen(extra: Partial<DekkingKortGetallen> = {}): DekkingKortGetallen {
  return { totaal: 171, gedekt: 9, gepland: 4, percent: 5, eersteGraad: false, ...extra };
}

describe('kortVan', () => {
  it('neemt de getallen van de dekking over en voegt de 1ste graad toe', () => {
    const d = { totaal: 171, gedekt: 9, gepland: 4, verdieping: 2, open: 156, percent: 5, rijen: [], cursussen: [] } as unknown as MdDekking;
    expect(kortVan(d, false)).toEqual({ totaal: 171, gedekt: 9, gepland: 4, percent: 5, eersteGraad: false });
    expect(kortVan(d, true)).toEqual({ totaal: 171, gedekt: 9, gepland: 4, percent: 5, eersteGraad: true });
  });

  it('werkt op een echte dekking', () => {
    const doelen: KaderDoel[] = ['1', '2', '3'].map((id) => ({
      set: 'ODS_1', setNaam: 'Biologie', id, code: `0${id}`, tekst: `Doel ${id}`, optioneel: false, verplichteSet: true,
    }));
    expect(kortVan(dekkingMinimumdoelen(doelen, [], []), false)).toEqual({ totaal: 3, gedekt: 0, gepland: 0, percent: 0, eersteGraad: false });
  });
});

describe('dekkingRijZin', () => {
  it('"Je cursussen dekken 9 van de 171 minimumdoelen (5 %)." met de geplande doelen erbij', () => {
    expect(dekkingRijZin(getallen())).toBe('Je cursussen dekken 9 van de 171 minimumdoelen (5 %). 4 staan gepland.');
  });

  it('enkelvoud van "gepland", en niets bij nul', () => {
    expect(dekkingRijZin(getallen({ gepland: 1 }))).toBe('Je cursussen dekken 9 van de 171 minimumdoelen (5 %). 1 staat gepland.');
    expect(dekkingRijZin(getallen({ gepland: 0 }))).toBe('Je cursussen dekken 9 van de 171 minimumdoelen (5 %).');
  });

  it('in de 1ste graad staat erachter dat het 1ste en het 2de jaar samen tellen', () => {
    expect(dekkingRijZin(getallen({ eersteGraad: true }))).toBe(
      'Je cursussen dekken 9 van de 171 minimumdoelen (5 %). 4 staan gepland. Het 1ste en het 2de jaar tellen samen.',
    );
    expect(dekkingRijZin(getallen({ eersteGraad: true, gepland: 0 }))).toBe(
      'Je cursussen dekken 9 van de 171 minimumdoelen (5 %). Het 1ste en het 2de jaar tellen samen.',
    );
  });

  it('één minimumdoel is "het enige minimumdoel"', () => {
    expect(dekkingRijZin(getallen({ totaal: 1, gedekt: 0, gepland: 0, percent: 0 }))).toBe('Je cursussen dekken 0 van het enige minimumdoel (0 %).');
  });

  it('zonder verplichte doelen een eerlijke zin, zonder staart', () => {
    expect(dekkingRijZin(getallen({ totaal: 0, gedekt: 0, gepland: 0, percent: 0, eersteGraad: true }))).toBe('Er zijn geen verplichte minimumdoelen om te dekken.');
  });

  it('nooit een groepnummer of set-id', () => {
    expect(dekkingRijZin(getallen())).not.toMatch(/G-\d|ODS_/);
  });
});

describe('klasDekkingZin', () => {
  it('"Je cursussen voor Natuurwetenschappen (2de graad) dekken 9 van de 171 minimumdoelen (5 %)."', () => {
    expect(klasDekkingZin('Natuurwetenschappen (2de graad)', getallen({ gepland: 0 }))).toBe(
      'Je cursussen voor Natuurwetenschappen (2de graad) dekken 9 van de 171 minimumdoelen (5 %).',
    );
  });

  it('met dezelfde staart als de rij: gepland en de 1ste graad', () => {
    expect(klasDekkingZin('Natuurwetenschappen (2de graad)', getallen())).toBe(
      'Je cursussen voor Natuurwetenschappen (2de graad) dekken 9 van de 171 minimumdoelen (5 %). 4 staan gepland.',
    );
    expect(klasDekkingZin('Eerste leerjaar A (1ste graad)', getallen({ eersteGraad: true, gepland: 1 }))).toBe(
      'Je cursussen voor Eerste leerjaar A (1ste graad) dekken 9 van de 171 minimumdoelen (5 %). 1 staat gepland. Het 1ste en het 2de jaar tellen samen.',
    );
  });

  it('één minimumdoel en geen verplichte doelen', () => {
    expect(klasDekkingZin('Zorg (2de graad)', getallen({ totaal: 1, gedekt: 1, gepland: 0, percent: 100 }))).toBe(
      'Je cursussen voor Zorg (2de graad) dekken 1 van het enige minimumdoel (100 %).',
    );
    expect(klasDekkingZin('Zorg (2de graad)', getallen({ totaal: 0 }))).toBe('Er zijn geen verplichte minimumdoelen om te dekken.');
  });
});
