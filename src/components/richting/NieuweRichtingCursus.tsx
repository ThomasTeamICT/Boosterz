// Venster "Nieuwe cursus voor deze richting" (docs/STUDIERICHTINGEN.md § 12.3 en § 14.4).
//
// De leerkracht kiest welke minimumdoelen de cursus behandelt (sets van het kader van de richting, alle doelen, of een
// leerplan dat al op dit toestel staat) en hoe ze begint (geraamte, lege cursus of met AI). Het venster maakt een
// nagekeken leerplan met precies die doelen en een cursus die eraan hangt, zonder AI en zonder sleutel. Alle rekenwerk
// zit in src/lib (richtingKader.ts, richtingCursus.ts); hier staan alleen de keuzes, het bewaren en de meldingen.
//
// Bewaren gaat in deze volgorde, en zegt nooit "bewaard" bij een volle opslag:
// 1. een leerplan dat al op dit toestel staat met precies deze selectie wordt hergebruikt;
// 2. anders een nieuw leerplan, alleen als het nagekeken is (`bevestigd`); anders niets bewaren en de eerste waarschuwing tonen;
// 3. de cursus erbij; lukt dat niet, dan wordt een leerplan dat net nieuw gemaakt werd weer gewist.
//
// Staan er doelen uit de koppeling die niet meer in de huidige set staan, dan opent het scherm niet meteen de cursus:
// het venster toont eerst die melding, tot de leerkracht zelf verdergaat. Een toast blijft maar enkele seconden staan.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { hasAIKey } from '../../lib/ai';
import { saveCourse } from '../../lib/courses';
import { deleteCurriculum, getCurricula, saveCurriculum } from '../../lib/curriculum';
import { MAX_DOELGROEP_VAK, graadTekst, jaarTekst } from '../../lib/doelgroep';
import { setHandoff } from '../../lib/handoff';
import {
  doelgroepVan,
  naarSetKeuzes,
  selectieVanKader,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from '../../lib/richtingKader';
import {
  cursusVoorRichting,
  leerplanVoorRichting,
  leerplannenBijRichting,
  selectieVanKeuzes,
  titelVoorRichtingLeerplan,
  vakVoorstel,
  vindLeerplanMetSelectie,
  voorstelCursusTitel,
  type Startvorm,
} from '../../lib/richtingCursus';
import {
  aantalOntbrekend,
  inlezenLink,
  kaderLeegTekst,
  ontbrekendeDoelenZin,
  setFoutTekst,
  setLabels,
  vakHint,
  voetTekst,
  voorstelZin,
  zonderSetId,
} from '../../lib/richtingVenster';
import type { Ontbreekt } from '../../lib/samenstelKeuze';
import { getPrefs } from '../../lib/storage';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import { InfoIcon, WarningIcon } from '../icons';
import { Field, Modal, useToast } from '../ui';
import '../../styles/richtingcursus.css';

/**
 * Props vast (§ 12.3), zodat het richtingenscherm (P8) en de cursushulp (P9) los van elkaar gebouwd konden worden.
 */
export interface NieuweRichtingCursusProps {
  info: RichtingInfo;
  kader: RichtingKader;
  keuze: RichtingKeuze;
  onClose: () => void;
}

type Doelen = 'sets' | 'alle' | 'bestaand';
type Begin = Startvorm | 'ai';

/** Wat er misliep bij het maken. `nagekeken`: het leerplan kon niet als nagekeken bewaard worden (§ 14.3). */
interface Probleem {
  tekst: string;
  nagekeken?: boolean;
}

/** Wat de leerkracht na het bewaren leest, en wat de knop daarna doet. */
interface Uitslag {
  /** Wat er bewaard is. */
  bewaard: string;
  /** Waarom er iets niet klopt (de doelen die niet meer in de set staan). */
  waarschuwing: string;
  /** De tekst van de knop die verdergaat. */
  knop: string;
  verder: () => void;
}

const ID_TITEL = 'rc-titel';
const ID_VAK = 'rc-vak';
const ID_EERSTE_SET = 'rc-set-eerste';
const ID_LEERPLAN = 'rc-leerplan';

function enkelOfMeer(n: number, een: string, meer: string): string {
  return `${n} ${n === 1 ? een : meer}`;
}

/** De waarde pas doorgeven nadat ze even stil bleef: zo leest een schermlezer het voorstel niet bij elke toets voor. */
function useVertraagd<T>(waarde: T, ms: number): T {
  const [vertraagd, setVertraagd] = useState(waarde);
  useEffect(() => {
    const t = setTimeout(() => setVertraagd(waarde), ms);
    return () => clearTimeout(t);
  }, [waarde, ms]);
  return vertraagd;
}

/**
 * De link naar de samenstelwizard met de richting, het jaar en wat al gekozen is (§ 12.3). `sets` is null voor "alle
 * minimumdoelen van de richting"; een lijst (ook een lege) staat altijd in de link, want zonder `sets` vinkt de wizard alle
 * verplichte sets aan, en dat is niet de standaard (B10).
 */
function samenstellenLink(
  info: RichtingInfo,
  kader: RichtingKader,
  keuze: RichtingKeuze,
  sets: readonly string[] | null,
  zelf: readonly string[],
): string {
  const p = new URLSearchParams();
  p.set('richting', info.groep.nummer);
  if (keuze.jaar !== undefined) p.set('jaar', String(keuze.jaar));
  p.set('soort', kader.keuze.soort);
  if (sets !== null) p.set('sets', sets.join(','));
  if (zelf.length > 0) p.set('zelf', zelf.join(','));
  return `/leerplannen/samenstellen?${p.toString().replace(/%2C/g, ',')}`;
}

/** Het aantal verschillende doelcodes dat op de secties van de cursus staat. */
function aantalCodes(cursus: Course): number {
  const codes = new Set<string>();
  for (const h of cursus.chapters) for (const s of h.sections) for (const c of s.goalCodes ?? []) codes.add(c);
  return codes.size;
}

export function NieuweRichtingCursus({ info, kader, keuze, onClose }: NieuweRichtingCursusProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [vak, setVak] = useState('');
  /** `null`: de titel volgt het voorstel, tot de leerkracht ze zelf aanpast. */
  const [titelEigen, setTitelEigen] = useState<string | null>(null);
  const [doelenKeuze, setDoelen] = useState<Doelen>('sets');
  /** Wat de leerkracht zelf aan- of uitvinkte: dat wint van het voorstel bij het vak. */
  const [handmatig, setHandmatig] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [bestaandId, setBestaandId] = useState('');
  const [begin, setBegin] = useState<Begin>('geraamte');
  const [probleem, setProbleem] = useState<Probleem | null>(null);
  const [klaar, setKlaar] = useState(false);
  /** Het leerplan (en de cursus) zijn bewaard, maar er is nog iets te lezen vóór het scherm verdergaat. */
  const [uitslag, setUitslag] = useState<Uitslag | null>(null);
  const gemaakt = useRef(false);
  const probleemRef = useRef<HTMLDivElement>(null);
  const uitslagRef = useRef<HTMLDivElement>(null);

  const vakNu = vak.trim();
  const metSleutel = hasAIKey();

  // ── Titel en vak ──
  const dgZonderVak = useMemo(() => doelgroepVan(info, keuze), [info, keuze]);
  const voorstelTitel = useMemo(
    () => voorstelCursusTitel(doelgroepVan(info, keuze, vakNu ? { vak: vakNu } : undefined)),
    [info, keuze, vakNu],
  );
  const titel = titelEigen ?? voorstelTitel;
  const wanneer = keuze.jaar !== undefined ? jaarTekst(keuze.jaar) : info.graad !== undefined ? graadTekst(info.graad) : '';

  const voorstel = useMemo(() => vakVoorstel(kader, vakNu), [kader, vakNu]);
  const vakVoorLezer = useVertraagd(vakNu, 500);
  const voorstelVoorLezer = useMemo(() => vakVoorstel(kader, vakVoorLezer), [kader, vakVoorLezer]);

  // ── De sets ──
  const perSet = useMemo(() => new Map(kader.sets.map((k) => [k.set.id, k] as const)), [kader]);
  const verplichtIds = useMemo(() => kader.sets.filter((k) => k.verplicht).map((k) => k.set.id), [kader]);
  const staatAan = (id: string): boolean => (handmatig.has(id) ? handmatig.get(id) === true : voorstel.sets.includes(id));
  const gekozen = kader.sets.filter((k) => staatAan(k.set.id)).map((k) => k.set.id);
  const deelSets = kader.sets.filter((k) => !k.volledig);
  const heleSets = kader.sets.filter((k) => k.volledig);

  const zetSet = (id: string, aan: boolean) => setHandmatig((m) => new Map(m).set(id, aan));
  // Twee sets met dezelfde naam krijgen voor een schermlezer een achtervoegsel dat ze uit elkaar houdt (ook in de zin
  // met het voorstel en in een foutmelding).
  const labelPerSet = useMemo(() => {
    const labels = setLabels(kader.sets);
    return new Map(kader.sets.map((k, i) => [k.set.id, labels[i]] as const));
  }, [kader]);
  const volleNaam = (id: string): string => {
    const l = labelPerSet.get(id);
    return l ? `${l.naam}${l.achtervoegsel}` : '';
  };

  // ── Leerplannen die al op dit toestel staan ──
  const [leerplannen] = useState<Curriculum[]>(() => getCurricula());
  const bestaandeLijst = useMemo(() => {
    const sleutels = new Set<string>();
    for (const k of kader.sets) for (const id of k.ids) sleutels.add(`${k.set.id}|${id}`);
    return leerplannenBijRichting(leerplannen, sleutels, info.groep.nummer);
  }, [kader, leerplannen, info.groep.nummer]);
  const bestaandGekozen = bestaandeLijst.find((b) => b.curriculum.id === (bestaandId || bestaandeLijst[0]?.curriculum.id));
  const heeftLeerplan = bestaandeLijst.length > 0;

  // Een richting zonder sets (geen koppeling, nog niet opgehaald) heeft alleen een leerplan dat al op dit toestel staat
  // als keuze. "Alle minimumdoelen" kan pas als er verplichte sets zijn.
  const kaderLeeg = kader.sets.length === 0;
  const alleKan = verplichtIds.length > 0;
  const doelen: Doelen = kaderLeeg ? 'bestaand' : doelenKeuze;

  // ── De setbestanden laden (alleen wat voor de gekozen manier nodig is) ──
  const teLaden = doelen === 'sets' ? gekozen : doelen === 'alle' ? verplichtIds : [];
  const { stand, bestanden, opnieuw } = useSetBestanden(teLaden);
  const laden = teLaden.filter((id) => stand(id).status === 'laden').length;
  const mislukt = teLaden.filter((id) => stand(id).status === 'fout');

  // ── Wat er nog ontbreekt ──
  // "Nog nodig:" noemt alleen zaken. Dat de sets nog laden of niet laadden, is een eigen status in de voet.
  const ontbreekt: Ontbreekt[] = [];
  if (titel.trim() === '') ontbreekt.push({ veld: ID_TITEL, tekst: 'een titel' });
  if (doelen === 'sets' && gekozen.length === 0) ontbreekt.push({ veld: ID_EERSTE_SET, tekst: 'minstens één set' });
  if (doelen === 'alle' && verplichtIds.length === 0) ontbreekt.push({ tekst: 'minstens één set' });
  if (doelen === 'bestaand' && !bestaandGekozen) ontbreekt.push({ tekst: 'een leerplan' });
  const voet = voetTekst(ontbreekt, laden, mislukt.length);
  const geblokkeerd = ontbreekt.length > 0 || laden > 0 || mislukt.length > 0;

  // ── Teller ──
  const aantalGekozenDoelen = gekozen.reduce((som, id) => som + (perSet.get(id)?.ids.length ?? 0), 0);
  const teller = doelen === 'sets'
    ? gekozen.length === 0
      ? 'Je koos nog geen sets.'
      : gekozen.length === 1
        ? `Je koos 1 set met ${enkelOfMeer(aantalGekozenDoelen, 'doel', 'doelen')}.`
        : `Je koos ${gekozen.length} sets met samen ${enkelOfMeer(aantalGekozenDoelen, 'doel', 'doelen')}.`
    : doelen === 'alle'
      ? `Je koos alle minimumdoelen van de richting: ${enkelOfMeer(verplichtIds.length, 'set', 'sets')} met samen ${enkelOfMeer(kader.aantalVerplicht, 'doel', 'doelen')}.`
      : bestaandGekozen
        ? `Je koos het leerplan ‘${bestaandGekozen.curriculum.title}’ met ${enkelOfMeer(bestaandGekozen.curriculum.goals.length, 'doel', 'doelen')}.`
        : 'Je koos nog geen leerplan.';

  // ── Het voorstel bij het vak (voor een schermlezer) ──
  // Een richting zonder sets heeft niets om voor te stellen: dan blijft de zin leeg.
  const voorstelTekst = kaderLeeg
    ? ''
    : voorstelZin(
      vakVoorLezer,
      voorstelVoorLezer.sets.map((id) => volleNaam(id)).filter((naam) => naam !== ''),
      voorstelVoorLezer.stemSets.length > 0,
    );

  // ── Links naar de samenstelwizard ──
  const zelfSets = voorstel.stemSets.filter((id) => !gekozen.includes(id));
  // Wat de link als gekozen meegeeft: de sets van het venster, alles bij "alle minimumdoelen", niets bij een leerplan.
  const setsVoorLink = doelen === 'sets' ? gekozen : doelen === 'alle' ? null : [];
  const linkPerDoel = samenstellenLink(info, kader, keuze, setsVoorLink, doelen === 'sets' ? zelfSets : []);
  const linkStemZelf = (stemId: string) => samenstellenLink(info, kader, keuze, gekozen.filter((id) => id !== stemId), [stemId]);

  // ── Maken ──
  useEffect(() => {
    if (!probleem) return;
    probleemRef.current?.scrollIntoView?.({ block: 'nearest' });
    probleemRef.current?.focus();
  }, [probleem]);
  // De melding na het bewaren krijgt de focus, zodat een schermlezer ze voorleest en een toetsenbordgebruiker er niet
  // naast belandt: de knop waarmee ze net maakte, is verdwenen.
  useEffect(() => {
    if (!uitslag) return;
    uitslagRef.current?.scrollIntoView?.({ block: 'nearest' });
    uitslagRef.current?.focus();
  }, [uitslag]);
  // Een melding hoort bij de keuze waarmee het misliep: kiest de leerkracht iets anders, dan verdwijnt ze.
  const keuzeSleutel = `${doelen}|${begin}|${gekozen.join(',')}|${bestaandGekozen?.curriculum.id ?? ''}`;
  useEffect(() => { setProbleem(null); }, [keuzeSleutel]);

  const maak = () => {
    if (gemaakt.current) return;
    if (geblokkeerd) {
      const veld = ontbreekt.find((o) => o.veld)?.veld;
      if (veld) document.getElementById(veld)?.focus();
      return;
    }
    setProbleem(null);
    const dg = doelgroepVan(info, keuze, vakNu ? { vak: vakNu } : undefined);

    // 1. Het leerplan: een bestaand, een hergebruikt of een nieuw nagekeken leerplan.
    let leerplan: Curriculum;
    let nieuw = false;
    /** Een bevestigd leerplan waarvan een deel van de gekoppelde doelen niet meer in de set staat: de leerkracht hoort het. */
    let ontbrekendZin = '';
    if (doelen === 'bestaand') {
      if (!bestaandGekozen) return;
      leerplan = bestaandGekozen.curriculum;
      if (!Array.isArray(leerplan.goals) || leerplan.goals.length === 0) {
        setProbleem({ tekst: 'Dit leerplan heeft nog geen doelen. Kies een ander leerplan.' });
        return;
      }
    } else {
      const sets = doelen === 'sets' ? gekozen : undefined;
      const selectie = selectieVanKader(kader, { sets, ookUitbreiding: sets !== undefined });
      const { keuzes } = naarSetKeuzes(selectie, bestanden);
      const hergebruik = vindLeerplanMetSelectie(getCurricula(), selectieVanKeuzes(keuzes), dg);
      if (hergebruik) {
        leerplan = hergebruik;
      } else {
        const r = leerplanVoorRichting(kader, bestanden, dg, {
          sets,
          vak: vakNu || undefined,
          titel: titelVoorRichtingLeerplan(info, kader, sets, vakNu || undefined),
        });
        if (!r.bevestigd) {
          // Niet nagekeken: niets bewaren, en zeggen waarom.
          setProbleem({
            tekst: zonderSetId(r.waarschuwingen[0] ?? 'Het leerplan klopt niet met de officiële bron.').replace(/[.\s]+$/, ''),
            nagekeken: true,
          });
          return;
        }
        // Lukt het bewaren niet (opslag vol), dan meldt de opslaglaag dat zelf en blijft dit venster open.
        if (!saveCurriculum(r.leerplan)) {
          setProbleem({ tekst: 'Het leerplan kon niet bewaard worden: de opslag van dit toestel is vol.' });
          return;
        }
        leerplan = r.leerplan;
        nieuw = true;
        ontbrekendZin = ontbrekendeDoelenZin(aantalOntbrekend(r.ontbrekend));
      }
    }
    const draaiTerug = () => { if (nieuw) deleteCurriculum(leerplan.id); };

    // 2. Met AI: de cursusbouwer krijgt het leerplan, de doelcodes en de doelgroep mee. De overdracht gebeurt pas als het
    // scherm echt verdergaat, zodat er geen overdracht blijft liggen als de leerkracht eerst de melding leest en sluit.
    if (begin === 'ai') {
      const naarDeAI = () => {
        const overgedragen = setHandoff({
          source: '',
          title: titel.trim(),
          curriculumId: leerplan.id,
          goalCodes: leerplan.goals.map((g) => g.code),
          doelgroep: dg,
        });
        if (!overgedragen) {
          draaiTerug();
          gemaakt.current = false;
          setUitslag(null);
          setProbleem({ tekst: 'De overdracht naar de AI is niet gelukt. Kies een andere manier om te beginnen.' });
          return;
        }
        gemaakt.current = true;
        setKlaar(true);
        navigate('/cursussen?ai=nieuw');
      };
      if (ontbrekendZin) {
        gemaakt.current = true;
        setUitslag({
          bewaard: `Het leerplan is bewaard met ${enkelOfMeer(leerplan.goals.length, 'doel', 'doelen')}.`,
          waarschuwing: ontbrekendZin,
          knop: 'Ga verder met de AI',
          verder: naarDeAI,
        });
        return;
      }
      naarDeAI();
      return;
    }

    // 3. Zonder AI: de cursus zelf, met een geraamte of leeg.
    const cursus = cursusVoorRichting({
      titel: titel.trim(),
      auteur: getPrefs().teacherName,
      doelgroep: dg,
      leerplan,
      start: begin,
    });
    if (!saveCourse(cursus)) {
      draaiTerug();
      setProbleem({ tekst: 'De cursus kon niet gemaakt worden: de opslag van dit toestel is vol.' });
      return;
    }
    gemaakt.current = true;
    const codes = aantalCodes(cursus);
    const gemaaktTekst = begin === 'geraamte' && codes > 0
      ? `Cursus gemaakt: ${enkelOfMeer(cursus.chapters.length, 'hoofdstuk', 'hoofdstukken')}, ${enkelOfMeer(codes, 'doelcode', 'doelcodes')} klaar op de secties.`
      : `Cursus gemaakt met ${enkelOfMeer(leerplan.goals.length, 'doel', 'doelen')} van ${dg.titel}.`;
    const openCursus = () => {
      setKlaar(true);
      toast(gemaaktTekst, 'ok');
      navigate(`/cursus/bewerk/${cursus.id}`);
    };
    if (ontbrekendZin) {
      setUitslag({ bewaard: gemaaktTekst, waarschuwing: ontbrekendZin, knop: 'Open de cursus', verder: openCursus });
      return;
    }
    openCursus();
  };

  // ── Hulpen voor de weergave ──
  const graadUitleg = kaderLeeg
    ? ''
    : info.graad === 1
      ? 'In de 1ste graad koppelt de officiële bron de doelen niet per richting of basisoptie, maar per stroom.'
      : info.graad !== undefined
        ? 'De minimumdoelen gelden voor de hele graad. In welk jaar je een doel behandelt, staat in het leerplan van je net, niet in de officiële bron.'
        : '';
  const alleenHeleSets = info.groep.finaliteit === 'A' && deelSets.length === 0 && heleSets.length > 0;

  const setRij = (k: RichtingKader['sets'][number], eerste: boolean) => {
    const id = k.set.id;
    const aan = staatAan(id);
    const stem = voorstel.stemSets.includes(id);
    const stemUitlegId = `rc-stem-${id}`;
    const n = k.ids.length;
    const label = labelPerSet.get(id);
    const naam = label?.naam ?? '';
    const naamVolledig = volleNaam(id);
    return (
      <li key={id}>
        <label className="rc-set">
          <input
            type="checkbox" id={eerste ? ID_EERSTE_SET : undefined} checked={aan} onChange={() => zetSet(id, !aan)}
            aria-describedby={stem ? stemUitlegId : undefined}
          />
          <span className="rc-set-tekst">
            <span className="rc-set-naam">
              {naam}
              {label?.achtervoegsel && <span className="rc-set-context">{label.achtervoegsel}</span>}
            </span>
            <span className="rc-set-meta"> · {enkelOfMeer(n, 'doel', 'doelen')}{k.verplicht ? '' : ' (uitbreidingsdoelen: mag, moet niet)'}</span>
          </span>
        </label>
        {stem && (
          <div id={stemUitlegId} className="callout rc-stem" role="note">
            <InfoIcon size={18} />
            <div>
              <p>
                De set ‘{naam}’ bundelt wiskunde, natuurwetenschappen en techniek. De overheid zegt niet welke van die doelen bij {vakNu} horen.
                Neem de hele set, of kies de doelen zelf.
              </p>
              <p>
                <Link to={linkStemZelf(id)}>
                  Kies de doelen zelf<span className="sr-only">{` van ‘${naamVolledig}’`}</span>
                </Link>
              </p>
            </div>
          </div>
        )}
      </li>
    );
  };

  const nodigId = 'rc-nodig';
  return (
    <Modal
      title={`Nieuwe cursus voor ${dgZonderVak.titel}${wanneer ? ` · ${wanneer}` : ''}`}
      onClose={onClose}
      wide
      footer={(
        <div className="rc-voet">
          {klaar
            ? <p className="rc-nodig" role="status">De cursus wordt geopend…</p>
            : !uitslag && voet && <p id={nodigId} className="rc-nodig">{voet}</p>}
          <div className="rc-voet-knoppen">
            {uitslag
              ? (
                <>
                  <button type="button" className="btn btn-ghost rc-knop" onClick={onClose}>Nu niet</button>
                  <button
                    type="button" className="btn btn-primary rc-knop" aria-disabled={klaar ? 'true' : undefined}
                    onClick={() => { if (!klaar) uitslag.verder(); }}
                  >
                    {uitslag.knop}
                  </button>
                </>
              )
              : (
                <>
                  <button type="button" className="btn btn-ghost rc-knop" onClick={onClose}>Annuleren</button>
                  <button
                    type="button" className="btn btn-primary rc-knop"
                    aria-disabled={geblokkeerd || klaar ? 'true' : undefined}
                    aria-describedby={voet && !klaar ? nodigId : undefined}
                    onClick={maak}
                  >
                    Maak de cursus
                  </button>
                </>
              )}
          </div>
        </div>
      )}
    >
      <div className="rc">
        {uitslag && (
          <div className="callout warn rc-melding" role="status" tabIndex={-1} ref={uitslagRef}>
            <WarningIcon size={18} />
            <div>
              <p>{uitslag.bewaard}</p>
              <p>{uitslag.waarschuwing}</p>
            </div>
          </div>
        )}
        <div hidden={uitslag !== null}>
          <p className="rc-intro">
            Kies welke doelen deze cursus behandelt. Boosterz maakt een nagekeken leerplan met precies die doelen en een cursus die eraan hangt.
            Een AI-sleutel heb je niet nodig.
          </p>

          <Field label="Titel van de cursus">
            <input
              id={ID_TITEL} className="input" value={titel} maxLength={120} autoComplete="off"
              onChange={(e) => setTitelEigen(e.target.value)}
            />
          </Field>

          <Field
            label="Je vak (mag leeg blijven)"
            hint={vakHint(kaderLeeg)}
          >
            <input
              id={ID_VAK} className="input" value={vak} maxLength={MAX_DOELGROEP_VAK} placeholder="bv. Biologie" autoComplete="off"
              onChange={(e) => setVak(e.target.value)}
            />
          </Field>
          <p className="rc-voorstel" aria-live="polite" aria-atomic="true">{voorstelTekst}</p>

          {kaderLeeg && (
            <div className="callout warn rc-melding" role="note">
              <WarningIcon size={18} />
              <div>
                <p>{kaderLeegTekst(kader.herkomst, heeftLeerplan)}</p>
                {!heeftLeerplan && (
                  <p className="rc-melding-links">
                    <Link to={inlezenLink(info.groep.nummer, kader.keuze.soort, keuze.jaar)}>Lees het leerplan van je net in</Link>
                    <Link to="/leerplannen/samenstellen">Stel zelf een doelenlijst samen</Link>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Een richting zonder sets en zonder leerplan op dit toestel heeft hier niets te kiezen: de melding hierboven zegt wat je kan doen. */}
          {(!kaderLeeg || heeftLeerplan) && (
            <fieldset className="rc-groep">
              <legend>Welke doelen behandelt deze cursus?</legend>
              {graadUitleg && <p className="rc-uitleg">{graadUitleg}</p>}

              {!kaderLeeg && (
                <div className="rc-keuze">
                  <label className="rc-keuze-rij">
                    <input type="radio" name="rc-doelen" checked={doelen === 'sets'} onChange={() => setDoelen('sets')} />
                    <span className="rc-keuze-titel">Kies de sets voor deze cursus</span>
                  </label>
                  {doelen === 'sets' && (
                    <div className="rc-sets">
                      {deelSets.length > 0 && (
                        <section aria-labelledby="rc-kop-deel">
                          <h3 id="rc-kop-deel" className="rc-kop">Een deel van een set, voor deze richting</h3>
                          <p className="rc-uitleg">
                            Van deze sets koppelt de bron alleen de doelen die bij deze richting horen, bv. de cesuurdoelen of de specifieke eindtermen van je richting.
                          </p>
                          <ul className="rc-setlijst">{deelSets.map((k, i) => setRij(k, i === 0))}</ul>
                        </section>
                      )}
                      {heleSets.length > 0 && (
                        <section aria-labelledby="rc-kop-hele">
                          <h3 id="rc-kop-hele" className="rc-kop">Hele sets</h3>
                          <p className="rc-uitleg">
                            Van deze sets horen alle doelen bij deze richting.
                            {alleenHeleSets ? ' Voor deze richting koppelt de officiële bron alleen hele sets. De beroepsgerichte doelen staan in het leerplan van je net.' : ''}
                          </p>
                          <ul className="rc-setlijst">{heleSets.map((k, i) => setRij(k, deelSets.length === 0 && i === 0))}</ul>
                        </section>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!kaderLeeg && (
                <div className="rc-keuze">
                  <label className="rc-keuze-rij">
                    <input
                      type="radio" name="rc-doelen" checked={doelen === 'alle'}
                      aria-disabled={alleKan ? undefined : 'true'}
                      aria-describedby={alleKan ? undefined : 'rc-geen-alle'}
                      onChange={() => { if (alleKan) setDoelen('alle'); }}
                    />
                    <span className="rc-keuze-titel">Alle minimumdoelen van de richting ({kader.aantalVerplicht})</span>
                  </label>
                  {!alleKan && (
                    <p id="rc-geen-alle" className="rc-keuze-zin">Voor deze richting zijn er geen verplichte minimumdoelen om te kiezen. Kies de sets zelf.</p>
                  )}
                </div>
              )}

              <div className="rc-keuze">
                <label className="rc-keuze-rij">
                  <input
                    type="radio" name="rc-doelen" checked={doelen === 'bestaand'}
                    aria-disabled={heeftLeerplan ? undefined : 'true'}
                    aria-describedby={heeftLeerplan ? undefined : 'rc-geen-leerplan'}
                    onChange={() => { if (heeftLeerplan) setDoelen('bestaand'); }}
                  />
                  <span className="rc-keuze-titel">Een leerplan dat al op dit toestel staat</span>
                </label>
                {!heeftLeerplan && (
                  <p id="rc-geen-leerplan" className="rc-keuze-zin">Er staat nog geen leerplan op dit toestel dat bij deze richting past.</p>
                )}
                {doelen === 'bestaand' && heeftLeerplan && (
                  <div className="rc-sets">
                    <Field label="Leerplan">
                      <select
                        id={ID_LEERPLAN} className="select" value={bestaandGekozen?.curriculum.id ?? ''}
                        onChange={(e) => setBestaandId(e.target.value)}
                      >
                        {bestaandeLijst.map((b) => (
                          <option key={b.curriculum.id} value={b.curriculum.id}>
                            {b.curriculum.title}
                            {b.raakt > 0 ? ` · verwijst naar ${enkelOfMeer(b.raakt, 'doel', 'doelen')} van deze richting` : ' · hoort bij deze richting'}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>

              <p className="rc-link"><Link to={linkPerDoel}>Liever per doel kiezen? Stel je doelenlijst samen.</Link></p>
              <p className="rc-teller" aria-live="polite" aria-atomic="true">{teller}</p>
              {laden > 0 && <LaadBericht tekst="De sets worden geladen…" />}
              {mislukt.map((id) => {
                const s = stand(id);
                return <FoutBericht key={id} fout={setFoutTekst(volleNaam(id) || undefined, s.status === 'fout' ? s.fout : '')} onOpnieuw={() => opnieuw(id)} />;
              })}
            </fieldset>
          )}

          <fieldset className="rc-groep">
            <legend>Hoe begin je?</legend>
            <div className="rc-keuze">
              <label className="rc-keuze-rij">
                <input type="radio" name="rc-begin" checked={begin === 'geraamte'} aria-describedby="rc-b-geraamte" onChange={() => setBegin('geraamte')} />
                <span className="rc-keuze-titel">Met een geraamte</span>
              </label>
              <p id="rc-b-geraamte" className="rc-keuze-zin">
                Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Zolang een sectie leeg is, telt ze als ‘gepland’, nog niet als gedekt.
              </p>
            </div>
            <div className="rc-keuze">
              <label className="rc-keuze-rij">
                <input type="radio" name="rc-begin" checked={begin === 'leeg'} aria-describedby="rc-b-leeg" onChange={() => setBegin('leeg')} />
                <span className="rc-keuze-titel">Met een lege cursus</span>
              </label>
              <p id="rc-b-leeg" className="rc-keuze-zin">Je zet de doelcodes zelf op je secties.</p>
            </div>
            <div className="rc-keuze">
              <label className="rc-keuze-rij">
                <input
                  type="radio" name="rc-begin" checked={begin === 'ai'} aria-describedby="rc-b-ai"
                  aria-disabled={metSleutel ? undefined : 'true'}
                  onChange={() => { if (metSleutel) setBegin('ai'); }}
                />
                <span className="rc-keuze-titel">Laat de AI een eerste versie maken</span>
              </label>
              <p id="rc-b-ai" className="rc-keuze-zin">
                {metSleutel
                  ? 'De AI bouwt een eerste versie rond precies deze doelen. Jij kijkt ze daarna na.'
                  : (
                    <>
                      Daarvoor heb je een eigen AI-sleutel nodig (<Link to="/ai-instellingen">AI-instellingen</Link>). Zonder sleutel werkt al de rest.
                    </>
                  )}
              </p>
            </div>
          </fieldset>

          {probleem && (
            <div className="callout err rc-melding" role="alert" tabIndex={-1} ref={probleemRef}>
              <WarningIcon size={18} />
              {probleem.nagekeken
                ? (
                  <p>
                    Het leerplan kon niet als nagekeken bewaard worden: {probleem.tekst}.{' '}
                    <Link to={samenstellenLink(info, kader, keuze, setsVoorLink, [])}>Kies zelf doelen</Link>, dan zie je wat er misloopt.
                  </p>
                )
                : <p>{probleem.tekst}</p>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
