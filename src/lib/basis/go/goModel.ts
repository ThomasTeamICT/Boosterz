// Zuivere selectors over de gegevens van het GO!: lesplannen per leeftijd, lessenlijnen en hun adresdelen, het
// rubriekpad van een leerplandoel, de leerplandoelen bij een minimumdoel, de ik-doelen van een doel, 'zonder
// minimumdoel' en het adres van een leerplandoel. (docs/basisonderwijs/GO-LEERPLAN.md, "In de app".)
//
// Zuiver: geen React, geen opslag, geen netwerk en nergens de klok. Alle tekst blijft letterlijk uit de bron; hier
// wordt alleen gekozen, gegroepeerd en gesorteerd. De tekst van een minimumdoel komt hier nooit voor.

import { basisPad } from '../basisRoutes';
import { GO_LEEFTIJDEN, vergelijkLeeftijden } from './leeftijden';
import { GO_VAK_CODES, isGoVak } from './types';
import type {
  GoBijDoel,
  GoBijMinimumdoelBestand,
  GoIndex,
  GoLeerplanBestand,
  GoLeerplandoel,
  GoLeeftijd,
  GoLesplanBestand,
  GoRubriek,
  GoVak,
} from './types';

/** Een lesplan zoals het in de index staat. */
export type GoIndexLesplan = GoIndex['lesplannen'][number];

// ── Adresdelen ───────────────────────────────────────────────────────────────

/**
 * Het adresdeel van een naam: kleine letters, zonder accenten, met streepjes tussen de woorden
 * ('Biologie van organismen' wordt 'biologie-van-organismen'). Leeg voor een naam zonder letters of cijfers.
 */
export function slugVan(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DOELCODE = /^([A-Z]{2})\.(\d{3,4})$/;

/** Het vak bij een code als 'WT.086'; undefined als het geen code van een leerplandoel is. */
export function vakVanDoelcode(code: string): GoVak | undefined {
  if (typeof code !== 'string') return undefined;
  const m = DOELCODE.exec(code);
  return m && isGoVak(m[1]) ? m[1] : undefined;
}

/**
 * Het adres van een leerplandoel als de code bestaat in de index (vak bekend en nummer binnen het aantal), anders
 * undefined. Zonder index: geen functie, dus geen links.
 */
export function maakDoelLink(index: GoIndex | undefined): ((code: string) => string | undefined) | undefined {
  if (!index) return undefined;
  const aantal = new Map(index.leerplan.map((l) => [l.vak as string, l.aantal]));
  return (code) => {
    const vak = vakVanDoelcode(code);
    const max = vak ? aantal.get(vak) : undefined;
    const nr = Number(code.slice(3));
    return vak && max !== undefined && nr >= 1 && nr <= max ? basisPad({ s: 'leerplandoel', code }) : undefined;
  };
}

const DOELCODE_DRIE = /^[A-Z]{2}\.\d{3}$/;

/**
 * Bestaat deze code van een leerplandoel in het leerplan? Waar als ze de vorm 'WT.086' heeft, het vak in de index staat
 * en het nummer tussen 1 en het aantal ligt (de codes lopen zonder gaten van 001 tot N).
 */
export function goDoelBestaat(index: GoIndex, code: string): boolean {
  if (typeof code !== 'string' || !DOELCODE_DRIE.test(code)) return false;
  const rij = index.leerplan.find((l) => l.vak === code.slice(0, 2));
  const nr = Number(code.slice(3));
  return rij !== undefined && nr >= 1 && nr <= rij.aantal;
}

/**
 * 'Zonder minimumdoel' (rechtzetting 2 van de rechter): noch de doelzin, noch een MIA- of voorbeeldrij van het doel
 * draagt een code. Een doel met alleen een kapotte code is 'kapot', niet 'zonder minimumdoel'. valideer.ts zet deze
 * functie door voor de import en de uitrolpoort; de schermen halen ze hier, zodat de validator niet in de app komt.
 */
export function isZonderMinimumdoel(doel: GoLeerplandoel): boolean {
  return Object.keys(doel.minimumdoelen.bron).length === 0 && doel.inhoud.every((i) => !('koppeling' in i) || i.koppeling === undefined);
}

// ── Lesplannen ───────────────────────────────────────────────────────────────

/** Oplopend op code: 'LP0014a' staat voor 'LP0014b'. De volgorde van het GO! zelf is niet gegeven. */
function opCode(a: { code: string }, b: { code: string }): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** De lesplannen, oplopend op code; met een leeftijd en/of een vak alleen de lesplannen daarvan. */
export function lesplannenFilter(index: GoIndex, filter: { leeftijd?: GoLeeftijd; vak?: GoVak } = {}): GoIndexLesplan[] {
  return index.lesplannen
    .filter((l) => (filter.leeftijd === undefined || l.leeftijd === filter.leeftijd) && (filter.vak === undefined || l.vak === filter.vak))
    .sort(opCode);
}

/** De lesplannen van één leeftijdsgroep, oplopend op code. */
export function lesplannenPerLeeftijd(index: GoIndex, leeftijd: GoLeeftijd): GoIndexLesplan[] {
  return lesplannenFilter(index, { leeftijd });
}

/** Hoeveel lesplannen er per leeftijdsgroep zijn; alleen de groepen met minstens één lesplan, in volgorde. */
export function aantalLesplannenPerLeeftijd(index: GoIndex): { leeftijd: GoLeeftijd; aantal: number }[] {
  const tel = new Map<GoLeeftijd, number>();
  for (const l of index.lesplannen) tel.set(l.leeftijd, (tel.get(l.leeftijd) ?? 0) + 1);
  return GO_LEEFTIJDEN.filter((l) => tel.has(l)).map((leeftijd) => ({ leeftijd, aantal: tel.get(leeftijd) ?? 0 }));
}

/** Het lesplan met deze code uit de index. */
export function lesplanVanCode(index: GoIndex, code: string): GoIndexLesplan | undefined {
  return index.lesplannen.find((l) => l.code === code);
}

// ── Lessenlijnen ─────────────────────────────────────────────────────────────

export interface Lessenreeks {
  naam: string;
  /** Oplopend op code. */
  lesplannen: GoIndexLesplan[];
}

/** Een lessenlijn komt alleen uit de lesplannen, niet uit de Excel. */
export interface Lessenlijn {
  vak: GoVak;
  naam: string;
  /** Uniek binnen het vak: bij twee lijnen met dezelfde slug krijgt de tweede '-2', de derde '-3'. */
  slug: string;
  /** In de volgorde van het eerste lesplan (op code). */
  reeksen: Lessenreeks[];
  /** Alle lesplannen van de lijn, oplopend op code. */
  lesplannen: GoIndexLesplan[];
  /** De leeftijdsgroepen met minstens één lesplan, in volgorde. */
  leeftijden: GoLeeftijd[];
}

/**
 * De lessenlijnen uit de lesplannen, per vak (in de volgorde van de vakken) en daarbinnen in de volgorde van hun
 * eerste lesplan. Met een filter alleen de lijnen met minstens één lesplan van die leeftijd en/of dat vak; de reeksen
 * en lesplannen in zo'n lijn zijn dan ook gefilterd. De slug blijft dezelfde met of zonder filter.
 */
export function lessenlijnen(index: GoIndex, filter: { leeftijd?: GoLeeftijd; vak?: GoVak } = {}): Lessenlijn[] {
  const alles = lesplannenFilter(index);
  const perVak = new Map<GoVak, Map<string, GoIndexLesplan[]>>();
  for (const l of alles) {
    const lijnen = perVak.get(l.vak) ?? new Map<string, GoIndexLesplan[]>();
    lijnen.set(l.lessenlijn, [...(lijnen.get(l.lessenlijn) ?? []), l]);
    perVak.set(l.vak, lijnen);
  }
  const uit: Lessenlijn[] = [];
  for (const vak of GO_VAK_CODES) {
    const lijnen = perVak.get(vak);
    if (!lijnen) continue;
    const gebruikt = new Set<string>();
    for (const [naam, plannen] of lijnen) {
      const basis = slugVan(naam) || 'lessenlijn';
      let slug = basis;
      for (let n = 2; gebruikt.has(slug); n++) slug = `${basis}-${n}`;
      gebruikt.add(slug);
      const gekozen = plannen.filter((l) => filter.leeftijd === undefined || l.leeftijd === filter.leeftijd);
      if (gekozen.length === 0 || (filter.vak !== undefined && filter.vak !== vak)) continue;
      const reeksen = new Map<string, GoIndexLesplan[]>();
      for (const l of gekozen) reeksen.set(l.lessenreeks, [...(reeksen.get(l.lessenreeks) ?? []), l]);
      const leeftijden = new Set(gekozen.map((l) => l.leeftijd));
      uit.push({
        vak,
        naam,
        slug,
        reeksen: [...reeksen].map(([reeksNaam, lesplannen]) => ({ naam: reeksNaam, lesplannen })),
        lesplannen: gekozen,
        leeftijden: GO_LEEFTIJDEN.filter((l) => leeftijden.has(l)),
      });
    }
  }
  return uit;
}

/** De lessenlijn bij een adresdeel; undefined als die niet bestaat ('Deze lessenlijn vonden we niet'). */
export function vindLessenlijn(index: GoIndex, vak: GoVak, slug: string): Lessenlijn | undefined {
  return lessenlijnen(index, { vak }).find((l) => l.slug === slug);
}

export interface LessenlijnTabel {
  /** De leeftijdsgroepen met lesplannen, in volgorde. */
  kolommen: GoLeeftijd[];
  /** Eén rij per lessenreeks; `cellen[i]` hoort bij `kolommen[i]` en kan leeg zijn. */
  rijen: { reeks: string; cellen: GoIndexLesplan[][] }[];
}

/** De tabel van een lessenlijn: de rijen zijn de lessenreeksen, de kolommen de leeftijdsgroepen, de cellen de lesplannen. */
export function lessenlijnTabel(lijn: Lessenlijn): LessenlijnTabel {
  const kolommen = [...lijn.leeftijden].sort(vergelijkLeeftijden);
  return {
    kolommen,
    rijen: lijn.reeksen.map((r) => ({
      reeks: r.naam,
      cellen: kolommen.map((k) => r.lesplannen.filter((l) => l.leeftijd === k)),
    })),
  };
}

// ── Leerplan: rubrieken en doelen ────────────────────────────────────────────

/** Het leerplandoel met deze code in het bestand van zijn vak. */
export function vindLeerplandoel(leerplan: GoLeerplanBestand, code: string): GoLeerplandoel | undefined {
  return leerplan.doelen.find((d) => d.code === code);
}

/**
 * Het rubriekpad van een rubriek: onderwerp › subthema › rubriek › subrubriek, van boven naar onder, eindigend met de
 * rubriek zelf. Een onbekend id geeft een leeg pad; een ouder die niet bestaat of een kring breekt het pad af.
 */
export function rubriekPad(leerplan: GoLeerplanBestand, rubriekId: string): GoRubriek[] {
  const perId = new Map(leerplan.rubrieken.map((r) => [r.id, r] as const));
  const pad: GoRubriek[] = [];
  const gezien = new Set<string>();
  let id: string | undefined = rubriekId;
  while (id !== undefined && !gezien.has(id)) {
    const r = perId.get(id);
    if (!r) break;
    gezien.add(id);
    pad.unshift(r);
    id = r.ouder;
  }
  return pad;
}

/** Het rubriekpad boven een leerplandoel. */
export function rubriekPadVanDoel(leerplan: GoLeerplanBestand, doel: GoLeerplandoel): GoRubriek[] {
  return rubriekPad(leerplan, doel.rubriek);
}

// ── Omgekeerd: de leerplandoelen bij een minimumdoel ─────────────────────────

/**
 * De leerplandoelen van het GO! bij het minimumdoel met dit vaste nummer (alleen cijfers). Een nummer dat niet in het
 * bestand staat, geeft een lege lijst. Opzoeken gebeurt in een Map: een sleutel als '__proto__' vindt nooit iets.
 */
export function leerplandoelenBijMinimumdoel(bij: GoBijMinimumdoelBestand, nummer: string): GoBijDoel[] {
  if (typeof nummer !== 'string' || !/^\d+$/.test(nummer)) return [];
  const perNummer = new Map(Object.entries(bij.doelen));
  return perNummer.get(nummer) ?? [];
}

export interface BijDoelGroep {
  vak: GoVak;
  /** Oplopend op code, elke code één keer. */
  doelen: GoBijDoel[];
  /** Dezelfde doelen per leeftijdsgroep; een doel met meer groepen staat bij elke groep. Alleen groepen met doelen. */
  perLeeftijd: { leeftijd: GoLeeftijd; doelen: GoBijDoel[] }[];
}

/** Groepeert de leerplandoelen bij een minimumdoel per vakdiscipline (in de volgorde van de vakken) en leeftijdsgroep. */
export function groepeerBijDoelen(doelen: readonly GoBijDoel[]): BijDoelGroep[] {
  const perVak = new Map<GoVak, GoBijDoel[]>();
  for (const d of doelen) {
    const vak = vakVanDoelcode(d.code);
    if (vak) perVak.set(vak, [...(perVak.get(vak) ?? []), d]);
  }
  const uit: BijDoelGroep[] = [];
  for (const vak of GO_VAK_CODES) {
    const lijst = perVak.get(vak);
    if (!lijst) continue;
    const gesorteerd = [...lijst].sort(opCode);
    uit.push({
      vak,
      doelen: gesorteerd,
      perLeeftijd: GO_LEEFTIJDEN.map((leeftijd) => ({ leeftijd, doelen: gesorteerd.filter((d) => d.leeftijden.includes(leeftijd)) })).filter(
        (g) => g.doelen.length > 0,
      ),
    });
  }
  return uit;
}

// ── Ik-doelen ────────────────────────────────────────────────────────────────

export interface IkDoelenVanLesplan {
  lesplan: string;
  titel: string;
  leeftijd: GoLeeftijd;
  diploma: string;
  diplomaLeeftijd: GoLeeftijd;
  /** De ik-zinnen van dit doel in dat diploma, letterlijk. */
  zinnen: string[];
}

/**
 * De ik-doelen van een leerplandoel in de gegeven lesplannen: per diploma de zinnen die bij de doelcode staan (deel 4,
 * rij Lesdoel). Lesplannen zonder zulke zinnen komen niet voor. Oplopend op lesplancode, binnen een lesplan in de
 * volgorde van de diploma's.
 */
export function ikDoelenVanDoel(lesplannen: readonly GoLesplanBestand[], code: string): IkDoelenVanLesplan[] {
  const uit: IkDoelenVanLesplan[] = [];
  for (const lp of [...lesplannen].sort(opCode)) {
    for (const dip of lp.afgeleid.diplomas) {
      const zinnen = dip.ikDoelen.filter((i) => i.code === code).flatMap((i) => i.zinnen);
      if (zinnen.length > 0) uit.push({ lesplan: lp.code, titel: lp.titel, leeftijd: lp.leeftijd, diploma: dip.naam, diplomaLeeftijd: dip.leeftijd, zinnen });
    }
  }
  return uit;
}

/** De lesplannen uit de index waarin dit leerplandoel in deel 2 staat, oplopend op code. */
export function lesplannenMetDoel(index: GoIndex, code: string): GoIndexLesplan[] {
  return index.lesplannen.filter((l) => l.doelen.includes(code)).sort(opCode);
}
