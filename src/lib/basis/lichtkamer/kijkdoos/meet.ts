// De meetstand van de kijkdoos (`?meet`): frametijden voor de generale repetitie en het bezoek (LK-11, LK-12).
//
// Zuiver: geen three.js, geen DOM. De kijkdoos geeft per getekend beeld de tijd sinds het vorige beeld (alleen als ze
// aansluiten: tijdens het slepen of de animatie), de tijd die het tekenen zelf kostte, en de tijd tot het eerste beeld.
// Go of no-go bij het bezoek: een p95 van hoogstens 50 ms tijdens het verschuiven van de lamp, en een eerste beeld
// binnen 5 seconden (docs/basisonderwijs/LICHTKAMER-APP.md, 'Bouwplan').

/** Staat `meet` in de zoekopdracht van het adres, voor of na het hekje (de app gebruikt een hash-router)? */
export function meetGevraagd(href: string | null | undefined): boolean {
  if (typeof href !== 'string') return false;
  const stukken: string[] = [];
  const hekje = href.indexOf('#');
  const voor = hekje >= 0 ? href.slice(0, hekje) : href;
  const na = hekje >= 0 ? href.slice(hekje + 1) : '';
  const v = voor.indexOf('?');
  if (v >= 0) stukken.push(voor.slice(v + 1));
  const n = na.indexOf('?');
  if (n >= 0) stukken.push(na.slice(n + 1));
  return stukken.some((q) => {
    try {
      const p = new URLSearchParams(q);
      return p.has('meet') && p.get('meet') !== '0';
    } catch {
      return false;
    }
  });
}

/** Het percentiel p (0 tot 100) volgens de dichtstbijzijnde rang; NaN zonder metingen. */
export function percentiel(waarden: readonly number[], p: number): number {
  const geldig = waarden.filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (geldig.length === 0) return NaN;
  const rang = Math.min(geldig.length, Math.max(1, Math.ceil((p / 100) * geldig.length)));
  return geldig[rang - 1] as number;
}

/** Hoeveel metingen de meetstand onthoudt (de laatste); genoeg voor een sleepbeweging van een halve minuut. */
export const MEET_VENSTER = 600;

export type MeetVerslag = {
  stand: string;
  renderer: string;
  /** ms tussen het openen en het eerste getekende beeld. */
  eersteBeeldMs: number | null;
  beelden: number;
  /** p50 en p95 van de tijd tussen aansluitende beelden (ms). */
  p50: number;
  p95: number;
  /** p95 van de tijd die het tekenen zelf kostte (ms, hoofddraad). */
  tekenP95: number;
};

export class Meter {
  private tussen: number[] = [];
  private teken: number[] = [];
  private aantal = 0;
  private eerste: number | null = null;

  /** Een getekend beeld: `tussenMs` is NaN als het niet aansluit op het vorige beeld. */
  beeld(tussenMs: number, tekenMs: number): void {
    this.aantal++;
    if (Number.isFinite(tussenMs)) {
      this.tussen.push(tussenMs);
      if (this.tussen.length > MEET_VENSTER) this.tussen.shift();
    }
    if (Number.isFinite(tekenMs)) {
      this.teken.push(tekenMs);
      if (this.teken.length > MEET_VENSTER) this.teken.shift();
    }
  }

  eersteBeeld(ms: number): void {
    if (this.eerste === null && Number.isFinite(ms)) this.eerste = ms;
  }

  wis(): void {
    this.tussen = [];
    this.teken = [];
  }

  verslag(stand: string, renderer: string): MeetVerslag {
    return {
      stand,
      renderer,
      eersteBeeldMs: this.eerste,
      beelden: this.aantal,
      p50: percentiel(this.tussen, 50),
      p95: percentiel(this.tussen, 95),
      tekenP95: percentiel(this.teken, 95),
    };
  }
}

const ms = (x: number | null) => (x === null || !Number.isFinite(x) ? '–' : `${Math.round(x)} ms`);

/** De regels van het meetvenster, in gewone taal. */
export function meetTekst(v: MeetVerslag): string[] {
  return [
    `Stand: ${v.stand}`,
    `Tekent met: ${v.renderer || 'onbekend'}`,
    `Eerste beeld na: ${ms(v.eersteBeeldMs)}`,
    `Beelden: ${v.beelden}`,
    `Tijd per beeld: p50 ${ms(v.p50)}, p95 ${ms(v.p95)}`,
    `Tekenen zelf: p95 ${ms(v.tekenP95)}`,
  ];
}
