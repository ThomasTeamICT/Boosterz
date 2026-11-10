// ── Service worker registreren (alleen in productie) ───────────────────────
//
// Zie src/offline/serviceWorker.js voor wat de service worker doet. Deze
// module laadt pas na `load` (zie main.tsx), als eigen kleine chunk: ze hoort
// niet op het kritieke pad en weegt dus niet op de hoofdbundel. Hier:
//  - registreren;
//  - de chunks en gegevens die al geladen werden vóór de service worker
//    bestond, alsnog laten bewaren (alleen relevant bij het allereerste
//    bezoek), ook wat nog onderweg was toen hij de pagina overnam;
//  - een wachtende nieuwe versie laten overnemen, maar alleen als dat niemand
//    stoort (de service worker beslist; zie 'boosterz:activate' daar).
// Een mislukte registratie is stil: de app werkt dan gewoon zonder offline-schil.

import { assetUrlsToWarm, nietLangsServiceWorker, serviceWorkerUrls } from '../lib/swUrls';

/** @param entryUrl `import.meta.url` van de hoofdbundel */
export async function registerServiceWorker(entryUrl: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;
    const urls = serviceWorkerUrls(entryUrl);
    if (!urls) return;
    const reg = await navigator.serviceWorker.register(urls.script, { scope: urls.scope, updateViaCache: 'none' });
    afterRegister(reg, urls.scope, entryUrl);
  } catch (err) {
    console.warn('Boosterz: offline-modus niet beschikbaar.', err);
  }
}

function afterRegister(reg: ServiceWorkerRegistration, scope: string, entryUrl: string): void {
  const sw = navigator.serviceWorker;

  // Al geladen chunks laten bewaren: bij het eerste bezoek zodra de service
  // worker actief is, en nog eens wanneer hij de pagina overneemt.
  const warm = () => {
    try {
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      const urls = assetUrlsToWarm(loaded, scope);
      if (urls.length > 0) reg.active?.postMessage({ type: 'boosterz:cache-urls', urls });
    } catch {
      /* niet erg */
    }
  };
  void sw.ready.then(warm);
  sw.addEventListener('controllerchange', warm, { once: true });

  // Wat nog onderweg was toen de service worker de pagina overnam, kwam niet
  // langs hem en stond nog niet in de lijst van `warm` (bv. het leerplan van
  // een lesplan, dat pas na de index vertrekt). Ook dat alsnog laten bewaren:
  // alleen bij het eerste bezoek, en hooguit twee minuten.
  if (!sw.controller && typeof PerformanceObserver === 'function') {
    try {
      const obs = new PerformanceObserver((lijst) => {
        const urls = assetUrlsToWarm(nietLangsServiceWorker(lijst.getEntries() as PerformanceResourceTiming[]), scope);
        if (urls.length > 0) void sw.ready.then((r) => r.active?.postMessage({ type: 'boosterz:cache-urls', urls }));
      });
      obs.observe({ type: 'resource' });
      setTimeout(() => obs.disconnect(), 120000);
    } catch {
      /* niet erg */
    }
  }

  // Een update ligt klaar? Vraag of ze mag overnemen. Alleen wanneer deze
  // pagina al door een service worker bediend wordt: bij de eerste installatie
  // is er niets om over te nemen.
  const ask = (worker: ServiceWorker | null) => {
    if (worker && sw.controller) worker.postMessage({ type: 'boosterz:activate', entry: entryUrl });
  };
  ask(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') ask(worker);
    });
  });
}
