// De les van het schaduwtheater (einde 4de leerjaar), LK-6: de keuze tussen de oefeningen en de check, per oefening een
// paneel naast de 3D-kijkdoos, de klasvraag en de presentertoetsen op het bord, 'Wat ik al kan', voorlezen en prikkelarm.
//
// Dun: tikken en toetsen worden acties van de lesmachine (src/lib/basis/lichtkamer/les), en de toestand van de lesmachine
// gaat naar de kijkdoos (doos.toon). Het onderdeel heeft geen eigen main of h1: dat doet het scherm (LK-8), dat ook
// html[data-bord] zet voor het bord. Geen naam, geen naamkeuze en geen opslag: het bewijs gaat naar `bewijs` (null op het
// bord en bij uitproberen; op het kindscherm de geheugenontvanger van useKindBewijs, met een spiegel in de sessionStorage).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Eye, Layers, ListChecks, Moon, Ruler, Volume2 } from 'lucide-react';
import {
  AANTAL_RONDES,
  KLASVRAAG_GESLOTEN,
  LEGE_STAND,
  OEFENING_VOLGORDE,
  beginCheckLesUitStand,
  beginKaartjesLes,
  beginOnderzoekLes,
  beginVoorspel,
  checkBewijzen,
  checkReducer,
  eersteTeltVoor,
  focusSoort,
  huidigeVraag,
  isKlaar,
  kaartjesBewijs,
  kaartjesReducer,
  kaartjesScene,
  kaartjesTerugkoppeling,
  klasvraagActiesBij,
  klasvraagReducer,
  klasvraagVoor,
  naastOefening,
  nieuweMeldingen,
  onderzoekBewijzen,
  onderzoekReducer,
  onderzoekScene,
  oefeningTekst,
  presenterActie,
  schuinGevonden,
  sluitNaMs,
  uitkomstBij,
  uitkomstVan,
  voegBewijsToe,
  voorspelBewijs,
  voorspelReducer,
  voorspelScene,
  type BewijsMelding,
  type BewijsOntvanger,
  type BewijsStand,
  type VoorspelActie,
} from '../../../lib/basis/lichtkamer/les';
import { OEFENING_TITEL, type LesOefening } from '../../../lib/basis/lichtkamer/lesmateriaal';
import { BackIcon, CheckIcon, RetryIcon } from '../../icons';
import type { Kijkdoos, KijkdoosStatus, SceneToestand, Zicht } from '../kijkdoos';
import { CheckPaneel } from './CheckPaneel';
import { KaartjesPaneel } from './KaartjesPaneel';
import { Kijkvak } from './Kijkvak';
import { KlasvraagDialoog, KlasvraagKnop } from './Klasvraag';
import { Terugkoppeling } from './LesOnderdelen';
import { OnderzoekPaneel } from './OnderzoekPaneel';
import { useVoorlezen } from './useVoorlezen';
import { VoorspelPaneel } from './VoorspelPaneel';
import { WatIkKan } from './WatIkKan';

export type LesStand = 'kind' | 'bord' | 'uitproberen';
export type LesScherm = 'keuze' | LesOefening | 'check' | 'kan';

export interface LichtkamerLesProps {
  /** 'kind': de eigen Chromebook. 'bord': het digibord (klasvraag, uitkomst, presentertoetsen). 'uitproberen': de leerkracht op de laptop. */
  stand: LesStand;
  /** Waar het bewijs heen gaat; null op het bord en bij uitproberen. */
  bewijs: BewijsOntvanger | null;
  /** Waarmee het onderdeel opent (voor de ontwikkelpagina en de tests). Standaard het bord: de eerste oefening; anders de keuze. */
  beginScherm?: LesScherm;
}

const VOORWERP = 'boom' as const;
const ZICHTEN: readonly { zicht: Zicht; naam: string }[] = [
  { zicht: 'voor', naam: 'Van voor' },
  { zicht: 'schuin', naam: 'Schuin' },
  { zicht: 'opzij', naam: 'Van opzij' },
  { zicht: 'boven', naam: 'Van boven' },
];
const TEGELS = [
  { scherm: 'drie-kaartjes', Icoon: Layers, hint: 'Verzet de gaatjes' },
  { scherm: 'onderzoek-schaduw', Icoon: Ruler, hint: 'Meet de schaduw' },
  { scherm: 'waar-valt-de-schaduw', Icoon: Eye, hint: 'Voorspel de schaduw' },
  { scherm: 'check', Icoon: ListChecks, hint: 'Drie vragen' },
] as const;

const isOefening = (s: LesScherm): s is LesOefening => (OEFENING_VOLGORDE as readonly string[]).includes(s);

export function LichtkamerLes({ stand, bewijs, beginScherm }: LichtkamerLesProps) {
  const bord = stand === 'bord';
  const [scherm, setScherm] = useState<LesScherm>(beginScherm ?? (bord ? 'waar-valt-de-schaduw' : 'keuze'));
  const [voorspel, dVoorspel] = useReducer(voorspelReducer, VOORWERP, beginVoorspel);
  const [kaartjes, dKaartjes] = useReducer(kaartjesReducer, undefined, beginKaartjesLes);
  const [onderzoek, dOnderzoek] = useReducer(onderzoekReducer, VOORWERP, beginOnderzoekLes);
  const [check, dCheck] = useReducer(checkReducer, bewijs, (b) => beginCheckLesUitStand(b?.stand?.() ?? LEGE_STAND));
  const [vraag, dVraag] = useReducer(klasvraagReducer, KLASVRAAG_GESLOTEN);
  const [prikkelarm, setPrikkelarm] = useState(false);
  const [stralen, setStralen] = useState(false);
  const [status, setStatus] = useState<KijkdoosStatus>('laden');
  const [beschrijving, setBeschrijving] = useState('');
  const doosRef = useRef<Kijkdoos | null>(null);
  const kopRef = useRef<HTMLHeadingElement>(null);
  const vraagKnop = useRef<HTMLButtonElement>(null);
  const focusTerug = useRef(false);

  // ── Bewijs: wat de oefeningen opleveren gaat naar de ontvanger, en 'Wat ik al kan' leest hetzelfde.
  const [bewijsStand, setBewijsStand] = useState<BewijsStand>(() => bewijs?.stand?.() ?? LEGE_STAND);
  const verzonden = useRef<ReadonlyMap<string, string>>(new Map());
  const eersteTelt = useMemo(() => eersteTeltVoor(), []);
  const meldingen = useMemo<BewijsMelding[]>(() => {
    const lijst: (BewijsMelding | null)[] = [voorspelBewijs(voorspel), kaartjesBewijs(kaartjes), ...onderzoekBewijzen(onderzoek), ...checkBewijzen(check)];
    return lijst.filter((m): m is BewijsMelding => m !== null);
  }, [voorspel, kaartjes, onderzoek, check]);
  useEffect(() => {
    const { nieuw, verzonden: volgende } = nieuweMeldingen(verzonden.current, meldingen);
    verzonden.current = volgende;
    if (nieuw.length === 0) return;
    setBewijsStand((s) => nieuw.reduce((a, m) => voegBewijsToe(a, m, eersteTelt(m.id)), s));
    for (const m of nieuw) bewijs?.geef(m);
  }, [meldingen, bewijs, eersteTelt]);

  // ── Wat in beeld is, en wat de voorleesstem erover zegt.
  const oefening = isOefening(scherm) ? scherm : null;
  const tekst = oefening ? oefeningTekst(oefening, VOORWERP, bord) : null;
  const spreekTekst = useMemo(() => {
    switch (scherm) {
      case 'waar-valt-de-schaduw': {
        const u = uitkomstVan(voorspel);
        return u ? `${u.titel} ${u.uitleg}` : `Ronde ${voorspel.ronde + 1} van ${AANTAL_RONDES}. ${oefeningTekst(scherm, VOORWERP, bord).zeg}`;
      }
      case 'drie-kaartjes': {
        const fb = kaartjesTerugkoppeling(kaartjes);
        return fb ? `${fb.titel} ${fb.uitleg}` : oefeningTekst(scherm, VOORWERP, bord).zeg;
      }
      case 'onderzoek-schaduw':
        return onderzoek.uitkomst ? `${onderzoek.uitkomst.titel} ${onderzoek.uitkomst.uitleg}` : oefeningTekst(scherm, VOORWERP, bord).zeg;
      case 'check': {
        const u = uitkomstBij(check, check.vraag);
        return u ? u.spreek : (huidigeVraag(check)?.vraag ?? 'Klaar met de check.');
      }
      case 'kan':
        return 'Wat ik al kan.';
      default:
        return 'Kies een oefening.';
    }
  }, [scherm, voorspel, kaartjes, onderzoek, check, bord]);
  const voorlezen = useVoorlezen(prikkelarm, spreekTekst);
  const { leesVoor } = voorlezen;
  // Niet opnieuw beginnen met de openingszin als het scherm gelijk bleef (na een nakijken wist een wijziging de terugkoppeling).
  const vorigeLezing = useRef<LesScherm | null>(null);
  useEffect(() => {
    const opening = isOefening(scherm) ? oefeningTekst(scherm, VOORWERP, bord).zeg : null;
    const zelfdeScherm = vorigeLezing.current === scherm;
    vorigeLezing.current = scherm;
    if (zelfdeScherm && opening !== null && spreekTekst === opening) return;
    leesVoor(spreekTekst);
  }, [scherm, spreekTekst, bord, leesVoor]);

  const scene = useMemo<SceneToestand>(() => {
    if (scherm === 'drie-kaartjes') return kaartjesScene(kaartjes);
    if (scherm === 'onderzoek-schaduw') return onderzoekScene(onderzoek);
    return voorspelScene(voorspel);
  }, [scherm, voorspel, kaartjes, onderzoek]);

  // ── Navigatie: de focus gaat naar de kop van het nieuwe scherm.
  const eerderScherm = useRef(scherm);
  const sluitVraag = useCallback((metFocus: boolean) => {
    focusTerug.current = metFocus;
    dVraag({ type: 'sluit' });
  }, []);
  // Op het bord loopt de klasvraag mee met het paneel van 'Waar valt de schaduw?' zolang ze openstaat.
  const vraagOpen = useRef(false);
  vraagOpen.current = vraag.open;
  const dVoorspelMetVraag = useCallback((a: VoorspelActie) => {
    dVoorspel(a);
    for (const k of klasvraagActiesBij(a, vraagOpen.current)) dVraag(k);
  }, []);
  const gaNaar = useCallback(
    (s: LesScherm) => {
      setScherm(s);
      sluitVraag(false);
    },
    [sluitVraag],
  );
  useEffect(() => {
    if (eerderScherm.current !== scherm) kopRef.current?.focus();
    eerderScherm.current = scherm;
  }, [scherm]);
  useEffect(() => {
    if (!vraag.open && focusTerug.current) {
      focusTerug.current = false;
      vraagKnop.current?.focus();
    }
  }, [vraag.open]);

  // ── De klasvraag (alleen op het bord): sluit vanzelf na 4,5 s, behalve in de prikkelarme stand.
  const kv = bord && oefening ? klasvraagVoor(oefening, { voorwerp: VOORWERP, ronde: voorspel.ronde, aantalRondes: AANTAL_RONDES, kaartjes: kaartjes.stand }) : null;
  useEffect(() => {
    if (!vraag.open || !vraag.getoond) return;
    const ms = sluitNaMs(prikkelarm);
    if (ms === null) return;
    const id = window.setTimeout(() => sluitVraag(true), ms);
    return () => window.clearTimeout(id);
  }, [vraag.open, vraag.getoond, prikkelarm, sluitVraag]);
  useEffect(() => {
    if (!kv && vraag.open) sluitVraag(false);
  }, [kv, vraag.open, sluitVraag]);

  // ── Presentertoetsen en Escape (op het bord).
  const laatste = useRef({ stand, oefening, voorspel, vraag, gaNaar, sluitVraag });
  laatste.current = { stand, oefening, voorspel, vraag, gaNaar, sluitVraag };
  useEffect(() => {
    if (!bord) return;
    const onKey = (e: KeyboardEvent) => {
      const n = laatste.current;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && n.vraag.open) {
        e.preventDefault();
        n.sluitVraag(true);
        return;
      }
      const el = e.target instanceof HTMLElement ? e.target : null;
      const soort = focusSoort(el?.tagName, el?.getAttribute('role'), !!el?.isContentEditable);
      if (e.repeat && soort !== 'invoer' && (e.key === 'PageDown' || e.key === 'PageUp')) {
        // Een ingedrukt gehouden toets bladert niet door alle oefeningen.
        e.preventDefault();
        return;
      }
      const actie = presenterActie(e.key, soort, { stand: n.stand, oefening: n.oefening, uitkomstGetoond: n.voorspel.getoond });
      if (!actie) return;
      e.preventDefault();
      if (actie.type === 'toon-uitkomst') {
        dVoorspel({ type: 'toon' });
        if (n.vraag.open) dVraag({ type: 'toon' });
      } else n.gaNaar(naastOefening(n.oefening, actie.type === 'volgende-oefening' ? 'volgende' : 'vorige'));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bord]);

  // ── De knoppen onder de kijkdoos.
  const zetZicht = (z: Zicht) => doosRef.current?.zetZicht(z);

  const klaarMet: Record<string, boolean> = {
    'waar-valt-de-schaduw': voorspelBewijs(voorspel) !== null,
    'drie-kaartjes': schuinGevonden(kaartjes),
    'onderzoek-schaduw': onderzoek.bewijzen['4-besluit']?.juist === true,
    check: check.eerste.every((e) => e !== null) || ['4c1', '4c2', '4c3'].every((id) => bewijsStand[id] !== undefined),
  };
  const heeftBewijs = Object.keys(bewijsStand).length > 0;
  const zonder3d = status === 'geen3d';

  const terug = bord ? null : (
    <button type="button" className="b-knop b-lk-terug" onClick={() => gaNaar('keuze')}>
      <BackIcon size={18} aria-hidden="true" />
      Terug naar de oefeningen
    </button>
  );

  return (
    <div className="b-lk-les" data-stand={stand} data-prikkelarm={prikkelarm ? '' : undefined}>
      <div className="b-lk-gereedschap" role="group" aria-label="Hulp bij het kijken en luisteren">
        {voorlezen.beschikbaar ? (
          <>
            <button type="button" className="b-knop" aria-pressed={voorlezen.aan} onClick={() => voorlezen.zetAan(!voorlezen.aan)}>
              <Volume2 size={18} aria-hidden="true" />
              Voorlezen
            </button>
            <button type="button" className="b-knop" onClick={() => voorlezen.hoorNogEens(spreekTekst)}>
              <RetryIcon size={18} aria-hidden="true" />
              Hoor het nog eens
            </button>
          </>
        ) : null}
        <button type="button" className="b-knop" aria-pressed={prikkelarm} onClick={() => setPrikkelarm(!prikkelarm)}>
          <Moon size={18} aria-hidden="true" />
          Prikkelarm
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {beschrijving}
      </p>

      {bord ? (
        <nav aria-label="Oefeningen" className="b-lk-nav">
          <ul>
            {OEFENING_VOLGORDE.map((o) => (
              <li key={o}>
                <button type="button" className="b-knop b-lk-groot" aria-current={scherm === o ? 'true' : undefined} onClick={() => gaNaar(o)}>
                  {OEFENING_TITEL[o]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {scherm === 'keuze' ? (
        <section className="b-lk-keuze-scherm">
          <h2 ref={kopRef} tabIndex={-1}>
            Kies een oefening
          </h2>
          <ul className="b-lk-tegels">
            {TEGELS.map(({ scherm: s, Icoon, hint }) => (
              <li key={s}>
                <button type="button" className="b-lk-tegel" onClick={() => gaNaar(s)}>
                  <Icoon size={36} aria-hidden="true" />
                  <span className="b-lk-tegel-tekst">
                    <span className="b-lk-tegel-naam">{s === 'check' ? 'De check' : OEFENING_TITEL[s]}</span>
                    <span className="b-lk-tegel-hint">{hint}</span>
                  </span>
                  {klaarMet[s] ? (
                    <span className="b-lk-gedaan">
                      <CheckIcon size={18} aria-hidden="true" />
                      gedaan
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {heeftBewijs ? <WatIkKan stand={bewijsStand} kop={false} /> : null}
        </section>
      ) : null}

      {oefening && tekst ? (
        <div className="b-lk-oefen">
          {terug}
          <div className="b-lk-links">
            <div className="b-lk-doos">
              <Kijkvak
                doosRef={doosRef}
                scene={scene}
                bord={bord}
                voorwerp={VOORWERP}
                stralen={stralen}
                prikkelarm={prikkelarm}
                opWijziging={(t) => {
                  if (t.scene === 'kaartjes') dKaartjes({ type: 'zet', stand: t.stand });
                  else if (t.scene === 'onderzoek') dOnderzoek({ type: 'afstand', cm: t.afstandCm });
                }}
                opBeschrijving={(t) => setBeschrijving((v) => (v === t ? v : t))}
                opStatus={setStatus}
              />
              {kv && vraag.open ? (
                <KlasvraagDialoog
                  key={voorspel.ronde}
                  vraag={kv}
                  toestand={vraag}
                  dispatch={dVraag}
                  sluit={() => sluitVraag(true)}
                  toonUitkomst={() => {
                    dVraag({ type: 'toon' });
                    if (oefening === 'waar-valt-de-schaduw') dVoorspel({ type: 'toon' });
                  }}
                  volgende={() => {
                    dVoorspel({ type: 'volgende' });
                    dVraag({ type: 'volgende' });
                  }}
                />
              ) : null}
              <div className="b-lk-balk">
                <div className="b-lk-balk-groep" role="group" aria-label="Kijken">
                  {ZICHTEN.map((z) => (
                    <button key={z.zicht} type="button" className="b-lk-knop" onClick={() => zetZicht(z.zicht)}>
                      {z.naam}
                    </button>
                  ))}
                </div>
                {oefening === 'drie-kaartjes' ? (
                  <div className="b-lk-balk-groep" role="group" aria-label="Zaklamp">
                    <button type="button" className="b-lk-knop" onClick={() => dKaartjes({ type: 'lamp', d: 1 })}>
                      Lamp hoger
                    </button>
                    <button type="button" className="b-lk-knop" onClick={() => dKaartjes({ type: 'lamp', d: -1 })}>
                      Lamp lager
                    </button>
                  </div>
                ) : null}
                {oefening === 'onderzoek-schaduw' ? (
                  <div className="b-lk-balk-groep" role="group" aria-label="Zaklamp">
                    <button type="button" className="b-lk-knop" onClick={() => dOnderzoek({ type: 'stap', richting: 'dichter' })}>
                      Lamp dichterbij
                    </button>
                    <button type="button" className="b-lk-knop" onClick={() => dOnderzoek({ type: 'stap', richting: 'verder' })}>
                      Lamp verder weg
                    </button>
                  </div>
                ) : null}
                {oefening !== 'waar-valt-de-schaduw' ? (
                  <div className="b-lk-balk-groep" role="group" aria-label="Licht">
                    <button type="button" className="b-lk-knop" aria-pressed={stralen} onClick={() => setStralen(!stralen)}>
                      Lichtstralen tonen
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="b-lk-rechts">
            <h2 ref={kopRef} tabIndex={-1}>
              {tekst.titel}
            </h2>
            <p className="b-lk-hint">{tekst.hint}</p>
            <ol className="b-lk-stappen">
              {tekst.stappen.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {kv ? (
              <div className="b-lk-acties">
                <KlasvraagKnop open={vraag.open} knopRef={vraagKnop} onClick={() => dVraag({ type: 'open', aantal: kv.opties.length })} />
              </div>
            ) : null}
            {zonder3d ? (
              <div className="b-lk-paneel">
                <Terugkoppeling
                  soort="info"
                  titel="Deze oefening heeft de kijkdoos nodig."
                  uitleg={bord ? 'Werk met de echte zaklamp, het boompje en de meetlat.' : 'De check en Wat ik al kan werken wel. Werk anders met de echte zaklamp, het boompje en de meetlat.'}
                />
                {bord ? null : (
                  <div className="b-lk-acties">
                    <button type="button" className="b-knop b-lk-hoofd b-lk-groot" onClick={() => gaNaar('check')}>
                      Naar de check
                    </button>
                    <button type="button" className="b-knop b-lk-groot" onClick={() => gaNaar('kan')}>
                      Wat ik al kan
                    </button>
                  </div>
                )}
              </div>
            ) : oefening === 'waar-valt-de-schaduw' ? (
              <VoorspelPaneel t={voorspel} dispatch={bord ? dVoorspelMetVraag : dVoorspel} bord={bord} />
            ) : oefening === 'drie-kaartjes' ? (
              <KaartjesPaneel t={kaartjes} dispatch={dKaartjes} />
            ) : (
              <OnderzoekPaneel t={onderzoek} dispatch={dOnderzoek} />
            )}
          </div>
        </div>
      ) : null}

      {scherm === 'check' ? (
        <section className="b-lk-check">
          {terug}
          <h2 ref={kopRef} tabIndex={-1}>
            De check
          </h2>
          <p className="b-lk-uitleg">Drie vragen. Je eerste antwoord telt.</p>
          <CheckPaneel t={check} dispatch={dCheck} naarWatIkKan={() => gaNaar('kan')} />
        </section>
      ) : null}

      {scherm === 'kan' ? (
        <div className="b-lk-kan-scherm">
          {terug}
          <WatIkKan stand={bewijsStand} kopRef={kopRef} />
          <div className="b-lk-acties">
            <button type="button" className="b-knop b-lk-groot" onClick={() => gaNaar('keuze')}>
              Kies een oefening
            </button>
            {isKlaar(check) ? (
              <button
                type="button"
                className="b-knop b-lk-groot"
                onClick={() => {
                  dCheck({ type: 'opnieuw' });
                  gaNaar('check');
                }}
              >
                Probeer de check nog eens
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
