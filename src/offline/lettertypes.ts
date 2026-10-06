// ── Lettertypes in de voorcache van de service worker ───────────────────────
//
// De lettertypes staan in de app zelf (src/assets/fonts, @font-face in
// global.css). Vite zet ze als gehashte bestanden in assets/ en schrijft hun
// adres in de css. De service worker bewaart bij de installatie het kritieke
// leerlingpad (de hoofdbundel en haar css); deze functie zoekt de lettertypes
// waar die css naar verwijst, zodat ze mee in de voorcache gaan. Anders zou
// een toestel dat offline opstart de lettertypes missen die bij het eerste
// bezoek nog niet nodig waren (bv. cursief of latin-ext).
//
// Pure functie: geen Node-API's (wordt gebruikt door vite.config.ts en getest
// in lettertypes.test.ts).

const FONT_RE = /\.(?:woff2?|ttf|otf)$/i;

/**
 * Lettertypebestanden waar een css-bestand uit de build naar verwijst.
 *  - `found`: paden in de build (zoals in `bundleFiles`), gesorteerd;
 *  - `missing`: lettertype-adressen die niet bij een bestand van de build
 *    horen (geen data:- of externe adressen: die tellen niet mee).
 * `cssFile` is het pad van de css in de build (bv. "assets/index-abc.css"):
 * relatieve adressen worden daartegen opgelost.
 */
export function fontRefsInCss(
  css: string, cssFile: string, bundleFiles: Iterable<string>,
): { found: string[]; missing: string[] } {
  const known = new Set(bundleFiles);
  const found = new Set<string>();
  const missing = new Set<string>();
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/g;
  for (const m of css.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    const ref = raw.split(/[?#]/)[0];
    if (!FONT_RE.test(ref)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue; // data:, https:, …
    let path: string;
    try {
      path = decodeURIComponent(new URL(ref, `https://app.invalid/${cssFile}`).pathname.slice(1));
    } catch {
      missing.add(raw);
      continue;
    }
    if (known.has(path)) found.add(path);
    else missing.add(raw);
  }
  return { found: [...found].sort(), missing: [...missing].sort() };
}
