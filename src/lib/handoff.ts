// ── Overdracht tussen pagina's (sessionStorage) ─────────────────────────────
//
// De importpagina haalt tekst uit een .docx, pdf of plakbord en stuurt die
// door naar de AI-cursusbouwer (/cursussen?ai=nieuw) of de AI-studio
// (/ai-studio). Zo'n tekst past niet in een URL; daarom parkeren we ze even
// in sessionStorage. Eén keer ophalen (take) maakt ze weer leeg, zodat een
// oude overdracht nooit onverwacht opduikt.

import { sanitizeDoelgroep, type Doelgroep } from './doelgroep';

export interface Handoff {
  /** Bronmateriaal (platte tekst of markdown). */
  source: string;
  /** Voorgestelde titel (bv. bestandsnaam zonder extensie). */
  title?: string;
  /** Leerplan dat er al bij gekozen werd. */
  curriculumId?: string;
  /** Codes van geselecteerde leerplandoelen. */
  goalCodes?: string[];
  /** Waar het vandaan komt, voor een korte melding ("uit hoofdstuk-3.docx"). */
  origin?: string;
  /** Studierichting (en jaar) waarvoor de cursus gemaakt wordt; bij het ophalen gesaneerd. */
  doelgroep?: Doelgroep;
}

const KEY = 'wf.handoff.v1';

export function setHandoff(h: Handoff): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function peekHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Handoff & { at?: number };
    if (!h || typeof h.source !== 'string') return null;
    // De doelgroep komt uit sessionStorage: saneren, en een ongeldige laten wegvallen (geen lege sleutel).
    const { doelgroep, ...rest } = h;
    const dg = sanitizeDoelgroep(doelgroep);
    return dg ? { ...rest, doelgroep: dg } : rest;
  } catch {
    return null;
  }
}

/** Ophalen én wissen. */
export function takeHandoff(): Handoff | null {
  const h = peekHandoff();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // genegeerd
  }
  return h;
}
