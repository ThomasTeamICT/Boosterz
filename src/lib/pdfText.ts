// ── Pdf-tekstextractie (AI-bronmateriaal en leerplanlezer) ──────────────────
//
// Leest alle tekst uit een pdf met pdf.js, volledig client-side. extractPdfText
// is bedoeld om een hoofdstuk of cursustekst als bronmateriaal in de AI-velden
// te plakken; extractPdfLines (onderaan) bewaart de regels voor de leerplanlezer.
// Let op: een gescande pdf (foto's van pagina's) bevat geen tekstlaag en
// levert dus (bijna) niets op — de knop meldt dat aan de leerkracht.

/** Meer dan dit plakken we niet in een AI-prompt (± 15k tokens). */
const MAX_CHARS = 60000;
const TRUNC_MARKER = '\n\n[… ingekort …]';

/**
 * Haalt de tekst uit alle pagina's van een pdf.
 * - items per pagina samengevoegd met spaties, whitespace genormaliseerd
 * - pagina's gescheiden door een witregel, met kopje "— p. n —" (alleen bij >1 pagina)
 * - afgekapt op 60.000 tekens met een duidelijke marker
 */
export async function extractPdfText(src: Blob): Promise<{ text: string; pages: number }> {
  // De legacy-build, net als PdfViewer: de moderne build eist splinternieuwe
  // JS-API's die op oudere school-pc's nog ontbreken.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const data = await src.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const pages = doc.numPages;
    const parts: string[] = [];
    let total = 0;
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!pageText) continue; // lege (of gescande) pagina: geen loos kopje
      const part = pages > 1 ? `— p. ${n} —\n${pageText}` : pageText;
      parts.push(part);
      total += part.length;
      if (total > MAX_CHARS) break; // genoeg gelezen; de rest valt toch buiten de limiet
    }
    let text = parts.join('\n\n');
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS - TRUNC_MARKER.length) + TRUNC_MARKER;
    }
    return { text, pages };
  } finally {
    try { await task.destroy(); } catch { /* al opgeruimd */ }
  }
}

// ── Regels bewaren (voor de leerplanlezer) ──────────────────────────────────
//
// Een leerplan lees je per regel: de doelcode staat vooraan op een regel, een
// kopregel herken je aan zijn plaats op de pagina. Daarom groeperen we de
// tekststukken van pdf.js hier tot regels, en kappen we niets af tot ver boven
// de omvang van een echt leerplan.

/** Eén tekststuk zoals pdf.js het geeft (vorm van `TextItem`). */
export interface PdfTekstItem {
  str: string;
  /** [a, b, c, d, x, y]: d (of a) ≈ lettergrootte, x en y = plaats van de basislijn. */
  transform: number[];
  width?: number;
  hasEOL?: boolean;
}

/** Tolerantie voor "dezelfde regel" als de lettergrootte onbekend is. */
const STANDAARD_TOLERANTIE = 2;
/** Deel van de (kleinste) lettergrootte dat twee basislijnen mogen verschillen op één regel. */
const TOLERANTIE_FACTOR = 0.6;
/** Tussenruimte (deel van de lettergrootte) waaronder twee stukken aan elkaar horen. */
const LIJM_FACTOR = 0.15;

interface Stuk {
  str: string;
  x: number;
  y: number;
  grootte?: number;
  breedte?: number;
  eol: boolean;
}

function grootteVan(t: number[]): number | undefined {
  const d = Math.abs(t[3]);
  if (Number.isFinite(d) && d > 0) return d;
  const a = Math.abs(t[0]);
  if (Number.isFinite(a) && a > 0) return a;
  return undefined;
}

function tolerantie(a: Stuk, b: Stuk): number {
  const groottes = [a.grootte, b.grootte].filter((g): g is number => g !== undefined);
  return groottes.length > 0 ? Math.min(...groottes) * TOLERANTIE_FACTOR : STANDAARD_TOLERANTIE;
}

/**
 * Groepeert tekststukken van één pdf-pagina tot regels: stukken met (ongeveer) dezelfde basislijn
 * vormen één regel, regels van boven naar onder, stukken binnen een regel van links naar rechts.
 * Tussen twee stukken komt een spatie, tenzij een van beide aan die kant al witruimte heeft of de
 * horizontale tussenruimte (volgens `width`) bijna nul is. Een stuk met `hasEOL` eindigt een woord.
 * Witruimte wordt samengevouwen; lege regels vallen weg. Twee kolommen op dezelfde hoogte komen op
 * één regel (eerst links, dan rechts); de leerplanlezer meldt zulke regels.
 */
export function regelsUitTekstItems(items: readonly PdfTekstItem[]): string[] {
  const stukken: Stuk[] = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || it.str === '') continue;
    const t = it.transform;
    if (!Array.isArray(t) || t.length < 6 || !Number.isFinite(t[4]) || !Number.isFinite(t[5])) continue;
    stukken.push({
      str: it.str,
      x: t[4],
      y: t[5],
      grootte: grootteVan(t),
      breedte: typeof it.width === 'number' && Number.isFinite(it.width) ? it.width : undefined,
      eol: it.hasEOL === true,
    });
  }
  // Van boven naar onder (in pdf-ruimte loopt y naar boven); bij gelijke y van links naar rechts.
  const volgorde = stukken.map((s, i) => ({ s, i })).sort((a, b) => b.s.y - a.s.y || a.s.x - b.s.x || a.i - b.i);
  const regels: Stuk[][] = [];
  let huidig: Stuk[] = [];
  let referentie: Stuk | undefined;
  for (const { s } of volgorde) {
    if (referentie && Math.abs(referentie.y - s.y) <= tolerantie(referentie, s)) {
      huidig.push(s);
      // De basislijn van de regel is die van het grootste stuk: een klein verhoogd voetnootcijfer
      // vooraan mag de regel niet verschuiven.
      if ((s.grootte ?? 0) > (referentie.grootte ?? 0)) referentie = s;
      continue;
    }
    if (huidig.length > 0) regels.push(huidig);
    huidig = [s];
    referentie = s;
  }
  if (huidig.length > 0) regels.push(huidig);

  const uit: string[] = [];
  for (const regel of regels) {
    const opX = regel.map((s, i) => ({ s, i })).sort((a, b) => a.s.x - b.s.x || a.i - b.i).map((p) => p.s);
    let tekst = '';
    let vorige: Stuk | undefined;
    for (const s of opX) {
      if (vorige !== undefined && !/\s$/.test(vorige.str) && !/^\s/.test(s.str) && !aanElkaar(vorige, s)) tekst += ' ';
      tekst += s.str;
      vorige = s;
    }
    const schoon = tekst.replace(/\s+/g, ' ').trim();
    if (schoon !== '') uit.push(schoon);
  }
  return uit;
}

/** Twee stukken horen aan elkaar (geen spatie) als de tussenruimte bijna nul is. */
function aanElkaar(a: Stuk, b: Stuk): boolean {
  if (a.eol || a.breedte === undefined) return false;
  const grootte = a.grootte ?? b.grootte;
  const drempel = grootte !== undefined ? grootte * LIJM_FACTOR : 1;
  return b.x - (a.x + a.breedte) <= drempel;
}

/** Zoveel lezen we hoogstens; daarboven is `afgekapt` waar. Ruim boven een echt leerplan. */
const MAX_PAGINAS = 1500;
const MAX_TEKENS = 3_000_000;

export interface PdfRegels {
  paginas: { nummer: number; regels: string[] }[];
  /** Alle regels met "\n"; pagina's gescheiden door een lege regel (lege pagina's tellen niet mee). */
  tekst: string;
  pages: number;
  /** Waar als niet alles gelezen is (meer dan 1500 pagina's of 3.000.000 tekens). */
  afgekapt: boolean;
}

/**
 * Leest een pdf per pagina en per regel (zie `regelsUitTekstItems`). Geen afkapping tot 1500
 * pagina's of 3.000.000 tekens; daarboven stopt het lezen vóór de pagina die de grens overschrijdt,
 * en is `afgekapt` waar. Een gescande pdf (zonder tekstlaag) geeft lege pagina's.
 */
export async function extractPdfLines(src: Blob): Promise<PdfRegels> {
  // Dezelfde legacy-build en worker als extractPdfText.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const data = await src.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const pages = doc.numPages;
    const paginas: { nummer: number; regels: string[] }[] = [];
    const delen: string[] = [];
    let totaal = 0;
    let afgekapt = pages > MAX_PAGINAS;
    const laatste = Math.min(pages, MAX_PAGINAS);
    for (let n = 1; n <= laatste; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfTekstItem[] = [];
      for (const it of content.items) {
        if ('str' in it) items.push({ str: it.str, transform: it.transform, width: it.width, hasEOL: it.hasEOL });
      }
      page.cleanup();
      const regels = regelsUitTekstItems(items);
      const paginaTekst = regels.join('\n');
      const extra = paginaTekst.length + (delen.length > 0 && paginaTekst ? 2 : 0);
      if (totaal + extra > MAX_TEKENS) {
        afgekapt = true;
        break;
      }
      paginas.push({ nummer: n, regels });
      if (paginaTekst) {
        delen.push(paginaTekst);
        totaal += extra;
      }
    }
    return { paginas, tekst: delen.join('\n\n'), pages, afgekapt };
  } finally {
    try { await task.destroy(); } catch { /* al opgeruimd */ }
  }
}
