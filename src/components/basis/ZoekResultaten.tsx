// De uitslag van het zoeken in de doelen (zie zoekBasis.ts en INGANG.md, H3): de statusregel (role=status), de herkende
// filters als chips, 'Ook gezocht op', de treffers gegroepeerd per leerlijnrij (vak › onderwerp, het moment van het
// leerjaar eerst), daarna 'Ook met een deel van je woorden:' als er weinig treffers met alle woorden zijn, en hulp bij
// een lege vraag, een vraag met alleen een vak of een moment en bij 0 treffers.
//
// Elke treffer is een DoelRij met de letterlijke doeltekst; een gevonden woord staat in <mark> en een treffer die alleen
// in de uitbreiding of de woordenschat staat, heeft dat deel open. Niets wordt bewaard: ook de vraag niet.

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { basisPad } from '../../lib/basis/basisRoutes';
import { EINDMOMENTEN, setsVoorVak, type DoelBasis } from '../../lib/basis/doelBasis';
import { INVOERINGSKALENDER, WERKT_NAAR, type Eindmoment, type LeerjaarBasis, type SoortBasis } from '../../lib/basis/kalender';
import type { Groep, Uitslag } from '../../lib/basis/zoekBasis';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { DoelRij, MOMENT_KORT } from './DoelRij';
import { vakIcoon, vakTint } from './vakIconen';

/** Zo veel treffers tonen we eerst; de rest komt na een tik op 'Toon alle'. */
export const EERST_TONEN = 60;

const EINDE_TEKST: Readonly<Record<Eindmoment, string>> = {
  K3: 'het einde van de kleuterklas',
  L4: 'het einde van het 4de leerjaar',
  L6: 'het einde van het 6de leerjaar',
};

export const doelSleutel = (setId: string, id: string): string => `${setId}|${id}`;

const vakNaam = (nr: number): string => INVOERINGSKALENDER.vakken.find((v) => v.nr === nr)?.naam ?? 'Vak';
const hoofdletter = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const doelenTekst = (n: number): string => `${n} ${n === 1 ? 'doel' : 'doelen'}`;

/** De woorden die in <mark> komen: de woorden van de vraag, hun stammen en de woorden uit de tabel. */
export function markeerStammen(uitslag: Uitslag): string[] {
  return [...new Set(uitslag.vraag.termen.flatMap((t) => [...t.alts, ...t.tabel]))];
}

/** Houdt de eerste `max` treffers over, in groepen. */
function kap(groepen: readonly Groep[], max: number): Groep[] {
  const uit: Groep[] = [];
  let over = max;
  for (const g of groepen) {
    if (over <= 0) break;
    const treffers = g.treffers.slice(0, over);
    over -= treffers.length;
    uit.push({ ...g, treffers });
  }
  return uit;
}

export interface ZoekResultatenProps {
  uitslag: Uitslag;
  /** De vraag zoals de leerkracht ze typte, voor de statusregel. */
  vraagTekst: string;
  /** De doelen van de geladen sets op `setId|id`, voor de rijen. */
  doelen: ReadonlyMap<string, DoelBasis>;
  soort: SoortBasis;
  leerjaar?: LeerjaarBasis;
  /** Waarin gezocht is: de doelen van het eindmoment van het leerjaar, of alle vakken en momenten. */
  bereik: 'leerjaar' | 'alles';
  /** De index, voor de links bij een vraag met alleen een vak. */
  alle: readonly MinimumdoelenIndexSet[];
  max?: number;
}

function Rijen({ groep, totaal, niveau, doelen, markeer }: { groep: Groep; totaal: number; niveau: 2 | 3; doelen: ReadonlyMap<string, DoelBasis>; markeer: readonly string[] }) {
  const Kop = niveau === 2 ? 'h2' : 'h3';
  const rijen = groep.treffers.flatMap((t) => {
    const d = doelen.get(doelSleutel(t.doel.setId, t.doel.id));
    return d ? [d] : [];
  });
  if (rijen.length === 0) return null;
  return (
    <section className="b-zoekgroep">
      <Kop>
        {vakNaam(groep.vak)} › {groep.onderwerp} <span className="b-onderwerp-aantal">({totaal})</span>
      </Kop>
      <ul className="b-doelrijen">
        {rijen.map((d) => (
          <li key={doelSleutel(d.setId, d.id)}>
            <DoelRij doel={d} metMoment markeer={markeer} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VakTegels({ soort, leerjaar }: { soort: SoortBasis; leerjaar?: LeerjaarBasis }) {
  return (
    <ul className="b-kaarten">
      {INVOERINGSKALENDER.vakken.map((v) => {
        const Icoon = vakIcoon(v.nr);
        return (
          <li key={v.nr}>
            <Link to={basisPad({ s: 'leerlijn', soort, vak: v.nr, leerjaar })} className="b-vakkaart">
              <span className="b-vaktegel" style={{ ['--h' as string]: vakTint(v.nr) }} aria-hidden="true">
                <Icoon size={24} />
              </span>
              <span className="b-vakkaart-tekst">
                <span className="b-vakkaart-naam">{v.naam}</span>
                <span className="b-vakkaart-sub">Leerlijn van dit vak</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ZoekResultaten({ uitslag, vraagTekst, doelen, soort, leerjaar, bereik, alle, max = EERST_TONEN }: ZoekResultatenProps) {
  const [alles, setAlles] = useState(false);
  const { vraag } = uitslag;
  const markeer = markeerStammen(uitslag);

  // Chips: het herkende moment (de eerste van de filters) en de herkende vakken met hun volledige naam.
  const momentFilter = vraag.eind ? vraag.filters[0] : undefined;
  const vakChips = [...new Set((vraag.vakken ?? []).map(vakNaam))];
  const chips = [...(momentFilter ? [hoofdletter(momentFilter)] : []), ...vakChips];

  const opMoment = bereik === 'leerjaar' && leerjaar !== undefined;
  const waar = opMoment ? `in de doelen van ${EINDE_TEKST[WERKT_NAAR[leerjaar]]}` : 'in alle vakken en momenten';
  const zoekUrl = (b: 'leerjaar' | 'alles') => basisPad({ s: 'zoek', soort, vraag: vraagTekst, leerjaar, bereik: b });
  const bereikLink = opMoment ? (
    <Link to={zoekUrl('alles')} className="b-knop">
      Zoek in alle vakken en momenten
    </Link>
  ) : leerjaar ? (
    <Link to={zoekUrl('leerjaar')} className="b-knop">
      Zoek alleen in je leerjaar
    </Link>
  ) : null;

  // Wat de statusregel zegt, en wat eronder staat.
  let status: string;
  let inhoud: ReactNode = null;
  const aantal = uitslag.treffers.length;

  if (uitslag.leeg) {
    status = 'Typ een woord om te zoeken.';
    inhoud = (
      <p className="b-noot">
        Zoek in gewone woorden, bijvoorbeeld &quot;schaduw&quot;, &quot;breuken&quot; of &quot;rijmen&quot;. Je kan ook een vak of een leerjaar erbij zetten, zoals &quot;breuken 6de leerjaar&quot;, of een doelnummer (5 cijfers) of een code zoals 3.5.4 intypen.
      </p>
    );
  } else if (uitslag.alleenVak) {
    const nrs = vraag.vakken ?? [];
    const einden = vraag.eind ?? EINDMOMENTEN;
    const links = nrs.flatMap((nr) =>
      einden.filter((m) => setsVoorVak(alle, soort, m, nr).length > 0).map((m) => ({ nr, m })),
    );
    status = `Je zocht op een vak: ${vakChips.join(', ')}.`;
    inhoud = (
      <>
        <p className="b-noot">Kies een moment om de doelen van dit vak te zien, of bekijk de leerlijn.</p>
        <ul className="b-plaats-links">
          {links.map(({ nr, m }) => (
            <li key={`${nr}-${m}`}>
              <Link to={basisPad({ s: 'vak', soort, eind: m, vak: nr, leerjaar: leerjaar && WERKT_NAAR[leerjaar] === m ? leerjaar : undefined })}>
                {vakNaam(nr)}: {MOMENT_KORT[m].toLowerCase()}
              </Link>
            </li>
          ))}
          {nrs.map((nr) => (
            <li key={`ll-${nr}`}>
              <Link to={basisPad({ s: 'leerlijn', soort, vak: nr, leerjaar })}>Leerlijn {vakNaam(nr).toLowerCase()}</Link>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (uitslag.alleenMoment) {
    status = `Je zocht op een moment: ${momentFilter ?? ''}.`;
    inhoud = (
      <>
        <p className="b-noot">Zet er een woord bij, of bekijk de doelen van dit moment per vak.</p>
        <ul className="b-plaats-links">
          {(vraag.eind ?? []).map((m) => (
            <li key={m}>
              <Link to={basisPad({ s: 'moment', soort, eind: m })}>Doelen voor {EINDE_TEKST[m]}</Link>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (vraag.id !== undefined || vraag.code !== undefined) {
    status = aantal === 0 ? `Geen doel gevonden voor ${vraag.id !== undefined ? `nummer ${vraag.id}` : `code ${vraag.code}`}.` : `${doelenTekst(aantal)} gevonden voor ${vraag.id !== undefined ? `nummer ${vraag.id}` : `code ${vraag.code}`}.`;
  } else if (aantal === 0 && !uitslag.versoepeld) {
    status = `Geen doelen gevonden voor "${vraagTekst}" ${waar}.`;
  } else if (aantal === 0 && uitslag.versoepeld) {
    status = `Geen doelen met al je woorden ${waar}, wel ${uitslag.deels.length} met een deel ervan.`;
  } else if (aantal === 0) {
    status = `Geen doelen met al je woorden ${waar}.`;
  } else if (uitslag.versoepeld) {
    status = `${doelenTekst(aantal)} met al je woorden en ${uitslag.deels.length} met een deel van je woorden, ${waar}.`;
  } else {
    status = `${doelenTekst(aantal)} gevonden voor "${vraagTekst}" ${waar}.`;
  }

  // Bij alleen een vak of een moment staan er links en geen lijst van honderden doelen.
  const lijst = !uitslag.leeg && !uitslag.alleenVak && !uitslag.alleenMoment;
  const totaal = lijst ? aantal + uitslag.deels.length : 0;
  const toonAlles = alles || totaal <= max;
  const hoofd = !lijst ? [] : toonAlles ? uitslag.groepen : kap(uitslag.groepen, max);
  const rest = toonAlles ? 0 : Math.max(0, totaal - max);
  const deelsGroepen = !lijst ? [] : toonAlles ? uitslag.deelsGroepen : kap(uitslag.deelsGroepen, Math.max(0, max - aantal));

  const totaalHoofd = new Map(uitslag.groepen.map((g) => [g.sleutel, g.treffers.length]));
  const totaalDeels = new Map(uitslag.deelsGroepen.map((g) => [g.sleutel, g.treffers.length]));
  const nietsGevonden = !uitslag.leeg && !uitslag.alleenVak && !uitslag.alleenMoment && aantal === 0 && uitslag.deels.length === 0;

  return (
    <div className="b-zoekuitslag">
      <p className="b-zoekstatus" role="status">
        {status}
      </p>
      {chips.length > 0 && (
        <ul className="b-chips" aria-label="Herkende filters">
          {chips.map((c) => (
            <li key={c} className="b-chip">
              {c}
            </li>
          ))}
        </ul>
      )}
      {uitslag.ookGezocht.length > 0 && <p className="b-ookgezocht">Ook gezocht op: {uitslag.ookGezocht.join(', ')}</p>}
      {uitslag.versoepeld && aantal > 0 && <p className="b-noot">Er zijn weinig doelen met al je woorden. Daaronder staan er ook met een deel van je woorden.</p>}
      {inhoud}

      {hoofd.map((g) => (
        <Rijen key={g.sleutel} groep={g} totaal={totaalHoofd.get(g.sleutel) ?? g.treffers.length} niveau={2} doelen={doelen} markeer={markeer} />
      ))}

      {uitslag.versoepeld && deelsGroepen.length > 0 && (
        <section className="b-zoekdeels">
          <h2>Ook met een deel van je woorden:</h2>
          {deelsGroepen.map((g) => (
            <Rijen key={g.sleutel} groep={g} totaal={totaalDeels.get(g.sleutel) ?? g.treffers.length} niveau={3} doelen={doelen} markeer={markeer} />
          ))}
        </section>
      )}

      {rest > 0 && (
        <p>
          <button type="button" className="b-knop" onClick={() => setAlles(true)}>
            Toon alle {totaal} doelen
          </button>
        </p>
      )}

      {nietsGevonden && (
        <>
          <ul className="b-tips">
            <li>Controleer de spelling, of probeer een ander woord voor hetzelfde.</li>
            <li>Probeer één woord, bijvoorbeeld het onderwerp.</li>
            <li>Typ een doelnummer (5 cijfers) of een code zoals 3.5.4 als je die kent.</li>
          </ul>
          {bereikLink && <p>{bereikLink}</p>}
          <h2 className="b-zoek-vaktegels">Of bekijk de leerlijn van een vak</h2>
          <VakTegels soort={soort} leerjaar={leerjaar} />
        </>
      )}

      {!nietsGevonden && bereikLink && !uitslag.leeg && <p className="b-zoekbereik">{bereikLink}</p>}
    </div>
  );
}
