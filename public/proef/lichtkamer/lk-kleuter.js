/* Lichtkamer: het poppenhuis van Beer (einde kleuter). Vult LK.decor.k en de props lampje, kaars, zaklampKlein,
   spiegelKlein, bal, kast, spiegelDraai en beer. Bouwt verder op lk-wereld.js (palet, texturen, materialen, helpers).
   Eenheden van 10 cm: vloer op y = 0, achterwand op z = 0, de kijker aan +z. Het decor is rijk maar gedempt; wat het
   kind bedient, krijgt het sterkste contrast. Geen lichtbronnen in het decor: het licht is het leerdoel. */
(function () {
  'use strict';
  const T = window.THREE;
  const LK = window.LK;
  if (!T || !LK || !LK.mesh || !LK.geo || !LK.mat) return;
  LK.props = LK.props || {};
  LK.decor = LK.decor || {};
  const K = LK.KLEUR;
  const PI = Math.PI;
  const H = 2.7; // hoogte van de wanden

  // ───── palet van de kinderkamer: warm, gedempt, avond ─────
  const P = {
    behang: '#e7ddcb', motiefGroen: '#b3bfae', motiefRoos: '#d2ada1',
    lambris: '#a7b6a8', lambrisDonker: '#8a9b8d', room: '#efe7d5',
    vloer: '#bf8a56', kleed: '#7d91a5', kleedRand: '#e6dac2', kleedAccent: '#c58f7c',
    gordijn: '#b07f7b', buiten: '#b8c4cf', kozijn: '#f2ece0',
    bedHout: '#d8ad78', laken: '#f6f3ec', kussen: '#f1ebdf',
    // afwerking van het poppenhuis: snijranden in licht hout met een dun honingkleurig lijstje
    snij: '#ead2a8', lijstje: '#b9864e', kroon: '#f3dfb6',
    // het schermlaken: gebroken wit, zodat de lichtvlek niet uitbrandt
    schermLaken: '#ede5d3',
  };

  // ───── canvas-texturen (eigen cache, nooit groter dan 512 px) ─────
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TX = {};
  function doek(key, w, h, teken, herhaal) {
    if (TX[key]) return TX[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); teken(g, w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    if (herhaal) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return (TX[key] = t);
  }
  function ruis(g, w, h, r, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(90,70,50,${a})` : `rgba(255,255,255,${a * 1.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r()); } }
  function hexA(hex, a) { const c = new T.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }
  // zacht gemêleerd vlak: grote, vage vlekken in tinten van één kleur (wol)
  function gemeleerd(g, x0, y0, w, h, kleur, r) {
    g.fillStyle = kleur; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, s = 18 + r() * 46;
      const rg = g.createRadialGradient(x, y, 0, x, y, s); const t = shade(kleur, 0.9 + r() * 0.2);
      rg.addColorStop(0, hexA(t, 1)); rg.addColorStop(1, hexA(t, 0)); g.globalAlpha = 0.45; g.fillStyle = rg; g.fillRect(x - s, y - s, 2 * s, 2 * s);
    }
    g.globalAlpha = 1;
  }
  function sterPad(g, x, y, ro, ri, n = 5) { g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = (k * PI) / n, rr = k % 2 ? ri : ro; g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr); } g.closePath(); }
  function shade(hex, f) { return LK.shade(hex, f); }

  const tex = {
    behang() {
      return doek('k-behang', 256, 256, (g, w, h) => {
        g.fillStyle = P.behang; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = 'rgba(150,170,148,.13)'; g.fillRect(x + 6, 0, 14, h);
          g.fillStyle = 'rgba(140,118,90,.09)'; g.fillRect(x + 2, 0, 1.5, h); g.fillRect(x + 23.5, 0, 1.5, h);
        }
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const x = i * 64 + 44, y = j * 64 + (i % 2 ? 64 : 32);
          for (const dy of [-h, 0]) {
            g.fillStyle = i % 2 ? P.motiefRoos : P.motiefGroen; sterPad(g, x, y + dy, 5, 2.2); g.fill();
            g.fillStyle = 'rgba(150,135,110,.35)'; g.beginPath(); g.arc(x, y + dy + 32, 1.6, 0, PI * 2); g.fill();
          }
        }
        ruis(g, w, h, rng(31), 1500, 0.035);
      }, true);
    },
    lambris() {
      return doek('k-lambris', 256, 256, (g, w, h) => {
        const r = rng(17);
        for (let b = 0; b < 4; b++) {
          const x0 = b * 64; g.fillStyle = shade(P.lambris, 0.96 + r() * 0.08); g.fillRect(x0, 0, 64, h);
          for (let i = 0; i < 7; i++) { g.strokeStyle = 'rgba(70,90,75,.08)'; g.lineWidth = 1 + r(); g.beginPath(); const x = x0 + 6 + r() * 52; g.moveTo(x, 0); for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y / 40 + i) * 2, y); g.stroke(); }
          g.fillStyle = P.lambrisDonker; g.fillRect(x0, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x0 + 3, 0, 1.5, h);
        }
        ruis(g, w, h, r, 900, 0.03);
      }, true);
    },
    vloer() {
      return doek('k-vloer', 512, 512, (g, w, h) => {
        const r = rng(23); const n = 6, pw = w / n;
        for (let p = 0; p < n; p++) {
          const x0 = p * pw;
          const naden = [r() * h, r() * h];
          for (let s = 0; s < 3; s++) {
            const y0 = s === 0 ? 0 : naden[s - 1]; const y1 = s === 2 ? h : naden[s];
            if (s === 1 && y1 < y0) continue;
            g.fillStyle = shade(P.vloer, 0.86 + r() * 0.24); g.fillRect(x0, Math.min(y0, y1), pw, Math.abs(y1 - y0) + 1);
          }
          g.fillStyle = shade(P.vloer, 0.86 + r() * 0.24); g.fillRect(x0, 0, pw, h);
          for (let i = 0; i < 14; i++) { g.strokeStyle = shade(P.vloer, 0.72 + r() * 0.2); g.globalAlpha = 0.3 + r() * 0.3; g.lineWidth = 0.8 + r() * 1.6; g.beginPath(); const x = x0 + 4 + r() * (pw - 8); g.moveTo(x, 0); for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin(y / 70 + i * 2) * 3 * r(), y); g.stroke(); }
          g.globalAlpha = 1;
          if (r() < 0.6) { g.fillStyle = shade(P.vloer, 0.62); g.globalAlpha = 0.45; g.beginPath(); g.ellipse(x0 + pw * (0.3 + r() * 0.4), r() * h, 4, 9, 0, 0, PI * 2); g.fill(); g.globalAlpha = 1; }
          g.fillStyle = shade(P.vloer, 0.5); g.fillRect(x0, 0, 2.5, h);
          for (const y of naden) { g.fillStyle = shade(P.vloer, 0.55); g.fillRect(x0, y, pw, 2); }
        }
        ruis(g, w, h, r, 2500, 0.04);
      }, true);
    },
    // rustig vloerkleed: effen, zacht gemêleerd middenveld met één rand (geen patroon dat de rij voorwerpen overstemt)
    kleed() {
      return doek('k-kleed', 512, 320, (g, w, h) => {
        g.fillStyle = P.kleedRand; g.fillRect(0, 0, w, h);
        g.fillStyle = shade(P.kleed, 0.92); g.fillRect(22, 22, w - 44, h - 44);
        g.fillStyle = 'rgba(236,226,204,.75)'; g.fillRect(32, 32, w - 64, 3); g.fillRect(32, h - 35, w - 64, 3); g.fillRect(32, 32, 3, h - 64); g.fillRect(w - 35, 32, 3, h - 64);
        gemeleerd(g, 38, 38, w - 76, h - 76, P.kleed, rng(41));
        ruis(g, w, h, rng(42), 2600, 0.045);
      });
    },
    // ovaal kleed met één rand, effen en zacht gemêleerd (geen schietschijf)
    ovaal(kleur, rand, key) {
      return doek('k-ovaal' + key, 512, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = rand; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, PI * 2); g.fill();
        g.fillStyle = shade(kleur, 0.9); g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 26, h / 2 - 26, 0, 0, PI * 2); g.fill();
        g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 34, h / 2 - 34, 0, 0, PI * 2); g.clip();
        gemeleerd(g, 0, 0, w, h, kleur, rng(44)); g.restore();
        ruis(g, w, h, rng(45), 2200, 0.04);
      });
    },
    laken() {
      return doek('k-laken', 512, 320, (g, w, h) => {
        g.fillStyle = P.laken; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.05; g.fillStyle = '#7a6a50';
        for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
        g.globalAlpha = 1;
        // zoom met stiksel
        g.fillStyle = 'rgba(150,135,110,.10)'; g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 10);
        g.strokeStyle = 'rgba(150,135,110,.45)'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(4, h - 17); g.lineTo(w - 4, h - 17); g.moveTo(13, 4); g.lineTo(13, h - 4); g.moveTo(w - 13, 4); g.lineTo(w - 13, h - 4); g.moveTo(4, 13); g.lineTo(w - 4, 13); g.stroke();
        g.setLineDash([]);
        ruis(g, w, h, rng(5), 1800, 0.025);
      });
    },
    hemel() {
      return doek('k-hemel', 512, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#111733'); gr.addColorStop(0.6, '#1d2750'); gr.addColorStop(1, '#2d3b68'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const r = rng(77);
        for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h * 0.66; g.fillStyle = `rgba(255,246,220,${0.25 + r() * 0.5})`; g.beginPath(); g.arc(x, y, 0.6 + r() * 1.1, 0, PI * 2); g.fill(); }
        for (let i = 0; i < 7; i++) {
          const x = 30 + r() * (w - 60), y = 20 + r() * h * 0.5, s = 5 + r() * 4;
          const rg = g.createRadialGradient(x, y, 0, x, y, s * 1.8); rg.addColorStop(0, 'rgba(255,240,200,.55)'); rg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = rg; g.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
          g.fillStyle = 'rgba(255,248,226,.95)'; sterPad(g, x, y, s, s * 0.28, 4); g.fill();
        }
        // verre heuvels, daken en bomen (donkere silhouetten, geen verlichte ramen)
        g.fillStyle = '#1a2246'; g.beginPath(); g.moveTo(0, h * 0.8); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.78 - Math.sin(x / 90) * 18 - Math.sin(x / 37) * 5); g.lineTo(w, h); g.lineTo(0, h); g.fill();
        g.fillStyle = '#121937';
        const huis = (x, b, hh, dak) => { g.fillRect(x, h - hh, b, hh); g.beginPath(); g.moveTo(x - 6, h - hh); g.lineTo(x + b / 2, h - hh - dak); g.lineTo(x + b + 6, h - hh); g.fill(); };
        huis(40, 90, 70, 46); g.fillRect(105, h - 140, 12, 30); huis(300, 120, 56, 40); huis(430, 70, 84, 38);
        for (const [x, s] of [[175, 34], [215, 26], [255, 30], [390, 22]]) { g.fillRect(x - 3, h - 70, 6, 70); g.beginPath(); g.arc(x, h - 70 - s * 0.6, s, 0, PI * 2); g.fill(); }
        g.fillRect(0, h - 22, w, 22);
      });
    },
    quilt() {
      return doek('k-quilt', 256, 256, (g, w, h) => {
        const kl = ['#c6a197', '#a8b7a9', '#e9e0cf', '#8ea2b6', '#d2b48c', '#b9a6c0'];
        const r = rng(9); const n = 4, s = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const k = kl[(i * 2 + j * 3) % kl.length]; g.fillStyle = k; g.fillRect(i * s, j * s, s, s);
          g.fillStyle = 'rgba(255,255,255,.22)';
          if ((i + j) % 3 === 0) { for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { g.beginPath(); g.arc(i * s + 11 + a * 21, j * s + 11 + b * 21, 2.6, 0, PI * 2); g.fill(); } }
          else if ((i + j) % 3 === 1) { sterPad(g, i * s + s / 2, j * s + s / 2, 11, 4.5); g.fill(); }
          else { g.fillRect(i * s, j * s + s / 2 - 3, s, 6); g.fillRect(i * s + s / 2 - 3, j * s, 6, s); }
        }
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.3; g.setLineDash([4, 3]);
        for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s + 3, 0); g.lineTo(i * s + 3, h); g.moveTo(0, i * s + 3); g.lineTo(w, i * s + 3); g.stroke(); }
        g.setLineDash([]); g.fillStyle = 'rgba(60,40,30,.18)'; for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1, 0, 2, h); g.fillRect(0, i * s - 1, w, 2); }
        ruis(g, w, h, r, 1200, 0.04);
      }, true);
    },
    vacht() {
      return doek('k-vacht', 128, 128, (g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const r = rng(61);
        for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, l = 2 + r() * 4, a = r() * PI; g.strokeStyle = r() < 0.55 ? `rgba(80,50,20,${0.08 + r() * 0.12})` : `rgba(255,255,255,${0.25 + r() * 0.3})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      }, true);
    },
    schilderij() {
      return doek('k-tekening', 256, 192, (g, w, h) => {
        g.fillStyle = '#f4eddd'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#c9d6dd'; g.fillRect(0, 0, w, h * 0.62);
        g.fillStyle = '#9fb59a'; g.beginPath(); g.moveTo(0, h * 0.66); g.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.64); g.quadraticCurveTo(w * 0.85, h * 0.74, w, h * 0.6); g.lineTo(w, h); g.lineTo(0, h); g.fill();
        g.fillStyle = '#8aa486'; g.beginPath(); g.moveTo(0, h * 0.8); g.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.84); g.lineTo(w, h); g.lineTo(0, h); g.fill();
        g.fillStyle = '#d7a08f'; g.fillRect(40, 92, 56, 44); g.fillStyle = '#a8695c'; g.beginPath(); g.moveTo(32, 94); g.lineTo(68, 64); g.lineTo(104, 94); g.fill();
        g.fillStyle = '#7d6a5a'; g.fillRect(62, 112, 14, 24); g.fillStyle = '#e9e0cf'; g.fillRect(46, 102, 11, 10);
        g.fillStyle = '#7d6a5a'; g.fillRect(186, 92, 8, 40); g.fillStyle = '#7f9f78'; g.beginPath(); g.arc(190, 84, 24, 0, PI * 2); g.fill();
        g.fillStyle = '#e8dfe6'; for (const [x, y] of [[150, 40], [170, 34], [190, 42]]) { g.beginPath(); g.arc(x, y, 12, 0, PI * 2); g.fill(); }
        for (let i = 0; i < 9; i++) { g.fillStyle = ['#d2ada1', '#e9e0cf', '#b9a6c0'][i % 3]; g.beginPath(); g.arc(20 + i * 26, 160 + (i % 2) * 8, 4, 0, PI * 2); g.fill(); }
        g.strokeStyle = 'rgba(80,60,40,.35)'; g.lineWidth = 1.5; g.strokeRect(1, 1, w - 2, h - 2);
      });
    },
    wekker() {
      return doek('k-wekker', 128, 128, (g, w, h) => {
        g.fillStyle = '#f4eee2'; g.beginPath(); g.arc(64, 64, 62, 0, PI * 2); g.fill();
        g.fillStyle = '#5b4a3c'; for (let i = 0; i < 12; i++) { const a = (i * PI) / 6; const l = i % 3 ? 7 : 13; g.save(); g.translate(64, 64); g.rotate(a); g.fillRect(-2, -56, 4, l); g.restore(); }
        g.strokeStyle = '#3b2e25'; g.lineCap = 'round'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 26, 64 + 6); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 18); g.stroke();
        g.fillStyle = '#b5523f'; g.beginPath(); g.arc(64, 64, 5, 0, PI * 2); g.fill();
      });
    },
    kap() {
      return doek('k-kap', 256, 64, (g, w, h) => {
        g.fillStyle = '#f1e7d2'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(190,150,110,.16)'; g.fillRect(x, 0, 6, h); }
        g.fillStyle = 'rgba(180,120,110,.45)'; g.fillRect(0, h - 10, w, 4); g.fillRect(0, 6, w, 3);
        ruis(g, w, h, rng(3), 400, 0.04);
      }, true);
    },
    buiten() {
      return doek('k-buiten', 256, 256, (g, w, h) => {
        const r = rng(19); for (let y = 0; y < h; y += 32) { g.fillStyle = shade(P.buiten, 0.94 + r() * 0.1); g.fillRect(0, y, w, 32); g.fillStyle = 'rgba(20,30,45,.35)'; g.fillRect(0, y + 29, w, 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y, w, 2); }
        ruis(g, w, h, r, 900, 0.04);
      }, true);
    },
    stof(kleur) {
      return doek('k-stof' + kleur, 128, 128, (g, w, h) => {
        g.fillStyle = kleur; g.fillRect(0, 0, w, h); const r = rng(13);
        g.globalAlpha = 0.07; g.fillStyle = '#000'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1); g.globalAlpha = 1;
        for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(255,240,225,.22)'; sterPad(g, r() * w, r() * h, 3.5, 1.5); g.fill(); }
        ruis(g, w, h, r, 500, 0.05);
      }, true);
    },
  };

  // ───── kleine helpers ─────
  function std(kleur, o) { return new T.MeshStandardMaterial(Object.assign({ color: kleur, roughness: 0.8, metalness: 0 }, o || {})); }
  function schaalUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; }
  function rb(w, h, d, r) { return LK.geo.rbox(w, h, d, r == null ? Math.min(w, h, d) * 0.18 : r, 2); }
  // De nabewerking rendert met een 16-bit dieptebuffer. Dragende vlakken (vloer, kleed, wanden) schuiven daarom een
  // paar dieptestappen naar achter, zodat wat erop ligt of eraan hangt niet flikkert; kleine plaatjes komen iets naar voor.
  function achter(mat, n) { mat.polygonOffset = true; mat.polygonOffsetFactor = 0; mat.polygonOffsetUnits = n || 2; return mat; }
  function voor(mat, n) { mat.polygonOffset = true; mat.polygonOffsetFactor = 0; mat.polygonOffsetUnits = -(n || 2); return mat; }
  function blob(par, x, z, w, d, o, y) { const b = LK.blob(par, x, z, w, d, o); if (y != null) b.position.y = y; return b; }
  // een vlak dat naar +x kijkt (lokaal x loopt langs −z)
  function naarRechts(m) { m.rotation.y = PI / 2; return m; }
  function rechthoekPad(x0, y0, x1, y1, gat) { const s = gat ? new T.Path() : new T.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; }

  // versie van het licht: verandert als een lichtbron aan- of uitgaat (voor de weerspiegelingen)
  let versie = 1;
  let huidigeVers = null;
  const KUBUS = { bezig: false };
  function handtekening() { return versie + '|' + (huidigeVers ? (huidigeVers.visible ? 1 : 0) : 2) + '|' + (LK.W && LK.W.root ? LK.W.root.children.length : 0); }
  // echte weerspiegeling met een CubeCamera; alleen opnieuw berekend als het licht of het decor verandert
  function weerspiegel(groep, meshes, punt, res) {
    if (!T.WebGLCubeRenderTarget || !T.CubeCamera) return false;
    try {
      const rt = new T.WebGLCubeRenderTarget(res || 128, { format: T.RGBFormat, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
      const cam = new T.CubeCamera(0.03, 24, rt);
      let gezien = '';
      const p = new T.Vector3();
      const vooraf = function (renderer, scene) {
        if (KUBUS.bezig) return;
        const hs = handtekening(); if (hs === gezien || !groep.parent) return;
        KUBUS.bezig = true;
        const auto = renderer.shadowMap.autoUpdate, clear = renderer.autoClear, zicht = groep.visible;
        const omh = omhulsel && omhulsel.parent ? omhulsel : null;
        try {
          renderer.shadowMap.autoUpdate = false; renderer.autoClear = true; groep.visible = false; if (omh) omh.visible = true;
          punt.getWorldPosition(p); cam.position.copy(p); cam.updateMatrixWorld(true);
          cam.update(renderer, scene); gezien = hs;
        } catch (e) { gezien = hs; }
        if (omh) omh.visible = false; groep.visible = zicht; renderer.shadowMap.autoUpdate = auto; renderer.autoClear = clear; KUBUS.bezig = false;
      };
      for (const m of meshes) { m.onBeforeRender = vooraf; m.material.envMap = rt.texture; m.material.envMapIntensity = 1; m.material.needsUpdate = true; m.material.addEventListener('dispose', () => rt.dispose()); }
      return true;
    } catch (e) { return false; }
  }

  // ───── de kamer: vloer, achterwand, linkerwand met raam ─────
  function maakMaterialen(taak) {
    // bij de schaduwopdracht is het avond in de kamer: wanden en vloer een tint donkerder en koeler, zodat het
    // gebroken witte laken met de lichtvlek het helderste vlak is (zoals in het theater)
    const avond = taak === 'schaduw' ? 0x9298aa : 0xffffff;
    const behang = achter(new T.MeshStandardMaterial({ color: avond, map: tex.behang(), roughness: 0.92 }), 2);
    const lambris = achter(new T.MeshStandardMaterial({ color: avond, map: tex.lambris(), roughness: 0.78 }), 2);
    const room = std(P.room, { roughness: 0.6 });
    const rand = std('#e9dfcc', { roughness: 0.85 });
    // snijranden van wanden en vloer: licht hout met een zweem eigen kleur, zodat het poppenhuis ook in het donker
    // een afgewerkte rand heeft (verlicht niets); het lijstje is een dunne honingkleurige bies
    const snij = LK.mat.hout(P.snij, { tex: { seed: 8 } }); snij.emissive = new T.Color(0x3a2c1c); snij.emissiveMap = snij.map;
    const lijstje = LK.mat.hout(P.lijstje, { tex: { seed: 14 }, m: { roughness: 0.5 } }); lijstje.emissive = new T.Color(0x24180c);
    const kroon = LK.mat.hout(P.kroon, { tex: { seed: 19 }, m: { roughness: 0.6 } }); kroon.emissive = new T.Color(0x3a2e1e); kroon.emissiveMap = kroon.map;
    // buitenkant: een zweem eigen kleur, zodat de gevel 's nachts leesbaar blijft (verlicht niets)
    const buiten = new T.MeshStandardMaterial({ color: 0xffffff, map: tex.buiten(), roughness: 0.85, emissive: 0x1c2533, emissiveMap: tex.buiten() });
    const hout = LK.mat.hout(P.bedHout, { tex: { seed: 4 } });
    const houtLicht = LK.mat.hout(K.houtLicht, { tex: { seed: 6 } });
    const messing = LK.mat.metaal(0xc9a35a, { roughness: 0.35 });
    return { behang, lambris, room, rand, snij, lijstje, kroon, buiten, hout, houtLicht, messing, taak, avond };
  }

  const RAAM = { z0: 1.7, z1: 3.1, y0: 1.05, y1: 2.25 };

  function bouwKamer(g, vers, M, taak) {
    const schaduw = taak === 'schaduw';
    // vloer: afgeronde plaat zoals het schaduwtheater, met een plankenvloer erop
    const vt = tex.vloer().clone(); vt.needsUpdate = true; vt.wrapS = vt.wrapT = T.RepeatWrapping; vt.repeat.set(7.0 / 1.25, 4.9 / 1.25);
    const vtop = achter(new T.MeshStandardMaterial({ color: schaduw ? 0xb3aaa4 : 0xffffff, map: vt, roughness: 0.62 }), 3); vtop.addEventListener('dispose', () => vt.dispose());
    const vzij = M.snij;
    const vloer = LK.mesh(g, LK.geo.rbox(7.0, 0.14, 4.9, 0.03), [vzij, vzij, vtop, vzij, vzij, vzij], [0, -0.07, 2.35], { cast: false });
    vloer.userData.vloer = true;
    // het poppenhuis staat op een matte houten plaat over de glanzende sokkelrand, zodat die rand in de avondkamer niet oplicht
    LK.mesh(g, LK.geo.rbox(8.16, 0.07, 6.16, 0.03), LK.mat.hout(K.hout, { tex: { seed: 21 } }), [0, -0.14, 2.3], { cast: false });
    // dun lijstje langs de zichtbare snijranden van de vloer (voorkant en rechterkant)
    LK.mesh(g, rb(7.0, 0.026, 0.02, 0.008), M.lijstje, [0, -0.072, 4.805], { cast: false });
    LK.mesh(g, rb(0.02, 0.026, 4.86, 0.008), M.lijstje, [3.505, -0.072, 2.35], { cast: false });

    // ── achterwand (binnenkant op z = 0) ──
    LK.mesh(g, LK.geo.rbox(7.06, H + 0.14, 0.22, 0.02), M.rand, [-0.02, (H - 0.14) / 2, -0.26], { cast: false });
    const xa = -3.3, xb = 3.5, bw = xb - xa, xm = (xa + xb) / 2;
    const wandAchter = LK.mesh(g, schaalUV(new T.PlaneGeometry(bw, H - 0.92), bw / 1.1, (H - 0.92) / 1.1), M.behang, [xm, 0.92 + (H - 0.92) / 2, 0], { cast: false });
    LK.mesh(g, schaalUV(new T.PlaneGeometry(bw, 0.92), bw / 0.6, 1), M.lambris, [xm, 0.46, 0], { cast: false });
    // lijsten: plint, lambrislijst en kroonlijst (bij de schaduwopdracht niet achter het laken)
    const stukken = schaduw ? [[xa, -2.02], [2.02, xb]] : [[xa, xb]];
    for (const [a, b] of stukken) {
      LK.mesh(g, rb(b - a, 0.13, 0.05, 0.012), M.room, [(a + b) / 2, 0.065, 0.025], { cast: false });
      LK.mesh(g, rb(b - a, 0.05, 0.06, 0.015), M.room, [(a + b) / 2, 0.93, 0.03], { cast: false });
    }
    LK.mesh(g, rb(bw, 0.08, 0.06, 0.02), M.room, [xm, H - 0.04, 0.03], { cast: false });
    // dikte van de wand zichtbaar: een kap in licht hout, daarop een crème kroonlijst met een lijstje, en een rand aan het open eind
    LK.mesh(g, LK.geo.rbox(7.25, 0.06, 0.44, 0.02), M.snij, [-0.07, H + 0.03, -0.185], { cast: false });
    LK.mesh(g, LK.geo.rbox(7.36, 0.08, 0.52, 0.025), M.kroon, [-0.07, H + 0.1, -0.17], { cast: false });
    LK.mesh(g, rb(7.3, 0.026, 0.026, 0.01), M.lijstje, [-0.07, H + 0.05, 0.065], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.05, H + 0.2, 0.44, 0.015), M.snij, [3.525, (H + 0.06 - 0.14) / 2, -0.185], { cast: false });
    LK.mesh(g, rb(0.02, H + 0.08, 0.026, 0.008), M.lijstje, [3.552, (H + 0.06 - 0.14) / 2, -0.185], { cast: false });

    // ── linkerwand (binnenkant op x = −3,3) met een raam ──
    const zf = 4.8;
    const vorm = rechthoekPad(-0.37, -0.14, zf, H);
    vorm.holes.push(rechthoekPad(RAAM.z0, RAAM.y0, RAAM.z1, RAAM.y1, true));
    const wandGeo = new T.ExtrudeGeometry(vorm, { depth: 0.2, bevelEnabled: false });
    const wand = LK.mesh(g, wandGeo, [M.buiten, M.rand], [-3.45, 0, 0], { rot: [0, -PI / 2, 0], cast: false });
    wand.userData.wand = true;
    // behang met een gat voor het raam (lokaal x = −z)
    const bv = rechthoekPad(-zf, 0.92, 0, H); bv.holes.push(rechthoekPad(-RAAM.z1, RAAM.y0, -RAAM.z0, RAAM.y1, true));
    const bgeo = schaalUV(new T.ShapeGeometry(bv), 1 / 1.1, 1 / 1.1);
    naarRechts(LK.mesh(g, bgeo, M.behang, [-3.3, 0, 0], { cast: false }));
    naarRechts(LK.mesh(g, schaalUV(new T.PlaneGeometry(zf, 0.92), zf / 0.6, 1), M.lambris, [-3.3, 0.46, zf / 2], { cast: false }));
    LK.mesh(g, rb(0.05, 0.13, zf, 0.012), M.room, [-3.275, 0.065, zf / 2], { cast: false });
    LK.mesh(g, rb(0.06, 0.05, zf, 0.015), M.room, [-3.27, 0.93, zf / 2], { cast: false });
    LK.mesh(g, rb(0.06, 0.08, zf, 0.02), M.room, [-3.27, H - 0.04, zf / 2], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.42, 0.06, zf + 0.44, 0.02), M.snij, [-3.47, H + 0.03, zf / 2 - 0.22], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.5, 0.075, zf + 0.5, 0.025), M.kroon, [-3.47, H + 0.0975, zf / 2 - 0.2], { cast: false });
    LK.mesh(g, rb(0.026, 0.026, zf + 0.42, 0.01), M.lijstje, [-3.205, H + 0.05, zf / 2 - 0.16], { cast: false });
    LK.mesh(g, LK.geo.rbox(0.42, H + 0.2, 0.05, 0.015), M.snij, [-3.47, (H + 0.06 - 0.14) / 2, zf + 0.025], { cast: false });
    LK.mesh(g, rb(0.026, H + 0.08, 0.02, 0.008), M.lijstje, [-3.47, (H + 0.06 - 0.14) / 2, zf + 0.052], { cast: false });

    // raam: kozijn met vier ruitjes, vensterbank, glas en een nachthemel met sterretjes (geen maan)
    const zw = RAAM.z1 - RAAM.z0, yw = RAAM.y1 - RAAM.y0, zc = (RAAM.z0 + RAAM.z1) / 2, yc = (RAAM.y0 + RAAM.y1) / 2;
    const kv = rechthoekPad(-zw / 2, -yw / 2, zw / 2, yw / 2); const f = 0.065, m = 0.025;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = sx < 0 ? -zw / 2 + f : m, x1 = sx < 0 ? -m : zw / 2 - f, y0 = sy < 0 ? -yw / 2 + f : m, y1 = sy < 0 ? -m : yw / 2 - f;
      kv.holes.push(rechthoekPad(x0, y0, x1, y1, true));
    }
    const kozijn = std(P.kozijn, { roughness: 0.55 });
    const kg = new T.ExtrudeGeometry(kv, { depth: 0.06, bevelEnabled: false }); kg.translate(0, 0, -0.03);
    naarRechts(LK.mesh(g, kg, kozijn, [-3.55, yc, zc], { cast: false }));
    // binnenlijst rond de opening
    const lv = rechthoekPad(-zw / 2 - 0.09, -yw / 2 - 0.02, zw / 2 + 0.09, yw / 2 + 0.09); lv.holes.push(rechthoekPad(-zw / 2, -yw / 2, zw / 2, yw / 2, true));
    naarRechts(LK.mesh(g, new T.ExtrudeGeometry(lv, { depth: 0.19, bevelEnabled: false }), kozijn, [-3.465, yc, zc], { cast: false }));
    LK.mesh(g, rb(0.22, 0.05, zw + 0.32, 0.015), kozijn, [-3.25, RAAM.y0 - 0.02, zc], { cast: false });
    const glas = new T.MeshStandardMaterial({ color: 0xbfd2e6, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.1, envMap: LK.env, envMapIntensity: 0.3 * (LK.envSterkte ?? 1), depthWrite: false });
    naarRechts(LK.mesh(g, new T.PlaneGeometry(zw, yw), glas, [-3.57, yc, zc], { cast: false, receive: false }));
    const hemel = LK.mesh(g, new T.PlaneGeometry(2.8, 1.85), new T.MeshBasicMaterial({ map: tex.hemel(), toneMapped: false }), [-3.98, 1.75, zc], { cast: false, receive: false });
    naarRechts(hemel);
    return { achter: wandAchter, vloer };
  }

  // ───── versiering: meubels en speelgoed (gedempt) ─────
  function gordijnPaneel(b, h, kleur, plooien, knijp, kant) {
    const geo = new T.PlaneGeometry(b, h, plooien * 6, 26); const p = geo.attributes.position;
    const yk = -h * 0.08, anker = kant * b / 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      let s;
      if (y >= yk) { const t = (y - yk) / (h / 2 - yk); s = 1 - knijp + knijp * Math.pow(t, 1.2); }
      else { const t = (yk - y) / (yk + h / 2); s = 1 - knijp + knijp * 0.5 * Math.pow(t, 0.9); }
      const u = (x + b / 2) / b;
      const amp = 0.022 / Math.sqrt(s);
      p.setXYZ(i, anker + (x - anker) * s, y, Math.sin(u * PI * 2 * plooien) * amp + amp);
    }
    geo.computeVertexNormals();
    return new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xffffff, map: tex.stof(kleur), roughness: 0.82, side: T.DoubleSide }));
  }

  function gordijnen(vers, M) {
    const zc = (RAAM.z0 + RAAM.z1) / 2, hh = 2.4;
    for (const s of [-1, 1]) {
      const paneel = gordijnPaneel(0.62, hh, P.gordijn, 4, 0.55, -s);
      paneel.position.set(-3.2, 0.03 + hh / 2, zc + s * 1.0); naarRechts(paneel); paneel.castShadow = false; paneel.receiveShadow = false; vers.add(paneel); // geen schaduwacne op de plooien
      // koord
      const kz = zc + s * (1.0 + 0.62 / 2 - 0.62 * 0.45 / 2 - 0.04);
      LK.mesh(vers, new T.TorusGeometry(0.075, 0.014, 6, 18), M.messing, [-3.17, 0.03 + hh / 2 - hh * 0.08, kz], { rot: [PI / 2, 0, 0], cast: false });
    }
    LK.mesh(vers, new T.CylinderGeometry(0.018, 0.018, 2.9, 10), M.messing, [-3.14, 2.46, zc], { rot: [PI / 2, 0, 0], cast: false });
    for (const s of [-1, 1]) LK.mesh(vers, new T.SphereGeometry(0.04, 12, 10), M.messing, [-3.14, 2.46, zc + s * 1.47], { cast: false });
  }

  function maakBed(M) {
    const b = new T.Group(); const w = 0.92, l = 1.36;
    // poten, bak, matras
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) LK.mesh(b, new T.CylinderGeometry(0.035, 0.03, 0.12, 10), M.hout, [sx * (w / 2 - 0.06), 0.06, sz * (l / 2 - 0.06)], { cast: false });
    LK.mesh(b, rb(w, 0.14, l, 0.03), M.hout, [0, 0.19, 0]);
    LK.mesh(b, rb(w - 0.08, 0.13, l - 0.1, 0.05), std(P.laken, { roughness: 0.95 }), [0, 0.32, 0.02]);
    // hoofdeinde met een sterretje uitgezaagd, en een laag voeteneinde
    const hv = new T.Shape(); hv.moveTo(-w / 2, 0); hv.lineTo(w / 2, 0); hv.lineTo(w / 2, 0.62); hv.quadraticCurveTo(w / 2, 0.88, 0, 0.9); hv.quadraticCurveTo(-w / 2, 0.88, -w / 2, 0.62); hv.closePath();
    const st = new T.Path(); for (let k = 0; k < 10; k++) { const a = (k * PI) / 5, rr = k % 2 ? 0.04 : 0.09; const x = Math.sin(a) * rr, y = 0.68 + Math.cos(a) * rr; k ? st.lineTo(x, y) : st.moveTo(x, y); } hv.holes.push(st);
    const hg = new T.ExtrudeGeometry(hv, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }); hg.translate(0, 0, -0.03);
    LK.mesh(b, hg, M.hout, [0, 0.0, -l / 2 + 0.03]);
    const vv = new T.Shape(); vv.moveTo(-w / 2, 0); vv.lineTo(w / 2, 0); vv.lineTo(w / 2, 0.36); vv.quadraticCurveTo(0, 0.46, -w / 2, 0.36); vv.closePath();
    const vg = new T.ExtrudeGeometry(vv, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }); vg.translate(0, 0, -0.025);
    LK.mesh(b, vg, M.hout, [0, 0, l / 2 - 0.025]);
    // kussen, omgeslagen laken en een quilt die over de randen hangt
    LK.mesh(b, rb(0.56, 0.1, 0.28, 0.05), std(P.kussen, { roughness: 0.95 }), [0, 0.435, -l / 2 + 0.24], { rot: [0.18, 0, 0], cast: false });
    const qm = voor(new T.MeshStandardMaterial({ color: 0xffffff, map: tex.quilt(), roughness: 0.9, side: T.DoubleSide }), 2);
    const dm = new T.Mesh(dekenGeo(w - 0.06, 0.8, 0.1, 0.03), qm);
    dm.position.set(0, 0.405, 0.2); dm.castShadow = true; dm.receiveShadow = true; b.add(dm);
    LK.mesh(b, rb(w - 0.02, 0.03, 0.1, 0.012), voor(std(P.laken, { roughness: 0.95 }), 2), [0, 0.405, -0.25], { cast: false });
    blob(b, 0, 0, w + 0.5, l + 0.4, 0.5);
    return b;
  }
  function dekenGeo(w, l, over, r) {
    const geo = new T.PlaneGeometry(w + 2 * over, l, 30, 8); const p = geo.attributes.position; const arc = r * PI / 2;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i); const d = Math.abs(u) - w / 2; const s = Math.sign(u) || 1; let x, y;
      if (d <= 0) { x = u; y = 0; } else if (d < arc) { const a = d / r; x = s * (w / 2 + r * Math.sin(a)); y = -r * (1 - Math.cos(a)); } else { x = s * (w / 2 + r); y = -r - (d - arc); }
      if (d > 0) x += s * Math.sin(v * 11) * 0.01 * Math.min(1, d / 0.06);
      p.setXYZ(i, x, y + (d <= 0 ? Math.sin(u * 7) * 0.005 : 0), -v);
    }
    geo.computeVertexNormals(); schaalUV(geo, 1.3, 1.1); return geo;
  }

  function maakNachtkastje(M) {
    const n = new T.Group();
    const verf = std('#d6ccb8', { roughness: 0.7 });
    LK.mesh(n, rb(0.5, 0.44, 0.4, 0.03), verf, [0, 0.27, 0]);
    LK.mesh(n, rb(0.56, 0.045, 0.46, 0.015), M.hout, [0, 0.51, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) LK.mesh(n, rb(0.05, 0.06, 0.05, 0.01), M.hout, [sx * 0.2, 0.03, sz * 0.15], { cast: false });
    LK.mesh(n, rb(0.42, 0.15, 0.04, 0.01), voor(std('#e4dccb', { roughness: 0.7 }), 2), [0, 0.37, 0.205], { cast: false });
    LK.mesh(n, new T.SphereGeometry(0.024, 10, 8), M.messing, [0, 0.37, 0.235], { cast: false });
    // boek met bladwijzer
    const boek = new T.Group(); boek.position.set(-0.1, 0.533, 0.03); boek.rotation.y = 0.35; n.add(boek);
    LK.mesh(boek, rb(0.24, 0.045, 0.18, 0.008), std('#7d8fa3', { roughness: 0.8 }), [0, 0.0225, 0], { cast: false });
    LK.mesh(boek, rb(0.23, 0.028, 0.168, 0.004), std('#f1eadb', { roughness: 0.9 }), [0.018, 0.0225, 0], { cast: false });
    LK.mesh(boek, new T.PlaneGeometry(0.02, 0.1), std('#b5523f', { roughness: 0.8, side: T.DoubleSide }), [0.05, -0.025, 0.1], { cast: false });
    // wekker (geen licht)
    const wk = new T.Group(); wk.position.set(0.14, 0.533, -0.02); wk.rotation.y = -0.3; n.add(wk);
    const wkMat = std('#9fb3a6', { roughness: 0.45 });
    LK.mesh(wk, new T.CylinderGeometry(0.075, 0.075, 0.05, 24), wkMat, [0, 0.09, 0], { rot: [PI / 2, 0, 0], cast: false });
    LK.mesh(wk, new T.CircleGeometry(0.062, 24), voor(new T.MeshStandardMaterial({ map: tex.wekker(), roughness: 0.5 }), 3), [0, 0.09, 0.027], { cast: false });
    for (const s of [-1, 1]) {
      LK.mesh(wk, new T.SphereGeometry(0.03, 12, 8, 0, PI * 2, 0, PI / 2), M.messing, [s * 0.05, 0.16, 0], { rot: [0, 0, -s * 0.5], cast: false });
      LK.mesh(wk, new T.CylinderGeometry(0.008, 0.008, 0.03, 6), M.messing, [s * 0.045, 0.012, 0], { cast: false });
    }
    blob(n, 0, 0, 0.85, 0.75, 0.45);
    return n;
  }

  function maakBoekenplank(M, aantal) {
    const p = new T.Group(); const L = 1.1;
    LK.mesh(p, rb(L, 0.04, 0.19, 0.012), M.hout, [0, 0, 0.095]);
    for (const s of [-1, 1]) {
      const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(0.16, 0); sh.quadraticCurveTo(0.04, -0.03, 0, -0.16); sh.closePath();
      const bg = new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); bg.translate(0, 0, -0.015);
      LK.mesh(p, bg, M.hout, [s * (L / 2 - 0.12), -0.02, 0.0], { rot: [0, -PI / 2, 0], cast: false });
    }
    // boeken als één InstancedMesh met kleuren per boek
    const kl = ['#7d8fa3', '#c6a197', '#a8b7a9', '#d2b48c', '#8a6f9e', '#b07f7b', '#6f8a86', '#e6dccb', '#9a7b5c'];
    const n = aantal || 9; const im = new T.InstancedMesh(rb(1, 1, 1, 0.08), std(0xffffff, { roughness: 0.82 }), n);
    const o = new T.Object3D(); const r = rng(55); let x = -L / 2 + 0.1;
    for (let i = 0; i < n; i++) {
      const hb = 0.17 + r() * 0.1, db = 0.035 + r() * 0.03, dd = 0.12 + r() * 0.04;
      const leun = i === n - 3 ? 0.28 : 0;
      o.position.set(x + db / 2 + (leun ? 0.04 : 0), 0.02 + hb / 2 - (leun ? 0.01 : 0), 0.09); o.rotation.set(0, 0, -leun); o.scale.set(db, hb, dd); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, new T.Color(kl[i % kl.length]));
      x += db + 0.004 + (leun ? 0.06 : 0);
    }
    im.castShadow = true; im.receiveShadow = true; p.add(im);
    // plantje en een houten bootje
    LK.mesh(p, new T.CylinderGeometry(0.055, 0.042, 0.09, 16), std('#c98f72', { roughness: 0.85 }), [L / 2 - 0.13, 0.065, 0.1], { cast: false });
    const blad = std('#7f9a7a', { roughness: 0.8 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; const bl = LK.mesh(p, new T.SphereGeometry(0.035, 8, 6), blad, [L / 2 - 0.13 + Math.cos(a) * 0.03, 0.14 + (i % 2) * 0.03, 0.1 + Math.sin(a) * 0.03], { cast: false }); bl.scale.set(0.6, 1.5, 0.6); bl.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
    const boot = new T.Group(); boot.position.set(x + 0.12, 0.02, 0.1); p.add(boot);
    const romp = new T.Shape(); romp.moveTo(-0.1, 0.04); romp.lineTo(0.1, 0.04); romp.lineTo(0.07, 0); romp.lineTo(-0.07, 0); romp.closePath();
    const rg = new T.ExtrudeGeometry(romp, { depth: 0.05, bevelEnabled: false }); rg.translate(0, 0, -0.025);
    LK.mesh(boot, rg, std('#8ea2b6', { roughness: 0.7 }), [0, 0, 0], { cast: false });
    const zeil = new T.Shape(); zeil.moveTo(0, 0); zeil.lineTo(0, 0.14); zeil.lineTo(0.08, 0.01); zeil.closePath();
    LK.mesh(boot, new T.ShapeGeometry(zeil), std('#efe6d4', { roughness: 0.9, side: T.DoubleSide }), [-0.01, 0.05, 0], { cast: false });
    return p;
  }

  function maakSchilderij() {
    const s = new T.Group();
    const lv = rechthoekPad(-0.36, -0.28, 0.36, 0.28); lv.holes.push(rechthoekPad(-0.3, -0.22, 0.3, 0.22, true));
    const lg = new T.ExtrudeGeometry(lv, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
    LK.mesh(s, lg, LK.mat.hout(K.houtLicht, { tex: { seed: 3 } }), [0, 0, 0.0], { cast: false });
    LK.mesh(s, new T.PlaneGeometry(0.61, 0.45), new T.MeshStandardMaterial({ map: tex.schilderij(), roughness: 0.9 }), [0, 0, 0.02], { cast: false });
    return s;
  }

  function maakVlaggetjes(punten, kleuren) {
    const g = new T.Group();
    const curve = new T.CatmullRomCurve3(punten.map((p) => new T.Vector3(p[0], p[1], p[2])));
    LK.mesh(g, new T.TubeGeometry(curve, 48, 0.007, 5, false), std('#8a7a68', { roughness: 0.9 }), null, { cast: false });
    const n = 15; const sh = new T.Shape(); sh.moveTo(-0.08, 0); sh.lineTo(0.08, 0); sh.lineTo(0, -0.17); sh.closePath();
    const im = new T.InstancedMesh(new T.ShapeGeometry(sh), std(0xffffff, { roughness: 0.9, side: T.DoubleSide }), n);
    const o = new T.Object3D();
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const p = curve.getPointAt(t); const d = curve.getTangentAt(t); o.position.copy(p); o.rotation.set(0, Math.atan2(-d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.6); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new T.Color(kleuren[i % kleuren.length])); }
    im.castShadow = false; im.receiveShadow = true; g.add(im);
    return g;
  }

  function maakBlokken(M, lijst) {
    const kl = ['#c6837a', '#d4b37c', '#8ea9b9', '#9fb59a', '#c9a8b8', '#e6dccb'];
    const im = new T.InstancedMesh(rb(1, 1, 1, 0.12), LK.mat.hout('#ffffff', { tex: { seed: 12 } }), lijst.length);
    const o = new T.Object3D();
    lijst.forEach((b, i) => { o.position.set(b[0], b[1] + b[3] / 2, b[2]); o.rotation.set(0, b[4] || 0, 0); o.scale.set(b[3], b[3], b[3]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new T.Color(kl[i % kl.length])); });
    im.castShadow = true; im.receiveShadow = true; return im;
  }

  // een groepje blokken met een eigen contactschaduw; y is de hoogte van de ondergrond (vloer of kleed)
  function blokjes(par, M, x, y, z, lijst) {
    const grp = new T.Group(); grp.position.set(x, y, z); par.add(grp);
    grp.add(maakBlokken(M, lijst));
    blob(grp, 0.0, 0.0, 0.85, 0.7, 0.45, 0.004);
    return grp;
  }

  function maakRingpiramide(M) {
    const r = new T.Group();
    LK.mesh(r, new T.CylinderGeometry(0.16, 0.17, 0.05, 24), M.houtLicht, [0, 0.025, 0]);
    LK.mesh(r, new T.CylinderGeometry(0.022, 0.022, 0.42, 10), M.houtLicht, [0, 0.25, 0], { cast: false });
    const kl = ['#c6837a', '#d4b37c', '#9fb59a', '#8ea9b9', '#b9a6c0'];
    for (let i = 0; i < 5; i++) { const rr = 0.13 - i * 0.02; LK.mesh(r, new T.TorusGeometry(rr, 0.035 - i * 0.002, 10, 24), std(kl[i], { roughness: 0.5 }), [0, 0.085 + i * 0.065, 0], { rot: [PI / 2, 0, 0], cast: i < 2 }); }
    LK.mesh(r, new T.SphereGeometry(0.045, 14, 10), std('#c6837a', { roughness: 0.5 }), [0, 0.47, 0], { cast: false });
    blob(r, 0, 0, 0.5, 0.5, 0.45);
    return r;
  }

  function maakKist(M) {
    // open speelgoedkrat met wat speelgoed erin
    const k = new T.Group(); const verf = std('#9fb3a6', { roughness: 0.7 });
    const bodem = rb(0.74, 0.04, 0.48, 0.01);
    LK.mesh(k, bodem, M.hout, [0, 0.02, 0]);
    for (const s of [-1, 1]) {
      LK.mesh(k, rb(0.76, 0.36, 0.05, 0.015), verf, [0, 0.2, s * 0.24]);
      LK.mesh(k, rb(0.05, 0.36, 0.5, 0.015), verf, [s * 0.36, 0.2, 0]);
      LK.mesh(k, rb(0.14, 0.05, 0.06, 0.02), std('#5b4c40', { roughness: 0.9 }), [s * 0.36 + s * 0.012, 0.3, 0], { rot: [0, PI / 2, 0], cast: false });
    }
    LK.mesh(k, rb(0.8, 0.04, 0.07, 0.015), M.hout, [0, 0.38, 0.24], { cast: false });
    LK.mesh(k, rb(0.8, 0.04, 0.07, 0.015), M.hout, [0, 0.38, -0.24], { cast: false });
    // speelgoed dat uit het krat piept: trommeltje, blokje en een stokje
    const trommel = new T.Group(); trommel.position.set(-0.16, 0.33, 0.02); trommel.rotation.set(0.35, 0, 0.25); k.add(trommel);
    LK.mesh(trommel, new T.CylinderGeometry(0.11, 0.11, 0.12, 22), std('#c6837a', { roughness: 0.6 }), [0, 0, 0], { cast: false });
    LK.mesh(trommel, new T.CylinderGeometry(0.108, 0.108, 0.125, 22, 1, true), std('#efe6d4', { roughness: 0.6, side: T.DoubleSide }), [0, 0, 0], { cast: false }).scale.set(1.01, 0.2, 1.01);
    LK.mesh(k, rb(0.13, 0.13, 0.13, 0.02), LK.mat.hout('#d4b37c', { tex: { seed: 12 } }), [0.14, 0.34, -0.06], { rot: [0.25, 0.5, 0.15], cast: false });
    LK.mesh(k, new T.CylinderGeometry(0.012, 0.012, 0.34, 6), M.houtLicht, [0.2, 0.42, 0.08], { rot: [0.5, 0, -0.55], cast: false });
    LK.mesh(k, new T.SphereGeometry(0.03, 10, 8), M.houtLicht, [0.29, 0.53, 0.16], { cast: false });
    blob(k, 0, 0, 1.15, 0.85, 0.5);
    return k;
  }

  function maakSloffen() {
    const s = new T.Group(); const m = std('#b9a6c0', { roughness: 0.95 });
    for (const [x, z, a] of [[-0.07, 0, 0.15], [0.08, 0.05, -0.1]]) {
      LK.mesh(s, rb(0.11, 0.035, 0.24, 0.017), m, [x, 0.0175, z], { rot: [0, a, 0], cast: false });
      const k = LK.mesh(s, new T.SphereGeometry(0.06, 12, 8, 0, PI * 2, 0, PI / 2), m, [x + Math.sin(a) * 0.06, 0.03, z + Math.cos(a) * 0.06], { cast: false }); k.scale.set(0.95, 0.7, 1.1);
    }
    blob(s, 0, 0, 0.45, 0.45, 0.35);
    return s;
  }

  // muizengaatje in de plint (zonder muis)
  function maakMuizengat() {
    const s = new T.Shape(); s.moveTo(-0.07, 0); s.lineTo(0.07, 0); s.lineTo(0.07, 0.05); s.absarc(0, 0.05, 0.07, 0, PI, false); s.closePath();
    const g = new T.Group();
    LK.mesh(g, new T.ShapeGeometry(s, 16), voor(std(0x1b1410, { roughness: 1 }), 3), [0, 0.004, 0], { cast: false, receive: false });
    return g;
  }

  function maakSchakelaar() {
    const s = new T.Group();
    LK.mesh(s, rb(0.11, 0.16, 0.04, 0.01), std('#f1ebdf', { roughness: 0.5 }), [0, 0, 0.02], { cast: false });
    LK.mesh(s, rb(0.035, 0.06, 0.03, 0.008), std('#d9cfbd', { roughness: 0.5 }), [0, 0.012, 0.045], { rot: [0.3, 0, 0], cast: false });
    return s;
  }

  // kapstok met een sjaal en een rugzakje (op de linkerwand)
  function maakKapstok(M) {
    const k = new T.Group();
    LK.mesh(k, rb(0.7, 0.08, 0.04, 0.015), M.hout, [0, 0, 0.02], { cast: false });
    for (const x of [-0.22, 0, 0.22]) { LK.mesh(k, new T.CylinderGeometry(0.014, 0.014, 0.09, 8), M.messing, [x, 0, 0.08], { rot: [PI / 2 - 0.3, 0, 0], cast: false }); LK.mesh(k, new T.SphereGeometry(0.022, 10, 8), M.messing, [x, 0.012, 0.125], { cast: false }); }
    // sjaal: een slappe strook die over de haak hangt
    const sj = std('#c6a197', { roughness: 0.95, side: T.DoubleSide });
    const sg = new T.PlaneGeometry(0.1, 0.62, 2, 12); const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = (y + 0.31) / 0.62; p.setZ(i, 0.11 - Math.pow(1 - t, 2) * 0.06 + Math.sin(t * 9) * 0.008); }
    sg.computeVertexNormals();
    LK.mesh(k, sg, sj, [-0.22, -0.3, 0], { cast: false });
    LK.mesh(k, new T.TorusGeometry(0.045, 0.02, 8, 16), sj, [-0.22, 0.0, 0.1], { rot: [0, PI / 2, 0], cast: false });
    // rugzakje
    const rz = new T.Group(); rz.position.set(0.15, -0.2, 0.1); rz.rotation.z = 0.08; k.add(rz);
    const stof = std('#8ea2b6', { roughness: 0.85 });
    LK.mesh(rz, rb(0.26, 0.3, 0.13, 0.06), stof, [0, 0, 0], { cast: false });
    LK.mesh(rz, rb(0.2, 0.13, 0.05, 0.04), std('#7d91a5', { roughness: 0.85 }), [0, -0.07, 0.075], { cast: false });
    LK.mesh(rz, rb(0.24, 0.06, 0.14, 0.03), std('#7d91a5', { roughness: 0.85 }), [0, 0.13, 0.01], { rot: [0.2, 0, 0], cast: false });
    LK.mesh(rz, new T.TorusGeometry(0.04, 0.008, 6, 14, PI), std('#5b4c40'), [0, 0.17, -0.02], { cast: false });
    return k;
  }

  function maakVensterbankDingen(M) {
    const v = new T.Group();
    LK.mesh(v, new T.CylinderGeometry(0.05, 0.04, 0.08, 14), std('#c98f72', { roughness: 0.85 }), [0, 0.04, 0], { cast: false });
    const cac = std('#7f9a7a', { roughness: 0.75 });
    const c1 = LK.mesh(v, new T.SphereGeometry(0.04, 12, 10), cac, [0, 0.14, 0], { cast: false }); c1.scale.set(1, 1.8, 1);
    const c2 = LK.mesh(v, new T.SphereGeometry(0.022, 10, 8), cac, [0.04, 0.15, 0], { cast: false }); c2.scale.set(1, 1.6, 1);
    LK.mesh(v, new T.SphereGeometry(0.012, 8, 6), std('#d2ada1'), [0, 0.215, 0], { cast: false });
    return v;
  }

  function vloerkleed(par, x, z, w, d) {
    const top = achter(new T.MeshStandardMaterial({ color: 0xffffff, map: tex.kleed(), roughness: 0.95 }), 2);
    const zij = std(P.kleedRand, { roughness: 0.95 });
    const m = LK.mesh(par, new T.BoxGeometry(w, 0.018, d), [zij, zij, top, zij, zij, zij], [x, 0.009, z], { cast: false });
    return m;
  }
  // ovaal kleed: een lage schijf met één rand (kleur en rand per taak)
  function ovaalkleed(par, x, z, rx, rz, kleur, rand) {
    const top = achter(new T.MeshStandardMaterial({ color: 0xffffff, map: tex.ovaal(kleur, rand, kleur + rand), roughness: 0.95 }), 2);
    const zij = std(rand, { roughness: 0.95 });
    const m = LK.mesh(par, new T.CylinderGeometry(1, 1, 0.018, 72), [zij, top, zij], [x, 0.009, z], { cast: false });
    m.scale.set(rx, 1, rz); return m;
  }

  // ───── het decor ─────
  const VLAG = ['#c6837a', '#d4b37c', '#9fb59a', '#8ea9b9', '#e6dccb'];
  const VLAGLIJN = [[-3.25, 2.56, 0.06], [-1.6, 2.38, 0.08], [0, 2.53, 0.06], [1.6, 2.38, 0.08], [3.42, 2.56, 0.06]];
  LK.decor.k = function (ctx) {
    const taak = ctx.taak || 'licht';
    const root = ctx.root;
    const g = new T.Group(); root.add(g);
    const vers = new T.Group(); root.add(vers); huidigeVers = vers; omhulsel = null;
    const M = maakMaterialen(taak);
    const kamer = bouwKamer(g, vers, M, taak);
    let scherm = kamer.achter;
    if (taak !== 'spiegel') gordijnen(vers, M);
    const zet = (o, x, y, z, ry) => { o.position.set(x, y, z); if (ry) o.rotation.y = ry; vers.add(o); return o; };
    zet(maakVensterbankDingen(M), -3.2, RAAM.y0 + 0.005, RAAM.z0 + 0.32);
    zet(maakSchakelaar(), -3.3, 1.2, 4.58, PI / 2);

    if (taak === 'spiegel') {
      // bovenaanzicht: alles langs de randen, het midden blijft vrij; een effen kleed met één rand (geen schietschijf)
      ovaalkleed(vers, 0.2, 1.95, 2.3, 1.38, '#7b8ea4', '#e3d6bd');
      zet(maakBed(M), -2.6, 0, 4.12, PI / 2);
      zet(maakNachtkastje(M), -3.0, 0, 3.12, PI / 2);
      zet(maakBoekenplank(M), 1.9, 1.3, 0.0);
      zet(maakSchilderij(), -1.9, 1.4, 0.0);
      zet(maakVlaggetjes(VLAGLIJN, VLAG), 0, 0, 0);
      zet(maakRingpiramide(M), 3.22, 0, 0.42);
      zet(maakKist(M), 2.4, 0, 4.2, -0.15);
      blokjes(vers, M, 1.0, 0, 4.05, [[-0.05, 0, -0.1, 0.16, 0.2], [0.18, 0, 0, 0.16, -0.3], [0.05, 0.16, -0.05, 0.16, 0.6], [-0.4, 0, 0.2, 0.14, 0.9]]);
    } else {
      // schuin aanzicht: bedhoek rechts achteraan, speelhoek links vooraan
      if (taak === 'schaduw') {
        scherm = laken(g, M);
        // speelhoek op een klein kleed: de kist staat erop, de blokjes ernaast met een eigen contactschaduw
        const kh = 0.018;
        ovaalkleed(vers, -2.35, 3.95, 0.95, 0.72, '#8796a8', '#ddd0b6');
        zet(maakKist(M), -2.75, kh, 4.15, 0.45);
        blokjes(vers, M, -1.98, kh, 4.25, [[0.03, 0, 0, 0.17, 0.3], [-0.17, 0, 0.11, 0.17, -0.2], [-0.07, 0.17, 0.05, 0.17, 0.7], [0.23, 0, -0.27, 0.15, 0.5]]);
        zet(maakSloffen(), 2.12, 0, 1.3, 0.3);
        zet(maakRingpiramide(M), -2.88, 0, 2.95);
      } else {
        // 'licht': rustig kleed onder de rij; geen los speelgoed in de buurt van de rij
        vloerkleed(vers, 0, 2.25, 5.9, 1.95);
        zet(maakVlaggetjes(VLAGLIJN, VLAG), 0, 0, 0);
        zet(maakKist(M), -2.75, 0, 4.15, 0.45);
        zet(maakRingpiramide(M), -2.95, 0, 0.5);
        omhulsel = maakOmhulsel(g);
      }
      zet(maakBed(M), 2.86, 0, 0.74);
      zet(maakNachtkastje(M), 1.98, 0, 0.29);
      zet(maakBoekenplank(M), 2.86, 1.62, 0.0);
      // schilderijtje voor het gordijn (het linkse gordijn begint pas op z = 1,09)
      zet(maakSchilderij(), -3.3, 1.72, 0.46, PI / 2);
      zet(maakKapstok(M), -3.3, 1.62, 4.08, PI / 2);
      zet(maakMuizengat(), -3.248, 0, 2.3, PI / 2);
    }
    return { scherm, versiering: vers };
  };

  // onzichtbare rest van de kamer (voorwand, rechterwand, plafond): alleen zichtbaar in de weerspiegelingen
  let omhulsel = null;
  function maakOmhulsel(g) {
    const niets = new T.MeshBasicMaterial({ visible: false });
    const wand = std('#d8cdb8', { roughness: 0.95, side: T.BackSide }); const plafond = std('#ebe3d2', { roughness: 0.95, side: T.BackSide });
    const m = new T.Mesh(new T.BoxGeometry(8.6, 2.9, 6.8), [wand, niets, plafond, niets, wand, niets]);
    m.position.set(-3.3 + 4.3, 1.45, 3.4); m.visible = false; m.castShadow = false; m.receiveShadow = false; g.add(m);
    return m;
  }

  // wit laken tegen de achterwand, aan een stok met wasknijpers (de schaduwopdracht)
  function laken(g, M) {
    const B = 3.96, Hl = 2.42, y0 = 0.04;
    const geo = new T.PlaneGeometry(B, Hl, 48, 16); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const rand = Math.max(0, (Math.abs(x) - 1.86) / 0.12); const top = Math.max(0, (y - (Hl / 2 - 0.1)) / 0.1); p.setZ(i, rand * rand * 0.03 * (0.6 + 0.4 * Math.sin(y * 7)) + top * 0.012 * (1 - Math.cos(x * 9.5))); }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: P.schermLaken, map: tex.laken(), roughness: 0.95 })); // gebroken wit
    m.position.set(0, y0 + Hl / 2, 0.02); m.receiveShadow = true; m.castShadow = false; m.userData.scherm = true; g.add(m);
    const yr = y0 + Hl + 0.03;
    LK.mesh(g, new T.CylinderGeometry(0.024, 0.024, B + 0.36, 12), M.houtLicht, [0, yr, 0.06], { rot: [0, 0, PI / 2], cast: false });
    for (const s of [-1, 1]) {
      LK.mesh(g, new T.SphereGeometry(0.04, 12, 10), M.houtLicht, [s * (B / 2 + 0.2), yr, 0.06], { cast: false });
      LK.mesh(g, rb(0.05, 0.1, 0.08, 0.012), M.messing, [s * (B / 2 + 0.08), yr - 0.02, 0.03], { cast: false });
    }
    const kn = new T.InstancedMesh(rb(1, 1, 1, 0.2), std('#d8b88a', { roughness: 0.7 }), 7); const o = new T.Object3D();
    for (let i = 0; i < 7; i++) { o.position.set(-B / 2 + 0.1 + (i * (B - 0.2)) / 6, yr - 0.04, 0.06); o.scale.set(0.035, 0.11, 0.035); o.rotation.set(0, 0, (i % 2 ? 1 : -1) * 0.05); o.updateMatrix(); kn.setMatrixAt(i, o.matrix); }
    kn.castShadow = false; g.add(kn);
    return m;
  }

  // ───────────────────────── props ─────────────────────────
  function grijsPeer() { return std(0x8d929c, { roughness: 0.3, metalness: 0.1 }); }
  // contactschaduw van een prop: net boven een kleed (kleden zijn 0,018 dik), zodat ze ook op het kleed zichtbaar is
  const BLOB_Y = 0.021;

  // lichtbronnen die nu branden (voor de glansstreep van de spiegel en de lichtpuntjes op de bal)
  const BRONNEN = new Set();
  function zetBron(l, aan) { if (aan) BRONNEN.add(l); else BRONNEN.delete(l); }
  function inScene(o) { while (o.parent) o = o.parent; return !!o.isScene; }
  const _b = new T.Vector3(), _n = new T.Vector3(), _q = new T.Quaternion();
  const _l = new T.Vector3(), _d = new T.Vector3(), _t = new T.Vector3();
  // hoeveel licht valt er op de voorkant van een vlak (positie p, normaal n in wereldcoördinaten)? 0 = niets
  function lichtOp(p, n) {
    let s = 0;
    for (const l of BRONNEN) {
      if (!inScene(l)) { BRONNEN.delete(l); continue; }
      l.getWorldPosition(_l); _d.subVectors(_l, p); const r = _d.length(); _d.normalize();
      let f = Math.max(0, _d.dot(n));
      if (l.isSpotLight) { l.target.getWorldPosition(_t); _t.sub(_l).normalize(); _d.negate(); if (_t.dot(_d) < Math.cos(l.angle)) f = 0; }
      s += l.intensity * Math.sqrt(f) / (1 + 0.35 * r * r);
    }
    return s;
  }

  // tafellampje (~0,9 hoog), oorsprong aan de voet
  LK.props.lampje = function () {
    const g = new T.Group();
    const hout = LK.mat.hout(K.houtLicht, { tex: { seed: 15 } });
    const messing = std(0xc9a35a, { metalness: 0.75, roughness: 0.32, envMap: LK.env, envMapIntensity: 0.12 });
    LK.mesh(g, new T.CylinderGeometry(0.14, 0.17, 0.06, 32), hout, [0, 0.03, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.08, 0.1, 0.03, 24), hout, [0, 0.075, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.018, 0.018, 0.56, 12), messing, [0, 0.36, 0]);
    LK.mesh(g, new T.CylinderGeometry(0.032, 0.032, 0.06, 16), std(0x3a3430, { roughness: 0.5 }), [0, 0.64, 0], { cast: false });
    const uitMat = grijsPeer(); const aanMat = LK.mat.gloei(0xfff1c4);
    const peer = LK.mesh(g, new T.SphereGeometry(0.06, 20, 16), uitMat, [0, 0.705, 0], { cast: false, receive: false });
    peer.scale.set(1, 1.15, 1);
    const kapMat = new T.MeshStandardMaterial({ color: 0xffffff, map: tex.kap(), roughness: 0.9, side: T.DoubleSide, emissive: 0x000000, emissiveMap: tex.kap() });
    LK.mesh(g, new T.CylinderGeometry(0.135, 0.25, 0.3, 40, 1, true), kapMat, [0, 0.72, 0], { cast: false });
    const bies = std('#b07f7b', { roughness: 0.8 });
    LK.mesh(g, new T.TorusGeometry(0.25, 0.008, 6, 40), bies, [0, 0.572, 0], { rot: [PI / 2, 0, 0], cast: false });
    LK.mesh(g, new T.TorusGeometry(0.135, 0.007, 6, 32), bies, [0, 0.868, 0], { rot: [PI / 2, 0, 0], cast: false });
    // trekkoordje met een houten kraal
    LK.mesh(g, new T.CylinderGeometry(0.003, 0.003, 0.16, 4), messing, [0.09, 0.52, 0.05], { cast: false });
    LK.mesh(g, new T.SphereGeometry(0.016, 10, 8), hout, [0.09, 0.44, 0.05], { cast: false });
    const licht = new T.PointLight(0xffd58a, 0, 7, 1.2); licht.position.set(0, 0.705, 0);
    licht.castShadow = true; licht.shadow.mapSize.set(512, 512); licht.shadow.camera.near = 0.12; licht.shadow.camera.far = 8; licht.shadow.bias = -0.002; licht.shadow.normalBias = 0.025; licht.shadow.radius = 3;
    g.add(licht);
    blob(g, 0, 0, 0.55, 0.55, 0.45, BLOB_Y);
    g.userData = {
      licht, peer, aan: false,
      zet(aan) { this.aan = !!aan; licht.intensity = aan ? 1.4 : 0; peer.material = aan ? aanMat : uitMat; kapMat.emissive.set(aan ? 0xb07a3a : 0x000000); kapMat.emissiveIntensity = aan ? 0.9 : 0; zetBron(licht, this.aan); versie++; },
    };
    g.userData.zet(false);
    return g;
  };

  // kaars op een schoteltje (~0,5 hoog)
  LK.props.kaars = function () {
    const g = new T.Group();
    const email = std('#7f98b3', { roughness: 0.35, envMap: LK.env, envMapIntensity: 0.08, side: T.DoubleSide });
    const schotel = [[0, 0], [0.12, 0], [0.15, 0.008], [0.172, 0.034], [0.168, 0.042], [0.145, 0.022], [0.06, 0.02], [0, 0.02]].map((q) => new T.Vector2(q[0], q[1]));
    LK.mesh(g, new T.LatheGeometry(schotel, 40), email, [0, 0, 0], { cast: false, receive: false });
    LK.mesh(g, new T.TorusGeometry(0.17, 0.006, 6, 40), std('#efe6d4', { roughness: 0.4 }), [0, 0.04, 0], { rot: [PI / 2, 0, 0], cast: false });
    LK.mesh(g, new T.TorusGeometry(0.04, 0.012, 8, 18, PI * 1.3), email, [0.2, 0.03, 0], { rot: [PI / 2, 0, -PI * 0.65], cast: false });
    const was = std('#f3ead6', { roughness: 0.55, emissive: 0x000000, side: T.DoubleSide });
    const kp = [[0, 0.02], [0.056, 0.02], [0.056, 0.3], [0.052, 0.316], [0.04, 0.312], [0.02, 0.306], [0, 0.305]].map((q) => new T.Vector2(q[0], q[1]));
    LK.mesh(g, new T.LatheGeometry(kp, 32), was, [0, 0, 0], { cast: false });
    const druppel = LK.mesh(g, new T.SphereGeometry(0.014, 10, 8), was, [0.05, 0.27, 0.025], { cast: false }); druppel.scale.set(1, 3, 1);
    LK.mesh(g, new T.CylinderGeometry(0.004, 0.005, 0.04, 6), std(0x2a2420, { roughness: 0.9 }), [0, 0.324, 0], { cast: false });
    // vlam: zachte buitenkant en een felle kern
    const vp = []; for (let i = 0; i <= 12; i++) { const t = i / 12; vp.push(new T.Vector2(Math.max(0.0005, 0.034 * Math.pow(Math.sin(PI * Math.min(1, t * 1.15)), 0.75) * (1 - 0.55 * t)), t * 0.14)); }
    const vlam = new T.Group(); vlam.position.set(0, 0.33, 0); g.add(vlam);
    const buiten = new T.Mesh(new T.LatheGeometry(vp, 20), new T.MeshBasicMaterial({ color: 0xff9a36, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false })); buiten.renderOrder = 3; vlam.add(buiten);
    const kern = new T.Mesh(new T.LatheGeometry(vp, 16), LK.mat.gloei(0xfff3c8)); kern.scale.set(0.55, 0.6, 0.55); kern.position.y = 0.006; vlam.add(kern);
    const licht = new T.PointLight(0xffa64d, 0, 4, 1.4); licht.position.set(0, 0.42, 0); g.add(licht);
    blob(g, 0, 0, 0.5, 0.5, 0.4, BLOB_Y);
    g.userData = {
      licht, vlam, aan: false,
      zet(aan) { this.aan = !!aan; vlam.visible = !!aan; licht.intensity = aan ? 0.9 : 0; was.emissive.set(aan ? 0x5a3412 : 0x000000); zetBron(licht, this.aan); versie++; },
    };
    g.userData.zet(false);
    return g;
  };

  // kleine zaklamp die plat op de vloer ligt en naar −x schijnt (~0,4 lang). Het licht volgt de as van het lijf
  // (−x, iets omlaag), zodat de lichtvlek recht voor de lens op de vloer valt: de lamp wijst zichtbaar waar haar licht heen gaat.
  LK.props.zaklampKlein = function () {
    const g = new T.Group(); const y = 0.085;
    const lijf = std('#2f62d8', { roughness: 0.35, envMap: LK.env, envMapIntensity: 0.06 });
    const rubber = std(0x2b2d33, { roughness: 0.85 });
    const chroom = std(0xd5dbe2, { metalness: 0.9, roughness: 0.25, envMap: LK.env, envMapIntensity: 0.12 });
    LK.mesh(g, new T.CylinderGeometry(0.058, 0.058, 0.24, 28), lijf, [0.04, y, 0], { rot: [0, 0, PI / 2], cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.085, 0.06, 0.1, 32), lijf, [-0.13, y, 0], { rot: [0, 0, PI / 2], cast: false });
    LK.mesh(g, new T.TorusGeometry(0.08, 0.012, 10, 32), chroom, [-0.18, y, 0], { rot: [0, PI / 2, 0], cast: false });
    for (let i = 0; i < 3; i++) LK.mesh(g, new T.TorusGeometry(0.059, 0.008, 6, 24), rubber, [0.05 + i * 0.035, y, 0], { rot: [0, PI / 2, 0], cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.06, 0.06, 0.03, 24), rubber, [0.175, y, 0], { rot: [0, 0, PI / 2], cast: false });
    LK.mesh(g, new T.TorusGeometry(0.025, 0.006, 6, 14), rubber, [0.205, y, 0], { rot: [0, 0, 0], cast: false });
    // rubberen steuntje onder de staart: de lamp ligt waterpas en stabiel
    LK.mesh(g, rb(0.06, 0.03, 0.07, 0.01), rubber, [0.15, 0.015, 0], { cast: false });
    LK.mesh(g, rb(0.06, 0.03, 0.036, 0.01), std('#e76f51', { roughness: 0.45 }), [-0.01, y + 0.06, 0], { cast: false });
    const uitMat = voor(std(0x8a97a8, { roughness: 0.15, metalness: 0.3, envMap: LK.env, envMapIntensity: 0.1 }), 3); const aanMat = voor(LK.mat.gloei(0xfff4d6), 3);
    const lens = LK.mesh(g, new T.CircleGeometry(0.07, 32), uitMat, [-0.182, y, 0], { rot: [0, -PI / 2, 0], cast: false, receive: false });
    // de richting van het licht: langs de as van het lijf, 8 graden omlaag
    const neer = Math.tan(8 * PI / 180);
    const sp = new T.SpotLight(0xfff1c9, 0, 2.6, 0.42, 0.45, 1.6); sp.position.set(-0.2, y, 0); // bereik stopt voor de wand: geen lichtvlek onder het raam
    sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.camera.near = 0.05; sp.shadow.camera.far = 9; sp.shadow.bias = -0.0008; sp.shadow.normalBias = 0.02;
    const doel = new T.Object3D(); doel.position.set(-0.2 - 3, y - 3 * neer, 0); g.add(doel); sp.target = doel; g.add(sp);
    const bundel = LK.bundel({ lengte: 0.75, hoek: 0.4, sterkte: 0.3, kleur: 0xfff1c9 });
    bundel.raycast = () => {}; // onzichtbare bundel mag geen tik opvangen
    bundel.position.set(-0.19, y, 0); bundel.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(-1, -neer, 0).normalize()); bundel.visible = false; g.add(bundel);
    blob(g, -0.02, 0, 0.5, 0.26, 0.45, BLOB_Y);
    g.userData = {
      sp, lens, bundel, aan: false,
      zet(aan) { this.aan = !!aan; sp.intensity = aan ? 2.3 : 0; lens.material = aan ? aanMat : uitMat; bundel.visible = !!aan; zetBron(sp, this.aan); versie++; },
    };
    g.userData.zet(false);
    return g;
  };

  // uv van een vlakke vorm (ShapeGeometry) omzetten naar 0..1 over het omhullende kader
  function vormUV(geo, rx, ry) { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / rx + 1) / 2, (p.getY(i) / ry + 1) / 2); uv.needsUpdate = true; return geo; }
  // glansstreep: twee schuine lichtstrepen die alleen verschijnen als er licht op het glas valt
  function streepTex() {
    return doek('k-streep', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(-PI / 4);
      for (const [x, b, a] of [[-26, 16, 0.85], [-2, 6, 0.6], [30, 4, 0.25]]) {
        const gr = g.createLinearGradient(x - b, 0, x + b, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x - b, -h, 2 * b, 2 * h);
      }
      g.restore();
    });
  }
  function glansStreep(par, geo, pos, n0, sterkte) {
    const mat = new T.MeshBasicMaterial({ map: streepTex(), color: 0xfff6e0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    const m = new T.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]); m.renderOrder = 4; m.castShadow = false; m.receiveShadow = false; m.raycast = () => {};
    m.onBeforeRender = () => { if (KUBUS.bezig) { mat.opacity = 0; return; } m.getWorldPosition(_b); m.getWorldQuaternion(_q); _n.copy(n0).applyQuaternion(_q); mat.opacity = Math.min(0.9, lichtOp(_b, _n) * sterkte); };
    par.add(m); return m;
  }
  // echte weerspiegeling in een vlak (THREE.Reflector), met juiste kleurcodering in beide renderpaden
  const SPIEGEL_SHADER = {
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; void main(){ vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; void main(){ vec4 b = sRGBToLinear(texture2DProj(tDiffuse, vUv)); gl_FragColor = linearToOutputTexel(vec4(b.rgb * color, 1.0)); }',
  };
  function reflector(geo, kleur, res) {
    if (!T.Reflector) return null;
    try {
      const r = new T.Reflector(geo, { clipBias: 0.003, textureWidth: res || 256, textureHeight: res || 256, color: kleur, shader: SPIEGEL_SHADER });
      r.castShadow = false; r.receiveShadow = false;
      r.material.addEventListener('dispose', () => r.getRenderTarget().dispose());
      // tijdens de weerspiegeling is de rest van de kamer (voorwand, rechterwand, plafond) zichtbaar; geen geneste opnames
      const eigen = r.onBeforeRender;
      r.onBeforeRender = function (renderer, scene, camera) {
        if (KUBUS.bezig) return;
        const omh = omhulsel && omhulsel.parent ? omhulsel : null;
        KUBUS.bezig = true; if (omh) omh.visible = true;
        try { eigen.call(this, renderer, scene, camera); } finally { if (omh) omh.visible = false; KUBUS.bezig = false; }
      };
      return r;
    } catch (e) { return null; }
  }

  // staande spiegel in een houten lijst (~0,65 hoog), licht naar links gedraaid; geeft zelf geen licht
  LK.props.spiegelKlein = function () {
    const g = new T.Group(); const sp = new T.Group(); sp.rotation.y = -0.35; g.add(sp);
    const hout = LK.mat.hout('#cf9a5e', { tex: { seed: 9 } });
    const rx = 0.19, ry = 0.25, yc = 0.37;
    const ov = new T.Shape(); ov.absellipse(0, 0, rx + 0.04, ry + 0.04, 0, PI * 2, false); const gat = new T.Path(); gat.absellipse(0, 0, rx, ry, 0, PI * 2, true); ov.holes.push(gat);
    const lg = new T.ExtrudeGeometry(ov, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 40 }); lg.translate(0, 0, -0.0175);
    LK.mesh(sp, lg, hout, [0, yc, 0]);
    const glasVorm = new T.Shape(); glasVorm.absellipse(0, 0, rx + 0.002, ry + 0.002, 0, PI * 2, false);
    const glasGeo = vormUV(new T.ShapeGeometry(glasVorm, 40), rx, ry);
    // het glas: een echte weerspiegeling als THREE.Reflector bestaat, anders een omgevingsweerspiegeling die met het licht meegaat
    const refl = reflector(glasGeo, 0xdfe6ee, 256);
    if (refl) { refl.position.set(0, yc, 0.004); sp.add(refl); }
    else {
      const spiegelMat = new T.MeshStandardMaterial({ color: 0xe6ecf3, metalness: 1, roughness: 0.04, envMap: LK.env, envMapIntensity: 0.35 });
      const glas = LK.mesh(sp, glasGeo, spiegelMat, [0, yc, 0.004], { cast: false, receive: false });
      weerspiegel(g, [glas], glas, 128);
    }
    glansStreep(sp, glasGeo, [0, yc, 0.007], new T.Vector3(0, 0, 1), 1.1);
    LK.mesh(sp, new T.ShapeGeometry(glasVorm, 40), hout, [0, yc, -0.008], { rot: [0, PI, 0], cast: false });
    for (const s of [-1, 1]) {
      LK.mesh(sp, rb(0.035, 0.42, 0.035, 0.01), hout, [s * (rx + 0.065), 0.21, 0]);
      LK.mesh(sp, new T.SphereGeometry(0.024, 12, 10), std(0xc9a35a, { metalness: 0.7, roughness: 0.3, envMap: LK.env, envMapIntensity: 0.3 }), [s * (rx + 0.045), yc, 0], { cast: false });
      LK.mesh(sp, rb(0.07, 0.035, 0.22, 0.012), hout, [s * (rx + 0.065), 0.0175, 0], { cast: false });
    }
    LK.mesh(sp, rb(2 * rx + 0.13, 0.03, 0.03, 0.01), hout, [0, 0.07, 0], { cast: false });
    blob(g, 0, 0, 0.75, 0.4, 0.4, BLOB_Y);
    return g;
  };

  // glimmende kerstbal in zilver op een houten ringetje (~0,42 hoog): spiegelt de kamer, met scherpe lichtpuntjes van de lampen
  LK.props.bal = function () {
    const g = new T.Group();
    LK.mesh(g, new T.TorusGeometry(0.08, 0.022, 10, 28), LK.mat.hout(K.houtLicht, { tex: { seed: 15 } }), [0, 0.022, 0], { rot: [PI / 2, 0, 0], cast: false });
    const balMat = new T.MeshStandardMaterial({ color: 0xe9edf2, metalness: 1, roughness: 0.06, envMap: LK.env, envMapIntensity: 0.25 });
    const bal = LK.mesh(g, new T.SphereGeometry(0.165, 48, 32), balMat, [0, 0.2, 0], { cast: true });
    const goud = new T.MeshStandardMaterial({ color: 0xe0b45e, metalness: 1, roughness: 0.22, envMap: LK.env, envMapIntensity: 0.25 });
    const band = LK.mesh(g, new T.TorusGeometry(0.165, 0.009, 8, 48), goud, [0, 0.2, 0], { rot: [PI / 2, 0, 0], cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.034, 0.04, 0.045, 20), goud, [0, 0.37, 0], { cast: false });
    LK.mesh(g, new T.TorusGeometry(0.02, 0.005, 8, 16), goud, [0, 0.405, 0], { cast: false });
    blob(g, 0, 0, 0.42, 0.42, 0.45, BLOB_Y);
    // de weerspiegeling volgt het licht in de kamer: donker als er niets brandt, glimmend als de lampen aan zijn
    if (weerspiegel(g, [bal, band], bal, 128)) { balMat.envMapIntensity = 1; goud.envMapIntensity = 0.8; }
    return g;
  };

  // speelgoedkast als blokkade (0,9 × 0,9 × 0,7), oorsprong aan de voet, vakjes naar +z; licht geverfd, zodat ze afsteekt tegen de vloer
  LK.props.kast = function () {
    const g = new T.Group();
    const verf = std('#d6e6dc', { roughness: 0.6 }); const rand = LK.mat.hout(K.houtLicht, { tex: { seed: 27 } });
    for (const s of [-1, 1]) LK.mesh(g, rb(0.05, 0.86, 0.7, 0.015), verf, [s * 0.425, 0.45, 0]);
    LK.mesh(g, rb(0.92, 0.05, 0.72, 0.018), rand, [0, 0.875, 0]);
    LK.mesh(g, rb(0.82, 0.05, 0.66, 0.012), verf, [0, 0.045, 0]);
    LK.mesh(g, rb(0.82, 0.04, 0.64, 0.01), verf, [0, 0.46, 0]);
    LK.mesh(g, rb(0.04, 0.8, 0.64, 0.01), verf, [0, 0.46, 0]);
    LK.mesh(g, rb(0.82, 0.82, 0.03, 0.008), std('#e9e2d2', { roughness: 0.85 }), [0, 0.45, -0.33]);
    LK.mesh(g, rb(0.86, 0.04, 0.04, 0.012), rand, [0, 0.02, 0.33], { cast: false });
    // stoffen bakjes in de vakjes
    const kl = ['#e3b25c', '#d9796a', '#7fa6d4', '#8fbf86'];
    const bak = new T.InstancedMesh(rb(1, 1, 1, 0.06), std(0xffffff, { roughness: 0.95 }), 4); const greep = new T.InstancedMesh(rb(1, 1, 1, 0.3), voor(std(0x4a3d33, { roughness: 0.9 }), 3), 4); const o = new T.Object3D();
    [[-0.2, 0.07], [0.2, 0.07], [-0.2, 0.485], [0.2, 0.485]].forEach(([x, y], i) => {
      o.position.set(x, y + 0.15, 0.06); o.rotation.set(0, (i % 2 ? -1 : 1) * 0.04, 0); o.scale.set(0.34, 0.3, 0.52); o.updateMatrix(); bak.setMatrixAt(i, o.matrix); bak.setColorAt(i, new T.Color(kl[i]));
      o.position.set(x, y + 0.24, 0.327); o.rotation.set(0, 0, 0); o.scale.set(0.1, 0.035, 0.02); o.updateMatrix(); greep.setMatrixAt(i, o.matrix);
    });
    bak.castShadow = true; bak.receiveShadow = true; g.add(bak); greep.castShadow = false; g.add(greep);
    // bovenop: twee prentenboeken en een houten eendje
    LK.mesh(g, rb(0.3, 0.035, 0.24, 0.008), std('#8a6f9e', { roughness: 0.8 }), [-0.2, 0.918, 0.02], { rot: [0, 0.25, 0] });
    LK.mesh(g, rb(0.27, 0.03, 0.21, 0.008), std('#c6837a', { roughness: 0.8 }), [-0.19, 0.95, 0.03], { rot: [0, -0.1, 0] });
    const eend = new T.Group(); eend.position.set(0.22, 0.9, 0.05); eend.rotation.y = -0.6; g.add(eend);
    const geel = std('#e2b85e', { roughness: 0.55 });
    const lijf = LK.mesh(eend, new T.SphereGeometry(0.075, 16, 12), geel, [0, 0.06, 0], { cast: false }); lijf.scale.set(1.3, 0.85, 1);
    LK.mesh(eend, new T.SphereGeometry(0.045, 14, 10), geel, [0.07, 0.13, 0], { cast: false });
    LK.mesh(eend, new T.ConeGeometry(0.018, 0.05, 10), std('#c9774f', { roughness: 0.5 }), [0.125, 0.125, 0], { rot: [0, 0, -PI / 2], cast: false });
    blob(g, 0, 0, 1.25, 1.05, 0.55, BLOB_Y);
    g.castShadow = true;
    return g;
  };

  // spiegel op een draaivoet; oorsprong in het midden van het spiegelvlak (0,35 boven de vloer); voet effen
  LK.props.spiegelDraai = function () {
    const g = new T.Group();
    const verf = std('#c8402f', { roughness: 0.4, envMap: LK.env, envMapIntensity: 0.25 });
    const glasMat = new T.MeshStandardMaterial({ color: 0xe3eaf2, metalness: 1, roughness: 0.05, envMap: LK.env, envMapIntensity: 0.75, side: T.DoubleSide });
    LK.mesh(g, new T.PlaneGeometry(0.54, 0.52), glasMat, [0, 0, 0], { cast: false, receive: false });
    const lv = rechthoekPad(-0.33, -0.32, 0.33, 0.32); lv.holes.push(rechthoekPad(-0.27, -0.26, 0.27, 0.26, true));
    const lg = new T.ExtrudeGeometry(lv, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }); lg.translate(0, 0, -0.025);
    LK.mesh(g, lg, verf, [0, 0, 0]);
    LK.mesh(g, new T.SphereGeometry(0.035, 14, 10), verf, [0, 0.355, 0], { cast: false });
    const messing = std(0xc9a35a, { metalness: 0.8, roughness: 0.3, envMap: LK.env, envMapIntensity: 0.4 });
    for (const s of [-1, 1]) {
      LK.mesh(g, new T.CylinderGeometry(0.02, 0.024, 0.3, 12), LK.mat.hout(K.houtLicht, { tex: { seed: 15 } }), [s * 0.365, -0.17, 0]);
      LK.mesh(g, new T.SphereGeometry(0.03, 12, 10), messing, [s * 0.36, 0, 0], { cast: false });
    }
    // effen draaischijf
    LK.mesh(g, new T.CylinderGeometry(0.34, 0.37, 0.035, 48), LK.mat.hout(K.houtLicht, { tex: { seed: 8 } }), [0, -0.3325, 0], { cast: false });
    LK.mesh(g, new T.CylinderGeometry(0.3, 0.31, 0.03, 48), voor(std('#c23b2e', { roughness: 0.5 }), 2), [0, -0.3, 0], { cast: false });
    blob(g, 0, 0, 0.95, 0.95, 0.5, -0.35 + BLOB_Y);
    return g;
  };

  // knuffelbeer (~0,75 hoog) in honingkleur met een rode sjaal, oorsprong aan de voeten, kijkt naar +z;
  // gloeit warm op als het licht op hem valt
  LK.props.beer = function () {
    const g = new T.Group(); const vt = tex.vacht(); vt.repeat.set(3, 3);
    const vacht = new T.MeshStandardMaterial({ color: '#e3a253', map: vt, roughness: 1, emissive: 0x000000 });
    const licht = new T.MeshStandardMaterial({ color: '#f7e2bd', map: vt, roughness: 1, emissive: 0x000000 });
    const oog = std(0x15100c, { roughness: 0.15, envMap: LK.env, envMapIntensity: 0.8 });
    const neus = std(0x3b261a, { roughness: 0.35, envMap: LK.env, envMapIntensity: 0.4 });
    const bol = (mat, r, x, y, z, sx, sy, sz, cast) => { const m = LK.mesh(g, new T.SphereGeometry(r, 24, 18), mat, [x, y, z], { cast: cast !== false }); m.scale.set(sx || 1, sy || 1, sz || 1); return m; };
    bol(vacht, 0.2, 0, 0.25, 0, 1.08, 1.2, 0.95);
    bol(licht, 0.125, 0, 0.235, 0.138, 1, 1.15, 0.5, false);
    bol(vacht, 0.17, 0, 0.56, 0.01, 1.05, 0.95, 0.95);
    for (const s of [-1, 1]) {
      bol(vacht, 0.065, s * 0.125, 0.69, -0.01, 1, 1, 0.6);
      bol(licht, 0.04, s * 0.125, 0.69, 0.02, 1, 1, 0.4, false);
      const arm = bol(vacht, 0.07, s * 0.2, 0.3, 0.05, 0.9, 1.7, 0.9); arm.rotation.z = s * 0.45; arm.rotation.x = -0.35;
      bol(vacht, 0.08, s * 0.11, 0.08, 0.13, 1, 0.95, 1.55);
      bol(licht, 0.05, s * 0.11, 0.085, 0.25, 1, 1.05, 0.35, false);
      bol(oog, 0.021, s * 0.062, 0.6, 0.145, 1, 1, 0.7, false);
    }
    bol(licht, 0.075, 0, 0.525, 0.13, 1, 0.78, 0.8, false);
    bol(neus, 0.026, 0, 0.55, 0.2, 1.3, 0.85, 0.8, false);
    LK.mesh(g, new T.CylinderGeometry(0.004, 0.004, 0.04, 6), neus, [0, 0.51, 0.198], { cast: false });
    // rode sjaal
    const sjaal = std('#d23a2e', { roughness: 0.8 });
    const s1 = LK.mesh(g, new T.TorusGeometry(0.12, 0.032, 10, 28), sjaal, [0, 0.42, 0.01], { rot: [PI / 2 - 0.12, 0, 0], cast: false }); s1.scale.set(1, 0.95, 1);
    LK.mesh(g, rb(0.06, 0.15, 0.025, 0.01), sjaal, [0.07, 0.34, 0.135], { rot: [0.2, 0, 0.25], cast: false });
    blob(g, 0, 0.06, 0.75, 0.7, 0.55, BLOB_Y);
    g.userData = {
      aan: false,
      verlicht(aan) { this.aan = !!aan; vacht.emissive.set(aan ? 0x5a3a12 : 0x000000); licht.emissive.set(aan ? 0x6a4a22 : 0x000000); },
    };
    return g;
  };
})();
