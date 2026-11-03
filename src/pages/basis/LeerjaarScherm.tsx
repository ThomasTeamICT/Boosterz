// #/basis/leerjaar/:soort/:leerjaar: 'Wat geldt voor je 3de leerjaar?'. Het antwoord van het momentmodel voor één leerjaar in
// het huidige schooljaar, met de zekerheid erbij: naar welk eindmoment het leerjaar werkt, welke vakken verplicht zijn,
// welke al mogen en welke oude doelen nog gelden. Een kop of zin staat er alleen als het model ze staaft en de lijst
// eronder niet leeg is. Alleen de index wordt geladen.

import { Link } from 'react-router-dom';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { LeerjaarBalk, SnelZoeken } from '../../components/basis/LeerjaarKiezer';
import { VakKaart } from '../../components/basis/VakKaart';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { useBasisSets } from '../../components/basis/useBasisSets';
import { leerjaarOverzicht, leerjaarZinnen, type LeerjaarOverzicht, type VakRegel } from '../../lib/basis/leerjaarOverzicht';
import { basisPad } from '../../lib/basis/basisRoutes';
import { schooljaarTekst, schooljaarVanDatum, type Eindmoment, type LeerjaarBasis, type Schooljaar, type SoortBasis } from '../../lib/basis/kalender';
import { samengesteldTekst, zekerheidUitleg, SOORT_DOELEN_LABEL, leerjarenTekst } from '../../lib/basis/momentTeksten';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import '../../styles/basis-leerjaar.css';

const EINDE_TEKST: Readonly<Record<Eindmoment, string>> = {
  K3: 'het einde van de kleuterklas',
  L4: 'het einde van het 4de leerjaar',
  L6: 'het einde van het 6de leerjaar',
};

/** Het schooljaar van vandaag. De klok wordt hier gelezen, nooit in src/lib/basis. */
function huidigSchooljaar(): Schooljaar {
  return schooljaarVanDatum(new Date()) ?? new Date().getFullYear();
}

const pluralDoelen = (n: number) => `${n} ${n === 1 ? 'doel' : 'doelen'}`;
/** De naam van een set zonder de dubbele spaties uit de bron. */
const schoneNaam = (naam: string) => naam.replace(/\s+/g, ' ').trim();

function VakKaarten({ regels, o }: { regels: readonly VakRegel[]; o: LeerjaarOverzicht }) {
  return (
    <ul className="b-kaarten">
      {regels.map((r) => (
        <li key={r.vak.nr}>
          <VakKaart
            soort={o.soort}
            eind={o.eindmoment}
            leerjaar={o.leerjaar}
            vak={r.vak}
            aantal={r.aantal}
            perSoort={r.perSoort}
            zekerheid={r.zekerheid}
            verplichtVanaf={r.status === 'mag' ? r.verplichtVanaf : undefined}
            lampstreep={r.status === 'verplicht'}
          />
        </li>
      ))}
    </ul>
  );
}

function OudeDoelen({ o }: { o: LeerjaarOverzicht }) {
  if (o.oud.length === 0) return null;
  if (o.soort === 'bubao') {
    const metBasisaanbod = o.oud.some((g) => /basisaanbod/i.test(g.set.naam));
    return (
      <section aria-labelledby="b-oud-kop" className="b-blok">
        <h2 id="b-oud-kop">Oude doelen die dit schooljaar nog gelden</h2>
        <p>
          Daarnaast gelden in het buitengewoon onderwijs nog oude ontwikkelingsdoelen, van je type{metBasisaanbod ? ' of van het basisaanbod' : ''}. Die vind je bij Officiële
          minimumdoelen, met de soort Buitengewoon basisonderwijs.
        </p>
        <p>
          <Link to="/leerplannen/minimumdoelen" className="b-knop">
            Naar Officiële minimumdoelen
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="b-oud-kop" className="b-blok">
      <h2 id="b-oud-kop">Oude doelen die dit schooljaar nog gelden</h2>
      <ul className="b-oudlijst">
        {o.oud.map((g) => (
          <li key={g.set.id}>
            <Link to={`/leerplannen/minimumdoelen/${g.set.id}`} className="b-oudlink">
              {schoneNaam(g.set.naam)}
            </Link>
            <span className="b-oudinfo">
              {pluralDoelen(g.set.aantal)} · {g.info.soortDoelen ? SOORT_DOELEN_LABEL[g.info.soortDoelen] : 'oud'}
              {g.invoering.laatsteSchooljaar !== undefined && <> · geldt tot en met schooljaar {schooljaarTekst(g.invoering.laatsteSchooljaar)}</>}
            </span>
            <ZekerheidBadge zekerheid={g.invoering.zekerheid} />
          </li>
        ))}
      </ul>
      <p className="b-noot">De officiële gegevens koppelen de oude en de nieuwe doelen niet aan elkaar.</p>
    </section>
  );
}

/**
 * Het scherm zonder laden: voor een gegeven index, leerjaar en schooljaar. Aparte functie zodat het scherm met elk
 * schooljaar getest kan worden zonder klok of netwerk.
 */
export function LeerjaarInhoud({
  alle,
  soort,
  leerjaar,
  schooljaar,
}: {
  alle: readonly MinimumdoelenIndexSet[];
  soort: SoortBasis;
  leerjaar: LeerjaarBasis;
  schooljaar: Schooljaar;
}) {
  const o = leerjaarOverzicht(alle, { soort, leerjaar }, schooljaar);
  const z = leerjaarZinnen(o);
  const kleuter = leerjaar.startsWith('K');
  const uitleg = zekerheidUitleg(o.zekerheid);
  const geenGegevens = o.verplicht.length === 0 && o.magAl.length === 0 && o.oud.length === 0;

  return (
    <>
      <p className="b-lead">
        {o.aantalDoelen > 0 ? (
          <>
            {kleuter ? 'Je kleuterklas' : 'Je leerjaar'} werkt naar de doelen van {EINDE_TEKST[o.eindmoment]}: {pluralDoelen(o.aantalDoelen)} in {o.aantalVakken}{' '}
            {o.aantalVakken === 1 ? 'vak' : 'vakken'}.
            {soort === 'bubao' && o.alleNastreven && <> In het buitengewoon onderwijs zijn al deze doelen na te streven.</>}
          </>
        ) : (
          <>
            {kleuter ? 'Je kleuterklas' : 'Je leerjaar'} werkt naar de doelen van {EINDE_TEKST[o.eindmoment]}. In de gegevens vinden we daar geen nieuwe
            doelen voor.
          </>
        )}
      </p>
      <p className="b-schooljaar">Schooljaar {schooljaarTekst(schooljaar)}</p>
      {z.tussenstappenZin && <p>{z.tussenstappenZin}</p>}
      {o.opmerkingen.map((tekst) => (
        <p key={tekst} className="b-opmerking">
          {tekst}
        </p>
      ))}

      <SnelZoeken soort={soort} leerjaar={leerjaar} />

      {geenGegevens ? (
        <p className="b-noot">Voor dit leerjaar vinden we in de gegevens niets dat dit schooljaar geldt.</p>
      ) : (
        <>
          <section aria-labelledby="b-verplicht-kop" className="b-blok">
            <h2 id="b-verplicht-kop">{z.verplichtKop}</h2>
            {z.geenVerplichtZin && <p>{z.geenVerplichtZin}</p>}
            {o.verplicht.length > 0 && <VakKaarten regels={o.verplicht} o={o} />}
            {z.alleVerplichtZin && <p className="b-noot">{z.alleVerplichtZin}</p>}
          </section>

          {o.magAl.length > 0 && (
            <section aria-labelledby="b-mag-kop" className="b-blok">
              <h2 id="b-mag-kop">Mag al</h2>
              {z.magAlZin && <p>{z.magAlZin}</p>}
              <VakKaarten regels={o.magAl} o={o} />
            </section>
          )}

          {z.zonderNieuweSetZin && <p className="b-noot">{z.zonderNieuweSetZin}</p>}

          <OudeDoelen o={o} />
        </>
      )}

      <details className="b-uitleg">
        <summary>Hoe zeker is dit?</summary>
        <div className="b-uitleg-inhoud">
          <p>{uitleg ?? 'Zeker: dit volgt rechtstreeks uit de officiële gegevens en de vaste invoeringskalender.'}</p>
          <p>{samengesteldTekst()}</p>
          <p>
            <Link to={basisPad({ s: 'moment', soort, eind: o.eindmoment })}>Bekijk alle doelen van {EINDE_TEKST[o.eindmoment]}</Link>
          </p>
        </div>
      </details>
    </>
  );
}

export function LeerjaarScherm({ soort, leerjaar }: { soort: SoortBasis; leerjaar: LeerjaarBasis }) {
  const { index, opnieuwIndex } = useBasisSets();
  return (
    <div className="b-leerjaar">
      <LeerjaarBalk soort={soort} leerjaar={leerjaar} />
      <h1>Wat geldt voor je {leerjarenTekst([leerjaar])}?</h1>
      {index.status === 'laden' && <LaadBericht tekst="De doelen worden geladen" />}
      {index.status === 'fout' && <FoutBericht fout={index.fout} onOpnieuw={opnieuwIndex} />}
      {index.status === 'klaar' && <LeerjaarInhoud alle={index.waarde.sets} soort={soort} leerjaar={leerjaar} schooljaar={huidigSchooljaar()} />}
    </div>
  );
}
