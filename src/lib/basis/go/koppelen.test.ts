import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../minimumdoelen';
import { controleerTweelingen, koppel, maakOpzoektabel, vakVanCode } from './koppelen';

// ── Een kleine index met echte setkoppen (de namen bepalen basisSet) en verzonnen, korte setbestanden ──
const kop = (id: string, naam: string, korteNaam: string, leerjaar?: string): MinimumdoelenIndexSet => ({
  id,
  naam,
  korteNaam,
  versie: '2.0',
  geldigheid: 'Geldig',
  geldigVan: '2025-09-01',
  ...(leerjaar ? { leerjaar } : {}),
  aantal: 3,
  sha256: 'a'.repeat(64),
  opgehaald: '2026-11-01T15:05:28Z',
  bestand: `${id}.json`,
});

const INDEX: MinimumdoelenIndexSet[] = [
  kop('ODS_3410', 'Kleuteronderwijs -  Wetenschap en techniek - Na te streven minimumdoelen op populatieniveau', 'Wetenschap en techniek'),
  kop('ODS_3409', 'Lager Onderwijs 6de leerjaar -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau', 'Wetenschap en techniek', '6de leerjaar'),
  kop('ODS_3404', 'Kleuteronderwijs -  Wiskunde - Te bereiken minimumdoelen op populatieniveau', 'Wiskunde'),
  kop('ODS_3405', 'Kleuteronderwijs -  Wiskunde - Na te streven minimumdoelen op populatieniveau', 'Wiskunde'),
  kop('ODS_3411', 'Kleuteronderwijs -  Aardrijkskunde - Na te streven minimumdoelen op populatieniveau', 'Aardrijkskunde'),
  kop('ODS_3460', 'Buitengewoon Kleuteronderwijs -  Wetenschap en techniek - Na te streven minimumdoelen op populatieniveau', 'Wetenschap en techniek'),
];

const set = (id: string, doelen: [string, string][]): MinimumdoelenSetBestand => ({
  app: 'boosterz',
  kind: 'minimumdoelen',
  v: 1,
  set: { id, naam: id, sleutelcompetenties: [], bron: '', api: '', naamsvermelding: '', licentie: '', opgehaald: '', aantal: doelen.length, sha256: '' },
  doelen: doelen.map(([nr, code]) => ({ id: nr, code, tekst: `<p>Doel ${code}</p>` })),
});

function bestanden(over: Partial<Record<string, MinimumdoelenSetBestand | undefined>> = {}): Record<string, MinimumdoelenSetBestand | undefined> {
  return {
    ODS_3410: set('ODS_3410', [
      ['92590', '3.1.2'],
      ['92929', '3.1.3'],
      ['93034', '3.1.4'],
    ]),
    ODS_3409: set('ODS_3409', [['92822', '3.3.2']]),
    ODS_3404: set('ODS_3404', [['93000', '2.1.1']]),
    ODS_3405: set('ODS_3405', [['93001', '2.1.2']]),
    ODS_3411: set('ODS_3411', [['92500', '4.2.3']]),
    // De tweeling in het buitengewoon onderwijs: zelfde nummers en codes.
    ODS_3460: set('ODS_3460', [
      ['92590', '3.1.2'],
      ['92929', '3.1.3'],
      ['93034', '3.1.4'],
    ]),
    ...over,
  };
}

const tabelVan = (over: Partial<Record<string, MinimumdoelenSetBestand | undefined>> = {}) => {
  const b = bestanden(over);
  return maakOpzoektabel(INDEX, (s) => b[s.id]);
};

describe('vakVanCode', () => {
  it('geeft het eerste getal van een code cijfer.cijfer.cijfer', () => {
    expect(vakVanCode('3.1.2')).toBe(3);
    expect(vakVanCode('10.6.1')).toBe(10);
  });
  it('geeft niets bij een code van een andere vorm', () => {
    expect(vakVanCode('6.12')).toBeUndefined();
    expect(vakVanCode('TE BEREIKEN')).toBeUndefined();
    expect(vakVanCode('3.1.2 ')).toBeUndefined();
  });
});

describe('maakOpzoektabel', () => {
  it('vindt een doel op moment + code, in de gewone set van dat vak en eindmoment', () => {
    const { tabel, meldingen } = tabelVan();
    expect(meldingen).toEqual([]);
    expect(tabel.zoek('KO', '3.1.2')).toEqual([{ set: 'ODS_3410', id: '92590', code: '3.1.2' }]);
    expect(tabel.zoek('L6', '3.3.2')).toEqual([{ set: 'ODS_3409', id: '92822', code: '3.3.2' }]);
  });

  it('zoekt nooit in het buitengewoon onderwijs: de tweeling heeft hetzelfde nummer, er komt geen tweede kandidaat', () => {
    const { tabel } = tabelVan();
    expect(tabel.zoek('KO', '3.1.3')).toHaveLength(1);
    expect(tabel.alle().some((k) => k.set === 'ODS_3460')).toBe(false);
  });

  it('dezelfde code op een ander moment is een ander doel (of geen)', () => {
    const { tabel } = tabelVan();
    expect(tabel.zoek('L4', '3.1.2')).toEqual([]);
    expect(tabel.zoek('L6', '3.1.2')).toEqual([]);
  });

  it('kleuter wiskunde: twee sets samen', () => {
    const { tabel } = tabelVan();
    expect(tabel.zoek('KO', '2.1.1')[0].set).toBe('ODS_3404');
    expect(tabel.zoek('KO', '2.1.2')[0].set).toBe('ODS_3405');
    expect(tabel.sets().find((s) => s.vak === 2 && s.eind === 'K3')?.sets).toEqual(['ODS_3404', 'ODS_3405']);
  });

  it('een ontbrekend setbestand is een melding, geen stille fout', () => {
    const { meldingen } = tabelVan({ ODS_3409: undefined });
    expect(meldingen).toEqual(['Het bestand van ODS_3409 ontbreekt.']);
  });

  it('een code van een ander vak in een set wordt gemeld en niet opgenomen', () => {
    const { tabel, meldingen } = tabelVan({ ODS_3409: set('ODS_3409', [['1', '2.1.1']]) });
    expect(meldingen[0]).toMatch(/hoort niet bij vak 3/);
    expect(tabel.zoek('L6', '2.1.1')).toEqual([]);
  });

  it('geeft de tweelingen in het buitengewoon onderwijs', () => {
    const { tabel } = tabelVan();
    const t = tabel.tweelingen('ODS_3410');
    expect(t.map((x) => x.set)).toEqual(['ODS_3460']);
    expect(t[0].doelen.get('92929')).toBe('3.1.3');
  });
});

describe('koppel', () => {
  const { tabel } = tabelVan();

  it('één code, één doel: een officiële koppeling op set + vast nummer', () => {
    const u = koppel({ KO: '3.1.3, 3.1.4' }, ['2,5-4', '4-5'], tabel);
    expect(u.koppeling).toEqual({
      bron: { KO: '3.1.3, 3.1.4' },
      refs: [
        { set: 'ODS_3410', id: '92929', code: '3.1.3', moment: 'KO', status: 'officieel' },
        { set: 'ODS_3410', id: '93034', code: '3.1.4', moment: 'KO', status: 'officieel' },
      ],
      problemen: [],
    });
    expect(u.dubbelzinnig).toEqual([]);
  });

  it('een moment dat niet bij de leeftijden past: officieel, met twijfel (nooit verbeterd)', () => {
    // WT.235 (2,5-4 tot 9-10 jaar) → L6 3.3.2: geen leeftijd werkt naar het einde van het 6de leerjaar.
    const u = koppel({ L6: '3.3.2' }, ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10'], tabel);
    expect(u.koppeling.refs).toEqual([{ set: 'ODS_3409', id: '92822', code: '3.3.2', moment: 'L6', status: 'officieel', twijfel: ['moment-buiten-leeftijden'] }]);
  });

  it('een code die niet de vorm cijfer.cijfer.cijfer heeft: probleem onleesbaar, geen koppeling', () => {
    const u = koppel({ KO: '3.1.2, 3.12' }, ['2,5-4'], tabel);
    expect(u.koppeling.refs.map((r) => r.code)).toEqual(['3.1.2']);
    expect(u.koppeling.problemen).toEqual([{ moment: 'KO', bronCode: '3.12', reden: 'onleesbaar' }]);
  });

  it('een geldige code zonder doel: probleem bestaat-niet', () => {
    const u = koppel({ KO: '3.9.9' }, ['2,5-4'], tabel);
    expect(u.koppeling.refs).toEqual([]);
    expect(u.koppeling.problemen).toEqual([{ moment: 'KO', bronCode: '3.9.9', reden: 'bestaat-niet' }]);
  });

  it('een voorstel alleen voor een kapotte code, met de letterlijke bronCode, en het probleem blijft staan', () => {
    const u = koppel({ KO: '3.1.2, 3.13' }, ['2,5-4'], tabel, { voorstel: (m, c) => (m === 'KO' && c === '3.13' ? '3.1.3' : undefined) });
    expect(u.koppeling.problemen).toEqual([{ moment: 'KO', bronCode: '3.13', reden: 'onleesbaar' }]);
    expect(u.koppeling.refs[1]).toEqual({ set: 'ODS_3410', id: '92929', code: '3.1.3', moment: 'KO', status: 'voorstel', bronCode: '3.13' });
  });

  it('een voorstel wordt nooit gevraagd voor een code die een doel vindt', () => {
    let gevraagd = 0;
    koppel({ KO: '3.1.2' }, ['2,5-4'], tabel, {
      voorstel: () => {
        gevraagd++;
        return '3.1.3';
      },
    });
    expect(gevraagd).toBe(0);
  });

  it('een voorstel dat zelf geen doel vindt, wordt gemeld en niet gekoppeld', () => {
    const u = koppel({ KO: '3.13' }, ['2,5-4'], tabel, { voorstel: () => '3.9.9' });
    expect(u.koppeling.refs).toEqual([]);
    expect(u.voorstelZonderDoel).toEqual([{ moment: 'KO', bronCode: '3.13', voorstel: '3.9.9' }]);
  });

  it('een voorstel naar een doel dat al gekoppeld is, wordt gemeld (geen dubbel minimumdoel)', () => {
    const u = koppel({ KO: '3.1.3, 3.13' }, ['2,5-4'], tabel, { voorstel: () => '3.1.3' });
    expect(u.koppeling.refs).toHaveLength(1);
    expect(u.dubbel).toEqual([{ moment: 'KO', code: '3.1.3' }]);
  });

  it('dezelfde code twee keer in een kolom: één keer gekoppeld, de tweede gemeld', () => {
    const u = koppel({ KO: '3.1.2, 3.1.2' }, ['2,5-4'], tabel);
    expect(u.koppeling.refs).toHaveLength(1);
    expect(u.dubbel).toEqual([{ moment: 'KO', code: '3.1.2' }]);
  });

  it('een code die twee doelen vindt, is dubbelzinnig en wordt niet gekoppeld', () => {
    const t = tabelVan({ ODS_3405: set('ODS_3405', [['93002', '2.1.1']]) }).tabel;
    const u = koppel({ KO: '2.1.1' }, ['2,5-4'], t);
    expect(u.koppeling.refs).toEqual([]);
    expect(u.dubbelzinnig).toHaveLength(1);
    expect(u.dubbelzinnig[0].kandidaten.map((k) => k.set)).toEqual(['ODS_3404', 'ODS_3405']);
  });

  it('een kolom met alleen witruimte telt niet als bron', () => {
    const u = koppel({ KO: ' ', L6: '3.3.2' }, ['10-11'], tabel);
    expect(u.koppeling.bron).toEqual({ L6: '3.3.2' });
  });

  it('extra twijfels (ander vak) staan in de vaste volgorde, na moment-buiten-leeftijden', () => {
    const u = koppel({ KO: '4.2.3' }, ['10-11'], tabel, { twijfel: (m, c) => (c === '4.2.3' ? ['ander-vak'] : []) });
    expect(u.koppeling.refs[0].twijfel).toEqual(['moment-buiten-leeftijden', 'ander-vak']);
  });

  it('de momenten in vaste volgorde KO, L4, L6, ook als de bron anders geordend is', () => {
    const u = koppel({ L6: '3.3.2', KO: '3.1.2' }, ['2,5-4', '11-12'], tabel);
    expect(u.koppeling.refs.map((r) => r.moment)).toEqual(['KO', 'L6']);
  });
});

describe('controleerTweelingen', () => {
  it('geen melding als de tweeling hetzelfde nummer en dezelfde code heeft', () => {
    const { tabel } = tabelVan();
    const refs = koppel({ KO: '3.1.2, 3.1.3' }, ['2,5-4'], tabel).koppeling.refs;
    expect(controleerTweelingen(refs, tabel)).toEqual([]);
  });

  it('meldt een tweeling zonder dat nummer, of met een andere code', () => {
    const { tabel } = tabelVan({
      ODS_3460: set('ODS_3460', [
        ['92590', '3.1.9'],
        ['93034', '3.1.4'],
      ]),
    });
    const refs = koppel({ KO: '3.1.2, 3.1.3' }, ['2,5-4'], tabel).koppeling.refs;
    const m = controleerTweelingen(refs, tabel);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatch(/code 3\.1\.2, de tweeling in ODS_3460 code 3\.1\.9/);
    expect(m[1]).toMatch(/92929.*geen tweeling/);
  });
});
