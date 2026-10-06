// Documenttitel per route: een schermlezer en de tabbladbalk melden zo waar je bent.
// Op leerlingroutes staat nooit het woord "widget" (daar heet het "oefening").
// Volgorde telt: het eerste voorvoegsel dat past, wint.
const TITELS: [string, string][] = [
  ['/widgets', 'Widgets'],
  ['/nieuw', 'Nieuwe widget'],
  ['/bewerk', 'Widget bewerken'],
  ['/print', 'Afdrukken'],
  ['/speel', 'Oefening'],
  ['/open', 'Oefening'],
  ['/meedoen', 'Meedoen'],
  ['/voortgang', 'Mijn voortgang'],
  ['/leerling', 'Mijn klas'],
  ['/klas/open', 'Mijn klas'],
  ['/klas', 'Klas'],
  ['/klassen', 'Klassen'],
  ['/inleverpunt', 'Inleverpunt'],
  ['/resultaten', 'Resultaten'],
  ['/cursussen', 'Cursussen'],
  ['/cursus/bewerk', 'Cursus bewerken'],
  ['/cursus/volg', 'Cursus volgen'],
  ['/cursus/print', 'Cursus afdrukken'],
  ['/cursus', 'Cursus'],
  ['/leerplannen', 'Leerplannen'],
  ['/importeren', 'Importeren'],
  ['/ai-studio', 'AI-studio'],
  ['/ai-instellingen', 'AI-instellingen'],
  ['/hulp', 'Hulp'],
  ['/privacy', 'Privacy en opslag'],
  ['/', 'Start'],
];

/** "<label> · Boosterz" voor een pad uit de hash-router (bv. "/widgets"). */
export function paginaTitel(pathname: string): string {
  const pad = pathname.replace(/\/+$/, '') || '/';
  // Onbekende paden toont de router als de meedoenpagina.
  const label = TITELS.find(([v]) => pad === v || (v !== '/' && pad.startsWith(`${v}/`)))?.[1] ?? 'Meedoen';
  return `${label} · Boosterz`;
}

/** Houdt `document.title` gelijk aan de route van een (hash-)router. */
export function volgRoute(
  router: { state: { location: { pathname: string } }; subscribe: (fn: () => void) => unknown },
  zet: (titel: string) => void = (titel) => { document.title = titel; },
) {
  const synchroniseer = () => zet(paginaTitel(router.state.location.pathname));
  synchroniseer();
  router.subscribe(synchroniseer);
}
