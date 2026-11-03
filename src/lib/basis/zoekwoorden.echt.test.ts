// De woordentabel van het zoeken (./zoekwoorden), getoetst aan de echte doelen (bouwstap 3, pakket P5).
//
// De mechaniek van het zoeken heeft eigen tests met zelfgemaakte doelen (zoekBasis.test.ts). Hier gaat het om de
// gegevens: elk bronwoord van de tabel moet echt in de doelen staan, en dat kan alleen met de echte setbestanden in
// public/leerplannen/minimumdoelen. Dezelfde afspraken als in momentmodel.echt.test.ts (beslissing H4):
// - Wacht. Ontbreken de gegevens van het basisonderwijs, of een setbestand, dan slaan de tests met gegevens over.
// - GEGEVENSRUN=1 slaat elke test in dit bestand over, zodat de maandelijkse ophaling er nooit door tegengehouden wordt.
// - Verbanden gelden altijd. Exacte aantallen en lijsten van id's staan achter de momentopname-wacht (de index van
//   1 november 2026, 1096 sets).
// Drempels voor de zoekkwaliteit horen niet in deze tests: die staan in tools/basis/meet-zoeken.ts.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../minimumdoelen';
import { doelenVanSet } from './doelBasis';
import type { SoortBasis } from './kalender';
import { basisSet } from './moment';
import { leesVraag, normaal, varianten, zoekDoelen, zoekDoelVan, type Vraag, type ZoekDoel, type Zoekwoorden } from './zoekBasis';
import { ZOEKWOORDEN } from './zoekwoorden';

// ─── Gegevens laden ─────────────────────────────────────────────────────────

const DATA_MAP = join(fileURLToPath(new URL('../../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';

const index: MinimumdoelenIndexSet[] = (() => {
  const pad = join(DATA_MAP, 'index.json');
  if (GEGEVENSRUN || !existsSync(pad)) return [];
  return (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
})();

const heeftBasis = index.some((s) => s.id === 'ODS_3395');
const momentopname = heeftBasis && index.length === 1096;

/** De nieuwe, niet-lege sets van het (buitengewoon) basisonderwijs. */
const nieuweSets = index.flatMap((set) => {
  const info = basisSet(set);
  return info && info.generatie === 'nieuw' && !info.leeg ? [{ set, info }] : [];
});
const heeftBestanden = heeftBasis && nieuweSets.length > 0 && nieuweSets.every(({ set }) => existsSync(join(DATA_MAP, set.bestand)));

const zoekdoelen: Record<SoortBasis, ZoekDoel[]> = { bao: [], bubao: [] };
if (heeftBestanden) {
  for (const { set, info } of nieuweSets) {
    const bestand = JSON.parse(readFileSync(join(DATA_MAP, set.bestand), 'utf8')) as MinimumdoelenSetBestand;
    zoekdoelen[info.soort].push(...doelenVanSet(bestand, info).map(zoekDoelVan));
  }
}

const LEEG: Zoekwoorden = { ...ZOEKWOORDEN, ook: {} };
const regels = Object.entries(ZOEKWOORDEN.ook);

/** Een vraag met precies dit ene woord van de tabel, zonder stam en zonder tabel: zo past het zoals in de app. */
const vraagVan = (bronwoord: string): Vraag => ({ termen: [{ eigen: bronwoord, alts: [bronwoord], tabel: [] }], filters: [] });
/** De bronwoorden die geen enkel doel raken, als 'sleutel → bronwoord'. */
const zonderDoel = (doelen: readonly ZoekDoel[]): string[] =>
  regels.flatMap(([sleutel, lijst]) => lijst.filter((b) => zoekDoelen(doelen, vraagVan(b)).treffers.length === 0).map((b) => `${sleutel} → ${b}`));
const ids = (q: string, w: Zoekwoorden = ZOEKWOORDEN, doelen: readonly ZoekDoel[] = zoekdoelen.bao): string[] =>
  zoekDoelen(doelen, leesVraag(q, w)).treffers.map((t) => t.doel.id);

// ─── De tests ───────────────────────────────────────────────────────────────

describe.skipIf(GEGEVENSRUN)('de woordentabel van het basisonderwijs op de echte gegevens', () => {
  describe('de vorm van de tabel', () => {
    it('elke sleutel is één genormaliseerd woord, geen stopwoord of vakwoord, en geeft als vraag één term met tabelwoorden', () => {
      const stop = new Set(ZOEKWOORDEN.stop);
      const fout: string[] = [];
      for (const [sleutel] of regels) {
        const v = leesVraag(sleutel, ZOEKWOORDEN);
        if (normaal(sleutel) !== sleutel || sleutel.includes(' ')) fout.push(`${sleutel}: niet één genormaliseerd woord`);
        if (stop.has(sleutel) || Object.prototype.hasOwnProperty.call(ZOEKWOORDEN.vak, sleutel)) fout.push(`${sleutel}: stopwoord of vakwoord`);
        if (v.termen.length !== 1 || v.termen[0].tabel.length === 0) fout.push(`${sleutel}: geeft geen term met tabelwoorden`);
      }
      expect(fout).toEqual([]);
    });

    it('elk bronwoord is genormaliseerd, heeft minstens 4 letters zonder =, komt één keer voor en is geen stam van zijn sleutel', () => {
      const fout: string[] = [];
      for (const [sleutel, lijst] of regels) {
        if (new Set(lijst).size !== lijst.length) fout.push(`${sleutel}: dubbel bronwoord`);
        for (const b of lijst) {
          const kaal = b.replace(/^=/, '');
          if (normaal(kaal) !== kaal || kaal.length < 4) fout.push(`${sleutel} → ${b}: vorm`);
          if (varianten(sleutel).includes(kaal)) fout.push(`${sleutel} → ${b}: al een stam van de sleutel`);
        }
      }
      expect(fout).toEqual([]);
    });

    it('koppelt geen oude aan nieuwe vakken (H10): wo en wereldorientatie staan nergens in de tabel', () => {
      const alles = [...ZOEKWOORDEN.stop, ...Object.keys(ZOEKWOORDEN.vak), ...regels.flatMap(([s, l]) => [s, ...l])].map((w) => w.replace(/^=/, ''));
      for (const w of ['wo', 'wereldorientatie']) expect(alles).not.toContain(w);
    });
  });

  describe('elk bronwoord staat in de doelen', () => {
    it.runIf(heeftBestanden)('elk bronwoord raakt minstens één doel van de nieuwe sets van het gewoon basisonderwijs', () => {
      expect(zoekdoelen.bao.length).toBeGreaterThan(0);
      expect(zonderDoel(zoekdoelen.bao)).toEqual([]);
    });

    it.runIf(heeftBestanden)('elk bronwoord raakt minstens één doel van de nieuwe sets van het buitengewoon basisonderwijs', () => {
      expect(zoekdoelen.bubao.length).toBeGreaterThan(0);
      expect(zonderDoel(zoekdoelen.bubao)).toEqual([]);
    });

    it.runIf(heeftBestanden)('met de tabel vindt een sleutel nooit minder doelen dan zonder, en wat ze erbij vindt staat in "Ook gezocht op"', () => {
      for (const [sleutel] of regels) {
        const met = zoekDoelen(zoekdoelen.bao, leesVraag(sleutel, ZOEKWOORDEN));
        const zonder = ids(sleutel, LEEG);
        expect(zonder.every((id) => met.treffers.some((t) => t.doel.id === id))).toBe(true);
        if (met.treffers.length > zonder.length) expect(met.ookGezocht.length).toBeGreaterThan(0);
      }
    });
  });

  describe('momentopname', () => {
    it.runIf(heeftBestanden && momentopname)('momentopname: met de tabel vindt elke sleutel meer doelen dan zonder', () => {
      const zonderWinst = regels.filter(([sleutel]) => ids(sleutel).length <= ids(sleutel, LEEG).length).map(([sleutel]) => sleutel);
      expect(zonderWinst).toEqual([]);
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: woorden van leerkrachten vinden de doelen in de woorden van de bron', () => {
      expect(ids('kommagetallen')).toEqual(expect.arrayContaining(['93177', '93182']));
      expect(ids('rekenmachine')[0]).toBe('93325');
      expect(ids('klok lezen')).toEqual(['93248']);
      expect(ids('maaltafels')[0]).toBe('93199');
      expect(ids('dictee')).toEqual(expect.arrayContaining(['93052', '93088']));
      expect(ids('proefjes')).toEqual(expect.arrayContaining(['92775']));
      expect(ids('drijven en zinken')).toEqual(expect.arrayContaining(['92827']));
      expect(ids('elektriciteit')[0]).toBe('92835');
      expect(ids('herfst')).toEqual(expect.arrayContaining(['92576']));
      expect(ids('dinosaurussen')).toEqual(expect.arrayContaining(['92398']));
      expect(ids('ehbo')).toEqual(expect.arrayContaining(['92637']));
      for (const q of ['kommagetallen', 'rekenmachine', 'maaltafels', 'dictee', 'herfst', 'ehbo']) expect(ids(q, LEEG)).toEqual([]);
    });

    it.runIf(heeftBestanden && momentopname)('momentopname (H3): 92767 staat in de top 3 voor einde 4de leerjaar bij schaduw, schaduw onderzoeken, schaduw maken en licht en schaduw', () => {
      for (const q of ['schaduw', 'schaduw onderzoeken', 'schaduw maken', 'licht en schaduw']) {
        const v = leesVraag(q, ZOEKWOORDEN);
        v.eind = ['L4'];
        const u = zoekDoelen(zoekdoelen.bao, v, { eigenEind: 'L4' });
        const lijst = [...u.treffers, ...u.deels].map((t) => t.doel.id);
        expect(lijst.slice(0, 3), q).toContain('92767');
      }
    });
  });
});
