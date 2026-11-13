// De bronbestanden van de eigen ingang van het basisonderwijs (bouwstap 3, pakket P4).
//
// Dit bestand leest de broncode, niet de gegevens. Het bewaakt de grenzen die de spec (docs/basisonderwijs/INGANG.md)
// trekt, zodat een latere wijziging ze niet ongemerkt breekt:
// - de zuivere modules in src/lib/basis lezen de klok niet en gebruiken geen React, fetch of opslag; alleen
//   basisKeuze.ts gebruikt localStorage, en alleen daar staat de sleutel wf.basis.keuze.v1;
// - de zuivere modules halen niets uit de schermen (components, pages);
// - geen enkel bestand van het basisdeel zet html in de pagina met dangerouslySetInnerHTML;
// - niets van het basisdeel komt in het leerlingpad of in de hoofdbundel: alleen App.tsx kent het, en alleen via een
//   luie import (H14).
// Het zijn tests zonder gegevens: ze draaien altijd, ook met GEGEVENSRUN=1.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const BASIS_LIB = join(SRC, 'lib', 'basis');

/** Het enige bestand dat opslag mag gebruiken. */
const OPSLAG_BESTAND = 'basisKeuze.ts';
/** Het eerste bestand dat mag ophalen (het andere staat in LAAD_BESTANDEN): de lader van de gegevens van het GO! (goBron.ts, zoals minimumdoelenBron.ts voor de officiële gegevens). */
const LAAD_BESTAND = 'lib/basis/go/goBron.ts';
/** Het aanbod bij een lesplan (pakket A2) laadt apart, zodat het aanbodmodel niet in de chunk van elk GO!-scherm komt. */
const LAAD_BESTANDEN = new Set([LAAD_BESTAND, 'lib/basis/go/aanbodBron.ts']);
/** De modules die de spec noemt (de gedeelde onderdelen van de pakketten P1 tot P3 en het momentmodel). */
const VERWACHT = ['basisRoutes.ts', 'doelBasis.ts', 'doeltekst.ts', 'kalender.ts', 'leerjaarOverzicht.ts', 'moment.ts', 'momentTeksten.ts', 'zoekBasis.ts', 'zoekwoorden.ts'];

function bestandenIn(map: string): string[] {
  if (!existsSync(map)) return [];
  const uit: string[] = [];
  for (const naam of readdirSync(map).sort()) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestandenIn(pad));
    else uit.push(pad);
  }
  return uit;
}
const isTest = (pad: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(pad);
const isBron = (pad: string): boolean => /\.[cm]?[jt]sx?$/.test(pad) && !isTest(pad) && !pad.endsWith('.d.ts');

/** De code zonder commentaar. Een '//' na een dubbele punt (https://) is geen commentaar. */
function zonderCommentaar(tekst: string): string {
  return tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const naam = (pad: string): string => relative(SRC, pad).split('\\').join('/');

/** De modules waarnaar een bestand verwijst: `from '...'`, `import '...'` en `import('...')`. */
function verwijzingen(code: string): { pad: string; dynamisch: boolean }[] {
  const uit: { pad: string; dynamisch: boolean }[] = [];
  for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) uit.push({ pad: m[1], dynamisch: false });
  for (const m of code.matchAll(/(^|[\s;])import\s+['"]([^'"]+)['"]/g)) uit.push({ pad: m[2], dynamisch: false });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) uit.push({ pad: m[1], dynamisch: true });
  return uit;
}

const ZUIVER = bestandenIn(BASIS_LIB).filter((p) => isBron(p) && !p.endsWith('.echt.test.ts'));

describe('de zuivere modules van src/lib/basis', () => {
  it('de verwachte modules bestaan, en er is niets dat niet in een bestand van de lijst of van een latere bouwstap past', () => {
    const namen = ZUIVER.map((p) => p.slice(BASIS_LIB.length + 1));
    for (const v of VERWACHT) expect(namen, v).toContain(v);
    // Er staan alleen bronbestanden van type ts in de map (geen tsx: React hoort niet in src/lib/basis).
    expect(namen.filter((n) => n.endsWith('x')), 'tsx of jsx in src/lib/basis').toEqual([]);
  });

  it('lezen de klok niet: geen Date.now, geen new Date() zonder argument, geen performance.now', () => {
    const fouten: string[] = [];
    for (const pad of ZUIVER) {
      const code = zonderCommentaar(lees(pad));
      if (/\bDate\.now\s*\(/.test(code)) fouten.push(`${naam(pad)}: Date.now()`);
      if (/\bnew\s+Date\s*\(\s*\)/.test(code)) fouten.push(`${naam(pad)}: new Date() zonder argument`);
      if (/\bperformance\s*\.\s*now\s*\(/.test(code)) fouten.push(`${naam(pad)}: performance.now()`);
      if (/\bnew\s+Date\s*\(\s*Date\b/.test(code)) fouten.push(`${naam(pad)}: new Date(Date…)`);
    }
    expect(fouten).toEqual([]);
  });

  it('gebruiken geen React, geen fetch, geen DOM en geen willekeur', () => {
    const fouten: string[] = [];
    for (const pad of ZUIVER) {
      const code = zonderCommentaar(lees(pad));
      for (const v of verwijzingen(code)) {
        if (/^(react|react-dom|react-router|react-router-dom|lucide-react)(\/|$)/.test(v.pad)) fouten.push(`${naam(pad)}: importeert ${v.pad}`);
      }
      if (!LAAD_BESTANDEN.has(naam(pad)) && /\bfetch\s*\(/.test(code)) fouten.push(`${naam(pad)}: fetch(`);
      if (/\bXMLHttpRequest\b|\bnavigator\s*\./.test(code)) fouten.push(`${naam(pad)}: netwerk of navigator`);
      // niet na een '/' of '.', zodat een adres als .../document.aspx geen DOM is
      if (/(?<![\w./-])(window|document)\s*\./.test(code)) fouten.push(`${naam(pad)}: window of document`);
      if (/\bMath\.random\s*\(/.test(code)) fouten.push(`${naam(pad)}: Math.random()`);
      if (/\bdangerouslySetInnerHTML\b/.test(code)) fouten.push(`${naam(pad)}: dangerouslySetInnerHTML`);
    }
    expect(fouten).toEqual([]);
  });

  it('gebruiken geen opslag; alleen basisKeuze.ts gebruikt localStorage', () => {
    const fouten: string[] = [];
    for (const pad of ZUIVER) {
      if (pad.endsWith(`/${OPSLAG_BESTAND}`)) continue;
      const code = zonderCommentaar(lees(pad));
      if (/\b(localStorage|sessionStorage|indexedDB|IDBDatabase|openDB)\b/.test(code)) fouten.push(`${naam(pad)}: gebruikt opslag`);
      for (const v of verwijzingen(code)) {
        if (/(^|\/)(storage|storageHealth|db|idb|autosave)$/.test(v.pad)) fouten.push(`${naam(pad)}: importeert ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });

  it('basisKeuze.ts, als het er is, gebruikt alleen localStorage (niet sessionStorage of indexedDB) en schrijft alleen de sleutel wf.basis.keuze.v1', () => {
    const pad = join(BASIS_LIB, OPSLAG_BESTAND);
    if (!existsSync(pad)) return;
    const code = zonderCommentaar(lees(pad));
    expect(code).not.toMatch(/\b(sessionStorage|indexedDB|openDB)\b/);
    expect(code).toContain("'wf.basis.keuze.v1'");
    const sleutels = [...code.matchAll(/['"](wf\.[A-Za-z0-9_.-]+)['"]/g)].map((m) => m[1]);
    expect([...new Set(sleutels)]).toEqual(['wf.basis.keuze.v1']);
  });

  it('halen niets uit de schermen: geen import uit components of pages', () => {
    const fouten: string[] = [];
    for (const pad of ZUIVER) {
      for (const v of verwijzingen(zonderCommentaar(lees(pad)))) {
        if (/(^|\/)(components|pages)(\/|$)/.test(v.pad)) fouten.push(`${naam(pad)}: importeert ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });

  it('zonder uitzondering draaien ze in Node: geen import van node:-modules (die horen in de tests)', () => {
    const fouten: string[] = [];
    for (const pad of ZUIVER) {
      for (const v of verwijzingen(zonderCommentaar(lees(pad)))) {
        if (/^node:/.test(v.pad)) fouten.push(`${naam(pad)}: importeert ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });
});

describe('het basisdeel en de rest van de app', () => {
  const BASIS_MAPPEN = [join(SRC, 'components', 'basis'), join(SRC, 'pages', 'basis')];

  it('geen enkel bestand in src/components/basis en src/pages/basis gebruikt dangerouslySetInnerHTML', () => {
    const fouten = BASIS_MAPPEN.flatMap((m) => bestandenIn(m))
      .filter(isBron)
      .filter((p) => /\bdangerouslySetInnerHTML\b/.test(zonderCommentaar(lees(p))))
      .map(naam);
    expect(fouten).toEqual([]);
  });

  it('alleen basisKeuze.ts schrijft of leest de sleutel wf.basis.keuze, en geen enkel ander bestand van de app kent haar', () => {
    const fouten = bestandenIn(SRC)
      .filter(isBron)
      .filter((p) => !p.endsWith(`/lib/basis/${OPSLAG_BESTAND}`))
      .filter((p) => /wf\.basis\.keuze/.test(zonderCommentaar(lees(p))))
      .map(naam);
    expect(fouten).toEqual([]);
  });

  it('H14: het leerlingpad en de opslag kennen het basisdeel niet', () => {
    const LEERLINGPAD = [
      'pages/PlayerPage.tsx',
      'pages/JoinPage.tsx',
      'pages/OpenSharedPage.tsx',
      'components/ui.tsx',
      'components/A11yMenu.tsx',
      'widgets/registry.tsx',
      'lib/storage.ts',
    ];
    const fouten: string[] = [];
    for (const rel of LEERLINGPAD) {
      const pad = join(SRC, rel);
      expect(existsSync(pad), `${rel} bestaat`).toBe(true);
      for (const v of verwijzingen(zonderCommentaar(lees(pad)))) {
        if (/(^|\/)basis(\/|$)/.test(v.pad)) fouten.push(`${rel}: importeert ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });

  it('H14: niets van src/pages/basis komt in de hoofdbundel: alleen App.tsx kent het, en alleen via een luie import', () => {
    const fouten: string[] = [];
    const appPad = join(SRC, 'App.tsx');
    for (const pad of bestandenIn(SRC).filter(isBron)) {
      if (pad.startsWith(join(SRC, 'pages', 'basis') + '/')) continue;
      const inPages = pad.startsWith(join(SRC, 'pages') + '/');
      for (const v of verwijzingen(zonderCommentaar(lees(pad)))) {
        // Een verwijzing naar pages/basis, of vanuit src/pages naar ./basis/…
        const naarBasisPagina = /(^|\/)pages\/basis(\/|$)/.test(v.pad) || (inPages && /^\.\/basis(\/|$)/.test(v.pad));
        if (!naarBasisPagina) continue;
        if (pad === appPad && v.dynamisch) continue;
        fouten.push(`${naam(pad)}: ${v.dynamisch ? 'luie' : 'vaste'} import van ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });

  it('H14: de vaste imports van lib/basis in de rest van de app beperken zich tot de bestaande gedeelde onderdelen van het momentmodel', () => {
    // Het momentmodel (kalender, moment, momentTeksten) wordt al gebruikt door de pagina Officiële minimumdoelen; de nieuwe
    // modules van de ingang (leerjaarOverzicht, doelBasis, doeltekst, zoekBasis, zoekwoorden, basisRoutes, basisKeuze) niet.
    const ingang = ['leerjaarOverzicht', 'doelBasis', 'doeltekst', 'zoekBasis', 'zoekwoorden', 'basisRoutes', 'basisKeuze'];
    const fouten: string[] = [];
    for (const pad of bestandenIn(SRC).filter(isBron)) {
      const rel = naam(pad);
      if (rel.startsWith('lib/basis/') || rel.startsWith('pages/basis/') || rel.startsWith('components/basis/')) continue;
      for (const v of verwijzingen(zonderCommentaar(lees(pad)))) {
        const m = /(^|\/)basis\/([A-Za-z]+)$/.exec(v.pad);
        if (m && ingang.includes(m[2])) fouten.push(`${rel}: ${v.dynamisch ? 'luie' : 'vaste'} import van ${v.pad}`);
      }
    }
    expect(fouten).toEqual([]);
  });
});
