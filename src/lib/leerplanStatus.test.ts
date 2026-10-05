import { describe, expect, it } from 'vitest';
import { bevestigLeerplan, createCurriculum, doelenVingerafdruk, maakEigenKopie } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { STATUS_LABEL, effectieveStatus, isOfficieel, nagekekenTekst } from './leerplanStatus';

function leerplan(): Curriculum {
  return createCurriculum({
    title: 'Test', net: 'eigen', subject: 'Test', level: '',
    goals: [
      { id: 'a', code: '1', text: 'Eerste doel.' },
      { id: 'b', code: '2', text: 'Tweede doel.', refs: [{ set: 'ODS_1', id: '10', code: '1' }] },
    ],
  });
}

describe('effectieveStatus', () => {
  it('geldt een leerplan zonder nakijken als niet nagekeken', () => {
    expect(effectieveStatus(leerplan())).toBe('niet-gecontroleerd');
  });

  it('laat een nagekeken leerplan met dezelfde doelen nagekeken', () => {
    expect(effectieveStatus(bevestigLeerplan(leerplan(), { door: 'Test' }))).toBe('gecontroleerd');
  });

  it('maakt van een nagekeken leerplan met gewijzigde doelen een gewijzigd leerplan', () => {
    const l = bevestigLeerplan(leerplan(), { door: 'Test' });
    const tekst = { ...l, goals: l.goals.map((g, i) => (i === 0 ? { ...g, text: 'Aangepast.' } : g)) };
    expect(effectieveStatus(tekst)).toBe('gewijzigd');
    const verwijzing = { ...l, goals: l.goals.map((g) => ({ ...g, refs: undefined })) };
    expect(effectieveStatus(verwijzing)).toBe('gewijzigd');
    const extra = { ...l, goals: [...l.goals, { id: 'c', code: '3', text: 'Nieuw.' }] };
    expect(effectieveStatus(extra)).toBe('gewijzigd');
  });

  it('vertrouwt de opgeslagen status zonder vingerafdruk, en laat "gewijzigd" gewijzigd', () => {
    const zonder: Curriculum = { ...leerplan(), controle: { status: 'gecontroleerd' } };
    expect(effectieveStatus(zonder)).toBe('gecontroleerd');
    const gewijzigd: Curriculum = { ...leerplan(), controle: { status: 'gewijzigd', doelenSha256: doelenVingerafdruk(leerplan().goals) } };
    expect(effectieveStatus(gewijzigd)).toBe('gewijzigd');
  });

  it('maakt een eigen kopie weer niet nagekeken', () => {
    expect(effectieveStatus(maakEigenKopie(bevestigLeerplan(leerplan(), { door: 'Test' })))).toBe('niet-gecontroleerd');
  });

  it('heeft voor elke status een label in gewone taal', () => {
    expect(STATUS_LABEL).toEqual({
      gecontroleerd: 'Nagekeken',
      gewijzigd: 'Gewijzigd na nakijken',
      'niet-gecontroleerd': 'Niet nagekeken',
    });
  });
});

describe('nagekekenTekst', () => {
  it('noemt wie en wanneer, en laat weg wat ontbreekt', () => {
    const op = new Date(2026, 9, 5, 12).getTime();
    const tekst = nagekekenTekst(bevestigLeerplan(leerplan(), { door: 'Boosterz (officiële bron)', op }));
    expect(tekst).toMatch(/^Nagekeken door Boosterz \(officiële bron\) op .*2026$/);
    expect(nagekekenTekst({ ...leerplan(), controle: { status: 'gecontroleerd', door: 'An' } })).toBe('Nagekeken door An');
    expect(nagekekenTekst({ ...leerplan(), controle: { status: 'gecontroleerd', op } })).toMatch(/^Nagekeken op /);
    expect(nagekekenTekst(leerplan())).toBe('Nagekeken');
  });
});

describe('isOfficieel', () => {
  it('kijkt naar de herkomst', () => {
    expect(isOfficieel(leerplan())).toBe(false);
    expect(isOfficieel({ ...leerplan(), herkomst: { methode: 'officieel', ingelezenOp: 1 } })).toBe(true);
    expect(isOfficieel({ ...leerplan(), herkomst: { methode: 'pdf', ingelezenOp: 1 } })).toBe(false);
  });
});
