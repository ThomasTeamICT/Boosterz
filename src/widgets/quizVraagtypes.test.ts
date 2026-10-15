import { describe, expect, it } from 'vitest';
import { getTypeDef } from './registry';
import { QUESTION_TYPES } from './quiz';

describe('de tekst bij de quiz in het register', () => {
  // registry.tsx staat op het leerlingpad en mag quiz.tsx niet binnenhalen (de quiz laadt lui). Het getal in de tekst staat
  // er dus vast in; deze test bewaakt dat het gelijk blijft aan het aantal vraagtypes in de keuzelijst van de quiz-editor.
  it('noemt precies zoveel vraagtypes als de lijst van de quiz-editor toont', () => {
    const tagline = getTypeDef('quiz').tagline;
    const m = /(\d+) vraagtypes/.exec(tagline);
    expect(m, `geen aantal vraagtypes in "${tagline}"`).not.toBeNull();
    expect(Number(m?.[1])).toBe(QUESTION_TYPES.length);
  });
});
