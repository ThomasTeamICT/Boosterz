// Bewaking van de 3D-proefpagina van de Lichtkamer (LK-3, docs/basisonderwijs/LICHTKAMER-APP.md):
// tools/prototypes/lichtkamer/maak-proef.mjs maakt public/proef/lichtkamer-proef.html met three r128
// en de voorbeeldscripts lokaal. Het script draait als apart Node-proces in een tijdelijke map; er
// gaat niets over het netwerk. De rooktest (rooktest-proef.mjs) opent de pagina in een browser.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAP_LK = join(ROOT, 'tools', 'prototypes', 'lichtkamer');
const SCRIPT = join(MAP_LK, 'maak-proef.mjs');
const PUBLIC_PROEF = join(ROOT, 'public', 'proef');

function bestandenIn(map: string): string[] {
  const uit: string[] = [];
  const loop = (m: string): void => {
    for (const e of readdirSync(m, { withFileTypes: true })) {
      const p = join(m, e.name);
      if (e.isDirectory()) loop(p);
      else uit.push(relative(map, p).split(sep).join('/'));
    }
  };
  loop(map);
  return uit.sort();
}

function draai(script: string, uit: string) {
  const r = spawnSync(process.execPath, [script, '--uit', uit], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let tmp: string;
let schoon: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lichtkamer-proef-'));
  schoon = join(tmp, 'schoon');
  const r = draai(SCRIPT, schoon);
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Een losse kopie van de bronmap, met één wijziging, en het resultaat van het maakscript daarop. */
function draaiMetWijziging(wijzig: (map: string) => void) {
  const werk = mkdtempSync(join(tmp, 'kopie-'));
  const kopie = join(werk, 'tools', 'prototypes', 'lichtkamer');
  cpSync(MAP_LK, kopie, { recursive: true });
  wijzig(kopie);
  const uit = join(werk, 'uit');
  const r = draai(join(kopie, 'maak-proef.mjs'), uit);
  return { ...r, uitBestaat: existsSync(uit) && readdirSync(uit).length > 0 };
}

describe('maak-proef.mjs: de uitvoer', () => {
  it('maakt de pagina en de bestanden ernaast', () => {
    const lijst = bestandenIn(schoon);
    expect(lijst).toEqual([
      'lichtkamer-proef.html',
      'lichtkamer/lk-kleuter.js',
      'lichtkamer/lk-labo.js',
      'lichtkamer/lk-meet.js',
      'lichtkamer/lk-wereld.js',
      'lichtkamer/three/LICENSE',
      'lichtkamer/three/build/three.min.js',
      'lichtkamer/three/examples/js/environments/RoomEnvironment.js',
      'lichtkamer/three/examples/js/geometries/RoundedBoxGeometry.js',
      'lichtkamer/three/examples/js/objects/Reflector.js',
      'lichtkamer/three/examples/js/postprocessing/EffectComposer.js',
      'lichtkamer/three/examples/js/postprocessing/RenderPass.js',
      'lichtkamer/three/examples/js/postprocessing/ShaderPass.js',
      'lichtkamer/three/examples/js/postprocessing/UnrealBloomPass.js',
      'lichtkamer/three/examples/js/shaders/CopyShader.js',
      'lichtkamer/three/examples/js/shaders/GammaCorrectionShader.js',
      'lichtkamer/three/examples/js/shaders/LuminosityHighPassShader.js',
    ]);
  });

  it('is niet geïndexeerd en laadt alleen lokale scripts, three eerst en de meetstand na de modules', () => {
    const html = readFileSync(join(schoon, 'lichtkamer-proef.html'), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<html lang="nl-BE">');
    const srcs = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
    expect(srcs[0]).toBe('lichtkamer/three/build/three.min.js');
    expect(srcs.every((s) => s.startsWith('lichtkamer/') && !s.includes(':') && !s.includes('..'))).toBe(true);
    expect(srcs.every((s) => existsSync(join(schoon, s)))).toBe(true);
    expect(srcs.indexOf('lichtkamer/lk-meet.js')).toBeGreaterThan(srcs.indexOf('lichtkamer/lk-labo.js'));
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it('bevat geen extern adres, geen CDN en geen Google Fonts (behalve de bekende regels in three)', () => {
    for (const f of bestandenIn(schoon)) {
      if (f.startsWith('lichtkamer/three/')) continue;
      const tekst = readFileSync(join(schoon, f), 'utf8');
      expect(tekst, f).not.toMatch(/https?:\/\//);
      expect(tekst, f).not.toMatch(/googleapis|gstatic|cdnjs|jsdelivr|unpkg/i);
    }
    const html = readFileSync(join(schoon, 'lichtkamer-proef.html'), 'utf8');
    const links = html.match(/<link\b[^>]*>/gi) ?? [];
    expect(links).toEqual(['<link rel="icon" href="data:,">']);
  });

  it('gebruikt de vastgelegde kopie van three r128, met controlesommen die kloppen', () => {
    const sums = readFileSync(join(MAP_LK, 'vendor', 'three-r128', 'SHA256SUMS'), 'utf8').trim().split('\n');
    expect(sums.length).toBeGreaterThan(10);
    for (const regel of sums) {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(regel);
      expect(m, regel).not.toBeNull();
      const [, hash, rel] = m as RegExpExecArray;
      const uitvoer = readFileSync(join(schoon, 'lichtkamer', 'three', ...rel.split('/')));
      expect(createHash('sha256').update(uitvoer).digest('hex'), rel).toBe(hash);
    }
    expect(readFileSync(join(schoon, 'lichtkamer', 'three', 'build', 'three.min.js'), 'utf8')).toMatch(/REVISION="128"|REVISION = '128'|="128"/);
  });

  it('bewaart de opslag van het prototype niet onder zijn eigen sleutel en houdt de klas verzonnen', () => {
    const html = readFileSync(join(schoon, 'lichtkamer-proef.html'), 'utf8');
    expect(html).not.toContain("'lichtkamer.v1'");
    expect(html).toContain("'lichtkamer-proef.v1'");
    expect(html).toContain("const VOORBEELDKLAS = ['Amira','Bram','Chloë','Daan','Elif','Finn','Hanne','Ilias'];");
  });

  it('is deterministisch en gelijk aan wat in public/proef/ staat', () => {
    const tweede = join(tmp, 'tweede');
    expect(draai(SCRIPT, tweede).status).toBe(0);
    expect(bestandenIn(tweede)).toEqual(bestandenIn(schoon));
    for (const f of bestandenIn(schoon)) {
      expect(readFileSync(join(tweede, f)).equals(readFileSync(join(schoon, f))), f).toBe(true);
    }
    // Wat in de repo staat, moet gelijk zijn aan wat het script nu maakt: draai het script opnieuw als je dit ziet falen.
    for (const f of bestandenIn(schoon)) {
      const inRepo = join(PUBLIC_PROEF, ...f.split('/'));
      expect(existsSync(inRepo), `${f} ontbreekt in public/proef/: draai node tools/prototypes/lichtkamer/maak-proef.mjs`).toBe(true);
      expect(readFileSync(inRepo).equals(readFileSync(join(schoon, f))), `${f} in public/proef/ is verouderd: draai node tools/prototypes/lichtkamer/maak-proef.mjs`).toBe(true);
    }
    expect(bestandenIn(join(PUBLIC_PROEF, 'lichtkamer')).map((f) => `lichtkamer/${f}`)).toEqual(bestandenIn(schoon).filter((f) => f.startsWith('lichtkamer/')));
  });
});

describe('maak-proef.mjs: weigert en schrijft dan niets', () => {
  it('weigert een extern script in het prototype', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'lichtkamer.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('<script src="lk-wereld.js"></script>', '<script src="https://cdn.example.org/x.js"></script>\n<script src="lk-wereld.js"></script>'));
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Mislukt, er is niets geschreven/);
    expect(r.uitBestaat).toBe(false);
  });

  it('weigert een Google Fonts-regel in de css', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'lichtkamer.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('<style>\n', "<style>\n@import url('https://fonts.googleapis.com/css2?family=Fredoka');\n"));
    });
    expect(r.status).toBe(1);
    expect(r.uitBestaat).toBe(false);
  });

  it('weigert een extern adres in een module', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'lk-kleuter.js');
      writeFileSync(p, `${readFileSync(p, 'utf8')}\nfetch('https://track.example.org/ping');\n`);
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/extern webadres/);
    expect(r.stderr).toContain('track.example.org');
    expect(r.uitBestaat).toBe(false);
  });

  it('weigert een gewijzigd three-bestand (controlesom)', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'vendor', 'three-r128', 'build', 'three.min.js');
      writeFileSync(p, `${readFileSync(p, 'utf8')}\n/* gewijzigd */`);
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/controlesom/);
    expect(r.uitBestaat).toBe(false);
  });

  it('weigert een voorbeeldklas met andere namen', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'lichtkamer.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace("'Amira'", "'Echtenaam'"));
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/voorbeeldklas/);
    expect(r.uitBestaat).toBe(false);
  });

  it('weigert een script dat het prototype nog van de CDN haalt en niet is vastgelegd', () => {
    const r = draaiMetWijziging((map) => {
      const p = join(map, 'lichtkamer.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('<script src="lk-wereld.js"></script>', '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>\n<script src="lk-wereld.js"></script>'));
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/OrbitControls/);
    expect(r.uitBestaat).toBe(false);
  });
});
