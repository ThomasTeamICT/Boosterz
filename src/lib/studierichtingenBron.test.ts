import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOUT_NIET_GELADEN, wisMinimumdoelenCache } from './minimumdoelenBron';
import {
  FOUT_BESCHADIGD,
  FOUT_NOG_NIET_OPGEHAALD,
  FOUT_STUDIERICHTINGEN,
  MAX_RICHTINGEN_IN_CACHE,
  STRUCTUUR_MAP,
  laadKaderGegevens,
  laadMatrix,
  laadRichtingDoelen,
  laadRichtingDoelenIndex,
  laadRichtingGegevens,
  wisStudierichtingenCache,
} from './studierichtingenBron';
import { valideerMatrixBestand, valideerRichtingDoelenBestand, valideerRichtingDoelenIndex } from './studierichtingen';

// ── Hulpmiddelen ────────────────────────────────────────────────────────────

const SHA = 'ab'.repeat(32);
const TIJD = '2026-10-09T00:00:00Z';

function matrixJson(groepen: string[] = ['G-0100']) {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'https://x.test/', api: 'https://x.test/api', naamsvermelding: 'Bron: test', licentie: 'test',
    opgehaald: TIJD, aantalGroepen: groepen.length, aantalOnderdelen: groepen.length, sha256: SHA,
    groepen: groepen.map((nummer, i) => ({ nummer, titel: `Richting ${nummer}`, graad: '2', finaliteit: 'DO', onderdelen: [100 + i] })),
    onderdelen: groepen.map((nummer, i) => ({ nummer: 100 + i, groep: nummer, titel: `Richting ${nummer}`, leerjaren: [{ code: '1' }], hoofdstructuren: ['311'] })),
  };
}

function koppelingJson(regels: unknown[] = [
  { groep: 'G-0100', status: 'gekoppeld', methode: 'api', aantal: 2, sets: 1, sha256: SHA, opgehaald: TIJD, bestand: 'G-0100.json' },
  { groep: 'G-0200', status: 'geen', opgehaald: TIJD },
]) {
  return { app: 'boosterz', kind: 'richtingdoelen-index', v: 1, bron: 'https://x.test/', api: 'https://x.test/api', naamsvermelding: 'Bron: test', licentie: 'test', matrixSha256: SHA, groepen: regels };
}

function richtingJson(groep: string) {
  return {
    app: 'boosterz', kind: 'richtingdoelen', v: 1, groep, titel: `Richting ${groep}`, graad: '2', methode: 'api', filter: `structuuronderdeel_groep_nummer=${groep}`,
    bron: 'https://x.test/', api: 'https://x.test/api', naamsvermelding: 'Bron: test', licentie: 'test', opgehaald: TIJD, aantal: 2, sha256: SHA,
    sets: [{ set: 'ODS_1', setSha: '0123456789abcdef', setAantal: 2, ids: ['1', '2'] }],
  };
}

function minimumdoelenIndexJson() {
  return {
    app: 'boosterz', kind: 'minimumdoelen-index', v: 1, naamsvermelding: 'Bron: test', licentie: 'test',
    sets: [{ id: 'ODS_1', naam: 'Secundair onderwijs 2de graad - Vak - Test - Eindtermen', aantal: 2, sha256: SHA, opgehaald: TIJD, bestand: 'ODS_1.json' }],
  };
}

function koppen(soort: string) {
  return { get: (naam: string) => (naam.toLowerCase() === 'content-type' ? soort : null) };
}

function antwoord(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: koppen('application/json'), json: async () => body } as unknown as Response;
}

/**
 * Wat een dev- of previewserver geeft voor een bestand dat er niet is: 200 met de startpagina van de app (html). De json()
 * gooit een fout die NIET op json lijkt: zo bewijst een test dat de lader naar het content-type kijkt vóór hij leest.
 */
function startpagina() {
  return {
    ok: true, status: 200, headers: koppen('text/html; charset=utf-8'),
    json: async () => { throw new Error('html mag niet als json gelezen worden'); },
  } as unknown as Response;
}

/** Een 200 zonder (bruikbaar) content-type waarvan de inhoud geen json is. */
function geenJson() {
  return {
    ok: true, status: 200, headers: koppen(''),
    json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
  } as unknown as Response;
}

/** Nagebootste fetch: de handler krijgt de hele url en geeft een antwoord (of gooit). */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: unknown) => handler(String(input)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Een gewone server: wat in `bestanden` staat (op het einde van de url), anders 404. */
function server(bestanden: Record<string, unknown>) {
  return stubFetch((url) => {
    const sleutel = Object.keys(bestanden).find((k) => url.endsWith(k));
    return sleutel === undefined ? antwoord({}, 404) : antwoord(bestanden[sleutel]);
  });
}

const urls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  wisStudierichtingenCache();
  wisMinimumdoelenCache();
});
afterEach(() => vi.unstubAllGlobals());

// ── De nagebootste bestanden zijn zelf geldig ───────────────────────────────

describe('de hulpbestanden van deze test', () => {
  it('slagen voor de validators van studierichtingen.ts', () => {
    expect(valideerMatrixBestand(matrixJson())).toEqual([]);
    expect(valideerMatrixBestand(matrixJson(['G-0100', 'G-0200', 'G-0300']))).toEqual([]);
    expect(valideerRichtingDoelenIndex(koppelingJson())).toEqual([]);
    expect(valideerRichtingDoelenBestand(richtingJson('G-0100'), 'G-0100')).toEqual([]);
  });
});

// ── Foutteksten ─────────────────────────────────────────────────────────────

describe('foutteksten', () => {
  it('zijn Vlaams Nederlands en zonder jargon', () => {
    expect(FOUT_NOG_NIET_OPGEHAALD).toBe('De lijst van de studierichtingen staat nog niet in Boosterz. Ze wordt elke maand opgehaald bij de Vlaamse overheid.');
    expect(FOUT_STUDIERICHTINGEN).toBe('De studierichtingen konden niet geladen worden. Controleer je verbinding en probeer opnieuw.');
    expect(FOUT_BESCHADIGD).toMatch(/beschadigd/);
    for (const t of [FOUT_NOG_NIET_OPGEHAALD, FOUT_STUDIERICHTINGEN, FOUT_BESCHADIGD]) {
      expect(t).not.toMatch(/\bG-\d|ODS_|structuuronderdeel|widget/i);
    }
  });
});

// ── laadMatrix ──────────────────────────────────────────────────────────────

describe('laadMatrix', () => {
  it('haalt de matrix één keer op, ook bij meer dan één aanroep, uit de map met de structuur', async () => {
    const f = server({ 'structuur/studierichtingen.json': matrixJson() });
    const [a, b] = await Promise.all([laadMatrix(), laadMatrix()]);
    const c = await laadMatrix();
    expect(f).toHaveBeenCalledTimes(1);
    expect(urls(f)[0]).toBe(`${STRUCTUUR_MAP}studierichtingen.json`);
    expect(STRUCTUUR_MAP).toMatch(/leerplannen\/structuur\/$/);
    expect(a.groepen.map((g) => g.nummer)).toEqual(['G-0100']);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('een bestand dat niet bestaat (404) geeft FOUT_NOG_NIET_OPGEHAALD, en een nieuwe poging haalt opnieuw op', async () => {
    const f = stubFetch(() => antwoord({}, 404));
    await expect(laadMatrix()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
    await expect(laadMatrix()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('een netwerkfout of een andere status geeft FOUT_STUDIERICHTINGEN; daarna kan het opnieuw', async () => {
    let poging = 0;
    const f = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      if (poging === 2) return antwoord({}, 503);
      return antwoord(matrixJson());
    });
    await expect(laadMatrix()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    await expect(laadMatrix()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    const matrix = await laadMatrix();
    expect(matrix.groepen).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('een 200 met de startpagina (html), zoals een dev- of previewserver bij een ontbrekend bestand, is "nog niet opgehaald"', async () => {
    const f = stubFetch(() => startpagina());
    // Geen verbindingsfout (FOUT_STUDIERICHTINGEN): dat zou de leerkracht doen zoeken naar een probleem dat er niet is.
    await expect(laadMatrix()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
    await expect(laadMatrix()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
    // De belofte is gewist: een nieuwe poging haalt opnieuw op, en slaagt zodra het bestand er wel is.
    expect(f).toHaveBeenCalledTimes(2);
    stubFetch(() => antwoord(matrixJson()));
    expect((await laadMatrix()).groepen).toHaveLength(1);
  });

  it('een 200 die geen json is (ook zonder content-type) is "nog niet opgehaald"', async () => {
    stubFetch(() => geenJson());
    await expect(laadMatrix()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
  });

  it('een fout tijdens het lezen van het antwoord (de verbinding valt weg) blijft FOUT_STUDIERICHTINGEN', async () => {
    stubFetch(() => ({ ok: true, status: 200, headers: koppen('application/json'), json: async () => { throw new TypeError('network error'); } }) as unknown as Response);
    await expect(laadMatrix()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
  });

  it('een bestand met een verkeerde vorm geeft FOUT_BESCHADIGD met de eerste reden', async () => {
    for (const kapot of [
      { ...matrixJson(), kind: 'iets-anders' },
      { ...matrixJson(), aantalGroepen: 99 },
      { ...matrixJson(), groepen: 'geen lijst' },
      { ...matrixJson(), sha256: 'abc' },
      null,
      [],
    ]) {
      wisStudierichtingenCache();
      stubFetch(() => antwoord(kapot));
      await expect(laadMatrix()).rejects.toThrow(FOUT_BESCHADIGD);
    }
  });
});

// ── laadRichtingDoelenIndex ─────────────────────────────────────────────────

describe('laadRichtingDoelenIndex', () => {
  it('haalt de index één keer op, uit de submap richtingdoelen', async () => {
    const f = server({ 'richtingdoelen/index.json': koppelingJson() });
    const [a, b] = await Promise.all([laadRichtingDoelenIndex(), laadRichtingDoelenIndex()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(urls(f)[0]).toBe(`${STRUCTUUR_MAP}richtingdoelen/index.json`);
    expect(b).toBe(a);
    expect(a?.groepen.map((r) => r.groep)).toEqual(['G-0100', 'G-0200']);
  });

  it('een bestand dat niet bestaat is null (de koppeling is nog niet opgehaald), en dat is geen fout', async () => {
    const f = stubFetch(() => antwoord({}, 404));
    expect(await laadRichtingDoelenIndex()).toBeNull();
    expect(await laadRichtingDoelenIndex()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('een 200 met de startpagina (html) of zonder json is ook "nog niet opgehaald": null, en geen fout', async () => {
    const f = stubFetch(() => startpagina());
    expect(await laadRichtingDoelenIndex()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    wisStudierichtingenCache();
    stubFetch(() => geenJson());
    expect(await laadRichtingDoelenIndex()).toBeNull();
  });

  it('een fout tijdens het lezen van het antwoord blijft een fout', async () => {
    stubFetch(() => ({ ok: true, status: 200, headers: koppen('application/json'), json: async () => { throw new TypeError('network error'); } }) as unknown as Response);
    await expect(laadRichtingDoelenIndex()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
  });

  it('een andere fout gooit en wist de belofte: een nieuwe poging haalt opnieuw op', async () => {
    let poging = 0;
    const f = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      if (poging === 2) return antwoord({}, 500);
      return antwoord(koppelingJson());
    });
    await expect(laadRichtingDoelenIndex()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    await expect(laadRichtingDoelenIndex()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    expect((await laadRichtingDoelenIndex())?.groepen).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('een bestand met een verkeerde vorm geeft FOUT_BESCHADIGD', async () => {
    for (const kapot of [{ ...koppelingJson(), kind: 'x' }, { ...koppelingJson(), matrixSha256: 'x' }, koppelingJson([{ groep: 'G-1', status: 'gekoppeld' }]), 'tekst']) {
      wisStudierichtingenCache();
      stubFetch(() => antwoord(kapot));
      await expect(laadRichtingDoelenIndex()).rejects.toThrow(FOUT_BESCHADIGD);
    }
  });
});

// ── laadRichtingDoelen ──────────────────────────────────────────────────────

describe('laadRichtingDoelen', () => {
  it('weigert een ongeldig groepnummer zonder iets op te halen', async () => {
    const f = server({});
    for (const groep of ['', 'g-0193', 'G-1', 'G-01234567', 'G-0193/../index', '../G-0193', 'G-0193.json', ' G-0193', 'ODS_1', 'G-0A93', 'index']) {
      await expect(laadRichtingDoelen(groep)).rejects.toThrow(/Ongeldig groepnummer/);
    }
    await expect(laadRichtingDoelen(undefined as unknown as string)).rejects.toThrow(/Ongeldig groepnummer/);
    await expect(laadRichtingDoelen(42 as unknown as string)).rejects.toThrow(/Ongeldig groepnummer/);
    expect(f).not.toHaveBeenCalled();
  });

  it('haalt het bestand van een groep op en onthoudt het', async () => {
    const f = stubFetch((url) => antwoord(richtingJson(url.match(/(G-\d+)\.json$/)![1])));
    const a = await laadRichtingDoelen('G-0193');
    const b = await laadRichtingDoelen('G-0193');
    expect(f).toHaveBeenCalledTimes(1);
    expect(urls(f)[0]).toBe(`${STRUCTUUR_MAP}richtingdoelen/G-0193.json`);
    expect(a?.groep).toBe('G-0193');
    expect(b).toBe(a);
  });

  it('een groep zonder bestand (404) is null', async () => {
    stubFetch(() => antwoord({}, 404));
    expect(await laadRichtingDoelen('G-0193')).toBeNull();
  });

  it('een 200 met de startpagina (html) of zonder json is ook null, en geen fout', async () => {
    stubFetch(() => startpagina());
    expect(await laadRichtingDoelen('G-0193')).toBeNull();
    wisStudierichtingenCache();
    stubFetch(() => geenJson());
    expect(await laadRichtingDoelen('G-0193')).toBeNull();
  });

  it('een fout tijdens het lezen van het antwoord blijft een fout', async () => {
    stubFetch(() => ({ ok: true, status: 200, headers: koppen('application/json'), json: async () => { throw new TypeError('network error'); } }) as unknown as Response);
    await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_STUDIERICHTINGEN);
  });

  it('een bestand van een andere groep is een fout (en blijft niet in de cache)', async () => {
    const f = stubFetch(() => antwoord(richtingJson('G-0999')));
    await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_BESCHADIGD);
    await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_BESCHADIGD);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('een bestand met een verkeerde vorm is een fout', async () => {
    for (const kapot of [{ ...richtingJson('G-0193'), aantal: 99 }, { ...richtingJson('G-0193'), kind: 'x' }, { ...richtingJson('G-0193'), sets: 'nee' }, null]) {
      wisStudierichtingenCache();
      stubFetch(() => antwoord(kapot));
      await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_BESCHADIGD);
    }
  });

  it('een netwerkfout of een andere status is FOUT_STUDIERICHTINGEN; daarna kan het opnieuw', async () => {
    let poging = 0;
    const f = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      if (poging === 2) return antwoord({}, 500);
      return antwoord(richtingJson('G-0193'));
    });
    await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    await expect(laadRichtingDoelen('G-0193')).rejects.toThrow(FOUT_STUDIERICHTINGEN);
    expect((await laadRichtingDoelen('G-0193'))?.groep).toBe('G-0193');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('houdt hoogstens 20 richtingen in het geheugen: de oudste gaat eruit', async () => {
    expect(MAX_RICHTINGEN_IN_CACHE).toBe(20);
    const f = stubFetch((url) => antwoord(richtingJson(url.match(/(G-\d+)\.json$/)![1])));
    const groep = (n: number) => `G-${String(n).padStart(4, '0')}`;
    for (let n = 1; n <= 21; n++) await laadRichtingDoelen(groep(n));
    expect(f).toHaveBeenCalledTimes(21);
    await laadRichtingDoelen(groep(21));
    await laadRichtingDoelen(groep(2));
    expect(f).toHaveBeenCalledTimes(21);
    // De eerste is eruit gegaan: opnieuw ophalen.
    await laadRichtingDoelen(groep(1));
    expect(f).toHaveBeenCalledTimes(22);
  });

  it('wisStudierichtingenCache leegt alles', async () => {
    const f = server({ 'G-0193.json': richtingJson('G-0193'), 'index.json': koppelingJson(), 'studierichtingen.json': matrixJson() });
    await laadRichtingDoelen('G-0193');
    await laadMatrix();
    await laadRichtingDoelenIndex();
    expect(f).toHaveBeenCalledTimes(3);
    wisStudierichtingenCache();
    await laadRichtingDoelen('G-0193');
    await laadMatrix();
    await laadRichtingDoelenIndex();
    expect(f).toHaveBeenCalledTimes(6);
  });
});

// ── De gegevens voor de schermen ────────────────────────────────────────────

describe('laadRichtingGegevens', () => {
  it('geeft de matrix, de koppeling en de index met minimumdoelen', async () => {
    server({ 'structuur/studierichtingen.json': matrixJson(), 'richtingdoelen/index.json': koppelingJson(), 'minimumdoelen/index.json': minimumdoelenIndexJson() });
    const g = await laadRichtingGegevens();
    expect(g.matrix.groepen).toHaveLength(1);
    expect(g.koppeling?.groepen).toHaveLength(2);
    expect(g.index.sets.map((s) => s.id)).toEqual(['ODS_1']);
  });

  it('zonder koppeling is die null; de rest werkt', async () => {
    server({ 'structuur/studierichtingen.json': matrixJson(), 'minimumdoelen/index.json': minimumdoelenIndexJson() });
    const g = await laadRichtingGegevens();
    expect(g.koppeling).toBeNull();
    expect(g.matrix.groepen).toHaveLength(1);
  });

  it('een server die elk ontbrekend bestand met de startpagina beantwoordt: de matrix zegt "nog niet opgehaald"', async () => {
    stubFetch(() => startpagina());
    await expect(laadRichtingGegevens()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
  });

  it('is alleen de koppeling er nog niet (startpagina als terugval), dan is die null en werkt de rest', async () => {
    stubFetch((url) => {
      if (url.endsWith('structuur/studierichtingen.json')) return antwoord(matrixJson());
      if (url.endsWith('minimumdoelen/index.json')) return antwoord(minimumdoelenIndexJson());
      return startpagina();
    });
    const g = await laadRichtingGegevens();
    expect(g.koppeling).toBeNull();
    expect(g.matrix.groepen).toHaveLength(1);
    expect(g.index.sets).toHaveLength(1);
  });

  it('mislukken er meer, dan beslist de volgorde: eerst de matrix, dan de koppeling, dan de minimumdoelen', async () => {
    // Alles weg: de melding over de matrix.
    stubFetch(() => antwoord({}, 404));
    await expect(laadRichtingGegevens()).rejects.toThrow(FOUT_NOG_NIET_OPGEHAALD);
    // De matrix en de koppeling zijn er, de minimumdoelen niet.
    wisStudierichtingenCache();
    wisMinimumdoelenCache();
    server({ 'structuur/studierichtingen.json': matrixJson(), 'richtingdoelen/index.json': koppelingJson() });
    await expect(laadRichtingGegevens()).rejects.toThrow(FOUT_NIET_GELADEN);
    // De koppeling faalt vóór de minimumdoelen.
    wisStudierichtingenCache();
    wisMinimumdoelenCache();
    stubFetch((url) => (url.endsWith('studierichtingen.json') ? antwoord(matrixJson()) : antwoord({}, 500)));
    await expect(laadRichtingGegevens()).rejects.toThrow(FOUT_STUDIERICHTINGEN);
  });
});

describe('laadKaderGegevens', () => {
  const alles = {
    'richtingdoelen/index.json': koppelingJson(),
    'minimumdoelen/index.json': minimumdoelenIndexJson(),
    'richtingdoelen/G-0100.json': richtingJson('G-0100'),
  };

  it('geeft de regel van de groep, het bestand en de index met minimumdoelen', async () => {
    server(alles);
    const k = await laadKaderGegevens('G-0100');
    expect(k.regel?.status).toBe('gekoppeld');
    expect(k.bestand?.groep).toBe('G-0100');
    expect(k.index.sets).toHaveLength(1);
  });

  it('voor een groep zonder koppeling gaat er geen verzoek naar een bestand van die groep', async () => {
    const f = server(alles);
    const k = await laadKaderGegevens('G-0200');
    expect(k.regel?.status).toBe('geen');
    expect(k.bestand).toBeNull();
    expect(urls(f).some((u) => u.endsWith('G-0200.json'))).toBe(false);
    const onbekend = await laadKaderGegevens('G-0300');
    expect(onbekend.regel).toBeUndefined();
    expect(onbekend.bestand).toBeNull();
    expect(urls(f).some((u) => u.endsWith('G-0300.json'))).toBe(false);
  });

  it('zonder index van de koppeling: geen regel, geen bestand en geen verzoek naar een bestand', async () => {
    const f = server({ 'minimumdoelen/index.json': minimumdoelenIndexJson() });
    const k = await laadKaderGegevens('G-0100');
    expect(k.regel).toBeUndefined();
    expect(k.bestand).toBeNull();
    expect(urls(f).some((u) => u.endsWith('G-0100.json'))).toBe(false);
  });

  it('met de startpagina als terugval voor wat er nog niet is: geen regel, geen bestand, geen fout', async () => {
    stubFetch((url) => (url.endsWith('minimumdoelen/index.json') ? antwoord(minimumdoelenIndexJson()) : startpagina()));
    const k = await laadKaderGegevens('G-0100');
    expect(k.regel).toBeUndefined();
    expect(k.bestand).toBeNull();
    expect(k.index.sets).toHaveLength(1);
  });

  it('een gekoppelde groep waarvan het bestand met de startpagina beantwoord wordt, geeft ook bestand null', async () => {
    stubFetch((url) => {
      if (url.endsWith('richtingdoelen/index.json')) return antwoord(koppelingJson());
      if (url.endsWith('minimumdoelen/index.json')) return antwoord(minimumdoelenIndexJson());
      return startpagina();
    });
    const k = await laadKaderGegevens('G-0100');
    expect(k.regel?.status).toBe('gekoppeld');
    expect(k.bestand).toBeNull();
  });

  it('een gekoppelde groep waarvan het bestand ontbreekt, geeft bestand null (het kader zegt dan: nog niet opgehaald)', async () => {
    server({ 'richtingdoelen/index.json': koppelingJson(), 'minimumdoelen/index.json': minimumdoelenIndexJson() });
    const k = await laadKaderGegevens('G-0100');
    expect(k.regel?.status).toBe('gekoppeld');
    expect(k.bestand).toBeNull();
  });
});

// ── Dezelfde vorm als de meegeleverde fixtures ──────────────────────────────

const FIXTURES = join(fileURLToPath(new URL('../../', import.meta.url)), 'tests', 'fixtures', 'structuur', 'uit');
const HEEFT_FIXTURES = existsSync(join(FIXTURES, 'studierichtingen.json')) && existsSync(join(FIXTURES, 'richtingdoelen', 'index.json'));

describe.runIf(HEEFT_FIXTURES)('de lader met tests/fixtures/structuur/uit', () => {
  const lees = (pad: string) => JSON.parse(readFileSync(join(FIXTURES, pad), 'utf8')) as unknown;

  it('leest de matrix, de index en een richting zoals het script ze schrijft', async () => {
    stubFetch((url) => {
      const pad = url.slice(url.indexOf('leerplannen/structuur/') + 'leerplannen/structuur/'.length);
      return existsSync(join(FIXTURES, pad)) ? antwoord(lees(pad)) : antwoord({}, 404);
    });
    const matrix = await laadMatrix();
    expect(matrix.groepen.map((g) => g.nummer)).toContain('G-0193');
    const koppeling = await laadRichtingDoelenIndex();
    expect(koppeling?.matrixSha256).toBe(matrix.sha256);
    const bestand = await laadRichtingDoelen('G-0193');
    expect(bestand?.groep).toBe('G-0193');
    expect(bestand?.sets.length).toBeGreaterThan(0);
    // G-0002 heeft geen koppeling: geen bestand.
    expect(await laadRichtingDoelen('G-0002')).toBeNull();
  });
});
