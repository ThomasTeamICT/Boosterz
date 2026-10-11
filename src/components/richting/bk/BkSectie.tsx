// De sectie "Beroepskwalificaties" op de richtingpagina en de kopregel onder de titel (docs/STUDIERICHTINGEN.md § 23.7.1
// en § 23.7.2). Dit bestand zit in een lui chunk: het richtingenscherm laadt het pas als de richting beroepskwalificaties
// kan hebben (`kanBkHebben`).
//
// De sectie toont het BK-kader van `useRichtingBk` (laden, fout, nog niet opgehaald, geen, of een kaart per beroepskwalificatie).
// Het bestand van elke BK-versie laadt per kaart, met een eigen laad- en foutstand (`laadBk`). Bewaren doet de sectie alleen via
// `leerplanUitBk` en `saveCurriculum` (de samenstelling zit in `bkSectieHulp.ts`); elk leerplan dat niet nagekeken is of niet
// bewaard raakt, wordt gemeld en er wordt dan niets bewaard. Een nieuwe versie of een tekstcorrectie verandert een bewaard
// leerplan nooit vanzelf: de meldingen van `vergelijkMetBk` staan er met een knop, en de leerkracht beslist. "Bewaar als
// leerplan" neemt alle competenties; de knoppen bij een melding houden de keuze van het oude leerplan (zie `stelSamen`).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { InfoIcon, WarningIcon } from '../../icons';
import { FoutBericht, LaadBericht } from '../../curriculum/LaadStatus';
import { useToast } from '../../ui';
import { NieuweRichtingCursus } from '../NieuweRichtingCursus';
import type { RichtingContext } from '../RichtingDoelen';
import type { Course } from '../../../lib/courseTypes';
import type { BkBestand } from '../../../lib/beroepskwalificaties';
import { splitsBk } from '../../../lib/beroepskwalificaties';
import { FOUT_BK, FOUT_BK_BESCHADIGD, laadBk, laadBkIndex, laadBkKoppeling } from '../../../lib/beroepskwalificatiesBron';
import {
  leerplanUitBk,
  selectieVanBkLeerplan,
  vergelijkMetBk,
  vindBkLeerplan,
  type BkKeuze,
  type BkMelding,
} from '../../../lib/bkLeerplan';
import {
  BK_DEELKWALIFICATIE_HINT,
  BK_GEEN,
  BK_HINT_ANDERE_VERSIE,
  BK_INTRO_UITLEG,
  BK_KNOP_ANDERE_VERSIE,
  BK_KNOP_BIJWERKEN,
  BK_KNOP_NIEUWE_LIJST,
  BK_KOP_KNOP,
  BK_LADEN,
  BK_NIVEAU_UITLEG,
  BK_NIVEAU_VRAAG,
  BK_NOG_NIET_OPGEHAALD,
  BK_SECTIE_TITEL,
  BK_TOAST_BEWAARD,
  BK_TOAST_BIJGEWERKT,
  BK_ZONDER_BESTAND,
  bkBehaalbaarSamenvatting,
  bkBekrachtigingTekst,
  bkBronregel,
  bkIntroAantal,
  bkKopRegel,
  bkMeldingTekst,
  bkNietNagekeken,
  bkToekomstTekst,
} from '../../../lib/bkWeergave';
import { getCurricula, saveCurriculum } from '../../../lib/curriculum';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { sanitizeDoelgroep } from '../../../lib/doelgroep';
import { effectieveStatus, isBkLeerplan } from '../../../lib/leerplanStatus';
import { BK_ZONDER_TITEL, bkKader, type RichtingBk, type RichtingBkRegel } from '../../../lib/richtingBk';
import { doelgroepVan, geldigeOnderdelen } from '../../../lib/richtingKader';
import { variantLabels } from '../../../lib/richtingWeergave';
import { useLaadstand } from '../../../lib/useLaadstand';
import { BkKaart, type BestandStand } from './BkKaart';
import {
  BK_ALGEMENE_FOUT,
  BK_KOP_MIST,
  BK_OPSLAG_MISLUKT,
  BK_TOAST_BESTAAT_AL,
  beschrijfMelding,
  bouwNieuwLeerplan,
  competentieIds,
  doelgroepVoorDoel,
  redenMelding,
  selectieVan,
  stelSamen,
  versiesVoorDoel,
  type BewaarDoel,
} from './bkSectieHulp';
import '../../../styles/beroepskwalificaties.css';

export interface BkSectieProps {
  /**
   * De richting, haar keuze, het kader op minimumdoelen en de leerplannen van dit toestel. `context.bk` is altijd gezet en
   * nooit 'niet-van-toepassing': laden, fout of klaar (met het BK-kader van `useRichtingBk`).
   */
  context: RichtingContext;
  /** De cursussen van dit toestel (voor "Maak een cursus met deze competenties" en de meldingen over bestaande leerplannen). */
  courses: readonly Course[];
  /** JJJJ-MM-DD. */
  vandaag: string;
  /** Na een laadfout: het BK-kader opnieuw laden ("Opnieuw proberen"). */
  opnieuw: () => void;
}

/** De kop van de sectie: de knop in de kopregel en het herstel van de focus zoeken hem op dit id. */
const KOP_ID = 'ri-bk-kop';
const LEEG_MERKEN: ReadonlyMap<string, string> = new Map();
const LEEG_TITELS: ReadonlyMap<string, string> = new Map();

function focusKop() {
  document.getElementById(KOP_ID)?.focus();
}

// ── Kopregel onder de titel (§ 23.7.1) ──────────────────────────────────────

export interface BkKopRegelProps {
  /** Het BK-kader, alleen gemonteerd als het klaar is en minstens één BK heeft. */
  bk: RichtingBk;
}

/** "Beroepskwalificaties: Onthaalmedewerker en Recreatief medewerker." met de knop "Naar de beroepskwalificaties". */
export function BkKopRegel({ bk }: BkKopRegelProps) {
  const [mist, setMist] = useState(false);
  // De melding is alleen waar zolang de sectie er niet staat: komt ze er (de minimumdoelen laden alsnog), dan verdwijnt ze.
  useEffect(() => {
    if (!mist) return;
    const timer = window.setInterval(() => {
      if (document.getElementById(KOP_ID)) setMist(false);
    }, 400);
    return () => window.clearInterval(timer);
  }, [mist]);
  const tekst = bkKopRegel(bk.bks.map((b) => b.titel));
  if (tekst === '') return null;

  // Geen ankerlink: dat botst met de hash-router. We scrollen en zetten de focus op de kop van de sectie.
  const naarSectie = () => {
    const kop = document.getElementById(KOP_ID);
    if (!kop) {
      // De sectie staat er pas als het kader van de minimumdoelen klaar is (laadt het nog, of staat het in fout): een knop die
      // niets doet, is erger dan een zin.
      setMist(true);
      return;
    }
    setMist(false);
    const rustig = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    kop.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
    kop.focus({ preventScroll: true });
  };

  return (
    <p className="bk-kopregel">
      <span>{tekst}</span>
      <button type="button" className="btn btn-sm btn-quiet bk-naar" onClick={naarSectie}>{BK_KOP_KNOP}</button>
      <span className="bk-kop-melding" role="status">
        {mist ? BK_KOP_MIST : ''}
      </span>
    </p>
  );
}

// ── De bestanden van de kaarten ─────────────────────────────────────────────

/**
 * Het bestand van elke BK-versie, elk met een eigen laad- en foutstand: een bestand dat niet laadt, laat de andere kaarten
 * ongemoeid. `laadBk` onthoudt wat geladen is; een mislukte poging blijft daar niet staan, dus "Opnieuw proberen" vraagt
 * het echt opnieuw.
 */
function useBkBestanden(versies: readonly string[]) {
  const [stand, setStand] = useState<ReadonlyMap<string, BestandStand>>(() => new Map());
  const gestart = useRef(new Map<string, number>());
  const levend = useRef(true);
  useEffect(() => {
    levend.current = true;
    return () => { levend.current = false; };
  }, []);

  const start = useCallback((versie: string, poging: number) => {
    gestart.current.set(versie, poging);
    const zet = (s: BestandStand) => {
      if (levend.current && gestart.current.get(versie) === poging) setStand((vorige) => new Map(vorige).set(versie, s));
    };
    zet({ status: 'laden' });
    laadBk(versie).then(
      (waarde) => zet({ status: 'klaar', waarde }),
      (e: unknown) => zet({ status: 'fout', fout: e instanceof Error && e.message ? e.message : FOUT_BK }),
    );
  }, []);

  useEffect(() => {
    for (const v of versies) if (!gestart.current.has(v)) start(v, 0);
  }, [versies, start]);

  const opnieuw = useCallback((versie: string) => start(versie, (gestart.current.get(versie) ?? 0) + 1), [start]);
  return { stand, opnieuw };
}

/** Wat naast het BK-kader nodig is: de versiemerken uit de index, de titels, en het kader van de hele richting. */
interface Extra {
  /** BK-versie → de eerste 16 hex-tekens van haar sha256 in de index. */
  merken: ReadonlyMap<string, string>;
  /** BK-versie → titel, uit de index. */
  titels: ReadonlyMap<string, string>;
  /** Het BK-kader van de hele richting (zonder variant): daartegen vergelijkt `vergelijkMetBk`. */
  heel: RichtingBk | undefined;
}

// ── Meldingen over bestaande leerplannen ────────────────────────────────────

interface MeldingItem {
  sleutel: string;
  leerplan: Curriculum;
  melding: BkMelding;
}

/** De kaart (BK-versie) waar de melding bij hoort; `undefined`: onder de kaarten. */
function kaartVoor(m: BkMelding, bks: readonly RichtingBkRegel[]): string | undefined {
  switch (m.soort) {
    case 'andere-versie': return bks.find((b) => b.bk === m.nu)?.bk;
    case 'tekst-aangepast':
    case 'lijst-aangepast': return bks.find((b) => b.bk === m.bk)?.bk;
    default: return undefined;
  }
}

/**
 * Een melding over een bestaand leerplan, met haar knop. `knop.reden` is het "Nog nodig: …" van een knop die nog niet kan
 * (aria-disabled, zonder reden is de knop actief). `uitleg` zegt vooraf wat de knop met de keuze van de leerkracht doet; `hint`
 * is de vaste hint van de melding.
 */
function MeldingBlok({ soort, tekst, uitleg, hint, knop, fout }: {
  soort: 'warn' | 'note';
  tekst: string;
  uitleg?: string;
  hint?: string;
  knop?: { label: string; reden: string | undefined; onClick: () => void };
  fout?: string | null;
}) {
  const nodigId = useId();
  const uitlegId = useId();
  const kan = knop?.reden === undefined;
  const beschreven = [uitleg ? uitlegId : '', knop && !kan ? nodigId : ''].filter((id) => id !== '').join(' ');
  return (
    <>
      <div className={`callout${soort === 'warn' ? ' warn' : ''} bk-melding`} role="note">
        {soort === 'warn' ? <WarningIcon size={20} className="bk-melding-icoon" /> : <InfoIcon size={20} className="bk-melding-icoon" />}
        <div className="bk-melding-tekst">
          <p>{tekst}</p>
          {uitleg && <p id={uitlegId}>{uitleg}</p>}
          {knop && (
            <button
              type="button" className="btn btn-ghost bk-knop" aria-disabled={kan ? undefined : 'true'}
              aria-describedby={beschreven !== '' ? beschreven : undefined} onClick={kan ? knop.onClick : undefined}
            >
              {knop.label}
            </button>
          )}
          {knop && !kan && <p id={nodigId} className="bk-nodig">{knop.reden}</p>}
          {hint && <p className="bk-nodig">{hint}</p>}
        </div>
      </div>
      {fout && (
        <div className="callout err bk-melding" role="alert">
          <WarningIcon size={20} className="bk-melding-icoon" />
          <div className="bk-melding-tekst"><p>{fout}</p></div>
        </div>
      )}
    </>
  );
}

// ── De sectie ───────────────────────────────────────────────────────────────

/** De sectie "Beroepskwalificaties", na "De officiële minimumdoelen" en vóór "Leerplannen". */
export function BkSectie({ context, vandaag, opnieuw }: BkSectieProps) {
  const toast = useToast();
  const { info, keuze, curricula } = context;
  const stand = context.bk;
  const bk: RichtingBk | undefined = stand?.status === 'klaar' ? stand.waarde : undefined;
  const bks = useMemo<readonly RichtingBkRegel[]>(() => bk?.bks ?? [], [bk]);

  const [cursusBk, setCursusBk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const bezigRef = useRef(false);
  const [fouten, setFouten] = useState<ReadonlyMap<string, string>>(() => new Map());
  /** BK-versie → het leerplan dat we net bewaarden of al vonden, voor het geval de opslag nog niet doorgegeven is. */
  const [bewaard, setBewaard] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [focusOpen, setFocusOpen] = useState<string | null>(null);
  const focusKlaar = useCallback(() => setFocusOpen(null), []);

  // Het bestand per BK-versie (per kaart een eigen laad- en foutstand).
  const versies = useMemo(() => bks.filter((b) => b.zonderBestand !== true).map((b) => b.bk), [bks]);
  const { stand: bestandStanden, opnieuw: opnieuwBestand } = useBkBestanden(versies);
  const bestanden = useMemo(() => {
    const uit = new Map<string, BkBestand>();
    for (const [versie, s] of bestandStanden) if (s.status === 'klaar' && s.waarde) uit.set(versie, s.waarde);
    return uit;
  }, [bestandStanden]);

  // Versiemerken en het kader van de hele richting. Mislukt dit, dan blijft de sectie werken zonder meldingen; de koppeling
  // en de index zijn dezelfde (gedeelde) beloftes als die van het BK-kader zelf, dus dit kost geen extra verzoek.
  const extraSleutel = bk ? `bk-extra|${info.groep.nummer}|${vandaag}` : 'bk-extra|wacht';
  const { stand: extraStand } = useLaadstand<Extra | null>(extraSleutel, async () => {
    if (!bk) return null;
    const [koppeling, index] = await Promise.all([laadBkKoppeling(), laadBkIndex()]);
    const merken = new Map<string, string>();
    const titels = new Map<string, string>();
    for (const r of index?.bks ?? []) {
      if (typeof r.sha256 === 'string' && /^[0-9a-f]{16,}$/.test(r.sha256)) merken.set(r.bk, r.sha256.slice(0, 16));
      if (typeof r.titel === 'string' && r.titel.trim() !== '') titels.set(r.bk, r.titel.trim());
    }
    const zonderVariant = { groep: keuze.groep, soort: keuze.soort, ...(keuze.jaar !== undefined ? { jaar: keuze.jaar } : {}) };
    return { merken, titels, heel: bkKader(koppeling, index, info, zonderVariant, vandaag) };
  });
  const extra = extraStand.status === 'klaar' ? extraStand.waarde : null;
  const merken = extra?.merken ?? LEEG_MERKEN;
  const titels = extra?.titels ?? LEEG_TITELS;
  const heel = extra?.heel;
  /** Zonder versiemerken kan geen bestaand leerplan herkend worden: dan niets bewaren (anders komt er een dubbel leerplan). */
  const kanBewaren = extraStand.status !== 'laden';

  const doelgroep = useMemo(() => doelgroepVan(info, keuze), [info, keuze]);

  // De varianten waarin een beroepskwalificatie alleen geldt ("alleen in: duaal").
  const varianten = useMemo(() => {
    const onderdelen = geldigeOnderdelen(info, vandaag);
    return onderdelen.length > 1 ? variantLabels(onderdelen, vandaag) : [];
  }, [info, vandaag]);
  const alleenInVan = (regel: RichtingBkRegel): string[] => {
    if (regel.alleOnderdelen || varianten.length === 0) return [];
    return regel.onderdelen.map((n) => varianten.find((v) => v.nummer === n)?.label).filter((l): l is string => !!l);
  };

  // Het nagekeken leerplan op dit toestel met alle competenties (met tekst) van elke versie: daar staat "Open het leerplan".
  const bestaandPerBk = useMemo(() => {
    const uit = new Map<string, Curriculum>();
    for (const regel of bks) {
      const bestand = bestanden.get(regel.bk);
      if (!bestand) continue;
      let l = vindBkLeerplan(curricula, new Map([[regel.bk, competentieIds(regel.bk, bestand)]]), doelgroep, merken);
      if (!l) {
        const id = bewaard.get(regel.bk);
        l = id !== undefined ? curricula.find((c) => c.id === id) : undefined;
      }
      if (l) uit.set(regel.bk, l);
    }
    return uit;
  }, [bks, bestanden, curricula, doelgroep, merken, bewaard]);

  // Wat er veranderde sinds een leerplan van deze richting gemaakt werd. Alleen nagekeken BK-leerplannen van deze richting:
  // een leerplan dat de leerkracht aanpaste of dat bij een andere richting hoort, krijgt nooit een melding of een knop.
  const meldingen = useMemo<MeldingItem[]>(() => {
    if (!heel) return [];
    const uit: MeldingItem[] = [];
    for (const c of curricula) {
      if (!isBkLeerplan(c) || c.kind === 'eigen') continue;
      if (sanitizeDoelgroep(c.doelgroep)?.groep !== info.groep.nummer) continue;
      if (effectieveStatus(c) !== 'gecontroleerd') continue;
      for (const m of vergelijkMetBk(c, heel, bestanden, merken)) {
        uit.push({ sleutel: `${c.id}|${m.soort}|${m.bk}`, leerplan: c, melding: m });
      }
    }
    return uit;
  }, [heel, curricula, info.groep.nummer, bestanden, merken]);

  const zetFout = useCallback((sleutel: string, tekst: string | null) => {
    setFouten((vorige) => {
      const volgende = new Map(vorige);
      if (tekst === null) volgende.delete(sleutel);
      else volgende.set(sleutel, tekst);
      return volgende;
    });
  }, []);

  /** De titel van een beroepskwalificatie, zonder nummer: uit de index, anders van een versie van hetzelfde nummer in het kader. */
  const titelVan = (versie: string): string => {
    const uitIndex = titels.get(versie);
    if (uitIndex) return uitIndex;
    const nummer = splitsBk(versie)?.nummer;
    return bks.find((b) => splitsBk(b.bk)?.nummer === nummer)?.titel ?? BK_ZONDER_TITEL;
  };

  /**
   * Een nieuw leerplan bewaren: "Bewaar als leerplan" (alle competenties met een tekst van één versie), en de knoppen "Maak een
   * leerplan met de versie van nu" en "Maak een nieuw leerplan met de lijst van nu" (die de keuze van het oude leerplan
   * houden). De samenstelling zit in `bouwNieuwLeerplan`, en alleen `leerplanUitBk` en `saveCurriculum` bewaren iets. Staat zo'n
   * leerplan al op dit toestel, dan komt er geen tweede. Elke `false` wordt gemeld en dan is er niets bewaard. Het bestand van
   * de versies is meestal al geladen; zo niet (een melding kan naar een versie wijzen die bij een andere variant hoort),
   * dan wordt het nu geladen.
   */
  const bewaar = async (doel: BewaarDoel, foutSleutel: string) => {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    zetFout(foutSleutel, null);
    try {
      const nodig = new Map<string, BkBestand>();
      for (const versie of versiesVoorDoel(doel)) {
        const bestand = bestanden.get(versie) ?? (await laadBk(versie));
        if (bestand) nodig.set(versie, bestand);
      }
      // Vers uit de opslag: na het laden van een bestand kan er intussen een leerplan bijgekomen zijn.
      const r = bouwNieuwLeerplan({ doel, bestanden: nodig, info, doelgroep, merken, curricula: getCurricula(), vandaag });
      if (r.soort === 'fout') {
        zetFout(foutSleutel, r.tekst);
        return;
      }
      let leerplan: Curriculum;
      if (r.soort === 'bestaat') {
        toast(BK_TOAST_BESTAAT_AL);
        leerplan = r.leerplan;
      } else {
        if (!r.uitkomst.bevestigd) {
          zetFout(foutSleutel, bkNietNagekeken(r.uitkomst.waarschuwingen[0] ?? ''));
          return;
        }
        // Bij een volle opslag meldt de opslaglaag dat zelf; wij zeggen er hier bij dat er niets bewaard is.
        if (!saveCurriculum(r.uitkomst.leerplan)) {
          zetFout(foutSleutel, bkNietNagekeken(BK_OPSLAG_MISLUKT));
          return;
        }
        leerplan = r.uitkomst.leerplan;
        toast(BK_TOAST_BEWAARD, 'ok');
      }
      const id = leerplan.id;
      // De kaart onthoudt het leerplan met alle competenties onder de versie; een melding onder haar eigen sleutel.
      const bewaardSleutel = doel.soort === 'kaart' ? doel.versie : foutSleutel;
      setBewaard((vorige) => new Map(vorige).set(bewaardSleutel, id));
      // Na "Bewaar als leerplan" gaat de focus naar "Open het leerplan"; bij een melding verdwijnt de knop en gaat ze naar de kop.
      if (doel.soort === 'kaart') setFocusOpen(doel.versie);
      else focusKop();
    } catch (e) {
      zetFout(foutSleutel, e instanceof Error && e.message ? e.message : bkNietNagekeken(BK_ALGEMENE_FOUT));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  };

  /** "Werk het leerplan bij": dezelfde competenties, de teksten van nu. Het id en de doelcodes blijven. */
  const werkBij = async (leerplan: Curriculum, foutSleutel: string) => {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    zetFout(foutSleutel, null);
    try {
      const keuzes: BkKeuze[] = [];
      for (const [versie, ids] of selectieVanBkLeerplan(leerplan)) {
        const bestand = bestanden.get(versie) ?? (await laadBk(versie));
        if (!bestand) {
          zetFout(foutSleutel, BK_ZONDER_BESTAND);
          return;
        }
        keuzes.push({ bestand, competenties: ids });
      }
      const r = leerplanUitBk(keuzes, { doelgroep: leerplan.doelgroep ?? doelgroep, merken, bestaand: leerplan });
      if (!r.bevestigd) {
        zetFout(foutSleutel, bkNietNagekeken(r.waarschuwingen[0] ?? ''));
        return;
      }
      if (!saveCurriculum(r.leerplan)) {
        zetFout(foutSleutel, bkNietNagekeken(BK_OPSLAG_MISLUKT));
        return;
      }
      toast(BK_TOAST_BIJGEWERKT, 'ok');
      focusKop();
    } catch (e) {
      zetFout(foutSleutel, e instanceof Error && e.message ? e.message : bkNietNagekeken(BK_ALGEMENE_FOUT));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  };

  /** Staat het leerplan dat de knop zou maken al op dit toestel? Dan is de knop weg (zoals bij "alle competenties"). */
  const bestaatAl = (item: MeldingItem, doel: BewaarDoel): boolean => {
    const onthouden = bewaard.get(item.sleutel);
    if (onthouden !== undefined && curricula.some((c) => c.id === onthouden)) return true;
    const sam = stelSamen(doel, bestanden);
    if (!sam.ok || sam.leeg) return false;
    return vindBkLeerplan(curricula, selectieVan(sam.keuzes), doelgroepVoorDoel(doel, doelgroep), merken) !== undefined;
  };

  /** De melding van een bestaand leerplan, met haar knop. */
  const meldingBlok = (item: MeldingItem) => {
    const m = item.melding;
    const tekst = bkMeldingTekst(m, { bkTitel: titelVan(m.bk), leerplanTitel: item.leerplan.title });
    const fout = fouten.get(item.sleutel) ?? null;
    // De knoppen die een nieuw leerplan maken houden de keuze van het oude leerplan, en zeggen vooraf wat dat betekent.
    const nieuwLeerplan = (doel: Exclude<BewaarDoel, { soort: 'kaart' }>, label: string, hint?: string) => {
      const uitleg = beschrijfMelding(doel, bestanden, titelVan(m.bk));
      return (
        <MeldingBlok
          key={item.sleutel} soort="warn" tekst={tekst} uitleg={uitleg.hint} hint={hint} fout={fout}
          knop={bestaatAl(item, doel) ? undefined : {
            label,
            reden: redenMelding({ kanBewaren, bezig, zonderKeuze: uitleg.zonderKeuze }),
            onClick: () => void bewaar(doel, item.sleutel),
          }}
        />
      );
    };
    switch (m.soort) {
      case 'andere-versie':
        return nieuwLeerplan({ soort: 'andere-versie', leerplan: item.leerplan, oud: m.bk, nu: m.nu }, BK_KNOP_ANDERE_VERSIE, BK_HINT_ANDERE_VERSIE);
      case 'tekst-aangepast':
        return (
          <MeldingBlok
            key={item.sleutel} soort="warn" tekst={tekst} fout={fout}
            knop={{ label: BK_KNOP_BIJWERKEN, reden: redenMelding({ kanBewaren, bezig }), onClick: () => void werkBij(item.leerplan, item.sleutel) }}
          />
        );
      case 'lijst-aangepast':
        return nieuwLeerplan({ soort: 'lijst-aangepast', leerplan: item.leerplan, bk: m.bk }, BK_KNOP_NIEUWE_LIJST);
      default:
        return <MeldingBlok key={item.sleutel} soort="note" tekst={tekst} fout={fout} />;
    }
  };

  // ── Wat er getoond wordt ──────────────────────────────────────────────────
  if (stand === undefined || stand.status === 'niet-van-toepassing') return null;
  const finaliteitAofDU = info.groep.finaliteit === 'A' || info.groep.finaliteit === 'DU';
  // Bij een 7de jaar of buitengewoon onderwijs zonder beroepskwalificatie staat de sectie er niet.
  if (stand.status === 'klaar' && bks.length === 0 && !finaliteitAofDU) return null;

  const onderKaarten = meldingen.filter((i) => kaartVoor(i.melding, bks) === undefined);
  const metNiveau = bks.some((b) => b.vks !== undefined);
  const toekomst = bk?.toekomst ? bkToekomstTekst(bk.toekomst.vanaf, bk.toekomst.titels) : '';
  const bekrachtigingen = bk?.bekrachtigingen ?? [];

  let inhoud: JSX.Element;
  if (stand.status === 'laden') {
    inhoud = <LaadBericht tekst={BK_LADEN} />;
  } else if (stand.status === 'fout') {
    // `FOUT_BK` zegt "controleer je verbinding"; zijn de bestanden beschadigd, dan helpt opnieuw proberen niet en zegt de lader dat.
    inhoud = (
      <FoutBericht
        fout={stand.fout === FOUT_BK_BESCHADIGD ? FOUT_BK_BESCHADIGD : FOUT_BK}
        onOpnieuw={() => {
          opnieuw();
          focusKop();
        }}
      />
    );
  } else if (bks.length === 0) {
    inhoud = <p>{bk?.herkomst === 'geen' ? BK_GEEN : BK_NOG_NIET_OPGEHAALD}</p>;
  } else {
    inhoud = (
      <>
        <p>{bkIntroAantal(bks.length)}</p>
        <p className="bk-uitleg">{BK_INTRO_UITLEG}</p>
        {metNiveau && (
          <details className="bk-details">
            <summary>{BK_NIVEAU_VRAAG}</summary>
            <div className="bk-details-body"><p>{BK_NIVEAU_UITLEG}</p></div>
          </details>
        )}
        <ul className="bk-kaarten">
          {bks.map((regel) => (
            <li key={regel.bk}>
              <BkKaart
                regel={regel}
                stand={bestandStanden.get(regel.bk)}
                alleenIn={alleenInVan(regel)}
                bestaand={bestaandPerBk.get(regel.bk)}
                kanBewaren={kanBewaren}
                bezig={bezig}
                fout={fouten.get(`kaart|${regel.bk}`) ?? null}
                focusOpen={focusOpen === regel.bk}
                onFocusKlaar={focusKlaar}
                onCursus={() => setCursusBk(regel.bk)}
                onBewaar={() => void bewaar({ soort: 'kaart', versie: regel.bk }, `kaart|${regel.bk}`)}
                onOpnieuw={() => opnieuwBestand(regel.bk)}
              >
                {meldingen.some((i) => kaartVoor(i.melding, bks) === regel.bk) && (
                  <div className="bk-meldingen">
                    {meldingen.filter((i) => kaartVoor(i.melding, bks) === regel.bk).map(meldingBlok)}
                  </div>
                )}
              </BkKaart>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className="ri-sectie bk-sectie" aria-labelledby={KOP_ID}>
      <h2 id={KOP_ID} tabIndex={-1}>{BK_SECTIE_TITEL}</h2>
      {inhoud}
      {stand.status === 'klaar' && (
        <>
          {onderKaarten.length > 0 && <div className="bk-meldingen bk-onder">{onderKaarten.map(meldingBlok)}</div>}
          {toekomst !== '' && <p className="bk-toekomst">{toekomst}</p>}
          {bekrachtigingen.length > 0 && (
            <details className="bk-details">
              <summary>{bkBehaalbaarSamenvatting(bekrachtigingen.length)}</summary>
              <div className="bk-details-body">
                <ul className="bk-behaalbaar">
                  {bekrachtigingen.map((b) => <li key={`${b.soort}|${b.naam}`}>{bkBekrachtigingTekst(b.naam, b.soort)}</li>)}
                </ul>
                {bekrachtigingen.some((b) => b.soort === 'deelkwalificatie') && <p className="bk-leeg">{BK_DEELKWALIFICATIE_HINT}</p>}
              </div>
            </details>
          )}
          {bk && bk.herkomst !== 'nog-niet-opgehaald' && <p className="bk-bron">{bkBronregel(bk.opgehaald)}</p>}
        </>
      )}
      {cursusBk !== null && (
        <NieuweRichtingCursus info={info} kader={context.kader} keuze={keuze} bk={stand} startBk={cursusBk} onClose={() => setCursusBk(null)} />
      )}
    </section>
  );
}
