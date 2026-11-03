// Het blok "Wanneer gelden deze doelen?" in het paneel van een set van het basisonderwijs
// (Officiële minimumdoelen, bouwstap 2b; zie docs/basisonderwijs/MOMENTMODEL.md).
//
// Het blok rekent niets zelf uit: het leest de uitkomsten van het momentmodel (src/lib/basis/moment.ts), met de
// jaren uit de invoeringskalender en de vaste zinnen uit momentTeksten.ts. Het schooljaar komt van de pagina, want
// de bibliotheek leest nergens de klok.
//
// Wat zeker is en wat niet, staat altijd als tekst: een badge "waarschijnlijk" of "nog onzeker" met een uitlegzin,
// en onder "Waarop steunt dit?" hoe elke bron gekend is. De kalender is samengesteld uit de einddata in de officiële
// gegevens en uit zoekresultaten; het blok zegt dat ook, en noemt hem nergens "nagekeken".

import { Link } from 'react-router-dom';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { veiligeLink } from '../../lib/minimumdoelenBron';
import {
  INVOERINGSKALENDER,
  schooljaarTekst,
  type Invoeringskalender,
  type Schooljaar,
  type Zekerheid,
} from '../../lib/basis/kalender';
import {
  invoeringVanSet,
  kalenderVoorSet,
  laagsteZekerheid,
  tweelingSets,
  type BasisSet,
  type Invoering,
  type KalenderRegel,
} from '../../lib/basis/moment';
import {
  BRON_HOE_LABEL,
  GOLF_TEKST,
  GOLF_ZEKERHEID_UITLEG,
  STATUS_VOLGORDE,
  leerjarenTekst,
  samengesteldTekst,
  statusDeel,
  vervallenTekst,
  vervangenTekst,
  voorWieTekst,
  zekerheidLabel,
  zekerheidUitleg,
} from '../../lib/basis/momentTeksten';
import '../../styles/basis-moment.css';

const KOP_ID = 'md-wanneer-kop';
const SET_ROUTE = '/leerplannen/minimumdoelen';
const setLinkStandaard = (id: string) => `${SET_ROUTE}/${id}`;
const TEKST_LEEG = 'De bron legt voor deze groep geen specifieke ontwikkelingsdoelen vast.';

/** De badge bij een zekerheid die niet zeker is. De zekerheid staat dus altijd als tekst, nooit alleen als kleur. */
function ZekerheidBadge({ zekerheid }: { zekerheid: Zekerheid }) {
  const label = zekerheidLabel(zekerheid);
  return label ? <span className="badge badge-warn">{label}</span> : null;
}

/** Eén regel van de tijdloze kalender, zonder badge: '1ste, 2de en 3de leerjaar: verplicht vanaf 2026-2027'. */
function regelTekst(regel: KalenderRegel): string {
  const lj = leerjarenTekst(regel.leerjaren);
  switch (regel.soort) {
    case 'verplicht-vanaf':
      return regel.jaar === undefined ? `${lj}: nog niet in de kalender van de app` : `${lj}: verplicht vanaf ${schooljaarTekst(regel.jaar)}`;
    case 'laatste-schooljaar':
      return regel.jaar === undefined ? `${lj}: nog niet in de kalender van de app` : `${lj}: geldt tot en met ${schooljaarTekst(regel.jaar)}`;
    case 'geen-einde':
      return `${lj}: geldt; de bron geeft geen einddatum`;
    default:
      return `${lj}: nog niet in de kalender van de app`;
  }
}

/** De delen van de lijn 'Dit schooljaar': per status de leerjaren, in de vaste volgorde van de statussen. */
function nuDelen(invoeringen: readonly Invoering[]): string[] {
  const delen: string[] = [];
  for (const status of STATUS_VOLGORDE) {
    const leerjaren = invoeringen.filter((i) => i.status === status).map((i) => i.leerjaar);
    if (leerjaren.length > 0) delen.push(statusDeel(status, leerjaren));
  }
  return delen;
}

/** De leerjaren waarvoor de nieuwe minimumdoelen al verplicht zijn terwijl deze (oude) set nog bestaat. */
function vervangenLeerjaren(invoeringen: readonly Invoering[]) {
  return invoeringen.filter((i) => i.status === 'vervangen').map((i) => i.leerjaar);
}

function uniek<T>(lijst: readonly T[]): T[] {
  return [...new Set(lijst)];
}

function Bronnen({ bronnen }: { bronnen: Invoeringskalender['bronnen'] }) {
  return (
    <ul>
      {bronnen.map((b) => {
        const href = veiligeLink(b.url);
        return (
          <li key={b.id}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {b.titel}
                <span className="sr-only"> (opent in een nieuw tabblad)</span>
              </a>
            ) : (
              b.titel
            )}
            {' — '}
            {BRON_HOE_LABEL[b.hoe]}
          </li>
        );
      })}
    </ul>
  );
}

export function WanneerGelden({
  set, alleSets, schooljaar, kalender = INVOERINGSKALENDER,
  kopId = KOP_ID, kopNiveau = 3, setLink = setLinkStandaard, toonTweeling = true,
}: {
  set: BasisSet;
  alleSets: readonly MinimumdoelenIndexSet[];
  /** Het schooljaar van vandaag (beginjaar), van de pagina. */
  schooljaar: Schooljaar;
  kalender?: Invoeringskalender;
  /** Het id van de kop (voor aria-labelledby). Zonder deze prop 'md-wanneer-kop'. */
  kopId?: string;
  /** Het niveau van de kop: 3 (in het paneel van een set) of 2 (als eigen deel van een pagina). */
  kopNiveau?: 2 | 3;
  /** Het pad van de link naar een andere set (de tweelingsets). Zonder deze prop de officiële pagina van de set. */
  setLink?: (id: string) => string;
  /** Toon het blok met de tweelingsets. De doelpagina toont de tweeling zelf, per doel. */
  toonTweeling?: boolean;
}) {
  const Kop = kopNiveau === 2 ? 'h2' : 'h3';
  // Een schijnset zonder doelen: niets te plannen, alleen de melding.
  if (set.leeg) {
    return (
      <section className="md-wanneer" aria-labelledby={kopId}>
        <Kop id={kopId}>Wanneer gelden deze doelen?</Kop>
        <p>{TEKST_LEEG}</p>
      </section>
    );
  }

  const invoeringen = invoeringVanSet(set, schooljaar, kalender);

  // Een oude set waarvan elk leerjaar vervallen is. Het label uit de gegevens ('Geldig') ligt vast op de ophaaldatum,
  // dus het blok zegt het zelf, op datum.
  if (invoeringen.length > 0 && invoeringen.every((i) => i.status === 'vervallen') && set.geldigTotEnMet !== undefined) {
    return (
      <section className="md-wanneer" aria-labelledby={kopId}>
        <Kop id={kopId}>Wanneer gelden deze doelen?</Kop>
        <p className="md-wanneer-voorwie">{voorWieTekst(set)}</p>
        <p className="md-wanneer-nu">{vervallenTekst(set.geldigTotEnMet)}</p>
      </section>
    );
  }

  const regels = kalenderVoorSet(set, kalender);
  const nieuw = set.generatie === 'nieuw';
  const delen = nuDelen(invoeringen);
  const laagste = laagsteZekerheid(invoeringen.map((i) => i.zekerheid));
  const vervangen = vervangenLeerjaren(invoeringen);
  const vervangenZekerheid = laagsteZekerheid(invoeringen.filter((i) => i.status === 'vervangen').map((i) => i.zekerheid));

  const vak = nieuw && set.golf !== undefined ? set.vak : undefined;
  const golfZekerheid: Zekerheid = vak ? vak.zekerheid : 'zeker';

  const opmerkingen = uniek(regels.flatMap((r) => (r.opmerking ? [r.opmerking] : [])));
  const uitleg = uniek(regels.flatMap((r) => zekerheidUitleg(r.zekerheid, r.reden) ?? []));
  const tweeling = toonTweeling ? tweelingSets(set, alleSets, kalender) : [];

  // De bronnen van wat het blok toont, in de volgorde van de kalender. Is er iets dat niet zeker is, dan komen de
  // bronnen die nog te lezen zijn erbij: zo ziet de leerkracht ook wat nog nagelezen moet worden.
  const bronIds = new Set<string>([...regels.flatMap((r) => r.bronnen), ...invoeringen.flatMap((i) => i.bronnen), ...(vak ? vak.bronnen : [])]);
  const nietZeker = regels.some((r) => r.zekerheid !== 'zeker') || golfZekerheid !== 'zeker';
  const bronnen = bronIds.size === 0 ? [] : kalender.bronnen.filter((b) => bronIds.has(b.id) || (nietZeker && b.hoe === 'nog-te-lezen'));

  return (
    <section className="md-wanneer" aria-labelledby={kopId}>
      <Kop id={kopId}>Wanneer gelden deze doelen?</Kop>
      <p className="md-wanneer-voorwie">{voorWieTekst(set)}</p>

      {delen.length > 0 && (
        <p className="md-wanneer-nu">
          Dit schooljaar ({schooljaarTekst(schooljaar)}): {delen.join(' · ')}
          {laagste !== 'zeker' && <> <ZekerheidBadge zekerheid={laagste} /></>}
        </p>
      )}
      {vervangen.length > 0 && (
        <p className="md-wanneer-vervangen">
          {vervangenTekst(vervangen)}
          {vervangenZekerheid !== 'zeker' && <> <ZekerheidBadge zekerheid={vervangenZekerheid} /></>}
        </p>
      )}

      {regels.length > 0 && (
        <ul className="md-wanneer-lijst" aria-label="De kalender van deze set">
          {regels.map((r, i) => (
            <li key={i}>
              {regelTekst(r)}
              {r.zekerheid !== 'zeker' && <> <ZekerheidBadge zekerheid={r.zekerheid} /></>}
            </li>
          ))}
        </ul>
      )}

      {nieuw && set.geldigVanaf !== undefined && <p>Mag al sinds {schooljaarTekst(set.geldigVanaf)}.</p>}

      {vak && set.golf !== undefined && (
        <>
          <p className="md-wanneer-golf">
            {GOLF_TEKST[set.golf]}
            {golfZekerheid !== 'zeker' && <> <ZekerheidBadge zekerheid={golfZekerheid} /></>}
          </p>
          {golfZekerheid !== 'zeker' && <p className="md-wanneer-uitleg">{GOLF_ZEKERHEID_UITLEG[golfZekerheid]}</p>}
        </>
      )}

      {opmerkingen.map((o) => <p key={o} className="md-wanneer-noot">{o}</p>)}
      {uitleg.map((u) => <p key={u} className="md-wanneer-uitleg">{u}</p>)}

      {tweeling.length > 0 && (
        <div className="md-wanneer-tweeling">
          <p>
            {set.soort === 'bao'
              ? 'Dezelfde doelen (zelfde nummers) staan ook in het buitengewoon basisonderwijs, daar na te streven:'
              : 'Dezelfde doelen (zelfde nummers) staan ook in het basisonderwijs:'}
          </p>
          <ul>
            {tweeling.map((t) => (
              <li key={t.id}>
                <Link to={setLink(t.id)}>‘{t.korteNaam || t.naam}’ ({t.id})</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bronnen.length > 0 && (
        <details className="md-wanneer-bronnen">
          <summary>Waarop steunt dit?</summary>
          <div className="md-wanneer-bronnen-lijst">
            <Bronnen bronnen={bronnen} />
          </div>
        </details>
      )}

      <p className="md-wanneer-voet">{samengesteldTekst(kalender)}</p>
    </section>
  );
}
