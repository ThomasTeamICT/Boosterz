// Het antwoord op 'Wat geldt voor mijn leerjaar?' (docs/basisonderwijs/INGANG.md, scherm #/basis/leerjaar/...): een laag
// op setsDieGelden van het momentmodel. Ze groepeert de sets per vak, zoekt de vakken zonder nieuwe set, houdt de oude
// doelen apart en levert de zinnen die het scherm alleen toont als de gegevens ze staven.
//
// Zuiver: geen React, geen opslag en nergens de klok. Het schooljaar is een parameter. Er wordt geen koppeling gemaakt
// tussen oude en nieuwe doelen: de bron legt die niet vast, en dit bestand zegt dus nergens welke oude set door welke
// nieuwe wordt vervangen.

import type { MinimumdoelenIndexSet } from '../minimumdoelen';
import { vakkenOpMoment, telPerSoort } from './doelBasis';
import {
  INVOERINGSKALENDER,
  WERKT_NAAR,
  type Eindmoment,
  type Invoeringskalender,
  type KalenderVak,
  type LeerjaarBasis,
  type Schooljaar,
  type SoortBasis,
  type Zekerheid,
} from './kalender';
import { laagsteZekerheid, setsDieGelden, type Geldend, type SoortDoelen } from './moment';

export interface VakRegel {
  vak: KalenderVak;
  status: 'verplicht' | 'mag';
  sets: Geldend[];
  /** De som van het aantal doelen van de sets. */
  aantal: number;
  perSoort: { soort: SoortDoelen; aantal: number }[];
  /** De laagste zekerheid over de sets van het vak. */
  zekerheid: Zekerheid;
  /** Alleen bij 'mag': het eerste schooljaar waarin het vak verplicht wordt, als de kalender dat weet. */
  verplichtVanaf?: Schooljaar;
}

export interface LeerjaarOverzicht {
  soort: SoortBasis;
  leerjaar: LeerjaarBasis;
  schooljaar: Schooljaar;
  /** Het eindmoment waar het leerjaar naartoe werkt. */
  eindmoment: Eindmoment;
  /** Nieuwe sets die dit schooljaar verplicht zijn, per vak. */
  verplicht: VakRegel[];
  /** Nieuwe sets die al mogen maar nog niet verplicht zijn, per vak. */
  magAl: VakRegel[];
  /** De vakken die op dit eindmoment geen nieuwe set hebben (volgens de index). */
  zonderNieuweSet: KalenderVak[];
  /** De oude sets die dit schooljaar nog gelden, in de volgorde van de index. */
  oud: Geldend[];
  /** Schijnsets zonder doelen die voor dit leerjaar gelden. */
  leeg: MinimumdoelenIndexSet[];
  zekerheid: Zekerheid;
  /** Het aantal doelen en vakken van de nieuwe sets (verplicht en mag al samen) op het eindmoment. */
  aantalDoelen: number;
  aantalVakken: number;
  /** De unieke opmerkingen van de invoering voor dit leerjaar (bv. over het getuigschrift), in volgorde van voorkomen. */
  opmerkingen: string[];
  /** Werkt dit leerjaar naar een later eindmoment? Dan legt het leerplan van het net de tussenstappen vast. */
  tussenstappen: boolean;
  /** Zijn alle nieuwe sets (minstens één) 'na te streven'? Dan mag het scherm dat als één zin zeggen. */
  alleNastreven: boolean;
}

function regelsVan(lijst: readonly Geldend[], status: VakRegel['status']): VakRegel[] {
  const perVak = new Map<number, Geldend[]>();
  for (const g of lijst) {
    const nr = g.info.vak?.nr;
    if (nr === undefined) continue;
    perVak.set(nr, [...(perVak.get(nr) ?? []), g]);
  }
  return [...perVak.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, sets]) => {
      const regel: VakRegel = {
        vak: sets[0].info.vak as KalenderVak,
        status,
        sets,
        aantal: sets.reduce((som, g) => som + g.set.aantal, 0),
        perSoort: telPerSoort(sets.map((g) => ({ soortDoelen: g.info.soortDoelen, aantal: g.set.aantal }))),
        zekerheid: laagsteZekerheid(sets.map((g) => g.invoering.zekerheid)),
      };
      const vanaf = sets.find((g) => g.invoering.verplichtVanaf !== undefined)?.invoering.verplichtVanaf;
      if (status === 'mag' && vanaf !== undefined) regel.verplichtVanaf = vanaf;
      return regel;
    });
}

/**
 * Wat er voor een leerjaar in een schooljaar geldt. Een laag op setsDieGelden: dezelfde sets, dezelfde zekerheid.
 * De lijsten verplicht en magAl zijn gegroepeerd per vak, in vakvolgorde.
 */
export function leerjaarOverzicht(
  alle: readonly MinimumdoelenIndexSet[],
  leerjaar: { soort: SoortBasis; leerjaar: LeerjaarBasis },
  schooljaar: Schooljaar,
  k: Invoeringskalender = INVOERINGSKALENDER,
): LeerjaarOverzicht {
  const g = setsDieGelden(alle, { soort: leerjaar.soort, leerjaar: leerjaar.leerjaar, schooljaar }, k);
  const eindmoment = WERKT_NAAR[leerjaar.leerjaar];
  const verplicht = regelsVan(g.verplicht, 'verplicht');
  const magAl = regelsVan(g.magAl, 'mag');

  const metSet = new Set(vakkenOpMoment(alle, leerjaar.soort, eindmoment).map((v) => v.vak.nr));
  const zonderNieuweSet = k.vakken.filter((v) => !metSet.has(v.nr));

  const opmerkingen: string[] = [];
  for (const x of [...g.verplicht, ...g.magAl, ...g.geldtNog]) {
    const o = x.invoering.opmerking;
    if (o && !opmerkingen.includes(o)) opmerkingen.push(o);
  }

  const nieuw = [...g.verplicht, ...g.magAl];
  return {
    soort: leerjaar.soort,
    leerjaar: leerjaar.leerjaar,
    schooljaar,
    eindmoment,
    verplicht,
    magAl,
    zonderNieuweSet,
    oud: g.geldtNog,
    leeg: g.leeg,
    zekerheid: g.zekerheid,
    aantalDoelen: nieuw.reduce((som, x) => som + x.set.aantal, 0),
    aantalVakken: new Set(nieuw.map((x) => x.info.vak?.nr)).size,
    opmerkingen,
    tussenstappen: leerjaar.leerjaar !== eindmoment,
    alleNastreven: nieuw.length > 0 && nieuw.every((x) => x.info.soortDoelen === 'nastreven'),
  };
}

// ─── Zinnen die het model staaft ────────────────────────────────────────────

/** Het woord voor de oude doelen van deze lijst: 'eindtermen', 'ontwikkelingsdoelen' of, bij een mengeling, 'doelen'. */
export function oudeDoelenWoord(oud: readonly Geldend[]): 'eindtermen' | 'ontwikkelingsdoelen' | 'doelen' {
  const soorten = new Set(oud.map((g) => g.info.soortDoelen));
  if (soorten.size === 1 && soorten.has('eindtermen')) return 'eindtermen';
  if (soorten.size === 1 && soorten.has('ontwikkelingsdoelen')) return 'ontwikkelingsdoelen';
  return 'doelen';
}

export interface LeerjaarZinnen {
  /** De kop boven de verplichte vakken. */
  verplichtKop: string;
  /** Een zin onder die kop als er niets verplicht is; anders undefined. */
  geenVerplichtZin?: string;
  /** Alleen als er niets meer 'mag al' is en alles verplicht is. */
  alleVerplichtZin?: string;
  /** Onder de kop 'Mag al', alleen als er oude doelen zijn die nog gelden. */
  magAlZin?: string;
  /** De zin voor de vakken zonder nieuwe set, uit de index afgeleid; zegt niets over oude doelen. */
  zonderNieuweSetZin?: string;
  /** De tussenstappen, alleen voor een leerjaar vóór het eindmoment. */
  tussenstappenZin?: string;
}

const EINDE_TEKST: Readonly<Record<Eindmoment, string>> = {
  K3: 'het einde van het kleuteronderwijs',
  L4: 'het einde van het 4de leerjaar',
  L6: 'het einde van het 6de leerjaar',
};

function opsomming(namen: readonly string[]): string {
  return namen.length <= 1 ? namen.join('') : `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
}

/**
 * De vaste zinnen van het scherm, zonder een kopje of zin die niets te zeggen heeft:
 * - 'Mag al' en 'Oude doelen' hebben geen zin of kop van hier als hun lijst leeg is (het scherm kijkt naar de lijst);
 * - is alles verplicht, dan staat er 'Alle vakken zijn dit schooljaar verplicht.';
 * - de zin over oude doelen staat er alleen als die lijst bestaat en noemt geen vak of set: welke oude doelen
 *   gelden, staat in de lijst zelf.
 */
export function leerjaarZinnen(o: LeerjaarOverzicht): LeerjaarZinnen {
  const zinnen: LeerjaarZinnen = {
    verplichtKop: o.verplicht.length > 0 ? 'Dit schooljaar verplicht' : 'Dit schooljaar zijn nog geen nieuwe doelen verplicht',
  };
  if (o.verplicht.length === 0 && o.oud.length > 0) {
    zinnen.geenVerplichtZin = `Voor dit leerjaar gelden dit schooljaar nog de oude ${oudeDoelenWoord(o.oud)} (hieronder).`;
  }
  if (o.verplicht.length > 0 && o.magAl.length === 0) zinnen.alleVerplichtZin = 'Alle vakken zijn dit schooljaar verplicht.';
  if (o.magAl.length > 0 && o.oud.length > 0) {
    zinnen.magAlZin = 'Tot dan mogen de oude doelen nog. Welke oude doelen nog gelden, staat hieronder.';
  }
  if (o.zonderNieuweSet.length > 0) {
    const namen = opsomming(o.zonderNieuweSet.map((v) => v.naam));
    zinnen.zonderNieuweSetZin = `${namen} ${o.zonderNieuweSet.length === 1 ? 'heeft' : 'hebben'} geen nieuwe doelen voor ${EINDE_TEKST[o.eindmoment]}.`;
  }
  if (o.tussenstappen) zinnen.tussenstappenZin = 'Het leerplan van je net legt de tussenstappen vast.';
  return zinnen;
}
