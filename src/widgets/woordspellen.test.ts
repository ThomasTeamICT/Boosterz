import { describe, expect, it } from 'vitest';
import {
  formatHangmanLines, hangmanCells, hangmanLetter, hangmanLetters, hangmanSolved, parseHangmanLines,
} from './hangman';
import { formatScrambleLines, parseScrambleLines, scrambleParts } from './scramble';
import { generateWordsearch } from './wordsearch';
import { generateCrossword } from './crossword';

const guessedOf = (letters: string) => new Set(letters.split(''));

describe('Galgje: regels inlezen (hint typen)', () => {
  it('scheidt woord en hint op een dubbelepunt met spatie', () => {
    expect(parseHangmanLines('appel: een stuk fruit')).toEqual([{ word: 'appel', hint: 'een stuk fruit' }]);
  });

  it('laat een dubbelepunt zonder spatie staan (een uur, een verhouding)', () => {
    expect(parseHangmanLines('Het is 12:30 nu.')).toEqual([{ word: 'Het is 12:30 nu.', hint: '' }]);
  });

  it('neemt de laatste dubbelepunt met spatie als scheiding', () => {
    expect(parseHangmanLines('Het is 12:30 nu.: weerbericht')).toEqual([{ word: 'Het is 12:30 nu.', hint: 'weerbericht' }]);
    expect(parseHangmanLines('Let op: dit: zo')).toEqual([{ word: 'Let op: dit', hint: 'zo' }]);
  });

  it('geeft een lege hint als er niets achter de dubbelepunt staat', () => {
    expect(parseHangmanLines('appel:  ')).toEqual([{ word: 'appel', hint: '' }]);
  });

  it('leest meerdere regels en trimt de spaties', () => {
    expect(parseHangmanLines('  boom  \nhuis : een woning \n')).toEqual([
      { word: 'boom', hint: '' },
      { word: 'huis', hint: 'een woning' },
      { word: '', hint: '' },
    ]);
  });

  it('format en parse geven hetzelfde terug, ook met een dubbelepunt in het woord', () => {
    const lijst = [
      { word: 'appel', hint: 'een stuk fruit' },
      { word: 'Het is 12:30 nu.', hint: '' },
      { word: 'Let op: dit', hint: '' },
      { word: 'Let op: dit', hint: 'zo' },
    ];
    expect(parseHangmanLines(formatHangmanLines(lijst))).toEqual(lijst);
  });

  it('de hint verschijnt pas na een dubbelepunt en een spatie (zo gaat het bij het typen)', () => {
    expect(parseHangmanLines('appel:')[0]).toEqual({ word: 'appel:', hint: '' });
    expect(parseHangmanLines('appel: ')[0]).toEqual({ word: 'appel', hint: '' });
    expect(parseHangmanLines('appel: e')[0]).toEqual({ word: 'appel', hint: 'e' });
    expect(parseHangmanLines('Het is 12:')[0].hint).toBe('');
    expect(parseHangmanLines('Het is 12:30')[0].hint).toBe('');
  });
});

describe('Galgje: letters en accenten', () => {
  it('geeft de basisletter in hoofdletters', () => {
    expect(hangmanLetter('é')).toBe('E');
    expect(hangmanLetter('Ë')).toBe('E');
    expect(hangmanLetter('ç')).toBe('C');
    expect(hangmanLetter('b')).toBe('B');
  });

  it('geeft null voor tekens zonder basisletter in A-Z', () => {
    for (const ch of ['ß', 'Æ', 'æ', 'ø', '-', '1', ' ', '’', '.']) expect(hangmanLetter(ch)).toBeNull();
  });

  it('"België" is opgelost met B, E, L, G en I', () => {
    expect(hangmanSolved('België', guessedOf('BELG'))).toBe(false);
    expect(hangmanSolved('België', guessedOf('BELGI'))).toBe(true);
    expect([...hangmanLetters('België')].sort()).toEqual(['B', 'E', 'G', 'I', 'L']);
  });

  it('"ideeën", "café" en "Curaçao" zijn oplosbaar met gewone letters', () => {
    expect(hangmanSolved('ideeën', guessedOf('IDE'))).toBe(false);
    expect(hangmanSolved('ideeën', guessedOf('IDEN'))).toBe(true);
    expect(hangmanSolved('café', guessedOf('CAFE'))).toBe(true);
    expect(hangmanSolved('Curaçao', guessedOf('CURAO'))).toBe(true);
  });

  it('raadt de leerling E, dan verschijnen ook É en Ë (met hun accent)', () => {
    expect(hangmanCells('België', guessedOf('E'))).toEqual(['_', 'E', '_', '_', '_', 'Ë']);
    expect(hangmanCells('café', guessedOf('E'))).toEqual(['_', '_', '_', 'É']);
    expect(hangmanCells('ideeën', guessedOf('E'))).toEqual(['_', '_', 'E', 'E', 'Ë', '_']);
  });

  it('toont ß, Æ, cijfers en leestekens meteen', () => {
    expect(hangmanCells('Straße', guessedOf(''))).toEqual(['_', '_', '_', '_', 'ß', '_']);
    expect(hangmanCells('Æon-2', guessedOf(''))).toEqual(['Æ', '_', '_', '-', '2']);
    expect(hangmanLetters('Æ').size).toBe(0);
  });

  it('toont het hele woord als reveal aan staat', () => {
    expect(hangmanCells('België', guessedOf(''), true)).toEqual(['B', 'E', 'L', 'G', 'I', 'Ë']);
  });

  it('werkt ook met losse combinerende accenten (Mac-invoer)', () => {
    const cafe = 'café';
    expect(hangmanSolved(cafe, guessedOf('CAFE'))).toBe(true);
    expect(hangmanCells(cafe, guessedOf('CAF'))).toEqual(['C', 'A', 'F', '_']);
  });
});

describe('Husselwoorden: regels inlezen en stukjes', () => {
  const ids = () => 'x';

  it('scheidt tekst en hint op de laatste dubbelepunt met spatie', () => {
    expect(parseScrambleLines('appel: een stuk fruit', ids)).toEqual([{ id: 'x', text: 'appel', hint: 'een stuk fruit' }]);
  });

  it('splitst "Het is 12:30 nu." niet', () => {
    expect(parseScrambleLines('Het is 12:30 nu.', ids)).toEqual([{ id: 'x', text: 'Het is 12:30 nu.', hint: '' }]);
    expect(parseScrambleLines('Het is 12:30 nu.: tijd', ids)).toEqual([{ id: 'x', text: 'Het is 12:30 nu.', hint: 'tijd' }]);
  });

  it('trimt tekst en hint, ook een spatie op het einde van de regel', () => {
    expect(parseScrambleLines('De zon schijnt. ', ids)[0].text).toBe('De zon schijnt.');
    expect(parseScrambleLines('  boom : plant  ', ids)[0]).toEqual({ id: 'x', text: 'boom', hint: 'plant' });
  });

  it('format en parse geven hetzelfde terug', () => {
    const lijst = [
      { id: 'x', text: 'appel', hint: 'een stuk fruit' },
      { id: 'x', text: 'Het is 12:30 nu.', hint: '' },
      { id: 'x', text: 'Let op: dit', hint: '' },
    ];
    expect(parseScrambleLines(formatScrambleLines(lijst), ids)).toEqual(lijst);
  });

  it('geeft geen leeg stukje bij een spatie op het einde (zin)', () => {
    for (let i = 0; i < 20; i++) {
      const parts = scrambleParts('De zon schijnt ', 'sentence');
      expect(parts).toHaveLength(3);
      expect(parts.every((p) => p.length > 0)).toBe(true);
      expect([...parts].sort()).toEqual(['De', 'schijnt', 'zon']);
    }
  });

  it('geeft geen leeg stukje bij een spatie op het einde (woord)', () => {
    const parts = scrambleParts('boom ', 'word');
    expect(parts).toHaveLength(4);
    expect([...parts].sort()).toEqual(['b', 'm', 'o', 'o']);
  });

  it('husselt niet naar het origineel', () => {
    for (let i = 0; i < 30; i++) expect(scrambleParts('abc', 'word').join('')).not.toBe('abc');
  });
});

describe('Woordspellen: dubbele woorden', () => {
  it('woordzoeker: "huis" en "Huis" tellen als één woord', () => {
    const gen = generateWordsearch({ words: ['huis', 'Huis', 'boom'], size: 8, allowDiagonal: false, allowReverse: false }, 7);
    expect(gen.placed.map((p) => p.word).sort()).toEqual(['BOOM', 'HUIS']);
    expect(gen.duplicates).toEqual(['Huis']);
  });

  it('woordzoeker: ook met accenten en spaties genormaliseerd', () => {
    const gen = generateWordsearch({ words: ['café', 'CAFE', ' cafe ', 'thee'], size: 8, allowDiagonal: false, allowReverse: false }, 7);
    expect(gen.placed).toHaveLength(2);
    expect(gen.duplicates).toEqual(['CAFE', 'cafe']);
  });

  it('woordzoeker zonder dubbels meldt niets', () => {
    const gen = generateWordsearch({ words: ['huis', 'boom'], size: 8, allowDiagonal: false, allowReverse: false }, 7);
    expect(gen.duplicates).toEqual([]);
  });

  it('kruiswoord: een dubbel woord komt één keer in het rooster, met de eerste omschrijving', () => {
    const entries = [
      { id: '1', word: 'huis', clue: 'een woning' },
      { id: '2', word: 'Huis', clue: 'een gebouw' },
      { id: '3', word: 'sluis', clue: 'bij een kanaal' },
    ];
    const gen = generateCrossword(entries);
    const words = gen.placements.map((p) => p.word);
    expect(words.filter((w) => w === 'HUIS')).toHaveLength(1);
    expect(gen.placements.find((p) => p.word === 'HUIS')?.clue).toBe('een woning');
    expect(gen.duplicates).toEqual(['Huis']);
  });

  it('kruiswoord: genormaliseerd ontdubbelen, ook als er niets te plaatsen valt', () => {
    const gen = generateCrossword([{ id: '1', word: 'x', clue: '' }, { id: '2', word: 'X', clue: '' }]);
    expect(gen.placements).toEqual([]);
    expect(gen.duplicates).toEqual([]); // te korte woorden zijn geen dubbels
  });
});
