// De lijst van de dekking op competenties: per beroepskwalificatie een uitklapper met haar competenties en hun status, de
// keuze "Toon" en de zinnen erbij (docs/STUDIERICHTINGEN.md § 23.7.4 en § 24.4). Verhuisd uit BkDekking.tsx (3b-I1), zodat
// de cursuseditor (BkCursusDekking) dezelfde lijst toont zonder het chunk van BkDekking en het gedeelde chunk van Mijn
// richtingen mee te laden. Daarom importeert dit bestand niets uit de richtingschermen.

import { useId, useMemo, useState } from 'react';
import { DoelStatus } from '../../course/MinimumdoelenDekking';
import {
  BK_TOON_ALLE, BK_TOON_OPEN, BK_ZONDER_BESTAND, bkCompetentieRegel, bkNogNietGedektZin, bkSetSamenvatting, bkTelStatussen,
} from '../../../lib/bkWeergave';
import type { MdDekking, MdRij } from '../../../lib/dekkingMinimumdoelen';
import { groepeerPerSet, zichtbareSets, type SetGroep, type Toon } from '../../../lib/dekkingWeergave';
import '../../../styles/dekking.css';

/**
 * De zin boven de beroepskwalificaties bij "Nog niet gedekt": ze staan dicht, dus de zin zegt ook wat er te doen valt.
 * Enkelvoud en meervoud. Met `uitsplitsing` zegt de zin hoe het getal is opgebouwd (nergens, gepland, alleen in verdieping),
 * zodat het getal niet tegenspreekt wat de samenvatting erboven met "nog niet" telt: zie `bkNogNietGedektZin`.
 */
export function nogNietGedektZin(
  competenties: number,
  beroepskwalificaties: number,
  uitsplitsing?: { open: number; gepland: number; verdieping: number },
): string {
  return bkNogNietGedektZin(competenties, beroepskwalificaties, uitsplitsing);
}

/**
 * De regel voor een beroepskwalificatie waarvan het bestand ontbreekt: de titel in het vet, een punt en de uitleg. Een punt of
 * spaties achteraan de titel vallen weg (de regel zet zelf een punt), een lege titel valt weg met haar punt.
 */
export function ZonderBestandRegel({ titel }: { titel: string }) {
  const naam = typeof titel === 'string' ? titel.trim().replace(/[.\s]+$/, '') : '';
  return (
    <p className="dk-uitleg">
      {naam !== '' && <><strong>{naam}</strong>. </>}
      {BK_ZONDER_BESTAND}
    </p>
  );
}

/** De radio "Toon": alle competenties, of alleen wat nog niet gedekt is. */
export function BkToonKeuze({ toon, onToon }: { toon: Toon; onToon: (t: Toon) => void }) {
  const naam = useId();
  return (
    <fieldset className="dk-fieldset">
      <legend>Toon</legend>
      <div className="dk-radios">
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'alle'} onChange={() => onToon('alle')} />
          <span>{BK_TOON_ALLE}</span>
        </label>
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'open'} onChange={() => onToon('open')} />
          <span>{BK_TOON_OPEN}</span>
        </label>
      </div>
    </fieldset>
  );
}

function RijStatus({ rij }: { rij: MdRij }) {
  return (
    <li className="dk-doel">
      <p className="dk-doel-tekst">{bkCompetentieRegel(rij.doel.code, rij.doel.tekst)}</p>
      <DoelStatus rij={rij} />
    </li>
  );
}

/** Eén beroepskwalificatie: een uitklapper met haar competenties. Ze staan pas in de pagina als ze openstaat. */
function BkUitklapper({ groep, naam }: { groep: SetGroep; naam: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="dk-set" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{bkSetSamenvatting(naam, groep.gedekt, groep.totaal)}</summary>
      {/* Bij "Nog niet gedekt" staan alleen de beroepskwalificaties met iets dat open is (zichtbareSets): een lege lijst komt dus niet voor. */}
      {open && groep.rijen.length > 0 && (
        <ul className="dk-doelen">
          {groep.rijen.map((rij) => <RijStatus key={`${rij.doel.set}|${rij.doel.id}`} rij={rij} />)}
        </ul>
      )}
    </details>
  );
}

export function PerBk({ dekking, toon, namen }: { dekking: MdDekking; toon: Toon; namen: ReadonlyMap<string, string> }) {
  const groepen = useMemo(() => zichtbareSets(groepeerPerSet(dekking, toon), toon), [dekking, toon]);
  // De beroepskwalificaties staan dicht: zonder deze zin zou "Nog niet gedekt" niets zichtbaar of hoorbaar veranderen. De regel
  // staat er altijd (ook leeg), want een live-gebied moet er al staan voor de tekst verandert.
  const zin = toon === 'open' && dekking.rijen.length > 0
    ? nogNietGedektZin(
      groepen.reduce((n, g) => n + g.rijen.length, 0),
      groepen.length,
      bkTelStatussen(groepen.flatMap((g) => g.rijen)),
    )
    : '';
  return (
    <>
      <p className="dk-toon-zin" aria-live="polite">{zin}</p>
      <div className="dk-sets">
        {groepen.map((g) => <BkUitklapper key={g.set} groep={g} naam={namen.get(g.set) ?? g.setNaam} />)}
      </div>
    </>
  );
}
