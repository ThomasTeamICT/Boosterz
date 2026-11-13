// Het deel basisonderwijs (#/basis/...): de enige luie route die App.tsx kent ('/basis/*').
//
// Het deel heeft zijn eigen padlezer (src/lib/basis/basisRoutes.ts) en dus geen <Routes>/<Route>: dat kost op het
// leerlingpad +1,5 kB (gemeten). Het gebruikt alleen useParams, useLocation en Link van react-router.
// Het zet html[data-deel='basis'] (de tokens van basis.css staan op html, zodat portals meekleuren) en haalt dat weg
// bij het verlaten.

import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BasisSchil } from '../../components/basis/BasisSchil';
import { basisPad, basisRoute, type BasisScherm } from '../../lib/basis/basisRoutes';
import { PAKKETTEN } from '../../lib/basis/pakketten';
import { schilVan } from '../../lib/basis/schil';
import { KiesScherm, StartScherm } from './StartScherm';
import { LeerjaarScherm } from './LeerjaarScherm';
import { MomentScherm } from './MomentScherm';
import { VakScherm } from './VakScherm';
import { DoelScherm } from './DoelScherm';
import { LaadBericht } from '../../components/curriculum/LaadStatus';
import '../../styles/basis.css';

// De leerlijn en het zoeken laden pas als de leerkracht erheen gaat: samen met de rest zou dit chunk boven de 80 kB komen.
const LeerlijnenScherm = lazy(() => import('./LeerlijnScherm').then((m) => ({ default: m.LeerlijnenScherm })));
const LeerlijnScherm = lazy(() => import('./LeerlijnScherm').then((m) => ({ default: m.LeerlijnScherm })));
const ZoekScherm = lazy(() => import('./ZoekScherm').then((m) => ({ default: m.ZoekScherm })));
const LesplanScherm = lazy(() => import('./LesplanScherm').then((m) => ({ default: m.LesplanScherm })));
// Eén onderdeel van het aanbod op het bord; de bordles-speler laadt daarin nog eens apart (eigen chunk, zoals in de registry).
const AanbodScherm = lazy(() => import('./AanbodScherm').then((m) => ({ default: m.AanbodScherm })));
const LesplannenScherm = lazy(() => import('./LesplannenScherm').then((m) => ({ default: m.LesplannenScherm })));
const LessenlijnScherm = lazy(() => import('./LessenlijnScherm').then((m) => ({ default: m.LessenlijnScherm })));
const GoScherm = lazy(() => import('./GoScherm').then((m) => ({ default: m.GoScherm })));
const LeerplandoelScherm = lazy(() => import('./LeerplandoelScherm').then((m) => ({ default: m.LeerplandoelScherm })));
const LeerplandoelenScherm = lazy(() => import('./LeerplandoelenScherm').then((m) => ({ default: m.LeerplandoelenScherm })));
// De drie schermen van de Lichtkamer (LK-8). De lespagina gaat in de gewone schil; het kind- en het bordscherm dragen hun
// eigen kale schil (KindSchil, BordSchil) en laden die in hetzelfde chunk, zodat er één bestand te halen is. three laadt pas
// in de kijkdoos zelf, en op de lespagina pas na 'Uitproberen'.
const LichtkamerPakketScherm = lazy(() => import('./LichtkamerPakketScherm').then((m) => ({ default: m.LichtkamerPakketScherm })));
const LichtkamerBordScherm = lazy(() => import('./LichtkamerBordScherm').then((m) => ({ default: m.LichtkamerBordScherm })));
const LichtkamerKindScherm = lazy(() => import('./LichtkamerKindScherm').then((m) => ({ default: m.LichtkamerKindScherm })));

/** Tijdens het laden van zo'n scherm staat er al precies één h1. */
function Wacht({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div>
          <h1>{titel}</h1>
          <LaadBericht tekst="Het scherm wordt geladen" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Tijdens het laden van een kaal scherm (kind, bord) staat er al één main met één h1. */
function KaleWacht({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="b-schil">
          <main id="main" className="b-main">
            <h1>{titel}</h1>
            <LaadBericht tekst="Het scherm wordt geladen" />
          </main>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function OnbekendeBasisPagina() {
  return (
    <section className="b-plaats">
      <h1>Deze pagina bestaat niet in het deel basisonderwijs</h1>
      <p>Het adres klopt niet of de pagina is verplaatst.</p>
      <ul className="b-plaats-links">
        <li><Link to={basisPad({ s: 'start' })}>Mijn leerjaar</Link></li>
        <li><Link to={basisPad({ s: 'zoek', soort: 'bao', vraag: '', bereik: 'alles' })}>Zoeken</Link></li>
      </ul>
    </section>
  );
}

function kies(s: BasisScherm): ReactNode {
  switch (s.s) {
    case 'start':
      return <StartScherm />;
    case 'kies':
      return <KiesScherm />;
    case 'leerjaar':
      return <LeerjaarScherm soort={s.soort} leerjaar={s.leerjaar} />;
    case 'moment':
      return <MomentScherm soort={s.soort} eind={s.eind} />;
    case 'vak':
      return <VakScherm soort={s.soort} eind={s.eind} vak={s.vak} leerjaar={s.leerjaar} onderwerp={s.onderwerp} />;
    case 'leerlijnen':
      return (
        <Wacht titel="Leerlijnen">
          <LeerlijnenScherm soort={s.soort} leerjaar={s.leerjaar} />
        </Wacht>
      );
    case 'leerlijn':
      return (
        <Wacht titel="Leerlijn">
          <LeerlijnScherm soort={s.soort} vak={s.vak} leerjaar={s.leerjaar} onderwerp={s.onderwerp} />
        </Wacht>
      );
    case 'doel':
      return <DoelScherm setId={s.setId} doelId={s.doelId} />;
    case 'zoek':
      return (
        <Wacht titel="Zoeken in de doelen">
          <ZoekScherm soort={s.soort} vraag={s.vraag} leerjaar={s.leerjaar} bereik={s.bereik} />
        </Wacht>
      );
    case 'lesplan':
      return (
        <Wacht titel={`Lesplan ${s.code}`}>
          <LesplanScherm code={s.code} stap={s.stap} />
        </Wacht>
      );
    case 'aanbod':
      return (
        <Wacht titel="Op het bord">
          <AanbodScherm code={s.code} onderdeel={s.onderdeel} />
        </Wacht>
      );
    case 'lesplannen':
      return (
        <Wacht titel="Lesplannen van het GO!">
          <LesplannenScherm leerjaar={s.leerjaar} alle={s.alle} vak={s.vak} />
        </Wacht>
      );
    case 'lessenlijn':
      return (
        <Wacht titel="Lessenlijn">
          <LessenlijnScherm vak={s.vak} lijn={s.lijn} />
        </Wacht>
      );
    case 'go':
      return (
        <Wacht titel="Leerplan en lesplannen van het GO!">
          <GoScherm />
        </Wacht>
      );
    case 'leerplandoelen':
      return (
        <Wacht titel="Leerplan van het GO!">
          <LeerplandoelenScherm vak={s.vak} leerjaar={s.leerjaar} alle={s.alle} rubriek={s.rubriek} zonder={s.zonder} />
        </Wacht>
      );
    case 'leerplandoel':
      return (
        <Wacht titel={`Leerplandoel ${s.code}`}>
          <LeerplandoelScherm code={s.code} />
        </Wacht>
      );
    case 'pakket':
      return (
        <Wacht titel={PAKKETTEN[s.pakket].titel}>
          <LichtkamerPakketScherm pakket={s.pakket} leerjaar={s.leerjaar} />
        </Wacht>
      );
    case 'bord':
      return (
        <KaleWacht titel={PAKKETTEN[s.pakket].titel}>
          <LichtkamerBordScherm pakket={s.pakket} scherm={s.scherm} />
        </KaleWacht>
      );
    case 'oefen':
      return (
        <KaleWacht titel={PAKKETTEN[s.pakket].titel}>
          <LichtkamerKindScherm pakket={s.pakket} scherm={s.scherm} />
        </KaleWacht>
      );
    case 'onbekend':
      return <OnbekendeBasisPagina />;
  }
}

export function BasisDeel() {
  const splat = useParams()['*'] ?? '';
  const { search } = useLocation();
  const scherm = basisRoute(splat, search);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.deel = 'basis';
    return () => {
      delete html.dataset.deel;
    };
  }, []);

  // Het kind en het bord hebben een kale schil: zonder de navigatie van de leerkracht en zonder 'Naar Boosterz'.
  if (schilVan(scherm) !== 'basis') return <>{kies(scherm)}</>;
  return <BasisSchil scherm={scherm}>{kies(scherm)}</BasisSchil>;
}
