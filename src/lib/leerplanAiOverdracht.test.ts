import { describe, expect, it } from 'vitest';
import { AI_NIEUW_ROUTE, AI_VOORINVULLING_SLEUTEL, leesAiVoorinvulling, maakAiVoorinvulling } from './leerplanAiOverdracht';

const KEUZE = { net: 'kov', vak: ' Aardrijkskunde ', graad: '1ste graad', stroom: 'A-stroom', titel: ' Aardrijkskunde 1ste graad A-stroom (KOV) ' } as const;

describe('de overgang van de wizard naar het AI-venster', () => {
  it('geeft de tekst en de keuzes uit stap 1 mee', () => {
    const v = maakAiVoorinvulling(KEUZE, { tekst: 'LPD 1 De leerlingen lezen.', bronNaam: 'leerplan.pdf' });
    expect(v).toEqual({
      text: 'LPD 1 De leerlingen lezen.',
      title: 'Aardrijkskunde 1ste graad A-stroom (KOV)',
      net: 'kov',
      subject: 'Aardrijkskunde',
      level: '1ste graad A-stroom',
      source: 'leerplan.pdf',
    });
  });

  it('een leerplan zonder net wordt "eigen", en zonder bron blijft de tekst leeg', () => {
    const v = maakAiVoorinvulling({ ...KEUZE, net: '', graad: '', stroom: '' }, null);
    expect(v).toMatchObject({ net: 'eigen', text: '', level: '', source: '' });
  });

  it('gaat heen en weer via de routerstate', () => {
    const v = maakAiVoorinvulling(KEUZE, { tekst: 'tekst' });
    expect(leesAiVoorinvulling({ [AI_VOORINVULLING_SLEUTEL]: v })).toEqual(v);
    expect(AI_NIEUW_ROUTE).toBe('/leerplannen?ai=nieuw');
  });

  it('leest defensief: rommel, een onbekend net en een lege voorinvulling geven niets of een veilige waarde', () => {
    for (const state of [null, undefined, 'tekst', 5, {}, { aiVoorinvulling: null }, { aiVoorinvulling: 'x' }, { aiVoorinvulling: { text: '  ' } }]) {
      expect(leesAiVoorinvulling(state), String(state)).toBeUndefined();
    }
    const rommel = leesAiVoorinvulling({ aiVoorinvulling: { text: 'ok', net: 'bestaat-niet', title: 5, subject: {}, level: [], source: null } });
    expect(rommel).toEqual({ text: 'ok', title: '', net: 'eigen', subject: '', level: '', source: '' });
  });
});
