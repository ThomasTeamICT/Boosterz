// Minimumdoelen kiezen: de rijen, het zoeken en het resultaat van het venster MinimumdoelKiezer. Puur en
// klein, zodat de editor van de leerplannenpagina het venster kan gebruiken zonder de hele wizard mee te laden.

import type { MinimumdoelRef } from './curriculumTypes';
import { htmlNaarTekst, type MinimumdoelenSetBestand } from './minimumdoelen';
import { zonderAccenten } from './minimumdoelenBron';
import { themaVanDoel } from './minimumdoelenLeerplan';

export interface KiezerRij {
  /** Set + vast nummer: de sleutel van het doel. */
  sleutel: string;
  ref: MinimumdoelRef;
  /** Gewone tekst; nooit HTML. */
  tekst: string;
  rubriek: string;
  /** Code en tekst zonder accenten en in kleine letters, om in te zoeken. */
  zoek: string;
}

export interface KiezerSet {
  setId: string;
  naam: string;
  rijen: KiezerRij[];
}

export function refSleutel(ref: Pick<MinimumdoelRef, 'set' | 'id'>): string {
  return `${ref.set}\u0000${ref.id}`;
}

/**
 * De doelen van de sets, klaar om te kiezen: in de volgorde van de sets en van elk bestand. Een doel
 * zonder vast nummer kan je niet blijvend aanwijzen en valt weg (zoals bij `losVerwijzingenOp`).
 */
export function kiezerSets(bestanden: readonly MinimumdoelenSetBestand[]): KiezerSet[] {
  return bestanden.map((b) => {
    const rijen: KiezerRij[] = [];
    for (const d of b.doelen) {
      if (typeof d.id !== 'string' || d.id.trim() === '') continue;
      const tekst = htmlNaarTekst(d.tekst);
      const ref: MinimumdoelRef = { set: b.set.id, id: d.id, code: d.code };
      rijen.push({
        sleutel: refSleutel(ref),
        ref,
        tekst,
        rubriek: themaVanDoel(d) ?? '',
        zoek: zonderAccenten(`${d.code} ${tekst}`),
      });
    }
    return { setId: b.set.id, naam: b.set.korteNaam?.trim() || b.set.naam, rijen };
  });
}

/** Rijen waarin alle zoekwoorden voorkomen (code of tekst, zonder accenten, hoofdletterongevoelig). */
export function filterKiezerRijen(rijen: readonly KiezerRij[], zoek: string): KiezerRij[] {
  const woorden = zonderAccenten(zoek).split(/\s+/).filter(Boolean);
  return woorden.length === 0 ? [...rijen] : rijen.filter((r) => woorden.every((w) => r.zoek.includes(w)));
}

/**
 * Het resultaat van het venster: de verwijzingen die al op het doel stonden maar buiten de getoonde
 * sets vallen blijven staan; daarna de aangevinkte, in de volgorde waarin ze al stonden, en de nieuwe
 * erbij in de volgorde van de sets.
 */
export function resultaatVanKiezer(
  sets: readonly KiezerSet[],
  vooraf: readonly MinimumdoelRef[],
  aangevinkt: ReadonlySet<string>,
): MinimumdoelRef[] {
  const getoond = new Set(sets.flatMap((s) => s.rijen.map((r) => r.sleutel)));
  const uit: MinimumdoelRef[] = [];
  const staat = new Set<string>();
  const voeg = (r: MinimumdoelRef) => {
    const k = refSleutel(r);
    if (staat.has(k)) return;
    staat.add(k);
    uit.push({ ...r });
  };
  for (const r of vooraf) if (!getoond.has(refSleutel(r)) || aangevinkt.has(refSleutel(r))) voeg(r);
  for (const s of sets) for (const r of s.rijen) if (aangevinkt.has(r.sleutel)) voeg(r.ref);
  return uit;
}
