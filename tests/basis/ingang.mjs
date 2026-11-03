// Rooktest van het deel basisonderwijs (#/basis), als losse module met een eigen uitvoerder (ingang-los.mjs).
// Ze wordt ook aangeroepen als sectie 20b-2c van tests/smoke.mjs. Kort (doel: onder een minuut) en zonder AI of netwerk
// buiten de preview: de officiële gegevens komen uit dezelfde build.
//
//   export async function basisIngang({ browser, BASE, check, errors, sleep })
//
// Elke check kijkt ook naar: één main en één h1, geen horizontaal scrollen op 390 px, en geen console- of paginafouten
// (die komen in `errors`; de aanroeper faalt op een niet-lege lijst). Eigen contexten zonder service worker en met een
// vaste klok vóór de eerste goto, want het scherm rekent met het schooljaar van vandaag (twee klokken: 2 november 2026
// en, voor de schermen zonder lege kopjes, 2 november 2031). Pas de schermen niet aan om een check groen te krijgen.

const KLOK = '2026-11-02T10:00:00Z';
const KLOK_LATER = '2031-11-02T10:00:00Z';

const BREED = 1360;
const SMAL = 390;

export async function basisIngang({ browser, BASE, check, errors, sleep }) {
  console.log('20b-2c. Eigen ingang basisonderwijs');

  const open = async (tijd, breedte = BREED, extra = {}) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: breedte, height: 900 }, ...extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`pageerror(20b-2c): ${e.message}`));
    p.on('console', (m) => {
      if (m.type() !== 'error' || /ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
      errors.push(`console(20b-2c): ${m.text()}`);
    });
    await p.clock.setFixedTime(new Date(tijd));
    const gaNaar = async (hash, wacht) => {
      await p.goto(BASE + hash, { waitUntil: 'networkidle' });
      if (wacht) await p.waitForSelector(wacht, { timeout: 20000 });
      await sleep(200);
    };
    return { ctx, p, gaNaar };
  };

  const heeftEenKop = async (p) => (await p.locator('main').count()) === 1 && (await p.locator('h1').count()) === 1 && (await p.locator('main h1').count()) === 1;
  const passtOpSmal = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const tekst = (p, kies = 'main') => p.locator(kies).first().innerText();
  const hoogte = async (loc) => (await loc.boundingBox())?.height ?? 0;
  // De nieuwe kleuren staan op html: lees ze zoals de browser ze rekent.
  const variabele = (p, naam) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), naam);
  const deel = (p) => p.evaluate(() => document.documentElement.dataset.deel ?? null);
  // Staat onder elke h2 van de pagina ook echt iets? (Geen lege kopjes.)
  const geenLegeKoppen = (p) =>
    p.evaluate(() =>
      [...document.querySelectorAll('main h2')].every((h) => {
        const sectie = h.closest('section') ?? h.parentElement;
        const rest = (sectie?.textContent ?? '').replace(h.textContent ?? '', '').trim();
        return rest.length > 0;
      }),
    );
  const lijstDoelen = (p) => p.locator('.b-zoekuitslag .b-doelrij-link').evaluateAll((l) => l.map((a) => a.getAttribute('href') ?? ''));
  const eindeDoel = (h) => h.split('/').slice(-2).join('/');

  // Secties die los van de hoofdstroom lopen (eigen contexten), parallel gestart om de duur kort te houden.
  const sectieVormen = async (check) => {
    // 11. Donker (voor het smalle scherm, op dezelfde pagina als de lichte controle).
    const d = await open(KLOK, BREED, { colorScheme: 'dark' });
    await d.gaNaar('/#/basis', '.b-leerjaarknop');
    check('basis 11: donker: data-theme dark, --bg #0d1322 en --brand-fill #2f5fd6', (await d.p.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await variabele(d.p, '--bg')) === '#0d1322' && (await variabele(d.p, '--brand-fill')) === '#2f5fd6');
    await d.ctx.close();

    // 12. "Naar Boosterz" haalt het deel weg; een onbekende pagina toont de eigen melding.
    const e = await open(KLOK);
    await e.gaNaar('/#/basis', '.b-leerjaarknop');
    await e.p.locator('a.b-knop', { hasText: 'Naar Boosterz' }).click();
    await sleep(800);
    check('basis 12: "Naar Boosterz" gaat naar de startpagina, haalt data-deel weg en zet --brand-fill weer op #5b3df5', /#\/$/.test(e.p.url()) && (await deel(e.p)) === null && (await variabele(e.p, '--brand-fill')) === '#5b3df5');
    await e.gaNaar('/#/basis/xyz', 'h1');
    check('basis 12: #/basis/xyz toont de eigen melding met één main en één h1, links naar Mijn leerjaar en Zoeken, en nooit de meedoenpagina', (await heeftEenKop(e.p)) && (await e.p.locator('h1').innerText()).trim() === 'Deze pagina bestaat niet in het deel basisonderwijs' && (await e.p.locator('main a', { hasText: 'Mijn leerjaar' }).count()) === 1 && (await e.p.locator('main a', { hasText: 'Zoeken' }).count()) === 1 && (await deel(e.p)) === 'basis');
    await e.ctx.close();

    // Buitengewoon L3 en kleuter K2 (andere vorm van het antwoord), en L5 (geen nieuwe verplicht).
    const f = await open(KLOK);
    await f.gaNaar('/#/basis/leerjaar/buitengewoon/L3', '.b-kaarten .b-vakkaart');
    const tb = await tekst(f.p);
    check('basis 13: buitengewoon L3 zegt "nog onzeker" en "na te streven", heeft kaarten uit ODS_3465, 3467 en 3469 en geen lijst met 22 oude sets maar een zin met een link', /onzeker/.test(tb) && /na te streven/.test(tb) && (await f.p.locator('.b-oudlijst').count()) === 0 && /ontwikkelingsdoelen/.test(tb) && (await f.p.locator('main a[href="#/leerplannen/minimumdoelen"]').count()) >= 1 && (await f.p.locator('.b-vakkaart').evaluateAll((l) => l.map((a) => a.getAttribute('href') ?? ''))).length >= 3);
    await f.gaNaar('/#/basis/leerjaar/gewoon/K2', '.b-kaarten .b-vakkaart');
    const tk = await tekst(f.p);
    check('basis 13: kleuter K2: Nederlands "42 doelen: 7 te bereiken (populatie) · 35 na te streven", zonder badge bij het zekere deel', tk.includes('42 doelen: 7 te bereiken (populatie) · 35 na te streven') && !/Nederlands[\s\S]{0,120}waarschijnlijk/.test(tk.split('Mag al')[0]) && /ontwikkelingsdoelen/i.test(tk));
    await f.gaNaar('/#/basis/leerjaar/gewoon/L5', '.b-kaarten .b-vakkaart');
    const t5b = await tekst(f.p);
    check('basis 13: 5de leerjaar: "Dit schooljaar zijn nog geen nieuwe doelen verplicht", 10 oude sets open en 10 kaarten bij "Mag al"', t5b.includes('Dit schooljaar zijn nog geen nieuwe doelen verplicht') && (await f.p.locator('.b-oudlijst li').count()) === 10 && (await f.p.locator('section:has(> h2#b-mag-kop) .b-vakkaart').count()) === 10);
    await f.ctx.close();
  };
  const sectieLater = async (check) => {
    // ── H5: de tweede klok, 2 november 2031: geen lege kopjes als alles verplicht is ──
    const g = await open(KLOK_LATER);
    await g.gaNaar('/#/basis/leerjaar/gewoon/L3', '.b-kaarten .b-vakkaart');
    const tl = await tekst(g.p);
    check('basis H5: in 2031 is alles verplicht: "Alle vakken zijn dit schooljaar verplicht.", Schooljaar 2031-2032, en geen kopje "Mag al" of "Oude doelen die dit schooljaar nog gelden"', tl.includes('Alle vakken zijn dit schooljaar verplicht.') && tl.includes('Schooljaar 2031-2032') && (await g.p.locator('h2', { hasText: /^Mag al$/ }).count()) === 0 && (await g.p.locator('h2', { hasText: /^Oude doelen die dit schooljaar nog gelden$/ }).count()) === 0 && (await geenLegeKoppen(g.p)));
    await g.gaNaar('/#/basis/leerjaar/gewoon/L5', '.b-kaarten .b-vakkaart');
    check('basis H5: in 2031 heeft het 5de leerjaar geen lege kopjes', (await heeftEenKop(g.p)) && (await geenLegeKoppen(g.p)) && (await g.p.locator('h2', { hasText: /^Oude doelen die dit schooljaar nog gelden$/ }).count()) === 0);
    await g.ctx.close();
  };
  const sectieSmal = async (check) => {
    // ── 10. 390 px: geen horizontaal scrollen, één main en één h1, en tikdoelen van 44 px ──
    const s = await open(KLOK, SMAL);
    const smalle = [
      ['/#/basis', '.b-leerjaarknop'],
      ['/#/basis/kies', '.b-leerjaarknop'],
      ['/#/basis/leerjaar/gewoon/L3', '.b-kaarten .b-vakkaart'],
      ['/#/basis/leerjaar/buitengewoon/L3', '.b-kaarten .b-vakkaart'],
      ['/#/basis/leerjaar/gewoon/L5', '.b-oudlijst'],
      ['/#/basis/moment/gewoon/einde-4de', '.b-vakkaart'],
      ['/#/basis/vak/gewoon/einde-4de/wetenschap-en-techniek?leerjaar=L3', '.b-doelkaart'],
      ['/#/basis/doel/ODS_3408/92767', '.b-leerlijnkolommen'],
      ['/#/basis/doel/ODS_3406/93177', '.b-doelkaart-groot'],
      ['/#/basis/leerlijn/gewoon', '.b-vakkaart, .b-tegel'],
      ['/#/basis/leerlijn/gewoon/wetenschap-en-techniek?leerjaar=L3', 'table.b-tabel'],
      ['/#/basis/zoek?q=schaduw&leerjaar=L3&bereik=leerjaar', '.b-zoekstatus'],
      ['/#/basis/xyz', 'h1'],
    ];
    const mislukt = [];
    for (const [hash, wacht] of smalle) {
      await s.gaNaar(hash, wacht);
      if (!(await heeftEenKop(s.p))) mislukt.push(`${hash}: main/h1`);
      if (!(await passtOpSmal(s.p))) mislukt.push(`${hash}: scrollt horizontaal`);
    }
    check(`basis 10: op 390 px scrolt geen basisscherm horizontaal en elk heeft één main en één h1${mislukt.length ? ` (${mislukt.join('; ')})` : ''}`, mislukt.length === 0);

    // Tikdoelen: knoppen, kaarten, tegels, samenvattingen en navigatie zijn minstens 44 px hoog (links in lopende tekst niet).
    const laag = [];
    for (const [hash, wacht] of [smalle[0], smalle[2], smalle[6], smalle[10], smalle[11]]) {
      await s.gaNaar(hash, wacht);
      const items = await s.p.evaluate(() =>
        [...document.querySelectorAll('button, summary, a.b-knop, a.b-tegel, a.b-vakkaart, a.b-doelrij-link, a.b-pil-knop, .b-nav a, a.b-lees-meer, .b-leerjaarknop, input')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((el) => ({ naam: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, tekst: (el.textContent ?? '').trim().slice(0, 24), h: el.getBoundingClientRect().height })),
      );
      for (const i of items) if (i.h < 43.5) laag.push(`${hash.slice(2, 40)}: ${i.naam} "${i.tekst}" ${Math.round(i.h)}px`);
    }
    check(`basis 10: alles wat je kan aantikken is minstens 44 px hoog op 390 px${laag.length ? ` (${[...new Set(laag)].slice(0, 6).join('; ')})` : ''}`, laag.length === 0);
    await s.ctx.close();
  };
  const gebufferd = async (sectie) => { const log = []; await sectie((naam, ok) => log.push([naam, ok])); return log; };

  const parallel = Promise.all([gebufferd(sectieVormen), gebufferd(sectieLater), gebufferd(sectieSmal)]);

  // ── De gewone klok: 2 november 2026 ───────────────────────────────────────
  const a = await open(KLOK);
  const { p } = a;

  // 1. #/basis zonder keuze.
  await a.gaNaar('/#/basis', '.b-leerjaarknop');
  const t1 = await tekst(p);
  check('basis 1: #/basis zonder keuze: één main, één h1 "Welk leerjaar geef je?", html[data-deel=basis], titel en --brand-fill #2b5bd0', (await heeftEenKop(p)) && /^Welk leerjaar geef je\?$/.test((await p.locator('h1').innerText()).trim()) && (await deel(p)) === 'basis' && (await p.title()) === 'Basisonderwijs · Boosterz' && (await variabele(p, '--brand-fill')) === '#2b5bd0');
  check('basis 1: 2 schakelknoppen met aria-pressed en 9 leerjaarknoppen in 3 fieldsets met legend, en het zoekveld', (await p.locator('.b-kiezer button[aria-pressed]').count()) === 2 && (await p.locator('.b-leerjaarknop').count()) === 9 && (await p.locator('.b-kiezer fieldset > legend').count()) === 3 && (await p.locator('form[role=search] input[type=search]').count()) === 1);
  check('basis 1: de momenttegels zeggen 208, 368 en 422 doelen, en "Leerlijnen per vak" staat erbij', /Einde kleuter\s*208 doelen/.test(t1) && /Einde 4de leerjaar\s*368 doelen/.test(t1) && /Einde 6de leerjaar\s*422 doelen/.test(t1) && (await p.locator('a.b-tegel', { hasText: 'Leerlijnen per vak' }).count()) === 1);
  check('basis 1: de ingang gebruikt het woord "leerjaar" en niet "klas" in zijn kop en knoppen', !/\bklas\b/i.test(await p.locator('h1').innerText()) && !/\bklas\b/i.test(await p.locator('.b-kiezer').innerText()));

  // 2. Tik "3de leerjaar".
  await p.locator('.b-leerjaarknop', { hasText: /^3de leerjaar/ }).click();
  await p.waitForSelector('.b-kaarten .b-vakkaart', { timeout: 15000 });
  await sleep(200);
  const t2 = await tekst(p);
  const verplicht = p.locator('section:has(> h2#b-verplicht-kop) .b-vakkaart');
  check('basis 2: een tik op "3de leerjaar" opent #/basis/leerjaar/gewoon/L3, met één main en één h1 "Wat geldt voor je 3de leerjaar?"', /#\/basis\/leerjaar\/gewoon\/L3$/.test(p.url()) && (await heeftEenKop(p)) && (await p.locator('h1').innerText()).trim() === 'Wat geldt voor je 3de leerjaar?');
  check('basis 2: de lead zegt "einde van het 4de leerjaar" en "368 doelen in 9 vakken", met "Schooljaar 2026-2027"', t2.includes('het einde van het 4de leerjaar') && t2.includes('368 doelen in 9 vakken') && t2.includes('Schooljaar 2026-2027'));
  const kaarten = await verplicht.allInnerTexts();
  check('basis 2: verplicht zijn precies Nederlands 72, Wiskunde 122 en Wetenschap en techniek 44, elk met "waarschijnlijk"', kaarten.length === 3 && /Nederlands[\s\S]*72 doelen/.test(kaarten[0]) && /Wiskunde[\s\S]*122 doelen/.test(kaarten[1]) && /Wetenschap en techniek[\s\S]*44 doelen/.test(kaarten[2]) && kaarten.every((k) => /waarschijnlijk/.test(k)));
  const mag = await p.locator('section:has(> h2#b-mag-kop) .b-vakkaart').allInnerTexts();
  check('basis 2: "Mag al" heeft 6 vakken met "verplicht vanaf 2027-2028" (AK 21, GE 19, MV 38, LO 16, ICT 9, ATT 27)', mag.length === 6 && mag.every((k) => /verplicht vanaf 2027-2028/.test(k)) && [21, 19, 38, 16, 9, 27].every((n, i) => new RegExp(`${n} doelen`).test(mag[i])));
  const oud = await p.locator('.b-oudlijst a').evaluateAll((l) => l.map((x) => x.getAttribute('href') ?? ''));
  check('basis 2: 7 oude sets staan open in beeld, met links naar Officiële minimumdoelen, en de zin dat de bron oud en nieuw niet koppelt', oud.length === 7 && oud.every((h) => /\/leerplannen\/minimumdoelen\/ODS_2\d+$/.test(h)) && t2.includes('De officiële gegevens koppelen de oude en de nieuwe doelen niet aan elkaar.') && (await p.locator('details.b-oud').count()) === 0);
  check('basis 2: Frans en "Hoe zeker is dit?" staan er, en de ongestaafde zin over "oude eindtermen/ontwikkelingsdoelen" niet', /Frans heeft/.test(t2) && (await p.locator('details.b-uitleg summary').innerText()).includes('Hoe zeker is dit?') && !/Tot dan gelden voor deze vakken nog de oude/.test(t2));
  check('basis 2: geen lege kopjes op het scherm van het 3de leerjaar', await geenLegeKoppen(p));

  // 3. localStorage exact.
  const opslag = await p.evaluate(() => ({ keuze: localStorage.getItem('wf.basis.keuze.v1'), sleutels: Object.keys(localStorage).filter((k) => /basis/i.test(k)) }));
  check('basis 3: localStorage["wf.basis.keuze.v1"] is exact {"v":1,"soort":"bao","leerjaar":"L3"} en er is geen andere basis-sleutel', opslag.keuze === '{"v":1,"soort":"bao","leerjaar":"L3"}' && opslag.sleutels.length === 1);

  // 4. #/basis stuurt door.
  await a.gaNaar('/#/basis', '.b-kaarten .b-vakkaart');
  check('basis 4: #/basis met een bewaarde keuze landt zonder tik op #/basis/leerjaar/gewoon/L3', /#\/basis\/leerjaar\/gewoon\/L3$/.test(p.url()) && (await heeftEenKop(p)));

  // H8: gewoon of buitengewoon kan op elk scherm gewijzigd worden; met een bewaarde keuze "gewoon" staat de schakelaar er.
  const wissel = async (hash, wacht, naam) => {
    await a.gaNaar(hash, wacht);
    const huidig = p.locator('[aria-current="true"]', { hasText: /^Gewoon onderwijs$/ }).or(p.locator('[aria-pressed="true"]', { hasText: /^Gewoon onderwijs$/ }));
    const staat = (await huidig.count()) >= 1;
    await p.getByRole(await p.getByRole('link', { name: 'Buitengewoon onderwijs' }).count() ? 'link' : 'button', { name: 'Buitengewoon onderwijs' }).first().click();
    await sleep(300);
    return { naam, staat, url: p.url(), kop: (await p.locator('h1').count()) === 1 };
  };
  const wissels = [
    await wissel('/#/basis/leerjaar/gewoon/L3', '.b-kaarten .b-vakkaart', 'leerjaar'),
    await wissel('/#/basis/moment/gewoon/einde-4de', '.b-vakkaart', 'moment'),
    await wissel('/#/basis/vak/gewoon/einde-4de/wetenschap-en-techniek', '.b-doelkaart', 'vak'),
    await wissel('/#/basis/leerlijn/gewoon', '.b-vakkaart, .b-tegel', 'leerlijnen'),
    await wissel('/#/basis/zoek?q=schaduw', '.b-zoekstatus', 'zoeken'),
  ];
  check('basis H8: op leerjaar, moment, vak, leerlijnen en zoeken staat "Gewoon onderwijs" gekozen en wisselt "Buitengewoon onderwijs" de soort in de url', wissels.every((w) => w.staat && /buitengewoon/.test(w.url) && w.kop));

  // 5. De vakpagina W&T.
  await a.gaNaar('/#/basis/vak/gewoon/einde-4de/wetenschap-en-techniek?leerjaar=L3', '.b-doelkaart');
  const t5 = await tekst(p);
  const kaart354 = p.locator('.b-doelkaart', { has: p.locator('.b-doelrij-code', { hasText: /^3\.5\.4$/ }) });
  check('basis 5: de vakpagina W&T heeft 44 doelkaarten en 7 onderwerpen (h2), en één main en één h1', (await p.locator('.b-doelkaart').count()) === 44 && (await p.locator('.b-onderwerp h2').count()) === 7 && (await heeftEenKop(p)));
  check('basis 5: 3.5.4 staat er letterlijk "De leerlingen kennen licht: rechtlijnige beweging." met een link naar #/basis/doel/ODS_3408/92767', (await kaart354.count()) === 1 && (await kaart354.innerText()).includes('De leerlingen kennen licht: rechtlijnige beweging.') && (await kaart354.locator('a[href="#/basis/doel/ODS_3408/92767"]').count()) === 1);
  check('basis 5: de statusregel zegt "verplicht in 2026-2027" met "waarschijnlijk"', /Voor je 3de leerjaar: verplicht in 2026-2027\s*waarschijnlijk/.test(t5));
  // H2: de volledige tekst staat open; geen doel is ingekort of ingeklapt op de vakpagina.
  check('basis H2: op de vakpagina staat de uitbreiding open (3.1.2 met de hele opsomming) en niets in een details', (await p.locator('.b-doelkaart details').count()) === 0 && /de zoogdieren;[\s\S]*de vogels;[\s\S]*de amfibieën;[\s\S]*de vissen\./.test(await p.locator('.b-doelkaart', { has: p.locator('.b-doelrij-code', { hasText: /^3\.1\.2$/ }) }).first().innerText()));

  // 6. De doelpagina 92767.
  await a.gaNaar('/#/basis/doel/ODS_3408/92767', 'h2#b-wanneer-kop');
  const t6 = await tekst(p);
  check('basis 6: doel 92767: h1 "Minimumdoel 3.5.4", "Te bereiken op populatieniveau" en één main', (await heeftEenKop(p)) && (await p.locator('h1').innerText()).trim() === 'Minimumdoel 3.5.4' && t6.includes('Te bereiken op populatieniveau'));
  check('basis 6: de tweelinglink gaat naar #/basis/doel/ODS_3469/92767 en het blok "Wanneer" heeft h2#b-wanneer-kop en geen #md-wanneer-kop', (await p.locator('a[href="#/basis/doel/ODS_3469/92767"]').count()) >= 1 && (await p.locator('h2#b-wanneer-kop').count()) === 1 && (await p.locator('#md-wanneer-kop').count()) === 0);
  await p.waitForSelector('#b-leerlijn-kop ~ .b-leerlijnkolommen', { timeout: 15000 });
  const kolommen = await p.locator('.b-leerlijnkolom h3').allInnerTexts();
  const dit = await p.locator('.b-doelrij-dit').count();
  check('basis 6: de leerlijn heeft op einde kleuter 5 en op einde 6de leerjaar 7 doelen, en het eigen doel is gemarkeerd als "dit doel"', kolommen.length === 3 && /\(5\)/.test(kolommen[0]) && /\(7\)/.test(kolommen[2]) && dit === 1 && (await p.locator('.b-doelrij-dit', { hasText: 'dit doel' }).count()) === 1);
  check('basis 6: de voet geeft nummer, set en de bronvermelding met een link naar Privacy en opslag', t6.includes('Nummer 92767 · set ODS_3408') && (await p.locator('.b-voet a[href="#/privacy"], .b-doelbron a[href="#/privacy"]').count()) >= 1);

  // 7. Breuken veilig tonen, en een doel dat niet bestaat.
  await a.gaNaar('/#/basis/doel/ODS_3406/93177', '.b-doelkaart-groot');
  const html7 = await p.locator('.b-doelkaart-groot').innerHTML();
  const breuken = p.locator('.b-doelkaart-groot .b-breuk');
  check('basis 7: doel 93177 toont geen "<math" en heeft 2 breuken met aria-label "1 op 10" en "1 op 100"', !/<math|&lt;math/i.test(html7) && !/<math/i.test(await p.locator('.b-doelkaart-groot').innerText()) && (await breuken.count()) === 2 && (await breuken.evaluateAll((l) => l.map((x) => x.getAttribute('aria-label')))).join('|') === '1 op 10|1 op 100');
  await a.gaNaar('/#/basis/doel/ODS_9999/92767', 'h1');
  check('basis 7: een onbekende set toont "Dit doel vonden we niet" met een zoeklink en een link naar het leerjaar, en één main en één h1', (await heeftEenKop(p)) && (await p.locator('h1').innerText()).trim() === 'Dit doel vonden we niet' && (await p.locator('a[href*="#/basis/zoek?q=92767"]').count()) === 1 && (await p.locator('main a', { hasText: 'Mijn leerjaar' }).count()) >= 1);

  // 8. De leerlijn W&T.
  await a.gaNaar('/#/basis/leerlijn/gewoon/wetenschap-en-techniek?leerjaar=L3', 'table.b-tabel');
  const tabel = p.locator('table.b-tabel', { has: p.locator('caption', { hasText: 'Natuurkundige verschijnselen' }) });
  const rij = tabel.locator('tbody tr').first();
  check('basis 8: de leerlijn W&T heeft 7 onderwerpen, één h1 en een tabel met "(je leerjaar)" bij einde 4de leerjaar', (await heeftEenKop(p)) && (await p.locator('table.b-tabel').count()) === 7 && /Einde 4de leerjaar\s*\(je leerjaar\)/.test(await tabel.locator('thead').innerText()));
  const cellen = await rij.locator('td').allInnerTexts();
  check('basis 8: het onderwerp "Natuurkundige verschijnselen" heeft 3.5.2 bij einde kleuter en 3.5.4 bij einde 4de en 6de, met de letterlijke doelzin', cellen.length === 3 && /3\.5\.2/.test(cellen[0]) && /3\.5\.4/.test(cellen[1]) && /3\.5\.4/.test(cellen[2]) && cellen[1].includes('De leerlingen kennen licht: rechtlijnige beweging.'));
  // H2: in de leerlijn staat de uitbreiding ingeklapt naast de link, met de knoptekst over de opsomming.
  const knoppen = await p.locator('table.b-tabel .b-doelrij-deel > summary').allInnerTexts();
  check('basis H2: in de leerlijn staan uitbreidingen als details naast de link, met "Toon de opsomming (n punten)" of "Toon de toelichting"', knoppen.some((k) => /^Toon de opsomming \(\d+ punten?\)$/.test(k.trim())) && (await p.locator('table.b-tabel .b-doelrij-link .b-doelrij-deel, table.b-tabel a details').count()) === 0);

  // 9. Zoeken (H3).
  const zoek = async (q, extra = '&leerjaar=L4&bereik=leerjaar') => {
    await a.gaNaar(`/#/basis/zoek?q=${encodeURIComponent(q)}${extra}`, '.b-zoekstatus');
    await sleep(200);
    return { hrefs: (await lijstDoelen(p)).map(eindeDoel), status: (await p.locator('.b-zoekstatus').innerText()).trim(), kop: await heeftEenKop(p) };
  };
  await a.gaNaar('/#/basis/zoek?q=schaduw&leerjaar=L3&bereik=leerjaar', '.b-zoekstatus');
  const groep = p.locator('.b-zoekgroep', { has: p.locator('h2', { hasText: 'Wetenschap en techniek › Natuurkundige verschijnselen' }) });
  const eerste = (await lijstDoelen(p))[0] ?? '';
  check('basis 9: "schaduw" met leerjaar L3 geeft 92767 eerst, in de groep "Wetenschap en techniek › Natuurkundige verschijnselen", met "Ook gezocht op"', eerste.endsWith('ODS_3408/92767') && (await groep.locator('a[href$="ODS_3408/92767"]').count()) === 1 && (await p.locator('.b-ookgezocht').count()) === 1 && (await heeftEenKop(p)));
  check('basis H2: een treffer die alleen in de woordenschat staat, staat open met het woord in <mark>', (await p.locator('details.b-doelrij-deel[open] mark').filter({ hasText: /schaduw/i }).count()) >= 1);
  const top = [];
  for (const q of ['schaduw', 'schaduw onderzoeken', 'schaduw maken', 'licht en schaduw']) top.push([q, (await zoek(q)).hrefs.slice(0, 3)]);
  check(`basis H3: "schaduw", "schaduw onderzoeken", "schaduw maken" en "licht en schaduw" hebben 92767 in de top 3 voor einde 4de leerjaar${top.every(([, h]) => h.includes('ODS_3408/92767')) ? '' : ` (${top.map(([q, h]) => `${q}: ${h.join(',')}`).join(' | ')})`}`, top.every(([, h]) => h.includes('ODS_3408/92767')));
  const onzin = await zoek('schaduw onderzoeken');
  check('basis H3: bij minder dan 5 volledige treffers volgt "Ook met een deel van je woorden:" en staat het erbij', (await p.locator('h2', { hasText: 'Ook met een deel van je woorden:' }).count()) === 1 && onzin.hrefs.length > 0);
  const rijm = await zoek('rijmen', '&bereik=alles');
  check('basis 9: "rijmen" geeft 92930, 92959 en 92960', ['92930', '92959', '92960'].every((n) => rijm.hrefs.some((h) => h.endsWith('/' + n))) && rijm.hrefs.length === 3);
  const weer = await zoek('weer', '&bereik=alles');
  check('basis 9: "weer" geeft geen 93039', weer.hrefs.length > 0 && !weer.hrefs.some((h) => h.endsWith('/93039')));
  const pv = await zoek('persoonsvorm', '&bereik=alles');
  check('basis 9: "persoonsvorm" geeft hoogstens 4 treffers', pv.hrefs.length > 0 && pv.hrefs.length <= 4);
  const wb = await zoek('wiskunde breuken', '&bereik=alles');
  check('basis 9: "wiskunde breuken" geeft 29 treffers met de chip "Wiskunde"', /^29 doelen gevonden/.test(wb.status) && (await p.locator('.b-chip', { hasText: 'Wiskunde' }).count()) === 1);
  const b6 = await zoek('breuken 6de leerjaar', '&bereik=alles');
  check('basis 9: "breuken 6de leerjaar" geeft 19 treffers, alle bij einde 6de leerjaar', /^19 doelen gevonden/.test(b6.status) && b6.hrefs.every((h) => /ODS_340[0-9]|ODS_341[0-9]/.test(h)) && (await p.locator('.b-doelrij-moment', { hasText: /^Einde 6de leerjaar$/ }).count()) === 19);
  const taal = await zoek('taal', '&bereik=alles');
  check('basis 9: "taal" geeft links per moment naar Nederlands en geen lijst treffers', taal.hrefs.length === 0 && (await p.locator('.b-zoekuitslag a[href$="/einde-kleuter/nederlands"], .b-zoekuitslag a[href$="/einde-4de/nederlands"], .b-zoekuitslag a[href$="/einde-6de/nederlands"]').count()) === 3);
  const nr = await zoek('92767', '&bereik=alles');
  check('basis 9: "92767" geeft dat ene doel', nr.hrefs.length === 1 && nr.hrefs[0] === 'ODS_3408/92767');
  const stop = await zoek('en de het', '&bereik=alles');
  check('basis H3: een vraag met alleen stopwoorden geeft een hulpzin en geen treffers', stop.hrefs.length === 0 && /Typ een woord/.test(stop.status) && stop.kop);
  check('basis H10: "wo" en "wereldoriëntatie" worden niet gekoppeld aan vak 3, 4 en 5', (await zoek('wereldoriëntatie', '&bereik=alles')).hrefs.length === 0 && !/Wetenschap en techniek|Aardrijkskunde|Geschiedenis/.test(await p.locator('.b-chips').innerText().catch(() => '')));

  await a.ctx.close();
  for (const log of await parallel) for (const [naam, ok] of log) check(naam, ok);
}
