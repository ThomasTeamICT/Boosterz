import { describe, expect, it } from 'vitest';
import { bevestigLeerplan, createCurriculum, doelenVingerafdruk, exportCurriculumJson, importCurriculumJson, maakEigenKopie } from './curriculum';
import type { ControleRapport } from './curriculumCheck';
import type { Curriculum, CurriculumMethode } from './curriculumTypes';
import { STATUS_LABEL, effectieveStatus, isBkLeerplan, isOfficieel, isSamengesteld, nagekekenTekst, uitOfficieleBron } from './leerplanStatus';

/** Bevestigen met een rapport zonder fouten voor precies deze doelen (de poort zelf is elders getest). */
function bevestig(cur: Curriculum, opts: { door: string; op?: number }): Curriculum {
  const rapport = { kanBevestigen: true, samenvatting: '', doelenSha256: doelenVingerafdruk(cur.goals) } as ControleRapport;
  return bevestigLeerplan(cur, { ...opts, rapport });
}

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
    expect(effectieveStatus(bevestig(leerplan(), { door: 'Test' }))).toBe('gecontroleerd');
  });

  it('maakt van een nagekeken leerplan met gewijzigde doelen een gewijzigd leerplan', () => {
    const l = bevestig(leerplan(), { door: 'Test' });
    const tekst = { ...l, goals: l.goals.map((g, i) => (i === 0 ? { ...g, text: 'Aangepast.' } : g)) };
    expect(effectieveStatus(tekst)).toBe('gewijzigd');
    const verwijzing = { ...l, goals: l.goals.map((g) => ({ ...g, refs: undefined })) };
    expect(effectieveStatus(verwijzing)).toBe('gewijzigd');
    const extra = { ...l, goals: [...l.goals, { id: 'c', code: '3', text: 'Nieuw.' }] };
    expect(effectieveStatus(extra)).toBe('gewijzigd');
  });

  it('gelooft "nagekeken" niet zonder vingerafdruk (zoals bij bewaren), en laat "gewijzigd" gewijzigd', () => {
    const zonder: Curriculum = { ...leerplan(), controle: { status: 'gecontroleerd', door: 'X' } };
    expect(effectieveStatus(zonder)).toBe('gewijzigd');
    const gewijzigd: Curriculum = { ...leerplan(), controle: { status: 'gewijzigd', doelenSha256: doelenVingerafdruk(leerplan().goals) } };
    expect(effectieveStatus(gewijzigd)).toBe('gewijzigd');
  });

  it('maakt een eigen kopie weer niet nagekeken', () => {
    expect(effectieveStatus(maakEigenKopie(bevestig(leerplan(), { door: 'Test' })))).toBe('niet-gecontroleerd');
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
    const tekst = nagekekenTekst(bevestig(leerplan(), { door: 'Boosterz (officiële bron)', op }));
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

// ── Fase 3: het BK-leerplan (docs/STUDIERICHTINGEN.md § 23.6.3) ──

/** Een nagemaakt BK-leerplan (verzonnen competenties), nagekeken. */
function bkLeerplan(): Curriculum {
  const cur = createCurriculum({
    title: 'Onthaalmedewerker (nagemaakt)', net: 'beroepskwalificaties', subject: 'Onthaal', level: '3de graad', kind: 'leerplan',
    herkomst: { methode: 'beroepskwalificatie', ingelezenOp: 1 },
    bkVersies: [{ bk: 'BK-0390-2', sha: '0123456789abcdef', alle: true }],
    goals: [
      { id: 'a', code: 'BK-0390-2.01', text: 'Competentie één.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc1' }] },
      { id: 'b', code: 'BK-0390-2.02', text: 'Competentie twee.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc2' }] },
    ],
  });
  return bevestig(cur, { door: 'Boosterz (officiële bron)' });
}

/** Per methode: komt een leerplan met die methode uit een officiële bron? Een `Record`: een nieuwe methode moet hier bij. */
const UIT_OFFICIELE_BRON: Record<CurriculumMethode, boolean> = {
  officieel: true,
  samengesteld: true,
  beroepskwalificatie: true,
  export: false,
  pdf: false,
  tekst: false,
  ai: false,
  handmatig: false,
};

describe('isBkLeerplan en uitOfficieleBron', () => {
  it('kijken naar de methode van de herkomst', () => {
    for (const [methode, verwacht] of Object.entries(UIT_OFFICIELE_BRON)) {
      const cur: Curriculum = { ...leerplan(), herkomst: { methode: methode as CurriculumMethode, ingelezenOp: 1 } };
      expect(uitOfficieleBron(cur), methode).toBe(verwacht);
      expect(isBkLeerplan(cur), methode).toBe(methode === 'beroepskwalificatie');
      expect(isOfficieel(cur), methode).toBe(methode === 'officieel');
      expect(isSamengesteld(cur), methode).toBe(methode === 'samengesteld');
    }
    expect(uitOfficieleBron(leerplan())).toBe(false);
    expect(isBkLeerplan(leerplan())).toBe(false);
  });

  it('een eigen kopie van een BK-leerplan blijft een BK-leerplan (de methode blijft), maar is niet nagekeken', () => {
    const kopie = maakEigenKopie(bkLeerplan());
    expect(isBkLeerplan(kopie)).toBe(true);
    expect(uitOfficieleBron(kopie)).toBe(true);
    expect(effectieveStatus(kopie)).toBe('niet-gecontroleerd');
  });
});

describe('effectieveStatus van een BK-leerplan', () => {
  it('is nagekeken, ook na export en import', () => {
    const l = bkLeerplan();
    expect(effectieveStatus(l)).toBe('gecontroleerd');
    expect(effectieveStatus(importCurriculumJson(exportCurriculumJson(l)) as Curriculum)).toBe('gecontroleerd');
  });

  it('N7: zonder bkRefs (zoals een oudere app het bewaart) of met een andere competentie is het "gewijzigd"', () => {
    const l = bkLeerplan();
    expect(effectieveStatus({ ...l, goals: l.goals.map((g) => ({ ...g, bkRefs: undefined })) })).toBe('gewijzigd');
    expect(effectieveStatus({ ...l, goals: l.goals.map((g, i) => (i === 0 ? { ...g, bkRefs: [{ bk: 'BK-0390-2', id: 'bkc9' }] } : g)) })).toBe('gewijzigd');
  });

  it('een ander versiemerk in bkVersies verandert de status niet: het hoort niet bij de doelen', () => {
    const l = bkLeerplan();
    expect(effectieveStatus({ ...l, bkVersies: [{ bk: 'BK-0390-2', sha: 'fedcba9876543210' }] })).toBe('gecontroleerd');
    expect(effectieveStatus({ ...l, bkVersies: undefined })).toBe('gecontroleerd');
  });
});
