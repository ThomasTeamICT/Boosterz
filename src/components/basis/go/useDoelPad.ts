// Het adres van de doelpagina waar een koppeling van het GO! naartoe gaat. Het leerplan verwijst altijd naar de gewone
// minimumdoelen; wie het buitengewoon basisonderwijs koos, komt bij een klik op de tweeling met hetzelfde nummer.
// Roep deze hook één keer per scherm aan en geef de functie door: per chip zou elke instantie de laadstand volgen.

import { useMemo } from 'react';
import { basisPad } from '../../../lib/basis/basisRoutes';
import { bubaoSetVan } from '../../../lib/basis/go/tweeling';
import { useBasisIndex } from '../useBasisSets';
import { useBasisKeuze } from '../useBasisKeuze';

export type DoelPad = (r: { set: string; id: string }) => string;

export function useDoelPad(): DoelPad {
  const { keuze } = useBasisKeuze();
  const index = useBasisIndex();
  const sets = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  const bubao = keuze?.soort === 'bubao';
  const kaart = useMemo(() => (bubao && sets ? bubaoSetVan(sets) : undefined), [bubao, sets]);
  return useMemo<DoelPad>(
    () => (r) => basisPad({ s: 'doel', setId: kaart?.get(r.set) ?? r.set, doelId: r.id }),
    [kaart],
  );
}
