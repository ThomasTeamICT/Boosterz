// Waar vind je het leerplan van je net? Gedeeld door de wegwijzer op de leerplannenpagina en de
// inleeswizard (stap 1), zodat de links en de uitleg op één plaats staan.
//
// Boosterz haalt de leerplannen van de netten niet zelf op: ze zijn auteursrechtelijk beschermd en
// niet vrij op te vragen vanuit een browser. De leerkracht haalt het leerplan zelf op en leest het in.

import { CURRICULUM_NETS, type CurriculumNet } from './curriculumTypes';

export interface NetLink {
  /** Naam van het net, zoals de leerkracht het kent. */
  naam: string;
  url: string;
  /** Het adres zoals het op het scherm staat. */
  tekst: string;
}

/** De sites waar de netten hun leerplannen publiceren. */
export const NET_LINKS: readonly NetLink[] = [
  { naam: 'GO!', url: 'https://pro.g-o.be', tekst: 'pro.g-o.be' },
  { naam: 'Katholiek Onderwijs Vlaanderen', url: 'https://pro.katholiekonderwijs.vlaanderen', tekst: 'pro.katholiekonderwijs.vlaanderen' },
  { naam: 'OVSG', url: 'https://www.ovsg.be', tekst: 'www.ovsg.be' },
  { naam: 'POV', url: 'https://www.pov.be', tekst: 'www.pov.be' },
];

/** Welke link hoort bij welk net? 'Eigen' heeft er geen. */
const LINK_PER_NET: Partial<Record<CurriculumNet, number>> = { go: 0, kov: 1, ovsg: 2, pov: 3 };

export function netLinkVoor(net: CurriculumNet | ''): NetLink | undefined {
  const i = net === '' ? undefined : LINK_PER_NET[net];
  return i === undefined ? undefined : NET_LINKS[i];
}

export const LEERPLANCODE_TIP =
  'Vraag je vakwerkgroep of coördinator welk leerplan je school volgt. De leerplancode staat meestal op de eerste bladzijde (bv. “I-Aar-a”).';

export const AUTEURSRECHT_TIP =
  'Boosterz haalt die leerplannen niet zelf op: ze zijn auteursrechtelijk beschermd. Alles wat je inleest, blijft op dit toestel.';

/** Een net zoals de leerkracht het kiest in de inleeswizard. */
export interface NetKeuze {
  id: CurriculumNet;
  label: string;
  /** Korte naam voor in een titel: "KOV". Leeg voor 'eigen'. */
  kort: string;
}

const KORT: Partial<Record<CurriculumNet, string>> = { go: 'GO!', kov: 'KOV', ovsg: 'OVSG', pov: 'POV' };
const LABEL: Partial<Record<CurriculumNet, string>> = { go: 'GO!', ovsg: 'OVSG', pov: 'POV', eigen: 'Eigen of ander' };

/**
 * De netten in de inleeswizard: alles uit `CURRICULUM_NETS` behalve "minimumdoelen" (die haal je
 * rechtstreeks uit de officiële minimumdoelen, niet uit een leerplan van een net).
 */
export const NET_KEUZES: readonly NetKeuze[] = CURRICULUM_NETS.filter((n) => n.id !== 'minimumdoelen').map((n) => ({
  id: n.id,
  label: LABEL[n.id] ?? n.label,
  kort: KORT[n.id] ?? '',
}));
