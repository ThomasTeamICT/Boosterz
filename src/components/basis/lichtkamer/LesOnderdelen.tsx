// Kleine onderdelen die de panelen van de Lichtkamer delen: de terugkoppeling en het merkteken bij juist of fout.
// Een vorm en een woord staan er altijd bij, nooit alleen een kleur.

import type { ReactNode } from 'react';
import { CheckIcon, CloseIcon, InfoIcon, WarningIcon } from '../../icons';

export type FbSoort = 'ok' | 'warn' | 'info';

const FB_ICOON = { ok: CheckIcon, warn: WarningIcon, info: InfoIcon } as const;

/**
 * De terugkoppeling bij een oefening. Het omhulsel (role="status") staat er ook als er niets te zeggen valt, zodat een
 * schermlezer de tekst oppikt die erin komt.
 */
export function Terugkoppeling({ soort, titel, uitleg, extra }: { soort: FbSoort | null; titel?: string; uitleg?: string | null; extra?: ReactNode }) {
  if (soort === null) return <div role="status" className="b-lk-fb-houder" />;
  const Icoon = FB_ICOON[soort];
  return (
    <div role="status" className="b-lk-fb-houder">
      <div className={`b-lk-fb b-lk-fb-${soort}`}>
        <Icoon size={20} aria-hidden="true" className="b-lk-fb-icoon" />
        <div>
          <strong>{titel}</strong>
          {uitleg ? <p>{uitleg}</p> : null}
          {extra}
        </div>
      </div>
    </div>
  );
}

/** Het merkteken op een gekozen antwoord: een vinkje met 'juist' of een kruisje met 'niet juist'. */
export function Markering({ juist, zonderIcoon = false }: { juist: boolean; /** De ouder tekent al een vinkje (de klasvraag, met css). */ zonderIcoon?: boolean }) {
  const Icoon = juist ? CheckIcon : CloseIcon;
  return (
    <span className="b-lk-markering">
      {zonderIcoon ? null : <Icoon size={18} aria-hidden="true" />}
      {juist ? 'juist' : 'niet juist'}
    </span>
  );
}
