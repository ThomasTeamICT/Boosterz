import { defineConfig, type Logger, type Plugin, type Rollup } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  NEVER_PRECACHE,
  PRECACHE_PUBLIC,
  VENDOR_CHUNK,
  WIDGET_ICONS_CHUNK,
  checkCriticalPath,
  collectShell,
  iconFiles,
  knownFiles,
  lucideImportNames,
  manualChunkFor,
  parseLucideExports,
  renderServiceWorker,
} from './src/lib/swBuild';
import { injectCsp, verifyCsp } from './src/offline/csp';
import { fontRefsInCss } from './src/offline/lettertypes';

/**
 * Bundelbudget — bewaken i.p.v. onderdrukken.
 *
 * `chunkSizeWarningLimit` alleen omhoog draaien maakt de waarschuwing stil, niet
 * de bundel klein. Daarom staan de grenzen hier expliciet per chunk, dicht tegen
 * de gemeten werkelijkheid aan. Groeit een chunk erdoorheen, dan valt dat op bij
 * het bouwen. Een budget verhogen mag — maar dan bewust, in deze lijst, niet per
 * ongeluk.
 *
 * Het kritieke leerlingpad (CRITICAL_PATH) is geen bestand maar een som: de
 * hoofdbundel (index-*.js) plus alles wat ze statisch importeert, recursief.
 * Dat is wat een leerling met een code MOET downloaden voor er iets op het
 * scherm staat. Sinds de chunk 'vendor' bestaat, zijn dat twee bestanden;
 * één bestand meten zou de helft missen. Daarom:
 *  - het budget telt de hele statische sluiting van de hoofdbundel;
 *  - daarin mogen alleen de hoofdbundel en 'vendor' zitten. Belandt er iets
 *    anders in (bv. 'widget-icons', omdat een icoon van het leerlingpad in
 *    EAGER_ICON_NAMES ontbreekt), dan faalt de build;
 *  - 'vendor' mag zelf niets importeren (zie manualChunkFor in swBuild.ts);
 *  - meer dan 5 % over het budget laat de build falen; minder is een
 *    waarschuwing, zoals bij de andere budgetten. De uitrol faalt alleen op
 *    fouten.
 *
 * Waarom deze getallen (gemeten, ongecomprimeerd, kB = 1000 bytes):
 *  - kritieke leerlingpad: react + react-dom + react-router + lucide-basis en
 *    de iconen van het leerlingpad + de leerlingroutes (/speel, /open,
 *    /meedoen). Geschiedenis: 306 kB → 327 kB (sep. 2026, iconen van de 38
 *    widgetsoorten; leerkrachtschil en startpagina eruit) → 329,1 kB (104,1 kB
 *    gzip), alles in één index-*.js. Met 'vendor' en 'widget-icons' (sep.
 *    2026): 155,3 + 169,2 = 324,5 kB (102,5 kB gzip). Na de reviewronde
 *    (voorbeeldmateriaal uit het leerlingpad, focus in het leespaneel):
 *    155,7 + 169,2 = 325,0 kB (102,6 kB gzip). Daarna groeide de lijst
 *    lui geladen routes in App.tsx: 325,9 kB, en met de route naar het
 *    scherm "Stel je eigen doelenlijst samen" (okt. 2026) 326,3 kB (103,0 kB
 *    gzip); een route kost ±0,4 kB. De herstelronde na de debugronde
 *    (okt. 2026: soepeler verbeteren in utils.ts, focus en focusval in
 *    ui.tsx/Layout.tsx) bracht het op 327,4 kB (103,5 kB gzip); daarna de
 *    beveiliging van links en bestanden (veiligeUrl.ts) en het eerlijker
 *    leerlingscherm (deadline, timer, pogingen in PlayerPage): 329,5 kB
 *    (104,2 kB gzip); de contrastcontrole op de accentkleur van de speler
 *    (readableAccent, W15d) kost 0,8 kB: 330,6 kB (104,7 kB gzip); het
 *    opruimen van verlopen tussentijds werk met bestanden (OP13, luie import
 *    in autosave.ts) en de cursuslezer brachten het op 331,1 kB (104,9 kB
 *    gzip); gedeelde inhoud zonder stil overschrijven (register van zuivere
 *    kopieën, samenvoegen van voortgang), eerlijke meldingen bij volle opslag
 *    en het tabbladslot van de mediaopslag (Web Lock, zodat geen afbeelding
 *    gewist wordt die een ander tabblad nog toont) op 332,7 kB (105,5 kB
 *    gzip). Het budget ligt ±0,5 kB boven die meting, zodat elke groei meteen opvalt; wie meer nodig heeft,
 *    verhoogt het bewust, hier. Let op: vóór sep. 2026 mat dit budget vóór
 *    Vite de preloadlijst invulde, dus ±9 kB te licht (zie order: 'post').
 *  - vendor: React, React DOM, scheduler, de lucide-basis en de iconen van het
 *    leerlingpad, 169,2 kB. Groeit alleen bij een nieuwe versie van die
 *    pakketten of een langere EAGER_ICON_NAMES.
 *  - widget-icons: alle iconen van de lui geladen editors en pagina's samen
 *    (64,3 kB); elk nieuw icoon kost er ±0,4 kB bij.
 *  - pdf.js: wordt pas opgehaald wanneer iemand echt een pdf opent; groot,
 *    maar nooit onderdeel van het leerlingpad.
 *  - de rest: paginachunks en widgetmodules; die horen klein te blijven.
 */
const CRITICAL_PATH = {
  label: 'hoofdbundel (kritieke leerlingpad)',
  maxKb: 333,
  /** boven 5 % te veel faalt de build */
  hardFactor: 1.05,
  /** wat naast de hoofdbundel in de statische sluiting mag zitten */
  allowed: [VENDOR_CHUNK],
  /** wat zelf niets mag importeren */
  leaves: [VENDOR_CHUNK],
};
/** Per chunk; de hoofdbundel zelf telt in CRITICAL_PATH. */
const BUDGETS: { test: RegExp; label: string; maxKb: number }[] = [
  { test: /^assets\/vendor-[\w-]+\.js$/, label: 'vendor (React, Lucide-basis, iconen van het leerlingpad)', maxKb: 170.2 },
  { test: /^assets\/widget-icons-[\w-]+\.js$/, label: 'widget-icons (lui geladen)', maxKb: 80 },
  { test: /^assets\/pdf-[\w-]+\.js$/, label: 'pdf.js (lui geladen)', maxKb: 560 },
  { test: /mammoth/i, label: 'mammoth (.docx-import, lui geladen)', maxKb: 720 },
  { test: /jsqr/i, label: 'jsQR (QR-scanner, lui geladen)', maxKb: 140 },
];
/** Alle overige js-chunks: paginachunks en widgetmodules. */
const DEFAULT_MAX_KB = 80;

function bundleBudget(): Plugin {
  let logger: Logger | undefined;
  let root = '';
  return {
    name: 'wf-bundle-budget',
    apply: 'build',
    configResolved(config) {
      logger = config.logger;
      root = config.root;
    },
    // order 'post': pas NA Vite's eigen generateBundle (vite:build-import-analysis)
    // staat de preloadlijst (__vite__mapDeps) in de code. Zonder 'post' mat dit
    // budget de hoofdbundel ±9 kB te licht (320 i.p.v. 329 kB).
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks = Object.values(bundle).filter(
          (o): o is Rollup.OutputChunk => o.type === 'chunk' && o.fileName.endsWith('.js')
        );
        // kB = 1000 bytes, zoals Vite ze rapporteert, zodat de getallen
        // hierboven met de buildtabel overeenkomen.
        const bytes = (c: Rollup.OutputChunk) => Buffer.byteLength(c.code);

        // 1. Het kritieke leerlingpad: de statische sluiting van de hoofdbundel.
        let pad: ReturnType<typeof checkCriticalPath>;
        try {
          pad = checkCriticalPath(
            chunks.map((c) => ({ fileName: c.fileName, name: c.name, isEntry: c.isEntry, imports: c.imports, bytes: bytes(c) })),
            CRITICAL_PATH
          );
        } catch (err) {
          this.error(err instanceof Error ? err.message : String(err));
        }
        const iconen = iconsOnCriticalPath(this, bundle, pad.closure, root);

        // 2. De andere chunks, elk tegen hun eigen budget.
        const overschrijdingen = pad.warnings.map((w) => `  ${w} (${CRITICAL_PATH.label})`);
        for (const c of chunks) {
          if (c.fileName === pad.entry) continue; // telt mee in het kritieke leerlingpad
          const kb = bytes(c) / 1000;
          const budget = BUDGETS.find((b) => b.test.test(c.fileName));
          const max = budget?.maxKb ?? DEFAULT_MAX_KB;
          if (kb > max) {
            overschrijdingen.push(`  ${c.fileName} — ${kb.toFixed(1)} kB > budget ${max} kB${budget ? ` (${budget.label})` : ''}`);
          }
        }
        if (overschrijdingen.length > 0) {
          this.warn(
            `\nBundelbudget overschreden:\n${overschrijdingen.join('\n')}\n` +
              'Snoei de chunk, of verhoog het budget bewust in vite.config.ts (CRITICAL_PATH of BUDGETS).\n'
          );
        }
        if (iconen.overbodig.length > 0) {
          this.warn(
            `EAGER_ICON_NAMES noemt iconen die geen module op het leerlingpad gebruikt: ${iconen.overbodig.join(', ')}. ` +
              "Ze zitten zo onnodig in 'vendor', op het kritieke leerlingpad. Haal ze uit de lijst in vite.config.ts."
          );
        }

        // 3. Fouten laten de build (en dus de uitrol) falen.
        if (pad.errors.length > 0) {
          const hint = pad.intruders.some((c) => c.name === WIDGET_ICONS_CHUNK)
            ? `\nIconen op het leerlingpad die niet in EAGER_ICON_NAMES (vite.config.ts) staan: ${
                iconen.ontbrekend.join(', ') || '(niet gevonden; zoek imports uit lucide-react in de hoofdbundel)'
              }.\nZet ze in de lijst als ze echt op het leerlingpad horen; anders hoort de module die ze gebruikt daar niet.`
            : '';
          this.error(`\nBuildcontrole kritieke leerlingpad:\n${pad.errors.map((e) => `  ${e}`).join('\n')}${hint}\n`);
        }

        const gz = pad.closure.reduce((s, f) => {
          const c = bundle[f];
          return s + (c?.type === 'chunk' ? gzipSync(c.code).length : 0);
        }, 0);
        logger?.info(
          `Kritieke leerlingpad: ${pad.closure.map((f) => f.replace(/^assets\//, '')).join(' + ')} = ` +
            `${pad.kb.toFixed(1)} kB (gzip ${(gz / 1000).toFixed(1)} kB), budget ${CRITICAL_PATH.maxKb} kB`
        );
      },
    },
  };
}

/**
 * Welke Lucide-iconen importeert de eigen code op het leerlingpad? Alleen voor
 * de meldingen: de beslissing zelf valt op de sluiting (checkCriticalPath).
 *  - ontbrekend: gebruikt op het leerlingpad, maar niet in EAGER_ICON_NAMES
 *    (dus in 'widget-icons'), met de module die het gebruikt;
 *  - overbodig: in EAGER_ICON_NAMES, maar door geen module op het leerlingpad
 *    geïmporteerd.
 */
function iconsOnCriticalPath(
  ctx: Rollup.PluginContext,
  bundle: Rollup.OutputBundle,
  closure: readonly string[],
  root: string
): { ontbrekend: string[]; overbodig: string[] } {
  const gebruikt = new Set<string>();
  const ontbrekend: string[] = [];
  for (const file of closure) {
    const chunk = bundle[file];
    if (chunk?.type !== 'chunk') continue;
    for (const id of chunk.moduleIds) {
      const p = id.replace(/\\/g, '/');
      if (p.startsWith('\0') || p.includes('/node_modules/')) continue;
      const code = ctx.getModuleInfo(id)?.code;
      if (!code) continue;
      for (const naam of lucideImportNames(code)) {
        const icoon = LUCIDE_EXPORTS.get(naam);
        if (!icoon) continue;
        gebruikt.add(icoon);
        if (!EAGER_ICON_FILES.has(icoon)) ontbrekend.push(`${naam} (${path.relative(root, id)})`);
      }
    }
  }
  const overbodig = EAGER_ICON_NAMES.filter((n) => !gebruikt.has(LUCIDE_EXPORTS.get(n)!));
  return { ontbrekend, overbodig };
}

// ── Lucide-iconen: welke op het leerlingpad, welke in 'widget-icons' ────────
//
// De verdeling zelf staat in manualChunkFor (src/lib/swBuild.ts). Deze lijst
// noemt de iconen die de eigen code op het leerlingpad (hoofdbundel) gebruikt:
// die gaan mee in 'vendor'. Alle andere iconen gaan samen in 'widget-icons',
// in plaats van ±74 minichunks van 0,3 à 0,6 kB.
//
// De buildcontrole bewaakt de lijst in twee richtingen:
//  - ontbreekt een icoon, dan importeert de hoofdbundel 'widget-icons' en
//    faalt de build, met de naam van het icoon en de module die het gebruikt;
//  - staat er een icoon te veel in, dan volgt een waarschuwing: het kost
//    bytes op het kritieke pad.
// Namen zoals lucide-react ze exporteert; aliassen (Grid2X2Check) mogen ook.
const EAGER_ICON_NAMES = [
  // src/widgets/registry.tsx: icoon per widgetsoort, getoond aan de speler
  'ArrowLeftRight', 'Brain', 'Brush', 'Calculator', 'CalendarCheck', 'ChartPie', 'ChartSpline',
  'CircleQuestionMark', 'Clapperboard', 'Columns2', 'Compass', 'Dices', 'FerrisWheel', 'FileText',
  'Film', 'GalleryHorizontal', 'Grid2x2Check', 'Grid3x3', 'Headphones', 'Keyboard', 'LayoutGrid',
  'Link2', 'ListChecks', 'MapPin', 'MonitorPlay', 'Network', 'PencilRuler', 'Piano', 'Puzzle',
  'ScanEye', 'Shuffle', 'SquareStack', 'TextSearch', 'Ticket', 'Timeline', 'Timer', 'Vote', 'ZoomIn',
  // src/components/ui.tsx (meldingen) en src/pages/OpenSharedPage.tsx
  'Check', 'Copy', 'ImagePlus', 'TriangleAlert', 'X',
];

/** dist/esm/lucide-react.mjs van de geïnstalleerde lucide-react: de barrel met alle namen. */
function lucideBarrel(): string {
  const pkgPath = createRequire(import.meta.url).resolve('lucide-react/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { module?: string };
  if (!pkg.module) throw new Error('vite.config: lucide-react heeft geen "module"-veld meer; kijk de iconenverdeling na');
  return path.join(path.dirname(pkgPath), pkg.module);
}
const LUCIDE_EXPORTS = parseLucideExports(readFileSync(lucideBarrel(), 'utf8'));
/** Faalt luid bij een naam die lucide-react niet (meer) kent. */
const EAGER_ICON_FILES = iconFiles(EAGER_ICON_NAMES, LUCIDE_EXPORTS);

/**
 * Offline-schil: schrijft bij elke build dist/sw.js uit.
 *
 * Het sjabloon staat in src/offline/serviceWorker.js (strategie en uitleg
 * daar). Deze plugin vult het aan met wat pas na het bundelen vastligt:
 *  - de voorcache: index.html, het kritieke leerlingpad (de hoofdbundel en
 *    'vendor', met hun css), de lettertypes waar die css naar verwijst (zelf
 *    gehost, zie src/offline/lettertypes.ts), het manifest en het icoon:
 *    dezelfde statische sluiting als in bundleBudget. Lazy chunks (pagina's, widgets,
 *    'widget-icons', pdf.js, mammoth, jsQR) en de
 *    voorbeeldcursus komen er niet in; die bewaart de service worker pas
 *    wanneer ze voor het eerst gebruikt worden;
 *  - de lijst van alle bestanden van deze build, om bij een update op te ruimen;
 *  - een versie: een hash over het sjabloon, de bestandsnamen (die zelf al
 *    een inhoudshash dragen), index.html en de openbare bestanden in de
 *    voorcache. Zelfde build = zelfde sw.js, dus geen onnodige update.
 *
 * `enforce: 'post'`: dan heeft Vite index.html al in de bundel gezet. sw.js is
 * een 'asset', geen chunk: het bundelbudget telt het niet mee.
 */
function offlineShell(): Plugin {
  const template = fileURLToPath(new URL('./src/offline/serviceWorker.js', import.meta.url));
  let publicDir = '';
  return {
    name: 'boosterz-offline-shell',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    buildStart() {
      this.addWatchFile(template); // `vite build --watch`: ook bij een gewijzigd sjabloon opnieuw bouwen
    },
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') this.error('offlineShell: index.html ontbreekt in de bundel');
      if (bundle['sw.js']) this.error('offlineShell: er bestaat al een sw.js in de bundel');
      const indexHtml = typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8');

      const shell = collectShell(
        Object.values(bundle).map((o) =>
          o.type === 'chunk'
            ? { fileName: o.fileName, type: o.type, isEntry: o.isEntry, imports: o.imports, importedCss: [...(o.viteMetadata?.importedCss ?? [])] }
            : { fileName: o.fileName, type: o.type }
        ),
        indexHtml
      );
      const publicFiles = listFiles(publicDir);
      const precachePublic = PRECACHE_PUBLIC.filter((f) => publicFiles.includes(f));
      // De lettertypes van de schil-css: anders mist een toestel dat offline
      // opstart de stijlen die bij het eerste bezoek nog niet nodig waren.
      const fonts = new Set<string>();
      for (const file of shell.files.filter((f) => f.endsWith('.css'))) {
        const css = bundle[file];
        if (css?.type !== 'asset') continue;
        const src = typeof css.source === 'string' ? css.source : Buffer.from(css.source).toString('utf8');
        const refs = fontRefsInCss(src, file, Object.keys(bundle));
        refs.found.forEach((f) => fonts.add(f));
        if (refs.missing.length > 0) {
          this.warn(`offlineShell: lettertypes in ${file} niet gevonden in de build (niet in de voorcache): ${refs.missing.join(', ')}`);
        }
      }
      const precache = [...shell.files, ...[...fonts].sort(), ...precachePublic];
      const zwaar = precache.filter((f) => NEVER_PRECACHE.test(f));
      if (zwaar.length > 0) {
        this.warn(`offlineShell: zware bibliotheek in de voorcache (statisch geïmporteerd?): ${zwaar.join(', ')}`);
      }
      const known = knownFiles(Object.keys(bundle), publicFiles);
      const source = readFileSync(template, 'utf8');

      const hash = createHash('sha256');
      hash.update(source).update('\0').update(JSON.stringify({ entry: shell.entry, precache, known }));
      hash.update('\0').update(indexHtml);
      for (const f of precachePublic) hash.update('\0').update(readFileSync(path.join(publicDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(source, { version, entry: shell.entry, precache, known }),
      });
    },
  };
}

/**
 * Content-Security-Policy als tweede verdedigingslinie (debugronde okt. 2026,
 * V1). Uitleg en het beleid zelf: src/offline/csp.ts.
 *  - alleen bij de build: de dev-server gebruikt een inline React-refresh-script;
 *  - transformIndexHtml, order 'post': pas als Vite zijn eigen tags in
 *    index.html gezet heeft, zodat de hashes over de echte inline scripts gaan;
 *  - generateBundle, order 'post': een tweede controle op de index.html zoals
 *    ze werkelijk in dist/ komt. Wijzigt een latere stap een inline script,
 *    dan faalt de build, in plaats van dat de browser het vangnet stil weigert.
 */
function contentSecurityPolicy(): Plugin {
  const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');
  return {
    name: 'boosterz-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return injectCsp(html, sha256);
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (!html || html.type !== 'asset') this.error('csp: index.html ontbreekt in de bundel');
        const source = typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8');
        const errors = verifyCsp(source, sha256);
        if (errors.length > 0) this.error(`\nContent-Security-Policy in index.html:\n${errors.map((e) => `  ${e}`).join('\n')}\n`);
      },
    },
  };
}

/** Alle bestanden onder een map, relatief en met '/' als scheiding. */
function listFiles(dir: string): string[] {
  if (!dir || !existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (sub: string) => {
    for (const d of readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel);
      else if (d.isFile()) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

// Relative base zodat de build ook werkt op GitHub Pages of een subpad.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), bundleBudget(), offlineShell()],
  build: {
    // Vite's eigen grens stond op 1200 kB: dat onderdrukte élke waarschuwing.
    // Nu ligt ze net boven de pdf.js-chunk (de enige legitiem grote chunk), en
    // bewaakt het budget hierboven de rest — inclusief het leerlingpad.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        // 'vendor' en 'widget-icons': zie manualChunkFor in src/lib/swBuild.ts
        // en EAGER_ICON_NAMES hierboven. De buildcontrole (bundleBudget)
        // bewaakt dat alleen 'vendor' mee op het kritieke leerlingpad komt.
        manualChunks: (id) => manualChunkFor(id, EAGER_ICON_FILES),
      },
    },
  },
});
