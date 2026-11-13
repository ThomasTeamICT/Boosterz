// Het laden van het aanbod: 404 is geen aanbod (geen fout), geen verbinding is herkenbaar, een beschadigd bestand wordt
// geweigerd, en een ongeldige naam haalt nooit iets op.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AANBOD_MAP,
  FOUT_AANBOD_GEEN_VERBINDING,
  FOUT_AANBOD_NIET_GELADEN,
  FOUT_BORDLES_ONTBREEKT,
  laadAanbodBordles,
  laadGoAanbod,
  wisAanbodCache,
} from './aanbodBron';

const GOED = {
  app: 'boosterz',
  kind: 'go-aanbod',
  v: 1,
  lesplan: { code: 'LP0065', sha256: 'a'.repeat(64) },
  onderdelen: [],
};

function antwoord(status: number, body?: unknown): Response {
  return new Response(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body), { status });
}

let fetchSpion: ReturnType<typeof vi.fn>;

beforeEach(() => {
  wisAanbodCache();
  fetchSpion = vi.fn();
  vi.stubGlobal('fetch', fetchSpion);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('laadGoAanbod', () => {
  it('haalt public/basis/aanbod/<code>.json op en geeft het aanbod', async () => {
    fetchSpion.mockResolvedValue(antwoord(200, GOED));
    await expect(laadGoAanbod('LP0065')).resolves.toEqual(GOED);
    expect(fetchSpion).toHaveBeenCalledWith(`${AANBOD_MAP}LP0065.json`);
  });

  it('404 is geen aanbod: null, geen fout', async () => {
    fetchSpion.mockResolvedValue(antwoord(404));
    await expect(laadGoAanbod('LP0001')).resolves.toBeNull();
  });

  it('geen verbinding geeft de herkenbare melding, en een volgende poging haalt opnieuw op', async () => {
    fetchSpion.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(laadGoAanbod('LP0065')).rejects.toThrow(FOUT_AANBOD_GEEN_VERBINDING);
    fetchSpion.mockResolvedValueOnce(antwoord(200, GOED));
    await expect(laadGoAanbod('LP0065')).resolves.toEqual(GOED);
    expect(fetchSpion).toHaveBeenCalledTimes(2);
  });

  it('een serverfout of kapotte json is een gewone fout', async () => {
    fetchSpion.mockResolvedValueOnce(antwoord(500));
    await expect(laadGoAanbod('LP0065')).rejects.toThrow(FOUT_AANBOD_NIET_GELADEN);
    fetchSpion.mockResolvedValueOnce(antwoord(200, '{kapot'));
    await expect(laadGoAanbod('LP0065')).rejects.toThrow(FOUT_AANBOD_NIET_GELADEN);
  });

  it('een bestand met een verkeerde vorm of van een ander lesplan wordt geweigerd', async () => {
    fetchSpion.mockResolvedValueOnce(antwoord(200, { ...GOED, v: 2 }));
    await expect(laadGoAanbod('LP0065')).rejects.toThrow(/kon niet gelezen worden/);
    fetchSpion.mockResolvedValueOnce(antwoord(200, GOED));
    await expect(laadGoAanbod('LP0074')).rejects.toThrow(/kon niet gelezen worden/);
  });

  it('een ongeldige code haalt niets op', async () => {
    for (const code of ['../go/index', 'lp0065', 'LP65', '']) {
      await expect(laadGoAanbod(code)).rejects.toThrow(/Ongeldige lesplancode/);
    }
    expect(fetchSpion).not.toHaveBeenCalled();
  });

  it('één ophaling voor twee schermen tegelijk', async () => {
    fetchSpion.mockResolvedValue(antwoord(200, GOED));
    await Promise.all([laadGoAanbod('LP0065'), laadGoAanbod('LP0065')]);
    expect(fetchSpion).toHaveBeenCalledTimes(1);
  });
});

describe('laadAanbodBordles', () => {
  const LES = { soort: 'bordles', titel: 'Dier of plant?', config: { fases: [] } };

  it('haalt public/basis/aanbod/<code>/<bestand> op', async () => {
    fetchSpion.mockResolvedValue(antwoord(200, LES));
    await expect(laadAanbodBordles('LP0065', 'dier-of-plant.json')).resolves.toEqual(LES);
    expect(fetchSpion).toHaveBeenCalledWith(`${AANBOD_MAP}LP0065/dier-of-plant.json`);
  });

  it('404: de bordles is nog niet klaar', async () => {
    fetchSpion.mockResolvedValue(antwoord(404));
    await expect(laadAanbodBordles('LP0065', 'dier-of-plant.json')).rejects.toThrow(FOUT_BORDLES_ONTBREEKT);
  });

  it('een ander soort bestand wordt geweigerd', async () => {
    fetchSpion.mockResolvedValue(antwoord(200, { ...LES, soort: 'quiz' }));
    await expect(laadAanbodBordles('LP0065', 'dier-of-plant.json')).rejects.toThrow(/kon niet gelezen worden/);
  });

  it('een ongeldige naam haalt niets op', async () => {
    for (const [code, bestand] of [['LP0065', '../LP0074.json'], ['LP0065', 'x/y.json'], ['LP0065', 'Dier.json'], ['../x', 'a.json']]) {
      await expect(laadAanbodBordles(code, bestand)).rejects.toThrow('Deze bordles heeft een ongeldige naam.');
    }
    expect(fetchSpion).not.toHaveBeenCalled();
  });
});
