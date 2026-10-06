import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImportError, baseName, decodeTextBytes, describeCourseImport, describePackImport, extractFromFile,
  findCourseImportConflicts, fromPastedText, markdownToCourse, mergeSourcesToCourse, normalizeToDefaults,
  prepareImportedWidget, runInToBlock, saveCourseWithWidgets, saveImportedCourse, saveImportedPack,
  saveImportedWidget, type CourseBundle,
} from './importers';
import { getCourse, getCourses, importCourseJson, saveCourse } from './courses';
import { getFolders, getWidget, getWidgets } from './storage';
import { defaultSettings } from '../widgets/registry';
import type { Course, HeadingBlock, TableBlock, TextBlock } from './courseTypes';
import type { Widget } from './types';
import type { FolderPack } from './share';

// ── Nep-pdfopslag (IndexedDB bestaat niet in de testomgeving) ───────────────

const pdfMock = vi.hoisted(() => ({ pdfs: new Map<string, { name: string; dataUrl: string }>() }));

vi.mock('./pdfStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdfStore')>()),
  deletePdf: async () => {},
  getPdf: async (id: string) => (pdfMock.pdfs.has(id) ? { name: pdfMock.pdfs.get(id)!.name, blob: new Blob() } : null),
  importPdfFromDataUrl: async (id: string, name: string, dataUrl: string) => {
    pdfMock.pdfs.set(id, { name, dataUrl });
    return true;
  },
}));

// ── Nep-localStorage met een instelbare "volle opslag" ──────────────────────

const quota = {
  /** Totaal aantal tekens dat past. */
  limit: Infinity,
  /** Sleutels waarvoor elke schrijfpoging mislukt. */
  failKeys: new Set<string>(),
  /** Per sleutel: zoveel keer lukt het nog, daarna is het vol. */
  writesLeft: new Map<string, number>(),
};

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const vol = () => Object.assign(new Error('vol'), { name: 'QuotaExceededError' });
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const value = String(v);
      if (quota.failKeys.has(k)) throw vol();
      const left = quota.writesLeft.get(k);
      if (left !== undefined) {
        if (left <= 0) throw vol();
        quota.writesLeft.set(k, left - 1);
      }
      const next = size() - (data.has(k) ? k.length + data.get(k)!.length : 0) + k.length + value.length;
      if (next > quota.limit) throw vol();
      data.set(k, value);
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

function useMemoryStorage() {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
    quota.limit = Infinity;
    quota.failKeys.clear();
    quota.writesLeft.clear();
    pdfMock.pdfs.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(100_000);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}

function blocksOf(course: ReturnType<typeof markdownToCourse>, chapter = 0, section = 0) {
  return course.chapters[chapter].sections[section].blocks;
}

describe('baseName', () => {
  it('haalt een leesbare titel uit een bestandsnaam', () => {
    expect(baseName('hoofdstuk-3_water.docx')).toBe('hoofdstuk 3 water');
    expect(baseName('losse tekst')).toBe('losse tekst');
  });
});

describe('markdownToCourse — structuur', () => {
  const md = [
    '# De waterkringloop',
    '',
    'Een korte inleiding.',
    '',
    '## Verdamping',
    '',
    'Water verdampt door de **zon**.',
    '',
    '### Voorbeeld uit de keuken',
    '',
    '- kokend water',
    '- natte was',
    '',
    '## Condensatie',
    '',
    'Waterdamp koelt af.',
    '',
    '# Neerslag',
    '',
    '## Regen',
    '',
    'De druppels vallen.',
  ].join('\n');

  const course = markdownToCourse(md, 'bestandsnaam');

  it('neemt de titel uit de eerste #', () => {
    expect(course.title).toBe('De waterkringloop');
  });

  it('maakt van # hoofdstukken en van ## secties', () => {
    expect(course.chapters.map((c) => c.title)).toEqual(['De waterkringloop', 'Neerslag']);
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Inleiding', 'Verdamping', 'Condensatie']);
    expect(course.chapters[1].sections.map((s) => s.title)).toEqual(['Regen']);
  });

  it('zet tekst vóór de eerste ## in een sectie "Inleiding"', () => {
    const blocks = blocksOf(course, 0, 0);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as TextBlock).markdown).toBe('Een korte inleiding.');
  });

  it('maakt van ### een tussenkop op niveau 3 en houdt lijsten als markdown', () => {
    const blocks = blocksOf(course, 0, 1);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'heading', 'text']);
    expect((blocks[1] as HeadingBlock).text).toBe('Voorbeeld uit de keuken');
    expect((blocks[1] as HeadingBlock).level).toBe(3);
    expect((blocks[2] as TextBlock).markdown).toBe('- kokend water\n- natte was');
  });

  it('geeft elk blok en elke sectie een eigen id en behoudt de cursusinstellingen', () => {
    const ids = course.chapters.flatMap((c) => [c.id, ...c.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(course.settings.accentColor).toBeTruthy();
    expect(course.code).toMatch(/\w/);
  });
});

describe('markdownToCourse — zonder koppen', () => {
  it('maakt één hoofdstuk met één sectie en valt terug op de meegegeven titel', () => {
    const course = markdownToCourse('Gewoon wat tekst.\nOp twee regels.\n\nEn een tweede alinea.', 'Mijn notities');
    expect(course.title).toBe('Mijn notities');
    expect(course.chapters).toHaveLength(1);
    expect(course.chapters[0].sections).toHaveLength(1);
    expect(course.chapters[0].sections[0].title).toBe('Inleiding');
    const blocks = blocksOf(course);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as TextBlock).markdown).toBe('Gewoon wat tekst.\nOp twee regels.');
    expect((blocks[1] as TextBlock).markdown).toBe('En een tweede alinea.');
  });
});

describe('markdownToCourse — lege secties', () => {
  it('laat secties en hoofdstukken zonder inhoud weg', () => {
    const course = markdownToCourse('# Een\n\n## Leeg\n\n## Vol\n\nTekst.\n\n# Helemaal leeg\n\n## Ook leeg\n');
    expect(course.chapters.map((c) => c.title)).toEqual(['Een']);
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Vol']);
  });

  it('houdt een bruikbare cursus over als er niets in de tekst staat', () => {
    const course = markdownToCourse('   \n\n', 'Leeg document');
    expect(course.title).toBe('Leeg document');
    expect(course.chapters).toHaveLength(1);
    expect(course.chapters[0].sections).toHaveLength(1);
  });
});

describe('markdownToCourse — tabellen', () => {
  it('maakt een tabelblok met kopregel', () => {
    const course = markdownToCourse('| Land | Hoofdstad |\n| --- | --- |\n| België | Brussel |\n| Frankrijk | Parijs |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.type).toBe('table');
    expect(block.header).toBe(true);
    expect(block.rows).toEqual([
      ['Land', 'Hoofdstad'],
      ['België', 'Brussel'],
      ['Frankrijk', 'Parijs'],
    ]);
  });

  it('werkt zonder scheidingsregel en vult kortere rijen aan', () => {
    const course = markdownToCourse('| a | b |\n| c |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.header).toBe(false);
    expect(block.rows).toEqual([['a', 'b'], ['c', '']]);
  });

  it('laat een ontsnapte pipe in de cel staan', () => {
    const course = markdownToCourse('| a\\|b | c |\n| --- | --- |\n| d | e |');
    const block = blocksOf(course)[0] as TableBlock;
    expect(block.rows[0]).toEqual(['a|b', 'c']);
  });

  it('scheidt een tabel netjes van de tekst eromheen', () => {
    const course = markdownToCourse('Voor.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nNa.');
    expect(blocksOf(course).map((b) => b.type)).toEqual(['text', 'table', 'text']);
  });

  it('maakt van --- een scheidingslijn, niet van een lijst', () => {
    const course = markdownToCourse('Tekst.\n\n---\n\n- item');
    expect(blocksOf(course).map((b) => b.type)).toEqual(['text', 'divider', 'text']);
  });
});

describe('fromPastedText', () => {
  it('weigert lege tekst', () => {
    expect(() => fromPastedText('   ')).toThrow(ImportError);
  });

  it('geeft gewone tekst terug als tekstbron', () => {
    const src = fromPastedText('Wat leerstof.', 'Plakbord');
    expect(src.kind).toBe('text');
    expect(src.origin).toBe('plakbord');
    expect(src.text).toBe('Wat leerstof.');
    expect(src.warnings).toEqual([]);
  });

  it('waarschuwt bij erg lange tekst', () => {
    const src = fromPastedText('a'.repeat(60001));
    expect(src.warnings).toHaveLength(1);
    expect(src.warnings[0]).toMatch(/lang/i);
  });

  it('behandelt json die niet van Boosterz is gewoon als tekst', () => {
    const src = fromPastedText('{"iets": 1}');
    expect(src.kind).toBe('text');
  });

  it('herkent een cursusbestand', () => {
    const json = JSON.stringify({
      app: 'boosterz',
      course: {
        title: 'Gedeelde cursus',
        chapters: [{ title: 'H1', sections: [{ title: 'S1', blocks: [{ type: 'text', markdown: 'hoi' }] }] }],
      },
    });
    const src = fromPastedText(json);
    expect(src.kind).toBe('course');
    expect(src.title).toBe('Gedeelde cursus');
    expect(src.course?.course.chapters).toHaveLength(1);
  });

  it('herkent een vakgroeppakket', () => {
    const json = JSON.stringify({
      app: 'boosterz',
      kind: 'pakket',
      meta: { naam: 'Vakgroep Frans' },
      widgets: [{ type: 'quiz', title: 'Toets', config: { questions: [] } }],
    });
    const src = fromPastedText(json);
    expect(src.kind).toBe('pack');
    expect(src.title).toBe('Vakgroep Frans');
    expect(src.pack?.widgets).toHaveLength(1);
  });

  it('herkent een widgetbestand', () => {
    const json = JSON.stringify({ app: 'boosterz', widget: { type: 'flashcards', title: 'Kaarten', config: { cards: [] } } });
    const src = fromPastedText(json);
    expect(src.kind).toBe('widget');
    expect(src.widget?.type).toBe('flashcards');
  });
});

describe('markdownToCourse — sectieniveau 3 en callouts', () => {
  const md = [
    '# Hoofdstuk 1: Kennismaken',
    '',
    'Inleidende tekst.',
    '',
    '## Kennismaking met natuurwetenschappen',
    '',
    '### 1.1 Hoe stel je een goede onderzoeksvraag?',
    '',
    '**Theoretische uitleg:** Elk onderzoek start met een vraag.',
    '',
    '**Voorbeeld:** Beschimmelen boterhammen sneller in de koelkast?',
    '',
    '**Oefening: Bedenk zelf een vraag** en controleer ze.',
    '',
    '### 1.2 Hoe bedenk je een hypothese?',
    '',
    'Een hypothese is een voorlopig antwoord.',
    '',
    '**Weetje:** Meerdere hypothesen zijn mogelijk.',
  ].join('\n');

  it('maakt genummerde tussentitels tot secties en de bredere titel tot tussenkop', () => {
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    expect(course.chapters).toHaveLength(1);
    const titles = course.chapters[0].sections.map((s) => s.title);
    expect(titles).toEqual(['Inleiding', '1.1 Hoe stel je een goede onderzoeksvraag?', '1.2 Hoe bedenk je een hypothese?']);
    const first = course.chapters[0].sections[1];
    expect(first.blocks[0]).toMatchObject({ type: 'heading', level: 2, text: 'Kennismaking met natuurwetenschappen' });
  });

  it('zet vette run-in-labels om in callouts en laat "uitleg" als tekst', () => {
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    const blocks = course.chapters[0].sections[1].blocks.slice(1);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'callout', 'callout']);
    expect(blocks[0]).toMatchObject({ type: 'text', markdown: 'Elk onderzoek start met een vraag.' });
    expect(blocks[1]).toMatchObject({ type: 'callout', kind: 'info', title: 'Voorbeeld', text: 'Beschimmelen boterhammen sneller in de koelkast?' });
    expect(blocks[2]).toMatchObject({ type: 'callout', kind: 'goal', title: 'Oefening' });
    expect(runInToBlock('**Oefening (invuloefening):** vul in')).toMatchObject({ type: 'callout', kind: 'goal', title: 'Oefening (invuloefening)', text: 'vul in' });
    // het vet dat door het label doormidden werd gesneden, is opgeruimd
    expect((blocks[2] as { text: string }).text).toBe('Bedenk zelf een vraag en controleer ze.');
    const weetje = course.chapters[0].sections[2].blocks[1];
    expect(weetje).toMatchObject({ type: 'callout', kind: 'tip', title: 'Weetje' });
  });

  it('standaard (niveau 2) blijft ongewijzigd: ## is een sectie, ### een tussenkop', () => {
    const course = markdownToCourse(md, 'x');
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Inleiding', 'Kennismaking met natuurwetenschappen']);
    expect(course.chapters[0].sections[1].blocks[0]).toMatchObject({ type: 'heading', level: 3 });
  });

  it('runInToBlock negeert onbekende labels', () => {
    expect(runInToBlock('**Hallo:** wereld')).toBeNull();
    expect(runInToBlock('Gewone tekst')).toBeNull();
  });
});

describe('mergeSourcesToCourse', () => {
  it('maakt van elk bestand een hoofdstuk en gebruikt een eigen #-titel als die er is', () => {
    const course = mergeSourcesToCourse(
      [
        { title: 'Hoofdstuk_1.pdf', text: '# Hoofdstuk 1: Kennismaken\n\n## Sectie A\n\nTekst a.' },
        { title: 'Ecologie', text: 'Zonder eigen titel.\n\n## Biotoop\n\nTekst b.' },
        { title: 'Leeg', text: '   ' },
      ],
      'Natuurwetenschappen 1e graad'
    );
    expect(course.title).toBe('Natuurwetenschappen 1e graad');
    expect(course.chapters.map((c) => c.title)).toEqual(['Hoofdstuk 1: Kennismaken', 'Ecologie']);
    expect(course.chapters[1].sections.map((s) => s.title)).toEqual(['Inleiding', 'Biotoop']);
  });
});

describe('markdownToCourse — niveau 3 zonder genummerde tussentitels', () => {
  it('houdt de ##-titels als secties wanneer er geen ### volgt', () => {
    const md = '# H9\n\n## Insecten\n\nTekst a.\n\n## Vissen\n\nTekst b.';
    const course = markdownToCourse(md, 'x', { sectionLevel: 3 });
    expect(course.chapters[0].sections.map((s) => s.title)).toEqual(['Insecten', 'Vissen']);
    expect(course.chapters[0].sections[0].blocks[0]).toMatchObject({ type: 'text', markdown: 'Tekst a.' });
  });
});

describe('markdownToCourse: los label neemt de volgende alinea op', () => {
  it('"**Voorbeeld:**" op een eigen regel wordt een callout met de alinea erna als tekst', () => {
    const md = ['# Hoofdstuk 1', '', '## 1.1 Onderzoeksvraag', '', '**Voorbeeld:**', '', 'Een *slechte* onderzoeksvraag zou kunnen zijn: "Beschimmelen boterhammen snel?"', '', 'Gewone alinea erna.', ''].join('\n');
    const course = markdownToCourse(md, 'x');
    const blocks = course.chapters[0].sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(['callout', 'text']);
    const c = blocks[0];
    if (c.type !== 'callout') throw new Error('geen callout');
    expect(c.title).toBe('Voorbeeld');
    expect(c.text).toContain('Een *slechte* onderzoeksvraag');
    const t = blocks[1];
    if (t.type !== 'text') throw new Error('geen tekst');
    expect(t.markdown).toBe('Gewone alinea erna.');
  });

  it('een kop tussen label en alinea breekt de koppeling', () => {
    const md = ['# H', '', '## S', '', '**Oefening:**', '', '### Kopje', '', 'Alinea.', ''].join('\n');
    const blocks = markdownToCourse(md, 'x').chapters[0].sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(['callout', 'heading', 'text']);
  });
});

describe('termsFromSection: begrippenlijst → termenblok', () => {
  it('"**Term** uitleg"-alinea\'s in een sectie Kernbegrippen worden één termenblok', () => {
    const md = ['# H', '', '## Kernbegrippen', '', '**Thema 1: Kennismaking**', '', '**Onderzoeksvraag** De vraag die je onderzoekt.', '', '**Hypothese** Een voorlopige voorspelling.', '', '**Werkwijze:** Een stappenplan.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks.map((b) => b.type)).toEqual(['text', 'terms']);
    const t = sec.blocks[1];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items.map((i) => [i.term, i.uitleg])).toEqual([
      ['Onderzoeksvraag', 'De vraag die je onderzoekt.'],
      ['Hypothese', 'Een voorlopige voorspelling.'],
      ['Werkwijze', 'Een stappenplan.'],
    ]);
  });

  it('term op eigen regel met de uitleg in de alinea erna', () => {
    const md = ['# H', '', '## Begrippenlijst', '', '**Ecologie**', '', 'De wetenschap die samenleven bestudeert.', '', '**Biotoop**', '', 'Een afgebakend leefgebied.', '', '**Voedselrelatie**', '', 'Wie eet wie.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks).toHaveLength(1);
    const t = sec.blocks[0];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items).toHaveLength(3);
    expect(t.items[1]).toMatchObject({ term: 'Biotoop', uitleg: 'Een afgebakend leefgebied.' });
  });

  it('minder dan drie paren: niets veranderd', () => {
    const few = ['# H', '', '## Kernbegrippen', '', '**A** b.', '', '**C** d.', ''].join('\n');
    expect(markdownToCourse(few, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('termsFromSection: begrippenreeks zonder eigen titel', () => {
  it('drie of meer opeenvolgende "**Term** uitleg"-alinea\'s in een gewone sectie worden een termenblok op die plek', () => {
    const md = ['# H', '', '## Mindmap', '', 'Mindmap', '', '**Kracht** Een duw of een trek.', '', '**Contactkracht** Werkt bij aanraking.', '', '**Veerkracht** Kracht van een veer.', '', 'Slotzin.', ''].join('\n');
    const sec = markdownToCourse(md, 'x').chapters[0].sections[0];
    expect(sec.blocks.map((b) => b.type)).toEqual(['text', 'terms', 'text']);
    const t = sec.blocks[1];
    if (t.type !== 'terms') throw new Error('geen termen');
    expect(t.items.map((i) => i.term)).toEqual(['Kracht', 'Contactkracht', 'Veerkracht']);
  });

  it('twee losse definities blijven tekst', () => {
    const md = ['# H', '', '## Uitleg', '', '**Kracht** Een duw of een trek.', '', '**Massa** Hoeveelheid stof.', '', 'Tekst.', ''].join('\n');
    expect(markdownToCourse(md, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('termsFromSection: tussenkoppen zijn geen definities', () => {
  it('vette kopjes boven lange alinea\'s blijven tekst', () => {
    const long = 'Dit is een lange alinea. '.repeat(20).trim();
    const md = ['# H', '', '## 1. Voortplanting', '', `**Mannelijk voortplantingsstelsel** ${long}`, '', `**Kort samengevat** ${long}`, '', `**Vrouwelijk voortplantingsstelsel** ${long}`, ''].join('\n');
    expect(markdownToCourse(md, 'x').chapters[0].sections[0].blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

// ── OP10: tekstcodering ─────────────────────────────────────────────────────

describe('decodeTextBytes (OP10)', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it('leest gewone UTF-8 (met of zonder BOM) als UTF-8', () => {
    const utf8 = new TextEncoder().encode('café, één, €5 en ’t');
    expect(decodeTextBytes(utf8)).toEqual({ text: 'café, één, €5 en ’t', encoding: 'utf-8' });
    const metBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeTextBytes(metBom).text).toBe('café, één, €5 en ’t');
  });

  it('valt bij ANSI (Excel/Kladblok op Windows) terug op windows-1252, zonder vervangtekens', () => {
    // "café;één;€5;’t" in windows-1252
    const ansi = bytes(0x63, 0x61, 0x66, 0xe9, 0x3b, 0xe9, 0xe9, 0x6e, 0x3b, 0x80, 0x35, 0x3b, 0x92, 0x74);
    const res = decodeTextBytes(ansi);
    expect(res.encoding).toBe('windows-1252');
    expect(res.text).toBe('café;één;€5;’t');
    expect(res.text).not.toContain('�');
  });

  it('herkent UTF-16 aan de BOM ("Unicode-tekst" uit Excel)', () => {
    expect(decodeTextBytes(bytes(0xff, 0xfe, 0x48, 0x00, 0xe9, 0x00))).toEqual({ text: 'Hé', encoding: 'utf-16le' });
    expect(decodeTextBytes(bytes(0xfe, 0xff, 0x00, 0x48, 0x00, 0xe9))).toEqual({ text: 'Hé', encoding: 'utf-16be' });
  });

  it('een leeg bestand is lege UTF-8; een ArrayBuffer mag ook', () => {
    expect(decodeTextBytes(new ArrayBuffer(0))).toEqual({ text: '', encoding: 'utf-8' });
  });

  it('extractFromFile: een ANSI-csv geeft leesbare tekst en een waarschuwing; UTF-8 geen', async () => {
    const ansi = new File(
      [bytes(0x6e, 0x61, 0x61, 0x6d, 0x3b, 0x63, 0x61, 0x66, 0xe9, 0x0a, 0x45, 0x6d, 0x6d, 0x61, 0x3b, 0x80)],
      'lijst.csv',
      { type: 'text/csv' }
    );
    const src = await extractFromFile(ansi);
    expect(src.text).toBe('naam;café\nEmma;€');
    expect(src.warnings.join(' ')).toMatch(/ANSI/);

    const utf8 = new File([new TextEncoder().encode('naam;café')], 'lijst.txt', { type: 'text/plain' });
    const ok = await extractFromFile(utf8);
    expect(ok.text).toBe('naam;café');
    expect(ok.warnings).toEqual([]);
  });

  it('extractFromFile: ook markdown en json in ANSI worden goed gelezen', async () => {
    const latin = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
    const md = await extractFromFile(new File([latin('# Caf\xe9\n\nTekst')], 'les.md'));
    expect(md.text).toContain('Café');
    const json = await extractFromFile(
      new File([latin('{"app":"boosterz","widget":{"type":"flashcards","title":"Caf\xe9","config":{"cards":[]}}}')], 'w.json')
    );
    expect(json.kind).toBe('widget');
    expect(json.title).toBe('Café');
  });
});

// ── OP14: rare vormen uit handgemaakte JSON ─────────────────────────────────

describe('normalizeToDefaults (OP14)', () => {
  it('geen lijst waar een lijst hoort: de standaardlijst', () => {
    expect(normalizeToDefaults({ questions: [] }, { questions: null }).questions).toEqual([]);
    expect(normalizeToDefaults({ cards: [], autoFlipSec: 0 }, { cards: 5 }).cards).toEqual([]);
    expect(normalizeToDefaults({ questions: [] }, { questions: { 0: 'x' } }).questions).toEqual([]);
  });

  it('haalt null en vreemde elementen uit een lijst van objecten; {} blijft (bewust)', () => {
    const out = normalizeToDefaults({ questions: [] }, { questions: [null, 5, 'tekst', [1], { id: 'q1' }, {}] });
    expect(out.questions).toEqual([{ id: 'q1' }, {}]);
  });

  it('een lijst van tekst blijft tekst (woordzoeker, rad, bingo)', () => {
    expect(normalizeToDefaults({ words: [] }, { words: ['kat', null, 5] }).words).toEqual(['kat', '5']);
    expect(normalizeToDefaults({ items: [] }, { items: ['a', 'b'] }).items).toEqual(['a', 'b']);
  });

  it('een lijst van getallen blijft getallen', () => {
    expect(normalizeToDefaults({ tables: [] }, { tables: [2, 3, null] }).tables).toEqual([2, 3]);
    expect(normalizeToDefaults({ values: [4, 7, 3] }, { values: ['5', 'x', 6] }).values).toEqual([5, 6]);
  });

  it('alles weggefilterd uit een niet-lege lijst: de standaard (bv. twee lege opties)', () => {
    expect(normalizeToDefaults({ options: ['', ''] }, { options: [null, { a: 1 }] }).options).toEqual(['', '']);
    expect(normalizeToDefaults({ options: ['', ''] }, { options: [] }).options).toEqual([]);
  });

  it('object, tekst, getal en ja/nee: alleen de juiste soort', () => {
    const def = { source: { kind: 'text', text: '' }, title: '', size: 12, allowDiagonal: true };
    const out = normalizeToDefaults(def, { source: 'pdf', title: 7, size: 'groot', allowDiagonal: 'ja' });
    expect(out).toEqual({ source: { kind: 'text', text: '' }, title: '7', size: 12, allowDiagonal: true });
    expect(normalizeToDefaults(def, { size: '15' }).size).toBe(15);
    expect(normalizeToDefaults(def, { size: Infinity }).size).toBe(12);
  });

  it('ontbrekende sleutels uit de standaard, onbekende sleutels blijven, geen object → standaard', () => {
    expect(normalizeToDefaults({ a: [], b: 'x' }, { c: 1 })).toEqual({ a: [], b: 'x', c: 1 });
    expect(normalizeToDefaults({ a: [] }, null)).toEqual({ a: [] });
    expect(normalizeToDefaults({ a: [] }, ['x'])).toEqual({ a: [] });
  });

  it('een sleutel "__proto__" uit JSON vervuilt niets', () => {
    const out = normalizeToDefaults({ a: [] }, JSON.parse('{"__proto__":{"vervuild":true},"a":[]}'));
    expect(({} as Record<string, unknown>).vervuild).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('prepareImportedWidget: kapotte quiz en instellingen worden bruikbaar, onbekend type = null', () => {
    const raw = {
      id: 'x', type: 'quiz', title: '', folderId: null, code: 'OUD',
      config: { questions: null, layout: 3 },
      settings: { accentColor: 5, timeLimitMin: 'tien', shuffle: 'ja' },
      createdAt: 1, updatedAt: 1,
    } as unknown as Widget;
    const w = prepareImportedWidget(raw, null)!;
    expect(w.id).not.toBe('x');
    expect(w.code).not.toBe('OUD');
    expect(w.title).toBe('Geïmporteerde widget');
    expect((w.config as unknown as { questions: unknown }).questions).toEqual([]);
    expect((w.config as unknown as { layout: unknown }).layout).toBe('3');
    expect(w.settings.accentColor).toBe('5');
    expect(w.settings.timeLimitMin).toBe(0);
    expect(w.settings.shuffle).toBe(defaultSettings().shuffle);
    expect(prepareImportedWidget({ ...raw, type: 'bestaatniet' } as unknown as Widget, null)).toBeNull();
  });
});

// ── OP2: eerlijk melden wat bewaard is ──────────────────────────────────────

function fotoWidget(i: number, groot = 10_000): Widget {
  return {
    id: `p${i}`, type: 'imageviewer', title: `Pakketwidget ${i}`, folderId: null, code: `PK${i}`,
    config: { imageUrl: '', description: 'x'.repeat(groot) } as unknown as Widget['config'],
    settings: defaultSettings(), createdAt: 1, updatedAt: 1,
  };
}

function pakket(n: number, extra: Widget[] = []): FolderPack {
  return {
    meta: { naam: 'Fotopakket', auteur: 'T', datum: '', aantal: n },
    widgets: [...Array.from({ length: n }, (_, i) => fotoWidget(i + 1)), ...extra],
  };
}

describe('saveImportedWidget en saveImportedPack (OP2)', () => {
  useMemoryStorage();

  it('één widget: bewaard met nieuwe id; volle opslag of onbekend type geeft een duidelijke fout', () => {
    const w = saveImportedWidget(fotoWidget(1));
    expect(getWidget(w.id)?.title).toBe('Pakketwidget 1');

    quota.failKeys.add('wf.widgets.v1');
    expect(() => saveImportedWidget(fotoWidget(2))).toThrow(/opslag van dit toestel is vol/);
    expect(() => saveImportedWidget({ ...fotoWidget(3), type: 'bestaatniet' } as unknown as Widget)).toThrow(/Onbekend widgettype/);
  });

  it('volle opslag halverwege: telt alleen wat echt bewaard is ("3 van 5"), en meldt het', () => {
    quota.limit = 36_000; // ruimte voor drie widgets van ±10.000 tekens
    const res = saveImportedPack(pakket(5));
    expect(res.widgets).toHaveLength(3);
    expect(res.failed.map((w) => w.title)).toEqual(['Pakketwidget 4', 'Pakketwidget 5']);
    expect(res.skipped).toBe(0);
    expect(getWidgets()).toHaveLength(3);
    expect(getFolders().map((f) => f.name)).toEqual(['Fotopakket']);
    const msg = describePackImport(res);
    expect(msg.tone).toBe('warn');
    expect(msg.text).toMatch(/^3 van 5 widgets bewaard in de map “Fotopakket”; 2 niet/);
    expect(msg.text).not.toMatch(/5 widgets geïmporteerd/);

    // Ruimte gemaakt: opnieuw proberen, in dezelfde map, telt verder.
    quota.limit = Infinity;
    const again = saveImportedPack(
      { ...pakket(0), widgets: res.failed },
      { intoFolder: { id: res.folderId, name: res.folderName } }
    );
    expect(again.widgets).toHaveLength(2);
    expect(again.widgets.every((w) => w.folderId === res.folderId)).toBe(true);
    expect(getFolders()).toHaveLength(1);
    expect(describePackImport(again, res.widgets.length)).toEqual({
      text: '5 widgets geïmporteerd in de map “Fotopakket”.',
      tone: 'ok',
    });
  });

  it('onbekend type en "niet bewaard" zijn twee verschillende dingen', () => {
    quota.limit = 26_000;
    const res = saveImportedPack(pakket(3, [{ ...fotoWidget(9), type: 'bestaatniet' } as unknown as Widget]));
    expect(res.widgets).toHaveLength(2);
    expect(res.failed).toHaveLength(1);
    expect(res.skipped).toBe(1);
    expect(describePackImport(res).text).toMatch(/1 onderdeel overgeslagen: onbekend widgettype/);
  });

  it('niets bewaard: geen lege map achterlaten, en een foutmelding', () => {
    quota.failKeys.add('wf.widgets.v1');
    const res = saveImportedPack(pakket(2));
    expect(res.widgets).toHaveLength(0);
    expect(res.folderId).toBeNull();
    expect(getFolders()).toHaveLength(0);
    const msg = describePackImport(res);
    expect(msg.tone).toBe('err');
    expect(msg.text).toMatch(/Geen enkele widget bewaard/);
  });

  it('map niet te bewaren: de widgets komen in de hoofdmap, en dat staat in de melding', () => {
    quota.failKeys.add('wf.folders.v1');
    const res = saveImportedPack(pakket(2));
    expect(res.folderSaved).toBe(false);
    expect(res.widgets.every((w) => w.folderId === null)).toBe(true);
    const msg = describePackImport(res);
    expect(msg.tone).toBe('warn');
    expect(msg.text).toMatch(/in je hoofdmap/);
  });
});

// ── OP11: een cursusbestand vervangt nooit stil eigen werk ──────────────────

function cursus(over: Partial<Course> = {}): Course {
  return {
    id: 'c1', title: 'De waterkringloop', author: '', coverEmoji: '💧', code: 'CWATER',
    chapters: [{
      id: 'ch1', title: 'Verdamping', sections: [{
        id: 's1', title: 'Wat is verdamping?', optional: false,
        blocks: [{ id: 'b1', type: 'text', markdown: 'De zon verwarmt het water.' }],
      }],
    }],
    settings: { accentColor: '#0891b2', requireName: true, showProgressToStudent: true },
    createdAt: 1, updatedAt: 50_000,
    ...over,
  };
}

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

function bestand(c: Course, extra: Record<string, unknown> = {}): CourseBundle {
  return importCourseJson(JSON.stringify({ app: 'boosterz', kind: 'cursus', v: 1, course: c, widgets: [], ...extra }))!;
}

function metPdfBlok(): Course {
  return cursus({
    chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [
      { id: 'p1', type: 'pdf', pdfId: 'pdf_een', name: 'werkblad.pdf' },
    ] }] }],
  });
}

describe('saveImportedCourse (OP11)', () => {
  useMemoryStorage();

  it('nieuw: staat erbij, en de pdf uit het bestand wordt teruggezet', async () => {
    const b = bestand(metPdfBlok(), { pdfs: [{ id: 'pdf_een', name: 'werkblad.pdf', dataUrl: PDF }] });
    expect(await findCourseImportConflicts(b)).toEqual([]);
    const res = await saveImportedCourse(b);
    expect(res.outcome).toBe('nieuw');
    expect(res.courseId).toBe('c1');
    expect(res.pdfs).toEqual({ restored: 1, failed: 0 });
    expect(pdfMock.pdfs.has('pdf_een')).toBe(true);
    const msg = describeCourseImport(res);
    expect(msg.tone).toBe('ok');
    expect(msg.text).toMatch(/staat nu bij je cursussen.*1 pdf teruggezet/);
  });

  it('eigen werk met hetzelfde id: eerst een vraag, ook als het bestand ouder is', async () => {
    saveCourse(cursus({ title: 'LOKAAL BIJGEWERKT' })); // eigen werk, gestempeld op "nu"
    const conflicts = await findCourseImportConflicts(bestand(cursus({ title: 'COLLEGA-VERSIE', updatedAt: 90_000 })));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'course', id: 'c1', older: true, localTitle: 'LOKAAL BIJGEWERKT' });
  });

  it('keuze "als kopie": het eigen werk blijft, de import staat ernaast', async () => {
    saveCourse(cursus({ title: 'LOKAAL BIJGEWERKT' }));
    const b = bestand(cursus({ title: 'COLLEGA-VERSIE', updatedAt: 90_000 }));
    const conflicts = await findCourseImportConflicts(b);
    const res = await saveImportedCourse(b, { choice: 'kopie', conflicts });
    expect(res.outcome).toBe('kopie');
    expect(res.courseId).not.toBe('c1');
    expect(getCourse('c1')!.title).toBe('LOKAAL BIJGEWERKT');
    expect(getCourse(res.courseId!)!.title).toBe('COLLEGA-VERSIE (kopie)');
    expect(describeCourseImport(res).text).toMatch(/ernaast als kopie: “COLLEGA-VERSIE \(kopie\)”/);
  });

  it('keuze "houden": er verandert niets, en de melding zegt dat', async () => {
    saveCourse(cursus({ title: 'LOKAAL BIJGEWERKT' }));
    const b = bestand(cursus({ title: 'COLLEGA-VERSIE', updatedAt: 90_000 }));
    const res = await saveImportedCourse(b, { choice: 'houden', conflicts: await findCourseImportConflicts(b) });
    expect(res.outcome).toBe('gehouden');
    expect(getCourse('c1')!.title).toBe('LOKAAL BIJGEWERKT');
    expect(getCourses()).toHaveLength(1);
    const msg = describeCourseImport(res);
    expect(msg.badge).toBe('niets vervangen');
    expect(msg.text).toMatch(/^Je eigen versie “LOKAAL BIJGEWERKT” bleef staan; de versie uit het bestand is niet overgenomen\./);
  });

  it('keuze "bijwerken": vervangen, en de melding zegt "vervangen"', async () => {
    saveCourse(cursus({ title: 'LOKAAL BIJGEWERKT' }));
    const b = bestand(cursus({ title: 'COLLEGA-VERSIE', updatedAt: 90_000 }));
    const res = await saveImportedCourse(b, { choice: 'bijwerken', conflicts: await findCourseImportConflicts(b) });
    expect(res.outcome).toBe('vervangen');
    expect(getCourse('c1')!.title).toBe('COLLEGA-VERSIE');
    expect(describeCourseImport(res).text).toMatch(/is vervangen door de versie uit het bestand/);
  });

  it('hetzelfde bestand nog eens: geen vraag en "niets veranderd"; nieuwere versie van een zuivere kopie: bijgewerkt', async () => {
    await saveImportedCourse(bestand(cursus()));
    const zelfde = bestand(cursus());
    expect(await findCourseImportConflicts(zelfde)).toEqual([]);
    const res = await saveImportedCourse(zelfde);
    expect(res.outcome).toBe('ongewijzigd');
    expect(describeCourseImport(res).text).toMatch(/stond al zo op dit toestel/);

    // Een nieuwere versie: stil bijgewerkt (zuivere kopie) of eerst gevraagd
    // (een bestand telt als eigen werk; zie S1 in courses.ts). In beide
    // gevallen zegt de melding wat er echt gebeurde.
    const v2 = bestand(cursus({ title: 'Versie 2', updatedAt: 60_000 }));
    const conflicts = await findCourseImportConflicts(v2);
    const res2 = await saveImportedCourse(v2, conflicts.length ? { choice: 'bijwerken', conflicts } : undefined);
    expect(getCourse('c1')!.title).toBe('Versie 2');
    expect(res2.outcome).toBe(conflicts.length ? 'vervangen' : 'bijgewerkt');
  });

  it('G3: eigen cursus + nieuwer bestand: nooit een stille no-op met "geïmporteerd"', async () => {
    saveCourse(cursus({ title: 'Mijn eigen versie' }));
    vi.setSystemTime(Date.now() + 5000);
    const b = bestand(
      { ...metPdfBlok(), title: 'Versie uit bestand', updatedAt: Date.now() },
      { pdfs: [{ id: 'pdf_een', name: 'a.pdf', dataUrl: PDF }] }
    );
    const conflicts = await findCourseImportConflicts(b);
    expect(conflicts).toHaveLength(1); // eerst een vraag
    expect(conflicts[0].older).toBe(false);
    // "Mijn versie houden": niets veranderd, en de melding zegt dat ook.
    const res = await saveImportedCourse(b, { choice: 'houden', conflicts });
    expect(res.outcome).toBe('gehouden');
    expect(getCourse('c1')!.title).toBe('Mijn eigen versie');
    const msg = describeCourseImport(res);
    expect(msg.badge).not.toBe('geïmporteerd');
    expect(msg.text).not.toMatch(/staat nu bij je cursussen|geïmporteerd/);
    // De eigen versie verwijst niet naar de pdf uit het bestand: geen wees in IndexedDB.
    expect(res.pdfs).toEqual({ restored: 0, failed: 0 });
    expect(pdfMock.pdfs.size).toBe(0);
  });

  it('G3: "houden" bij een teruggezette back-up: de pdf waar de eigen cursus naar verwijst komt terug', async () => {
    saveCourse({ ...metPdfBlok(), title: 'Eigen met pdf' }); // pdf ontbreekt op dit toestel
    const b = bestand({ ...metPdfBlok(), title: 'Back-up', updatedAt: 90_000 }, { pdfs: [{ id: 'pdf_een', name: 'a.pdf', dataUrl: PDF }] });
    const res = await saveImportedCourse(b, { choice: 'houden', conflicts: await findCourseImportConflicts(b) });
    expect(res.outcome).toBe('gehouden');
    expect(res.pdfs.restored).toBe(1);
    expect(pdfMock.pdfs.has('pdf_een')).toBe(true);
  });

  it('G3: pdf als bron van een meegereisde widget (gesplitst werkblad) wordt ook teruggezet', async () => {
    const w = {
      id: 'w_pdf', type: 'splitworksheet', title: 'Werkblad', folderId: null, code: 'WPDF01',
      config: { source: { kind: 'pdf', pdfId: 'pdf_w', title: 'Bron' }, questions: [] },
      settings: defaultSettings(), createdAt: 1, updatedAt: 50_000,
    } as unknown as Widget;
    const c = cursus({
      chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [{ id: 'wb', type: 'widget', widgetId: 'w_pdf' }] }] }],
    });
    const b = bestand(c, { widgets: [w], pdfs: [{ id: 'pdf_w', name: 'bron.pdf', dataUrl: PDF }] });
    expect(b.pdfs).toHaveLength(1);
    const res = await saveImportedCourse(b);
    expect(res.outcome).toBe('nieuw');
    expect(res.pdfs.restored).toBe(1);
    expect(pdfMock.pdfs.has('pdf_w')).toBe(true);
  });

  it('volle opslag: "niet bewaard", en geen pdf als wees in IndexedDB', async () => {
    quota.failKeys.add('wf.courses.v1');
    const res = await saveImportedCourse(bestand(metPdfBlok(), { pdfs: [{ id: 'pdf_een', name: 'w.pdf', dataUrl: PDF }] }));
    expect(res.outcome).toBe('mislukt');
    expect(res.courseId).toBeNull();
    expect(pdfMock.pdfs.size).toBe(0);
    const msg = describeCourseImport(res);
    expect(msg.tone).toBe('err');
    expect(msg.text).toMatch(/niet bewaard: de opslag van dit toestel is vol/);
  });

  it('cursus bewaard maar een meegereisde widget niet: "deels bewaard"', async () => {
    quota.failKeys.add('wf.widgets.v1');
    const c = cursus({
      chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [{ id: 'b2', type: 'widget', widgetId: 'w1' }] }] }],
    });
    const w = { ...fotoWidget(1, 10), id: 'w1', updatedAt: 50_000 };
    const res = await saveImportedCourse(bestand(c, { widgets: [w] }));
    expect(res.outcome).toBe('nieuw');
    expect(res.ok).toBe(false);
    const msg = describeCourseImport(res);
    expect(msg.tone).toBe('warn');
    expect(msg.badge).toBe('deels bewaard');
    expect(msg.text).toMatch(/Let op: niet alles kon bewaard worden/);
  });
});

describe('saveCourseWithWidgets (cursus zonder AI, eerlijk bewaren)', () => {
  useMemoryStorage();

  function metOefeningen(): { course: Course; widgets: Widget[] } {
    const widgets = [1, 2].map((i) => ({ ...fotoWidget(i, 10), id: `d${i}` }));
    const course = cursus({
      chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [
        { id: 't', type: 'text', markdown: 'tekst' },
        { id: 'wb1', type: 'widget', widgetId: 'd1' },
        { id: 'wb2', type: 'widget', widgetId: 'd2' },
      ] }] }],
    });
    return { course, widgets };
  }

  it('alles past: cursus en oefeningen bewaard', () => {
    const { course, widgets } = metOefeningen();
    const res = saveCourseWithWidgets(course, widgets);
    expect(res).toMatchObject({ saved: true, widgetsSaved: 2, widgetsFailed: 0 });
    expect(getCourse('c1')!.chapters[0].sections[0].blocks).toHaveLength(3);
  });

  it('een oefening past niet meer: ze verdwijnt uit de cursus, geen blok dat nergens naar wijst', () => {
    const { course, widgets } = metOefeningen();
    quota.writesLeft.set('wf.widgets.v1', 1); // de eerste oefening lukt, de tweede niet meer
    const res = saveCourseWithWidgets(course, widgets);
    expect(res).toMatchObject({ saved: true, widgetsSaved: 1, widgetsFailed: 1 });
    expect(getCourse('c1')!.chapters[0].sections[0].blocks.map((b) => b.id)).toEqual(['t', 'wb1']);
    expect(getWidgets().map((w) => w.id)).toEqual(['d1']);
  });

  it('de cursus zelf past niet: niets blijft achter (geen losse oefeningen)', () => {
    const { course, widgets } = metOefeningen();
    quota.failKeys.add('wf.courses.v1');
    const res = saveCourseWithWidgets(course, widgets);
    expect(res.saved).toBe(false);
    expect(getWidgets()).toHaveLength(0);
    expect(getCourses()).toHaveLength(0);
  });
});
