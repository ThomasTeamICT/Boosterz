import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NEVER_PRECACHE,
  THREE_CHUNK,
  THREE_GLOED_CHUNK,
  checkThreeChunks,
  threeChunkFor,
  VENDOR_CHUNK,
  WIDGET_ICONS_CHUNK,
  assetRefs,
  checkCriticalPath,
  collectShell,
  findEntry,
  iconFiles,
  knownFiles,
  lucideImportNames,
  manualChunkFor,
  parseLucideExports,
  renderServiceWorker,
  staticClosure,
  type BudgetChunk,
  type BundleFile,
  type CriticalPathRules,
} from './swBuild';

// Een bundel zoals Vite ze bouwt, verkleind.
const bundle: BundleFile[] = [
  { fileName: 'assets/index-AAA.js', type: 'chunk', isEntry: true, imports: ['assets/vendor-VVV.js'], importedCss: ['assets/index-CSS.css'] },
  { fileName: 'assets/vendor-VVV.js', type: 'chunk', imports: [], importedCss: [] },
  { fileName: 'assets/Layout-LLL.js', type: 'chunk', imports: ['assets/index-AAA.js'], importedCss: ['assets/Layout-LCS.css'] },
  { fileName: 'assets/quiz-QQQ.js', type: 'chunk', imports: ['assets/index-AAA.js'] },
  { fileName: 'assets/pdf-PPP.js', type: 'chunk', imports: [] },
  { fileName: 'assets/mammothDocx-MMM.js', type: 'chunk', imports: [] },
  { fileName: 'assets/jsQR-JJJ.js', type: 'chunk', imports: [] },
  { fileName: 'assets/index-CSS.css', type: 'asset' },
  { fileName: 'assets/Layout-LCS.css', type: 'asset' },
  { fileName: 'assets/pdf.worker.min-WWW.mjs', type: 'asset' },
  { fileName: 'index.html', type: 'asset' },
];
const html =
  '<head><script type="module" crossorigin src="./assets/index-AAA.js"></script>' +
  '<link rel="modulepreload" crossorigin href="./assets/vendor-VVV.js">' +
  '<link rel="stylesheet" crossorigin href="./assets/index-CSS.css">' +
  '<link rel="manifest" href="./manifest.webmanifest"></head>';

describe('collectShell', () => {
  it('de hoofdbundel, haar statische imports en haar css; niets lazy', () => {
    const shell = collectShell(bundle, html);
    expect(shell.entry).toBe('assets/index-AAA.js');
    expect(shell.files).toEqual(['assets/index-AAA.js', 'assets/index-CSS.css', 'assets/vendor-VVV.js']);
  });

  it('geen pdf.js, mammoth, jsQR of lazy pagina in de voorcache', () => {
    const { files } = collectShell(bundle, html);
    expect(files.filter((f) => NEVER_PRECACHE.test(f))).toEqual([]);
    expect(files.some((f) => f.includes('Layout') || f.includes('quiz'))).toBe(false);
  });

  it('faalt luid zonder of met meer dan één hoofdbundel', () => {
    expect(() => collectShell(bundle.filter((f) => !f.isEntry), html)).toThrow(/precies één hoofdbundel/);
    expect(() =>
      collectShell([...bundle, { fileName: 'assets/tweede-XYZ.js', type: 'chunk', isEntry: true }], html)
    ).toThrow(/precies één hoofdbundel/);
  });

  it('faalt luid als index.html niet naar de hoofdbundel verwijst', () => {
    expect(() => collectShell(bundle, '<script src="./assets/ander-ZZZ.js"></script>')).toThrow(/verwijst niet naar de hoofdbundel/);
  });

  it('faalt luid als index.html naar een onbekend bestand verwijst', () => {
    expect(() => collectShell(bundle, html + '<link rel="stylesheet" href="./assets/weg-000.css">')).toThrow(/niet in de build/);
  });

  it('faalt luid als de hoofdbundel niet in assets/ staat', () => {
    const b = bundle.map((f) => (f.isEntry ? { ...f, fileName: 'main.js' } : f));
    expect(() => collectShell(b, '<script src="./main.js"></script>')).toThrow(/niet in assets/);
  });
});

describe('NEVER_PRECACHE', () => {
  it('vangt de zware bibliotheken, niet de gewone chunks', () => {
    for (const f of ['assets/pdf-aGDrFUlY.js', 'assets/pdf.worker.min-CLrFZWeq.mjs', 'assets/mammothDocx-Bg5sqDFm.js', 'assets/jsQR-DvD3PFUh.js']) {
      expect(NEVER_PRECACHE.test(f), f).toBe(true);
    }
    for (const f of ['assets/index-DWAcka4V.js', 'assets/PdfViewer-DCqhIeaU.js', 'assets/quiz-C1J3x4w3.js', 'manifest.webmanifest']) {
      expect(NEVER_PRECACHE.test(f), f).toBe(false);
    }
  });
});

describe('assetRefs', () => {
  it('leest script- en linkverwijzingen naar assets/, met of zonder ./', () => {
    expect(assetRefs(html)).toEqual(['assets/index-AAA.js', 'assets/vendor-VVV.js', 'assets/index-CSS.css']);
    expect(assetRefs("<script src='assets/a-1.js'></script><img src=\"voorbeelden/x.jpg\">")).toEqual(['assets/a-1.js']);
    expect(assetRefs('<p>geen verwijzingen</p>')).toEqual([]);
  });
});

describe('knownFiles', () => {
  it('bundel en openbare bestanden, zonder index.html en sw.js, met / als scheiding', () => {
    expect(knownFiles(['assets/b.js', 'index.html', 'sw.js', 'assets/a.js'], ['voorbeelden\\nw\\h01.jpg', 'icon.svg'])).toEqual([
      'assets/a.js',
      'assets/b.js',
      'icon.svg',
      'voorbeelden/nw/h01.jpg',
    ]);
  });
});

describe('renderServiceWorker', () => {
  const template = '/* sjabloon */ const x = BOOSTERZ.version;';
  const config = { version: 'abc123def456', entry: 'assets/index-AAA.js', precache: ['assets/index-AAA.js'], known: ['assets/index-AAA.js'] };

  it('zet de configuratie vóór het sjabloon', () => {
    const out = renderServiceWorker(template, config);
    expect(out).toContain(`const BOOSTERZ = ${JSON.stringify(config)};`);
    expect(out).toContain('Versie abc123def456');
    expect(out.endsWith(template)).toBe(true);
  });

  it('weigert een ongeldige versie, een ontbrekende hoofdbundel of een vreemd sjabloon', () => {
    expect(() => renderServiceWorker(template, { ...config, version: '' })).toThrow(/versie/);
    expect(() => renderServiceWorker(template, { ...config, version: 'a b"c' })).toThrow(/versie/);
    expect(() => renderServiceWorker(template, { ...config, precache: [] })).toThrow(/hoofdbundel/);
    expect(() => renderServiceWorker('console.log(1)', config)).toThrow(/sjabloon/);
  });
});

// ── Buildcontrole: statische sluiting en het kritieke leerlingpad ───────────

describe('findEntry', () => {
  it('de enige js-chunk met isEntry', () => {
    expect(findEntry(bundle, 'test')).toBe('assets/index-AAA.js');
  });

  it('faalt luid bij nul of twee entries, met de naam van de vrager', () => {
    expect(() => findEntry([], 'bundleBudget')).toThrow(/^bundleBudget: verwachtte precies één hoofdbundel, vond er 0/);
    expect(() =>
      findEntry([...bundle, { fileName: 'assets/b-B.js', type: 'chunk', isEntry: true }], 'x')
    ).toThrow(/vond er 2/);
  });

  it('een css-asset of een niet-js-chunk met isEntry telt niet', () => {
    expect(findEntry([...bundle, { fileName: 'assets/x.css', type: 'asset', isEntry: true }], 'x')).toBe('assets/index-AAA.js');
  });
});

describe('staticClosure', () => {
  const files = [
    { fileName: 'e.js', imports: ['a.js', 'v.js'] },
    { fileName: 'a.js', imports: ['b.js'] },
    { fileName: 'b.js', imports: ['v.js', 'e.js'] }, // kring terug naar de entry
    { fileName: 'v.js', imports: [] },
    { fileName: 'lui.js', imports: ['e.js', 'v.js'] }, // enkel dynamisch geladen: importeert zelf de entry
  ];

  it('de chunk zelf eerst, dan recursief haar statische imports; kringen stoppen', () => {
    expect(staticClosure(files, 'e.js')).toEqual(['e.js', 'a.js', 'v.js', 'b.js']);
  });

  it('een chunk die de entry importeert, hoort niet bij de sluiting van de entry', () => {
    expect(staticClosure(files, 'e.js')).not.toContain('lui.js');
  });

  it('een import die niet in de bundel zit, staat erin (zodat de controle ze kan melden)', () => {
    expect(staticClosure([{ fileName: 'e.js', imports: ['weg.js'] }], 'e.js')).toEqual(['e.js', 'weg.js']);
  });

  it('collectShell neemt ook onrechtstreekse statische imports en hun css mee', () => {
    const diep: BundleFile[] = [
      { fileName: 'assets/index-A.js', type: 'chunk', isEntry: true, imports: ['assets/a-1.js'] },
      { fileName: 'assets/a-1.js', type: 'chunk', imports: ['assets/b-2.js'] },
      { fileName: 'assets/b-2.js', type: 'chunk', imports: [], importedCss: ['assets/b-2.css'] },
      { fileName: 'assets/b-2.css', type: 'asset' },
    ];
    expect(collectShell(diep, '<script src="./assets/index-A.js"></script>').files).toEqual([
      'assets/a-1.js',
      'assets/b-2.css',
      'assets/b-2.js',
      'assets/index-A.js',
    ]);
  });
});

describe('checkCriticalPath', () => {
  const rules: CriticalPathRules = { allowed: [VENDOR_CHUNK], leaves: [VENDOR_CHUNK], maxKb: 300, hardFactor: 1.05 };
  const chunk = (fileName: string, name: string, bytes: number, imports: string[] = [], isEntry = false): BudgetChunk => ({
    fileName,
    name,
    bytes,
    imports,
    isEntry,
  });
  const gezond = (entryBytes: number) => [
    chunk('assets/index-A.js', 'index', entryBytes, ['assets/vendor-V.js'], true),
    chunk('assets/vendor-V.js', 'vendor', 150_000),
    chunk('assets/quiz-Q.js', 'quiz', 70_000, ['assets/index-A.js', 'assets/vendor-V.js', 'assets/widget-icons-W.js']),
    chunk('assets/widget-icons-W.js', 'widget-icons', 64_000, ['assets/vendor-V.js']),
  ];

  it('telt de hele sluiting (hoofdbundel + vendor), niet de lui geladen chunks', () => {
    const r = checkCriticalPath(gezond(140_000), rules);
    expect(r.entry).toBe('assets/index-A.js');
    expect(r.closure).toEqual(['assets/index-A.js', 'assets/vendor-V.js']);
    expect(r.kb).toBe(290);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.intruders).toEqual([]);
  });

  it('precies op het budget: geen melding', () => {
    expect(checkCriticalPath(gezond(150_000), rules).warnings).toEqual([]);
  });

  it('net over het budget: een waarschuwing, geen fout', () => {
    const r = checkCriticalPath(gezond(150_001), rules);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/kritieke leerlingpad \(index \+ vendor\): 300\.0 kB > budget 300 kB/);
  });

  it('tot en met 5 % over het budget: nog een waarschuwing', () => {
    const r = checkCriticalPath(gezond(165_000), rules); // 315 kB = 300 × 1,05
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('meer dan 5 % over het budget: de build faalt', () => {
    const r = checkCriticalPath(gezond(165_001), rules);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/meer dan 5 % te veel/);
  });

  it('widget-icons in de sluiting: fout, ook binnen het budget', () => {
    const chunks = gezond(10_000);
    chunks[0] = chunk('assets/index-A.js', 'index', 10_000, ['assets/vendor-V.js', 'assets/widget-icons-W.js'], true);
    const r = checkCriticalPath(chunks, rules);
    expect(r.closure).toContain('assets/widget-icons-W.js');
    expect(r.intruders.map((c) => c.name)).toEqual([WIDGET_ICONS_CHUNK]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/assets\/widget-icons-W\.js \(chunk 'widget-icons'\) zit op het kritieke leerlingpad/);
    expect(r.errors[0]).toMatch(/enkel de hoofdbundel en 'vendor'/);
  });

  it('ook een onrechtstreekse indringer (via een andere chunk) wordt gevonden', () => {
    const chunks = [
      chunk('assets/index-A.js', 'index', 1000, ['assets/gedeeld-G.js'], true),
      chunk('assets/gedeeld-G.js', 'gedeeld', 1000, ['assets/pdf-P.js']),
      chunk('assets/pdf-P.js', 'pdf', 1000),
    ];
    const r = checkCriticalPath(chunks, rules);
    expect(r.intruders.map((c) => c.name)).toEqual(['gedeeld', 'pdf']);
    expect(r.errors).toHaveLength(2);
  });

  it('vendor die iets importeert (bv. de hoofdbundel): fout, en geen oneindige lus', () => {
    const chunks = gezond(100_000);
    chunks[1] = chunk('assets/vendor-V.js', 'vendor', 150_000, ['assets/index-A.js']);
    const r = checkCriticalPath(chunks, rules);
    expect(r.closure).toEqual(['assets/index-A.js', 'assets/vendor-V.js']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/vendor-V\.js \(chunk 'vendor'\) importeert assets\/index-A\.js/);
  });

  it('de bladregel geldt ook voor een vendor-chunk buiten de sluiting', () => {
    const chunks = [
      chunk('assets/index-A.js', 'index', 1000, [], true),
      chunk('assets/vendor-V.js', 'vendor', 1000, ['assets/x-X.js']),
      chunk('assets/x-X.js', 'x', 1000),
    ];
    expect(checkCriticalPath(chunks, rules).errors).toEqual([expect.stringMatching(/mag niets importeren/)]);
  });

  it('een statische import die niet in de bundel zit: fout', () => {
    const r = checkCriticalPath([chunk('assets/index-A.js', 'index', 1000, ['assets/weg-W.js'], true)], rules);
    expect(r.errors).toEqual([expect.stringMatching(/importeert assets\/weg-W\.js, maar die chunk zit niet in de bundel/)]);
  });

  it('zonder toegelaten chunks is enkel de hoofdbundel welkom', () => {
    const r = checkCriticalPath(gezond(1000), { ...rules, allowed: [] });
    expect(r.intruders.map((c) => c.name)).toEqual(['vendor']);
    expect(r.errors[0]).toMatch(/Daar horen enkel de hoofdbundel\./);
  });

  it('weigert een onzinnig budget en een bundel zonder of met twee hoofdbundels', () => {
    expect(() => checkCriticalPath(gezond(1), { ...rules, maxKb: 0 })).toThrow(/ongeldig budget/);
    expect(() => checkCriticalPath(gezond(1), { ...rules, hardFactor: 0.9 })).toThrow(/ongeldig budget/);
    expect(() => checkCriticalPath(gezond(1), { ...rules, maxKb: Number.NaN })).toThrow(/ongeldig budget/);
    expect(() => checkCriticalPath(gezond(1).slice(1), rules)).toThrow(/bundleBudget: verwachtte precies één hoofdbundel/);
    const twee = [...gezond(1), chunk('assets/tweede-T.js', 'tweede', 1, [], true)];
    expect(() => checkCriticalPath(twee, rules)).toThrow(/vond er 2/);
  });
});

// ── Chunkverdeling: React en Lucide ─────────────────────────────────────────

describe('manualChunkFor', () => {
  const eager = new Set(['timer.mjs', 'check.mjs']);
  const nm = '/home/x/app/node_modules';

  it('React, React DOM, scheduler en de CommonJS-hulpjes naar vendor', () => {
    for (const id of [
      `${nm}/react/index.js`,
      `${nm}/react/jsx-runtime.js`,
      `\0${nm}/react/cjs/react.production.min.js?commonjs-exports`,
      `${nm}/react-dom/client.js`,
      `\0${nm}/react-dom/cjs/react-dom.production.min.js?commonjs-module`,
      `${nm}/scheduler/index.js`,
      '\0commonjsHelpers.js',
      `${nm}/.pnpm/react@18.3.1/node_modules/react/index.js`,
      'C:\\app\\node_modules\\react-dom\\index.js',
    ]) {
      expect(manualChunkFor(id, eager), id).toBe(VENDOR_CHUNK);
    }
  });

  it('pakketten die enkel op react lijken, en de router: Rollup beslist', () => {
    for (const id of [
      `${nm}/react-router/dist/index.js`,
      `${nm}/react-router-dom/dist/index.js`,
      `${nm}/@remix-run/router/dist/router.js`,
      `${nm}/react-is/index.js`,
      '/home/x/app/src/react/Widget.tsx',
    ]) {
      expect(manualChunkFor(id, eager), id).toBeUndefined();
    }
  });

  it('de basis van lucide-react (buiten icons/) en de barrel naar vendor', () => {
    for (const f of ['lucide-react.mjs', 'createLucideIcon.mjs', 'Icon.mjs', 'context.mjs', 'shared/src/utils/toPascalCase.mjs', 'icons/index.mjs']) {
      expect(manualChunkFor(`${nm}/lucide-react/dist/esm/${f}`, eager), f).toBe(VENDOR_CHUNK);
    }
  });

  it('iconen van het leerlingpad naar vendor, alle andere naar widget-icons', () => {
    expect(manualChunkFor(`${nm}/lucide-react/dist/esm/icons/timer.mjs`, eager)).toBe(VENDOR_CHUNK);
    expect(manualChunkFor('C:\\app\\node_modules\\lucide-react\\dist\\esm\\icons\\check.mjs', eager)).toBe(VENDOR_CHUNK);
    expect(manualChunkFor(`${nm}/lucide-react/dist/esm/icons/star.mjs`, eager)).toBe(WIDGET_ICONS_CHUNK);
    // lijkt op een icoon van het leerlingpad, maar is het niet
    expect(manualChunkFor(`${nm}/lucide-react/dist/esm/icons/timer-off.mjs`, eager)).toBe(WIDGET_ICONS_CHUNK);
    expect(manualChunkFor(`${nm}/lucide-react/dist/esm/icons/square-check.mjs`, eager)).toBe(WIDGET_ICONS_CHUNK);
  });

  it('eigen code met een gelijkaardige naam blijft ongemoeid', () => {
    expect(manualChunkFor('/home/x/app/src/components/icons.ts', eager)).toBeUndefined();
    expect(manualChunkFor('/home/x/app/src/lucide-react/dist/esm/icons/star.mjs', eager)).toBeUndefined();
    expect(manualChunkFor(`${nm}/lucide-static/dist/esm/icons/star.mjs`, eager)).toBeUndefined();
  });
});

describe('parseLucideExports en iconFiles', () => {
  const barrel = [
    "import * as index from './icons/index.mjs';",
    'export { index as icons };',
    "export { default as Grid2X2Check, default as Grid2X2CheckIcon, default as Grid2x2Check, default as LucideGrid2x2Check } from './icons/grid-2x2-check.mjs';",
    "export {\n  default as Timer,\n  default as TimerIcon\n} from './icons/timer.mjs';",
    "export { default as X } from \"./icons/x.mjs\";",
    "export { LucideProvider, useLucideContext } from './context.mjs';",
    "export { default as createLucideIcon } from './createLucideIcon.mjs';",
  ].join('\n');

  it('elke naam en alias met zijn bestand; de basis en de namespace niet', () => {
    const map = parseLucideExports(barrel);
    expect(map.get('Grid2X2Check')).toBe('grid-2x2-check.mjs');
    expect(map.get('Grid2x2Check')).toBe('grid-2x2-check.mjs');
    expect(map.get('LucideGrid2x2Check')).toBe('grid-2x2-check.mjs');
    expect(map.get('TimerIcon')).toBe('timer.mjs');
    expect(map.get('X')).toBe('x.mjs');
    expect(map.has('createLucideIcon')).toBe(false);
    expect(map.has('LucideProvider')).toBe(false);
    expect(map.has('icons')).toBe(false);
    expect(map.size).toBe(7);
  });

  it('iconFiles: de bestanden, ontdubbeld; een onbekende naam faalt luid', () => {
    const map = parseLucideExports(barrel);
    expect([...iconFiles(['Grid2x2Check', 'Grid2X2Check', 'X'], map)].sort()).toEqual(['grid-2x2-check.mjs', 'x.mjs']);
    expect(() => iconFiles(['X', 'Bestaatniet', 'OokNiet'], map)).toThrow(/onbekend Lucide-icoon: Bestaatniet, OokNiet/);
    expect(() => iconFiles(['X'], parseLucideExports(''))).toThrow(/onbekend Lucide-icoon: X/);
  });

  it('leest de echte barrel van de geïnstalleerde lucide-react', () => {
    const src = readFileSync(new URL('../../node_modules/lucide-react/dist/esm/lucide-react.mjs', import.meta.url), 'utf8');
    const map = parseLucideExports(src);
    expect(map.size).toBeGreaterThan(1000);
    expect(map.get('Grid2x2Check')).toBe('grid-2x2-check.mjs');
    expect(map.get('Grid2X2Check')).toBe('grid-2x2-check.mjs');
    expect(map.get('Check')).toBe('check.mjs');
    expect(map.get('X')).toBe('x.mjs');
  });
});

describe('lucideImportNames', () => {
  it('namen uit lucide-react, ook over meerdere regels en met "as"', () => {
    const code = [
      'import { jsx } from "react/jsx-runtime";',
      'import {\n  Check,\n  Copy as CopyIcon,\n  X,\n} from "lucide-react";',
      "import { Timer } from 'lucide-react';",
      'export { Star, Eye as Oog } from "lucide-react";',
    ].join('\n');
    expect(lucideImportNames(code).sort()).toEqual(['Check', 'Copy', 'Eye', 'Star', 'Timer', 'X']);
  });

  it('type-imports en andere modules tellen niet', () => {
    const code = [
      'import type { LucideIcon } from "lucide-react";',
      'import { type LucideProps, Sun } from "lucide-react";',
      'import { Moon } from "./lucide-react";',
      'import { Cloud } from "lucide-react/dynamic";',
      'import { useState } from "react";',
    ].join('\n');
    expect(lucideImportNames(code)).toEqual(['Sun']);
    expect(lucideImportNames('')).toEqual([]);
  });
});

// ── three (kijkdoos van de Lichtkamer, LK-5) ─────────────────────────────────

describe('three: eigen chunks en buildcontrole', () => {
  const nm = '/home/x/app/node_modules';
  const eager = new Set<string>();

  it('three en zijn vaste voorbeeldmodules naar "three", de nabewerking naar "three-gloed"', () => {
    expect(threeChunkFor(`${nm}/three/build/three.module.js`)).toBe(THREE_CHUNK);
    expect(threeChunkFor(`${nm}/three/examples/jsm/geometries/RoundedBoxGeometry.js`)).toBe(THREE_CHUNK);
    expect(threeChunkFor(`${nm}/three/examples/jsm/environments/RoomEnvironment.js`)).toBe(THREE_CHUNK);
    expect(threeChunkFor(`${nm}/three/examples/jsm/postprocessing/EffectComposer.js`)).toBe(THREE_GLOED_CHUNK);
    expect(threeChunkFor(`${nm}/three/examples/jsm/shaders/OutputShader.js`)).toBe(THREE_GLOED_CHUNK);
    expect(manualChunkFor(`${nm}/three/build/three.module.js`, eager)).toBe(THREE_CHUNK);
    expect(manualChunkFor('C:\\app\\node_modules\\three\\build\\three.module.js', eager)).toBe(THREE_CHUNK);
    expect(manualChunkFor(`${nm}/three/examples/jsm/postprocessing/UnrealBloomPass.js`, eager)).toBe(THREE_GLOED_CHUNK);
  });

  it('eigen code en andere pakketten met "three" in de naam blijven ongemoeid', () => {
    for (const id of [
      '/home/x/app/src/lib/basis/lichtkamer/kijkdoos/kijkdoos3d.ts',
      '/home/x/app/src/three/x.ts',
      `${nm}/three-stdlib/index.js`,
      `${nm}/@types/three/index.d.ts`,
    ])
      expect(manualChunkFor(id, eager), id).toBeUndefined();
  });

  it('three en three-gloed gaan nooit in de voorcache', () => {
    expect(NEVER_PRECACHE.test('assets/three-H8qpGN68.js')).toBe(true);
    expect(NEVER_PRECACHE.test('assets/three-gloed-BkhFWHSR.js')).toBe(true);
    expect(NEVER_PRECACHE.test('assets/kijkdoos3d-BrPWOiMz.js')).toBe(false);
  });

  const c = (fileName: string, name: string, imports: string[] = [], isEntry = false) => ({ fileName, name, isEntry, imports, bytes: 1 });
  const goed = [
    c('assets/index-a.js', 'index', ['assets/vendor-b.js'], true),
    c('assets/vendor-b.js', 'vendor'),
    c('assets/three-c.js', 'three'),
    c('assets/three-gloed-d.js', 'three-gloed', ['assets/three-c.js']),
    c('assets/kijkdoos3d-e.js', 'kijkdoos3d', ['assets/index-a.js']),
  ];
  const sluiting = ['assets/index-a.js', 'assets/vendor-b.js'];

  it('een goede bundel geeft geen fouten', () => {
    expect(checkThreeChunks(goed, sluiting)).toEqual([]);
    // zonder gloed-chunk mag ook
    expect(checkThreeChunks(goed.filter((x) => x.name !== 'three-gloed'), sluiting)).toEqual([]);
  });

  it('three dat iets importeert, faalt', () => {
    const b = goed.map((x) => (x.name === 'three' ? { ...x, imports: ['assets/index-a.js'] } : x));
    expect(checkThreeChunks(b, sluiting).join('\n')).toMatch(/three-c\.js.*mag niets importeren/);
  });

  it('een statische import van three (of de gloed) door eigen code, faalt', () => {
    const b = goed.map((x) => (x.name === 'kijkdoos3d' ? { ...x, imports: ['assets/index-a.js', 'assets/three-c.js'] } : x));
    expect(checkThreeChunks(b, sluiting).join('\n')).toMatch(/kijkdoos3d-e\.js importeert assets\/three-c\.js statisch/);
    const b2 = goed.map((x) => (x.name === 'kijkdoos3d' ? { ...x, imports: ['assets/three-gloed-d.js'] } : x));
    expect(checkThreeChunks(b2, sluiting).join('\n')).toMatch(/three-gloed-d\.js statisch/);
  });

  it('de gloed die iets anders importeert dan three, faalt', () => {
    const b = goed.map((x) => (x.name === 'three-gloed' ? { ...x, imports: ['assets/three-c.js', 'assets/vendor-b.js'] } : x));
    expect(checkThreeChunks(b, sluiting).join('\n')).toMatch(/alleen 'three' mag/);
  });

  it('three op het kritieke leerlingpad, of in vendor gesmolten, faalt', () => {
    expect(checkThreeChunks(goed, [...sluiting, 'assets/three-c.js']).join('\n')).toMatch(/op het kritieke leerlingpad/);
    // three in vendor: dan bestaat de chunk 'three' niet meer
    expect(checkThreeChunks(goed.filter((x) => x.name !== 'three' && x.name !== 'three-gloed'), sluiting).join('\n')).toMatch(/precies één chunk 'three', vond er 0/);
  });
});
