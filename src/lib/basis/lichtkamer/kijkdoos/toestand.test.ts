// Wat de kijkdoos toont (zuiver), en de zuivere modules van de kijkdoos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STANDAARD_AFSTANDEN, beginStand } from '..';
import { ONDERZOEK_MAX_CM, ONDERZOEK_MIN_CM, kijkdoosLabel, normaliseer, volgendeAfstand, zelfdeToestand, type SceneToestand } from './toestand';

describe('toestand van de kijkdoos', () => {
  it('normaliseer houdt alles binnen het bereik', () => {
    expect(normaliseer({ scene: 'voorspel', ronde: 7, getoond: true })).toEqual({ scene: 'voorspel', ronde: 2, getoond: true });
    expect(normaliseer({ scene: 'voorspel', ronde: -1, getoond: 'ja' as unknown as boolean })).toEqual({ scene: 'voorspel', ronde: 0, getoond: false });
    expect(normaliseer({ scene: 'voorspel', ronde: NaN, getoond: false })).toEqual({ scene: 'voorspel', ronde: 0, getoond: false });
    expect(normaliseer({ scene: 'voorspel', ronde: 1.4, getoond: false })).toEqual({ scene: 'voorspel', ronde: 1, getoond: false });
    expect(normaliseer({ scene: 'kaartjes', stand: { lamp: 9, gaten: [5, -2, 1] } })).toEqual({ scene: 'kaartjes', stand: { lamp: 4, gaten: [2, 0, 1] } });
    expect(normaliseer({ scene: 'kaartjes', stand: undefined as unknown as never })).toEqual({ scene: 'kaartjes', stand: beginStand() });
    expect(normaliseer({ scene: 'onderzoek', afstandCm: 99 })).toEqual({ scene: 'onderzoek', afstandCm: 30 });
    expect(normaliseer({ scene: 'onderzoek', afstandCm: 2 })).toEqual({ scene: 'onderzoek', afstandCm: 10 });
    expect(normaliseer({ scene: 'onderzoek', afstandCm: 12.3 })).toEqual({ scene: 'onderzoek', afstandCm: 12.3 });
    expect(normaliseer({ scene: 'onderzoek', afstandCm: Infinity })).toEqual({ scene: 'onderzoek', afstandCm: 30 });
  });

  it('normaliseer verandert de invoer niet', () => {
    const t: SceneToestand = { scene: 'kaartjes', stand: { lamp: 2, gaten: [0, 2, 1] } };
    const n = normaliseer(t);
    expect(n).toEqual(t);
    expect(n).not.toBe(t);
    if (n.scene === 'kaartjes' && t.scene === 'kaartjes') expect(n.stand.gaten).not.toBe(t.stand.gaten);
  });

  it('het bereik van het onderzoek volgt de meetafstanden (30, 15 en 10 cm)', () => {
    expect(STANDAARD_AFSTANDEN).toEqual([30, 15, 10]);
    expect(ONDERZOEK_MIN_CM).toBe(10);
    expect(ONDERZOEK_MAX_CM).toBe(30);
  });

  it('volgendeAfstand springt tussen de meetafstanden', () => {
    expect(volgendeAfstand(30, 'dichter')).toBe(15);
    expect(volgendeAfstand(15, 'dichter')).toBe(10);
    expect(volgendeAfstand(10, 'dichter')).toBe(10);
    expect(volgendeAfstand(10, 'verder')).toBe(15);
    expect(volgendeAfstand(15, 'verder')).toBe(30);
    expect(volgendeAfstand(30, 'verder')).toBe(30);
    // na het slepen: naar de dichtstbijzijnde in die richting
    expect(volgendeAfstand(22.4, 'dichter')).toBe(15);
    expect(volgendeAfstand(22.4, 'verder')).toBe(30);
    expect(volgendeAfstand(12, 'dichter')).toBe(10);
    expect(volgendeAfstand(12, 'verder')).toBe(15);
    expect(volgendeAfstand(15.2, 'dichter')).toBe(10);
    expect(volgendeAfstand(9, 'dichter')).toBe(10);
    expect(volgendeAfstand(31, 'verder')).toBe(30);
    // andere afstanden mogen ook
    expect(volgendeAfstand(20, 'dichter', [30, 20, 10])).toBe(10);
  });

  it('zelfdeToestand', () => {
    expect(zelfdeToestand({ scene: 'voorspel', ronde: 1, getoond: false }, { scene: 'voorspel', ronde: 1, getoond: false })).toBe(true);
    expect(zelfdeToestand({ scene: 'voorspel', ronde: 1, getoond: false }, { scene: 'voorspel', ronde: 1, getoond: true })).toBe(false);
    expect(zelfdeToestand({ scene: 'kaartjes', stand: { lamp: 2, gaten: [0, 2, 1] } }, { scene: 'kaartjes', stand: { lamp: 2, gaten: [0, 2, 1] } })).toBe(true);
    expect(zelfdeToestand({ scene: 'kaartjes', stand: { lamp: 2, gaten: [0, 2, 1] } }, { scene: 'kaartjes', stand: { lamp: 2, gaten: [0, 1, 1] } })).toBe(false);
    expect(zelfdeToestand({ scene: 'onderzoek', afstandCm: 15 }, { scene: 'onderzoek', afstandCm: 15 })).toBe(true);
    expect(zelfdeToestand({ scene: 'onderzoek', afstandCm: 15 }, { scene: 'voorspel', ronde: 0, getoond: false })).toBe(false);
  });

  it('het label van de kijkdoos noemt het voorwerp en, bij het onderzoek, 10, 15 en 30 cm', () => {
    expect(kijkdoosLabel({ scene: 'voorspel', ronde: 0, getoond: false }, 'huis')).toContain('het huisje');
    expect(kijkdoosLabel({ scene: 'onderzoek', afstandCm: 30 }, 'kind')).toBe(
      'Lichtkamer. Een zaklamp, het kartonnen kind, een scherm en een meetlat. Pijltje omhoog en omlaag zetten de zaklamp op 10, 15 of 30 centimeter.',
    );
    expect(kijkdoosLabel({ scene: 'kaartjes', stand: beginStand() }, 'boom')).toMatch(/^Lichtkamer, van opzij\./);
  });
});

describe('de zuivere modules van de kijkdoos', () => {
  const MAP = path.dirname(fileURLToPath(import.meta.url));
  const ZUIVER = ['standen.ts', 'meet.ts', 'toestand.ts', 'bak.ts', 'motor.ts'];
  const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const naam of ZUIVER) {
    it(`${naam}: geen three, geen DOM, geen klok`, () => {
      const tekst = zonderCommentaar(readFileSync(path.join(MAP, naam), 'utf8'));
      expect(/['"]three/.test(tekst), naam).toBe(false);
      for (const verboden of [/\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bDate\b/, /\bMath\.random\b/, /\bperformance\b/, /\brequestAnimationFrame\b/]) {
        expect(verboden.test(tekst), `${naam}: ${verboden}`).toBe(false);
      }
    });
  }
});
