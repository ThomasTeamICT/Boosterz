/* Lichtkamer: het lichtlabo (6de leerjaar). Vult LK.decor['6'] en de props houder, meter en gordijnstaal.
   Een warme, ordelijke labotafel: een houten werkblad, een achterwand in warm salie met een groot crèmewit scherm
   in een lijst van licht hout, lage zijwanden met tegels en een houten afdeklat (even hoog als de lambrisering op
   de achterwand) en daarrond gedempte versiering: een gaatjesbord met gereedschap, een plankje met potjes en stalen,
   een klok, een ladekastje met een microscoop, een rekje reageerbuizen, een snijmat met een schrift en een plantje.
   In de lichtweg ligt een vlakke meetrail met cm-streepjes: de zaklamp en de stofhouder staan erop.
   Wat het kind bedient (stofhouder, lichtmeters, gordijnstaal) krijgt de sterkste kleuren. */
(function () {
  'use strict';
  const T = window.THREE;
  const LK = window.LK;
  if (!T || !LK || !LK.mesh || !LK.geo) return;
  LK.props = LK.props || {};
  LK.decor = LK.decor || {};
  const PI = Math.PI;

  // ───── palet van het labo: warm en gedempt; de leeractie krijgt het contrast ─────
  const P = {
    blad: '#d3a56b', verf: '#7f8858', tegel: '#ece3cd', voeg: '#cdbf9e', rand: '#ddb57f', lijst: '#b47b46',
    plint: '#80603f', bord: '#c49d6c', bordRug: '#6e5038', kast: '#9b6b40', kastFront: '#cca373', buiten: '#b58758',
    mat: '#42614f', schrift: '#6d8193', donker: '#4a3b30', scherm: '#faebd0',
    meter: '#2f62d6', meterDonker: '#1c3a86', badge: '#ffc53d', inkt: '#16203a',
  };
  const AMB = 0.3; // zachte vulling via de omgeving (geen lichtbron): het decor blijft warm en leesbaar in het donker
  const SCHERM_AMB = window.LK_SCHERM_AMB ?? 0.25; // het scherm oogt crèmewit, maar blijft donker genoeg voor een felle lichtvlek
  const H = 1.05; // hoogte van de zijwanden en van de lambrisering

  // ───── eigen hulpjes ─────
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TX = {};
  function ctex(key, w, h, teken, herhaal, lineair) {
    if (TX[key]) return TX[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h; teken(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = lineair ? T.LinearEncoding : T.sRGBEncoding; t.anisotropy = 4;
    if (herhaal) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(herhaal[0], herhaal[1]); }
    return (TX[key] = t);
  }
  // kopie van een textuur met een eigen herhaling; bewaard, zodat een nieuwe opbouw geen nieuwe texturen aanmaakt
  function kopie(tex, herhaal, offset = [0, 0]) {
    const key = tex.uuid + herhaal.join(',') + '|' + offset.join(','); if (TX[key]) return TX[key];
    const t = tex.clone(); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(herhaal[0], herhaal[1]); t.offset.set(offset[0], offset[1]); t.needsUpdate = true; return (TX[key] = t);
  }
  const env = () => LK.env || null;
  const lin = (k) => new T.Color(k).convertSRGBToLinear();
  // decormateriaal: mat, met een beetje omgevingsvulling
  function dm(kleur, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color: kleur, roughness: 0.85, metalness: 0, envMap: env(), envMapIntensity: AMB }, o)); }
  function hm(kleur, tex = {}, m = {}) { return LK.mat.hout(kleur, { tex, m: Object.assign({ envMap: env(), envMapIntensity: AMB }, m) }); }
  function glas(kleur = 0xd8eef7, opacity = 0.28) { return new T.MeshStandardMaterial({ color: kleur, roughness: 0.08, metalness: 0, transparent: true, opacity, depthWrite: false, envMap: env(), envMapIntensity: 0.7 }); }
  function metaal(kleur, o = {}) { return LK.mat.metaal(kleur, Object.assign({ envMapIntensity: 0.55 }, o)); }
  const M = (parent, geo, mat, pos, rot) => LK.mesh(parent, geo, mat, pos, { rot, cast: false });
  // zijwand: verdwijnt zodra de camera aan die kant buiten de kijkdoos staat (|x| > 3,3), zodat je er van opzij in kijkt.
  // Op de rechterwand valt geen spotlicht: het teruggekaatste licht werpt geen schaduw en zou dwars door het zijscherm schijnen.
  function wegAlsBuiten(mat, kant) {
    const rechts = kant > 0;
    mat.onBeforeCompile = (sh) => {
      const lf = T.ShaderChunk && T.ShaderChunk.lights_fragment_begin;
      if (rechts && lf) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', lf.replace('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0'));
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n\tif (cameraPosition.x ' + (rechts ? '> 3.3' : '< -3.3') + ') discard;');
    };
    mat.customProgramCacheKey = () => 'lb-zijwand-' + (rechts ? 'r' : 'l');
    return mat;
  }

  // ───── texturen (canvas, hoogstens 512 px) ─────
  const TEX = {
    verf() { return ctex('lb-verf', 256, 256, (g, w, h) => { const r = rng(31); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2200; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.05)'; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s); } }, [1, 1]); },
    tegels() {
      return ctex('lb-tegels2', 256, 256, (g, w, h) => {
        const r = rng(41); g.fillStyle = P.voeg; g.fillRect(0, 0, w, h);
        const rh = h / 8, bw = w / 2;
        for (let j = 0; j < 8; j++) for (let i = -1; i < 3; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0); const k = 0.95 + r() * 0.08; const c = new T.Color(P.tegel).multiplyScalar(k);
          g.fillStyle = '#' + c.getHexString(); g.fillRect(x + 3, j * rh + 3, bw - 6, rh - 6);
          const gr = g.createLinearGradient(0, j * rh, 0, j * rh + rh); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(120,90,40,.10)');
          g.fillStyle = gr; g.fillRect(x + 3, j * rh + 3, bw - 6, rh - 6);
        }
      }, [3, 2]);
    },
    snijmat() {
      return ctex('lb-mat2', 512, 512, (g, w, h) => {
        g.fillStyle = P.mat; g.fillRect(0, 0, w, h);
        for (let i = 0; i <= 32; i++) { const p = 16 + i * 15; g.strokeStyle = i % 5 === 0 ? 'rgba(225,235,210,.42)' : 'rgba(205,225,195,.16)'; g.lineWidth = i % 5 === 0 ? 2 : 1; g.beginPath(); g.moveTo(p, 16); g.lineTo(p, h - 16); g.stroke(); g.beginPath(); g.moveTo(16, p); g.lineTo(w - 16, p); g.stroke(); }
        g.strokeStyle = 'rgba(240,210,120,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, h - 16); g.lineTo(w - 16, 16); g.stroke();
        g.strokeStyle = 'rgba(232,240,222,.5)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
      });
    },
    schaal() { // meetrail: 40 cm over 512 px, 0 bovenaan (achteraan, bij het scherm of het gordijn)
      return ctex('lb-schaal2', 128, 512, (g, w, h) => {
        g.fillStyle = '#ebdfc4'; g.fillRect(0, 0, w, h); const px = h / 40;
        g.fillStyle = '#4a3420';
        for (let cm = 0; cm <= 40; cm++) { const y = Math.min(h - 2, cm * px + 1); const L = cm % 10 === 0 ? 40 : cm % 5 === 0 ? 28 : 16; g.fillRect(0, y - 1, L, cm % 10 === 0 ? 3 : 2); g.fillRect(w - L, y - 1, L, cm % 10 === 0 ? 3 : 2); }
        g.font = 'bold 26px Verdana, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let cm = 10; cm <= 30; cm += 10) g.fillText(String(cm), w / 2, cm * px + 1);
      });
    },
    liniaal() {
      return ctex('lb-liniaal', 32, 512, (g, w, h) => { g.fillStyle = '#e3c48f'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2614'; for (let i = 0; i <= 60; i++) { const y = 6 + i * 8.3; g.fillRect(0, y, i % 10 === 0 ? 18 : i % 5 === 0 ? 12 : 7, 2); } });
    },
    klok() {
      return ctex('lb-klok', 256, 256, (g, w, h) => {
        g.fillStyle = '#efe8d8'; g.fillRect(0, 0, w, h); const c = w / 2; g.strokeStyle = '#2b2f3a'; g.lineCap = 'round';
        for (let i = 0; i < 60; i++) { const a = i / 60 * PI * 2, u = i % 5 === 0; g.lineWidth = u ? 7 : 2.5; g.beginPath(); g.moveTo(c + Math.sin(a) * (u ? 92 : 104), c - Math.cos(a) * (u ? 92 : 104)); g.lineTo(c + Math.sin(a) * 114, c - Math.cos(a) * 114); g.stroke(); }
        const wijzer = (a, L, b) => { g.lineWidth = b; g.beginPath(); g.moveTo(c - Math.sin(a) * 14, c + Math.cos(a) * 14); g.lineTo(c + Math.sin(a) * L, c - Math.cos(a) * L); g.stroke(); };
        wijzer(PI * 2 * (10.17 / 12), 62, 10); wijzer(PI * 2 * (10 / 60), 92, 6);
        g.fillStyle = '#2b2f3a'; g.beginPath(); g.arc(c, c, 9, 0, PI * 2); g.fill();
      });
    },
    // wijzerplaat 0 tot 10: 0,39 × 0,28 eenheden op 512 × 368 px; de spil zit 0,03 boven de onderrand (px 329)
    wijzerplaat() {
      return ctex('lb-wijzer2', 512, 368, (g, w, h) => {
        g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
        const cx = 256, cy = 329, A = 0.95; const pt = (a, r) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
        const a0 = new T.Color('#b9bec8'), a1 = new T.Color('#ffb703');
        for (let i = 0; i < 48; i++) { const s = -A + (i / 48) * 2 * A, e = s + (2 * A) / 48 + 0.012; g.strokeStyle = '#' + a0.clone().lerp(a1, i / 47).getHexString(); g.lineWidth = 34; g.beginPath(); g.arc(cx, cy, 205, s - PI / 2, e - PI / 2); g.stroke(); }
        g.strokeStyle = P.inkt; g.lineCap = 'butt';
        for (let i = 0; i <= 20; i++) { const a = -A + (i / 20) * 2 * A; const groot = i % 2 === 0; const [x0, y0] = pt(a, groot ? 224 : 238), [x1, y1] = pt(a, 262); g.lineWidth = groot ? 9 : 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
        g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 262, -A - PI / 2, A - PI / 2); g.stroke();
        g.fillStyle = P.inkt; g.font = 'bold 58px Fredoka, Verdana, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const n of [0, 5, 10]) { const [x, y] = pt(-A + n * (2 * A / 10), 150); g.fillText(String(n), x, y + 3); }
        g.strokeStyle = 'rgba(22,32,58,.35)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      });
    },
    geodrie() { // streepjes van een geodriehoek; uv volgt de vormcoördinaten (−0,26..0,26 × 0..0,26)
      const t = ctex('lb-geodrie', 256, 128, (g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b3550';
        for (let i = 0; i <= 50; i++) { const x = 6 + i * 4.88; g.fillRect(x, h - (i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 6), 1.5, 16); }
        g.strokeStyle = 'rgba(43,53,80,.7)'; g.lineWidth = 1.5; for (const r of [70, 92]) { g.beginPath(); g.arc(128, h, r, PI, 2 * PI); g.stroke(); }
        for (let a = 0; a <= 180; a += 10) { const q = PI + (a / 180) * PI; g.beginPath(); g.moveTo(128 + Math.cos(q) * 92, h + Math.sin(q) * 92); g.lineTo(128 + Math.cos(q) * 84, h + Math.sin(q) * 84); g.stroke(); }
      });
      t.repeat.set(1 / 0.52, 1 / 0.26); t.offset.set(0.5, 0); t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t;
    },
    letter(L) { // rond letterbord met een transparante rand (voor de sprite boven de meter)
      return ctex('lb-letter2' + L, 128, 128, (g) => {
        g.clearRect(0, 0, 128, 128); g.fillStyle = P.badge; g.beginPath(); g.arc(64, 64, 60, 0, PI * 2); g.fill();
        g.lineWidth = 8; g.strokeStyle = P.inkt; g.beginPath(); g.arc(64, 64, 55, 0, PI * 2); g.stroke();
        g.fillStyle = P.inkt; g.font = 'bold 74px Fredoka, Verdana, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, 64, 69);
      });
    },
    // vitrage: een grof ruitjesnet met bloemen; wit = draad, zwart = gaatje (alfa). Grof genoeg dat ook de schaduw
    // op het scherm geen moiré geeft (mazen van ongeveer 1 cm, draden van 4 mm), met mipmaps voor de stof zelf.
    kant() {
      return ctex('lb-kant2', 256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round';
        for (let i = -4; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 - h, h); g.stroke(); }
        const bloem = (x, y, s) => {
          g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, s * 1.08, 0, PI * 2); g.fill();
          g.fillStyle = '#fff';
          for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.42, s * 0.24, a, 0, PI * 2); g.fill(); }
          g.lineWidth = 7; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, s * 1.02, 0, PI * 2); g.stroke();
          g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, s * 0.22, 0, PI * 2); g.fill();
        };
        bloem(128, 128, 56); for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256]]) bloem(x, y, 34);
      }, [2, 1.85], true);
    },
    weefsel() {
      return ctex('lb-weefsel', 128, 128, (g, w, h) => {
        const r = rng(13); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const d = ((x + y) / 4) % 2 ? 0.07 : 0.0; g.fillStyle = `rgba(0,0,0,${d + r() * 0.06})`; g.fillRect(x, y, 4, 4); }
        for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, r() * h, w, 1); }
      }, [7, 6.5]);
    },
  };

  // zachte contactschaduw op de vloer
  function contact(parent, x, z, w, d, o = 0.45) { return LK.blob(parent, x, z, w, d, o); }

  // ═════════════════════════ decor: het lichtlabo ═════════════════════════
  LK.decor['6'] = function (ctx) {
    const root = ctx.root, taak = ctx.taak === 'stoffen' ? 'stoffen' : 'gordijn';
    const g = new T.Group(); g.name = 'labo'; root.add(g); const vers = new T.Group(); vers.name = 'versiering'; root.add(vers);

    // ── werkblad (vloer) ──
    LK.mesh(g, LK.geo.rbox(7.0, 0.14, 4.9, 0.03), hm(P.blad, { planken: 9, herhaal: [1, 1], seed: 12 }), [0, -0.07, 2.35], { cast: false });

    // ── achterwand met dikte en een afgewerkte bovenrand; naast het scherm een tegellambrisering ──
    const verfTex = TEX.verf();
    LK.mesh(g, LK.geo.rbox(7.0, 3.24, 0.3, 0.02), dm(P.verf, { map: kopie(verfTex, [3.2, 1.5]), envMapIntensity: AMB * 0.8 }), [0, 1.48, -0.155], { cast: false });
    const randMat = hm(P.rand, { seed: 3 }, { roughness: 0.7 });
    M(g, LK.geo.rbox(7.08, 0.07, 0.38, 0.025), randMat, [0, 3.13, -0.14]);
    const tegel = dm(0xffffff, { map: TEX.tegels(), roughness: 0.5 });
    const plintM = dm(P.plint, { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const x0 = 1.95, x1 = 3.25, bx = s * (x0 + x1) / 2, bw = x1 - x0;
      M(g, new T.PlaneGeometry(bw, H), tegel, [bx, H / 2, 0.002]);
      M(g, LK.geo.rbox(bw + 0.02, 0.06, 0.06, 0.02), randMat, [bx, H + 0.03, 0.025]);
      M(g, LK.geo.rbox(bw, 0.07, 0.03, 0.01), plintM, [bx, 0.035, 0.015]);
    }
    contact(g, 0, 0.06, 6.6, 0.32, 0.5);

    // ── lage zijwanden met tegels en een houten afdeklat: één doorlopende lijn met de lambrisering ──
    const buitenHout = hm(P.buiten, { seed: 33, herhaal: [0.6, 0.6] });
    const tegelZij = dm(0xffffff, { map: kopie(TEX.tegels(), [11, 2]), roughness: 0.5 });
    for (const kant of [-1, 1]) {
      const w = (m) => wegAlsBuiten(m, kant);
      M(g, LK.geo.rbox(0.25, H + 0.14, 5.1, 0.02), w(buitenHout.clone()), [kant * 3.375, (H - 0.14) / 2, 2.25]);
      M(g, new T.PlaneGeometry(4.78, H), w(tegelZij.clone()), [kant * 3.248, H / 2, 2.39], [0, -kant * PI / 2, 0]);
      M(g, LK.geo.rbox(0.03, 0.07, 4.78, 0.01), w(plintM.clone()), [kant * 3.235, 0.035, 2.39]);
      M(g, LK.geo.rbox(0.36, 0.06, 5.16, 0.025), w(randMat.clone()), [kant * 3.37, H + 0.03, 2.25]);
      wegAlsBuiten(contact(g, kant * 3.12, 2.4, 0.3, 4.7, 0.4).material, kant);
    }

    // ── groot crèmewit scherm in een lijst van licht hout (z = 0,01) ──
    const schermMat = (o = {}) => new T.MeshStandardMaterial(Object.assign({ color: 0xffffff, map: LK.tex.papier(P.scherm), roughness: 1, envMap: env(), envMapIntensity: SCHERM_AMB }, o));
    const scherm = LK.mesh(g, new T.PlaneGeometry(3.6, 2.4), schermMat(), [0, 1.25, 0.01], { cast: false });
    scherm.userData.scherm = true;
    const lm = hm(P.lijst, { seed: 8 }, { roughness: 0.55 });
    {
      LK.mesh(g, LK.geo.rbox(3.86, 0.13, 0.09, 0.03), lm, [0, 2.51, 0.04], { cast: false });
      for (const s of [-1, 1]) LK.mesh(g, LK.geo.rbox(0.13, 2.6, 0.09, 0.03), lm, [s * 1.865, 1.29, 0.04], { cast: false });
      LK.mesh(g, LK.geo.rbox(3.86, 0.05, 0.1, 0.015), lm, [0, 0.025, 0.045], { cast: false });
      const ms = metaal(0xc9a24a, { roughness: 0.35 });
      for (const [x, y] of [[-1.865, 2.51], [1.865, 2.51]]) M(g, new T.CylinderGeometry(0.035, 0.035, 0.012, 16), ms, [x, y, 0.09], [PI / 2, 0, 0]);
    }

    // ── zijscherm (alleen bij de stoffen): crèmewit vlak op x = 2,3, naar −x, in dezelfde lijst, op voetjes ──
    let zijscherm = null;
    if (taak === 'stoffen') {
      zijscherm = LK.mesh(g, new T.PlaneGeometry(2.6, 1.6), schermMat({ side: T.DoubleSide, envMapIntensity: SCHERM_AMB * 1.35 }), [2.3, 0.8, 2.0], { rot: [0, -PI / 2, 0], cast: false });
      zijscherm.userData.scherm = true;
      for (const z of [0.675, 3.325]) {
        LK.mesh(g, LK.geo.rbox(0.07, 1.7, 0.07, 0.02), lm, [2.33, 0.85, z], { cast: false });
        LK.mesh(g, LK.geo.rbox(0.5, 0.05, 0.1, 0.02), lm, [2.5, 0.025, z], { cast: false });
      }
      LK.mesh(g, LK.geo.rbox(0.07, 0.07, 2.72, 0.02), lm, [2.33, 1.635, 2.0], { cast: false });
      contact(g, 2.42, 2.0, 0.5, 2.9, 0.4);
    }

    // ── meetrail in de lichtweg: vlak, met cm-streepjes; de zaklamp en de stofhouder staan erop ──
    // bij het gordijn begint de schaal (0 cm) onder het gordijn, zodat de afstand van de zaklamp af te lezen is
    {
      const z0 = taak === 'stoffen' ? 0.2 : 1.2, z1 = 4.7, L = z1 - z0;
      const railM = metaal(0xbac1ca, { roughness: 0.42 }), donker = dm(P.donker, { roughness: 0.5 });
      M(g, LK.geo.rbox(0.21, 0.014, L, 0.005, 2), railM, [0, 0.007, z0 + L / 2]);
      const schaal = kopie(TEX.schaal(), [1, L / 4], [0, 1 - L / 4]); // 1 cm blijft 0,1 eenheid
      M(g, new T.PlaneGeometry(0.15, L), new T.MeshStandardMaterial({ map: schaal, roughness: 0.6, envMap: env(), envMapIntensity: AMB }), [0, 0.0146, z0 + L / 2], [-PI / 2, 0, 0]);
      for (const z of [z0 - 0.035, z1 + 0.035]) M(g, LK.geo.rbox(0.25, 0.035, 0.05, 0.012), donker, [0, 0.0175, z]);
      contact(g, 0, z0 + L / 2, 0.38, L + 0.2, 0.22);
      // ruiters: klemmetjes op de rail voor en achter de voet van de stofhouder en van de zaklamp (die staan vast)
      if (taak === 'stoffen') {
        const knop = metaal(0xc9a24a, { roughness: 0.35 });
        for (const [z, r] of [[2.0, 0.17], [3.72, 0.19]]) for (const s of [-1, 1]) {
          const zz = z + s * (r + 0.028);
          M(g, LK.geo.rbox(0.25, 0.036, 0.05, 0.012), donker, [0, 0.032, zz]);
          M(g, new T.CylinderGeometry(0.016, 0.016, 0.04, 12), knop, [0.145, 0.032, zz], [0, 0, PI / 2]);
        }
      }
    }

    // ── schakelaar zonder licht naast het scherm ──
    M(g, LK.geo.rbox(0.09, 0.13, 0.014, 0.012), dm('#ede6d6', { roughness: 0.5 }), [2.13, 1.36, 0.007]);
    M(g, LK.geo.rbox(0.036, 0.055, 0.014, 0.006), dm('#ddd5c4', { roughness: 0.45 }), [2.13, 1.37, 0.016], [0.12, 0, 0]);

    // ══════════ versiering (verborgen in de prikkelarme stand) ══════════

    // gaatjesbord met gereedschap, links van het scherm
    {
      const bx = -2.6, by = 1.84, bz = 0.02;
      M(vers, LK.geo.rbox(1.08, 1.32, 0.02, 0.01), hm(P.bordRug, { seed: 4 }), [bx, by, 0.006]);
      const bord = new T.MeshStandardMaterial({ color: 0xffffff, map: LK.tex.patroon(P.bord, '#4a3524', 'gaatjes', { herhaal: [2.3, 3] }), roughness: 0.85, envMap: env(), envMapIntensity: AMB });
      M(vers, LK.geo.rbox(1.0, 1.24, 0.03, 0.008), bord, [bx, by, bz]);
      const z = 0.06, pin = metaal(0x9aa1aa), rood = dm('#a5483f', { roughness: 0.6 }), staal = metaal(0xc6ccd4, { roughness: 0.3 });
      for (const s of [-1, 1]) {
        M(vers, new T.TorusGeometry(0.04, 0.013, 8, 20), rood, [bx - 0.3 + s * 0.045, by + 0.38, z]);
        M(vers, LK.geo.rbox(0.024, 0.24, 0.008, 0.004), staal, [bx - 0.3 + s * 0.01, by + 0.22, z], [0, 0, s * 0.07]);
      }
      M(vers, new T.CylinderGeometry(0.006, 0.006, 0.05, 6), pin, [bx - 0.3, by + 0.44, 0.045], [PI / 2, 0, 0]);
      const koper = metaal(0xb87333, { roughness: 0.45 });
      for (let i = 0; i < 4; i++) M(vers, new T.TorusGeometry(0.075 - i * 0.004, 0.0075, 6, 28), koper, [bx + 0.02 + i * 0.004, by + 0.33 - i * 0.006, z + i * 0.006], [0.08 * i, 0.12 * (i - 1.5), 0]);
      M(vers, new T.CylinderGeometry(0.006, 0.006, 0.06, 6), pin, [bx + 0.02, by + 0.42, 0.05], [PI / 2, 0, 0]);
      M(vers, LK.geo.rbox(0.065, 0.66, 0.012, 0.004), new T.MeshStandardMaterial({ map: TEX.liniaal(), roughness: 0.7, envMap: env(), envMapIntensity: AMB }), [bx + 0.33, by + 0.12, 0.045]);
      M(vers, new T.CylinderGeometry(0.024, 0.02, 0.13, 10), dm('#c9a23f', { roughness: 0.5 }), [bx - 0.36, by - 0.2, z]);
      M(vers, new T.CylinderGeometry(0.006, 0.006, 0.17, 6), staal, [bx - 0.36, by - 0.35, z]);
      M(vers, new T.TorusGeometry(0.085, 0.013, 8, 28), dm('#3a3530', { roughness: 0.4 }), [bx - 0.06, by - 0.16, z]);
      M(vers, new T.CircleGeometry(0.08, 28), glas(0xd6ecf5, 0.35), [bx - 0.06, by - 0.16, z]);
      M(vers, new T.CylinderGeometry(0.017, 0.015, 0.17, 10), hm(LK.KLEUR.walnoot, { seed: 6 }), [bx - 0.06, by - 0.33, z]);
      const ring = (r0, r1, d) => new T.LatheGeometry([[r0, -d], [r1, -d], [r1, d], [r0, d], [r0, -d]].map((q) => new T.Vector2(q[0], q[1])), 28);
      M(vers, ring(0.032, 0.062, 0.022), dm('#9aa6b4', { roughness: 0.35 }), [bx + 0.24, by - 0.38, z], [PI / 2, 0, 0]);
      M(vers, ring(0.026, 0.033, 0.023), dm('#b88f5f', { roughness: 0.9 }), [bx + 0.24, by - 0.38, z], [PI / 2, 0, 0]);
    }

    // ladekastje met een microscoop, onder het gaatjesbord
    {
      const kx = -2.66, kz = 0.25;
      M(vers, LK.geo.rbox(0.95, 0.52, 0.44, 0.025), hm(P.kast, { seed: 14 }), [kx, 0.26, kz]);
      const front = hm(P.kastFront, { seed: 15 }), knop = metaal(0xc9a24a, { roughness: 0.35 });
      for (let i = -1; i <= 1; i++) for (const y of [0.14, 0.37]) {
        M(vers, LK.geo.rbox(0.28, 0.2, 0.02, 0.012), front, [kx + i * 0.305, y, kz + 0.225]);
        M(vers, new T.SphereGeometry(0.02, 10, 8), knop, [kx + i * 0.305, y, kz + 0.245]);
      }
      contact(vers, kx, kz + 0.05, 1.3, 0.75, 0.5);
      const mic = new T.Group(); mic.position.set(kx - 0.12, 0.52, kz); mic.rotation.y = 0.35; vers.add(mic);
      const room = dm('#ece6d8', { roughness: 0.45 }), zwart = dm('#2f2c2a', { roughness: 0.5 });
      M(mic, LK.geo.rbox(0.24, 0.045, 0.3, 0.015), zwart, [0, 0.0225, 0]);
      M(mic, LK.geo.rbox(0.07, 0.4, 0.09, 0.025), room, [0, 0.24, -0.09], [0.12, 0, 0]);
      M(mic, LK.geo.rbox(0.2, 0.022, 0.18, 0.008), zwart, [0, 0.2, 0.04]);
      M(mic, new T.CylinderGeometry(0.04, 0.04, 0.26, 16), room, [0, 0.4, 0.0], [0.42, 0, 0]);
      M(mic, new T.CylinderGeometry(0.028, 0.028, 0.08, 14), zwart, [0, 0.54, 0.06], [0.42, 0, 0]);
      M(mic, new T.CylinderGeometry(0.05, 0.05, 0.03, 16), zwart, [0, 0.29, 0.05]);
      M(mic, new T.CylinderGeometry(0.014, 0.01, 0.06, 8), metaal(0xc6ccd4), [0, 0.25, 0.06]);
      M(mic, new T.CylinderGeometry(0.04, 0.04, 0.11, 16), zwart, [0, 0.16, -0.09], [0, 0, PI / 2]);
      M(mic, new T.CylinderGeometry(0.035, 0.035, 0.01, 18), metaal(0xdfe4ea, { roughness: 0.15 }), [0, 0.09, 0.04], [0.5, 0, 0]);
    }

    // plankje met potjes en stalen, rechts van het scherm
    {
      const sx = 2.6, sy = 1.76, top = sy + 0.0225, sz = 0.15;
      M(vers, LK.geo.rbox(1.16, 0.045, 0.3, 0.012), hm(LK.KLEUR.houtLicht, { seed: 19 }), [sx, sy, sz]);
      for (const x of [sx - 0.42, sx + 0.42]) M(vers, LK.geo.rbox(0.03, 0.18, 0.2, 0.01), dm(P.donker, { roughness: 0.5 }), [x, sy - 0.11, 0.1]);
      const pot = (x, h, inhoud, deksel) => {
        M(vers, new T.CylinderGeometry(0.058, 0.058, h * 0.6, 18), dm(inhoud, { roughness: 0.9 }), [x, top + h * 0.3, sz]);
        M(vers, new T.CylinderGeometry(0.066, 0.066, h, 18, 1, true), glas(), [x, top + h / 2, sz]);
        M(vers, new T.CylinderGeometry(0.07, 0.07, 0.035, 18), dm(deksel, { roughness: 0.55 }), [x, top + h + 0.017, sz]);
      };
      pot(sx - 0.45, 0.2, '#c7a873', '#9c4a3f'); pot(sx - 0.27, 0.16, '#8fa3a8', '#6b7f58');
      const kolf = new T.LatheGeometry([[0.0, 0], [0.085, 0], [0.09, 0.012], [0.036, 0.15], [0.03, 0.165], [0.03, 0.23], [0.036, 0.236]].map((p) => new T.Vector2(p[0], p[1])), 24);
      M(vers, kolf, glas(0xd8eef7, 0.3), [sx - 0.04, top, sz]);
      M(vers, new T.LatheGeometry([[0, 0.006], [0.08, 0.006], [0.084, 0.014], [0.055, 0.085], [0, 0.085]].map((p) => new T.Vector2(p[0], p[1])), 24), dm('#6c9a8a', { roughness: 0.3, transparent: true, opacity: 0.85 }), [sx - 0.04, top, sz]);
      M(vers, LK.geo.rbox(0.22, 0.04, 0.16, 0.01), hm(P.kast, { seed: 23 }), [sx + 0.2, top + 0.02, sz]);
      [dm('#f4f1ea', { roughness: 0.9 }), metaal(0xd9dde3, { roughness: 0.3 }), dm('#1d1d20', { roughness: 0.9 }), glas(0xbfe6ff, 0.4)].forEach((mat, i) => {
        const h = 0.12 + i * 0.02; M(vers, LK.geo.rbox(0.18, h, 0.008, 0.003), mat, [sx + 0.2, top + 0.04 + h / 2, sz + 0.05 - i * 0.035]);
      });
      const px = sx + 0.47;
      M(vers, new T.CylinderGeometry(0.055, 0.042, 0.1, 16), dm('#b0704f', { roughness: 0.9 }), [px, top + 0.05, sz]);
      M(vers, new T.CylinderGeometry(0.05, 0.05, 0.01, 16), dm('#4a3828'), [px, top + 0.095, sz]);
      const blad = dm('#748f5a', { roughness: 0.7 });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; const b = M(vers, new T.SphereGeometry(0.05, 10, 8), blad, [px + Math.cos(a) * 0.035, top + 0.17, sz + Math.sin(a) * 0.035], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); b.scale.set(0.45, 1.6, 0.2); }
    }

    // klok boven het plankje (staat stil)
    {
      const kx = 2.62, ky = 2.5;
      M(vers, new T.CylinderGeometry(0.21, 0.21, 0.05, 36), hm(P.lijst, { seed: 41 }, { roughness: 0.5 }), [kx, ky, 0.02], [PI / 2, 0, 0]);
      M(vers, new T.CircleGeometry(0.18, 36), new T.MeshStandardMaterial({ map: TEX.klok(), roughness: 0.6, envMap: env(), envMapIntensity: AMB }), [kx, ky, 0.047]);
    }

    // plant in een potje op de linker afdeklat, achteraan
    {
      const px = -3.37, pz = 0.75, py = H + 0.06; const wv = (m) => wegAlsBuiten(m, -1);
      M(vers, new T.CylinderGeometry(0.085, 0.065, 0.15, 18), wv(dm('#b0704f', { roughness: 0.85 })), [px, py + 0.075, pz]);
      M(vers, new T.CylinderGeometry(0.09, 0.09, 0.03, 18), wv(dm('#a2664a', { roughness: 0.85 })), [px, py + 0.14, pz]);
      M(vers, new T.CylinderGeometry(0.075, 0.075, 0.01, 18), wv(dm('#4a3828')), [px, py + 0.152, pz]);
      const blad = wv(dm('#6f8c58', { roughness: 0.7 }));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2 + 0.3, k = 0.8 + (i % 3) * 0.15;
        const b = M(vers, new T.SphereGeometry(0.06, 10, 8), blad, [px + Math.cos(a) * 0.05, py + 0.2 + 0.07 * k, pz + Math.sin(a) * 0.05], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]);
        b.scale.set(0.5, 1.7 * k, 0.22);
      }
      wegAlsBuiten(contact(vers, px, pz, 0.3, 0.3, 0.35).material, -1);
    }

    // rekje met reageerbuizen, links midden op de tafel
    {
      const rx = -2.05, rz = 1.6, hout = hm(LK.KLEUR.houtLicht, { seed: 27 });
      const rek = new T.Group(); rek.position.set(rx, 0, rz); rek.rotation.y = 0.25; vers.add(rek);
      M(rek, LK.geo.rbox(0.46, 0.03, 0.15, 0.01), hout, [0, 0.015, 0]); M(rek, LK.geo.rbox(0.46, 0.025, 0.15, 0.01), hout, [0, 0.17, 0]);
      for (const s of [-1, 1]) M(rek, LK.geo.rbox(0.03, 0.17, 0.15, 0.008), hout, [s * 0.215, 0.09, 0]);
      ['#6c9a8a', '#c49a4e', '#b07a86', '#8aa57a'].forEach((k, i) => {
        const x = -0.15 + i * 0.1, hv = 0.07 + (i % 2) * 0.04;
        M(rek, new T.CylinderGeometry(0.019, 0.019, hv, 12), dm(k, { roughness: 0.35, transparent: true, opacity: 0.88 }), [x, 0.035 + hv / 2, 0]);
        M(rek, new T.CylinderGeometry(0.023, 0.023, 0.26, 12, 1, true), glas(), [x, 0.15, 0]);
      });
      contact(vers, rx, rz, 0.8, 0.4, 0.4);
    }

    // snijmat met een schrift en een potlood, links vooraan
    {
      const mx = -2.3, mz = 3.65;
      M(vers, new T.BoxGeometry(1.5, 0.008, 1.4), new T.MeshStandardMaterial({ map: TEX.snijmat(), roughness: 0.8, envMap: env(), envMapIntensity: AMB }), [mx, 0.004, mz], [0, 0.05, 0]);
      const s = new T.Group(); s.position.set(mx - 0.22, 0.008, mz - 0.05); s.rotation.y = 0.28; vers.add(s);
      M(s, LK.geo.rbox(0.44, 0.045, 0.58, 0.012), dm(P.schrift, { roughness: 0.75 }), [0, 0.0225, 0]);
      M(s, LK.geo.rbox(0.42, 0.034, 0.56, 0.006), dm('#f3ecdb', { roughness: 0.95 }), [0.012, 0.0225, 0]);
      M(s, LK.geo.rbox(0.02, 0.048, 0.585, 0.004), dm('#2f2c2a'), [0.15, 0.0235, 0]);
      M(s, new T.PlaneGeometry(0.03, 0.14), dm('#a5483f', { side: T.DoubleSide }), [-0.05, 0.004, 0.33], [-PI / 2, 0, 0.15]);
      const p = new T.Group(); p.position.set(mx + 0.32, 0.026, mz + 0.12); p.rotation.y = -0.55; vers.add(p);
      M(p, new T.CylinderGeometry(0.018, 0.018, 0.4, 6), dm('#d9b24a', { roughness: 0.5 }), [0, 0, 0], [0, 0, PI / 2]);
      M(p, new T.ConeGeometry(0.018, 0.06, 6), hm(LK.KLEUR.houtLicht), [-0.23, 0, 0], [0, 0, PI / 2]);
      M(p, new T.CylinderGeometry(0.019, 0.019, 0.04, 8), dm('#d98c8c'), [0.22, 0, 0], [0, 0, PI / 2]);
      const tri = new T.Shape(); tri.moveTo(-0.26, 0); tri.lineTo(0.26, 0); tri.lineTo(0, 0.26); tri.closePath();
      const gat = new T.Path(); gat.absarc(0, 0.035, 0.03, 0, PI, false); gat.closePath(); tri.holes.push(gat);
      const geoT = new T.ExtrudeGeometry(tri, { depth: 0.006, bevelEnabled: false, curveSegments: 10 }); geoT.rotateX(-PI / 2);
      const geodrie = new T.MeshStandardMaterial({ color: 0xdff1f7, map: TEX.geodrie(), roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false, envMap: env(), envMapIntensity: 0.6 });
      M(vers, geoT, geodrie, [mx + 0.45, 0.009, mz - 0.38], [0, -0.35, 0]);
      M(vers, LK.geo.rbox(0.12, 0.04, 0.07, 0.012), dm('#d98c8c', { roughness: 0.8 }), [mx - 0.5, 0.028, mz + 0.5], [0, 0.4, 0]);
      contact(vers, mx, mz, 1.8, 1.7, 0.25);
    }

    // boeken met een bladwijzer en een beker met potloden, rechts
    {
      const bx = taak === 'stoffen' ? 2.6 : 2.85, bz = taak === 'stoffen' ? 4.15 : 2.55;
      [['#6a7f86', 0.065, 0.1], ['#94704e', 0.055, -0.14], ['#76657a', 0.06, 0.04]].reduce((y, [k, d, r]) => { M(vers, LK.geo.rbox(0.38, d, 0.5, 0.012), dm(k, { roughness: 0.8 }), [bx, y + d / 2, bz], [0, r, 0]); return y + d; }, 0);
      M(vers, new T.PlaneGeometry(0.03, 0.13), dm('#a5483f', { side: T.DoubleSide }), [bx - 0.04, 0.11, bz + 0.29], [0.2, 0, 0]);
      contact(vers, bx, bz, 0.7, 0.8, 0.45);
      const kx = taak === 'stoffen' ? 3.0 : 2.95, kz = taak === 'stoffen' ? 3.6 : 4.2;
      M(vers, new T.CylinderGeometry(0.085, 0.08, 0.22, 20, 1, true), glas(0xd8eef7, 0.32), [kx, 0.11, kz]);
      M(vers, new T.CircleGeometry(0.08, 20), glas(0xd8eef7, 0.32), [kx, 0.004, kz], [-PI / 2, 0, 0]);
      [['#d9b24a', 0.15, 0.1], ['#6b7f58', -0.12, 0.2], ['#9c4a3f', 0.05, -0.18]].forEach(([k, rx, rz], i) => M(vers, new T.CylinderGeometry(0.014, 0.014, 0.34, 6), dm(k, { roughness: 0.55 }), [kx + rz * 0.15, 0.18, kz + rx * 0.15], [rx, i, rz]));
      contact(vers, kx, kz, 0.4, 0.4, 0.4);
    }

    return { scherm, zijscherm, versiering: vers };
  };

  // ═════════════════════════ props ═════════════════════════

  // stofhouder: oorsprong in het midden van het vel (0,6 boven de vloer); het vel ligt in het lokale xy-vlak en kijkt naar +z
  let kreukGeoCache = null;
  function kreukGeo() {
    const geo = new T.PlaneGeometry(0.8, 0.8, 22, 22); const p = geo.attributes.position; const r = rng(17);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); const rand = Math.abs(x) > 0.39 || Math.abs(y) > 0.39 ? 0.35 : 1;
      p.setZ(i, (Math.sin(x * 23 + y * 7) * 0.006 + Math.sin(y * 31 - x * 11) * 0.005 + (r() - 0.5) * 0.016) * rand);
      p.setX(i, x + (r() - 0.5) * 0.008 * rand); p.setY(i, y + (r() - 0.5) * 0.008 * rand);
    }
    geo.computeVertexNormals(); return geo;
  }
  // een echte spiegel als THREE.Reflector bestaat; per houder een nieuwe, en de beeldbuffer van de vorige wordt vrijgegeven
  let spiegelRefl = null;
  function spiegelVlak() {
    if (!T.Reflector) return null;
    if (spiegelRefl) { try { spiegelRefl.getRenderTarget().dispose(); } catch (e) { /* niets */ } spiegelRefl = null; }
    try { spiegelRefl = new T.Reflector(new T.PlaneGeometry(0.77, 0.77), { textureWidth: 512, textureHeight: 512, color: 0x8c939b, clipBias: 0.003 }); spiegelRefl.castShadow = false; spiegelRefl.receiveShadow = false; } catch (e) { spiegelRefl = null; }
    return spiegelRefl;
  }
  LK.props.houder = function () {
    const g = new T.Group();
    const staalM = LK.mat.metaal(0xb9c0c8, { roughness: 0.3 }), voetM = LK.mat.std(P.donker, { roughness: 0.5 }), klemM = new T.MeshStandardMaterial({ color: lin(P.meter), roughness: 0.38, envMap: env(), envMapIntensity: 0.22 });
    // voet, staafje en klem
    LK.mesh(g, new T.CylinderGeometry(0.15, 0.17, 0.04, 32), voetM, [0, -0.58, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.045, 0.055, 0.03, 20), staalM, [0, -0.545, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.018, 0.018, 0.1, 12), staalM, [0, -0.49, 0], { cast: false });
    for (const s of [-1, 1]) LK.mesh(g, LK.geo.rbox(0.38, 0.085, 0.028, 0.01), klemM, [0, -0.405, s * 0.021], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.38, 0.025, 0.07, 0.008), klemM, [0, -0.45, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.03, 0.03, 0.03, 16), voetM, [0.13, -0.405, 0.05], { rot: [PI / 2, 0, 0], cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.008, 0.008, 0.03, 8), staalM, [0.13, -0.405, 0.03], { rot: [PI / 2, 0, 0], cast: false });
    LK.blob(g, 0, 0, 0.5, 0.5, 0.45).position.y = -0.596 + 0.016;
    // het vel: plat (karton, papier, glas, spiegel) of gekreukt (aluminiumfolie)
    const velM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMap: env(), envMapIntensity: 0.3 });
    const vel = LK.mesh(g, new T.BoxGeometry(0.8, 0.8, 0.012), velM, [0, 0, 0]); vel.castShadow = true;
    if (!kreukGeoCache) kreukGeoCache = kreukGeo();
    const kreukM = LK.mat.metaal(0xd9dde3, { roughness: 0.33, flatShading: true, side: T.DoubleSide, envMapIntensity: 0.8 });
    const kreuk = LK.mesh(g, kreukGeoCache.clone(), kreukM, [0, 0, 0]); kreuk.castShadow = true; kreuk.visible = false;
    const rand = new T.Group(); g.add(rand); rand.visible = false; // lichtblauwe glasrand
    const randM = new T.MeshStandardMaterial({ color: 0x8ccfe8, roughness: 0.1, transparent: true, opacity: 0.9, envMap: env(), envMapIntensity: 0.8 });
    for (const [w, h, x, y] of [[0.8, 0.014, 0, 0.4], [0.8, 0.014, 0, -0.4], [0.014, 0.8, 0.4, 0], [0.014, 0.8, -0.4, 0]]) LK.mesh(rand, new T.BoxGeometry(w, h, 0.016), randM, [x, y, 0], { cast: false });
    const refl = spiegelVlak(); if (refl) { refl.position.set(0, 0, 0.0075); refl.rotation.set(0, 0, 0); refl.visible = false; g.add(refl); }
    g.userData.vel = vel;
    g.userData.zetStof = function (s) {
      s = s || {}; const id = s.id || ''; const op = s.opac == null ? 1 : s.opac;
      const alu = !!s.metaal && id !== 'spiegel', spiegel = !!s.metaal && !alu, isGlas = id === 'glas' || (!s.metaal && op < 0.45);
      vel.visible = !alu; kreuk.visible = alu; rand.visible = isGlas;
      velM.color.copy(lin(s.kleur == null ? 0xffffff : s.kleur)); velM.map = null; velM.metalness = 0; velM.roughness = 0.92; velM.envMapIntensity = 0.3;
      if (refl) refl.visible = spiegel;
      if (spiegel && refl) { velM.color.set(0x5b636d); velM.metalness = 0.8; velM.roughness = 0.35; velM.envMapIntensity = 0.4; }
      else if (spiegel) { velM.color.set(0xdfe6ee); velM.metalness = 1; velM.roughness = 0.05; velM.envMapIntensity = 0.6; }
      else if (isGlas) { velM.roughness = 0.06; velM.envMapIntensity = 0.9; }
      else { velM.map = LK.tex.papier('#ffffff'); velM.roughness = id === 'calque' ? 0.6 : 0.92; }
      velM.transparent = op < 1; velM.opacity = op; velM.depthWrite = op >= 1; velM.needsUpdate = true;
      if (alu) kreukM.color.copy(lin(s.kleur == null ? 0xd9dde3 : s.kleur));
    };
    g.userData.zetStof({ id: 'wit', kleur: 0xffffff, opac: 1 });
    return g;
  };

  // lichtmeter: speelgoedachtig toestel met een grote wijzerplaat (0 tot 10); oorsprong aan de voet, plaat naar +z.
  // Het letterbord staat op een stokje boven het toestel en draait altijd naar de kijker, zodat je de letter vanuit elk zicht leest.
  LK.props.meter = function () {
    const g = new T.Group();
    const romp = new T.MeshStandardMaterial({ color: lin(P.meter), roughness: 0.38, envMap: env(), envMapIntensity: 0.3 }), donker = LK.mat.std(lin(P.meterDonker), { roughness: 0.5 }), rubber = LK.mat.std('#22252c', { roughness: 0.9 });
    for (const x of [-0.16, 0.16]) LK.mesh(g, LK.geo.rbox(0.09, 0.03, 0.2, 0.012), rubber, [x, 0.015, 0], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.46, 0.44, 0.22, 0.05, 4), romp, [0, 0.25, 0]);
    LK.mesh(g, LK.geo.rbox(0.42, 0.32, 0.024, 0.03), donker, [0, 0.27, 0.104], { cast: false });
    const plaat = TEX.wijzerplaat();
    const plaatM = new T.MeshStandardMaterial({ map: plaat, roughness: 0.55, envMap: env(), envMapIntensity: 0.5, emissive: 0xffffff, emissiveMap: plaat, emissiveIntensity: 0.16 });
    LK.mesh(g, new T.PlaneGeometry(0.39, 0.28), plaatM, [0, 0.27, 0.1166], { cast: false });
    // wijzer: draait rond een spil 0,03 boven de onderrand van de plaat
    const spil = new T.Group(); spil.position.set(0, 0.16, 0.121); g.add(spil);
    const wijzerM = LK.mat.std('#c81e1e', { roughness: 0.5 });
    LK.mesh(spil, LK.geo.rbox(0.016, 0.21, 0.005, 0.002), wijzerM, [0, 0.085, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.022, 0.022, 0.012, 16), donker, [0, 0.16, 0.124], { rot: [PI / 2, 0, 0], cast: false });
    // lichtoog bovenop
    LK.mesh(g, new T.CylinderGeometry(0.05, 0.055, 0.025, 20), donker, [0.12, 0.48, 0], { cast: false });
    LK.mesh(g, new T.SphereGeometry(0.045, 20, 10, 0, PI * 2, 0, PI / 2), LK.mat.glans('#eef3f8', { roughness: 0.25 }), [0.12, 0.49, 0], { cast: false });
    // letterbord (verschijnt met label())
    const stok = LK.mesh(g, new T.CylinderGeometry(0.012, 0.012, 0.22, 8), donker, [-0.1, 0.58, 0], { cast: false }); stok.visible = false;
    const bordM = new T.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    const bord = new T.Sprite(bordM); bord.scale.set(0.3, 0.3, 1); bord.position.set(-0.1, 0.82, 0); bord.renderOrder = 3; bord.visible = false; g.add(bord);
    LK.blob(g, 0, 0, 0.7, 0.45, 0.5);
    const A = 0.95;
    g.userData.zet = function (v) {
      if (v == null || isNaN(v)) { spil.rotation.z = A; plaatM.color.set(0x80858f); plaatM.emissiveIntensity = 0; wijzerM.color.set('#8a3a3a'); return; }
      const t = Math.max(0, Math.min(1, v)); spil.rotation.z = A - t * 2 * A; plaatM.color.set(0xffffff); plaatM.emissiveIntensity = 0.16; wijzerM.color.set('#c81e1e');
    };
    g.userData.label = function (L) { const t = String(L || '').slice(0, 2); if (t) { bordM.map = TEX.letter(t); bordM.needsUpdate = true; } bord.visible = stok.visible = !!t; };
    g.userData.zet(null);
    return g;
  };

  // gordijnstaal: stof (1,2 × 1,1, met plooien) aan een stang op een standaard; oorsprong aan de voet, midden onder de stof
  let kantDiepte = null;
  LK.props.gordijnstaal = function () {
    const g = new T.Group();
    const staalM = LK.mat.metaal(0xc3c9d1, { roughness: 0.3 }), voetM = LK.mat.std(P.donker, { roughness: 0.5 });
    for (const s of [-1, 1]) {
      LK.mesh(g, LK.geo.rbox(0.08, 0.04, 0.46, 0.015), voetM, [s * 0.72, 0.02, 0], { cast: false });
      LK.mesh(g, new T.CylinderGeometry(0.017, 0.017, 1.22, 12), staalM, [s * 0.72, 0.65, 0], { cast: false });
      LK.mesh(g, new T.SphereGeometry(0.03, 14, 10), staalM, [s * 0.72, 1.27, 0], { cast: false });
      LK.blob(g, s * 0.72, 0, 0.3, 0.6, 0.4);
    }
    LK.mesh(g, new T.CylinderGeometry(0.014, 0.014, 1.44, 12), staalM, [0, 1.21, 0], { rot: [0, 0, PI / 2], cast: false });
    for (let i = 0; i < 6; i++) {
      const x = -0.55 + i * 0.22;
      LK.mesh(g, new T.TorusGeometry(0.028, 0.006, 6, 16), staalM, [x, 1.21, 0], { rot: [0, PI / 2, 0], cast: false });
      LK.mesh(g, LK.geo.rbox(0.025, 0.04, 0.014, 0.004), voetM, [x, 1.165, 0], { cast: false });
    }
    // de stof
    const geo = new T.PlaneGeometry(1.2, 1.1, 72, 12); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const t = (0.55 - y) / 1.1; p.setZ(i, Math.sin((x / 1.2) * PI * 2 * 5 + 0.4) * (0.02 + 0.02 * t) + Math.sin((x / 1.2) * PI * 2 * 2.2) * 0.012 * t); }
    geo.computeVertexNormals();
    const stofM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, side: T.DoubleSide, envMap: env(), envMapIntensity: 0.3 });
    const stof = LK.mesh(g, geo, stofM, [0, 0.6, 0]); stof.castShadow = true; stof.receiveShadow = true;
    LK.blob(g, 0, 0.05, 1.5, 0.45, 0.35);
    g.userData.stof = stof;
    g.userData.zetStof = function (gd) {
      gd = gd || {}; const op = gd.op == null ? 1 : gd.op; const vitrage = op < 0.6;
      stofM.color.copy(lin(gd.kleur == null ? 0xffffff : gd.kleur));
      if (vitrage) {
        stofM.map = null; stofM.alphaMap = TEX.kant(); stofM.opacity = Math.min(1, op + 0.4); stofM.transparent = true; stofM.depthWrite = false; stofM.roughness = 0.8;
        if (!kantDiepte) kantDiepte = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaMap: TEX.kant(), alphaTest: 0.5, side: T.DoubleSide });
        stof.customDepthMaterial = kantDiepte;
      } else {
        const o2 = Math.min(1, op + 0.1); stofM.alphaMap = null; stofM.map = TEX.weefsel(); stofM.opacity = o2; stofM.transparent = o2 < 1; stofM.depthWrite = o2 >= 1; stofM.roughness = op >= 1 ? 0.95 : 0.85;
        stof.customDepthMaterial = undefined;
      }
      stofM.needsUpdate = true;
    };
    g.userData.zetStof({ kleur: 0xf3f0e6, op: 0.45 });
    return g;
  };
})();
