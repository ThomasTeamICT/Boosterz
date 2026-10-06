import { describe, expect, it } from 'vitest';
import { filterSubmissionsByClass, isValidClassFilter } from './resultsFilter';
import { matchesStudent } from './classes';
import type { ClassGroup } from './classTypes';
import type { Submission } from './types';

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub1', widgetId: 'w1', widgetCode: 'WQUIZ1', studentName: 'Emma Peeters',
    startedAt: 1000, submittedAt: 2000, durationSec: 30, answers: {},
    itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted',
    ...over,
  };
}

describe('filterSubmissionsByClass', () => {
  const inKlasA = submission({ id: 's1', classId: 'k1', studentId: 'st1' });
  const inKlasB = submission({ id: 's2', classId: 'k2', studentId: 'st2' });
  const zonderKlas = submission({ id: 's3' });
  const alle = [inKlasA, inKlasB, zonderKlas];

  it('geeft alles terug bij "all"', () => {
    expect(filterSubmissionsByClass(alle, 'all')).toEqual(alle);
  });

  it('houdt bij "none" enkel inzendingen zonder classId over', () => {
    expect(filterSubmissionsByClass(alle, 'none')).toEqual([zonderKlas]);
  });

  it('houdt bij een klasId enkel de inzendingen van die klas over', () => {
    expect(filterSubmissionsByClass(alle, 'k1')).toEqual([inKlasA]);
    expect(filterSubmissionsByClass(alle, 'k2')).toEqual([inKlasB]);
  });

  it('geeft een lege lijst voor een klas zonder inzendingen', () => {
    expect(filterSubmissionsByClass(alle, 'k3')).toEqual([]);
  });

  it('laat een lege lijst gewoon leeg', () => {
    expect(filterSubmissionsByClass([], 'all')).toEqual([]);
    expect(filterSubmissionsByClass([], 'none')).toEqual([]);
  });
});

describe('filterSubmissionsByClass met de klassen erbij (zoals het klasdashboard)', () => {
  const klassen: ClassGroup[] = [
    { id: 'k1', name: '1A', code: 'KLAS01', students: [{ id: 'st1', name: 'Emma Peeters' }, { id: 'st3', name: 'Lucas Janssens' }], createdAt: 0, updatedAt: 0 },
    { id: 'k2', name: '1B', code: 'KLAS02', students: [{ id: 'st2', name: 'Noah Claes' }], createdAt: 0, updatedAt: 0 },
  ];
  // T5 uit de debugronde: een losse inzending op naam en een van een verwijderde klas
  const opNaam = submission({ id: 'naam', studentName: '  emma   PEETERS ' });
  const verwijderd = submission({ id: 'weg', studentName: 'Noah', classId: 'verwijderd', studentId: 'st-oud' });
  const inKlasA = submission({ id: 'a', classId: 'k1', studentId: 'st1' });
  const inKlasB = submission({ id: 'b', classId: 'k2', studentId: 'st2', studentName: 'Noah Claes' });
  const vreemd = submission({ id: 'vreemd', studentName: 'Iemand Anders' });
  const opId = submission({ id: 'id', studentName: 'bijnaam', studentId: 'st3' });
  const alle = [opNaam, verwijderd, inKlasA, inKlasB, vreemd, opId];

  it('toont onder een klas ook inzendingen zonder klas die op naam bij een leerling horen', () => {
    expect(filterSubmissionsByClass(alle, 'k1', klassen).map((s) => s.id)).toEqual(['naam', 'a', 'id']);
    expect(filterSubmissionsByClass(alle, 'k2', klassen).map((s) => s.id)).toEqual(['b']);
  });

  it('telt per leerling hetzelfde als het dashboard (matchesStudent)', () => {
    for (const k of klassen) {
      const gefilterd = filterSubmissionsByClass(alle, k.id, klassen);
      for (const st of k.students) {
        // zo koppelt submissionsFor in het klasdashboard
        const dashboard = alle.filter((s) => matchesStudent(s, st));
        expect(gefilterd.filter((s) => matchesStudent(s, st))).toEqual(dashboard);
      }
    }
  });

  it('toont onder "zonder klas" ook inzendingen van een verwijderde of onbekende klas', () => {
    expect(filterSubmissionsByClass(alle, 'none', klassen).map((s) => s.id)).toEqual(['naam', 'weg', 'vreemd', 'id']);
  });

  it('verliest geen enkele inzending: elke inzending staat onder een klas of onder "zonder klas"', () => {
    const zichtbaar = new Set([
      ...filterSubmissionsByClass(alle, 'none', klassen),
      ...klassen.flatMap((k) => filterSubmissionsByClass(alle, k.id, klassen)),
    ].map((s) => s.id));
    expect([...zichtbaar].sort()).toEqual(alle.map((s) => s.id).sort());
  });

  it('koppelt nooit op naam als de inzending al een andere klas draagt', () => {
    const andereKlas = submission({ id: 'x', classId: 'k2', studentName: 'Emma Peeters' });
    expect(filterSubmissionsByClass([andereKlas], 'k1', klassen)).toEqual([]);
    const verwijderdeKlas = submission({ id: 'y', classId: 'verwijderd', studentName: 'Emma Peeters' });
    expect(filterSubmissionsByClass([verwijderdeKlas], 'k1', klassen)).toEqual([]);
  });

  it('valt niet om over een inzending met een beschadigde naam', () => {
    const kapot = { ...submission({ id: 'kapot' }), studentName: 5 } as unknown as Submission;
    expect(filterSubmissionsByClass([kapot, opNaam], 'k1', klassen).map((s) => s.id)).toEqual(['naam']);
    expect(filterSubmissionsByClass([kapot], 'none', klassen).map((s) => s.id)).toEqual(['kapot']);
  });

  it('houdt de strikte regel voor een klas-id dat niet in de lijst staat', () => {
    expect(filterSubmissionsByClass(alle, 'verwijderd', klassen).map((s) => s.id)).toEqual(['weg']);
  });

  it('werkt zonder klassen zoals vroeger', () => {
    expect(filterSubmissionsByClass(alle, 'k1').map((s) => s.id)).toEqual(['a']);
    expect(filterSubmissionsByClass(alle, 'none').map((s) => s.id)).toEqual(['naam', 'vreemd', 'id']);
    expect(filterSubmissionsByClass(alle, 'all', klassen)).toBe(alle);
  });
});

describe('isValidClassFilter', () => {
  const classIds = ['k1', 'k2'];

  it('aanvaardt "all" en "none" altijd', () => {
    expect(isValidClassFilter('all', [])).toBe(true);
    expect(isValidClassFilter('none', [])).toBe(true);
  });

  it('aanvaardt een bestaand klasId', () => {
    expect(isValidClassFilter('k1', classIds)).toBe(true);
  });

  it('wijst een onbekend of verwijderd klasId af', () => {
    expect(isValidClassFilter('k9', classIds)).toBe(false);
  });
});
