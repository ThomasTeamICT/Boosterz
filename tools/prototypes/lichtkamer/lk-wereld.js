/* Lichtkamer: de 3D-basis. Renderer met gloed, omgevingslicht, texturen, sokkel, lichtbundel, zaklamp,
   kartonnen figuren, kaartjes en het schaduwtheater (4de leerjaar). Andere modules (lk-kleuter.js, lk-labo.js)
   vullen LK.decor.k / LK.decor['6'] en LK.props.* aan. Alles in eenheden van 10 cm: het scherm staat op z = 0,
   de vloer op y = 0. */
(function () {
  'use strict';
  const T = window.THREE;
  const LK = (window.LK = window.LK || {});
  LK.props = LK.props || {};
  LK.decor = LK.decor || {};
  if (!T) return;

  // ───── palet (gedempt decor, heldere leeractie) ─────
  LK.KLEUR = {
    nachtBoven: '#2b3561', nachtOnder: '#0c1022',
    hout: '#c9935a', houtDonker: '#6b4426', houtLicht: '#e2b884', walnoot: '#4a2e1c',
    papier: '#f4efe4', karton: '#c49a6c', kartonDonker: '#8a6440',
    velours: '#8e1f2f', veloursDonker: '#5c1220', goud: '#d9a441',
    muurK: '#9fb8c8', muurL: '#cfd8d6', zaklamp: '#ffb703', zaklampDonker: '#e08a00',
    lamplicht: 0xfff0c8,
  };

  // ───── deterministische ruis voor texturen ─────
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function canvasTex(w, h, teken, opts = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); teken(g, w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    if (opts.herhaal) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(opts.herhaal[0], opts.herhaal[1]); }
    return t;
  }
  function shade(hex, f) { const c = new T.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f))); return '#' + c.getHexString(); }
  LK.shade = shade;

  const TEX = {};
  LK.tex = {
    hout(kleur = LK.KLEUR.hout, opts = {}) {
      const key = 'hout' + kleur + JSON.stringify(opts); if (TEX[key]) return TEX[key];
      const r = rng(opts.seed || 7); const planken = opts.planken || 0;
      return (TEX[key] = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = kleur; g.fillRect(0, 0, w, h);
        const n = planken || 1; const ph = h / n;
        for (let p = 0; p < n; p++) {
          const y0 = p * ph; g.fillStyle = shade(kleur, 0.9 + r() * 0.2); g.fillRect(0, y0, w, ph);
          for (let i = 0; i < 26; i++) { g.strokeStyle = shade(kleur, 0.78 + r() * 0.18); g.globalAlpha = 0.35 + r() * 0.3; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = y0 + r() * ph; g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3 * r()); g.stroke(); }
          if (planken) { g.globalAlpha = 1; g.fillStyle = shade(kleur, 0.6); g.fillRect(0, y0, w, 2); const off = r() * w; g.fillRect(off, y0, 2, ph); }
          if (r() < 0.5) { g.globalAlpha = 0.35; g.fillStyle = shade(kleur, 0.7); g.beginPath(); g.ellipse(r() * w, y0 + ph / 2, 10 + r() * 8, 4, 0, 0, Math.PI * 2); g.fill(); }
        }
        g.globalAlpha = 1;
      }, { herhaal: opts.herhaal || [1, 1] }));
    },
    papier(kleur = LK.KLEUR.papier) {
      const key = 'papier' + kleur; if (TEX[key]) return TEX[key]; const r = rng(3);
      return (TEX[key] = canvasTex(512, 512, (g, w, h) => { g.fillStyle = kleur; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,100,70,.05)' : 'rgba(255,255,255,.08)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); } }));
    },
    karton(kleur = LK.KLEUR.karton) {
      const key = 'karton' + kleur; if (TEX[key]) return TEX[key]; const r = rng(11);
      return (TEX[key] = canvasTex(256, 256, (g, w, h) => { g.fillStyle = kleur; g.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,50,20,.10)' : 'rgba(255,240,210,.10)'; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1); } }, { herhaal: [2, 2] }));
    },
    velours(kleur = LK.KLEUR.velours) {
      const key = 'velours' + kleur; if (TEX[key]) return TEX[key];
      return (TEX[key] = canvasTex(256, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 8; i++) { gr.addColorStop(i / 8, i % 2 ? shade(kleur, 0.7) : shade(kleur, 1.15)); } g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
    },
    patroon(achter, voor, soort = 'stip', opts = {}) {
      const key = 'patroon' + achter + voor + soort; if (TEX[key]) return TEX[key]; const r = rng(5);
      return (TEX[key] = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = achter; g.fillRect(0, 0, w, h); g.fillStyle = voor; g.strokeStyle = voor;
        if (soort === 'stip') { for (let y = 16; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); } }
        if (soort === 'ster') { for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h, s = 3 + r() * 4; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5, rr = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr); } g.fill(); } }
        if (soort === 'streep') { for (let x = 0; x < w; x += 24) { g.globalAlpha = 0.5; g.fillRect(x, 0, 8, h); } g.globalAlpha = 1; }
        if (soort === 'gaatjes') { for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); } }
        if (soort === 'ruit') { g.lineWidth = 2; g.globalAlpha = 0.5; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
      }, { herhaal: opts.herhaal || [3, 3] }));
    },
    blob() {
      if (TEX.blob) return TEX.blob;
      const t = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      t.encoding = T.LinearEncoding; return (TEX.blob = t);
    },
    achtergrond() {
      if (TEX.bg) return TEX.bg;
      return (TEX.bg = canvasTex(512, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, LK.KLEUR.nachtBoven); gr.addColorStop(1, LK.KLEUR.nachtOnder); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const rg = g.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.5, w * 0.75); rg.addColorStop(0, 'rgba(120,140,220,.25)'); rg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
      }));
    },
    tekst(regels, opts = {}) {
      const w = opts.w || 512, h = opts.h || 128;
      return canvasTex(w, h, (g) => {
        g.fillStyle = opts.bg || '#e9c46a'; const r = opts.r || 18; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
        g.strokeStyle = opts.rand || 'rgba(0,0,0,.25)'; g.lineWidth = 6; g.stroke();
        g.fillStyle = opts.kleur || '#3b2610'; g.textAlign = 'center'; g.textBaseline = 'middle';
        regels.forEach((rg, i) => { g.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? (opts.groot || 54) : (opts.klein || 32)}px Fredoka, Verdana, sans-serif`; g.fillText(rg, w / 2, h / 2 + (i - (regels.length - 1) / 2) * (opts.lijn || 52)); });
      });
    },
  };

  // ───── materialen ─────
  LK.mat = {
    std(kleur, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color: kleur, roughness: 0.8, metalness: 0 }, o)); },
    hout(kleur, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color: 0xffffff, map: LK.tex.hout(kleur, o.tex || {}), roughness: 0.7 }, o.m || {})); },
    papier(kleur) { return new T.MeshStandardMaterial({ color: 0xffffff, map: LK.tex.papier(kleur), roughness: 0.95 }); },
    karton(kleur) { return new T.MeshStandardMaterial({ color: 0xffffff, map: LK.tex.karton(kleur), roughness: 0.95 }); },
    metaal(kleur = 0xd8dde4, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color: kleur, metalness: 0.9, roughness: 0.28, envMap: LK.env, envMapIntensity: 0.9 * (LK.envSterkte ?? 1) }, o)); },
    glans(kleur, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color: kleur, metalness: 0.05, roughness: 0.35, envMap: LK.env, envMapIntensity: 0.5 * (LK.envSterkte ?? 1) }, o)); },
    gloei(kleur) { return new T.MeshBasicMaterial({ color: kleur, toneMapped: false }); },
  };

  // ───── geometrie ─────
  LK.geo = {
    rbox(w, h, d, r = 0.04, seg = 3) { return T.RoundedBoxGeometry ? new T.RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new T.BoxGeometry(w, h, d); },
  };
  LK.mesh = function (parent, geo, mat, pos, o = {}) {
    const m = new T.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false; parent.add(m); return m;
  };
  LK.blob = function (parent, x, z, w, d, opacity = 0.5) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: LK.tex.blob(), transparent: true, depthWrite: false, opacity, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); m.renderOrder = 1; m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
  };

  // ───── wereld: renderer, gloed, omgeving, sokkel ─────
  LK.init = function (canvas) {
    const W = {};
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.physicallyCorrectLights = false;
    W.r = r; W.scene = new T.Scene(); W.scene.background = LK.tex.achtergrond();
    W.cam = new T.PerspectiveCamera(38, 16 / 10, 0.4, 40);
    W.root = new T.Group(); W.scene.add(W.root);
    W.hemi = new T.HemisphereLight(0xdfe6ff, 0x3b2b20, 0.35); W.scene.add(W.hemi);
    // omgeving voor glans en metaal
    try { if (T.RoomEnvironment) { const pm = new T.PMREMGenerator(r); LK.env = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose(); } } catch (e) { LK.env = null; }
    // sokkel: blijft staan tussen opdrachten
    const sokkel = new T.Group(); W.scene.add(sokkel); W.sokkel = sokkel;
    LK.mesh(sokkel, LK.geo.rbox(8.0, 0.5, 6.0, 0.12, 4), LK.mat.hout(LK.KLEUR.walnoot, { tex: { seed: 21 } }), [0, -0.37, 2.3], { cast: false });
    LK.mesh(sokkel, LK.geo.rbox(8.12, 0.06, 6.12, 0.03, 2), LK.mat.metaal(0xd9a441, { roughness: 0.35 }), [0, -0.14, 2.3], { cast: false });
    W.plaatje = LK.mesh(sokkel, new T.PlaneGeometry(1.9, 0.36), new T.MeshStandardMaterial({ map: LK.tex.tekst(['Lichtkamer', '4de leerjaar']), roughness: 0.4, metalness: 0.3 }), [0, -0.37, 5.31], { cast: false });
    W.zetPlaatje = (regel2) => { W.plaatje.material.map.dispose(); W.plaatje.material.map = LK.tex.tekst(['Lichtkamer', regel2], { groot: 50, klein: 30 }); W.plaatje.material.needsUpdate = true; };
    // gloed (nabewerking) als de modules geladen zijn
    W.kwaliteit = 'hoog';
    if (T.EffectComposer && T.RenderPass && T.UnrealBloomPass && T.ShaderPass && T.GammaCorrectionShader) {
      try {
        const rt = new T.WebGLRenderTarget(256, 256, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, stencilBuffer: true });
        const comp = new T.EffectComposer(r, rt); comp.addPass(new T.RenderPass(W.scene, W.cam));
        const bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.55, 0.55, 0.86); comp.addPass(bloom);
        comp.addPass(new T.ShaderPass(T.GammaCorrectionShader)); W.comp = comp; W.bloom = bloom;
      } catch (e) { W.comp = null; }
    }
    W.render = () => { if (W.comp && W.gloed !== false) W.comp.render(); else W.r.render(W.scene, W.cam); };
    W.resize = (w, h) => {
      const pr = Math.min(window.devicePixelRatio || 1, W.kwaliteit === 'hoog' ? 2 : 1.25);
      r.setPixelRatio(pr); r.setSize(w, h, false);
      if (W.comp) { if (W.comp.setPixelRatio) W.comp.setPixelRatio(pr); W.comp.setSize(w, h); }
      W.cam.aspect = w / Math.max(1, h); W.cam.updateProjectionMatrix();
    };
    W.zetKwaliteit = (k) => { W.kwaliteit = k; W.gloed = k === 'hoog'; };
    LK.W = W; return W;
  };

  // ───── lichtbundel: zachte gloed die van de lamp weg wijst en snel uitdooft ─────
  LK.bundel = function (opts = {}) {
    const lengte = opts.lengte || 1.6, hoek = opts.hoek || 0.5;
    const geo = new T.ConeGeometry(Math.tan(hoek) * lengte, lengte, 40, 1, true); geo.translate(0, -lengte / 2, 0); geo.rotateX(-Math.PI / 2); // top in de oorsprong, opening naar +z
    const mat = new T.ShaderMaterial({
      uniforms: { kleur: { value: new T.Color(opts.kleur || 0xffe7a8) }, sterkte: { value: opts.sterkte ?? 0.55 }, lengte: { value: lengte } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vD; uniform float lengte; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vD = clamp(position.z/lengte,0.0,1.0); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; varying float vD; uniform vec3 kleur; uniform float sterkte; void main(){ float rand = pow(abs(dot(vN,vV)),1.6); float uit = pow(1.0-vD,2.2); gl_FragColor = vec4(kleur, sterkte*rand*uit); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false,
    });
    const m = new T.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2;
    m.userData.richt = (van, naar) => { m.position.copy(van); m.lookAt(naar); }; // lookAt richt +z naar het doel
    return m;
  };
  // stofjes in de bundel (alleen bij hoge kwaliteit en zonder prikkelarm)
  LK.stofjes = function (bundel, n = 70) {
    const L = bundel.geometry.parameters ? bundel.geometry.parameters.height : 1.4; const pos = new Float32Array(n * 3); const r = rng(9);
    for (let i = 0; i < n; i++) { const z = 0.1 + r() * L * 0.75; const rad = Math.tan(0.45) * z * Math.sqrt(r()); const a = r() * Math.PI * 2; pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = Math.sin(a) * rad; pos[i * 3 + 2] = z; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ color: 0xfff3c4, size: 0.022, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    LK._stof = (LK._stof || []).filter((x) => x.parent); LK._stof.push(pts);
    pts.userData.tik = (t) => { const p = geo.attributes.position.array; for (let i = 0; i < n; i++) { p[i * 3 + 1] += Math.sin(t * 0.0006 + i) * 0.0006; p[i * 3] += Math.cos(t * 0.0005 + i * 1.3) * 0.0005; } geo.attributes.position.needsUpdate = true; };
    bundel.add(pts); return pts;
  };

  // ───── zaklamp op een statief; wijst langs −z ─────
  LK.props.zaklamp = function (opts = {}) {
    const g = new T.Group(); const K = LK.KLEUR;
    const lijfMat = LK.mat.glans(K.zaklamp, { roughness: 0.4 });
    const lijf = LK.mesh(g, new T.CylinderGeometry(0.085, 0.085, 0.4, 32), lijfMat, [0, 0, 0.13], { rot: [Math.PI / 2, 0, 0], cast: false });
    for (let i = 0; i < 3; i++) LK.mesh(g, new T.TorusGeometry(0.087, 0.008, 8, 32), LK.mat.std(K.zaklampDonker, { roughness: 0.7 }), [0, 0, 0.22 + i * 0.05], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.08, 0.08, 0.05, 32), LK.mat.glans(K.zaklampDonker, { roughness: 0.5 }), [0, 0, 0.355], { rot: [Math.PI / 2, 0, 0], cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.135, 0.09, 0.16, 40), LK.mat.metaal(0xcfd5dc), [0, 0, -0.14], { rot: [Math.PI / 2, 0, 0], cast: false });
    LK.mesh(g, LK.geo.rbox(0.05, 0.03, 0.08, 0.012), LK.mat.std(0x2b5bd0, { roughness: 0.5 }), [0, 0.09, 0.05], { cast: false });
    const lens = LK.mesh(g, new T.CircleGeometry(0.12, 40), LK.mat.gloei(0xfff6d6), [0, 0, -0.222], { rot: [0, Math.PI, 0], cast: false });
    const sp = new T.SpotLight(K.lamplicht, opts.intensity || 1.0, 0, opts.angle || 0.95, opts.penumbra == null ? 0.35 : opts.penumbra, 1);
    sp.position.set(0, 0, -0.23); sp.castShadow = opts.shadow !== false; sp.shadow.mapSize.set(2048, 2048); sp.shadow.camera.near = 0.05; sp.shadow.camera.far = 14; sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.01; sp.shadow.focus = 1;
    g.add(sp); const tg = new T.Object3D(); tg.position.set(0, 0, -5); g.add(tg); sp.target = tg;
    // statief tot op de vloer (hoogte volgt opts.hoogte)
    const statief = new T.Group(); g.add(statief);
    const voet = LK.mesh(statief, new T.CylinderGeometry(0.16, 0.19, 0.04, 32), LK.mat.std(0x2f3542, { roughness: 0.5 }), [0, 0, 0.12]);
    const stang = LK.mesh(statief, new T.CylinderGeometry(0.018, 0.018, 1, 12), LK.mat.metaal(0xb9c0c8), [0, 0, 0.12]);
    const klem = LK.mesh(statief, new T.TorusGeometry(0.095, 0.018, 10, 24), LK.mat.metaal(0xb9c0c8), [0, 0, 0.12]);
    const schaduwBlob = LK.blob(statief, 0, 0.12, 0.6, 0.6, 0.45);
    g.userData = {
      lens, sp, aan: true, bundel: null,
      zet(aan) { this.aan = aan; sp.intensity = aan ? (opts.intensity || 1.0) : 0; lens.material.color.set(aan ? 0xfff6d6 : 0x55606e); if (this.bundel) this.bundel.visible = aan && !!this.toonBundel; },
      hoogte(y) { // y = hoogte van de lamp boven de vloer
        voet.position.y = -y + 0.02; stang.scale.y = Math.max(0.01, y - 0.06); stang.position.y = -y / 2 - 0.02 + 0.04; klem.position.y = -0.0; schaduwBlob.position.y = -y + 0.004; statief.visible = y > 0.08;
      },
    };
    if (opts.statief === false) statief.visible = false;
    g.userData.hoogte(opts.y ?? 0.5);
    if (opts.bundel !== false) {
      const b = LK.bundel({ lengte: opts.bundelLengte || 1.5, hoek: Math.min(0.55, (opts.angle || 0.95) * 0.55), sterkte: opts.bundelSterkte ?? 0.4 });
      b.position.set(0, 0, -0.23); b.rotation.set(0, Math.PI, 0);
      g.add(b); g.userData.bundel = b; g.userData.toonBundel = true;
      if (opts.stofjes) LK.stofjes(b);
    }
    return g;
  };

  // ───── kartonnen figuren op een houten voetje (1,0 hoog) ─────
  const SIL = {
    boom(s) { s.moveTo(-0.06, 0); s.lineTo(0.06, 0); s.lineTo(0.06, 0.3); s.lineTo(0.32, 0.3); s.lineTo(0.17, 0.52); s.lineTo(0.26, 0.52); s.lineTo(0.09, 0.78); s.lineTo(0.16, 0.78); s.lineTo(0, 1.0); s.lineTo(-0.16, 0.78); s.lineTo(-0.09, 0.78); s.lineTo(-0.26, 0.52); s.lineTo(-0.17, 0.52); s.lineTo(-0.32, 0.3); s.lineTo(-0.06, 0.3); s.closePath(); return []; },
    huis(s) { s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.55); s.lineTo(0, 1.0); s.lineTo(-0.3, 0.55); s.closePath(); const raam = new T.Path(); raam.moveTo(-0.12, 0.22); raam.lineTo(0.12, 0.22); raam.lineTo(0.12, 0.42); raam.lineTo(-0.12, 0.42); raam.closePath(); s.holes.push(raam); return []; },
    kind(s) { s.moveTo(-0.2, 0); s.lineTo(-0.06, 0); s.lineTo(-0.04, 0.3); s.lineTo(0.04, 0.3); s.lineTo(0.06, 0); s.lineTo(0.2, 0); s.lineTo(0.13, 0.62); s.lineTo(-0.13, 0.62); s.closePath(); const kop = new T.Shape(); kop.absarc(0, 0.81, 0.17, 0, Math.PI * 2, false); return [kop]; },
  };
  LK.SIL_TOP = { boom: [[0, 1.0], [-0.32, 0.3], [0.32, 0.3]], huis: [[0, 1.0], [-0.3, 0.55], [0.3, 0.55]], kind: [[0, 0.98], [-0.17, 0.81], [0.17, 0.81]] };
  LK.props.figuur = function (soort = 'boom') {
    const g = new T.Group(); const kleur = soort === 'huis' ? '#d9534f' : soort === 'kind' ? '#7d55c7' : '#3f9a5b';
    const verf = new T.MeshStandardMaterial({ color: kleur, roughness: 0.85 }); const rand = LK.mat.karton();
    const s = new T.Shape(); const extra = SIL[soort](s);
    for (const sh of [s, ...extra]) { const geo = new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); geo.translate(0, 0, -0.015); const m = new T.Mesh(geo, [verf, rand]); m.castShadow = true; m.receiveShadow = true; m.userData.silhouet = true; g.add(m); }
    if (soort === 'boom') { const bal = LK.mesh(g, new T.CircleGeometry(0.035, 16), LK.mat.std('#e63946'), [0.1, 0.42, 0.017], { cast: false }); const bal2 = bal.clone(); bal2.position.set(-0.07, 0.66, 0.017); g.add(bal2); }
    LK.mesh(g, LK.geo.rbox(0.42, 0.06, 0.16, 0.02), LK.mat.hout(LK.KLEUR.houtLicht), [0, 0.03, 0]);
    LK.blob(g, 0, 0, 0.7, 0.35, 0.4);
    return g;
  };

  // ───── kaartje met een gaatje, in twee houten klemvoetjes ─────
  LK.props.kaartje = function (hy, nr) {
    const g = new T.Group();
    const s = new T.Shape(); s.moveTo(-0.7, 0); s.lineTo(0.7, 0); s.lineTo(0.7, 1.1); s.lineTo(-0.7, 1.1); s.closePath();
    const p = new T.Path(); p.absarc(0, hy, 0.04, 0, Math.PI * 2, true); s.holes.push(p);
    // gouden ring rond het gaatje, zodat het ook van ver te zien is
    for (const zz of [0.012, -0.012]) { const ring = LK.mesh(g, new T.RingGeometry(0.04, 0.07, 32), LK.mat.metaal(0xd9a441, { roughness: 0.3, side: T.DoubleSide }), [0, hy, zz], { cast: false }); }
    const geo = new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); geo.translate(0, 0, -0.01);
    const m = new T.Mesh(geo, [LK.mat.papier('#fbf7ee'), LK.mat.karton()]); m.castShadow = true; m.receiveShadow = true; g.add(m);
    for (const x of [-0.5, 0.5]) LK.mesh(g, LK.geo.rbox(0.16, 0.1, 0.16, 0.03), LK.mat.hout(LK.KLEUR.houtLicht), [x, 0.05, 0]);
    if (nr) { const t = LK.tex.tekst([String(nr)], { w: 128, h: 128, groot: 80, bg: '#2b5bd0', kleur: '#ffffff', r: 64 }); const lb = LK.mesh(g, new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: t, transparent: true }), [-0.52, 0.92, 0.012], { cast: false }); lb.renderOrder = 3; const lb2 = lb.clone(); lb2.rotation.y = Math.PI; lb2.position.z = -0.012; g.add(lb2); }
    LK.blob(g, 0, 0, 1.6, 0.3, 0.35);
    return g;
  };

  // ───── houten meetlat (0 tot 24 cm) op het scherm ─────
  LK.props.meetlat = function () {
    const t = canvasTex(128, 1040, (g, w, h) => {
      g.fillStyle = '#e8c48c'; g.fillRect(0, 0, w, h); const r = rng(4); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(120,80,40,.18)'; g.beginPath(); const x = r() * w; g.moveTo(x, 0); g.lineTo(x + r() * 6, h); g.stroke(); }
      g.fillStyle = '#2a1a0c'; g.font = 'bold 44px Verdana, sans-serif'; g.textBaseline = 'middle';
      for (let cm = 0; cm <= 24; cm += 0.5) { const y = h - (cm / 24) * 1000 - 20; const L = cm % 5 === 0 ? 46 : cm % 1 === 0 ? 30 : 14; g.fillRect(0, y - 2, L, cm % 5 === 0 ? 5 : 3); if (cm % 5 === 0 && cm > 0) g.fillText(String(cm), 52, y); }
    });
    const g = new T.Group(); LK.mesh(g, LK.geo.rbox(0.34, 2.52, 0.03, 0.01), LK.mat.hout('#c99a5b'), [0, 1.2, 0.0], { cast: false });
    LK.mesh(g, new T.PlaneGeometry(0.32, 2.5), new T.MeshStandardMaterial({ map: t, roughness: 0.6 }), [0, 1.2, 0.017], { cast: false });
    return g;
  };

  // ───── gordijn met plooien (velours) ─────
  LK.gordijn = function (b, h, kleur = LK.KLEUR.velours, plooien = 7) {
    const geo = new T.PlaneGeometry(b, h, plooien * 8, 6); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin((x / b) * Math.PI * 2 * plooien) * 0.05 * (0.6 + 0.4 * (y / h + 0.5))); }
    geo.computeVertexNormals();
    return new T.Mesh(geo, new T.MeshStandardMaterial({ color: kleur, roughness: 0.75, side: T.DoubleSide }));
  };

  // ───── schaduwtheater (4de leerjaar en de schaduwopdracht bij de kleuters) ─────
  LK.decor['4'] = function (ctx) {
    const root = ctx.root, K = LK.KLEUR, g = new T.Group(); root.add(g); const vers = new T.Group(); root.add(vers);
    // podiumvloer
    LK.mesh(g, LK.geo.rbox(7.0, 0.14, 4.9, 0.03), LK.mat.hout(K.hout, { tex: { planken: 7, herhaal: [1, 1], seed: 2 } }), [0, -0.07, 2.35], { cast: false });
    // papieren scherm (z = 0) in een houten lijst
    const scherm = LK.mesh(g, new T.PlaneGeometry(6.3, 2.55), LK.mat.papier('#f6f1e6'), [0, 1.275, 0], { cast: false }); scherm.userData.scherm = true;
    const lijst = LK.mat.hout(K.houtDonker, { tex: { seed: 8 } });
    LK.mesh(g, LK.geo.rbox(6.6, 0.16, 0.14, 0.05), lijst, [0, 2.62, 0.02]);
    for (const x of [-3.24, 3.24]) LK.mesh(g, LK.geo.rbox(0.16, 2.8, 0.14, 0.05), lijst, [x, 1.32, 0.02]);
    LK.mesh(g, LK.geo.rbox(6.6, 0.12, 0.16, 0.04), lijst, [0, 0.0, 0.03], { cast: false });
    // coulissen (zijwanden) in gedempt blauw velours
    for (const s of [-1, 1]) {
      const wand = LK.mesh(g, LK.geo.rbox(0.12, 3.0, 1.6, 0.04), LK.mat.std('#2c3a63', { roughness: 0.9 }), [s * 3.42, 1.4, 0.75], { cast: false });
      wand.material.map = LK.tex.patroon('#2c3a63', '#3c4c7d', 'ster', { herhaal: [1, 2] }); wand.material.color.set(0xffffff);
    }
    // voorkant: gordijnen opzij gebonden, met een kroonlijst
    for (const s of [-1, 1]) {
      const gd = LK.gordijn(0.75, 3.1, K.velours, 4); gd.position.set(s * 3.3, 1.45, 4.55); gd.rotation.y = s * 0.12; gd.castShadow = false; vers.add(gd);
      LK.mesh(vers, new T.TorusGeometry(0.2, 0.03, 8, 24), LK.mat.metaal(0xd9a441, { roughness: 0.3 }), [s * 3.25, 1.1, 4.6], { rot: [0, Math.PI / 2, 0], cast: false });
      LK.mesh(vers, LK.geo.rbox(0.28, 3.45, 0.28, 0.06), LK.mat.std('#5c1a26', { roughness: 0.6 }), [s * 3.78, 1.6, 4.6], { cast: false });
    }
    const kroon = new T.Group(); kroon.position.set(0, 3.0, 4.6); vers.add(kroon);
    LK.mesh(kroon, LK.geo.rbox(7.9, 0.34, 0.3, 0.06), LK.mat.std('#5c1a26', { roughness: 0.6 }), [0, 0.12, 0], { cast: false });
    for (let i = 0; i < 15; i++) { const sc = LK.mesh(kroon, new T.CircleGeometry(0.27, 24, 0, Math.PI), LK.mat.std(K.velours, { roughness: 0.75, side: T.DoubleSide }), [-3.55 + i * 0.507, -0.05, 0.16], { rot: [0, 0, Math.PI], cast: false }); sc.scale.y = 0.6; }
    LK.mesh(kroon, LK.geo.rbox(7.9, 0.05, 0.05, 0.02), LK.mat.metaal(0xd9a441, { roughness: 0.3 }), [0, -0.05, 0.17], { cast: false });
    // ster op de kroonlijst
    const ster = new T.Shape(); for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5, rr = k % 2 ? 0.07 : 0.16; k ? ster.lineTo(Math.sin(a) * rr, Math.cos(a) * rr) : ster.moveTo(0, rr); }
    LK.mesh(kroon, new T.ExtrudeGeometry(ster, { depth: 0.03, bevelEnabled: false }), LK.mat.metaal(0xd9a441, { roughness: 0.3 }), [0, 0.13, 0.16], { cast: false });
    // gedempte rekwisieten naast het podium (buiten de lichtbundel)
    const kist = LK.mesh(vers, LK.geo.rbox(0.8, 0.5, 0.55, 0.05), LK.mat.hout('#8b5a3c', { tex: { planken: 3, seed: 5 } }), [-2.75, 0.25, 3.75]);
    kist.rotation.y = 0.25; LK.blob(vers, -2.75, 3.75, 1.2, 0.9, 0.5);
    LK.mesh(vers, LK.geo.rbox(0.62, 0.05, 0.42, 0.02), LK.mat.std('#7a8fb5', { roughness: 0.8 }), [-2.72, 0.525, 3.72], { rot: [0, 0.2, 0] });
    // boeken en een verfpot rechts vooraan
    [['#6d8a96', 0.09], ['#b5835a', 0.07], ['#8a6f9e', 0.08]].reduce((y, [k, d]) => { LK.mesh(vers, LK.geo.rbox(0.7, d, 0.48, 0.015), LK.mat.std(k, { roughness: 0.85 }), [2.7, y + d / 2, 3.85], { rot: [0, -0.25 + y, 0] }); return y + d; }, 0);
    LK.blob(vers, 2.7, 3.85, 1.0, 0.8, 0.45);
    const pot = LK.mesh(vers, new T.CylinderGeometry(0.13, 0.13, 0.22, 24), LK.mat.metaal(0xc9ccd2, { roughness: 0.45 }), [2.5, 0.35, 3.75]);
    LK.mesh(vers, new T.CylinderGeometry(0.115, 0.115, 0.01, 24), LK.mat.std('#2a9d8f'), [2.5, 0.465, 3.75], { cast: false });
    for (let i = 0; i < 3; i++) LK.mesh(vers, new T.CylinderGeometry(0.012, 0.012, 0.45, 8), LK.mat.hout(K.houtLicht), [2.47 + i * 0.03, 0.55, 3.73 + i * 0.02], { rot: [0.15 - i * 0.12, 0, 0.1 * (i - 1)] });
    return { scherm, versiering: vers };
  };

  LK.decor.k = LK.decor.k || null; // lk-kleuter.js
  LK.decor['6'] = LK.decor['6'] || null; // lk-labo.js
})();
