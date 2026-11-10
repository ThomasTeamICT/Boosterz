// Het laden van de gegevens van het GO!: strikte bestandsnamen, de lichte controle bij het laden, een kleine cache (de minst
// recent gebruikte gaat eruit) en foutmeldingen in gewone woorden. De bestanden zijn de echte uit public/basis/go/ (een goed
// bestand moet erdoor); de foute zijn kopieën waar iets aan stuk gemaakt is.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BelofteCache,
  FOUT_GO_NIET_GELADEN,
  GO_MAP,
  GoNietGevondenFout,
  MAX_LEERPLANNEN_IN_CACHE,
  goCacheGrootte,
  isGoNietGevonden,
  isGeldigMinimumdoelVak,
  isGeldigeLesplancode,
  laadGoBijMinimumdoel,
  laadGoIndex,
  laadGoLeerplan,
  laadGoLesplan,
  wisGoCache,
} from './goBron';
import { GO_VAK_CODES, type GoVak } from './types';

const MAP = join(fileURLToPath(new URL('../../../../', import.meta.url)), 'public', 'basis', 'go');
const lees = (bestand: string): unknown => JSON.parse(readFileSync(join(MAP, bestand), 'utf8'));

function antwoord(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Nagebootste fetch: geeft de echte bestanden terug, of wat de test in `anders` zet. */
function stubFetch(anders: Record<string, () => Response | Promise<Response>> = {}) {
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input);
    const bestand = url.slice(url.indexOf('basis/go/') + 'basis/go/'.length);
    if (anders[bestand]) return anders[bestand]();
    try {
      return antwoord(lees(bestand));
    } catch {
      return antwoord(null, 404);
    }
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const urls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map((c) => String(c[0]));

/** Het advies bij een bestand dat niet door de controle komt: herladen helpt bij een tabblad met oude code. */
const HERLADEN = 'kon niet gelezen worden. Laad de pagina opnieuw; lukt het dan nog niet, probeer het later nog eens.';

/** De melding van een mislukte belofte. */
async function melding(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('de belofte lukte');
}

let waarschuwing: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  wisGoCache();
  waarschuwing = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  waarschuwing.mockRestore();
});

describe('de bestandsnamen', () => {
  it('de map ligt naast de app', () => {
    expect(GO_MAP).toMatch(/basis\/go\/$/);
  });

  it('een lesplancode heeft één vorm', () => {
    for (const goed of ['LP0001', 'LP0065', 'LP0014a', 'LP0014b', 'LP9999z']) expect(isGeldigeLesplancode(goed), goed).toBe(true);
    for (const fout of ['lp0065', 'LP65', 'LP00650', 'LP0065A', 'LP0065ab', 'LP0065/../x', '../LP0065', 'LP0065.json', '', ' LP0065'])
      expect(isGeldigeLesplancode(fout), fout).toBe(false);
  });

  it('het vak van het minimumdoel loopt van 1 tot 10', () => {
    for (const goed of [1, 5, 10]) expect(isGeldigMinimumdoelVak(goed), String(goed)).toBe(true);
    for (const fout of [0, 11, -1, 1.5, NaN, Infinity]) expect(isGeldigMinimumdoelVak(fout), String(fout)).toBe(false);
  });

  it('een ongeldige naam wordt geweigerd zonder iets op te halen', async () => {
    const fn = stubFetch();
    await expect(laadGoLesplan('../index')).rejects.toThrow(/Ongeldige lesplancode/);
    await expect(laadGoLesplan('lp0065')).rejects.toThrow(/Ongeldige lesplancode/);
    await expect(laadGoLeerplan('XX' as GoVak)).rejects.toThrow(/Ongeldig vak/);
    await expect(laadGoLeerplan('../WT' as GoVak)).rejects.toThrow(/Ongeldig vak/);
    await expect(laadGoBijMinimumdoel(0)).rejects.toThrow(/Ongeldig vak van het minimumdoel/);
    await expect(laadGoBijMinimumdoel(11)).rejects.toThrow(/Ongeldig vak van het minimumdoel/);
    await expect(laadGoBijMinimumdoel(1.5)).rejects.toThrow(/Ongeldig vak van het minimumdoel/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('laadGoIndex', () => {
  it('haalt de index één keer op, ook bij meer dan één aanroep, en valideert hem', async () => {
    const fn = stubFetch();
    const [a, b] = await Promise.all([laadGoIndex(), laadGoIndex()]);
    const c = await laadGoIndex();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(urls(fn)[0]).toMatch(/basis\/go\/index\.json$/);
    expect(a.kind).toBe('go-index');
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a.lesplannen.length).toBeGreaterThan(0);
  });

  it('geeft een Nederlandse foutmelding bij een netwerkfout en probeert daarna opnieuw', async () => {
    let poging = 0;
    const fn = stubFetch({
      'index.json': () => {
        poging++;
        if (poging === 1) throw new TypeError('Failed to fetch');
        return antwoord(lees('index.json'));
      },
    });
    await expect(laadGoIndex()).rejects.toThrow(FOUT_GO_NIET_GELADEN);
    expect(FOUT_GO_NIET_GELADEN).toBe('De gegevens van het GO! konden niet geladen worden. Kijk je internetverbinding na en probeer opnieuw.');
    const index = await laadGoIndex();
    expect(index.kind).toBe('go-index');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('een serverfout of onleesbare json geeft dezelfde melding', async () => {
    stubFetch({ 'index.json': () => antwoord(null, 500) });
    await expect(laadGoIndex()).rejects.toThrow(FOUT_GO_NIET_GELADEN);
    wisGoCache();
    stubFetch({ 'index.json': () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) as unknown as Response });
    await expect(laadGoIndex()).rejects.toThrow(FOUT_GO_NIET_GELADEN);
  });

  it('aanvaardt een index met een onbekend optioneel veld (een uitrol met een nieuw veld breekt geen open tabblad)', async () => {
    const extra = { ...(lees('index.json') as Record<string, unknown>), nieuwVeld: 'iets' };
    stubFetch({ 'index.json': () => antwoord(extra) });
    expect((await laadGoIndex()).kind).toBe('go-index');
  });

  it('weigert een index met een misvormde lijst, in gewone woorden en met het detail alleen in de console', async () => {
    const stuk = { ...(lees('index.json') as Record<string, unknown>), lesplannen: 'geen lijst' };
    stubFetch({ 'index.json': () => antwoord(stuk) });
    const m = await melding(laadGoIndex());
    expect(m).toBe(`Het overzicht van het GO! ${HERLADEN}`);
    expect(m).not.toMatch(/lesplannen|lijst|beschadigd|index/);
    expect(waarschuwing).toHaveBeenCalledWith('Boosterz: Het overzicht van het GO!', ['lesplannen: geen lijst']);
  });

  it('weigert een index van een nieuwere versie (v 2) met het advies de pagina opnieuw te laden', async () => {
    stubFetch({ 'index.json': () => antwoord({ ...(lees('index.json') as Record<string, unknown>), v: 2 }) });
    expect(await melding(laadGoIndex())).toBe(`Het overzicht van het GO! ${HERLADEN}`);
  });
});

describe('laadGoLesplan', () => {
  it('haalt het bestand van de code op, valideert het en bewaart het', async () => {
    const fn = stubFetch();
    const a = await laadGoLesplan('LP0065');
    const b = await laadGoLesplan('LP0065');
    expect(urls(fn)).toHaveLength(1);
    expect(urls(fn)[0]).toMatch(/basis\/go\/lesplannen\/LP0065\.json$/);
    expect(a.code).toBe('LP0065');
    expect(b).toBe(a);
  });

  it('kent de kleine letter van een code met a of b', async () => {
    const fn = stubFetch();
    expect((await laadGoLesplan('LP0014a')).code).toBe('LP0014a');
    expect(urls(fn)[0]).toMatch(/lesplannen\/LP0014a\.json$/);
  });

  it('een ontbrekend bestand is een GoNietGevondenFout, en blijft niet in de cache', async () => {
    const fn = stubFetch();
    await expect(laadGoLesplan('LP9999')).rejects.toBeInstanceOf(GoNietGevondenFout);
    expect(await melding(laadGoLesplan('LP9999'))).toBe('Het lesplan LP9999 bestaat niet (meer).');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(goCacheGrootte().lesplannen).toBe(0);
  });

  it('isGoNietGevonden herkent de melding van een ontbrekend bestand, en geen andere melding', async () => {
    stubFetch();
    expect(isGoNietGevonden(await melding(laadGoLesplan('LP9999')))).toBe(true);
    expect(isGoNietGevonden(FOUT_GO_NIET_GELADEN)).toBe(false);
    const stuk = { ...(lees('lesplannen/LP0065.json') as Record<string, unknown>), delen: 'stuk' };
    stubFetch({ 'lesplannen/LP0065.json': () => antwoord(stuk) });
    expect(isGoNietGevonden(await melding(laadGoLesplan('LP0065')))).toBe(false);
    expect(isGoNietGevonden(await melding(laadGoLesplan('lp0065')))).toBe(false);
  });

  it('weigert een lesplan met een misvormd deel, zonder het detail van de controle op het scherm', async () => {
    const stuk = { ...(lees('lesplannen/LP0065.json') as Record<string, unknown>), delen: 'stuk' };
    stubFetch({ 'lesplannen/LP0065.json': () => antwoord(stuk) });
    expect(await melding(laadGoLesplan('LP0065'))).toBe(`Het lesplan LP0065 ${HERLADEN}`);
    expect(waarschuwing).toHaveBeenCalledWith('Boosterz: Het lesplan LP0065', ['delen: geen lijst']);
    expect(goCacheGrootte().lesplannen).toBe(0);
  });

  it('aanvaardt een lesplan met een onbekend optioneel veld', async () => {
    const extra = { ...(lees('lesplannen/LP0065.json') as Record<string, unknown>), onbekend: 1 };
    stubFetch({ 'lesplannen/LP0065.json': () => antwoord(extra) });
    expect((await laadGoLesplan('LP0065')).code).toBe('LP0065');
  });

  it('weigert een bestand dat bij een ander lesplan hoort', async () => {
    stubFetch({ 'lesplannen/LP0074.json': () => antwoord(lees('lesplannen/LP0065.json')) });
    expect(await melding(laadGoLesplan('LP0074'))).toBe(`Het lesplan LP0074 ${HERLADEN}`);
    expect(waarschuwing).toHaveBeenCalledWith('Boosterz: Het lesplan LP0074', ['het bestand hoort bij een ander lesplan (LP0065)']);
  });
  // Persoonsgegevens en de volledige vorm bewaakt de uitrolpoort (goBestanden.test.ts, valideer.ts), niet de app.
});

describe('laadGoLeerplan', () => {
  it('haalt het bestand van het vak op en bewaart het', async () => {
    const fn = stubFetch();
    const a = await laadGoLeerplan('SV');
    const b = await laadGoLeerplan('SV');
    expect(urls(fn)).toHaveLength(1);
    expect(urls(fn)[0]).toMatch(/basis\/go\/leerplan\/SV\.json$/);
    expect(a.vak).toBe('SV');
    expect(b).toBe(a);
  });

  it('houdt alle twaalf leerplannen in het geheugen: heen en weer tussen vakken haalt niets opnieuw op', async () => {
    const fn = stubFetch();
    expect(MAX_LEERPLANNEN_IN_CACHE).toBe(GO_VAK_CODES.length);
    for (const v of GO_VAK_CODES) await laadGoLeerplan(v);
    expect(goCacheGrootte().leerplannen).toBe(12);
    for (const v of GO_VAK_CODES) await laadGoLeerplan(v);
    expect(fn).toHaveBeenCalledTimes(12);
  });

  it('weigert een bestand dat bij een ander vak hoort; het leerplan heet zoals de doelenset', async () => {
    stubFetch({ 'leerplan/WT.json': () => antwoord(lees('leerplan/LL.json')) });
    expect(await melding(laadGoLeerplan('WT'))).toBe(`Het leerplan wetenschap en techniek van het GO! ${HERLADEN}`);
  });

  it('weigert een leerplan met een doel zonder inhoud', async () => {
    const stuk = JSON.parse(JSON.stringify(lees('leerplan/SV.json'))) as { doelen: Record<string, unknown>[] };
    delete stuk.doelen[3].inhoud;
    stubFetch({ 'leerplan/SV.json': () => antwoord(stuk) });
    expect(await melding(laadGoLeerplan('SV'))).toBe(`Het leerplan sociale vaardigheden van het GO! ${HERLADEN}`);
    expect(waarschuwing).toHaveBeenCalledWith('Boosterz: Het leerplan sociale vaardigheden van het GO!', ['doelen[3] (SV.004).inhoud: geen lijst']);
  });
});

describe('BelofteCache', () => {
  const klaar = (w: string) => () => Promise.resolve(w);

  it('boven de grens gaat het minst recent gebruikte eruit; een gebruikt bestand blijft staan', async () => {
    const cache = new BelofteCache<string>(3);
    const maak = vi.fn(klaar('x'));
    for (const s of ['WT', 'WI', 'NL']) await cache.haal(s, maak);
    await cache.haal('WT', maak); // treffer: WT is nu het meest recent gebruikt
    expect(maak).toHaveBeenCalledTimes(3);
    await cache.haal('AA', maak); // WI gaat eruit, niet WT
    expect(cache.grootte).toBe(3);
    await cache.haal('WT', maak);
    expect(maak).toHaveBeenCalledTimes(4);
    await cache.haal('WI', maak); // eruit gegaan: opnieuw gemaakt
    expect(maak).toHaveBeenCalledTimes(5);
  });

  it('een mislukte poging blijft er niet in staan', async () => {
    const cache = new BelofteCache<string>(2);
    await expect(cache.haal('WT', () => Promise.reject(new Error('weg')))).rejects.toThrow('weg');
    expect(cache.grootte).toBe(0);
    expect(await cache.haal('WT', klaar('terug'))).toBe('terug');
  });
});

describe('laadGoBijMinimumdoel', () => {
  it('haalt het bestand van het vak op en bewaart het', async () => {
    const fn = stubFetch();
    const a = await laadGoBijMinimumdoel(3);
    const b = await laadGoBijMinimumdoel(3);
    expect(urls(fn)).toHaveLength(1);
    expect(urls(fn)[0]).toMatch(/basis\/go\/bij-minimumdoel\/3\.json$/);
    expect(a.vak).toBe(3);
    expect(b).toBe(a);
  });

  it('weigert een bestand dat bij een ander vak hoort, met een melding in het enkelvoud en zonder vaknummer', async () => {
    stubFetch({ 'bij-minimumdoel/4.json': () => antwoord(lees('bij-minimumdoel/3.json')) });
    expect(await melding(laadGoBijMinimumdoel(4))).toBe(`Het leerplan van het GO! bij dit minimumdoel ${HERLADEN}`);
  });

  it('een ontbrekend bestand is een GoNietGevondenFout', async () => {
    stubFetch({ 'bij-minimumdoel/2.json': () => antwoord(null, 404) });
    await expect(laadGoBijMinimumdoel(2)).rejects.toBeInstanceOf(GoNietGevondenFout);
    expect(await melding(laadGoBijMinimumdoel(2))).toBe('Het leerplan van het GO! bij dit minimumdoel bestaat niet (meer).');
  });
});
