// Hulp bij het zoeken van sets minimumdoelen: bij welk vak hoort welke sleutelcompetentie?
//
// Sinds 2019 heten veel sets (vooral in de 1ste graad) naar een sleutelcompetentie en niet meer naar een
// vak: wie "aardrijkskunde" zoekt, vindt dan alleen de oude vakset, en niet "Competenties met betrekking
// tot ruimtelijk bewustzijn". Deze tabel brengt de leerkracht daar alsnog.
//
// Dit is een HULP BIJ HET ZOEKEN, GEEN OFFICIËLE KOPPELING. De tabel bepaalt nooit welke minimumdoelen bij een
// leerplan horen: dat doen de verwijzingen in het leerplan zelf. Ze verandert ook niets aan de sets: ze laat
// alleen een set méér opduiken in een lijst of in de zoekresultaten. De tabel is bewust klein; een vak dat
// er niet in staat, wordt gewoon op naam gezocht. Een test (vakZoektabel.test.ts) bewaakt dat elke regel in de
// meegeleverde sets minstens één set vindt.
//
// Pure module, zonder imports: minimumdoelenBron.ts en setKeuze.ts gebruiken ze allebei.

interface Regel {
  /**
   * Losse woorden (zonder accenten, kleine letters) die de leerkracht intikt of in het vak van een leerplan staan. Het
   * eerste woord is het hoofdwoord van de regel. Een meerwoordige naam ("lichamelijke opvoeding") of een afkorting
   * ("lo", "l.o.") mag er ook in: `vakAlsZoekwoord` maakt daar het hoofdwoord van.
   */
  vakken: readonly string[];
  /**
   * Wat dan ook in de naam van een set mag staan, zonder accenten en in kleine letters. Een frase moet op
   * woordgrenzen passen; een "*" achteraan laat het einde vrij ("lichamelijk*" vindt "lichamelijke").
   */
  zoek: readonly string[];
}

const TABEL: readonly Regel[] = [
  { vakken: ['aardrijkskunde', 'geografie'], zoek: ['ruimtelijk bewustzijn'] },
  { vakken: ['geschiedenis'], zoek: ['historisch bewustzijn'] },
  // "Wiskunde – natuurwetenschappen – technologie – STEM" (volledige naam: "wiskunde, exacte wetenschappen en technologie")
  {
    vakken: ['natuurwetenschappen', 'natuurkunde', 'fysica', 'chemie', 'biologie', 'wiskunde', 'techniek', 'technologie', 'stem'],
    zoek: ['exacte wetenschappen', 'stem'],
  },
  { vakken: ['frans', 'engels', 'duits', 'spaans', 'italiaans', 'vreemde'], zoek: ['andere talen'] },
  { vakken: ['informatica', 'ict', 'mediawijsheid'], zoek: ['digitale competentie*'] },
  // De sets "Lichamelijke en geestelijke gezondheid" zijn het vak lichamelijke opvoeding van nu.
  { vakken: ['lichamelijke', 'lichamelijke opvoeding', 'lo', 'l.o.', 'sport', 'turnen'], zoek: ['lichamelijk*'] },
  { vakken: ['muziek', 'muzische', 'beeldende', 'plastische', 'artistieke', 'kunst', 'drama'], zoek: ['cultureel bewustzijn'] },
  { vakken: ['economie', 'economische'], zoek: ['economische*'] },
  { vakken: ['maatschappij', 'maatschappelijke', 'burgerzin'], zoek: ['burgerschap*'] },
  { vakken: ['ondernemen', 'ondernemerschap'], zoek: ['ondernemingszin'] },
  // Nederlands staat er niet in: de sets "Competenties in het Nederlands" noemen het vak zelf al.
];

const PER_WOORD: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const r of TABEL) {
    for (const v of r.vakken) {
      const bestaand = m.get(v) ?? [];
      m.set(v, [...bestaand, ...r.zoek.filter((z) => !bestaand.includes(z))]);
    }
  }
  return m;
})();

function kleinZonderAccenten(t: string): string {
  return t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Kleine letters, zonder accenten, elke reeks spaties één spatie. */
function vergelijkbaar(t: string): string {
  return kleinZonderAccenten(t).replace(/\s+/g, ' ').trim();
}

/**
 * De zoekfrases die bij een los woord horen ("aardrijkskunde" geeft ["ruimtelijk bewustzijn"]); leeg als het
 * woord niet in de tabel staat. Het woord moet helemaal overeenkomen: "aardrijks" geeft niets. Een meerwoordige
 * naam ("lichamelijke opvoeding") of afkorting ("LO") werkt ook, zolang je ze in één keer meegeeft.
 */
export function competentieFrases(woord: string): readonly string[] {
  return PER_WOORD.get(vergelijkbaar(woord)) ?? [];
}

// ── Meerwoordige namen en afkortingen ────────────────────────────────────────

/**
 * Elke naam in `vakken` die geen gewoon woord van minstens drie letters is ("lichamelijke opvoeding", "lo", "l.o.")
 * naar het hoofdwoord van zijn regel ("lichamelijke"). Gewone woorden ("sport") staan er niet in: die werken al los.
 */
const NAAR_HOOFDWOORD: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const r of TABEL) {
    const hoofd = r.vakken[0];
    for (const v of r.vakken) if (v !== hoofd && !/^\p{L}{3,}$/u.test(v)) m.set(v, hoofd);
  }
  return m;
})();

const MAX_WOORDEN_IN_NAAM = Math.max(1, ...[...NAAR_HOOFDWOORD.keys()].map((k) => k.split(' ').length));

/**
 * Zet een meerwoordige vaknaam of een afkorting in een zoektekst om in het hoofdwoord van dat vak: "lichamelijke
 * opvoeding" en "LO" worden "lichamelijke", "lo 3de graad" wordt "lichamelijke 3de graad". De rest van de tekst
 * blijft zoals ze was; verandert er niets, dan komt dezelfde tekst terug.
 *
 * Waarom: een lijst met sets zoekt elk woord los. "opvoeding" staat niet in "Lichamelijke en geestelijke
 * gezondheid", dus "lichamelijke opvoeding" vond enkel nog oude sets (de eerste was een set van het buitengewoon
 * onderwijs uit 2002). Een afkorting als "lo" vond alles waar die twee letters middenin een woord staan ("technologie").
 */
export function vakAlsZoekwoord(zoek: string): string {
  const delen = zoek.split(/\s+/).filter(Boolean);
  const uit: string[] = [];
  let veranderd = false;
  let i = 0;
  while (i < delen.length) {
    // De langste naam eerst: "lichamelijke opvoeding" vóór "lichamelijke".
    let lengte = Math.min(MAX_WOORDEN_IN_NAAM, delen.length - i);
    let hoofd = NAAR_HOOFDWOORD.get(vergelijkbaar(delen.slice(i, i + lengte).join(' ')));
    while (hoofd === undefined && lengte > 1) {
      lengte -= 1;
      hoofd = NAAR_HOOFDWOORD.get(vergelijkbaar(delen.slice(i, i + lengte).join(' ')));
    }
    if (hoofd === undefined) {
      uit.push(delen[i]);
      i += 1;
    } else {
      uit.push(hoofd);
      i += lengte;
      veranderd = true;
    }
  }
  return veranderd ? uit.join(' ') : zoek;
}

const REGEX_CACHE = new Map<string, RegExp>();

function frasePatroon(frase: string): RegExp {
  let re = REGEX_CACHE.get(frase);
  if (!re) {
    const vrijEinde = frase.endsWith('*');
    const kaal = (vrijEinde ? frase.slice(0, -1) : frase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?<![\\p{L}\\d])${kaal}${vrijEinde ? '' : '(?![\\p{L}\\d])'}`, 'u');
    REGEX_CACHE.set(frase, re);
  }
  return re;
}

/** Staat de frase (zie `Regel.zoek`) in deze tekst? De tekst is al zonder accenten en in kleine letters. */
export function bevatFrase(tekst: string, frase: string): boolean {
  return frasePatroon(frase).test(tekst);
}

/** Alle regels van de tabel, om te tonen en te testen. */
export const VAK_ZOEKTABEL: readonly Regel[] = TABEL;
