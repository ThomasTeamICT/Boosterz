// Unittests op de vraag-linter (lib/linter.ts): de nummering moet dezelfde
// zijn als in de editor, en een vraag zonder sleutel (waar blanco alle punten
// kan krijgen) moet altijd gemeld worden, vooraan in de lijst.

import { describe, expect, it } from 'vitest';
import { lintQuiz, NO_KEY_TEXT } from './linter';
import { gradeQuestion } from './grading';
import type {
  GapQuestion, InfoBlock, MCQuestion, MultiQuestion, Question, QuizConfig, ShortQuestion, TFQuestion,
} from './types';

const mc = (o: Partial<MCQuestion> = {}): MCQuestion => ({
  id: 'mc', type: 'mc', prompt: 'Hoofdstad?', points: 1, explanation: 'uitleg',
  options: ['Brussel', 'Gent', 'Luik'], correctIndex: 0, ...o,
});
const multi = (o: Partial<MultiQuestion> = {}): MultiQuestion => ({
  id: 'multi', type: 'multi', prompt: 'Zoogdieren?', points: 1, explanation: 'uitleg',
  options: ['koe', 'forel', 'vleermuis'], correctIndices: [0, 2], ...o,
});
const short = (o: Partial<ShortQuestion> = {}): ShortQuestion => ({
  id: 'short', type: 'short', prompt: 'Hoofdstad van Frankrijk?', points: 1, explanation: 'uitleg',
  accepted: ['Parijs'], caseSensitive: false, ...o,
});
const gap = (o: Partial<GapQuestion> = {}): GapQuestion => ({
  id: 'gap', type: 'gap', prompt: '', points: 1, explanation: 'uitleg', text: 'De [kat] slaapt.', ...o,
});
const tf = (o: Partial<TFQuestion> = {}): TFQuestion => ({
  id: 'tf', type: 'tf', prompt: 'De zon is een ster.', points: 1, explanation: 'uitleg', answer: true, ...o,
});
const info = (id = 'info'): InfoBlock => ({ id, type: 'info', prompt: 'Lees eerst.', points: 0 });

const quiz = (questions: Question[]): QuizConfig => ({ questions, layout: 'scroll' });
const noKey = (qs: Question[]) => lintQuiz(quiz(qs)).filter((w) => w.text.startsWith(NO_KEY_TEXT));

describe('lintQuiz — nummering zoals de editor', () => {
  it('telt infoblokken mee, net als de badge in de editor', () => {
    const w = lintQuiz(quiz([info(), mc({ id: 'a' }), mc({ id: 'b', options: ['x', 'y'] })]));
    const tweeOpties = w.find((x) => x.text.startsWith('Minder dan 3'));
    expect(tweeOpties?.questionNo).toBe(3);
  });

  it('meldt nooit iets over een infoblok zelf', () => {
    const w = lintQuiz(quiz([info('i1'), info('i2')]));
    expect(w).toEqual([]);
  });
});

describe('lintQuiz — geen juist antwoord aangeduid', () => {
  it('een volledige vraag krijgt geen sleutelsignaal', () => {
    expect(noKey([mc(), multi(), short(), gap(), tf()])).toEqual([]);
  });

  it('meerdere antwoorden zonder aangevinkte optie (blanco krijgt dan alle punten)', () => {
    const q = multi({ correctIndices: [] });
    expect(gradeQuestion(q, undefined).earned).toBe(1); // het probleem dat de linter moet tonen
    const w = noKey([q]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ questionNo: 1, severe: true });
  });

  it('meerdere antwoorden waarvan alleen lege opties aangevinkt zijn', () => {
    expect(noKey([multi({ options: ['', 'a', 'b'], correctIndices: [0] })])).toHaveLength(1);
  });

  it('meerkeuze met een lege, ontbrekende of verwijderde juiste optie', () => {
    expect(noKey([mc({ options: ['', 'Gent', 'Luik'], correctIndex: 0 })])).toHaveLength(1);
    expect(noKey([mc({ correctIndex: -1 })])).toHaveLength(1);
    expect(noKey([mc({ correctIndex: 7 })])).toHaveLength(1);
    expect(noKey([{ ...mc(), correctIndex: undefined } as unknown as MCQuestion])).toHaveLength(1);
  });

  it('juist/onjuist zonder gekozen antwoord', () => {
    expect(noKey([{ ...tf(), answer: undefined } as unknown as TFQuestion])).toHaveLength(1);
    expect(noKey([tf({ answer: false })])).toEqual([]);
  });

  it('kort antwoord zonder aanvaard antwoord (lege regels tellen niet)', () => {
    expect(noKey([short({ accepted: [''] })])).toHaveLength(1);
    expect(noKey([short({ accepted: ['  ', ''] })])).toHaveLength(1);
    expect(noKey([short({ accepted: [] })])).toHaveLength(1);
  });

  it('invulgat zonder antwoord of met een leeg alternatief', () => {
    for (const text of ['De [ ] slaapt.', 'De [kat|] slaapt.', 'De [|] slaapt.', 'De [kat| ] slaapt.']) {
      const q = gap({ text });
      expect(gradeQuestion(q, ['']).earned).toBe(1); // blanco = juist: daarom het signaal
      const w = noKey([q]);
      expect(w, text).toHaveLength(1);
      expect(w[0].text).toContain('gat 1');
    }
    expect(noKey([gap({ text: 'De [kat|poes] slaapt op de [mat].' })])).toEqual([]);
  });

  it('noemt het juiste gat bij meerdere gaten', () => {
    const w = noKey([gap({ text: 'De [kat] slaapt op de [ ].' })]);
    expect(w).toHaveLength(1);
    expect(w[0].text).toContain('gat 2');
  });

  it('sleutelsignalen staan vooraan, met het editornummer', () => {
    const qs: Question[] = [
      mc({ id: 'a', options: ['x', 'y'] }),           // V1: minder dan 3 opties
      info(),                                          // V2: info
      multi({ id: 'b', correctIndices: [] }),          // V3: geen sleutel
    ];
    const w = lintQuiz(quiz(qs));
    expect(w[0].text.startsWith(NO_KEY_TEXT)).toBe(true);
    expect(w[0].questionNo).toBe(3);
    expect(w.some((x) => x.questionNo === 1 && x.text.startsWith('Minder dan 3'))).toBe(true);
  });

  it('crasht niet op onvolledige geïmporteerde vragen', () => {
    const kapot = [
      { id: 'x', type: 'multi', prompt: 'p', points: 1, options: ['a', 'b', 'c'] },
      { id: 'y', type: 'short', points: 1, caseSensitive: false },
      { id: 'z', type: 'gap', prompt: 'p', points: 1 },
    ] as unknown as Question[];
    expect(() => lintQuiz(quiz(kapot))).not.toThrow();
    expect(noKey(kapot).length).toBe(2); // multi en short; gap zonder tekst valt onder "zonder gaten"
  });
});
