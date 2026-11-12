// De aansluiting voor bewijs van de Lichtkamer (LK-6): wat een oefening of checkvraag aan 'bewijs' doorgeeft.
//
// Het scherm krijgt een BewijsOntvanger of null. Op het bord en bij uitproberen is er geen (of een lege). Op het
// kindscherm is het een geheugenontvanger, die in proefles 1 niets op het toestel bewaart: hoogstens spiegelt de
// component hem naar de sessionStorage van het tabblad (die toegang staat in src/components/basis/lichtkamer, niet
// hier: deze map is zuiver). In proefles 2 komt hier de buffer van het eigen toestel (bouwpakket 8) op dezelfde plaats.
//
// Zuiver: de (de)serialisatie en het samenvoegen. Geen opslag, geen klok. Een kapotte of vreemde tekst geeft een lege
// stand, nooit een fout.

import { lichtkamerMoment, type LichtkamerMomentNaam } from '../../bewijs/lichtkamerManifest';
import { TELT, laatsteVersie } from '../../bewijs/pakket';

export type BewijsMelding = { id: string; juist: boolean; fout: string | null };
export type BewijsGeheugen = { juist: boolean; fout: string | null };
/** Per bewijs-id wat telt (de id's van het manifest, bv. '4c1' of '4-meten'). */
export type BewijsStand = Readonly<Record<string, BewijsGeheugen>>;

export interface BewijsOntvanger {
  geef(melding: BewijsMelding): void;
  /** Wat al ontvangen is. Alleen een ontvanger met geheugen kent dat; het scherm begint er mee na het herladen. */
  stand?(): BewijsStand;
}

export const LEGE_STAND: BewijsStand = Object.freeze({});

/** De lege ontvanger voor het bord en voor uitproberen: alles wordt aangenomen en vergeten. */
export function maakLegeOntvanger(): BewijsOntvanger {
  return { geef: () => undefined };
}

/** De bewijs-id's van een moment, uit de nieuwste versie van zijn manifest. */
function bewijsIds(moment: LichtkamerMomentNaam): Map<string, 'eerste' | 'laatste'> {
  const m = lichtkamerMoment(moment);
  const uit = new Map<string, 'eerste' | 'laatste'>();
  if (!m) return uit;
  for (const b of laatsteVersie(m.manifest).bewijzen) uit.set(b.id, TELT[b.soort]);
  return uit;
}

/** Telt het eerste antwoord (een checkvraag) of het laatste (een oefening)? Volgt TELT uit het manifest. */
export function eersteTeltVoor(moment: LichtkamerMomentNaam = 'einde-4de'): (id: string) => boolean {
  const ids = bewijsIds(moment);
  return (id) => ids.get(id) === 'eerste';
}

/** Voegt één melding toe aan een stand. Dezelfde stand terug als er niets verandert. */
export function voegBewijsToe(stand: BewijsStand, melding: BewijsMelding, eersteTelt: boolean): BewijsStand {
  const bestaand = stand[melding.id];
  if (bestaand && eersteTelt) return stand;
  if (bestaand && bestaand.juist === melding.juist && bestaand.fout === melding.fout) return stand;
  return { ...stand, [melding.id]: { juist: melding.juist, fout: melding.fout } };
}

export interface GeheugenOntvanger extends BewijsOntvanger {
  stand(): BewijsStand;
}

export type GeheugenOpties = {
  /** Waarmee de ontvanger begint (bv. wat uit de sessionStorage gelezen werd). */
  begin?: BewijsStand;
  eersteTelt?: (id: string) => boolean;
  /** Elke keer dat de stand verandert, bv. om hem naar de sessionStorage te spiegelen. */
  opWijziging?: (stand: BewijsStand) => void;
};

export function maakGeheugenOntvanger(opties: GeheugenOpties = {}): GeheugenOntvanger {
  const eersteTelt = opties.eersteTelt ?? eersteTeltVoor();
  let stand: BewijsStand = opties.begin ?? LEGE_STAND;
  return {
    geef(melding) {
      const nieuw = voegBewijsToe(stand, melding, eersteTelt(melding.id));
      if (nieuw === stand) return;
      stand = nieuw;
      opties.opWijziging?.(stand);
    },
    stand: () => stand,
  };
}

// ─── Tekst voor de sessionStorage ────────────────────────────────────────────

const VERSIE = 1;
const MAX_TEKST = 4000;
const MAX_FOUT = 160;

export function serialiseerStand(stand: BewijsStand): string {
  const b: Record<string, { j: boolean; f: string | null }> = {};
  for (const id of Object.keys(stand)) {
    const g = stand[id] as BewijsGeheugen;
    b[id] = { j: g.juist, f: g.fout };
  }
  return JSON.stringify({ v: VERSIE, b });
}

/**
 * Leest een stand uit tekst. Een tekst die geen geldige JSON is, een andere versie heeft of vreemde vormen bevat,
 * geeft een lege stand; een bewijs-id dat niet in het manifest staat of een kapot item wordt overgeslagen.
 */
export function leesStand(tekst: unknown, moment: LichtkamerMomentNaam = 'einde-4de'): BewijsStand {
  if (typeof tekst !== 'string' || tekst.length === 0 || tekst.length > MAX_TEKST) return LEGE_STAND;
  let ruw: unknown;
  try {
    ruw = JSON.parse(tekst);
  } catch {
    return LEGE_STAND;
  }
  if (typeof ruw !== 'object' || ruw === null || Array.isArray(ruw)) return LEGE_STAND;
  const o = ruw as { v?: unknown; b?: unknown };
  if (o.v !== VERSIE || typeof o.b !== 'object' || o.b === null || Array.isArray(o.b)) return LEGE_STAND;
  const geldig = bewijsIds(moment);
  const uit: Record<string, BewijsGeheugen> = {};
  const b = o.b as Record<string, unknown>;
  for (const id of Object.keys(b)) {
    if (!geldig.has(id)) continue;
    const g = b[id];
    if (typeof g !== 'object' || g === null || Array.isArray(g)) continue;
    const { j, f } = g as { j?: unknown; f?: unknown };
    if (typeof j !== 'boolean') continue;
    if (f !== null && (typeof f !== 'string' || f.length > MAX_FOUT)) continue;
    uit[id] = { juist: j, fout: f as string | null };
  }
  return Object.keys(uit).length === 0 ? LEGE_STAND : uit;
}

// ─── Wat er nog verstuurd moet worden ────────────────────────────────────────

const handtekening = (m: BewijsMelding): string => `${m.juist ? 1 : 0}|${m.fout ?? ''}`;

/**
 * Vergelijkt de bewijzen die de oefeningen nu hebben met wat al verstuurd werd. Geeft alleen de nieuwe of veranderde
 * meldingen terug, en de bijgewerkte lijst van verstuurde handtekeningen. Zo gaat een bewijs nooit twee keer weg.
 */
export function nieuweMeldingen(
  verzonden: ReadonlyMap<string, string>,
  huidig: readonly BewijsMelding[],
): { nieuw: BewijsMelding[]; verzonden: Map<string, string> } {
  const volgende = new Map(verzonden);
  const nieuw: BewijsMelding[] = [];
  for (const m of huidig) {
    const h = handtekening(m);
    if (volgende.get(m.id) === h) continue;
    volgende.set(m.id, h);
    nieuw.push(m);
  }
  return { nieuw, verzonden: volgende };
}
