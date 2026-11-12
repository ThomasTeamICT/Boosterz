// Documenttitel per route: een schermlezer en de tabbladbalk melden zo waar je bent.
// Nergens staat het woord "widget": voor leerling en leerkracht heet het "oefening".
// Volgorde telt: het eerste voorvoegsel dat past, wint.
const TITELS: [string, string][] = [
  ['/widgets', 'Oefeningen'],
  ['/nieuw', 'Nieuwe oefening'],
  ['/bewerk', 'Oefening bewerken'],
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
  ['/cursussen/richtingen', 'Studierichtingen'],
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
  ['/basis/kies', 'Kies je leerjaar · Basisonderwijs'],
  ['/basis/leerjaar', 'Mijn leerjaar · Basisonderwijs'],
  ['/basis/moment', 'Doelen per moment · Basisonderwijs'],
  ['/basis/vak', 'Doelen per vak · Basisonderwijs'],
  ['/basis/leerlijn', 'Leerlijn · Basisonderwijs'],
  ['/basis/doel', 'Minimumdoel · Basisonderwijs'],
  ['/basis/zoek', 'Zoeken · Basisonderwijs'],
  ['/basis/go', 'Leerplan en lesplannen van het GO! · Basisonderwijs'],
  ['/basis/lesplannen', 'Lesplannen · Basisonderwijs'],
  ['/basis/lesplan', 'Lesplan · Basisonderwijs'],
  ['/basis/lessenlijn', 'Lessenlijn · Basisonderwijs'],
  ['/basis/leerplandoelen', 'Leerplandoelen · Basisonderwijs'],
  ['/basis/leerplandoel', 'Leerplandoel · Basisonderwijs'],
  // De drie schermen van de Lichtkamer hebben elk een eigen naam: een leerkracht met drie tabbladen open ziet zo welk welk is.
  // Het kind ziet alleen de naam van de les.
  ['/basis/pakket/lichtkamer', 'Lespagina Lichtkamer · Basisonderwijs'],
  ['/basis/bord/lichtkamer', 'Lichtkamer op het bord'],
  ['/basis/oefen/lichtkamer', 'Lichtkamer: schaduwtheater'],
  ['/basis', 'Basisonderwijs'],
  ['/', 'Start'],
];

// Een lesplan, een leerplandoel en de lijst van een vak krijgen hun code in de titel (tabblad, geschiedenis, afdruk). Zelfde
// vorm als LESPLAN_CODE en GO_DOELCODE in basisRoutes.ts, maar zonder import: dit bestand blijft klein.
const LESPLAN = /^\/basis\/lesplan\/lp(\d{4})([a-z]?)$/i;
const LEERPLANDOEL = /^\/basis\/leerplandoel\/([a-z]{2})\.(\d{3,4})$/i;
const LEERPLANDOELEN = /^\/basis\/leerplandoelen\/([a-z]{2})$/i;

/** De titel met code voor een pad van het GO!, of undefined als het pad niet past. */
function goLabel(pad: string): string | undefined {
  let m = LESPLAN.exec(pad);
  if (m) return `Lesplan LP${m[1]}${m[2].toLowerCase()} · Basisonderwijs`;
  m = LEERPLANDOEL.exec(pad);
  if (m) return `Leerplandoel ${m[1].toUpperCase()}.${m[2]} · Basisonderwijs`;
  m = LEERPLANDOELEN.exec(pad);
  if (m) return `Leerplandoelen ${m[1].toUpperCase()} · Basisonderwijs`;
  return undefined;
}

/** "<label> · Boosterz" voor een pad uit de hash-router (bv. "/widgets"). */
export function paginaTitel(pathname: string): string {
  const pad = pathname.replace(/\/+$/, '') || '/';
  // Onbekende paden toont de router als de meedoenpagina.
  const label = goLabel(pad) ?? TITELS.find(([v]) => pad === v || (v !== '/' && pad.startsWith(`${v}/`)))?.[1] ?? 'Meedoen';
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
