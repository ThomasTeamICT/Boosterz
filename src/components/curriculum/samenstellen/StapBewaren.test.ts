import { describe, expect, it } from 'vitest';
import { nietBevestigdTekst } from './StapBewaren';

describe('nietBevestigdTekst: de zin na "zie de melding hierboven"', () => {
  it('zonder studierichting blijft de tekst letterlijk zoals ze was', () => {
    expect(nietBevestigdTekst(false)).toBe('Je kan ze wel bewaren; ze krijgt dan het label ‘niet nagekeken’. Pas je keuze aan om dat op te lossen.');
  });

  it('met een studierichting staat er één zin: oplossen om te kunnen bewaren, zonder tweede advies', () => {
    expect(nietBevestigdTekst(true)).toBe('Los dit op om de lijst te kunnen bewaren.');
  });

  it('met een studierichting staat er niet dat ze toch bewaard kan worden en niet nogmaals "pas je keuze aan"', () => {
    const tekst = nietBevestigdTekst(true);
    expect(tekst).not.toMatch(/kan ze wel bewaren|niet nagekeken|Pas je keuze aan/);
    expect(tekst.match(/\./g)).toHaveLength(1);
  });
});
