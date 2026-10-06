// ── Veilige URL's en blobs uit gedeelde inhoud ──────────────────────────────
//
// Inhoud komt binnen via links, klaspakketten, bestanden, resultaatcodes en
// AI-uitvoer: ze kan dus van iemand anders komen. Een URL daaruit die in een
// href, een iframe of pdf.js belandt, mag nooit code uitvoeren in de origin
// van de app, want daar staat de API-sleutel van de leerkracht (localStorage).
//
//  - `javascript:` (ook " JaVaScRiPt:", "\u0001javascript:", "java\tscript:")
//    voert script uit in de app. Daarom: een web-URL is alleen http(s), en
//    een bestand alleen data: of blob:.
//  - Een blob:-URL hoort bij de origin van de app. Is het type html of svg,
//    dan voert "openen in nieuw tabblad" het script erin uit. Daarom krijgt
//    elke blob waar de app een URL voor maakt een passief type (passieveBlob);
//    svg blijft een data:-URL (eigen, ondoorzichtige origin), zie mediaStore.

/**
 * http(s):// vooraan en nergens een controleteken (\p{Cc}: C0, DEL en C1):
 * de url-parser slaat sommige daarvan over ("java\tscript:").
 */
const WEB_URL = /^https?:\/\/\P{Cc}*$/iu;

/**
 * Het adres zelf (zonder witruimte rond) als het een http(s)-adres is, anders
 * null. Gebruik de teruggegeven waarde, niet het origineel: zo komt er nooit
 * een adres met andere witruimte ervoor in een href of iframe.
 */
export function webUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const t = u.trim();
  return WEB_URL.test(t) ? t : null;
}

/** http:// of https:// (hoofdletterongevoelig, na trim), zonder controletekens. */
export function isWebUrl(u: unknown): u is string {
  return webUrl(u) !== null;
}

/**
 * Een bestand dat de app zelf meegeeft: data: (eigen, ondoorzichtige origin
 * in een nieuw tabblad) of blob: (van de app zelf, met een passief type).
 * Bewust streng: kleine letters en niets ervoor.
 */
export function isBestandUrl(u: unknown): u is string {
  return typeof u === 'string' && (u.startsWith('data:') || u.startsWith('blob:'));
}

// ── Mimetypes van blobs ─────────────────────────────────────────────────────

/** Types die de browser in een eigen tabblad passief toont: geen script mogelijk. */
const PASSIEF_TYPE = /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/;

export const NEUTRAAL_TYPE = 'application/octet-stream';
export const SVG_TYPE = 'image/svg+xml';

/** Het mimetype zonder parameters, in kleine letters ("Image/PNG; x=y" wordt "image/png"). */
export function kernType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function isPassiefType(type: string): boolean {
  return PASSIEF_TYPE.test(kernType(type));
}

export function isSvgType(type: string): boolean {
  return kernType(type) === SVG_TYPE;
}

/**
 * Het type waarmee een blob een URL mag krijgen: het kale passieve type, of
 * anders application/octet-stream (de browser downloadt dan in plaats van te
 * tonen). Parameters vallen altijd weg: een komma erin ("image/png;x=1,
 * text/html") kan de browser als tweede, actief type lezen.
 */
export function veiligBlobType(type: string): string {
  const kern = kernType(type);
  return PASSIEF_TYPE.test(kern) ? kern : NEUTRAAL_TYPE;
}

/** Dezelfde bytes met een veilig type (zie veiligBlobType); geen kopie als het al klopt. */
export function passieveBlob(blob: Blob): Blob {
  const type = veiligBlobType(blob.type);
  return blob.type === type ? blob : blob.slice(0, blob.size, type);
}
