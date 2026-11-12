// #/basis/pakket/lichtkamer/einde-4de: de lespagina voor de leerkracht (LK-8), in de gewone schil van het basisdeel.
// Delen, in de volgorde van de voorbereiding: Doel, Stand per leerjaar, Uitproberen, Lesverloop met de spiekkaart (afdrukken),
// Meetblad en Observatieblad (elk apart af te drukken), Op het bord en Voor de kinderen (kindlink en QR-code).
//
// De doelen staan er letterlijk uit de officiële set (laadSet) met de zin in kindertaal en 'zo zie je dat het lukt' uit het
// lesmateriaal (lesmateriaal.ts). Laadt de set of het GO!-bestand niet, dan staat er een melding met 'Opnieuw proberen' en
// blijft de rest van de pagina werken. 'Uitproberen' laadt de kijkdoos pas na de klik. Er is geen naam, geen opslag en geen
// window.__lkKijkdoos.
//
// Afdrukken: de knop zet html[data-druk]; de printstijl in basis-lichtkamer-schermen.css laat dan alleen het gekozen blad
// staan. De standaard (zonder knop, via Ctrl+P) is de hele pagina zonder kop en voet.

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spiekkaart } from '../../components/basis/lichtkamer/Spiekkaart';
import { MeetbladBlad, ObservatiebladBlad } from '../../components/basis/lichtkamer/Bladen';
import { useGoBijMinimumdoel } from '../../components/basis/useGo';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { useSetBestanden } from '../../components/curriculum/samenstellen/useSetBestanden';
import { CopyIcon, GoalIcon, InfoIcon, PreviewIcon, PrintIcon, TryIcon } from '../../components/icons';
import { basisPad, doelPad } from '../../lib/basis/basisRoutes';
import { MEETBLAD, OBSERVATIEBLAD, SPIEKKAART } from '../../lib/basis/lichtkamer/lesmateriaal';
import { LICHTKAMER_GO_VAK, maakLesmateriaalBronnen, vulSpiekkaartTolerant } from '../../lib/basis/lichtkamerBronnen';
import { PAKKETTEN, volledigAdres, type PakketNaam } from '../../lib/basis/pakketten';
import type { LeerjaarBasis } from '../../lib/basis/kalender';
import '../../styles/basis-lichtkamer.css';
import '../../styles/basis-lichtkamer-schermen.css';

// De kijkdoos en de oefeningen laden pas na 'Uitproberen'; de QR-code pas als de pagina er staat.
const LichtkamerLes = lazy(() => import('../../components/basis/lichtkamer/LichtkamerLes').then((m) => ({ default: m.LichtkamerLes })));
const CodeQr = lazy(() => import('../../components/CodeQr').then((m) => ({ default: m.CodeQr })));

const LEERJAAR_NAAM: Readonly<Partial<Record<LeerjaarBasis, string>>> = { L3: '3de leerjaar', L4: '4de leerjaar' };

/** De noot voor wie met een 3de leerjaar werkt (uit het prototype, lichtkamer.html r. 988). */
const NOOT_L3 =
  'Dan werk je naar deze doelen toe. Ze moeten bereikt zijn op het einde van het 4de leerjaar. De tussenstappen per leerjaar staan in het leerplan van je net.';

const GEEN_3D_UITLEG = 'Werkt de 3D niet op een toestel? Dan staat WebGL uit of blokkeert het schoolnetwerk een bestand. Vraag het de ICT-coördinator.';

type Blad = 'spiekkaart' | 'meetblad' | 'observatieblad';

/** Zet de printstand van de pagina en drukt af. De stand blijft staan tot 'afterprint' (of tot het scherm weggaat). */
function drukAf(blad: Blad): void {
  const html = document.documentElement;
  html.dataset.druk = blad;
  const weg = () => {
    delete html.dataset.druk;
    window.removeEventListener('afterprint', weg);
  };
  window.addEventListener('afterprint', weg);
  // Een blad achter een dichte uitklapper moet open staan, ook als 'beforeprint' te laat komt.
  const details = document.querySelector<HTMLDetailsElement>(`[data-blad='${blad}'] details`);
  if (details) details.open = true;
  window.print();
}

/** De sets van de doelen, één keer geladen voor de hele pagina: 'Opnieuw proberen' werkt zo voor Doel en Lesverloop tegelijk. */
type SetsHulp = ReturnType<typeof useSetBestanden>;

function Doelen({ pakket, sets: { stand, opnieuw } }: { pakket: PakketNaam; sets: SetsHulp }) {
  const p = PAKKETTEN[pakket];
  const sets = p.doelen.map((d) => ({ ...d, stand: stand(d.set) }));
  const fout = sets.find((s) => s.stand.status === 'fout');
  const laden = !fout && sets.some((s) => s.stand.status === 'laden');
  return (
    <section className="b-lkp-deel" aria-labelledby="lkp-doel">
      <h2 id="lkp-doel" className="b-lkp-scherm-kop">Doel</h2>
      <p className="b-lkp-uitleg">
        Drie minimumdoelen van wetenschap en techniek, einde 4de leerjaar. De tekst is letterlijk die van de officiële doelenset.
      </p>
      {fout?.stand.status === 'fout' && (
        <FoutBericht fout={`De doelen konden niet geladen worden. ${fout.stand.fout}`} onOpnieuw={() => opnieuw(fout.set)} naam="de doelen" />
      )}
      {laden && <LaadBericht tekst="De doelen worden geladen" />}
      <ul className="b-lkp-doelen">
        {p.doelen.map((d) => {
          const verwijzing = SPIEKKAART.doelen.find((x) => x.id === d.id && x.set === d.set);
          const s = stand(d.set);
          const md = s.status === 'klaar' ? maakLesmateriaalBronnen(s.bestand, undefined).minimumdoel(d.set, d.id) : undefined;
          return (
            <li key={d.id} className="b-lkp-doel">
              {md ? (
                <p className="b-lkp-doeltekst">
                  <span className="b-lkp-code">{md.code}</span> <q>{md.tekst}</q>
                </p>
              ) : (
                s.status === 'klaar' && <p className="b-lkp-doeltekst">Dit doel staat niet in de geladen set.</p>
              )}
              {verwijzing && (
                <>
                  <p>
                    <strong>In kindertaal:</strong> {verwijzing.kind}
                  </p>
                  <p>
                    <strong>Zo zie je dat het lukt:</strong> {verwijzing.zie}
                  </p>
                </>
              )}
              <p>
                <Link to={doelPad(d)} className="b-lkp-link">
                  <GoalIcon size={16} aria-hidden="true" /> Bekijk het doel
                  <span className="sr-only"> {md?.code ?? d.id}</span>
                </Link>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stand({ pakket, leerjaar }: { pakket: PakketNaam; leerjaar: LeerjaarBasis }) {
  const p = PAKKETTEN[pakket];
  return (
    <section className="b-lkp-deel" aria-labelledby="lkp-stand">
      <h2 id="lkp-stand" className="b-lkp-scherm-kop">Stand per leerjaar</h2>
      <p className="b-lkp-uitleg">Welk leerjaar geef je?</p>
      <ul className="b-lkp-keuze" aria-label="Leerjaar">
        {[...p.leerjaren].reverse().map((lj) => (
          <li key={lj}>
            <Link
              replace
              to={basisPad({ s: 'pakket', pakket, eind: p.eind, leerjaar: lj })}
              className="b-knop"
              aria-current={lj === leerjaar ? 'true' : undefined}
            >
              {LEERJAAR_NAAM[lj] ?? lj}
            </Link>
          </li>
        ))}
      </ul>
      <p className="b-lkp-noot" role="note">
        {leerjaar === 'L3' ? (
          <>
            <strong>Werk je met een 3de leerjaar?</strong> {NOOT_L3} De spiekkaart hieronder is voor een 3de leerjaar geschreven.
          </>
        ) : (
          <>
            <strong>Je klas werkt naar het einde van het 4de leerjaar:</strong> deze doelen gelden nu. De spiekkaart is voor een 3de
            leerjaar geschreven; het lesverloop en de oefeningen zijn dezelfde.
          </>
        )}
      </p>
    </section>
  );
}

function Uitproberen() {
  const [open, setOpen] = useState(false);
  return (
    <section className="b-lkp-deel" aria-labelledby="lkp-uitproberen">
      <h2 id="lkp-uitproberen" className="b-lkp-scherm-kop">Uitproberen</h2>
      <p className="b-lkp-uitleg">
        Doe de oefeningen zelf, zoals een kind ze doet. Er wordt niets bewaard.
      </p>
      <p>
        <button type="button" className="b-knop" aria-expanded={open} aria-controls="lkp-uitproberen-les" onClick={() => setOpen(!open)}>
          <TryIcon size={18} aria-hidden="true" /> {open ? 'Sluit het uitproberen' : 'Probeer de oefeningen uit'}
        </button>
      </p>
      <p className="b-lkp-hint">{GEEN_3D_UITLEG}</p>
      <div id="lkp-uitproberen-les">
        {open && (
          <Suspense fallback={<LaadBericht tekst="De oefeningen worden geladen" />}>
            <div className="b-lkp-proef">
              <LichtkamerLes stand="uitproberen" bewijs={null} />
            </div>
          </Suspense>
        )}
      </div>
    </section>
  );
}

function Lesverloop({ sets }: { sets: SetsHulp }) {
  const goBij = useGoBijMinimumdoel(LICHTKAMER_GO_VAK);
  const setIds = useMemo(() => [...new Set(SPIEKKAART.doelen.map((d) => d.set))], []);
  const set = sets.bestanden.get(setIds[0] ?? '');
  const bij = goBij.stand.status === 'klaar' ? goBij.stand.waarde : undefined;
  const { kaart, volledig } = useMemo(() => vulSpiekkaartTolerant(maakLesmateriaalBronnen(set, bij)), [set, bij]);
  const wacht = goBij.stand.status === 'laden' || setIds.some((id) => sets.stand(id).status === 'laden');
  const goFout = goBij.stand.status === 'fout' ? goBij.stand.fout : undefined;
  const setFout = setIds.map((id) => ({ id, stand: sets.stand(id) })).find((x) => x.stand.status === 'fout');
  return (
    <section className="b-lkp-deel" data-blad="spiekkaart" aria-labelledby="lkp-verloop">
      <h2 id="lkp-verloop" className="b-lkp-scherm-kop">Lesverloop met de spiekkaart</h2>
      <p className="b-lkp-uitleg b-lkp-scherm">
        Fasen, antwoorden, wat je zegt bij een fout en wat je doet als iets niet werkt. Eén blad A4, voor- en achterkant.
      </p>
      {setFout?.stand.status === 'fout' && (
        <FoutBericht fout={`De doelen konden niet geladen worden. ${setFout.stand.fout}`} onOpnieuw={() => sets.opnieuw(setFout.id)} naam="de doelen" />
      )}
      {goFout !== undefined && (
        <FoutBericht fout={`De leerplandoelen van het GO! konden niet geladen worden. ${goFout}`} onOpnieuw={goBij.opnieuw} naam="de leerplandoelen van het GO!" />
      )}
      {wacht && <LaadBericht tekst="De teksten van de doelen worden geladen" />}
      <p className="b-lkp-acties b-lkp-scherm">
        <button type="button" className="b-knop" disabled={!volledig} onClick={() => drukAf('spiekkaart')}>
          <PrintIcon size={18} aria-hidden="true" /> Afdrukken
          <span className="sr-only"> (de spiekkaart)</span>
        </button>
        {!volledig && wacht && <span className="b-lkp-hint">Afdrukken kan zodra de doelen geladen zijn.</span>}
      </p>
      <Spiekkaart kaart={kaart} />
    </section>
  );
}

function BladDeel({ blad, kop, uitleg, knop, children }: { blad: Exclude<Blad, 'spiekkaart'>; kop: string; uitleg: string; knop: string; children: ReactNode }) {
  const id = `lkp-${blad}`;
  return (
    <section className="b-lkp-deel" data-blad={blad} aria-labelledby={id}>
      <h2 id={id} className="b-lkp-scherm-kop">{kop}</h2>
      <p className="b-lkp-uitleg b-lkp-scherm">{uitleg}</p>
      <p className="b-lkp-acties b-lkp-scherm">
        <button type="button" className="b-knop" onClick={() => drukAf(blad)}>
          <PrintIcon size={18} aria-hidden="true" /> {knop}
        </button>
      </p>
      <details className="b-lkp-details">
        <summary>Bekijk het blad</summary>
        {children}
      </details>
    </section>
  );
}

function OpHetBord({ pakket }: { pakket: PakketNaam }) {
  const p = PAKKETTEN[pakket];
  return (
    <section className="b-lkp-deel" aria-labelledby="lkp-bord">
      <h2 id="lkp-bord" className="b-lkp-scherm-kop">Op het bord</h2>
      <p>
        <Link to={basisPad({ s: 'bord', pakket, eind: p.eind })} className="b-knop b-lk-groot b-lk-hoofd">
          <PreviewIcon size={20} aria-hidden="true" /> Open het bord
        </Link>
      </p>
      <p className="b-lkp-uitleg">Geen namen in beeld, er wordt niets bewaard. Het bord opent in dit tabblad.</p>
      <p className="b-lkp-uitleg">
        Met een presenter: <kbd>PageDown</kbd> opent de volgende oefening, <kbd>PageUp</kbd> de vorige en de <kbd>spatie</kbd> toont de
        uitkomst.
      </p>
    </section>
  );
}

function VoorDeKinderen({ pakket }: { pakket: PakketNaam }) {
  const p = PAKKETTEN[pakket];
  const adres = useMemo(
    () => volledigAdres(basisPad({ s: 'oefen', pakket, eind: p.eind }), typeof window === 'undefined' ? { origin: '', pathname: '' } : window.location),
    [pakket, p.eind],
  );
  const invoer = useRef<HTMLInputElement>(null);
  const [melding, setMelding] = useState('');
  // De melding verdwijnt na een tijdje; een nieuwe melding begint de tijd opnieuw.
  useEffect(() => {
    if (melding === '') return;
    const t = window.setTimeout(() => setMelding(''), 6000);
    return () => window.clearTimeout(t);
  }, [melding]);
  const meld = (tekst: string) => {
    // Dezelfde tekst twee keer na elkaar moet de teller opnieuw starten: eerst leegmaken.
    setMelding('');
    window.setTimeout(() => setMelding(tekst), 0);
  };
  // Eerst het klembord van de browser; lukt dat niet (geen toestemming, oude browser), dan selecteren we de tekst, zodat
  // Ctrl+C of "Kopieer" van het toestel volstaat.
  const kopieer = () => {
    const terugval = () => {
      const el = invoer.current;
      if (!el) return;
      el.focus();
      el.select();
      el.setSelectionRange(0, adres.length);
      let gelukt = false;
      try {
        gelukt = document.execCommand('copy');
      } catch {
        gelukt = false;
      }
      meld(gelukt ? 'Gekopieerd' : 'Kopiëren lukte niet. De link is geselecteerd: druk op Ctrl+C.');
    };
    try {
      const klem = navigator.clipboard;
      if (klem && typeof klem.writeText === 'function') {
        klem.writeText(adres).then(() => meld('Gekopieerd'), terugval);
        return;
      }
    } catch {
      // doorvallen naar de terugval
    }
    terugval();
  };

  return (
    <section className="b-lkp-deel" aria-labelledby="lkp-kinderen">
      <h2 id="lkp-kinderen" className="b-lkp-scherm-kop">Voor de kinderen</h2>
      <p className="b-lkp-uitleg">
        De link bevat geen namen en geen klascode. Je mag hem op het bord tonen of in Smartschool zetten.
      </p>
      <p>
        <label htmlFor="lkp-kindlink" className="b-lkp-label">Link voor de kinderen</label>
        <input id="lkp-kindlink" ref={invoer} className="b-lkp-link-invoer" readOnly value={adres} onFocus={(e) => e.currentTarget.select()} />
      </p>
      <p className="b-lkp-acties">
        <button type="button" className="b-knop" onClick={kopieer}>
          <CopyIcon size={18} aria-hidden="true" /> Link kopiëren
        </button>
        <span role="status" className="b-lkp-gekopieerd">{melding}</span>
      </p>
      <div className="b-lkp-qr">
        <Suspense fallback={<p className="b-lkp-hint" role="status">De QR-code wordt gemaakt.</p>}>
          <CodeQr
            value={adres}
            label="de link voor de kinderen"
            size={220}
            copy={false}
            hint="Klik op de QR-code om ze groot op het bord te tonen. De kinderen scannen ze met de camera van hun toestel."
            enlargeHint="Scan de code met de camera van je toestel."
          />
        </Suspense>
      </div>
      <p className="b-lkp-hint">
        <InfoIcon size={16} aria-hidden="true" /> {GEEN_3D_UITLEG}
      </p>
    </section>
  );
}

export function LichtkamerPakketScherm({ pakket, leerjaar }: { pakket: PakketNaam; leerjaar?: LeerjaarBasis }) {
  const p = PAKKETTEN[pakket];
  const lj = leerjaar ?? p.leerjaren[p.leerjaren.length - 1] ?? 'L4';
  const sets = useSetBestanden(useMemo(() => [...new Set([...p.doelen.map((d) => d.set), ...SPIEKKAART.doelen.map((d) => d.set)])], [p]));
  // Een eventuele printstand blijft nooit staan als je de pagina verlaat.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.druk;
    },
    [],
  );
  return (
    <div className="b-lkp">
      <div className="b-lkp-kop">
        <h1>{p.titel}</h1>
        <p className="b-lead">
          Een les van 50 minuten over licht en schaduw voor het 3de en 4de leerjaar (wetenschap en techniek): samen op het bord, daarna
          elk kind op de eigen Chromebook.
        </p>
      </div>
      <Doelen pakket={pakket} sets={sets} />
      <Stand pakket={pakket} leerjaar={lj} />
      <Uitproberen />
      <OpHetBord pakket={pakket} />
      <VoorDeKinderen pakket={pakket} />
      <Lesverloop sets={sets} />
      <BladDeel
        blad="meetblad"
        kop="Meetblad"
        uitleg="Voor plan B, of voor wie klaar is: meten met een echte zaklamp. Geen naam nodig."
        knop="Meetblad afdrukken"
      >
        <MeetbladBlad blad={MEETBLAD} />
      </BladDeel>
      <BladDeel
        blad="observatieblad"
        kop="Observatieblad"
        uitleg="Voor jou, tijdens en vlak na de les. Zonder namen van kinderen."
        knop="Observatieblad afdrukken"
      >
        <ObservatiebladBlad blad={OBSERVATIEBLAD} kaart={SPIEKKAART} />
      </BladDeel>
    </div>
  );
}
