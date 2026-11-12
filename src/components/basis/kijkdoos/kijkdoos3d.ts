// De 3D-motor van de kijkdoos: renderer, licht, decor en het 3D-deel van de drie oefeningen van het schaduwtheater
// (tools/prototypes/lichtkamer/lichtkamer.html r. 605-720, alleen 'einde 4de leerjaar'), op three r162.
//
// Dit bestand is een eigen lui chunk: de gevel (index.ts) laadt het met import('./kijkdoos3d'). three zelf komt pas
// binnen in laadMotor(), met import(): nooit statisch, nooit in vendor, het BasisDeel-chunk of op het leerlingpad
// (kijkdoosZonderThree.test.ts en de buildcontrole in vite.config.ts bewaken dat). De gloed (bloom) is een tweede chunk,
// alleen voor de stand 'hoog'.
//
// Elke motor heeft zijn eigen toestand en ruimt bij vernietig() alles op wat hij maakte. Hij rekent met de lichtlogica
// van LK-1 (src/lib/basis/lichtkamer/) en heeft zelf geen formules voor schaduw, rondes of kaartjes.

import type * as THREE from 'three';
import type { EffectComposer as EffectComposerType } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RoomEnvironment as RoomEnvironmentType } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  LENS_AFSTAND,
  SIL_TOP,
  VOORWERP_Z,
  beschrijfKaartjes,
  beschrijfRonde,
  beschrijfSchaduw,
  lampZVoorAfstand,
  lensVan,
  lichtweg,
  maakRonde,
  schaduwPunt,
  KAARTJES_LAMP_Z,
  KAARTJE_Z,
  GAAT_HOOGTES,
  LAMP_HOOGTE,
  LAMP_HOOGTES,
  zetLamp,
  type Lamp,
  type Voorwerp,
} from '../../../lib/basis/lichtkamer';
import { Bak, luister } from '../../../lib/basis/lichtkamer/kijkdoos/bak';
import { Meter, meetTekst } from '../../../lib/basis/lichtkamer/kijkdoos/meet';
import type { MaakMotor, Motor, MotorOpties } from '../../../lib/basis/lichtkamer/kijkdoos/motor';
import { PROEFBEELDEN, instellingenVoor, moetNaarLaag } from '../../../lib/basis/lichtkamer/kijkdoos/standen';
import {
  ONDERZOEK_MAX_CM,
  ONDERZOEK_MIN_CM,
  kijkdoosLabel,
  normaliseer,
  volgendeAfstand,
  type SceneToestand,
  type Zicht,
} from '../../../lib/basis/lichtkamer/kijkdoos/toestand';
import { CANVAS_FONT, LICHT, maakWereld, type Extra, type Three, type Zaklamp } from './wereld';

type Gloed = { composer: EffectComposerType; dispose(): void };

/** Laadt three en de twee voorbeeldmodules die altijd nodig zijn; geeft de maker van een motor terug. */
export async function laadMotor(): Promise<MaakMotor> {
  const [T, rb, re] = await Promise.all([
    import('three'),
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ]);
  // Zoals in r128: een kleur als #c9935a gaat zonder omzetting naar de shader. Zo blijft het beeld bij het prototype.
  T.ColorManagement.enabled = false;
  return (houder, opties) => maakMotor(T, { RoundedBoxGeometry: rb.RoundedBoxGeometry }, re.RoomEnvironment, houder, opties);
}

/**
 * De gloed (UnrealBloom): een apart chunk, alleen voor de stand 'hoog'. Dezelfde keten als het prototype in r128: de
 * scène met tone mapping per materiaal in een lineair doel, de gloed daarop (drempel 0,86), en dan alleen de
 * sRGB-omzetting (GammaCorrectionShader). Zo blijven de lichtstralen, de lens en de letters (toneMapped: false) even fel
 * als in het prototype.
 *
 * In r162 krijgt een materiaal alleen tone mapping als het naar het scherm tekent, of naar een doel met
 * isXRRenderTarget. Daarom zetten we die vlag op de twee doelen van de composer (three staat vast op 0.162.0; zie
 * WebGLRenderer, 'toneMapping' en 'outputColorSpace' in getParameters). OutputPass zou de tone mapping pas op het hele
 * beeld doen, ook op de stralen, en die werden daardoor bleker dan in het prototype.
 */
async function laadGloed(T: Three, r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): Promise<Gloed> {
  const [ec, rp, ub, sp, gc] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/ShaderPass.js'),
    import('three/examples/jsm/shaders/GammaCorrectionShader.js'),
  ]);
  const rt = new T.WebGLRenderTarget(256, 256, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, stencilBuffer: true });
  const composer = new ec.EffectComposer(r, rt);
  for (const doel of [composer.renderTarget1, composer.renderTarget2]) {
    (doel as THREE.WebGLRenderTarget & { isXRRenderTarget?: boolean }).isXRRenderTarget = true;
    doel.texture.colorSpace = T.LinearSRGBColorSpace;
  }
  composer.addPass(new rp.RenderPass(scene, cam));
  const bloom = new ub.UnrealBloomPass(new T.Vector2(256, 256), 0.55, 0.55, 0.86);
  composer.addPass(bloom);
  const gamma = new sp.ShaderPass(gc.GammaCorrectionShader);
  composer.addPass(gamma);
  return {
    composer,
    dispose() {
      bloom.dispose();
      gamma.dispose();
      composer.dispose();
    },
  };
}

type View = { yaw: number; pitch: number; dist: number; target: THREE.Vector3 };
const PRESETS: Record<Zicht, { yaw: number; pitch: number; dist: number; t: [number, number, number] }> = {
  voor: { yaw: 0, pitch: 0.26, dist: 7.4, t: [0, 0.95, 1.9] },
  schuin: { yaw: 0.6, pitch: 0.4, dist: 7.6, t: [0, 0.75, 1.9] },
  opzij: { yaw: 1.42, pitch: 0.14, dist: 6.9, t: [0, 0.6, 1.9] },
  boven: { yaw: 0, pitch: 1.3, dist: 7.8, t: [0, 0, 2.0] },
};

/**
 * Het onderzoek: de camera van het prototype (doel 0,35 / 1,0 / 0,9, afstand 4,0, helling 0,16), met het doel 0,2 lager,
 * zodat de zaklamp bij 10 cm niet meer onder de rand valt (LICHTKAMER-APP.md, 'Wat we uit het prototype herstellen').
 * De meetlat tot 20 cm blijft in beeld.
 */
const ONDERZOEK_ZICHT = { target: [0.35, 0.8, 0.9] as [number, number, number], dist: 4.0, pitch: 0.16 };

const klem = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function maakMotor(T: Three, X: Extra, RoomEnvironment: typeof RoomEnvironmentType, houder: HTMLElement, o: MotorOpties): Motor {
  const inst = instellingenVoor(o.stand);
  const motorBak = new Bak(); // luisteraars, observers, lussen, DOM
  const wereldBak = new Bak(); // wat de hele tijd blijft: texturen, sokkel, omgeving
  const sceneBak = new Bak(); // wat bij één oefening hoort
  const vluchtigBak = new Bak(); // wat bij elke verandering opnieuw getekend wordt (stralen, kaartjes, letters)
  let dood = false;
  let contextWeg = false;

  // ── canvas en renderer ──
  const canvas = document.createElement('canvas');
  canvas.className = 'b-lk-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', '3D-kijkdoos');
  houder.prepend(canvas);
  let r: THREE.WebGLRenderer;
  try {
    r = new T.WebGLRenderer({ canvas, antialias: inst.antialias, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  r.shadowMap.enabled = true;
  r.shadowMap.type = inst.schaduwSoort === 'zacht' ? T.PCFSoftShadowMap : T.PCFShadowMap;
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;

  const w = maakWereld(T, X, wereldBak);
  w.staat.schaduwKaart = inst.schaduwKaart;
  const scene = new T.Scene();
  const kalmKleur = new T.Color(0x1d2436);
  const cam = new T.PerspectiveCamera(38, 16 / 10, 0.4, 40);
  // De nachtlucht achter het decor. In r128 ging een textuur als scene.background door de tone mapping; in r162 niet
  // meer (een sRGB-achtergrond blijft er dan buiten en oogt lichter). Daarom een vlak net voor het verre vlak van de
  // camera, met een gewoon materiaal dat wel getonemapt wordt: zo blijft de lucht zoals in het prototype.
  const achterVlak = new T.Mesh(
    wereldBak.neem(new T.PlaneGeometry(1, 1)),
    wereldBak.neem(new T.MeshBasicMaterial({ map: w.tex.achtergrond(), depthTest: false, depthWrite: false })),
  );
  achterVlak.renderOrder = -1000;
  achterVlak.frustumCulled = false;
  cam.add(achterVlak);
  scene.add(cam);
  function zetAchterVlak(): void {
    const d = 39;
    const h = 2 * d * Math.tan(((cam.fov / 2) * Math.PI) / 180);
    achterVlak.position.set(0, 0, -d);
    achterVlak.scale.set(h * cam.aspect, h, 1);
  }
  const root = new T.Group();
  scene.add(root);
  const hemi = new T.HemisphereLight(0xdfe6ff, 0x3b2b20, 0.35 * LICHT);
  scene.add(hemi);

  // omgeving voor glans en metaal
  try {
    const pm = new T.PMREMGenerator(r);
    const kamer = new RoomEnvironment(r);
    const rt = pm.fromScene(kamer, 0.04);
    w.staat.env = rt.texture;
    wereldBak.neem(rt);
    kamer.dispose();
    pm.dispose();
  } catch {
    w.staat.env = null;
  }

  // sokkel: blijft staan tussen de oefeningen
  const sokkel = new T.Group();
  scene.add(sokkel);
  w.mesh(sokkel, w.geo.rbox(8.0, 0.5, 6.0, 0.12, 4), w.mat.hout('#4a2e1c', { tex: { seed: 21 } }), [0, -0.37, 2.3], { cast: false });
  w.mesh(sokkel, w.geo.rbox(8.12, 0.06, 6.12, 0.03, 2), w.mat.metaal(0xd9a441, { roughness: 0.35 }), [0, -0.14, 2.3], { cast: false });
  const plaatjeMat = wereldBak.neem(
    new T.MeshStandardMaterial({ map: w.tex.tekst(['Lichtkamer', 'Einde 4de leerjaar'], { groot: 50, klein: 30 }), roughness: 0.4, metalness: 0.3 }),
  );
  w.mesh(sokkel, w.geo.g(new T.PlaneGeometry(1.9, 0.36)), plaatjeMat, [0, -0.37, 5.31], { cast: false });

  // ── toestand ──
  let toestand = normaliseer(o.toestand);
  let voorwerp: Voorwerp = o.voorwerp;
  let stralen = o.stralen;
  let prikkelarm = o.prikkelarm;
  const view: View = { yaw: 0, pitch: 0.3, dist: 7.2, target: new T.Vector3(0, 0.85, 1.8) };
  let versiering: THREE.Group | null = null;
  let actief: Opstelling | null = null;

  // ── tekenen: op vraag, of in een lus tijdens slepen, animatie en proefbeelden ──
  const meter = new Meter();
  let gloed: Gloed | null = null;
  let eersteGetekend = false;
  let beeldGevraagd = 0;
  let lusId = 0;
  let vorigeLus = NaN;
  let laatsteAnim = 0;
  const lus = { slepen: false, proef: 0 };
  const proefTijden: number[] = [];
  const minderBeweging = o.minderBeweging;

  function animeert(): boolean {
    return (
      inst.stofjesBewegen &&
      !prikkelarm &&
      !minderBeweging &&
      document.visibilityState === 'visible' &&
      w.staat.stof.some((p) => p.parent && p.visible)
    );
  }

  function teken(): number {
    if (dood || contextWeg) return NaN;
    const t0 = performance.now();
    if (gloed && !prikkelarm) gloed.composer.render();
    else r.render(scene, cam);
    const duur = performance.now() - t0;
    if (!eersteGetekend) {
      eersteGetekend = true;
      meter.eersteBeeld(performance.now() - o.startTijd);
      if (o.keuze === 'auto' && o.stand !== 'laag') lus.proef = PROEFBEELDEN;
      startLus();
    }
    return duur;
  }

  function vraagBeeld(): void {
    if (dood || contextWeg || beeldGevraagd || lusId) return;
    beeldGevraagd = requestAnimationFrame(() => {
      beeldGevraagd = 0;
      const duur = teken();
      meter.beeld(NaN, duur);
      werkMeetVenster();
    });
  }

  function lusNodig(): boolean {
    return lus.slepen || lus.proef > 0 || animeert();
  }

  function startLus(): void {
    if (dood || contextWeg || lusId || !lusNodig()) return;
    if (beeldGevraagd) {
      cancelAnimationFrame(beeldGevraagd);
      beeldGevraagd = 0;
    }
    vorigeLus = NaN;
    lusId = requestAnimationFrame(lusStap);
  }

  function lusStap(t: number): void {
    lusId = 0;
    if (dood || contextWeg) return;
    const tussen = Number.isFinite(vorigeLus) ? t - vorigeLus : NaN;
    // Alleen de stofjes: 25 beelden per seconde, zoals het prototype.
    const alleenAnim = !lus.slepen && lus.proef === 0;
    if (alleenAnim && t - laatsteAnim < 40) {
      vorigeLus = NaN;
      if (lusNodig()) lusId = requestAnimationFrame(lusStap);
      return;
    }
    if (animeert()) {
      laatsteAnim = t;
      for (const p of w.staat.stof) if (p.parent) (p.userData.tik as (x: number) => void)(t);
    }
    const duur = teken();
    // Alleen aansluitende beelden (slepen, proefbeelden) tellen mee in de tijd per beeld; de stofjes lopen op 25 per seconde.
    meter.beeld(alleenAnim ? NaN : tussen, duur);
    if (lus.proef > 0) {
      if (Number.isFinite(tussen)) proefTijden.push(tussen);
      lus.proef--;
      if (lus.proef === 0 && moetNaarLaag(o.keuze, o.stand, proefTijden)) {
        // Na deze beurt: de gevel vernietigt deze motor en start een nieuwe in 'laag'.
        setTimeout(() => {
          if (!dood) o.terug.traag();
        }, 0);
      }
    }
    werkMeetVenster();
    vorigeLus = alleenAnim ? NaN : t;
    if (lusNodig()) lusId = requestAnimationFrame(lusStap);
  }

  motorBak.bijHetOpruimen(() => {
    if (beeldGevraagd) cancelAnimationFrame(beeldGevraagd);
    if (lusId) cancelAnimationFrame(lusId);
    beeldGevraagd = 0;
    lusId = 0;
  });
  luister(motorBak, document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') startLus();
  });

  // ── meetstand ──
  let meetVenster: HTMLElement | null = null;
  let meetLaatst = 0;
  if (o.meet) {
    meetVenster = document.createElement('div');
    meetVenster.className = 'b-lk-meet';
    meetVenster.setAttribute('aria-label', 'Meetstand: frametijden');
    houder.append(meetVenster);
    motorBak.bijHetOpruimen(() => meetVenster?.remove());
  }
  function werkMeetVenster(nu = false): void {
    if (!meetVenster) return;
    const t = performance.now();
    if (!nu && t - meetLaatst < 250) return;
    meetLaatst = t;
    meetVenster.textContent = meetTekst(meter.verslag(o.stand, o.rendererNaam)).join('\n');
  }
  if (meetVenster) {
    const id = window.setInterval(() => werkMeetVenster(true), 1000);
    motorBak.bijHetOpruimen(() => clearInterval(id));
  }

  // ── grootte ──
  function maat(): void {
    if (dood) return;
    const bw = houder.clientWidth || 640;
    const bh = houder.clientHeight || Math.round(bw * 0.625);
    const pr = Math.min(window.devicePixelRatio || 1, inst.maxPixelRatio);
    r.setPixelRatio(pr);
    r.setSize(bw, bh, false);
    if (gloed) {
      gloed.composer.setPixelRatio(pr);
      gloed.composer.setSize(bw, bh);
    }
    cam.aspect = bw / Math.max(1, bh);
    cam.updateProjectionMatrix();
    zetAchterVlak();
    vraagBeeld();
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => maat());
    ro.observe(houder);
    motorBak.bijHetOpruimen(() => ro.disconnect());
  } else {
    luister(motorBak, window, 'resize', () => maat());
  }

  // ── camera ──
  function camUpdate(): void {
    const c = Math.cos(view.pitch);
    cam.position.set(
      view.target.x + Math.sin(view.yaw) * c * view.dist,
      view.target.y + Math.sin(view.pitch) * view.dist,
      view.target.z + Math.cos(view.yaw) * c * view.dist,
    );
    cam.lookAt(view.target);
    vraagBeeld();
  }
  function zetZicht(n: Zicht): void {
    const p = PRESETS[n];
    view.yaw = p.yaw;
    view.pitch = p.pitch;
    view.dist = p.dist;
    view.target.set(p.t[0], p.t[1], p.t[2]);
    camUpdate();
  }

  // ── bouwstenen van de oefeningen ──
  const straalMat = () => w.mat.gloei(0xffd84d);
  function cilinder(a: THREE.Vector3, b: THREE.Vector3, rad: number, m: THREE.Material): THREE.Mesh {
    const d = new T.Vector3().subVectors(b, a);
    const x = new T.Mesh(w.geo.g(new T.CylinderGeometry(rad, rad, d.length(), 12, 1, true)), m);
    x.position.copy(a).addScaledVector(d, 0.5);
    x.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
    x.castShadow = false;
    return x;
  }
  function pijl(a: THREE.Vector3, b: THREE.Vector3, m: THREE.Material, rad = 0.045): THREE.Mesh {
    const d = new T.Vector3().subVectors(b, a);
    const c = new T.Mesh(w.geo.g(new T.ConeGeometry(rad, rad * 2.9, 14)), m);
    c.position.copy(a).addScaledVector(d, 0.55);
    c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
    c.castShadow = false;
    return c;
  }
  function label(tekst: string, kleur = '#16203a', bg = '#ffffff', size = 0.48): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = bg;
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = kleur;
      g.stroke();
      g.fillStyle = kleur;
      g.font = `bold 70px ${CANVAS_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(tekst, 64, 70);
    }
    // Geen eigen geometrie: een sprite deelt die van three, en die blijft staan.
    const tex = vluchtigBak.neem(new T.CanvasTexture(c));
    tex.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(vluchtigBak.neem(new T.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false })));
    s.scale.set(size, size, 1);
    s.renderOrder = 10;
    return s;
  }
  /** Voegt tijdelijke objecten toe; ze verdwijnen bij de volgende verandering (vluchtigBak). */
  const vluchtig: THREE.Object3D[] = [];
  function voegToe(x: THREE.Object3D): void {
    root.add(x);
    vluchtig.push(x);
  }
  function wisVluchtig(): void {
    for (const x of vluchtig) root.remove(x);
    vluchtig.length = 0;
    vluchtigBak.leeg();
  }
  /** Maakt nieuwe materialen en geometrie in deze bak. */
  function metBak<R>(bak: Bak, f: () => R): R {
    const oud = w.staat.huidig;
    w.staat.huidig = bak;
    try {
      return f();
    } finally {
      w.staat.huidig = oud;
    }
  }

  function leegScene(): void {
    wisVluchtig();
    while (root.children.length) root.remove(root.children[root.children.length - 1] as THREE.Object3D);
    sceneBak.leeg();
    w.staat.stof = [];
    hemi.color.set(0xdfe6ff);
    hemi.groundColor.set(0x3b2b20);
    versiering = null;
    actief = null;
  }

  type Opstelling = {
    werkBij(): void;
    zaklamp: Zaklamp;
    /** In het onderzoek: de lamp slepen langs z. */
    sleepZ?: (z: number) => void;
    lamp?: Lamp;
  };

  function decor(): void {
    const d = w.decorSchaduwtheater(root);
    versiering = d.versiering;
    versiering.visible = !prikkelarm;
  }

  /** De zaklamp richt zich op het voorwerp; de lens blijft op (x, y, z − 0,23). Zoals schaduwOpstelling in het prototype. */
  function richtZaklamp(zl: Zaklamp, lamp: Lamp): void {
    const lx = lamp.x;
    const lz = lamp.z - LENS_AFSTAND;
    const dx = 0 - lx;
    const dz = VOORWERP_Z - lz;
    const Lh = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(-dx, -dz);
    zl.groep.rotation.y = yaw;
    zl.groep.position.set(lx + Math.sin(yaw) * LENS_AFSTAND, lamp.y, lz + Math.cos(yaw) * LENS_AFSTAND);
    zl.sp.target.position.set(0, ((0.55 - lamp.y) / Lh) * 4.77, -5);
  }

  /** De lichtstralen van de lens langs de punten van het silhouet tot op het scherm. */
  function schaduwStralen(lamp: Lamp): void {
    const lens = lensVan(lamp);
    const a = new T.Vector3(lens.x, lens.y, lens.z);
    const m = straalMat();
    for (const [px, py] of SIL_TOP[voorwerp]) {
      const s = schaduwPunt(lens, px, py, VOORWERP_Z);
      if (s.y > 2.6 || Math.abs(s.x) > 3.2) continue;
      const eind = new T.Vector3(s.x, s.y, 0.01);
      voegToe(cilinder(a, eind, 0.012, m));
      voegToe(pijl(a, eind, m));
      const dot = new T.Mesh(w.geo.g(new T.SphereGeometry(0.03, 10, 10)), m);
      dot.position.set(px, py, VOORWERP_Z);
      voegToe(dot);
    }
  }

  function schaduwOpstelling(lamp: Lamp, hemiSterkte: number): { zl: Zaklamp; fig: THREE.Group } {
    hemi.intensity = hemiSterkte * LICHT;
    decor();
    const zl = w.zaklamp({ angle: 0.98, y: LAMP_HOOGTE, bundelLengte: 1.1, bundelSterkte: 0.32, stofjes: true });
    root.add(zl.groep);
    const fig = w.figuur(voorwerp);
    fig.position.set(0, 0, VOORWERP_Z);
    root.add(fig);
    richtZaklamp(zl, lamp);
    return { zl, fig };
  }

  function zetSchaduw(fig: THREE.Group, zichtbaar: boolean): void {
    fig.traverse((c) => {
      if (c.userData.silhouet) c.castShadow = zichtbaar;
    });
  }

  function bouwVoorspel(t: Extract<SceneToestand, { scene: 'voorspel' }>): Opstelling {
    const ronde = maakRonde(t.ronde, voorwerp);
    const lamp: Lamp = { ...ronde.lamp };
    const { zl, fig } = schaduwOpstelling(lamp, 0.28);
    zetZicht('voor');
    const op: Opstelling = {
      zaklamp: zl,
      lamp,
      werkBij() {
        if (toestand.scene !== 'voorspel') return;
        const rr = maakRonde(toestand.ronde, voorwerp);
        Object.assign(lamp, rr.lamp);
        richtZaklamp(zl, lamp);
        zetSchaduw(fig, toestand.getoond);
        metBak(vluchtigBak, () => {
          wisVluchtig();
          if (toestand.scene === 'voorspel' && toestand.getoond) schaduwStralen(lamp);
          rr.pos.forEach((x, i) => {
            const sp = label(['A', 'B', 'C'][i] as string);
            sp.position.set(x, rr.letterY, 0.05);
            voegToe(sp);
          });
        });
        o.terug.beschrijving(toestand.getoond ? beschrijfSchaduw(lamp, voorwerp, false) : beschrijfRonde(rr, voorwerp));
      },
    };
    return op;
  }

  function bouwOnderzoek(t: Extract<SceneToestand, { scene: 'onderzoek' }>): Opstelling {
    const lamp: Lamp = { x: 0, y: LAMP_HOOGTE, z: lampZVoorAfstand(t.afstandCm) };
    const { zl, fig } = schaduwOpstelling(lamp, 0.28);
    zetSchaduw(fig, true);
    view.yaw = 0;
    view.pitch = ONDERZOEK_ZICHT.pitch;
    view.dist = ONDERZOEK_ZICHT.dist;
    view.target.set(...ONDERZOEK_ZICHT.target);
    camUpdate();
    const lat = w.meetlat();
    lat.position.set(0.98, 0, 0.012);
    root.add(lat);
    const zmin = lampZVoorAfstand(ONDERZOEK_MIN_CM);
    const zmax = lampZVoorAfstand(ONDERZOEK_MAX_CM);
    const op: Opstelling = {
      zaklamp: zl,
      lamp,
      sleepZ(z: number) {
        const nz = klem(z, zmin, zmax);
        const cm = (nz - LENS_AFSTAND - VOORWERP_Z) * 10;
        verander({ scene: 'onderzoek', afstandCm: cm });
      },
      werkBij() {
        if (toestand.scene !== 'onderzoek') return;
        lamp.z = lampZVoorAfstand(toestand.afstandCm);
        richtZaklamp(zl, lamp);
        metBak(vluchtigBak, () => {
          wisVluchtig();
          if (stralen) schaduwStralen(lamp);
        });
        o.terug.beschrijving(`${beschrijfSchaduw(lamp, voorwerp, false)} Lees de hoogte af op de meetlat rechts.`);
      },
    };
    return op;
  }

  function bouwKaartjes(): Opstelling {
    hemi.intensity = 0.16 * LICHT;
    decor();
    zetZicht('opzij');
    // smalle kegel: geen licht over de bovenrand van de kaartjes
    const zl = w.zaklamp({ angle: 0.3, penumbra: 0.15, intensity: 1.5, y: 0.5, bundelLengte: 0.62, bundelSterkte: 0.3, stofjes: true });
    root.add(zl.groep);
    const op: Opstelling = {
      zaklamp: zl,
      werkBij() {
        if (toestand.scene !== 'kaartjes') return;
        const stand = toestand.stand;
        const ly = LAMP_HOOGTES[stand.lamp] as number;
        zl.groep.position.set(0, ly, KAARTJES_LAMP_Z + LENS_AFSTAND);
        zl.hoogte(ly);
        zl.sp.target.position.set(0, 0, -5);
        metBak(vluchtigBak, () => {
          wisVluchtig();
          KAARTJE_Z.forEach((z, i) => {
            const k = w.kaartje(GAAT_HOOGTES[stand.gaten[i] as number] as number, 3 - i);
            k.position.set(0, 0, z);
            voegToe(k);
          });
          if (stralen) {
            const weg = lichtweg(stand);
            const m = straalMat();
            const a = new T.Vector3(0, ly, KAARTJES_LAMP_Z);
            const eind = new T.Vector3(0, weg.eind.y, weg.eind.z === 0 ? 0.01 : weg.eind.z);
            voegToe(cilinder(a, eind, 0.012, m));
            voegToe(pijl(a, eind, m));
          }
        });
        o.terug.beschrijving(beschrijfKaartjes(stand));
      },
    };
    return op;
  }

  function bouw(): void {
    leegScene();
    metBak(sceneBak, () => {
      if (toestand.scene === 'voorspel') actief = bouwVoorspel(toestand);
      else if (toestand.scene === 'onderzoek') actief = bouwOnderzoek(toestand);
      else actief = bouwKaartjes();
    });
    canvas.setAttribute('aria-label', kijkdoosLabel(toestand, voorwerp));
    zetKalm();
    actief?.werkBij();
    startLus();
    vraagBeeld();
  }

  function werkBij(): void {
    actief?.werkBij();
    vraagBeeld();
  }

  /** Een verandering door het kind in de kijkdoos zelf: bijwerken en terugmelden. */
  function verander(t: SceneToestand): void {
    toestand = normaliseer(t);
    werkBij();
    o.terug.wijziging(toestand);
  }

  function zetKalm(): void {
    scene.background = prikkelarm ? kalmKleur : null;
    achterVlak.visible = !prikkelarm;
    if (versiering) versiering.visible = !prikkelarm;
    for (const p of w.staat.stof) p.visible = !prikkelarm;
  }

  // ── bediening: slepen draait de kijkhoek (beperkt), of verplaatst de zaklamp (onderzoek) ──
  type Sleep = { soort: 'lamp'; vlak: THREE.Plane } | { soort: 'zicht'; x: number; y: number; yaw: number; pitch: number };
  let sleep: Sleep | null = null;
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const pick = (ev: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray;
  };
  // lichtbundels, stofjes en labels zijn geen voorwerpen: een tik gaat erdoor naar wat erachter staat
  const vast = (x: THREE.Object3D) => {
    const ox = x as THREE.Object3D & { isPoints?: boolean; isSprite?: boolean; isLine?: boolean; material?: THREE.Material | THREE.Material[] };
    if (ox.isPoints || ox.isSprite || ox.isLine) return false;
    const m = ox.material;
    if (!m || Array.isArray(m)) return true;
    return !(m.blending === T.AdditiveBlending || (m.transparent && m.depthWrite === false));
  };
  const binnen = (x: THREE.Object3D | null, g: THREE.Object3D) => {
    for (let y = x; y; y = y.parent) if (y === g) return true;
    return false;
  };
  luister(motorBak, canvas, 'pointerdown', (e) => {
    const ev = e as PointerEvent;
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus();
    }
    if (actief?.sleepZ && actief.lamp) {
      const hits = pick(ev).intersectObjects(root.children, true).filter((h) => vast(h.object));
      const eerste = hits[0];
      if (eerste && binnen(eerste.object, actief.zaklamp.groep)) {
        sleep = { soort: 'lamp', vlak: new T.Plane(new T.Vector3(0, 1, 0), -actief.lamp.y) };
      }
    }
    if (!sleep) sleep = { soort: 'zicht', x: ev.clientX, y: ev.clientY, yaw: view.yaw, pitch: view.pitch };
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* geen capture: slepen werkt dan tot de rand */
    }
    canvas.style.cursor = 'grabbing';
    lus.slepen = true;
    meter.wis();
    startLus();
  });
  luister(motorBak, canvas, 'pointermove', (e) => {
    const ev = e as PointerEvent;
    if (!sleep) return;
    if (sleep.soort === 'lamp') {
      const pt = new T.Vector3();
      if (pick(ev).ray.intersectPlane(sleep.vlak, pt)) actief?.sleepZ?.(pt.z);
    } else {
      const b = canvas.getBoundingClientRect();
      view.yaw = klem(sleep.yaw - ((ev.clientX - sleep.x) / b.width) * 1.6, -0.8, 0.8);
      view.pitch = klem(sleep.pitch + ((ev.clientY - sleep.y) / b.height) * 1.2, 0.05, 1.35);
      camUpdate();
    }
  });
  const einde = () => {
    sleep = null;
    canvas.style.cursor = '';
    lus.slepen = false;
  };
  luister(motorBak, canvas, 'pointerup', einde);
  luister(motorBak, canvas, 'pointercancel', einde);
  luister(motorBak, canvas, 'lostpointercapture', einde);
  luister(motorBak, canvas, 'keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    if (toestand.scene === 'onderzoek') {
      verander({ scene: 'onderzoek', afstandCm: volgendeAfstand(toestand.afstandCm, ev.key === 'ArrowUp' ? 'dichter' : 'verder') });
    } else if (toestand.scene === 'kaartjes') {
      verander({ scene: 'kaartjes', stand: zetLamp(toestand.stand, ev.key === 'ArrowUp' ? 1 : -1) });
    } else return;
    ev.preventDefault();
  });

  // ── contextverlies ──
  luister(motorBak, canvas, 'webglcontextlost', (ev) => {
    ev.preventDefault();
    if (dood) return;
    contextWeg = true;
    if (beeldGevraagd) cancelAnimationFrame(beeldGevraagd);
    if (lusId) cancelAnimationFrame(lusId);
    beeldGevraagd = 0;
    lusId = 0;
    o.terug.contextVerloren();
  });

  // ── gloed: alleen in de stand 'hoog' ──
  if (inst.gloed) {
    laadGloed(T, r, scene, cam)
      .then((g) => {
        if (dood) {
          g.dispose();
          return;
        }
        gloed = g;
        maat();
      })
      .catch((e) => console.warn('Kijkdoos zonder gloed:', e));
  }

  // ── van start ──
  bouw();
  maat();

  return {
    toon(t) {
      if (dood) return;
      const n = normaliseer(t);
      const andereScene = n.scene !== toestand.scene;
      toestand = n;
      if (andereScene) bouw();
      else werkBij();
    },
    zetVoorwerp(v) {
      if (dood || v === voorwerp) return;
      voorwerp = v;
      bouw();
    },
    zetStralen(aan) {
      if (dood || aan === stralen) return;
      stralen = aan;
      werkBij();
    },
    zetPrikkelarm(aan) {
      if (dood || aan === prikkelarm) return;
      prikkelarm = aan;
      zetKalm();
      startLus();
      vraagBeeld();
    },
    zetZicht(z) {
      if (dood) return;
      zetZicht(z);
    },
    foto() {
      if (dood || contextWeg) return null;
      try {
        r.render(scene, cam);
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    },
    meting() {
      return meter.verslag(o.stand, o.rendererNaam);
    },
    vernietig() {
      if (dood) return;
      dood = true;
      motorBak.leeg();
      gloed?.dispose();
      gloed = null;
      wisVluchtig();
      while (root.children.length) root.remove(root.children[root.children.length - 1] as THREE.Object3D);
      sceneBak.leeg();
      wereldBak.leeg();
      scene.clear();
      r.renderLists.dispose();
      r.dispose();
      if (!contextWeg) {
        try {
          r.forceContextLoss();
        } catch {
          /* al weg */
        }
      }
      canvas.remove();
    },
  };
}
