import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeProgressImport, importProgress, sanitizeSubmission, submissionTooLarge, voortgangscodesMelding,
  type ProgressImportResult,
} from './progressTransfer';
import { getSubmissions } from './storage';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

const bestand = (submissions: unknown[]) => JSON.stringify({ app: 'boosterz', kind: 'voortgang', v: 1, naam: 'Emma', datum: '', submissions });
const inzending = (over: Record<string, unknown> = {}) => ({
  id: 's1', widgetId: 'w1', widgetCode: 'ABC', studentName: 'Emma', startedAt: 1, submittedAt: 2, durationSec: 1,
  answers: { q1: 1 }, itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted', ...over,
});

describe('importProgress (zelfde sanering als resultaatcodes)', () => {
  it('slaat kapotte inzendingen over en saneert de rest', () => {
    const res = importProgress(bestand([
      inzending(),
      inzending({ id: 's2', submittedAt: 3, itemScores: 'nee', totalMax: 'x' }),
      inzending({ id: 's3', studentName: 12345 }),
      inzending({ id: 's4', answers: [1] }),
      'onzin',
    ]))!;
    expect(res.imported).toBe(2);
    const s2 = getSubmissions().find((s) => s.id === 's2')!;
    expect(s2.itemScores).toBeNull();
    expect(s2.totalMax).toBe(0);
  });

  it('een ouder bestand zonder indienmoment of id blijft inleesbaar', () => {
    const res = importProgress(bestand([inzending({ id: undefined, submittedAt: undefined })]))!;
    expect(res.imported).toBe(1);
    const s = getSubmissions()[0];
    expect(typeof s.id).toBe('string');
    expect(typeof s.submittedAt).toBe('number');
  });

  it('ontdubbelt binnen het bestand en tegenover wat er al staat', () => {
    expect(importProgress(bestand([inzending(), inzending({ id: 'ander' })]))!.imported).toBe(1);
    expect(importProgress(bestand([inzending()]))!.imported).toBe(0);
    expect(getSubmissions()).toHaveLength(1);
  });

  it('geen voortgangsbestand: null', () => {
    expect(importProgress('{"kind":"pakket"}')).toBeNull();
    expect(importProgress('{')).toBeNull();
  });
});

// ── S4: de meta-antwoorden krijgen hun vaste vorm ───────────────────────────

describe('sanitizeSubmission: meta-antwoorden (S4)', () => {
  const met = (answers: Record<string, unknown>) =>
    sanitizeSubmission(inzending({ answers: { q1: 1, ...answers } }))!.answers;

  it('een object als reflectie valt weg, een tekst blijft', () => {
    expect(met({ _doelreflectie: { boem: 1 } })).toEqual({ q1: 1 });
    expect(met({ _doelreflectie: 'Dat ging goed' })).toEqual({ q1: 1, _doelreflectie: 'Dat ging goed' });
  });

  it('_hints: alleen een lijst met tekst; getallen en een object vallen weg', () => {
    expect(met({ _hints: [1, 2] })).toEqual({ q1: 1 });
    expect(met({ _hints: { a: 'q1' } })).toEqual({ q1: 1 });
    expect(met({ _hints: ['q1', 2, null, 'q2:2'] })).toEqual({ q1: 1, _hints: ['q1', 'q2:2'] });
  });

  it('_foutenanalyse: alleen volgendeKeer als tekst en labels met tekstwaarden', () => {
    expect(met({ _foutenanalyse: { volgendeKeer: ['x'] } })).toEqual({ q1: 1 });
    expect(met({ _foutenanalyse: 'nee' })).toEqual({ q1: 1 });
    expect(met({ _foutenanalyse: { volgendeKeer: 'Beter lezen', labels: { q1: 'slordig', q2: { x: 1 } }, extra: 1 } }))
      .toEqual({ q1: 1, _foutenanalyse: { volgendeKeer: 'Beter lezen', labels: { q1: 'slordig' } } });
  });

  it('_zekerheid, _doel en _route krijgen hun vorm; _sourceHighlights houdt alleen geldige markeringen', () => {
    expect(met({ _zekerheid: { q1: 'zeker', q2: 3 } })).toEqual({ q1: 1, _zekerheid: { q1: 'zeker' } });
    expect(met({ _zekerheid: [1] })).toEqual({ q1: 1 });
    expect(met({ _doel: { proces: 'Rustig werken', streef: '80', vrij: { x: 1 } } })).toEqual({ q1: 1, _doel: { proces: 'Rustig werken' } });
    expect(met({ _doel: 'nee' })).toEqual({ q1: 1 });
    expect(met({ _route: 'x' })).toEqual({ q1: 1 });
    expect(met({ _route: 2 })).toEqual({ q1: 1, _route: 2 });
    const goed = { id: 'h1', page: 2, spans: [1, 2], color: '#ffd54f', text: 'een zin' };
    expect(met({ _sourceHighlights: [goed, null, { ...goed, id: 'h2', text: { x: 1 } }, { ...goed, id: 'h3', color: 'url(https://x.test/a)' }, 'x'] }))
      .toEqual({ q1: 1, _sourceHighlights: [goed] });
    expect(met({ _sourceHighlights: 'x' })).toEqual({ q1: 1 });
  });

  it('wat de spelers zelf maken, komt ongewijzigd door; onbekende sleutels en de antwoorden per vraag blijven', () => {
    const echt = {
      q1: 'tekst', q2: [1, 2], _toekomst: { nieuw: true },
      _zekerheid: { q1: 'zeker', q2: 'gok' }, _hints: ['q1', 'q2:2'], _route: 1,
      _doel: { proces: 'Rustig werken', streef: 80, vrij: 'Ik wil het halen' },
      _doelreflectie: 'Gelukt', _foutenanalyse: { labels: { q2: 'kennis' }, volgendeKeer: '' },
      _sourceHighlights: [{ id: 'h1', page: 1, spans: [3], color: 'rgb(255, 213, 79)', text: 'x' }],
    };
    expect(met(echt)).toEqual(echt);
  });

  it('een sleutel "__proto__" wijzigt het prototype niet', () => {
    const answers = JSON.parse('{"q1":1,"_zekerheid":{"__proto__":"zeker","q1":"gok"}}') as Record<string, unknown>;
    const uit = sanitizeSubmission(inzending({ answers }))!.answers._zekerheid as Record<string, string>;
    expect(uit).toEqual({ q1: 'gok' });
    expect(Object.getPrototypeOf(uit)).toBe(Object.prototype);
  });

  it('importProgress bewaart de gesaneerde vorm', () => {
    importProgress(bestand([inzending({ answers: { q1: 1, _doelreflectie: { a: 1 }, _hints: [1, 2] } })]));
    expect(getSubmissions()[0].answers).toEqual({ q1: 1 });
  });
});

// ── S2: grenzen aan een inzending uit een code of bestand ───────────────────

describe('sanitizeSubmission: grenzen (S2)', () => {
  const MB = 1_000_000;
  const weiger = (over: Record<string, unknown>) => sanitizeSubmission(inzending(over));

  it('een kleine code die uitpakt tot megabytes aan tekst wordt geweigerd', () => {
    expect(weiger({ answers: { x: 'a'.repeat(4.5 * MB) } })).toBeNull();
    expect(weiger({ answers: { x: 'a'.repeat(1.2 * MB) } })).toBeNull();
    // verspreid over veel antwoorden telt het net zo
    const veel = Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`q${i}`, 'b'.repeat(1000)]));
    expect(weiger({ answers: veel })).toBeNull();
  });

  it('een lang antwoord en een tekening blijven gewoon bewaard', () => {
    expect(weiger({ answers: { q1: 'a'.repeat(200_000) } })).not.toBeNull();
    const tekening = 'data:image/jpeg;base64,' + 'A'.repeat(1.5 * MB);
    expect(weiger({ answers: { tekening } })).not.toBeNull();
    const opnames = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`q${i}`, 'data:audio/webm;base64,' + 'A'.repeat(1.3 * MB)]));
    expect(weiger({ answers: opnames })).not.toBeNull();
  });

  it('een data-URL telt als afbeelding of opname, maar alleen als ze er echt uitziet', () => {
    // geen geldige base64: blijft tekst en valt onder de tekstgrens
    expect(weiger({ answers: { x: 'data:image/png;base64,' + '!'.repeat(1.5 * MB) } })).toBeNull();
    expect(weiger({ answers: { x: 'data:text/plain,' + 'a'.repeat(1.5 * MB) } })).toBeNull();
    // te groot als afbeelding, of te veel samen
    expect(weiger({ answers: { x: 'data:image/png;base64,' + 'A'.repeat(9 * MB) } })).toBeNull();
    const samen = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`q${i}`, 'data:image/png;base64,' + 'A'.repeat(6 * MB)]));
    expect(weiger({ answers: samen })).toBeNull();
  });

  it('te veel antwoorden, te veel waarden of te diep genest wordt geweigerd', () => {
    const sleutels = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`q${i}`, 1]));
    expect(weiger({ answers: sleutels })).toBeNull();
    expect(weiger({ answers: { q1: Array.from({ length: 250_000 }, () => 0) } })).toBeNull();
    let diep: unknown = 1;
    for (let i = 0; i < 40; i++) diep = { a: diep };
    expect(weiger({ answers: { q1: diep } })).toBeNull();
    expect(weiger({ answers: { q1: { a: { b: { c: [1, 2, 3] } } } } })).not.toBeNull();
  });

  it('te lange tekstvelden worden geweigerd: id, widgetCode, classId, studentId, feedback, opmerking', () => {
    expect(weiger({ id: 'x'.repeat(101) })).toBeNull();
    expect(weiger({ widgetId: 'w'.repeat(201) })).toBeNull();
    expect(weiger({ widgetCode: 'C'.repeat(41) })).toBeNull();
    expect(weiger({ classId: 'k'.repeat(201) })).toBeNull();
    expect(weiger({ studentId: 's'.repeat(201) })).toBeNull();
    expect(weiger({ teacherFeedback: 'f'.repeat(20_001) })).toBeNull();
    expect(weiger({ itemScores: { q1: { earned: 1, max: 1, mode: 'manual', comment: 'c'.repeat(5001) } } })).toBeNull();
    expect(weiger({ itemScores: { ['k'.repeat(201)]: { earned: 1, max: 1, mode: 'auto' } } })).toBeNull();
    // gewone waarden blijven
    expect(weiger({ teacherFeedback: 'f'.repeat(5000), itemScores: { q1: { earned: 1, max: 1, mode: 'manual', comment: 'c'.repeat(2000) } } })).not.toBeNull();
  });

  it('opmerkingen per vraag die samen te veel worden, worden geweigerd', () => {
    const scores = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`q${i}`, { earned: 1, max: 1, mode: 'manual', comment: 'c'.repeat(4000) }]));
    expect(weiger({ itemScores: scores })).toBeNull();
  });

  it('te veel scores per vraag wordt geweigerd', () => {
    const scores = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`q${i}`, { earned: 1, max: 1, mode: 'auto' }]));
    expect(weiger({ itemScores: scores })).toBeNull();
  });

  it('submissionTooLarge geeft de reden in woorden, en null voor wat gewoon is', () => {
    expect(submissionTooLarge(inzending())).toBeNull();
    expect(submissionTooLarge('onzin')).toBeNull();
    expect(submissionTooLarge(inzending({ answers: { x: 'a'.repeat(2 * MB) } }))).toMatch(/veel meer antwoorden of tekst/);
    expect(submissionTooLarge(inzending({ answers: { x: 'data:image/png;base64,' + 'A'.repeat(9 * MB) } }))).toMatch(/afbeelding of opname/);
    expect(submissionTooLarge(inzending({ teacherFeedback: 'f'.repeat(30_000) }))).toMatch(/tekstveld/);
  });

  it('importProgress slaat te grote pogingen over en telt ze', () => {
    const res = importProgress(bestand([
      inzending(),
      inzending({ id: 's2', submittedAt: 3, answers: { x: 'a'.repeat(2 * MB) } }),
      inzending({ id: 's3', submittedAt: 4, widgetCode: 'C'.repeat(50) }),
    ]))!;
    expect(res).toMatchObject({ imported: 1, teGroot: 2, mislukt: 0 });
    expect(getSubmissions()).toHaveLength(1);
    // een kapotte inzending is geen "te groot"
    expect(importProgress(bestand([inzending({ id: 's9', submittedAt: 9, studentName: 12345 })]))).toMatchObject({ imported: 0, teGroot: 0 });
  });
});

// ── G8: eerlijke tellingen bij een volle opslag ─────────────────────────────

describe('importProgress bij een volle opslag (G8)', () => {
  it('telt wat niet bewaard kon worden als mislukt, niet als "stond hier al"', () => {
    const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
    ls.setItem = () => {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    };
    const res = importProgress(bestand([inzending(), inzending({ id: 's2', submittedAt: 3 })]))!;
    expect(res).toMatchObject({ naam: 'Emma', imported: 0, mislukt: 2, teGroot: 0 });
    expect(getSubmissions()).toHaveLength(0);
  });
});

describe('describeProgressImport', () => {
  const res = (over: Partial<ProgressImportResult>): ProgressImportResult => ({ naam: 'Emma', imported: 0, mislukt: 0, teGroot: 0, ...over });

  it('meldt gewone uitkomsten zoals vroeger', () => {
    expect(describeProgressImport(res({ imported: 1 }))).toEqual({ text: '1 poging van Emma geïmporteerd', kind: 'ok' });
    expect(describeProgressImport(res({ imported: 3, naam: '' }))).toEqual({ text: '3 pogingen geïmporteerd', kind: 'ok' });
    expect(describeProgressImport(res({}))).toEqual({ text: 'Geen nieuwe pogingen gevonden — alles stond hier al', kind: 'info' });
  });

  it('zegt bij een volle opslag niet dat alles hier al stond', () => {
    const m = describeProgressImport(res({ mislukt: 2 }));
    expect(m.kind).toBe('err');
    expect(m.text).toMatch(/2 pogingen niet bewaard: de opslag van dit toestel is vol/);
    expect(m.text).not.toMatch(/stond hier al/);
    expect(m.text).toMatch(/lees het bestand opnieuw in/);
  });

  it('meldt gedeeltelijk gelukt, en wat te groot was', () => {
    const m = describeProgressImport(res({ imported: 5, mislukt: 1, teGroot: 2 }));
    expect(m.text).toBe('5 pogingen van Emma geïmporteerd, 1 poging niet bewaard: de opslag van dit toestel is vol, 2 pogingen overgeslagen omdat ze veel te groot zijn. Maak ruimte vrij en lees het bestand opnieuw in: wat al bewaard is, blijft staan');
    expect(describeProgressImport(res({ teGroot: 1 }))).toEqual({ text: '1 poging overgeslagen omdat ze veel te groot zijn', kind: 'err' });
  });
});

describe('voortgangscodesMelding', () => {
  it('telt codes die niet bewaard werden niet als ingevoerd', () => {
    expect(voortgangscodesMelding({ ok: 2, invalid: 0, other: 0, mislukt: 0 })).toEqual({ text: '2 ingevoerd', kind: 'ok' });
    const vol = voortgangscodesMelding({ ok: 1, invalid: 1, other: 1, mislukt: 2 });
    expect(vol.text).toBe('1 ingevoerd, 2 niet bewaard: de opslag van dit toestel is vol, 1 ongeldig, 1 hoorde bij een andere cursus');
    expect(vol.kind).toBe('err');
  });

  it('is niet "gelukt" als er niets ingevoerd werd', () => {
    expect(voortgangscodesMelding({ ok: 0, invalid: 3, other: 0, mislukt: 0 }).kind).toBe('err');
  });
});
