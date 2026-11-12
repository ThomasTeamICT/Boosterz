// 'Wat ik al kan': per doel van het manifest een status uit de bewijzen van het kind. Zuiver.
// De vier standen (toont het, nog wankel, nog niet, nog geen bewijs) komen uit statusVoor van het bewijsmodel; op het
// scherm staan ze met een vorm én een woord, nooit alleen met een kleur.

import { statusVoor, STATUS_TEKST, type BewijsStatus } from '../../bewijs/bewijs';
import { lichtkamerMoment, type LichtkamerMomentNaam } from '../../bewijs/lichtkamerManifest';
import { bewijsSleutel, maakBewijsIndex, type BewijsIndex } from '../../bewijs/pakket';
import { SPIEKKAART } from '../lesmateriaal';
import type { BewijsStand } from './bewijsOntvanger';

export type StatusVorm = 'toont' | 'wankel' | 'niet' | 'leeg';

/** De naam van de css-vorm (.b-lk-st-<vorm>) bij elke stand. */
export const STATUS_VORM: Readonly<Record<BewijsStatus, StatusVorm>> = {
  'toont-het': 'toont',
  'nog-wankel': 'wankel',
  'nog-niet': 'niet',
  'nog-geen-bewijs': 'leeg',
};

export type DoelRij = {
  /** Het nummer van het minimumdoel in de set. */
  id: string;
  /** De zin in kindertaal. */
  kind: string;
  status: BewijsStatus;
  /** Het woord bij de status: 'toont het', 'nog wankel', 'nog niet' of 'nog geen bewijs'. */
  woord: string;
  vorm: StatusVorm;
};

const indexen = new Map<string, BewijsIndex>();
function indexVoor(moment: LichtkamerMomentNaam): BewijsIndex | null {
  const m = lichtkamerMoment(moment);
  if (!m) return null;
  let i = indexen.get(moment);
  if (!i) {
    i = maakBewijsIndex([m.manifest]);
    indexen.set(moment, i);
  }
  return i;
}

/** De rijen van 'Wat ik al kan' voor een moment, in de volgorde van de doelkaart. */
export function watIkKan(stand: BewijsStand, moment: LichtkamerMomentNaam = 'einde-4de'): DoelRij[] {
  const m = lichtkamerMoment(moment);
  const index = indexVoor(moment);
  if (!m || !index) return [];
  const geldend = new Map<string, { juist: boolean }>();
  for (const id of Object.keys(stand)) geldend.set(bewijsSleutel(m.manifest.pakket, id), { juist: (stand[id] as { juist: boolean }).juist });
  return m.doelen.map((doel) => {
    const status = statusVoor(doel, geldend, index);
    return {
      id: doel.id,
      kind: SPIEKKAART.doelen.find((d) => d.id === doel.id)?.kind ?? '',
      status,
      woord: STATUS_TEKST[status],
      vorm: STATUS_VORM[status],
    };
  });
}
