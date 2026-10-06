import { WarningIcon } from '../icons';

/**
 * Meldt eerlijk dat het klasfilter inzendingen verbergt, met een knop om ze
 * weer te tonen. Zonder deze melding lijkt een leeg scherm "er is niets
 * ingediend", terwijl het werk gewoon op het toestel staat.
 */
export function ClassFilterNotice({ hidden, onShowAll }: { hidden: number; onShowAll: () => void }) {
  if (hidden <= 0) return null;
  return (
    <div className="callout warn" role="status" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <WarningIcon size={18} aria-hidden style={{ flex: 'none' }} />
      <span style={{ flex: '1 1 240px' }}>
        {hidden} {hidden === 1 ? 'inzending is' : 'inzendingen zijn'} verborgen door het klasfilter.
      </span>
      <button type="button" className="btn btn-sm btn-ghost" style={{ flex: 'none' }} onClick={onShowAll}>
        Toon alle klassen
      </button>
    </div>
  );
}
