import { describe, expect, it } from 'vitest';
import type { MinimumdoelKandidaat, Opzoektabel } from './koppelen';
import { Bekende, maakIndex, zetLeerplanOm, zetLesplanOm, type Afwijking, type BekendeAfwijking, type RuwXlsx } from './omzetten';
import { B, leerplanRuw, lesplanRuw, p, r, rij } from './testRuw';
import type { GoLeerplanBestand, GoLesplanBestand, GoMoment } from './types';
import {
  schermAfwijkingen,
  schermWijzigingen,
  tellingWijzigingen,
  verschilInhoud,
  verschilLesplan,
  wijzigingenDoelensets,
  wijzigingenLeerplan,
  wijzigingenLesplannen,
  type Wijziging,
} from './wijzigingen';

// ══ Hulp ═════════════════════════════════════════════════════════════
const DOELEN: Record<string, MinimumdoelKandidaat> = {
  'KO 3.1.2': { set: 'ODS_3410', id: '92590', code: '3.1.2' },
  'KO 3.1.3': { set: 'ODS_3410', id: '92929', code: '3.1.3' },
  'KO 3.1.4': { set: 'ODS_3410', id: '93034', code: '3.1.4' },
  'L6 3.3.2': { set: 'ODS_3409', id: '92822', code: '3.3.2' },
  'L4 3.1.4': { set: 'ODS_3408', id: '93100', code: '3.1.4' },
};
const TABEL: Opzoektabel = {
  zoek: (m: GoMoment, code: string) => (DOELEN[`${m} ${code}`] ? [DOELEN[`${m} ${code}`]] : []),
  alle: () => Object.values(DOELEN),
  sets: () => [],
  tweelingen: () => [],
};
const KAPOT: BekendeAfwijking = { soort: 'verwijzing-kapot', doel: 'WT.003', kolom: 'SCHAKELS', waarde: 'WT.999', reden: 'Bestaat niet in de doelenset (voor de test).', datum: '2026-11-09' };
const BRON = { naam: 'Doelenset BaO wetenschap en techniek.xlsx', bytes: 9, sha256: 'c'.repeat(64), datum: '2026-09-03T09:39:57Z' };

function leerplan(ruw: RuwXlsx): GoLeerplanBestand {
  const u = zetLeerplanOm(ruw, { bekende: new Bekende([KAPOT]), tabel: TABEL, bestaat: (c) => /^(WT\.00[1-4]|LL\.00\d)$/.test(c), bronBestand: BRON, ingelezen: '2026-11-09' });
  if (!u.bestand) throw new Error(`geen bestand: ${JSON.stringify(u.afwijkingen.lijst)}`);
  return u.bestand;
}
/** De doelenset van testRuw.ts met rij `nr` vervangen (of weggelaten met null). */
const metRij = (nr: number, nieuw: ReturnType<typeof rij> | null, extra: ReturnType<typeof rij>[] = []) =>
  leerplan(leerplanRuw(extra, (rijen) => rijen.flatMap((x) => (x.r === nr ? (nieuw ? [nieuw] : []) : [x]))));
const OUD = leerplan(leerplanRuw());
const LESPLAN = (() => {
  const lp = zetLesplanOm(lesplanRuw(), { bekende: new Bekende([]), bron: { bytes: 1, sha256: 'b'.repeat(64), ingelezen: '2026-11-09' } }).bestand;
  if (!lp) throw new Error('geen lesplan');
  // Het lesplan gebruikt WT.001 en WT.003 van de kleine doelenset.
  return { ...lp, afgeleid: { ...lp.afgeleid, leerplandoelen: lp.afgeleid.leerplandoelen.map((d, i) => ({ ...d, code: i === 1 ? 'WT.003' : d.code })) } };
})();
const soorten = (l: Wijziging[]) => l.map((w) => w.soort);

// ══ Doelensets ═══════════════════════════════════════════════════════
describe('wijzigingenLeerplan: elke wijziging aan een bestaande code stopt (IMP-1)', () => {
  it('dezelfde doelenset: geen wijzigingen', () => {
    expect(wijzigingenLeerplan(OUD, leerplan(leerplanRuw()), [LESPLAN])).toEqual([]);
  });

  it('alleen verschoven rijnummers, en een ingevoegde rubriek die de id’s van de volgende rubrieken verschuift: geen wijzigingen', () => {
    const verschoven = leerplan(leerplanRuw([], (rijen) => rijen.map((x, i) => (i === 0 ? x : { ...x, r: x.r + 7 }))));
    expect(verschoven.doelen[0].rij).not.toBe(OUD.doelen[0].rij);
    expect(wijzigingenLeerplan(OUD, verschoven, [])).toEqual([]);
    const ingevoegd = leerplan(leerplanRuw([], (rijen) => [...rijen.slice(0, 15).map((x) => x), rij(15.5, 'rubriek', 'Schimmels'), ...rijen.slice(15)]));
    expect(ingevoegd.doelen[2].rubriek).not.toBe(OUD.doelen[2].rubriek);
    expect(wijzigingenLeerplan(OUD, ingevoegd, [])).toEqual([]);
  });

  it('andere tekst, met oud en nieuw; een andere opmaak bij dezelfde tekst ook', () => {
    const n = metRij(7, rij(7, 'doelzin', 'Herkennen het dier.', { code: 'WT.001', ko: '3.1.2', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }));
    expect(wijzigingenLeerplan(OUD, n, [LESPLAN])).toEqual([{ soort: 'andere tekst', wat: 'WT.001: "Herkennen het organisme dier." → "Herkennen het dier."', lesplannen: ['LP0065'], stopt: true }]);
    const opgemaakt = structuredClone(OUD);
    opgemaakt.doelen[1].opmaak = [{ t: 'Herkennen verschillende', i: true }, { t: ' voedingswijzen van dieren.' }];
    expect(wijzigingenLeerplan(OUD, opgemaakt, [])).toEqual([{ soort: 'andere tekst', wat: 'WT.002: de opmaak van "Herkennen verschillende voedingswijzen van dieren." is anders', stopt: true }]);
  });

  it('andere koppeling: KO 3.1.3, 3.1.4 → KO 3.1.2, ook als het doel in een lesplan staat', () => {
    const oud = metRij(7, rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.3, 3.1.4', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }));
    const w = wijzigingenLeerplan(oud, OUD, [LESPLAN]);
    expect(w).toEqual([{ soort: 'andere koppeling', wat: 'WT.001: KO 3.1.3, 3.1.4 → KO 3.1.2', lesplannen: ['LP0065'], stopt: true }]);
  });

  it('andere koppeling: alleen de volgorde in de bron, of een voorstel in plaats van een probleem', () => {
    const a = metRij(7, rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.3, 3.1.4', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }));
    const b = metRij(7, rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.4, 3.1.3', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }));
    expect(soorten(wijzigingenLeerplan(a, b, []))).toEqual(['andere koppeling']);
    const probleem = metRij(7, rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.12', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }));
    expect(wijzigingenLeerplan(OUD, probleem, [])[0].wat).toBe('WT.001: KO 3.1.2 → KO "3.12" (onleesbaar)');
  });

  it('andere leeftijd en ander niveau', () => {
    const n = metRij(17, rij(17, 'doelzin', 'Onderscheiden dieren en planten.', { code: 'WT.003', ko: '3.1.2', l6: '3.3.2', kv: 'engageren', lft: ['2,5-4', '4-5', '5-6'], schakels: 'WT.001, WT.999' }));
    expect(wijzigingenLeerplan(OUD, n, [])).toEqual([
      { soort: 'andere leeftijd', wat: 'WT.003: 2,5-4 jaar, 4-5 jaar → 2,5-4 jaar, 4-5 jaar, 5-6 jaar', stopt: true },
      { soort: 'ander niveau', wat: 'WT.003: gebruiken → engageren', stopt: true },
    ]);
  });

  it('VLAGGEN en SCHAKELS verwisseld', () => {
    const n = metRij(7, rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.2', kv: 'begrijpen', lft: ['2,5-4'], schakels: 'LL.001' }));
    expect(wijzigingenLeerplan(OUD, n, [LESPLAN])).toEqual([{ soort: 'andere vlaggen of schakels', wat: 'WT.001: VLAGGEN LL.001 → geen; SCHAKELS geen → LL.001', lesplannen: ['LP0065'], stopt: true }]);
  });

  it('een andere rubriek: het doel en de rubriek die niet meer bestaat', () => {
    const n = metRij(16, rij(16, 'rubriek', 'Plantkunde'));
    expect(wijzigingenLeerplan(OUD, n, [LESPLAN])).toEqual([
      { soort: 'andere rubriek', wat: 'WT.003: Organismen > Kenmerken van organismen > Flora → Organismen > Kenmerken van organismen > Plantkunde', lesplannen: ['LP0065'], stopt: true },
      { soort: 'andere rubriek', wat: 'WT: de rubriek "Organismen > Kenmerken van organismen > Flora" bestaat niet meer (of heeft een andere soort of opmaak)', stopt: true },
    ]);
    const anderNiveau = metRij(16, rij(16, 'subrubriek', 'Flora'));
    expect(soorten(wijzigingenLeerplan(OUD, anderNiveau, []))).toContain('andere rubriek');
  });

  it('andere inhoud: rijen anders, erbij en weg, met het eerste verschil', () => {
    expect(wijzigingenLeerplan(OUD, metRij(13, rij(13, 'MIA - aanklikbaar', 'vissen')), [])).toEqual([
      { soort: 'andere inhoud', wat: 'WT.002: 1 rijen anders, 0 erbij, 0 weg (eerste verschil: mia "vogels" → mia "vissen")', stopt: true },
    ]);
    expect(wijzigingenLeerplan(OUD, metRij(12, null), [])[0].wat).toBe('WT.002: 0 rijen anders, 0 erbij, 1 weg (eerste verschil: mia "zoogdieren" → mia "vogels")');
    expect(wijzigingenLeerplan(OUD, leerplan(leerplanRuw([rij(21, 'te hanteren begrippen', 'de wortel', { lft: ['2,5-4'] })])), [])[0].wat).toBe(
      'WT.003: 0 rijen anders, 1 erbij, 0 weg (eerste verschil: niets → begrip "de wortel")',
    );
  });

  it('een verdwenen code stopt, een nieuwe code niet', () => {
    const n = leerplan(leerplanRuw([rij(21, 'doelzin', 'Nieuw doel.', { code: 'WT.004', kv: 'begrijpen', lft: ['4-5'] })]));
    expect(wijzigingenLeerplan(OUD, n, [])).toEqual([{ soort: 'nieuw', wat: 'WT.004', stopt: false }]);
    expect(wijzigingenLeerplan(n, OUD, [])).toEqual([{ soort: 'verdwenen', wat: 'WT.004', stopt: true }]);
  });

  it('het vangnet: elk ander verschil heet aangepast en stopt ook', () => {
    const n = structuredClone(OUD);
    (n.doelen[0] as unknown as Record<string, unknown>).nieuwVeld = 1;
    expect(wijzigingenLeerplan(OUD, n, [LESPLAN])).toEqual([{ soort: 'aangepast', wat: 'WT.001: andere gegevens', lesplannen: ['LP0065'], stopt: true }]);
  });

  it('verschilInhoud telt met de langste gemeenschappelijke deelrij', () => {
    const t = (tekst: string) => ({ soort: 'mia' as const, tekst, aanklikbaar: true, rij: 1 });
    expect(verschilInhoud([t('a'), t('b'), t('c')], [t('a'), t('x'), t('c'), t('d')])).toEqual({ anders: 1, erbij: 1, weg: 0, eerste: 'mia "b" → mia "x"' });
  });
});

describe('wijzigingenDoelensets: een verdwenen doelenset stopt altijd (IMP-3)', () => {
  const index = maakIndex([OUD, { ...OUD, vak: 'FR', naam: 'Frans' }], [], [], '2026-11-09');
  it('zonder vorige index: niets', () => {
    expect(wijzigingenDoelensets(undefined, ['WT'])).toEqual([]);
  });
  it('een vak uit de vorige index dat ontbreekt: altijd; een nieuw vak stopt niet', () => {
    expect(wijzigingenDoelensets(index, ['WT'])).toEqual([{ soort: 'verdwenen doelenset', wat: 'FR (Frans): de doelenset ontbreekt in de invoer', stopt: true, altijd: true }]);
    expect(wijzigingenDoelensets(index, ['FR', 'WT', 'NL'])).toEqual([{ soort: 'nieuwe doelenset', wat: 'NL (Nederlands)', stopt: false }]);
    expect(wijzigingenDoelensets(index, ['FR', 'WT'])).toEqual([]);
  });
});

// ══ Lesplannen ═══════════════════════════════════════════════════════
describe('wijzigingenLesplannen en verschilLesplan (IMP-7)', () => {
  const lp = (deel5?: Parameters<typeof lesplanRuw>[0]): GoLesplanBestand => {
    const b = zetLesplanOm(lesplanRuw(deel5), { bekende: new Bekende([]), bron: { bytes: 1, sha256: 'b'.repeat(64), ingelezen: '2026-11-09' } }).bestand;
    if (!b) throw new Error('geen lesplan');
    return b;
  };
  const oud = lp();
  const index = maakIndex([], [], [oud], '2026-11-09');

  it('hetzelfde lesplan: niets; een andere tekst: de eerste regel die verschilt', () => {
    expect(wijzigingenLesplannen(index, () => oud, [lp()])).toEqual([]);
    const nieuw = lp({ deel5: [p([r('Dierenmand en plantenmand', B), r('\nZet drie grote manden klaar.')]), p([r('Wie heeft honger?', B), r('\nZet enkele dierenknuffels op tafel.')])] });
    const w = wijzigingenLesplannen(index, () => oud, [nieuw]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ soort: 'ander lesplan', lesplan: 'LP0065', stopt: true });
    expect(w[0].wat).toMatch(/^LP0065: regel \d+: "P Dierenmand en plantenmand\nZet twee grote manden klaar\.\nZe leggen elk voorwerp in de juiste mand\." → "P Dierenmand en plantenmand\nZet drie grote manden klaar\." /);
  });

  it('dezelfde tekst maar andere afgeleide gegevens: welke velden', () => {
    const nieuw = { ...oud, afgeleid: { ...oud.afgeleid, vlaggen: [] }, sha256: 'x'.repeat(64) };
    expect(verschilLesplan(oud, nieuw)).toBe('afgeleid: vlaggen');
  });

  it('een nieuw lesplan stopt niet; een verdwenen lesplan en een ontbrekend oud bestand wel', () => {
    const lp2 = { ...oud, code: 'LP0066' };
    expect(wijzigingenLesplannen(index, (c) => (c === 'LP0065' ? oud : undefined), [oud, lp2])).toEqual([
      { soort: 'nieuw lesplan', wat: 'LP0066 Dieren classificeren (2,5-4 jaar), WT.001, WT.008, WT.028', lesplan: 'LP0066', stopt: false },
    ]);
    expect(wijzigingenLesplannen(index, () => undefined, [])).toEqual([{ soort: 'verdwenen lesplan', wat: 'LP0065 Dieren classificeren', lesplan: 'LP0065', stopt: true }]);
    expect(wijzigingenLesplannen(index, () => undefined, [oud])[0]).toMatchObject({ soort: 'ander lesplan', stopt: true });
    expect(wijzigingenLesplannen(undefined, () => undefined, [oud])).toEqual([]);
  });
});

// ══ Schermuitvoer ════════════════════════════════════════════════════
describe('schermuitvoer: gegroepeerd en begrensd (IMP-7)', () => {
  it('wijzigingen per soort, met de lesplannen erbij, hoogstens 30 regels', () => {
    const w: Wijziging[] = [
      { soort: 'andere koppeling', wat: 'WT.086: KO 3.1.3, 3.1.4 → KO 3.1.1', lesplannen: ['LP0001'], stopt: true },
      { soort: 'nieuw', wat: 'WT.529', stopt: false },
      { soort: 'andere koppeling', wat: 'WT.100: KO 3.1.2 → KO 3.1.3', stopt: true },
      { soort: 'verdwenen doelenset', wat: 'FR (Frans): de doelenset ontbreekt in de invoer', stopt: true, altijd: true },
    ];
    expect(schermWijzigingen(w)).toEqual([
      '  WIJZIGING andere koppeling: WT.086: KO 3.1.3, 3.1.4 → KO 3.1.1 [LP0001]',
      '  WIJZIGING andere koppeling: WT.100: KO 3.1.2 → KO 3.1.3',
      '  WIJZIGING nieuw (stopt niet): WT.529',
      '  WIJZIGING verdwenen doelenset (stopt altijd): FR (Frans): de doelenset ontbreekt in de invoer',
    ]);
    expect(tellingWijzigingen(w)).toBe('andere koppeling 2, nieuw 1, verdwenen doelenset 1');
    const veel = Array.from({ length: 40 }, (_, i): Wijziging => ({ soort: 'andere rubriek', wat: `AA.${String(i).padStart(3, '0')}`, stopt: true }));
    const regels = schermWijzigingen(veel);
    expect(regels).toHaveLength(31);
    expect(regels[30]).toBe('  … en nog 10 (zie rapport.json)');
  });

  it('gelijke afwijkingen (soort en bericht) samen, met de plaatsen', () => {
    const a = (bestand: string, bericht = 'in het lesplan "x", in de doelenset "y"'): Afwijking => ({ soort: 'lesplan-doeltekst', bestand, waar: 'deel 2, WT.008', bericht });
    const lijst = [...Array.from({ length: 7 }, (_, i) => a(`LP10${String(i).padStart(2, '0')}`)), a('LP0065', 'iets anders')];
    expect(schermAfwijkingen(lijst)).toEqual([
      '  NIEUW 7 × [lesplan-doeltekst]: in het lesplan "x", in de doelenset "y" — LP1000 deel 2, WT.008; LP1001 deel 2, WT.008; LP1002 deel 2, WT.008; LP1003 deel 2, WT.008; LP1004 deel 2, WT.008; … (+2)',
      '  NIEUW LP0065 deel 2, WT.008 [lesplan-doeltekst]: iets anders',
    ]);
    expect(schermAfwijkingen(Array.from({ length: 35 }, (_, i) => a('LP0001', `bericht ${i}`)))).toHaveLength(31);
  });
});
