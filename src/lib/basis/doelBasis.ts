// De doelen van het basisonderwijs als gegevens voor de schermen van het deel #/basis (docs/basisonderwijs/INGANG.md):
// een doel uit een setbestand, de rubrieken van een vak op één moment, de leerlijn van een vak over de drie momenten
// en de sets die bij een vak en moment horen.
//
// Zuiver: geen React, geen opslag en nergens de klok. Alleen nieuwe, niet-lege sets van het (buitengewoon)
// basisonderwijs tellen mee, en alleen de index of een al geladen setbestand wordt gelezen. De tekst van een doel
// blijft letterlijk: dit bestand kort niets in en maakt geen koppeling tussen doelen van verschillende momenten.

import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../minimumdoelen';
import { rubriekenVan } from '../minimumdoelenLeerplan';
import type { Eindmoment, KalenderVak, SoortBasis } from './kalender';
import { basisSet, doelInfo, type BasisSet, type SoortDoelen } from './moment';

/** De drie eindmomenten, van vroeg naar laat. */
export const EINDMOMENTEN: readonly Eindmoment[] = ['K3', 'L4', 'L6'];

/** De volgorde waarin soorten doelen op een scherm staan. */
export const SOORT_VOLGORDE: readonly SoortDoelen[] = ['populatie', 'individueel', 'nastreven', 'ontwikkelingsdoelen', 'eindtermen'];

// ─── Een doel ───────────────────────────────────────────────────────────────

export interface DoelBasis {
  setId: string;
  id: string;
  code: string;
  soort: SoortBasis;
  eind: Eindmoment;
  vak: number;
  /** De eerste twee getallen van de code, bv. '3.5'. */
  onderwerpNr: string;
  onderwerp: string;
  subthema?: string;
  soortDoel?: SoortDoelen;
  /** De doelzin zoals de bron ze geeft (html). */
  doelzinHtml: string;
  /** De uitbreiding op de doelzin (de opsomming of de toelichting), html. */
  uitbreidingHtml?: string;
  /** De richtinggevende woordenschat, html. */
  woordenschatHtml?: string;
}

function niet(tekst: unknown): tekst is string {
  return typeof tekst === 'string' && tekst.trim() !== '';
}

/**
 * De doelen van een nieuwe set met eindmoment; anders []. Een doel zonder nummer of code valt weg.
 *
 * De app laadt een set met de uitbreiding achter de doelzin (`laadSet` zet haar achter een regeleinde). Eindigt de
 * tekst daarop, dan splitst deze functie ze weer: het achtervoegsel is de uitbreiding en de rest de doelzin. Staat de
 * uitbreiding nog niet in de tekst (een bestand zoals de bron het geeft), dan komt ze uit `extra` en blijft de tekst
 * de doelzin. In alle andere gevallen is de hele tekst de doelzin.
 */
export function doelenVanSet(bestand: MinimumdoelenSetBestand, info: BasisSet): DoelBasis[] {
  if (info.generatie !== 'nieuw' || info.eindmoment === undefined) return [];
  const uit: DoelBasis[] = [];
  for (const doel of bestand.doelen) {
    if (!niet(doel.id) || !niet(doel.code) || typeof doel.tekst !== 'string') continue;
    const code = doel.code.trim();
    const di = doelInfo({ code, type: doel.type }, info);
    const vak = di.vak ?? info.vak?.nr;
    if (vak === undefined) continue;
    const onderwerpNr = code.split('.').slice(0, 2).join('.');
    const rubrieken = rubriekenVan(doel);

    const extra = doel.extra?.uitbreiding_op_doelzin;
    const u = typeof extra === 'string' ? extra.trim() : '';
    let doelzinHtml = doel.tekst;
    let uitbreidingHtml: string | undefined;
    if (u !== '') {
      if (doel.tekst.endsWith(`\n${u}`)) {
        doelzinHtml = doel.tekst.slice(0, doel.tekst.length - u.length - 1);
        uitbreidingHtml = u;
      } else if (!doel.tekst.includes(u)) {
        uitbreidingHtml = u;
      }
    }
    const ws = doel.extra?.woordenschat_richtinggevend;

    const d: DoelBasis = {
      setId: info.id,
      id: doel.id,
      code,
      soort: info.soort,
      eind: info.eindmoment,
      vak,
      onderwerpNr,
      onderwerp: rubrieken[0] ?? `Onderwerp ${onderwerpNr}`,
      doelzinHtml,
    };
    if (rubrieken[1] !== undefined) d.subthema = rubrieken[1];
    if (di.soortDoel !== undefined) d.soortDoel = di.soortDoel;
    if (uitbreidingHtml !== undefined) d.uitbreidingHtml = uitbreidingHtml;
    if (niet(ws)) d.woordenschatHtml = ws.trim();
    uit.push(d);
  }
  return uit;
}

/** Vergelijkt codes numeriek per deel: 2.3.28 komt na 2.3.4, en 10.1.1 na 9.3.5. Een korter stuk komt eerst. */
export function codeVergelijk(a: string, b: string): number {
  const deel = (t: string): number[] => t.split('.').map((x) => (x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : Infinity));
  const x = deel(a);
  const y = deel(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

/** Voegt lijsten doelen samen en sorteert stabiel op code (de twee kleutersets van Nederlands en wiskunde vloeien zo in elkaar). */
export function samenvoegen(lijsten: readonly (readonly DoelBasis[])[]): DoelBasis[] {
  return lijsten.flat().sort((a, b) => codeVergelijk(a.code, b.code));
}

// ─── Rubrieken van één vak op één moment ────────────────────────────────────

export interface Onderwerp {
  nr: string;
  naam: string;
  aantal: number;
  subthemas: { naam?: string; doelen: DoelBasis[] }[];
}

/**
 * Groepeert doelen per onderwerp en per subthema, in de volgorde waarin ze voorkomen. Een groep zonder subthema heeft
 * geen naam, zodat het scherm er geen kopje voor maakt.
 */
export function rubrieken(doelen: readonly DoelBasis[]): Onderwerp[] {
  const uit: Onderwerp[] = [];
  for (const d of doelen) {
    let o = uit.find((x) => x.nr === d.onderwerpNr);
    if (!o) {
      o = { nr: d.onderwerpNr, naam: d.onderwerp, aantal: 0, subthemas: [] };
      uit.push(o);
    }
    o.aantal++;
    let g = o.subthemas.find((x) => x.naam === d.subthema);
    if (!g) {
      g = d.subthema === undefined ? { doelen: [] } : { naam: d.subthema, doelen: [] };
      o.subthemas.push(g);
    }
    g.doelen.push(d);
  }
  return uit;
}

// ─── De leerlijn van een vak ────────────────────────────────────────────────

export interface LeerlijnOnderwerp {
  nr: string;
  naam: string;
  aantal: Record<Eindmoment, number>;
  rijen: { subthema?: string; cellen: Record<Eindmoment, DoelBasis[]> }[];
}

/**
 * Voegt volgordes samen tot één volgorde waarin elke lijst haar eigen volgorde houdt (zolang de lijsten elkaar niet
 * tegenspreken). Wie eerder in de lijsten voorkomt, staat bij gelijkspel vooraan. Spreken lijsten elkaar tegen, dan
 * gaat de eerst geziene volgorde voor.
 */
export function voegVolgordeSamen(lijsten: readonly (readonly string[])[]): string[] {
  const eerstGezien: string[] = [];
  const voorgangers = new Map<string, Set<string>>();
  for (const lijst of lijsten) {
    let vorige: string | undefined;
    for (const x of lijst) {
      if (!voorgangers.has(x)) {
        voorgangers.set(x, new Set());
        eerstGezien.push(x);
      }
      if (vorige !== undefined && vorige !== x) voorgangers.get(x)?.add(vorige);
      vorige = x;
    }
  }
  const uit: string[] = [];
  const klaar = new Set<string>();
  while (uit.length < eerstGezien.length) {
    const kies =
      eerstGezien.find((x) => !klaar.has(x) && [...(voorgangers.get(x) ?? [])].every((v) => klaar.has(v))) ??
      // een kring in de lijsten: de eerst geziene die nog ontbreekt
      eerstGezien.find((x) => !klaar.has(x));
    if (kies === undefined) break;
    klaar.add(kies);
    uit.push(kies);
  }
  return uit;
}

const LEEG_SUBTHEMA = '\u0000zonder-subthema';
const leegCellen = (): Record<Eindmoment, DoelBasis[]> => ({ K3: [], L4: [], L6: [] });

/**
 * De leerlijn van een vak: per onderwerp (op nummer) rijen per subthema met drie cellen, één per eindmoment. De
 * subthema's staan in de samengevoegde volgorde van het einde van de kleuterklas, het 4de en het 6de leerjaar; de
 * doelen in een cel staan op code. Er zit geen verband tussen cellen in: de bron zegt niet welk doel uit welk ander
 * volgt. Een lege cel blijft een lege lijst.
 */
export function leerlijnVanVak(doelen: readonly DoelBasis[]): LeerlijnOnderwerp[] {
  const perOnderwerp = new Map<string, DoelBasis[]>();
  for (const d of [...doelen].sort((a, b) => codeVergelijk(a.code, b.code))) {
    const lijst = perOnderwerp.get(d.onderwerpNr);
    if (lijst) lijst.push(d);
    else perOnderwerp.set(d.onderwerpNr, [d]);
  }
  const uit: LeerlijnOnderwerp[] = [];
  for (const [nr, lijst] of [...perOnderwerp].sort((a, b) => codeVergelijk(a[0], b[0]))) {
    const volgordes = EINDMOMENTEN.map((m) => [...new Set(lijst.filter((d) => d.eind === m).map((d) => d.subthema ?? LEEG_SUBTHEMA))]);
    const rijen = voegVolgordeSamen(volgordes).map((s) => ({
      ...(s === LEEG_SUBTHEMA ? {} : { subthema: s }),
      cellen: leegCellen(),
    }));
    const aantal: Record<Eindmoment, number> = { K3: 0, L4: 0, L6: 0 };
    for (const d of lijst) {
      rijen.find((r) => (r.subthema ?? LEEG_SUBTHEMA) === (d.subthema ?? LEEG_SUBTHEMA))?.cellen[d.eind].push(d);
      aantal[d.eind]++;
    }
    uit.push({ nr, naam: lijst[0].onderwerp, aantal, rijen });
  }
  return uit;
}

/**
 * De doelen in dezelfde rubriek als een doel, op elk moment: hetzelfde vak, onderwerp en subthema. Mist dat subthema
 * op een moment waarop het onderwerp wel doelen heeft (of heeft het doel er geen), dan geldt voor alle momenten het
 * hele onderwerp (niveau 'onderwerp'), zodat de drie lijsten hetzelfde soort rubriek zijn. Het doel zelf zit in de
 * lijst van zijn eigen moment.
 */
export function zelfdeRubriek(
  doel: DoelBasis,
  vakDoelen: readonly DoelBasis[],
): { niveau: 'subthema' | 'onderwerp'; per: Record<Eindmoment, DoelBasis[]> } {
  const inOnderwerp = vakDoelen
    .filter((d) => d.vak === doel.vak && d.onderwerpNr === doel.onderwerpNr)
    .sort((a, b) => codeVergelijk(a.code, b.code));
  const verdeel = (filter: (d: DoelBasis) => boolean) => {
    const per = leegCellen();
    for (const d of inOnderwerp) if (filter(d)) per[d.eind].push(d);
    return per;
  };
  if (doel.subthema !== undefined) {
    const subthema = doel.subthema;
    const overal = EINDMOMENTEN.every(
      (m) => !inOnderwerp.some((d) => d.eind === m) || inOnderwerp.some((d) => d.eind === m && d.subthema === subthema),
    );
    if (overal) return { niveau: 'subthema', per: verdeel((d) => d.subthema === subthema) };
  }
  return { niveau: 'onderwerp', per: verdeel(() => true) };
}

// ─── Welke sets bij een vak horen ───────────────────────────────────────────

/** Het aantal doelen per soort, in vaste volgorde (populatie, individueel, na te streven, dan de oude soorten). */
export function telPerSoort(sets: readonly { soortDoelen?: SoortDoelen; aantal: number }[]): { soort: SoortDoelen; aantal: number }[] {
  const uit: { soort: SoortDoelen; aantal: number }[] = [];
  for (const soort of SOORT_VOLGORDE) {
    const deze = sets.filter((s) => s.soortDoelen === soort);
    if (deze.length > 0) uit.push({ soort, aantal: deze.reduce((som, s) => som + s.aantal, 0) });
  }
  return uit;
}

interface NieuweSet {
  set: MinimumdoelenIndexSet;
  info: BasisSet & { vak: KalenderVak; eindmoment: Eindmoment };
}

function nieuweSets(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis): NieuweSet[] {
  const uit: NieuweSet[] = [];
  for (const set of alle) {
    const info = basisSet(set);
    if (!info || info.soort !== soort || info.generatie !== 'nieuw' || info.leeg || !info.vak || !info.eindmoment) continue;
    uit.push({ set, info: info as NieuweSet['info'] });
  }
  return uit;
}

/** De vakken met een nieuwe set op een moment, in vakvolgorde, met hun sets (in de volgorde van de index), het aantal doelen en de soorten. */
export function vakkenOpMoment(
  alle: readonly MinimumdoelenIndexSet[],
  soort: SoortBasis,
  eind: Eindmoment,
): { vak: KalenderVak; sets: MinimumdoelenIndexSet[]; aantal: number; perSoort: { soort: SoortDoelen; aantal: number }[] }[] {
  const perVak = new Map<number, NieuweSet[]>();
  for (const n of nieuweSets(alle, soort)) {
    if (n.info.eindmoment !== eind) continue;
    perVak.set(n.info.vak.nr, [...(perVak.get(n.info.vak.nr) ?? []), n]);
  }
  return [...perVak.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, lijst]) => ({
      vak: lijst[0].info.vak,
      sets: lijst.map((n) => n.set),
      aantal: lijst.reduce((som, n) => som + n.set.aantal, 0),
      perSoort: telPerSoort(lijst.map((n) => ({ soortDoelen: n.info.soortDoelen, aantal: n.set.aantal }))),
    }));
}

/** De nieuwe sets van één vak op één moment (één, of twee bij het kleuter-Nederlands en kleuter-wiskunde van het gewoon onderwijs). */
export function setsVoorVak(
  alle: readonly MinimumdoelenIndexSet[],
  soort: SoortBasis,
  eind: Eindmoment,
  vak: number,
): MinimumdoelenIndexSet[] {
  return nieuweSets(alle, soort)
    .filter((n) => n.info.eindmoment === eind && n.info.vak.nr === vak)
    .map((n) => n.set);
}

/** De nieuwe sets van één vak op elk moment waarop het er een heeft. */
export function setsVanVak(
  alle: readonly MinimumdoelenIndexSet[],
  soort: SoortBasis,
  vak: number,
): Partial<Record<Eindmoment, MinimumdoelenIndexSet[]>> {
  const uit: Partial<Record<Eindmoment, MinimumdoelenIndexSet[]>> = {};
  for (const n of nieuweSets(alle, soort)) {
    if (n.info.vak.nr !== vak) continue;
    (uit[n.info.eindmoment] ??= []).push(n.set);
  }
  return uit;
}
