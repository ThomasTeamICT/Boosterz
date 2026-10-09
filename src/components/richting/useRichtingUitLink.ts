// De studierichting uit de link van een wizard (?richting=…&jaar=…&soort=…), geladen: de matrix, de koppeling, de index met
// minimumdoelen en het kader van de richting. Een dunne hook op `useRichtingGegevens` en `useRichtingKader`; wat de
// pagina's met de link doen (de keuze, de titel, het bewaren) staat in lib/richtingLink.ts. Hier staat ook de focus na
// "Verder zonder studierichting", want die knop hoort bij dezelfde link.

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { richtingInfo, type RichtingInfo, type RichtingKader, type RichtingKeuze } from '../../lib/richtingKader';
import { komtVanVerderZonderRichting, vandaag, type RichtingLink } from '../../lib/richtingLink';
import { useRichtingGegevens, useRichtingKader } from './useRichtingGegevens';

export type RichtingUitLink =
  | { status: 'laden' }
  | { status: 'fout'; fout: string; opnieuw: () => void }
  /** De matrix kent de richting niet (meer): de pagina begint met een melding en een lege keuze. */
  | { status: 'onbekend'; sets: readonly MinimumdoelenIndexSet[] }
  | { status: 'klaar'; sets: readonly MinimumdoelenIndexSet[]; info: RichtingInfo; kader: RichtingKader };

export function useRichtingUitLink(link: RichtingLink): RichtingUitLink {
  const gegevens = useRichtingGegevens();
  const waarde = gegevens.stand.status === 'klaar' ? gegevens.stand.waarde : undefined;
  const info = useMemo(() => (waarde ? richtingInfo(waarde.matrix, link.groep, vandaag()) : undefined), [waarde, link.groep]);
  const keuze = useMemo<RichtingKeuze | undefined>(
    () => (info ? { groep: link.groep, ...(link.jaar !== undefined ? { jaar: link.jaar } : {}), soort: link.soort } : undefined),
    [info, link],
  );
  const kader = useRichtingKader(info, keuze);

  if (gegevens.stand.status === 'fout') return { status: 'fout', fout: gegevens.stand.fout, opnieuw: gegevens.opnieuw };
  if (!waarde) return { status: 'laden' };
  if (!info) return { status: 'onbekend', sets: waarde.index.sets };
  if (kader.stand.status === 'fout') return { status: 'fout', fout: kader.stand.fout, opnieuw: kader.opnieuw };
  if (kader.stand.status === 'laden') return { status: 'laden' };
  return { status: 'klaar', sets: waarde.index.sets, info, kader: kader.stand.waarde.kader };
}

/**
 * Na "Verder zonder studierichting" verdwijnt de knop waarop de focus stond (de link met de richting is weg): de focus gaat
 * naar de kop van de pagina, niet naar de body. De router-state die dat vraagt, wordt daarna gewist: een history-item
 * bewaart ze ook bij een herlading en bij terug en vooruit, en dan zou de focus (en het scrollen) springen terwijl de
 * leerkracht niet van die knop komt.
 */
export function useFocusNaVerderZonderRichting(kop: RefObject<HTMLElement>): void {
  const { state, pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const nogTeDoen = useRef(komtVanVerderZonderRichting(state));
  useEffect(() => {
    if (!nogTeDoen.current) return;
    nogTeDoen.current = false;
    kop.current?.focus();
    navigate({ pathname, search, hash }, { replace: true, state: null });
  }, [kop, navigate, pathname, search, hash]);
}
