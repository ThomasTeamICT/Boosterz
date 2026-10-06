import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  absolutizeExampleUrls, EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID, EXAMPLE_FOLDER_NAME, installExampleBundle,
} from './examples';
import {
  adoptSharedCourse, createCourse, getCourse, importCourseJson, sanitizeCourse, sharedCourseDiffers, sharedLinkQuestion,
} from './courses';
import type { Course } from './courseTypes';
import { deleteFolder, getFolders, getWidget, getWidgets, saveFolder, saveWidget } from './storage';
import type { Widget } from './types';
import { defaultSettings } from '../widgets/registry';

describe('absolutizeExampleUrls', () => {
  it('zet relatieve voorbeeld-URL\'s om naar de app-basis en laat andere URL\'s met rust', () => {
    const c = createCourse('x');
    c.chapters = [{ id: 'c', title: 'H', sections: [{ id: 's', title: 'S', blocks: [
      { id: '1', type: 'image', url: 'voorbeelden/nw/h01-01.jpg', size: 'normal' },
      { id: '2', type: 'image', url: 'https://example.org/a.png', size: 'normal' },
      { id: '3', type: 'text', markdown: 'voorbeelden/nw/niet-aanraken' },
    ] }] }];
    absolutizeExampleUrls(c, '/Boosterz/');
    const blocks = c.chapters[0].sections[0].blocks;
    expect(blocks[0].type === 'image' && blocks[0].url).toBe('/Boosterz/voorbeelden/nw/h01-01.jpg');
    expect(blocks[1].type === 'image' && blocks[1].url).toBe('https://example.org/a.png');
    expect(blocks[2].type === 'text' && blocks[2].markdown).toBe('voorbeelden/nw/niet-aanraken');
  });

  it('werkt ook met een basis zonder slash op het einde', () => {
    const c = createCourse('x');
    c.chapters = [{ id: 'c', title: 'H', sections: [{ id: 's', title: 'S', blocks: [{ id: '1', type: 'image', url: 'voorbeelden/nw/a.jpg', size: 'small' }] }] }];
    absolutizeExampleUrls(c, '/app');
    const b = c.chapters[0].sections[0].blocks[0];
    expect(b.type === 'image' && b.url).toBe('/app/voorbeelden/nw/a.jpg');
  });
});

// ── Installatie van de echte voorbeeldbundel ────────────────────────────────

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

const RAW = readFileSync(new URL('../../public/voorbeelden/natuurwetenschappen-1e-graad.json', import.meta.url), 'utf8');
function bundle() {
  const b = importCourseJson(RAW);
  if (!b) throw new Error('voorbeeldbundel onleesbaar');
  return b;
}

describe('installExampleBundle', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  });

  it('zet cursus en oefeningen klaar, in de voorbeeldmap, met een juiste telling', () => {
    const b = bundle();
    const res = installExampleBundle(b);
    expect(res.reinstalled).toBe(false);
    expect(getCourse(EXAMPLE_COURSE_ID)?.chapters.length).toBe(14);
    const folders = getFolders();
    expect(folders.filter((f) => f.id === EXAMPLE_FOLDER_ID)).toHaveLength(1);
    expect(folders[0].name).toBe(EXAMPLE_FOLDER_NAME);
    const ws = getWidgets();
    expect(ws).toHaveLength(b.widgets.length);
    expect(ws.every((w) => w.folderId === EXAMPLE_FOLDER_ID)).toBe(true);
    expect(res.message).toBe(
      `Voorbeeldcursus geladen: 14 hoofdstukken, ${b.widgets.length} oefeningen (96 werkbladen, 57 quizzen, 14 exit-tickets en meer)`
    );
    expect(res.message).not.toMatch(/flitskaartensets/);
  }, 60_000);

  it('opnieuw laden: eigen map blijft, oefeningen zonder map gaan naar de voorbeeldmap, bestaande widgets blijven', () => {
    const b = bundle();
    installExampleBundle(b);
    // De leerkracht hernoemt de voorbeeldmap, verhuist één oefening naar een
    // eigen map, haalt er één uit de map en past een titel aan.
    saveFolder({ id: 'eigen', name: 'Thema water', color: '#0ea5e9', createdAt: 1 });
    const exampleFolder = getFolders().find((f) => f.id === EXAMPLE_FOLDER_ID);
    if (!exampleFolder) throw new Error('voorbeeldmap ontbreekt');
    saveFolder({ ...exampleFolder, name: 'Mijn NW-voorbeelden' });
    const [a, c] = getWidgets();
    saveWidget({ ...a, folderId: 'eigen', title: 'Aangepaste titel' });
    saveWidget({ ...c, folderId: null });

    const res = installExampleBundle(bundle());
    expect(res.reinstalled).toBe(true);
    expect(res.message.startsWith('Voorbeeldcursus opnieuw geladen: 14 hoofdstukken')).toBe(true);
    const after = new Map(getWidgets().map((w) => [w.id, w]));
    expect(after.size).toBe(b.widgets.length);
    expect(after.get(a.id)?.folderId).toBe('eigen');
    expect(after.get(a.id)?.title).toBe('Aangepaste titel');
    expect(after.get(c.id)?.folderId).toBe(EXAMPLE_FOLDER_ID);
    expect(getFolders().find((f) => f.id === EXAMPLE_FOLDER_ID)?.name).toBe('Mijn NW-voorbeelden');
    expect(getFolders().filter((f) => f.id === EXAMPLE_FOLDER_ID)).toHaveLength(1);
  }, 60_000);

  it('een verwijderde voorbeeldmap komt terug bij opnieuw laden', () => {
    installExampleBundle(bundle());
    deleteFolder(EXAMPLE_FOLDER_ID);
    expect(getWidgets().every((w) => w.folderId === null)).toBe(true);
    installExampleBundle(bundle());
    expect(getFolders().some((f) => f.id === EXAMPLE_FOLDER_ID)).toBe(true);
    expect(getWidgets().every((w) => w.folderId === EXAMPLE_FOLDER_ID)).toBe(true);
  }, 60_000);

  it('een lege bundel maakt geen lege map aan', () => {
    const b = bundle();
    installExampleBundle({ course: b.course, widgets: [] });
    expect(getFolders()).toEqual([]);
  }, 60_000);
});

// ── Opnieuw laden met een herbouwde (nieuwere) bundel: G1, G7 en S1 ─────────

describe('installExampleBundle met een nieuwere bundel', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms);

  function oefening(id: string, title: string, updatedAt: number): Widget {
    return {
      id, type: 'quiz', title, folderId: null, code: id.toUpperCase().padEnd(6, 'X'),
      config: { questions: [{ id: 'q1', type: 'tf', prompt: title, points: 1, answer: true }] } as unknown as Widget['config'],
      settings: defaultSettings(), createdAt: 1, updatedAt,
    };
  }

  /** Een kleine voorbeeldbundel met twee oefeningen, zoals tools/build-voorbeeldcursus.py ze maakt. */
  function kleineBundel(versie: string, updatedAt: number): { course: Course; widgets: Widget[] } {
    const course = sanitizeCourse({
      id: EXAMPLE_COURSE_ID, title: 'Voorbeeld ' + versie, code: 'VBNW01', updatedAt,
      chapters: [{ id: 'h1', title: 'H1', sections: [{ id: 's1', title: 'S', blocks: [
        { id: 'b1', type: 'widget', widgetId: 'vw1' },
        { id: 'b2', type: 'widget', widgetId: 'vw2' },
      ] }] }],
    })!;
    return { course, widgets: [oefening('vw1', 'Quiz 1 ' + versie, updatedAt), oefening('vw2', 'Quiz 2 ' + versie, updatedAt)] };
  }

  it('opnieuw laden met een nieuwere bundel laat een aangepaste voorbeeldoefening staan (G1)', () => {
    installExampleBundle(kleineBundel('v1', Date.now() - 9000));
    later();
    saveWidget({ ...getWidget('vw1')!, title: 'EIGEN' });
    later();
    installExampleBundle(kleineBundel('v2', Date.now() - 10));
    expect(getCourse(EXAMPLE_COURSE_ID)!.title).toBe('Voorbeeld v2');
    expect(getWidget('vw1')!.title).toBe('EIGEN');
  });

  it('verwijderde voorbeeldmap en een nieuwere bundel: geen oude inhoud terug, map hersteld (G7)', () => {
    // De oefeningen kwamen eerst via een klaspakket of deellink van een collega
    // (zuivere kopie, zonder map); daarna laadt de leerkracht het voorbeeld zelf.
    const v1 = kleineBundel('v1', Date.now() - 9000);
    adoptSharedCourse(v1.course, v1.widgets, { gedeeld: true });
    later();
    installExampleBundle(kleineBundel('v2', Date.now() - 10));
    for (const id of ['vw1', 'vw2']) {
      expect(getWidget(id)!.title).toMatch(/ v2$/);
      expect(getWidget(id)!.folderId).toBe(EXAMPLE_FOLDER_ID);
    }
    // En met een eigen aanpassing na een verwijderde map: de map komt terug, de aanpassing blijft.
    later();
    saveWidget({ ...getWidget('vw1')!, title: 'EIGEN' });
    deleteFolder(EXAMPLE_FOLDER_ID);
    later();
    installExampleBundle(kleineBundel('v3', Date.now() - 10));
    expect(getWidget('vw1')).toMatchObject({ title: 'EIGEN', folderId: EXAMPLE_FOLDER_ID });
    expect(getWidget('vw2')!.folderId).toBe(EXAMPLE_FOLDER_ID);
  });

  it('het voorbeeld telt als eigen werk: een link met dezelfde id\'s vraagt eerst (S1)', async () => {
    installExampleBundle(kleineBundel('v1', Date.now() - 9000));
    later();
    const nep = kleineBundel('NEP', Date.now());
    expect(await sharedCourseDiffers(nep.course, undefined, nep.widgets)).toBe(true);
    const vraag = await sharedLinkQuestion(nep.course, undefined, nep.widgets);
    expect(vraag?.course).toBe(true);
    expect(vraag?.widgets.map((c) => c.id).sort()).toEqual(['vw1', 'vw2']);
    // Overnemen zonder keuze (zoals de linkroute zonder vraag) verandert niets.
    adoptSharedCourse(nep.course, nep.widgets, { gedeeld: true });
    expect(getCourse(EXAMPLE_COURSE_ID)!.title).toBe('Voorbeeld v1');
    expect(getWidget('vw1')!.title).toBe('Quiz 1 v1');
  });
});
