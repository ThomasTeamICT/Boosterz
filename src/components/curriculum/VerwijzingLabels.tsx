// Verwijzingen van een leerplandoel naar officiële minimumdoelen, als kleine labels ("→ 09.01").
// Een schermlezer hoort "Verwijst naar minimumdoel 09.01", met de naam van de set erbij als die gekend is
// (zonder het nummer van de set: dat zegt een leerkracht niets). Mét `onRemove` heeft elk label een knop om
// de verwijzing te verwijderen.

import type { MinimumdoelRef } from '../../lib/curriculumTypes';
import { CloseIcon } from '../icons';
import '../../styles/doelenlijst.css';

/** De naam van een set (bv. "Ruimtelijk bewustzijn"), op set-id; `undefined` als die niet gekend is. */
export type SetNaamVan = (setId: string) => string | undefined;

/** "Verwijst naar minimumdoel 09.01" of, met naam, "Verwijst naar minimumdoel 09.01 (Ruimtelijk bewustzijn)". */
export function verwijzingUitleg(verwijzing: MinimumdoelRef, setNaam?: string): string {
  const naam = setNaam?.trim();
  return `Verwijst naar minimumdoel ${verwijzing.code}${naam ? ` (${naam})` : ''}`;
}

export function VerwijzingLabel({ verwijzing, setNaam, onRemove }: { verwijzing: MinimumdoelRef; setNaam?: string; onRemove?: () => void }) {
  const uitleg = verwijzingUitleg(verwijzing, setNaam);
  return (
    <span className="dl-ref" title={uitleg}>
      <span aria-hidden="true">→ {verwijzing.code}</span>
      <span className="sr-only">{uitleg}</span>
      {onRemove && (
        <button type="button" className="dl-ref-x" aria-label={`Verwijzing ${verwijzing.code} verwijderen`} onClick={onRemove}>
          <CloseIcon size={14} />
        </button>
      )}
    </span>
  );
}

export function VerwijzingLabels({
  verwijzingen, setNaamVan, onRemove,
}: {
  verwijzingen?: readonly MinimumdoelRef[];
  setNaamVan?: SetNaamVan;
  onRemove?: (i: number) => void;
}) {
  if (!verwijzingen || verwijzingen.length === 0) return null;
  return (
    <>
      {verwijzingen.map((r, i) => (
        <VerwijzingLabel key={`${r.set}:${r.id}`} verwijzing={r} setNaam={setNaamVan?.(r.set)} onRemove={onRemove ? () => onRemove(i) : undefined} />
      ))}
    </>
  );
}
