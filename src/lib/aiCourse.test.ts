import { describe, expect, it } from 'vitest';
import {
  buildNewCoursePrompt, buildOptimizeChapterPrompt, buildOptimizePrompt, buildReworkPrompt, buildSectionExercisesPrompt,
  buildSectionPrompt, checkMissingTopics, compactCourseLength, extractTopicKeywords, sanitizeAIBlocks,
  sanitizeAIChapter, sanitizeAICourse,
} from './aiCourse';
import type { Course, CourseBlock, CourseSection } from './courseTypes';
import type { CurriculumGoal } from './curriculumTypes';

const goals: CurriculumGoal[] = [
  { id: 'g1', code: 'NW 1.1', text: 'Waterkringloop beschrijven', theme: 'Systeem aarde' },
  { id: 'g2', code: 'NW 2.2', text: 'Toestandsveranderingen', theme: 'Materie', level: 'uitbreiding' },
];

const aiAnswer = {
  course: {
    title: 'De waterkringloop',
    coverEmoji: '💧',
    chapters: [
      {
        title: 'Verdamping',
        sections: [
          {
            title: 'In de zon',
            goals: ['Ik kan uitleggen wat verdamping is'],
            goalCodes: ['nw  1.1', 'NW 1.1', 'ZZ 9.9'],
            blocks: [{ type: 'text', markdown: 'Water verdampt.' }],
          },
          { title: 'Verdieping', optional: true, goalCodes: ['nw 2.2'], blocks: [{ type: 'text', markdown: 'Meer.' }] },
        ],
      },
    ],
  },
};

describe('sanitizeAICourse en de doelcodes', () => {
  it('normaliseert, ontdubbelt en weert codes buiten het leerplan', () => {
    const res = sanitizeAICourse(aiAnswer, { curriculumId: 'cur1', allowedGoalCodes: ['NW 1.1', 'nw 2.2'] });
    const sections = res.course.chapters[0].sections;
    expect(sections[0].goalCodes).toEqual(['NW 1.1']);
    expect(sections[1].goalCodes).toEqual(['NW 2.2']);
    expect(res.course.curriculumId).toBe('cur1');
    expect(res.warnings.some((w) => w.includes('niet in je leerplan'))).toBe(true);
  });

  it('laat alle codes staan als er geen lijst meegegeven is', () => {
    const res = sanitizeAICourse(aiAnswer);
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW 1.1', 'ZZ 9.9']);
    expect(res.course.curriculumId).toBeUndefined();
    expect(res.warnings).toEqual([]);
  });

  it('neemt het leerplan van de bestaande cursus over bij herwerken', () => {
    const base = sanitizeAICourse(aiAnswer, { curriculumId: 'cur1' }).course;
    const res = sanitizeAICourse(aiAnswer, { base });
    expect(res.course.id).toBe(base.id);
    expect(res.course.curriculumId).toBe('cur1');
  });

  it('laat de doelcodes van de oefenquizzen door dezelfde filter gaan', () => {
    const withQuiz = {
      ...aiAnswer,
      widgets: [{
        type: 'quiz',
        title: 'Quiz',
        config: {
          questions: [
            { type: 'mc', prompt: 'Wat verdampt?', options: ['water', 'steen'], correctIndex: 0, goalCode: 'nw  1.1' },
            { type: 'tf', prompt: 'Verzonnen code.', answer: true, goalCode: 'ZZ 9.9' },
          ],
        },
      }],
    };
    const res = sanitizeAICourse(withQuiz, { allowedGoalCodes: ['NW 1.1'] });
    const quiz = res.quizzes[0]!;
    const questions = (quiz.config as { questions: { goalCode?: string }[] }).questions;
    expect(questions[0].goalCode).toBe('NW 1.1');
    expect(questions[1].goalCode).toBeUndefined();
  });

  it('geeft een bruikbare cursus terug bij een onbruikbaar antwoord', () => {
    const res = sanitizeAICourse({ course: { title: 'Kapot' } });
    expect(res.course.chapters.length).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes('bruikbare cursusstructuur'))).toBe(true);
  });

  it('herkent een code ook zonder de spatie die het model soms weglaat', () => {
    const answer = {
      course: {
        title: 'Krachten',
        chapters: [{
          title: 'Krachten', sections: [
            { title: 'Zwaartekracht', goalCodes: ['NW7.1'], blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt alles naar beneden.' }] },
          ],
        }],
      },
    };
    const res = sanitizeAICourse(answer, { allowedGoalCodes: ['NW 7.1', 'NW 7.2'] });
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW7.1']);
    expect(res.warnings.some((w) => w.includes('niet in je leerplan'))).toBe(false);
  });
});

describe('buildSectionPrompt: aanvullen zonder te herhalen', () => {
  it('stuurt de bestaande tekst van de sectie mee, niet enkel de bloktypes', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = { ...course.chapters[0].sections[0], blocks: [{ id: 'b1', type: 'text', markdown: 'De zon warmt het wateroppervlak op.' }] };
    const { prompt } = buildSectionPrompt({ course, section, wishes: 'leg verdamping verder uit' });
    expect(prompt).toContain('De zon warmt het wateroppervlak op.');
    expect(prompt).toContain('herhaal');
    expect(prompt.toUpperCase()).toContain('VUL AAN');
  });

  it('werkt ook voor een lege sectie (geen "bestaat al"-instructie)', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = { ...course.chapters[0].sections[0], blocks: [] };
    const { prompt } = buildSectionPrompt({ course, section, wishes: 'leg uit wat verdamping is' });
    expect(prompt).not.toContain('BESTAANDE INHOUD');
  });
});

describe('optimaliseren per hoofdstuk', () => {
  const course = sanitizeAICourse({
    course: {
      title: 'Krachten en beweging',
      chapters: [
        { title: 'Krachten', sections: [{ title: 'Zwaartekracht', blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt naar beneden.' }] }] },
        { title: 'Beweging', sections: [{ title: 'Snelheid', blocks: [{ type: 'text', markdown: 'Snelheid is afstand per tijd.' }] }] },
      ],
    },
  }).course;

  it('bouwt een prompt voor precies één hoofdstuk, met hoofdstuknummer en context', () => {
    const { prompt } = buildOptimizeChapterPrompt({
      course, chapter: course.chapters[0], chapterIndex: 1, chapterCount: 2, presets: ['taal'], wishes: '',
    });
    expect(prompt).toContain('hoofdstuk 1 van 2');
    expect(prompt).toContain('Krachten');
    expect(prompt).toContain('TAAL');
    expect(prompt).toContain('Herwerk ALLEEN hoofdstuk');
    expect(prompt).not.toContain('Snelheid'); // het andere hoofdstuk gaat niet mee
  });

  it('sanitizeAIChapter geeft een geldig hoofdstuk terug met hetzelfde id', () => {
    const raw = { chapter: { title: 'Krachten (eenvoudiger)', sections: [{ title: 'Zwaartekracht', goalCodes: ['NW 7.1'], blocks: [{ type: 'text', markdown: 'Zwaartekracht trekt je naar de grond.' }] }] } };
    const res = sanitizeAIChapter(raw, { base: course, chapterId: course.chapters[0].id, allowedGoalCodes: ['NW 7.1'] });
    expect(res.chapter).not.toBeNull();
    expect(res.chapter!.id).toBe(course.chapters[0].id);
    expect(res.chapter!.sections[0].goalCodes).toEqual(['NW 7.1']);
  });

  it('een mediablok van een ANDER hoofdstuk telt niet mee als "weggevallen"', () => {
    const withImage: Course = {
      ...course,
      chapters: [
        course.chapters[0],
        {
          ...course.chapters[1],
          sections: [{ ...course.chapters[1].sections[0], blocks: [...course.chapters[1].sections[0].blocks, { id: 'img-1', type: 'image', url: 'x' }] }],
        },
      ],
    };
    const raw = { chapter: { title: 'Krachten', sections: [{ title: 'Zwaartekracht', blocks: [{ type: 'text', markdown: 'Tekst.' }] }] } };
    const res = sanitizeAIChapter(raw, { base: withImage, chapterId: withImage.chapters[0].id });
    expect(res.warnings.some((w) => w.includes('weggevallen') || w.includes('kwam niet terug'))).toBe(false);
  });

  it('geeft null met waarschuwing bij een onbruikbaar antwoord', () => {
    const res = sanitizeAIChapter(null, { base: course, chapterId: course.chapters[0].id });
    expect(res.chapter).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe('checkMissingTopics', () => {
  it('haalt kernwoorden (≥6 letters, geen stopwoorden) uit een titel', () => {
    expect(extractTopicKeywords('Massa, volume en massadichtheid')).toEqual(['volume', 'massadichtheid']);
  });

  it('negeert hoofdletters en accenten, en ontdubbelt', () => {
    expect(extractTopicKeywords('Écologie en ecologie')).toEqual(['ecologie']);
  });

  it('signaleert een kernwoord dat nergens in de cursus voorkomt', () => {
    const course = sanitizeAICourse({
      course: {
        title: 'Massa, volume en massadichtheid',
        chapters: [{ title: 'Massa', sections: [{ title: 'Wat is massa?', blocks: [{ type: 'text', markdown: 'Massa is de hoeveelheid stof in een voorwerp. Volume is de ruimte die het inneemt.' }] }] }],
      },
    }).course;
    const check = checkMissingTopics('Massa, volume en massadichtheid', course);
    expect(check.keywords).toEqual(['volume', 'massadichtheid']);
    expect(check.missing).toEqual(['massadichtheid']);
  });

  it('geeft geen missende kernwoorden als alles terugkomt', () => {
    const course = sanitizeAICourse({
      course: {
        title: 'Massa, volume en massadichtheid',
        chapters: [{ title: 'Massadichtheid', sections: [{ title: 'Massadichtheid', blocks: [{ type: 'text', markdown: 'De massadichtheid is de verhouding tussen massa en volume.' }] }] }],
      },
    }).course;
    expect(checkMissingTopics('Massa, volume en massadichtheid', course).missing).toEqual([]);
  });

  it('geeft geen kernwoorden (en dus geen waarschuwing) bij een titel zonder lange woorden', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    expect(checkMissingTopics('De les', course)).toEqual({ keywords: [], missing: [] });
  });
});

describe('prompts met leerplandoelen', () => {
  it('eist goalCodes uit de lijst en dekking van alle doelen', () => {
    const { prompt } = buildNewCoursePrompt({ goals: '', curriculumGoals: goals, withQuizzes: true, title: 'Water' });
    expect(prompt).toContain('NW 1.1 — Waterkringloop beschrijven');
    expect(prompt).toContain('"goalCodes"');
    expect(prompt).toContain('ALLE 2 doelen');
    expect(prompt).toContain('"goalCode"'); // per quizvraag
    expect(prompt).toContain('samenvattingssectie');
    expect(prompt).toContain('Water');
  });

  it('werkt ook met alleen bronmateriaal (zonder leerplandoelen)', () => {
    const { prompt } = buildNewCoursePrompt({ goals: '', sourceText: 'Mijn cursustekst' });
    expect(prompt).toContain('BRONMATERIAAL');
    expect(prompt).not.toContain('ALLE 2 doelen');
  });

  it('bouwt de hiaten-optimalisatie op de herwerkprompt', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const { prompt } = buildOptimizePrompt({
      course, presets: ['hiaten'], wishes: 'kort houden',
      uncovered: [goals[1]], curriculumGoals: goals,
    });
    expect(prompt).toContain('Herwerk de onderstaande bestaande cursus');
    expect(prompt).toContain('HIATEN');
    expect(prompt).toContain('NW 2.2 — Toestandsveranderingen');
    expect(prompt).toContain('kort houden');
    expect(prompt).toContain('keep'); // mediablokken blijven behouden
  });

  it('vraagt oefeningen op basis van de sectie-inhoud en haar doelen', () => {
    const course = sanitizeAICourse(aiAnswer).course;
    const section: CourseSection = course.chapters[0].sections[0];
    const { prompt } = buildSectionExercisesPrompt({
      course: course as Course, section, chapterTitle: 'Verdamping', goals: [goals[0]], count: 2,
    });
    expect(prompt).toContain('Maak 2 oefening(en)');
    expect(prompt).toContain('Water verdampt.');
    expect(prompt).toContain('NW 1.1');
    expect(prompt).toContain('"widgets"');
  });
});

// ── Herstel uit de debugronde (oktober 2026) ────────────────────────────────

/** Tekst van precies `n` tekens, zonder aanhalingstekens of regeleinden. */
const longText = (n: number, tag: string) => {
  let out = '';
  for (let i = 1; out.length < n; i++) out += `Zin ${i} van ${tag} gaat over verdamping en condensatie. `;
  return out.slice(0, n);
};

/** Haalt de compacte JSON achter de markering uit een prompt. */
function compactFrom(prompt: string, marker: string): Record<string, unknown> {
  const i = prompt.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  return JSON.parse(prompt.slice(i + marker.length).trim()) as Record<string, unknown>;
}

type CompactSection = { blocks: Record<string, unknown>[] };

describe('herwerken stuurt de VOLLEDIGE tekst mee (AI1)', () => {
  const long = {
    text: longText(3000, 'tekst'),
    callout: longText(657, 'kader'),
    quote: longText(900, 'citaat'),
    accordion: longText(1500, 'accordeon'),
    left: longText(1400, 'links'),
    right: longText(1300, 'rechts'),
  };
  const blocks: CourseBlock[] = [
    { id: 'b-text', type: 'text', markdown: long.text },
    { id: 'b-callout', type: 'callout', kind: 'info', title: 'Kader', text: long.callout },
    { id: 'b-quote', type: 'quote', text: long.quote, source: 'Bron' },
    { id: 'b-acc', type: 'accordion', items: [{ id: 'i1', title: 'Vraag', text: long.accordion }] },
    { id: 'b-cols', type: 'columns', left: long.left, right: long.right },
    { id: 'b-img', type: 'image', url: 'https://example.test/schema.png', size: 'normal' },
  ];
  const course = sanitizeAICourse({
    course: { title: 'Lange cursus', chapters: [{ title: 'Water', sections: [{ title: 'Verdamping', blocks: [] }] }] },
  }).course;
  course.chapters[0].sections[0].blocks = blocks;

  const expectFullText = (sections: CompactSection[]) => {
    const out = sections[0].blocks;
    expect(out.find((b) => b.type === 'text')?.markdown).toBe(long.text);
    expect(out.find((b) => b.type === 'callout')?.text).toBe(long.callout);
    expect(out.find((b) => b.type === 'quote')?.text).toBe(long.quote);
    expect((out.find((b) => b.type === 'accordion')?.items as { text: string }[])[0].text).toBe(long.accordion);
    const cols = out.find((b) => b.type === 'columns');
    expect(cols?.left).toBe(long.left);
    expect(cols?.right).toBe(long.right);
    expect(out.find((b) => b.type === 'keep')).toEqual({ type: 'keep', id: 'b-img', was: 'image' });
  };

  it('buildOptimizeChapterPrompt bevat een tekstblok van 3000 tekens volledig', () => {
    const { prompt } = buildOptimizeChapterPrompt({
      course, chapter: course.chapters[0], chapterIndex: 1, chapterCount: 1, presets: ['taal'], wishes: '',
    });
    expect(prompt).toContain(long.text);
    expectFullText(compactFrom(prompt, '=== HOOFDSTUK (compact) ===').sections as CompactSection[]);
  });

  it('buildReworkPrompt (en dus ook hiaten) bevat een tekstblok van 3000 tekens volledig', () => {
    const { prompt } = buildReworkPrompt({ course, wishes: '' });
    expect(prompt).toContain(long.text);
    const compact = compactFrom(prompt, '=== HUIDIGE CURSUS (compact) ===');
    expectFullText((compact.chapters as { sections: CompactSection[] }[])[0].sections);

    const hiaten = buildOptimizePrompt({ course, presets: ['hiaten'], wishes: '', uncovered: [goals[0]], curriculumGoals: goals });
    expect(hiaten.prompt).toContain(long.text);
  });

  it('een getrouw AI-antwoord verliest na toepassen geen enkel teken', () => {
    const { prompt } = buildOptimizeChapterPrompt({
      course, chapter: course.chapters[0], chapterIndex: 1, chapterCount: 1, presets: ['taal'], wishes: '',
    });
    const echoed = compactFrom(prompt, '=== HOOFDSTUK (compact) ===');
    const res = sanitizeAIChapter({ chapter: echoed }, { base: course, chapterId: course.chapters[0].id });
    const after = res.chapter!.sections[0].blocks;
    const byType = (t: string) => after.find((b) => b.type === t) as CourseBlock;
    expect((byType('text') as { markdown: string }).markdown).toBe(long.text);
    expect((byType('callout') as { text: string }).text).toBe(long.callout);
    expect((byType('quote') as { text: string }).text).toBe(long.quote);
    expect((byType('columns') as { right: string }).right).toBe(long.right);
    expect(byType('image')).toEqual(blocks[5]); // keep-blok teruggeplaatst
    expect(res.warnings).toEqual([]);
  });

  it('compactCourseLength meet precies wat er in de herwerkprompt gaat, zonder plafond', () => {
    const { prompt } = buildReworkPrompt({ course, wishes: '' });
    const marker = '=== HUIDIGE CURSUS (compact) ===\n';
    expect(compactCourseLength(course)).toBe(prompt.length - prompt.indexOf(marker) - marker.length);
    expect(compactCourseLength(course)).toBeGreaterThan(3000 + 657 + 900 + 1500 + 1400 + 1300);
  });
});

describe('de AI maakt geen mediablokken (AI6)', () => {
  const aiMedia = [
    { type: 'text', markdown: 'Gewone uitleg.' },
    { type: 'embed', url: 'https://evil.example/login', height: 400 },
    { type: 'image', url: 'https://tracker.example/p.png?x=1' },
    { type: 'attachment', name: 'x.exe', dataUrl: 'data:application/octet-stream;base64,AAAA' },
    { type: 'widget', widgetId: 'bestaat-niet' },
    { type: 'pdf', url: 'https://evil.example/x.pdf' },
    { type: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
    { type: 'audio', url: 'https://evil.example/a.mp3' },
  ];
  const MEDIA_WARNING = 'Een mediablok van de AI is weggelaten.';

  it('sanitizeAIBlocks houdt alleen tekstuele blokken over, met een waarschuwing per mediablok', () => {
    const warnings: string[] = [];
    const out = sanitizeAIBlocks({ blocks: aiMedia }, warnings);
    expect(out.map((b) => b.type)).toEqual(['text']);
    expect(warnings).toEqual(Array(7).fill(MEDIA_WARNING));
  });

  it('sanitizeAIBlocks werkt ook zonder waarschuwingslijst en met een kale array', () => {
    expect(sanitizeAIBlocks(aiMedia).map((b) => b.type)).toEqual(['text']);
  });

  it('laat alle tekstuele types door, en een onbekend type zonder mediawaarschuwing weg', () => {
    const warnings: string[] = [];
    const out = sanitizeAIBlocks({
      blocks: [
        { type: 'heading', text: 'Kop', level: 2 },
        { type: 'text', markdown: 'Tekst' },
        { type: 'callout', kind: 'tip', text: 'Tip' },
        { type: 'quote', text: 'Citaat' },
        { type: 'divider' },
        { type: 'accordion', items: [{ title: 'V', text: 'A' }] },
        { type: 'columns', left: 'L', right: 'R' },
        { type: 'table', header: true, rows: [['a', 'b']] },
        { type: 'terms', items: [{ term: 't', uitleg: 'u' }] },
        { type: 'checklist', items: ['ik kan'] },
        { type: 'paragraph', text: 'onbekend' },
        { type: 'keep', id: 'b1' },
        null,
        'los',
      ],
    }, warnings);
    expect(out.map((b) => b.type)).toEqual([
      'heading', 'text', 'callout', 'quote', 'divider', 'accordion', 'columns', 'table', 'terms', 'checklist',
    ]);
    expect(warnings).toEqual([]);
  });

  it('sanitizeAICourse laat mediablokken van de AI weg', () => {
    const res = sanitizeAICourse({ course: { title: 't', chapters: [{ title: 'c', sections: [{ title: 's', blocks: aiMedia }] }] } });
    expect(res.course.chapters[0].sections[0].blocks.map((b) => b.type)).toEqual(['text']);
    expect(res.warnings.filter((w) => w === MEDIA_WARNING)).toHaveLength(7);
  });

  it('sanitizeAIChapter: teruggeplaatste keep-blokken blijven, door de AI gemaakte media niet', () => {
    const base = sanitizeAICourse({
      course: { title: 't', chapters: [{ title: 'c', sections: [{ title: 's', blocks: [{ type: 'text', markdown: 'x' }] }] }] },
    }).course;
    const original: CourseBlock[] = [
      { id: 'img-1', type: 'image', url: 'https://example.test/schema.png', caption: 'Schema', size: 'normal' },
      { id: 'w-1', type: 'widget', widgetId: 'echte-widget' },
      { id: 'pdf-1', type: 'pdf', url: 'https://example.test/les.pdf', name: 'les.pdf' },
    ];
    base.chapters[0].sections[0].blocks = [...original];
    const answer = {
      chapter: {
        title: 'c',
        sections: [{
          title: 's',
          blocks: [
            { type: 'keep', id: 'img-1' },
            { type: 'text', markdown: 'Nieuwe uitleg.' },
            { type: 'keep', id: 'w-1' },
            { type: 'keep', id: 'pdf-1' },
            { type: 'image', url: 'https://tracker.example/p.png' },
            { type: 'widget', widgetId: 'verzonnen' },
          ],
        }],
      },
    };
    const res = sanitizeAIChapter(answer, { base, chapterId: base.chapters[0].id });
    const out = res.chapter!.sections[0].blocks;
    expect(out.map((b) => b.type)).toEqual(['image', 'text', 'widget', 'pdf']);
    expect(out[0]).toEqual(original[0]);
    expect(out[2]).toEqual(original[1]);
    expect(out[3]).toEqual(original[2]);
    expect(res.warnings).toEqual([MEDIA_WARNING, MEDIA_WARNING]);
  });

  it('een pdf-blok gaat als keep mee, en wordt gemeld als de AI het liet vallen', () => {
    const base = sanitizeAICourse({
      course: { title: 't', chapters: [{ title: 'c', sections: [{ title: 's', blocks: [{ type: 'text', markdown: 'x' }] }] }] },
    }).course;
    base.chapters[0].sections[0].blocks = [{ id: 'pdf-1', type: 'pdf', url: 'https://example.test/les.pdf' }];
    const { prompt } = buildReworkPrompt({ course: base, wishes: '' });
    expect(prompt).toContain('{"type":"keep","id":"pdf-1","was":"pdf"}');
    const res = sanitizeAIChapter(
      { chapter: { title: 'c', sections: [{ title: 's', blocks: [{ type: 'text', markdown: 'y' }] }] } },
      { base, chapterId: base.chapters[0].id }
    );
    expect(res.warnings.some((w) => w.includes('pdf-blok') && w.includes('kwam niet terug'))).toBe(true);
  });
});

describe('plaatshouders als doelcode (AI9)', () => {
  it('vraagt alleen "goalCodes" als er leerplandoelen zijn', () => {
    const zonder = buildNewCoursePrompt({ goals: '', sourceText: 'De waterkringloop.', withQuizzes: true });
    expect(zonder.prompt).not.toContain('"goalCodes"');
    expect(zonder.prompt).toContain('"widgets"'); // de envelope blijft verder heel
    const vrij = buildNewCoursePrompt({ goals: 'Ik kan verdamping uitleggen.' });
    expect(vrij.prompt).not.toContain('"goalCodes"');
    const met = buildNewCoursePrompt({ goals: '', curriculumGoals: goals });
    expect(met.prompt).toContain('"goalCodes":["…"]');
  });

  const answer = (goalCodes: unknown[]) => ({
    course: {
      title: 'Water',
      chapters: [{ title: 'H1', sections: [{ title: 'S1', goalCodes, blocks: [{ type: 'text', markdown: 'x' }] }] }],
    },
  });

  it('bewaart "…" niet als code, ook zonder leerplan', () => {
    for (const opts of [{}, { allowedGoalCodes: [] as string[] }]) {
      const res = sanitizeAICourse(answer(['…']), opts);
      expect(res.course.chapters[0].sections[0].goalCodes).toBeUndefined();
      expect(res.warnings).toEqual([]);
    }
  });

  it('laat echte codes naast plaatshouders staan', () => {
    const res = sanitizeAICourse(answer(['…', '-', '?', '', 'NW 9.9', 'nw 9.9', '1', 'É']));
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW 9.9', '1', 'É']);
  });

  it('meldt een plaatshouder niet als "niet in je leerplan"', () => {
    const res = sanitizeAICourse(answer(['…', 'NW 1.1']), { allowedGoalCodes: ['NW 1.1'] });
    expect(res.course.chapters[0].sections[0].goalCodes).toEqual(['NW 1.1']);
    expect(res.warnings).toEqual([]);
  });

  it('filtert plaatshouders ook per hoofdstuk', () => {
    const base = sanitizeAICourse(answer([])).course;
    const res = sanitizeAIChapter(
      { chapter: { title: 'H1', sections: [{ title: 'S1', goalCodes: ['…'], blocks: [{ type: 'text', markdown: 'y' }] }] } },
      { base, chapterId: base.chapters[0].id }
    );
    expect(res.chapter!.sections[0].goalCodes).toBeUndefined();
  });
});
