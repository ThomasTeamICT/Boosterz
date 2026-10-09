// ── Hoe het richtingenscherm dingen laat zien ───────────────────────────────
//
// Pure tekst- en keuzelogica van /cursussen/richtingen (docs/STUDIERICHTINGEN.md § 14.3), los van React zodat ze te testen is:
// - `variantLabels`: de namen in de keuzelijst "Variant", altijd verschillend;
// - `richtingLinkTeksten`: de tekst van de links naar een opvolger of naar dezelfde richting in een andere graad;
// - `cursusBijRichting`: hoe een cursus bij een richting hoort, en of "Haal weg uit deze richting" dan echt werkt;
// - `metExtraLeerplan`: een leerplan aan een lijst toevoegen, zonder dubbels.

import { doelgroepVoorLeerplan, graadTekst, jaarTekst, sanitizeDoelgroep, zelfdeRichting, type Doelgroep } from './doelgroep';
import { FINALITEIT_LABEL, richtingInfo, type RichtingInfo } from './richtingKader';
import { isAfgebouwd, type MatrixBestand, type StudierichtingGroep, type Structuuronderdeel } from './studierichtingen';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** "a", "a en b", "a, b en c". */
function somLijst(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? '') : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** De rangtelwoorden zonder het woord erna: 1 wordt "1ste", 3 wordt "3de". Leeg voor iets dat geen positief geheel getal is. */
function rangtal(n: number): string {
  return jaarTekst(n).replace(/ jaar$/, '');
}

// ── De keuzelijst "Variant" ─────────────────────────────────────────────────

/** "Economie en organisatie": het studiedomein leesbaar geschreven ("ECONOMIE EN ORGANISATIE" wordt gewone tekst, "STEM" blijft). */
export function domeinTekst(tekst: string): string {
  const t = tekst.trim().replace(/\s+/g, ' ');
  if (t === '' || t !== t.toUpperCase() || /^[A-Z]{2,4}$/.test(t)) return t;
  const klein = t.toLowerCase();
  return klein.charAt(0).toUpperCase() + klein.slice(1);
}

/** "september 2023" uit "2023-09-01"; leeg als de datum niet te lezen is. */
function maandJaar(datum: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(typeof datum === 'string' ? datum : '');
  const maand = m ? Number(m[2]) : 0;
  return m && maand >= 1 && maand <= 12 ? `${MAANDEN[maand - 1]} ${m[1]}` : '';
}

/**
 * De leerjaren van een onderdeel: "1ste leerjaar", "1ste en 2de leerjaar". Met `vandaag` tellen leerjaren die afgebouwd zijn niet
 * mee (tenzij ze alle afgebouwd zijn). Leeg zonder leerjaren.
 */
function leerjarenTekst(o: Structuuronderdeel, vandaag: string | undefined): string {
  const alle = (Array.isArray(o.leerjaren) ? o.leerjaren : []).map((lj) => ({ lj, code: typeof lj.code === 'string' ? lj.code.trim() : '' }));
  const lopend = vandaag !== undefined ? alle.filter(({ lj }) => !isAfgebouwd(lj, vandaag)) : alle;
  const lijst = lopend.length > 0 ? lopend : alle;
  const nummers = [...new Set(lijst.filter(({ code }) => /^\d+$/.test(code)).map(({ code }) => Number(code)).filter((n) => rangtal(n) !== ''))]
    .sort((a, b) => a - b);
  const overige = [...new Set(lijst.filter(({ code }) => !/^\d+$/.test(code)).map(({ lj, code }) => (lj.omschrijving ?? code).trim()).filter(Boolean))];
  return [nummers.length > 0 ? `${somLijst(nummers.map(rangtal))} leerjaar` : '', ...overige].filter(Boolean).join(' · ');
}

/** De kenmerken waarmee we twee onderdelen met dezelfde naam uit elkaar houden, van voorkeur naar noodoplossing. */
const ONDERSCHEIDEN: readonly ((o: Structuuronderdeel, vandaag: string | undefined) => string)[] = [
  (o, vandaag) => leerjarenTekst(o, vandaag),
  (o) => (typeof o.onderwijsvorm === 'string' ? o.onderwijsvorm.trim().toLowerCase() : ''),
  (o) => (maandJaar(o.begindatum) ? `vanaf ${maandJaar(o.begindatum)}` : ''),
];

/**
 * Bij een groep onderdelen met dezelfde naam: de tekst die ze uit elkaar houdt, per onderdeel (leeg als het niets te zeggen heeft).
 * Eerst één kenmerk dat ze allemaal uit elkaar houdt; lukt dat niet, dan kenmerken bijelkaar, telkens het kenmerk dat er de meeste
 * uit elkaar haalt. Blijven er dan nog gelijke, dan geeft de aanroeper ze een volgnummer.
 */
function onderscheidendeKenmerken(leden: readonly Structuuronderdeel[], vandaag: string | undefined): string[] {
  const waarden = ONDERSCHEIDEN.map((f) => leden.map((o) => f(o, vandaag)));
  const enkel = waarden.findIndex((w) => new Set(w).size === leden.length);
  if (enkel >= 0) return waarden[enkel];

  const verschillende = (kolommen: readonly (readonly string[])[]) => new Set(leden.map((_, i) => kolommen.map((k) => k[i]).join('\u0000'))).size;
  const gekozen: number[] = [];
  let uniek = 1;
  while (uniek < leden.length) {
    let beste = -1;
    let besteAantal = uniek;
    waarden.forEach((_, k) => {
      if (gekozen.includes(k)) return;
      const aantal = verschillende([...gekozen, k].map((j) => waarden[j]));
      if (aantal > besteAantal) {
        beste = k;
        besteAantal = aantal;
      }
    });
    if (beste < 0) break;
    gekozen.push(beste);
    uniek = besteAantal;
  }
  return leden.map((_, i) => gekozen.map((j) => waarden[j][i]).filter(Boolean).join(' · '));
}

/** De plaatsen (in `labels`) van labels die vaker voorkomen, per label. */
function dubbele(labels: readonly string[]): number[][] {
  const perLabel = new Map<string, number[]>();
  labels.forEach((label, i) => perLabel.set(label, [...(perLabel.get(label) ?? []), i]));
  return [...perLabel.values()].filter((plaatsen) => plaatsen.length > 1);
}

/**
 * De namen in de keuzelijst "Variant", elk verschillend:
 * - de titel van het onderdeel, met het studiedomein erbij als twee onderdelen dezelfde titel hebben;
 * - zijn ze dan nog gelijk, dan een kenmerk uit de matrix dat ze uit elkaar houdt: de leerjaren ("1ste leerjaar", "1ste en
 *   2de leerjaar"), anders de onderwijsvorm ("bso"), anders de startdatum ("vanaf september 2023");
 * - blijven ze dan nog gelijk, dan een volgnummer: "(2 van 2)".
 * `vandaag` (JJJJ-MM-DD) is optioneel: leerjaren die al afgebouwd zijn, tellen dan niet mee in de tekst.
 */
export function variantLabels(onderdelen: readonly Structuuronderdeel[], vandaag?: string): { nummer: number; label: string }[] {
  const tellen = new Map<string, number>();
  for (const o of onderdelen) tellen.set(o.titel, (tellen.get(o.titel) ?? 0) + 1);
  const labels = onderdelen.map((o) => {
    const domein = o.studiedomein?.omschrijving ? domeinTekst(o.studiedomein.omschrijving) : '';
    return (tellen.get(o.titel) ?? 0) > 1 && domein ? `${o.titel} · ${domein}` : o.titel;
  });

  for (const plaatsen of dubbele(labels)) {
    const kenmerken = onderscheidendeKenmerken(plaatsen.map((i) => onderdelen[i]), vandaag);
    plaatsen.forEach((i, k) => {
      if (kenmerken[k]) labels[i] = `${labels[i]} · ${kenmerken[k]}`;
    });
  }
  // Wat nog gelijk is, krijgt een volgnummer. Een tweede en derde ronde vangen het onwaarschijnlijke geval op dat zo'n label
  // toevallig gelijk is aan het label van een ander onderdeel.
  for (let ronde = 0; ronde < 3; ronde++) {
    const nog = dubbele(labels);
    if (nog.length === 0) break;
    for (const plaatsen of nog) plaatsen.forEach((i, k) => { labels[i] = `${labels[i]} (${k + 1} van ${plaatsen.length})`; });
  }
  return onderdelen.map((o, i) => ({ nummer: o.nummer, label: labels[i] }));
}

// ── Links naar een andere richting ──────────────────────────────────────────

/** "3de en 4de jaar", "7de jaar". Leeg zonder jaren. */
function jarenTekst(jaren: readonly number[]): string {
  const delen = jaren.map(rangtal).filter(Boolean);
  return delen.length === 0 ? '' : `${somLijst(delen)} jaar`;
}

/** De graad voor een leerkracht: "3de graad", of "Buitengewoon onderwijs" bij een richting zonder graad. */
function graadDeel(info: RichtingInfo): string {
  return info.graad !== undefined ? graadTekst(info.graad) : info.soort === 'buso' ? 'Buitengewoon onderwijs' : '';
}

/** Voegt `extra` toe aan de teksten die nog gelijk zijn, maar alleen als dat ze ook echt uit elkaar haalt. */
function verfijn(teksten: string[], extraVan: (i: number) => string): void {
  for (const plaatsen of dubbele(teksten)) {
    const extra = plaatsen.map(extraVan);
    if (new Set(extra).size < 2) continue;
    plaatsen.forEach((i, k) => {
      if (extra[k]) teksten[i] = `${teksten[i]} · ${extra[k]}`;
    });
  }
}

/**
 * De tekst van een link naar een andere richting, met de kenmerken erbij zodat twee richtingen met dezelfde titel uit elkaar te
 * houden zijn: "Animator · 3de graad · 7de jaar" (in de 1ste graad staat het jaar niet, de titel noemt het leerjaar al).
 * Zijn er dan nog gelijke teksten in dezelfde lijst, dan komen de finaliteit en daarna de onderwijsvorm erbij, maar alleen
 * als dat ze ook echt uit elkaar haalt. Met `zonderGraad` staat de graad er niet bij (als de zin ze al noemt).
 * Geeft per groepnummer de tekst; een groep die niet in de matrix staat, krijgt gewoon haar titel.
 */
export function richtingLinkTeksten(
  matrix: MatrixBestand,
  groepen: readonly StudierichtingGroep[],
  vandaag: string,
  opties?: { zonderGraad?: boolean },
): Map<string, string> {
  const infos: (RichtingInfo | undefined)[] = groepen.map((g) => richtingInfo(matrix, g.nummer, vandaag));
  const teksten = groepen.map((g, i) => {
    const info = infos[i];
    if (!info) return g.titel;
    return [g.titel, opties?.zonderGraad ? '' : graadDeel(info), info.graad === 1 ? '' : jarenTekst(info.jaren)].filter(Boolean).join(' · ');
  });
  verfijn(teksten, (i) => {
    const finaliteit = groepen[i].finaliteit;
    return finaliteit ? (FINALITEIT_LABEL[finaliteit] ?? finaliteit) : '';
  });
  verfijn(teksten, (i) => infos[i]?.vormen.join(', ') ?? '');
  return new Map(groepen.map((g, i) => [g.nummer, teksten[i]]));
}

// ── Cursussen bij een richting ──────────────────────────────────────────────

export interface CursusBijRichting {
  /** De cursus heeft zelf een (geldige) doelgroep. */
  eigen: boolean;
  /** Haar leerplan hoort bij dezelfde richting (zelfde groep en soort onderwijs): de cursus hoort er ook via dat leerplan. */
  viaLeerplan: boolean;
  /** "Haal weg uit deze richting" werkt echt: de cursus heeft een eigen doelgroep en haar leerplan houdt haar niet bij de richting. */
  kanWeghalen: boolean;
}

/**
 * Hoe een cursus bij een richting hoort. `richting` is de doelgroep waarmee de cursus in de lijst van de richting staat (haar
 * eigen, of anders die van haar leerplan). Een cursus met een eigen doelgroep bij de richting én een leerplan van diezelfde
 * richting blijft er na het wegnemen van haar doelgroep gewoon bij horen, via het leerplan: dan heeft een knop "Haal weg"
 * geen effect. Daar zegt het scherm in plaats daarvan via welk leerplan ze bij de richting hoort.
 */
export function cursusBijRichting(
  course: { doelgroep?: unknown },
  leerplan: { doelgroep?: unknown } | undefined,
  richting: Doelgroep | undefined,
): CursusBijRichting {
  const eigen = sanitizeDoelgroep(course.doelgroep) !== undefined;
  const viaLeerplan = leerplan !== undefined && zelfdeRichting(doelgroepVoorLeerplan(leerplan.doelgroep), richting);
  return { eigen, viaLeerplan, kanWeghalen: eigen && !viaLeerplan };
}

// ── Leerplannen in een lijst ────────────────────────────────────────────────

/**
 * Voegt een leerplan vooraan toe aan een lijst rijen, tenzij er al een rij met dezelfde id in staat (dan blijft de lijst zoals ze
 * is). Zonder leerplan geeft ze de lijst terug. Geeft altijd een nieuwe lijst.
 */
export function metExtraLeerplan<R extends { curriculum: { id: string } }>(
  rijen: readonly R[],
  extra: R['curriculum'] | undefined,
  nieuweRij: (leerplan: R['curriculum']) => R,
): R[] {
  if (extra === undefined || rijen.some((r) => r.curriculum.id === extra.id)) return [...rijen];
  return [nieuweRij(extra), ...rijen];
}
