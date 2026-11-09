// Het laden van de gegevens van het GO!: strikte bestandsnamen, valideren bij het laden, een kleine cache en nette
// foutmeldingen. De bestanden zijn de echte uit public/basis/go/ (een goed bestand moet erdoor); de foute zijn kopieën
// waar iets aan stuk gemaakt is.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOUT_GO_NIET_GELADEN,
  GO_MAP,
  GoNietGevondenFout,
  MAX_LEERPLANNEN_IN_CACHE,
  goCacheGrootte,
  isGeldigMinimumdoelVak,
  isGeldigeLesplancode,
  laadGoBijMinimumdoel,
  laadGoIndex,
  laadGoLeerplan,
  laadGoLesplan,
  wisGoCache,
} from './goBron';
import type { GoVak } from './types';

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

beforeEach(() => wisGoCache());
afterEach(() => vi.unstubAllGlobals());

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

  it('weigert een index met een onbekend veld als beschadigd', async () => {
    const stuk = { ...(lees('index.json') as Record<string, unknown>), metadata: 'iets' };
    stubFetch({ 'index.json': () => antwoord(stuk) });
    await expect(laadGoIndex()).rejects.toThrow(/beschadigd/);
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
    await expect(laadGoLesplan('LP9999')).rejects.toThrow(/bestaat niet/);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(goCacheGrootte().lesplannen).toBe(0);
  });

  it('weigert een beschadigd lesplan, met de eerste fout erbij', async () => {
    const stuk = { ...(lees('lesplannen/LP0065.json') as Record<string, unknown>), onbekend: 1 };
    stubFetch({ 'lesplannen/LP0065.json': () => antwoord(stuk) });
    await expect(laadGoLesplan('LP0065')).rejects.toThrow(/Het lesplan LP0065 kon niet gelezen worden: het bestand is beschadigd/);
    expect(goCacheGrootte().lesplannen).toBe(0);
  });

  it('weigert een bestand dat bij een ander lesplan hoort', async () => {
    stubFetch({ 'lesplannen/LP0074.json': () => antwoord(lees('lesplannen/LP0065.json')) });
    await expect(laadGoLesplan('LP0074')).rejects.toThrow(/beschadigd/);
  });

  it('weigert een lesplan met een e-mailadres erin', async () => {
    const stuk = JSON.parse(JSON.stringify(lees('lesplannen/LP0065.json'))) as { delen: { blokken: { soort: string; tekst?: { t: string }[] }[] }[] };
    const alinea = stuk.delen[0].blokken.find((b) => b.soort === 'alinea');
    alinea?.tekst?.push({ t: ' mail naar iemand@voorbeeld.be' });
    stubFetch({ 'lesplannen/LP0065.json': () => antwoord(stuk) });
    await expect(laadGoLesplan('LP0065')).rejects.toThrow(/beschadigd/);
  });
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

  it('houdt hoogstens enkele leerplannen tegelijk in het geheugen; de oudste gaat eruit', async () => {
    const fn = stubFetch();
    const vakken: GoVak[] = ['SV', 'LL', 'IT', 'MV'];
    expect(vakken.length).toBe(MAX_LEERPLANNEN_IN_CACHE + 1);
    for (const v of vakken) await laadGoLeerplan(v);
    expect(goCacheGrootte().leerplannen).toBe(MAX_LEERPLANNEN_IN_CACHE);
    expect(fn).toHaveBeenCalledTimes(4);
    await laadGoLeerplan('MV'); // nog bewaard
    expect(fn).toHaveBeenCalledTimes(4);
    await laadGoLeerplan('SV'); // eruit gegaan: opnieuw opgehaald
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('weigert een bestand dat bij een ander vak hoort', async () => {
    stubFetch({ 'leerplan/SV.json': () => antwoord(lees('leerplan/LL.json')) });
    await expect(laadGoLeerplan('SV')).rejects.toThrow(/beschadigd/);
  });

  it('weigert een leerplan met een gat in de codes', async () => {
    const stuk = JSON.parse(JSON.stringify(lees('leerplan/SV.json'))) as { doelen: unknown[] };
    stuk.doelen.splice(3, 1);
    stubFetch({ 'leerplan/SV.json': () => antwoord(stuk) });
    await expect(laadGoLeerplan('SV')).rejects.toThrow(/Het leerplan SV kon niet gelezen worden/);
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

  it('weigert een bestand dat bij een ander vak hoort', async () => {
    stubFetch({ 'bij-minimumdoel/4.json': () => antwoord(lees('bij-minimumdoel/3.json')) });
    await expect(laadGoBijMinimumdoel(4)).rejects.toThrow(/beschadigd/);
  });

  it('een ontbrekend bestand is een GoNietGevondenFout', async () => {
    stubFetch({ 'bij-minimumdoel/2.json': () => antwoord(null, 404) });
    await expect(laadGoBijMinimumdoel(2)).rejects.toBeInstanceOf(GoNietGevondenFout);
  });
});
