// Unittests op de scoringsmotor (lib/grading.ts).
//
// Deze tests leggen de PUNTENTELLING vast, niet de implementatie: per vraagtype
// volledig juist, volledig fout, gedeeltelijk (exacte fractie), leeg antwoord en
// een lege/kapotte configuratie. Een stille scoringsfout op een rapport is het
// duurste soort bug in deze app — vandaar deze vangrail.

import { describe, expect, it } from 'vitest';
import {
  extractGaps, gapPreview, gradeQuestion, gradeQuiz, matchChoiceCorrect, quizMaxScore, splitGapText,
} from './grading';
import type {
  GapQuestion, InfoBlock, LongQuestion, MCQuestion, MatchQuestion, MultiQuestion, NumberQuestion,
  OrderQuestion, Question, QuizConfig, RatingQuestion, ShortQuestion, SliderQuestion, TFQuestion,
  UploadQuestion,
} from './types';

// ── Vraagfabriekjes ─────────────────────────────────────────────────────────

const mc = (o: Partial<MCQuestion> = {}): MCQuestion => ({
  id: 'q-mc', type: 'mc', prompt: 'Wat is de hoofdstad van België?', points: 2,
  options: ['Brussel', 'Antwerpen', 'Gent'], correctIndex: 0, ...o,
});
const tf = (o: Partial<TFQuestion> = {}): TFQuestion => ({
  id: 'q-tf', type: 'tf', prompt: 'De zon is een ster.', points: 1, answer: true, ...o,
});
const multi = (o: Partial<MultiQuestion> = {}): MultiQuestion => ({
  id: 'q-multi', type: 'multi', prompt: 'Welke zijn zoogdieren?', points: 3,
  options: ['koe', 'forel', 'vleermuis', 'mus'], correctIndices: [0, 2], ...o,
});
const short = (o: Partial<ShortQuestion> = {}): ShortQuestion => ({
  id: 'q-short', type: 'short', prompt: 'Hoofdstad van Frankrijk?', points: 2,
  accepted: ['Parijs'], caseSensitive: false, ...o,
});
const num = (o: Partial<NumberQuestion> = {}): NumberQuestion => ({
  id: 'q-num', type: 'number', prompt: 'Hoeveel is 7 × 6?', points: 1, answer: 42, tolerance: 0, ...o,
});
const slider = (o: Partial<SliderQuestion> = {}): SliderQuestion => ({
  id: 'q-slider', type: 'slider', prompt: 'Schat het aantal.', points: 2,
  min: 0, max: 100, step: 1, answer: 50, tolerance: 5, ...o,
});
const gap = (o: Partial<GapQuestion> = {}): GapQuestion => ({
  id: 'q-gap', type: 'gap', prompt: 'Vul aan.', points: 3, text: 'De [kat] jaagt op de [muis].', ...o,
});
const match = (o: Partial<MatchQuestion> = {}): MatchQuestion => ({
  id: 'q-match', type: 'match', prompt: 'Koppel.', points: 3,
  pairs: [{ left: 'hond', right: 'blaft' }, { left: 'kat', right: 'miauwt' }, { left: 'koe', right: 'loeit' }], ...o,
});
const order = (o: Partial<OrderQuestion> = {}): OrderQuestion => ({
  id: 'q-order', type: 'order', prompt: 'Zet in volgorde.', points: 4,
  items: ['eerst', 'dan', 'daarna', 'ten slotte'], ...o,
});
const long = (o: Partial<LongQuestion> = {}): LongQuestion => ({
  id: 'q-long', type: 'long', prompt: 'Leg uit in eigen woorden.', points: 5, ...o,
});
const info = (o: Partial<InfoBlock> = {}): InfoBlock => ({
  id: 'q-info', type: 'info', prompt: 'Lees eerst deze tekst.', points: 0, ...o,
});

const quiz = (questions: Question[]): QuizConfig => ({ questions, layout: 'scroll' });

// ═══════════════════════════════════════════════════════════════════════════
// Hulpfuncties voor gap-teksten
// ═══════════════════════════════════════════════════════════════════════════

describe('extractGaps', () => {
  it('haalt elk gat tussen vierkante haken uit de tekst, in volgorde', () => {
    expect(extractGaps('De [kat] jaagt op de [muis].')).toEqual(['kat', 'muis']);
  });

  it('geeft een lege lijst voor een tekst zonder gaten', () => {
    expect(extractGaps('Gewoon een zin zonder haken.')).toEqual([]);
  });

  it('behoudt de |-alternatieven ongesplitst zodat de grader ze zelf kan lezen', () => {
    expect(extractGaps('Hoofdstad: [Brussel|Bruxelles].')).toEqual(['Brussel|Bruxelles']);
  });
});

describe('splitGapText', () => {
  it('splitst tekst en gaten in volgorde met oplopende gatindex', () => {
    expect(splitGapText('De [kat] en de [hond].')).toEqual([
      { type: 'text', value: 'De ' },
      { type: 'gap', value: 'kat', gapIndex: 0 },
      { type: 'text', value: ' en de ' },
      { type: 'gap', value: 'hond', gapIndex: 1 },
      { type: 'text', value: '.' },
    ]);
  });

  it('geeft één tekstsegment als er geen gaten zijn', () => {
    expect(splitGapText('Geen gaten hier.')).toEqual([{ type: 'text', value: 'Geen gaten hier.' }]);
  });
});

describe('gapPreview', () => {
  it('vervangt elk gat door streepjes voor de afdrukweergave', () => {
    expect(gapPreview(gap({ text: 'De [kat] jaagt.' }))).toBe('De _____ jaagt.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kernvraagtypes
// ═══════════════════════════════════════════════════════════════════════════

describe('gradeQuestion — mc (meerkeuze, één juist)', () => {
  it('geeft de volle punten voor de juiste keuze', () => {
    expect(gradeQuestion(mc(), 0)).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('geeft 0 voor een foute keuze', () => {
    expect(gradeQuestion(mc(), 1)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('geeft 0 zonder crash als er niets gekozen is', () => {
    expect(gradeQuestion(mc(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('rekent een index-als-tekst niet juist (strikte vergelijking)', () => {
    expect(gradeQuestion(mc(), '0').earned).toBe(0);
  });

  it('geeft niets weg bij een kapotte vraag zonder juist antwoord', () => {
    expect(gradeQuestion(mc({ options: [], correctIndex: -1 }), 0).earned).toBe(0);
  });
});

describe('gradeQuestion — tf (juist/onjuist)', () => {
  it('geeft de volle punten voor het juiste oordeel', () => {
    expect(gradeQuestion(tf(), true)).toEqual({ earned: 1, max: 1, mode: 'auto' });
  });

  it('geeft 0 voor het foute oordeel', () => {
    expect(gradeQuestion(tf(), false).earned).toBe(0);
  });

  it('geeft 0 zonder crash als de leerling niets aankruiste', () => {
    expect(gradeQuestion(tf(), undefined)).toEqual({ earned: 0, max: 1, mode: 'auto' });
  });
});

describe('gradeQuestion — multi (meerkeuze, meerdere juist)', () => {
  it('geeft de volle punten als exact de juiste opties aangevinkt zijn', () => {
    expect(gradeQuestion(multi(), [0, 2])).toEqual({ earned: 3, max: 3, mode: 'auto' });
  });

  it('telt de volgorde van aanvinken niet mee', () => {
    expect(gradeQuestion(multi(), [2, 0]).earned).toBe(3);
  });

  it('geeft alles of niets: één juiste van twee levert 0 op', () => {
    expect(gradeQuestion(multi(), [0]).earned).toBe(0);
  });

  it('geeft 0 als er te veel aangevinkt is (juiste + een fout)', () => {
    expect(gradeQuestion(multi(), [0, 1, 2]).earned).toBe(0);
  });

  it('geeft 0 zonder crash bij een leeg of ontbrekend antwoord', () => {
    expect(gradeQuestion(multi(), []).earned).toBe(0);
    expect(gradeQuestion(multi(), undefined).earned).toBe(0);
  });

  it('geeft de volle punten als er niets juist is en niets aangevinkt werd', () => {
    // kapotte configuratie: geen juiste opties; leeg = "exact juist"
    expect(gradeQuestion(multi({ correctIndices: [] }), []).earned).toBe(3);
  });
});

describe('gradeQuestion — short (kort antwoord)', () => {
  it('aanvaardt het exacte antwoord', () => {
    expect(gradeQuestion(short(), 'Parijs')).toEqual({ earned: 2, max: 2, mode: 'auto' });
  });

  it('negeert hoofdletters, spaties aan de randen en dubbele spaties', () => {
    expect(gradeQuestion(short(), '  parijs ').earned).toBe(2);
    expect(gradeQuestion(short({ accepted: ['New York'] }), 'new    york').earned).toBe(2);
  });

  it('negeert accenten (café = cafe)', () => {
    expect(gradeQuestion(short({ accepted: ['café'] }), 'cafe').earned).toBe(2);
  });

  it('typografische apostrof telt als de gewone (foto’s = foto\'s)', () => {
    expect(gradeQuestion(short({ accepted: ["foto's"] }), 'foto\u2019s').earned).toBe(2);
    expect(gradeQuestion(short({ accepted: ['l\u2019école'] }), "l'ecole").earned).toBe(2);
  });

  it('accentgevoelig (opt-in): été is niet ete, hoofdletters blijven soepel', () => {
    const q = short({ accepted: ['été'], accentSensitive: true });
    expect(gradeQuestion(q, 'ete').earned).toBe(0);
    expect(gradeQuestion(q, 'Été').earned).toBe(2);
    expect(gradeQuestion(q, 'été').earned).toBe(2);
  });

  it('hoofdlettergevoelig maakt accenten niet streng, en omgekeerd', () => {
    expect(gradeQuestion(short({ accepted: ['Été'], caseSensitive: true }), 'Ete').earned).toBe(2);
    expect(gradeQuestion(short({ accepted: ['Été'], caseSensitive: true }), 'été').earned).toBe(0);
    expect(gradeQuestion(short({ accepted: ['Été'], caseSensitive: true, accentSensitive: true }), 'Été').earned).toBe(2);
    expect(gradeQuestion(short({ accepted: ['Été'], caseSensitive: true, accentSensitive: true }), 'Ete').earned).toBe(0);
  });

  it('respecteert hoofdlettergevoeligheid wanneer die aan staat', () => {
    expect(gradeQuestion(short({ caseSensitive: true }), 'parijs').earned).toBe(0);
    expect(gradeQuestion(short({ caseSensitive: true }), 'Parijs').earned).toBe(2);
  });

  it('aanvaardt elk antwoord uit de lijst met alternatieven', () => {
    const q = short({ accepted: ['Parijs', 'Paris'] });
    expect(gradeQuestion(q, 'Paris').earned).toBe(2);
    expect(gradeQuestion(q, 'Parijs').earned).toBe(2);
  });

  it('geeft 0 voor een fout antwoord', () => {
    expect(gradeQuestion(short(), 'Berlijn').earned).toBe(0);
  });

  it('geeft 0 voor een blanco antwoord, ook als er een lege regel in de lijst staat', () => {
    expect(gradeQuestion(short({ accepted: ['', 'Parijs'] }), '').earned).toBe(0);
    expect(gradeQuestion(short({ accepted: ['', 'Parijs'] }), '   ').earned).toBe(0);
  });

  it('geeft 0 zonder crash bij een ontbrekend of niet-tekstueel antwoord', () => {
    expect(gradeQuestion(short(), undefined).earned).toBe(0);
    expect(gradeQuestion(short(), 42).earned).toBe(0);
  });

  it('levert niets op als de antwoordenlijst leeg is (kapotte configuratie)', () => {
    expect(gradeQuestion(short({ accepted: [] }), 'Parijs').earned).toBe(0);
  });
});

describe('gradeQuestion — number (numeriek met tolerantie)', () => {
  it('geeft de volle punten voor het exacte getal', () => {
    expect(gradeQuestion(num(), 42)).toEqual({ earned: 1, max: 1, mode: 'auto' });
  });

  it('aanvaardt een getal binnen de tolerantie en weigert het net erbuiten', () => {
    const q = num({ answer: 42, tolerance: 2 });
    expect(gradeQuestion(q, 44).earned).toBe(1);
    expect(gradeQuestion(q, 40).earned).toBe(1);
    expect(gradeQuestion(q, 45).earned).toBe(0);
    expect(gradeQuestion(q, 39).earned).toBe(0);
  });

  // Regressietest: in binaire drijvende komma is 1,1 − 1 gelijk aan
  // 0,10000000000000009, waardoor de ondergrens vroeger fout gerekend werd
  // terwijl dezelfde afwijking naar boven wél juist telde.
  it('rekent een antwoord exact op de ondergrens van de tolerantie juist', () => {
    const q = num({ answer: 1.1, tolerance: 0.1 });
    expect(gradeQuestion(q, 1.2).earned).toBe(1); // bovengrens
    expect(gradeQuestion(q, 1).earned).toBe(1);   // ondergrens
  });

  it('blijft buiten de tolerantie fout rekenen', () => {
    const q = num({ answer: 1.1, tolerance: 0.1 });
    expect(gradeQuestion(q, 0.9).earned).toBe(0);
    expect(gradeQuestion(q, 1.3).earned).toBe(0);
  });

  it('leest een Vlaamse komma als decimaalteken', () => {
    expect(gradeQuestion(num({ answer: 3.5, tolerance: 0 }), '3,5').earned).toBe(1);
  });

  it('leest een getal dat als tekst binnenkomt', () => {
    expect(gradeQuestion(num(), '42').earned).toBe(1);
  });

  it('geeft 0 voor tekst zonder getal en voor een leeg antwoord', () => {
    expect(gradeQuestion(num(), 'geen idee').earned).toBe(0);
    expect(gradeQuestion(num(), '').earned).toBe(0);
    expect(gradeQuestion(num(), undefined).earned).toBe(0);
    expect(gradeQuestion(num(), null).earned).toBe(0);
  });

  it('leest een getal met een eenheid erachter nog steeds als getal ("42 appels")', () => {
    expect(gradeQuestion(num(), '42 appels').earned).toBe(1);
  });
});

describe('gradeQuestion — slider (schuiver met tolerantie)', () => {
  it('geeft de volle punten binnen de tolerantie', () => {
    expect(gradeQuestion(slider(), 47)).toEqual({ earned: 2, max: 2, mode: 'auto' });
    expect(gradeQuestion(slider(), 55).earned).toBe(2);
  });

  it('geeft 0 net buiten de tolerantie', () => {
    expect(gradeQuestion(slider(), 56).earned).toBe(0);
  });

  it('geeft 0 zonder crash als de schuiver niet bewogen werd', () => {
    expect(gradeQuestion(slider(), undefined)).toEqual({ earned: 0, max: 2, mode: 'auto' });
  });

  it('aanvaardt alleen een echt getal — een tekstwaarde telt als fout', () => {
    expect(gradeQuestion(slider(), '50').earned).toBe(0);
  });

  // Zelfde drijvende-kommaklem als bij 'number' — regressietest.
  it('rekent een schuiverwaarde exact op de ondergrens van de tolerantie juist', () => {
    const q = slider({ answer: 1.1, tolerance: 0.1, min: 0, max: 2, step: 0.1 });
    expect(gradeQuestion(q, 1).earned).toBe(2);
  });
});

describe('gradeQuestion — gap (invuloefening)', () => {
  it('geeft de volle punten als alle gaten juist zijn', () => {
    expect(gradeQuestion(gap(), ['kat', 'muis'])).toEqual({ earned: 3, max: 3, mode: 'auto' });
  });

  it('geeft 0 als alle gaten fout zijn', () => {
    expect(gradeQuestion(gap(), ['hond', 'olifant']).earned).toBe(0);
  });

  it('telt per juist gat: 1 van 2 juist is de helft van de punten', () => {
    expect(gradeQuestion(gap(), ['kat', 'olifant']).earned).toBe(1.5);
  });

  it('rondt de fractie af op 2 decimalen (1 van 3 gaten op 1 punt = 0,33)', () => {
    const q = gap({ points: 1, text: 'De [kat], de [hond] en de [muis].' });
    expect(gradeQuestion(q, ['kat', '', '']).earned).toBe(0.33);
  });

  it('aanvaardt elk |-alternatief binnen één gat', () => {
    const q = gap({ points: 1, text: 'Hoofdstad: [Brussel|Bruxelles].' });
    expect(gradeQuestion(q, ['Brussel']).earned).toBe(1);
    expect(gradeQuestion(q, ['Bruxelles']).earned).toBe(1);
    expect(gradeQuestion(q, ['Brugge']).earned).toBe(0);
  });

  it('typografische apostrof in een gat telt als de gewone', () => {
    const q = gap({ text: "Twee [foto's] en een [café].", points: 2 });
    expect(gradeQuestion(q, ['foto\u2019s', 'cafe']).earned).toBe(2);
  });

  it('negeert hoofdletters en accenten in de gaten', () => {
    expect(gradeQuestion(gap({ text: 'Een [café].', points: 1 }), ['CAFE']).earned).toBe(1);
  });

  it('geeft 0 zonder crash bij een leeg, te kort of ontbrekend antwoord', () => {
    expect(gradeQuestion(gap(), []).earned).toBe(0);
    expect(gradeQuestion(gap(), undefined).earned).toBe(0);
    expect(gradeQuestion(gap(), ['kat']).earned).toBe(1.5);
  });

  it('geeft maximum 0 als de tekst geen enkel gat bevat (geen onverdienbare punten)', () => {
    expect(gradeQuestion(gap({ text: 'Zin zonder gaten.' }), [])).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

describe('gradeQuestion — match (koppelparen)', () => {
  it('geeft de volle punten als alle paren juist gekoppeld zijn', () => {
    expect(gradeQuestion(match(), [0, 1, 2])).toEqual({ earned: 3, max: 3, mode: 'auto' });
  });

  it('geeft 0 als geen enkel paar klopt', () => {
    expect(gradeQuestion(match(), [1, 2, 0]).earned).toBe(0);
  });

  it('telt per juist paar en rondt af op 2 decimalen (2 van 3 op 1 punt = 0,67)', () => {
    expect(gradeQuestion(match({ points: 1 }), [0, 1, null]).earned).toBe(0.67);
  });

  it('telt een niet-gekoppeld paar als fout', () => {
    expect(gradeQuestion(match(), [0, null, null]).earned).toBe(1);
  });

  it('geeft 0 zonder crash bij een ontbrekend antwoord', () => {
    expect(gradeQuestion(match(), undefined).earned).toBe(0);
  });

  it('geeft maximum 0 als er geen paren geconfigureerd zijn', () => {
    expect(gradeQuestion(match({ pairs: [] }), [])).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('twee keer dezelfde rechtertekst: elke keuze met die tekst is juist', () => {
    const q = match({
      pairs: [{ left: 'hond', right: 'zoogdier' }, { left: 'kat', right: 'zoogdier' }, { left: 'merel', right: 'vogel' }],
    });
    // hond kiest de "zoogdier" van kat en omgekeerd: voor de leerling identiek
    expect(gradeQuestion(q, [1, 0, 2])).toEqual({ earned: 3, max: 3, mode: 'auto' });
    // allebei dezelfde "zoogdier"-optie kiezen is ook juist
    expect(gradeQuestion(q, [0, 0, 2]).earned).toBe(3);
    // "vogel" bij een zoogdier blijft fout
    expect(gradeQuestion(q, [2, 0, 1]).earned).toBe(1);
  });

  it('gelijke tekst na normalisatie (hoofdletters, spaties, apostrof) telt als gelijk', () => {
    const q = match({
      pairs: [{ left: 'a', right: "Foto's " }, { left: 'b', right: 'foto\u2019s' }],
      points: 2,
    });
    expect(gradeQuestion(q, [1, 0]).earned).toBe(2);
  });

  it('een lege rechtertekst maakt een andere lege keuze niet juist', () => {
    const q = match({ pairs: [{ left: 'a', right: '' }, { left: 'b', right: '' }], points: 2 });
    expect(gradeQuestion(q, [1, 0]).earned).toBe(0);
    expect(gradeQuestion(q, [0, 1]).earned).toBe(2);
  });
});

describe('matchChoiceCorrect', () => {
  const pairs = [{ right: 'zoogdier' }, { right: 'Zoogdier' }, { right: 'vogel' }];
  it('juist bij dezelfde index of dezelfde genormaliseerde tekst', () => {
    expect(matchChoiceCorrect(pairs, 0, 0)).toBe(true);
    expect(matchChoiceCorrect(pairs, 0, 1)).toBe(true);
    expect(matchChoiceCorrect(pairs, 2, 0)).toBe(false);
  });
  it('geen keuze, een tekst of een index buiten bereik is nooit juist', () => {
    expect(matchChoiceCorrect(pairs, 0, null)).toBe(false);
    expect(matchChoiceCorrect(pairs, 0, undefined)).toBe(false);
    expect(matchChoiceCorrect(pairs, 0, '0')).toBe(false);
    expect(matchChoiceCorrect(pairs, 0, 3)).toBe(false);
    expect(matchChoiceCorrect(pairs, 0, -1)).toBe(false);
    expect(matchChoiceCorrect(pairs, 0, 0.5)).toBe(false);
  });
});

describe('gradeQuestion — order (rangschikken)', () => {
  it('geeft de volle punten voor de juiste volgorde', () => {
    expect(gradeQuestion(order(), [0, 1, 2, 3])).toEqual({ earned: 4, max: 4, mode: 'auto' });
  });

  it('telt per item op de juiste plaats: twee verwisselde items kosten hun punten', () => {
    expect(gradeQuestion(order(), [1, 0, 2, 3]).earned).toBe(2);
  });

  it('geeft 0 als geen enkel item op zijn plaats staat', () => {
    expect(gradeQuestion(order(), [3, 2, 1, 0]).earned).toBe(0);
  });

  it('geeft 0 zonder crash bij een leeg of ontbrekend antwoord', () => {
    expect(gradeQuestion(order(), []).earned).toBe(0);
    expect(gradeQuestion(order(), undefined).earned).toBe(0);
  });

  it('geeft maximum 0 als er geen items geconfigureerd zijn', () => {
    expect(gradeQuestion(order({ items: [] }), [])).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

describe('gradeQuestion — long en info', () => {
  it('zet een open vraag op pending met het volledige maximum', () => {
    expect(gradeQuestion(long(), 'Mijn uitgebreide antwoord.')).toEqual({ earned: 0, max: 5, mode: 'pending' });
  });

  it('zet ook een onbeantwoorde open vraag op pending (de leerkracht beslist)', () => {
    expect(gradeQuestion(long(), undefined).mode).toBe('pending');
  });

  it('geeft een infoblok nul punten en nul maximum', () => {
    expect(gradeQuestion(info(), undefined)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });

  it('telt een infoblok ook niet mee als er per ongeluk punten op staan', () => {
    expect(gradeQuestion(info({ points: 5 }), undefined)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Doorgeefluik naar de uitgebreide vraagtypes
// ═══════════════════════════════════════════════════════════════════════════

describe('gradeQuestion — doorgeefluik naar de uitgebreide vraagtypes', () => {
  const upload = (o: Partial<UploadQuestion> = {}): UploadQuestion => ({
    id: 'q-up', type: 'upload', prompt: 'Lever je verslag in.', points: 4, accept: '', maxMb: 2, ...o,
  });

  it('zet een upload mét bestand op pending met het volledige maximum', () => {
    const answer = { name: 'verslag.pdf', size: 1234, fileId: 'f1' };
    expect(gradeQuestion(upload(), answer)).toEqual({ earned: 0, max: 4, mode: 'pending' });
  });

  it('scoort een upload zonder bestand automatisch op 0', () => {
    expect(gradeQuestion(upload(), undefined)).toEqual({ earned: 0, max: 4, mode: 'auto' });
  });

  it('laat een meningsvraag (rating) buiten de puntentelling', () => {
    const rating: RatingQuestion = { id: 'q-r', type: 'rating', prompt: 'Hoe vlot ging het?', points: 0, scale: 5 };
    expect(gradeQuestion(rating, 5)).toEqual({ earned: 0, max: 0, mode: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Totalen
// ═══════════════════════════════════════════════════════════════════════════

describe('gradeQuiz', () => {
  it('telt de verdiende punten en het maximum van alle vragen samen op', () => {
    const config = quiz([mc(), tf(), multi()]);
    const res = gradeQuiz(config, { 'q-mc': 0, 'q-tf': true, 'q-multi': [0, 2] });
    expect(res.earned).toBe(6);
    expect(res.max).toBe(6);
    expect(res.hasPending).toBe(false);
  });

  it('bewaart de score per vraag onder de vraag-id', () => {
    const res = gradeQuiz(quiz([mc(), tf()]), { 'q-mc': 1, 'q-tf': true });
    expect(res.itemScores['q-mc']).toEqual({ earned: 0, max: 2, mode: 'auto' });
    expect(res.itemScores['q-tf']).toEqual({ earned: 1, max: 1, mode: 'auto' });
  });

  it('rondt het totaal af op 2 decimalen bij deelscores', () => {
    const config = quiz([
      gap({ id: 'g1', points: 1, text: '[a] [b] [c]' }),
      gap({ id: 'g2', points: 1, text: '[a] [b] [c]' }),
    ]);
    const res = gradeQuiz(config, { g1: ['a', '', ''], g2: ['a', '', ''] });
    expect(res.earned).toBe(0.66);
    expect(res.max).toBe(2);
  });

  it('markeert hasPending zodra één vraag manueel nagekeken moet worden', () => {
    const res = gradeQuiz(quiz([mc(), long()]), { 'q-mc': 0 });
    expect(res.hasPending).toBe(true);
    expect(res.earned).toBe(2);
    expect(res.max).toBe(7);
  });

  it('scoort een volledig blanco inzending op 0 zonder te crashen', () => {
    const config = quiz([mc(), tf(), multi(), short(), gap(), match(), order(), num(), slider()]);
    const res = gradeQuiz(config, {});
    expect(res.earned).toBe(0);
    expect(res.max).toBe(2 + 1 + 3 + 2 + 3 + 3 + 4 + 1 + 2);
  });

  it('laat infoblokken buiten het maximum', () => {
    const res = gradeQuiz(quiz([info(), mc()]), { 'q-mc': 0 });
    expect(res.max).toBe(2);
  });

  it('houdt het maximum van een vraag met lege configuratie op 0', () => {
    const res = gradeQuiz(quiz([gap({ text: 'geen gaten' }), mc()]), { 'q-mc': 0 });
    expect(res.earned).toBe(2);
    expect(res.max).toBe(2);
  });
});

describe('quizMaxScore', () => {
  it('telt de punten van alle vragen op en laat infoblokken weg', () => {
    expect(quizMaxScore(quiz([mc(), tf(), info({ points: 9 })]))).toBe(3);
  });

  it('geeft 0 voor een quiz zonder vragen', () => {
    expect(quizMaxScore(quiz([]))).toBe(0);
  });

  it('telt punten op een meningsvraag niet mee — gelijk aan gradeQuiz', () => {
    // Regressietest: de afdrukweergave telde vroeger de punten van een
    // rating/likert mee, waardoor er "/ 4" op papier stond bij een digitale
    // score op 2. Beide moeten hetzelfde maximum hanteren.
    const rating: RatingQuestion = { id: 'q-r', type: 'rating', prompt: 'Mening?', points: 2, scale: 5 };
    const config = quiz([mc(), rating]);
    expect(quizMaxScore(config)).toBe(2);
    expect(gradeQuiz(config, { 'q-mc': 0 }).max).toBe(2);
  });
});
