// De teksten van de oefeningen van het schaduwtheater (einde 4de leerjaar), letterlijk uit het prototype
// (tools/prototypes/lichtkamer/lichtkamer.html, TAKEN[4]), met 30, 15 en 10 cm in plaats van 30, 20 en 10 cm.
// Zuiver: alleen gegevens en kleine tekstfuncties.

import { NAAM_VOORWERP, type Voorwerp } from '../schaduw';
import { STANDAARD_AFSTANDEN, type Conclusie, type Hypothese } from '../onderzoek';
import type { LesOefening } from '../lesmateriaal';

/** De volgorde van de oefeningen, ook voor PageDown en PageUp op het bord (zoals TAKEN[4] in het prototype). */
export const OEFENING_VOLGORDE: readonly LesOefening[] = ['waar-valt-de-schaduw', 'drie-kaartjes', 'onderzoek-schaduw'];

export interface OefeningTekst {
  /** De kop (h2) van de oefening. */
  titel: string;
  /** Het korte zinnetje bij de kijkdoos. */
  hint: string;
  stappen: readonly string[];
  /** Wat de voorleesstem zegt als de oefening opent. */
  zeg: string;
}

const lijstAfstanden = (): string => {
  const a = [...STANDAARD_AFSTANDEN];
  return `${a.slice(0, -1).join(', ')} en ${a[a.length - 1]}`;
};

/** `bord`: de teksten van het digibord (daar is er een knop 'Toon de uitkomst'; het kind tikt zelf op een letter). */
export function oefeningTekst(oefening: LesOefening, voorwerp: Voorwerp = 'boom', bord = false): OefeningTekst {
  const naam = NAAM_VOORWERP[voorwerp];
  switch (oefening) {
    case 'waar-valt-de-schaduw':
      return {
        titel: 'Waar valt de schaduw?',
        hint: bord ? 'Voorspel eerst, toon daarna' : 'Voorspel eerst, kijk daarna',
        stappen: [
          'Kijk waar de zaklamp staat.',
          'Voorspel: valt de schaduw bij A, B of C?',
          bord ? 'Toon de schaduw en de lichtstralen. Klopte je voorspelling?' : 'Tik op een letter. Dan zie je de schaduw en de lichtstralen. Klopte je voorspelling?',
        ],
        zeg: 'Kijk waar de zaklamp staat. Voorspel waar de schaduw valt.',
      };
    case 'drie-kaartjes':
      return {
        titel: 'Drie kaartjes met een gaatje',
        hint: 'Verzet de gaatjes in het paneel',
        stappen: [
          'Zet de gaatjes zo dat het licht op het scherm komt.',
          'Lukt het ook als de zaklamp hoger of lager staat?',
          'Hoe moeten de lamp, de gaatjes en het scherm staan, zodat er licht op het scherm komt?',
        ],
        zeg: 'Zet de gaatjes zo, dat het licht op het scherm komt.',
      };
    case 'onderzoek-schaduw':
      return {
        titel: 'Onderzoek: lamp dichterbij, schaduw groter?',
        hint: `Kies ${[...STANDAARD_AFSTANDEN].sort((a, b) => a - b).join(', ')} cm en lees de meetlat`,
        stappen: [
          'Lees de onderzoeksvraag en kies je hypothese.',
          `Meet drie keer: zet de zaklamp op ${lijstAfstanden()} cm van het ${naam} en lees de schaduw af op de meetlat.`,
          'Noteer de metingen en kies je conclusie.',
        ],
        zeg: 'Lees de onderzoeksvraag. Kies wat jij denkt. Meet daarna drie keer.',
      };
  }
}

/** De klaargezette onderzoeksvraag, wat je verandert en wat je gelijk houdt. */
export function onderzoekOpzet(voorwerp: Voorwerp = 'boom'): { vraag: string; verandert: string; gelijk: string } {
  const naam = NAAM_VOORWERP[voorwerp];
  return {
    vraag: `Wordt de schaduw van het ${naam} groter als de zaklamp dichterbij staat?`,
    verandert: `de afstand tussen zaklamp en ${naam}.`,
    gelijk: `de zaklamp, de hoogte van de zaklamp, het ${naam} en het scherm.`,
  };
}

export const HYPOTHESE_TEKST: Readonly<Record<Hypothese, string>> = {
  groter: 'De schaduw wordt groter.',
  kleiner: 'De schaduw wordt kleiner.',
  gelijk: 'De schaduw blijft even groot.',
};

export const CONCLUSIE_TEKST: Readonly<Record<Conclusie, string>> = {
  'dichter-groter': 'Hoe dichter de zaklamp, hoe groter de schaduw.',
  'dichter-kleiner': 'Hoe dichter de zaklamp, hoe kleiner de schaduw.',
  geen: 'De afstand maakt niets uit.',
};

export const KLASVRAAG_TEKST: Readonly<Record<'waar-valt-de-schaduw' | 'drie-kaartjes', { tekst: string; opties: readonly string[] }>> = {
  'waar-valt-de-schaduw': { tekst: 'Waar valt de schaduw?', opties: ['A', 'B', 'C'] },
  'drie-kaartjes': { tekst: 'Komt het licht op het scherm?', opties: ['Ja', 'Nee'] },
};
