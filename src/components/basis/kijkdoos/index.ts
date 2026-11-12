// De kijkdoos van het schaduwtheater (LK-5): de gevel die de schermen (LK-6, LK-8) aanroepen.
//
// Deze module is licht en importeert geen three: ze mag statisch in een scherm staan. De 3D-motor (kijkdoos3d.ts) en
// three laden pas bij openKijkdoos, elk in een eigen lui chunk. Gebruik:
//
//   const doos = openKijkdoos(vak, { toestand: { scene: 'voorspel', ronde: 0, getoond: false }, opWijziging, opStatus });
//   doos.toon({ scene: 'voorspel', ronde: 0, getoond: true });
//   ...
//   doos.sluit(); // bij het verlaten van het scherm: geeft alles vrij
//
// openKijkdoos geeft meteen een kijkdoos terug (status 'laden'), werpt nooit een fout en roept de functies uit de opties
// pas daarna aan. Lukt three of WebGL niet, dan
// wordt de status 'geen3d' en toont het vak een melding; de doelen en de check werken dan gewoon (zoals geen3D in het
// prototype). Valt de WebGL-context weg, dan wordt de status 'contextverlies' en verschijnt 'Tik om de kijkdoos opnieuw
// te laden'. Elke keer dat een scherm opent, komt er een nieuwe kijkdoos met een eigen toestand.

import { NAAM_VOORWERP, type Voorwerp } from '../../../lib/basis/lichtkamer';
import { meetGevraagd, type MeetVerslag } from '../../../lib/basis/lichtkamer/kijkdoos/meet';
import type { MaakMotor, Motor } from '../../../lib/basis/lichtkamer/kijkdoos/motor';
import { isSoftwareRenderer, standVoorRenderer, type Stand, type StandKeuze } from '../../../lib/basis/lichtkamer/kijkdoos/standen';
import { normaliseer, type SceneToestand, type Zicht } from '../../../lib/basis/lichtkamer/kijkdoos/toestand';

export type { SceneToestand, SceneNaam, Zicht } from '../../../lib/basis/lichtkamer/kijkdoos/toestand';
export type { Stand, StandKeuze } from '../../../lib/basis/lichtkamer/kijkdoos/standen';
export type { MeetVerslag } from '../../../lib/basis/lichtkamer/kijkdoos/meet';

export type KijkdoosStatus = 'laden' | 'klaar' | 'geen3d' | 'contextverlies' | 'gesloten';

export type KijkdoosOpties = {
  toestand: SceneToestand;
  /** Standaard 'auto': 'hoog' op het bord, anders 'midden', en 'laag' op een toestel zonder grafische kaart of als het traag is. */
  stand?: StandKeuze;
  /** Op het digibord ('auto' kiest dan 'hoog'). */
  bord?: boolean;
  voorwerp?: Voorwerp;
  /** Lichtstralen in de kaartjes en het onderzoek. In 'Waar valt de schaduw?' horen de stralen bij `getoond`. */
  stralen?: boolean;
  prikkelarm?: boolean;
  /** De meetstand; standaard aan als `meet` in de zoekopdracht van het adres staat (?meet). */
  meet?: boolean;
  /** Het kind veranderde iets in de kijkdoos zelf (de lamp gesleept, een pijltje op de kijkdoos). */
  opWijziging?: (t: SceneToestand) => void;
  /** Een zin voor wie het beeld niet ziet. Zonder deze functie houdt de kijkdoos zelf een verborgen live-regio bij. */
  opBeschrijving?: (tekst: string) => void;
  opStatus?: (s: KijkdoosStatus) => void;
};

export interface Kijkdoos {
  readonly status: KijkdoosStatus;
  /** De stand waarin de kijkdoos nu tekent (null zolang er geen 3D is). */
  readonly stand: Stand | null;
  /** Wat de kijkdoos nu toont (ook wat het kind zelf veranderde). */
  toestand(): SceneToestand;
  toon(t: SceneToestand): void;
  zetVoorwerp(v: Voorwerp): void;
  zetStralen(aan: boolean): void;
  zetPrikkelarm(aan: boolean): void;
  zetZicht(z: Zicht): void;
  /** Een andere stand: de kijkdoos bouwt zich opnieuw op (antialias hoort bij de WebGL-context). */
  zetStand(s: StandKeuze): void;
  /** Een png (data-url) van wat de kijkdoos nu toont, of null. */
  foto(): string | null;
  /** De frametijden (ook zonder meetstand); null zolang er geen 3D is. */
  meting(): MeetVerslag | null;
  /** Geeft alles vrij: renderer, WebGL-context, texturen, lussen, observers, luisteraars en wat in het vak kwam. */
  sluit(): void;
}

/** Wat het toestel over WebGL zegt, één keer per pagina gepeild. */
type Peiling = { webgl: boolean; renderer: string };
let peiling: Peiling | null = null;

/** Kan dit toestel WebGL, en met welke renderer? Zonder three: zo laadt een toestel zonder WebGL three nooit. */
export function peilWebGL(): Peiling {
  if (peiling) return peiling;
  let uit: Peiling = { webgl: false, renderer: '' };
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      let naam = '';
      try {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        naam = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      } catch {
        naam = '';
      }
      uit = { webgl: true, renderer: naam };
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    uit = { webgl: false, renderer: '' };
  }
  peiling = uit;
  return uit;
}

let motorLader: Promise<MaakMotor> | null = null;
function laadMotor(): Promise<MaakMotor> {
  if (!motorLader) {
    motorLader = import('./kijkdoos3d').then((m) => m.laadMotor());
    // Mislukt het (geen netwerk), dan probeert een volgende kijkdoos het opnieuw. Voor een chunk die al mislukte, helpt
    // dat pas na het herladen van de pagina (de browser onthoudt de mislukte module).
    motorLader.catch(() => {
      motorLader = null;
    });
  }
  return motorLader;
}

/** Wacht op Fredoka voor de labels op het canvas, maar nooit langer dan anderhalve seconde. */
async function wachtOpLettertype(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const klaar = Promise.all([fonts.load('600 54px Fredoka'), fonts.load('700 70px Fredoka')]).then(() => fonts.ready);
  await Promise.race([klaar.catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
}

// Een module die niet laadde, onthoudt de browser tot de pagina herlaadt: opnieuw proberen zonder herladen helpt niet.
// De zichtbare zinnen zijn voor een kind van 9 (LK-8): geen vakwoorden. De technische uitleg voor de leerkracht staat op de
// lespagina (LichtkamerPakketScherm). Er is geen knop om het laden opnieuw te proberen, dus de zin zegt: laad de pagina opnieuw.
const GEEN_3D_BESTANDEN = 'De kijkdoos is niet geladen. Laad de pagina opnieuw, of zeg het aan je juf of meester.';
const GEEN_WEBGL = 'Zeg het aan je juf of meester.';

class Gevel implements Kijkdoos {
  status: KijkdoosStatus = 'laden';
  stand: Stand | null = null;
  private motor: Motor | null = null;
  private beurt = 0;
  private gedwongen: Stand | null = null;
  private melding: HTMLElement | null = null;
  private live: HTMLElement | null = null;
  private wens: {
    toestand: SceneToestand;
    keuze: StandKeuze;
    voorwerp: Voorwerp;
    stralen: boolean;
    prikkelarm: boolean;
    /** Een gekozen zicht; null = het vaste zicht van de oefening. Overleeft het laden en een herstart. */
    zicht: Zicht | null;
  };
  /** De laatst doorgegeven beschrijving: dezelfde zin geven we niet nog eens door. */
  private laatsteBeschrijving: string | null = null;
  /** Stond de focus in de kijkdoos voor een herstart? Dan gaat hij na het opbouwen naar het nieuwe canvas. */
  private focusTerug = false;
  private readonly start = performance.now();

  constructor(
    private readonly houder: HTMLElement,
    private readonly opties: KijkdoosOpties,
  ) {
    this.wens = {
      toestand: normaliseer(opties.toestand),
      keuze: opties.stand ?? 'auto',
      voorwerp: opties.voorwerp ?? 'boom',
      stralen: opties.stralen ?? false,
      prikkelarm: opties.prikkelarm ?? false,
      zicht: null,
    };
    if (!opties.opBeschrijving) {
      const p = document.createElement('p');
      p.className = 'sr-only';
      p.setAttribute('aria-live', 'polite');
      houder.append(p);
      this.live = p;
    }
    // Pas na het teruggeven beginnen: zo roept openKijkdoos nooit een functie van de opties aan voor de aanroeper de
    // kijkdoos in handen heeft (ook niet bij 'geen3d', dat anders meteen zou komen).
    void Promise.resolve().then(() => {
      if (this.status !== 'gesloten') void this.laad();
    });
  }

  private zetStatus(s: KijkdoosStatus): void {
    if (this.status === s) return;
    this.status = s;
    try {
      this.opties.opStatus?.(s);
    } catch (e) {
      console.error(e);
    }
  }

  private toonMelding(soort: 'geen3d' | 'contextverlies', reden = ''): void {
    this.wisMelding();
    const m = document.createElement('div');
    m.className = 'b-lk-melding';
    if (soort === 'geen3d') {
      m.setAttribute('role', 'note');
      const naam = NAAM_VOORWERP[this.wens.voorwerp];
      const kop = document.createElement('p');
      kop.className = 'b-lk-melding-kop';
      if (this.opties.bord === true) {
        // Op het bord leest de klas mee: geen 'zeg het aan je juf' en geen check, want het bord heeft er geen.
        kop.textContent = 'Dit toestel toont geen 3D';
        const p = document.createElement('p');
        p.textContent = `Werk met de echte zaklamp, het ${naam} en de meetlat.`;
        m.append(kop, p);
      } else {
        kop.textContent = 'De kijkdoos kan hier niet openen';
        const p1 = document.createElement('p');
        p1.textContent = reden;
        const p2 = document.createElement('p');
        p2.textContent = `De check kan je wel doen. Of werk verder met de echte zaklamp, het ${naam} en de meetlat.`;
        m.append(kop, p1, p2);
      }
    } else {
      // Een alert: wie met het toetsenbord of een schermlezer werkt, hoort dat de kijkdoos weg is en waar de knop staat.
      m.setAttribute('role', 'alert');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'b-lk-knop b-lk-herlaad';
      b.textContent = 'Tik om de kijkdoos opnieuw te laden';
      b.addEventListener('click', () => this.herstart());
      m.append(b);
    }
    this.houder.append(m);
    this.melding = m;
  }

  private wisMelding(): void {
    this.melding?.remove();
    this.melding = null;
  }

  private stopMotor(): void {
    const m = this.motor;
    this.motor = null;
    this.stand = null;
    if (m) {
      try {
        m.vernietig();
      } catch (e) {
        console.error('Kijkdoos: opruimen mislukt', e);
      }
    }
  }

  private async laad(): Promise<void> {
    const beurt = ++this.beurt;
    this.zetStatus('laden');
    const p = peilWebGL();
    if (!p.webgl) {
      this.toonMelding('geen3d', GEEN_WEBGL);
      this.zetStatus('geen3d');
      return;
    }
    let maak: MaakMotor;
    try {
      maak = await laadMotor();
    } catch (e) {
      if (beurt !== this.beurt) return;
      console.warn('Kijkdoos zonder 3D:', e);
      this.toonMelding('geen3d', GEEN_3D_BESTANDEN);
      this.zetStatus('geen3d');
      return;
    }
    await wachtOpLettertype();
    if (beurt !== this.beurt) return;
    const stand = this.gedwongen ?? standVoorRenderer(this.wens.keuze, this.opties.bord === true, p.renderer);
    let minderBeweging = false;
    try {
      minderBeweging = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      minderBeweging = false;
    }
    try {
      this.motor = maak(this.houder, {
        stand,
        // Na een gedwongen 'laag' meet de motor niet opnieuw.
        keuze: this.gedwongen ? stand : this.wens.keuze,
        rendererNaam: p.renderer + (isSoftwareRenderer(p.renderer) ? ' (zonder grafische kaart)' : ''),
        toestand: this.wens.toestand,
        voorwerp: this.wens.voorwerp,
        stralen: this.wens.stralen,
        prikkelarm: this.wens.prikkelarm,
        minderBeweging,
        meet: this.opties.meet ?? meetGevraagd(typeof location === 'undefined' ? '' : location.href),
        startTijd: this.start,
        terug: {
          wijziging: (t) => {
            if (beurt !== this.beurt) return;
            this.wens.toestand = t;
            try {
              this.opties.opWijziging?.(t);
            } catch (e) {
              console.error(e);
            }
          },
          beschrijving: (tekst) => {
            if (beurt !== this.beurt || tekst === this.laatsteBeschrijving) return;
            this.laatsteBeschrijving = tekst;
            try {
              if (this.opties.opBeschrijving) this.opties.opBeschrijving(tekst);
              else if (this.live) this.live.textContent = tekst;
            } catch (e) {
              console.error(e);
            }
          },
          contextVerloren: () => {
            if (beurt !== this.beurt) return;
            this.toonMelding('contextverlies');
            this.zetStatus('contextverlies');
          },
          traag: () => {
            if (beurt !== this.beurt) return;
            this.gedwongen = 'laag';
            this.herstart();
          },
        },
      });
    } catch (e) {
      console.warn('Kijkdoos zonder 3D:', e);
      this.toonMelding('geen3d', GEEN_WEBGL);
      this.zetStatus('geen3d');
      return;
    }
    this.stand = stand;
    if (this.wens.zicht) this.motor.zetZicht(this.wens.zicht);
    this.wisMelding();
    if (this.focusTerug) {
      this.focusTerug = false;
      this.motor.focus();
    }
    this.zetStatus('klaar');
  }

  private herstart(): void {
    if (this.status === 'gesloten') return;
    const actief = typeof document === 'undefined' ? null : document.activeElement;
    this.focusTerug = this.focusTerug || (!!actief && actief !== document.body && this.houder.contains(actief));
    this.stopMotor();
    this.wisMelding();
    void this.laad();
  }

  toestand(): SceneToestand {
    return this.wens.toestand;
  }
  toon(t: SceneToestand): void {
    if (this.status === 'gesloten') return;
    const n = normaliseer(t);
    // Een andere oefening krijgt haar eigen vaste zicht; een gekozen zicht geldt alleen binnen de oefening.
    if (n.scene !== this.wens.toestand.scene) this.wens.zicht = null;
    this.wens.toestand = n;
    this.motor?.toon(n);
  }
  zetVoorwerp(v: Voorwerp): void {
    if (this.status === 'gesloten') return;
    this.wens.voorwerp = v;
    this.motor?.zetVoorwerp(v);
    // Een ander voorwerp bouwt de oefening opnieuw op (met haar vaste zicht): een gekozen zicht blijft.
    if (this.wens.zicht) this.motor?.zetZicht(this.wens.zicht);
  }
  zetStralen(aan: boolean): void {
    if (this.status === 'gesloten') return;
    this.wens.stralen = aan;
    this.motor?.zetStralen(aan);
  }
  zetPrikkelarm(aan: boolean): void {
    if (this.status === 'gesloten') return;
    this.wens.prikkelarm = aan;
    this.motor?.zetPrikkelarm(aan);
  }
  zetZicht(z: Zicht): void {
    if (this.status === 'gesloten') return;
    this.wens.zicht = z;
    this.motor?.zetZicht(z);
  }
  zetStand(s: StandKeuze): void {
    if (this.status === 'gesloten') return;
    this.wens.keuze = s;
    this.gedwongen = null;
    if (this.status === 'geen3d') return;
    this.herstart();
  }
  foto(): string | null {
    return this.motor?.foto() ?? null;
  }
  meting(): MeetVerslag | null {
    return this.motor?.meting() ?? null;
  }
  sluit(): void {
    if (this.status === 'gesloten') return;
    this.beurt++;
    this.stopMotor();
    this.wisMelding();
    this.live?.remove();
    this.live = null;
    this.zetStatus('gesloten');
  }
}

/** Opent een kijkdoos in `houder` (bv. een div.b-lk-kijk). Werpt nooit een fout; ruim op met sluit(). */
export function openKijkdoos(houder: HTMLElement, opties: KijkdoosOpties): Kijkdoos {
  return new Gevel(houder, opties);
}

/** Alleen voor de tests: vergeet de peiling van WebGL. */
export function vergeetPeiling(): void {
  peiling = null;
}
