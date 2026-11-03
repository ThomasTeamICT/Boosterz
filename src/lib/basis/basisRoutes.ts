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
    case 'onbekend':
      return '/basis/onbekend';
  }
}

/** Het pad van een doel: {set:'ODS_3408', id:'92767'} wordt '/basis/doel/ODS_3408/92767'. */
export function doelPad(ref: { set: string; id: string }): string {
  return basisPad({ s: 'doel', setId: ref.set, doelId: ref.id });
}
