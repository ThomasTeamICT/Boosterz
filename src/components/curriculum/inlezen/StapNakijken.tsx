// Stap 4 van de inleeswizard: nakijken. Boosterz maakt een ontwerp-leerplan, kijkt het na met de
// nakijkpoort (curriculumCheck) en toont per doel de status, de verwijzingen en de plaats in de bron.
// De leerkracht past aan wat nodig is en kiest dan: bewaren zonder nakijken, of bevestigen als nagekeken.
// Bevestigen kan alleen als de poort geen fouten meer ziet, er een volledige bron is, de leerkracht zijn
// naam invult en aanvinkt dat hij elk doel met de bron vergeleken heeft.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, CircleX, Save } from 'lucide-react';
import type { Curriculum, CurriculumGoal, MinimumdoelRef } from '../../../lib/curriculumTypes';
import { bevestigLeerplan, saveCurriculum } from '../../../lib/curriculum';
import { controleerLeerplan, type ControleRapport } from '../../../lib/curriculumCheck';
import {
  aantalFouten, alleBevindingen, bewaarbareDoelen, bewaarNakijkerNaam, bouwOntwerp, bronHash, groepeerBevindingen,
  isLeerplancodeBevinding, kopieerRecord, opId, pasDoelAan, redenenGeenBevestiging, ruimProblemenOp, saneerOntwerp, verwijderDoel,
  verwijderRef, vindDoelProblemen, voegRefToe, zetRefs, type BronGegevens, type LeerplanKeuze,
} from '../../../lib/leerplanInlezen';
import type { MinimumdoelenSetBestand } from '../../../lib/minimumdoelen';
import type { VerwijzingProbleem } from '../../../lib/minimumdoelVerwijzing';
import { GoalIcon, InfoIcon, WarningIcon } from '../../icons';
import { CheckRow, EmptyState, Field, useToast } from '../../ui';
import { MinimumdoelKiezer } from '../MinimumdoelKiezer';
import { DoelKaart, type DoelStatus } from './DoelKaart';

const GEEN_PROBLEMEN: readonly VerwijzingProbleem[] = [];
/**
 * Zo lang wacht het nakijken na de laatste aanpassing; de eerste keer meteen. Duurt een controle lang (een
 * leerplan van honderden bladzijden), dan wacht ze de volgende keer langer, zodat typen niet blijft haperen.
 */
const VERTRAGING_MS = 500;
const MAX_VERTRAGING_MS = 4000;
const EERSTE_VERTRAGING_MS = 30;

const ERNST_ICOON = { fout: CircleX, waarschuwing: WarningIcon, info: InfoIcon } as const;

type Wijzig<T> = (fn: (vorige: T) => T) => void;

export function StapNakijken({
  bestaand, keuze, bron, doelen, onDoelen, problemen, onProblemen, fragmenten, setIds, setBestanden, ingelezenOp, nieuwId, naam, onNaam,
  onNaarStap1,
}: {
  /** Het leerplan dat nagekeken wordt; leeg bij een nieuw leerplan. */
  bestaand?: Curriculum;
  keuze: LeerplanKeuze;
  bron: BronGegevens | null;
  doelen: CurriculumGoal[];
  onDoelen: Wijzig<CurriculumGoal[]>;
  problemen: Record<string, VerwijzingProbleem[]>;
  onProblemen: Wijzig<Record<string, VerwijzingProbleem[]>>;
  /** Per doel de ruwe regels uit de bron, zoals de lezer ze zag (alleen bij een nieuw leerplan). */
  fragmenten: Record<string, string>;
  /** De sets die in stap 3 gekozen zijn. */
  setIds: string[];
  /** Alle geladen sets, op id. */
  setBestanden: ReadonlyMap<string, MinimumdoelenSetBestand>;
  ingelezenOp: number;
  nieuwId: string;
  /** De naam van de nakijker: blijft staan als je een stap terug gaat. */
  naam: string;
  onNaam: (naam: string) => void;
  /** Terug naar stap 1, bv. om de leerplancode in te vullen. */
  onNaarStap1: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();

  const gekozenSets = useMemo(
    () => setIds.map((id) => setBestanden.get(id)).filter((b): b is MinimumdoelenSetBestand => b !== undefined),
    [setIds, setBestanden],
  );
  const bronSha = useMemo(() => (bron ? bronHash(bron) : undefined), [bron]);

  // Het ontwerp zoals het nu is, en dezelfde gesaneerd zoals een export en import het teruggeven.
  const ruw = useMemo(
    () => bouwOntwerp({
      bestaand, keuze, goals: doelen, setIds, ingelezenOp, id: nieuwId,
      bron: bron ? { methode: bron.methode, bronNaam: bron.bronNaam, bronSha256: bronSha } : { methode: 'tekst' },
    }),
    [bestaand, keuze, doelen, setIds, ingelezenOp, nieuwId, bron, bronSha],
  );
  const ontwerp = useMemo(() => saneerOntwerp(ruw), [ruw]);
  const doelProblemen = useMemo(() => vindDoelProblemen(doelen), [doelen]);

  // Het nakijken loopt met een korte vertraging na elke aanpassing.
  const [check, setCheck] = useState<{ voor: Curriculum; rapport: ControleRapport } | null>(null);
  const [vuil, setVuil] = useState<ReadonlySet<string>>(() => new Set());
  const eerste = useRef(true);
  const laatsteDuur = useRef(0);
  useEffect(() => {
    if (!ontwerp) { setCheck(null); return; }
    const wacht = eerste.current ? EERSTE_VERTRAGING_MS : Math.min(MAX_VERTRAGING_MS, Math.max(VERTRAGING_MS, laatsteDuur.current * 2));
    const timer = window.setTimeout(() => {
      eerste.current = false;
      const begin = performance.now();
      const rapport = controleerLeerplan(ontwerp, { bronTekst: bron?.tekst, sets: gekozenSets, bronAfgekapt: bron?.afgekapt });
      laatsteDuur.current = performance.now() - begin;
      setCheck({ voor: ontwerp, rapport });
      setVuil(new Set());
    }, wacht);
    return () => window.clearTimeout(timer);
  }, [ontwerp, bron, gekozenSets]);
  const fris = check !== null && check.voor === ontwerp;

  const markeer = useCallback((id: string) => setVuil((v) => new Set(v).add(id)), []);
  const onCode = useCallback((id: string, waarde: string) => { onDoelen((d) => pasDoelAan(d, id, { code: waarde })); markeer(id); }, [onDoelen, markeer]);
  const onTekst = useCallback((id: string, waarde: string) => { onDoelen((d) => pasDoelAan(d, id, { text: waarde })); markeer(id); }, [onDoelen, markeer]);
  const onVerwijder = useCallback((id: string) => {
    onDoelen((d) => verwijderDoel(d, id));
    onProblemen((p) => kopieerRecord(p, [id]));
    toast('Doel verwijderd', 'ok');
  }, [onDoelen, onProblemen, toast]);
  const onVerwijderRef = useCallback((id: string, index: number) => onDoelen((d) => verwijderRef(d, id, index)), [onDoelen]);
  // Een kandidaat kiezen voor een dubbelzinnige verwijzing: de verwijzing erbij, het probleem weg.
  const onKies = useCallback((id: string, ref: MinimumdoelRef) => {
    onDoelen((d) => voegRefToe(d, id, ref));
    onProblemen((p) => ruimProblemenOp(p, id, [ref]));
  }, [onDoelen, onProblemen]);

  // Minimumdoelen kiezen voor één doel.
  const [kiezerVoor, setKiezerVoor] = useState<string | null>(null);
  const onVoegToe = useCallback((id: string) => {
    if (setIds.length === 0) {
      toast('Kies eerst een of meer sets in stap 3.', 'info');
      return;
    }
    setKiezerVoor(id);
  }, [setIds.length, toast]);
  const sluitKiezer = useCallback(() => setKiezerVoor(null), []);
  const kiezerDoel = doelen.find((g) => g.id === kiezerVoor);

  const gaNaarDoel = (id: string) => {
    const kaart = document.getElementById(`il-doel-${id}`);
    kaart?.scrollIntoView({ block: 'start' });
    kaart?.querySelector<HTMLElement>('h4')?.focus();
  };

  const bevindingen = useMemo(() => alleBevindingen(check?.rapport, doelProblemen), [check, doelProblemen]);
  const groepen = useMemo(() => groepeerBevindingen(bevindingen), [bevindingen]);
  const fouten = aantalFouten(bevindingen);
  const waarschuwingen = bevindingen.filter((b) => b.ernst === 'waarschuwing').length;
  const nietGekoppeld = Object.values(problemen).reduce((n, p) => n + p.length, 0);
  const doelIds = useMemo(() => new Set(doelen.map((g) => g.id)), [doelen]);

  const statusVan = (id: string): DoelStatus => {
    if (!check || vuil.has(id)) return 'bezig';
    return opId(check.rapport.perDoel, id)?.letterlijk ?? 'overgeslagen';
  };

  // Bewaren en bevestigen
  const [vergeleken, setVergeleken] = useState(false);
  const redenen = redenenGeenBevestiging({ heeftOntwerp: ontwerp !== null, heeftBron: bron !== null, rapportFris: fris, fouten, naam, vergeleken });

  const bewaar = () => {
    if (!ontwerp) return;
    // Met doelproblemen (dubbele of lege codes) zou saneren doelen laten vallen: dan bewaren we elk doel afzonderlijk.
    const op = doelProblemen.length === 0 ? ontwerp : { ...ontwerp, goals: bewaarbareDoelen(doelen) };
    if (!saveCurriculum(op)) return;
    toast(`Leerplan bewaard: ${op.title}. Het is nog niet nagekeken.`, 'ok');
    navigate(`/leerplannen?open=${encodeURIComponent(op.id)}`);
  };

  const bevestig = () => {
    if (redenen.length > 0 || !ontwerp || !check) return;
    let definitief: Curriculum;
    try {
      definitief = bevestigLeerplan(ontwerp, { door: naam.trim(), rapport: check.rapport, samenvatting: check.rapport.samenvatting });
    } catch (e) {
      // De poort liep niet op precies deze doelen (of vond nog iets): niet bevestigen, wel zeggen waarom.
      toast(e instanceof Error ? e.message : 'Bevestigen lukte niet. Kijk de doelen opnieuw na.', 'err');
      return;
    }
    bewaarNakijkerNaam(naam);
    if (!saveCurriculum(definitief)) return;
    toast(`Leerplan nagekeken en bewaard: ${definitief.title}`, 'ok');
    navigate(`/leerplannen?open=${encodeURIComponent(definitief.id)}`);
  };

  const tellers = check?.rapport.tellers;

  return (
    <div className="il-stap-inhoud">
      <p className="il-uitleg">
        Boosterz kijkt al na of elk doel letterlijk in de bron staat en of de verwijzingen kloppen. Boosterz kan een doel te kort of te lang afgebakend
        hebben. Vergelijk elke tekst met de bron en pas aan.
      </p>

      {!ontwerp ? (
        <EmptyState icon={<GoalIcon size={40} />} title="Er zijn geen doelen meer" level={3}>
          <p>Ga terug naar de bron om opnieuw doelen te zoeken.</p>
        </EmptyState>
      ) : (
        <>
          <section className="card card-pad il-samenvatting" aria-labelledby="il-samenvatting-kop" aria-busy={!fris}>
            <h3 id="il-samenvatting-kop">Samenvatting</h3>
            <p className="il-samenvatting-tekst">{check ? check.rapport.samenvatting : 'Het nakijken loopt…'}</p>
            <dl className="il-tellers">
              <div><dt>Doelen</dt><dd>{doelen.length}</dd></div>
              <div><dt>Letterlijk in de bron</dt><dd>{tellers ? tellers.letterlijk : '…'}</dd></div>
              <div><dt>Niet letterlijk</dt><dd>{tellers ? tellers.nietLetterlijk : '…'}</dd></div>
              <div><dt>Verwijzingen in orde</dt><dd>{tellers ? `${tellers.verwijzingenOk} van ${tellers.verwijzingen}` : '…'}</dd></div>
              <div><dt>Los dit eerst op</dt><dd>{fouten}</dd></div>
              <div><dt>Kijk dit na</dt><dd>{waarschuwingen}</dd></div>
            </dl>
            {nietGekoppeld > 0 && (
              <p className="hint il-nietgekoppeld">
                <WarningIcon size={14} className="icon-inline" /> {nietGekoppeld} {nietGekoppeld === 1 ? 'verwijzing uit de bron is' : 'verwijzingen uit de bron zijn'} nog niet aan een minimumdoel gekoppeld. Kijk ze na bij de doelen hieronder.
              </p>
            )}
          </section>

          {groepen.map((g) => {
            const Icoon = ERNST_ICOON[g.ernst];
            return (
              <section key={g.ernst} className={`il-groep il-groep-${g.ernst}`} aria-labelledby={`il-groep-kop-${g.ernst}`}>
                <h3 id={`il-groep-kop-${g.ernst}`}><Icoon size={20} /> {g.titel} ({g.items.length})</h3>
                <ul className="il-bevindingen">
                  {g.items.map((b, i) => (
                    <li key={`${i}-${b.doelId ?? ''}`}>
                      <span className="il-bericht">{b.bericht}</span>
                      {b.doelId && doelIds.has(b.doelId) && (
                        <button type="button" className="il-link" onClick={() => gaNaarDoel(b.doelId as string)}>
                          Ga naar {b.code?.trim() || 'het doel'}
                        </button>
                      )}
                      {isLeerplancodeBevinding(b) && (
                        <button type="button" className="il-link" onClick={onNaarStap1}>Naar stap 1</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <h3 className="il-doelen-kop">Doelen ({doelen.length})</h3>
          <ol className="il-doelen">
            {doelen.map((g, i) => (
              <li key={g.id}>
                <DoelKaart
                  goal={g} nummer={i + 1} status={statusVan(g.id)}
                  vindplaats={opId(check?.rapport.perDoel, g.id)?.vindplaats} fragment={opId(fragmenten, g.id)}
                  problemen={opId(problemen, g.id) ?? GEEN_PROBLEMEN} bestanden={setBestanden}
                  onCode={onCode} onTekst={onTekst} onVerwijder={onVerwijder} onVerwijderRef={onVerwijderRef} onKies={onKies} onVoegToe={onVoegToe}
                />
              </li>
            ))}
          </ol>
        </>
      )}

      <section className="card card-pad il-acties" aria-labelledby="il-acties-kop">
        <h3 id="il-acties-kop">Klaar? Bewaar het leerplan</h3>

        <div className="il-actieblok">
          <h4>Bevestigen als nagekeken</h4>
          <p className="hint">Het leerplan komt dan op slot, met je naam en de datum, en telt als nagekeken.</p>
          <div className="il-naamveld">
            <Field label="Je naam" hint="Je naam komt bij het leerplan, ook als je het exporteert. Op dit toestel onthoudt Boosterz je naam voor de volgende keer.">
              <input id="il-naam" className="input" value={naam} autoComplete="name" onChange={(e) => onNaam(e.target.value)} />
            </Field>
          </div>
          <CheckRow checked={vergeleken} onChange={setVergeleken} label="Ik heb elk doel met de bron vergeleken" />
          <button
            type="button" className="btn btn-primary il-bevestig" aria-disabled={redenen.length > 0 ? 'true' : undefined}
            aria-describedby={redenen.length > 0 ? 'il-redenen' : undefined} onClick={bevestig}
          >
            <BadgeCheck size={18} /> Bevestigen als nagekeken
          </button>
          {redenen.length > 0 && (
            <div id="il-redenen" className="il-redenen">
              <p>Dit kan nog niet:</p>
              <ul>{redenen.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
        </div>

        <div className="il-actieblok">
          <h4>Bewaren zonder nakijken</h4>
          <p className="hint">Je bewaart het leerplan nu en kijkt het later na. Het staat dan in je lijst als niet nagekeken.</p>
          <button type="button" className="btn btn-ghost" disabled={!ontwerp} onClick={bewaar}>
            <Save size={18} /> Bewaren zonder nakijken
          </button>
        </div>
      </section>

      {kiezerDoel && (
        <MinimumdoelKiezer
          titel={`Minimumdoelen kiezen voor ${kiezerDoel.code.trim() || 'dit doel'}`}
          setIds={setIds} gekozen={kiezerDoel.refs ?? []} voorgeladen={setBestanden}
          onKies={(refs) => {
            onDoelen((d) => zetRefs(d, kiezerDoel.id, refs));
            onProblemen((p) => ruimProblemenOp(p, kiezerDoel.id, refs));
            setKiezerVoor(null);
          }}
          onClose={sluitKiezer}
        />
      )}
    </div>
  );
}
