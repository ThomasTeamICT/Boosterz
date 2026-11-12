import { describe, expect, it } from 'vitest';
import {
  LEGE_STAND,
  eersteTeltVoor,
  leesStand,
  maakGeheugenOntvanger,
  maakLegeOntvanger,
  nieuweMeldingen,
  serialiseerStand,
  voegBewijsToe,
  type BewijsMelding,
  type BewijsStand,
} from './bewijsOntvanger';

const m = (id: string, juist: boolean, fout: string | null = null): BewijsMelding => ({ id, juist, fout });

describe('de aansluiting voor bewijs', () => {
  it('de lege ontvanger neemt alles aan en onthoudt niets', () => {
    const o = maakLegeOntvanger();
    expect(() => o.geef(m('4c1', true))).not.toThrow();
    expect(o.stand).toBeUndefined();
  });

  it('een checkvraag telt de eerste keer, een oefening de laatste keer (volgens het manifest)', () => {
    const eerste = eersteTeltVoor();
    expect(['4c1', '4c2', '4c3'].every(eerste)).toBe(true);
    expect(['4-voorspel', '4-kaartjes', '4-meten', '4-besluit'].some(eerste)).toBe(false);
    expect(eerste('bestaat-niet')).toBe(false);
  });

  it('de geheugenontvanger: het eerste antwoord van de check blijft, het laatste van een oefening telt', () => {
    const o = maakGeheugenOntvanger();
    o.geef(m('4c1', false, 'schaduw aan de kant van de lamp'));
    o.geef(m('4c1', true));
    o.geef(m('4-meten', false, 'leest de meetlat niet nauwkeurig af'));
    o.geef(m('4-meten', true));
    expect(o.stand()).toEqual({
      '4c1': { juist: false, fout: 'schaduw aan de kant van de lamp' },
      '4-meten': { juist: true, fout: null },
    });
  });

  it('meldt een wijziging alleen als de stand echt verandert', () => {
    const standen: BewijsStand[] = [];
    const o = maakGeheugenOntvanger({ opWijziging: (s) => standen.push(s) });
    o.geef(m('4c1', true));
    o.geef(m('4c1', false));
    o.geef(m('4-meten', true));
    o.geef(m('4-meten', true));
    o.geef(m('4-meten', false, 'x'));
    expect(standen).toHaveLength(3);
  });

  it('begint met een gegeven stand (na het herladen)', () => {
    const o = maakGeheugenOntvanger({ begin: { '4c1': { juist: true, fout: null } } });
    o.geef(m('4c1', false, 'x'));
    expect(o.stand()['4c1']).toEqual({ juist: true, fout: null });
  });

  it('voegBewijsToe geeft dezelfde stand terug als er niets verandert', () => {
    const s = voegBewijsToe(LEGE_STAND, m('4-meten', true), false);
    expect(voegBewijsToe(s, m('4-meten', true), false)).toBe(s);
    expect(voegBewijsToe(s, m('4-meten', false, 'x'), true)).toBe(s);
    expect(voegBewijsToe(s, m('4-meten', false, 'x'), false)).not.toBe(s);
  });
});

describe('de tekst voor de sessionStorage', () => {
  it('schrijft en leest een stand terug', () => {
    const stand: BewijsStand = { '4c1': { juist: true, fout: null }, '4-meten': { juist: false, fout: 'leest de meetlat niet nauwkeurig af' } };
    expect(leesStand(serialiseerStand(stand))).toEqual(stand);
    expect(leesStand(serialiseerStand(LEGE_STAND))).toEqual({});
  });

  it('kapotte of vreemde inhoud geeft een lege stand, geen fout', () => {
    const slecht: unknown[] = [
      null,
      undefined,
      42,
      {},
      '',
      'geen json',
      '{"v":1,"b":',
      'null',
      '[]',
      '"tekst"',
      '{"v":2,"b":{"4c1":{"j":true,"f":null}}}',
      '{"v":1}',
      '{"v":1,"b":[]}',
      '{"v":1,"b":null}',
      '{"v":1,"b":{"4c1":"juist"}}',
      '{"v":1,"b":{"4c1":{"j":"ja","f":null}}}',
      '{"v":1,"b":{"4c1":{"j":true,"f":5}}}',
      '{"v":1,"b":{"bestaat-niet":{"j":true,"f":null}}}',
      '{"v":1,"b":{"__proto__":{"j":true,"f":null}}}',
      'x'.repeat(5000),
      `{"v":1,"b":{"4c1":{"j":true,"f":"${'x'.repeat(500)}"}}}`,
    ];
    for (const t of slecht) {
      expect(() => leesStand(t), String(t)).not.toThrow();
      expect(leesStand(t), String(t)).toEqual({});
    }
  });

  it('een kapot item valt weg, de rest blijft', () => {
    const t = '{"v":1,"b":{"4c1":{"j":true,"f":null},"4c2":{"j":1,"f":null},"vreemd":{"j":true,"f":null}}}';
    expect(leesStand(t)).toEqual({ '4c1': { juist: true, fout: null } });
  });

  it('een onbekend moment geeft een lege stand', () => {
    expect(leesStand(serialiseerStand({ '4c1': { juist: true, fout: null } }), 'bestaat-niet' as never)).toEqual({});
  });
});

describe('wat nog verstuurd moet worden', () => {
  it('geeft elke melding één keer, en opnieuw als ze verandert', () => {
    const a = nieuweMeldingen(new Map(), [m('4c1', true), m('4-meten', false, 'x')]);
    expect(a.nieuw).toHaveLength(2);
    const b = nieuweMeldingen(a.verzonden, [m('4c1', true), m('4-meten', false, 'x')]);
    expect(b.nieuw).toEqual([]);
    const c = nieuweMeldingen(b.verzonden, [m('4c1', true), m('4-meten', true)]);
    expect(c.nieuw).toEqual([m('4-meten', true)]);
  });

  it('wijzigt de meegegeven lijst niet', () => {
    const v = new Map<string, string>();
    nieuweMeldingen(v, [m('4c1', true)]);
    expect(v.size).toBe(0);
  });
});
