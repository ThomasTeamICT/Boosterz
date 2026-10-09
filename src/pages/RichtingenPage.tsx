// ── Doelen en cursussen per studierichting ──────────────────────────────────
//
// /cursussen/richtingen           de lijst met studierichtingen, met filters
// /cursussen/richtingen/:groep    één richting; ?jaar=…&soort=…&variant=… kiest het jaar, het soort onderwijs en de variant
//
// De bestanden staan naast de app (public/leerplannen/structuur/) en worden pas opgehaald als iemand dit scherm opent
// (lib/studierichtingenBron.ts). Het scherm toont wat de officiële bron aan een richting koppelt en maakt er cursussen en
// leerplannen mee; de logica staat in lib/richtingKader.ts en lib/richtingCursus.ts. Zie docs/STUDIERICHTINGEN.md § 14.

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { RichtingDetail } from '../components/richting/RichtingDetail';
import { RichtingLijst } from '../components/richting/RichtingLijst';
import { useRichtingGegevens } from '../components/richting/useRichtingGegevens';
import '../styles/materiaal.css';
import '../styles/richtingen.css';

/** Vandaag als JJJJ-MM-DD op het toestel van de leerkracht (niet in UTC: 's avonds laat is het in België al een dag later). */
function vandaagLokaal(): string {
  const nu = new Date();
  const maand = String(nu.getMonth() + 1).padStart(2, '0');
  const dag = String(nu.getDate()).padStart(2, '0');
  return `${nu.getFullYear()}-${maand}-${dag}`;
}

export function RichtingenPage() {
  const { groep } = useParams();
  const { stand, opnieuw } = useRichtingGegevens();
  const vandaag = useMemo(vandaagLokaal, []);
  return (
    <div className="page mat-page ri-page">
      {groep === undefined
        ? <RichtingLijst stand={stand} opnieuw={opnieuw} vandaag={vandaag} />
        : <RichtingDetail groep={groep} stand={stand} opnieuw={opnieuw} vandaag={vandaag} />}
    </div>
  );
}
