import { describe, expect, it } from 'vitest';
import { VOORLEES_TAAL, kiesStem } from './voorlezen';

describe('voorlezen: de stem kiezen', () => {
  it('kiest eerst een stem nl-BE, ook als er een nl-NL voor staat', () => {
    const stemmen = [{ lang: 'en-US' }, { lang: 'nl-NL' }, { lang: 'nl-BE' }];
    expect(kiesStem(stemmen)).toBe(stemmen[2]);
    expect(kiesStem([{ lang: 'nl_BE' }])).toEqual({ lang: 'nl_BE' });
    expect(kiesStem([{ lang: 'NL-be' }])).toEqual({ lang: 'NL-be' });
  });

  it('valt terug op nl, en dan op niets', () => {
    const stemmen = [{ lang: 'fr-BE' }, { lang: 'nl' }];
    expect(kiesStem(stemmen)).toBe(stemmen[1]);
    expect(kiesStem([{ lang: 'nl-NL' }])).toEqual({ lang: 'nl-NL' });
    expect(kiesStem([{ lang: 'en-GB' }, { lang: 'fr-BE' }, { lang: 'nld-X' }])).toBeNull();
    expect(kiesStem([])).toBeNull();
  });

  it('leest voor in het Vlaams', () => {
    expect(VOORLEES_TAAL).toBe('nl-BE');
  });
});
