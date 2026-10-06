// ── Voorbeeldcursus: bestaand materiaal van een leerkracht ──────────────────
//
// public/voorbeelden/natuurwetenschappen-1e-graad.json is een echte cursus
// (14 pdf-hoofdstukken) die door de importpagina ging — "Samenvoegen tot één
// cursus", sectieniveau 3 — en daarna aangevuld werd met de afbeeldingen uit
// de pdf's, doelcodes op elke sectie en flitskaarten uit elke begrippenlijst
// (zie tools/build-voorbeeldcursus.py). Ze laadt lui, alleen op verzoek: het
// bestand met afbeeldingen is te groot om standaard mee te bundelen.
//
// De afbeeldingen zijn gewone bestanden naast de app (voorbeelden/nw/…): ze
// reizen mee met een deellink of klaspakket zolang de app op dezelfde plek
// staat, en wegen niet op localStorage of IndexedDB.
//
// De oefeningen komen in een eigen map ("Voorbeeld: natuurwetenschappen"),
// zodat ze de eigen widgets niet overspoelen. Knop én ?voorbeeld=1 op
// /cursussen gebruiken dezelfde functie: installExampleCourse().

import { adoptSharedCourse, conflictKey, getCourse, importCourseJson } from './courses';
import type { Course } from './courseTypes';
import { getFolders, getWidgets, saveFolder, saveWidget } from './storage';
import type { Widget } from './types';
import {
  EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID, EXAMPLE_FOLDER_NAME, exampleInstallMessage, planExampleFolder,
} from './library';

export { EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID, EXAMPLE_FOLDER_NAME };

const EXAMPLE_COURSE_FILE = 'voorbeelden/natuurwetenschappen-1e-graad.json';
/** Kleur van de voorbeeldmap (groen, zoals de natuurwetenschappen). */
const EXAMPLE_FOLDER_COLOR = '#16a34a';

/** Relatieve media-URL's uit het voorbeeldbestand absoluut maken t.o.v. de app-basis. */
export function absolutizeExampleUrls(course: Course, base: string): Course {
  const prefix = base.endsWith('/') ? base : base + '/';
  for (const ch of course.chapters) {
    for (const sec of ch.sections) {
      for (const b of sec.blocks) {
        if ((b.type === 'image' || b.type === 'video' || b.type === 'audio') && /^voorbeelden\//.test(b.url)) {
          b.url = prefix + b.url;
        }
      }
    }
  }
  return course;
}

export function exampleCourseInstalled(): boolean {
  return Boolean(getCourse(EXAMPLE_COURSE_ID));
}

export interface ExampleInstall {
  course: Course;
  widgets: Widget[];
  /** Stond de cursus er al (en is ze nu vervangen door de bundelversie)? */
  reinstalled: boolean;
  /** Korte melding voor de leerkracht, met de telling per soort. */
  message: string;
}

/** Maakt de voorbeeldmap aan als ze nog niet bestaat. Een hernoemde map blijft zoals ze is. */
export function ensureExampleFolder(): void {
  if (getFolders().some((f) => f.id === EXAMPLE_FOLDER_ID)) return;
  saveFolder({ id: EXAMPLE_FOLDER_ID, name: EXAMPLE_FOLDER_NAME, color: EXAMPLE_FOLDER_COLOR, createdAt: Date.now() });
}

/**
 * Zet een ingelezen voorbeeldbundel in de bibliotheek. Bestaat de cursus al,
 * dan wordt ze vervangen door de bundelversie (bewust "opnieuw laden").
 * Alleen de cursus wordt gedwongen; de widgets volgen de gewone regels van
 * adoptSharedContent (G1): een ontbrekende komt terug, een (aangepaste)
 * voorbeeldoefening blijft zoals ze is. Alleen een ongewijzigde kopie uit een
 * deellink of klaspakket wordt bijgewerkt naar een nieuwere bundelversie.
 * Het voorbeeld zelf telt als eigen werk (geen `gedeeld`, S1): een link met
 * dezelfde id's vervangt het dus nooit stil.
 * Oefeningen zonder map komen in de voorbeeldmap; een map die de leerkracht
 * zelf koos, blijft staan.
 */
export function installExampleBundle(bundle: { course: Course; widgets: Widget[] }): ExampleInstall {
  const reinstalled = exampleCourseInstalled();
  let incoming = bundle.widgets;
  let updates: Widget[] = [];
  if (bundle.widgets.length > 0) {
    ensureExampleFolder();
    const folderIds = new Set(getFolders().map((f) => f.id));
    ({ incoming, updates } = planExampleFolder(bundle.widgets, getWidgets(), folderIds));
  }
  adoptSharedCourse(bundle.course, incoming, {
    conflicts: { choice: 'bijwerken', keys: [conflictKey({ kind: 'course', id: bundle.course.id })] },
  });
  // Alleen de map zetten, op de widget zoals ze nu (na het overnemen) is:
  // `updates` is van vóór het overnemen en zou anders een oudere inhoud
  // terugzetten (G7).
  if (updates.length > 0) {
    const now = new Map(getWidgets().map((w) => [w.id, w] as const));
    for (const w of updates) {
      const cur = now.get(w.id);
      if (cur && cur.folderId !== w.folderId) saveWidget({ ...cur, folderId: w.folderId });
    }
  }
  return {
    course: bundle.course,
    widgets: bundle.widgets,
    reinstalled,
    message: exampleInstallMessage({ chapters: bundle.course.chapters.length, widgets: bundle.widgets, reinstalled }),
  };
}

/** Haalt het voorbeeldbestand op en installeert het (zie installExampleBundle). */
export async function installExampleCourse(): Promise<ExampleInstall> {
  // De app staat op een relatieve basis (vite base './'): de map van het
  // document is de basis, los van de hash-route.
  const base = new URL('.', document.baseURI).href;
  const res = await fetch(new URL(EXAMPLE_COURSE_FILE, base).href, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Voorbeeldcursus niet gevonden (${res.status})`);
  const bundle = importCourseJson(await res.text());
  if (!bundle) throw new Error('Het voorbeeldbestand is geen geldige cursus');
  absolutizeExampleUrls(bundle.course, base);
  return installExampleBundle(bundle);
}

/** Oudere naam, voor wie ze nog gebruikt: zelfde installatie. */
export async function loadExampleCourse(): Promise<{ course: Course; widgets: Widget[] }> {
  const { course, widgets } = await installExampleCourse();
  return { course, widgets };
}
