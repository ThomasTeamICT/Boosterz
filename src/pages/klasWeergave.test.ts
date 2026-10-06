import { describe, expect, it } from 'vitest';
import type { Assignment, ClassStudent } from '../lib/classTypes';
import { duplicateNames, type AssignmentStatus } from '../lib/classes';
import {
  CSV_BOM, duplicateStudentIds, duplicateStudentNames, duplicatesInClassMessage, goalScoreView, klasCsv,
  nameTaken, nameTakenMessage, pastedDuplicatesMessage, statusSummaryProvisional, toDateInputValue,
} from './klasWeergave';

const st = (naam: string, id = naam, number?: number): ClassStudent => ({ id, name: naam, ...(number !== undefined ? { number } : {}) });

function status(over: Partial<AssignmentStatus> = {}): AssignmentStatus {
  return {
    state: 'ingediend', attempts: 1, scorePct: 70, earned: 7, max: 10, progressPct: null, lastAt: 1,
    needsGrading: false, title: 'Quiz', ...over,
  };
}

const quiz: Assignment = { id: 'a1', classId: 'k', kind: 'widget', targetId: 'w1', createdAt: 1 };
const cursus: Assignment = { id: 'a2', classId: 'k', kind: 'course', targetId: 'c1', createdAt: 1 };
const titel = (a: Assignment) => (a.kind === 'course' ? 'Cursus' : 'Quiz');

describe('dubbele namen in een klaslijst', () => {
  it('meldt elke dubbele naam één keer, zoals hij eerst geschreven staat', () => {
    const lijst = [st('Lucas Janssens', 'a'), st('Emma'), st('lucas  janssens', 'b'), st('LUCAS JANSSENS', 'c')];
    expect(duplicateStudentNames(lijst)).toEqual(['Lucas Janssens']);
  });

  it('houdt de volgorde van de lijst aan en laat lege namen buiten beschouwing', () => {
    const lijst = [st('Noor', 'a'), st('', 'b'), st('  ', 'c'), st('Bram', 'd'), st('bram', 'e'), st('noor', 'f')];
    expect(duplicateStudentNames(lijst)).toEqual(['Noor', 'Bram']);
  });

  it('geeft niets terug zonder dubbels', () => {
    expect(duplicateStudentNames([st('Emma'), st('Noah')])).toEqual([]);
    expect(duplicateStudentNames([])).toEqual([]);
  });

  it('geeft de id\'s van alle leerlingen met zo\'n naam', () => {
    const ids = duplicateStudentIds([st('Lucas', 'a'), st('Emma', 'b'), st('lucas', 'c')]);
    expect([...ids].sort()).toEqual(['a', 'c']);
  });

  it('nameTaken: hoofdletters en spaties tellen niet, de leerling zelf wel uitgezonderd', () => {
    const lijst = [st('Emma Peeters', 'a'), st('Noah Claes', 'b')];
    expect(nameTaken(lijst, '  emma   peeters ')).toBe(true);
    expect(nameTaken(lijst, 'Emma Peeters', 'a')).toBe(false);
    expect(nameTaken(lijst, 'Olivia')).toBe(false);
    expect(nameTaken(lijst, '   ')).toBe(false);
  });

  it('meldingen noemen de namen', () => {
    expect(pastedDuplicatesMessage([])).toBe('');
    expect(pastedDuplicatesMessage(['Lucas'])).toBe('1 dubbele naam overgeslagen: Lucas');
    expect(pastedDuplicatesMessage(['Lucas', 'Emma'])).toBe('2 dubbele namen overgeslagen: Lucas, Emma');
    expect(duplicatesInClassMessage([])).toBe('');
    expect(duplicatesInClassMessage(['Lucas'])).toContain('“Lucas” staat meer dan eens in de klas.');
    expect(duplicatesInClassMessage(['Lucas', 'Emma'])).toContain('Lucas, Emma');
    expect(nameTakenMessage(' Lucas Janssens ')).toContain('“Lucas Janssens” staat al in de klas.');
  });

  it('werkt samen met duplicateNames voor een geplakte lijst', () => {
    const tekst = '1 Lucas Janssens\n2 Emma\nLucas Janssens\n3 Lucas Janssens';
    expect(pastedDuplicatesMessage(duplicateNames(tekst))).toBe('1 dubbele naam overgeslagen: Lucas Janssens');
  });
});

describe('statusSummaryProvisional', () => {
  it('zet "voorlopig" bij een score die nog nagekeken moet worden', () => {
    expect(statusSummaryProvisional(status({ scorePct: 20, provisional: true }))).toBe('20% (voorlopig)');
    expect(statusSummaryProvisional(status({ scorePct: 20, provisional: true, attempts: 2 }))).toBe('20% (voorlopig) · 2 pogingen');
  });

  it('laat een definitieve score, een cursus en "niet gestart" zoals ze waren', () => {
    expect(statusSummaryProvisional(status({ scorePct: 78, attempts: 2 }))).toBe('78% · 2 pogingen');
    expect(statusSummaryProvisional(status({ state: 'bezig', progressPct: 40, scorePct: null, earned: null, max: null, attempts: 0 }))).toBe('40% gelezen');
    expect(statusSummaryProvisional(status({ state: 'niet gestart', scorePct: null, earned: null, max: null, attempts: 0 }))).toBe('niet gestart');
  });

  it('een voorlopige poging zonder meetbare score blijft een gewone samenvatting', () => {
    expect(statusSummaryProvisional(status({ scorePct: null, earned: null, max: null, provisional: true }))).toBe('ingediend');
  });
});

describe('goalScoreView', () => {
  const doel = (over: Partial<Parameters<typeof goalScoreView>[0]> = {}) => ({ code: 'LPD 3', earned: 3, max: 4, items: 2, ...over });

  it('een nagekeken doel is definitief', () => {
    expect(goalScoreView(doel())).toEqual({
      pct: 75, provisional: false, text: '3/4 · 75%', aria: '75 procent (3 van 4 punten)',
    });
  });

  it('met een vraag die nog wacht is de score voorlopig', () => {
    const v = goalScoreView(doel({ earned: 1, max: 2, pending: 1 }));
    expect(v.pct).toBe(50);
    expect(v.provisional).toBe(true);
    expect(v.text).toBe('1/2 · 50% (voorlopig)');
    expect(v.aria).toContain('voorlopig');
    expect(v.aria).toContain('nog 1 vraag na te kijken');
  });

  it('als alleen nog werk wacht staat er niet 0 procent maar "nog na te kijken"', () => {
    const v = goalScoreView(doel({ earned: 0, max: 0, items: 0, pending: 2 }));
    expect(v.pct).toBeNull();
    expect(v.provisional).toBe(true);
    expect(v.text).toBe('nog na te kijken (2 vragen)');
    expect(v.text).not.toContain('0%');
  });

  it('zonder punten en zonder wachtend werk: geen punten', () => {
    expect(goalScoreView(doel({ earned: 0, max: 0, items: 0 }))).toMatchObject({ pct: null, provisional: false, text: 'geen punten' });
  });
});

describe('klasCsv', () => {
  const studenten = [st('Emma Peeters', 's1', 1), st('Noah Claes', 's2')];
  const statussen: Record<string, AssignmentStatus> = {
    's1|a1': status({ earned: 7, max: 10, scorePct: 70 }),
    's1|a2': status({ state: 'bezig', attempts: 0, progressPct: 40, scorePct: null, earned: null, max: null }),
    's2|a1': status({ earned: 2.5, max: 4, scorePct: 63, provisional: true, needsGrading: true }),
  };
  const csv = klasCsv(studenten, [quiz, cursus], titel, (s, a) => statussen[`${s.id}|${a.id}`]);
  const regels = csv.slice(1).split('\n').map((r) => r.split(';'));

  it('begint met een BOM, zodat Excel UTF-8 herkent', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('﻿');
  });

  it('heeft per opdracht aparte kolommen voor status, punten, maximum en percentage', () => {
    expect(regels[0]).toEqual([
      'nummer', 'naam',
      'Quiz — status', 'Quiz — punten', 'Quiz — maximum', 'Quiz — % (score of gelezen)',
      'Cursus — status', 'Cursus — punten', 'Cursus — maximum', 'Cursus — % (score of gelezen)',
    ]);
    expect(regels.every((r) => r.length === regels[0].length)).toBe(true);
  });

  it('zet punten en maximum als getal, niet als "7/10"', () => {
    expect(regels[1].slice(0, 6)).toEqual(['1', 'Emma Peeters', 'ingediend', '7', '10', '70']);
    expect(csv).not.toContain('7/10');
  });

  it('gebruikt een komma als decimaalteken en noemt voorlopige scores', () => {
    // csvCell zet een veld met een komma tussen aanhalingstekens; Excel (nl-BE) leest het als getal.
    expect(regels[2].slice(0, 6)).toEqual(['', 'Noah Claes', 'ingediend (voorlopig)', '"2,5"', '4', '63']);
  });

  it('een cursus heeft geen punten, alleen een leespercentage; ontbrekend is "niet gestart"', () => {
    expect(regels[1].slice(6)).toEqual(['bezig', '', '', '40']);
    expect(regels[2].slice(6)).toEqual(['niet gestart', '', '', '']);
  });

  it('wat nog nagekeken moet worden, maar niet de getoonde poging is, staat erbij', () => {
    const c = klasCsv([st('Emma', 's1')], [quiz], titel, () => status({ needsGrading: true }));
    expect(c.split('\n')[1]).toContain('ingediend (nog na te kijken)');
  });

  it('maakt een leerlingnaam met een formule onschadelijk', () => {
    const c = klasCsv([st('=HYPERLINK("x")', 's1')], [quiz], titel, () => undefined);
    expect(c).not.toMatch(/(^|;)=HYPERLINK/m);
    expect(c).toContain("'=HYPERLINK");
  });
});

describe('toDateInputValue', () => {
  it('geeft de lokale datum, ook vlak voor middernacht', () => {
    expect(toDateInputValue(new Date(2026, 9, 6, 23, 59, 59).getTime())).toBe('2026-10-06');
    expect(toDateInputValue(new Date(2026, 0, 5, 0, 0, 1).getTime())).toBe('2026-01-05');
  });
});
