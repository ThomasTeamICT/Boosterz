import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { processCodes, splitCodes, type InboxDeps, type InboxReport, type InboxRow } from '../../lib/inbox';
import type { Submission, Widget } from '../../lib/types';
import { importOutcome, nietVerwerkteCodes, scanRegel, verklaarWeigeringen } from './importOutcome';

function rij(index: number, outcome: InboxRow['outcome'], saved: boolean, message = ''): InboxRow {
  return {
    index, outcome, kind: 'widget', saved, studentName: `Leerling ${index}`, className: null, title: null,
    detail: '', message, code: 'WF1.x', at: null,
  };
}
function verslag(rows: InboxRow[]): InboxReport {
  const tel = (o: InboxRow['outcome']) => rows.filter((r) => r.outcome === o).length;
  return { rows, nieuw: tel('nieuw'), dubbel: tel('dubbel'), onbekend: tel('onbekend'), ongeldig: tel('ongeldig') };
}

describe('importOutcome', () => {
  it('is netjes als alles nieuw is en bij deze widget hoort: kort melden en sluiten', () => {
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'nieuw', true)]), 2);
    expect(out).toMatchObject({ saved: 2, elsewhere: 0, clean: true, summary: '2 nieuw', problems: [] });
  });

  it('laat niets stil verdwijnen: dubbel en ongeldig krijgen elk een regel', () => {
    const out = importOutcome(
      verslag([rij(1, 'nieuw', true), rij(2, 'dubbel', false, 'Stond hier al'), rij(3, 'ongeldig', false, 'Afgebroken')]),
      1
    );
    expect(out.clean).toBe(false);
    expect(out.summary).toBe('1 nieuw, 1 al aanwezig, 1 ongeldig');
    expect(out.problems.map((r) => r.index)).toEqual([2, 3]);
  });

  it('merkt werk op dat bij een andere widget is bewaard', () => {
    // twee codes bewaard, maar voor deze widget kwam er maar één bij
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'nieuw', true)]), 1);
    expect(out.saved).toBe(2);
    expect(out.elsewhere).toBe(1);
    expect(out.clean).toBe(false);
    expect(out.problems).toEqual([]);
  });

  it('is niet netjes als er niets bewaard werd', () => {
    const out = importOutcome(verslag([rij(1, 'dubbel', false, 'Stond hier al')]), 0);
    expect(out).toMatchObject({ saved: 0, elsewhere: 0, clean: false, summary: '0 nieuw, 1 al aanwezig' });
  });

  it('telt een onbekende widget mee als bewaard maar niet als netjes', () => {
    const out = importOutcome(verslag([rij(1, 'onbekend', true, 'Bewaard, maar deze widget staat niet op dit toestel')]), 0);
    expect(out.saved).toBe(1);
    expect(out.elsewhere).toBe(1);
    expect(out.clean).toBe(false);
    expect(out.problems).toHaveLength(1);
  });

  it('een aangevulde reflectie bij een dubbele code hoort niet "elders" (G14)', () => {
    // 'dubbel' en toch bewaard: de reflectie kwam erbij, er is geen nieuwe inzending
    const out = importOutcome(
      verslag([rij(1, 'dubbel', true, 'Stond hier al — de reflectie van de leerling is toegevoegd.')]),
      0
    );
    expect(out.saved).toBe(1);
    expect(out.elsewhere).toBe(0);
    expect(out.clean).toBe(false);
    expect(out.problems.map((r) => r.message)).toEqual(['Stond hier al — de reflectie van de leerling is toegevoegd.']);
  });

  it('een aanvulling naast een nieuwe code voor deze widget: niets elders', () => {
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'dubbel', true, 'aangevuld')]), 1);
    expect(out.elsewhere).toBe(0);
  });

  it('echt elders bewaard werk blijft elders, ook naast een aanvulling', () => {
    const out = importOutcome(verslag([rij(1, 'nieuw', true), rij(2, 'onbekend', true), rij(3, 'dubbel', true, 'aangevuld')]), 1);
    expect(out.elsewhere).toBe(1);
  });
});

// ── Inleverpunt: wat niet verwerkt is, blijft staan (G5) ────────────────────

function deps(over: Partial<InboxDeps> = {}): InboxDeps {
  return {
    classes: [], submissions: [], findWidget: () => WIDGET, findCourse: () => undefined,
    findProgress: () => undefined, saveSubmission: () => true, saveProgress: () => true, newId: () => 'nieuw-id',
    ...over,
  };
}
function sub(over: Record<string, unknown> = {}) {
  return {
    id: 's1', widgetId: 'w1', widgetCode: 'ABC234', studentName: 'Emma', startedAt: 1, submittedAt: 100, durationSec: 1,
    answers: { q1: 1 }, itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted', ...over,
  };
}
const code = (o: unknown) => 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(o));
const WIDGET = { id: 'w1', title: 'Quiz' } as unknown as Widget;

describe('nietVerwerkteCodes (G5)', () => {
  it('geeft de volledige codes terug die niet bewaard werden door een volle opslag', () => {
    const codes = [1, 2, 3].map((n) => code(sub({ id: `s${n}`, studentName: `Leerling ${n}`, submittedAt: n })));
    const text = `hier zijn ze:\n${codes.join('\n')}\ngroetjes`;
    let bewaard = 0;
    const report = processCodes(text, deps({ saveSubmission: () => (++bewaard <= 1 ? true : false) }));
    expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'ongeldig', 'ongeldig']);
    // het volledige tekstvak mag niet leeg worden: de twee niet-bewaarde codes staan er nog
    expect(nietVerwerkteCodes(report.rows, splitCodes(text))).toEqual([codes[1], codes[2]]);
    // de rij zelf toont maar het begin van de code; de volledige code komt uit het tekstvak
    expect(report.rows[1].code.length).toBeLessThan(codes[1].length);
  });

  it('geeft niets terug als alles verwerkt is, ook al was er een "dubbel"', () => {
    const c = code(sub());
    const text = `${c} ${c}`;
    const report = processCodes(text, deps());
    expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'dubbel']);
    expect(nietVerwerkteCodes(report.rows, splitCodes(text))).toEqual([]);
  });

  it('houdt ook een dubbele code vast waarvan de aanvulling niet bewaard kon worden', () => {
    const eerder = sub({ id: 'oud' }) as unknown as Submission;
    const aanvulling = code(sub({ id: 'nieuw', answers: { q1: 1, _doelreflectie: 'Dat ging goed' } }));
    const normaal = code(sub({ id: 'dubbel', submittedAt: 7, studentName: 'Noah' }));
    const text = `${aanvulling} ${normaal}`;
    const report = processCodes(text, deps({ submissions: [eerder, sub({ id: 'o2', submittedAt: 7, studentName: 'Noah' }) as unknown as Submission], saveSubmission: () => false }));
    expect(report.rows.map((r) => [r.outcome, r.saved])).toEqual([['dubbel', false], ['dubbel', false]]);
    // alleen de code met een aanvulling die niet bewaard kon worden, niet de gewone dubbele code
    expect(nietVerwerkteCodes(report.rows, splitCodes(text))).toEqual([aanvulling]);
  });

  it('houdt ook een onleesbare code vast, in de volgorde van het tekstvak', () => {
    const goed = code(sub());
    const kapot = 'WF1.Dit-is-geen-geldige-code';
    const text = `${kapot} ${goed}`;
    const report = processCodes(text, deps());
    expect(nietVerwerkteCodes(report.rows, splitCodes(text))).toEqual([kapot]);
  });
});

describe('verklaarWeigeringen (S2)', () => {
  it('zegt bij een veel te grote code waarom ze niet bewaard is, niet "beschadigd"', () => {
    const groot = code(sub({ answers: { x: 'a'.repeat(1_100_000) } }));
    const kapot = 'WF1.Dit-is-geen-geldige-code';
    const text = `${groot} ${kapot}`;
    const codes = splitCodes(text);
    const report = processCodes(text, deps());
    expect(report.rows.map((r) => r.outcome)).toEqual(['ongeldig', 'ongeldig']);
    expect(report.rows[0].message).toMatch(/veel meer antwoorden of tekst/); // lib/inbox zegt de reden nu zelf
    const rijen = verklaarWeigeringen(report.rows, codes);
    expect(rijen[0].message).toMatch(/Niet bewaard: deze code bevat veel meer antwoorden of tekst/);
    expect(rijen[1].message).toBe(report.rows[1].message); // een kapotte code blijft "beschadigd"
    expect(rijen[0].index).toBe(1);
  });

  it('laat bewaarde rijen en voortgangscodes ongemoeid', () => {
    const goed = code(sub());
    const text = `${goed} WFC1.abc`;
    const report = processCodes(text, deps());
    expect(verklaarWeigeringen(report.rows, splitCodes(text))).toEqual(report.rows);
  });
});

describe('scanRegel (G5)', () => {
  const r = (over: Partial<InboxRow>): InboxRow => ({ ...rij(1, 'nieuw', true), title: 'Quiz', detail: '1/1 · 100%', ...over });

  it('meldt bij een volle opslag "niet bewaard" en niet "onleesbaar"', () => {
    const regel = scanRegel(r({
      outcome: 'ongeldig', saved: false, message: 'Niet bewaard: de opslag van dit toestel is vol of geblokkeerd. Maak ruimte en verwerk deze code opnieuw.',
    }));
    expect(regel).toMatch(/^Niet bewaard: de opslag van dit toestel is vol/);
    expect(regel).not.toMatch(/Onleesbare/);
  });

  it('valt terug op de oude tekst als de rij geen uitleg heeft', () => {
    expect(scanRegel(r({ outcome: 'ongeldig', saved: false, message: '' }))).toBe('Onleesbare of onvolledige code');
  });

  it('meldt een aanvulling die niet bewaard kon worden, niet alleen "stond hier al"', () => {
    const regel = scanRegel(r({
      outcome: 'dubbel', saved: false, message: 'Stond hier al. De aanvulling kon niet bewaard worden: de opslag van dit toestel is vol.',
    }));
    expect(regel).toBe('Leerling 1 — Quiz — Stond hier al. De aanvulling kon niet bewaard worden: de opslag van dit toestel is vol.');
  });

  it('de andere uitkomsten blijven zoals ze waren', () => {
    expect(scanRegel(r({}))).toBe('Leerling 1 — Quiz — 1/1 · 100%');
    expect(scanRegel(r({ outcome: 'dubbel' }))).toBe('Leerling 1 — Quiz — stond hier al');
    expect(scanRegel(r({ outcome: 'onbekend', title: null }))).toBe('Leerling 1 — bewaard, maar onbekende widget staat niet op dit toestel');
    expect(scanRegel(r({ outcome: 'onbekend', title: null, kind: 'course' }))).toBe('Leerling 1 — bewaard, maar onbekende cursus staat niet op dit toestel');
  });
});

describe('een aangevulde reflectie via het echte verslag (G14)', () => {
  it('geeft geen melding "hoort niet bij deze widget"', () => {
    const eerder = sub({ id: 'oud' }) as unknown as Submission;
    const aanvulling = code(sub({ id: 'nieuw', answers: { q1: 1, _doelreflectie: 'Dat ging goed' } }));
    const opgeslagen: Submission[] = [];
    const report = processCodes(aanvulling, deps({
      submissions: [eerder],
      findWidget: () => WIDGET,
      saveSubmission: (s) => { opgeslagen.push(s); return true; },
    }));
    expect(report.rows[0]).toMatchObject({ outcome: 'dubbel', saved: true });
    expect(opgeslagen[0].answers._doelreflectie).toBe('Dat ging goed');
    // het aantal inzendingen voor deze widget veranderde niet: 0 erbij
    const out = importOutcome(report, 0);
    expect(out.elsewhere).toBe(0);
    expect(out.problems[0].message).toMatch(/de reflectie van de leerling is toegevoegd/);
  });
});
