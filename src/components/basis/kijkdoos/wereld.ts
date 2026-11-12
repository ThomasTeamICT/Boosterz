// De 3D-wereld van de kijkdoos: texturen, materialen, de zaklamp, de kartonnen figuren, de kaartjes, de meetlat en het
// decor van het schaduwtheater. Overgezet uit tools/prototypes/lichtkamer/lk-wereld.js (alleen wat 'einde 4de leerjaar'
// gebruikt), op three r162.
//
// three komt hier nooit statisch binnen: wie de wereld maakt, geeft de module mee (`T`), geladen met import('three')
// (zie kijkdoos3d.ts en kijkdoosZonderThree.test.ts). Alles wat de wereld maakt, gaat in een bak (bak.ts): de cache van
// texturen in de bak van de wereld, al de rest in de bak die op dat moment `huidig` is (de wereld, de oefening, of de
// dingen die bij elke verandering opnieuw getekend worden).
//
// De overstap van r128 naar r162 (docs/basisonderwijs/LICHTKAMER-APP.md, 'three.js r162 in de eigen bundel'):
//  - `colorSpace` in plaats van `encoding`;
//  - ColorManagement staat uit (kijkdoos3d.ts), zoals in r128: een kleur als #c9935a gaat dan rechtstreeks naar de shader;
//  - lichten: r162 rekent fysisch (geen useLegacyLights). In r128 vermenigvuldigde three elk licht met π en dempte een
//    spot met distance 0 niet met de afstand. Daarom hier elke lichtsterkte × π (LICHT) en decay 0.

import type * as THREE from 'three';
import type { RoundedBoxGeometry as RoundedBoxGeometryType } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SIL_TOP, type Voorwerp } from '../../../lib/basis/lichtkamer';
import type { Bak } from '../../../lib/basis/lichtkamer/kijkdoos/bak';

export type Three = typeof THREE;
export type Extra = { RoundedBoxGeometry: typeof RoundedBoxGeometryType };

/** Elke lichtsterkte van het prototype × π: zo geeft r162 zonder useLegacyLights hetzelfde licht als r128. */
export const LICHT = Math.PI;

export const KLEUR = {
  nachtBoven: '#2b3561',
  nachtOnder: '#0c1022',
  hout: '#c9935a',
  houtDonker: '#6b4426',
  houtLicht: '#e2b884',
  walnoot: '#4a2e1c',
  papier: '#f4efe4',
  karton: '#c49a6c',
  kartonDonker: '#8a6440',
  velours: '#8e1f2f',
  veloursDonker: '#5c1220',
  goud: '#d9a441',
  zaklamp: '#ffb703',
  zaklampDonker: '#e08a00',
  lamplicht: 0xfff0c8,
} as const;

/** Lettertype op het canvas (labels, naamplaatje): Fredoka, zelf gehost in basis.css. */
export const CANVAS_FONT = 'Fredoka, Verdana, sans-serif';

/** Deterministische ruis voor de texturen (dezelfde reeks als het prototype). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Teken = (g: CanvasRenderingContext2D, w: number, h: number) => void;
type Mat = THREE.Material;
type MeshOpts = { rot?: [number, number, number]; cast?: boolean; receive?: boolean };

export type ZaklampOpts = {
  intensity?: number;
  angle?: number;
  penumbra?: number;
  shadow?: boolean;
  y?: number;
  statief?: boolean;
  bundel?: boolean;
  bundelLengte?: number;
  bundelSterkte?: number;
  stofjes?: boolean;
  schaduwKaart?: number;
};

export type Zaklamp = {
  groep: THREE.Group;
  lens: THREE.Mesh;
  sp: THREE.SpotLight;
  bundel: THREE.Mesh | null;
  zet(aan: boolean): void;
  hoogte(y: number): void;
};

export type Wereld = ReturnType<typeof maakWereld>;

/**
 * De bouwstenen van de wereld. `wereldBak` houdt de cache van texturen en alles wat de hele tijd blijft; `huidig` is de
 * bak waarin nieuwe materialen en geometrie gaan (de kijkdoos zet hem per oefening en per verandering).
 */
export function maakWereld(T: Three, X: Extra, wereldBak: Bak) {
  const staat = { huidig: wereldBak, env: null as THREE.Texture | null, schaduwKaart: 2048, stof: [] as THREE.Points[] };
  const neem = <D extends { dispose(): void }>(d: D): D => staat.huidig.neem(d);

  function canvasTex(w: number, h: number, teken: Teken, opts: { herhaal?: [number, number] } = {}, bak?: Bak): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) teken(g, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (opts.herhaal) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(opts.herhaal[0], opts.herhaal[1]);
    }
    return (bak ?? staat.huidig).neem(t);
  }

  function shade(hex: string, f: number): string {
    const c = new T.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f)));
    return '#' + c.getHexString();
  }

  const TEX = new Map<string, THREE.Texture>();
  const cache = (key: string, maak: () => THREE.Texture) => {
    const t = TEX.get(key);
    if (t) return t;
    const n = maak();
    TEX.set(key, n);
    return n;
  };
  wereldBak.bijHetOpruimen(() => TEX.clear());

  const tex = {
    hout(kleur: string = KLEUR.hout, opts: { seed?: number; planken?: number; herhaal?: [number, number] } = {}) {
      const key = 'hout' + kleur + JSON.stringify(opts);
      return cache(key, () => {
        const r = rng(opts.seed || 7);
        const planken = opts.planken || 0;
        return canvasTex(
          512,
          512,
          (g, w, h) => {
            g.fillStyle = kleur;
            g.fillRect(0, 0, w, h);
            const n = planken || 1;
            const ph = h / n;
            for (let p = 0; p < n; p++) {
              const y0 = p * ph;
              g.fillStyle = shade(kleur, 0.9 + r() * 0.2);
              g.fillRect(0, y0, w, ph);
              for (let i = 0; i < 26; i++) {
                g.strokeStyle = shade(kleur, 0.78 + r() * 0.18);
                g.globalAlpha = 0.35 + r() * 0.3;
                g.lineWidth = 1 + r() * 2;
                g.beginPath();
                const y = y0 + r() * ph;
                g.moveTo(0, y);
                for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3 * r());
                g.stroke();
              }
              if (planken) {
                g.globalAlpha = 1;
                g.fillStyle = shade(kleur, 0.6);
                g.fillRect(0, y0, w, 2);
                const off = r() * w;
                g.fillRect(off, y0, 2, ph);
              }
              if (r() < 0.5) {
                g.globalAlpha = 0.35;
                g.fillStyle = shade(kleur, 0.7);
                g.beginPath();
                g.ellipse(r() * w, y0 + ph / 2, 10 + r() * 8, 4, 0, 0, Math.PI * 2);
                g.fill();
              }
            }
            g.globalAlpha = 1;
          },
          { herhaal: opts.herhaal || [1, 1] },
          wereldBak,
        );
      });
    },
    papier(kleur: string = KLEUR.papier) {
      return cache('papier' + kleur, () => {
        const r = rng(3);
        return canvasTex(
          512,
          512,
          (g, w, h) => {
            g.fillStyle = kleur;
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 2600; i++) {
              g.fillStyle = r() < 0.5 ? 'rgba(120,100,70,.05)' : 'rgba(255,255,255,.08)';
              g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
            }
          },
          {},
          wereldBak,
        );
      });
    },
    karton(kleur: string = KLEUR.karton) {
      return cache('karton' + kleur, () => {
        const r = rng(11);
        return canvasTex(
          256,
          256,
          (g, w, h) => {
            g.fillStyle = kleur;
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 1800; i++) {
              g.fillStyle = r() < 0.5 ? 'rgba(80,50,20,.10)' : 'rgba(255,240,210,.10)';
              g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
            }
          },
          { herhaal: [2, 2] },
          wereldBak,
        );
      });
    },
    patroon(achter: string, voor: string, soort: 'ster', opts: { herhaal?: [number, number] } = {}) {
      return cache('patroon' + achter + voor + soort, () => {
        const r = rng(5);
        return canvasTex(
          256,
          256,
          (g, w, h) => {
            g.fillStyle = achter;
            g.fillRect(0, 0, w, h);
            g.fillStyle = voor;
            for (let i = 0; i < 18; i++) {
              const x = r() * w;
              const y = r() * h;
              const s = 3 + r() * 4;
              g.beginPath();
              for (let k = 0; k < 10; k++) {
                const a = (k * Math.PI) / 5;
                const rr = k % 2 ? s * 0.45 : s;
                g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr);
              }
              g.fill();
            }
          },
          { herhaal: opts.herhaal || [3, 3] },
          wereldBak,
        );
      });
    },
    blob() {
      return cache('blob', () => {
        const t = canvasTex(
          128,
          128,
          (g, w, h) => {
            const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
            gr.addColorStop(0, 'rgba(0,0,0,.55)');
            gr.addColorStop(0.55, 'rgba(0,0,0,.22)');
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
          },
          {},
          wereldBak,
        );
        t.colorSpace = T.NoColorSpace; // LinearEncoding in r128
        return t;
      });
    },
    achtergrond() {
      return cache('bg', () =>
        canvasTex(
          512,
          512,
          (g, w, h) => {
            const gr = g.createLinearGradient(0, 0, 0, h);
            gr.addColorStop(0, KLEUR.nachtBoven);
            gr.addColorStop(1, KLEUR.nachtOnder);
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
            const rg = g.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.5, w * 0.75);
            rg.addColorStop(0, 'rgba(120,140,220,.25)');
            rg.addColorStop(1, 'rgba(0,0,0,.35)');
            g.fillStyle = rg;
            g.fillRect(0, 0, w, h);
          },
          {},
          wereldBak,
        ),
      );
    },
    tekst(
      regels: string[],
      opts: { w?: number; h?: number; bg?: string; r?: number; rand?: string; kleur?: string; groot?: number; klein?: number; lijn?: number } = {},
    ) {
      const w = opts.w || 512;
      const h = opts.h || 128;
      return canvasTex(w, h, (g) => {
        g.fillStyle = opts.bg || '#e9c46a';
        const r = opts.r || 18;
        g.beginPath();
        g.moveTo(r, 0);
        g.arcTo(w, 0, w, h, r);
        g.arcTo(w, h, 0, h, r);
        g.arcTo(0, h, 0, 0, r);
        g.arcTo(0, 0, w, 0, r);
        g.fill();
        g.strokeStyle = opts.rand || 'rgba(0,0,0,.25)';
        g.lineWidth = 6;
        g.stroke();
        g.fillStyle = opts.kleur || '#3b2610';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        regels.forEach((rg, i) => {
          g.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? opts.groot || 54 : opts.klein || 32}px ${CANVAS_FONT}`;
          g.fillText(rg, w / 2, h / 2 + (i - (regels.length - 1) / 2) * (opts.lijn || 52));
        });
      });
    },
  };

  const std = (kleur: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
    neem(new T.MeshStandardMaterial(Object.assign({ color: kleur, roughness: 0.8, metalness: 0 }, o)));
  const mat = {
    std,
    hout(kleur: string, o: { tex?: Parameters<typeof tex.hout>[1]; m?: THREE.MeshStandardMaterialParameters } = {}) {
      return neem(new T.MeshStandardMaterial(Object.assign({ color: 0xffffff, map: tex.hout(kleur, o.tex || {}), roughness: 0.7 }, o.m || {})));
    },
    papier(kleur?: string) {
      return neem(new T.MeshStandardMaterial({ color: 0xffffff, map: tex.papier(kleur), roughness: 0.95 }));
    },
    karton(kleur?: string) {
      return neem(new T.MeshStandardMaterial({ color: 0xffffff, map: tex.karton(kleur), roughness: 0.95 }));
    },
    metaal(kleur: THREE.ColorRepresentation = 0xd8dde4, o: THREE.MeshStandardMaterialParameters = {}) {
      return neem(
        new T.MeshStandardMaterial(Object.assign({ color: kleur, metalness: 0.9, roughness: 0.28, envMap: staat.env, envMapIntensity: 0.9 }, o)),
      );
    },
    glans(kleur: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) {
      return neem(
        new T.MeshStandardMaterial(Object.assign({ color: kleur, metalness: 0.05, roughness: 0.35, envMap: staat.env, envMapIntensity: 0.5 }, o)),
      );
    },
    gloei(kleur: THREE.ColorRepresentation) {
      return neem(new T.MeshBasicMaterial({ color: kleur, toneMapped: false }));
    },
  };

  const geo = {
    rbox(w: number, h: number, d: number, r = 0.04, seg = 3): THREE.BufferGeometry {
      return neem(new X.RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
    },
    g<G extends THREE.BufferGeometry>(g: G): G {
      return neem(g);
    },
  };

  function mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: Mat | Mat[], pos?: [number, number, number] | null, o: MeshOpts = {}) {
    const x = new T.Mesh(g, m);
    if (pos) x.position.set(pos[0], pos[1], pos[2]);
    if (o.rot) x.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    x.castShadow = o.cast !== false;
    x.receiveShadow = o.receive !== false;
    parent.add(x);
    return x;
  }

  function blob(parent: THREE.Object3D, x: number, z: number, w: number, d: number, opacity = 0.5) {
    const m = new T.Mesh(
      geo.g(new T.PlaneGeometry(w, d)),
      neem(new T.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, opacity, toneMapped: false })),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.renderOrder = 1;
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  // ───── lichtbundel: zachte gloed die van de lamp weg wijst en snel uitdooft ─────
  function bundel(opts: { lengte?: number; hoek?: number; kleur?: number; sterkte?: number } = {}) {
    const lengte = opts.lengte || 1.6;
    const hoek = opts.hoek || 0.5;
    const g = geo.g(new T.ConeGeometry(Math.tan(hoek) * lengte, lengte, 40, 1, true));
    g.translate(0, -lengte / 2, 0);
    g.rotateX(-Math.PI / 2); // top in de oorsprong, opening naar +z
    const m = neem(
      new T.ShaderMaterial({
        uniforms: { kleur: { value: new T.Color(opts.kleur || 0xffe7a8) }, sterkte: { value: opts.sterkte ?? 0.55 }, lengte: { value: lengte } },
        vertexShader:
          'varying vec3 vN; varying vec3 vV; varying float vD; uniform float lengte; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vD = clamp(position.z/lengte,0.0,1.0); gl_Position = projectionMatrix*mv; }',
        fragmentShader:
          'varying vec3 vN; varying vec3 vV; varying float vD; uniform vec3 kleur; uniform float sterkte; void main(){ float rand = pow(abs(dot(vN,vV)),1.6); float uit = pow(1.0-vD,2.2); gl_FragColor = vec4(kleur, sterkte*rand*uit); }',
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        toneMapped: false,
      }),
    );
    const x = new T.Mesh(g, m);
    x.castShadow = false;
    x.receiveShadow = false;
    x.renderOrder = 2;
    x.userData.lengte = lengte;
    return x;
  }

  // stofjes in de bundel (alleen zichtbaar zonder prikkelarm; bewegen alleen in de stand 'hoog')
  function stofjes(b: THREE.Mesh, n = 70) {
    const L = typeof b.userData.lengte === 'number' ? (b.userData.lengte as number) : 1.4;
    const pos = new Float32Array(n * 3);
    const r = rng(9);
    for (let i = 0; i < n; i++) {
      const z = 0.1 + r() * L * 0.75;
      const rad = Math.tan(0.45) * z * Math.sqrt(r());
      const a = r() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = Math.sin(a) * rad;
      pos[i * 3 + 2] = z;
    }
    const g = geo.g(new T.BufferGeometry());
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(
      g,
      neem(
        new T.PointsMaterial({ color: 0xfff3c4, size: 0.022, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      ),
    );
    pts.userData.tik = (t: number) => {
      const p = g.attributes.position as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      for (let i = 0; i < n; i++) {
        arr[i * 3 + 1] += Math.sin(t * 0.0006 + i) * 0.0006;
        arr[i * 3] += Math.cos(t * 0.0005 + i * 1.3) * 0.0005;
      }
      p.needsUpdate = true;
    };
    staat.stof.push(pts);
    b.add(pts);
    return pts;
  }

  // ───── zaklamp op een statief; wijst langs −z ─────
  function zaklamp(opts: ZaklampOpts = {}): Zaklamp {
    const g = new T.Group();
    const K = KLEUR;
    mesh(g, geo.g(new T.CylinderGeometry(0.085, 0.085, 0.4, 32)), mat.glans(K.zaklamp, { roughness: 0.4 }), [0, 0, 0.13], { rot: [Math.PI / 2, 0, 0], cast: false });
    const ring = mat.std(K.zaklampDonker, { roughness: 0.7 });
    for (let i = 0; i < 3; i++) mesh(g, geo.g(new T.TorusGeometry(0.087, 0.008, 8, 32)), ring, [0, 0, 0.22 + i * 0.05], { cast: false });
    mesh(g, geo.g(new T.CylinderGeometry(0.08, 0.08, 0.05, 32)), mat.glans(K.zaklampDonker, { roughness: 0.5 }), [0, 0, 0.355], { rot: [Math.PI / 2, 0, 0], cast: false });
    mesh(g, geo.g(new T.CylinderGeometry(0.135, 0.09, 0.16, 40)), mat.metaal(0xcfd5dc), [0, 0, -0.14], { rot: [Math.PI / 2, 0, 0], cast: false });
    mesh(g, geo.rbox(0.05, 0.03, 0.08, 0.012), mat.std(0x2b5bd0, { roughness: 0.5 }), [0, 0.09, 0.05], { cast: false });
    const lens = mesh(g, geo.g(new T.CircleGeometry(0.12, 40)), mat.gloei(0xfff6d6), [0, 0, -0.222], { rot: [0, Math.PI, 0], cast: false });
    const sterkte = (opts.intensity || 1.0) * LICHT;
    // decay 0: geen demping met de afstand, zoals een spot met distance 0 in r128
    const sp = new T.SpotLight(K.lamplicht, sterkte, 0, opts.angle || 0.95, opts.penumbra == null ? 0.35 : opts.penumbra, 0);
    sp.position.set(0, 0, -0.23);
    sp.castShadow = opts.shadow !== false;
    const kaart = opts.schaduwKaart || staat.schaduwKaart;
    sp.shadow.mapSize.set(kaart, kaart);
    sp.shadow.camera.near = 0.05;
    sp.shadow.camera.far = 14;
    sp.shadow.bias = -0.0004;
    sp.shadow.normalBias = 0.01;
    sp.shadow.focus = 1;
    staat.huidig.bijHetOpruimen(() => sp.shadow.dispose());
    g.add(sp);
    const tg = new T.Object3D();
    tg.position.set(0, 0, -5);
    g.add(tg);
    sp.target = tg;
    // statief tot op de vloer (hoogte volgt opts.y)
    const statief = new T.Group();
    g.add(statief);
    const voet = mesh(statief, geo.g(new T.CylinderGeometry(0.16, 0.19, 0.04, 32)), mat.std(0x2f3542, { roughness: 0.5 }), [0, 0, 0.12]);
    const stangMat = mat.metaal(0xb9c0c8);
    const stang = mesh(statief, geo.g(new T.CylinderGeometry(0.018, 0.018, 1, 12)), stangMat, [0, 0, 0.12]);
    const klem = mesh(statief, geo.g(new T.TorusGeometry(0.095, 0.018, 10, 24)), stangMat, [0, 0, 0.12]);
    const schaduwBlob = blob(statief, 0, 0.12, 0.6, 0.6, 0.45);
    const z: Zaklamp = {
      groep: g,
      lens,
      sp,
      bundel: null,
      zet(aan: boolean) {
        sp.intensity = aan ? sterkte : 0;
        (lens.material as THREE.MeshBasicMaterial).color.set(aan ? 0xfff6d6 : 0x55606e);
        if (z.bundel) z.bundel.visible = aan;
      },
      hoogte(y: number) {
        // y = hoogte van de lamp boven de vloer
        voet.position.y = -y + 0.02;
        stang.scale.y = Math.max(0.01, y - 0.06);
        stang.position.y = -y / 2 - 0.02 + 0.04;
        klem.position.y = -0.0;
        schaduwBlob.position.y = -y + 0.004;
        statief.visible = y > 0.08;
      },
    };
    if (opts.statief === false) statief.visible = false;
    z.hoogte(opts.y ?? 0.5);
    if (opts.bundel !== false) {
      const b = bundel({ lengte: opts.bundelLengte || 1.5, hoek: Math.min(0.55, (opts.angle || 0.95) * 0.55), sterkte: opts.bundelSterkte ?? 0.4 });
      b.position.set(0, 0, -0.23);
      b.rotation.set(0, Math.PI, 0);
      g.add(b);
      z.bundel = b;
      if (opts.stofjes) stofjes(b);
    }
    return z;
  }

  // ───── kartonnen figuren op een houten voetje (1,0 hoog) ─────
  function silhouet(soort: Voorwerp, s: THREE.Shape): THREE.Shape[] {
    if (soort === 'boom') {
      const p: [number, number][] = [[0.06, 0], [0.06, 0.3], [0.32, 0.3], [0.17, 0.52], [0.26, 0.52], [0.09, 0.78], [0.16, 0.78], [0, 1.0], [-0.16, 0.78], [-0.09, 0.78], [-0.26, 0.52], [-0.17, 0.52], [-0.32, 0.3], [-0.06, 0.3]];
      s.moveTo(-0.06, 0);
      for (const [x, y] of p) s.lineTo(x, y);
      s.closePath();
      return [];
    }
    if (soort === 'huis') {
      s.moveTo(-0.3, 0);
      s.lineTo(0.3, 0);
      s.lineTo(0.3, 0.55);
      s.lineTo(0, 1.0);
      s.lineTo(-0.3, 0.55);
      s.closePath();
      const raam = new T.Path();
      raam.moveTo(-0.12, 0.22);
      raam.lineTo(0.12, 0.22);
      raam.lineTo(0.12, 0.42);
      raam.lineTo(-0.12, 0.42);
      raam.closePath();
      s.holes.push(raam);
      return [];
    }
    s.moveTo(-0.2, 0);
    s.lineTo(-0.06, 0);
    s.lineTo(-0.04, 0.3);
    s.lineTo(0.04, 0.3);
    s.lineTo(0.06, 0);
    s.lineTo(0.2, 0);
    s.lineTo(0.13, 0.62);
    s.lineTo(-0.13, 0.62);
    s.closePath();
    const kop = new T.Shape();
    kop.absarc(0, 0.81, 0.17, 0, Math.PI * 2, false);
    return [kop];
  }

  function figuur(soort: Voorwerp = 'boom') {
    const g = new T.Group();
    const kleur = soort === 'huis' ? '#d9534f' : soort === 'kind' ? '#7d55c7' : '#3f9a5b';
    const verf = neem(new T.MeshStandardMaterial({ color: kleur, roughness: 0.85 }));
    const rand = mat.karton();
    const s = new T.Shape();
    const extra = silhouet(soort, s);
    for (const sh of [s, ...extra]) {
      const eg = geo.g(new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }));
      eg.translate(0, 0, -0.015);
      const m = new T.Mesh(eg, [verf, rand]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.silhouet = true;
      g.add(m);
    }
    if (soort === 'boom') {
      const bal = mesh(g, geo.g(new T.CircleGeometry(0.035, 16)), mat.std('#e63946'), [0.1, 0.42, 0.017], { cast: false });
      const bal2 = bal.clone();
      bal2.position.set(-0.07, 0.66, 0.017);
      g.add(bal2);
    }
    mesh(g, geo.rbox(0.42, 0.06, 0.16, 0.02), mat.hout(KLEUR.houtLicht), [0, 0.03, 0]);
    blob(g, 0, 0, 0.7, 0.35, 0.4);
    return g;
  }

  // ───── kaartje met een gaatje, in twee houten klemvoetjes ─────
  function kaartje(hy: number, nr: number) {
    const g = new T.Group();
    const s = new T.Shape();
    s.moveTo(-0.7, 0);
    s.lineTo(0.7, 0);
    s.lineTo(0.7, 1.1);
    s.lineTo(-0.7, 1.1);
    s.closePath();
    const p = new T.Path();
    p.absarc(0, hy, 0.04, 0, Math.PI * 2, true);
    s.holes.push(p);
    // gouden ring rond het gaatje, zodat het ook van ver te zien is
    const ringMat = mat.metaal(0xd9a441, { roughness: 0.3, side: T.DoubleSide });
    const ringGeo = geo.g(new T.RingGeometry(0.04, 0.07, 32));
    for (const zz of [0.012, -0.012]) mesh(g, ringGeo, ringMat, [0, hy, zz], { cast: false });
    const eg = geo.g(new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }));
    eg.translate(0, 0, -0.01);
    const m = new T.Mesh(eg, [mat.papier('#fbf7ee'), mat.karton()]);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    const voetMat = mat.hout(KLEUR.houtLicht);
    for (const x of [-0.5, 0.5]) mesh(g, geo.rbox(0.16, 0.1, 0.16, 0.03), voetMat, [x, 0.05, 0]);
    const t = tex.tekst([String(nr)], { w: 128, h: 128, groot: 80, bg: '#2b5bd0', kleur: '#ffffff', r: 64 });
    const lb = mesh(g, geo.g(new T.PlaneGeometry(0.2, 0.2)), neem(new T.MeshBasicMaterial({ map: t, transparent: true })), [-0.52, 0.92, 0.012], { cast: false });
    lb.renderOrder = 3;
    const lb2 = lb.clone();
    lb2.rotation.y = Math.PI;
    lb2.position.z = -0.012;
    g.add(lb2);
    blob(g, 0, 0, 1.6, 0.3, 0.35);
    return g;
  }

  // ───── houten meetlat (0 tot 24 cm) op het scherm ─────
  function meetlat() {
    const t = canvasTex(128, 1040, (g, w, h) => {
      g.fillStyle = '#e8c48c';
      g.fillRect(0, 0, w, h);
      const r = rng(4);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = 'rgba(120,80,40,.18)';
        g.beginPath();
        const x = r() * w;
        g.moveTo(x, 0);
        g.lineTo(x + r() * 6, h);
        g.stroke();
      }
      g.fillStyle = '#2a1a0c';
      g.font = 'bold 44px Verdana, sans-serif';
      g.textBaseline = 'middle';
      for (let cm = 0; cm <= 24; cm += 0.5) {
        const y = h - (cm / 24) * 1000 - 20;
        const L = cm % 5 === 0 ? 46 : cm % 1 === 0 ? 30 : 14;
        g.fillRect(0, y - 2, L, cm % 5 === 0 ? 5 : 3);
        if (cm % 5 === 0 && cm > 0) g.fillText(String(cm), 52, y);
      }
    });
    const g = new T.Group();
    mesh(g, geo.rbox(0.34, 2.52, 0.03, 0.01), mat.hout('#c99a5b'), [0, 1.2, 0.0], { cast: false });
    mesh(g, geo.g(new T.PlaneGeometry(0.32, 2.5)), neem(new T.MeshStandardMaterial({ map: t, roughness: 0.6 })), [0, 1.2, 0.017], { cast: false });
    return g;
  }

  // ───── gordijn met plooien (velours) ─────
  function gordijn(b: number, h: number, kleur: string = KLEUR.velours, plooien = 7) {
    const g = geo.g(new T.PlaneGeometry(b, h, plooien * 8, 6));
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.sin((x / b) * Math.PI * 2 * plooien) * 0.05 * (0.6 + 0.4 * (y / h + 0.5)));
    }
    g.computeVertexNormals();
    return new T.Mesh(g, neem(new T.MeshStandardMaterial({ color: kleur, roughness: 0.75, side: T.DoubleSide })));
  }

  // ───── schaduwtheater (lk-wereld.js LK.decor['4']) ─────
  function decorSchaduwtheater(root: THREE.Object3D): { scherm: THREE.Mesh; versiering: THREE.Group } {
    const K = KLEUR;
    const g = new T.Group();
    root.add(g);
    const vers = new T.Group();
    root.add(vers);
    // podiumvloer
    mesh(g, geo.rbox(7.0, 0.14, 4.9, 0.03), mat.hout(K.hout, { tex: { planken: 7, herhaal: [1, 1], seed: 2 } }), [0, -0.07, 2.35], { cast: false });
    // papieren scherm (z = 0) in een houten lijst
    const scherm = mesh(g, geo.g(new T.PlaneGeometry(6.3, 2.55)), mat.papier('#f6f1e6'), [0, 1.275, 0], { cast: false });
    scherm.userData.scherm = true;
    const lijst = mat.hout(K.houtDonker, { tex: { seed: 8 } });
    mesh(g, geo.rbox(6.6, 0.16, 0.14, 0.05), lijst, [0, 2.62, 0.02]);
    for (const x of [-3.24, 3.24]) mesh(g, geo.rbox(0.16, 2.8, 0.14, 0.05), lijst, [x, 1.32, 0.02]);
    mesh(g, geo.rbox(6.6, 0.12, 0.16, 0.04), lijst, [0, 0.0, 0.03], { cast: false });
    // coulissen (zijwanden) in gedempt blauw velours
    for (const s of [-1, 1]) {
      const wandMat = mat.std('#2c3a63', { roughness: 0.9 });
      mesh(g, geo.rbox(0.12, 3.0, 1.6, 0.04), wandMat, [s * 3.42, 1.4, 0.75], { cast: false });
      wandMat.map = tex.patroon('#2c3a63', '#3c4c7d', 'ster', { herhaal: [1, 2] });
      wandMat.color.set(0xffffff);
    }
    // voorkant: gordijnen opzij gebonden, met een kroonlijst
    for (const s of [-1, 1]) {
      const gd = gordijn(0.75, 3.1, K.velours, 4);
      gd.position.set(s * 3.3, 1.45, 4.55);
      gd.rotation.y = s * 0.12;
      gd.castShadow = false;
      vers.add(gd);
      mesh(vers, geo.g(new T.TorusGeometry(0.2, 0.03, 8, 24)), mat.metaal(0xd9a441, { roughness: 0.3 }), [s * 3.25, 1.1, 4.6], { rot: [0, Math.PI / 2, 0], cast: false });
      mesh(vers, geo.rbox(0.28, 3.45, 0.28, 0.06), mat.std('#5c1a26', { roughness: 0.6 }), [s * 3.78, 1.6, 4.6], { cast: false });
    }
    const kroon = new T.Group();
    kroon.position.set(0, 3.0, 4.6);
    vers.add(kroon);
    mesh(kroon, geo.rbox(7.9, 0.34, 0.3, 0.06), mat.std('#5c1a26', { roughness: 0.6 }), [0, 0.12, 0], { cast: false });
    const schulp = mat.std(K.velours, { roughness: 0.75, side: T.DoubleSide });
    const schulpGeo = geo.g(new T.CircleGeometry(0.27, 24, 0, Math.PI));
    for (let i = 0; i < 15; i++) {
      const sc = mesh(kroon, schulpGeo, schulp, [-3.55 + i * 0.507, -0.05, 0.16], { rot: [0, 0, Math.PI], cast: false });
      sc.scale.y = 0.6;
    }
    mesh(kroon, geo.rbox(7.9, 0.05, 0.05, 0.02), mat.metaal(0xd9a441, { roughness: 0.3 }), [0, -0.05, 0.17], { cast: false });
    // ster op de kroonlijst
    const ster = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5;
      const rr = k % 2 ? 0.07 : 0.16;
      if (k) ster.lineTo(Math.sin(a) * rr, Math.cos(a) * rr);
      else ster.moveTo(0, rr);
    }
    mesh(kroon, geo.g(new T.ExtrudeGeometry(ster, { depth: 0.03, bevelEnabled: false })), mat.metaal(0xd9a441, { roughness: 0.3 }), [0, 0.13, 0.16], { cast: false });
    // gedempte rekwisieten naast het podium (buiten de lichtbundel)
    const kist = mesh(vers, geo.rbox(0.8, 0.5, 0.55, 0.05), mat.hout('#8b5a3c', { tex: { planken: 3, seed: 5 } }), [-2.75, 0.25, 3.75]);
    kist.rotation.y = 0.25;
    blob(vers, -2.75, 3.75, 1.2, 0.9, 0.5);
    mesh(vers, geo.rbox(0.62, 0.05, 0.42, 0.02), mat.std('#7a8fb5', { roughness: 0.8 }), [-2.72, 0.525, 3.72], { rot: [0, 0.2, 0] });
    // boeken en een verfpot rechts vooraan
    let y = 0;
    for (const [k, d] of [['#6d8a96', 0.09], ['#b5835a', 0.07], ['#8a6f9e', 0.08]] as const) {
      mesh(vers, geo.rbox(0.7, d, 0.48, 0.015), mat.std(k, { roughness: 0.85 }), [2.7, y + d / 2, 3.85], { rot: [0, -0.25 + y, 0] });
      y += d;
    }
    blob(vers, 2.7, 3.85, 1.0, 0.8, 0.45);
    mesh(vers, geo.g(new T.CylinderGeometry(0.13, 0.13, 0.22, 24)), mat.metaal(0xc9ccd2, { roughness: 0.45 }), [2.5, 0.35, 3.75]);
    mesh(vers, geo.g(new T.CylinderGeometry(0.115, 0.115, 0.01, 24)), mat.std('#2a9d8f'), [2.5, 0.465, 3.75], { cast: false });
    const penseel = mat.hout(K.houtLicht);
    for (let i = 0; i < 3; i++)
      mesh(vers, geo.g(new T.CylinderGeometry(0.012, 0.012, 0.45, 8)), penseel, [2.47 + i * 0.03, 0.55, 3.73 + i * 0.02], { rot: [0.15 - i * 0.12, 0, 0.1 * (i - 1)] });
    return { scherm, versiering: vers };
  }

  return {
    staat,
    tex,
    mat,
    geo,
    mesh,
    blob,
    bundel,
    zaklamp,
    figuur,
    kaartje,
    meetlat,
    decorSchaduwtheater,
    silTop: SIL_TOP,
  };
}
