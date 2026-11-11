// Rooktest van het leerplan en de lesplannen van het GO! (#/basis/go, /lesplan, /leerplandoel, ...), als losse module met
// een eigen uitvoerder (go-los.mjs). Ze wordt ook aangeroepen als sectie 20b-2d van tests/smoke.mjs. Kort (doel: onder een
// minuut) en zonder netwerk buiten de preview: de gegevens van het GO! komen uit dezelfde build.
//
//   export async function basisGo({ browser, BASE, check, errors, sleep })
//
// Eigen contexten zonder service worker en met een vaste klok vóór de eerste goto (behalve go 16, die de cache van de
// service worker zelf naleest). Pas de schermen niet aan om een check groen te krijgen: een rode check is een bevinding.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KLOK = '2026-11-02T10:00:00Z';
const BREED = 1360;
const SMAL = 390;

// De codes van de lesplannen staan niet vast: we lezen ze uit de gebouwde index, zodat elk nieuw lesplan dezelfde
// browsercontrole krijgt (één main, één h1, geen horizontaal scrollen op 390 px, de bronvermelding).
export async function leesLesplanCodes(BASE) {
  const antwoord = await fetch(`${BASE}/basis/go/index.json`);
  if (!antwoord.ok) throw new Error(`basis/go/index.json gaf ${antwoord.status}`);
  const index = await antwoord.json();
  const codes = (index.lesplannen ?? []).map((l) => l.code);
  if (codes.length < 8) throw new Error(`De index noemt ${codes.length} lesplannen, verwacht minstens 8`);
  return codes;
}

export async function basisGo({ browser, BASE, check, errors, sleep }) {
  console.log('20b-2d. Leerplan en lesplannen van het GO!');
  const GO_LESPLANNEN = await leesLesplanCodes(BASE);

  // `verwacht`: een consolefout die de check zelf uitlokt (een afgebroken of ontbrekend bestand) en dus geen bevinding is.
  // `klok`: false voor go 16; de vaste klok van Playwright vervangt `performance`, zodat de pagina geen resource-entries ziet.
  const open = async (breedte = BREED, extra = {}, verwacht = null, klok = true) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: breedte, height: 900 }, ...extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`pageerror(20b-2d): ${e.message}`));
    p.on('console', (m) => {
      if (m.type() !== 'error' || /ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
      if (verwacht && verwacht.test(m.text())) return;
      errors.push(`console(20b-2d): ${m.text()}`);
    });
    if (klok) await p.clock.setFixedTime(new Date(KLOK));
    const gaNaar = async (hash, wacht) => {
      await p.goto(BASE + hash, { waitUntil: 'networkidle' });
      if (wacht) await p.waitForSelector(wacht, { timeout: 20000 });
      await sleep(150);
    };
    return { ctx, p, gaNaar };
  };

  // Wacht tot de pagina stil staat (scrollY een paar beeldjes lang gelijk) in plaats van een vaste tijd.
  const rust = (p, beelden = 8) =>
    p.evaluate(
      (n) =>
        new Promise((klaar) => {
          let y = -1;
          let gelijk = 0;
          const stap = () => {
            if (window.scrollY === y) gelijk++;
            else {
              gelijk = 0;
              y = window.scrollY;
            }
            if (gelijk >= n) klaar(undefined);
            else requestAnimationFrame(stap);
          };
          requestAnimationFrame(stap);
        }),
      beelden,
    );
  const wachtOpStand = (p, stand) =>
    p.waitForFunction((v) => JSON.stringify([...document.querySelectorAll('main details')].map((e) => e.open)) === v, stand, { timeout: 5000 }).catch(() => {});

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
    check(`go 1: de ${GO_LESPLANNEN.length} lesplannen hebben op 390 px één main, één h1, geen horizontaal scrollen en de bronvermelding${mislukt.length ? ` (${mislukt.join('; ')})` : ''}`, mislukt.length === 0);

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
      return { aantal: cellen.length, hoog: cellen.filter((c) => c.offsetHeight > 0).length };
    });
    // De lege cel blijft in de kaart staan op hoogte 0 (niet display none): zo blijven de cellen erna onder hun eigen kolomkop hangen voor een schermlezer.
    check(`go 3: op 390 px nemen de lege cellen geen plaats in de kaart (${leeg.aantal} leeg, ${leeg.hoog} met hoogte)`, leeg.aantal > 0 && leeg.hoog === 0);
    // Elke rij heeft evenveel cellen als de koprij, ook de rijen onder een samengevoegde rijkop (Leskern wordt herhaald).
    for (const code of ['LP0017', 'LP0065']) {
      await s.gaNaar(`/#/basis/lesplan/${code}`, '.b-lp-tabel');
      const ongelijk = await s.p.evaluate(() => {
        const slecht = [];
        for (const t of document.querySelectorAll('.b-lp-tabel')) {
          const kop = [...t.querySelectorAll('thead tr > *')].filter((c) => getComputedStyle(c).display !== 'none').length;
          if (!kop) continue;
          for (const r of t.querySelectorAll('tbody > tr')) {
            const n = [...r.children].filter((c) => getComputedStyle(c).display !== 'none').length;
            if (n !== kop) slecht.push(`${r.id}: ${n} van ${kop}`);
          }
        }
        return slecht;
      });
      check(`go 3: op 390 px heeft in ${code} elke rij van een tabel evenveel cellen als de koprij${ongelijk.length ? ` (${ongelijk.slice(0, 4).join('; ')})` : ''}`, ongelijk.length === 0);
    }
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
    // Het langste woord van de rijkoppen ('Leerplandoelen') past op één regel.
    const gebroken = await b.p.evaluate(() => {
      const uit = [];
      for (const kop of document.querySelectorAll('.b-lp-rijkop')) {
        const walker = document.createTreeWalker(kop, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const m of n.textContent.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1) uit.push(m[0]);
          }
        }
      }
      return uit;
    });
    check(`go 4: op 1360 px staat geen woord van een rijkop over twee regels${gebroken.length ? ` (${gebroken.slice(0, 3).join(', ')})` : ''}`, gebroken.length === 0);
    await b.ctx.close();
  };

  const sectieStap = async () => {
    // 5. ?stap=3 zet de focus op de kop van de derde stap, binnen het lesplan.
    const d = await open(BREED);
    await d.gaNaar('/#/basis/lesplan/LP0065?stap=3', '.b-lp-tabel');
    await d.p.waitForFunction(() => !!document.activeElement?.closest('.b-lp-tekst'), null, { timeout: 10000 }).catch(() => {});
    await rust(d.p);
    const focus = await d.p.evaluate(() => {
      const a = document.activeElement;
      const top = a ? a.getBoundingClientRect().top : -1;
      const balk = document.querySelector('.b-lp-ganaar')?.getBoundingClientRect().bottom ?? 0;
      return { binnenTekst: !!a?.closest('.b-lp-tekst'), id: a?.id ?? '', tekst: (a?.textContent ?? '').trim().slice(0, 60), top, balk };
    });
    check(`go 5: ?stap=3 zet de focus op een plek in het lesplan zelf, bij stap 3 (id ${focus.id || 'leeg'})`, focus.binnenTekst && /^lp-/.test(focus.id) && /\b3\b/.test(focus.tekst));
    check(`go 5: na ?stap=3 begint het gefocuste element minstens 6 px onder de rand van het scherm en onder de balk "Ga naar" (top ${Math.round(focus.top)}, balk ${Math.round(focus.balk)})`, focus.top >= 6 && focus.top >= focus.balk);
    // De tabindex verdwijnt als de focus weggaat: een latere klik in die cel geeft geen ring rond de hele cel.
    await d.p.locator('.b-lp-h1').click();
    const rest = await d.p.evaluate(() => document.querySelectorAll('.b-lp-tekst [tabindex="-1"]').length);
    check(`go 5: na een klik elders staat er geen tabindex -1 meer in de tekst van het lesplan (${rest})`, rest === 0);
    await d.ctx.close();
    // De balk "Ga naar" blijft bovenaan staan en een sprong landt eronder, op een laptop en op een telefoon.
    for (const breedte of [BREED, SMAL]) {
      const k = await open(breedte);
      await k.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-ganaar');
      await k.p.locator('.b-lp-ganaar a', { hasText: 'Lesopbouw' }).click();
      await k.p.waitForFunction(() => !!document.activeElement?.closest('.b-lp-tekst'), null, { timeout: 10000 }).catch(() => {});
      await rust(k.p);
      const balk = await k.p.evaluate(() => {
        const b = document.querySelector('.b-lp-ganaar')?.getBoundingClientRect();
        const a = document.activeElement;
        return { top: b?.top ?? -1, bottom: b?.bottom ?? 0, actief: a ? a.getBoundingClientRect().top : -1, y: window.scrollY, breed: document.documentElement.scrollWidth <= window.innerWidth + 1 };
      });
      check(`go 5: op ${breedte} px blijft "Ga naar" bovenaan staan na een sprong (top ${Math.round(balk.top)}, scrolt ${Math.round(balk.y)} px) en landt het doel eronder (${Math.round(balk.actief)} >= ${Math.round(balk.bottom)})`, balk.y > 1000 && Math.abs(balk.top) < 1 && balk.actief >= balk.bottom && balk.breed);
      await k.ctx.close();
    }
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
    // De tekst van een minimumdoel komt uit de officiële gegevens: wachten tot die er staan (geen vaste tijd), dan nakijken.
    await d.p.waitForSelector('.b-go-minimumtekst', { timeout: 15000 }).catch(() => {});
    const officieel = await d.p.evaluate(() => ({
      teksten: [...document.querySelectorAll('.b-go-minimumtekst')].map((e) => (e.textContent ?? '').trim()),
      verdwenen: /staat niet meer in de officiële gegevens/.test(document.querySelector('main')?.textContent ?? ''),
    }));
    check(
      `go 8: bij WT.086 staat de officiële tekst van 3.1.3 en 3.1.4 (${officieel.teksten.length} teksten) en niet "staat niet meer in de officiële gegevens"`,
      officieel.teksten.length === 2 && officieel.teksten.every((t) => t.length > 20) && /levenscyclus/.test(officieel.teksten[0]) && !officieel.verdwenen,
    );
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
    // 10b. De lijst is compact (pakket GE15): op 1280x768 staan na de eerste kop minstens 3 doelen helemaal op het eerste scherm
    // (gemeten 4 bij K1, met veel lesplanlinks; als losse kaarten waren het er 2), de doelzin blijft breed genoeg, en op
    // 390 px scrolt niets horizontaal.
    const l = await open(1280, { viewport: { width: 1280, height: 768 } });
    await l.gaNaar('/#/basis/leerplandoelen/wt?leerjaar=K1', '.b-go-doelen > .b-go-doel');
    const eerste = await l.p.evaluate(() => {
      const lijst = document.querySelector('.b-go-doelen');
      const kop = lijst.previousElementSibling;
      window.scrollTo(0, kop.getBoundingClientRect().top + window.scrollY - 8);
      const doelen = [...document.querySelectorAll('.b-go-doelen > .b-go-doel')];
      const zicht = doelen.filter((x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length;
      const tekst = document.querySelector('.b-go-doeltekst');
      const fs = parseFloat(getComputedStyle(tekst).fontSize);
      return { zicht, tekens: tekst.getBoundingClientRect().width / (fs * 0.5) };
    });
    check(`go 10b: leerplandoelen K1 op 1280x768: ${eerste.zicht} doelen helemaal op het eerste scherm (minstens 3; vroeger als losse kaarten 2), doelzin ongeveer ${Math.round(eerste.tekens)} tekens breed (minstens 40)`, eerste.zicht >= 3 && eerste.tekens >= 40);
    await l.ctx.close();
    const sm = await open(SMAL);
    await sm.gaNaar('/#/basis/leerplandoelen/wt?leerjaar=K1', '.b-go-doel');
    check('go 10c: leerplandoelen K1 op 390 px scrollen niet horizontaal', await passtOpSmal(sm.p));
    await sm.ctx.close();
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
      const rij = document.querySelector('.b-lp-tabel tr');
      const kop = document.querySelector('.b-lp-tekst h2');
      return {
        kruimel: weg('.b-lesplan .b-kruimel'),
        ganaar: weg('.b-lp-ganaar'),
        acties: weg('.b-lp-acties'),
        scherm: [...document.querySelectorAll('.b-lp-scherm')].every((e) => getComputedStyle(e).display === 'none') && document.querySelectorAll('.b-lp-scherm').length > 0,
        kleur: h1 ? getComputedStyle(h1).color : '',
        rij: rij ? getComputedStyle(rij).breakInside : '',
        kop: kop ? getComputedStyle(kop).breakAfter : '',
      };
    });
    check('go 12: in de printstijl staan kruimelpad en "Ga naar" niet op papier en is de koptekst zwart', print.kruimel && print.ganaar && print.kleur === 'rgb(0, 0, 0)');
    check(`go 12: op papier staan de knop Afdrukken en de links zonder eigen tekst ("In het lesplan", het materiaal) niet, een rij mag breken (${print.rij}) en een kop blijft bij zijn tekst (${print.kop})`, print.acties && print.scherm && print.rij !== 'avoid' && print.kop === 'avoid');
    // Het aantal bladzijden bewaakt dat er geen halflege bladen terugkomen (A4 staand, 10 mm marge): was 19, daarna 16.
    const pdf = await d.p.pdf({ format: 'A4', margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
    const bladen = Math.max(0, ...[...pdf.toString('latin1').matchAll(/\/Count (\d+)/g)].map((m) => Number(m[1])));
    check(`go 12: LP0065 telt op A4 hoogstens 17 bladzijden (${bladen})`, bladen > 0 && bladen <= 17);
    await d.ctx.close();
  };

  const sectieNietGevonden = async () => {
    // 13. Een lesplan dat niet bestaat, met een echte 404 zoals op GitHub Pages (vite preview geeft daar index.html met 200).
    const d = await open(BREED, {}, /status of 404/);
    await d.p.route('**/basis/go/lesplannen/LP9999.json', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: '404' }));
    await d.gaNaar('/#/basis/lesplan/LP9999', 'h1');
    await d.p.waitForSelector('main h1:has-text("Dit lesplan vonden we niet")', { timeout: 10000 }).catch(() => {});
    const h1 = ((await d.p.locator('main h1').first().textContent()) ?? '').trim();
    check(`go 13: bij een echte 404 toont #/basis/lesplan/LP9999 "Dit lesplan vonden we niet" (h1: ${h1})`, h1 === 'Dit lesplan vonden we niet' && (await heeftEenKop(d.p)));
    await d.ctx.close();
  };

  const sectieChunkWeg = async () => {
    // 14. Laadt de chunk van het GO!-blok niet (offline, oud tabblad na een uitrol), dan blijft de pagina staan. Op de
    // leerjaarpagina valt het blok stil weg; op de doelpagina zegt het deel dat het niet geladen is, met een knop.
    const leerjaar = await open(BREED, {}, /ERR_FAILED/);
    let weg = 0;
    await leerjaar.p.route('**/assets/VanHetGo-*.js', (r) => { weg++; return r.abort(); });
    await leerjaar.gaNaar('/#/basis/leerjaar/gewoon/K1', 'main h2');
    for (let i = 0; i < 50 && weg === 0; i++) await sleep(100); // wacht tot de chunk echt gevraagd en afgebroken is
    await rust(leerjaar.p, 4);
    const h1Leerjaar = ((await leerjaar.p.locator('main h1').first().textContent().catch(() => '')) ?? '').trim();
    check(
      `go 14: zonder de chunk VanHetGo blijft de leerjaarpagina K1 staan, zonder het blok (afgebroken: ${weg}, h1: ${h1Leerjaar})`,
      weg > 0 && (await heeftEenKop(leerjaar.p)) && h1Leerjaar === 'Wat geldt voor je 1ste kleuterklas?' && (await leerjaar.p.locator('.b-vango').count()) === 0,
    );
    await leerjaar.ctx.close();

    const doel = await open(BREED, {}, /ERR_FAILED/);
    let weg2 = 0;
    await doel.p.route('**/assets/GoBijDoel-*.js', (r) => { weg2++; return r.abort(); });
    await doel.gaNaar('/#/basis/doel/ODS_3410/92929', 'main h1');
    await doel.p.waitForSelector('.b-go-bijdoel', { timeout: 10000 }).catch(() => {});
    const h1Doel = ((await doel.p.locator('main h1').first().textContent().catch(() => '')) ?? '').trim();
    const deel = doel.p.locator('.b-go-bijdoel');
    const deelTekst = (await deel.count()) === 1 ? await deel.innerText() : '';
    check(
      `go 14: zonder de chunk GoBijDoel blijft de doelpagina staan, met de kop "Leerplan van het GO!", een melding en een knop (afgebroken: ${weg2}, h1: ${h1Doel})`,
      weg2 > 0 &&
        (await heeftEenKop(doel.p)) &&
        h1Doel === 'Minimumdoel 3.1.3' &&
        (await deel.locator('h2', { hasText: /^Leerplan van het GO!$/ }).count()) === 1 &&
        /kon niet geladen worden/.test(deelTekst) &&
        (await deel.locator('button', { hasText: 'Opnieuw proberen' }).count()) === 1,
    );
    await doel.ctx.close();
  };

  const sectieWaterval = async () => {
    // 15. Een lesplan vraagt de index samen met het lesplan, niet pas als het lesplan er staat.
    const d = await open(BREED);
    const volgorde = [];
    d.p.on('request', (r) => { if (/\/basis\/go\/index\.json$/.test(r.url())) volgorde.push('index vertrekt'); });
    d.p.on('requestfinished', (r) => { if (/\/basis\/go\/lesplannen\/LP0065\.json$/.test(r.url())) volgorde.push('lesplan binnen'); });
    await d.gaNaar('/#/basis/lesplan/LP0065', '.b-go-chip');
    const index = volgorde.indexOf('index vertrekt');
    check(`go 15: op #/basis/lesplan/LP0065 vertrekt de index vóór het lesplan binnen is (${volgorde.join(', ')})`, index !== -1 && index < volgorde.indexOf('lesplan binnen'));
    await d.ctx.close();
  };

  const sectieOffline = async () => {
    // 16. Na één bezoek staan de gegevens van de pagina in de cache van de service worker (offline bruikbaar), ook wat de
    // pagina al laadde voor de service worker er was. We lezen de cache zelf na: een offline herladen hangt af van de
    // cachekoppen van vite preview.
    const d = await open(BREED, { serviceWorkers: 'allow' }, null, false);
    await d.gaNaar('/#/basis/lesplan/LP0065', '.b-go-chip');
    const bediend = await d.p.evaluate(
      () =>
        new Promise((klaar) => {
          if (!navigator.serviceWorker) return klaar(false);
          if (navigator.serviceWorker.controller) return klaar(true);
          navigator.serviceWorker.addEventListener('controllerchange', () => klaar(true), { once: true });
          setTimeout(() => klaar(!!navigator.serviceWorker.controller), 15000);
        }),
    );
    const paden = ['basis/go/lesplannen/LP0065.json', 'basis/go/index.json', 'basis/go/leerplan/WT.json', 'leerplannen/minimumdoelen/index.json'];
    // De service worker bewaart op de achtergrond: lees na tot alles er staat (hoogstens 10 s), geen vaste wachttijd.
    const bewaard = await d.p.evaluate(async (lijst) => {
      const map = location.href.split('#')[0].replace(/[^/]*$/, '');
      let uit = lijst;
      for (let i = 0; i < 50 && uit.length > 0; i++) {
        uit = [];
        for (const pad of lijst) if (!(await caches.match(map + pad, { ignoreVary: true }))) uit.push(pad);
        if (uit.length > 0) await new Promise((r) => setTimeout(r, 200));
      }
      return uit;
    }, paden);
    check(`go 16: na één bezoek aan LP0065 bewaart de service worker het lesplan, de index, het leerplan WT en de index van de minimumdoelen (bediend: ${bediend}${bewaard.length ? `; ontbreekt: ${bewaard.join(', ')}` : ''})`, bediend && bewaard.length === 0);
    await d.ctx.close();
  };


  const sectieDoelpagina = async () => {
    // 17. Wie het buitengewoon basisonderwijs koos, komt vanaf het GO! op de tweeling met hetzelfde nummer (SB-SB-2).
    const keuze = { storageState: { cookies: [], origins: [{ origin: new URL(BASE).origin, localStorage: [{ name: 'wf.basis.keuze.v1', value: JSON.stringify({ v: 1, soort: 'bubao', leerjaar: 'L3' }) }] }] } };
    const b = await open(BREED, keuze);
    await b.gaNaar('/#/basis/leerplandoel/WT.006', '.b-go-ref-link');
    await b.p.waitForFunction(() => document.querySelector('.b-go-ref-link')?.getAttribute('href')?.includes('ODS_3469'), null, { timeout: 15000 }).catch(() => {});
    const bubaoLink = await b.p.locator('.b-go-ref-link').first().getAttribute('href');
    check(`go 17: met keuze buitengewoon gaat de eerste link op #/basis/leerplandoel/WT.006 naar ODS_3469/92738 (${bubaoLink})`, /ODS_3469\/92738$/.test(bubaoLink ?? ''));
    await b.gaNaar('/#/basis/leerplandoelen/wt?leerjaar=L3', '.b-go-chip');
    await b.p.waitForFunction(() => [...document.querySelectorAll('.b-go-chip')].every((a) => !/\/ODS_34(0|1|2)\d\//.test(a.getAttribute('href') ?? '')), null, { timeout: 15000 }).catch(() => {});
    const gewoneChips = await b.p.evaluate(() => [...document.querySelectorAll('.b-go-chip')].filter((a) => /\/ODS_3(39\d|40\d|41\d|42\d)\//.test(a.getAttribute('href') ?? '')).length);
    check(`go 17: met keuze buitengewoon wijst geen enkele chip in de lijst WT 8-9 jaar nog naar een gewone set (${gewoneChips} over)`, gewoneChips === 0);
    await b.ctx.close();
    const g = await open(BREED);
    await g.gaNaar('/#/basis/leerplandoel/WT.006', '.b-go-ref-link');
    check('go 17: zonder keuze gaat de eerste link op WT.006 naar de gewone set ODS_3408/92738', /ODS_3408\/92738$/.test((await g.p.locator('.b-go-ref-link').first().getAttribute('href')) ?? ''));
    await g.ctx.close();

    // 18. 'Toon de andere' blijft open na Terug, en de pagina springt niet (SB-SB-8).
    const t = await open(BREED);
    await t.gaNaar('/#/basis/doel/ODS_3410/92590', '.b-go-meer');
    const knop = t.p.locator('.b-go-meer > summary').first();
    const y0 = await t.p.evaluate(() => scrollY);
    await knop.scrollIntoViewIfNeeded();
    const yVoor = await t.p.evaluate(() => scrollY);
    await knop.click();
    await t.p.waitForFunction(() => document.querySelector('.b-go-meer')?.open === true, null, { timeout: 5000 }).catch(() => {});
    await rust(t.p, 4);
    const yNa = await t.p.evaluate(() => scrollY);
    check(`go 18: openen van "Toon de andere" laat de pagina staan (scrollY ${Math.round(yVoor)} naar ${Math.round(yNa)}, begin ${Math.round(y0)})`, Math.abs(yNa - yVoor) <= 2 && (await t.p.locator('.b-go-meer').first().evaluate((e) => e.open)));
    const link = t.p.locator('.b-go-meer a[href$="/basis/leerplandoel/WT.039"], .b-go-meer a[href$="#/basis/leerplandoel/WT.039"]').first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await t.p.waitForSelector('.b-go-deel', { timeout: 15000 });
    await t.p.goBack();
    await t.p.waitForSelector('.b-go-bijdoel', { timeout: 15000 });
    await t.p.waitForFunction(() => document.querySelector('.b-go-meer')?.open === true, null, { timeout: 5000 }).catch(() => {});
    await rust(t.p);
    const na = await t.p.evaluate(() => {
      const d = document.querySelector('.b-go-meer');
      const a = d?.querySelector('a[href$="/basis/leerplandoel/WT.039"]');
      const r = a?.getBoundingClientRect();
      return { open: !!d?.open, top: r ? r.top : -9999, hoogte: innerHeight };
    });
    check(`go 18: na Terug staat "Toon de andere" nog open en staat WT.039 in beeld (open ${na.open}, top ${Math.round(na.top)} van ${na.hoogte})`, na.open && na.top >= 0 && na.top <= na.hoogte);
    await t.ctx.close();

    // 19. Op papier staat wat achter een dichte uitklapper zit, en na het afdrukken is de pagina weer zoals ze was.
    const d = await open(BREED);
    const A4 = { format: 'A4', margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } };
    const tekstUitPdf = async (hash, wacht) => {
      await d.gaNaar(hash, wacht);
      const voor = await d.p.evaluate(() => [...document.querySelectorAll('main details')].map((e) => e.open));
      await d.p.emulateMedia({ media: 'print' });
      const pdf = await d.p.pdf(A4);
      await d.p.emulateMedia({ media: 'screen' });
      await wachtOpStand(d.p, JSON.stringify(voor));
      const na = await d.p.evaluate(() => [...document.querySelectorAll('main details')].map((e) => e.open));
      // Alleen een ontbrekend pdftotext (ENOENT) geeft null; elke andere fout gooit de check stuk in plaats van stil groen.
      const dir = mkdtempSync(join(tmpdir(), 'boosterz-pdf-'));
      let uit = null;
      try {
        writeFileSync(join(dir, 'p.pdf'), pdf);
        uit = execFileSync('pdftotext', ['-layout', join(dir, 'p.pdf'), '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
      } catch (e) {
        if (e?.code !== 'ENOENT') throw e;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      return { voor, na, uit };
    };
    // Zonder pdftotext is de controle op papier niet mogelijk: dat is rood, tenzij je het bewust toelaat met
    // GO_ZONDER_PDFTOTEXT=1; dan staat er zichtbaar OVERGESLAGEN en geen teruggevallen getal.
    const zonderPdftotext = process.env.GO_ZONDER_PDFTOTEXT === '1';
    const opPapier = (r, naam, ok) => {
      if (r.uit !== null) check(naam, ok(r.uit));
      else if (zonderPdftotext) console.log(`  - OVERGESLAGEN: ${naam} (geen pdftotext)`);
    };
    for (const [i, [hash, aantal]] of [['/#/basis/doel/ODS_3410/92590', 22], ['/#/basis/doel/ODS_3409/92822', 41]].entries()) {
      const r = await tekstUitPdf(hash, '.b-go-bijdoel');
      if (i === 0) check('go 19: pdftotext is beschikbaar voor de controle op papier (of GO_ZONDER_PDFTOTEXT=1)', r.uit !== null || zonderPdftotext);
      const codes = r.uit === null ? null : new Set(r.uit.match(/WT\.\d{3}/g) ?? []).size;
      const dood = r.uit === null ? null : /Toon (alle|de \d+ andere|het andere)/.test(r.uit);
      opPapier(r, `go 19: ${hash} telt op papier ${aantal} leerplandoelen (${codes}), zonder dode tekst "Toon de andere" (${dood})`, () => codes === aantal && !dood);
      check(`go 19: ${hash} staat na het afdrukken weer zoals ervoor (uitklappers ${JSON.stringify(r.voor) === JSON.stringify(r.na)})`, JSON.stringify(r.voor) === JSON.stringify(r.na) && r.voor.length > 0);
    }
    const w = await tekstUitPdf('/#/basis/leerplandoel/WT.235', '.b-go-deel');
    opPapier(w, 'go 19: #/basis/leerplandoel/WT.235 heeft de twijfelzin op papier', (t) => /koppelt het aan minimumdoel 3\.3\.2, een doel voor het einde van het 6de leerjaar/.test(t));
    // Een uitklapper die de leerkracht zelf opende, blijft ook na het afdrukken open; de rest gaat weer dicht.
    await d.gaNaar('/#/basis/doel/ODS_3410/92590', '.b-go-meer');
    await d.p.locator('.b-go-meer > summary').first().click();
    await d.p.waitForFunction(() => document.querySelector('.b-go-meer')?.open === true, null, { timeout: 5000 }).catch(() => {});
    const voorOpen = await d.p.evaluate(() => [...document.querySelectorAll('main details')].map((e) => e.open));
    await d.p.emulateMedia({ media: 'print' });
    await d.p.pdf(A4);
    await d.p.emulateMedia({ media: 'screen' });
    await wachtOpStand(d.p, JSON.stringify(voorOpen));
    const naOpen = await d.p.evaluate(() => ({ stand: [...document.querySelectorAll('main details')].map((e) => e.open), staat: history.state?.usr?.goMeer ?? null }));
    check(`go 19: een door de leerkracht geopend blok blijft na het afdrukken open, de rest gaat dicht (state ${JSON.stringify(naOpen.staat)})`, JSON.stringify(voorOpen) === JSON.stringify(naOpen.stand) && voorOpen.includes(true));
    await d.ctx.close();
  };

  // E1-navigatie: 'Alle leeftijden' en het vinkje staan in het adres, de navigatie volgt de keuze, het leerjaar van een lessenlijn is niet 'je leerjaar'.
  const bewaar = (k) => ({ storageState: { cookies: [], origins: [{ origin: new URL(BASE).origin, localStorage: [{ name: 'wf.basis.keuze.v1', value: JSON.stringify({ v: 1, ...k }) }] }] } });
  const sectieNavigatie = async () => {
    // CT-2: bewaard leerjaar L3; 'Alle leeftijden' en het vinkje blijven na een doel openen en Terug.
    const a = await open(BREED, bewaar({ soort: 'bao', leerjaar: 'L3' }));
    await a.gaNaar('/#/basis/leerplandoelen/wi', '.b-go-aantal');
    const status = () => a.p.locator('.b-go-aantal').first().innerText();
    const voor = await status();
    await a.p.getByRole('button', { name: /Alle leeftijden/ }).click();
    await a.p.waitForFunction(() => /van de 998 leerplandoelen\.$/.test(document.querySelector('.b-go-aantal')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    await a.p.getByLabel(/Alleen doelen zonder minimumdoel/).check();
    await a.p.waitForFunction(() => /zonder minimumdoel\.$/.test(document.querySelector('.b-go-aantal')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const mid = await status();
    await a.p.locator('a[href*="/leerplandoel/WI."]').first().click();
    await a.p.waitForSelector('.b-go-deel', { timeout: 15000 });
    await a.p.goBack();
    await a.p.waitForSelector('.b-go-aantal', { timeout: 15000 });
    await a.p.waitForFunction((m) => (document.querySelector('.b-go-aantal')?.textContent ?? '').trim() === m, mid.trim(), { timeout: 5000 }).catch(() => {});
    const na = await status();
    check(`go 20: bewaard leerjaar L3, WI: begin "${voor.trim()}", met Alle leeftijden en vinkje "${mid.trim()}", na een doel openen en Terug "${na.trim()}"`, /voor 8-9 jaar/.test(voor) && /^\d+ van de 998 leerplandoelen, zonder minimumdoel\.$/.test(mid.trim()) && na.trim() === mid.trim() && /^53 van de 998/.test(na.trim()));
    // Lesplannen: de kruimel "Lesplannen" vanuit een lesplan geeft ze allemaal, ook met bewaard leerjaar L3.
    await a.gaNaar('/#/basis/lesplan/LP0065', '.b-lp-bron');
    await a.p.locator('main a[href*="/lesplannen?leerjaar=alle"]', { hasText: /^Lesplannen$/ }).first().click();
    await a.p.waitForSelector('.b-go-aantal', { timeout: 15000 });
    const lijst = await a.p.locator('.b-go-aantal').first().innerText();
    check(`go 20: de kruimel "Lesplannen" vanuit LP0065 toont alle ${GO_LESPLANNEN.length} lesplannen, ook met bewaard leerjaar L3 (${lijst.trim()})`, lijst.trim() === `${GO_LESPLANNEN.length} lesplannen van de ${GO_LESPLANNEN.length}.`);
    await a.ctx.close();

    // SB-SB-1: met keuze buitengewoon K1 wijst de navigatie op het GO! naar het buitengewoon onderwijs.
    const b = await open(BREED, bewaar({ soort: 'bubao', leerjaar: 'K1' }));
    await b.gaNaar('/#/basis/go', 'h1');
    await b.p.waitForFunction(() => document.querySelector('.b-nav a[href*="moment"]')?.getAttribute('href')?.includes('buitengewoon'), null, { timeout: 15000 }).catch(() => {});
    const doelen = await b.p.locator('.b-nav a', { hasText: /^Doelen$/ }).getAttribute('href');
    const zoeken = await b.p.locator('.b-nav a', { hasText: /^Zoeken$/ }).getAttribute('href');
    check(`go 21: met keuze buitengewoon K1 wijst "Doelen" op #/basis/go naar einde-kleuter van het buitengewoon onderwijs (${doelen}), "Zoeken" naar soort=buitengewoon (${zoeken})`, /moment\/buitengewoon\/einde-kleuter$/.test(doelen ?? '') && /soort=buitengewoon/.test(zoeken ?? ''));
    await b.ctx.close();

    // SB-SB-3: '(je leerjaar)' komt alleen uit de bewaarde keuze, niet uit ?leerjaar in het adres.
    const c = await open(BREED);
    await c.gaNaar('/#/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=K1', 'table');
    const zonderKeuze = (await tekst(c.p)).includes('(je leerjaar)');
    await c.ctx.close();
    const d = await open(BREED, bewaar({ soort: 'bao', leerjaar: 'K1' }));
    await d.gaNaar('/#/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=L3', 'table');
    const metKeuze = (await tekst(d.p)).includes('(je leerjaar)');
    await d.ctx.close();
    check(`go 22: de lessenlijn zegt zonder keuze geen "(je leerjaar)" (${zonderKeuze}) en met keuze K1 wel (${metKeuze})`, !zonderKeuze && metKeuze);

    // CT-4: zoeken op een code van het GO!.
    const e = await open(BREED);
    const sets = [];
    e.p.on('request', (r) => { if (/ODS_\d+\.json/.test(r.url())) sets.push(r.url()); });
    await e.gaNaar('/#/basis/zoek?q=WT.999', 'h1');
    await e.p.waitForFunction(() => /staat niet in het leerplan/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const onbekend = await tekst(e.p);
    check(`go 23: zoeken op WT.999 zegt dat de code niet in het leerplan staat, zonder "Gevonden" en zonder "Geen doelen gevonden" (${sets.length} sets geladen)`, /WT\.999 staat niet in het leerplan van het GO!/.test(onbekend) && !/Gevonden|Geen doelen gevonden/.test(onbekend) && sets.length === 0);
    await e.gaNaar('/#/basis/zoek?q=(WT.086)', 'h1');
    await e.p.waitForSelector('a[href$="/leerplandoel/WT.086"]', { timeout: 15000 });
    const bestaat = await tekst(e.p);
    check('go 23: zoeken op "(WT.086)" geeft een link naar het leerplandoel, zonder "Geen doelen gevonden"', !/Geen doelen gevonden/.test(bestaat) && /Bij het GO!/.test(bestaat));
    await e.ctx.close();
  };

  const sectieWisselen = async () => {
    // 24. In één pagina (zonder herladen) van het ene vak naar het andere: de kop en het eerste doel zijn die van het nieuwe vak.
    const w = await open(BREED);
    await w.gaNaar('/#/basis/leerplandoelen/wt', '.b-go-doel');
    const eerste = async (vak, kop, code) => {
      await w.p.evaluate((h) => { location.hash = h; }, `#/basis/leerplandoelen/${vak}`);
      await w.p.waitForFunction((k) => document.querySelector('main h1')?.textContent?.trim() === k, kop, { timeout: 15000 }).catch(() => {});
      await w.p.waitForFunction((c) => document.querySelector('.b-go-doel')?.textContent?.includes(c), code, { timeout: 15000 }).catch(() => {});
      return w.p.evaluate(() => ({ h1: document.querySelector('main h1')?.textContent?.trim() ?? '', code: (document.querySelector('.b-go-doel')?.textContent ?? '').match(/[A-Z]{2}\.\d{3}/)?.[0] ?? '' }));
    };
    const nl = await eerste('nl', 'Leerplan van het GO!: Nederlands', 'NL.001');
    check(`go 24: van #/basis/leerplandoelen/wt naar .../nl in dezelfde pagina toont de kop "${nl.h1}" en als eerste doel ${nl.code}`, nl.h1 === 'Leerplan van het GO!: Nederlands' && nl.code === 'NL.001');
    const wt = await eerste('wt', 'Leerplan van het GO!: wetenschap en techniek', 'WT.001');
    check(`go 24: en terug naar .../wt toont "${wt.h1}" en als eerste doel ${wt.code}`, /wetenschap en techniek/.test(wt.h1) && wt.code === 'WT.001');
    await w.ctx.close();

    // 25. Met een bewaard leerjaar kies je 'Alle leeftijden' op de lijst van de leerplandoelen en op die van de lesplannen: dan staat alles er.
    const a = await open(BREED, bewaar({ soort: 'bao', leerjaar: 'L3' }));
    await a.gaNaar('/#/basis/leerplandoelen/wi', '.b-go-aantal');
    await a.p.getByRole('button', { name: /Alle leeftijden/ }).click();
    await a.p.waitForFunction(() => /van de 998 leerplandoelen\.$/.test(document.querySelector('.b-go-aantal')?.textContent?.trim() ?? ''), null, { timeout: 15000 }).catch(() => {});
    const doelen = await a.p.evaluate(() => ({ status: document.querySelector('.b-go-aantal')?.textContent?.trim() ?? '', li: document.querySelectorAll('li.b-go-doel').length, pressed: document.querySelector('.b-pil-knop[aria-pressed="true"]')?.textContent?.trim() ?? '' }));
    check(`go 25: bewaard L3, WI: met Alle leeftijden staan alle 998 leerplandoelen in de lijst (${doelen.status}; ${doelen.li} in de lijst; ingedrukt: ${doelen.pressed})`, /^998 van de 998 leerplandoelen\.$/.test(doelen.status) && doelen.li === 998 && doelen.pressed === 'Alle leeftijden');
    await a.gaNaar('/#/basis/lesplannen', '.b-go-aantal');
    const voor = (await a.p.locator('.b-go-aantal').first().innerText()).trim();
    await a.p.getByRole('button', { name: /Alle leeftijden/ }).click();
    await a.p.waitForFunction((n) => new RegExp(`^${n} lesplannen van de ${n}\\.$`).test(document.querySelector('.b-go-aantal')?.textContent?.trim() ?? ''), GO_LESPLANNEN.length, { timeout: 15000 }).catch(() => {});
    const plannen = await a.p.evaluate(() => ({ status: document.querySelector('.b-go-aantal')?.textContent?.trim() ?? '', codes: new Set([...document.querySelectorAll('main a[href*="/basis/lesplan/"]')].map((l) => l.getAttribute('href').split('/').pop())).size, pressed: document.querySelector('.b-pil-knop[aria-pressed="true"]')?.textContent?.trim() ?? '' }));
    check(`go 25: bewaard L3, lesplannen: begin "${voor}", met Alle leeftijden staan alle ${GO_LESPLANNEN.length} lesplannen er (${plannen.status}; ${plannen.codes} links)`, plannen.status === `${GO_LESPLANNEN.length} lesplannen van de ${GO_LESPLANNEN.length}.` && plannen.codes === GO_LESPLANNEN.length && plannen.pressed === 'Alle leeftijden');
    await a.ctx.close();
  };

  const sectieVoorstel = async () => {
    // 26. Vorm B (WI.706, beslissing van de eigenaar van 11 november 2026): de officiële koppeling met 4.2.3 blijft staan,
    // 2.4.3 staat ernaast als voorstel. Op 390 px, met de officiële teksten geladen.
    const LABEL = 'voorstel, nog niet bevestigd door het GO!';
    const v = await open(SMAL);
    await v.gaNaar('/#/basis/leerplandoel/WI.706', '.b-go-ref-link');
    // Wachten tot beide kaarten hun officiële tekst hebben (een tekst kan uit meer dan één blok bestaan).
    const metTekst = () => [...document.querySelectorAll('.b-go-ref')].filter((li) => li.querySelector('.b-go-minimumtekst')).length;
    await v.p.waitForFunction(`(${metTekst.toString()})() >= 2`, null, { timeout: 15000 }).catch(() => {});
    const wi = await v.p.evaluate(() => ({
      links: [...document.querySelectorAll('.b-go-ref-link')].map((a) => a.getAttribute('href') ?? ''),
      labels: [...document.querySelectorAll('.b-go-deel .badge-warn')].map((b) => (b.textContent ?? '').trim()),
      zinnen: [...document.querySelectorAll('.b-go-deel .b-go-voorstel')].map((x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim()),
      teksten: [...document.querySelectorAll('.b-go-ref')].filter((li) => li.querySelector('.b-go-minimumtekst')).length,
      zeker: [...document.querySelectorAll('.b-go-deel summary')].some((x) => /Hoe zeker is dit\?/.test(x.textContent ?? '')),
    }));
    check(
      `go 26: WI.706 toont de officiële koppeling 4.2.3 en daarna 2.4.3 als voorstel met het label (${wi.links.join(', ')}; labels: ${wi.labels.join(' | ')}; ${wi.teksten} teksten)`,
      wi.links.length === 2 && /\/ODS_3411\/92500$/.test(wi.links[0]) && /\/ODS_3405\/93005$/.test(wi.links[1]) && wi.labels.length === 1 && wi.labels[0] === LABEL && wi.teksten === 2,
    );
    check(
      `go 26: WI.706 zegt waarom ("${wi.zinnen.join(' | ')}") en houdt "Hoe zeker is dit?" bij 4.2.3`,
      wi.zinnen.length === 1 && wi.zinnen[0] === 'Het GO! verwijst naar 4.2.3, een minimumdoel van aardrijkskunde. Waarschijnlijk is 2.4.3 bedoeld.' && wi.zeker,
    );
    check('go 26: WI.706 heeft op 390 px één main, één h1 en scrolt niet horizontaal', (await heeftEenKop(v.p)) && (await passtOpSmal(v.p)));
    const bijWi = () =>
      v.p.evaluate(() => {
        const li = document.getElementById('b-go-bij-WI.706');
        return { tekst: (li?.textContent ?? '').replace(/\s+/g, ' '), label: (li?.querySelector('.badge-warn')?.textContent ?? '').trim(), link: li?.querySelector('.b-go-voorstel a')?.getAttribute('href') ?? '' };
      });
    await v.gaNaar('/#/basis/doel/ODS_3405/93005', '#b-go-bij-WI\\.706');
    const d1 = await bijWi();
    check(`go 26: de doelpagina van 2.4.3 (ODS_3405/93005) toont WI.706 met het label en "In het leerplan staat “4.2.3”" (${d1.label})`, d1.label === LABEL && /In het leerplan staat “4\.2\.3”\. Waarschijnlijk is 2\.4\.3 bedoeld\./.test(d1.tekst));
    await v.gaNaar('/#/basis/doel/ODS_3411/92500', '#b-go-bij-WI\\.706');
    const d2 = await bijWi();
    check(
      `go 26: de doelpagina van 4.2.3 (ODS_3411/92500) toont WI.706 met de twijfel en het voorstel 2.4.3, met een link (${d2.link})`,
      d2.label === LABEL && /Het GO! verwijst naar 4\.2\.3, een minimumdoel van aardrijkskunde\. Waarschijnlijk is 2\.4\.3( \(minimumdoel\))? bedoeld\./.test(d2.tekst) && /Hoe zeker is dit\?/.test(d2.tekst) && /\/ODS_3405\/93005$/.test(d2.link),
    );
    check('go 26: de doelpagina van 4.2.3 heeft op 390 px één main, één h1 en scrolt niet horizontaal', (await heeftEenKop(v.p)) && (await passtOpSmal(v.p)));
    await v.ctx.close();
  };

  await Promise.all([sectieSmal(), sectieStap(), sectieKoppeling(), sectieMindmap(), sectiePrint(), sectieWisselen(), sectieNietGevonden(), sectieChunkWeg(), sectieWaterval(), sectieOffline(), sectieDoelpagina(), sectieNavigatie(), sectieVoorstel()]);
}
