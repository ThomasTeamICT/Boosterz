import { describe, expect, it } from 'vitest';
import type { Submission } from '../../lib/types';
import type { Course, CourseProgress } from '../../lib/courseTypes';
import {
  awaitingCount, bestAttemptPerStudent, courseProgressCsv, CSV_BOM, goalRefOf, groupSubmissionsByWidget, studentKeyOf,
} from './resultsHelpers';

function sub(over: Partial<Submission> & { id: string }): Submission {
  return {
    widgetId: 'w1', widgetCode: 'W1', studentName: 'Emma', startedAt: 0, submittedAt: 1, durationSec: 0,
    answers: {}, itemScores: null, totalEarned: 0, totalMax: 0, status: 'graded', ...over,
  };
}

describe('groupSubmissionsByWidget', () => {
  it('groepeert in één doorloop en houdt de volgorde binnen een widget', () => {
    const map = groupSubmissionsByWidget([
      sub({ id: 'a', widgetId: 'w1' }), sub({ id: 'b', widgetId: 'w2' }), sub({ id: 'c', widgetId: 'w1' }),
    ]);
    expect(map.get('w1')?.map((s) => s.id)).toEqual(['a', 'c']);
    expect(map.get('w2')?.map((s) => s.id)).toEqual(['b']);
    expect(map.get('w3')).toBeUndefined();
  });
});

describe('studentKeyOf', () => {
  it('trimt, ignoreert hoofdletters en kent anoniem', () => {
    expect(studentKeyOf({ studentName: '  Emma Peeters ' })).toBe('emma peeters');
    expect(studentKeyOf({ studentName: '' })).toBe('anoniem');
    // een beschadigde inzending laat de pagina niet vallen
    expect(studentKeyOf({ studentName: 42 as unknown as string })).toBe('anoniem');
  });
});

describe('bestAttemptPerStudent', () => {
  it('neemt per leerling de beste poging, niet de laatste', () => {
    const best = bestAttemptPerStudent([
      sub({ id: 'laat-slecht', submittedAt: 30, totalEarned: 1, totalMax: 4 }),
      sub({ id: 'beste', submittedAt: 20, totalEarned: 4, totalMax: 4 }),
      sub({ id: 'eerste', submittedAt: 10, totalEarned: 2, totalMax: 4 }),
      sub({ id: 'andere', studentName: 'Noah', submittedAt: 5, totalEarned: 2, totalMax: 4 }),
    ]);
    expect(best.map((s) => s.id).sort()).toEqual(['andere', 'beste']);
  });

  it('herkent dezelfde leerling ondanks hoofdletters en spaties', () => {
    const best = bestAttemptPerStudent([
      sub({ id: 'a', studentName: 'emma ', totalEarned: 1, totalMax: 2 }),
      sub({ id: 'b', studentName: 'Emma', submittedAt: 2, totalEarned: 1, totalMax: 2 }),
    ]);
    expect(best).toHaveLength(1);
  });

  it('kiest bij gelijkstand de nieuwste, ook als de invoer niet gesorteerd staat', () => {
    const best = bestAttemptPerStudent([
      sub({ id: 'oud', submittedAt: 1, totalEarned: 2, totalMax: 4 }),
      sub({ id: 'nieuw', submittedAt: 9, totalEarned: 2, totalMax: 4 }),
      sub({ id: 'midden', submittedAt: 5, totalEarned: 2, totalMax: 4 }),
    ]);
    expect(best.map((s) => s.id)).toEqual(['nieuw']);
  });

  it('valt terug op de nieuwste als geen enkele poging punten heeft', () => {
    const best = bestAttemptPerStudent([
      sub({ id: 'oud', submittedAt: 1 }),
      sub({ id: 'nieuw', submittedAt: 9 }),
    ]);
    expect(best.map((s) => s.id)).toEqual(['nieuw']);
  });

  it('geeft niets terug zonder inzendingen', () => {
    expect(bestAttemptPerStudent([])).toEqual([]);
  });
});

describe('awaitingCount', () => {
  it('telt inzendingen die nog nagekeken moeten worden', () => {
    expect(awaitingCount([
      sub({ id: 'a', status: 'submitted' }),
      sub({ id: 'b', status: 'graded' }),
      // status zegt nagekeken, maar een vraag staat nog open: ook voorlopig
      sub({ id: 'c', status: 'graded', itemScores: { q: { earned: 0, max: 2, mode: 'pending' } } }),
    ])).toBe(2);
    expect(awaitingCount([])).toBe(0);
  });
});

describe('goalRefOf', () => {
  it('geeft dezelfde code in twee leerplannen een andere sleutel', () => {
    const a = goalRefOf({ goalCode: 'lpd 3' }, 'cur-a');
    const b = goalRefOf({ goalCode: 'LPD  3' }, 'cur-b');
    expect(a?.code).toBe('LPD 3');
    expect(b?.code).toBe('LPD 3');
    expect(a?.key).not.toBe(b?.key);
    expect(a?.curriculumId).toBe('cur-a');
  });

  it('laat dezelfde code in hetzelfde leerplan samenvallen, ook zonder leerplan', () => {
    expect(goalRefOf({ goalCode: 'NW 1.1' }, 'cur-a')?.key).toBe(goalRefOf({ goalCode: ' nw 1.1 ' }, 'cur-a')?.key);
    expect(goalRefOf({ goalCode: 'NW 1.1' })?.key).toBe(goalRefOf({ goalCode: 'NW 1.1' }, '')?.key);
    expect(goalRefOf({ goalCode: 'NW 1.1' })?.curriculumId).toBeUndefined();
  });

  it('valt terug op de vrije tag, en laat de code voorgaan', () => {
    expect(goalRefOf({ goal: '  Werkwoorden ' })).toEqual({ key: 'vrij:Werkwoorden', code: null, tag: 'Werkwoorden' });
    expect(goalRefOf({ goalCode: 'NW 2.1', goal: 'Materie' }, 'c')?.code).toBe('NW 2.1');
    expect(goalRefOf({ goalCode: '  ', goal: '' })).toBeNull();
    expect(goalRefOf({})).toBeNull();
  });
});

const course = {
  id: 'c1', title: 'Cursus', author: '', coverEmoji: '', code: 'CCCCCC', createdAt: 0, updatedAt: 0,
  settings: {},
  chapters: [
    { id: 'h1', title: 'H1', emoji: '', sections: [
      { id: 's1', title: 'Een', blocks: [] },
      { id: 's2', title: 'Twee', blocks: [], optional: true },
    ] },
    { id: 'h2', title: 'Leeg', emoji: '', sections: [] },
  ],
} as unknown as Course;

function voortgang(naam: string, secties: CourseProgress['sections']): CourseProgress {
  return { courseId: 'c1', courseCode: 'CCCCCC', studentName: naam, sections: secties, lastSeenAt: 1_700_000_000_000, startedAt: 1 };
}

describe('courseProgressCsv', () => {
  const csv = courseProgressCsv(course, [
    voortgang('Emma', { s1: { openedAt: 1, completedAt: 2, secondsSpent: 5 }, s2: { openedAt: 1, secondsSpent: 1 } }),
    voortgang('=HYPERLINK("http://boos.example","klik")', {}),
  ]);
  const lines = csv.split('\n');

  it('begint met de BOM, zodat Excel de letters goed leest', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it('zet een kop per sectie, met "(keuze)" bij een keuzesectie', () => {
    expect(lines[0]).toBe(`${CSV_BOM}naam;voortgang %;laatst gezien;H1 › Een;H1 › Twee (keuze)`);
  });

  it('vult gelezen, geopend en niet geopend, zonder apostrof voor een streepje', () => {
    const emma = lines[1].split(';');
    expect(emma[0]).toBe('Emma');
    expect(emma[1]).toBe('100');
    expect(emma.slice(3)).toEqual(['gelezen', 'geopend']);
    expect(csv).not.toContain("'-");
  });

  it('maakt van een naam met een formule nooit een formule', () => {
    // apostrof ervoor, en de aanhalingstekens binnen de cel verdubbeld
    expect(lines[2].startsWith('"\'=HYPERLINK(""http://boos.example"",""klik"")";')).toBe(true);
    expect(lines[2].endsWith(';niet geopend;niet geopend')).toBe(true);
  });
});
