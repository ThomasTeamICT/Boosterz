// De schil van het deel basisonderwijs (#/basis): een eigen kop met lamptegel, de navigatie "Mijn leerjaar", "Doelen",
// "Leerlijnen", "Zoeken" en "GO!", de themawissel, "Naar Boosterz", precies één main en een voet met de bronvermelding uit de
// index. Het gebruikt geen leerkrachtschil (Layout). De vormgeving staat in src/styles/basis.css.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lamp, Moon, Sun, SunMoon } from 'lucide-react';
import { BackIcon } from '../icons';
import { cycleTheme, type ThemeMode } from '../../lib/theme';
import { getPrefs } from '../../lib/storage';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { WERKT_NAAR, type Eindmoment, type SoortBasis } from '../../lib/basis/kalender';
import { basisPad, type BasisScherm } from '../../lib/basis/basisRoutes';
import { GO_NAAMSVERMELDING } from '../../lib/basis/go/types';
import { laatstOpgehaald, useBasisIndex } from './useBasisSets';

const THEMA_LABEL: Record<ThemeMode, string> = { auto: 'automatisch', light: 'licht', dark: 'donker' };
const THEMA_ICOON = { auto: SunMoon, light: Sun, dark: Moon } as const;

type NavSleutel = 'leerjaar' | 'doelen' | 'leerlijnen' | 'go' | 'zoeken';

/** In welk deel van de navigatie een scherm hoort. */
function navVan(s: BasisScherm): NavSleutel | undefined {
  switch (s.s) {
    case 'start':
    case 'kies':
    case 'leerjaar':
      return 'leerjaar';
    case 'moment':
    case 'vak':
    case 'doel':
      return 'doelen';
    case 'leerlijnen':
    case 'leerlijn':
      return 'leerlijnen';
    case 'go':
    case 'lesplannen':
    case 'lesplan':
    case 'lessenlijn':
    case 'leerplandoelen':
    case 'leerplandoel':
      return 'go';
    case 'zoek':
      return 'zoeken';
    case 'onbekend':
      return undefined;
  }
}

/** De soort die het scherm al heeft; anders gewoon onderwijs. De bewaarde keuze komt in de schermen zelf. */
function soortVan(s: BasisScherm): SoortBasis {
  return 'soort' in s ? s.soort : 'bao';
}

/** Het eindmoment dat bij het scherm past; anders het einde van het 4de leerjaar. */
function eindVan(s: BasisScherm): Eindmoment {
  if (s.s === 'moment' || s.s === 'vak') return s.eind;
  if (s.s === 'leerjaar') return WERKT_NAAR[s.leerjaar];
  return 'L4';
}

export function BasisSchil({ scherm, children }: { scherm: BasisScherm; children: ReactNode }) {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const eerste = useRef(true);
  const [thema, setThema] = useState<ThemeMode>(() => getPrefs().theme);
  const index = useBasisIndex().stand;

  // Bij een schermwissel gaat de focus naar main (niet bij het eerste scherm: dat zou de focus stelen bij het openen).
  useEffect(() => {
    if (eerste.current) {
      eerste.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, [pathname]);

  const soort = soortVan(scherm);
  const actief = navVan(scherm);
  const items: { sleutel: NavSleutel; label: string; naar: string }[] = [
    { sleutel: 'leerjaar', label: 'Mijn leerjaar', naar: basisPad({ s: 'start' }) },
    { sleutel: 'doelen', label: 'Doelen', naar: basisPad({ s: 'moment', soort, eind: eindVan(scherm) }) },
    { sleutel: 'leerlijnen', label: 'Leerlijnen', naar: basisPad({ s: 'leerlijnen', soort }) },
    { sleutel: 'zoeken', label: 'Zoeken', naar: basisPad({ s: 'zoek', soort, vraag: '', bereik: 'alles' }) },
    { sleutel: 'go', label: 'GO!', naar: basisPad({ s: 'go' }) },
  ];
  const ThemaIcoon = THEMA_ICOON[thema];
  const opgehaald = index.status === 'klaar' ? laatstOpgehaald(index.waarde) : '';

  return (
    <div className="b-schil">
      {/* In een hash-router is "#main" een route, geen anker: zelf de focus verplaatsen (zoals in Layout). */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView?.();
        }}
      >
        Naar de inhoud
      </a>
      <header className="b-kop">
        <div className="b-kop-in">
          <Link to={basisPad({ s: 'start' })} className="b-merk" aria-label="Boosterz basisonderwijs, begin">
            <span className="b-lamptegel" aria-hidden="true"><Lamp size={22} /></span>
            <span>Boosterz</span>
            <span className="b-pil">basisonderwijs</span>
          </Link>
          <nav className="b-nav" aria-label="Basisonderwijs">
            <ul>
              {items.map((it) => (
                <li key={it.sleutel}>
                  <Link to={it.naar} aria-current={actief === it.sleutel ? 'page' : undefined}>{it.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="b-kop-acties">
            <button type="button" className="b-knop" onClick={() => setThema(cycleTheme())}>
              <ThemaIcoon size={18} aria-hidden="true" />
              <span className="b-knop-tekst">Thema: {THEMA_LABEL[thema]}</span>
            </button>
            <Link to="/" className="b-knop">
              <BackIcon size={18} aria-hidden="true" />
              <span className="b-knop-tekst">Naar Boosterz</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="b-main">
        {children}
      </main>
      <footer className="b-voet">
        <div className="b-voet-in">
          <p>
            {index.status === 'klaar'
              ? <>{index.waarde.naamsvermelding}{opgehaald && <> · opgehaald op {datumLeesbaar(opgehaald)}</>}</>
              : 'Bron: Onderwijsdoelen, Vlaamse overheid'}
          </p>
          {actief === 'go' && (
            <p className="b-voet-go">
              Leerplandoelen en lesplannen: {GO_NAAMSVERMELDING}. Letterlijk overgenomen met toestemming.
            </p>
          )}
          <p>
            <Link to="/privacy">Privacy en opslag</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
