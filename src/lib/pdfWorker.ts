// Welke pdf-worker een toestel krijgt. De worker van pdf.js bevat private methodes en een static-blok: Safari en iPadOS
// vóór 16.4 kunnen dat bestand niet lezen, en dan toont een pdf "kon niet gelezen worden". Zulke toestellen krijgen
// een eigen worker die Vite naar safari14 omzet (pdfWorkerOud.ts); nieuwere toestellen houden de gewone, zoals voorheen.
import oudeWorker from '../components/pdf/pdfWorkerOud?worker&url';
import { vulPolyfillsAan } from './oudePolyfills';

/**
 * Kan dit toestel de gewone pdf-worker lezen (private methodes en static-blokken)? Zonder eval, want de CSP van de app
 * staat dat niet toe. We vragen naar String.prototype.isWellFormed: Safari 16.4, Chrome 111, Firefox 119, telkens later
 * dan static-blokken en private methodes. Wat ertussen valt krijgt de oude worker, en die werkt ook. Geen at, hasOwn of
 * structuredClone: vulPolyfillsAan zet die, en pdfWorkerAdres roept deze functie na de polyfills nog eens aan.
 */
export function kanModerneSyntaxis(): boolean {
  return typeof (String.prototype as { isWellFormed?: unknown }).isWellFormed === 'function';
}

/** Het adres van de worker voor dit toestel. */
function pdfWorkerAdres(): string {
  return kanModerneSyntaxis()
    ? new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
    : new URL(oudeWorker, import.meta.url).toString();
}

/**
 * Laadt pdf.js (de legacy-build) met de juiste worker. Op een toestel dat de gewone worker niet kan lezen komen
 * eerst de kleine terugvallen op de hoofdthread, vóór pdf.js zelf geladen wordt.
 */
export async function laadPdfjs() {
  if (!kanModerneSyntaxis()) vulPolyfillsAan();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerAdres();
  return pdfjs;
}
