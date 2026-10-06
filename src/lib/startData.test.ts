import { describe, expect, it } from 'vitest';
import { EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID } from './examples';
import {
  buildRecentItems, computeWeekCounts, EXAMPLE_CLASS_NAME, greeting, isExampleClassName,
  isExampleCourse, isExampleWidgetEntry, isExampleWidgetTitle, isReturningTeacher, pickNextAssignment,
  relativeDay,
} from './startData';

describe('isExampleWidgetTitle', () => {
  it('herkent de vaste voorvoegsels uit lib/seed.ts', () => {
    expect(isExampleWidgetTitle('Voorbeeld: quiz over België')).toBe(true);
    expect(isExampleWidgetTitle('Sjabloon: 3-2-1 exit-ticket')).toBe(true);
  });
  it('laat eigen titels met rust', () => {
    expect(isExampleWidgetTitle('Herhalingstoets hoofdstuk 3')).toBe(false);
    expect(isExampleWidgetTitle('')).toBe(false);
  });
});

describe('isExampleWidgetEntry', () => {
  it('herkent voorbeeldmateriaal aan de titel', () => {
    expect(isExampleWidgetEntry({ title: 'Voorbeeld: quiz over België' })).toBe(true);
    expect(isExampleWidgetEntry({ title: 'Sjabloon: exit-ticket', folderId: null })).toBe(true);
  });
  it('herkent de oefeningen van de voorbeeldcursus aan de voorbeeldmap', () => {
    expect(isExampleWidgetEntry({ title: 'Begrippenquiz: krachten', folderId: EXAMPLE_FOLDER_ID })).toBe(true);
  });
  it('laat een eigen widget met rust, ook in een eigen map', () => {
    expect(isExampleWidgetEntry({ title: 'Herhaling hoofdstuk 3' })).toBe(false);
    expect(isExampleWidgetEntry({ title: 'Herhaling hoofdstuk 3', folderId: null })).toBe(false);
    expect(isExampleWidgetEntry({ title: 'Herhaling hoofdstuk 3', folderId: 'mijn-map' })).toBe(false);
  });
});

describe('isExampleCourse', () => {
  it('herkent de ingelezen voorbeeldcursus op id', () => {
    expect(isExampleCourse({ id: EXAMPLE_COURSE_ID, title: 'Iets anders' })).toBe(true);
  });
  it('herkent de democursus op titel', () => {
    expect(isExampleCourse({ id: 'x', title: 'Voorbeeldcursus: de waterkringloop' })).toBe(true);
  });
  it('laat een eigen cursus met rust', () => {
    expect(isExampleCourse({ id: 'x', title: 'Aardrijkskunde hoofdstuk 4' })).toBe(false);
  });
});

describe('isExampleClassName', () => {
  it('herkent de naam van seedExampleClass()', () => {
    expect(isExampleClassName(EXAMPLE_CLASS_NAME)).toBe(true);
  });
  it('laat een eigen klasnaam met rust', () => {
    expect(isExampleClassName('3A wiskunde')).toBe(false);
  });
});

describe('isReturningTeacher', () => {
  it('is niet terugkerend met enkel voorbeeldmateriaal', () => {
    const result = isReturningTeacher({
      widgets: [{ title: 'Voorbeeld: quiz over België' }, { title: 'Sjabloon: exit-ticket' }],
      courses: [{ id: EXAMPLE_COURSE_ID, title: 'Natuurwetenschappen 1e graad' }],
      classes: [{ name: EXAMPLE_CLASS_NAME, students: [{ id: '1' }, { id: '2' }] }],
    });
    expect(result).toBe(false);
  });

  it('is niet terugkerend met enkel de voorbeeldcursus en zijn oefeningen in de voorbeeldmap (CU12)', () => {
    // De widgets van de voorbeeldcursus dragen geen "Voorbeeld:"-titel, wel de voorbeeldmap.
    const result = isReturningTeacher({
      widgets: [
        { title: 'Begrippenquiz: krachten', folderId: EXAMPLE_FOLDER_ID },
        { title: 'Koppelspel: soorten krachten', folderId: EXAMPLE_FOLDER_ID },
        { title: 'Flitskaarten: hoofdstuk 1', folderId: EXAMPLE_FOLDER_ID },
      ],
      courses: [{ id: EXAMPLE_COURSE_ID, title: 'Natuurwetenschappen 1e graad' }],
      classes: [],
    });
    expect(result).toBe(false);
  });

  it('is wel terugkerend zodra er naast de voorbeeldmap een eigen widget bijkomt (CU12)', () => {
    expect(
      isReturningTeacher({
        widgets: [
          { title: 'Begrippenquiz: krachten', folderId: EXAMPLE_FOLDER_ID },
          { title: 'Mijn eigen quiz', folderId: null },
        ],
        courses: [{ id: EXAMPLE_COURSE_ID, title: 'Natuurwetenschappen 1e graad' }],
        classes: [],
      })
    ).toBe(true);
    // ook een widget in een eigen map telt als eigen werk
    expect(
      isReturningTeacher({ widgets: [{ title: 'Mijn quiz', folderId: 'frans' }], courses: [], classes: [] })
    ).toBe(true);
  });

  it('is niet terugkerend zonder enig materiaal', () => {
    expect(isReturningTeacher({ widgets: [], courses: [], classes: [] })).toBe(false);
  });

  it('is terugkerend bij één eigen widget', () => {
    expect(
      isReturningTeacher({
        widgets: [{ title: 'Voorbeeld: quiz' }, { title: 'Herhaling hoofdstuk 2' }],
        courses: [],
        classes: [],
      })
    ).toBe(true);
  });

  it('is terugkerend bij één eigen cursus', () => {
    expect(
      isReturningTeacher({
        widgets: [],
        courses: [{ id: 'c1', title: 'Mijn eigen cursus' }],
        classes: [],
      })
    ).toBe(true);
  });

  it('is terugkerend bij een eigen klas met leerlingen', () => {
    expect(
      isReturningTeacher({
        widgets: [],
        courses: [],
        classes: [{ name: '1A', students: [{ id: '1' }] }],
      })
    ).toBe(true);
  });

  it('telt een eigen klas zonder leerlingen niet mee', () => {
    expect(
      isReturningTeacher({
        widgets: [],
        courses: [],
        classes: [{ name: '1A', students: [] }],
      })
    ).toBe(false);
  });
});

describe('greeting', () => {
  it('groet volgens het uur', () => {
    expect(greeting(0)).toBe('Goeiemorgen');
    expect(greeting(8)).toBe('Goeiemorgen');
    expect(greeting(11)).toBe('Goeiemorgen');
    expect(greeting(12)).toBe('Goeiemiddag');
    expect(greeting(17)).toBe('Goeiemiddag');
    expect(greeting(18)).toBe('Goeienavond');
    expect(greeting(23)).toBe('Goeienavond');
  });
});

describe('relativeDay', () => {
  // Donderdag 24 september 2026, 10u.
  const nu = new Date('2026-09-24T10:00:00').getTime();

  it('toont vandaag en gisteren', () => {
    expect(relativeDay(nu, nu)).toBe('vandaag');
    expect(relativeDay(nu - 6 * 3600_000, nu)).toBe('vandaag');
    expect(relativeDay(nu - 24 * 3600_000, nu)).toBe('gisteren');
  });

  it('toont een korte dagnaam binnen de week', () => {
    expect(relativeDay(new Date('2026-09-21T09:00:00').getTime(), nu)).toBe('ma');
    expect(relativeDay(new Date('2026-09-18T09:00:00').getTime(), nu)).toBe('vr');
  });

  it('toont een datum voorbij een week', () => {
    const result = relativeDay(new Date('2026-09-17T09:00:00').getTime(), nu);
    expect(result).not.toBe('vandaag');
    expect(result).not.toBe('gisteren');
    expect(result).toMatch(/17/);
  });
});

describe('buildRecentItems', () => {
  it('mengt widgets en cursussen, nieuwste eerst', () => {
    const items = buildRecentItems(
      [
        { id: 'w1', title: 'Quiz', type: 'quiz', updatedAt: 100 },
        { id: 'w2', title: 'Woordzoeker', type: 'wordsearch', updatedAt: 300 },
      ],
      [{ id: 'c1', title: 'Cursus natuur', chapterCount: 4, updatedAt: 200 }]
    );
    expect(items.map((i) => i.id)).toEqual(['w2', 'c1', 'w1']);
    expect(items[0].kind).toBe('widget');
    expect(items[1].kind).toBe('course');
  });

  it('beperkt tot de limiet', () => {
    const widgets = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`, title: `Widget ${i}`, type: 'quiz' as const, updatedAt: i,
    }));
    expect(buildRecentItems(widgets, [], 5)).toHaveLength(5);
  });
});

describe('computeWeekCounts', () => {
  const now = new Date('2026-09-24T10:00:00').getTime();
  const dag = 86_400_000;

  it('telt open vragen, deadlines en inzendingen deze week', () => {
    const counts = computeWeekCounts(
      [
        { status: 'submitted', submittedAt: now - dag },
        { status: 'graded', submittedAt: now - dag },
        { status: 'submitted', submittedAt: now - 20 * dag }, // buiten de week, telt wel als "na te kijken"
      ],
      [
        { dueAt: now + 2 * dag }, // deze week
        { dueAt: now + 10 * dag }, // te ver weg
        { dueAt: now - dag }, // al voorbij
        { dueAt: null },
      ],
      now
    );
    expect(counts.toGrade).toBe(2);
    expect(counts.deadlinesThisWeek).toBe(1);
    expect(counts.submittedThisWeek).toBe(2);
  });

  it('toont 0 zonder aandachtspunten', () => {
    expect(computeWeekCounts([], [], now)).toEqual({ toGrade: 0, deadlinesThisWeek: 0, submittedThisWeek: 0 });
  });
});

describe('pickNextAssignment', () => {
  const now = 1_000_000;

  it('kiest de dichtstbijzijnde toekomstige deadline', () => {
    const a = { id: 'a', dueAt: now + 5000 };
    const b = { id: 'b', dueAt: now + 1000 };
    const c = { id: 'c', dueAt: now - 1000 }; // al voorbij
    expect(pickNextAssignment([a, b, c], now)?.id).toBe('b');
  });

  it('geeft null zonder toekomstige deadline', () => {
    expect(pickNextAssignment([{ dueAt: null }, { dueAt: now - 1000 }], now)).toBeNull();
    expect(pickNextAssignment([], now)).toBeNull();
  });
});
