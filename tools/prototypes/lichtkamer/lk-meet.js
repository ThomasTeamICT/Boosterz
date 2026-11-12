// Meetstand van de Lichtkamer-proefpagina (LK-3). Doet niets zonder `?meet` in het adres.
//
// Meet, in drie standen (digibord, gewoon, licht):
//   - de tijd tot het eerste beeld: van het openen van de pagina tot het eerste
//     beeld van de kijkdoos met een voorwerp erin (gl.finish, dan het volgende beeld);
//   - de frametijden (p95) terwijl de zaklamp 4 seconden heen en weer schuift
//     in de oefening 'Onderzoek: lamp dichterbij' van het 4de leerjaar, met dezelfde
//     aanroep als slepen met de vinger of muis (pick.drag).
// Alles staat op het scherm, in grote knoppen en één blok tekst dat je kunt
// aflezen en overschrijven of kopiëren. Er gaat niets over het netwerk en er
// worden geen namen bewaard; alleen de uitslagen blijven in sessionStorage
// zodat ze de herlaadbeurt tussen de standen overleven.
//
// Bewust zonder ?? of ?. en zonder pijlfuncties met bijzonderheden: ook oude
// Chromebooks moeten dit kunnen lezen.
(function () {
  'use strict';

  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  if (!params.has('meet')) return;

  var OPSLAG = 'lichtkamer-proef.meet.v1';
  var DREMPEL_P95 = 50;      // ms, uit het ontwerp (LICHTKAMER-APP.md, 'Go of no-go bij het bezoek')
  var DREMPEL_EERSTE = 5000; // ms
  var OPWARMEN = 600;        // ms voor de meting, niet meegeteld
  var DUUR = Number(params.get('duur')) > 0 ? Math.min(Number(params.get('duur')), 20000) : 4000; // ms meten
  var STANDEN = {
    bord: { naam: 'Digibord', knop: 'bord' },
    gewoon: { naam: 'Gewoon', knop: 'boek' },
    licht: { naam: 'Licht', knop: 'boek' }
  };
  var VOLGORDE = ['bord', 'gewoon', 'licht'];

  var stand = STANDEN[params.get('stand')] ? params.get('stand') : 'gewoon';
  var W = null;            // de wereld van het prototype (LK.W)
  var meting = null;       // { renderTijden: [] } terwijl er gemeten wordt
  var eerste = null;       // { ms, stand }
  var bezig = false;
  var uitslag = leesOpslag();
  var scherm = {};         // verwijzingen naar de elementen van het paneel

  function leesOpslag() {
    try {
      var d = JSON.parse(window.sessionStorage.getItem(OPSLAG) || '{}');
      return d && typeof d === 'object' ? d : {};
    } catch (e) { return {}; }
  }
  function schrijfOpslag() {
    try { window.sessionStorage.setItem(OPSLAG, JSON.stringify(uitslag)); } catch (e) { /* geen opslag: ook goed */ }
  }

  // ───── de 'licht'-stand: wat een traag toestel ontlast ─────
  // pixelverhouding 1, geen gloed, schaduwkaarten hoogstens 1024 en de eenvoudige schaduwrand.
  var lichtMerk = null;
  function pasLichtToe() {
    if (!W || stand !== 'licht') return;
    W.gloed = false;
    var T = window.THREE;
    if (W.r.shadowMap.type !== T.PCFShadowMap) {
      W.r.shadowMap.type = T.PCFShadowMap;
      W.scene.traverse(function (o) { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); } });
    }
    W.scene.traverse(function (o) {
      if (o.isLight && o.shadow && o.shadow.mapSize && (o.shadow.mapSize.x > 1024 || o.shadow.mapSize.y > 1024)) {
        o.shadow.mapSize.set(Math.min(o.shadow.mapSize.x, 1024), Math.min(o.shadow.mapSize.y, 1024));
        if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
      }
    });
    lichtMerk = W.root.children[0] || null;
  }

  var origineleResize = null;
  function lichtResize(breed, hoog) {
    W.r.setPixelRatio(1); W.r.setSize(breed, hoog, false);
    if (W.comp) { if (W.comp.setPixelRatio) W.comp.setPixelRatio(1); W.comp.setSize(breed, hoog); }
    W.cam.aspect = breed / Math.max(1, hoog); W.cam.updateProjectionMatrix();
  }

  function wikkelWereld(w) {
    W = w;
    origineleResize = w.resize;
    var render = w.render;
    var gl = w.r.getContext();
    w.render = function () {
      if (stand === 'licht' && (!lichtMerk || w.root.children[0] !== lichtMerk)) pasLichtToe();
      var t = window.performance.now();
      render.apply(w, arguments);
      var duur = window.performance.now() - t;
      if (meting) meting.renderTijden.push(duur);
      if (eerste === null && w.root.children.length > 0) {
        eerste = 0; // voorlopig: wacht op het volgende beeld
        try { gl.finish(); } catch (e) { /* geen finish: dan minder precies */ }
        window.requestAnimationFrame(function () {
          eerste = { ms: window.performance.now(), stand: stand };
          registreerEerste();
        });
      }
    };
    var zetKwaliteit = w.zetKwaliteit;
    w.zetKwaliteit = function () { zetKwaliteit.apply(w, arguments); pasLichtToe(); };
    if (stand === 'licht') w.resize = lichtResize;
    return w;
  }

  // Het prototype maakt zijn wereld met LK.init: wikkel die vóór het prototype zelf start.
  if (window.LK && typeof window.LK.init === 'function') {
    var origineleInit = window.LK.init;
    window.LK.init = function () { return wikkelWereld(origineleInit.apply(window.LK, arguments)); };
  }

  // ───── cijfers ─────
  function percentiel(lijst, p) {
    if (!lijst.length) return null;
    var s = lijst.slice().sort(function (a, b) { return a - b; });
    var i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
    return s[Math.max(0, i)];
  }
  function gemiddelde(lijst) {
    if (!lijst.length) return null;
    var som = 0; for (var i = 0; i < lijst.length; i++) som += lijst[i];
    return som / lijst.length;
  }
  function rond(x, n) { return x === null || x === undefined ? null : Math.round(x * Math.pow(10, n)) / Math.pow(10, n); }
  function overgedragenKb() {
    var som = 0;
    try {
      window.performance.getEntriesByType('resource').forEach(function (e) { som += e.transferSize || 0; });
      var nav = window.performance.getEntriesByType('navigation')[0];
      if (nav) som += nav.transferSize || 0;
    } catch (e) { return null; }
    return Math.round(som / 1024);
  }
  function registreerEerste() {
    var r = uitslag[eerste.stand] || {};
    r.eersteMs = Math.round(eerste.ms);
    r.overgedragenKb = overgedragenKb();
    uitslag[eerste.stand] = r;
    schrijfOpslag();
    teken();
  }

  // ───── de meting ─────
  function wacht(ms) { return new Promise(function (res) { window.setTimeout(res, ms); }); }
  function klik(selector) { var el = document.querySelector(selector); if (el) el.click(); return !!el; }
  function zoekLamp() {
    var gevonden = null;
    W.root.traverse(function (o) { if (!gevonden && o.userData && o.userData.pick && typeof o.userData.pick.drag === 'function') gevonden = o.userData.pick; });
    return gevonden;
  }
  function zetStand(naam) {
    stand = naam;
    lichtMerk = null;
    if (naam === 'licht') {
      W.resize = lichtResize;
    } else {
      W.resize = origineleResize;
      if (W.r.shadowMap.type !== window.THREE.PCFSoftShadowMap) {
        W.r.shadowMap.type = window.THREE.PCFSoftShadowMap;
        W.scene.traverse(function (o) { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); } });
      }
    }
    klik('[data-mode="' + STANDEN[naam].knop + '"]');
    // de standwissel zet de kwaliteit en past het formaat aan (na 60 ms)
    // altijd dezelfde opstelling: 4de leerjaar, 'Onderzoek: lamp dichterbij' (de zaklamp schuift over de tafel)
    klik('[data-moment="4"]');
    klik('.taak[data-i="2"]');
  }

  function meetStand(naam) {
    if (bezig) return Promise.resolve();
    bezig = true;
    teken();
    var resultaat = { fout: null };
    return Promise.resolve().then(function () {
      if (!W || !W.r) throw new Error('De 3D-kijkdoos draait niet op dit toestel.');
      zetStand(naam);
      return wacht(1500);
    }).then(function () {
      var lamp = zoekLamp();
      if (!lamp) throw new Error('De zaklamp is niet gevonden in de kijkdoos.');
      var gl = W.r.getContext();
      meting = { renderTijden: [] };
      return new Promise(function (klaar) {
        var tijden = [];
        var start = null; var vorige = null;
        // Op de achtergrond staan de beelden stil en komt er daarna één groot interval: dat is geen traag toestel.
        // Een echt traag toestel blijft zichtbaar en krijgt gewoon zijn (slechte) p95.
        var verborgen = document.hidden === true;
        function zichtbaarheid() { if (document.hidden === true) verborgen = true; }
        document.addEventListener('visibilitychange', zichtbaarheid);
        function stap(t) {
          if (start === null) start = t;
          var el = t - start;
          if (vorige !== null && el > OPWARMEN) tijden.push(t - vorige);
          vorige = t;
          var s = el / 1000;
          lamp.drag(0, 3.23 + 1.0 * Math.sin(s * 2 * Math.PI / 1.4));
          if (el < OPWARMEN + DUUR) { window.requestAnimationFrame(stap); } else {
            try { gl.finish(); } catch (e) { /* ok */ }
            document.removeEventListener('visibilitychange', zichtbaarheid);
            klaar({ tijden: tijden, verborgen: verborgen });
          }
        }
        window.requestAnimationFrame(stap);
      });
    }).then(function (gemeten) {
      var tijden = gemeten.tijden;
      // Een tabblad op de achtergrond pauzeert de beelden: dat is geen traag toestel, dus geen oordeel.
      if (gemeten.verborgen) throw new Error('Meting ongeldig: het tabblad was niet de hele tijd zichtbaar. Laat het open staan en meet opnieuw.');
      var renders = meting.renderTijden; meting = null;
      var r = uitslag[naam] || {};
      delete r.fout;
      r.p95 = rond(percentiel(tijden, 95), 1);
      r.gemiddeld = rond(gemiddelde(tijden), 1);
      r.max = rond(Math.max.apply(null, tijden.length ? tijden : [0]), 1);
      r.frames = tijden.length;
      r.fps = tijden.length ? rond(1000 / gemiddelde(tijden), 0) : null;
      r.renderP95 = rond(percentiel(renders, 95), 1);
      r.breed = W.r.domElement.width; r.hoog = W.r.domElement.height;
      uitslag[naam] = r;
      schrijfOpslag();
      return resultaat;
    }).catch(function (e) {
      meting = null;
      var oud = uitslag[naam] || {};
      ['p95', 'gemiddeld', 'max', 'frames', 'fps', 'renderP95'].forEach(function (k) { delete oud[k]; });
      oud.fout = String((e && e.message) || e);
      uitslag[naam] = oud;
      schrijfOpslag();
      return resultaat;
    }).then(function () { bezig = false; teken(); });
  }

  function meetAlles() {
    var p = Promise.resolve();
    VOLGORDE.forEach(function (n) { p = p.then(function () { return meetStand(n); }); });
    return p.then(function () { teken(); });
  }

  // ───── uitslag en paneel ─────
  function oordeel(r) {
    if (!r || r.fout || r.p95 === null || r.p95 === undefined) return null;
    var okeP95 = r.p95 <= DREMPEL_P95;
    var okeEerste = r.eersteMs !== undefined && r.eersteMs <= DREMPEL_EERSTE;
    if (!okeP95) return 'NO-GO';
    if (r.eersteMs === undefined) return 'p95 goed, eerste beeld nog niet gemeten';
    return okeEerste ? 'GO' : 'NO-GO';
  }
  function glNaam() {
    try {
      var gl = W && W.r.getContext();
      var info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : (gl ? String(gl.getParameter(gl.RENDERER)) : 'geen WebGL');
    } catch (e) { return 'onbekend'; }
  }
  function tekst() {
    var rg = [];
    var d = window.devicePixelRatio || 1;
    rg.push('Lichtkamer 3D-proef, meetstand');
    rg.push('Scherm: ' + window.innerWidth + ' x ' + window.innerHeight + ' css-px, pixelverhouding ' + (Math.round(d * 100) / 100));
    rg.push('Toestel: ' + (navigator.platform || 'onbekend') + ', ' + (navigator.hardwareConcurrency || '?') + ' kernen, ' + (navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'geheugen onbekend'));
    rg.push('Grafische kaart: ' + glNaam());
    rg.push('Browser: ' + navigator.userAgent);
    rg.push('Drempels: p95 hoogstens ' + DREMPEL_P95 + ' ms, eerste beeld binnen ' + (DREMPEL_EERSTE / 1000) + ' s');
    VOLGORDE.forEach(function (n) {
      var r = uitslag[n];
      if (!r) { rg.push(STANDEN[n].naam + ': nog niet gemeten'); return; }
      var delen = [];
      delen.push('eerste beeld ' + (r.eersteMs === undefined ? '-' : (rond(r.eersteMs / 1000, 2) + ' s')) + (r.overgedragenKb === undefined || r.overgedragenKb === null ? '' : ' (' + r.overgedragenKb + ' kB opgehaald)'));
      if (r.p95 !== undefined && r.p95 !== null) {
        delen.push('p95 ' + r.p95 + ' ms');
        delen.push('gemiddeld ' + r.gemiddeld + ' ms (' + r.fps + ' beelden per seconde)');
        delen.push('traagste ' + r.max + ' ms');
        delen.push(r.frames + ' beelden');
        delen.push('tekenen ' + r.renderP95 + ' ms (p95)');
        delen.push('canvas ' + r.breed + ' x ' + r.hoog + ' px');
      }
      if (r.fout) delen.push('FOUT: ' + r.fout);
      var o = oordeel(r);
      rg.push(STANDEN[n].naam + ': ' + delen.join('; ') + (o ? ' -> ' + o : ''));
    });
    return rg.join('\n');
  }

  function teken() {
    if (!scherm.paneel) return;
    scherm.uit.textContent = tekst();
    scherm.status.textContent = bezig ? 'Bezig met meten... laat het toestel met rust (ongeveer ' + Math.round((1500 + OPWARMEN + DUUR) / 1000) + ' seconden per stand).' :
      (eerste && eerste.ms ? 'Klaar om te meten. Eerste beeld bij het openen: ' + rond(eerste.ms / 1000, 2) + ' s (stand ' + STANDEN[eerste.stand].naam.toLowerCase() + ').' : 'Wachten op het eerste beeld...');
    scherm.knoppen.forEach(function (b) { b.disabled = bezig; });
  }

  function knop(label, actie, extra) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mt-knop' + (extra ? ' ' + extra : ''); b.textContent = label;
    b.addEventListener('click', actie);
    scherm.knoppen.push(b);
    return b;
  }
  function koppeling(label, stnd) {
    var a = document.createElement('a');
    a.className = 'mt-knop mt-link';
    a.href = '?meet&stand=' + stnd;
    a.textContent = label;
    return a;
  }

  function bouwPaneel() {
    var stijl = document.createElement('style');
    stijl.textContent = [
      '.mt{position:fixed;right:12px;bottom:12px;z-index:50;box-sizing:border-box;width:min(28rem,calc(100vw - 24px));max-height:70vh;overflow:auto;',
      'background:#10172b;color:#f4f6ff;border:2px solid #ffd27a;border-radius:14px;padding:12px 14px;font:16px/1.4 system-ui,Verdana,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45)}',
      '.mt h2{font-size:1.05rem;margin:0 0 6px;color:#ffd27a}',
      '.mt p{margin:4px 0;font-size:.95rem}',
      '.mt-rij{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}',
      '.mt-knop{min-height:48px;padding:8px 14px;border-radius:12px;border:2px solid #ffd27a;background:#ffd27a;color:#1b1400;font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}',
      '.mt-knop.mt-stil,.mt-link{background:transparent;color:#ffd27a}',
      '.mt-knop:disabled{opacity:.5;cursor:default}',
      '.mt-knop:focus-visible{outline:3px solid #fff;outline-offset:2px}',
      '.mt pre{white-space:pre-wrap;word-break:break-word;margin:8px 0 0;padding:8px 10px;background:#000;border-radius:8px;font:13px/1.45 ui-monospace,Consolas,monospace;color:#e8ecff}',
      '.mt[data-weg] .mt-inhoud{display:none}'
    ].join('');
    document.head.appendChild(stijl);

    var p = document.createElement('section');
    p.className = 'mt'; p.setAttribute('aria-label', 'Meetstand van de 3D-proef'); p.id = 'meetstand';
    var h = document.createElement('h2'); h.textContent = 'Meetstand 3D-proef';
    var inhoud = document.createElement('div'); inhoud.className = 'mt-inhoud';
    var status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    scherm.knoppen = [];
    var rij1 = document.createElement('div'); rij1.className = 'mt-rij';
    rij1.appendChild(knop('Meet alle drie de standen', function () { meetAlles(); }));
    VOLGORDE.forEach(function (n) { rij1.appendChild(knop('Meet ' + STANDEN[n].naam.toLowerCase(), function () { meetStand(n); }, 'mt-stil')); });
    var uitleg = document.createElement('p');
    uitleg.textContent = 'Het eerste beeld meet je per stand bij het openen: kies hieronder een stand, wacht tot het beeld er staat en meet dan. De uitslag blijft staan tot je dit tabblad sluit.';
    var rij2 = document.createElement('div'); rij2.className = 'mt-rij';
    VOLGORDE.forEach(function (n) { rij2.appendChild(koppeling('Open opnieuw: ' + STANDEN[n].naam.toLowerCase(), n)); });
    var uit = document.createElement('pre'); uit.id = 'meet-uitslag'; uit.tabIndex = 0;
    uit.setAttribute('aria-label', 'Uitslag van de meting, als tekst om af te lezen');
    var rij3 = document.createElement('div'); rij3.className = 'mt-rij';
    rij3.appendChild(knop('Kopieer de uitslag', function () {
      var t = tekst();
      try { navigator.clipboard.writeText(t).then(function () { status.textContent = 'Uitslag gekopieerd.'; }, function () { status.textContent = 'Kopiëren lukt hier niet: lees de tekst af.'; }); } catch (e) { status.textContent = 'Kopiëren lukt hier niet: lees de tekst af.'; }
    }, 'mt-stil'));
    rij3.appendChild(knop('Wis de uitslag', function () { uitslag = {}; if (eerste && eerste.ms) registreerEerste(); schrijfOpslag(); teken(); }, 'mt-stil'));
    var toon = document.createElement('button'); toon.type = 'button'; toon.className = 'mt-knop mt-stil'; toon.textContent = 'Verberg';
    toon.setAttribute('aria-expanded', 'true');
    toon.addEventListener('click', function () {
      var weg = p.hasAttribute('data-weg');
      if (weg) { p.removeAttribute('data-weg'); toon.textContent = 'Verberg'; } else { p.setAttribute('data-weg', ''); toon.textContent = 'Toon de meetstand'; }
      toon.setAttribute('aria-expanded', String(weg));
    });
    inhoud.appendChild(status); inhoud.appendChild(rij1); inhoud.appendChild(uitleg); inhoud.appendChild(rij2); inhoud.appendChild(uit); inhoud.appendChild(rij3);
    p.appendChild(h); p.appendChild(inhoud);
    var voet = document.createElement('div'); voet.className = 'mt-rij'; voet.appendChild(toon); p.appendChild(voet);
    document.body.appendChild(p);
    scherm.paneel = p; scherm.uit = uit; scherm.status = status;
    teken();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bouwPaneel();
    // de stand van het adres: het prototype start in 'gewoon'; voor het digibord een klik vóór het eerste beeld
    if (stand === 'bord') klik('[data-mode="bord"]');
    // voor de rooktest en de generale repetitie: ?meet&auto meet alles zodra het eerste beeld er staat
    if (params.has('auto')) {
      var wachten = window.setInterval(function () {
        if (eerste && eerste.ms) { window.clearInterval(wachten); meetAlles(); }
      }, 300);
    }
  });

  // voor de rooktest
  window.__lkMeet = { uitslag: function () { return uitslag; }, tekst: tekst, eerste: function () { return eerste; } };
})();
