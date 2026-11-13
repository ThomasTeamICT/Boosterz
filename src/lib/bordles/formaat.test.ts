import { describe, expect, it } from 'vitest';
import type { BordlesConfig } from '../types';
import { antwoordGelijk, gekendeFout, telendeStappen, teltAlsEigenWerk, toetsenbordVoor, uitkomstVan, valideerBordles } from './formaat';
import { voorbeeldPythagoras } from './voorbeeldPythagoras';

const kopie = (c: BordlesConfig): BordlesConfig => JSON.parse(JSON.stringify(c));

describe('valideerBordles', () => {
  it('keurt de voorbeeldles goed', () => {
    expect(valideerBordles(voorbeeldPythagoras())).toEqual([]);
  });
  it('weigert een les zonder fases', () => {
    expect(valideerBordles({ fases: [] })[0].melding).toMatch(/geen fases/);
  });
  it('vindt dubbele stap-id\'s', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[1].stappen[0].id = 'k1';
    expect(valideerBordles(c).some((f) => /twee keer/.test(f.melding))).toBe(true);
  });
  it('eist precies één juiste optie bij een keuzevraag', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[2].stappen[1].keuze!.opties.forEach((o) => { o.juist = true; });
    expect(valideerBordles(c).some((f) => /precies één juiste/.test(f.melding))).toBe(true);
  });
  it('controleert verborgenTot en vervangt', () => {
    const c = kopie(voorbeeldPythagoras());
    const el = c.fases[1].stappen[3].teken[0];
    if (el.soort === 'tekst') el.verborgenTot = 'bestaat-niet';
    c.fases[0].stappen[6].teken[1].vervangt = 'nergens';
    const meldingen = valideerBordles(c).map((f) => f.melding).join('\n');
    expect(meldingen).toMatch(/geen invulstap/);
    expect(meldingen).toMatch(/niet eerder in deze fase/);
  });
  it('aanvaardt een lijst bij vervangt', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[0].stappen[6].teken[1].vervangt = ['k-c', 'k-c2'];
    expect(valideerBordles(c)).toEqual([]);
  });
  it('weigert punten ver buiten het bord', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[0].stappen[0].teken.push({ soort: 'lijn', van: [0, 0], naar: [2000, 0] });
    expect(valideerBordles(c).some((f) => /buiten het bord/.test(f.melding))).toBe(true);
  });
  it('weigert een stap die twee dingen tegelijk vraagt', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[1].stappen[3].waarom = { vraag: 'Waarom?', modelantwoord: 'Daarom.' };
    expect(valideerBordles(c).some((f) => /maar één ding/.test(f.melding))).toBe(true);
  });
  it('weigert een gekend fout antwoord dat gelijk is aan het juiste', () => {
    const c = kopie(voorbeeldPythagoras());
    c.fases[1].stappen[3].invul!.gekendeFouten!.push({ antwoord: '100,0', uitleg: 'x' });
    expect(valideerBordles(c).some((f) => /gelijk aan het juiste/.test(f.melding))).toBe(true);
  });
  it('eist dat de instapvraag iets vraagt', () => {
    const c = kopie(voorbeeldPythagoras());
    delete c.instapvraag!.invul;
    expect(valideerBordles(c).some((f) => /instapvraag moet iets vragen/.test(f.melding))).toBe(true);
  });
});

describe('antwoordGelijk', () => {
  it('vergelijkt getallen numeriek', () => {
    expect(antwoordGelijk('10', '10')).toBe(true);
    expect(antwoordGelijk(' 10,0 ', '10')).toBe(true);
    expect(antwoordGelijk('10.5', '10,5')).toBe(true);
    expect(antwoordGelijk('100', '10')).toBe(false);
  });
  it('vergelijkt tekst zonder hoofdletters en spaties', () => {
    expect(antwoordGelijk('Schuine Zijde', 'schuine zijde')).toBe(true);
    expect(antwoordGelijk('', '0')).toBe(false);
  });
});

describe('resultaten', () => {
  it('telt alleen invul- en keuzestappen buiten Kijk mee', () => {
    const ids = telendeStappen(voorbeeldPythagoras()).map((s) => s.id);
    expect(ids).toEqual(['d4', 'd5', 'f2', 'a2']);
  });
  it('geeft gerichte uitleg bij een gekende fout', () => {
    const stap = voorbeeldPythagoras().fases[1].stappen[3];
    expect(gekendeFout(stap, '14')).toMatch(/6 \+ 8/);
    expect(gekendeFout(stap, '99')).toBeNull();
  });
  it('benoemt de uitkomst', () => {
    expect(uitkomstVan(undefined)).toBe('niet gemaakt');
    expect(uitkomstVan({ opgelost: true, pogingen: 0, hints: 0, getoond: false })).toBe('zonder hulp');
    expect(uitkomstVan({ opgelost: true, pogingen: 1, hints: 1, getoond: false })).toBe('met hulp');
    expect(uitkomstVan({ opgelost: true, pogingen: 3, hints: 2, getoond: true })).toBe('oplossing getoond');
    expect(uitkomstVan({ opgelost: true, pogingen: 0, hints: 0, getoond: false, klas: true })).toBe('samen in de klas');
  });
  it('telt alleen zonder of met hulp als eigen werk', () => {
    expect(teltAlsEigenWerk('met hulp')).toBe(true);
    expect(teltAlsEigenWerk('samen in de klas')).toBe(false);
    expect(teltAlsEigenWerk('oplossing getoond')).toBe(false);
  });
  it('kiest het toetsenbord: cijfers alleen voor een getal zonder teken', () => {
    expect(toetsenbordVoor('100')).toBe('decimal');
    expect(toetsenbordVoor('2,5')).toBe('decimal');
    expect(toetsenbordVoor('-3')).toBe('text');
    expect(toetsenbordVoor('12 cm')).toBe('text');
  });
});
