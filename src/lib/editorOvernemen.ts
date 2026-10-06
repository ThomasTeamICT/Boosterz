// ── Widget-editor: overnemen, focus en weggaan (debugronde oktober 2026, P3) ─
//
// Aanvulling op lib/editorSync.ts. Wat hier staat is bewust zo puur als kan
// (geen React, geen opslag), zodat het los te testen is. Alleen captureFocus en
// restoreFocus raken de DOM; de keuze welk veld de focus terugkrijgt zit in de
// pure functie pickFocusIndex.
//
//  - B4  Na het overnemen van een versie uit een ander tabblad stond een nieuwe
//        afbeelding nog als "wfmedia:…"-verwijzing in het scherm, en niemand
//        las opnieuw nadat de blob geladen was: shouldRefreshMedia beslist
//        wanneer de editor stil opnieuw mag lezen.
//  - B5  De editor wordt bij het overnemen opnieuw opgebouwd (key={syncKey}),
//        waardoor de focus op BODY viel en toetsaanslagen verloren gingen.
//  - B9  De tekst bij "weggaan" noemde altijd een volle opslag.

import { MEDIA_REF_PREFIX } from './mediaStore';

// ── Media opnieuw lezen (B4) ────────────────────────────────────────────────

/** Aantal verwijzingen ("wfmedia:…") in een widget die nog niet in een blob-URL omgezet zijn. */
export function countMediaRefs(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json ? json.split(MEDIA_REF_PREFIX).length - 1 : 0;
  } catch {
    return 0;
  }
}

/**
 * Mag de editor stil de widget opnieuw uit de opslag lezen omdat er media
 * bijgeladen is? Alleen als er niets te verliezen valt en de opslag nog
 * dezelfde versie heeft: dan is het enkel dezelfde inhoud mét werkende
 * afbeeldingen. En alleen als dat echt iets oplevert (minder open verwijzingen),
 * zodat een ander, niet-gerelateerd laadevent de editor niet nodeloos herbouwt.
 */
export function shouldRefreshMedia(s: {
  /** Onbewaarde wijzigingen op het scherm, of de AI-assistent staat open. */
  unsaved: boolean;
  /** Er wacht een keuze (conflict of elders verwijderd). */
  holding: boolean;
  /** Versie in de opslag (null = niet meer aanwezig). */
  storedVersion: number | null;
  /** Versie die de editor het laatst zag of zelf bewaarde. */
  knownVersion: number;
  /** Open verwijzingen in wat nu op het scherm staat. */
  shownRefs: number;
  /** Open verwijzingen in wat nu uit de opslag komt. */
  storedRefs: number;
}): boolean {
  if (s.unsaved || s.holding) return false;
  if (s.storedVersion === null || s.storedVersion !== s.knownVersion) return false;
  return s.storedRefs < s.shownRefs;
}

// ── Focus terugzetten na het overnemen (B5) ─────────────────────────────────

export interface FocusCandidate {
  /** Tagnaam in hoofdletters, bv. TEXTAREA. */
  tag: string;
  /** Wat het veld voor de gebruiker noemt (aria-label, id, placeholder, tekst). */
  label: string;
}

export interface FocusSlot extends FocusCandidate {
  /** Plaats onder de focusbare elementen van het paneel. */
  index: number;
  /** Tekstselectie (alleen bij tekstvelden). */
  start: number | null;
  end: number | null;
}

/**
 * Welk element krijgt de focus terug? Eerst hetzelfde element op dezelfde plaats
 * (zelfde soort en naam); is de lijst intussen verschoven, dan het dichtstbijzijnde
 * met dezelfde soort én naam, daarna het dichtstbijzijnde van dezelfde soort.
 * -1 = niets passends (de focus blijft dan waar ze is).
 */
export function pickFocusIndex(candidates: FocusCandidate[], slot: Pick<FocusSlot, 'index' | 'tag' | 'label'>): number {
  const nearest = (ok: (c: FocusCandidate) => boolean): number => {
    let best = -1;
    let bestDist = Infinity;
    candidates.forEach((c, i) => {
      if (!ok(c)) return;
      const d = Math.abs(i - slot.index);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  };
  const same = candidates[slot.index];
  if (same && same.tag === slot.tag && same.label === slot.label) return slot.index;
  const byLabel = nearest((c) => c.tag === slot.tag && c.label === slot.label);
  if (byLabel >= 0) return byLabel;
  return nearest((c) => c.tag === slot.tag);
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

function labelOf(el: HTMLElement): string {
  const own = el.getAttribute('aria-label') || el.id || el.getAttribute('placeholder') || el.getAttribute('name');
  if (own) return own;
  // Een knop of link heeft geen eigen label: de tekst (ingekort) is dan haar naam.
  return el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement
    ? (el.textContent ?? '').trim().slice(0, 40)
    : '';
}

function selectionOf(el: HTMLElement): [number, number] | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  try {
    // email en number kennen geen selectie: dan gooit de browser of geeft ze null.
    const { selectionStart, selectionEnd } = el;
    return selectionStart === null || selectionEnd === null ? null : [selectionStart, selectionEnd];
  } catch {
    return null;
  }
}

/** Onthoudt welk veld in `root` de focus heeft (null als de focus er niet in zit). */
export function captureFocus(root: HTMLElement | null): FocusSlot | null {
  if (!root) return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const index = focusables(root).indexOf(active);
  if (index < 0) return null;
  const sel = selectionOf(active);
  return { index, tag: active.tagName, label: labelOf(active), start: sel?.[0] ?? null, end: sel?.[1] ?? null };
}

/** Zet de focus (en selectie) terug; geeft false als er nog geen passend veld is. */
export function restoreFocus(root: HTMLElement | null, slot: FocusSlot): boolean {
  if (!root) return false;
  const els = focusables(root);
  const i = pickFocusIndex(els.map((el) => ({ tag: el.tagName, label: labelOf(el) })), slot);
  if (i < 0) return false;
  const el = els[i];
  el.focus({ preventScroll: true });
  if (slot.start !== null && slot.end !== null && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    try {
      const len = el.value.length;
      el.setSelectionRange(Math.min(slot.start, len), Math.min(slot.end, len));
    } catch { /* geen selectie voor dit soort veld */ }
  }
  return document.activeElement === el;
}

// ── Tekst bij weggaan (B9) ──────────────────────────────────────────────────

export type LeaveKind = 'conflict' | 'verwijderd' | 'mislukt';

/**
 * Wat de vraag bij weggaan zegt. Bij een mislukte schrijfactie noemt ze de echte
 * reden (`reason`, de melding van de opslag): een volle opslag, of iets anders
 * zoals een geblokkeerde opslag in privémodus.
 */
export function leaveMessage(kind: LeaveKind, reason?: string | null): string {
  if (kind === 'conflict') {
    return 'Een ander tabblad bewaarde intussen een andere versie van deze widget. Als je nu weggaat, gaan je wijzigingen hier verloren.';
  }
  if (kind === 'verwijderd') {
    return 'Deze widget werd in een ander tabblad verwijderd. Als je nu weggaat, gaan je wijzigingen hier verloren.';
  }
  const why = reason?.trim() || 'Bewaren op dit toestel lukt niet.';
  return `${why} Als je nu weggaat, gaan je laatste wijzigingen verloren. Download de widget eerst als bestand als je ze wil houden.`;
}
