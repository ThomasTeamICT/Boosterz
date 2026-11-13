// ── Bordles: van bordelementen naar paden, en de timing van de hand ─────────
//
// Zuiver: geen DOM. Alles wat de hand tekent, wordt één <path>, zodat de hand
// de lijn exact kan volgen (getPointAtLength). Ontwerp: docs/UITLEGVORMEN.md § 3.3.

import type { BordElement, BordlesSnelheid, BordPunt, Krijtkleur } from '../types';

/** Krijtkleuren als css-variabelen (gedefinieerd in styles/bordles.css). */
export const KRIJT: Record<Krijtkleur, string> = {
  wit: 'var(--krijt-wit)',
  geel: 'var(--krijt-geel)',
  blauw: 'var(--krijt-blauw)',
  roze: 'var(--krijt-roze)',
  groen: 'var(--krijt-groen)',
  oranje: 'var(--krijt-oranje)',
};

export function krijt(k?: Krijtkleur): string {
  return KRIJT[k ?? 'wit'];
}

const f = (n: number) => String(Math.round(n * 10) / 10);
const p = (q: BordPunt) => `${f(q[0])} ${f(q[1])}`;

/** Grootte van de punt van een pijl, in bordeenheden. */
export const PIJLPUNT = 14;

/**
 * Het pad voor een lijnvormig element (alles behalve tekst). Een pijl is de
 * steel plus twee korte lijntjes aan de punt, zodat de hand ook de punt tekent.
 */
export function padVoor(el: Exclude<BordElement, { soort: 'tekst' }>): string {
  switch (el.soort) {
    case 'lijn':
      return `M${p(el.van)} L${p(el.naar)}`;
    case 'veelhoek': {
      const [eerste, ...rest] = el.punten;
      return `M${p(eerste)}${rest.map((q) => ` L${p(q)}`).join('')}${el.gesloten === false ? '' : ' Z'}`;
    }
    case 'cirkel': {
      const [cx, cy] = el.midden, r = el.straal;
      // twee halve bogen, beginnend bovenaan, met de klok mee
      return `M${f(cx)} ${f(cy - r)} A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy + r)} A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy - r)}`;
    }
    case 'pijl': {
      const [x1, y1] = el.van, [x2, y2] = el.naar;
      const hoek = Math.atan2(y2 - y1, x2 - x1);
      const a = hoek + Math.PI - 0.45, b = hoek + Math.PI + 0.45;
      const pa: BordPunt = [x2 + PIJLPUNT * Math.cos(a), y2 + PIJLPUNT * Math.sin(a)];
      const pb: BordPunt = [x2 + PIJLPUNT * Math.cos(b), y2 + PIJLPUNT * Math.sin(b)];
      return `M${p(el.van)} L${p(el.naar)} M${p(pa)} L${p(el.naar)} L${p(pb)}`;
    }
  }
}

/** Een veelhoek met vulling: de vlakke kleur komt na de omtrek. */
export function vulPad(el: BordElement): string | null {
  if (el.soort !== 'veelhoek' || !el.vulling || el.gesloten === false) return null;
  return padVoor(el);
}

export function tekstAnker(u?: 'links' | 'midden' | 'rechts'): 'start' | 'middle' | 'end' {
  return u === 'midden' ? 'middle' : u === 'rechts' ? 'end' : 'start';
}

// ── Snelheid en timing ──────────────────────────────────────────────────────

/** Lijnen in pixels per seconde, schrift in tekens per seconde. 'meteen' tekent zonder animatie. */
export const SNELHEDEN: Record<Exclude<BordlesSnelheid, 'meteen'>, { px: number; cps: number }> = {
  traag: { px: 170, cps: 5 },
  normaal: { px: 330, cps: 10 },
  snel: { px: 720, cps: 24 },
};

export const SNELHEID_NAMEN: Record<BordlesSnelheid, string> = {
  traag: 'Traag', normaal: 'Normaal', snel: 'Snel', meteen: 'Meteen',
};

export function lijnDuur(lengte: number, s: Exclude<BordlesSnelheid, 'meteen'>): number {
  return Math.max(220, (lengte / SNELHEDEN[s].px) * 1000);
}

export function tekstDuur(tekens: number, s: Exclude<BordlesSnelheid, 'meteen'>): number {
  return Math.max(260, (tekens / SNELHEDEN[s].cps) * 1000);
}

/** Opgetild verplaatsen gaat sneller dan tekenen, maar nooit schokkerig kort of slepend lang. */
export function verplaatsDuur(afstand: number, s: Exclude<BordlesSnelheid, 'meteen'>): number {
  return Math.max(110, Math.min(520, (afstand / (SNELHEDEN[s].px * 2.6)) * 1000));
}

/** Zacht starten en stoppen. */
export function zacht(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Voorleestekst: tekens die een stem verkeerd uitspreekt, in woorden. */
export function voorleesTekst(t: string): string {
  return t.replace(/²/g, ' kwadraat').replace(/³/g, ' tot de derde').replace(/√/g, 'wortel van ').replace(/·/g, ' maal ');
}
