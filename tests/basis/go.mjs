// Rooktest van het leerplan en de lesplannen van het GO! (#/basis/go, /lesplan, /leerplandoel, ...), als losse module met
// een eigen uitvoerder (go-los.mjs). Ze wordt ook aangeroepen als sectie 20b-2d van tests/smoke.mjs. Kort (doel: onder een
// minuut) en zonder netwerk buiten de preview: de gegevens van het GO! komen uit dezelfde build.
//
//   export async function basisGo({ browser, BASE, check, errors, sleep })
//
// Eigen contexten zonder service worker en met een vaste klok vóór de eerste goto. Pas de schermen niet aan om een check
// groen te krijgen: een rode check is een bevinding.

const KLOK = '2026-11-02T10:00:00Z';
const BREED = 1360;
const SMAL = 390;

export const GO_LESPLANNEN = ['LP0001', 'LP0014a', 'LP0014b', 'LP0017', 'LP0065', 'LP0074', 'LP0087', 'LP0094'];

export async function basisGo({ browser, BASE, check, errors, sleep }) {
  console.log('20b-2d. Leerplan en lesplannen van het GO!');

  const open = async (breedte = BREED, extra = {}) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: breedte, height: 900 }, ...extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`pageerror(20b-2d): ${e.message}`));
    p.on('console', (m) => {
      if (m.type() !== 'error' || /ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
      errors.push(`console(20b-2d): ${m.text()}`);
    });
    await p.clock.setFixedTime(new Date(KLOK));
    const gaNaar = async (hash, wacht) => {
      await p.goto(BASE + hash, { waitUntil: 'networkidle' });
      if (wacht) await p.waitForSelector(wacht, { timeout: 20000 });
      await sleep(150);
    };
    return { ctx, p, gaNaar };
  };

  const heeftEenKop = async (p) => (await p.locator('main').count()) === 1 && (await p.locator('h1').count()) === 1 && (await p.locator('main h1').count()) === 1;
  const passtOpSmal = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const tekst = (p, kies = 'main') => p.locator(kies).first().innerText();

  // De secties lopen parallel, elk in een eigen context.
  const sectieSmal = async () => {
    // 1. Elk lesplan en elk overzichtsscherm op 390 px: één main, één h1, niet horizontaal scrollen, de bronvermelding.
    const s = await open(SMAL);
    const mislukt = [];
    for (const code of GO_LESPLANNEN) {
      await s.gaNaar(`/#/basis/lesplan/${code}`, '.b-lesplan .b-lp-bron');
      if (!(await heeftEenKop(s.p))) mislukt.push(`${code}: main/h1`);
      if (!(await passtOpSmal(s.p))) mislukt.push(`${code}: scrollt horizontaal`);
      const bron = (await s.p.locator('.b-lp-bron').first().textContent()).replace(/\s+/g, ' ');
      if (!new RegExp(`Bron: GO! onderwijs van de Vlaamse Gemeenschap, lesplan ${code} \\(GO! studio( \\(opent in een nieuw tabblad\\))?\\)\\. Letterlijk overgenomen met toestemming\\.`).test(bron)) mislukt.push(`${code}: bronvermelding`);
    }
    check(`go 1: de 8 lesplannen hebben op 390 px één main, één h1, geen horizontaal scrollen en de bronvermelding${mislukt.length ? ` (${mislukt.join('; ')})` : ''}`, mislukt.length === 0);

    const schermen = [
      ['/#/basis/go', 'h1'],
      ['/#/basis/lesplannen?leerjaar=K1', '.b-go-lesplanlink'],
      ['/#/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=K1', 'table, h1'],
      ['/#/basis/leerplandoelen/wt?leerjaar=K1', '.b-go-doel'],
      ['/#/basis/leerplandoel/WT.086', '.b-go-deel'],
      ['/#/basis/leerplandoel/WT.008', '.b-go-deel'],
      ['/#/basis/lesplan/LP9999', 'h1'],
    ];
    const slecht = [];
    for (const [hash, wacht] of schermen) {
      await s.gaNaar(hash, wacht);
      if (!(await heeftEenKop(s.p))) slecht.push(`${hash}: main/h1`);
      if (!(await passtOpSmal(s.p))) slecht.push(`${hash}: scrollt horizontaal`);
    }
    check(`go 2: de schermen van het GO! (overzicht, lijsten, lessenlijn, doelen, onbekend lesplan) hebben op 390 px één main, één h1 en scrollen niet horizontaal${slecht.length ? ` (${slecht.join('; ')})` : ''}`, slecht.length === 0);

    // 3. De tabel wordt een kaart: elke cel een blok, de koprij verborgen, en een label boven de cel.
    await s.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-tabel');
    const kaart = await s.p.evaluate(() => {
      const t = document.querySelector('.b-lp-tabel');
      const td = t?.querySelector('td');
      const thead = t?.querySelector('thead');
      const th = thead ? getComputedStyle(thead) : null;
      return {
        tdBlok: td ? getComputedStyle(td).display === 'block' : false,
        koprijWeg: th ? parseFloat(th.height) <= 1 || th.display === 'none' : true,
        label: !!t?.querySelector('.b-lp-label'),
      };
    });
    check('go 3: op 390 px is een rij van de tabel een kaart (cellen onder elkaar, koprij verborgen, label boven de cel)', kaart.tdBlok && kaart.koprijWeg && kaart.label);
    // In LP0017 is de rij 'Misconcept' leeg (zo staat ze in het origineel): in de kaart verdwijnen de lege cellen echt.
    await s.gaNaar('/#/basis/lesplan/LP0017', '.b-lp-tabel');
    const leeg = await s.p.evaluate(() => {
      const cellen = [...document.querySelectorAll('.b-lp-tabel .b-lp-cel-leeg')];
      return { aantal: cellen.length, zichtbaar: cellen.filter((c) => getComputedStyle(c).display !== 'none').length };
    });
    check(`go 3: op 390 px verdwijnen de lege cellen uit de kaart (${leeg.aantal} leeg, ${leeg.zichtbaar} nog zichtbaar)`, leeg.aantal > 0 && leeg.zichtbaar === 0);
    await s.ctx.close();

    // 4. Breed blijft het een echte tabel.
    const b = await open(BREED);
    await b.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-tabel');
    const tabel = await b.p.evaluate(() => {
      const t = document.querySelector('.b-lp-tabel');
      const td = t?.querySelector('td');
      return { cel: td ? getComputedStyle(td).display === 'table-cell' : false, kolomkop: !!t?.querySelector('th[scope="col"]') };
    });
    check('go 4: op 1360 px is het een echte tabel (cellen als tabelcel, th scope="col")', tabel.cel && tabel.kolomkop);
    await b.ctx.close();
  };

  const sectieStap = async () => {
    // 5. ?stap=3 zet de focus op de kop van de derde stap, binnen het lesplan.
    const d = await open(BREED);
    await d.gaNaar('/#/basis/lesplan/LP0065?stap=3', '.b-lp-tabel');
    await sleep(300);
    const focus = await d.p.evaluate(() => {
      const a = document.activeElement;
      return { binnenTekst: !!a?.closest('.b-lp-tekst'), id: a?.id ?? '', tekst: (a?.textContent ?? '').trim().slice(0, 60) };
    });
    check(`go 5: ?stap=3 zet de focus op een plek in het lesplan zelf, bij stap 3 (id ${focus.id || 'leeg'})`, focus.binnenTekst && /^lp-/.test(focus.id) && /\b3\b/.test(focus.tekst));
    await d.ctx.close();
    // Zonder stap staat de focus niet in het lesplan (verse context: bij dezelfde pagina blijft de oude focus staan).
    const e = await open(BREED);
    await e.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-tabel');
    check('go 5: zonder ?stap staat de focus niet in het lesplan', !(await e.p.evaluate(() => !!document.activeElement?.closest('.b-lp-tekst'))));
    await e.ctx.close();
  };

  const sectieKoppeling = async () => {
    const d = await open(BREED);
    // 6. Het minimumdoel ODS_3410/92929 (kleuter 3.1.3) toont WT.086 en LP0001.
    await d.gaNaar('/#/basis/doel/ODS_3410/92929', '.b-go-bijdoel');
    const t6 = await tekst(d.p, '.b-go-bijdoel');
    check('go 6: de doelpagina ODS_3410/92929 toont WT.086 en het lesplan LP0001', /WT\.086/.test(t6) && /LP0001/.test(t6) && (await d.p.locator('.b-go-bijdoel a[href="#/basis/lesplan/LP0001"]').count()) >= 1);
    check('go 6: het deel heeft één h2 "Leerplan van het GO!" en de bronvermelding van het leerplan', (await d.p.locator('.b-go-bijdoel h2').count()) === 1 && /Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs\./.test(t6));
    // 7. WT.008: geen minimumdoel.
    await d.gaNaar('/#/basis/leerplandoel/WT.008', '.b-go-deel');
    check('go 7: WT.008 zegt dat het leerplan dit doel aan geen enkel minimumdoel koppelt', /koppelt dit doel aan geen enkel minimumdoel/.test(await tekst(d.p)));
    // 8. WT.086 toont zijn minimumdoelen en het lesplan.
    await d.gaNaar('/#/basis/leerplandoel/WT.086', '.b-go-deel');
    const t8 = await tekst(d.p);
    check('go 8: WT.086 toont de minimumdoelen 3.1.3 en 3.1.4 en het lesplan LP0001', /3\.1\.3/.test(t8) && /3\.1\.4/.test(t8) && /LP0001/.test(t8) && !/geen enkel minimumdoel/.test(t8));
    // 9. K1 toont het blok 'Van het GO!'.
    await d.gaNaar('/#/basis/leerjaar/gewoon/K1', 'main h2');
    await d.p.waitForSelector('.b-vango', { timeout: 15000 }).catch(() => {});
    const kop = d.p.locator('main h2', { hasText: /^Van het GO!$/ });
    check('go 9: de pagina van K1 toont het blok "Van het GO!" met een link naar #/basis/go', (await kop.count()) === 1 && (await d.p.locator('.b-vango a[href="#/basis/go"]').count()) >= 1);
    // Een leerjaar zonder leerplandoelen toont geen lege kop (Frans begint pas bij 10-11 jaar, maar de andere vakken hebben doelen): kleuter blijft dus gevuld.
    // 10. Het leerplan van een vak toont de bronvermelding en doelen.
    await d.gaNaar('/#/basis/leerplandoelen/wt?leerjaar=K1', '.b-go-doel');
    const t10 = await tekst(d.p);
    check('go 10: het leerplan wetenschap en techniek voor K1 toont WT.086 en de bronvermelding van het leerplan', /WT\.086/.test(t10) && /Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs, doelenset/.test(t10));
    await d.ctx.close();
  };

  const sectieMindmap = async () => {
    // 11. De mindmap in LP0014a en LP0014b staat erin, met een beschrijvende alt-tekst.
    const d = await open(BREED);
    for (const code of ['LP0014a', 'LP0014b']) {
      await d.gaNaar(`/#/basis/lesplan/${code}`, '.b-lp-tabel');
      // De afbeelding laadt lui: eerst in beeld brengen, dan wachten tot ze geladen is.
      await d.p.locator('.b-lp-beeld img').first().scrollIntoViewIfNeeded();
      await d.p.waitForFunction(() => { const f = document.querySelector('.b-lp-beeld img'); return !!f && f.complete && f.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
      const beeld = await d.p.evaluate(() => {
        const f = document.querySelector('.b-lp-beeld img');
        return f ? { alt: f.getAttribute('alt') ?? '', geladen: f.complete && f.naturalWidth > 0 } : null;
      });
      check(`go 11: ${code} toont de mindmap met een alt-tekst van minstens 20 tekens`, !!beeld && beeld.alt.length >= 20 && beeld.geladen);
    }
    await d.ctx.close();
  };

  const sectiePrint = async () => {
    // 12. De printstijl: geen kruimelpad en geen 'Ga naar', zwarte tekst op wit.
    const d = await open(BREED);
    await d.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-tabel');
    await d.p.emulateMedia({ media: 'print' });
    const print = await d.p.evaluate(() => {
      const weg = (s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; };
      const h1 = document.querySelector('.b-lesplan h1');
      return { kruimel: weg('.b-lesplan .b-kruimel'), ganaar: weg('.b-lp-ganaar'), kleur: h1 ? getComputedStyle(h1).color : '' };
    });
    check('go 12: in de printstijl staan kruimelpad en "Ga naar" niet op papier en is de koptekst zwart', print.kruimel && print.ganaar && print.kleur === 'rgb(0, 0, 0)');
    await d.ctx.close();
  };

  await Promise.all([sectieSmal(), sectieStap(), sectieKoppeling(), sectieMindmap(), sectiePrint()]);
}
