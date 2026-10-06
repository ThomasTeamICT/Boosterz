import { describe, expect, it } from 'vitest';
import type { InboxReport, InboxRow } from '../../lib/inbox';
import { importOutcome } from './importOutcome';

function rij(index: number, outcome: InboxRow['outcome'], saved: boolean, message = ''): InboxRow {
  return {
    index, outcome, kind: 'widget', saved, studentName: `Leerling ${index}`, className: null, title: null,
    detail: '', message, code: 'WF1.x', at: null,
  };
}
function verslag(rows: InboxRow[]): InboxReport {
  const tel = (o: InboxRow['outcome']) => rows.filter((r) => r.outcome === o).length;
  return { rows, nieuw: tel('nieuw'), dubbel: tel('dubbel'), onbekend: tel('onbekend'), ongeldig: tel('ongeldig') };
}

describe('importOutcome', () => {
  it('is netjes als alles nieuw is en bij deze widget hoort: kort melden en sluiten', () => {
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'nieuw', true)]), 2);
    expect(out).toMatchObject({ saved: 2, elsewhere: 0, clean: true, summary: '2 nieuw', problems: [] });
  });

  it('laat niets stil verdwijnen: dubbel en ongeldig krijgen elk een regel', () => {
    const out = importOutcome(
      verslag([rij(1, 'nieuw', true), rij(2, 'dubbel', false, 'Stond hier al'), rij(3, 'ongeldig', false, 'Afgebroken')]),
      1
    );
    expect(out.clean).toBe(false);
    expect(out.summary).toBe('1 nieuw, 1 al aanwezig, 1 ongeldig');
    expect(out.problems.map((r) => r.index)).toEqual([2, 3]);
  });

  it('merkt werk op dat bij een andere widget is bewaard', () => {
    // twee codes bewaard, maar voor deze widget kwam er maar één bij
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'nieuw', true)]), 1);
    expect(out.saved).toBe(2);
    expect(out.elsewhere).toBe(1);
    expect(out.clean).toBe(false);
    expect(out.problems).toEqual([]);
  });

  it('is niet netjes als er niets bewaard werd', () => {
    const out = importOutcome(verslag([rij(1, 'dubbel', false, 'Stond hier al')]), 0);
    expect(out).toMatchObject({ saved: 0, elsewhere: 0, clean: false, summary: '0 nieuw, 1 al aanwezig' });
  });

  it('telt een onbekende widget mee als bewaard maar niet als netjes', () => {
    const out = importOutcome(verslag([rij(1, 'onbekend', true, 'Bewaard, maar deze widget staat niet op dit toestel')]), 0);
    expect(out.saved).toBe(1);
    expect(out.elsewhere).toBe(1);
    expect(out.clean).toBe(false);
    expect(out.problems).toHaveLength(1);
  });
});
