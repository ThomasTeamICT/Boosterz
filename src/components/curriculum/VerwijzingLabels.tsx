// Verwijzingen van een leerplandoel naar officiële minimumdoelen, als kleine labels ("→ 09.01").
// De set staat in een `title` en, voor schermlezers, in verborgen tekst. Mét `onRemove` heeft elk
// label een knop om de verwijzing te verwijderen.

import type { MinimumdoelRef } from '../../lib/curriculumTypes';
import { CloseIcon } from '../icons';
import '../../styles/doelenlijst.css';

export function VerwijzingLabel({ verwijzing, onRemove }: { verwijzing: MinimumdoelRef; onRemove?: () => void }) {
  const uitleg = `Verwijst naar minimumdoel ${verwijzing.code} in set ${verwijzing.set}`;
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

export function VerwijzingLabels({ verwijzingen, onRemove }: { verwijzingen?: readonly MinimumdoelRef[]; onRemove?: (i: number) => void }) {
  if (!verwijzingen || verwijzingen.length === 0) return null;
  return (
    <>
      {verwijzingen.map((r, i) => (
        <VerwijzingLabel key={`${r.set}:${r.id}`} verwijzing={r} onRemove={onRemove ? () => onRemove(i) : undefined} />
      ))}
    </>
  );
}
