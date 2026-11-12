// 'Wat ik al kan': per doel een vorm en een woord (toont het, nog wankel, nog niet, nog geen bewijs). De vorm komt uit
// css (.b-lk-st-<vorm>), het woord uit STATUS_TEKST. Werkt ook zonder 3D-kijkdoos.

import type { Ref } from 'react';
import { watIkKan, type BewijsStand } from '../../../lib/basis/lichtkamer/les';

export function WatIkKan({ stand, kop = true, kopRef }: { stand: BewijsStand; kop?: boolean; kopRef?: Ref<HTMLHeadingElement> }) {
  const rijen = watIkKan(stand);
  return (
    <section className="b-lk-kan" aria-labelledby="lk-kan-kop">
      {kop ? (
        <h2 id="lk-kan-kop" ref={kopRef} tabIndex={-1}>
          Wat ik al kan
        </h2>
      ) : (
        <h3 id="lk-kan-kop">Wat ik al kan</h3>
      )}
      <ul className="b-lk-kan-lijst">
        {rijen.map((r) => (
          <li key={r.id} className="b-lk-kan-rij" data-doel={r.id}>
            <span className="b-lk-kan-doel">{r.kind}</span>
            <span className={`b-lk-st b-lk-st-${r.vorm}`}>{r.woord}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
