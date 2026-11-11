// De officiële koppeling leerplandoel → minimumdoel (docs/basisonderwijs/GO-LEERPLAN.md, "Koppeling", met de
// rechtzettingen 1, 2 en 7 van de rechter).
//
// De doelensets van het GO! geven alleen een moment (de kolommen 'KO nummer', 'L4 nummer', 'L6 nummer') en een code.
// Pas samen zijn ze eenduidig: het eerste getal van de code is het vak (1 Nederlands … 10 Frans), het moment is het
// eindmoment (KO → einde kleuter, L4 → einde 4de, L6 → einde 6de leerjaar). De kandidaten zijn de doelen van de nieuwe,
// niet-lege sets van het gewoon basisonderwijs van dat vak en eindmoment (basisSet en setsVanVak). Precies één doel
// geeft een officiële koppeling op set + vast nummer, nooit op de code alleen.
//
// Wat hier nooit gebeurt: een koppeling afleiden uit leeftijden of tekst. Past het moment niet bij de leeftijden van het
// doel, dan blijft de koppeling officieel, met twijfel 'moment-buiten-leeftijden' (melden, niet verbeteren). Een
// voorstel bestaat alleen als de hoofdsessie het opnam in bekende-afwijkingen.json, in twee vormen (types.ts,
// GoMinimumdoelRef): A voor een code die geen doel vindt (sleutel doel + moment + letterlijke bronCode), B naast een
// officiële koppeling met twijfel 'ander-vak' (sleutel doel + moment + code); die officiële koppeling blijft staan.
//
// Zuiver: de index en de setbestanden zijn de invoer; geen I/O.
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../minimumdoelen';
import { setsVanVak } from '../doelBasis';
import type { Eindmoment } from '../kalender';
import { EINDMOMENT_VAN_GO_MOMENT, momentPastBijLeeftijden } from './leeftijden';
import { basisSet, tweelingSets } from '../moment';
import { GO_MOMENTEN, GO_TWIJFELS, type GoKoppeling, type GoLeeftijd, type GoMinimumdoelRef, type GoMoment, type GoTwijfel } from './types';
import { splitsCodes } from './valideer';
import { RE_CODEVORM } from './vorm';

/** Een doel uit een set van de minimumdoelen: de sleutel van de app (set + vast nummer) met de code. */
export interface MinimumdoelKandidaat {
  set: string;
  id: string;
  code: string;
}

/** De vakken van de minimumdoelen van het basisonderwijs: 1 Nederlands … 10 Frans. */
export const MINIMUMDOEL_VAKKEN: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Het vak van een code (het eerste getal), of undefined als de code niet de vorm cijfer.cijfer.cijfer heeft. */
export function vakVanCode(code: string): number | undefined {
  if (!RE_CODEVORM.test(code)) return undefined;
  return Number(code.split('.')[0]);
}

export interface Opzoektabel {
  /** De doelen met deze code op dit moment (0, 1, of meer als de bron dubbelzinnig zou zijn). */
  zoek(moment: GoMoment, code: string): MinimumdoelKandidaat[];
  /** Alle doelen van de gewone sets die meedoen (voor de dekking in het rapport). */
  alle(): MinimumdoelKandidaat[];
  /** De ids van de sets die meedoen, per vak en eindmoment. */
  sets(): { vak: number; eind: Eindmoment; sets: string[] }[];
  /**
   * De tweelingen in het buitengewoon onderwijs: per gewone set de sets met hetzelfde vak en eindmoment, en per set
   * het vaste nummer → de code. Leeg als er geen tweeling is.
   */
  tweelingen(set: string): { set: string; doelen: ReadonlyMap<string, string> }[];
}

/**
 * Bouwt de opzoektabel (moment, code) → doelen uit de index en de setbestanden van public/leerplannen/minimumdoelen.
 * `laad` geeft het bestand van een set, of undefined als het ontbreekt (een melding, geen stille fout).
 */
export function maakOpzoektabel(
  index: readonly MinimumdoelenIndexSet[],
  laad: (set: MinimumdoelenIndexSet) => MinimumdoelenSetBestand | undefined,
): { tabel: Opzoektabel; meldingen: string[] } {
  const meldingen: string[] = [];
  const perSleutel = new Map<string, MinimumdoelKandidaat[]>();
  const alle: MinimumdoelKandidaat[] = [];
  const setLijst: { vak: number; eind: Eindmoment; sets: string[] }[] = [];
  const geladen = new Map<string, MinimumdoelenSetBestand | undefined>();
  const bestandVan = (s: MinimumdoelenIndexSet) => {
    if (!geladen.has(s.id)) {
      const b = laad(s);
      if (!b) meldingen.push(`Het bestand van ${s.id} ontbreekt.`);
      geladen.set(s.id, b);
    }
    return geladen.get(s.id);
  };
  const doelenVan = (b: MinimumdoelenSetBestand): { id: string; code: string }[] =>
    b.doelen.flatMap((d) => (typeof d.id === 'string' && typeof d.code === 'string' && d.id.trim() !== '' && d.code.trim() !== '' ? [{ id: d.id.trim(), code: d.code.trim() }] : []));

  for (const vak of MINIMUMDOEL_VAKKEN) {
    const perEind = setsVanVak(index, 'bao', vak);
    for (const eind of ['K3', 'L4', 'L6'] as const) {
      const sets = perEind[eind] ?? [];
      if (sets.length === 0) continue;
      setLijst.push({ vak, eind, sets: sets.map((s) => s.id) });
      for (const s of sets) {
        const b = bestandVan(s);
        if (!b) continue;
        for (const d of doelenVan(b)) {
          const code = d.code;
          if (vakVanCode(code) !== vak) {
            meldingen.push(`${s.id}/${d.id}: de code ${code} hoort niet bij vak ${vak}.`);
            continue;
          }
          const k = `${eind}|${code}`;
          const kandidaat = { set: s.id, id: d.id, code };
          perSleutel.set(k, [...(perSleutel.get(k) ?? []), kandidaat]);
          alle.push(kandidaat);
        }
      }
    }
  }

  // De tweelingen in het buitengewoon basisonderwijs (zelfde vak en eindmoment, andere basissoort).
  const tweelingCache = new Map<string, { set: string; doelen: ReadonlyMap<string, string> }[]>();
  const tweelingen = (setId: string) => {
    const bestaand = tweelingCache.get(setId);
    if (bestaand) return bestaand;
    const kop = index.find((s) => s.id === setId);
    const info = kop ? basisSet(kop) : undefined;
    const uit: { set: string; doelen: ReadonlyMap<string, string> }[] = [];
    if (info) {
      for (const t of tweelingSets(info, index)) {
        const tinfo = basisSet(t);
        if (!tinfo || tinfo.leeg) continue;
        const b = bestandVan(t);
        if (!b) continue;
        uit.push({ set: t.id, doelen: new Map(doelenVan(b).map((d) => [d.id, d.code])) });
      }
    }
    tweelingCache.set(setId, uit);
    return uit;
  };

  const tabel: Opzoektabel = {
    zoek: (moment, code) => perSleutel.get(`${EINDMOMENT_VAN_GO_MOMENT[moment]}|${code}`) ?? [],
    alle: () => alle,
    sets: () => setLijst,
    tweelingen,
  };
  return { tabel, meldingen };
}

/**
 * Een voorstel uit bekende-afwijkingen.json: de voorgestelde code op hetzelfde moment. Als `voorstel` (vorm A) gevraagd
 * voor een code die geen doel vindt; als `voorstelNaast` (vorm B) voor de code van een officiële koppeling met twijfel
 * 'ander-vak'.
 */
export type VoorstelZoeker = (moment: GoMoment, bronCode: string) => string | undefined;
/** Extra twijfels bij een officiële koppeling (bv. 'ander-vak' uit bekende-afwijkingen.json). */
export type TwijfelZoeker = (moment: GoMoment, code: string) => readonly GoTwijfel[];

export interface KoppelUitkomst {
  koppeling: GoKoppeling;
  /** Een code die meer dan één doel vindt: dat komt niet voor (zeker); gebeurt het toch, dan stopt de import. */
  dubbelzinnig: { moment: GoMoment; code: string; kandidaten: MinimumdoelKandidaat[] }[];
  /** Een code die twee keer in dezelfde kolom staat, of een voorstel dat naar een al gekoppeld doel wijst. */
  dubbel: { moment: GoMoment; code: string }[];
  /** Een voorstel (vorm A of B) waarvan de voorgestelde code zelf geen (of meer dan één) doel vindt, of de code uit de bron is. */
  voorstelZonderDoel: { moment: GoMoment; bronCode: string; voorstel: string }[];
}

/** De twijfels in de volgorde van GO_TWIJFELS, zonder dubbels. */
function ordenTwijfels(lijst: readonly GoTwijfel[]): GoTwijfel[] {
  return GO_TWIJFELS.filter((t) => lijst.includes(t));
}

/**
 * Zet de codekolommen van één rij om naar een GoKoppeling. `lft` zijn de leeftijden van het doel (ook bij een
 * koppeling op een MIA-rij, die zelf geen leeftijd heeft). Elke code uit de bron staat daarna precies één keer
 * verantwoord: als officiële ref of als probleem. Een voorstel komt direct na de code waar het bij hoort: na het probleem
 * (vorm A, `voorstel`) of na de officiële ref met twijfel 'ander-vak' (vorm B, `voorstelNaast`, alleen dan gevraagd).
 */
export function koppel(
  bron: Partial<Record<GoMoment, string>>,
  lft: readonly GoLeeftijd[],
  tabel: Opzoektabel,
  opties: { voorstel?: VoorstelZoeker; voorstelNaast?: VoorstelZoeker; twijfel?: TwijfelZoeker } = {},
): KoppelUitkomst {
  const refs: GoMinimumdoelRef[] = [];
  const problemen: GoKoppeling['problemen'] = [];
  const dubbelzinnig: KoppelUitkomst['dubbelzinnig'] = [];
  const dubbel: KoppelUitkomst['dubbel'] = [];
  const voorstelZonderDoel: KoppelUitkomst['voorstelZonderDoel'] = [];
  const schoneBron: Partial<Record<GoMoment, string>> = {};
  const gekoppeld = new Set<string>();

  const twijfelsVoor = (moment: GoMoment, code: string, officieel: boolean): GoTwijfel[] => {
    const tw: GoTwijfel[] = [];
    if (!momentPastBijLeeftijden(moment, lft)) tw.push('moment-buiten-leeftijden');
    if (officieel && opties.twijfel) tw.push(...opties.twijfel(moment, code));
    return ordenTwijfels(tw);
  };

  /** Zoekt het voorgestelde doel en zet het als voorstel achteraan in refs; anders een melding (stopt de import). */
  const voegVoorstelToe = (moment: GoMoment, bronCode: string, voorstel: string) => {
    const vk = tabel.zoek(moment, voorstel);
    if (vk.length !== 1 || voorstel === bronCode) {
      voorstelZonderDoel.push({ moment, bronCode, voorstel });
      return;
    }
    const sleutel = `${vk[0].set}/${vk[0].id}`;
    if (gekoppeld.has(sleutel)) {
      dubbel.push({ moment, code: voorstel });
      return;
    }
    gekoppeld.add(sleutel);
    const ref: GoMinimumdoelRef = { set: vk[0].set, id: vk[0].id, code: vk[0].code, moment, status: 'voorstel', bronCode };
    const tw = twijfelsVoor(moment, vk[0].code, false);
    if (tw.length > 0) ref.twijfel = tw;
    refs.push(ref);
  };

  for (const moment of GO_MOMENTEN) {
    const tekst = bron[moment];
    if (tekst === undefined || tekst.trim() === '') continue;
    schoneBron[moment] = tekst;
    const gezien = new Set<string>();
    for (const code of splitsCodes(tekst)) {
      if (gezien.has(code)) {
        dubbel.push({ moment, code });
        continue;
      }
      gezien.add(code);
      const leesbaar = RE_CODEVORM.test(code);
      const kandidaten = leesbaar ? tabel.zoek(moment, code) : [];
      if (kandidaten.length > 1) {
        dubbelzinnig.push({ moment, code, kandidaten });
        continue;
      }
      if (kandidaten.length === 1) {
        const k = kandidaten[0];
        const sleutel = `${k.set}/${k.id}`;
        if (gekoppeld.has(sleutel)) {
          dubbel.push({ moment, code });
          continue;
        }
        gekoppeld.add(sleutel);
        const ref: GoMinimumdoelRef = { set: k.set, id: k.id, code: k.code, moment, status: 'officieel' };
        const tw = twijfelsVoor(moment, k.code, true);
        if (tw.length > 0) ref.twijfel = tw;
        refs.push(ref);
        // Vorm B: alleen naast een officiële koppeling met twijfel 'ander-vak'.
        const naast = tw.includes('ander-vak') ? opties.voorstelNaast?.(moment, k.code) : undefined;
        if (naast !== undefined) voegVoorstelToe(moment, k.code, naast);
        continue;
      }
      problemen.push({ moment, bronCode: code, reden: leesbaar ? 'bestaat-niet' : 'onleesbaar' });
      const voorstel = opties.voorstel?.(moment, code);
      if (voorstel !== undefined) voegVoorstelToe(moment, code, voorstel);
    }
  }
  return { koppeling: { bron: schoneBron, refs, problemen }, dubbelzinnig, dubbel, voorstelZonderDoel };
}

/**
 * Heeft elke officiële ref een tweeling in het buitengewoon onderwijs met hetzelfde nummer en dezelfde code? Geeft
 * de afwijkingen (0 in de eerste reeks, zeker). Een gewone set zonder tweeling geeft niets.
 */
export function controleerTweelingen(refs: readonly GoMinimumdoelRef[], tabel: Opzoektabel): string[] {
  const uit: string[] = [];
  for (const r of refs) {
    for (const t of tabel.tweelingen(r.set)) {
      const code = t.doelen.get(r.id);
      if (code === undefined) uit.push(`${r.set}/${r.id} (${r.code}) heeft geen tweeling met hetzelfde nummer in ${t.set}.`);
      else if (code !== r.code) uit.push(`${r.set}/${r.id} heeft code ${r.code}, de tweeling in ${t.set} code ${code}.`);
    }
  }
  return uit;
}
