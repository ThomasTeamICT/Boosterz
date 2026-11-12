// De standen van de kijkdoos en de automatische keuze (zuiver).
import { describe, expect, it } from 'vitest';
import {
  PROEFBEELDEN,
  STANDEN,
  TRAAG_MS,
  beginStand,
  instellingenVoor,
  isSoftwareRenderer,
  isStand,
  mediaan,
  moetNaarLaag,
  standVoorRenderer,
} from './standen';

describe('standen van de kijkdoos', () => {
  it('drie standen zoals in het ontwerp', () => {
    expect(STANDEN).toEqual(['hoog', 'midden', 'laag']);
    // hoog: gloed en pixelratio 2
    expect(instellingenVoor('hoog')).toMatchObject({ gloed: true, maxPixelRatio: 2, antialias: true, schaduwKaart: 2048, schaduwSoort: 'zacht' });
    // midden: zoals het prototype op een Chromebook
    expect(instellingenVoor('midden')).toMatchObject({ gloed: false, maxPixelRatio: 1.25, antialias: true, schaduwKaart: 2048, schaduwSoort: 'zacht' });
    // laag: schaduwkaart 1024, PCFShadowMap, geen antialias, pixelratio 1
    expect(instellingenVoor('laag')).toMatchObject({ gloed: false, maxPixelRatio: 1, antialias: false, schaduwKaart: 1024, schaduwSoort: 'pcf' });
    // alleen op het bord bewegen de stofjes
    expect(STANDEN.filter((s) => instellingenVoor(s).stofjesBewegen)).toEqual(['hoog']);
  });

  it('isStand', () => {
    for (const s of STANDEN) expect(isStand(s)).toBe(true);
    for (const x of ['auto', '', 'HOOG', null, undefined, 2]) expect(isStand(x)).toBe(false);
  });

  it('beginstand: auto kiest hoog op het bord en midden elders; een vaste keuze blijft', () => {
    expect(beginStand('auto', true)).toBe('hoog');
    expect(beginStand('auto', false)).toBe('midden');
    for (const s of STANDEN) {
      expect(beginStand(s, true)).toBe(s);
      expect(beginStand(s, false)).toBe(s);
    }
  });

  it('herkent een toestel zonder grafische kaart', () => {
    for (const n of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'softpipe',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
    ])
      expect(isSoftwareRenderer(n), n).toBe(true);
    for (const n of ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 600 (GLK 2), OpenGL 4.6)', 'Apple GPU', 'Mali-G72', '', null, undefined])
      expect(isSoftwareRenderer(n), String(n)).toBe(false);
  });

  it('standVoorRenderer: alleen bij auto naar laag op een softwarerenderer', () => {
    expect(standVoorRenderer('auto', false, 'Google SwiftShader')).toBe('laag');
    expect(standVoorRenderer('auto', true, 'llvmpipe')).toBe('laag');
    expect(standVoorRenderer('auto', true, 'Apple GPU')).toBe('hoog');
    expect(standVoorRenderer('midden', false, 'Google SwiftShader')).toBe('midden');
    expect(standVoorRenderer('hoog', true, 'Google SwiftShader')).toBe('hoog');
  });

  it('mediaan', () => {
    expect(mediaan([])).toBeNaN();
    expect(mediaan([3])).toBe(3);
    expect(mediaan([5, 1, 3])).toBe(3);
    expect(mediaan([4, 1, 3, 2])).toBe(2.5);
    expect(mediaan([NaN, 2, Infinity, 4])).toBe(3);
  });

  it('moetNaarLaag: alleen auto, alleen omlaag, alleen met genoeg metingen', () => {
    const traag = Array(PROEFBEELDEN - 1).fill(TRAAG_MS + 20);
    const vlot = Array(PROEFBEELDEN - 1).fill(16.7);
    expect(moetNaarLaag('auto', 'midden', traag)).toBe(true);
    expect(moetNaarLaag('auto', 'hoog', traag)).toBe(true);
    expect(moetNaarLaag('auto', 'midden', vlot)).toBe(false);
    // nooit van laag naar laag, en nooit bij een vaste keuze
    expect(moetNaarLaag('auto', 'laag', traag)).toBe(false);
    expect(moetNaarLaag('midden', 'midden', traag)).toBe(false);
    expect(moetNaarLaag('hoog', 'hoog', traag)).toBe(false);
    // te weinig metingen: niets beslissen
    expect(moetNaarLaag('auto', 'midden', traag.slice(1))).toBe(false);
    expect(moetNaarLaag('auto', 'midden', [NaN, NaN, NaN, NaN, NaN])).toBe(false);
    // precies op de grens is nog niet traag; één uitschieter ook niet
    expect(moetNaarLaag('auto', 'midden', Array(PROEFBEELDEN - 1).fill(TRAAG_MS))).toBe(false);
    expect(moetNaarLaag('auto', 'midden', [16, 16, 16, 400])).toBe(false);
  });
});
