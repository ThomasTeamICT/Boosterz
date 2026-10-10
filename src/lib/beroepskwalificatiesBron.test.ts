import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOUT_BK,
  FOUT_BK_BESCHADIGD,
  FOUT_BK_ONGELDIG,
  KWALIFICATIES_MAP,
  MAX_BK_IN_CACHE,
  laadBk,
  laadBkIndex,
  laadBkKoppeling,
  wisBkCache,
  type BkLaadFout,
} from './beroepskwalificatiesBron';
import { valideerKoppelingBestand } from './beroepskwalificaties';
import { bkKader } from './richtingBk';
import { richtingInfo, type RichtingInfo } from './richtingKader';
import type { MatrixBestand } from './studierichtingen';

// ── Fixtures (tests/fixtures/kwalificaties/uit: de uitvoer van het script op nagebootste antwoorden) ─────────

const UIT = join(fileURLToPath(new URL('.', import.meta.url)), '../../tests/fixtures/kwalificaties/uit');
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(UIT, pad), 'utf8'));

const KOPPELING = lees('koppeling.json') as Record<string, unknown>;
const INDEX = lees('index.json') as Record<string, unknown>;
const BK0390 = lees('bk/BK-0390-2.json') as Record<string, unknown>;
const BK0464 = lees('bk/BK-0464-1.json') as Record<string, unknown>;

function koppen(soort: string) {
  return { get: (naam: string) => (naam.toLowerCase() === 'content-type' ? soort : null) };
}

function antwoord(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: koppen('application/json'), json: async () => structuredClone(body) } as unknown as Response;
}

/** Wat een dev- of previewserver geeft voor een bestand dat er niet is: 200 met de startpagina (html). */
function startpagina() {
  return {
    ok: true, status: 200, headers: koppen('text/html; charset=utf-8'),
    json: async () => { throw new Error('html mag niet als json gelezen worden'); },
  } as unknown as Response;
}

/** Een 200 zonder content-type waarvan de inhoud geen json is. */
function geenJson() {
  return {
    ok: true, status: 200, headers: koppen(''),
    json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
  } as unknown as Response;
}

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

const VOLLEDIG = {
  'kwalificaties/koppeling.json': KOPPELING,
  'kwalificaties/index.json': INDEX,
  'kwalificaties/bk/BK-0390-2.json': BK0390,
  'kwalificaties/bk/BK-0464-1.json': BK0464,
};

const urls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map((c) => String(c[0]));

/**
 * Een koppeling met de omvang en de vorm van de echte (G1 stap 3): 961 onderdelen, waarvan 833 opgehaald met een
 * afgelopen erkenning en die van nu (met studiebekrachtigingen en hun extra velden), en 128 nog niet opgehaald. De
 * onderdelen van de fixture (8 en 565 van G-0008, …) staan er zoals in de fixture tussen.
 */
function koppelingZoalsEcht(): Record<string, unknown> {
  const fixture = new Map((KOPPELING.onderdelen as { onderdeel: number; status: string }[]).map((r) => [r.onderdeel, r]));
  const extra = (naam: string) => ({ categorie: 'Bewijs', led_bewijstype: naam, maximale_studiebekrachtiging: false, naam });
  // Precies 128 nog niet opgehaald, samen met die van de fixture: de hoogste nummers die niet in de fixture staan.
  const nogNiet = new Set<number>();
  let teKiezen = 128 - [...fixture.values()].filter((r) => r.status === 'nog-niet-opgehaald').length;
  for (let n = 961; n >= 1 && teKiezen > 0; n--) {
    if (fixture.has(n)) continue;
    nogNiet.add(n);
    teKiezen--;
  }
  const onderdelen: unknown[] = [];
  for (let n = 1; n <= 961; n++) {
    const bestaand = fixture.get(n);
    if (bestaand) {
      onderdelen.push(bestaand);
      continue;
    }
    const groep = `G-${String(1000 + n).padStart(4, '0')}`;
    if (nogNiet.has(n)) {
      onderdelen.push({ onderdeel: n, groep, status: 'nog-niet-opgehaald' });
      continue;
    }
    const nr = String(100 + (n % 500)).padStart(4, '0');
    onderdelen.push({
      onderdeel: n, groep, status: 'opgehaald', opgehaald: '2026-10-10T06:10:00Z',
      erkenningen: [
        {
          adv: `ADV-${n}`, versie: `S-${n}-V1`, status: 'ERKEND', begindatum: '2017-09-01', einddatum: '2024-08-31',
          bks: [{ bk: `BK-${nr}-1`, titel: 'Een oudere versie van het beroep, met een titel van gewone lengte', extra: { volledigheid: 'Volledig' } }],
          bekrachtigingen: [{ naam: `Bewijs van beroepskwalificatie Een oudere versie (BK-${nr}-1)`, bk: `BK-${nr}-1`, extra: extra('Bewijs van beroepskwalificatie') }],
        },
        {
          adv: `ADV-${n + 2000}`, versie: `S-${n}-V2`, status: 'ERKEND', begindatum: '2023-09-01',
          bks: [{ bk: `BK-${nr}-2`, titel: 'Het beroep van nu, met een titel zo lang als de langere titels in de bron', extra: { volledigheid: 'Volledig' } }],
          bekrachtigingen: [
            { naam: `Bewijs van beroepskwalificatie Het beroep van nu (BK-${nr}-2)`, bk: `BK-${nr}-2`, extra: extra('Bewijs van beroepskwalificatie') },
            { naam: `Bewijs van deelkwalificatie Een deel van het beroep van nu (BK-${nr}-2-DBK-01)`, dbk: `BK-${nr}-2-DBK-01`, extra: { ...extra('Bewijs van deelkwalificatie'), deelkwalificatie: { titel: 'Een deel' } } },
            { naam: 'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3 Medewerker van een nagebootste richting', onderwijskwalificatie: true, extra: { ...extra('Diploma, onderwijskwalificatie niveau 3'), categorie: 'Diploma', maximale_studiebekrachtiging: true, vks_niveau: 'OK3' } },
          ],
        },
      ],
    });
  }
  const koppeling = { ...structuredClone(KOPPELING), aantalOnderdelen: onderdelen.length, onderdelen };
  const fouten = valideerKoppelingBestand(koppeling);
  if (fouten.length > 0) throw new Error(`koppelingZoalsEcht: ${fouten.slice(0, 3).join(' | ')}`);
  return koppeling;
}

/** Geen enkele tekst voor het scherm mag een competentiecode, set-id of groepnummer bevatten. */
function schermVeilig(tekst: string) {
  expect(tekst).not.toMatch(/bkc\d|ODS_|G-\d{4}/i);
}

beforeEach(() => wisBkCache());
afterEach(() => vi.unstubAllGlobals());

describe('de map en de foutteksten', () => {
  it('wijst naar leerplannen/kwalificaties/ naast de app', () => {
    expect(KWALIFICATIES_MAP).toMatch(/leerplannen\/kwalificaties\/$/);
  });

  it('zijn gewone taal, zonder interne sleutels', () => {
    expect(FOUT_BK).toBe('De beroepskwalificaties konden niet geladen worden. Controleer je verbinding en probeer opnieuw.');
    for (const t of [FOUT_BK, FOUT_BK_BESCHADIGD, FOUT_BK_ONGELDIG]) schermVeilig(t);
  });
});

// ── De koppeling ────────────────────────────────────────────────────────────

describe('laadBkKoppeling', () => {
  it('haalt het bestand één keer op, ook bij meer aanroepen tegelijk (gedeelde belofte)', async () => {
    const fn = server(VOLLEDIG);
    const [a, b] = await Promise.all([laadBkKoppeling(), laadBkKoppeling()]);
    const c = await laadBkKoppeling();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(urls(fn)[0]).toMatch(/leerplannen\/kwalificaties\/koppeling\.json$/);
    expect(a?.onderdelen.length).toBe(16);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('geeft null bij een 404: nog niet opgehaald', async () => {
    server({});
    await expect(laadBkKoppeling()).resolves.toBeNull();
  });

  it('geeft null als de server met de startpagina (html) antwoordt, zonder ze als json te lezen', async () => {
    stubFetch(() => startpagina());
    await expect(laadBkKoppeling()).resolves.toBeNull();
  });

  it('geeft null bij een 200 die geen json is (terugval van de server)', async () => {
    stubFetch(() => geenJson());
    await expect(laadBkKoppeling()).resolves.toBeNull();
  });

  it('geeft FOUT_BK bij een netwerkfout en probeert daarna echt opnieuw', async () => {
    let poging = 0;
    const fn = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      return antwoord(KOPPELING);
    });
    await expect(laadBkKoppeling()).rejects.toThrow(FOUT_BK);
    const k = await laadBkKoppeling();
    expect(k?.kind).toBe('richtingkwalificaties');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('geeft FOUT_BK bij een andere status dan 200 of 404', async () => {
    for (const status of [500, 503, 403]) {
      wisBkCache();
      stubFetch(() => antwoord({}, status));
      await expect(laadBkKoppeling()).rejects.toThrow(FOUT_BK);
    }
  });

  it('geeft FOUT_BK als de verbinding tijdens het lezen wegvalt (geen SyntaxError)', async () => {
    stubFetch(() => ({ ok: true, status: 200, headers: koppen('application/json'), json: async () => { throw new TypeError('network'); } }) as unknown as Response);
    await expect(laadBkKoppeling()).rejects.toThrow(FOUT_BK);
  });

  it('weigert een beschadigd bestand met een schermveilige melding; het detail staat in `fouten`', async () => {
    const kapot = structuredClone(KOPPELING);
    (kapot.onderdelen as Record<string, unknown>[])[1].groep = 'geen-groep';
    stubFetch(() => antwoord(kapot));
    const fout = (await laadBkKoppeling().catch((e: unknown) => e)) as BkLaadFout;
    expect(fout.message).toBe(FOUT_BK_BESCHADIGD);
    expect(fout.fouten?.length).toBeGreaterThan(0);
    schermVeilig(fout.message);
  });

  it('wist de belofte na een beschadigd bestand: een nieuwe poging haalt opnieuw op', async () => {
    let poging = 0;
    const fn = stubFetch(() => {
      poging++;
      return antwoord(poging === 1 ? { ...KOPPELING, kind: 'iets-anders' } : KOPPELING);
    });
    await expect(laadBkKoppeling()).rejects.toThrow(FOUT_BK_BESCHADIGD);
    await expect(laadBkKoppeling()).resolves.not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wordt nooit per richting opnieuw opgehaald: wie na elkaar richtingen opent, deelt dezelfde koppeling', async () => {
    const fn = server(VOLLEDIG);
    const matrix = lees('../../structuur/uit/studierichtingen.json') as MatrixBestand;
    const eerste = await laadBkKoppeling();
    for (const groep of ['G-0008', 'G-0009', 'G-0193', 'G-0002', 'G-0008']) {
      const [koppeling, index] = await Promise.all([laadBkKoppeling(), laadBkIndex()]);
      expect(koppeling).toBe(eerste);
      const i = richtingInfo(matrix, groep, '2026-10-10');
      if (!i) throw new Error(groep);
      bkKader(koppeling, index, i, { groep, soort: 'so' }, '2026-10-10');
    }
    expect(urls(fn).filter((u) => u.endsWith('koppeling.json'))).toHaveLength(1);
    expect(urls(fn).filter((u) => u.endsWith('index.json'))).toHaveLength(1);
  });

  it('een koppeling zo groot als de echte (961 onderdelen, ±1,5 MB, met afgelopen erkenningen): één keer opgehaald en nagekeken', async () => {
    const groot = koppelingZoalsEcht();
    expect(JSON.stringify(groot).length).toBeGreaterThan(1_400_000);
    const fn = stubFetch(() => antwoord(groot));
    const [a, b] = await Promise.all([laadBkKoppeling(), laadBkKoppeling()]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(a?.onderdelen).toHaveLength(961);
    expect(a?.onderdelen.filter((r) => r.status === 'nog-niet-opgehaald')).toHaveLength(128);
    // Op die koppeling neemt het kader van G-0008 alleen de erkenning van nu.
    const matrix = lees('../../structuur/uit/studierichtingen.json') as MatrixBestand;
    const k = bkKader(a, null, richtingInfo(matrix, 'G-0008', '2026-10-10') as RichtingInfo, { groep: 'G-0008', soort: 'so' }, '2026-10-10');
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((x) => x.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
    await laadBkKoppeling();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('weigert ook een index of een BK-bestand op de plaats van de koppeling', async () => {
    stubFetch(() => antwoord(INDEX));
    await expect(laadBkKoppeling()).rejects.toThrow(FOUT_BK_BESCHADIGD);
  });
});

// ── De index ────────────────────────────────────────────────────────────────

describe('laadBkIndex', () => {
  it('haalt index.json één keer op', async () => {
    const fn = server(VOLLEDIG);
    const [a, b] = await Promise.all([laadBkIndex(), laadBkIndex()]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(urls(fn)[0]).toMatch(/leerplannen\/kwalificaties\/index\.json$/);
    expect(a?.bks.map((r) => r.bk)).toEqual(['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2', 'BK-9999-3']);
    expect(b).toBe(a);
  });

  it('geeft null bij een 404 of de startpagina', async () => {
    server({});
    await expect(laadBkIndex()).resolves.toBeNull();
    wisBkCache();
    stubFetch(() => startpagina());
    await expect(laadBkIndex()).resolves.toBeNull();
  });

  it('weigert een beschadigde index en wist de belofte', async () => {
    let poging = 0;
    const fn = stubFetch(() => {
      poging++;
      const kapot = structuredClone(INDEX);
      (kapot.bks as Record<string, unknown>[]).reverse(); // niet meer gesorteerd
      return antwoord(poging === 1 ? kapot : INDEX);
    });
    await expect(laadBkIndex()).rejects.toThrow(FOUT_BK_BESCHADIGD);
    await expect(laadBkIndex()).resolves.not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('koppeling en index hebben elk hun eigen belofte', async () => {
    const fn = server(VOLLEDIG);
    await Promise.all([laadBkKoppeling(), laadBkIndex(), laadBkKoppeling(), laadBkIndex()]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── Eén BK-versie ───────────────────────────────────────────────────────────

describe('laadBk', () => {
  it('weigert een ongeldige versie zonder iets op te halen', async () => {
    const fn = server(VOLLEDIG);
    for (const v of ['', 'BK-0390', 'bk-0390-2', 'BK-0390-2.json', '../index', 'BK-0390-2/../../x', ' BK-0390-2', 'BK-0390-2-DBK-01', 'BK-12-1', '__proto__']) {
      await expect(laadBk(v)).rejects.toThrow(FOUT_BK_ONGELDIG);
    }
    await expect(laadBk(42 as unknown as string)).rejects.toThrow(FOUT_BK_ONGELDIG);
    expect(fn).not.toHaveBeenCalled();
  });

  it('haalt het bestand van de versie op en onthoudt het', async () => {
    const fn = server(VOLLEDIG);
    const a = await laadBk('BK-0390-2');
    const b = await laadBk('BK-0390-2');
    expect(a?.titel).toBe('Onthaalmedewerker');
    expect(a?.competenties).toHaveLength(12);
    expect(b).toBe(a);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(urls(fn)[0]).toMatch(/leerplannen\/kwalificaties\/bk\/BK-0390-2\.json$/);
  });

  it('geeft null bij een 404 of de startpagina', async () => {
    server(VOLLEDIG);
    await expect(laadBk('BK-9999-3')).resolves.toBeNull();
    wisBkCache();
    stubFetch(() => startpagina());
    await expect(laadBk('BK-0390-2')).resolves.toBeNull();
  });

  it('weigert een bestand dat bij een andere versie hoort', async () => {
    stubFetch(() => antwoord(BK0464));
    const fout = (await laadBk('BK-0390-2').catch((e: unknown) => e)) as BkLaadFout;
    expect(fout.message).toBe(FOUT_BK_BESCHADIGD);
    expect(fout.fouten?.join(' ')).toMatch(/hoort bij/);
  });

  it('weigert een beschadigd bestand (dubbele competentie) zonder de code op het scherm te zetten', async () => {
    const kapot = structuredClone(BK0390);
    const comp = kapot.competenties as Record<string, unknown>[];
    comp[1].id = comp[0].id;
    stubFetch(() => antwoord(kapot));
    const fout = (await laadBk('BK-0390-2').catch((e: unknown) => e)) as BkLaadFout;
    expect(fout.message).toBe(FOUT_BK_BESCHADIGD);
    schermVeilig(fout.message);
    // Het detail (met de code) blijft buiten de melding.
    expect(fout.fouten?.join(' ')).toMatch(/meer dan één keer/);
  });

  it('een mislukte poging blijft niet in de cache', async () => {
    let poging = 0;
    const fn = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      return antwoord(BK0390);
    });
    await expect(laadBk('BK-0390-2')).rejects.toThrow(FOUT_BK);
    await expect(laadBk('BK-0390-2')).resolves.not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('een 404 blijft wel in de cache (geen tweede verzoek, dus geen tweede consolefout)', async () => {
    const fn = server({});
    await expect(laadBk('BK-0001-1')).resolves.toBeNull();
    await expect(laadBk('BK-0001-1')).resolves.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it(`houdt hoogstens ${MAX_BK_IN_CACHE} versies bij; de oudste gaat eruit`, async () => {
    const fn = stubFetch((url) => {
      const versie = /bk\/(BK-\d+-\d+)\.json$/.exec(url)?.[1] ?? '';
      const [, nummer, v] = /^(BK-\d+)-(\d+)$/.exec(versie) ?? [];
      return antwoord({ ...structuredClone(BK0390), bk: versie, nummer, versie: Number(v), api: `${String(BK0390.api).replace(/BK-0390-2$/, versie)}` });
    });
    for (let i = 1; i <= MAX_BK_IN_CACHE + 1; i++) await laadBk(`BK-1${String(i).padStart(3, '0')}-1`);
    expect(fn).toHaveBeenCalledTimes(MAX_BK_IN_CACHE + 1);
    await laadBk(`BK-1${String(MAX_BK_IN_CACHE + 1).padStart(3, '0')}-1`); // de nieuwste: nog bewaard
    expect(fn).toHaveBeenCalledTimes(MAX_BK_IN_CACHE + 1);
    await laadBk('BK-1001-1'); // de oudste: opnieuw opgehaald
    expect(fn).toHaveBeenCalledTimes(MAX_BK_IN_CACHE + 2);
  });

  it('wisBkCache leegt alles: een volgende aanroep haalt opnieuw op', async () => {
    const fn = server(VOLLEDIG);
    await Promise.all([laadBkKoppeling(), laadBkIndex(), laadBk('BK-0390-2')]);
    wisBkCache();
    await Promise.all([laadBkKoppeling(), laadBkIndex(), laadBk('BK-0390-2')]);
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it('schrijft niets in localStorage', async () => {
    const zet = vi.fn();
    vi.stubGlobal('localStorage', { setItem: zet, getItem: vi.fn(), removeItem: vi.fn() });
    server(VOLLEDIG);
    await Promise.all([laadBkKoppeling(), laadBkIndex(), laadBk('BK-0390-2'), laadBk('BK-0464-1')]);
    expect(zet).not.toHaveBeenCalled();
  });
});
