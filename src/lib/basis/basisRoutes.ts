// De adressen van het deel basisonderwijs (#/basis/...), als zuivere padlezer en padbouwer.
//
// Het deel heeft één route ('/basis/*') en leest zijn scherm zelf uit het stuk achter '/basis/' en uit de zoekopdracht
// van de url. Er komt dus geen routetabel in het deel: dat zou het leerlingpad zwaarder maken (zie
// docs/basisonderwijs/INGANG.md, § basisRoute). Elke link in het deel komt uit basisPad of doelPad, en
// basisRoute(basisPad(x)) geeft altijd x terug.
//
// Zuiver: geen React, geen opslag en nergens de klok. De functies gooien nooit een fout; wat niet te lezen is, geeft
// {s:'onbekend'}. 'Leerjaar' (niet 'klas') in alle namen: 'klas' blijft vrij voor de echte klas met kinderen.

import {
  LEERJAREN_BASIS,
  WERKT_NAAR,
  type Eindmoment,
  type LeerjaarBasis,
  type SoortBasis,
} from './kalender';
import { isGoVak, type GoVak } from './go/types';
import { pakketBeginScherm, pakketBijMoment, pakketLeerjaar, PAKKETTEN, type PakketBeginScherm, type PakketNaam } from './pakketten';

export type BasisScherm =
  | { s: 'start' }
  | { s: 'kies' }
  | { s: 'leerjaar'; soort: SoortBasis; leerjaar: LeerjaarBasis }
  | { s: 'moment'; soort: SoortBasis; eind: Eindmoment }
  | { s: 'vak'; soort: SoortBasis; eind: Eindmoment; vak: number; leerjaar?: LeerjaarBasis; onderwerp?: string }
  | { s: 'leerlijnen'; soort: SoortBasis; leerjaar?: LeerjaarBasis }
  | { s: 'leerlijn'; soort: SoortBasis; vak: number; leerjaar?: LeerjaarBasis; onderwerp?: string }
  | { s: 'doel'; setId: string; doelId: string }
  | { s: 'zoek'; soort: SoortBasis; vraag: string; leerjaar?: LeerjaarBasis; bereik: 'leerjaar' | 'alles' }
  // Het leerplan en de lesplannen van het GO! (docs/basisonderwijs/GO-LEERPLAN.md, "Adressen"). Het vak is hier het
  // voorvoegsel van het GO! ('WT'), niet het vaknummer van het minimumdoel.
  | { s: 'go' }
  | { s: 'lesplannen'; leerjaar?: LeerjaarBasis; alle?: true; vak?: GoVak }
  | { s: 'lesplan'; code: string; stap?: number }
  // Eén onderdeel van het aanbod in Boosterz bij een lesplan, op het bord (pakket A2, src/lib/basis/go/aanbod.ts).
  | { s: 'aanbod'; code: string; onderdeel: string }
  | { s: 'lessenlijn'; vak: GoVak; lijn: string; leerjaar?: LeerjaarBasis }
  | { s: 'leerplandoelen'; vak: GoVak; leerjaar?: LeerjaarBasis; alle?: true; rubriek?: string; zonder?: true }
  | { s: 'leerplandoel'; code: string }
  // De drie schermen van een pakket (docs/basisonderwijs/LICHTKAMER-APP.md, 'Drie schermen in #/basis'): de lespagina voor
  // de leerkracht (met ?leerjaar voor de stand), het bord en het kind (met ?scherm om meteen een oefening te openen).
  | { s: 'pakket'; pakket: PakketNaam; eind: Eindmoment; leerjaar?: LeerjaarBasis }
  | { s: 'bord'; pakket: PakketNaam; eind: Eindmoment; scherm?: PakketBeginScherm }
  | { s: 'oefen'; pakket: PakketNaam; eind: Eindmoment; scherm?: PakketBeginScherm }
  | { s: 'onbekend' };

export const SOORT_SLUG: Readonly<Record<SoortBasis, 'gewoon' | 'buitengewoon'>> = {
  bao: 'gewoon',
  bubao: 'buitengewoon',
};

export const EIND_SLUG: Readonly<Record<Eindmoment, 'einde-kleuter' | 'einde-4de' | 'einde-6de'>> = {
  K3: 'einde-kleuter',
  L4: 'einde-4de',
  L6: 'einde-6de',
};

/**
 * De vaste adressen per vak (vaknummer = het eerste getal van de code van een doel). Bewust een vaste tabel: ze komt
 * niet uit de invoeringskalender of de API, want een adres moet blijven werken ook als een naam in de bron verandert.
 */
const VAK_SLUGS: readonly string[] = [
  'nederlands',
  'wiskunde',
  'wetenschap-en-techniek',
  'aardrijkskunde',
  'geschiedenis',
  'muzische-vorming',
  'lichamelijke-opvoeding',
  'ict',
  'attitudes',
  'frans',
];

/** Het adresdeel van vak 1 tot 10; undefined voor een ander nummer. */
export function vakSlug(nr: number): string | undefined {
  return Number.isInteger(nr) ? VAK_SLUGS[nr - 1] : undefined;
}

/** Het vaknummer (1 tot 10) bij een adresdeel; undefined als het niet bestaat. */
export function vakVanSlug(slug: string): number | undefined {
  const i = VAK_SLUGS.indexOf(slug);
  return i >= 0 ? i + 1 : undefined;
}

const SOORT_VAN_SLUG: Readonly<Record<string, SoortBasis>> = { gewoon: 'bao', buitengewoon: 'bubao' };
const EIND_VAN_SLUG: Readonly<Record<string, Eindmoment>> = { 'einde-kleuter': 'K3', 'einde-4de': 'L4', 'einde-6de': 'L6' };

const SET_ID = /^ODS_\d+$/;
const DOEL_ID = /^\d+$/;
const ONDERWERP = /^\d{1,2}\.\d{1,2}$/;
/** Een zoekvraag in de url is nooit langer dan dit; langere vragen worden afgekapt (een adres is geen tekstvak). */
const MAX_VRAAG = 200;

/** Een lesplancode in het adres: 'LP0065', 'LP0014a'; hoofdletters maken niet uit en worden rechtgezet. */
const LESPLAN_CODE = /^lp(\d{4})([a-z]?)$/i;
/** Een code van een leerplandoel in het adres: 'WT.086'; het voorvoegsel is een vak van het GO!. */
const GO_DOELCODE = /^([a-z]{2})\.(\d{3,4})$/i;
/** Het adresdeel van een lessenlijn: kleine letters, cijfers en streepjes ('biologie-van-organismen'). */
const LIJN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 80;
/** Het id van een rubriek in een leerplan van het GO!: 'WT-r012'. */
const GO_RUBRIEK = /^([a-z]{2})-r(\d{3,4})$/i;
const GO_STAP = /^[1-6]$/;
/** De id van een onderdeel van het aanbod ('dier-of-plant'). Zelfde regel als isGeldigeOnderdeelId in go/aanbod.ts (een test
 *  bewaakt dat), maar zonder import: zo trekt dit bestand het aanbodmodel niet mee. */
const AANBOD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** De lesplancode in de vorm van het bestand ('LP0014a'); undefined als het geen lesplancode is. */
function lesplancodeVan(tekst: string | null | undefined): string | undefined {
  const m = typeof tekst === 'string' ? LESPLAN_CODE.exec(tekst) : null;
  return m ? `LP${m[1]}${m[2].toLowerCase()}` : undefined;
}

/** Het vak van het GO! uit een adresdeel of zoekparameter ('wt' en 'WT' zijn beide WT). */
function goVakVan(tekst: string | null | undefined): GoVak | undefined {
  const hoofd = typeof tekst === 'string' ? tekst.toUpperCase() : undefined;
  return isGoVak(hoofd) ? hoofd : undefined;
}

/** Het id van een rubriek ('wt-r012' wordt 'WT-r012'), alleen als het voorvoegsel bij het vak hoort. */
function goRubriekVan(tekst: string | null | undefined, vak: GoVak): string | undefined {
  const m = typeof tekst === 'string' ? GO_RUBRIEK.exec(tekst) : null;
  return m && m[1].toUpperCase() === vak ? `${vak}-r${m[2]}` : undefined;
}

/** Een leerjaar, hoofdletters maken niet uit ('l3' wordt 'L3'). */
function leerjaarVan(tekst: string | null | undefined): LeerjaarBasis | undefined {
  if (typeof tekst !== 'string') return undefined;
  const hoofd = tekst.trim().toUpperCase();
  return LEERJAREN_BASIS.find((l) => l === hoofd);
}

function isOnderwerp(tekst: string | null | undefined): tekst is string {
  return typeof tekst === 'string' && ONDERWERP.test(tekst);
}

function delen(splat: unknown): string[] | undefined {
  if (typeof splat !== 'string') return [];
  const uit: string[] = [];
  for (const stuk of splat.split('/')) {
    if (stuk === '') continue;
    try {
      uit.push(decodeURIComponent(stuk));
    } catch {
      return undefined;
    }
  }
  return uit;
}

function zoekParams(zoek: unknown): URLSearchParams {
  const tekst = typeof zoek === 'string' ? zoek : '';
  try {
    return new URLSearchParams(tekst.startsWith('?') ? tekst.slice(1) : tekst);
  } catch {
    return new URLSearchParams();
  }
}

const ONBEKEND: BasisScherm = { s: 'onbekend' };

/**
 * Het scherm bij het stuk achter '/basis/' (useParams()['*']) en de zoekopdracht van de url (location.search).
 * - ?leerjaar=alle op de lijsten van het GO! (leerplandoelen, lesplannen) is 'alle leeftijden', ook als je een leerjaar bewaarde;
 *   ?zonder=1 is het vinkje 'zonder minimumdoel';
 * - ?leerjaar valt weg als het geen geldig leerjaar is, en bij 'vak' ook als dat leerjaar niet naar het eindmoment werkt;
 * - ?onderwerp moet de vorm 3.5 hebben;
 * - al de rest geeft {s:'onbekend'}.
 * De bewaarde keuze van de leerkracht kent deze functie niet: wie die wil gebruiken, bouwt de link met basisPad.
 */
export function basisRoute(splat: string, zoek: string): BasisScherm {
  try {
    const d = delen(splat);
    if (!d) return ONBEKEND;
    const p = zoekParams(zoek);
    const [wat, a, b, c, ...rest] = d;
    if (rest.length > 0) return ONBEKEND;
    const leerjaar = leerjaarVan(p.get('leerjaar'));
    const onderwerp = isOnderwerp(p.get('onderwerp')) ? p.get('onderwerp') ?? undefined : undefined;

    if (wat === undefined) return { s: 'start' };
    if (wat === 'kies') return a === undefined ? { s: 'kies' } : ONBEKEND;

    if (wat === 'leerjaar') {
      const soort = a === undefined ? undefined : SOORT_VAN_SLUG[a];
      const lj = leerjaarVan(b);
      return soort && lj && c === undefined ? { s: 'leerjaar', soort, leerjaar: lj } : ONBEKEND;
    }

    if (wat === 'moment') {
      const soort = a === undefined ? undefined : SOORT_VAN_SLUG[a];
      const eind = b === undefined ? undefined : EIND_VAN_SLUG[b];
      return soort && eind && c === undefined ? { s: 'moment', soort, eind } : ONBEKEND;
    }

    if (wat === 'vak') {
      const soort = a === undefined ? undefined : SOORT_VAN_SLUG[a];
      const eind = b === undefined ? undefined : EIND_VAN_SLUG[b];
      const vak = c === undefined ? undefined : vakVanSlug(c);
      if (!soort || !eind || vak === undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'vak', soort, eind, vak };
      if (leerjaar && WERKT_NAAR[leerjaar] === eind) uit.leerjaar = leerjaar;
      if (onderwerp) uit.onderwerp = onderwerp;
      return uit;
    }

    if (wat === 'leerlijn') {
      const soort = a === undefined ? undefined : SOORT_VAN_SLUG[a];
      if (!soort || c !== undefined) return ONBEKEND;
      if (b === undefined) return leerjaar ? { s: 'leerlijnen', soort, leerjaar } : { s: 'leerlijnen', soort };
      const vak = vakVanSlug(b);
      if (vak === undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'leerlijn', soort, vak };
      if (leerjaar) uit.leerjaar = leerjaar;
      if (onderwerp) uit.onderwerp = onderwerp;
      return uit;
    }

    if (wat === 'doel') {
      return a !== undefined && b !== undefined && c === undefined && SET_ID.test(a) && DOEL_ID.test(b)
        ? { s: 'doel', setId: a, doelId: b }
        : ONBEKEND;
    }

    if (wat === 'go') return a === undefined ? { s: 'go' } : ONBEKEND;

    if (wat === 'pakket' || wat === 'bord' || wat === 'oefen') {
      const pakket = pakketBijMoment(a, b);
      if (!pakket || c !== undefined) return ONBEKEND;
      if (wat === 'pakket') {
        const lj = pakketLeerjaar(pakket, p.get('leerjaar'));
        return lj ? { s: 'pakket', pakket: pakket.naam, eind: pakket.eind, leerjaar: lj } : { s: 'pakket', pakket: pakket.naam, eind: pakket.eind };
      }
      // De andere zoekparameters (zoals ?meet van de kijkdoos, die zijn url zelf leest) storen niet.
      const scherm = pakketBeginScherm(p.get('scherm'));
      const uit = { pakket: pakket.naam, eind: pakket.eind };
      return scherm ? { s: wat, ...uit, scherm } : { s: wat, ...uit };
    }

    if (wat === 'lesplannen') {
      if (a !== undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'lesplannen' };
      if (leerjaar) uit.leerjaar = leerjaar;
      else if (p.get('leerjaar') === 'alle') uit.alle = true;
      const vak = goVakVan(p.get('vak'));
      if (vak) uit.vak = vak;
      return uit;
    }

    if (wat === 'lesplan') {
      const code = lesplancodeVan(a);
      if (!code || b !== undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'lesplan', code };
      const stap = p.get('stap');
      if (stap !== null && GO_STAP.test(stap)) uit.stap = Number(stap);
      return uit;
    }

    if (wat === 'aanbod') {
      const code = lesplancodeVan(a);
      const onderdeel = b?.toLowerCase();
      return code && onderdeel !== undefined && onderdeel.length <= MAX_SLUG && AANBOD_ID.test(onderdeel) && c === undefined
        ? { s: 'aanbod', code, onderdeel }
        : ONBEKEND;
    }

    if (wat === 'lessenlijn') {
      const vak = goVakVan(a);
      const lijn = b?.toLowerCase();
      if (!vak || lijn === undefined || lijn.length > MAX_SLUG || !LIJN_SLUG.test(lijn) || c !== undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'lessenlijn', vak, lijn };
      if (leerjaar) uit.leerjaar = leerjaar;
      return uit;
    }

    if (wat === 'leerplandoelen') {
      const vak = goVakVan(a);
      if (!vak || b !== undefined) return ONBEKEND;
      const uit: BasisScherm = { s: 'leerplandoelen', vak };
      if (leerjaar) uit.leerjaar = leerjaar;
      else if (p.get('leerjaar') === 'alle') uit.alle = true;
      const rubriek = goRubriekVan(p.get('rubriek'), vak);
      if (rubriek) uit.rubriek = rubriek;
      if (p.get('zonder') === '1') uit.zonder = true;
      return uit;
    }

    if (wat === 'leerplandoel') {
      const m = a === undefined || b !== undefined ? null : GO_DOELCODE.exec(a);
      const vak = m ? goVakVan(m[1]) : undefined;
      return m && vak ? { s: 'leerplandoel', code: `${vak}.${m[2]}` } : ONBEKEND;
    }

    if (wat === 'zoek') {
      if (a !== undefined) return ONBEKEND;
      const soortTekst = p.get('soort');
      const soort = soortTekst === null ? 'bao' : SOORT_VAN_SLUG[soortTekst];
      if (!soort) return ONBEKEND;
      const vraag = (p.get('q') ?? '').slice(0, MAX_VRAAG);
      const bereik = p.get('bereik');
      const uit: BasisScherm = {
        s: 'zoek',
        soort,
        vraag,
        bereik: leerjaar && bereik !== 'alles' ? 'leerjaar' : 'alles',
      };
      if (leerjaar) uit.leerjaar = leerjaar;
      return uit;
    }

    return ONBEKEND;
  } catch {
    return ONBEKEND;
  }
}

function query(params: [string, string | undefined][]): string {
  const stukken = params.filter((p): p is [string, string] => p[1] !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return stukken.length > 0 ? `?${stukken.join('&')}` : '';
}

/** Het pad (zonder '#') van een scherm, bv. '/basis/leerjaar/gewoon/L3'. Dit is de enige plek die adressen bouwt. */
export function basisPad(s: BasisScherm): string {
  switch (s.s) {
    case 'start':
      return '/basis';
    case 'kies':
      return '/basis/kies';
    case 'leerjaar':
      return `/basis/leerjaar/${SOORT_SLUG[s.soort]}/${s.leerjaar}`;
    case 'moment':
      return `/basis/moment/${SOORT_SLUG[s.soort]}/${EIND_SLUG[s.eind]}`;
    case 'vak': {
      const slug = vakSlug(s.vak);
      if (!slug) return '/basis';
      const lj = s.leerjaar && WERKT_NAAR[s.leerjaar] === s.eind ? s.leerjaar : undefined;
      return `/basis/vak/${SOORT_SLUG[s.soort]}/${EIND_SLUG[s.eind]}/${slug}${query([
        ['leerjaar', lj],
        ['onderwerp', s.onderwerp],
      ])}`;
    }
    case 'leerlijnen':
      return `/basis/leerlijn/${SOORT_SLUG[s.soort]}${query([['leerjaar', s.leerjaar]])}`;
    case 'leerlijn': {
      const slug = vakSlug(s.vak);
      if (!slug) return '/basis';
      return `/basis/leerlijn/${SOORT_SLUG[s.soort]}/${slug}${query([
        ['leerjaar', s.leerjaar],
        ['onderwerp', s.onderwerp],
      ])}`;
    }
    case 'doel':
      return `/basis/doel/${s.setId}/${s.doelId}`;
    case 'zoek':
      return `/basis/zoek${query([
        ['q', s.vraag],
        ['soort', SOORT_SLUG[s.soort]],
        ['leerjaar', s.leerjaar],
        ['bereik', s.bereik === 'leerjaar' && s.leerjaar ? 'leerjaar' : 'alles'],
      ])}`;
    case 'go':
      return '/basis/go';
    case 'lesplannen':
      return `/basis/lesplannen${query([
        ['leerjaar', s.leerjaar ?? (s.alle ? 'alle' : undefined)],
        ['vak', s.vak?.toLowerCase()],
      ])}`;
    case 'lesplan':
      return `/basis/lesplan/${encodeURIComponent(s.code)}${query([['stap', s.stap === undefined ? undefined : String(s.stap)]])}`;
    case 'aanbod':
      return `/basis/aanbod/${encodeURIComponent(s.code)}/${encodeURIComponent(s.onderdeel)}`;
    case 'lessenlijn':
      return `/basis/lessenlijn/${s.vak.toLowerCase()}/${encodeURIComponent(s.lijn)}${query([['leerjaar', s.leerjaar]])}`;
    case 'leerplandoelen':
      return `/basis/leerplandoelen/${s.vak.toLowerCase()}${query([
        ['leerjaar', s.leerjaar ?? (s.alle ? 'alle' : undefined)],
        ['rubriek', s.rubriek],
        ['zonder', s.zonder ? '1' : undefined],
      ])}`;
    case 'leerplandoel':
      return `/basis/leerplandoel/${encodeURIComponent(s.code)}`;
    case 'pakket':
      return `/basis/pakket/${s.pakket}/${PAKKETTEN[s.pakket].moment}${query([['leerjaar', s.leerjaar]])}`;
    case 'bord':
      return `/basis/bord/${s.pakket}/${PAKKETTEN[s.pakket].moment}${query([['scherm', s.scherm]])}`;
    case 'oefen':
      return `/basis/oefen/${s.pakket}/${PAKKETTEN[s.pakket].moment}${query([['scherm', s.scherm]])}`;
    case 'onbekend':
      return '/basis/onbekend';
  }
}

/** Het pad van een doel: {set:'ODS_3408', id:'92767'} wordt '/basis/doel/ODS_3408/92767'. */
export function doelPad(ref: { set: string; id: string }): string {
  return basisPad({ s: 'doel', setId: ref.set, doelId: ref.id });
}
