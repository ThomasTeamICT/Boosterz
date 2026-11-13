// ── Bordles: uitleg stap voor stap op een schoolbord ────────────────────────
//
// Eerste uitlegvorm uit docs/UITLEGVORMEN.md. Een hand met krijt tekent en
// schrijft de uitleg (lib/bordles/motor.ts); de leerling doorloopt de fases
// Kijk mee (uitgewerkt voorbeeld met waaromvragen), Doe mee (afbouwen),
// Zoek de fout en Alleen (met zekerheidsvraag). Didactiek per onderdeel staat
// in het commentaar, zodat ze uit te leggen is aan collega's.

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BordElement, BordlesConfig, BordlesFase, BordlesSnelheid, BordlesStap } from '../lib/types';
import {
  alleStappen, antwoordGelijk, gekendeFout, MAX_POGINGEN, telendeStappen, teltAlsEigenWerk, toetsenbordVoor, uitkomstVan, valideerBordles,
  type StapVoortgang,
} from '../lib/bordles/formaat';
import { krijt, padVoor, SNELHEID_NAMEN, tekstAnker, voorleesTekst, vulPad } from '../lib/bordles/vormen';
import { maakMotor, type Motor } from '../lib/bordles/motor';
import { voorbeeldPythagoras } from '../lib/bordles/voorbeeldPythagoras';
import { loadA11y } from '../components/A11yMenu';
import { Field } from '../components/ui';
import { EditorProps, PlayerProps, ResultHero } from './shared';
import '../styles/bordles.css';

const HANDMAP = `${import.meta.env.BASE_URL}bordles/`;
const SNELHEID_SLEUTEL = 'boosterz-bordles-snelheid';
const SNELHEDEN: BordlesSnelheid[] = ['traag', 'normaal', 'snel', 'meteen'];

const FASE_NAAM: Record<BordlesFase['soort'], string> = { kijk: 'Kijk mee', doe: 'Doe mee', fout: 'Zoek de fout', alleen: 'Alleen' };

// ── Bordelementen renderen ──────────────────────────────────────────────────

function BordVorm({ el, opgelost, pop }: { el: BordElement; opgelost: (id: string) => boolean; pop: string | null }) {
  if (el.soort === 'tekst') {
    const verborgen = el.verborgenTot && !opgelost(el.verborgenTot);
    const kleur = krijt(el.delen[0]?.kleur);
    return (
      <text
        data-b="tekst"
        className={`b-krijtschrift${el.verborgenTot && pop === el.verborgenTot && !verborgen ? ' b-pop' : ''}`}
        x={el.plek[0]} y={el.plek[1]} fontSize={el.grootte ?? 26} textAnchor={tekstAnker(el.uitlijning)} fill={krijt('wit')}
      >
        {verborgen
          ? <tspan fill={kleur} className="b-blanco">{el.plaatshouder ?? '?'}</tspan>
          : el.delen.map((d, i) => <tspan key={i} fill={d.kleur ? krijt(d.kleur) : undefined}>{d.tekst}</tspan>)}
      </text>
    );
  }
  const vul = vulPad(el);
  return (
    <>
      <path
        data-b="lijn" d={padVoor(el)} fill="none" stroke={krijt(el.kleur)} strokeWidth={el.dikte ?? 3}
        strokeLinecap="round" strokeLinejoin="round"
      />
      {vul && <path data-b="vulling" d={vul} fill={krijt(el.kleur)} fillOpacity={0.12} stroke="none" />}
    </>
  );
}

// ── Voortgang per stap ──────────────────────────────────────────────────────

interface Voortgang extends StapVoortgang {
  feedback?: { tekst: string; goed: boolean };
  gekozen?: number[];
  antwoordTekst?: string;
}
const LEEG: Voortgang = { opgelost: false, pogingen: 0, hints: 0, getoond: false };

function beginSnelheid(cfg: BordlesConfig): BordlesSnelheid {
  try {
    if (loadA11y().calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'meteen';
  } catch { /* geen matchMedia */ }
  try {
    const s = localStorage.getItem(SNELHEID_SLEUTEL) as BordlesSnelheid | null;
    if (s && SNELHEDEN.includes(s)) return s;
  } catch { /* geen opslag */ }
  return cfg.standaardSnelheid ?? 'normaal';
}

function stilte() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** Wat er op het bord staat, als tekst voor een schermlezer. */
function bordTekst(stappen: BordlesStap[], vervangen: Set<string>, opgelost: (id: string) => boolean): string {
  const delen: string[] = [];
  for (const s of stappen) for (const e of s.teken) {
    if (e.soort !== 'tekst' || (e.id && vervangen.has(e.id))) continue;
    delen.push(e.verborgenTot && !opgelost(e.verborgenTot) ? (e.plaatshouder ?? '?') : e.delen.map((d) => d.tekst).join(''));
  }
  return delen.join('; ');
}

function spreek(tekst: string) {
  if (typeof speechSynthesis === 'undefined' || !tekst.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(voorleesTekst(tekst));
  u.lang = 'nl-BE';
  u.rate = loadA11y().rate;
  speechSynthesis.speak(u);
}

// ── Speler ──────────────────────────────────────────────────────────────────

/** Fase -1 is de instapvraag. */
interface Plek { fase: number; stap: number }

export function BordlesPlayer({ widget, preview, timeUp, onComplete }: PlayerProps<BordlesConfig>) {
  const cfg = widget.config;
  const fouten = useMemo(() => valideerBordles(cfg), [cfg]);
  const instapFase = useMemo<BordlesFase | null>(
    () => (cfg.instapvraag ? { id: 'instap', soort: 'kijk', titel: 'Instap', stappen: [cfg.instapvraag] } : null),
    [cfg.instapvraag],
  );

  const [plek, setPlek] = useState<Plek>(() => ({ fase: cfg.instapvraag ? -1 : 0, stap: 0 }));
  const [voortgang, setVoortgang] = useState<Record<string, Voortgang>>({});
  const [snelheid, setSnelheid] = useState<BordlesSnelheid>(() => beginSnelheid(cfg));
  const [bordstand, setBordstand] = useState(false);
  const [teller, setTeller] = useState(0);
  const [pop, setPop] = useState<string | null>(null);
  const [instapUitslag, setInstapUitslag] = useState<null | 'juist' | 'fout'>(null);
  const [klaar, setKlaar] = useState(false);
  const [antwoord, setAntwoord] = useState('');
  const [zeker, setZeker] = useState<StapVoortgang['zeker']>(undefined);
  const animeerRef = useRef(true);
  const ingediendRef = useRef(false);
  const uid = useId();
  const huidigeRef = useRef<SVGGElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const invoerRef = useRef<HTMLInputElement>(null);
  const volgendeRef = useRef<HTMLButtonElement>(null);
  const keuzeRef = useRef<HTMLDivElement>(null);
  const instapActieRef = useRef<HTMLDivElement>(null);
  const [ingediend, setIngediend] = useState(false);

  const fase: BordlesFase | undefined = plek.fase === -1 ? instapFase ?? undefined : cfg.fases[plek.fase];
  const stap: BordlesStap | undefined = fase?.stappen[plek.stap];
  const v: Voortgang = (stap && voortgang[stap.id]) || LEEG;

  const isOpgelost = useCallback((id: string) => !!voortgang[id]?.opgelost, [voortgang]);
  const wijzig = (id: string, f: (o: Voortgang) => Voortgang) =>
    setVoortgang((alles) => ({ ...alles, [id]: f(alles[id] ?? LEEG) }));

  // De motor leeft zolang het bord op het scherm staat; hij tekent in zijn eigen laag.
  // Een callback-ref, want het bord verdwijnt bij het resultaatscherm en komt terug bij "nog eens bekijken".
  const laagRef = useCallback((laag: SVGGElement | null) => {
    motorRef.current?.stop();
    motorRef.current = laag ? maakMotor(laag, HANDMAP) : null;
  }, []);

  // Na elke nieuwe stap: de hand tekent wat nieuw is (behalve bij 'terug' of na een antwoord).
  useLayoutEffect(() => {
    const m = motorRef.current, g = huidigeRef.current;
    if (!m) return;
    if (animeerRef.current && g) void m.speel(g, snelheid, { wijsNaar: stap?.wijsNaar });
    else m.maakAf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teller]);

  useEffect(() => () => { stilte(); motorRef.current?.stop(); }, []);

  // ── resultaten ────────────────────────────────────────────────────────────
  const dienIn = useCallback((stand: Record<string, Voortgang>) => {
    if (ingediendRef.current) return;
    ingediendRef.current = true;
    setIngediend(true);
    const telend = telendeStappen(cfg);
    const answers: Record<string, unknown> = {};
    const itemScores: Record<string, { earned: number; max: number; mode: 'auto' }> = {};
    let earned = 0;
    for (const s of telend) {
      const sv = stand[s.id];
      const uitkomst = uitkomstVan(sv);
      answers[s.id] = {
        stap: s.deeldoel ?? s.uitleg, uitkomst, pogingen: sv?.pogingen ?? 0, hints: sv?.hints ?? 0,
        ...(sv?.zeker ? { zeker: sv.zeker } : {}),
      };
      const e = teltAlsEigenWerk(uitkomst) ? 1 : 0;
      itemScores[s.id] = { earned: e, max: 1, mode: 'auto' };
      earned += e;
    }
    if (instapUitslag) answers.instap = instapUitslag;
    onComplete({ answers, itemScores: telend.length ? itemScores : null, earned, max: telend.length });
  }, [cfg, instapUitslag, onComplete]);

  useEffect(() => {
    if (timeUp && !ingediendRef.current) { setKlaar(true); dienIn(voortgang); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  // ── navigatie ─────────────────────────────────────────────────────────────
  const gaNaar = (p: Plek, animeer: boolean) => {
    stilte();
    animeerRef.current = animeer;
    setPlek(p);
    setPop(null);
    setAntwoord('');
    setZeker(undefined);
    setTeller((t) => t + 1);
  };

  const geblokkeerd = !!stap && !v.opgelost && !!(stap.invul || stap.keuze || stap.waarom);

  const volgende = () => {
    if (motorRef.current?.bezig()) { motorRef.current.maakAf(); return; }
    if (!fase || geblokkeerd) return;
    if (plek.stap < fase.stappen.length - 1) gaNaar({ fase: plek.fase, stap: plek.stap + 1 }, true);
    else if (plek.fase < cfg.fases.length - 1) gaNaar({ fase: plek.fase + 1, stap: 0 }, true);
    else { motorRef.current?.maakAf(); setKlaar(true); dienIn(voortgang); }
  };
  const terug = () => {
    if (plek.stap > 0) gaNaar({ fase: plek.fase, stap: plek.stap - 1 }, false);
    else if (plek.fase > 0) gaNaar({ fase: plek.fase - 1, stap: cfg.fases[plek.fase - 1].stappen.length - 1 }, false);
  };

  const laatsteStap = !!fase && plek.fase === cfg.fases.length - 1 && plek.stap === fase.stappen.length - 1;

  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (t === 'input' || t === 'textarea' || t === 'select' || klaar || plek.fase === -1) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Afronden dient in: dat gebeurt alleen met de knop, nooit met een toevallige pijltoets.
      if (e.key === 'ArrowRight' && !laatsteStap) volgende();
      if (e.key === 'ArrowLeft') terug();
    };
    document.addEventListener('keydown', toets);
    return () => document.removeEventListener('keydown', toets);
  });

  // ── antwoorden ────────────────────────────────────────────────────────────
  const naOplossen = (id: string) => {
    animeerRef.current = false; setPop(id); setTeller((t) => t + 1);
    // De focus naar de volgende stap (of naar de keuze na de instapvraag), niet verloren op body.
    setTimeout(() => (instapActieRef.current?.querySelector('button') ?? volgendeRef.current)?.focus(), 0);
  };

  const controleer = () => {
    if (!stap?.invul || v.opgelost) return;
    const inv = stap.invul;
    const isInstap = plek.fase === -1;
    if (inv.zekerheid && v.pogingen === 0 && !zeker) {
      wijzig(stap.id, (o) => ({ ...o, feedback: { tekst: 'Kies eerst hoe zeker je bent.', goed: false } }));
      return;
    }
    if (!antwoord.trim()) {
      wijzig(stap.id, (o) => ({ ...o, feedback: { tekst: 'Vul eerst een antwoord in.', goed: false } }));
      return;
    }
    const z = v.pogingen === 0 ? zeker : v.zeker;
    if (antwoordGelijk(antwoord, inv.antwoord)) {
      // Zekerheid: juist maar gegokt is wankele kennis; dat zeggen we eerlijk.
      let extra = '';
      if (inv.zekerheid && v.pogingen === 0 && z === 'gok') extra = ' Je gokte, maar het klopt. Overloop de stappen nog eens, dan wordt het zeker.';
      else if (inv.zekerheid && v.pogingen === 0 && z === 'twijfel') extra = ' Je twijfelde, maar je aanpak klopt.';
      wijzig(stap.id, (o) => ({ ...o, opgelost: true, zeker: z, antwoordTekst: antwoord, feedback: { tekst: `Juist!${extra}`, goed: true } }));
      if (isInstap) setInstapUitslag(v.pogingen === 0 ? 'juist' : 'fout');
      naOplossen(stap.id);
      return;
    }
    if (isInstap) {
      // De instapvraag is een peiling, geen oefening: geen hints, geen tweede kans.
      wijzig(stap.id, (o) => ({ ...o, opgelost: true, pogingen: 1, antwoordTekst: antwoord, feedback: { tekst: `Het juiste antwoord is ${inv.antwoord}. Geen probleem: we bekijken het samen.`, goed: false } }));
      setInstapUitslag('fout');
      naOplossen(stap.id);
      return;
    }
    // Getrapte feedback: gerichte uitleg bij een gekende fout, dan een hint en een nieuwe kans;
    // pas na MAX_POGINGEN de oplossing. Fout én 'zeker' wijst op een misverstand.
    const pogingen = v.pogingen + 1;
    let tekst = gekendeFout(stap, antwoord) ?? 'Nog niet juist.';
    if (inv.zekerheid && z === 'zeker' && pogingen === 1) tekst = `Let op: je was zeker, maar dit klopt niet. ${tekst}`;
    if (pogingen >= MAX_POGINGEN) {
      wijzig(stap.id, (o) => ({
        ...o, pogingen, zeker: z, opgelost: true, getoond: true, antwoordTekst: antwoord,
        feedback: { tekst: `De oplossing is ${inv.antwoord}. Bekijk op het bord hoe je er komt.`, goed: false },
      }));
      naOplossen(stap.id);
      return;
    }
    const hints = Math.min(inv.hints.length, Math.max(v.hints, pogingen));
    wijzig(stap.id, (o) => ({
      ...o, pogingen, hints, zeker: z,
      feedback: { tekst: `${tekst} ${hints > 0 ? 'Lees de hint en probeer opnieuw.' : 'Probeer opnieuw.'}`, goed: false },
    }));
    setTimeout(() => invoerRef.current?.select(), 0);
  };

  const kies = (i: number) => {
    if (!stap?.keuze || v.opgelost) return;
    const o = stap.keuze.opties[i];
    if (v.gekozen?.includes(i)) return;
    if (o.juist) {
      wijzig(stap.id, (x) => ({ ...x, opgelost: true, gekozen: [...(x.gekozen ?? []), i], feedback: { tekst: o.uitleg, goed: true } }));
      if (plek.fase === -1) setInstapUitslag(v.pogingen === 0 ? 'juist' : 'fout');
      naOplossen(stap.id);
    } else {
      wijzig(stap.id, (x) => ({ ...x, pogingen: x.pogingen + 1, gekozen: [...(x.gekozen ?? []), i], feedback: { tekst: `${o.uitleg} Kies opnieuw.`, goed: false } }));
      setTimeout(() => keuzeRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(), 0);
    }
  };

  const vraagHint = () => {
    if (!stap?.invul) return;
    wijzig(stap.id, (o) => ({ ...o, hints: Math.min(stap.invul!.hints.length, o.hints + 1) }));
  };

  // ── weergave ──────────────────────────────────────────────────────────────
  if (fouten.length > 0) {
    return (
      <div className="card card-pad">
        <h2>Deze bordles is nog niet klaar</h2>
        {preview ? (
          <ul>{fouten.slice(0, 12).map((f, i) => <li key={i}><code>{f.pad}</code>: {f.melding}</li>)}</ul>
        ) : <p>Vraag je leerkracht om de les na te kijken.</p>}
      </div>
    );
  }

  if (klaar) {
    const telend = telendeStappen(cfg);
    return (
      <ResultHero earned={0} max={0} showScore={false} title="Klaar!" subtitle="Je hebt de hele bordles doorlopen.">
        {telend.length > 0 && (
          <ul className="b-samenvatting">
            {telend.map((s) => (
              <li key={s.id}>{s.deeldoel ?? s.uitleg}: <strong>{uitkomstVan(voortgang[s.id])}</strong></li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => { setKlaar(false); gaNaar({ fase: 0, stap: 0 }, true); }}>
          De les nog eens bekijken
        </button>
      </ResultHero>
    );
  }

  if (!fase || !stap) {
    return (
      <div className="card card-pad">
        <p>Deze stap bestaat niet meer.</p>
        <button type="button" className="btn btn-primary" onClick={() => gaNaar({ fase: 0, stap: 0 }, true)}>Naar het begin</button>
      </div>
    );
  }

  // Wat staat er op het bord: alle stappen van deze fase tot en met de huidige.
  // Een element met 'vervangt' doet een eerder element verdwijnen.
  const zichtbaar = fase.stappen.slice(0, plek.stap + 1);
  const vervangen = new Set<string>();
  zichtbaar.forEach((s) => s.teken.forEach((e) => { if (e.vervangt) vervangen.add(e.vervangt); }));
  // Eén nieuwe stap tegelijk, de vorige gedimd (minder cognitieve belasting).
  // Tekent de huidige stap niets (een vraag), dan blijft het bord helder.
  const dim = stap.teken.length > 0;

  const alleenFase = cfg.fases.findIndex((f) => f.soort === 'alleen');
  const klasmomentOpen = bordstand && !!stap.klasmoment && !v.opgelost;
  const ids = { antwoord: `${uid}-antwoord`, waarom: `${uid}-waarom` };

  return (
    <div className={`b-les${bordstand ? ' b-bordstand' : ''}`}>
      {cfg.leerdoel && <p className="b-leerdoel"><strong>Leerdoel:</strong> {cfg.leerdoel}</p>}
      {ingediend && <p className="callout b-al-ingediend" role="note">Je les is al ingediend. Wat je nu nog doet, telt niet meer mee.</p>}
      <nav className="b-fases" aria-label="Fases van de les">
        {instapFase && (
          <button type="button" aria-current={plek.fase === -1 ? 'step' : undefined} onClick={() => gaNaar({ fase: -1, stap: 0 }, true)}>Instap</button>
        )}
        {cfg.fases.map((f, i) => (
          <button key={f.id} type="button" aria-current={plek.fase === i ? 'step' : undefined} onClick={() => gaNaar({ fase: i, stap: 0 }, true)}>
            {f.titel ?? FASE_NAAM[f.soort]}
          </button>
        ))}
      </nav>

      <div className="b-raster">
        {/* Tik op het bord: de tekening meteen af (met het toetsenbord doet Volgende hetzelfde). */}
        <div className="b-bord" onClick={() => motorRef.current?.maakAf()}>
          <svg viewBox="0 0 600 500" role="img" aria-label={`Op het bord: ${bordTekst(zichtbaar, vervangen, isOpgelost) || 'een tekening'}`}>
            <g key={teller}>
              {zichtbaar.map((s, i) => (
                <g key={s.id} ref={i === plek.stap ? huidigeRef : undefined} className={i < plek.stap && dim ? 'b-oud' : undefined}>
                  {s.teken.map((e, j) => (e.id && vervangen.has(e.id) ? null
                    : <BordVorm key={j} el={e} opgelost={isOpgelost} pop={pop} />))}
                </g>
              ))}
            </g>
            <g ref={laagRef} />
          </svg>
        </div>

        <section className="b-paneel" aria-label="Uitleg en bediening">
          <p className="b-teller">{fase.titel ?? FASE_NAAM[fase.soort]} · stap {plek.stap + 1} van {fase.stappen.length}</p>
          {/* Deeldoel: een naam per stap helpt de aanpak meenemen naar nieuwe opgaven. */}
          {stap.deeldoel && <p className="b-deeldoel">{stap.deeldoel}</p>}
          <p className="b-uitleg" aria-live="polite">{stap.uitleg}</p>

          <div className="b-rij">
            <button type="button" className="btn btn-ghost b-voorlees" onClick={() => spreek(`${stap.deeldoel ? `${stap.deeldoel}. ` : ''}${stap.uitleg} ${stap.keuze?.vraag ?? stap.waarom?.vraag ?? stap.invul?.label ?? ''}`)}>
              Voorlezen
            </button>
            <div className="b-snelheid" role="group" aria-label="Tekensnelheid">
              {SNELHEDEN.map((s) => (
                <button key={s} type="button" aria-pressed={snelheid === s} onClick={() => {
                  setSnelheid(s);
                  try { localStorage.setItem(SNELHEID_SLEUTEL, s); } catch { /* geen opslag */ }
                  animeerRef.current = true; setTeller((t) => t + 1);
                }}>{SNELHEID_NAMEN[s]}</button>
              ))}
            </div>
            <label className="b-schakel"><input type="checkbox" checked={bordstand} onChange={(e) => setBordstand(e.target.checked)} /> Bordstand</label>
          </div>

          {/* Klasmoment: in de bordstand antwoordt eerst iedereen, dan pas de oplossing. */}
          {klasmomentOpen && (
            <div className="b-klasmoment" role="status">
              <p><strong>Klasmoment.</strong> {stap.klasmoment!.opdracht}</p>
              <button type="button" className="btn btn-primary" onClick={() => {
                wijzig(stap.id, (o) => ({ ...o, opgelost: true, klas: true, feedback: { tekst: stap.invul ? `De oplossing is ${stap.invul.antwoord}.` : (stap.keuze?.opties.find((x) => x.juist)?.uitleg ?? ''), goed: true } }));
                if (plek.fase === -1) setInstapUitslag('fout');
                naOplossen(stap.id);
              }}>Toon de oplossing</button>
            </div>
          )}

          {stap.invul && !klasmomentOpen && (
            <div className="b-invul">
              {stap.invul.zekerheid && (
                <div className="b-zeker" role="group" aria-label="Hoe zeker ben je?">
                  <span>Hoe zeker ben je?</span>
                  {(['zeker', 'twijfel', 'gok'] as const).map((z) => (
                    <button key={z} type="button" aria-pressed={(v.pogingen === 0 ? zeker : v.zeker) === z}
                      disabled={v.pogingen > 0 || v.opgelost} onClick={() => setZeker(z)}>
                      {z === 'zeker' ? 'Zeker' : z === 'twijfel' ? 'Twijfel' : 'Gok'}
                    </button>
                  ))}
                </div>
              )}
              <label htmlFor={ids.antwoord} className="b-label">{stap.invul.label}</label>
              <div className="b-rij">
                <input
                  id={ids.antwoord} ref={invoerRef} className="input b-input" inputMode={toetsenbordVoor(stap.invul.antwoord)} autoComplete="off"
                  value={v.opgelost ? (v.getoond || v.klas ? stap.invul.antwoord : v.antwoordTekst ?? '') : antwoord}
                  disabled={v.opgelost} onChange={(e) => setAntwoord(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') controleer(); }}
                />
                <button type="button" className="btn btn-primary" disabled={v.opgelost} onClick={controleer}>Controleer</button>
                {plek.fase !== -1 && stap.invul.hints.length > 0 && (
                  <button type="button" className="btn btn-ghost" disabled={v.opgelost || v.hints >= stap.invul.hints.length} onClick={vraagHint}>Hint</button>
                )}
              </div>
              {v.hints > 0 && <ol className="b-hints">{stap.invul.hints.slice(0, v.hints).map((h, i) => <li key={i}>{h}</li>)}</ol>}
            </div>
          )}

          {stap.keuze && !klasmomentOpen && (
            <div className="b-keuze" ref={keuzeRef}>
              {stap.keuze.vraag && <p className="b-vraag">{stap.keuze.vraag}</p>}
              {stap.keuze.opties.map((o, i) => {
                const gekozen = v.gekozen?.includes(i);
                return (
                  <button key={i} type="button" className={`b-optie${gekozen ? (o.juist ? ' juist' : ' mis') : ''}`}
                    disabled={v.opgelost || gekozen} onClick={() => kies(i)}>{o.tekst}</button>
                );
              })}
            </div>
          )}

          {/* Waaromvraag: zelf verklaren maakt een uitgewerkt voorbeeld pas sterk. */}
          {stap.waarom && (
            <div className="b-waarom">
              <label htmlFor={ids.waarom} className="b-vraag">{stap.waarom.vraag}</label>
              <textarea id={ids.waarom} className="textarea" rows={2} disabled={v.opgelost} placeholder="Schrijf kort je antwoord (niet verplicht)"
                value={v.antwoordTekst ?? ''} onChange={(e) => wijzig(stap.id, (o) => ({ ...o, antwoordTekst: e.target.value }))} />
              {v.opgelost ? <p className="b-model"><strong>Modelantwoord:</strong> {stap.waarom.modelantwoord}</p> : (
                <button type="button" className="btn btn-ghost" onClick={() => { wijzig(stap.id, (o) => ({ ...o, opgelost: true })); naOplossen(stap.id); }}>
                  Toon het modelantwoord
                </button>
              )}
            </div>
          )}

          {/* De meldingsregio staat er altijd, zodat een schermlezer elke nieuwe melding voorleest. */}
          <p className={`b-feedback ${v.feedback ? (v.feedback.goed ? 'goed' : 'fout') : ''}`} role="status" aria-live="polite">{v.feedback?.tekst ?? ''}</p>

          {/* Instap: wie het al kan, hoeft niet te wachten (voordoen remt gevorderden). */}
          {plek.fase === -1 && instapUitslag && (
            <div className="b-rij" ref={instapActieRef}>
              {instapUitslag === 'juist' && alleenFase >= 0 && (
                <button type="button" className="btn btn-primary" onClick={() => gaNaar({ fase: alleenFase, stap: 0 }, true)}>Meteen naar Alleen</button>
              )}
              <button type="button" className={`btn ${instapUitslag === 'juist' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => gaNaar({ fase: 0, stap: 0 }, true)}>
                {instapUitslag === 'juist' ? 'Toch eerst meekijken' : 'Verder'}
              </button>
            </div>
          )}

          {plek.fase !== -1 && (
            <div className="b-rij b-nav">
              <button type="button" className="btn btn-ghost" disabled={plek.fase === 0 && plek.stap === 0} onClick={terug}>Terug</button>
              <button type="button" className="btn btn-ghost" onClick={() => { animeerRef.current = true; setTeller((t) => t + 1); }}>Nog eens</button>
              <button type="button" ref={volgendeRef} className="btn btn-primary" disabled={geblokkeerd} onClick={volgende}>
                {laatsteStap ? 'Afronden' : 'Volgende'}
              </button>
            </div>
          )}

          {cfg.woorden && cfg.woorden.length > 0 && (
            <details className="b-woorden">
              <summary>Woorden</summary>
              <dl>{cfg.woorden.map((w) => <React.Fragment key={w.woord}><dt>{w.woord}</dt><dd>{w.uitleg}</dd></React.Fragment>)}</dl>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Editor (BL-3: eenvoudig; de volledige editor met vormen volgt in BL-5) ──

export function BordlesEditor({ config, onChange }: EditorProps<BordlesConfig>) {
  const [tekst, setTekst] = useState('');
  const [melding, setMelding] = useState<string[]>([]);
  const [vervangen, setVervangen] = useState(false);
  const [basis, setBasis] = useState('');

  // Een nieuwe bordles start met de voorbeeldles, zodat je meteen ziet hoe het werkt.
  useEffect(() => {
    if (!config.fases || config.fases.length === 0) onChange(voorbeeldPythagoras());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fouten = useMemo(() => valideerBordles(config), [config]);
  const aantalStappen = alleStappen(config).length;

  return (
    <div className="b-editor">
      <p className="hint">
        Een bordles doet de leerstof stap voor stap voor op een schoolbord, met een hand die schrijft en tekent.
        Daarna vult de leerling zelf stappen in, zoekt een fout en werkt alleen. Deze les telt {config.fases?.length ?? 0} fases
        en {aantalStappen} stappen. Een editor om zelf vormen op het bord te zetten volgt; tot dan pas je de les aan als tekst
        (onderaan) of start je van de voorbeeldles.
      </p>
      <Field label="Leerdoel (in leerlingentaal)" hint="Staat bovenaan de les.">
        <textarea className="textarea" rows={2} value={config.leerdoel ?? ''}
          onChange={(e) => onChange({ ...config, leerdoel: e.target.value })} />
      </Field>
      <Field label="Standaardsnelheid van de hand" hint="De leerling kan ze zelf aanpassen.">
        <select className="input" value={config.standaardSnelheid ?? 'normaal'}
          onChange={(e) => onChange({ ...config, standaardSnelheid: e.target.value as BordlesSnelheid })}>
          {SNELHEDEN.map((s) => <option key={s} value={s}>{SNELHEID_NAMEN[s]}</option>)}
        </select>
      </Field>

      <div className="b-editor-fases">
        {(config.fases ?? []).map((f) => (
          <div key={f.id} className="editor-item">
            <div className="editor-item-head"><strong>{f.titel ?? FASE_NAAM[f.soort]}</strong><span className="badge">{f.stappen.length} stappen</span></div>
            <ol className="b-editor-stappen">
              {f.stappen.map((s) => (
                <li key={s.id}>
                  {s.deeldoel && <strong>{s.deeldoel}: </strong>}{s.uitleg}
                  {s.invul && <em> (leerling vult in: {s.invul.antwoord})</em>}
                  {s.keuze && <em> (keuzevraag)</em>}
                  {s.waarom && <em> (waaromvraag)</em>}
                  {s.klasmoment && <em> (klasmoment)</em>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {fouten.length > 0 && (
        <div className="callout" role="status">
          <div><strong>Nog na te kijken:</strong><ul>{fouten.slice(0, 8).map((f, i) => <li key={i}>{f.melding}</li>)}</ul></div>
        </div>
      )}

      <div className="b-rij">
        {!vervangen ? (
          <button type="button" className="btn btn-ghost" onClick={() => setVervangen(true)}>Start opnieuw van de voorbeeldles</button>
        ) : (
          <>
            <span>De huidige les wordt vervangen. Zeker?</span>
            <button type="button" className="btn btn-primary" onClick={() => { onChange(voorbeeldPythagoras()); setVervangen(false); }}>Ja, vervang</button>
            <button type="button" className="btn btn-ghost" onClick={() => setVervangen(false)}>Nee</button>
          </>
        )}
      </div>

      <details className="b-editor-json" onToggle={(e) => {
        if (!(e.target as HTMLDetailsElement).open) return;
        const json = JSON.stringify(config, null, 2);
        setTekst(json); setBasis(json); setMelding([]);
      }}>
        <summary>Gevorderd: de les als tekst (JSON)</summary>
        <textarea className="textarea" rows={16} spellCheck={false} value={tekst} onChange={(e) => setTekst(e.target.value)} aria-label="De les als JSON" />
        <div className="b-rij">
          <button type="button" className="btn btn-primary" onClick={() => {
            // Niets stil overschrijven: is de les intussen in de velden hierboven aangepast, dan eerst opnieuw openen.
            if (JSON.stringify(config, null, 2) !== basis) {
              setMelding(['De les is intussen aangepast in de velden hierboven. Sluit en open deze tekst opnieuw, dan werk je verder op de nieuwste versie.']);
              return;
            }
            try {
              const nieuw = JSON.parse(tekst) as BordlesConfig;
              const f = valideerBordles(nieuw);
              setMelding(f.map((x) => `${x.pad}: ${x.melding}`));
              if (f.length === 0) { onChange(nieuw); setBasis(JSON.stringify(nieuw, null, 2)); }
            } catch {
              setMelding(['Dit is geen geldige JSON. Kijk de haakjes en aanhalingstekens na.']);
            }
          }}>Toepassen</button>
        </div>
        {melding.length > 0 && <ul className="b-fouten">{melding.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}</ul>}
      </details>
    </div>
  );
}
