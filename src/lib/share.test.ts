import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { decodeSubmission, sanitizeSharedWidget, sharedVersion } from './share';
import { sanitizeSubmission } from './progressTransfer';

function geldig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 's1', widgetId: 'w1', widgetCode: 'ABC123', studentName: 'Emma',
    startedAt: 1000, submittedAt: 2000, durationSec: 30, answers: { q1: 1 },
    itemScores: { q1: { earned: 1, max: 1, mode: 'auto' } }, totalEarned: 1, totalMax: 1, status: 'graded',
    ...over,
  };
}

const code = (o: unknown) => 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(o));

// ── KL2: inzendingen uit codes en bestanden saneren ─────────────────────────

describe('sanitizeSubmission', () => {
  it('laat een gewone inzending ongemoeid', () => {
    expect(sanitizeSubmission(geldig({ classId: 'k1', studentId: 'st1', teacherFeedback: 'Top', focusLosses: 2 }))).toEqual(
      geldig({ classId: 'k1', studentId: 'st1', teacherFeedback: 'Top', focusLosses: 2 })
    );
  });

  it('weigert een inzending zonder bruikbare widget, naam, antwoorden of indienmoment', () => {
    for (const fout of [
      { widgetId: '' }, { widgetId: 12 }, { studentName: '   ' }, { studentName: 12345 },
      { answers: null }, { answers: [1, 2] }, { answers: 'x' },
      { submittedAt: 'gisteren' }, { submittedAt: Infinity }, { submittedAt: undefined },
    ]) {
      expect(sanitizeSubmission(geldig(fout)), JSON.stringify(fout)).toBeNull();
    }
    expect(sanitizeSubmission(null)).toBeNull();
    expect(sanitizeSubmission([geldig()])).toBeNull();
  });

  it('geeft rommelvelden een getypte standaardwaarde', () => {
    const s = sanitizeSubmission(geldig({
      id: 5, widgetCode: null, startedAt: 'x', durationSec: -3, totalEarned: '9', totalMax: 'x',
      status: 'hack', teacherFeedback: 7, focusLosses: 'veel', classId: '', studentId: 3,
    }))!;
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
    expect(s.widgetCode).toBe('');
    expect(s.startedAt).toBe(2000);
    expect(s.durationSec).toBe(0);
    expect(s.totalEarned).toBe(0);
    expect(s.totalMax).toBe(0);
    expect(s.status).toBe('submitted');
    expect('teacherFeedback' in s).toBe(false);
    expect('focusLosses' in s).toBe(false);
    expect('classId' in s).toBe(false);
    expect('studentId' in s).toBe(false);
  });

  it('houdt alleen geldige scores per vraag over, anders null', () => {
    expect(sanitizeSubmission(geldig({ itemScores: 'nee' }))!.itemScores).toBeNull();
    expect(sanitizeSubmission(geldig({ itemScores: [] }))!.itemScores).toBeNull();
    const s = sanitizeSubmission(geldig({
      itemScores: {
        q1: { earned: 1, max: 2, mode: 'manual', comment: 'ok' },
        q2: { earned: '1', max: 1, mode: 'auto' },
        q3: { earned: 0, max: 3, mode: 'raar' },
        q4: null,
      },
    }))!;
    expect(s.itemScores).toEqual({ q1: { earned: 1, max: 2, mode: 'manual', comment: 'ok' } });
  });

  it('een vraag-id "__proto__" verandert het prototype niet', () => {
    const raw = JSON.parse('{"widgetId":"w","studentName":"E","answers":{},"submittedAt":1,"itemScores":{"__proto__":{"earned":1,"max":1,"mode":"auto"},"constructor":{"earned":1,"max":1,"mode":"auto"}}}');
    const s = sanitizeSubmission(raw)!;
    expect(Object.getPrototypeOf(s.itemScores)).toBe(Object.prototype);
    expect(Object.keys(s.itemScores!)).toEqual(['constructor']);
    expect(({} as Record<string, unknown>).earned).toBeUndefined();
  });

  it('snoeit de naam (spaties, hoogstens 80 tekens)', () => {
    expect(sanitizeSubmission(geldig({ studentName: '  Emma  ' }))!.studentName).toBe('Emma');
    expect(sanitizeSubmission(geldig({ studentName: 'x'.repeat(200) }))!.studentName).toHaveLength(80);
  });

  it('decodeSubmission bewaakt compact tegen wat een scherm kan laten crashen', () => {
    expect(decodeSubmission(code(geldig({ studentName: 12345 })))).toBeNull();
    expect(decodeSubmission(code(geldig({ widgetId: '' })))).toBeNull();
    expect(decodeSubmission(code(geldig({ answers: [1] })))).toBeNull();
    expect(decodeSubmission(code(geldig({ submittedAt: 'gisteren' })))).toBeNull();
    expect(decodeSubmission(code(geldig({ itemScores: 'nee' })))!.itemScores).toBeNull();
    expect(decodeSubmission(code(geldig({ itemScores: { q1: null, q2: 'x', q3: { earned: 1, max: 2, mode: 'auto' } } })))!.itemScores)
      .toEqual({ q3: { earned: 1, max: 2, mode: 'auto' } });
    const d = decodeSubmission(code(geldig({ totalEarned: '9', totalMax: 'x' })))!;
    expect([d.totalEarned, d.totalMax]).toEqual([0, 0]);
    expect(decodeSubmission(code(geldig()))!.studentName).toBe('Emma');
    expect(decodeSubmission('WF1.kapot')).toBeNull();
  });

  it('een vraag-id "__proto__" in een code verandert het prototype niet', () => {
    const raw = '{"widgetId":"w","studentName":"E","answers":{},"submittedAt":1,"itemScores":{"__proto__":{"earned":1,"max":1,"mode":"auto"}}}';
    const d = decodeSubmission('WF1.' + LZString.compressToEncodedURIComponent(raw))!;
    expect(Object.getPrototypeOf(d.itemScores)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).earned).toBeUndefined();
  });
});

// ── LL3: de versie van een gedeelde widget blijft die van de bron ───────────

describe('sanitizeSharedWidget', () => {
  const widget = (over: Record<string, unknown> = {}) => ({
    id: 'w1', type: 'quiz', title: 'Quiz', config: { questions: [] }, code: 'ABC123', createdAt: 1, updatedAt: 5000, ...over,
  });

  it('behoudt updatedAt van de bron (geen "nu" meer)', () => {
    expect(sanitizeSharedWidget(widget())!.updatedAt).toBe(5000);
  });

  it('begrenst een versie in de toekomst op nu', () => {
    const voor = Date.now();
    const v = sanitizeSharedWidget(widget({ updatedAt: Date.now() + 10 * 365 * 24 * 3600 * 1000 }))!.updatedAt;
    expect(v).toBeGreaterThanOrEqual(voor);
    expect(v).toBeLessThanOrEqual(Date.now());
  });

  it('geeft een gedeelde widget zonder titel de leerlingvriendelijke naam "Gedeelde oefening"', () => {
    expect(sanitizeSharedWidget(widget({ title: '  ' }))!.title).toBe('Gedeelde oefening');
  });

  it('sharedVersion: ontbrekend of onzin telt als nu', () => {
    for (const v of [undefined, null, 'x', NaN, -1, 0]) {
      const voor = Date.now();
      expect(sharedVersion(v)).toBeGreaterThanOrEqual(voor);
    }
    expect(sharedVersion(1234)).toBe(1234);
  });
});
