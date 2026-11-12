// De checkvragen van 'einde 4de leerjaar' (4c1 tot 4c3) met hun nakijken. Zuivere code.
// De prenten bij de antwoorden (svg) horen bij de kijkdoos en het paneel (LK-6): daar hoort bij elke vraag
// en letter een prent. Hier staan de vraag, de antwoorden, het juiste antwoord en het foutpatroon.

export type CheckOptie = {
  /** Wat op de knop staat: 'A', 'groter', ... */
  t: string;
  /** Een uitgebreide naam voor de schermlezer en voor 'Het juiste antwoord is: ...'. */
  label?: string;
  juist?: true;
  /** Het foutpatroon dat deze keuze verraadt (voor de spiekkaart van de leerkracht). */
  fout?: string;
};

export type CheckVraag = {
  id: '4c1' | '4c2' | '4c3';
  /** Het doel in de Vlaamse minimumdoelen (92767: 'licht gaat rechtdoor'). */
  doel: string;
  vraag: string;
  uitleg?: string;
  opties: readonly CheckOptie[];
};

export const CHECKS_4: readonly CheckVraag[] = [
  {
    id: '4c1',
    doel: '92767',
    vraag: 'Van boven gezien: de zaklamp staat links voor het boompje. Waar valt de schaduw op het scherm?',
    opties: [
      { t: 'A', label: 'A: de schaduw valt links op het scherm', fout: 'schaduw aan de kant van de lamp' },
      { t: 'B', label: 'B: de schaduw valt recht achter het boompje', fout: 'schaduw altijd recht achter het voorwerp' },
      { t: 'C', label: 'C: de schaduw valt rechts op het scherm', juist: true },
    ],
  },
  {
    id: '4c2',
    doel: '92767',
    vraag: 'Je zet de zaklamp dichter bij het boompje. De schaduw op het scherm wordt …',
    opties: [
      { t: 'groter', juist: true },
      { t: 'kleiner', fout: 'verwacht een kleinere schaduw als de lamp dichterbij staat' },
      { t: 'even groot', fout: 'verwacht dat de afstand niets uitmaakt' },
    ],
  },
  {
    id: '4c3',
    doel: '92767',
    vraag: 'Van opzij gezien. Bij welke opstelling komt er licht op het scherm?',
    uitleg: 'De zaklamp staat links, hoog. Kaartje 1 staat het dichtst bij de lamp, kaartje 3 het dichtst bij het scherm.',
    opties: [
      { t: 'A', label: 'A: gaatje 1 hoog, gaatje 2 in het midden, gaatje 3 laag', juist: true },
      { t: 'B', label: 'B: de drie gaatjes zitten laag, even hoog', fout: 'zet de gaatjes even hoog, niet op één lijn met de lamp' },
      { t: 'C', label: 'C: gaatje 1 hoog, gaatje 2 laag, gaatje 3 hoog', fout: 'verwacht dat licht een bocht maakt' },
    ],
  },
];

export type CheckUitkomst = {
  vraagId: CheckVraag['id'];
  keuze: number;
  juist: boolean;
  fout: string | null;
  doel: string;
  juisteIdx: number;
  juisteTekst: string;
  soort: 'ok' | 'warn';
  titel: string;
  /** Alleen bij een fout antwoord: het juiste antwoord. */
  uitleg: string | null;
  /** Wat de voorleesstem zegt. */
  spreek: string;
  /** Het bewijs zoals het bewijsmodel het krijgt: het eerste antwoord telt. */
  bewijs: { juist: boolean; fout: string | null; doel: string; keuze: number };
};

export function juisteIndex(vraag: CheckVraag): number {
  return vraag.opties.findIndex((o) => o.juist);
}

/** Kijkt één antwoord na. `eerder` is waar als het kind de vraag al beantwoord had en we haar eerste antwoord tonen. */
export function kijkCheckNa(vraag: CheckVraag, keuze: number, eerder = false): CheckUitkomst {
  const optie = vraag.opties[keuze];
  if (!Number.isInteger(keuze) || !optie) throw new RangeError(`Keuze ${keuze} bestaat niet bij vraag ${vraag.id}.`);
  const juisteIdx = juisteIndex(vraag);
  const juistOptie = vraag.opties[juisteIdx] as CheckOptie;
  const juist = !!optie.juist;
  const juisteTekst = juistOptie.label ?? juistOptie.t;
  return {
    vraagId: vraag.id,
    keuze,
    juist,
    fout: optie.fout ?? null,
    doel: vraag.doel,
    juisteIdx,
    juisteTekst,
    soort: juist ? 'ok' : 'warn',
    titel: (eerder ? 'Je eerste antwoord telt: ' : '') + (eerder ? (juist ? 'juist.' : 'nog niet.') : juist ? 'Juist.' : 'Nog niet.'),
    uitleg: juist ? null : `Het juiste antwoord is ${juisteTekst}.`,
    spreek: juist ? 'Juist' : `Nog niet. Het juiste antwoord is ${juisteTekst}`,
    bewijs: { juist, fout: optie.fout ?? null, doel: vraag.doel, keuze },
  };
}
