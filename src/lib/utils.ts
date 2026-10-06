/** Korte unieke id. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Deelcode van 6 tekens, zonder verwarrende tekens (0/O, 1/I). */
export function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Schudden, maar nooit zo dat de volgorde al "juist" is: bij twee items komt
 * gewoon schudden in de helft van de gevallen terug in de beginvolgorde, en
 * dan staat een rangschik- of koppelvraag al opgelost voor de leerling.
 * Opnieuw schudden zolang het resultaat gelijk is aan het origineel (max. 10
 * keer); lukt dat niet, dan één plaats doorschuiven, wat bij niet-gelijke
 * items altijd een andere volgorde geeft. Eén item, of allemaal gelijke items
 * (volgens `same`): dan bestaat er geen andere volgorde en komt een kopie terug.
 */
export function shuffledNotIdentity<T>(arr: readonly T[], same: (a: T, b: T) => boolean = Object.is): T[] {
  const orig = arr.slice();
  if (orig.length < 2 || orig.every((x) => same(x, orig[0]))) return orig;
  const isIdentity = (a: T[]) => a.every((x, i) => same(x, orig[i]));
  let out = shuffled(orig);
  for (let tries = 0; tries < 10 && isIdentity(out); tries++) out = shuffled(orig);
  if (isIdentity(out)) out = [...orig.slice(1), orig[0]];
  return out;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Tekst normaliseren voor antwoordvergelijking: spaties samenvoegen,
 * typografische aanhalingstekens en apostrofs gelijkstellen aan de gewone
 * (een tablet maakt van "foto's" vaak "foto’s"), en standaard hoofdletters en
 * accenten negeren. `accentSensitive` laat accenten wél meetellen (opt-in per
 * vraag of dictee); losstaand van `caseSensitive`.
 */
export function normalizeAnswer(s: string, caseSensitive = false, accentSensitive = false): string {
  let t = s.trim().replace(/\s+/g, ' ');
  t = t.replace(/[\u2018\u2019\u201A\u201B\u02BC\u00B4`]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  if (!caseSensitive) t = t.toLocaleLowerCase('nl');
  // accenten negeren (NFD splitst é in e + combinerend teken), of bij
  // accentgevoelig samengesteld vergelijken (NFC: e + los accent wordt één é)
  t = accentSensitive ? t.normalize('NFC') : t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('nl-BE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function pct(earned: number, max: number): number {
  return max <= 0 ? 0 : Math.round((earned / max) * 100);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Bestand kon niet gelezen worden'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Grens waaronder we een afbeelding niet meer proberen te verkleinen. */
const KEEP_ORIGINAL_BYTES = 200 * 1024;

/**
 * Afbeelding klaarmaken voor opslag: verkleinen tot `maxDim` en hercoderen
 * als dat kleiner uitkomt. Vroeger gebeurde dat alleen boven 1400 px, zodat
 * een schermafbeelding van 1200 px als png van 2 MB gewoon bleef staan; nu
 * proberen we WebP (behoudt transparantie) en JPEG (op wit) en houden we het
 * kleinste. Gif (animatie) en svg (vector) blijven altijd origineel.
 * Geen afbeelding, of niets kleiner gevonden? Dan het bestand zelf.
 */
export async function fileToBlob(file: File, maxDim = 1400): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if (!img) return file;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1 && file.size <= KEEP_ORIGINAL_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const candidates: Blob[] = [];
    // WebP behoudt transparantie en is bijna altijd het kleinst.
    const webp = await canvasBlob(canvas, 'image/webp', 0.82);
    if (webp) candidates.push(webp);
    if (file.type === 'image/jpeg') {
      // Een jpeg-origineel heeft geen transparantie, dus jpeg (op wit) is veilig.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.85);
      if (jpeg) candidates.push(jpeg);
    } else if (!webp && scale < 1) {
      // Geen WebP-encoder (oude browser): png houdt de transparantie; nooit
      // jpeg, dat zou een doorschijnende achtergrond wit maken.
      const pngBlob = await canvasBlob(canvas, 'image/png', 1);
      if (pngBlob) candidates.push(pngBlob);
    }
    if (scale >= 1) candidates.push(file);
    if (candidates.length === 0) return file;
    return candidates.reduce((best, b) => (b.size < best.size ? b : best));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Bestand naar data-URL lezen (afbeeldingen worden verkleind). */
export async function fileToDataUrl(file: File, maxDim = 1400): Promise<string> {
  return readAsDataUrl(await fileToBlob(file, maxDim));
}

/**
 * Bestand naar een URL die in een widget- of cursusconfig mag staan: de bytes
 * gaan naar IndexedDB (lib/mediaStore) en de config krijgt een blob:-URL die
 * bij het bewaren automatisch een verwijzing wordt. Lukt dat niet (IndexedDB
 * geblokkeerd), dan een data-URL zoals vroeger.
 */
export async function fileToMediaUrl(file: File, maxDim = 1400): Promise<string> {
  const blob = await fileToBlob(file, maxDim);
  try {
    const { storeMedia } = await import('./mediaStore');
    return await storeMedia(blob, file.name);
  } catch {
    return readAsDataUrl(blob);
  }
}

export function downloadFile(name: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV-veld veilig maken. Tekst die met = + - @, een tab of een regelterugloop
 * begint, voert een rekenblad uit als formule (CSV-injectie: een leerlingnaam
 * "=HYPERLINK(…)" in de export). Daar komt een ' voor, behalve bij een zuiver
 * getal zoals -5, +3,5 of -12%. Velden met een scheidingsteken, aanhalingsteken,
 * regeleinde of tab gaan tussen aanhalingstekens.
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?%?$/.test(s)) s = "'" + s;
  if (/[",\n;\r\t]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
