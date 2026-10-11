// De zinnen van het tweede blok van "Wat je cursussen samen dekken" die een getal of een naam bevatten, met enkelvoud en
// meervoud (docs/STUDIERICHTINGEN.md § 23.7.4). Ze horen bij de andere zinnen in `lib/bkWeergave.ts` (I3 verhuist ze); tot dan
// staan ze met hun test hier, zodat een wijziging aan de tekst niet ongemerkt blijft.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BK_ZONDER_BESTAND } from '../../../lib/bkWeergave';
import { ZonderBestandRegel, nogNietGedektZin } from './BkDekking';

describe('nogNietGedektZin', () => {
  it('meervoud: het aantal competenties en het aantal beroepskwalificaties, en wat er te doen valt', () => {
    expect(nogNietGedektZin(20, 2)).toBe('20 competenties in 2 beroepskwalificaties zijn nog niet gedekt. Open een beroepskwalificatie om ze te zien.');
    expect(nogNietGedektZin(11, 3)).toBe('11 competenties in 3 beroepskwalificaties zijn nog niet gedekt. Open een beroepskwalificatie om ze te zien.');
  });

  it('één beroepskwalificatie: ze is "de" beroepskwalificatie', () => {
    expect(nogNietGedektZin(5, 1)).toBe('5 competenties in 1 beroepskwalificatie zijn nog niet gedekt. Open de beroepskwalificatie om ze te zien.');
  });

  it('één competentie: enkelvoud', () => {
    expect(nogNietGedektZin(1, 1)).toBe('1 competentie in 1 beroepskwalificatie is nog niet gedekt. Open de beroepskwalificatie om ze te zien.');
    expect(nogNietGedektZin(1, 2)).toBe('1 competentie in 2 beroepskwalificaties is nog niet gedekt. Open een beroepskwalificatie om ze te zien.');
  });

  it('niets meer open: alles is gedekt (ook bij rare aantallen)', () => {
    expect(nogNietGedektZin(0, 0)).toBe('Alle competenties zijn gedekt.');
    expect(nogNietGedektZin(0, 2)).toBe('Alle competenties zijn gedekt.');
    expect(nogNietGedektZin(-1, 1)).toBe('Alle competenties zijn gedekt.');
  });

  it('bevat nooit een competentiecode of een BK-nummer', () => {
    for (const [c, b] of [[20, 2], [1, 1], [5, 1], [0, 0]] as const) expect(nogNietGedektZin(c, b)).not.toMatch(/BK-\d|bkc\d|ADV-/);
  });
});

describe('ZonderBestandRegel: een beroepskwalificatie waarvan de competenties nog niet in Boosterz staan', () => {
  const toon = (titel: string) => renderToStaticMarkup(createElement(ZonderBestandRegel, { titel }));

  it('de titel in het vet, een punt en de uitleg', () => {
    expect(toon('Onthaalmedewerker')).toBe(`<p class="dk-uitleg"><strong>Onthaalmedewerker</strong>. ${BK_ZONDER_BESTAND}</p>`);
  });

  it('een punt of spaties achteraan de titel geven geen dubbele punt', () => {
    expect(toon('Recreatief medewerker.')).toBe(`<p class="dk-uitleg"><strong>Recreatief medewerker</strong>. ${BK_ZONDER_BESTAND}</p>`);
    expect(toon('  Baliemedewerker . ')).toBe(`<p class="dk-uitleg"><strong>Baliemedewerker</strong>. ${BK_ZONDER_BESTAND}</p>`);
  });

  it('een lege of kapotte titel valt weg met haar punt: alleen de uitleg blijft', () => {
    expect(toon('')).toBe(`<p class="dk-uitleg">${BK_ZONDER_BESTAND}</p>`);
    expect(toon('  .  ')).toBe(`<p class="dk-uitleg">${BK_ZONDER_BESTAND}</p>`);
    expect(renderToStaticMarkup(createElement(ZonderBestandRegel, { titel: undefined as unknown as string }))).toBe(`<p class="dk-uitleg">${BK_ZONDER_BESTAND}</p>`);
  });
});
