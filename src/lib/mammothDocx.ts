// ── .docx lezen met mammoth (aparte, lui geladen brok) ─────────────────────
//
// Dit bestandje bestaat om één reden: mammoth is groot (± 700 kB) en mag nooit
// in het kritieke pad terechtkomen. Door mammoth hier STATISCH te importeren en
// dit bestand elders DYNAMISCH te laden (zie lib/importers.ts), krijgt de brok
// de naam "mammothDocx-…" en valt ze onder het eigen mammoth-budget in
// vite.config.ts — in plaats van onder de naam "index", waar ze niet te
// onderscheiden zou zijn van de hoofdbundel.
//
// De rest van de app praat met `docxToHtml`; de omzetting naar markdown
// gebeurt in lib/htmlToMarkdown.ts, met eigen (geteste) code.

import mammoth from 'mammoth';

/**
 * Afbeeldingen komen standaard als base64-data-URL in de html; bij een document
 * vol foto's zijn dat tientallen megabytes tekst. We vervangen ze door een lege
 * `<img>`, die de markdown-omzetter daarna weglaat.
 */
function imageOptions(): Record<string, unknown> | undefined {
  try {
    const convertImage = mammoth.images.imgElement(async () => ({ src: '' }));
    return convertImage ? { convertImage } : undefined;
  } catch {
    // Zonder deze optie werkt het ook; de afbeeldingen worden dan gewoon
    // (als grote data-URL) genegeerd door de markdown-omzetter.
    return undefined;
  }
}

/**
 * Word-stijlen die mammoth zelf niet kent. De stijl "Titel" (in het bestand heet hij "Title") is de titel van het
 * document: ze wordt een kop van niveau 1, zodat de cursus ernaar heet. Zonder deze regels is het een gewone alinea
 * vóór de eerste kop: dan wordt de titelregel een extra hoofdstuk en krijgt de cursus de naam van het eerste
 * hoofdstuk ("Hoofdstuk 1: …"). De stijl wordt herkend op naam (zoals Word hem bewaart) en op id.
 */
export const TITELSTIJLEN: readonly string[] = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='title'] => h1:fresh",
  "p[style-name='Titel'] => h1:fresh",
  "p[style-name='titel'] => h1:fresh",
  'p.Title => h1:fresh',
  'p.Titel => h1:fresh',
];

/** Zet een .docx om naar html. Gooit door als het bestand onleesbaar is. */
export async function docxToHtml(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer }, { ...imageOptions(), styleMap: [...TITELSTIJLEN] });
  return result?.value ?? '';
}
