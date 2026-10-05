import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { CURRICULUM_NETS } from './curriculumTypes';
import { bevestigLeerplan, exportCurriculumJson, importCurriculumJson } from './curriculum';
import { controleerLeerplan } from './curriculumCheck';
import type { Bevinding } from './curriculumCheck';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { effectieveStatus } from './leerplanStatus';
import { NET_KEUZES, NET_LINKS, netLinkVoor } from './leerplanNetten';
import {
  aantalFouten, aantalMetVerwijzing, alleBevindingen, bewaarbareDoelen, bewaarNakijkerNaam, bouwOntwerp, bronHash, bronKomtOvereen,
  codesUitDoelen, geldigheidTekstVanBestand, geldigheidVanBestand, groepeerBevindingen, kandidaatSets, keuzeUitLeerplan, kiesKandidaat,
  kiesVooraf, koppelDoelen, legeKeuze, leesNakijkerNaam, leesNiveau, maakKandidaat, niveauTekst, ontbreektInKeuze,
  pasDoelAan, puntenTekst, rangschik, redenenGeenBevestiging, ruimProblemenOp, saneerOntwerp, somLijst,
  stelTitelVoor, verwijderDoel, verwijderRef, vindDoelProblemen, zegOntbrekend, zetRefs, zoekDoelen, zoekMinimumdoel,
  type BronGegevens, type LeerplanKeuze,
} from './leerplanInlezen';

// Alle teksten en sets hieronder zijn NAGEMAAKT (geen echte leerplantekst: auteursrecht).

function bestand(
  id: string,
  doelen: { id?: string; code: string; tekst?: string; rubriek?: string; geldigheid?: string }[],
  kop: Partial<MinimumdoelenSetBestand['set']> = {},
): MinimumdoelenSetBestand {
  return {
    app: 'boosterz',
    kind: 'minimumdoelen',
    v: 1,
    set: {
      id, naam: `Secundair onderwijs 1ste graad A-stroom - Set ${id}`, korteNaam: `Set ${id}`, sleutelcompetenties: [], bron: '', api: '',
      naamsvermelding: '', licentie: '', opgehaald: '2026-10-05T00:00:00Z', aantal: doelen.length, sha256: '', ...kop,
    },
    doelen: doelen.map((d) => ({
      ...(d.id !== undefined ? { id: d.id } : {}),
      code: d.code,
      tekst: d.tekst ?? `<p>Minimumdoel ${d.code}</p>`,
      extra: {
        ...(d.rubriek ? { titels: { '1': { titel: d.rubriek, nr: '1' } } } : {}),
        ...(d.geldigheid ? { geldigheid: { type: d.geldigheid } } : {}),
      },
    })),
  };
}

function indexSet(id: string, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return {
    id, naam: `Secundair onderwijs 1ste graad A-stroom - Set ${id}`, korteNaam: `Set ${id}`, graad: '1ste graad', stroom: 'A-stroom',
    aantal: 5, sha256: '', opgehaald: '2026-10-05T00:00:00Z', bestand: `${id}.json`, ...extra,
  };
}

const KEUZE: LeerplanKeuze = {
  net: 'kov', vak: 'Aardrijkskunde', onderwijs: 'so', graad: '1ste graad', stroom: 'A-stroom', leerplancode: 'I-Aar-a', versie: '2024', titel: 'Mijn leerplan',
};

const TEKST = [
  'Testleerplan aardrijkskunde (nagemaakt, geen echt leerplan)',
  '',
  'Ruimte en kaarten',
  'LPD 1 De leerlingen situeren plaatsen op een kaart met behulp van een legende en een schaal. (MD 09.01)',
  'LPD 2 De leerlingen verklaren het verschil tussen absolute en relatieve ligging van een plaats. (MD 09.02, 09.03)',
  'LPD 3 De leerlingen vergelijken landschappen in verschillende werelddelen met elkaar. (MD 09.07)',
].join('\n');

const SET_MD = bestand('ODS_3287', [
  { id: '101', code: '09.01', rubriek: 'Ruimte' }, { id: '102', code: '09.02' }, { id: '103', code: '09.03' },
  { id: '104', code: '09.04' }, { id: '107', code: '09.07' },
]);

describe('leerplanNetten', () => {
  it('de netten van de wizard komen uit CURRICULUM_NETS, zonder de minimumdoelen', () => {
    expect(NET_KEUZES.map((n) => n.id)).toEqual(['go', 'kov', 'ovsg', 'pov', 'eigen']);
    for (const n of NET_KEUZES) expect(CURRICULUM_NETS.some((c) => c.id === n.id)).toBe(true);
    expect(NET_KEUZES.find((n) => n.id === 'eigen')?.label).toBe('Eigen of ander');
  });

  it('elk net heeft zijn eigen link; "eigen" heeft er geen', () => {
    expect(NET_LINKS).toHaveLength(4);
    expect(netLinkVoor('go')?.url).toBe('https://pro.g-o.be');
    expect(netLinkVoor('kov')?.tekst).toBe('pro.katholiekonderwijs.vlaanderen');
    expect(netLinkVoor('eigen')).toBeUndefined();
    expect(netLinkVoor('')).toBeUndefined();
    expect(NET_LINKS.every((l) => /^https:\/\//.test(l.url))).toBe(true);
  });
});

describe('stap 1: gegevens van het leerplan', () => {
  it('stelt een titel voor uit vak, niveau, net en leerplancode', () => {
    expect(stelTitelVoor(KEUZE)).toBe('Aardrijkskunde 1ste graad A-stroom (KOV I-Aar-a)');
    expect(stelTitelVoor({ ...KEUZE, leerplancode: '' })).toBe('Aardrijkskunde 1ste graad A-stroom (KOV)');
    expect(stelTitelVoor({ ...KEUZE, net: 'eigen' })).toBe('Aardrijkskunde 1ste graad A-stroom (I-Aar-a)');
    expect(stelTitelVoor({ ...KEUZE, net: 'eigen', leerplancode: '', graad: '', stroom: '' })).toBe('Aardrijkskunde');
    expect(stelTitelVoor({ ...KEUZE, vak: '  ' })).toBe('');
  });

  it('schrijft het niveau uit graad en stroom', () => {
    expect(niveauTekst('1ste graad', 'A-stroom')).toBe('1ste graad A-stroom');
    expect(niveauTekst('2de graad', '')).toBe('2de graad');
    expect(niveauTekst('', '')).toBe('');
  });

  it('leest graad en stroom uit een vrij niveau', () => {
    expect(leesNiveau('1e graad A-stroom')).toEqual({ graad: '1ste graad', stroom: 'A-stroom' });
    expect(leesNiveau('2de graad, B stroom')).toEqual({ graad: '2de graad', stroom: 'B-stroom' });
    expect(leesNiveau('3e leerjaar')).toEqual({ graad: '', stroom: '' });
    expect(leesNiveau('')).toEqual({ graad: '', stroom: '' });
  });

  it('zegt wat er nog ontbreekt, met het veld dat de pagina kan aanwijzen', () => {
    const leeg = ontbreektInKeuze(legeKeuze());
    expect(leeg.map((o) => o.veld)).toEqual(['il-net', 'il-vak', 'il-titel']);
    expect(zegOntbrekend(leeg)).toBe('Nog nodig: kies een net, vul het vak in en geef het leerplan een titel.');
    expect(ontbreektInKeuze(KEUZE)).toEqual([]);
    expect(zegOntbrekend([])).toBe('');
    expect(zegOntbrekend(ontbreektInKeuze({ ...KEUZE, vak: ' ' }))).toBe('Nog nodig: vul het vak in.');
  });

  it('somLijst schrijft een opsomming in gewone taal', () => {
    expect(somLijst([])).toBe('');
    expect(somLijst(['a'])).toBe('a');
    expect(somLijst(['a', 'b'])).toBe('a en b');
    expect(somLijst(['a', 'b', 'c'])).toBe('a, b en c');
  });

  it('haalt de keuzes uit een bestaand leerplan', () => {
    const cur: Curriculum = {
      id: 'x', title: 'Oud', net: 'go', subject: 'Wiskunde', level: '1e graad B-stroom', goals: [], createdAt: 1, updatedAt: 1,
      herkomst: { methode: 'pdf', leerplancode: 'W-1', versie: '2022', ingelezenOp: 1 },
    };
    expect(keuzeUitLeerplan(cur)).toMatchObject({ net: 'go', vak: 'Wiskunde', graad: '1ste graad', stroom: 'B-stroom', leerplancode: 'W-1', versie: '2022', titel: 'Oud' });
  });
});

describe('stap 2: de bron en het zoeken van doelen', () => {
  it('vindt de doelen, het patroon en de verwijzingen in de bron', () => {
    const g = zoekDoelen(TEKST, 123);
    expect(g.resultaat.patroon?.naam).toBe('LPD-nummers');
    expect(g.goals.map((d) => d.code)).toEqual(['LPD 1', 'LPD 2', 'LPD 3']);
    expect(g.goals.map((d) => d.refsBron)).toEqual(['MD 09.01', 'MD 09.02, 09.03', 'MD 09.07']);
    expect(g.goals[0].theme).toBe('Ruimte en kaarten');
    expect(g.op).toBe(123);
  });

  it('hangt aan elk doel zijn eigen bronfragment', () => {
    const g = zoekDoelen(TEKST);
    expect(g.goals).toHaveLength(3);
    for (const d of g.goals) expect(g.fragmenten[d.id]).toContain(d.code);
    expect(g.fragmenten[g.goals[1].id]).toContain('(MD 09.02, 09.03)');
  });

  it('geeft geen doelen bij tekst zonder doelen', () => {
    const g = zoekDoelen('Dit is een inleiding zonder enig doel.\nNog een zin.');
    expect(g.goals).toEqual([]);
    expect(g.resultaat.doelen).toEqual([]);
  });

  it('telt de verwijzingen in de doelen, ontdubbeld', () => {
    const g = zoekDoelen(TEKST);
    expect(codesUitDoelen(g.goals)).toEqual(['09.01', '09.02', '09.03', '09.07']);
    expect(aantalMetVerwijzing(g.goals)).toBe(3);
    expect(codesUitDoelen([{ id: 'a', code: 'A', text: 't', refsBron: 'MD 9.1', refs: [{ set: 'ODS_1', id: '5', code: '09.01' }, { set: 'ODS_1', id: '6', code: '09.02' }] }])).toEqual(['9.1', '09.02']);
    expect(codesUitDoelen([{ id: 'a', code: 'A', text: 't' }])).toEqual([]);
  });

  it('rekent de vingerafdruk van de bron en vergelijkt ze met de herkomst', () => {
    const tekst: BronGegevens = { methode: 'tekst', tekst: 'abc', afgekapt: false };
    expect(bronHash(tekst)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(bronHash({ ...tekst, methode: 'pdf', bronSha256: 'f'.repeat(64) })).toBe('f'.repeat(64));
    expect(bronKomtOvereen({ methode: 'tekst', bronSha256: bronHash(tekst), ingelezenOp: 1 }, tekst)).toBe(true);
    expect(bronKomtOvereen({ methode: 'tekst', bronSha256: 'a'.repeat(64), ingelezenOp: 1 }, tekst)).toBe(false);
    // andere manier van inlezen of geen vingerafdruk: niet na te gaan
    expect(bronKomtOvereen({ methode: 'pdf', bronSha256: bronHash(tekst), ingelezenOp: 1 }, tekst)).toBeUndefined();
    expect(bronKomtOvereen({ methode: 'tekst', ingelezenOp: 1 }, tekst)).toBeUndefined();
    expect(bronKomtOvereen(undefined, tekst)).toBeUndefined();
  });
});

describe('stap 3: sets voorstellen en kiezen', () => {
  const index: MinimumdoelenIndexSet[] = [
    indexSet('ODS_1', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Wiskunde - Eindtermen', korteNaam: 'Wiskunde' }),
    indexSet('ODS_2', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen', korteNaam: 'Aardrijkskunde' }),
    indexSet('ODS_3', { naam: 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 - Vak - Aardrijkskunde', korteNaam: 'Aardrijkskunde' }),
    indexSet('ODS_4', { naam: 'Secundair onderwijs 2de graad - Vak - Aardrijkskunde', graad: '2de graad', stroom: undefined }),
    indexSet('ODS_5', { naam: 'Secundair onderwijs 1ste graad A-stroom - Competenties - Ruimtelijk bewustzijn', korteNaam: 'Ruimtelijk bewustzijn' }),
    indexSet('ODS_6', { naam: 'Secundair onderwijs 1ste graad B-stroom - Vak - Wiskunde', stroom: 'B-stroom' }),
  ];
  const opties = { graad: '1ste graad', stroom: 'A-stroom', onderwijs: 'so' as const, vak: '', eigen: [] };

  it('filtert op graad, stroom en soort onderwijs', () => {
    // zoals stelSetsVoor ze rangschikt: op korte naam
    expect(kandidaatSets(index, opties).map((s) => s.id)).toEqual(['ODS_2', 'ODS_5', 'ODS_1']);
    expect(kandidaatSets(index, { ...opties, onderwijs: 'buso' }).map((s) => s.id)).toEqual(['ODS_3']);
    expect(kandidaatSets(index, { ...opties, graad: '2de graad', stroom: '' }).map((s) => s.id)).toEqual(['ODS_4']);
  });

  it('zet sets die het vak noemen vooraan', () => {
    expect(kandidaatSets(index, { ...opties, vak: 'Wiskunde' }).map((s) => s.id)).toEqual(['ODS_1', 'ODS_2', 'ODS_5']);
    expect(kandidaatSets(index, { ...opties, vak: 'Ruimtelijk bewustzijn' }).map((s) => s.id)).toEqual(['ODS_5', 'ODS_2', 'ODS_1']);
  });

  it('zet de sets van het leerplan zelf helemaal vooraan, ook als ze niet bij de graad passen', () => {
    expect(kandidaatSets(index, { ...opties, eigen: ['ODS_4', 'ODS_2', 'ODS_99'] }).map((s) => s.id)).toEqual(['ODS_4', 'ODS_2', 'ODS_5', 'ODS_1']);
  });

  it('telt per set hoeveel codes erin voorkomen, ook met en zonder voorloopnul', () => {
    const k = maakKandidaat(index[4], SET_MD, ['09.01', '9.2', '09.03', '09.99', '9.1']);
    expect(k.treffers).toBe(3);
    expect(k.codes).toEqual(['9.1', '9.2', '9.3']);
    expect(maakKandidaat(index[4], SET_MD, []).treffers).toBe(0);
    expect(maakKandidaat(index[4], undefined, ['09.01'])).toMatchObject({ treffers: 0, mislukt: true });
  });

  it('leest de geldigheid uit de kop of, bij oudere bestanden, uit de doelen', () => {
    expect(geldigheidVanBestand(bestand('ODS_7', [{ id: '1', code: '1', geldigheid: 'Geldig' }]))).toBe('G');
    expect(geldigheidVanBestand(bestand('ODS_7', [{ id: '1', code: '1', geldigheid: 'Niet meer geldig' }]))).toBe('N');
    expect(geldigheidVanBestand(bestand('ODS_7', [{ id: '1', code: '1' }]))).toBeUndefined();
    expect(geldigheidVanBestand(bestand('ODS_7', [{ id: '1', code: '1', geldigheid: 'Geldig' }], { geldigheid: 'Niet meer geldig' }))).toBe('N');
  });

  it('geeft de geldigheid als tekst, zodat twee versies van een set te onderscheiden zijn', () => {
    expect(geldigheidTekstVanBestand(bestand('ODS_7', [{ id: '1', code: '1', geldigheid: 'Geldig' }]))).toBe('Geldig');
    expect(geldigheidTekstVanBestand(bestand('ODS_7', [{ id: '1', code: '1' }]))).toBeUndefined();
    expect(geldigheidTekstVanBestand(bestand('ODS_7', [], { geldigheid: 'Niet meer geldig', geldigVan: '2019-09-01', geldigTot: '2025-08-31' }))).toBe('Niet meer geldig (2019–2025)');
  });

  it('rangschikt op treffers en houdt de volgorde bij gelijkstand', () => {
    const k = (id: string, treffers: number) => ({ set: indexSet(id), treffers, codes: [] });
    expect(rangschik([k('A', 1), k('B', 3), k('C', 1), k('D', 0), k('E', 3)]).map((x) => x.set.id)).toEqual(['B', 'E', 'A', 'C', 'D']);
  });

  it('vinkt sets met treffers aan, maar niet de oude versie van een set die ook geldig is', () => {
    const nieuw = maakKandidaat(indexSet('ODS_3287'), bestand('ODS_3287', [{ id: '1', code: '09.01', geldigheid: 'Geldig' }]), ['09.01']);
    const oud = maakKandidaat(indexSet('ODS_2447'), bestand('ODS_2447', [{ id: '2', code: '9.1', geldigheid: 'Niet meer geldig' }]), ['09.01']);
    const zonder = maakKandidaat(indexSet('ODS_2118'), bestand('ODS_2118', [{ id: '3', code: '1', geldigheid: 'Geldig' }]), ['09.01']);
    expect(kiesVooraf([nieuw, oud, zonder])).toEqual(['ODS_3287']);
  });

  it('vinkt een oude set toch aan als alleen die een code dekt', () => {
    const nieuw = maakKandidaat(indexSet('ODS_N'), bestand('ODS_N', [{ id: '1', code: '09.01', geldigheid: 'Geldig' }]), ['09.01', '5.2']);
    const oud = maakKandidaat(indexSet('ODS_O'), bestand('ODS_O', [{ id: '2', code: '9.1', geldigheid: 'Niet meer geldig' }, { id: '3', code: '5.2', geldigheid: 'Niet meer geldig' }]), ['09.01', '5.2']);
    expect(kiesVooraf([nieuw, oud])).toEqual(['ODS_N', 'ODS_O']);
    expect(kiesVooraf([])).toEqual([]);
  });
});

describe('stap 3: verwijzingen koppelen', () => {
  const g = zoekDoelen(TEKST).goals;

  it('lost de verwijzingen op naar set en vast nummer', () => {
    const r = koppelDoelen(g, [SET_MD]);
    expect(r.goals[0].refs).toEqual([{ set: 'ODS_3287', id: '101', code: '09.01' }]);
    expect(r.goals[1].refs?.map((x) => x.id)).toEqual(['102', '103']);
    expect(r.goals[2].refs?.map((x) => x.code)).toEqual(['09.07']);
    expect(r).toMatchObject({ gekoppeld: 4, nietGekoppeld: 0, problemen: {} });
    expect(r.goals[0].refsBron).toBe('MD 09.01');
    expect(g[0].refs).toBeUndefined(); // het origineel blijft ongemoeid
  });

  it('bewaart onbekende en dubbelzinnige verwijzingen als probleem, per doel', () => {
    const andere = bestand('ODS_9', [{ id: '201', code: '9.7', rubriek: 'A' }, { id: '202', code: '9.7', rubriek: 'B' }]);
    const doelen: CurriculumGoal[] = [
      { id: 'a', code: 'A 1', text: 'één', refsBron: 'MD 09.01, MD 09.99' },
      { id: 'b', code: 'A 2', text: 'twee', refsBron: 'MD 09.07' },
      { id: 'c', code: 'A 3', text: 'drie' },
    ];
    const r = koppelDoelen(doelen, [SET_MD, andere]);
    expect(r.goals[0].refs?.map((x) => x.code)).toEqual(['09.01']);
    expect(r.problemen.a).toEqual([{ code: '09.99', soort: 'onbekend', kandidaten: [] }]);
    expect(r.goals[1].refs).toBeUndefined();
    expect(r.problemen.b[0]).toMatchObject({ code: '09.07', soort: 'dubbelzinnig' });
    expect(r.problemen.b[0].kandidaten.map((k) => `${k.set}:${k.id}`)).toEqual(['ODS_3287:107', 'ODS_9:201', 'ODS_9:202']);
    expect(r.problemen.c).toBeUndefined();
    expect(r).toMatchObject({ gekoppeld: 1, nietGekoppeld: 2 });
  });

  it('haalt een oude koppeling weg als er niets meer past', () => {
    const doelen: CurriculumGoal[] = [{ id: 'a', code: 'A', text: 't', refsBron: 'MD 09.01', refs: [{ set: 'ODS_X', id: '1', code: '09.01' }] }];
    expect(koppelDoelen(doelen, []).goals[0].refs).toBeUndefined();
  });

  it('laat bij een bestaand leerplan de doelen met verwijzingen met rust', () => {
    const doelen: CurriculumGoal[] = [
      { id: 'a', code: 'A', text: 't', refsBron: 'MD 09.01, MD 09.02', refs: [{ set: 'ODS_3287', id: '102', code: '09.02' }] },
      { id: 'b', code: 'B', text: 't', refsBron: 'MD 09.03' },
    ];
    const r = koppelDoelen(doelen, [SET_MD], { alleenZonderRefs: true });
    expect(r.goals[0].refs?.map((x) => x.id)).toEqual(['102']);
    expect(r.goals[1].refs?.map((x) => x.id)).toEqual(['103']);
    expect(r.gekoppeld).toBe(2);
  });

  it('zoekt het minimumdoel bij een verwijzing', () => {
    const sets = new Map([[SET_MD.set.id, SET_MD]]);
    expect(zoekMinimumdoel(sets, { set: 'ODS_3287', id: '103', code: '09.03' })?.code).toBe('09.03');
    expect(zoekMinimumdoel(sets, { set: 'ODS_3287', id: '999', code: '09.03' })).toBeUndefined();
    expect(zoekMinimumdoel(sets, { set: 'ODS_1', id: '103', code: '09.03' })).toBeUndefined();
  });
});

describe('stap 4: doelen aanpassen', () => {
  const doelen: CurriculumGoal[] = [
    { id: 'a', code: 'A 1', text: 'één', refs: [{ set: 'ODS_1', id: '1', code: '09.01' }, { set: 'ODS_1', id: '2', code: '09.02' }] },
    { id: 'b', code: 'A 2', text: 'twee' },
  ];

  it('past code en tekst van één doel aan zonder de rest te raken', () => {
    const r = pasDoelAan(doelen, 'b', { text: 'tweeënhalf' });
    expect(r[1]).toMatchObject({ code: 'A 2', text: 'tweeënhalf' });
    expect(r[0]).toBe(doelen[0]);
    expect(doelen[1].text).toBe('twee');
  });

  it('verwijdert een doel', () => {
    expect(verwijderDoel(doelen, 'a').map((d) => d.id)).toEqual(['b']);
  });

  it('zet en verwijdert verwijzingen; een lege lijst haalt het veld weg', () => {
    const een = verwijderRef(doelen, 'a', 0);
    expect(een[0].refs?.map((r) => r.id)).toEqual(['2']);
    const geen = verwijderRef(een, 'a', 0);
    expect('refs' in geen[0]).toBe(false);
    const nieuw = zetRefs(doelen, 'b', [{ set: 'ODS_1', id: '5', code: '09.05' }]);
    expect(nieuw[1].refs?.map((r) => r.id)).toEqual(['5']);
    expect(zetRefs(doelen, 'a', [])[0].refs).toBeUndefined();
  });

  it('ruimt problemen op als de verwijzing gekozen is', () => {
    const problemen = { a: [{ code: '09.01', soort: 'dubbelzinnig' as const, kandidaten: [] }, { code: '09.99', soort: 'onbekend' as const, kandidaten: [] }] };
    const r = ruimProblemenOp(problemen, 'a', [{ set: 'ODS_1', id: '1', code: '9.1' }]);
    expect(r.a.map((p) => p.code)).toEqual(['09.99']);
    expect(ruimProblemenOp(r, 'a', [{ set: 'ODS_1', id: '9', code: '09.99' }])).toEqual({});
    expect(problemen.a).toHaveLength(2); // het origineel blijft ongemoeid
  });

  it('kiest een kandidaat: verwijzing erbij, probleem weg, geen dubbele verwijzing', () => {
    const problemen = { b: [{ code: '09.05', soort: 'dubbelzinnig' as const, kandidaten: [] }] };
    const ref = { set: 'ODS_1', id: '5', code: '09.05' };
    const r = kiesKandidaat(doelen, problemen, 'b', ref);
    expect(r.goals[1].refs).toEqual([ref]);
    expect(r.problemen).toEqual({});
    const nogEens = kiesKandidaat(r.goals, problemen, 'b', ref);
    expect(nogEens.goals[1].refs).toHaveLength(1);
  });
});

describe('stap 4: doelproblemen die het saneren zou verbergen', () => {
  it('meldt een doel zonder tekst, zonder code en een dubbele code', () => {
    const doelen: CurriculumGoal[] = [
      { id: 'a', code: 'LPD 1', text: 'één' },
      { id: 'b', code: 'lpd  1', text: 'tweede met dezelfde code' },
      { id: 'c', code: '', text: 'zonder code' },
      { id: 'd', code: 'LPD 4', text: '   ' },
    ];
    const p = vindDoelProblemen(doelen);
    expect(p.every((b) => b.ernst === 'fout')).toBe(true);
    expect(p.map((b) => b.doelId)).toEqual(['b', 'c', 'd']);
    expect(p[0].bericht).toBe('De code LPD 1 komt meer dan één keer voor (doel 1 en doel 2). Elke code moet uniek zijn.');
    expect(p[1].bericht).toBe('Doel 3 heeft geen code. Geef het een code of verwijder het doel.');
    expect(p[2].bericht).toContain('LPD 4 heeft geen tekst');
  });

  it('meldt niets bij goede doelen', () => {
    expect(vindDoelProblemen(zoekDoelen(TEKST).goals)).toEqual([]);
    expect(vindDoelProblemen([])).toEqual([]);
  });

  it('bewaart bij "bewaren zonder nakijken" elk doel, ook met een dubbele code', () => {
    const doelen: CurriculumGoal[] = [
      { id: 'a', code: 'x 1', text: 'één' },
      { id: 'b', code: 'X 1', text: 'dubbel' },
      { id: 'c', code: 'X 2', text: '' },
    ];
    const r = bewaarbareDoelen(doelen);
    expect(r.map((d) => d.code)).toEqual(['X 1', 'X 1']);
    expect(saneerOntwerp(bouwOntwerp({ keuze: KEUZE, bron: { methode: 'tekst' }, goals: doelen, setIds: [], ingelezenOp: 1 }))?.goals).toHaveLength(1);
  });
});

describe('het ontwerp', () => {
  const g = koppelDoelen(zoekDoelen(TEKST).goals, [SET_MD]).goals;
  const bron = { methode: 'pdf' as const, bronNaam: 'leerplan.pdf', bronSha256: 'a'.repeat(64) };

  it('bouwt een nieuw leerplan met herkomst en sets', () => {
    const o = bouwOntwerp({ keuze: KEUZE, bron, goals: g, setIds: ['ODS_3287'], ingelezenOp: 1000 });
    expect(o).toMatchObject({
      title: 'Mijn leerplan', net: 'kov', subject: 'Aardrijkskunde', level: '1ste graad A-stroom', kind: 'leerplan', minimumdoelenSets: ['ODS_3287'],
      herkomst: { methode: 'pdf', leerplancode: 'I-Aar-a', versie: '2024', bronNaam: 'leerplan.pdf', bronSha256: 'a'.repeat(64), ingelezenOp: 1000 },
    });
    expect(o.goals).toHaveLength(3);
    expect(o.controle).toBeUndefined();
  });

  it('laat lege velden weg en zet een leeg net op "eigen"', () => {
    const o = bouwOntwerp({ keuze: { ...KEUZE, net: '', leerplancode: ' ', versie: '' }, bron: { methode: 'tekst' }, goals: g, setIds: [], ingelezenOp: 5 });
    expect(o.net).toBe('eigen');
    expect(o.minimumdoelenSets).toBeUndefined();
    expect(o.herkomst).toEqual({ methode: 'tekst', ingelezenOp: 5 });
  });

  it('werkt een bestaand leerplan bij: zelfde id, oude herkomst en niveau blijven waar de wizard niets weet', () => {
    const bestaand: Curriculum = {
      id: 'oud-id', title: 'Oud', net: 'go', subject: 'Wiskunde', level: '3e leerjaar', createdAt: 1, updatedAt: 1, goals: [],
      herkomst: { methode: 'ai', leerplancode: 'W-1', ingelezenOp: 42 },
      controle: { status: 'niet-gecontroleerd' },
    };
    const o = bouwOntwerp({
      bestaand, keuze: { ...keuzeUitLeerplan(bestaand), titel: 'Nieuw' }, bron: { methode: 'tekst', bronSha256: 'b'.repeat(64) }, goals: g, setIds: ['ODS_3287'], ingelezenOp: 999,
    });
    expect(o).toMatchObject({ id: 'oud-id', title: 'Nieuw', net: 'go', level: '3e leerjaar', createdAt: 1, controle: { status: 'niet-gecontroleerd' } });
    expect(o.herkomst).toEqual({ methode: 'tekst', leerplancode: 'W-1', bronSha256: 'b'.repeat(64), ingelezenOp: 42 });
  });

  it('laat het vrije niveau van een bestaand leerplan staan zolang graad en stroom niet veranderen', () => {
    const bestaand: Curriculum = { id: 'x', title: 'Oud', net: 'kov', subject: 'Aardrijkskunde', level: '1e graad A-stroom (eigen versie)', createdAt: 1, updatedAt: 1, goals: [] };
    const basis = { bestaand, bron: { methode: 'tekst' as const }, goals: g, setIds: [], ingelezenOp: 5 };
    expect(bouwOntwerp({ ...basis, keuze: keuzeUitLeerplan(bestaand) }).level).toBe('1e graad A-stroom (eigen versie)');
    expect(bouwOntwerp({ ...basis, keuze: { ...keuzeUitLeerplan(bestaand), graad: '2de graad' } }).level).toBe('2de graad A-stroom');
    expect(bouwOntwerp({ ...basis, keuze: { ...keuzeUitLeerplan(bestaand), graad: '', stroom: '' } }).level).toBe('1e graad A-stroom (eigen versie)');
  });

  it('door nakijken en bevestigen blijft het leerplan nagekeken, ook na exporteren en importeren', () => {
    const ontwerp = saneerOntwerp(bouwOntwerp({ keuze: KEUZE, bron, goals: g, setIds: ['ODS_3287'], ingelezenOp: 1000 }));
    expect(ontwerp).not.toBeNull();
    const rapport = controleerLeerplan(ontwerp as Curriculum, { bronTekst: TEKST, sets: [SET_MD] });
    expect(rapport.kanBevestigen).toBe(true);
    expect(rapport.tellers).toMatchObject({ doelen: 3, letterlijk: 3, verwijzingen: 4, verwijzingenOk: 4 });
    const bevestigd = bevestigLeerplan(ontwerp as Curriculum, { door: 'Test Nakijker', rapport, samenvatting: rapport.samenvatting });
    expect(effectieveStatus(bevestigd)).toBe('gecontroleerd');
    const terug = importCurriculumJson(exportCurriculumJson(bevestigd));
    expect(terug).not.toBeNull();
    expect(effectieveStatus(terug as Curriculum)).toBe('gecontroleerd');
    expect(terug?.controle?.door).toBe('Test Nakijker');
    expect(terug?.goals[1].refs?.map((r) => r.code)).toEqual(['09.02', '09.03']);
  });

  it('een gewijzigde tekst geeft "niet letterlijk gevonden" en blokkeert bevestigen', () => {
    const aangepast = pasDoelAan(g, g[0].id, { text: `${g[0].text} (aangepast)` });
    const ontwerp = saneerOntwerp(bouwOntwerp({ keuze: KEUZE, bron, goals: aangepast, setIds: ['ODS_3287'], ingelezenOp: 1 })) as Curriculum;
    const rapport = controleerLeerplan(ontwerp, { bronTekst: TEKST, sets: [SET_MD] });
    expect(rapport.perDoel[g[0].id].letterlijk).toBe('nee');
    expect(rapport.kanBevestigen).toBe(false);
  });
});

describe('bevindingen en bevestigen', () => {
  const b = (ernst: Bevinding['ernst'], bericht: string): Bevinding => ({ soort: 'volledig', ernst, bericht });

  it('groepeert per ernst in vaste volgorde en laat lege groepen weg', () => {
    const groepen = groepeerBevindingen([b('info', 'i'), b('fout', 'f1'), b('waarschuwing', 'w'), b('fout', 'f2')]);
    expect(groepen.map((x) => x.titel)).toEqual(['Moet opgelost', 'Kijk dit na', 'Ter info']);
    expect(groepen[0].items.map((x) => x.bericht)).toEqual(['f1', 'f2']);
    expect(groepeerBevindingen([b('info', 'i')]).map((x) => x.ernst)).toEqual(['info']);
    expect(groepeerBevindingen([])).toEqual([]);
  });

  it('telt fouten van poort en doelproblemen samen', () => {
    const ontwerp = saneerOntwerp(bouwOntwerp({ keuze: KEUZE, bron: { methode: 'tekst' }, goals: zoekDoelen(TEKST).goals, setIds: [], ingelezenOp: 1 })) as Curriculum;
    const rapport = controleerLeerplan(ontwerp, { bronTekst: 'iets heel anders', sets: [] });
    const alle = alleBevindingen(rapport, [b('fout', 'zelf')]);
    expect(alle[0].bericht).toBe('zelf');
    // de fouten van de poort plus de eigen doelfout (het aantal van de poort hangt van haar regels af)
    expect(aantalFouten(alle)).toBe(rapport.bevindingen.filter((x) => x.ernst === 'fout').length + 1);
    expect(aantalFouten(alle)).toBeGreaterThan(1);
    expect(alleBevindingen(undefined, [])).toEqual([]);
  });

  it('schrijft het aantal punten goed', () => {
    expect(puntenTekst(1)).toBe('Los eerst 1 punt op dat moet opgelost worden.');
    expect(puntenTekst(2)).toBe('Los eerst 2 punten op die moeten opgelost worden.');
  });

  const klaar = { heeftOntwerp: true, heeftBron: true, rapportFris: true, fouten: 0, naam: 'Dries', vergeleken: true };

  it('bevestigen kan als alles in orde is', () => {
    expect(redenenGeenBevestiging(klaar)).toEqual([]);
  });

  it('zegt precies waarom bevestigen niet kan, in de volgorde van oplossen', () => {
    expect(redenenGeenBevestiging({ ...klaar, fouten: 2 })).toEqual(['Los eerst 2 punten op die moeten opgelost worden.']);
    expect(redenenGeenBevestiging({ ...klaar, naam: '  ' })).toEqual(['Vul je naam in.']);
    expect(redenenGeenBevestiging({ ...klaar, vergeleken: false })).toEqual(['Vink aan dat je elk doel met de bron hebt vergeleken.']);
    expect(redenenGeenBevestiging({ ...klaar, heeftBron: false })[0]).toMatch(/geen bron/);
    expect(redenenGeenBevestiging({ ...klaar, rapportFris: false, fouten: 3 })).toEqual(['Het nakijken loopt nog. Wacht even tot de samenvatting klaar is.']);
    expect(redenenGeenBevestiging({ ...klaar, heeftOntwerp: false })).toEqual(['Er zijn geen doelen om na te kijken.']);
    expect(redenenGeenBevestiging({ ...klaar, fouten: 1, naam: '', vergeleken: false })).toHaveLength(3);
  });
});

describe('de naam van de nakijker onthouden', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bewaart en leest de naam, getrimd', () => {
    const opslag = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => void opslag.set(k, v) });
    expect(leesNakijkerNaam()).toBe('');
    bewaarNakijkerNaam('  An Peeters ');
    expect(opslag.get('wf.nakijker.naam')).toBe('An Peeters');
    expect(leesNakijkerNaam()).toBe('An Peeters');
  });

  it('werkt zonder localStorage of als die weigert', () => {
    expect(leesNakijkerNaam()).toBe(''); // node: geen localStorage
    expect(() => bewaarNakijkerNaam('An')).not.toThrow();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); } });
    expect(leesNakijkerNaam()).toBe('');
    expect(() => bewaarNakijkerNaam('An')).not.toThrow();
  });
});
