// De sleutel van een doel in het bewijsmodel (bouwpakket 3 van docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md).
//
// Een bewijs telt voor een doel. Dat doel is een minimumdoel van de overheid of een leerplandoel van het GO!. Het GO!
// heeft 468 leerplandoelen zonder minimumdoel (bv. WT.008), dus het model moet ook op een GO!-code kunnen sleutelen
// (docs/basisonderwijs/GO-LEERPLAN.md, 'Bewijs en voorlezen').
//
// - Minimumdoel: de sleutel is het vaste nummer uit de API (`@id`), zoals MinimumdoelRef in curriculumTypes.ts. De set
//   staat erbij als context (de tekst komt uit die set), maar telt niet mee in de sleutel: een doel staat vaak in twee
//   sets (populatie en na te streven, bv. 92767 in ODS_3408 en ODS_3469), met hetzelfde nummer, dezelfde code en
//   dezelfde tekst (nagerekend over alle 12 499 nummers in public/leerplannen/minimumdoelen op 12 november 2026).
//   De code van een minimumdoel ('3.5.4') is nooit een sleutel: 92767 en 92833 hebben allebei 3.5.4.
// - GO!: de code van het leerplandoel, bv. 'WT.408'.
//
// Zuiver: geen opslag, geen klok, geen netwerk.

import { isGoVak } from '../go/types';

export interface MinimumdoelSleutel {
  soort: 'minimumdoel';
  /** De set waaruit de tekst komt, bv. 'ODS_3408'. Context, geen deel van de sleutel. */
  set: string;
  /** Het vaste nummer van het doel in de API, als tekst, bv. '92767'. Dit is de sleutel. */
  id: string;
}

export interface GoSleutel {
  soort: 'go';
  /** De code van het leerplandoel van het GO!, bv. 'WT.408'. */
  code: string;
}

export type DoelSleutel = MinimumdoelSleutel | GoSleutel;

const SET_RE = /^ODS_\d{1,6}$/;
const ID_RE = /^[1-9]\d{0,9}$/;
const GO_CODE_RE = /^([A-Z]{2})\.(\d{3})$/;

/** Een minimumdoel als doelsleutel. */
export function minimumdoel(set: string, id: string): MinimumdoelSleutel {
  return { soort: 'minimumdoel', set, id };
}

/** Een leerplandoel van het GO! als doelsleutel. */
export function goDoel(code: string): GoSleutel {
  return { soort: 'go', code };
}

/**
 * Waarom dit geen geldige doelsleutel is, of `null` als ze geldig is. Werkt ook op invoer van een onbekende vorm
 * (een manifest uit JSON), zonder te crashen.
 */
export function redenOngeldigeDoelSleutel(d: unknown): string | null {
  if (typeof d !== 'object' || d === null) return 'geen object';
  const o = d as Record<string, unknown>;
  if (o.soort === 'minimumdoel') {
    if (typeof o.set !== 'string' || !SET_RE.test(o.set)) return `set '${String(o.set)}' heeft niet de vorm ODS_<nummer>`;
    if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return `nummer '${String(o.id)}' is geen vast nummer uit de API`;
    return null;
  }
  if (o.soort === 'go') {
    if (typeof o.code !== 'string') return 'de GO!-code ontbreekt';
    const m = GO_CODE_RE.exec(o.code);
    if (!m || !isGoVak(m[1]) || m[2] === '000') return `GO!-code '${o.code}' heeft niet de vorm <vak>.<3 cijfers>`;
    return null;
  }
  return `onbekende soort doel '${String(o.soort)}'`;
}

/**
 * De sleutel als tekst: 'md:<nummer>' of 'go:<code>'. Twee doelen met dezelfde sleuteltekst zijn hetzelfde doel, ook als
 * ze uit een andere set komen.
 */
export function doelSleutelTekst(d: DoelSleutel): string {
  return d.soort === 'minimumdoel' ? `md:${d.id}` : `go:${d.code}`;
}

/** Exact dezelfde doelsleutel, de set inbegrepen. */
export function zelfdeDoelSleutel(a: DoelSleutel, b: DoelSleutel): boolean {
  if (a.soort === 'minimumdoel') return b.soort === 'minimumdoel' && a.set === b.set && a.id === b.id;
  return b.soort === 'go' && a.code === b.code;
}
