/**
 * Kleurformule voor widgetsoorten.
 *
 * Elke soort krijgt één tint (hue, 0–360) in OKLCH. Lichtheid en verzadiging
 * liggen vast, zodat elke soort even helder oogt en elk icoon genoeg contrast
 * haalt. De CSS gebruikt de tint rechtstreeks (`oklch(… var(--h))`, zie
 * `.type-tile` in global.css); deze module rekent dezelfde formule om naar
 * hex, voor plaatsen die een gewone kleur nodig hebben, zoals de accentkleur
 * van een nieuwe widget of een kleurkiezer.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** OKLCH naar lineaire sRGB, zonder te begrenzen. */
function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

const toByte = (v: number) => {
  const x = clamp01(v);
  const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(srgb) * 255);
};

/**
 * OKLCH naar hex. Valt de kleur buiten sRGB, dan zakt de verzadiging tot ze
 * past; tint en lichtheid blijven gelijk.
 */
export function oklchToHex(l: number, c: number, h: number): string {
  let chroma = c;
  let rgb = oklchToLinear(l, chroma, h);
  while (!inGamut(rgb) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.005);
    rgb = oklchToLinear(l, chroma, h);
  }
  return '#' + rgb.map((v) => toByte(v).toString(16).padStart(2, '0')).join('');
}

/** Lineaire sRGB-kanalen (0–1) van een hexkleur met zes cijfers. */
function linearChannels(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Geen geldige hexkleur: ${hex}`);
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return [r, g, b];
}

/** Relatieve luminantie volgens WCAG 2. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = linearChannels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrastverhouding volgens WCAG 2, van 1 tot 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Accentkleur van een soort: donker genoeg voor witte tekst (knoppen,
 * voortgangsbalk in de speler), herkenbaar als dezelfde tint als het icoon.
 */
export function typeAccent(hue: number): string {
  return oklchToHex(0.5, 0.17, hue);
}

/** Minimaal contrast van tekst op een gevuld vlak (WCAG 2, niveau AA). */
const MIN_TEXT_CONTRAST = 4.5;

/**
 * Maakt een door de leerkracht gekozen accentkleur donker genoeg voor witte
 * tekst erop (een aangeduid bingovakje, een knop, een voortgangsbalk): het
 * contrast met wit is dan minstens 4,5 : 1. Een kleur die al genoeg haalt,
 * komt ongewijzigd terug. Anders schaalt de helderheid (lineair, dus met
 * dezelfde tint en verhoudingen tussen de kanalen) zover terug als nodig is,
 * niet verder: een lichtgele #ffe14d wordt een donker olijfgeel (#877624).
 * Ongeldige invoer (geen
 * hexkleur van drie of zes cijfers) komt terug zoals ze was.
 */
export function readableAccent(hex: string): string {
  const m = typeof hex === 'string' ? /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim()) : null;
  if (!m) return hex;
  const digits = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const full = `#${digits.toLowerCase()}`;
  if (contrastRatio(full, '#ffffff') >= MIN_TEXT_CONTRAST) return hex;

  // Luminantie die nog net 4,5 : 1 met wit geeft: (1,05 / (L + 0,05)) = 4,5.
  const target = 1.05 / MIN_TEXT_CONTRAST - 0.05;
  const lin = linearChannels(full);
  const toHex = (k: number) => '#' + lin.map((v) => toByte(v * k).toString(16).padStart(2, '0')).join('');
  // De afronding naar bytes kan het contrast net onder de grens duwen: stapjes terug.
  for (let k = target / relativeLuminance(full); k > 0.001; k *= 0.995) {
    const candidate = toHex(k);
    if (contrastRatio(candidate, '#ffffff') >= MIN_TEXT_CONTRAST) return candidate;
  }
  return '#000000';
}
