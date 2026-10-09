// ── Datamodel van de cursusmodule (digitale cursussen/boeken) ───────────────
//
// Een cursus = hoofdstukken → secties → blokken. Blokken zijn de bouwstenen
// van de inhoud; het krachtigste blok is 'widget', dat een bestaande
// Boosterz-widget inline afspeelbaar maakt (met echte inzendingen).

import type { Doelgroep } from './doelgroep';

export type CourseBlockType =
  | 'heading'     // tussenkop
  | 'text'        // tekst met mini-markdown
  | 'image'       // afbeelding met bijschrift
  | 'video'       // YouTube/Vimeo
  | 'audio'       // audiofragment (upload/data-URL)
  | 'pdf'         // pdf-document, inline leesbaar (upload of URL)
  | 'embed'       // extern kader (GeoGebra, kaarten, …)
  | 'callout'     // kadertje: info/tip/let-op/leerdoelen
  | 'quote'       // citaat met bron
  | 'divider'     // scheidingslijn
  | 'attachment'  // downloadbaar bestand
  | 'accordion'   // uitklapbare onderdelen
  | 'columns'     // twee kolommen naast elkaar
  | 'table'       // eenvoudige tabel
  | 'terms'       // begrippenlijst
  | 'checklist'   // afvinklijst voor de leerling (telt mee in voortgang)
  | 'widget';     // ingebedde Boosterz-widget

export interface BlockBase {
  id: string;
  type: CourseBlockType;
}

export interface HeadingBlock extends BlockBase { type: 'heading'; text: string; level: 2 | 3 }
export interface TextBlock extends BlockBase { type: 'text'; markdown: string }
export interface ImageBlock extends BlockBase {
  type: 'image';
  url: string;
  caption?: string;
  size?: 'small' | 'normal' | 'wide';
}
export interface VideoBlock extends BlockBase { type: 'video'; url: string; caption?: string }
export interface AudioBlock extends BlockBase { type: 'audio'; url: string; caption?: string }
export interface PdfBlock extends BlockBase {
  type: 'pdf';
  /** Verwijzing naar een geüploade pdf in IndexedDB (alleen op dít toestel). */
  pdfId?: string;
  /** Of een openbare pdf-URL (reist wél mee met een deellink). */
  url?: string;
  /** Bestandsnaam, ook getoond als de pdf op dit toestel ontbreekt. */
  name?: string;
  caption?: string;
  /** Hoogte van de viewer in px (standaard 560). */
  height?: number;
}
export interface EmbedBlock extends BlockBase { type: 'embed'; url: string; height: number; title?: string }
export interface CalloutBlock extends BlockBase {
  type: 'callout';
  kind: 'info' | 'tip' | 'warn' | 'goal';
  title?: string;
  text: string;
}
export interface QuoteBlock extends BlockBase { type: 'quote'; text: string; source?: string }
export interface DividerBlock extends BlockBase { type: 'divider' }
export interface AttachmentBlock extends BlockBase { type: 'attachment'; name: string; dataUrl: string }
export interface AccordionBlock extends BlockBase {
  type: 'accordion';
  items: { id: string; title: string; text: string }[];
}
export interface ColumnsBlock extends BlockBase { type: 'columns'; left: string; right: string }
export interface TableBlock extends BlockBase { type: 'table'; header: boolean; rows: string[][] }
export interface TermsBlock extends BlockBase { type: 'terms'; items: { id: string; term: string; uitleg: string }[] }
export interface ChecklistBlock extends BlockBase { type: 'checklist'; title?: string; items: { id: string; text: string }[] }
export interface WidgetBlock extends BlockBase { type: 'widget'; widgetId: string; note?: string }

export type CourseBlock =
  | HeadingBlock | TextBlock | ImageBlock | VideoBlock | AudioBlock | PdfBlock
  | EmbedBlock | CalloutBlock | QuoteBlock | DividerBlock | AttachmentBlock
  | AccordionBlock | ColumnsBlock | TableBlock | TermsBlock | ChecklistBlock | WidgetBlock;

export interface CourseSection {
  id: string;
  title: string;
  blocks: CourseBlock[];
  /** Leerdoelen van deze sectie in vrije tekst (voor feed-up en de doelendekking). */
  goals?: string[];
  /** Codes van leerplandoelen (lib/curriculumTypes.ts) waaraan deze sectie werkt. */
  goalCodes?: string[];
  /** Verdiepings-/keuzesectie: telt niet mee voor "cursus afgewerkt". */
  optional?: boolean;
}

export interface CourseChapter {
  id: string;
  title: string;
  emoji?: string;
  sections: CourseSection[];
}

export interface CourseSettings {
  accentColor: string;
  /** Leerlingnaam vragen vóór het lezen (nodig om voortgang te volgen). */
  requireName: boolean;
  /** Mag de leerling de eigen voortgangsbalk zien? */
  showProgressToStudent: boolean;
}

export interface Course {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  /** Omslag: emoji + accentkleur (bewust licht — geen grote afbeeldingen). */
  coverEmoji: string;
  /** Korte deelcode, zoals bij widgets. */
  code: string;
  chapters: CourseChapter[];
  settings: CourseSettings;
  /** Leerplan waarop de cursus gebouwd is (voor dekking en goalCode-lookup). */
  curriculumId?: string;
  /**
   * Studierichting (en jaar) waarvoor de cursus is (docs/STUDIERICHTINGEN.md § 10). Reist mee met de deellink, het
   * cursusbestand en het klaspakket; altijd gesaneerd met `sanitizeDoelgroep`. De AI vult het nooit in.
   */
  doelgroep?: Doelgroep;
  createdAt: number;
  updatedAt: number;
}

// ── Voortgang van leerlingen ────────────────────────────────────────────────

export interface SectionProgress {
  /** Eerste keer geopend (ms). */
  openedAt: number;
  /** Door de leerling afgevinkt als "klaar" (ms), of automatisch bij checklist voltooid. */
  completedAt?: number;
  /** Totale kijktijd in seconden (opgeteld over bezoeken). */
  secondsSpent: number;
  /** Afgevinkte checklist-items per blok-id. */
  checks?: Record<string, string[]>;
}

export interface CourseProgress {
  courseId: string;
  courseCode: string;
  studentName: string;
  /** Klas en leerling uit de klaslijst, als de leerling via een klascode werkte. */
  classId?: string;
  studentId?: string;
  /** Per sectie-id. */
  sections: Record<string, SectionProgress>;
  /** Laatst bekeken sectie (om verder te lezen). */
  lastSectionId?: string;
  lastSeenAt: number;
  startedAt: number;
}

// ── Hulpfuncties over het model ─────────────────────────────────────────────

export function allSections(course: Course): { chapter: CourseChapter; section: CourseSection }[] {
  return course.chapters.flatMap((chapter) => chapter.sections.map((section) => ({ chapter, section })));
}

export function countableSections(course: Course): CourseSection[] {
  return allSections(course).map((x) => x.section).filter((s) => !s.optional);
}

/** Alle widget-ids waarnaar de cursus verwijst (voor meereizen bij delen). */
export function referencedWidgetIds(course: Course): string[] {
  const ids = new Set<string>();
  for (const { section } of allSections(course)) {
    for (const b of section.blocks) {
      if (b.type === 'widget' && b.widgetId) ids.add(b.widgetId);
    }
  }
  return [...ids];
}

/** Alle pdfId's van geüploade pdf's waarnaar de cursus verwijst (voor opruimen). */
export function referencedPdfIds(course: Course): string[] {
  const ids = new Set<string>();
  for (const { section } of allSections(course)) {
    for (const b of section.blocks) {
      if (b.type === 'pdf' && b.pdfId) ids.add(b.pdfId);
    }
  }
  return [...ids];
}

/** Voortgang van één leerling als percentage afgewerkte (niet-optionele) secties. */
export function progressPercent(course: Course, progress: CourseProgress | undefined): number {
  const sections = countableSections(course);
  if (!progress || sections.length === 0) return 0;
  const done = sections.filter((s) => progress.sections[s.id]?.completedAt).length;
  return Math.round((done / sections.length) * 100);
}
