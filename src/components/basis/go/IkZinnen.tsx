// De ik-zinnen van één ik-doel als lijst, één item per zin, zoals ze in de bron staan (elke zin een eigen opsommingsteken).
// De zinnen blijven letterlijk. Bevat een zin een regeleinde (LP0087, WT.021: "… zoogdieren.\nvb. “Het dier …”"), dan komt
// daar een <br /> in plaats van een spatie.

import { Fragment } from 'react';

export function IkZinnen({ zinnen, className }: { zinnen: readonly string[]; className: string }) {
  return (
    <ul className={className}>
      {zinnen.map((zin, n) => (
        <li key={n}>
          {zin.split('\n').map((deel, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {deel}
            </Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}
