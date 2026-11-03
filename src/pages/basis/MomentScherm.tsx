// #/basis/moment/:soort/:eind: alle doelen van één eindmoment (einde kleuter, einde 4de of einde 6de leerjaar), per vak.
// Een kaart per vak met het aantal doelen en het soort doel; de leerjaren die naar dit moment werken staan in een zin.
// Er staat geen status op de kaarten: wat verplicht is, hangt van het leerjaar af en staat op de pagina van het leerjaar.
// Alleen de index wordt geladen. De schakelaars voor het moment en voor gewoon of buitengewoon zijn links.

import { Link } from 'react-router-dom';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { MOMENT_KORT } from '../../components/basis/DoelRij';
import { VakKaart } from '../../components/basis/VakKaart';
import { useBasisSets } from '../../components/basis/useBasisSets';
import { basisPad, type BasisScherm } from '../../lib/basis/basisRoutes';
import { EINDMOMENTEN, vakkenOpMoment } from '../../lib/basis/doelBasis';
import { INVOERINGSKALENDER, LEERJAREN_BASIS, WERKT_NAAR, type Eindmoment, type SoortBasis } from '../../lib/basis/kalender';
import { leerjarenTekst } from '../../lib/basis/momentTeksten';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import '../../styles/basis-doelen.css';

export const EINDE_TEKST: Readonly<Record<Eindmoment, string>> = {
  K3: 'het einde van de kleuterklas',
  L4: 'het einde van het 4de leerjaar',
  L6: 'het einde van het 6de leerjaar',
};

const SOORT_LABEL: Readonly<Record<SoortBasis, string>> = { bao: 'Gewoon onderwijs', bubao: 'Buitengewoon onderwijs' };
const SOORTEN: readonly SoortBasis[] = ['bao', 'bubao'];

/**
 * Gewoon of buitengewoon onderwijs als twee links naar hetzelfde scherm van de andere soort. `naar` bouwt het scherm
 * voor een soort. Het kiezen bewaart niets: de bewaarde keuze verandert alleen op de leerjaarpagina.
 */
export function SoortLinks({ soort, naar }: { soort: SoortBasis; naar: (s: SoortBasis) => BasisScherm }) {
  return (
    <nav className="b-pillen" aria-label="Soort onderwijs">
      {SOORTEN.map((s) => (
        <Link key={s} to={basisPad(naar(s))} className="b-pil-knop" aria-current={soort === s ? 'true' : undefined}>
          {SOORT_LABEL[s]}
        </Link>
      ))}
    </nav>
  );
}

function opsomming(namen: readonly string[]): string {
  return namen.length <= 1 ? namen.join('') : `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
}

/** De zin voor de vakken die op dit moment geen nieuwe set hebben (uit de index afgeleid); undefined als alle vakken er zijn. */
export function zonderNieuweSetZin(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, eind: Eindmoment): string | undefined {
  const met = new Set(vakkenOpMoment(alle, soort, eind).map((v) => v.vak.nr));
  const zonder = INVOERINGSKALENDER.vakken.filter((v) => !met.has(v.nr));
  if (zonder.length === 0) return undefined;
  return `${opsomming(zonder.map((v) => v.naam))} ${zonder.length === 1 ? 'heeft' : 'hebben'} geen nieuwe doelen voor ${EINDE_TEKST[eind]}.`;
}

/** Het scherm zonder laden, voor een gegeven index. */
export function MomentInhoud({ alle, soort, eind }: { alle: readonly MinimumdoelenIndexSet[]; soort: SoortBasis; eind: Eindmoment }) {
  const vakken = vakkenOpMoment(alle, soort, eind);
  const werkenToe = LEERJAREN_BASIS.filter((l) => WERKT_NAAR[l] === eind);
  const zonder = zonderNieuweSetZin(alle, soort, eind);
  return (
    <>
      <p className="b-lead">{`${leerjarenTekst(werkenToe, true).replace(/^./, (c) => c.toUpperCase())} werken hiernaartoe.`}</p>
      <div className="b-schakelaars">
        <nav className="b-pillen" aria-label="Eindmoment">
          {EINDMOMENTEN.map((m) => (
            <Link key={m} to={basisPad({ s: 'moment', soort, eind: m })} className="b-pil-knop" aria-current={m === eind ? 'true' : undefined}>
              {MOMENT_KORT[m]}
            </Link>
          ))}
        </nav>
        <SoortLinks soort={soort} naar={(s) => ({ s: 'moment', soort: s, eind })} />
      </div>
      {vakken.length > 0 ? (
        <ul className="b-kaarten">
          {vakken.map((v) => (
            <li key={v.vak.nr}>
              <VakKaart soort={soort} eind={eind} vak={v.vak} aantal={v.aantal} perSoort={v.perSoort} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="b-noot">Voor dit eindmoment vinden we in de gegevens geen nieuwe doelen.</p>
      )}
      {vakken.length > 0 && zonder && <p className="b-noot">{zonder}</p>}
    </>
  );
}

export function MomentScherm({ soort, eind }: { soort: SoortBasis; eind: Eindmoment }) {
  const { index, opnieuwIndex } = useBasisSets();
  return (
    <div className="b-moment">
      <h1>Doelen voor {EINDE_TEKST[eind]}</h1>
      {index.status === 'laden' && <LaadBericht tekst="De doelen worden geladen" />}
      {index.status === 'fout' && <FoutBericht fout={index.fout} onOpnieuw={opnieuwIndex} />}
      {index.status === 'klaar' && <MomentInhoud alle={index.waarde.sets} soort={soort} eind={eind} />}
    </div>
  );
}
