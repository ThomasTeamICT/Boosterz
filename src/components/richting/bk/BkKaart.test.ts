// De laad- en foutstand van een kaart in de sectie "Beroepskwalificaties" (docs/STUDIERICHTINGEN.md § 23.7.2): elke kaart
// spreekt over zichzelf, meldt haar laden niet als status, en zegt bij "Opnieuw proberen" over welke beroepskwalificatie het gaat.
// De kaarten worden als tekst gerenderd (zonder browser), zoals de andere schermtests hier.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FOUT_BK, FOUT_BK_BESCHADIGD } from '../../../lib/beroepskwalificatiesBron';
import { BK_LADEN, bkKaartFout, bkKaartLaden } from '../../../lib/bkWeergave';
import type { RichtingBkRegel } from '../../../lib/richtingBk';
import { BK_KAARTEN_LADEN, BkKaart, KaartenLaadStatus, kaartLaadt, kaartZonderBestand, type BestandStand } from './BkKaart';

const regel = (bk: string, titel: string): RichtingBkRegel => ({ bk, nummer: bk.slice(0, 7), versie: 1, titel, onderdelen: [1], alleOnderdelen: true });

const toon = (r: RichtingBkRegel, stand: BestandStand | undefined): string =>
  renderToStaticMarkup(
    createElement(BkKaart, {
      regel: r,
      stand,
      alleenIn: [],
      bestaand: undefined,
      kanBewaren: true,
      bezig: false,
      fout: null,
      focusOpen: false,
      onFocusKlaar: () => {},
      onCursus: () => {},
      onBewaar: () => {},
      onOpnieuw: () => {},
    }),
  );

const ONTHAAL = regel('BK-0390-2', 'Onthaalmedewerker');
const RECREATIEF = regel('BK-0464-1', 'Recreatief medewerker');

describe('BkKaart: de laadstand', () => {
  it('toont de laadregel van deze kaart, met haar naam, en niet de algemene zin van de sectie', () => {
    const html = toon(ONTHAAL, { status: 'laden' });
    expect(html).toContain(bkKaartLaden('Onthaalmedewerker'));
    expect(html).not.toContain(BK_LADEN);
  });

  it('de laadregel is geen statusregio: N kaarten zouden N identieke regio\'s zetten', () => {
    for (const stand of [undefined, { status: 'laden' } as const]) {
      const html = toon(ONTHAAL, stand);
      expect(html).toContain(bkKaartLaden('Onthaalmedewerker'));
      expect(html).not.toContain('role="status"');
    }
  });

  it('twee kaarten tonen twee verschillende laadregels', () => {
    const een = toon(ONTHAAL, { status: 'laden' });
    const twee = toon(RECREATIEF, { status: 'laden' });
    expect(een).toContain('‘Onthaalmedewerker’');
    expect(twee).toContain('‘Recreatief medewerker’');
    expect(een).not.toContain('Recreatief');
  });
});

describe('BkKaart: de foutstand', () => {
  it('toont de foutmelding van deze kaart en niet de zin van de sectie over "de beroepskwalificaties"', () => {
    const html = toon(ONTHAAL, { status: 'fout', fout: FOUT_BK });
    expect(html).toContain('role="alert"');
    expect(html).toContain(bkKaartFout('Onthaalmedewerker'));
    expect(html).not.toContain(FOUT_BK);
  });

  it('bij beschadigde gegevens zegt de zin dat ze beschadigd zijn, in plaats van "controleer je verbinding"', () => {
    const html = toon(ONTHAAL, { status: 'fout', fout: FOUT_BK_BESCHADIGD });
    expect(html).toContain(bkKaartFout('Onthaalmedewerker', true));
    expect(html).not.toContain('Controleer je verbinding');
  });

  it('de knop "Opnieuw proberen" heeft de naam van de beroepskwalificatie voor een schermlezer', () => {
    const html = toon(ONTHAAL, { status: 'fout', fout: FOUT_BK });
    expect(html).toContain('Opnieuw proberen<span class="sr-only"> (Onthaalmedewerker)</span></button>');
    expect(toon(RECREATIEF, { status: 'fout', fout: FOUT_BK })).toContain('Opnieuw proberen<span class="sr-only"> (Recreatief medewerker)</span></button>');
  });

  it('een kaart zonder fout toont geen foutmelding en geen knop "Opnieuw proberen"', () => {
    expect(toon(ONTHAAL, { status: 'klaar', waarde: null })).not.toContain('Opnieuw proberen');
    expect(toon(ONTHAAL, { status: 'laden' })).not.toContain('role="alert"');
  });
});

describe('kaartLaadt en kaartZonderBestand: één definitie voor de kaart en de sectie', () => {
  const zonder: RichtingBkRegel = { ...ONTHAAL, zonderBestand: true };
  const alleStanden: [string, BestandStand | undefined][] = [
    ['geen stand (het laden is nog niet begonnen)', undefined],
    ['laden', { status: 'laden' }],
    ['fout', { status: 'fout', fout: FOUT_BK }],
    ['klaar met een bestand', { status: 'klaar', waarde: {} as never }],
    ['klaar zonder bestand (404)', { status: 'klaar', waarde: null }],
  ];

  it('laadt nog bij geen stand en bij laden, en bij niets anders', () => {
    expect(alleStanden.map(([, stand]) => kaartLaadt(ONTHAAL, stand))).toEqual([true, true, false, false, false]);
  });

  it('een kaart zonder bestand in de index laadt nooit, wat de stand ook is', () => {
    expect(alleStanden.every(([, stand]) => !kaartLaadt(zonder, stand))).toBe(true);
    expect(alleStanden.every(([, stand]) => kaartZonderBestand(zonder, stand))).toBe(true);
  });

  it('een bestand dat niet bestaat (klaar met null) telt als zonder bestand, een fout niet', () => {
    expect(kaartZonderBestand(ONTHAAL, { status: 'klaar', waarde: null })).toBe(true);
    expect(kaartZonderBestand(ONTHAAL, { status: 'fout', fout: FOUT_BK })).toBe(false);
    expect(kaartZonderBestand(ONTHAAL, undefined)).toBe(false);
  });

  it('de kaart toont haar laadregel precies als kaartLaadt zegt dat ze laadt', () => {
    for (const [naam, stand] of alleStanden) {
      if (stand?.status === 'klaar' && stand.waarde !== null) continue; // het bestand is niet echt, de kaart rendert dan competenties
      expect([naam, toon(ONTHAAL, stand).includes(bkKaartLaden('Onthaalmedewerker'))]).toEqual([naam, kaartLaadt(ONTHAAL, stand)]);
    }
  });
});

describe('KaartenLaadStatus: één statusregio voor het laden van alle kaarten', () => {
  const regio = (laden: boolean) => renderToStaticMarkup(createElement(KaartenLaadStatus, { laden }));

  it('zolang er een kaart laadt, is er een statusregio met de zin', () => {
    const html = regio(true);
    expect(html).toContain('role="status"');
    expect(html).toContain(BK_KAARTEN_LADEN);
    expect(BK_KAARTEN_LADEN).toBe('De competenties worden geladen…');
  });

  it('daarna blijft de regio er, leeg: de tekst verschijnt en verdwijnt in een bestaande regio', () => {
    const html = regio(false);
    expect(html).toContain('role="status"');
    expect(html).not.toContain(BK_KAARTEN_LADEN);
    expect(html).toMatch(/<div[^>]*role="status"[^>]*><\/div>/);
  });

  it('de zin is alleen voor een schermlezer: de laadregels op de kaarten zijn het zichtbare deel', () => {
    expect(regio(true)).toContain('class="sr-only"');
  });

  it('twee laadkaarten en de regio samen: precies één role="status" in de hele sectie', () => {
    const sectie = [regio(true), toon(ONTHAAL, { status: 'laden' }), toon(RECREATIEF, undefined)].join('');
    expect(sectie.match(/role="status"/g)).toHaveLength(1);
    // Elke kaart noemt zichzelf, de regio de hele sectie.
    expect(sectie).toContain(bkKaartLaden('Onthaalmedewerker'));
    expect(sectie).toContain(bkKaartLaden('Recreatief medewerker'));
    expect(sectie).toContain(BK_KAARTEN_LADEN);
  });

  it('de zin klopt voor meer kaarten en noemt geen groepnummer, set-id of vakterm', () => {
    expect(BK_KAARTEN_LADEN).not.toMatch(/G-0|ODS_|ADV|structuuronderdeel|widget/i);
  });
});
