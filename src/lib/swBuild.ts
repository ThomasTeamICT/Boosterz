// ── Service worker en buildcontrole: pure hulpfuncties voor vite.config.ts ──
//
// De Vite-plugin `offlineShell` (vite.config.ts) leest de bundel, laat deze
// functies de voorcache en de lijst met bekende bestanden bepalen, en schrijft
// daarmee dist/sw.js uit op basis van het sjabloon src/offline/serviceWorker.js.
//
// De plugin `bundleBudget` gebruikt dezelfde statische sluiting van de
// hoofdbundel als het kritieke leerlingpad, en `manualChunkFor` verdeelt
// React en de Lucide-iconen over de chunks (zie onderaan).
//
// Geen Node- of browser-API's hier: bestanden lezen en hashen doet
// vite.config.ts zelf. Getest in src/lib/swBuild.test.ts.

/** Het deel van een Rollup-uitvoerbestand dat we nodig hebben. */
export interface BundleFile {
  fileName: string;
  type: 'chunk' | 'asset';
  isEntry?: boolean;
  /** statische imports (alleen chunks) */
  imports?: readonly string[];
  /** css die Vite aan deze chunk koppelt (alleen chunks) */
  importedCss?: readonly string[];
}

export interface ServiceWorkerConfig {
  version: string;
  entry: string;
  precache: string[];
  known: string[];
}

/** Openbare bestanden die mee in de voorcache gaan, als ze bestaan. */
export const PRECACHE_PUBLIC = ['manifest.webmanifest', 'icon.svg'];

/**
 * Wat nooit in de voorcache hoort: zwaar en alleen nodig voor wie een pdf,
 * een .docx of een QR-code opent, of de kijkdoos van de Lichtkamer (three en
 * three-gloed). Die bewaart de service worker pas bij het eerste gebruik.
 */
export const NEVER_PRECACHE = /(?:^|\/)(?:pdf|mammoth\w*|jsqr|three)[-.]/i;

/** De bundels waarnaar een index.html verwijst (zelfde regel als in de service worker). */
export function assetRefs(html: string): string[] {
  const refs = new Set<string>();
  const re = /\s(?:src|href)=["'](?:\.\/)?(assets\/[^"'?#]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) refs.add(m[1]);
  return [...refs];
}

/**
 * De enige js-chunk met `isEntry`: de hoofdbundel. Faalt luid bij nul of
 * meer dan één: dan klopt geen enkele verdere aanname over de bundel.
 */
export function findEntry(files: readonly Pick<BundleFile, 'fileName' | 'type' | 'isEntry'>[], who: string): string {
  const entries = files.filter((f) => f.type === 'chunk' && f.isEntry && f.fileName.endsWith('.js'));
  if (entries.length !== 1) {
    throw new Error(`${who}: verwachtte precies één hoofdbundel, vond er ${entries.length}`);
  }
  return entries[0].fileName;
}

/**
 * De statische sluiting van een chunk: de chunk zelf plus, recursief, alles
 * wat ze statisch importeert (`imports`). Dynamische imports tellen niet mee:
 * die laden pas wanneer de code erom vraagt. Volgorde: de chunk eerst, daarna
 * in de volgorde van ontdekking. Kringen zijn geen probleem.
 */
export function staticClosure(files: readonly Pick<BundleFile, 'fileName' | 'imports'>[], start: string): string[] {
  const byName = new Map(files.map((f) => [f.fileName, f]));
  const seen = new Set<string>();
  const todo = [start];
  while (todo.length > 0) {
    const name = todo.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const dep of byName.get(name)?.imports ?? []) todo.push(dep);
  }
  return [...seen];
}

/**
 * De app-schil: de hoofdbundel, haar statische imports en hun css, plus alles
 * waarnaar index.html verwijst. Faalt luid (throw) wanneer de bundel er anders
 * uitziet dan verwacht: liever een mislukte build dan een service worker die
 * een kapotte schil bewaart.
 */
export function collectShell(files: readonly BundleFile[], indexHtml: string): { entry: string; files: string[] } {
  const byName = new Map(files.map((f) => [f.fileName, f]));
  const entry = findEntry(files, 'offlineShell');
  if (!entry.startsWith('assets/')) {
    throw new Error(`offlineShell: de hoofdbundel staat niet in assets/ (${entry})`);
  }

  // Dezelfde sluiting als het budget op het kritieke leerlingpad (bundleBudget).
  const shell = new Set<string>();
  for (const name of staticClosure(files, entry)) {
    shell.add(name);
    for (const css of byName.get(name)?.importedCss ?? []) shell.add(css);
  }

  const refs = assetRefs(indexHtml);
  if (!refs.includes(entry)) {
    throw new Error(`offlineShell: index.html verwijst niet naar de hoofdbundel ${entry}`);
  }
  for (const ref of refs) {
    if (!byName.has(ref)) throw new Error(`offlineShell: index.html verwijst naar ${ref}, dat niet in de build zit`);
    shell.add(ref);
  }
  return { entry, files: [...shell].sort() };
}

/**
 * Alle bestanden die bij deze build horen, relatief t.o.v. de map van de app:
 * de uitvoer van Rollup (zonder index.html en sw.js) en de openbare bestanden.
 */
export function knownFiles(bundleNames: readonly string[], publicFiles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const n of [...bundleNames, ...publicFiles]) {
    const name = n.replace(/\\/g, '/');
    if (name === 'index.html' || name === 'sw.js') continue;
    out.add(name);
  }
  return [...out].sort();
}

/** Zet de configuratie voor het sjabloon. De eerste regels zijn leesbaar voor wie dist/sw.js opent. */
export function renderServiceWorker(template: string, config: ServiceWorkerConfig): string {
  if (!/^[\w-]{6,}$/.test(config.version)) throw new Error('offlineShell: ongeldige versie');
  if (!config.precache.includes(config.entry)) throw new Error('offlineShell: de hoofdbundel ontbreekt in de voorcache');
  if (!template.includes('BOOSTERZ.version')) throw new Error('offlineShell: dit is niet het service-worker-sjabloon');
  const header =
    '// Boosterz: service worker. Gegenereerd bij de build door vite.config.ts\n' +
    '// (plugin offlineShell) uit src/offline/serviceWorker.js. Niet met de hand aanpassen.\n' +
    `// Versie ${config.version}\n`;
  return `${header}const BOOSTERZ = ${JSON.stringify(config)};\n\n${template}`;
}

// ── Buildcontrole: het kritieke leerlingpad ─────────────────────────────────
//
// Een leerling met een code moet de hoofdbundel én alles wat die statisch
// importeert, downloaden voor er iets op het scherm staat. De plugin
// `bundleBudget` (vite.config.ts) telt daarom de hele statische sluiting, niet
// één bestand, en laat de build falen als er een chunk in belandt die er niet
// hoort (bv. 'widget-icons' omdat een icoon van het leerlingpad in de lijst
// ontbreekt).

/** Het deel van een Rollup-chunk dat de buildcontrole nodig heeft. */
export interface BudgetChunk {
  fileName: string;
  /** Rollups chunknaam: 'index', 'vendor', 'widget-icons', 'quiz', … */
  name: string;
  isEntry: boolean;
  /** statische imports */
  imports: readonly string[];
  /** ongecomprimeerde grootte in bytes */
  bytes: number;
}

export interface CriticalPathRules {
  /** chunknamen die naast de hoofdbundel in de sluiting mogen zitten */
  allowed: readonly string[];
  /** chunknamen die zelf niets mogen importeren (stabiele hash, geen kring met de hoofdbundel) */
  leaves: readonly string[];
  /** budget voor de hele sluiting, in kB van 1000 bytes */
  maxKb: number;
  /** boven maxKb × hardFactor faalt de build; tussen maxKb en die grens volgt enkel een waarschuwing */
  hardFactor: number;
}

export interface CriticalPathReport {
  entry: string;
  /** de sluiting, hoofdbundel eerst */
  closure: string[];
  /** grootte van de hele sluiting, in kB */
  kb: number;
  /** chunks in de sluiting die er niet horen */
  intruders: BudgetChunk[];
  /** deze laten de build falen */
  errors: string[];
  /** budget overschreden, maar binnen hardFactor: enkel melden */
  warnings: string[];
}

export function checkCriticalPath(chunks: readonly BudgetChunk[], rules: CriticalPathRules): CriticalPathReport {
  if (!(rules.maxKb > 0) || !(rules.hardFactor >= 1)) {
    throw new Error('bundleBudget: ongeldig budget voor het kritieke leerlingpad');
  }
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const entry = findEntry(
    chunks.map((c) => ({ fileName: c.fileName, type: 'chunk' as const, isEntry: c.isEntry })),
    'bundleBudget'
  );
  const closure = staticClosure(chunks, entry);
  const errors: string[] = [];
  const warnings: string[] = [];
  const intruders: BudgetChunk[] = [];
  let bytes = 0;
  for (const file of closure) {
    const chunk = byName.get(file);
    if (!chunk) {
      errors.push(`het kritieke leerlingpad importeert ${file}, maar die chunk zit niet in de bundel`);
      continue;
    }
    bytes += chunk.bytes;
    if (file !== entry && !rules.allowed.includes(chunk.name)) intruders.push(chunk);
  }
  const toegelaten = ['de hoofdbundel', ...rules.allowed.map((n) => `'${n}'`)].join(' en ');
  for (const c of intruders) {
    errors.push(
      `${c.fileName} (chunk '${c.name}') zit op het kritieke leerlingpad: de hoofdbundel laadt die statisch mee. ` +
        `Daar horen enkel ${toegelaten}.`
    );
  }
  for (const c of chunks) {
    if (rules.leaves.includes(c.name) && c.imports.length > 0) {
      errors.push(
        `${c.fileName} (chunk '${c.name}') importeert ${c.imports.join(', ')}. Die chunk mag niets importeren: ` +
          'anders verandert haar hash bij elke codewijziging en ontstaat er een kring met de hoofdbundel.'
      );
    }
  }
  const kb = bytes / 1000;
  const delen = closure.map((f) => byName.get(f)?.name ?? f).join(' + ');
  const melding = `kritieke leerlingpad (${delen}): ${kb.toFixed(1)} kB > budget ${rules.maxKb} kB`;
  if (kb > rules.maxKb * rules.hardFactor) {
    errors.push(`${melding}, meer dan ${Math.round((rules.hardFactor - 1) * 100)} % te veel`);
  } else if (kb > rules.maxKb) {
    warnings.push(melding);
  }
  return { entry, closure, kb, intruders, errors, warnings };
}

// ── Chunkverdeling: React en Lucide ─────────────────────────────────────────
//
// Zonder hulp maakt Rollup van elk Lucide-icoon dat alleen lui geladen code
// gebruikt een eigen minichunk (0,3 à 0,6 kB): een quiz starten kostte zo 32
// verzoeken. En React zat in de hoofdbundel, waardoor elke chunk met
// CommonJS-code (mammoth, jsQR) die importeerde en bij elke uitrol een nieuwe
// hash kreeg. Daarom:
//  - 'vendor': React, React DOM, scheduler, Rollups CommonJS-hulpjes, de basis
//    van lucide-react (dist/esm/ buiten icons/) en de iconen van het
//    leerlingpad. Verandert alleen bij een nieuwe versie van die pakketten of
//    een gewijzigde lijst iconen, en importeert zelf niets;
//  - 'widget-icons': alle andere Lucide-iconen, in één lui geladen chunk.

export const VENDOR_CHUNK = 'vendor';
export const WIDGET_ICONS_CHUNK = 'widget-icons';
/** three.js (r162) met de voorbeeldmodules die de kijkdoos altijd nodig heeft: importeert zelf niets. */
export const THREE_CHUNK = 'three';
/** De nabewerking voor de gloed op het bord (EffectComposer, UnrealBloomPass, GammaCorrectionShader): importeert alleen 'three'. */
export const THREE_GLOED_CHUNK = 'three-gloed';

/**
 * De chunk van een module van three, of undefined. Alles van three gaat in 'three', behalve de nabewerking en haar
 * shaders ('three-gloed'): die laden alleen in de stand 'hoog' van de kijkdoos.
 */
export function threeChunkFor(p: string): string | undefined {
  const m = /\/node_modules\/three\/(.+)$/.exec(p);
  if (!m) return undefined;
  return /^examples\/jsm\/(?:postprocessing|shaders)\//.test(m[1]) ? THREE_GLOED_CHUNK : THREE_CHUNK;
}

/**
 * De gedeelde lichtkamercode (src/lib/basis/lichtkamer/: lichtlogica en kijkdoos-toestanden, zonder les/ en lesmateriaal.ts).
 * De kijkdoos (kijkdoos3d) en de schermen van de les gebruiken ze allebei. Zonder eigen chunk zet Rollup ze in het
 * paginachunk dat eerst laadt, en dan importeert kijkdoos3d dat hele paginachunk (LK-8). Eén eigen chunk lost dat op en
 * houdt zijn naam stabiel. De lesmachine (les/) hoort er bewust niet bij: ze gebruikt het lesmateriaal, en een manualChunk
 * trekt zijn afhankelijkheden mee, waarna kijkdoos3d ook het lesmateriaal zou importeren.
 */
export const LICHTKAMER_CHUNK = 'lichtkamer';
/**
 * Het lesmateriaal (spiekkaart, meetblad, observatieblad) is gegevens voor de lespagina en wordt ook door de lesmachine
 * gebruikt. Met een eigen chunk laadt de lespagina alleen die gegevens, de oefeningen pas na 'Uitproberen', en laadt het
 * kindscherm niet het hele paginachunk van de lespagina mee.
 */
export const LESMATERIAAL_CHUNK = 'lesmateriaal';

/** De chunk van een module van de gedeelde lichtkamercode ('lichtkamer', het lesmateriaal 'lesmateriaal'), of undefined (tests, les/). */
export function lichtkamerChunkFor(p: string): string | undefined {
  const m = /\/src\/lib\/basis\/lichtkamer\/([^?]+)/.exec(p.replace(/\\/g, '/'));
  if (!m) return undefined;
  if (/\.test\.[jt]sx?$/.test(m[1]) || m[1].startsWith('les/')) return undefined;
  return m[1] === 'lesmateriaal.ts' ? LESMATERIAAL_CHUNK : LICHTKAMER_CHUNK;
}

/**
 * Buildcontrole voor de kijkdoos (LK-8): 'kijkdoos3d' importeert statisch alleen de hoofdbundel, 'vendor' en 'lichtkamer';
 * 'lichtkamer' en 'lesmateriaal' alleen de hoofdbundel en 'vendor'. Nooit een paginachunk, ook geen bare import voor de
 * volgorde van uitvoering. Geeft de fouten terug; leeg is goed.
 */
export function checkKijkdoosChunks(chunks: readonly BudgetChunk[]): string[] {
  const fouten: string[] = [];
  const naam = new Map(chunks.map((c) => [c.fileName, c]));
  const MAG: Readonly<Record<string, readonly string[]>> = {
    kijkdoos3d: [LICHTKAMER_CHUNK],
    [LICHTKAMER_CHUNK]: [],
    [LESMATERIAAL_CHUNK]: [],
  };
  for (const c of chunks) {
    const mag = MAG[c.name];
    if (!mag) continue;
    for (const f of c.imports) {
      const doel = naam.get(f);
      const toegestaan = doel?.isEntry === true || doel?.name === VENDOR_CHUNK || (doel !== undefined && mag.includes(doel.name));
      if (!toegestaan) fouten.push(`${c.fileName} importeert ${f} (chunk '${doel?.name ?? '?'}') statisch; dat is geen paginachunk-vrije afhankelijkheid`);
    }
  }
  return fouten;
}

/**
 * Buildcontrole voor three (docs/basisonderwijs/LICHTKAMER-APP.md, 'three.js r162 in de eigen bundel'):
 *  - de chunk 'three' bestaat en importeert zelf niets (zo blijft haar naam gelijk na een uitrol);
 *  - alleen 'three-gloed' importeert 'three' statisch; al de rest laadt three met import();
 *  - 'three-gloed' importeert alleen 'three';
 *  - geen van beide zit in de statische sluiting van de hoofdbundel (`closure`).
 * Geeft de fouten terug; leeg is goed.
 */
export function checkThreeChunks(chunks: readonly BudgetChunk[], closure: readonly string[]): string[] {
  const fouten: string[] = [];
  const three = chunks.filter((c) => c.name === THREE_CHUNK);
  const gloed = chunks.filter((c) => c.name === THREE_GLOED_CHUNK);
  if (three.length !== 1) fouten.push(`verwachtte precies één chunk '${THREE_CHUNK}', vond er ${three.length}`);
  if (gloed.length > 1) fouten.push(`verwachtte hoogstens één chunk '${THREE_GLOED_CHUNK}', vond er ${gloed.length}`);
  const threeFile = three[0]?.fileName;
  const gloedFile = gloed[0]?.fileName;
  for (const c of three) {
    if (c.imports.length > 0) fouten.push(`${c.fileName} (chunk '${THREE_CHUNK}') importeert ${c.imports.join(', ')}; die chunk mag niets importeren`);
  }
  for (const c of gloed) {
    const anders = c.imports.filter((f) => f !== threeFile);
    if (anders.length > 0) fouten.push(`${c.fileName} (chunk '${THREE_GLOED_CHUNK}') importeert ${anders.join(', ')}; alleen '${THREE_CHUNK}' mag`);
  }
  for (const c of chunks) {
    if (c.name === THREE_GLOED_CHUNK || c.name === THREE_CHUNK) continue;
    const statisch = c.imports.filter((f) => f === threeFile || f === gloedFile);
    if (statisch.length > 0) fouten.push(`${c.fileName} importeert ${statisch.join(', ')} statisch; three laadt alleen met import()`);
  }
  for (const f of [threeFile, gloedFile]) {
    if (f && closure.includes(f)) fouten.push(`${f} zit op het kritieke leerlingpad`);
  }
  return fouten;
}

/**
 * Leest de barrel van lucide-react (dist/esm/lucide-react.mjs): elke
 * exportnaam, ook de aliassen (Grid2X2Check, Grid2x2CheckIcon, LucideX…),
 * met het bestand in icons/ waar hij vandaan komt.
 */
export function parseLucideExports(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /export\s*\{([^}]*)\}\s*from\s*['"]\.\/icons\/([\w.-]+\.mjs)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[2] === 'index.mjs') continue;
    for (const spec of m[1].matchAll(/\bdefault\s+as\s+(\w+)/g)) out.set(spec[1], m[2]);
  }
  return out;
}

/** De bestanden in icons/ voor een lijst icoonnamen. Faalt luid bij een onbekende naam. */
export function iconFiles(names: readonly string[], exports: ReadonlyMap<string, string>): Set<string> {
  const unknown = names.filter((n) => !exports.has(n));
  if (unknown.length > 0) {
    throw new Error(`vite.config: onbekend Lucide-icoon: ${unknown.join(', ')}. Bestaat het nog in deze versie van lucide-react?`);
  }
  return new Set(names.map((n) => exports.get(n)!));
}

/**
 * Voor `build.rollupOptions.output.manualChunks`. `id` is een modulepad zoals
 * Rollup het doorgeeft (absoluut, soms met een \0-voorvoegsel of een ?query).
 * `eagerIconFiles`: bestandsnamen in icons/ van de iconen op het leerlingpad.
 * `undefined`: Rollup beslist zelf.
 */
export function manualChunkFor(id: string, eagerIconFiles: ReadonlySet<string>): string | undefined {
  const p = id.replace(/\\/g, '/');
  if (p.includes('commonjsHelpers')) return VENDOR_CHUNK;
  const three = threeChunkFor(p);
  if (three) return three;
  const lichtkamer = lichtkamerChunkFor(p);
  if (lichtkamer) return lichtkamer;
  if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(p)) return VENDOR_CHUNK;
  const lucide = /\/node_modules\/lucide-react\/dist\/esm\/([^?]+)/.exec(p);
  if (!lucide) return undefined;
  const rest = lucide[1];
  // De barrel icons/index.mjs heeft zelf geen code; in 'vendor' trekt ze niets
  // mee, want elk icoonbestand krijgt hieronder zelf een chunk.
  if (!rest.startsWith('icons/') || rest === 'icons/index.mjs') return VENDOR_CHUNK;
  return eagerIconFiles.has(rest.slice('icons/'.length)) ? VENDOR_CHUNK : WIDGET_ICONS_CHUNK;
}

/**
 * De namen die een (getranspileerde) module uit 'lucide-react' importeert of
 * doorgeeft, zonder type-imports. Alleen voor de diagnose in bundleBudget:
 * welk icoon ontbreekt in de lijst, of staat er onnodig in.
 */
export function lucideImportNames(code: string): string[] {
  const names = new Set<string>();
  const re = /\b(?:import|export)\s*(type\s+)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1]) continue;
    for (const raw of m[2].split(',')) {
      const spec = raw.trim();
      if (!spec || /^type\s/.test(spec)) continue;
      const name = spec.split(/\s+as\s+/)[0].trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  return [...names];
}
