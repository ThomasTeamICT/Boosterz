// De sectie "De officiële minimumdoelen" van een richting (docs/STUDIERICHTINGEN.md § 14.3): welke doelen bij de richting
// horen en waar die gegevens vandaan komen, met de knoppen om er een cursus of een leerplan mee te maken.
//
// Dit bestand bevat ook wat de andere secties van het detail delen: de context van de richting (`RichtingContext`), het
// laden van de setbestanden en het leerplan van de hele richting (`leerplanVanHeleRichting`). Bewaren doet de aanroeper.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddIcon, GoalIcon, InfoIcon, WarningIcon } from '../icons';
import { useToast } from '../ui';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import { NieuweRichtingCursus } from './NieuweRichtingCursus';
import { bksVan, type BkStand } from './useRichtingBk';
import { BK_ZIN_RICHTING } from '../../lib/bkWeergave';
import { allSections, type Course } from '../../lib/courseTypes';
import { getCurricula, normalizeGoalCode, normalizeGoalCodes, saveCurriculum } from '../../lib/curriculum';
import type { Curriculum } from '../../lib/curriculumTypes';
import { sanitizeDoelgroep } from '../../lib/doelgroep';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { contextVanSet, datumLeesbaar, laadSet, oudeVersieIds } from '../../lib/minimumdoelenBron';
import {
  leerplanVoorRichting,
  selectieVanKeuzes,
  titelVoorRichtingLeerplan,
  vindLeerplanMetSelectie,
} from '../../lib/richtingCursus';
import {
  doelgroepVan,
  naarSetKeuzes,
  selectieVanKader,
  type KaderSet,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from '../../lib/richtingKader';
import { setNaam } from '../../lib/samenstelKeuze';

const SAMENSTELLEN_ROUTE = '/leerplannen/samenstellen';
const MINIMUMDOELEN_ROUTE = '/leerplannen/minimumdoelen';

// ── Wat de secties van een richting delen ───────────────────────────────────

export interface RichtingContext {
  info: RichtingInfo;
  /** De keuze van de leerkracht, met het jaar (voor wat ze maakt). Het kader zelf hangt niet van het jaar af. */
  keuze: RichtingKeuze;
  kader: RichtingKader;
  indexSets: readonly MinimumdoelenIndexSet[];
  curricula: readonly Curriculum[];
  /** De beroepskwalificaties van de richting (§ 23.7, `useRichtingBk`); ontbreekt het, dan is het als 'niet-van-toepassing'. */
  bk?: BkStand;
}

/** "G-0193|so"-achtig: alle doelen van het kader als "set|vast nummer" (zoals `leerplannenBijRichting` ze vraagt). */
export function kaderSleutelsVan(kader: RichtingKader): Set<string> {
  const uit = new Set<string>();
  for (const k of kader.sets) for (const id of k.ids) uit.add(`${k.set.id}|${id}`);
  return uit;
}

/** De doelgroep van een cursus staat sinds fase 2 in `lib/doelgroepGebruik.ts` (ook de klas gebruikt ze); bestaande imports blijven werken. */
export { doelgroepVanCursus } from '../../lib/doelgroepGebruik';

/**
 * Hoeveel doelen van het kader (set + vast nummer) de cursus raakt: de doelcodes op haar secties, opgezocht in haar leerplan,
 * en dan de verwijzingen van die doelen. Een cursus zonder leerplan, of een leerplan zonder verwijzingen, raakt er geen.
 */
export function raaktDoelen(course: Course, leerplan: Curriculum | undefined, kaderSleutels: ReadonlySet<string>): number {
  if (!leerplan || !Array.isArray(leerplan.goals)) return 0;
  const codes = new Set<string>();
  for (const { section } of allSections(course)) for (const code of normalizeGoalCodes(section.goalCodes)) codes.add(code);
  const geraakt = new Set<string>();
  for (const goal of leerplan.goals) {
    if (!codes.has(normalizeGoalCode(typeof goal?.code === 'string' ? goal.code : ''))) continue;
    for (const ref of Array.isArray(goal.refs) ? goal.refs : []) {
      const sleutel = `${ref?.set}|${ref?.id}`;
      if (kaderSleutels.has(sleutel)) geraakt.add(sleutel);
    }
  }
  return geraakt.size;
}

/**
 * De adresbalk-vraag waarmee de samenstelwizard en de inleeswizard een richting kennen: `richting`, `jaar` (als er een
 * jaar gekozen is) en `soort` (het soort onderwijs dat echt geldt).
 */
export function richtingQuery(info: RichtingInfo, keuze: RichtingKeuze, kader: RichtingKader): string {
  const p = new URLSearchParams();
  p.set('richting', info.groep.nummer);
  if (keuze.jaar !== undefined) p.set('jaar', String(keuze.jaar));
  p.set('soort', kader.keuze.soort);
  return p.toString();
}

/** De bestanden van deze sets. Een set die niet laadt, ontbreekt gewoon in het resultaat: `leerplanVoorRichting` meldt dat. */
export async function laadSetBestanden(ids: readonly string[]): Promise<Map<string, MinimumdoelenSetBestand>> {
  const uit = new Map<string, MinimumdoelenSetBestand>();
  const resultaten = await Promise.allSettled(ids.map((id) => laadSet(id)));
  resultaten.forEach((r, i) => {
    if (r.status === 'fulfilled') uit.set(ids[i], r.value);
  });
  return uit;
}

export interface LeerplanVanRichting {
  leerplan: Curriculum;
  /** Het stond al op dit toestel (hergebruikt, niets nieuws om te bewaren). */
  bestaand: boolean;
  bevestigd: boolean;
  waarschuwingen: string[];
}

/**
 * Het leerplan met alle verplichte doelen van de richting: een nagekeken leerplan dat al op dit toestel staat, of een nieuw
 * (nog niet bewaard). Een set die niet laadde, geeft een leerplan dat niet bevestigd is: dan bewaart de aanroeper niets.
 */
export async function leerplanVanHeleRichting(c: Omit<RichtingContext, 'curricula'>): Promise<LeerplanVanRichting> {
  const selectie = selectieVanKader(c.kader);
  const ids = [...selectie.keys()];
  const bestanden = await laadSetBestanden(ids);
  const doelgroep = doelgroepVan(c.info, c.keuze);
  // Zonder alle sets zou de selectie kleiner zijn dan de richting en kon er een kleiner leerplan als "het" leerplan gelden.
  if (bestanden.size === ids.length) {
    const gevonden = vindLeerplanMetSelectie(getCurricula(), selectieVanKeuzes(naarSetKeuzes(selectie, bestanden).keuzes), doelgroep);
    if (gevonden) return { leerplan: gevonden, bestaand: true, bevestigd: true, waarschuwingen: [] };
  }
  const r = leerplanVoorRichting(c.kader, bestanden, doelgroep, {
    titel: titelVoorRichtingLeerplan(c.info, c.kader),
    oudeVersies: oudeVersieIds(c.indexSets),
  });
  return { leerplan: r.leerplan, bestaand: false, bevestigd: r.bevestigd, waarschuwingen: r.waarschuwingen };
}

/** "Het leerplan kon niet als nagekeken bewaard worden: …" met de eerste waarschuwing (§ 14.3). */
export function nietNagekekenTekst(waarschuwingen: readonly string[]): string {
  const eerste = (waarschuwingen[0] ?? 'het nakijken is niet gelukt').trim().replace(/[.\s]+$/, '');
  return `Het leerplan kon niet als nagekeken bewaard worden: ${eerste}. Kies zelf doelen, dan zie je wat er misloopt.`;
}

export function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

function aantalSets(n: number): string {
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
}

/** "a", "a en b", "a, b en c". */
function somLijst(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? '') : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** De namen van de sets: de korte naam, met de context erbij als twee sets dezelfde naam hebben. */
function setLabels(sets: readonly KaderSet[]): Map<string, string> {
  const tellen = new Map<string, number>();
  for (const k of sets) tellen.set(setNaam(k.set), (tellen.get(setNaam(k.set)) ?? 0) + 1);
  const uit = new Map<string, string>();
  for (const k of sets) {
    const naam = setNaam(k.set);
    const context = (tellen.get(naam) ?? 0) > 1 ? contextVanSet(k.set.naam) : '';
    uit.set(k.set.id, context ? `${naam} (${context})` : naam);
  }
  return uit;
}

// ── Staat het leerplan van de hele richting al op dit toestel? ──────────────

/**
 * Het leerplan op dit toestel dat bij de doelen van de richting hoort: het leerplan dat we net bewaarden of vonden
 * (`gevondenId`), of een nagekeken samengesteld leerplan met precies de verplichte doelen van de richting (ook zonder
 * doelgroep). "Open het leerplan" en de lijst "Leerplannen van deze richting op dit toestel" gebruiken dit allebei.
 *
 * Dat vraagt de setbestanden; alleen als er een leerplan is dat zou kunnen passen (dezelfde sets), halen we ze op. Anders kost
 * het openen van een richting geen enkel setbestand.
 */
export function useBestaandLeerplan(
  { info, keuze, kader, curricula }: Pick<RichtingContext, 'info' | 'keuze' | 'kader' | 'curricula'>,
  gevondenId: string | null,
): Curriculum | undefined {
  const verplichteIds = useMemo(() => kader.sets.filter((k) => k.verplicht).map((k) => k.set.id), [kader]);
  const kandidaat = useMemo(() => {
    const gevraagd = new Set(verplichteIds);
    return curricula.some((c) => {
      if (c.herkomst?.methode !== 'samengesteld' || c.kind === 'eigen') return false;
      const eigen = new Set(c.minimumdoelenSets ?? []);
      if (eigen.size !== gevraagd.size || ![...gevraagd].every((s) => eigen.has(s))) return false;
      const groep = sanitizeDoelgroep(c.doelgroep)?.groep;
      return groep === undefined || groep === info.groep.nummer;
    });
  }, [curricula, verplichteIds, info.groep.nummer]);
  const { bestanden: kandidaatBestanden } = useSetBestanden(kandidaat ? verplichteIds : []);
  return useMemo(() => {
    if (gevondenId !== null) {
      const l = curricula.find((c) => c.id === gevondenId);
      if (l) return l;
    }
    if (!kandidaat || verplichteIds.length === 0 || kandidaatBestanden.size < verplichteIds.length) return undefined;
    const selectie = selectieVanKader(kader);
    return vindLeerplanMetSelectie(curricula, selectieVanKeuzes(naarSetKeuzes(selectie, kandidaatBestanden).keuzes), doelgroepVan(info, keuze));
  }, [gevondenId, curricula, kandidaat, verplichteIds, kandidaatBestanden, kader, info, keuze]);
}

// ── Een set in de lijst ─────────────────────────────────────────────────────

function SetRij({ k, naam }: { k: KaderSet; naam: string }) {
  return (
    <li className="ri-set">
      <span className="ri-set-tekst">
        <span className="ri-set-naam">{naam}</span>
        {' · '}
        {k.volledig ? aantalDoelen(k.ids.length) : `${k.ids.length} van ${k.set.aantal} doelen`}
        {!k.verplicht && ' (uitbreidingsdoelen: mag, moet niet)'}
      </span>
      <Link className="ri-set-link" to={`${MINIMUMDOELEN_ROUTE}/${k.set.id}`}>
        Bekijk de set<span className="sr-only"> {naam}</span>
      </Link>
    </li>
  );
}

// ── Waar komt dit vandaan? ──────────────────────────────────────────────────

function Herkomst({ kader, info }: { kader: RichtingKader; info: RichtingInfo }) {
  const opgehaald = kader.opgehaald ? datumLeesbaar(kader.opgehaald) : '';
  switch (kader.herkomst) {
    case 'api':
      return <p>Welke doelen bij deze richting horen, komt uit de Onderwijsdoelen-API van de Vlaamse overheid{opgehaald ? ` (opgehaald op ${opgehaald})` : ''}.</p>;
    case 'graad-en-stroom':
      return (
        <p>
          In de 1ste graad koppelt de officiële bron de doelen niet per richting of basisoptie, maar per stroom. Hier staan alle sets van de 1ste graad{' '}
          {info.stroom ? `${info.stroom}-stroom ` : ''}die nu gelden.
        </p>
      );
    case 'geen':
      if (kader.sets.length > 0) {
        const sinds = kader.nietMeerInBron ? datumLeesbaar(kader.nietMeerInBron) : '';
        return (
          <div className="callout warn ri-melding" role="note">
            <WarningIcon size={20} className="ri-melding-icoon" />
            <div className="ri-melding-tekst">
              <p>
                De officiële bron koppelt {sinds ? `sinds ${sinds} ` : ''}geen minimumdoelen meer aan deze richting. Hieronder staat de laatst bekende koppeling
                {opgehaald ? ` (opgehaald op ${opgehaald})` : ''}.
              </p>
            </div>
          </div>
        );
      }
      return (
        <p>
          De officiële bron koppelt geen minimumdoelen aan deze richting. Kies zelf sets bij ‘<Link to={SAMENSTELLEN_ROUTE}>Zelf doelen samenstellen</Link>’.
        </p>
      );
    default:
      return <p>De doelen van deze richting zijn nog niet opgehaald.</p>;
  }
}

// ── De sectie ───────────────────────────────────────────────────────────────

export function RichtingDoelen({
  info, keuze, kader, indexSets, bk, bestaandLeerplan, onLeerplanGevonden,
}: RichtingContext & {
  /** Het leerplan van de hele richting dat al op dit toestel staat (zie `useBestaandLeerplan`). */
  bestaandLeerplan: Curriculum | undefined;
  /** Meldt het leerplan dat we net bewaarden of al vonden, zodat de andere secties het ook tonen. */
  onLeerplanGevonden: (id: string) => void;
}) {
  const toast = useToast();
  const [cursusOpen, setCursusOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const openLink = useRef<HTMLAnchorElement>(null);
  /** Na "Bewaar als leerplan" verdwijnt de knop: de focus gaat naar de nieuwe link "Open het leerplan" zodra die er staat. */
  const focusOpenLink = useRef(false);

  const verplicht = useMemo(() => kader.sets.filter((k) => k.verplicht), [kader]);
  const uitbreiding = useMemo(() => kader.sets.filter((k) => !k.verplicht), [kader]);
  const delen = useMemo(() => kader.sets.filter((k) => !k.volledig), [kader]);
  const hele = useMemo(() => kader.sets.filter((k) => k.volledig), [kader]);
  const labels = useMemo(() => setLabels([...kader.sets, ...kader.nietVoorDitJaar]), [kader]);
  const aantalVerplicht = kader.aantalVerplicht;
  const aantalUitbreiding = kader.aantalDoelen - kader.aantalVerplicht;
  /** "Bewaar als leerplan" kan alleen met verplichte doelen. Een cursus maken kan altijd: dat venster zegt zelf wat er kan. */
  const kanBewaren = verplicht.length > 0;

  useEffect(() => {
    if (!focusOpenLink.current || !openLink.current) return;
    focusOpenLink.current = false;
    // Alleen als de focus echt verloren ging (de knop is weg): iemand die intussen elders staat, blijft daar.
    const actief = document.activeElement;
    if (!actief || actief === document.body) openLink.current.focus();
  }, [bestaandLeerplan]);

  // Deelsets met een ander versiemerk: hoeveel doelen uit de koppeling staan niet meer in de huidige versie van de set?
  const teControleren = useMemo(() => kader.sets.filter((k) => !k.versieGelijk && !k.volledig).map((k) => k.set.id), [kader]);
  const { bestanden: versieBestanden } = useSetBestanden(teControleren);
  const nietMeer = useMemo(() => {
    let n = 0;
    for (const k of kader.sets) {
      const b = versieBestanden.get(k.set.id);
      if (k.versieGelijk || k.volledig || !b) continue;
      const aanwezig = new Set(b.doelen.map((d) => (typeof d.id === 'string' ? d.id.trim() : '')));
      n += k.ids.filter((id) => !aanwezig.has(id)).length;
    }
    return n;
  }, [kader, versieBestanden]);

  const bewaarAlsLeerplan = async () => {
    if (!kanBewaren || bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const r = await leerplanVanHeleRichting({ info, keuze, kader, indexSets });
      if (r.bestaand) {
        focusOpenLink.current = true;
        onLeerplanGevonden(r.leerplan.id);
        toast('Dit leerplan staat al op dit toestel.');
        return;
      }
      if (!r.bevestigd) {
        setFout(nietNagekekenTekst(r.waarschuwingen));
        return;
      }
      // Bij een volle opslag meldt de opslaglaag dat zelf: dan zeggen we hier niet dat het bewaard is.
      if (!saveCurriculum(r.leerplan)) return;
      focusOpenLink.current = true;
      onLeerplanGevonden(r.leerplan.id);
      toast('Leerplan bewaard en nagekeken.', 'ok');
    } catch {
      setFout('Het leerplan kon niet gemaakt worden. Controleer je verbinding en probeer opnieuw.');
    } finally {
      setBezig(false);
    }
  };

  const niet: string[] = [];
  if (kader.verborgenOud > 0) niet.push(`${kader.verborgenOud} ${kader.verborgenOud === 1 ? 'oudere versie' : 'oudere versies'}`);
  if (kader.verborgenAndereSoort > 0) {
    niet.push(`${aantalSets(kader.verborgenAndereSoort)} van het ${kader.keuze.soort === 'buso' ? 'gewoon' : 'buitengewoon'} secundair onderwijs`);
  }
  if (kader.onbekend.length > 0) {
    niet.push(`${aantalSets(kader.onbekend.length)} die nog niet in Boosterz ${kader.onbekend.length === 1 ? 'staat' : 'staan'}`);
  }

  const geenDeelsets = delen.length === 0;
  const toonHerkomstHint = kader.sets.length > 0 && info.graad !== undefined;

  return (
    <section className="ri-sectie" aria-labelledby="ri-doelen-kop">
      <h2 id="ri-doelen-kop">De officiële minimumdoelen</h2>

      {kader.sets.length > 0 && (
        <p>
          Voor deze richting gelden {aantalVerplicht} {aantalVerplicht === 1 ? 'minimumdoel' : 'minimumdoelen'} uit {aantalSets(verplicht.length)}.
          {uitbreiding.length > 0 && (
            <> Daarnaast zijn er {aantalUitbreiding} {aantalUitbreiding === 1 ? 'uitbreidingsdoel' : 'uitbreidingsdoelen'} in {aantalSets(uitbreiding.length)}: die mag je behandelen, maar moeten niet.</>
          )}
        </p>
      )}
      <Herkomst kader={kader} info={info} />
      {toonHerkomstHint && (
        <p className="hint">
          De minimumdoelen gelden voor de hele graad. In welk jaar je een doel behandelt, staat in het leerplan van je net, niet in de officiële bron.
        </p>
      )}
      {info.groep.finaliteit === 'A' && kader.herkomst === 'api' && kader.sets.length > 0 && geenDeelsets && (
        <p className="hint">
          Voor deze richting koppelt de officiële bron alleen hele sets.{' '}
          {bksVan(bk).length > 0 ? BK_ZIN_RICHTING : 'De beroepsgerichte doelen staan in het leerplan van je net.'}
        </p>
      )}
      {kader.teGroot && (
        <div className="callout warn ri-melding" role="note">
          <WarningIcon size={20} className="ri-melding-icoon" />
          <div className="ri-melding-tekst">
            <p>Deze richting heeft meer doelen dan één leerplan kan bevatten. Kies bij ‘Kies zelf doelen’ de sets of doelen die je nodig hebt.</p>
          </div>
        </div>
      )}

      {delen.length > 0 && (
        <div className="ri-groep">
          <h3>Een deel van een set, voor deze richting</h3>
          <p className="hint">
            Van deze sets koppelt de bron alleen de doelen die bij deze richting horen, bv. de cesuurdoelen of de specifieke eindtermen van je richting.
          </p>
          <ul className="ri-sets">
            {delen.map((k) => <SetRij key={k.set.id} k={k} naam={labels.get(k.set.id) ?? setNaam(k.set)} />)}
          </ul>
        </div>
      )}
      {hele.length > 0 && (
        <div className="ri-groep">
          <h3>Hele sets</h3>
          <p className="hint">Van deze sets horen alle doelen bij deze richting.</p>
          <ul className="ri-sets">
            {hele.map((k) => <SetRij key={k.set.id} k={k} naam={labels.get(k.set.id) ?? setNaam(k.set)} />)}
          </ul>
        </div>
      )}

      {nietMeer > 0 && (
        <p className="ri-versie" role="note">
          <InfoIcon size={16} className="icon-inline" />{' '}
          {nietMeer} {nietMeer === 1 ? 'doel' : 'doelen'} uit de koppeling {nietMeer === 1 ? 'staat' : 'staan'} niet meer in de huidige versie van de set.
          De koppeling wordt elke maand bijgewerkt.
        </p>
      )}

      {kader.nietVoorDitJaar.length > 0 && (
        <details className="ri-nietjaar">
          <summary>Niet voor dit jaar ({aantalSets(kader.nietVoorDitJaar.length)})</summary>
          <p className="hint">Deze sets van de officiële bron horen bij een ander leerjaar dan het jaar van deze richting.</p>
          <ul className="ri-sets">
            {kader.nietVoorDitJaar.map((k) => <SetRij key={k.set.id} k={k} naam={labels.get(k.set.id) ?? setNaam(k.set)} />)}
          </ul>
        </details>
      )}

      {niet.length > 0 && <p className="ri-niet-getoond">Niet getoond: {somLijst(niet)}.</p>}

      <div className="ri-acties">
        <button type="button" className="btn btn-primary ri-knop" onClick={() => setCursusOpen(true)}>
          <AddIcon size={18} /> Maak een cursus voor deze richting
        </button>
        {bestaandLeerplan ? (
          <Link ref={openLink} className="btn btn-ghost ri-knop" to={`/leerplannen?open=${encodeURIComponent(bestaandLeerplan.id)}`}>
            <GoalIcon size={18} /> Open het leerplan
          </Link>
        ) : (
          <button
            type="button" className="btn btn-ghost ri-knop" aria-disabled={kanBewaren && !bezig ? undefined : 'true'}
            aria-describedby={kanBewaren ? undefined : 'ri-bewaar-ontbreekt'} onClick={() => void bewaarAlsLeerplan()}
          >
            <GoalIcon size={18} /> Bewaar als leerplan
          </button>
        )}
        <Link className="btn btn-quiet ri-knop" to={`${SAMENSTELLEN_ROUTE}?${richtingQuery(info, keuze, kader)}`}>Kies zelf doelen</Link>
      </div>
      {!kanBewaren && !bestaandLeerplan && (
        <p id="ri-bewaar-ontbreekt" className="ri-ontbreekt">
          Bewaren als leerplan kan pas als de officiële bron minimumdoelen aan deze richting koppelt. Met ‘Kies zelf doelen’ stel je zelf een leerplan samen.
        </p>
      )}
      {bezig && <p className="ri-bezig" role="status">De sets worden geladen en nagekeken…</p>}
      {fout && (
        <div className="callout err ri-melding" role="alert">
          <WarningIcon size={20} className="ri-melding-icoon" />
          <div className="ri-melding-tekst"><p>{fout}</p></div>
        </div>
      )}

      {cursusOpen && <NieuweRichtingCursus info={info} kader={kader} keuze={keuze} {...(bk ? { bk } : {})} onClose={() => setCursusOpen(false)} />}
    </section>
  );
}
