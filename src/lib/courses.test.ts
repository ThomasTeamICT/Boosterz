import { beforeEach, describe, expect, it } from 'vitest';
import { importCourseJson, sanitizeCourse } from './courses';
import type { AttachmentBlock, Course, CourseBlock, PdfBlock } from './courseTypes';

// ── Nep-localStorage (de cursusmodule leest en schrijft de opslag) ───────────

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

/** Ruwe cursus zoals ze uit een link, bestand, klaspakket of AI-antwoord komt (via JSON). */
function rawCourse(blocks: unknown[], ids: { course?: string; chapter?: string; section?: string } = {}): unknown {
  return JSON.parse(JSON.stringify({
    id: ids.course ?? 'c1', title: 'Cursus', code: 'ABC123',
    chapters: [{ id: ids.chapter ?? 'ch1', title: 'H1', sections: [{ id: ids.section ?? 's1', title: 'S1', blocks }] }],
  }));
}

function blocksOf(course: Course | null): CourseBlock[] {
  return course?.chapters[0].sections[0].blocks ?? [];
}

const JS_VARIANTEN = [
  'javascript:window.__xss=1',
  ' JaVaScRiPt:window.__xss=1',
  '\u0001javascript:window.__xss=1',
  'java\tscript:window.__xss=1',
  'vbscript:msgbox(1)',
  'data:text/html,<script>window.__xss=1</script>',
];

// ── V1: URL's in pdf- en bijlageblokken ─────────────────────────────────────

describe('sanitizeCourse: pdf-blok', () => {
  it('laat een pdf-blok met een javascript:-URL (in elke vermomming) en zonder upload wegvallen', () => {
    for (const url of JS_VARIANTEN) {
      const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'pdf', url }, { id: 'b2', type: 'text', markdown: 'x' }]));
      expect(blocksOf(course).map((b) => b.type), JSON.stringify(url)).toEqual(['text']);
    }
  });

  it('houdt een pdf-blok met een upload, maar zonder de onveilige URL', () => {
    const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'pdf', pdfId: 'p1', url: 'javascript:alert(1)', name: 'werkblad.pdf' }]));
    const pdf = blocksOf(course)[0] as PdfBlock;
    expect(pdf.type).toBe('pdf');
    expect(pdf.pdfId).toBe('p1');
    expect(pdf.url).toBeUndefined();
  });

  it('houdt een https-adres (zonder witruimte rond)', () => {
    const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'pdf', url: '  https://example.org/werkblad.pdf ' }]));
    expect((blocksOf(course)[0] as PdfBlock).url).toBe('https://example.org/werkblad.pdf');
  });
});

describe('sanitizeCourse: bijlage', () => {
  it('maakt de dataUrl leeg bij javascript: en andere schema\'s, maar houdt het blok', () => {
    for (const dataUrl of [...JS_VARIANTEN.filter((u) => !u.startsWith('data:')), 'https://example.org/a.pdf', 'DATA:text/plain,x']) {
      const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'attachment', name: 'huiswerk.pdf', dataUrl }]));
      const blok = blocksOf(course)[0] as AttachmentBlock;
      expect(blok.type).toBe('attachment');
      expect(blok.name).toBe('huiswerk.pdf');
      expect(blok.dataUrl, JSON.stringify(dataUrl)).toBe('');
    }
  });

  it('houdt data:, blob: en eigen mediaverwijzingen', () => {
    for (const dataUrl of ['data:application/pdf;base64,AAAA', 'blob:http://localhost/abc', 'wfmedia:m_0123456789abcdef']) {
      const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'attachment', name: 'a', dataUrl }]));
      expect((blocksOf(course)[0] as AttachmentBlock).dataUrl).toBe(dataUrl);
    }
  });

  it('JSON-import loopt door dezelfde controle', () => {
    const json = JSON.stringify({
      app: 'boosterz', kind: 'cursus', v: 1,
      course: rawCourse([
        { id: 'b1', type: 'pdf', url: 'javascript:alert(1)' },
        { id: 'b2', type: 'attachment', name: 'x', dataUrl: 'javascript:alert(1)' },
      ]),
      widgets: [],
    });
    const res = importCourseJson(json)!;
    const blocks = blocksOf(res.course);
    expect(blocks.map((b) => b.type)).toEqual(['attachment']);
    expect((blocks[0] as AttachmentBlock).dataUrl).toBe('');
  });
});

// ── V9: id's die namen uit Object.prototype zijn ────────────────────────────

describe('sanitizeCourse: id\'s', () => {
  const PROTO_NAMEN = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__'];

  it('vervangt een sectie-, hoofdstuk-, blok- of cursus-id uit Object.prototype door een vers id', () => {
    for (const naam of PROTO_NAMEN) {
      const course = sanitizeCourse(rawCourse(
        [{ id: naam, type: 'text', markdown: 'x' }, { id: 'b2', type: 'checklist', items: [{ id: naam, text: 'a' }] }],
        { course: naam, chapter: naam, section: naam },
      ))!;
      const ch = course.chapters[0];
      const se = ch.sections[0];
      const ids = [course.id, ch.id, se.id, se.blocks[0].id];
      const checklist = se.blocks[1];
      if (checklist.type === 'checklist') ids.push(checklist.items[0].id);
      for (const id of ids) {
        expect(id, naam).not.toBe(naam);
        expect(id in Object.prototype, `${naam} -> ${id}`).toBe(false);
        expect(id.length).toBeGreaterThan(0);
      }
      // een opzoeking zoals de leesweergave ze doet, crasht niet meer
      const notes: Record<string, string> = {};
      expect((notes[se.id] ?? '').trim()).toBe('');
    }
  });

  it('laat gewone id\'s ongemoeid, ook als ze erop lijken', () => {
    for (const id of ['s1', 'proto', '__proto', 'Constructor', 'to-string', 'sectie 1', 'é#$%']) {
      const course = sanitizeCourse(rawCourse([{ id, type: 'text', markdown: 'x' }], { course: id, chapter: id, section: id }))!;
      expect(course.id).toBe(id);
      expect(course.chapters[0].id).toBe(id);
      expect(course.chapters[0].sections[0].id).toBe(id);
      expect(course.chapters[0].sections[0].blocks[0].id).toBe(id);
    }
  });

  it('raakt Object.prototype niet aan', () => {
    sanitizeCourse(JSON.parse('{"id":"__proto__","chapters":[{"id":"__proto__","sections":[{"id":"__proto__","blocks":[{"id":"__proto__","type":"text","markdown":"x"}]}]}]}'));
    expect(({} as Record<string, unknown>).blocks).toBeUndefined();
    expect(({} as Record<string, unknown>).sections).toBeUndefined();
  });
});

// ── Doelgroep (studierichting) op de cursus (docs/STUDIERICHTINGEN.md § 10) ──

describe('sanitizeCourse: doelgroep', () => {
  const DG = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so', vak: 'Biologie' };
  const metDoelgroep = (doelgroep: unknown) => ({ ...(rawCourse([{ id: 'b1', type: 'text', markdown: 'x' }]) as object), doelgroep });

  it('houdt een geldige doelgroep, gesaneerd, als nieuw object', () => {
    const ruw = metDoelgroep({ ...DG, titel: '  Natuurwetenschappen\n', extra: 'valt weg' });
    const course = sanitizeCourse(ruw)!;
    expect(course.doelgroep).toStrictEqual(DG);
    expect(course.doelgroep).not.toBe((ruw as { doelgroep: unknown }).doelgroep);
  });

  it('een ongeldige doelgroep valt weg, en dan staat er geen sleutel "doelgroep"', () => {
    for (const doelgroep of [undefined, null, 'G-0193', { groep: 'fout' }, { titel: 'zonder groep' }, [DG]]) {
      const course = sanitizeCourse(metDoelgroep(doelgroep))!;
      expect(course, JSON.stringify(doelgroep)).not.toHaveProperty('doelgroep');
      expect(Object.keys(course)).not.toContain('doelgroep');
    }
  });

  it('een cursus zonder doelgroep blijft precies zoals vroeger (geen nieuwe sleutel, zelfde JSON)', () => {
    const course = sanitizeCourse(rawCourse([{ id: 'b1', type: 'text', markdown: 'x' }]))!;
    expect(Object.keys(course)).not.toContain('doelgroep');
    expect(JSON.stringify(course)).not.toContain('doelgroep');
    expect(sanitizeCourse(JSON.parse(JSON.stringify(course)))).toStrictEqual(course);
  });

  it('is idempotent met doelgroep; het jaar valt weg als het niet bij de graad past', () => {
    const een = sanitizeCourse(metDoelgroep({ ...DG, jaar: 9, kader: 'a'.repeat(64), volgtKader: true }))!;
    expect(een.doelgroep).toStrictEqual({
      groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so', vak: 'Biologie', kader: 'a'.repeat(64), volgtKader: true,
    });
    expect(sanitizeCourse(JSON.parse(JSON.stringify(een)))).toStrictEqual(een);
  });

  it('het cursusbestand (importCourseJson) neemt de doelgroep mee, gesaneerd', () => {
    const json = JSON.stringify({ app: 'boosterz', kind: 'cursus', v: 1, course: metDoelgroep({ ...DG, onderdeel: 'x' }), widgets: [] });
    expect(importCourseJson(json)!.course.doelgroep).toStrictEqual(DG);
    const zonder = JSON.stringify({ app: 'boosterz', kind: 'cursus', v: 1, course: rawCourse([{ id: 'b1', type: 'text', markdown: 'x' }]), widgets: [] });
    expect(importCourseJson(zonder)!.course).not.toHaveProperty('doelgroep');
  });
});
