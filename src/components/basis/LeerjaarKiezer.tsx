// Het leerjaar kiezen in het basisdeel: gewoon of buitengewoon onderwijs en negen leerjaarknoppen in drie groepen
// (LeerjaarKiezer), de balk bovenaan een leerjaarpagina (LeerjaarBalk) en een zoekveld dat naar het zoekscherm gaat
// (SnelZoeken). Een tik op een leerjaar bewaart de keuze per toestel en opent de pagina van dat leerjaar.

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { basisPad } from '../../lib/basis/basisRoutes';
import { type BasisKeuze } from '../../lib/basis/basisKeuze';
import { WERKT_NAAR, type LeerjaarBasis, type SoortBasis } from '../../lib/basis/kalender';
import { leerjarenTekst } from '../../lib/basis/momentTeksten';
import { useBasisKeuze } from './useBasisKeuze';

export const SOORT_TEKST: Readonly<Record<SoortBasis, string>> = { bao: 'gewoon onderwijs', bubao: 'buitengewoon onderwijs' };

const SOORTEN: readonly { soort: SoortBasis; label: string }[] = [
  { soort: 'bao', label: 'Gewoon onderwijs' },
  { soort: 'bubao', label: 'Buitengewoon onderwijs' },
];

const GROEPEN: readonly { legend: string; leerjaren: readonly LeerjaarBasis[] }[] = [
  { legend: 'Kleuterklassen · werken naar het einde van de kleuterklas', leerjaren: ['K1', 'K2', 'K3'] },
  { legend: '1ste tot 4de leerjaar · werken naar het einde van het 4de leerjaar', leerjaren: ['L1', 'L2', 'L3', 'L4'] },
  { legend: '5de en 6de leerjaar · werken naar het einde van het 6de leerjaar', leerjaren: ['L5', 'L6'] },
];

/** Gewoon of buitengewoon, als twee knoppen met aria-pressed. */
export function SoortSchakelaar({ soort, onSoort }: { soort: SoortBasis; onSoort: (s: SoortBasis) => void }) {
  return (
    <div className="b-pillen" role="group" aria-label="Soort onderwijs">
      {SOORTEN.map((s) => (
        <button key={s.soort} type="button" className="b-pil-knop" aria-pressed={soort === s.soort} onClick={() => onSoort(s.soort)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/**
 * De kiezer. `soort` en `onSoort` staan bij het scherm, zodat dat scherm zelf ook iets met de soort kan (de momenttegels
 * op de startpagina). Een tik bewaart de keuze en gaat naar #/basis/leerjaar/<soort>/<leerjaar>; `vervang` vervangt dan de
 * huidige plaats in de geschiedenis (voor de startpagina, die met een bewaarde keuze toch doorstuurt).
 */
export function LeerjaarKiezer({ soort, onSoort, vervang = false }: { soort: SoortBasis; onSoort: (s: SoortBasis) => void; vervang?: boolean }) {
  const navigate = useNavigate();
  const { keuze, bewaar } = useBasisKeuze();
  const kies = (leerjaar: LeerjaarBasis) => {
    bewaar({ soort, leerjaar });
    navigate(basisPad({ s: 'leerjaar', soort, leerjaar }), { replace: vervang });
  };
  return (
    <div className="b-kiezer">
      <SoortSchakelaar soort={soort} onSoort={onSoort} />
      {GROEPEN.map((g) => (
        <fieldset key={g.legend} className="b-groep">
          <legend>{g.legend}</legend>
          <div className="b-groep-knoppen">
            {g.leerjaren.map((lj) => {
              const bewaard = keuze?.soort === soort && keuze.leerjaar === lj;
              return (
                <button key={lj} type="button" className="b-leerjaarknop" aria-current={bewaard ? 'true' : undefined} onClick={() => kies(lj)}>
                  {leerjarenTekst([lj])}
                  {bewaard && <span className="b-leerjaarknop-noot">jouw keuze</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/**
 * De balk bovenaan een leerjaarpagina. Is dit het bewaarde leerjaar: 'Mijn leerjaar: 3de leerjaar · gewoon onderwijs' met
 * 'Ander leerjaar'. Anders: 'Leerjaar: …' met 'Onthoud als mijn leerjaar'. Gewoon of buitengewoon kan hier gewisseld worden
 * (twee links naar dezelfde pagina van de andere soort); dat bewaart niets.
 */
export function LeerjaarBalk({ soort, leerjaar }: { soort: SoortBasis; leerjaar: LeerjaarBasis }) {
  const { keuze, bewaar } = useBasisKeuze();
  const isMijn = keuze?.soort === soort && keuze.leerjaar === leerjaar;
  const onthoud = (k: BasisKeuze) => {
    bewaar(k);
  };
  return (
    <div className="b-balk">
      <p className="b-balk-tekst">
        {isMijn ? 'Mijn leerjaar' : 'Leerjaar'}: <strong>{leerjarenTekst([leerjaar])}</strong> · {SOORT_TEKST[soort]}
      </p>
      <div className="b-balk-acties">
        {!isMijn && (
          <button type="button" className="b-knop" onClick={() => onthoud({ soort, leerjaar })}>
            Onthoud als mijn leerjaar
          </button>
        )}
        <Link to={basisPad({ s: 'kies' })} className="b-knop">
          Ander leerjaar
        </Link>
      </div>
      <nav className="b-pillen" aria-label="Soort onderwijs voor dit leerjaar">
        {SOORTEN.map((s) => (
          <Link key={s.soort} to={basisPad({ s: 'leerjaar', soort: s.soort, leerjaar })} className="b-pil-knop" aria-current={soort === s.soort ? 'true' : undefined}>
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/**
 * Een zoekveld dat naar het zoekscherm gaat. Met een leerjaar zoekt het eerst binnen de doelen van het eindmoment van dat
 * leerjaar (bereik 'leerjaar'); zonder leerjaar in alle vakken en momenten.
 */
export function SnelZoeken({ soort, leerjaar }: { soort: SoortBasis; leerjaar?: LeerjaarBasis }) {
  const navigate = useNavigate();
  const [vraag, setVraag] = useState('');
  const naarZoeken = (e: FormEvent) => {
    e.preventDefault();
    navigate(basisPad({ s: 'zoek', soort, vraag: vraag.trim(), leerjaar, bereik: leerjaar ? 'leerjaar' : 'alles' }));
  };
  const waar = leerjaar
    ? `de doelen van het einde van ${WERKT_NAAR[leerjaar] === 'K3' ? 'de kleuterklas' : `het ${WERKT_NAAR[leerjaar] === 'L4' ? '4de' : '6de'} leerjaar`}`
    : 'alle doelen';
  return (
    <form className="b-zoekrij" role="search" onSubmit={naarZoeken}>
      <label htmlFor="b-snelzoek" className="b-zoeklabel">
        Zoek in {waar}
      </label>
      <div className="b-zoekveld">
        <input
          id="b-snelzoek"
          className="input b-zoekinvoer"
          type="search"
          value={vraag}
          onChange={(e) => setVraag(e.target.value)}
          placeholder="Bijvoorbeeld schaduw, breuken of rijmen"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary b-zoekknop">
          Zoek
        </button>
      </div>
    </form>
  );
}
