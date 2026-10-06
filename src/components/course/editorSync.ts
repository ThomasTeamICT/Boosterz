// ── Cursuseditor: bewaren, tabbladen en opruimen ────────────────────────────
//
// De logica achter CourseEditorPage, los van React zodat ze te testen is
// (debugronde oktober 2026, pakket P6: CU2/OP4, CU3, CU7, CU15c en CU15e).
//
// Vaste afspraken (invarianten):
//  1. De editor schrijft nooit over een versie die hij niet zag. Hij onthoudt
//     de versie (updatedAt) waarop hij verder bouwt en bewaart via
//     saveCourseGuarded: staat er intussen iets anders, dan wordt er niets
//     geschreven en verschijnt er een keuze. Vergeleken wordt op gelijkheid,
//     niet op "nieuwer": updatedAt kan terugspringen na een bewust
//     "Vervangen" door een oudere back-up.
//  2. Een cursus die elders verwijderd werd, komt niet stil terug: alleen na
//     "Toch bewaren".
//  3. "Bewaard" verschijnt alleen na een geslaagde schrijfactie. Mislukt het,
//     dan blijven de wijzigingen op het scherm en zegt de editor het.
//  4. Een cursus openen of herladen schrijft niets (updatedAt blijft staan).
//  5. Wie weggaat met een open conflict en niet-bewaarde wijzigingen, verliest
//     niets: die wijzigingen komen in een kopie.
//  6. Een geüpload pdf-bestand wordt pas gewist na een geslaagde bewaring, en
//     alleen als geen enkele bewaarde cursus of widget én de cursus op het
//     scherm er nog naar verwijzen.

import type { Course, CourseBlock, CourseSection } from '../../lib/courseTypes';
import { allSections } from '../../lib/courseTypes';
import type { GuardedSaveResult } from '../../lib/courses';

// ── Kleine, zuivere hulpen ──────────────────────────────────────────────────

/**
 * Heeft een sectie iets dat verloren gaat bij verwijderen? Blokken, een
 * leerdoel in eigen woorden of een doelcode (CU15e). Een leeg leerdoelveld
 * telt niet mee.
 */
export function sectionHasContent(section: CourseSection): boolean {
  const blocks = Array.isArray(section.blocks) ? section.blocks : [];
  const goals = Array.isArray(section.goals) ? section.goals : [];
  const codes = Array.isArray(section.goalCodes) ? section.goalCodes : [];
  return blocks.length > 0 || goals.some((g) => typeof g === 'string' && g.trim() !== '') || codes.length > 0;
}

/** De geüploade pdf's (pdfId) in een reeks blokken. */
export function pdfIdsInBlocks(blocks: CourseBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) if (b.type === 'pdf' && typeof b.pdfId === 'string' && b.pdfId) out.push(b.pdfId);
  return out;
}

/** Aantal blokken in deze cursus dat naar dit pdf-bestand verwijst. */
export function pdfRefsInCourse(course: Course, pdfId: string): number {
  let n = 0;
  for (const { section } of allSections(course)) {
    for (const b of section.blocks) if (b.type === 'pdf' && b.pdfId === pdfId) n++;
  }
  return n;
}

/** Een aparte kopie van een cursus: eigen id en code, zodat beide versies blijven bestaan. */
export function courseCopy(course: Course, o: { id: string; code: string; now: number }): Course {
  const title = course.title.trim() || 'Naamloze cursus';
  return { ...course, id: o.id, code: o.code, title: `${title} (mijn versie)`, createdAt: o.now, updatedAt: o.now };
}

/** "Als leerling": de lezer in voorbeeldmodus, waarin niets bewaard wordt (CU15c). */
export function coursePreviewHash(code: string): string {
  return `#/cursus/lees/${encodeURIComponent(code)}?voorbeeld=1`;
}

// ── Wat doen we als een ander tabblad de cursus wijzigde? ───────────────────

export type ExternalDecision =
  /** Er veranderde niets aan deze cursus (bv. een andere cursus werd bewaard). */
  | 'niets'
  /** Geen eigen wijzigingen hier: de nieuwe versie gewoon tonen. */
  | 'herladen'
  /** De opslag staat weer op onze versie: het conflict is weg. */
  | 'opgelost'
  /** Wijzigingen aan beide kanten: niets overschrijven, de leerkracht kiest. */
  | 'conflict-gewijzigd'
  /** De cursus staat niet meer in de opslag. */
  | 'conflict-verwijderd';

export function decideExternal(s: {
  /** updatedAt van de versie waarop de editor verder bouwt. */
  stamp: number;
  /** Wat nu in de opslag staat. */
  stored: { updatedAt: number } | undefined;
  /** Niet-bewaarde wijzigingen op het scherm. */
  dirty: boolean;
  /** Een venster dat straks de hele cursus vervangt (de AI-hulp) staat open. */
  busy: boolean;
  hasConflict: boolean;
}): ExternalDecision {
  if (!s.stored) return 'conflict-verwijderd';
  if (s.stored.updatedAt === s.stamp) return s.hasConflict ? 'opgelost' : 'niets';
  if (!s.dirty && !s.busy) return 'herladen';
  return 'conflict-gewijzigd';
}

// ── De bewaarmotor ──────────────────────────────────────────────────────────

export type EditorConflict = { kind: 'gewijzigd'; theirs: Course } | { kind: 'verwijderd' };

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'reloaded';

export type SaveOutcome = 'bewaard' | 'niets' | 'mislukt' | 'conflict';

export interface DraftSnapshot {
  course: Course | undefined;
  /** Er staan wijzigingen op het scherm die nog niet bewaard zijn. */
  dirty: boolean;
  conflict: EditorConflict | null;
  status: DraftStatus;
  /** De laatste poging om te bewaren mislukte (volle of geblokkeerde opslag). */
  saveFailed: boolean;
  /** Tijdstip van de laatste geslaagde bewaring (0 = nog geen). */
  savedAt: number;
}

/** Alles wat de motor van buiten nodig heeft; in de app de echte opslag, in tests een nabootsing. */
export interface DraftStore {
  read(id: string): Course | undefined;
  saveGuarded(course: Course, expectedUpdatedAt: number, opts?: { force?: boolean }): GuardedSaveResult;
  saveNew(course: Course): boolean;
  /** Verwijzingen naar dit pdf-bestand in alle bewáárde cursussen en widgets. */
  pdfRefsSaved(pdfId: string): number;
  deletePdf(pdfId: string): void;
  newId(): string;
  newCode(): string;
  now(): number;
}

export interface CourseDraft {
  /** Voor useSyncExternalStore. */
  subscribe(fn: () => void): () => void;
  getSnapshot(): DraftSnapshot;
  current(): Course | undefined;
  /** Een (andere) cursus tonen. Schrijft niets. */
  open(course: Course | undefined): void;
  /** Wijzigen op het scherm; bewaren volgt na een korte pauze. */
  edit(next: Course | ((c: Course) => Course)): void;
  /** Meteen bewaren (bv. vóór een voorbeeld in een nieuw tabblad). */
  save(): SaveOutcome;
  /** Een ander tabblad schreef de cursussen weg. */
  external(): ExternalDecision;
  /** Conflict: de versie uit de opslag laden. Eigen wijzigingen vervallen. */
  loadTheirs(): boolean;
  /** Conflict: de eigen versie toch bewaren (overschrijft, of zet terug na verwijderen). */
  keepMine(): SaveOutcome;
  /** Conflict: de eigen versie als aparte cursus bewaren. Het origineel krijgt de versie uit de opslag. */
  saveCopy(): Course | null;
  /** De wijzigingen op het scherm bewust laten vallen. */
  discard(): void;
  /**
   * Weggaan (andere pagina, andere cursus, tabblad sluiten): bewaren, of bij
   * een conflict een kopie maken. `failed`: er staan wijzigingen die nergens
   * bewaard konden worden (volle opslag).
   */
  leave(): { copy: Course | null; failed: boolean };
  setBusy(busy: boolean): void;
  /** Dit pdf-bestand wordt niet meer gebruikt door het blok: opruimen na de volgende bewaring. */
  releasePdf(pdfId: string | undefined): void;
  dispose(): void;
}

export function createCourseDraft(store: DraftStore, initial: Course | undefined, delayMs = 800): CourseDraft {
  let course = initial;
  /** De versie die in de opslag staat (zelfde object als `course` = niets te bewaren). */
  let synced = initial;
  // Bewust de ruwe waarde, ook als oude data geen updatedAt heeft: de
  // vergelijking in saveCourseGuarded gebeurt op dezelfde ruwe waarde.
  let stamp: number = initial ? initial.updatedAt : 0;
  let conflict: EditorConflict | null = null;
  let status: DraftStatus = 'idle';
  let saveFailed = false;
  let savedAt = 0;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const released = new Set<string>();
  const listeners = new Set<() => void>();

  const isDirty = () => course !== undefined && course !== synced;
  const makeSnapshot = (): DraftSnapshot => ({ course, dirty: isDirty(), conflict, status, saveFailed, savedAt });
  let snap = makeSnapshot();
  const emit = () => {
    snap = makeSnapshot();
    listeners.forEach((fn) => fn());
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    clearTimer();
    if (conflict || !isDirty()) return;
    status = 'saving';
    timer = setTimeout(() => {
      timer = null;
      save();
    }, delayMs);
  };

  const collectPdfs = () => {
    for (const id of [...released]) {
      released.delete(id);
      if (course && pdfRefsInCourse(course, id) > 0) continue;
      if (store.pdfRefsSaved(id) > 0) continue;
      store.deletePdf(id);
    }
  };

  const markSaved = (c: Course, updatedAt: number) => {
    synced = c;
    stamp = updatedAt;
    status = 'saved';
    saveFailed = false;
    savedAt = store.now();
    collectPdfs();
  };

  const adopt = (c: Course | undefined, next: DraftStatus) => {
    clearTimer();
    course = c;
    synced = c;
    stamp = c ? c.updatedAt : 0;
    conflict = null;
    saveFailed = false;
    status = next;
  };

  function save(): SaveOutcome {
    clearTimer();
    if (!course || !isDirty()) return 'niets';
    if (conflict) return 'conflict';
    const cur = course;
    const r = store.saveGuarded(cur, stamp);
    if (r.ok) {
      markSaved(cur, r.updatedAt);
      emit();
      return 'bewaard';
    }
    status = 'idle';
    if (r.reason === 'mislukt') {
      saveFailed = true;
      emit();
      return 'mislukt';
    }
    conflict = r.reason === 'verwijderd' ? { kind: 'verwijderd' } : { kind: 'gewijzigd', theirs: r.stored };
    emit();
    return 'conflict';
  }

  function loadTheirs(): boolean {
    if (!course) return false;
    const stored = store.read(course.id);
    if (!stored) {
      clearTimer();
      conflict = { kind: 'verwijderd' };
      emit();
      return false;
    }
    adopt(stored, 'reloaded');
    emit();
    return true;
  }

  function saveCopy(): Course | null {
    if (!course) return null;
    const mine = course;
    const copy = courseCopy(mine, { id: store.newId(), code: store.newCode(), now: store.now() });
    if (!store.saveNew(copy)) {
      saveFailed = true;
      emit();
      return null;
    }
    // De wijzigingen staan nu in de kopie. Het origineel toont wat er in de
    // opslag staat; is het verwijderd, dan valt er voor het origineel niets
    // meer te bewaren.
    const stored = store.read(mine.id);
    if (stored) adopt(stored, 'idle');
    else {
      clearTimer();
      synced = mine;
    }
    emit();
    return copy;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    getSnapshot: () => snap,
    current: () => course,

    open(c) {
      adopt(c, 'idle');
      emit();
    },

    edit(next) {
      if (!course) return;
      const value = typeof next === 'function' ? next(course) : next;
      if (value === course) return;
      course = value;
      schedule();
      emit();
    },

    save,

    external() {
      if (!course) return 'niets';
      const stored = store.read(course.id);
      const d = decideExternal({ stamp, stored, dirty: isDirty(), busy, hasConflict: conflict !== null });
      if (d === 'niets') return d;
      if (d === 'herladen' && stored) adopt(stored, 'reloaded');
      else if (d === 'opgelost') {
        conflict = null;
        schedule();
      } else if (d === 'conflict-gewijzigd' && stored) {
        clearTimer();
        conflict = { kind: 'gewijzigd', theirs: stored };
      } else {
        clearTimer();
        conflict = { kind: 'verwijderd' };
      }
      emit();
      return d;
    },

    loadTheirs,

    keepMine() {
      clearTimer();
      if (!course) return 'niets';
      const cur = course;
      const r = store.saveGuarded(cur, stamp, { force: true });
      if (!r.ok) {
        saveFailed = true;
        emit();
        return 'mislukt';
      }
      conflict = null;
      markSaved(cur, r.updatedAt);
      emit();
      return 'bewaard';
    },

    saveCopy,

    discard() {
      clearTimer();
      synced = course;
      emit();
    },

    leave() {
      clearTimer();
      if (!isDirty()) return { copy: null, failed: false };
      if (!conflict) {
        const out = save();
        if (out === 'bewaard' || out === 'niets') return { copy: null, failed: false };
        if (out === 'mislukt') return { copy: null, failed: true };
      }
      const copy = saveCopy();
      return { copy, failed: copy === null };
    },

    setBusy(b) {
      if (busy === b) return;
      busy = b;
      // Het venster ging dicht zonder iets te veranderen, en intussen werd de
      // cursus elders gewijzigd: er is niets te verliezen, dus gewoon laden.
      if (!b && conflict?.kind === 'gewijzigd' && !isDirty()) loadTheirs();
    },

    releasePdf(pdfId) {
      if (pdfId) released.add(pdfId);
    },

    dispose() {
      clearTimer();
    },
  };
}
