// Manifest v1 van de Lichtkamer: de drie momenten van het werkend voorbeeld (tools/prototypes/lichtkamer/), elk als een
// eigen pakket (docs/basisonderwijs/LICHTKAMER-APP.md, LK-2; AANMELDEN-BOUWPAKKETTEN.md, bouwpakket 3e).
//
// Elke oefening en elke checkvraag van het prototype hangt hier aan doel-id's. Bron van de koppeling: BEWIJS_PER_DOEL,
// TAKEN en CHECKS in lichtkamer.html. Bron van de doel-id's: de setbestanden van de app in
// public/leerplannen/minimumdoelen (ODS_3410, ODS_3408 en ODS_3409); lichtkamerManifest.test.ts kijkt elk id
// daar na, met zijn code en zijn tekst. De foutpatronen staan letterlijk zoals in het prototype.
//
// Dit is versie 1. De volgorde van de bewijzen ligt vast: het bewijsnummer reist in de bewijscode. Een volgende versie
// vult alleen achteraan aan (controleerPakket). Wie hier iets wil herschikken of wissen, maakt in plaats daarvan een
// nieuwe versie die aanvult. lichtkamerManifest.test.ts legt elke versie vast ('een uitgegeven versie ligt vast'):
// controleerPakket ziet alleen het verschil tussen twee versies, die test ziet ook een wijziging in versie 1 zelf.
// Zolang er nog geen enkele bewijscode met versie 1 bestaat (dat komt pas in spoor 2, met WB1), kan de hoofdsessie
// versie 1 nog bewust aanpassen, samen met die vastgelegde lijst; daarna nooit meer.
//
// Geen GO!-code in v1: het GO! heeft voor 8-9 jaar geen leerplandoel over schaduw (LICHTKAMER-APP.md, 'Het GO!'), en of
// de leerplandoelen van het GO! erbij komen, is vraag 8 aan de eigenaar. Een GO!-code kan later als doel achteraan bij
// een bewijs komen, in een nieuwe versie.
//
// Zuiver: alleen gegevens. Geen naam, geen opslag.

import type { Eindmoment } from '../kalender';
import { minimumdoel, type MinimumdoelSleutel } from './doelSleutel';
import type { BewijsDef, Foutpatroon, PakketManifest } from './pakket';

// ─── Doelen (vaste nummers uit de sets van de app) ───────────────────────────

const K = 'ODS_3410'; // Kleuteronderwijs, Wetenschap en techniek, na te streven op populatieniveau
const L4 = 'ODS_3408'; // Lager onderwijs 4de leerjaar, Wetenschap en techniek, te bereiken op populatieniveau
const L6 = 'ODS_3409'; // Lager onderwijs 6de leerjaar, Wetenschap en techniek, te bereiken op populatieniveau

const D92730 = minimumdoel(K, '92730'); // 3.5.2 licht: de lichtbron, de reflectie
const D92729 = minimumdoel(K, '92729'); // 3.5.1 begrippen natuurkundige verschijnselen
const D92734 = minimumdoel(K, '92734'); // 3.6.1 oorzaak en gevolg
const D92735 = minimumdoel(K, '92735'); // 3.6.2 woordenschat inzetten om te redeneren
const D92767 = minimumdoel(L4, '92767'); // 3.5.4 licht: rechtlijnige beweging
const D92775 = minimumdoel(L4, '92775'); // 3.6.3 een vooraf opgezet eerlijk onderzoek uitvoeren
const D92777 = minimumdoel(L4, '92777'); // 3.6.4 waarnemingen noteren en conclusies trekken
const D92833 = minimumdoel(L6, '92833'); // 3.5.4 licht: reflecteren, absorberen, doorlaten
const D92836 = minimumdoel(L6, '92836'); // 3.5.7 onderzoekscyclus
const D92849 = minimumdoel(L6, '92849'); // 3.6.4 basisprincipes van eerlijk onderzoek

// ─── Foutpatronen (letterlijk uit het prototype) ─────────────────────────────

const fp = (id: string, tekst: string): Foutpatroon => ({ id, tekst });

const GLIMMEN = fp('glimmen-is-licht', 'verwart glimmen met zelf licht maken');
const KANT_LAMP = fp('schaduw-kant-lamp', 'schaduw aan de kant van de lamp');
const GEEN_SPIEGEL = fp('geen-spiegel', 'kiest niet de spiegel om licht terug te kaatsen');
const RECHT_ACHTER = fp('schaduw-recht-achter', 'schaduw altijd recht achter het voorwerp');
const KLEINER = fp('kleiner-als-dichter', 'verwacht een kleinere schaduw als de lamp dichterbij staat');
const AFSTAND = fp('afstand-maakt-niet-uit', 'verwacht dat de afstand niets uitmaakt');
const EVEN_HOOG = fp('gaatjes-even-hoog', 'zet de gaatjes even hoog, niet op één lijn met de lamp');
const BOCHT = fp('licht-maakt-bocht', 'verwacht dat licht een bocht maakt');
const MEETLAT = fp('meetlat-onnauwkeurig', 'leest de meetlat niet nauwkeurig af');
// Komt in de app niet meer voor (de tolerantie past zich aan, zie src/lib/basis/lichtkamer/onderzoek.ts), maar blijft
// staan: gelijk met het prototype en zijn voorbeeldklas. De spiekkaart (LK-7) maakt er geen rij voor.
const METINGEN = fp('metingen-passen-niet', 'metingen passen niet bij elkaar');
const CONCLUSIE = fp('conclusie-past-niet', 'conclusie past niet bij de metingen');
const REFL_ABS = fp('reflecteren-absorberen', 'verwart reflecteren met absorberen');
const STOF = fp('stof-verkeerd', 'sorteert een stof verkeerd');
const MEER_DAN_EEN = fp('meer-dan-een-ding', 'verandert meer dan één ding');
const GLAS_REFL = fp('glas-reflecteert', 'verwacht dat glas vooral reflecteert');
const GLAS_ABS = fp('glas-absorbeert', 'verwacht dat glas licht absorbeert');
const DOOR_ABS = fp('doorlaten-absorberen', 'verwart doorlaten met absorberen');
const ANDERE_VRAAG = fp('andere-vraag', 'onderzoekt een andere vraag');

const bw = (id: string, soort: BewijsDef['soort'], doelen: MinimumdoelSleutel[], foutpatronen: Foutpatroon[] = []): BewijsDef => ({ id, soort, doelen, foutpatronen });

// ─── De drie momenten ────────────────────────────────────────────────────────

export type LichtkamerMomentNaam = 'einde-kleuter' | 'einde-4de' | 'einde-6de';

export interface LichtkamerMoment {
  /** Het adresdeel, zoals in #/basis/pakket/lichtkamer/einde-4de. */
  moment: LichtkamerMomentNaam;
  eindmoment: Eindmoment;
  /** De set waaruit de doelen komen. */
  set: string;
  /** De doelen van het moment, in de volgorde van de doelkaart. */
  doelen: readonly MinimumdoelSleutel[];
  manifest: PakketManifest;
  /** De oefeningen (de tegels van het kindscherm) met de bewijzen die ze leveren, in de volgorde van het prototype. */
  oefeningen: readonly { id: string; bewijzen: readonly string[] }[];
  /** De checkvragen, in de volgorde van de check. */
  check: readonly string[];
}

const EINDE_KLEUTER: LichtkamerMoment = {
  moment: 'einde-kleuter',
  eindmoment: 'K3',
  set: K,
  doelen: [D92730, D92729, D92734, D92735],
  manifest: {
    pakket: 'LKK',
    versies: [
      {
        versie: 1,
        bewijzen: [
          bw('k-bronnen', 'oefening', [D92730, D92729], [GLIMMEN]),
          bw('k-spiegel', 'oefening', [D92730]),
          // 92735 (redeneren met woorden) komt uit wat de leerkracht hoort in de kring, niet uit een klik.
          bw('k-kring', 'observatie', [D92735]),
          bw('k-schaduw', 'oefening', [D92734, D92729]),
          bw('kc1', 'check', [D92730], [GLIMMEN]),
          bw('kc2', 'check', [D92734], [KANT_LAMP]),
          bw('kc3', 'check', [D92730], [GEEN_SPIEGEL]),
        ],
      },
    ],
  },
  oefeningen: [
    { id: 'wie-maakt-licht', bewijzen: ['k-bronnen'] },
    { id: 'licht-bij-de-beer', bewijzen: ['k-spiegel', 'k-kring'] },
    { id: 'grote-en-kleine-schaduw', bewijzen: ['k-schaduw'] },
  ],
  check: ['kc1', 'kc2', 'kc3'],
};

const EINDE_4DE: LichtkamerMoment = {
  moment: 'einde-4de',
  eindmoment: 'L4',
  set: L4,
  doelen: [D92767, D92775, D92777],
  manifest: {
    pakket: 'LK4',
    versies: [
      {
        versie: 1,
        bewijzen: [
          bw('4-voorspel', 'oefening', [D92767], [KANT_LAMP]),
          bw('4-kaartjes', 'oefening', [D92767]),
          bw('4-meten', 'oefening', [D92775, D92777], [MEETLAT, METINGEN]),
          bw('4-besluit', 'oefening', [D92777], [CONCLUSIE]),
          bw('4c1', 'check', [D92767], [KANT_LAMP, RECHT_ACHTER]),
          bw('4c2', 'check', [D92767], [KLEINER, AFSTAND]),
          bw('4c3', 'check', [D92767], [EVEN_HOOG, BOCHT]),
        ],
      },
    ],
  },
  oefeningen: [
    { id: 'waar-valt-de-schaduw', bewijzen: ['4-voorspel'] },
    { id: 'drie-kaartjes', bewijzen: ['4-kaartjes'] },
    { id: 'onderzoek-schaduw', bewijzen: ['4-meten', '4-besluit'] },
  ],
  check: ['4c1', '4c2', '4c3'],
};

const EINDE_6DE: LichtkamerMoment = {
  moment: 'einde-6de',
  eindmoment: 'L6',
  set: L6,
  doelen: [D92833, D92836, D92849],
  manifest: {
    pakket: 'LK6',
    versies: [
      {
        versie: 1,
        bewijzen: [
          bw('6-stoffen', 'oefening', [D92833], [REFL_ABS, STOF]),
          bw('6-voorspel', 'oefening', [D92833]),
          bw('6-cyclus', 'oefening', [D92836]),
          bw('6-plan', 'oefening', [D92849], [MEER_DAN_EEN]),
          bw('6-herhaal', 'oefening', [D92849]),
          bw('6c1', 'check', [D92833], [GLAS_REFL, GLAS_ABS]),
          bw('6c2', 'check', [D92833], [REFL_ABS, DOOR_ABS]),
          bw('6c3', 'check', [D92849], [MEER_DAN_EEN, ANDERE_VRAAG]),
        ],
      },
    ],
  },
  oefeningen: [
    { id: 'stoffen-in-de-lichtstraal', bewijzen: ['6-stoffen', '6-voorspel'] },
    { id: 'onderzoek-gordijn', bewijzen: ['6-cyclus', '6-plan', '6-herhaal'] },
  ],
  check: ['6c1', '6c2', '6c3'],
};

/** Diep bevriezen: een manifest dat in de code staat, verandert nooit tijdens het draaien. */
function bevries<T>(x: T): T {
  if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) bevries(v);
  }
  return x;
}

/** De drie momenten van de Lichtkamer, van vroeg naar laat. */
export const LICHTKAMER_MOMENTEN: readonly LichtkamerMoment[] = bevries([EINDE_KLEUTER, EINDE_4DE, EINDE_6DE]);

/** De drie pakketmanifesten (LKK, LK4, LK6), voor maakBewijsIndex. */
export const LICHTKAMER_MANIFESTEN: readonly PakketManifest[] = LICHTKAMER_MOMENTEN.map((m) => m.manifest);

/** Het moment met dit adresdeel, of `undefined`. */
export function lichtkamerMoment(naam: string): LichtkamerMoment | undefined {
  return LICHTKAMER_MOMENTEN.find((m) => m.moment === naam);
}

/**
 * Bewaakt de samenhang van een moment met zijn manifest, zoals controleerBewijs in het prototype:
 * - elk bewijs van de nieuwste versie hoort bij precies één oefening of bij de check, en omgekeerd;
 * - de check bevat alleen bewijzen van de soort check, een oefening geen enkele;
 * - de doelen van het moment zijn precies de doelen van zijn bewijzen, allemaal uit de set van het moment.
 * Geeft de fouten als zinnen; een lege lijst betekent dat alles in orde is.
 */
export function controleerMoment(m: LichtkamerMoment): string[] {
  const fouten: string[] = [];
  const waar = `Lichtkamer ${m.moment}`;
  const versie = m.manifest.versies[m.manifest.versies.length - 1];
  const bewijzen = new Map(versie.bewijzen.map((b) => [b.id, b]));
  const gezien = new Map<string, string>();
  const onderdelen: { id: string; bewijzen: readonly string[]; isCheck: boolean }[] = [
    ...m.oefeningen.map((o) => ({ id: o.id, bewijzen: o.bewijzen, isCheck: false })),
    { id: 'check', bewijzen: m.check, isCheck: true },
  ];
  for (const o of onderdelen) {
    if (o.bewijzen.length === 0) fouten.push(`${waar}: ${o.id} levert geen enkel bewijs.`);
    for (const id of o.bewijzen) {
      const b = bewijzen.get(id);
      if (!b) {
        fouten.push(`${waar}: ${o.id} noemt bewijs '${id}', dat niet in het manifest staat.`);
        continue;
      }
      const al = gezien.get(id);
      if (al) fouten.push(`${waar}: bewijs '${id}' hoort bij ${al} en bij ${o.id}.`);
      gezien.set(id, o.id);
      if (o.isCheck && b.soort !== 'check') fouten.push(`${waar}: '${id}' staat in de check, maar is een ${b.soort}.`);
      if (!o.isCheck && b.soort === 'check') fouten.push(`${waar}: '${id}' is een checkvraag, maar staat bij de oefening ${o.id}.`);
    }
  }
  for (const id of bewijzen.keys()) if (!gezien.has(id)) fouten.push(`${waar}: bewijs '${id}' komt uit geen enkele oefening en niet uit de check.`);

  const vanBewijzen = new Set(versie.bewijzen.flatMap((b) => b.doelen.map((d) => (d.soort === 'minimumdoel' ? d.id : `go:${d.code}`))));
  const vanMoment = new Set(m.doelen.map((d) => d.id));
  for (const d of m.doelen) {
    if (d.set !== m.set) fouten.push(`${waar}: doel ${d.id} komt uit ${d.set}, niet uit ${m.set}.`);
    if (!vanBewijzen.has(d.id)) fouten.push(`${waar}: doel ${d.id} staat op de doelkaart, maar geen enkel bewijs telt ervoor.`);
  }
  for (const id of vanBewijzen) if (!vanMoment.has(id)) fouten.push(`${waar}: een bewijs telt voor ${id}, dat niet op de doelkaart staat.`);
  if (vanMoment.size !== m.doelen.length) fouten.push(`${waar}: een doel staat twee keer op de doelkaart.`);
  return fouten;
}
