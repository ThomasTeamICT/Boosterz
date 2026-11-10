// De letterlijke tekst van het GO! op het scherm: stukken, regels en blokken van een lesplan (docs/basisonderwijs/
// GO-LEERPLAN.md, "In de app"). Er komt alleen opmaak van de bron bij (vet, cursief, onderlijnd, doorgehaald,
// superschrift, regeleinden, lijsten, tabellen en beelden), nooit een andere tekst.
//
// - Tabellen zijn echte tabellen (th met scope, rowSpan voor een cel die over rijen loopt). Op een smal scherm wordt elke
//   rij een kaart (css); de rollen staan er dan expliciet bij, zodat een schermlezer er een tabel in blijft horen.
// - Een icoon heeft nooit een alt-tekst: er staat altijd een zichtbaar woord bij (vlag, schakel), tenzij de tekst er zelf
//   al mee begint ('Diploma').
// - Elk blok krijgt een vaste id (wijzerId), zodat 'In het kort' en 'Ga naar' naar een plek in het lesplan kunnen springen.
// - Een vette code van een bestaand leerplandoel (WT.229) wordt een link naar dat doel; de tekst zelf verandert niet.

import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GO_MAP } from '../../../lib/basis/go/goBron';
import type { Blok, Cel, CelBlok, GoBeeld, Regel, Stuk, TekstStuk, Wijzer } from '../../../lib/basis/go/types';
import { beginMetWoord, GO_ICOON, GO_ICOON_WOORD, tekstNaIcoon } from './goIconen';

// ── Plaatsen in de tekst ─────────────────────────────────────────────────────

/** De id van een plek in een lesplan: 'lp-d2-b1-r1-k1-g0' (deel 2, blok 1, rij 1, kolom 1, regel 0) en '-i3' voor een lijstitem. */
export function wijzerId(w: Wijzer): string {
  let id = `lp-d${w.deel}-b${w.blok}`;
  if (w.rij !== undefined) id += `-r${w.rij}`;
  if (w.kolom !== undefined) id += `-k${w.kolom}`;
  if (w.regel !== undefined) id += `-g${w.regel}`;
  if (w.item !== undefined) id += `-i${w.item}`;
  return id;
}

/**
 * Zet de focus op een plek en scrolt ernaartoe. In een hash-router is een anker een route, dus we doen het zelf. De eerste
 * id die bestaat wint; een element zonder tabindex krijgt er -1 bij om de focus te kunnen krijgen (tot de focus weggaat).
 */
export function gaNaarId(...ids: string[]): boolean {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    // De tabindex blijft alleen zolang de focus er staat: anders krijgt een latere muisklik in die (soms 1000 px hoge) cel
    // opnieuw een focusring rond de hele cel.
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
      el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
    }
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'start' });
    return true;
  }
  return false;
}

// ── Opties voor alle teksten eronder ────────────────────────────────────────

export interface GoTekstOpties {
  /** Het adres van een leerplandoel als de code bestaat; anders undefined. Zonder deze functie zijn er geen links. */
  doelLink?: (code: string) => string | undefined;
}
const OPTIES: GoTekstOpties = {};
const GoOpties = createContext<GoTekstOpties>(OPTIES);

export function useGoTekstOpties(): GoTekstOpties {
  return useContext(GoOpties);
}

export function GoTekstOptiesProvider({ opties, children }: { opties: GoTekstOpties; children: ReactNode }) {
  return <GoOpties.Provider value={opties}>{children}</GoOpties.Provider>;
}

// ── Tekst zonder opmaak ──────────────────────────────────────────────────────

/** De platte tekst van een regel: regeleinden worden een spatie, een icoon geeft niets. */
export function regelTekst(regel: Regel): string {
  return regel.map((s) => ('t' in s ? s.t : 'br' in s ? ' ' : '')).join('');
}

/** De platte tekst van een cel, een alinea of lijstitem per regel, met één spatie ertussen. */
export function celTekst(cel: Cel): string {
  const delen: string[] = [];
  for (const b of cel.blokken) {
    if (b.soort === 'alinea') delen.push(regelTekst(b.tekst));
    else if (b.soort === 'lijst') for (const i of b.items) delen.push(regelTekst(i));
  }
  return delen.join(' ').replace(/\s+/g, ' ').trim();
}

// ── Stukken en regels ────────────────────────────────────────────────────────

const DOELCODE = /^(\s*)([A-Z]{2}\.\d{3,4})(\s*)$/;

function tekstStuk(s: TekstStuk, doelLink: GoTekstOpties['doelLink']): ReactNode {
  let node: ReactNode = s.t;
  if (s.b && doelLink) {
    const m = DOELCODE.exec(s.t);
    const naar = m ? doelLink(m[2]) : undefined;
    if (m && naar) {
      node = (
        <>
          {m[1]}
          <Link to={naar} className="b-lp-doelcode">{m[2]}</Link>
          {m[3]}
        </>
      );
    }
  }
  if (s.sup) node = <sup>{node}</sup>;
  if (s.s) node = <s>{node}</s>;
  if (s.u) node = <u>{node}</u>;
  if (s.i) node = <em>{node}</em>;
  if (s.b) node = <strong>{node}</strong>;
  return node;
}

/** Eén regel: stukken met opmaak, regeleinden en pictogrammen (met hun woord). */
export function GoRegel({ regel }: { regel: Regel }) {
  const { doelLink } = useContext(GoOpties);
  return (
    <>
      {regel.map((s: Stuk, n) => {
        if ('br' in s) return <br key={n} />;
        if ('icoon' in s) {
          const Icoon = GO_ICOON[s.icoon];
          const woordErna = beginMetWoord(s.icoon, tekstNaIcoon(regel, n));
          return (
            <span key={n} className="b-lp-icoon">
              <Icoon size={16} aria-hidden="true" />
              {!woordErna && <span className="b-lp-icoonwoord">{GO_ICOON_WOORD[s.icoon]}</span>}
            </span>
          );
        }
        return <Fragment key={n}>{tekstStuk(s, doelLink)}</Fragment>;
      })}
    </>
  );
}

// ── Beeld ────────────────────────────────────────────────────────────────────

/** Een beeld uit een lesplan: getoond met een beschrijvende alt-tekst, of op zijn plaats de zin dat het ontbreekt. */
export function GoBeeldWeergave({ beeld, id }: { beeld: GoBeeld; id?: string }) {
  if (beeld.status === 'weggelaten') {
    return (
      <p id={id} className="b-lp-beeld-weg">
        {beeld.uitleg}
      </p>
    );
  }
  return (
    <figure id={id} className="b-lp-beeld">
      <img src={`${GO_MAP}${beeld.bestand}`} alt={beeld.alt} width={beeld.breedte} height={beeld.hoogte} loading="lazy" decoding="async" />
      <p className="b-lp-beeld-groot">
        <a href={`${GO_MAP}${beeld.bestand}`} target="_blank" rel="noopener">
          Toon het beeld groot<span className="sr-only"> (opent in een nieuw tabblad)</span>
        </a>
      </p>
      {beeld.uitleg && (
        <figcaption>
          <details className="b-lp-beeld-uitleg">
            <summary>Beschrijving van het beeld in woorden</summary>
            <p>{beeld.uitleg}</p>
          </details>
        </figcaption>
      )}
    </figure>
  );
}

// ── Blokken ──────────────────────────────────────────────────────────────────

type Pad = Wijzer;

const KOPPEN = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/** Eén blok: kop, alinea, lijst, tabel of beeld. `pad` bepaalt de id's. */
export function GoBlok({ blok, pad }: { blok: Blok | CelBlok; pad: Pad }) {
  const id = wijzerId(pad);
  switch (blok.soort) {
    case 'kop': {
      const Kop = KOPPEN[blok.niveau];
      return (
        <Kop id={id}>
          <GoRegel regel={blok.tekst} />
        </Kop>
      );
    }
    case 'alinea':
      return (
        <p id={id}>
          <GoRegel regel={blok.tekst} />
        </p>
      );
    case 'lijst': {
      const items = blok.items.map((item, n) => (
        <li key={n} id={wijzerId({ ...pad, item: n })}>
          <GoRegel regel={item} />
        </li>
      ));
      return blok.genummerd ? (
        <ol id={id} start={blok.start}>
          {items}
        </ol>
      ) : (
        <ul id={id}>{items}</ul>
      );
    }
    case 'tabel':
      return <GoTabel rijen={blok.rijen} pad={pad} />;
    case 'beeld':
      return <GoBeeldWeergave beeld={blok} id={id} />;
  }
}

/** De blokken van één deel, in bronvolgorde; blok n heeft de id lp-d<deel>-b<n>. */
export function GoBlokken({ blokken, deel }: { blokken: readonly Blok[]; deel: number }) {
  return (
    <>
      {blokken.map((b, n) => (
        <GoBlok key={n} blok={b} pad={{ deel, blok: n }} />
      ))}
    </>
  );
}

// ── Tabel ────────────────────────────────────────────────────────────────────

/** Hoeveel rijen een cel met `begin` beslaat: zichzelf en de cellen eronder die 'vervolg' zijn. */
export function rijenSamengevoegd(rijen: readonly (readonly Cel[])[], rij: number, kolom: number): number {
  let n = 1;
  while (rijen[rij + n]?.[kolom]?.samengevoegd === 'vervolg') n++;
  return n;
}

function GoCelInhoud({ cel, pad }: { cel: Cel; pad: Pad }) {
  return (
    <>
      {cel.blokken.map((b, g) => (
        <GoBlok key={g} blok={b} pad={{ ...pad, regel: g }} />
      ))}
    </>
  );
}

/**
 * Een echte tabel. De eerste rij is een koprij als al haar cellen kolomkop zijn. Een lege kop van de eerste kolom krijgt een
 * woord voor de schermlezer. Elke gegevenscel draagt, voor de kaartweergave, de tekst van haar kolomkop als label.
 */
export function GoTabel({ rijen, pad }: { rijen: readonly (readonly Cel[])[]; pad: Pad }) {
  const heeftKoprij = rijen.length > 0 && rijen[0].length > 0 && rijen[0].every((c) => c.rol === 'kolomkop');
  const koppen = heeftKoprij ? rijen[0].map(celTekst) : [];
  // Een tabel met rijkoppen (Kennis, Leskern …): de eerste kolom is smal en de kop erboven is leeg.
  const metRijkoppen = heeftKoprij && rijen[0][0].blokken.length === 0 && rijen.slice(1).some((r) => r[0]?.rol === 'rijkop');

  const cel = (c: Cel, r: number, k: number) => {
    if (c.samengevoegd === 'vervolg') {
      // Op een smal scherm is elke rij een kaart en loopt de samengevoegde rijkop (Leskern) niet door: zonder deze herhaling
      // staan de cellen van de kaart onder de verkeerde kolomkop voor een schermlezer. Breed en op papier is ze verborgen.
      let b = r - 1;
      while (b >= 0 && rijen[b]?.[k]?.samengevoegd === 'vervolg') b--;
      const begin = rijen[b]?.[k];
      if (!begin || begin.rol !== 'rijkop') return null;
      return (
        <th key={k} role="rowheader" scope="row" className="b-lp-rijkop b-lp-vervolg">
          {celTekst(begin)}
        </th>
      );
    }
    const celPad: Pad = { ...pad, rij: r, kolom: k };
    const id = wijzerId(celPad);
    const rowSpan = c.samengevoegd === 'begin' ? rijenSamengevoegd(rijen, r, k) : undefined;
    if (c.rol === 'data') {
      const label = koppen[k];
      const leeg = c.blokken.length === 0;
      return (
        <td key={k} id={id} role="cell" rowSpan={rowSpan} className={leeg ? 'b-lp-cel b-lp-cel-leeg' : 'b-lp-cel'}>
          {label && !leeg ? <span className="b-lp-label" aria-hidden="true">{label}</span> : null}
          <GoCelInhoud cel={c} pad={celPad} />
        </td>
      );
    }
    const alsKolom = c.rol === 'kolomkop';
    const leeg = c.blokken.length === 0;
    return (
      <th
        key={k}
        id={id}
        role={alsKolom ? 'columnheader' : 'rowheader'}
        scope={alsKolom ? 'col' : 'row'}
        rowSpan={rowSpan}
        className={alsKolom ? 'b-lp-kolomkop' : 'b-lp-rijkop'}
      >
        {leeg ? <span className="sr-only">Onderdeel</span> : <GoCelInhoud cel={c} pad={celPad} />}
      </th>
    );
  };

  const rij = (cellen: readonly Cel[], r: number) => (
    <tr key={r} id={wijzerId({ ...pad, rij: r })} role="row">
      {cellen.map((c, k) => cel(c, r, k))}
    </tr>
  );

  return (
    <div className="b-lp-tabelrand">
      <table id={wijzerId(pad)} role="table" className={metRijkoppen ? 'b-lp-tabel b-lp-tabel-rijkop' : 'b-lp-tabel'}>
        {heeftKoprij && <thead>{rij(rijen[0], 0)}</thead>}
        <tbody>{rijen.map((cellen, r) => (heeftKoprij && r === 0 ? null : rij(cellen, r)))}</tbody>
      </table>
    </div>
  );
}
