import { describe, expect, it } from 'vitest';
import {
  MAX_PUZZLE_WORD, buildWidgetGenPrompt, dropDuplicateQuestions, puzzleWord, questionDedupeKey,
  quizSchemaText, resolveNumber, sanitizeGeneratedWidgets, sanitizeQuestion, sanitizeQuestions, typeRetryNote,
} from './aiWidgetGen';
import type { CrosswordConfig, Question, QuizConfig, WordsearchConfig } from './types';

const mc = (extra: Record<string, unknown> = {}) => ({
  type: 'mc',
  prompt: 'Wat verdampt er?',
  options: ['water', 'steen'],
  correctIndex: 0,
  ...extra,
});

describe('sanitizeQuestion — goalCode', () => {
  it('laat het veld weg als de AI niets meegaf', () => {
    expect(sanitizeQuestion(mc())?.goalCode).toBeUndefined();
    expect(sanitizeQuestion(mc({ goalCode: '   ' }))?.goalCode).toBeUndefined();
  });

  it('normaliseert de code (hoofdletters, dubbele spaties)', () => {
    expect(sanitizeQuestion(mc({ goalCode: ' wis  2.3 ' }))?.goalCode).toBe('WIS 2.3');
  });

  it('bewaart een code die in de toegelaten lijst staat, ook anders geschreven', () => {
    const q = sanitizeQuestion(mc({ goalCode: 'nw 4.1' }), { allowedGoalCodes: ['NW 4.1', 'NW 2.2'] });
    expect(q?.goalCode).toBe('NW 4.1');
  });

  it('laat een verzonnen code vallen als er een lijst is', () => {
    const q = sanitizeQuestion(mc({ goalCode: 'ZZZ 9.9' }), { allowedGoalCodes: ['NW 4.1'] });
    expect(q?.goalCode).toBeUndefined();
    // de vraag zelf blijft wél bruikbaar
    expect(q?.prompt).toBe('Wat verdampt er?');
  });

  it('laat alles door als de lijst leeg of afwezig is', () => {
    expect(sanitizeQuestion(mc({ goalCode: 'X 1' }), { allowedGoalCodes: [] })?.goalCode).toBe('X 1');
    expect(sanitizeQuestion(mc({ goalCode: 'X 1' }), {})?.goalCode).toBe('X 1');
  });

  it('raakt het vrije doelveld niet aan', () => {
    const q = sanitizeQuestion(mc({ goal: 'Werkwoordspelling', goalCode: 'NW 4.1' }), { allowedGoalCodes: ['NW 4.1'] });
    expect(q?.goal).toBe('Werkwoordspelling');
    expect(q?.goalCode).toBe('NW 4.1');
  });

  it('geeft de lijst door aan sanitizeQuestions', () => {
    const qs = sanitizeQuestions([mc({ goalCode: 'NW 4.1' }), mc({ goalCode: 'fout' })], {
      allowedGoalCodes: ['NW 4.1'],
    });
    expect(qs.map((q) => q.goalCode)).toEqual(['NW 4.1', undefined]);
  });
});

describe('sanitizeGeneratedWidgets — goalCode', () => {
  it('geeft de toegelaten codes door tot in de vragen van de widget', () => {
    const res = sanitizeGeneratedWidgets(
      { widgets: [{ type: 'quiz', title: 'Toets', config: { questions: [mc({ goalCode: 'nw 4.1' }), mc({ goalCode: 'verzonnen' })] } }] },
      { allowedGoalCodes: ['NW 4.1'] }
    );
    expect(res.widgets).toHaveLength(1);
    const questions = (res.widgets[0].config as QuizConfig).questions;
    expect(questions.map((q) => q.goalCode)).toEqual(['NW 4.1', undefined]);
  });
});

describe('buildWidgetGenPrompt — leerplandoelen', () => {
  it('zet de doelenlijst met codes in de prompt', () => {
    const { prompt } = buildWidgetGenPrompt({
      source: 'Water verdampt.',
      wish: '',
      types: ['quiz'],
      goalCodes: [{ code: 'NW 4.1', text: 'De leerling legt verdamping uit.' }],
    });
    expect(prompt).toContain('NW 4.1: De leerling legt verdamping uit.');
    expect(prompt).toContain('goalCode');
  });

  it('vermeldt geen doelenlijst als er geen is', () => {
    const { prompt } = buildWidgetGenPrompt({ source: '', wish: 'iets', types: ['quiz'] });
    expect(prompt).not.toContain('Leerplandoelen:');
  });
});

describe('buildWidgetGenPrompt — vraagschema bij werkbladen', () => {
  const telVraagschema = (types: Parameters<typeof buildWidgetGenPrompt>[0]['types']) => {
    const { system, prompt } = buildWidgetGenPrompt({ source: '', wish: 'iets', types });
    return ((system + prompt).match(/Een "vraag" is een JSON-object/g) ?? []).length;
  };
  it('legt "vraag" uit als alleen een werkblad, exit-ticket of gesplitst werkblad gekozen is', () => {
    expect(telVraagschema(['worksheet'])).toBe(1);
    expect(telVraagschema(['exitticket'])).toBe(1);
    expect(telVraagschema(['splitworksheet'])).toBe(1);
    expect(telVraagschema(['worksheet', 'exitticket'])).toBe(1);
  });
  it('herhaalt de uitleg niet als de quiz er al bij is, en voegt ze niet toe zonder vragen', () => {
    expect(telVraagschema(['quiz', 'worksheet'])).toBe(1);
    expect(telVraagschema(['flashcards'])).toBe(0);
  });
});

describe('sanitizeQuestion: varianten van het antwoordveld (gezien bij Gemini)', () => {
  const opts = ['De dunne darm', 'De maag', 'De slokdarm', 'De dikke darm'];
  it('mc: "correctAnswer" als nummer, als optietekst of als letter', () => {
    const a = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 0 });
    const b = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 'de maag' });
    const c = sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, answer: 'C' });
    expect(a && a.type === 'mc' && a.correctIndex).toBe(0);
    expect(b && b.type === 'mc' && b.correctIndex).toBe(1);
    expect(c && c.type === 'mc' && c.correctIndex).toBe(2);
  });
  it('mc: een antwoord dat bij geen optie past, keurt de vraag af', () => {
    expect(sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts, correctAnswer: 'de lever' })).toBeNull();
    expect(sanitizeQuestion({ type: 'mc', prompt: 'p', options: opts })).toBeNull();
  });
  it('multi: "correctAnswers" met optieteksten', () => {
    const q = sanitizeQuestion({ type: 'multi', prompt: 'p', options: opts, correctAnswers: ['De maag', 'De dunne darm'] });
    expect(q && q.type === 'multi' && q.correctIndices).toEqual([0, 1]);
  });
  it('tf: "correct", "waar"/"onjuist" worden herkend; zonder antwoord valt de vraag weg in plaats van stil "onjuist"', () => {
    const t1 = sanitizeQuestion({ type: 'tf', prompt: 'p', correct: true });
    const t2 = sanitizeQuestion({ type: 'tf', prompt: 'p', answer: 'waar' });
    const t3 = sanitizeQuestion({ type: 'tf', prompt: 'p', correctAnswer: 'onjuist' });
    expect(t1 && t1.type === 'tf' && t1.answer).toBe(true);
    expect(t2 && t2.type === 'tf' && t2.answer).toBe(true);
    expect(t3 && t3.type === 'tf' && t3.answer).toBe(false);
    expect(sanitizeQuestion({ type: 'tf', prompt: 'p' })).toBeNull();
  });
});

describe('getalvragen: nooit stil een sleutel 0', () => {
  const nr = (extra: Record<string, unknown>) => ({ type: 'number', prompt: 'Bereken de snelheid in m/s.', ...extra });

  it('leest getallen in de vormen die modellen schrijven', () => {
    expect(resolveNumber(2)).toBe(2);
    expect(resolveNumber('2')).toBe(2);
    expect(resolveNumber('2,5')).toBe(2.5);
    expect(resolveNumber(' 2.5 ')).toBe(2.5);
    expect(resolveNumber('2 m/s')).toBe(2);
    expect(resolveNumber('−3 °C')).toBe(-3);
    expect(resolveNumber('13,6 g/cm³')).toBe(13.6);
    expect(resolveNumber('50%')).toBe(50);
  });

  it('weigert wat geen eenduidig getal is', () => {
    expect(resolveNumber('')).toBeUndefined();
    expect(resolveNumber('twee')).toBeUndefined();
    expect(resolveNumber('2 of 3')).toBeUndefined();
    expect(resolveNumber('100 m / 50 s')).toBeUndefined();
    expect(resolveNumber(null)).toBeUndefined();
    expect(resolveNumber(NaN)).toBeUndefined();
  });

  it('neemt het antwoord ook uit andere veldnamen en uit tekst', () => {
    expect(sanitizeQuestion(nr({ answer: '2 m/s' }))).toMatchObject({ type: 'number', answer: 2 });
    expect(sanitizeQuestion(nr({ correctAnswer: 2 }))).toMatchObject({ answer: 2 });
    expect(sanitizeQuestion(nr({ answer: '0,5', tolerance: '0,05' }))).toMatchObject({ answer: 0.5, tolerance: 0.05 });
  });

  it('laat een getalvraag zonder bruikbare sleutel vallen in plaats van 0 te zetten', () => {
    expect(sanitizeQuestion(nr({}))).toBeNull();
    expect(sanitizeQuestion(nr({ answer: 'ongeveer twee' }))).toBeNull();
  });

  it('een echte sleutel 0 blijft 0', () => {
    expect(sanitizeQuestion(nr({ answer: 0 }))).toMatchObject({ answer: 0 });
  });

  it('schuifvraag: antwoord buiten het bereik valt weg', () => {
    const sl = (extra: Record<string, unknown>) => ({ type: 'slider', prompt: 'Temperatuur?', min: 0, max: 100, ...extra });
    expect(sanitizeQuestion(sl({ answer: '37' }))).toMatchObject({ answer: 37 });
    expect(sanitizeQuestion(sl({ answer: 140 }))).toBeNull();
    expect(sanitizeQuestion(sl({}))).toBeNull();
  });
});

// ── Herstelpakket F: AI-functies bij widgets ────────────────────────────────

describe('plaatshouders als doelcode (AI9)', () => {
  it('bewaart "…", "-" of "?" niet als doelcode, ook zonder leerplan', () => {
    for (const code of ['…', '...', '-', '?', ' – ', '()']) {
      expect(sanitizeQuestion(mc({ goalCode: code }))?.goalCode, JSON.stringify(code)).toBeUndefined();
    }
    // de vraag zelf blijft bruikbaar
    expect(sanitizeQuestion(mc({ goalCode: '…' }))?.prompt).toBe('Wat verdampt er?');
  });

  it('laat plaatshouders ook weg als er wel een lijst is', () => {
    const q = sanitizeQuestion(mc({ goalCode: '…' }), { allowedGoalCodes: ['NW 4.1'] });
    expect(q?.goalCode).toBeUndefined();
  });

  it('bewaart echte codes met een letter of cijfer', () => {
    expect(sanitizeQuestion(mc({ goalCode: 'NW 9.9' }))?.goalCode).toBe('NW 9.9');
    expect(sanitizeQuestion(mc({ goalCode: '1' }))?.goalCode).toBe('1');
    expect(sanitizeQuestion(mc({ goalCode: 'é' }))?.goalCode).toBe('É');
  });

  it('vraagt niet naar doelcodes als er geen leerplan is', () => {
    for (const req of [
      { source: '', wish: 'iets', types: ['quiz' as const] },
      { source: '', wish: 'iets', types: ['quiz' as const], goalCodes: [] },
    ]) {
      const { prompt, system } = buildWidgetGenPrompt(req);
      expect(prompt).not.toContain('goalCode');
      expect(system).not.toContain('goalCode');
      // de rest van het vraagschema blijft heel
      expect(prompt).toContain('"support"');
      expect(prompt).toContain('"explanation"');
    }
  });

  it('vraagt er wel naar, met de lijst, als er een leerplan is', () => {
    const { prompt } = buildWidgetGenPrompt({
      source: '', wish: 'iets', types: ['quiz'],
      goalCodes: [{ code: 'NW 4.1', text: 'De leerling legt verdamping uit.' }],
    });
    expect(prompt).toContain('"goalCode" (UITSLUITEND een code die letterlijk in de meegegeven lijst');
    expect(prompt).toContain('- NW 4.1: De leerling legt verdamping uit.');
  });

  it('quizSchemaText: standaard met, met { goalCode: false } zonder uitleg over doelcodes', () => {
    expect(quizSchemaText()).toContain('"goalCode"');
    expect(quizSchemaText({ goalCode: true })).toContain('"goalCode"');
    const zonder = quizSchemaText({ goalCode: false });
    expect(zonder).not.toContain('goalCode');
    expect(zonder.trimEnd().endsWith('.')).toBe(true);
    expect(zonder).toContain('"quiz" — config:');
  });
});

describe('puzzelwoorden: nooit inkorten (AI12)', () => {
  const lang = 'bevolkingsdichtheid'; // 19 letters
  const crossword = (entries: { word: string; clue: string }[]) =>
    sanitizeGeneratedWidgets({ widgets: [{ type: 'crossword', title: 'K', config: { entries } }] });
  const wordsearch = (words: string[]) =>
    sanitizeGeneratedWidgets({ widgets: [{ type: 'wordsearch', title: 'W', config: { words } }] });

  it('puzzleWord haalt accenten en spaties weg en kapt niets af', () => {
    expect(puzzleWord(' café ')).toBe('cafe');
    expect(puzzleWord('Bevolkings dichtheid')).toBe('Bevolkingsdichtheid');
    expect(puzzleWord(lang)).toBe(lang);
  });

  it('kruiswoord: een te lang woord valt weg in plaats van afgekapt te worden, met een melding', () => {
    const res = crossword([
      { word: lang, clue: 'inwoners per km²' },
      { word: 'zon', clue: 'ster' },
      { word: 'maan', clue: 'satelliet' },
    ]);
    const words = (res.widgets[0].config as CrosswordConfig).entries.map((e) => e.word);
    expect(words).toEqual(['zon', 'maan']);
    expect(words.some((w) => w.startsWith('bevolkingsdicht'))).toBe(false);
    expect(res.warnings.join(' ')).toContain(lang);
    expect(res.warnings.join(' ')).toContain(`${MAX_PUZZLE_WORD} letters`);
  });

  it('kruiswoord: precies 15 letters mag nog, 16 niet', () => {
    const w15 = 'a'.repeat(MAX_PUZZLE_WORD);
    const w16 = 'a'.repeat(MAX_PUZZLE_WORD + 1);
    const res = crossword([
      { word: w15, clue: 'vijftien' },
      { word: w16, clue: 'zestien' },
      { word: 'bal', clue: 'rond' },
    ]);
    expect((res.widgets[0].config as CrosswordConfig).entries.map((e) => e.word)).toEqual([w15, 'bal']);
  });

  it('kruiswoord: blijven er na het weglaten minder dan twee woorden over, dan wordt de widget afgekeurd', () => {
    const res = crossword([
      { word: lang, clue: 'a' },
      { word: 'condensatiewarmte', clue: 'b' },
      { word: 'zon', clue: 'c' },
    ]);
    expect(res.widgets).toHaveLength(0);
    expect(res.warnings.join(' ')).toContain('onvolledig');
  });

  it('woordzoeker: te lange woorden vallen weg en het rooster blijft groot genoeg voor de rest', () => {
    const res = wordsearch(['verdampingswarmte', 'smeltpunt', 'kookpunt', 'vriespunt']);
    const cfg = res.widgets[0].config as WordsearchConfig;
    expect(cfg.words).toEqual(['smeltpunt', 'kookpunt', 'vriespunt']);
    expect(cfg.size).toBeGreaterThanOrEqual(9);
    expect(res.warnings.join(' ')).toContain('verdampingswarmte');
  });

  it('woordzoeker: een woord van 15 letters geeft een rooster van minstens 15', () => {
    const w15 = 'b'.repeat(MAX_PUZZLE_WORD);
    const cfg = wordsearch([w15, 'aap', 'beer']).widgets[0].config as WordsearchConfig;
    expect(cfg.words).toContain(w15);
    expect(cfg.size).toBeGreaterThanOrEqual(MAX_PUZZLE_WORD);
  });

  it('de prompt zegt hoeveel letters een puzzelwoord hoogstens mag hebben', () => {
    const { prompt } = buildWidgetGenPrompt({ source: '', wish: 'x', types: ['crossword', 'wordsearch'] });
    expect(prompt.match(new RegExp(`hoogstens ${MAX_PUZZLE_WORD} letters`, 'g'))).toHaveLength(2);
  });
});

describe('dubbele vragen herkennen (AI7)', () => {
  const dd = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'dropdown', text, ...extra });
  const gap = (text: string) => ({ type: 'gap', text });
  const q = (raw: unknown): Question => {
    const res = sanitizeQuestion(raw);
    if (!res) throw new Error('vraag werd afgekeurd');
    return res;
  };
  const bestaand = q(mc({ prompt: 'Bestaande vraag?' }));

  it('keuzelijst- en invulvragen met de standaardopdracht zijn geen dubbels van elkaar', () => {
    const kandidaten = sanitizeQuestions([
      dd('De hoofdstad van Frankrijk is {Parijs|Lyon|Marseille}.'),
      dd('De hoofdstad van Spanje is {Madrid|Barcelona|Sevilla}.'),
      dd('De hoofdstad van Italië is {Rome|Milaan|Napels}.'),
      gap('Water kookt bij [100] graden.'),
      gap('Water bevriest bij [0] graden.'),
      mc({ prompt: 'Nieuwe mc?' }),
    ]);
    // de sanering geeft ze allemaal dezelfde standaardopdracht
    expect(kandidaten.filter((k) => k.type === 'dropdown').map((k) => k.prompt)).toEqual([
      'Kies telkens het juiste antwoord.', 'Kies telkens het juiste antwoord.', 'Kies telkens het juiste antwoord.',
    ]);
    const { fresh, dropped } = dropDuplicateQuestions([bestaand], kandidaten);
    expect(fresh).toHaveLength(6);
    expect(dropped).toBe(0);
  });

  it('laat een echte dubbel weg, ook als hij er verschillend uitziet in hoofdletters en spaties', () => {
    const { fresh, dropped } = dropDuplicateQuestions(
      [bestaand],
      sanitizeQuestions([mc({ prompt: '  bestaande   VRAAG? ' }), mc({ prompt: 'Een andere vraag?' })])
    );
    expect(fresh.map((f) => f.prompt)).toEqual(['Een andere vraag?']);
    expect(dropped).toBe(1);
  });

  it('laat ook een dubbel binnen het antwoord van de AI weg', () => {
    const { fresh, dropped } = dropDuplicateQuestions(
      [],
      sanitizeQuestions([gap('Water kookt bij [100] graden.'), gap('Water kookt bij [100] graden.'), gap('IJs smelt bij [0] graden.')])
    );
    expect(fresh).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it('dezelfde vraag met andere afleiders blijft een dubbel', () => {
    const { fresh, dropped } = dropDuplicateQuestions(
      [bestaand],
      sanitizeQuestions([mc({ prompt: 'Bestaande vraag?', options: ['x', 'y', 'z'], correctIndex: 2 })])
    );
    expect(fresh).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('koppel- en volgordevragen met dezelfde opdracht maar andere inhoud zijn geen dubbels', () => {
    const match = (pairs: [string, string][]) => ({
      type: 'match', prompt: 'Koppel de begrippen.', pairs: pairs.map(([left, right]) => ({ left, right })),
    });
    const order = (items: string[]) => ({ type: 'order', prompt: 'Zet in de juiste volgorde.', items });
    const kandidaten = sanitizeQuestions([
      match([['a', '1'], ['b', '2']]),
      match([['c', '3'], ['d', '4']]),
      order(['een', 'twee']),
      order(['drie', 'vier']),
    ]);
    const res = dropDuplicateQuestions([], kandidaten);
    expect(res.dropped).toBe(0);
    expect(res.fresh).toHaveLength(4);
  });

  it('sorteer-, tabel- en stellingvragen: de willekeurige id\'s tellen niet mee, de inhoud wel', () => {
    const sort = (items: [string, string][]) => ({
      type: 'sort', prompt: 'Sorteer in de juiste groep.', categories: ['Zoogdier', 'Vogel'],
      items: items.map(([text, category]) => ({ text, category })),
    });
    const table = (stad: string, land: string) => ({
      type: 'table', prompt: 'Vul de tabel aan.', columns: ['Stad', 'Land'],
      rows: [{ cells: [stad, ''], answers: [null, land] }],
    });
    const likert = (stelling: string) => ({ type: 'likert', prompt: 'Hoe was de les?', statements: [stelling] });
    const a = [
      sort([['walvis', 'Zoogdier'], ['merel', 'Vogel']]),
      table('Brussel', 'België'),
      likert('Ik begreep het.'),
    ];
    const b = [
      sort([['hond', 'Zoogdier'], ['uil', 'Vogel']]),
      table('Parijs', 'Frankrijk'),
      likert('Ik kan het uitleggen.'),
    ];
    // dezelfde inhoud, twee keer gesaneerd (andere id's): wel dubbel
    expect(dropDuplicateQuestions(sanitizeQuestions(a), sanitizeQuestions(a)).dropped).toBe(3);
    // andere inhoud, zelfde algemene opdracht: geen dubbel
    expect(dropDuplicateQuestions(sanitizeQuestions(a), sanitizeQuestions(b)).dropped).toBe(0);
  });

  it('questionDedupeKey: stabiel en onafhankelijk van punten, uitleg en hints', () => {
    const een = q(mc({ prompt: 'Vraag?', explanation: 'x', points: 3, hints: ['h'] }));
    const twee = q(mc({ prompt: 'Vraag?' }));
    expect(questionDedupeKey(een)).toBe(questionDedupeKey(twee));
    expect(questionDedupeKey(q(gap('A [b].')))).not.toBe(questionDedupeKey(q(gap('A [c].'))));
  });
});

describe('soorten herstellen in de AI-studio (AI11)', () => {
  it('een mislukte soort toont de foutmelding, of een standaardtekst', () => {
    expect(typeRetryNote('mislukt', 0, 'De AI is overbelast.')).toBe('De AI is overbelast.');
    expect(typeRetryNote('mislukt', 0)).toBe('Deze soort kon niet gemaakt worden.');
  });

  it('een geannuleerde soort krijgt ook een kaart, met een eigen tekst', () => {
    expect(typeRetryNote('geannuleerd', 0)).toBe('Geannuleerd.');
  });

  it('een soort die opnieuw geprobeerd wordt, blijft zichtbaar', () => {
    expect(typeRetryNote('bezig', 0)).toBe('Wordt opnieuw geprobeerd…');
  });

  it('"klaar" zonder één bruikbare widget is niet klaar: een kaart met een eigen tekst', () => {
    expect(typeRetryNote('klaar', 0)).toBe('Niets bruikbaars opgeleverd.');
  });

  it('een geslaagde soort of een die nog wacht, heeft geen kaart nodig', () => {
    expect(typeRetryNote('klaar', 2)).toBeNull();
    expect(typeRetryNote('wachten', 0)).toBeNull();
    expect(typeRetryNote(undefined, 0)).toBeNull();
  });
});

describe('juist lidwoord in meldingen (A11Y18)', () => {
  const leeg = (type: string) =>
    sanitizeGeneratedWidgets({ widgets: [{ type, title: 'T', config: {} }] }).warnings.join(' ');

  it('noemt de soort bij naam, zonder "de" voor een het-woord', () => {
    expect(leeg('hangman')).toBe('De inhoud van “Galgje” was onvolledig en is overgeslagen.');
    expect(leeg('worksheet')).toBe('De inhoud van “Werkblad” was onvolledig en is overgeslagen.');
    expect(leeg('crossword')).toBe('De inhoud van “Kruiswoordraadsel” was onvolledig en is overgeslagen.');
    expect(leeg('quiz')).toBe('De inhoud van “Quiz” was onvolledig en is overgeslagen.');
  });

  it('bevat nergens "van de galgje" of "van de werkblad"', () => {
    for (const t of ['hangman', 'worksheet', 'splitworksheet', 'exitticket', 'dictation', 'memory', 'pairs', 'spinner']) {
      expect(leeg(t), t).not.toMatch(/van de (galgje|werkblad|gesplitst werkblad|exit-ticket|dictee|memory|koppelspel|rad)/i);
    }
  });
});
