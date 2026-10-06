// Unittests op de kleine hulpfuncties uit lib/utils.ts die punten of exports
// raken: antwoordnormalisatie, schudden zonder dat de volgorde al juist staat,
// en CSV-velden die geen formule mogen worden. (De dicteevergelijking staat in
// widgets/dictation.tsx; haar tests in widgets/quiz.test.ts.)

import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvCell, normalizeAnswer, shuffledNotIdentity } from './utils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeAnswer', () => {
  it('voegt spaties samen en negeert standaard hoofdletters en accenten', () => {
    expect(normalizeAnswer('  Café   Noir ')).toBe('cafe noir');
  });

  it('stelt typografische apostrofs gelijk aan de gewone', () => {
    const gewoon = normalizeAnswer("foto's");
    for (const v of ['foto\u2019s', 'foto\u2018s', 'foto\u02BCs', 'foto\u201As', 'foto\u00B4s', 'foto`s']) {
      expect(normalizeAnswer(v)).toBe(gewoon);
    }
  });

  it('stelt typografische aanhalingstekens gelijk aan de gewone', () => {
    expect(normalizeAnswer('\u201Cja\u201D')).toBe('"ja"');
    expect(normalizeAnswer('\u201Eja\u201D')).toBe('"ja"');
  });

  it('laat accenten meetellen met accentSensitive, los van hoofdletters', () => {
    expect(normalizeAnswer('été', false, true)).not.toBe(normalizeAnswer('ete', false, true));
    // hoofdletters blijven genegeerd zolang caseSensitive uit staat
    expect(normalizeAnswer('ÉTÉ', false, true)).toBe(normalizeAnswer('été', false, true));
  });

  it('vergelijkt accentgevoelig ongeacht de unicodevorm (samengesteld of los accent)', () => {
    const samengesteld = '\u00E9t\u00E9';
    const los = 'e\u0301te\u0301';
    expect(normalizeAnswer(los, false, true)).toBe(normalizeAnswer(samengesteld, false, true));
  });

  it('hoofdlettergevoelig zonder accentgevoelig: accenten blijven genegeerd', () => {
    expect(normalizeAnswer('Été', true)).toBe(normalizeAnswer('Ete', true));
    expect(normalizeAnswer('Été', true)).not.toBe(normalizeAnswer('ete', true));
  });
});

describe('shuffledNotIdentity', () => {
  const isId = (a: number[]) => a.every((v, i) => v === i);

  it('geeft bij twee items nooit de beginvolgorde terug', () => {
    for (let t = 0; t < 500; t++) expect(isId(shuffledNotIdentity([0, 1]))).toBe(false);
  });

  it('blijft een permutatie van de invoer en laat de invoer ongemoeid', () => {
    const input = [0, 1, 2, 3, 4];
    const out = shuffledNotIdentity(input);
    expect(out.slice().sort()).toEqual([0, 1, 2, 3, 4]);
    expect(input).toEqual([0, 1, 2, 3, 4]);
    expect(out).not.toBe(input);
  });

  it('valt terug op doorschuiven als schudden steeds de beginvolgorde geeft', () => {
    // Math.random dicht bij 1 → j = i bij elke stap → schudden verandert niets
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(shuffledNotIdentity([0, 1, 2])).toEqual([1, 2, 0]);
  });

  it('één item of allemaal gelijke items: gewoon teruggeven', () => {
    expect(shuffledNotIdentity([7])).toEqual([7]);
    expect(shuffledNotIdentity([])).toEqual([]);
    expect(shuffledNotIdentity(['a', 'a', 'a'])).toEqual(['a', 'a', 'a']);
  });

  it('vergelijkt met de meegegeven gelijkheid (zelfde tekst telt als zelfde plaats)', () => {
    const texts = ['zoogdier', 'Zoogdier', 'vogel'];
    const same = (a: number, b: number) => texts[a].toLowerCase() === texts[b].toLowerCase();
    for (let t = 0; t < 300; t++) {
      const out = shuffledNotIdentity([0, 1, 2], same);
      // [1, 0, 2] toont "Zoogdier, zoogdier, vogel": tekstueel al juist, mag dus niet
      expect(out.every((v, i) => same(v, i))).toBe(false);
    }
    // alle teksten gelijk → geen andere volgorde mogelijk
    expect(shuffledNotIdentity([0, 1], (a, b) => a === b || ['x', 'x'][a] === ['x', 'x'][b])).toEqual([0, 1]);
  });
});

describe('csvCell', () => {
  it('zet een apostrof voor tekst die als formule zou starten', () => {
    expect(csvCell('=HYPERLINK("http://x","klik")')).toBe('"\'=HYPERLINK(""http://x"",""klik"")"');
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tverborgen')).toBe('"\'\tverborgen"');
    expect(csvCell('\rterug')).toBe('"\'\rterug"');
  });

  it('laat zuivere getallen ongemoeid, ook negatieve, decimale en procenten', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell('+3,5')).toBe('"+3,5"'); // komma = gequote, maar geen apostrof
    expect(csvCell('-0.5')).toBe('-0.5');
    expect(csvCell('-12%')).toBe('-12%');
    expect(csvCell(42)).toBe('42');
  });

  it('quote velden met scheidingsteken, aanhalingsteken, regeleinde, tab of \\r', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('zeg "hoi"')).toBe('"zeg ""hoi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell('a\tb')).toBe('"a\tb"');
  });

  it('gewone tekst en lege waarden blijven zoals ze zijn', () => {
    expect(csvCell('Jan Peeters')).toBe('Jan Peeters');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('e-mail')).toBe('e-mail');
  });
});
