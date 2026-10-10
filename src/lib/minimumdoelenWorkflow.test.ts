// Bewaking van de workflow .github/workflows/minimumdoelen.yml (docs/STUDIERICHTINGEN.md § 23.5.8, § 23.5.9 en § 23.14).
//
// Deel 1 leest de workflow als tekst (zonder yaml-pakket: het bestand heeft een vaste vorm) en bewaakt de veiligheidsregels:
//   - het geheim staat alleen in de `env` van de drie ophaalstappen, en die draaien vóór `npm ci`;
//   - de workflow stelt geen enkel `*_API_BASE` in;
//   - invoer (`inputs.*`) gaat nooit in een `run`, enkel via `env` (en in een `if:`);
//   - de reguliere expressies op `bk_onderdelen` en `groepen` staan er en houden stand (echte bash, nagebootste node).
// Een zelftest past de workflow telkens op één punt aan en eist dat de controle dat vangt, zodat ze niet leeg slaagt.
//
// Deel 2 haalt de twee Node-scripts uit de stappen "Samenvatting" en "Pull request openen" en draait ze als apart proces met
// nagebootste rapporten: de tekst van de samenvatting en van de pull request is geen vrije tekst maar code die niet kan
// crashen op een onvolledig rapport. Er gaat nooit een verzoek naar de API; alles wat geschreven wordt, staat in een
// tijdelijke map.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Elke test start Node of bash als apart proces, soms een paar keer na elkaar.
const TIJDLIMIET = 60_000;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'minimumdoelen.yml');
const YML = readFileSync(WORKFLOW, 'utf8');

const GEHEIM = 'ONDERWIJSDOELEN_API_KEY';
const OPHAALSTAPPEN = ['Minimumdoelen ophalen', 'Studierichtingen en koppeling ophalen', 'Beroepskwalificaties per richting ophalen'];
const STAP_NPM = 'Pakketten installeren';
const STAP_SAMENVATTING = 'Samenvatting';
const STAP_PR = 'Pull request openen';

// ── De workflow lezen ───────────────────────────────────────────────────────

interface Stap {
  naam: string;
  /** De voorwaarde (`if:`) zonder `${{ }}`. */
  als?: string;
  env: Record<string, string>;
  /** Het script van `run: |`, zonder de inspringing. */
  run?: string;
}

/** De regels van een blok onder een sleutel: de lege regels en alles wat dieper dan `inspringing` staat. */
function blokVanaf(regels: string[], begin: number, inspringing: number): { regels: string[]; volgende: number } {
  const diep = ' '.repeat(inspringing);
  const uit: string[] = [];
  let i = begin;
  while (i < regels.length && (regels[i].trim() === '' || regels[i].startsWith(diep))) {
    uit.push(regels[i]);
    i++;
  }
  return { regels: uit, volgende: i };
}

function leesStap(regels: string[]): Stap {
  // De eerste regel is "      - sleutel: waarde": de sleutel staat dan op dezelfde plaats als bij de andere regels.
  const r = regels.map((l, i) => (i === 0 ? l.replace(/^ {6}- /, '        ') : l));
  const stap: Stap = { naam: '', env: {} };
  let i = 0;
  while (i < r.length) {
    const naam = /^ {8}name: (.*)$/.exec(r[i]);
    const als = /^ {8}if: (.*)$/.exec(r[i]);
    if (naam) {
      stap.naam = naam[1].trim();
      i++;
    } else if (als) {
      stap.als = als[1].trim().replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
      i++;
    } else if (/^ {8}env:\s*$/.test(r[i])) {
      const blok = blokVanaf(r, i + 1, 10);
      for (const regel of blok.regels) {
        const e = /^ {10}([A-Za-z_][A-Za-z0-9_]*): (.*)$/.exec(regel);
        if (e) stap.env[e[1]] = e[2].trim();
      }
      i = blok.volgende;
    } else if (/^ {8}run: \|\s*$/.test(r[i])) {
      const blok = blokVanaf(r, i + 1, 10);
      stap.run = blok.regels.map((l) => l.slice(10)).join('\n').replace(/\n+$/, '') + '\n';
      i = blok.volgende;
    } else if (/^ {8}run: \S/.test(r[i])) {
      // een opdracht op één regel
      stap.run = r[i].replace(/^ {8}run: /, '') + '\n';
      i++;
    } else {
      i++;
    }
  }
  return stap;
}

function leesStappen(tekst: string): Stap[] {
  const regels = tekst.split('\n');
  const start = regels.indexOf('    steps:');
  if (start < 0) return [];
  const blokken: string[][] = [];
  for (let i = start + 1; i < regels.length; i++) {
    const regel = regels[i];
    if (/^ {6}- /.test(regel)) blokken.push([regel]);
    else if (regel.trim() !== '' && !/^ {6,}/.test(regel)) break; // een regel die minder diep staat: het einde van de stappen
    else if (blokken.length > 0) blokken[blokken.length - 1].push(regel);
  }
  return blokken.map(leesStap);
}

const STAPPEN = leesStappen(YML);
const stapMet = (naam: string, stappen = STAPPEN): Stap => {
  const stap = stappen.find((s) => s.naam === naam);
  if (!stap) throw new Error(`De stap "${naam}" staat niet in de workflow.`);
  return stap;
};

const zonderCommentaar = (tekst: string): string[] => tekst.split('\n').filter((r) => !/^\s*#/.test(r));

/** De opties van de invoer `onderdelen` (de keuzelijst bij het met de hand starten). */
function leesOpties(tekst: string): string[] {
  const regels = tekst.split('\n');
  const invoer = regels.indexOf('      onderdelen:');
  const opties = regels.findIndex((r, i) => i > invoer && r === '        options:');
  if (invoer < 0 || opties < 0) return [];
  const uit: string[] = [];
  for (let i = opties + 1; i < regels.length && /^ {10}- /.test(regels[i]); i++) uit.push(regels[i].replace(/^ {10}- /, '').trim());
  return uit;
}

// ── De veiligheidsregels ────────────────────────────────────────────────────

const GEHEIM_REGEL = new RegExp(`^ {10}${GEHEIM}: \\$\\{\\{ secrets\\.${GEHEIM} \\}\\}$`);
const BK_PATROON = String.raw`patroon='^([0-9]{1,6}(,[0-9]{1,6}){0,49})?$'`;
const GROEPEN_PATROON = String.raw`patroon='^(geen|G-[0-9]{4,6}(,G-[0-9]{4,6}){0,49})?$'`;

/** Controleert één invoer die in een `run` terechtkomt: het patroon staat er, een afwijzing stopt vóór node, en de invoer staat nooit onbeschermd in de opdracht. */
function controleerInvoer(stap: Stap, variabele: string, patroon: string, fouten: string[]): void {
  const run = stap.run ?? '';
  if (!run.includes(patroon)) fouten.push(`De stap "${stap.naam}" mist het patroon ${patroon}.`);
  if (!run.includes(`if ! [[ "\${${variabele}:-}" =~ $patroon ]]; then`)) fouten.push(`De stap "${stap.naam}" keurt ${variabele} niet na met =~ $patroon.`);
  const afwijzing = run.indexOf('exit 1');
  const eerste = run.indexOf('node ');
  if (afwijzing < 0 || eerste < 0 || afwijzing > eerste) fouten.push(`De stap "${stap.naam}" heeft geen exit 1 vóór de eerste node-opdracht.`);
  if (!/^set -euo pipefail$/m.test(run)) fouten.push(`De stap "${stap.naam}" mist set -euo pipefail.`);
  // Na het wegnemen van de twee beschermde vormen mag de variabele nergens meer in de opdrachten staan.
  const rest = run.split(`"\${${variabele}:-}"`).join('').split(`"$${variabele}"`).join('');
  if (new RegExp(`\\$\\{?${variabele}\\b`).test(rest)) fouten.push(`De stap "${stap.naam}" gebruikt ${variabele} zonder aanhalingstekens.`);
}

function controleerVeiligheid(tekst: string): string[] {
  const fouten: string[] = [];
  const stappen = leesStappen(tekst);
  const code = zonderCommentaar(tekst);

  // 1. Het geheim: precies drie keer, als env van de ophaalstappen, en nergens anders (ook niet op werk- of jobniveau).
  const buitenDeDrie = code.filter((r) => !GEHEIM_REGEL.test(r));
  const verdacht = buitenDeDrie.find((r) => /secrets\.|ONDERWIJSDOELEN_API_KEY/.test(r));
  if (verdacht) fouten.push(`Het geheim of een verwijzing naar secrets staat buiten de env van de drie ophaalstappen: ${verdacht.trim()}`);
  const metGeheim = stappen.filter((s) => s.env[GEHEIM] !== undefined).map((s) => s.naam);
  if (metGeheim.join('|') !== OPHAALSTAPPEN.join('|')) {
    fouten.push(`Het geheim staat in de env van [${metGeheim.join(', ')}]; verwacht enkel [${OPHAALSTAPPEN.join(', ')}].`);
  }
  if (code.filter((r) => GEHEIM_REGEL.test(r)).length !== OPHAALSTAPPEN.length) fouten.push(`Het geheim staat niet precies ${OPHAALSTAPPEN.length} keer als env.`);

  // 2. De ophaalstappen draaien vóór npm ci.
  const npm = stappen.findIndex((s) => /\bnpm (ci|install|i)\b/.test(s.run ?? ''));
  if (npm < 0) fouten.push('Er is geen stap met npm ci.');
  for (const naam of OPHAALSTAPPEN) {
    const plaats = stappen.findIndex((s) => s.naam === naam);
    if (plaats < 0) fouten.push(`De stap "${naam}" ontbreekt.`);
    else if (npm >= 0 && plaats > npm) fouten.push(`De stap "${naam}" draait na npm ci.`);
  }

  // 3. Geen enkel API-adres in de workflow.
  const adres = code.find((r) => /_API_BASE/.test(r));
  if (adres) fouten.push(`De workflow stelt een *_API_BASE in: ${adres.trim()}`);

  // 4. Invoer nooit in een run-regel: geen ${{ }} in een run, en inputs.* enkel als env-waarde of in een if:.
  for (const stap of stappen) {
    if ((stap.run ?? '').includes('${{')) fouten.push(`De stap "${stap.naam}" heeft een \${{ }}-uitdrukking in een run.`);
  }
  for (const regel of code.filter((r) => /\binputs\./.test(r))) {
    const alsEnv = /^ {10}[A-Z][A-Z0-9_]*: \$\{\{ inputs\.[a-z_]+ \}\}$/.test(regel);
    const alsVoorwaarde = /^ {8}if: \$\{\{ .* \}\}$/.test(regel);
    if (!alsEnv && !alsVoorwaarde) fouten.push(`Invoer staat buiten een env of een if: ${regel.trim()}`);
  }

  // 5. De reguliere expressies op de invoer.
  const bk = stappen.find((s) => s.naam === OPHAALSTAPPEN[2]);
  if (bk) controleerInvoer(bk, 'BK_ONDERDELEN', BK_PATROON, fouten);
  const groepen = stappen.find((s) => s.naam === OPHAALSTAPPEN[1]);
  if (groepen) controleerInvoer(groepen, 'GROEPEN', GROEPEN_PATROON, fouten);
  return fouten;
}

function muteer(tekst: string, van: string | RegExp, naar: string | ((gevonden: string) => string)): string {
  const nieuw = tekst.replace(van, (gevonden) => (typeof naar === 'string' ? naar : naar(gevonden)));
  if (nieuw === tekst) throw new Error(`De mutatie vond niets om te vervangen: ${String(van)}`);
  return nieuw;
}

const GEHEIM_ENV = `${GEHEIM}: \${{ secrets.${GEHEIM} }}`;
const MUTATIES: { naam: string; maak: (t: string) => string; verwacht: RegExp }[] = [
  { naam: 'het geheim op jobniveau', maak: (t) => muteer(t, / {4}timeout-minutes: \d+\n/, (g) => `${g}    env:\n      ${GEHEIM_ENV}\n`), verwacht: /geheim/i },
  { naam: 'het geheim in de stap npm ci', maak: (t) => muteer(t, `      - name: ${STAP_NPM}\n`, `      - name: ${STAP_NPM}\n        env:\n          ${GEHEIM_ENV}\n`), verwacht: /geheim/i },
  { naam: 'het geheim in de teststap', maak: (t) => muteer(t, '      - name: Geschreven bestanden en de hele app controleren\n', `      - name: Geschreven bestanden en de hele app controleren\n        env:\n          ${GEHEIM_ENV}\n`), verwacht: /geheim/i },
  { naam: 'het geheim in de stap Samenvatting', maak: (t) => muteer(t, `      - name: ${STAP_SAMENVATTING}\n        if: always()\n        continue-on-error: true\n        env:\n`, `      - name: ${STAP_SAMENVATTING}\n        if: always()\n        continue-on-error: true\n        env:\n          ${GEHEIM_ENV}\n`), verwacht: /geheim/i },
  { naam: 'het geheim onder een andere naam', maak: (t) => muteer(t, `      - name: ${STAP_NPM}\n`, `      - name: ${STAP_NPM}\n        env:\n          TOKEN: \${{ secrets.${GEHEIM} }}\n`), verwacht: /secrets/i },
  { naam: 'een API-adres in de beroepskwalificatiestap', maak: (t) => muteer(t, '          BK_ONDERDELEN: ${{ inputs.bk_onderdelen }}\n        run: |\n          set -euo pipefail\n          patroon', '          BK_ONDERDELEN: ${{ inputs.bk_onderdelen }}\n          BEROEPSKWALIFICATIES_API_BASE: https://example.invalid\n        run: |\n          set -euo pipefail\n          patroon'), verwacht: /_API_BASE/ },
  { naam: 'een nummerinvoer rechtstreeks in de opdracht', maak: (t) => muteer(t, 'args+=(--onderdelen "$BK_ONDERDELEN")', 'args+=(--onderdelen "${{ inputs.bk_onderdelen }}")'), verwacht: /run/ },
  { naam: 'de filter rechtstreeks in de opdracht', maak: (t) => muteer(t, 'args+=(--filter "$FILTER")', 'args+=(--filter "${{ inputs.filter }}")'), verwacht: /run/ },
  { naam: 'invoer buiten een env', maak: (t) => muteer(t, `      - name: ${STAP_NPM}\n`, `      - name: ${STAP_NPM}\n        with:\n          nummers: \${{ inputs.bk_onderdelen }}\n`), verwacht: /Invoer staat buiten/ },
  { naam: 'een zwakkere reguliere expressie op bk_onderdelen', maak: (t) => muteer(t, BK_PATROON, "patroon='^[0-9,]*$'"), verwacht: /patroon/ },
  { naam: 'een reguliere expressie op bk_onderdelen zonder grens op het aantal', maak: (t) => muteer(t, BK_PATROON, "patroon='^([0-9]{1,6}(,[0-9]{1,6})*)?$'"), verwacht: /patroon/ },
  { naam: 'een afwijzing van bk_onderdelen die niet stopt', maak: (t) => muteer(t, '(hoogstens 50 nummers van structuuronderdelen)."\n            exit 1', '(hoogstens 50 nummers van structuuronderdelen)."\n            true'), verwacht: /exit 1/ },
  { naam: 'bk_onderdelen zonder aanhalingstekens', maak: (t) => muteer(t, 'args+=(--onderdelen "$BK_ONDERDELEN")', 'args+=(--onderdelen $BK_ONDERDELEN)'), verwacht: /zonder aanhalingstekens/ },
  { naam: 'een zwakkere reguliere expressie op groepen', maak: (t) => muteer(t, GROEPEN_PATROON, "patroon='^.*$'"), verwacht: /patroon/ },
  { naam: 'npm ci vóór de beroepskwalificatiestap', maak: (t) => muteer(t, `      - name: ${OPHAALSTAPPEN[2]}\n`, `      - name: Vroeg installeren\n        run: npm ci\n\n      - name: ${OPHAALSTAPPEN[2]}\n`), verwacht: /na npm ci/ },
];

// ── Een stap draaien met echte bash en een nagebootste node ─────────────────

const HEEFT_BASH = spawnSync('bash', ['-c', 'exit 0']).status === 0;
const TMP: string[] = [];
const nieuweMap = (): string => {
  const map = mkdtempSync(join(tmpdir(), 'minimumdoelen-workflow-'));
  TMP.push(map);
  return map;
};
afterAll(() => {
  for (const map of TMP) rmSync(map, { recursive: true, force: true });
});

/** Draait het script van een stap zoals GitHub dat doet (`bash --noprofile --norc -eo pipefail`), met een nagebootste `node` die zijn argumenten bewaart. */
function draaiStap(stap: Stap, env: Record<string, string | undefined>): { status: number | null; args: string[] | null; map: string } {
  const map = nieuweMap();
  const uit = join(map, 'node-argumenten.txt');
  const script = join(map, 'stap.sh');
  const nepNode = 'node() { : > "$STUB_UIT"; for a in "$@"; do printf \'%s\\n\' "$a" >> "$STUB_UIT"; done; }\n';
  writeFileSync(script, nepNode + (stap.run ?? ''));
  const omgeving: Record<string, string> = { PATH: process.env.PATH ?? '', STUB_UIT: uit };
  for (const [k, v] of Object.entries(env)) if (v !== undefined) omgeving[k] = v;
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { cwd: map, env: omgeving, encoding: 'utf8' });
  return { status: r.status, args: existsSync(uit) ? readFileSync(uit, 'utf8').split('\n').filter((x) => x !== '') : null, map };
}

const nummers = (aantal: number): string => Array.from({ length: aantal }, (_, i) => String(i + 1)).join(',');
const groepNummers = (aantal: number): string => Array.from({ length: aantal }, (_, i) => `G-${String(i + 1).padStart(4, '0')}`).join(',');

describe('workflow minimumdoelen.yml: veiligheid', () => {
  it('wordt gelezen zoals bedoeld (anders slaagt een controle leeg)', () => {
    expect(STAPPEN.length).toBeGreaterThanOrEqual(8);
    for (const naam of [...OPHAALSTAPPEN, STAP_NPM, STAP_SAMENVATTING, STAP_PR]) {
      expect(stapMet(naam).run, `de stap "${naam}" heeft een run`).toBeTruthy();
    }
    for (const naam of OPHAALSTAPPEN) expect(stapMet(naam).env[GEHEIM], `de env van "${naam}"`).toBe(`\${{ secrets.${GEHEIM} }}`);
    expect(stapMet(OPHAALSTAPPEN[2]).env.BK_ONDERDELEN).toBe('${{ inputs.bk_onderdelen }}');
  });

  it('houdt alle veiligheidsregels aan', () => {
    expect(controleerVeiligheid(YML)).toEqual([]);
  });

  it.each(MUTATIES)('de controle vangt: $naam', ({ maak, verwacht }) => {
    const fouten = controleerVeiligheid(maak(YML));
    expect(fouten.length, 'de controle moet de aanpassing vangen').toBeGreaterThan(0);
    expect(fouten.join('\n')).toMatch(verwacht);
  });

  describe.skipIf(!HEEFT_BASH)('de reguliere expressies, in echte bash', () => {
    const BK_SCRIPT = 'tools/leerplannen/haal-beroepskwalificaties.mjs';
    const STUDIE_SCRIPT = 'tools/leerplannen/haal-studierichtingen.mjs';

    it('bk_onderdelen: geldige invoer start het script, met de nummers als één argument', { timeout: TIJDLIMIET }, () => {
      const stap = stapMet(OPHAALSTAPPEN[2]);
      const geldig: [string | undefined, string[]][] = [
        [undefined, [BK_SCRIPT]],
        ['', [BK_SCRIPT]],
        ['504', [BK_SCRIPT, '--onderdelen', '504']],
        ['504,1', [BK_SCRIPT, '--onderdelen', '504,1']],
        ['123456', [BK_SCRIPT, '--onderdelen', '123456']],
        [nummers(50), [BK_SCRIPT, '--onderdelen', nummers(50)]],
      ];
      for (const [invoer, verwacht] of geldig) {
        const r = draaiStap(stap, { BK_ONDERDELEN: invoer, ONDERWIJSDOELEN_API_KEY: 'test-sleutel-1234' });
        expect({ invoer, status: r.status, args: r.args }).toEqual({ invoer, status: 0, args: verwacht });
      }
    });

    it('bk_onderdelen: ongeldige invoer stopt met exit 1 vóór node en voert niets uit', { timeout: TIJDLIMIET }, () => {
      const stap = stapMet(OPHAALSTAPPEN[2]);
      const ongeldig = [
        nummers(51),
        '504,',
        ',504',
        '504,,1',
        '504 ',
        ' 504',
        '504, 1',
        '1234567',
        '-504',
        '5.04',
        'abc',
        'G-0117',
        '504;touch gevaar',
        '504 && touch gevaar',
        '$(touch gevaar)',
        '`touch gevaar`',
        '504\ntouch gevaar',
        '504\n',
        '"; touch gevaar; "',
      ];
      for (const invoer of ongeldig) {
        const r = draaiStap(stap, { BK_ONDERDELEN: invoer });
        expect({ invoer, status: r.status, args: r.args }).toEqual({ invoer, status: 1, args: null });
        expect(existsSync(join(r.map, 'gevaar')), `de invoer ${JSON.stringify(invoer)} mag niets uitvoeren`).toBe(false);
      }
    });

    it('groepen: dezelfde bewaking op de invoer van de studierichtingen', { timeout: TIJDLIMIET }, () => {
      const stap = stapMet(OPHAALSTAPPEN[1]);
      const geldig: [string, string[]][] = [
        ['', [STUDIE_SCRIPT]],
        ['geen', [STUDIE_SCRIPT, '--alleen', 'matrix']],
        ['G-0117', [STUDIE_SCRIPT, '--groepen', 'G-0117']],
        ['G-0117,G-0327', [STUDIE_SCRIPT, '--groepen', 'G-0117,G-0327']],
        [groepNummers(50), [STUDIE_SCRIPT, '--groepen', groepNummers(50)]],
      ];
      for (const [invoer, verwacht] of geldig) {
        const r = draaiStap(stap, { GROEPEN: invoer });
        expect({ invoer, status: r.status, args: r.args }).toEqual({ invoer, status: 0, args: verwacht });
      }
      for (const invoer of [groepNummers(51), 'G-1', 'G-0117,', 'geen,G-0117', 'G-0117;touch gevaar', '$(touch gevaar)', 'G-0117\n']) {
        const r = draaiStap(stap, { GROEPEN: invoer });
        expect({ invoer, status: r.status, args: r.args }).toEqual({ invoer, status: 1, args: null });
        expect(existsSync(join(r.map, 'gevaar'))).toBe(false);
      }
    });
  });
});

// ── De keuzes van onderdelen ────────────────────────────────────────────────

const VOORWAARDEN: Record<string, string[]> = {
  [OPHAALSTAPPEN[0]]: ['', 'alles', 'minimumdoelen', 'zonder-beroepskwalificaties'],
  [OPHAALSTAPPEN[1]]: ['', 'alles', 'studierichtingen', 'zonder-beroepskwalificaties'],
  [OPHAALSTAPPEN[2]]: ['', 'alles', 'beroepskwalificaties'],
};

/** Het script tussen `<<'JS'` en `JS` in de run van een stap. */
function haalJs(stap: Stap): string {
  const m = /<<'JS'\n([\s\S]*?)\nJS\n/.exec(stap.run ?? '');
  if (!m) throw new Error(`Geen script (<<'JS') in de stap "${stap.naam}".`);
  return m[1] + '\n';
}
const SAMENVATTING_JS = haalJs(stapMet(STAP_SAMENVATTING));
const PR_JS = haalJs(stapMet(STAP_PR));

describe('workflow minimumdoelen.yml: keuzes van onderdelen', () => {
  it('biedt de vijf keuzes aan', () => {
    expect(leesOpties(YML)).toEqual(['alles', 'minimumdoelen', 'studierichtingen', 'beroepskwalificaties', 'zonder-beroepskwalificaties']);
  });

  it.each(Object.entries(VOORWAARDEN))('de voorwaarde van "%s" is positief geschreven en noemt precies de verwachte keuzes', (naam, keuzes) => {
    expect(stapMet(naam).als).toBe(keuzes.map((k) => `inputs.onderdelen == '${k}'`).join(' || '));
  });

  it('start bij elke keuze minstens één ophaalstap', () => {
    for (const keuze of leesOpties(YML)) {
      const stappen = Object.entries(VOORWAARDEN).filter(([, keuzes]) => keuzes.includes(keuze));
      expect(stappen.length, `de keuze "${keuze}"`).toBeGreaterThan(0);
    }
  });

  it.each([
    ['SAMENVATTING', SAMENVATTING_JS],
    ['PR', PR_JS],
  ])('de scripts van %s kiezen dezelfde stappen als de voorwaarden', (_naam, js) => {
    const uitScript = (veld: string): string[] => {
      const m = new RegExp(`const ${veld} = \\[([^\\]]*)\\]\\.includes\\(onderdelen\\)`).exec(js);
      if (!m) throw new Error(`${veld} staat niet in het script.`);
      return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort();
    };
    const zonderLeeg = (naam: string): string[] => VOORWAARDEN[naam].filter((k) => k !== '').sort();
    expect(uitScript('metMinimumdoelen')).toEqual(zonderLeeg(OPHAALSTAPPEN[0]));
    expect(uitScript('metStudierichtingen')).toEqual(zonderLeeg(OPHAALSTAPPEN[1]));
    expect(uitScript('metBeroepskwalificaties')).toEqual(zonderLeeg(OPHAALSTAPPEN[2]));
  });
});

// ── De teksten van de samenvatting en de pull request ───────────────────────

type Rec = Record<string, unknown>;

/** Een rapport in de vorm van docs/STUDIERICHTINGEN.md § 23.5.10; `extra` vervangt per sleutel van het eerste niveau en per sleutel van `lijst`, `onderdelen`, `bks` en `bekrachtigingen`. */
function rapportBk(extra: Rec = {}): Rec {
  const basis: Rec = {
    tijdstip: '2026-10-10T00:00:00Z',
    bron: 'api',
    proef: null,
    verzoeken: 1234,
    duurSeconden: 1234.5,
    teBevestigen: ['T1', 'T2'],
    lijst: { paginas: 7, pad: 'beroepskwalificaties/v2/beroepskwalificatie', totaal: 604, ontvangen: 604, volledig: true, nietInLijst: [], nieuwereVersie: [] },
    onderdelen: {
      gevraagd: 833,
      opgehaald: 833,
      nietGevonden: 0,
      tweedeRonde: { onderdelen: 0, verzoeken: 0 },
      perSoortGraadFinaliteit: { 'gewoon|3|A': { metBk: 118, zonderBk: 10 } },
      erkenningenNu: { 0: 0, 1: 833, meer: 0 },
      toekomst: 0,
      geenLijst: 0,
      advVerschilMetMatrix: [],
      nieuw: [],
      nietMeerGekoppeld: [],
      andereVersie: [],
      veldInventaris: {},
    },
    bks: { gevraagd: 312, nieuw: [], inhoudVeranderd: [], nietMeerInBron: [], nietGevonden: [], onbruikbaar: [], versieOverlap: [], competenties: { totaal: 3000, zonderNr: 0, dubbelNr: 0, metHtml: 0, langsteTekst: 105 }, veldInventaris: {} },
    bekrachtigingen: { totaal: 1630, onderwijskwalificatie: 410, dbk: 220, vormOnbekend: 0, voorbeeld: null },
    omvang: { bestanden: 313, bytes: 5_000_000 },
    voorbeeld404: '',
    problemen: [],
    waarschuwingen: [],
    fout: null,
  };
  const uit: Rec = { ...basis };
  for (const [sleutel, waarde] of Object.entries(extra)) {
    const eerder = basis[sleutel];
    const samen = ['lijst', 'onderdelen', 'bks', 'bekrachtigingen'].includes(sleutel) && eerder && typeof eerder === 'object';
    uit[sleutel] = samen ? { ...(eerder as Rec), ...(waarde as Rec) } : waarde;
  }
  return uit;
}

const schoneOmgeving = (): Record<string, string> => ({ PATH: process.env.PATH ?? '' });

function draaiJs(js: string, map: string, env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const bestand = join(map, 'script.mjs');
  writeFileSync(bestand, js);
  const r = spawnSync(process.execPath, [bestand], { cwd: map, env: { ...schoneOmgeving(), ...env }, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** De samenvatting (het bestand waar GITHUB_STEP_SUMMARY naar wijst). `rapport` undefined = geen rapportbestand; `andere` zijn de rapporten van de andere stappen. */
function maakSamenvatting(rapport: unknown, env: Record<string, string> = {}, andere: { studierichtingen?: unknown } = {}): string {
  const map = nieuweMap();
  const rapporten = join(map, 'tools', 'leerplannen', 'rapport');
  mkdirSync(rapporten, { recursive: true });
  if (rapport !== undefined) writeFileSync(join(rapporten, 'laatste-beroepskwalificaties.json'), JSON.stringify(rapport));
  if (andere.studierichtingen !== undefined) writeFileSync(join(rapporten, 'laatste-studierichtingen.json'), JSON.stringify(andere.studierichtingen));
  const samenvatting = join(map, 'samenvatting.md');
  writeFileSync(samenvatting, '');
  const r = draaiJs(SAMENVATTING_JS, map, { ONDERDELEN: 'beroepskwalificaties', GROEPEN: '', BK_ONDERDELEN: '', GITHUB_STEP_SUMMARY: samenvatting, ...env });
  expect(r.status, r.stderr).toBe(0);
  return readFileSync(samenvatting, 'utf8');
}

/** De tekst van de pull request (de uitvoer van het script). De rapporten van de andere stappen zijn leeg: het script moet daar tegen kunnen. */
function maakPrTekst(rapport: unknown, env: Record<string, string> = {}, andere: { minimumdoelen?: unknown; studierichtingen?: unknown } = {}): string {
  const map = nieuweMap();
  const pad = (naam: string, inhoud: unknown): string => {
    const p = join(map, naam);
    writeFileSync(p, JSON.stringify(inhoud));
    return p;
  };
  const r = draaiJs(PR_JS, map, {
    RAPPORT_MINIMUMDOELEN: pad('minimumdoelen.json', andere.minimumdoelen ?? {}),
    RAPPORT_STUDIERICHTINGEN: pad('studierichtingen.json', andere.studierichtingen ?? {}),
    RAPPORT_BEROEPSKWALIFICATIES: pad('beroepskwalificaties.json', rapport),
    RUN_URL: 'https://github.test/Boosterz/actions/runs/1',
    ONDERDELEN: 'beroepskwalificaties',
    GROEPEN: '',
    BK_ONDERDELEN: '',
    ...env,
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

/** Beide teksten voor hetzelfde rapport: de lijsten moeten er in allebei even volledig in staan. */
const beideTeksten = (rapport: unknown): { naam: string; tekst: string }[] => [
  { naam: 'samenvatting', tekst: maakSamenvatting(rapport) },
  { naam: 'pull request', tekst: maakPrTekst(rapport) },
];

describe('workflow minimumdoelen.yml: de hulpfuncties', () => {
  const gedeeld = (js: string): string => {
    const begin = js.indexOf('// ── Gedeelde hulpfuncties');
    const eind = js.indexOf('// ── Einde van de gedeelde hulpfuncties ──');
    if (begin < 0 || eind < begin) throw new Error('De markeringen van de gedeelde hulpfuncties ontbreken.');
    return js.slice(js.indexOf('\n', begin) + 1, eind);
  };

  it('zijn in de stappen Samenvatting en Pull request openen letterlijk gelijk', () => {
    expect(gedeeld(SAMENVATTING_JS).length).toBeGreaterThan(1000);
    expect(gedeeld(SAMENVATTING_JS)).toBe(gedeeld(PR_JS));
  });
});

describe('workflow minimumdoelen.yml: lijsten uit het rapport van de beroepskwalificaties', () => {
  const ANDERE_VERSIE = { nummer: 504, van: 'BK-0390-2', naar: 'BK-0390-3' };

  it('tonen elk veld van een object, in de volgorde van het rapport', { timeout: TIJDLIMIET }, () => {
    const rapport = rapportBk({
      onderdelen: {
        nieuw: [{ onderdeel: 7, bk: 'BK-0001-1' }, '8', 9],
        nietMeerGekoppeld: [{ bk: 'BK-0130-4', sinds: '2026-12-03' }],
        andereVersie: [ANDERE_VERSIE, { onderdeel: 7, van: 'BK-0001-1', naar: 'BK-0001-2' }],
      },
      lijst: { nieuwereVersie: [{ bk: 'BK-0101-2', laatstErkend: 'BK-0101-3' }] },
    });
    for (const { naam, tekst } of beideTeksten(rapport)) {
      for (const verwacht of [
        '`nummer 504: van BK-0390-2, naar BK-0390-3`',
        '`onderdeel 7: van BK-0001-1, naar BK-0001-2`',
        '`onderdeel 7: bk BK-0001-1`',
        '`bk BK-0130-4: sinds 2026-12-03`',
        '`bk BK-0101-2: laatstErkend BK-0101-3`',
        '`8`',
        '`9`',
      ]) {
        expect(tekst, `${naam} mist ${verwacht}`).toContain(verwacht);
      }
      expect(tekst, naam).not.toContain('Andere versie gekoppeld: `504`');
    }
  });

  it('doen dat in elke lijst van het rapport, ook in de fout, de problemen en de waarschuwingen', { timeout: TIJDLIMIET }, () => {
    const rapport = rapportBk({
      onderdelen: { nietGevonden: [{ nummer: 7, status: 404 }], advVerschilMetMatrix: [{ nummer: 9, adv: 'ADV-1' }] },
      bks: {
        nieuw: [{ bk: 'BK-0390-3', aantal: 12 }],
        inhoudVeranderd: [{ bk: 'BK-0464-1', van: 'aaaa', naar: 'bbbb' }],
        nietMeerInBron: [{ bk: 'BK-0100-1', sinds: '2026-10-10' }],
        nietGevonden: [{ bk: 'BK-0200-1', status: 404 }],
        onbruikbaar: [{ bk: 'BK-0300-1', reden: 'competentie zonder code' }],
      },
      lijst: { nietInLijst: [{ bk: 'BK-0400-1', reden: 'niet erkend' }] },
      problemen: [{ code: 'P4', bk: 'BK-0500-1' }],
      waarschuwingen: [{ code: 'W1', tekst: 'lijst onvolledig' }],
      fout: { code: 3, poort: 'P5' },
    });
    // De pull request toont minder dan de samenvatting: de lijsten van de versies die niet gevonden zijn, de problemen en de waarschuwingen staan alleen in de samenvatting.
    const beide = [
      '`nummer 7: status 404`',
      '`bk BK-0390-3: aantal 12`',
      '`bk BK-0464-1: van aaaa, naar bbbb`',
      '`bk BK-0100-1: sinds 2026-10-10`',
      '`bk BK-0300-1: reden competentie zonder code`',
      '**Fout:** `code 3: poort P5`',
    ];
    const alleenSamenvatting = ['`bk BK-0200-1: status 404`', '`code P4: bk BK-0500-1`', '`code W1: tekst lijst onvolledig`'];
    const [samenvatting, pullRequest] = beideTeksten(rapport);
    for (const v of beide) {
      expect(samenvatting.tekst, `samenvatting mist ${v}`).toContain(v);
      expect(pullRequest.tekst, `pull request mist ${v}`).toContain(v);
    }
    for (const v of alleenSamenvatting) expect(samenvatting.tekst, `samenvatting mist ${v}`).toContain(v);
  });

  it('zetten de wijziging van een versie in de zin van de pull request', { timeout: TIJDLIMIET }, () => {
    const tekst = maakPrTekst(rapportBk({ onderdelen: { andereVersie: [ANDERE_VERSIE] } }));
    expect(tekst).toContain('Andere versie gekoppeld: `nummer 504: van BK-0390-2, naar BK-0390-3`.');
    expect(tekst).toContain('Nieuw gekoppeld: geen · Niet meer gekoppeld: geen (de bestanden blijven staan)');
  });

  it('laten een object zonder bekende sleutel niet als JSON staan, en geven lijsten in een veld weer', { timeout: TIJDLIMIET }, () => {
    const rapport = rapportBk({ bks: { nieuw: [{ bk: 'BK-0390-3', onderdelen: [504, 1] }, { titel: 'Zonder sleutel', aantal: 12, klaar: true }, [504, 1], { nest: { a: 1 } }] } });
    for (const { naam, tekst } of beideTeksten(rapport)) {
      expect(tekst, naam).toContain('`bk BK-0390-3: onderdelen 504 / 1`');
      expect(tekst, naam).toContain('`titel Zonder sleutel: aantal 12, klaar true`');
      expect(tekst, naam).toContain('`504, 1`');
      expect(tekst, naam).toContain('`nest {"a":1}`');
      expect(tekst, naam).not.toContain('{"titel"');
    }
  });

  it('houden tekst uit het rapport veilig: één regel, zonder backticks of verticale strepen', { timeout: TIJDLIMIET }, () => {
    const rapport = rapportBk({ onderdelen: { andereVersie: [{ nummer: 1, reden: 'a`b|c\nd e' }, { 'sleutel`|\n': 'waarde' }] } });
    for (const { naam, tekst } of beideTeksten(rapport)) {
      expect(tekst, naam).toContain('`nummer 1: reden a b c d e`');
      expect(tekst, naam).toContain('`sleutel    waarde`');
    }
  });

  it('kappen een lang element af op 120 tekens, zonder te crashen', { timeout: TIJDLIMIET }, () => {
    const lang = { nummer: 504, van: 'BK-0390-2', naar: 'BK-0390-3', toelichting: 'x'.repeat(500) };
    for (const { naam, tekst } of beideTeksten(rapportBk({ onderdelen: { andereVersie: [lang] } }))) {
      const regel = tekst.split('\n').find((r) => r.includes('nummer 504: van BK-0390-2, naar BK-0390-3'));
      expect(regel, naam).toBeTruthy();
      expect(regel).not.toContain('x'.repeat(100));
    }
  });

  it('veranderen niets aan de lijsten van de studierichtingen (groep, titel en reden)', { timeout: TIJDLIMIET }, () => {
    const studie = { matrix: {}, koppeling: { nuZonderDoelen: [{ groep: 'G-0117', titel: 'Voeding', reden: 'geen doelen', extra: 'valt weg' }] } };
    expect(maakSamenvatting(undefined, { ONDERDELEN: 'studierichtingen' }, { studierichtingen: studie })).toContain('- `G-0117 Voeding: geen doelen`');
    expect(maakPrTekst({}, { ONDERDELEN: 'studierichtingen' }, { studierichtingen: studie })).toContain('- `G-0117 Voeding: geen doelen`');
  });
});

describe('workflow minimumdoelen.yml: de proefrun van de beroepskwalificaties', () => {
  const BOVEN = '**Proefrun** voor de onderdelen 504, 1: niet samenvoegen.';
  /** Alles vóór de eerste kop (de plaats waar een lezer begint). */
  const kop = (tekst: string): string => {
    const regels = tekst.split('\n');
    const eerste = regels.findIndex((r, i) => i > 0 && /^#{2,} /.test(r));
    return regels.slice(0, eerste < 0 ? regels.length : eerste).join('\n');
  };

  it('staat in de pull request bovenaan, naast die van de groepen, en nog eens onderaan zoals in het ontwerp', { timeout: TIJDLIMIET }, () => {
    for (const onderdelen of ['alles', 'beroepskwalificaties']) {
      const tekst = maakPrTekst(rapportBk({ proef: [504, 1] }), { ONDERDELEN: onderdelen, BK_ONDERDELEN: '504,1' });
      expect(kop(tekst), `bovenaan bij ${onderdelen}`).toContain(BOVEN);
      expect(tekst.split(BOVEN).length - 1, `twee keer bij ${onderdelen}`).toBe(2);
      expect(tekst.lastIndexOf(BOVEN), `onderaan bij ${onderdelen}`).toBeGreaterThan(tekst.indexOf('### Beroepskwalificaties zelf'));
    }
  });

  it('staat samen met de proefrun van de groepen bovenaan', { timeout: TIJDLIMIET }, () => {
    const tekst = maakPrTekst(rapportBk(), { ONDERDELEN: 'alles', GROEPEN: 'G-0117', BK_ONDERDELEN: '504,1' });
    expect(kop(tekst)).toContain('**Proefrun voor G-0117: niet samenvoegen.**');
    expect(kop(tekst)).toContain(BOVEN);
  });

  it('komt er niet bij zonder bk_onderdelen of als de beroepskwalificaties niet meelopen', { timeout: TIJDLIMIET }, () => {
    expect(maakPrTekst(rapportBk(), { ONDERDELEN: 'alles' })).not.toContain('Proefrun');
    expect(maakPrTekst(rapportBk(), { ONDERDELEN: 'minimumdoelen', BK_ONDERDELEN: '504,1' })).not.toContain('onderdelen 504');
    expect(maakSamenvatting(rapportBk(), { ONDERDELEN: 'alles' })).not.toContain('Proefrun voor de onderdelen');
  });

  it('keurt de nummers nog eens na en zet vreemde invoer als codespan', { timeout: TIJDLIMIET }, () => {
    const tekst = maakPrTekst(rapportBk(), { BK_ONDERDELEN: '504;`rm`|x' });
    expect(tekst).toContain('**Proefrun** voor de onderdelen `504; rm  x`: niet samenvoegen.');
  });

  it('staat in de samenvatting bovenaan', { timeout: TIJDLIMIET }, () => {
    const tekst = maakSamenvatting(rapportBk({ proef: [504, 1] }), { ONDERDELEN: 'alles', BK_ONDERDELEN: '504,1' });
    expect(kop(tekst)).toContain(`${BOVEN} Sluit de pull request na het nakijken.`);
  });
});

describe('workflow minimumdoelen.yml: getallen en ontbrekende velden in de samenvatting', () => {
  const rij = (tekst: string, label: string): string => {
    const regel = tekst.split('\n').find((r) => r.startsWith(`| ${label} |`));
    if (!regel) throw new Error(`Geen rij "${label}" in de samenvatting.`);
    return regel;
  };

  it('zegt "niet in het rapport" als het veld proef ontbreekt, en "nee" enkel bij null', { timeout: TIJDLIMIET }, () => {
    const zonderProef = rapportBk();
    delete zonderProef.proef;
    expect(rij(maakSamenvatting(zonderProef), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | niet in het rapport |');
    expect(rij(maakSamenvatting({}), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | niet in het rapport |');
    expect(rij(maakSamenvatting(rapportBk({ proef: null })), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | nee |');
  });

  it('toont de nummers van een proefrun', { timeout: TIJDLIMIET }, () => {
    expect(rij(maakSamenvatting(rapportBk({ proef: [504, 1] })), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | `504, 1` |');
    expect(rij(maakSamenvatting(rapportBk({ proef: '504,1' })), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | `504,1` |');
    expect(rij(maakSamenvatting(rapportBk({ proef: '' })), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | `""` |');
    expect(rij(maakSamenvatting(rapportBk({ proef: [] })), 'Proefrun (onderdelen)')).toBe('| Proefrun (onderdelen) | `[]` |');
  });

  it('schrijft getallen op zijn Vlaams: punt voor de duizendtallen, komma voor de decimalen', { timeout: TIJDLIMIET }, () => {
    const gevallen: [number, string][] = [
      [1234, '1.234'],
      [1234.5, '1.234,5'],
      [1234567.25, '1.234.567,25'],
      [0.5, '0,5'],
      [12.75, '12,75'],
      [999, '999'],
      [0, '0'],
      [-1234.5, '-1.234,5'],
    ];
    for (const [getal, verwacht] of gevallen) {
      const tekst = maakSamenvatting(rapportBk({ verzoeken: 1234, duurSeconden: getal }));
      expect(rij(tekst, 'Duur in seconden'), `getal ${getal}`).toBe(`| Duur in seconden | ${verwacht} |`);
      expect(rij(tekst, 'Verzoeken')).toBe('| Verzoeken | 1.234 |');
    }
  });

  it('laat een ontbrekend of vreemd getal niet crashen', { timeout: TIJDLIMIET }, () => {
    for (const duur of [undefined, null, 'veel', NaN, [1], { a: 1 }]) {
      const tekst = maakSamenvatting(rapportBk({ duurSeconden: duur }));
      expect(rij(tekst, 'Duur in seconden')).toBe('| Duur in seconden | niet in het rapport |');
    }
  });

  it('houdt een leeg rapport, een onleesbaar rapport en een ontbrekend rapport overeind', { timeout: TIJDLIMIET }, () => {
    expect(maakSamenvatting({})).toContain('| Verzoeken | niet in het rapport |');
    expect(maakSamenvatting(undefined)).toContain('Er is geen rapport van de beroepskwalificaties');
    expect(maakSamenvatting([])).toContain('onverwachte vorm');
    expect(maakPrTekst({})).toContain('Onderdelen opgevraagd: niet in het rapport');
    expect(maakPrTekst({})).toContain('Andere versie gekoppeld: niet in het rapport.');
  });

  it('toont in de pull request de getallen met een punt voor de duizendtallen', { timeout: TIJDLIMIET }, () => {
    const tekst = maakPrTekst(rapportBk());
    expect(tekst).toContain('Studiebekrachtigingen: 1.630 (onderwijskwalificatie 410; deelkwalificaties 220, alleen bij naam).');
  });
});
