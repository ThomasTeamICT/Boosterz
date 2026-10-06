// Unittests op de pure stukken van de quiz-editor (widgets/quiz.tsx): tekst
// plakken (bulk-import), een optie verwijderen zonder dat de sleutel stil
// verschuift, de ruwe hintladder van de editor en het lezen van getalvelden.
// De schermkant (klikken, typen) zit in de rooktest.

import { describe, expect, it } from 'vitest';
import {
  editorHints, NO_CORRECT_INDEX, parseBulkQuestions, parseNumberInput, questionHints, removeOptionAt,
} from './quiz';
import { dictationMatches } from './dictation';
import { gradeQuestion } from '../lib/grading';
import type { MCQuestion, MultiQuestion, Question, ShortQuestion } from '../lib/types';

describe('parseBulkQuestions (tekst plakken)', () => {
  it('behoudt de getypte volgorde: het juiste antwoord blijft waar het stond', () => {
    const [q] = parseBulkQuestions('? Wat is de hoofdstad van Frankrijk?\n- Lyon\n* Parijs\n- Marseille');
    expect(q.type).toBe('mc');
    const mc = q as MCQuestion;
    expect(mc.options).toEqual(['Lyon', 'Parijs', 'Marseille']);
    expect(mc.correctIndex).toBe(1);
    expect(mc.options[mc.correctIndex]).toBe('Parijs');
  });

  it('juist antwoord als laatste regel', () => {
    const [q] = parseBulkQuestions('? Hoeveel is 2+2?\n- 3\n- 5\n* 4') as MCQuestion[];
    expect(q.options).toEqual(['3', '5', '4']);
    expect(q.correctIndex).toBe(2);
    expect(gradeQuestion(q, 2).earned).toBe(1);
    expect(gradeQuestion(q, 0).earned).toBe(0);
  });

  it('meerdere juiste: de indexen van de *-regels, in volgorde', () => {
    const [q] = parseBulkQuestions('? Welke zijn zoogdieren?\n- Haai\n* Hond\n- Kikker\n* Kat') as MultiQuestion[];
    expect(q.type).toBe('multi');
    expect(q.options).toEqual(['Haai', 'Hond', 'Kikker', 'Kat']);
    expect(q.correctIndices).toEqual([1, 3]);
  });

  it('kort antwoord, open vraag en meerregelige vraagstam blijven werken', () => {
    const qs = parseBulkQuestions('? 12 x 12 =\n= 144\n\n? Leg uit\nin eigen woorden.\n\n? Wat?\n* a\n- b');
    expect(qs.map((x) => x.type)).toEqual(['short', 'long', 'mc']);
    expect((qs[0] as ShortQuestion).accepted).toEqual(['144']);
    expect(qs[1].prompt).toBe('Leg uit\nin eigen woorden.');
  });

  it('negeert opties zonder voorafgaande vraag en vragen zonder tekst', () => {
    expect(parseBulkQuestions('* los\n- los\n?  \n* x')).toEqual([]);
  });

  it('het voorbeeld in het plakvenster zet het juiste antwoord niet bovenaan', () => {
    // zelfde tekst als de placeholder in BulkImportModal
    const voorbeeld = '? Wat is de hoofdstad van Frankrijk?\n- Lyon\n* Parijs\n- Marseille\n\n? 12 x 12 =\n= 144';
    const [q] = parseBulkQuestions(voorbeeld) as MCQuestion[];
    expect(q.correctIndex).not.toBe(0);
  });
});

describe('removeOptionAt (optie verwijderen)', () => {
  it('één juist: de sleutel schuift mee en blijft bij dezelfde tekst', () => {
    const options = ['Parijs', 'Lyon', 'Brussel', 'Gent'];
    const r = removeOptionAt(options, 2, 0);
    expect(r.options).toEqual(['Lyon', 'Brussel', 'Gent']);
    expect(r.correct).toBe(1);
    expect(r.options[r.correct as number]).toBe('Brussel');
  });

  it('één juist: een optie ná het juiste antwoord verwijderen laat de sleutel staan', () => {
    const r = removeOptionAt(['a', 'b', 'c'], 0, 2);
    expect(r).toEqual({ options: ['a', 'b'], correct: 0 });
  });

  it('één juist: het juiste antwoord zelf verwijderen = geen juist antwoord meer', () => {
    const r = removeOptionAt(['a', 'b', 'c'], 1, 1);
    expect(r).toEqual({ options: ['a', 'c'], correct: NO_CORRECT_INDEX });
    // geen enkele keuze (en ook blanco niet) levert dan punten op
    const q: MCQuestion = { id: 'q', type: 'mc', prompt: 'p', points: 1, options: r.options, correctIndex: r.correct as number };
    for (const a of [0, 1, undefined, null]) expect(gradeQuestion(q, a).earned).toBe(0);
  });

  it('één juist zonder sleutel blijft zonder sleutel', () => {
    expect(removeOptionAt(['a', 'b', 'c'], NO_CORRECT_INDEX, 0).correct).toBe(NO_CORRECT_INDEX);
  });

  it('meerdere juiste: verwijderde valt weg, latere schuiven op', () => {
    expect(removeOptionAt(['a', 'b', 'c', 'd'], [0, 2, 3], 2)).toEqual({ options: ['a', 'b', 'd'], correct: [0, 2] });
    expect(removeOptionAt(['a', 'b', 'c', 'd'], [1, 3], 0)).toEqual({ options: ['b', 'c', 'd'], correct: [0, 2] });
    expect(removeOptionAt(['a', 'b', 'c'], [1], 1)).toEqual({ options: ['a', 'c'], correct: [] });
  });

  it('laat de invoer ongemoeid', () => {
    const options = ['a', 'b', 'c'];
    const correct = [0, 2];
    removeOptionAt(options, correct, 0);
    expect(options).toEqual(['a', 'b', 'c']);
    expect(correct).toEqual([0, 2]);
  });
});

describe('editorHints (hintladder in de editor)', () => {
  const base: Question = { id: 'q', type: 'tf', prompt: 'p', points: 1, answer: true };

  it('toont een nieuwe, lege hint (de speler slaat die over)', () => {
    const q = { ...base, hints: [''] };
    expect(editorHints(q)).toEqual(['']);
    expect(questionHints(q)).toEqual([]);
  });

  it('bewaart spaties tijdens het typen (de speler snoeit ze)', () => {
    const q = { ...base, hints: ['herlees de '] };
    expect(editorHints(q)).toEqual(['herlees de ']);
    expect(questionHints(q)).toEqual(['herlees de']);
  });

  it('valt terug op het oude enkelvoudige hint-veld, net als de speler', () => {
    expect(editorHints({ ...base, hint: 'oud' })).toEqual(['oud']);
    expect(editorHints({ ...base, hints: [], hint: 'oud' })).toEqual(['oud']);
    expect(editorHints(base)).toEqual([]);
  });
});

describe('parseNumberInput (getalvelden in de editor)', () => {
  it('leest negatieve getallen en een komma als decimaalteken', () => {
    expect(parseNumberInput('-5')).toBe(-5);
    expect(parseNumberInput('2,5')).toBe(2.5);
    expect(parseNumberInput('2.5')).toBe(2.5);
    expect(parseNumberInput(' -0,25 ')).toBe(-0.25);
    expect(parseNumberInput('10')).toBe(10);
  });

  it('geeft null voor tussenstanden zonder getal', () => {
    for (const raw of ['', '-', ',', '.', 'abc', '  ']) expect(parseNumberInput(raw), raw).toBeNull();
  });

  it('een getal dat nog getypt wordt, telt al mee ("2," = 2)', () => {
    expect(parseNumberInput('2,')).toBe(2);
    expect(parseNumberInput('-0')).toBe(-0);
  });
});

// Het dictee (widgets/dictation.tsx) heeft geen eigen testbestand; de
// vergelijking van een getypte zin hoort bij dezelfde verbeterregels.
describe('dictationMatches', () => {
  it('negeert leestekens, hoofdletters en accenten standaard', () => {
    expect(dictationMatches('ik ga naar school', 'Ik ga naar school.')).toBe(true);
    expect(dictationMatches('hij heeft een boek', 'Hij heeft één boek.')).toBe(true);
  });

  it('typografische apostrof telt als de gewone', () => {
    expect(dictationMatches("l'école", 'l\u2019école')).toBe(true);
  });

  it('streng: hoofdletters en accenten tellen mee, leestekens nog altijd niet', () => {
    expect(dictationMatches('hij heeft een boek', 'Hij heeft één boek.', true)).toBe(false);
    expect(dictationMatches('Hij heeft een boek', 'Hij heeft één boek.', true)).toBe(false);
    expect(dictationMatches('Hij heeft één boek', 'Hij heeft één boek.', true)).toBe(true);
    expect(dictationMatches('El ano', 'El año', true)).toBe(false);
  });

  it('een blanco antwoord is nooit juist bij een echte zin', () => {
    expect(dictationMatches('', 'De zon schijnt.')).toBe(false);
  });
});
