// Gelijkheid na het weghalen van de lookbehinds (Safari en iPadOS vóór 16.4 laden een chunk met lookbehind
// niet, zie tekenErvoor.ts). Voor elke plaats lopen de oude expressie (met lookbehind; die mag alleen nog
// in tests staan) en de nieuwe code naast elkaar: op randgevallen (begin van de tekst, het verboden teken
// ervoor, letters met accenten en buiten het basisvlak, hoofdletterongevoelige varianten, treffers vlak
// na elkaar, overlap) en op duizenden willekeurige teksten. De uitkomst moet telkens precies gelijk zijn.
import { describe, expect, it } from 'vitest';
import { splitStudentLine } from './classes';
import { normalizeGoalCode } from './curriculum';
import { codeVoorRegex } from './curriculumCheck';
import { splitSentences } from './deriveExercises';
import { markdownToCourse } from './importers';
import { samengevoegdeCode, VERWIJS_VOOR } from './leerplanLezer';
import { leesNiveau } from './leerplanNiveau';
import { zoekVerwijzingBlokken } from './minimumdoelVerwijzing';
import { volgendeTreffer } from './tekenErvoor';
import { bevatFrase } from './vakZoektabel';
import { zoekPersoonsgegevens } from './basis/go/valideer';
import { splitGlossary } from '../widgets/quiz';

// ── Willekeurige teksten uit stukken die de randgevallen raken ──────────────

function rng(seed: number): () => number {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

/** Tekens en woorden waar de grens om draait: accenten, \p{L} buiten het basisvlak, losse surrogaten, hoofdletterregels. */
const RAND = [
  'a', 'z', 'Z', 'é', 'É', 'À', 'Þ', 'ß', 'ø', 'ſ' /* lange s: s zonder hoofdlettergevoeligheid */,
  'K' /* kelvinteken: k */, 'ͅ' /* geen letter, maar ι zonder hoofdlettergevoeligheid */,
  '𝐀' /* letter buiten het basisvlak */, '𝟏' /* cijfer buiten het basisvlak */, '\uD835', '\uDC00', '😀',
  '0', '1', '2', '3', '9', '٣' /* Arabisch-Indisch cijfer */, 'Ⅻ' /* Romeins cijfer, \p{N} */,
  '.', ',', '/', '+', ';', '\t', ' ', '  ', '\n', ' ', ' ', '!', '?', '"', '“', '(', ')', '[', '-', '–', '—', ':', '•', '…',
];

/** Willekeurige teksten: elk stuk komt met kans 0,6 uit `eigen` (de woorden van die plaats), anders uit RAND. */
function tekstenUit(eigen: readonly string[], aantal: number, seed: number, max = 10): string[] {
  const r = rng(seed);
  const uit: string[] = [];
  for (let n = 0; n < aantal; n++) {
    let s = '';
    const lengte = 1 + Math.floor(r() * max);
    for (let i = 0; i < lengte; i++) {
      const bron = r() < 0.6 ? eigen : RAND;
      s += bron[Math.floor(r() * bron.length)];
    }
    uit.push(s);
  }
  return uit;
}

/** Alle plaatsen waar de twee uitkomsten verschillen (leeg = gelijk), met de tekst erbij om te kunnen narekenen. */
function verschillen<T>(teksten: readonly string[], oud: (t: string) => T, nieuw: (t: string) => T): { tekst: string; oud: T; nieuw: T }[] {
  const uit: { tekst: string; oud: T; nieuw: T }[] = [];
  for (const tekst of teksten) {
    const a = oud(tekst);
    const b = nieuw(tekst);
    if (JSON.stringify(a) !== JSON.stringify(b)) uit.push({ tekst, oud: a, nieuw: b });
  }
  return uit.slice(0, 5);
}

/** Hoe vaak de oude expressie iets vond: zo weten we dat de willekeurige teksten de treffers ook echt raken. */
function aantalWaar(teksten: readonly string[], f: (t: string) => boolean): number {
  return teksten.filter(f).length;
}

// ── De generieke helper: volgendeTreffer ─────────────────────────────────────

type Treffer = { index: number; groepen: (string | undefined)[]; lastIndex: number };

/** Alle treffers van een expressie met de vlag g vanaf `start`, met de lastIndex na elke treffer. */
function trefferReeks(volgende: () => RegExpExecArray | null, re: RegExp, start: number): (Treffer | number)[] {
  re.lastIndex = start;
  const uit: (Treffer | number)[] = [];
  for (let n = 0; n < 200; n++) {
    const m = volgende();
    if (!m) {
      uit.push(re.lastIndex); // na de laatste: 0
      return uit;
    }
    uit.push({ index: m.index, groepen: [...m], lastIndex: re.lastIndex });
  }
  throw new Error('loopt niet af');
}

/** Elke beginplaats in de tekst die op een codepunt valt (een treffer begint nooit midden in een surrogaatpaar). */
function beginplaatsen(t: string): number[] {
  const uit: number[] = [];
  for (let i = 0; i <= t.length; i++) {
    const vorige = t.charCodeAt(i - 1);
    const deze = t.charCodeAt(i);
    if (vorige >= 0xd800 && vorige <= 0xdbff && deze >= 0xdc00 && deze <= 0xdfff) continue;
    uit.push(i);
  }
  return uit;
}

const AANDUIDING_BRON = '(?:md|et|em|minimumdoelen|minimumdoel|eindtermen|eindterm)(?!\\p{L})\\s*[:.]?\\s*';

/** De expressies met een treffer-in-een-lus uit de code (leerplanLezer.ts, minimumdoelVerwijzing.ts), plus twee om de helper zelf te toetsen. */
const LUS_GEVALLEN: { naam: string; oud: RegExp; nieuw: RegExp; verboden: RegExp; stukken: string[] }[] = [
  {
    naam: 'samengevoegdeCode, code met letters (LPD 2)',
    oud: new RegExp(String.raw`(?<![\p{L}\p{N}])(LPD\s?\d{1,3}(?:U|\s?\(U\))?)(?![\p{L}\p{N}]|\.\d)[\s:.)–—-]+`, 'giu'),
    nieuw: new RegExp(String.raw`(LPD\s?\d{1,3}(?:U|\s?\(U\))?)(?![\p{L}\p{N}]|\.\d)[\s:.)–—-]+`, 'giu'),
    verboden: /[\p{L}\p{N}]$/iu,
    stukken: ['LPD', 'lpd', 'Lpd', 'LPD 2', 'LPD12', 'LPD 3U', 'LPD 4 (U)', ' ', '. ', ': ', ') '],
  },
  {
    naam: 'samengevoegdeCode, code van één getal (2.)',
    oud: new RegExp(String.raw`(?<![\p{L}\p{N}.])(\d{1,3})[.)]\s+`, 'gu'),
    nieuw: new RegExp(String.raw`(\d{1,3})[.)]\s+`, 'gu'),
    verboden: /[\p{L}\p{N}.]$/u,
    stukken: ['2. ', '12) ', '1234. ', '3.', ' '],
  },
  {
    naam: 'samengevoegdeCode, code van twee delen (1.2)',
    oud: new RegExp(String.raw`(?<![\p{L}\p{N}.])(\d{1,3}(?:\.\d{1,3}){1}U?)(?![\p{L}\p{N}]|\.\d)\.?[\s:)–—-]+`, 'gu'),
    nieuw: new RegExp(String.raw`(\d{1,3}(?:\.\d{1,3}){1}U?)(?![\p{L}\p{N}]|\.\d)\.?[\s:)–—-]+`, 'gu'),
    verboden: /[\p{L}\p{N}.]$/u,
    stukken: ['1.2 ', '1.2U ', '1.2.3 ', '12.34: ', '.5 ', '1.2- '],
  },
  {
    naam: 'zoekVerwijzingBlokken, de aanduiding (MD, ET, minimumdoel)',
    oud: new RegExp(`(?<![\\p{L}\\p{N}])${AANDUIDING_BRON}`, 'giu'),
    nieuw: new RegExp(AANDUIDING_BRON, 'giu'),
    verboden: /[\p{L}\p{N}]$/iu,
    stukken: ['md', 'MD', 'Md', 'et', 'ET', 'em', 'EM', 'het', 'emmer', 'minimumdoel', 'minimumdoelen', 'Eindtermen', 'eindterm', ' 09.01', ': ', '. '],
  },
  {
    naam: 'helper: treffer die met een teken buiten het basisvlak begint',
    oud: /(?<![a-z])[\p{L}\p{N}]{1,2}/gu,
    nieuw: /[\p{L}\p{N}]{1,2}/gu,
    verboden: /[a-z]$/u,
    stukken: RAND,
  },
  {
    naam: 'helper: zonder de vlag u (code-eenheden)',
    oud: /(?<![A-Z\uDC00])(?:WT\.086|\uDC00|\uD835)(?!\d)/g,
    nieuw: /(?:WT\.086|\uDC00|\uD835)(?!\d)/g,
    verboden: /[A-Z\uDC00]$/,
    stukken: ['WT.086', 'XWT.086', 'WT.0861', 'A'],
  },
];

describe('volgendeTreffer: hetzelfde als een negatieve lookbehind vooraan', () => {
  for (const g of LUS_GEVALLEN) {
    it(`${g.naam}: dezelfde treffers, groepen en lastIndex, vanaf elke beginplaats`, () => {
      const teksten = tekstenUit(g.stukken, 1500, 7);
      const fout: unknown[] = [];
      let treffers = 0;
      for (const t of teksten) {
        for (const start of beginplaatsen(t)) {
          const a = trefferReeks(() => g.oud.exec(t), g.oud, start);
          const b = trefferReeks(() => volgendeTreffer(g.nieuw, t, g.verboden), g.nieuw, start);
          if (JSON.stringify(a) !== JSON.stringify(b)) fout.push({ t, start, a, b });
          if (start === 0) treffers += a.length - 1;
        }
      }
      expect(fout.slice(0, 3)).toEqual([]);
      expect(treffers).toBeGreaterThan(100);
    });
  }

  it('randgevallen: begin van de tekst, verboden teken ervoor, treffers vlak na elkaar', () => {
    const g = LUS_GEVALLEN[1];
    const reeks = (t: string) => trefferReeks(() => volgendeTreffer(g.nieuw, t, g.verboden), g.nieuw, 0);
    // aan het begin mag het; na een letter, cijfer of punt niet; vlak na een vorige treffer wel
    expect(reeks('2. Tekst')).toEqual([{ index: 0, groepen: ['2. ', '2'], lastIndex: 3 }, 0]);
    expect(reeks('a2. x')).toEqual([0]);
    expect(reeks('é2. x')).toEqual([0]);
    expect(reeks('𝐀2. x')).toEqual([0]);
    expect(reeks('1.2. x')).toEqual([0]);
    expect(reeks('2. 3. 4) x').filter((x) => typeof x !== 'number').map((x) => (x as Treffer).groepen[1])).toEqual(['2', '3', '4']);
    // de lookbehind van de oude expressie ziet hetzelfde
    for (const t of ['2. Tekst', 'a2. x', 'é2. x', '𝐀2. x', '1.2. x', '2. 3. 4) x', '12345. x']) {
      expect(reeks(t)).toEqual(trefferReeks(() => g.oud.exec(t), g.oud, 0));
    }
  });
});

// ── leerplanLezer.ts: VERWIJS_VOOR en samengevoegdeCode ─────────────────────

const OUD_VERWIJS_VOOR = /(?<![\p{L}\p{N}])(?:md|et|em|minimumdoel(?:en)?|eindterm(?:en)?)\s*[:.]?\s*$/iu;

describe('leerplanLezer.ts: VERWIJS_VOOR', () => {
  const teksten = [
    'md', 'MD ', 'het', 'Het MD:', 'zie ET.', 'emmer', 'a md', 'éet', '𝐀md', '1md', 'minimumdoelen: ', 'eindtermen .',
    'ſMD', 'Ket', 'ͅmd', 'xͅmd', '\nmd', '(md',
    ...tekstenUit(['md', 'MD', 'et', 'ET', 'em', 'minimumdoel', 'minimumdoelen', 'eindterm', 'eindtermen', 'het', ':', '.'], 6000, 11, 6),
  ];
  it('test() geeft voor elke tekst hetzelfde als de oude expressie', () => {
    expect(verschillen(teksten, (t) => OUD_VERWIJS_VOOR.test(t), (t) => VERWIJS_VOOR.test(t))).toEqual([]);
    expect(aantalWaar(teksten, (t) => OUD_VERWIJS_VOOR.test(t))).toBeGreaterThan(300);
    expect(aantalWaar(teksten, (t) => !OUD_VERWIJS_VOOR.test(t))).toBeGreaterThan(300);
  });
});

/** samengevoegdeCode zoals ze was, met de lookbehinds (commit 6f3610d). */
function oudeSamengevoegdeCode(tekst: string, code: string): string | undefined {
  const STERKE_DOELZIN = /^(?:de\s+)?leerling(?:en)?\b/i;
  const DOELZIN = /^["'“‘„(]?\p{Lu}/u;
  const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = /^(\p{L}{1,6})?\s?(\d{1,3}(?:\.\d{1,3}){0,3})\s?(?:U|\(U\))?$/u.exec(normalizeGoalCode(code));
  if (!m) return undefined;
  const letters = m[1];
  const diepte = m[2].split('.').length;
  const nummer = diepte === 1 ? String.raw`\d{1,3}` : String.raw`\d{1,3}(?:\.\d{1,3}){${diepte - 1}}`;
  const re = letters
    ? new RegExp(String.raw`(?<![\p{L}\p{N}])(${escapeRe(letters)}\s?${nummer}(?:U|\s?\(U\))?)(?![\p{L}\p{N}]|\.\d)[\s:.)–—-]+`, 'giu')
    : diepte === 1
      ? new RegExp(String.raw`(?<![\p{L}\p{N}.])(${nummer})[.)]\s+`, 'gu')
      : new RegExp(String.raw`(?<![\p{L}\p{N}.])(${nummer}U?)(?![\p{L}\p{N}]|\.\d)\.?[\s:)–—-]+`, 'gu');
  let treffer: RegExpExecArray | null;
  while ((treffer = re.exec(tekst)) !== null) {
    const ervoor = tekst.slice(0, treffer.index);
    if (OUD_VERWIJS_VOOR.test(ervoor)) continue;
    const na = tekst.slice(treffer.index + treffer[0].length);
    if (STERKE_DOELZIN.test(na)) return treffer[1].trim();
    if (letters && DOELZIN.test(na) && /(?:^|[.!?;:])\s*$/.test(ervoor)) return treffer[1].trim();
  }
  return undefined;
}

describe('leerplanLezer.ts: samengevoegdeCode', () => {
  const codes = ['LPD 2', 'LPD 12', 'LPD 1.2', 'lpd 3', 'AAR 2.1', 'É 4', '2', '12', '1.2', '1.2.3', 'LPD 2 (U)'];
  const stukken = [
    'De leerlingen kunnen A.', ' De leerling ', 'de leerlingen', 'Tekst', 'LPD 2', 'LPD12', 'lpd 3U', 'AAR 2.1', 'é 4',
    '2. ', '12) ', '1.2 ', '1.2.3: ', '3.4.5 ', 'MD 09.01 ', 'ET ', '. ', ': ', ' ',
  ];
  const teksten = [
    'De leerlingen kunnen A. LPD 2 De leerlingen kunnen B.', 'Tekst. LPD 3 Tekst', 'xLPD 2 De leerling', 'MD 2. De leerling',
    '1.2.3 de leerlingen', 'Tekst 2. 3. De leerling', 'é4 De leerling', '𝐀LPD 2 De leerling',
    ...tekstenUit(stukken, 3000, 13, 8),
  ];
  it('geeft voor elke tekst en code hetzelfde als vroeger', () => {
    let gevonden = 0;
    for (const code of codes) {
      expect(verschillen(teksten, (t) => oudeSamengevoegdeCode(t, code), (t) => samengevoegdeCode(t, code))).toEqual([]);
      gevonden += aantalWaar(teksten, (t) => oudeSamengevoegdeCode(t, code) !== undefined);
    }
    expect(gevonden).toBeGreaterThan(200);
  });
});

// ── minimumdoelVerwijzing.ts: zoekVerwijzingBlokken (aanduiding los in de tekst) ─

describe('minimumdoelVerwijzing.ts: zoekVerwijzingBlokken', () => {
  // De lus zelf is hierboven nagerekend tegen de oude expressie, vanaf elke beginplaats (ook de
  // lastIndex die de functie met de hand zet). Hier de randgevallen van de aanduiding in de tekst.
  it('vindt de aanduiding aan het begin, na een leesteken en vlak na een vorig blok, niet midden in een woord', () => {
    const starts = (t: string) => zoekVerwijzingBlokken(t).map((b) => [b.start, b.tekst]);
    expect(starts('MD 09.01')).toEqual([[0, 'MD 09.01']]);
    expect(starts('het 09.01')).toEqual([]);
    expect(starts('(MD 09.01)')).toEqual([[1, 'MD 09.01']]);
    expect(starts('éMD 09.01')).toEqual([]);
    expect(starts('𝐀MD 09.01')).toEqual([]);
    expect(starts('2MD 09.01')).toEqual([]);
    expect(starts('ſMD 09.01, ET 1.2')).toEqual([[11, 'ET 1.2']]);
    expect(starts('MD 09.01;ET 1.2')).toEqual([[0, 'MD 09.01;ET 1.2']]);
    expect(starts('MD x, MD 09.03')).toEqual([[6, 'MD 09.03']]);
    expect(starts('MD 09.01 en ET 9.1')).toEqual([[0, 'MD 09.01 en ET 9.1']]);
    expect(starts('MD 09.01 (zie ET 9.1)')).toEqual([[0, 'MD 09.01'], [14, 'ET 9.1']]);
    expect(starts('(MD 09.01)(ET 9.1)')).toEqual([[1, 'MD 09.01'], [11, 'ET 9.1']]);
  });
});

// ── curriculumCheck.ts: codeVoorRegex ───────────────────────────────────────

const TUSSEN_CODE_EN_TEKST = String.raw`(?:\s|[:.)\]–—-]|\(U\)|\(uitbreiding(?:sdoel)?\)|uitbreidingsdoel\s*:?|uitbreiding\s*:|[•●○◦▪■▫□►▸‣⁃∙·])*`;

function oudeCodeVoorRegex(code: string): RegExp | undefined {
  const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const basis = normalizeGoalCode(code).replace(/\s?\(U\)$/, '').replace(/(\d)U$/, '$1');
  if (!basis) return undefined;
  const patroon = escapeRe(basis.replace(/(\p{L})(\d)/gu, '$1 $2')).replace(/ /g, String.raw`\s?`);
  return new RegExp(String.raw`(?<![\p{L}\p{N}.])${patroon}(?:\s?U|\s?\(U\))?${TUSSEN_CODE_EN_TEKST}$`, 'iu');
}

describe('curriculumCheck.ts: codeVoorRegex', () => {
  const codes = ['LPD 12', 'LPD12', 'lpd 1.2', '1.2.3', '2', 'AAR 2.1 (U)', '2U', 'BG 1.2', 'é 3', 'WT.086'];
  const staarten = ['', ' ', ': ', ' (U) ', 'U', ' (uitbreiding) ', '•', ' – ', '.', ' x'];
  const stukken = ['LPD 12', 'LPD12', 'lpd 1.2', '1.2.3', '2', 'AAR 2.1', '2U', 'BG 1.2', 'é 3', 'WT.086', 'é3'];
  const r = rng(17);
  const teksten = tekstenUit(stukken, 3000, 19, 5).map((t) => t + staarten[Math.floor(r() * staarten.length)]);
  it('test() geeft voor elke code en tekst hetzelfde als de oude expressie', () => {
    let waar = 0;
    for (const code of codes) {
      const oud = oudeCodeVoorRegex(code);
      const nieuw = codeVoorRegex(code);
      expect(nieuw === undefined).toBe(oud === undefined);
      if (!oud || !nieuw) continue;
      expect(verschillen(teksten, (t) => oud.test(t), (t) => nieuw.test(t))).toEqual([]);
      waar += aantalWaar(teksten, (t) => oud.test(t));
    }
    expect(waar).toBeGreaterThan(300);
  });
});

// ── leerplanNiveau.ts: leesNiveau (stroom) ──────────────────────────────────

describe('leerplanNiveau.ts: leesNiveau', () => {
  const oud = (t: string) => {
    const s = /(?<![\p{L}\d])([AB])[\s-]*stroom/iu.exec(t)?.[1];
    return s ? `${s.toUpperCase()}-stroom` : '';
  };
  const teksten = [
    'A-stroom', '1e graad, A stroom', 'B-stroom', 'aB-stroom', 'éA stroom', '2A-stroom', '𝐀B-stroom', 'b stroom', 'AB-stroom',
    'xA-stroom B-stroom', 'A- -stroom',
    ...tekstenUit(['A', 'B', 'a', 'b', 'stroom', 'Stroom', '-', ' ', 'graad', '1e'], 6000, 23, 6),
  ];
  it('leest dezelfde stroom als de oude expressie', () => {
    expect(verschillen(teksten, oud, (t) => leesNiveau(t).stroom)).toEqual([]);
    expect(aantalWaar(teksten, (t) => oud(t) !== '')).toBeGreaterThan(300);
  });
});

// ── vakZoektabel.ts: bevatFrase ─────────────────────────────────────────────

describe('vakZoektabel.ts: bevatFrase', () => {
  const oud = (tekst: string, frase: string) => {
    const vrijEinde = frase.endsWith('*');
    const kaal = (vrijEinde ? frase.slice(0, -1) : frase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\d])${kaal}${vrijEinde ? '' : '(?![\\p{L}\\d])'}`, 'u').test(tekst);
  };
  const frases = ['lo', 'frans*', 'a b', 'c++', 'r.k.', '3d', 'é', 'x', 'wiskunde'];
  const teksten = tekstenUit(['lo', 'frans', 'franse', 'a b', 'c++', 'r.k.', '3d', 'é', 'x', 'wiskunde', 'slo'], 4000, 29, 6);
  it('test() geeft voor elke frase en tekst hetzelfde als de oude expressie', () => {
    let waar = 0;
    for (const frase of frases) {
      expect(verschillen(teksten, (t) => oud(t, frase), (t) => bevatFrase(t, frase))).toEqual([]);
      waar += aantalWaar(teksten, (t) => oud(t, frase));
    }
    expect(waar).toBeGreaterThan(300);
  });
});

// ── basis/go/valideer.ts: bevatCode en de telefoonnummers ───────────────────

describe('basis/go/valideer.ts', () => {
  // bevatCode is niet geëxporteerd (en valideer.ts verandert in dit pakket alleen in de expressies): de
  // nieuwe expressie staat hier letterlijk zoals in bevatCode. De gewone tests van valideer.ts en
  // goBestanden.test.ts lopen bevatCode door op alle echte lesplannen.
  it('bevatCode: dezelfde uitkomst als de oude expressie', () => {
    const codes = ['WT.086', 'NL.1', 'MV.040', 'A.1', 'WO.12'];
    const teksten = tekstenUit(['WT.086', 'WT.0861', 'XWT.086', 'wt.086', 'NL.1', 'NL.12', 'MV.040', 'A.1', 'BA.1', 'WO.12', 'WO.123'], 4000, 31, 6);
    let waar = 0;
    for (const code of codes) {
      const oud = new RegExp(`(?<![A-Z])${code.replace('.', '\\.')}(?!\\d)`);
      const nieuw = new RegExp(`(?:^|[^A-Z])${code.replace('.', '\\.')}(?!\\d)`);
      expect(verschillen(teksten, (t) => oud.test(t), (t) => nieuw.test(t))).toEqual([]);
      waar += aantalWaar(teksten, (t) => oud.test(t));
    }
    expect(waar).toBeGreaterThan(300);
  });

  const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  const OUD_TELEFOON = [
    /(?<![\p{L}\p{N}.,/+])(?:\+|00)32[ ./-]?(?:\(0\)[ .]?)?[1-9](?:[ ./-]?\d){7,8}(?![\p{L}\p{N}]|[.,]\d)/u,
    /(?<![\p{L}\p{N}.,/])04[5-9]\d(?:[ ./-]?\d){6}(?![\p{L}\p{N}]|[.,]\d)/u,
    /(?<![\p{L}\p{N}.,/])0[2349][ /.]?\d{3}[ .]?\d{2}[ .]?\d{2}(?![\p{L}\p{N}]|[.,]\d)/u,
    /(?<![\p{L}\p{N}.,/])0[1-9]\d[ /.]?\d{2}[ .]?\d{2}[ .]?\d{2}(?![\p{L}\p{N}]|[.,]\d)/u,
  ];
  const oudPersoonsgegeven = (s: string) => {
    if (s.includes('@') && RE_EMAIL.test(s)) return 'e-mail';
    if (/\d{2}/.test(s.replace(/[ ./-]/g, '')) && OUD_TELEFOON.some((re) => re.test(s))) return 'telefoon';
    return undefined;
  };
  const nieuwPersoonsgegeven = (s: string) => zoekPersoonsgegevens(s)[0]?.soort;

  it('zoekPersoonsgegevens: dezelfde telefoonnummers als met de oude expressies', () => {
    const teksten = [
      '0475 12 34 56', 'a0475123456', '.0475123456', ',0475123456', '/0475123456', '+0032475123456', 'é09 123 45 67',
      '𝐀050 12 34 56', '03/07/2018', '1 412 164 992', 'tel. +32 9 123 45 67', '+32 (0)9 123 45 67', '0475/12.34.56,5',
      ...tekstenUit(
        ['0475 12 34 56', '09 123 45 67', '+32 9 123 45 67', '050/12.34.56', '0475', '0485', '12', '34', '56', '123', '45', '67', '09', '02', '050', '015', '+32', '0032', '(0)', '9', ' ', '/', '.', '-', ',', 'a'],
        8000, 37, 9,
      ),
    ];
    expect(verschillen(teksten, oudPersoonsgegeven, nieuwPersoonsgegeven)).toEqual([]);
    expect(aantalWaar(teksten, (t) => oudPersoonsgegeven(t) === 'telefoon')).toBeGreaterThan(300);
  });
});

// ── deriveExercises.ts: splitSentences ──────────────────────────────────────

describe('deriveExercises.ts: splitSentences', () => {
  const oud = (l: string) => l.split(/(?<=[.!?])\s+(?=[A-ZÀ-Þ"“(])/);
  const teksten = [
    '', 'Een zin. Nog een zin.', 'Eén! Twee? Drie.', 'a. b. C', 'a.  B', 'a. . B', 'Dr. Jansen kwam.', 'x. Y', 'x.\nY',
    'Zo. "Citaat" en (haakje). “Ook”', 'Prijs 3.5 Euro', 'Einde. ',
    ...tekstenUit(['Zin', 'zin', 'A', 'Þ', 'À', '. ', '! ', '? ', '.  ', '. . '], 6000, 41, 8),
  ];
  it('knipt elke tekst op dezelfde plaatsen als de oude expressie', () => {
    expect(verschillen(teksten, oud, splitSentences)).toEqual([]);
    expect(aantalWaar(teksten, (t) => oud(t).length > 1)).toBeGreaterThan(500);
  });
});

// ── importers.ts: zinnen tellen in termPair ─────────────────────────────────

describe('importers.ts: zinnen tellen in een definitie', () => {
  const oud = (u: string) => u.split(/(?<=[.!?])\s/).length;
  const nieuw = (u: string) => u.split(/[.!?]\s/).length; // zoals in termPair
  it('telt voor elke tekst evenveel stukken als de oude expressie', () => {
    const teksten = ['', 'Eén zin.', 'a. b. c. d', 'a.. b', 'a. . . b', 'Ca. 5 m. Dat is veel.', ...tekstenUit(['zin', '. ', '! ', '? ', '..'], 6000, 43, 8)];
    expect(verschillen(teksten, oud, nieuw)).toEqual([]);
    expect(aantalWaar(teksten, (t) => oud(t) > 3)).toBeGreaterThan(300);
  });

  it('buiten een begrippensectie: een definitie van drie zinnen telt mee, vier zinnen is een tussenkop', () => {
    const md = (uitleg: string) =>
      ['# H', '', '## Uitleg', '', '**Kracht** Een duw of een trek.', '', `**Massa** ${uitleg}`, '', '**Veerkracht** Kracht van een veer.', ''].join('\n');
    const soorten = (uitleg: string) => markdownToCourse(md(uitleg), 'x').chapters[0].sections[0].blocks.map((b) => b.type);
    expect(soorten('Een. Twee. Drie.')).toEqual(['terms']);
    expect(soorten('Een. Twee. Drie. Vier.')).toEqual(['text', 'text', 'text']);
  });
});

// ── classes.ts: splitStudentLine ────────────────────────────────────────────

describe('classes.ts: splitStudentLine', () => {
  const oud = (line: string) => line.split(/[;\t]|,(?=\s*\d{1,3}\s*$)|(?<=^\s*\d{1,3}\s*),/);
  const teksten = [
    '12, Emma', 'Emma, 12', ' 12 , Emma', '\t12,Emma', '1234, Emma', '12,', ',12', '12, Emma, 3', '12;Emma\t3', 'Emma Peeters',
    '12 , 13', '١٢, Emma', ' 7 ,7', '12,\t3',
    ...tekstenUit(['12', '3', '1234', ',', ', ', ';', '\t', ' ', 'Emma', 'Peeters'], 6000, 47, 7),
  ];
  it('knipt elke regel op dezelfde plaatsen als de oude expressie', () => {
    expect(verschillen(teksten, oud, splitStudentLine)).toEqual([]);
    expect(aantalWaar(teksten, (t) => /^\s*\d{1,3}\s*,/.test(t))).toBeGreaterThan(100);
  });
});

// ── widgets/quiz.tsx: splitGlossary ─────────────────────────────────────────

describe('widgets/quiz.tsx: splitGlossary', () => {
  const oud = (text: string, pattern: string) => text.split(new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu'));
  // Zo bouwt PromptText het patroon: begrippen, geëscapet, de langste eerst. Een begrip is nooit leeg.
  const patronen = ['arm', 'warm|arm', '\\(a\\)', 'x-', '3\\.5', 'é', '𝐀', 'k', 's', 'ι', 'a b'];
  const teksten = [
    '', 'arm', 'warm', 'een arm en een warm hart', '(a)(a)', 'x-x-', 'x- x-', '3.5 en 13.5', 'éé é', '𝐀𝐀 𝐀', '\u212A k', 'ſ s',
    '\u0345 ι', 'a b a b', 'arm.arm', 'ARM Arm',
    ...tekstenUit(['arm', 'warm', 'ARM', '(a)', 'x-', '3.5', 'é', '𝐀', 'k', 's', 'ι', 'a b', 'a', ' ', '.'], 4000, 53, 7),
  ];
  it('geeft dezelfde stukken als de oude split, ook bij treffers vlak na elkaar', () => {
    let treffers = 0;
    for (const p of patronen) {
      expect(verschillen(teksten, (t) => oud(t, p), (t) => splitGlossary(t, p))).toEqual([]);
      treffers += aantalWaar(teksten, (t) => oud(t, p).length > 1);
    }
    expect(treffers).toBeGreaterThan(1000);
  });

  it('een patroon dat leeg kan treffen (komt in de app niet voor): dezelfde stappen als split, binnen het basisvlak', () => {
    // Met een lege treffer knipt V8 een teken buiten het basisvlak soms middenin (tegen de regel
    // AdvanceStringIndex van de standaard in); splitGlossary volgt de standaard. Een begrip is nooit leeg,
    // dus in de app treft het patroon nooit leeg; hier daarom alleen teksten zonder surrogaten.
    const bmp = teksten.filter((t) => !/[\uD800-\uDFFF]/.test(t));
    expect(bmp.length).toBeGreaterThan(1500);
    for (const p of ['', 'a|', '(?:)']) expect(verschillen(bmp, (t) => oud(t, p), (t) => splitGlossary(t, p))).toEqual([]);
  });

  it('randgevallen', () => {
    expect(splitGlossary('(a)(a)', '\\(a\\)')).toEqual(['', '(a)', '', '(a)', '']);
    expect(splitGlossary('een warm hart', 'arm')).toEqual(['een warm hart']);
    expect(splitGlossary('Arm, arm!', 'arm')).toEqual(['', 'Arm', ', ', 'arm', '!']);
    expect(splitGlossary('éarm 𝐀arm 1arm', 'arm')).toEqual(['éarm 𝐀arm 1arm']);
    expect(splitGlossary('', 'arm')).toEqual(['']);
    expect(splitGlossary('', '')).toEqual([]);
  });
});
