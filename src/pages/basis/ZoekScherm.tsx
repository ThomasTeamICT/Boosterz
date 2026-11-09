// #/basis/zoek?q=…&soort=gewoon|buitengewoon&leerjaar=L3&bereik=leerjaar|alles: zoeken in de doelen, in gewone woorden,
// zonder AI en zonder sleutel (zoekBasis.ts en de woordentabel in zoekwoorden.ts).
//
// - Bereik: met een leerjaar eerst de nieuwe sets van het eindmoment van dat leerjaar (8 tot 10), met 'Zoek in alle
//   vakken en momenten' voor de rest; anders alle nieuwe sets van de soort (29 of 27). Noemt de vraag zelf een moment
//   ('3de leerjaar', 'kleuters'), dan geldt dat moment. Een doelnummer of een code zoekt altijd overal.
// - De sets worden pas geladen als de vraag doelen nodig heeft; een lege vraag, of alleen een vak of een moment, vraagt
//   alleen de index.
// - Gewoon of buitengewoon wisselen kan hier (twee links met dezelfde vraag). Niets wordt bewaard, ook de vraag niet.

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doelSleutel, ZoekResultaten } from '../../components/basis/ZoekResultaten';
import { ZoekVeld } from '../../components/basis/ZoekVeld';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { useBasisIndex } from '../../components/basis/useBasisSets';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { useSetBestanden } from '../../components/curriculum/samenstellen/useSetBestanden';
import { basisPad, basisRoute } from '../../lib/basis/basisRoutes';
import { doelenVanSet, type DoelBasis } from '../../lib/basis/doelBasis';
import { WERKT_NAAR, type Eindmoment, type LeerjaarBasis, type SoortBasis } from '../../lib/basis/kalender';
import { basisSet, type BasisSet } from '../../lib/basis/moment';
import { leesVraag, zoekDoelen, zoekDoelVan, type Vraag } from '../../lib/basis/zoekBasis';
import { ZOEKWOORDEN } from '../../lib/basis/zoekwoorden';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { SoortLinks } from './MomentScherm';
import '../../styles/basis-go.css';
import '../../styles/basis-zoek.css';

export type GoCode = { soort: 'leerplandoel' | 'lesplan'; code: string };

const MAX_GO_CODES = 3;

/**
 * De codes van het GO! in een zoekvraag: een leerplandoel (WT.086) of een lesplan (LP0065, LP0014a). Hoofdletters maken niet
 * uit; de code staat er weer in de vorm van het GO! ('wt.086' wordt 'WT.086'). Alleen wat een geldig adres geeft telt, en
 * hoogstens drie. Of de code echt bestaat, zegt het scherm waar de link naartoe gaat.
 */
export function goCodesIn(vraag: string): GoCode[] {
  const uit: GoCode[] = [];
  for (const woord of vraag.split(/\s+/)) {
    const kaal = woord.replace(/[.,;:!?()]+$/, '');
    const scherm = /^[a-z]{2}\.\d{3,4}$/i.test(kaal)
      ? basisRoute(`leerplandoel/${kaal}`, '')
      : /^lp\d{4}[a-z]?$/i.test(kaal)
        ? basisRoute(`lesplan/${kaal}`, '')
        : undefined;
    if ((scherm?.s === 'leerplandoel' || scherm?.s === 'lesplan') && !uit.some((g) => g.code === scherm.code)) {
      uit.push({ soort: scherm.s, code: scherm.code });
    }
    if (uit.length === MAX_GO_CODES) break;
  }
  return uit;
}

/** Een gevonden code van het GO!, meteen als link (het GO! zelf, naast de doelen van de overheid). */
export function GoCodeLinks({ codes }: { codes: readonly GoCode[] }) {
  if (codes.length === 0) return null;
  return (
    <section className="b-blok b-zoek-go" aria-labelledby="b-zoek-go-kop">
      <h2 id="b-zoek-go-kop">Gevonden bij het GO!</h2>
      <ul className="b-go-lesplannen">
        {codes.map((g) => (
          <li key={g.code}>
            <Link to={basisPad(g.soort === 'lesplan' ? { s: 'lesplan', code: g.code } : { s: 'leerplandoel', code: g.code })} className="b-go-lesplanlink">
              {g.soort === 'lesplan' ? `Lesplan ${g.code}` : `Leerplandoel ${g.code}`}
            </Link>{' '}
            <span className="b-go-leeftijden">{g.soort === 'lesplan' ? '(lesplan van het GO!)' : '(leerplandoel van het GO!)'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Heeft deze vraag de doelen zelf nodig, of volstaat de index (leeg, alleen een vak of alleen een moment)? */
export function heeftDoelenNodig(vraag: Vraag): boolean {
  return vraag.termen.length > 0 || vraag.id !== undefined || vraag.code !== undefined;
}

/**
 * De sets waarin gezocht wordt: de nieuwe, niet-lege basissets van de soort. Noemt de vraag een moment, dan dat moment;
 * anders bij bereik 'leerjaar' het eindmoment van het leerjaar; anders alle momenten. Een doelnummer of een code zoekt overal.
 */
export function zoekSets(
  alle: readonly MinimumdoelenIndexSet[],
  soort: SoortBasis,
  vraag: Vraag,
  leerjaar: LeerjaarBasis | undefined,
  bereik: 'leerjaar' | 'alles',
): { set: MinimumdoelenIndexSet; info: BasisSet }[] {
  if (!heeftDoelenNodig(vraag)) return [];
  let einden: readonly Eindmoment[] | undefined;
  if (vraag.id === undefined && vraag.code === undefined) {
    if (vraag.eind) einden = vraag.eind;
    else if (bereik === 'leerjaar' && leerjaar) einden = [WERKT_NAAR[leerjaar]];
  }
  return alle.flatMap((set) => {
    const info = basisSet(set);
    if (!info || info.generatie !== 'nieuw' || info.leeg || info.soort !== soort || info.eindmoment === undefined) return [];
    if (einden && !einden.includes(info.eindmoment)) return [];
    return [{ set, info }];
  });
}

/** Het bereik waarin echt gezocht wordt: een moment in de vraag of een doelnummer maakt het 'alles'. */
export function echtBereik(vraag: Vraag, bereik: 'leerjaar' | 'alles', leerjaar?: LeerjaarBasis): 'leerjaar' | 'alles' {
  if (vraag.eind || vraag.id !== undefined || vraag.code !== undefined) return 'alles';
  return bereik === 'leerjaar' && leerjaar ? 'leerjaar' : 'alles';
}

export function ZoekScherm({ soort, vraag, leerjaar, bereik }: { soort: SoortBasis; vraag: string; leerjaar?: LeerjaarBasis; bereik: 'leerjaar' | 'alles' }) {
  const navigate = useNavigate();
  const { keuze } = useBasisKeuze();
  const index = useBasisIndex();
  const alle = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  // Het leerjaar van de leerkracht: dat in de url, anders het bewaarde als het bij dezelfde soort hoort (alleen om te rangschikken).
  const eigenLeerjaar = leerjaar ?? (keuze?.soort === soort ? keuze.leerjaar : undefined);

  const gelezen = useMemo(() => leesVraag(vraag, ZOEKWOORDEN), [vraag]);
  const goCodes = useMemo(() => goCodesIn(vraag), [vraag]);
  const effectief = echtBereik(gelezen, bereik, leerjaar);
  const sets = useMemo(() => (alle ? zoekSets(alle, soort, gelezen, leerjaar, bereik) : []), [alle, soort, gelezen, leerjaar, bereik]);
  const ids = useMemo(() => sets.map((s) => s.set.id), [sets]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);
  const fouten = ids.filter((id) => stand(id).status === 'fout');
  const klaar = ids.every((id) => stand(id).status === 'klaar');

  const doelen = useMemo(() => {
    const uit = new Map<string, DoelBasis>();
    for (const s of sets) {
      const b = bestanden.get(s.set.id);
      if (!b) continue;
      for (const d of doelenVanSet(b, s.info)) uit.set(doelSleutel(d.setId, d.id), d);
    }
    return uit;
  }, [sets, bestanden]);
  const uitslag = useMemo(
    () => (alle && klaar ? zoekDoelen([...doelen.values()].map(zoekDoelVan), gelezen, { eigenEind: eigenLeerjaar ? WERKT_NAAR[eigenLeerjaar] : undefined }) : undefined),
    [alle, klaar, doelen, gelezen, eigenLeerjaar],
  );

  const waar = effectief === 'leerjaar' && leerjaar ? 'de doelen van het eindmoment van je leerjaar' : 'alle doelen';
  const naarZoeken = (nieuw: string) => navigate(basisPad({ s: 'zoek', soort, vraag: nieuw, leerjaar, bereik }));

  return (
    <div className="b-zoekpagina">
      <h1>Zoeken in de doelen</h1>
      <ZoekVeld key={vraag} vraag={vraag} label={`Zoek in ${waar}`} onZoek={naarZoeken} />
      <div className="b-schakelaars">
        <SoortLinks soort={soort} naar={(s) => ({ s: 'zoek', soort: s, vraag, leerjaar, bereik })} />
      </div>
      <GoCodeLinks codes={goCodes} />
      {index.stand.status === 'laden' && <LaadBericht tekst="De doelen worden geladen" />}
      {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
      {alle !== undefined && !klaar && (
        <>
          {fouten.length === 0 && <LaadBericht tekst={`De doelen worden geladen (${ids.length} ${ids.length === 1 ? 'set' : 'sets'})`} />}
          {fouten.map((id) => {
            const s = stand(id);
            return s.status === 'fout' ? <FoutBericht key={id} fout={s.fout} naam={id} onOpnieuw={() => opnieuw(id)} /> : null;
          })}
        </>
      )}
      {alle !== undefined && uitslag && (
        <ZoekResultaten uitslag={uitslag} vraagTekst={vraag} doelen={doelen} soort={soort} leerjaar={leerjaar} bereik={effectief} alle={alle} />
      )}
    </div>
  );
}
