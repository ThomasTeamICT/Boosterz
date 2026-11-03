// Eén doel als rij in een lijst waar veel doelen naast elkaar staan: de leerlijn, de leerlijn van een doel en de
// zoekresultaten. De rij bestaat uit een link van minstens 44 px (het moment, de code en de letterlijke doelzin, met
// eventueel 'dit doel') en daaronder, naast de link, de rest van de officiële tekst in een <details>: de uitbreiding
// ('Toon de opsomming (n punten)' bij een lijst, anders 'Toon de toelichting') en de richtinggevende woordenschat.
// Niets wordt weggelaten, alleen ingeklapt. Een details kan niet in een link staan, dus staat het ernaast.
//
// Zoekresultaten geven `markeer` mee: de stammen van de gezochte woorden (zoals zoekBasis ze maakt). Een woord dat
// erop past, komt in <mark>. Staat een treffer alleen in de uitbreiding of de woordenschat, dan staat dat deel open,
// als platte tekst met het woord gemarkeerd (lijsten blijven regels met een bolletje, niets valt weg).

import { Link } from 'react-router-dom';
import { doelPad } from '../../lib/basis/basisRoutes';
import { blokkenAlsTekst, doeltekstBlokken, type Blok } from '../../lib/basis/doeltekst';
import type { DoelBasis } from '../../lib/basis/doelBasis';
import type { Eindmoment } from '../../lib/basis/kalender';
import { normaal } from '../../lib/basis/zoekBasis';
import { DoeltekstWeergave } from './DoeltekstWeergave';

/** Het eindmoment in een paar woorden. */
export const MOMENT_KORT: Readonly<Record<Eindmoment, string>> = {
  K3: 'Einde kleuter',
  L4: 'Einde 4de leerjaar',
  L6: 'Einde 6de leerjaar',
};

/** Het aantal punten van de opsomming (de items van de lijsten op het bovenste niveau); 0 als er geen lijst is. */
export function opsommingPunten(blokken: readonly Blok[]): number {
  return blokken.reduce((som, b) => (b.t === 'lijst' ? som + b.items.length : som), 0);
}

const SUFFIXEN = ['', 'e', 'en', 'n', 's', 'es'];

/** Past dit woord (gewoon geschreven) op een stam? Korte stammen (4 letters of minder) en '='-stammen alleen als heel woord. */
function pastOpStam(woord: string, stam: string): boolean {
  const heel = stam.startsWith('=');
  const s = normaal(heel ? stam.slice(1) : stam);
  if (s === '' || s.includes(' ')) return false;
  const w = normaal(woord);
  if (w === '') return false;
  if (heel || s.length <= 4) return SUFFIXEN.some((x) => w === s + x);
  return w.startsWith(s);
}

const WOORD = /([\p{L}\p{N}]+)/gu;

/** Staat er een woord in de tekst dat op een van de stammen past? */
export function heeftTreffer(tekst: string, stammen: readonly string[] | undefined): boolean {
  if (!stammen || stammen.length === 0) return false;
  return (tekst.match(WOORD) ?? []).some((w) => stammen.some((s) => pastOpStam(w, s)));
}

/** De tekst met de woorden die op een stam passen in <mark>. Zonder stammen is het de tekst zelf. */
export function Gemarkeerd({ tekst, stammen }: { tekst: string; stammen?: readonly string[] }) {
  if (!stammen || stammen.length === 0) return <>{tekst}</>;
  return (
    <>
      {tekst.split(WOORD).map((deel, i) =>
        i % 2 === 1 && stammen.some((s) => pastOpStam(deel, s)) ? <mark key={i}>{deel}</mark> : <span key={i}>{deel}</span>,
      )}
    </>
  );
}

function PlatteTekst({ tekst, stammen }: { tekst: string; stammen?: readonly string[] }) {
  return (
    <div className="b-doeltekst b-doeltekst-plat">
      {tekst.split('\n').map((regel, i) => (
        <p key={i} className="b-doeltekst-alinea">
          <Gemarkeerd tekst={regel} stammen={stammen} />
        </p>
      ))}
    </div>
  );
}

/** Een ingeklapt deel van de doeltekst; open als de treffer er staat. */
function Deel({ html, knop, stammen }: { html: string; knop: string; stammen?: readonly string[] }) {
  const blokken = doeltekstBlokken(html);
  const tekst = blokkenAlsTekst(blokken);
  const treffer = heeftTreffer(tekst, stammen);
  return (
    <details className="b-doelrij-deel" open={treffer || undefined}>
      <summary>{knop}</summary>
      {treffer ? <PlatteTekst tekst={tekst} stammen={stammen} /> : <DoeltekstWeergave blokken={blokken} />}
    </details>
  );
}

export interface DoelRijProps {
  doel: DoelBasis;
  /** Toon het eindmoment voor de code (in lijsten die meer momenten mengen, zoals de zoekresultaten). */
  metMoment?: boolean;
  /** Dit is het doel waar de pagina over gaat: 'dit doel', een lampstreep en aria-current. */
  dit?: boolean;
  /** De stammen van de gezochte woorden; gevonden woorden komen in <mark>. */
  markeer?: readonly string[];
}

export function DoelRij({ doel, metMoment = false, dit = false, markeer }: DoelRijProps) {
  const doelzin = blokkenAlsTekst(doeltekstBlokken(doel.doelzinHtml));
  const uitbreiding = doel.uitbreidingHtml ? doeltekstBlokken(doel.uitbreidingHtml) : undefined;
  const punten = uitbreiding ? opsommingPunten(uitbreiding) : 0;
  const knop = punten > 0 ? `Toon de opsomming (${punten} ${punten === 1 ? 'punt' : 'punten'})` : 'Toon de toelichting';
  return (
    <div className={dit ? 'b-doelrij b-doelrij-dit' : 'b-doelrij'}>
      <Link to={doelPad({ set: doel.setId, id: doel.id })} className="b-doelrij-link" aria-current={dit ? 'true' : undefined}>
        {metMoment && <span className="b-doelrij-moment">{MOMENT_KORT[doel.eind]}</span>}
        <span className="b-doelrij-code">{doel.code}</span>
        <span className="b-doelrij-tekst">
          <Gemarkeerd tekst={doelzin} stammen={markeer} />
        </span>
        {dit && <span className="b-dit">dit doel</span>}
      </Link>
      {doel.uitbreidingHtml && <Deel html={doel.uitbreidingHtml} knop={knop} stammen={markeer} />}
      {doel.woordenschatHtml && <Deel html={doel.woordenschatHtml} knop="Toon de richtinggevende woordenschat" stammen={markeer} />}
    </div>
  );
}
