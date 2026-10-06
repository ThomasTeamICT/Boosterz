import { describe, expect, it } from 'vitest';
import {
  aggregateGoalScores, awaitsGrading, courseGoalCodes, goalPct, goalScoreKey, scoresPerGoal, widgetGoalCodes,
} from './goals';
import type { ItemScore, Submission, Widget } from './types';
import type { Course } from './courseTypes';

const widget = {
  id: 'w1', type: 'quiz', title: 'q', folderId: null, code: 'ABC123', createdAt: 0, updatedAt: 0,
  settings: {} as Widget['settings'],
  config: { questions: [
    { id: 'a', goalCode: 'wis 2.3' }, { id: 'b', goalCode: 'WIS 2.3' }, { id: 'c', goalCode: 'WIS 1.1' }, { id: 'd' },
  ] },
} as unknown as Widget;

const sub = {
  id: 's', widgetId: 'w1', widgetCode: 'ABC123', studentName: 'Jan', startedAt: 0, submittedAt: 0, durationSec: 0,
  answers: {}, totalEarned: 3, totalMax: 4, status: 'submitted',
  itemScores: { a: { earned: 1, max: 1, mode: 'auto' }, b: { earned: 0, max: 1, mode: 'auto' }, c: { earned: 1, max: 1, mode: 'auto' }, d: { earned: 1, max: 1, mode: 'auto' } },
} as unknown as Submission;

function quiz(id: string, questions: { id: string; goalCode?: string }[], curriculumId?: string): Widget {
  return {
    id, type: 'quiz', title: id, folderId: null, code: id.toUpperCase(), createdAt: 0, updatedAt: 0,
    settings: {} as Widget['settings'],
    config: { questions },
    ...(curriculumId !== undefined ? { curriculumId } : {}),
  } as unknown as Widget;
}

function inzending(itemScores: Record<string, ItemScore> | null, over: Partial<Submission> = {}): Submission {
  return {
    id: 's', widgetId: 'w', widgetCode: 'W', studentName: 'Emma', startedAt: 0, submittedAt: 0, durationSec: 0,
    answers: {}, itemScores, totalEarned: 0, totalMax: 0, status: 'graded', ...over,
  };
}

describe('doelcodes', () => {
  it('normaliseert codes (spaties, hoofdletters) en ontdubbelt', () => {
    expect(widgetGoalCodes(widget)).toEqual(['WIS 2.3', 'WIS 1.1']);
  });
  it('telt scores per doel op; vragen zonder code tellen niet mee', () => {
    const per = scoresPerGoal(sub, widget);
    // strikt: een widget zonder leerplan zet geen leeg curriculumId- of pending-veld
    expect(per).toStrictEqual([
      { code: 'WIS 2.3', earned: 1, max: 2, items: 2 },
      { code: 'WIS 1.1', earned: 1, max: 1, items: 1 },
    ]);
    expect(goalPct(per[0])).toBe(50);
    expect(goalPct(undefined)).toBeNull();
  });
  it('voegt lijsten samen over inzendingen heen', () => {
    const agg = aggregateGoalScores([scoresPerGoal(sub, widget), scoresPerGoal(sub, widget)]);
    expect(agg.get(goalScoreKey({ code: 'WIS 2.3' }))).toStrictEqual({ code: 'WIS 2.3', earned: 2, max: 4, items: 4 });
    expect([...agg.keys()]).toEqual(['|WIS 2.3', '|WIS 1.1']);
  });
  it('verzamelt cursusdoelen uit secties en meegegeven widgets', () => {
    const course = { chapters: [{ id: 'c', title: '', emoji: '', sections: [{ id: 's', title: '', blocks: [], goalCodes: ['wis  3.1', 'WIS 2.3'] }] }] } as unknown as Course;
    expect(courseGoalCodes(course, [widget])).toEqual(['WIS 3.1', 'WIS 2.3', 'WIS 1.1']);
  });
});

describe('doelscores per leerplan (dezelfde code in twee leerplannen)', () => {
  const vraag = [{ id: 'q1', goalCode: 'LPD 9' }];
  const juist = inzending({ q1: { earned: 1, max: 1, mode: 'auto' } });
  const fout = inzending({ q1: { earned: 0, max: 1, mode: 'auto' } });

  it('neemt het leerplan van de widget over', () => {
    expect(scoresPerGoal(juist, quiz('wa', vraag, 'curA'))).toStrictEqual([
      { code: 'LPD 9', curriculumId: 'curA', earned: 1, max: 1, items: 1 },
    ]);
  });

  it('telt "LPD 9" van twee leerplannen niet samen', () => {
    const agg = aggregateGoalScores([
      scoresPerGoal(juist, quiz('wa', vraag, 'curA')),
      scoresPerGoal(fout, quiz('wb', vraag, 'curB')),
    ]);
    expect(agg.size).toBe(2);
    expect(agg.get(goalScoreKey({ code: 'LPD 9', curriculumId: 'curA' }))).toStrictEqual(
      { code: 'LPD 9', curriculumId: 'curA', earned: 1, max: 1, items: 1 }
    );
    expect(agg.get(goalScoreKey({ code: 'LPD 9', curriculumId: 'curB' }))).toStrictEqual(
      { code: 'LPD 9', curriculumId: 'curB', earned: 0, max: 1, items: 1 }
    );
  });

  it('houdt widgets zonder leerplan apart, en telt ze onderling samen zoals vroeger', () => {
    const agg = aggregateGoalScores([
      scoresPerGoal(juist, quiz('wa', vraag, 'curA')),
      scoresPerGoal(juist, quiz('w1', vraag)),
      scoresPerGoal(fout, quiz('w2', vraag, '')), // leeg id = geen leerplan
    ]);
    expect(agg.size).toBe(2);
    expect(agg.get('|LPD 9')).toStrictEqual({ code: 'LPD 9', earned: 1, max: 2, items: 2 });
    expect(agg.get('curA|LPD 9')?.items).toBe(1);
  });

  it('telt twee widgets van hetzelfde leerplan wel samen', () => {
    const agg = aggregateGoalScores([
      scoresPerGoal(juist, quiz('wa', vraag, 'curA')),
      scoresPerGoal(fout, quiz('wa2', vraag, 'curA')),
    ]);
    expect([...agg.values()]).toStrictEqual([{ code: 'LPD 9', curriculumId: 'curA', earned: 1, max: 2, items: 2 }]);
  });

  it('maakt de sleutel uit leerplan en code', () => {
    expect(goalScoreKey({ code: 'LPD 9', curriculumId: 'curA' })).toBe('curA|LPD 9');
    expect(goalScoreKey({ code: 'LPD 9' })).toBe('|LPD 9');
    expect(goalScoreKey({ code: 'LPD 9', curriculumId: '' })).toBe('|LPD 9');
  });
});

describe('doelscores met vragen die nog nagekeken moeten worden', () => {
  it('telt een open vraag die wacht niet als 0 (1/1 met één wachtende, niet 1/4)', () => {
    const w = quiz('w', [{ id: 'q1', goalCode: '2.1' }, { id: 'q2', goalCode: '2.1' }]);
    const s = inzending({ q1: { earned: 1, max: 1, mode: 'auto' }, q2: { earned: 0, max: 3, mode: 'pending' } });
    const per = scoresPerGoal(s, w);
    expect(per).toStrictEqual([{ code: '2.1', earned: 1, max: 1, items: 1, pending: 1 }]);
    expect(goalPct(per[0])).toBe(100);
  });

  it('geeft 2/2 voorlopig en geen 20 % als een open vraag van 8 punten wacht', () => {
    const w = quiz('w', [{ id: 'a', goalCode: 'NW 1.1' }, { id: 'b', goalCode: 'NW 1.1' }]);
    const s = inzending(
      { a: { earned: 2, max: 2, mode: 'auto' }, b: { earned: 0, max: 8, mode: 'pending' } },
      { totalEarned: 2, totalMax: 10, status: 'submitted' }
    );
    const [g] = scoresPerGoal(s, w);
    expect(goalPct(g)).toBe(100);
    expect(g.pending).toBe(1);
    expect(awaitsGrading(s)).toBe(true);
  });

  it('houdt een doel waar alleen nog werk wacht zichtbaar, zonder percentage', () => {
    const w = quiz('w', [{ id: 'open', goalCode: '3.1' }, { id: 'mc', goalCode: '3.2' }]);
    const s = inzending({ open: { earned: 0, max: 4, mode: 'pending' }, mc: { earned: 0, max: 1, mode: 'auto' } });
    const per = scoresPerGoal(s, w);
    expect(per).toStrictEqual([
      { code: '3.1', earned: 0, max: 0, items: 0, pending: 1 },
      { code: '3.2', earned: 0, max: 1, items: 1 },
    ]);
    expect(goalPct(per[0])).toBeNull();
    expect(goalPct(per[1])).toBe(0);
  });

  it('telt een nagekeken open vraag (manual) gewoon mee', () => {
    const w = quiz('w', [{ id: 'open', goalCode: '3.1' }]);
    const s = inzending({ open: { earned: 3, max: 4, mode: 'manual' } });
    expect(scoresPerGoal(s, w)).toStrictEqual([{ code: '3.1', earned: 3, max: 4, items: 1 }]);
  });

  it('telt wachtende vragen op over inzendingen heen', () => {
    const w = quiz('w', [{ id: 'q1', goalCode: '2.1' }, { id: 'q2', goalCode: '2.1' }], 'curA');
    const wacht = inzending({ q1: { earned: 1, max: 1, mode: 'auto' }, q2: { earned: 0, max: 3, mode: 'pending' } });
    const klaar = inzending({ q1: { earned: 0, max: 1, mode: 'auto' }, q2: { earned: 2, max: 3, mode: 'manual' } });
    const agg = aggregateGoalScores([scoresPerGoal(wacht, w), scoresPerGoal(klaar, w), scoresPerGoal(wacht, w)]);
    expect(agg.get('curA|2.1')).toStrictEqual({ code: '2.1', curriculumId: 'curA', earned: 4, max: 6, items: 4, pending: 2 });
    const zonderWacht = aggregateGoalScores([scoresPerGoal(klaar, w)]);
    expect(zonderWacht.get('curA|2.1')).not.toHaveProperty('pending');
  });
});

describe('awaitsGrading', () => {
  it('volgt de status "submitted" (de teller Nakijken)', () => {
    expect(awaitsGrading(inzending(null, { status: 'submitted' }))).toBe(true);
    expect(awaitsGrading(inzending({ a: { earned: 1, max: 1, mode: 'auto' } }, { status: 'graded' }))).toBe(false);
    expect(awaitsGrading(inzending(null, { status: 'graded' }))).toBe(false);
  });

  it('vangt een wachtende vraag op, ook als de status iets anders zegt', () => {
    expect(awaitsGrading(inzending({ a: { earned: 0, max: 2, mode: 'pending' } }, { status: 'graded' }))).toBe(true);
  });

  it('valt niet om over beschadigde itemScores', () => {
    const raar = { ...inzending(null), itemScores: 'nee' } as unknown as Submission;
    expect(awaitsGrading(raar)).toBe(false);
    const metGat = { ...inzending(null), itemScores: { a: null } } as unknown as Submission;
    expect(awaitsGrading(metGat)).toBe(false);
  });
});
