// ── Service worker: waar staat hij, en wat moet hij alsnog bewaren ─────────
//
// Pure hulpfuncties voor src/offline/register.ts. Apart van lib/offline.ts:
// de registratie laadt pas na `load` als eigen chunk, en Rollup houdt een
// module volledig in de hoofdbundel zodra één export daar gebruikt wordt.
// Getest in src/lib/swUrls.test.ts.

/**
 * Waar staan sw.js en de scope, gegeven de URL van de hoofdbundel
 * (`import.meta.url`, bv. https://…/Boosterz/assets/index-abc.js)? De bundel
 * staat altijd in `assets/` onder de map van de app; sw.js staat in die map
 * zelf. Zo klopt het onder /Boosterz/ én onder / (lokale preview), los van de
 * URL van het document. `null` wanneer de bundel niet in `assets/` staat: dan
 * registreren we liever niets dan iets verkeerds.
 */
export function serviceWorkerUrls(entryUrl: string): { script: string; scope: string } | null {
  let url: URL;
  try {
    url = new URL(entryUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const m = /^(.*\/)assets\/[^/]+$/.exec(url.pathname);
  if (!m) return null;
  const scope = url.origin + m[1];
  return { script: scope + 'sw.js', scope };
}

/**
 * Welke al geladen eigen bestanden moet de service worker alsnog bewaren? Bij
 * het allereerste bezoek laadt de pagina een deel van haar chunks en gegevens
 * (bv. de json-bestanden van het GO! en de minimumdoelen) nog vóór de service
 * worker er is. Alleen bestanden van deze app tellen, zonder query; de service
 * worker bewaart er alleen wat bij zijn build hoort (KNOWN).
 */
export function assetUrlsToWarm(resourceUrls: readonly string[], scope: string): string[] {
  const prefix = scope;
  const seen = new Set<string>();
  for (const raw of resourceUrls) {
    if (typeof raw !== 'string' || !raw.startsWith(prefix)) continue;
    const clean = raw.split('#')[0];
    if (clean.includes('?')) continue;
    seen.add(clean);
  }
  return [...seen];
}

/**
 * De bestanden die niet langs de service worker kwamen: een resource-entry
 * met `workerStart` 0 (de pagina was nog niet bediend toen het verzoek
 * vertrok). Bij het eerste bezoek is dat ook wat nog onderweg was toen de
 * service worker de pagina overnam; dat moet hij alsnog bewaren.
 */
export function nietLangsServiceWorker(entries: readonly { name: string; workerStart?: number }[]): string[] {
  return entries.filter((e) => !e.workerStart).map((e) => e.name);
}
