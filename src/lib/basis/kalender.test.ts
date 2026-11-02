import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRON_HOE_WAARDEN,
  INVOERINGSKALENDER,
  LEERJAREN_BASIS,
  WERKT_NAAR,
  celVoor,
  controleerKalender,
  eindeOudVoor,
  laatsteVanaf,
  nagelezenOp,
  schooljaarTekst,
  schooljaarVan,
  schooljaarVanDatum,
  type Golf,
  type Invoeringskalender,
  type LeerjaarBasis,
  type SoortBasis,
} from './kalender';

/** Een diepe, wijzigbare kopie van de kalender, om gebroken varianten te maken. */
type Wijzigbaar<T> = T extends readonly (infer U)[] ? Wijzigbaar<U>[] : T extends object ? { -readonly [K in keyof T]: Wijzigbaar<T[K]> } : T;
type Kopie = Wijzigbaar<Invoeringskalender>;
const kopie = (): Kopie => structuredClone(INVOERINGSKALENDER) as Kopie;
const cel = (k: Kopie, soort: SoortBasis, golf: Golf, lj: LeerjaarBasis) => {
  const c = k.cellen.find((x) => x.soort === soort && x.golf === golf && x.leerjaar === lj);
  if (!c) throw new Error(`cel ${soort} ${golf} ${lj} ontbreekt in de kopie`);
  return c;
};
const bron = (k: Kopie, id: string) => {
  const b = k.bronnen.find((x) => x.id === id);
  if (!b) throw new Error(`bron ${id} ontbreekt in de kopie`);
  return b;
};
const vak = (k: Kopie, nr: number) => {
  const v = k.vakken.find((x) => x.nr === nr);
  if (!v) throw new Error(`vak ${nr} ontbreekt in de kopie`);
  return v;
};
/** De fouten van een kalender die op één punt gebroken is. */
const gebroken = (wijzig: (k: Kopie) => void): string[] => {
  const k = kopie();
  wijzig(k);
  return controleerKalender(k);
};

const BRON = readFileSync(fileURLToPath(new URL('./kalender.ts', import.meta.url)), 'utf8');

describe('INVOERINGSKALENDER: de gegevens zelf', () => {
  it('geeft bij de controle geen enkele fout', () => {
    expect(controleerKalender(INVOERINGSKALENDER)).toEqual([]);
    expect(controleerKalender()).toEqual([]);
  });

  it('telt 36 cellen, 10 vakken en 15 bronnen, met versie 1 en de datum van het samenstellen', () => {
    expect(INVOERINGSKALENDER.v).toBe(1);
    expect(INVOERINGSKALENDER.cellen).toHaveLength(36);
    expect(INVOERINGSKALENDER.vakken).toHaveLength(10);
    expect(INVOERINGSKALENDER.bronnen).toHaveLength(15);
    expect(INVOERINGSKALENDER.samengesteldOp).toBe('2026-11-02');
    expect(INVOERINGSKALENDER.vrijwilligVanaf).toBe(2025);
  });

  it('gebruikt nergens de woorden nagekeken of geraadpleegd als veldnaam', () => {
    const json = JSON.stringify(INVOERINGSKALENDER);
    expect(json).not.toMatch(/nagekeken|geraadpleegd/i);
    expect(BRON).not.toMatch(/nagekeken/i);
    for (const b of INVOERINGSKALENDER.bronnen) expect(b.gevondenOp).toBe('2026-11-02');
  });

  it('heeft de bronnen met hun url en hun soort van kennis', () => {
    const ids = INVOERINGSKALENDER.bronnen.map((b) => b.id);
    expect(ids).toEqual([
      'api',
      'codex',
      'decreet-2025',
      'klasse-2026',
      'klasse-momenten',
      'kenniswest',
      'ovsg',
      'sensoa',
      'vanin',
      'kov-toetsen',
      'mvt-od36',
      'vlaams-parlement',
      'cohortregel',
      'vlaanderen-tabel',
      'vraag-antwoord',
    ]);
    const k = kopie();
    expect(bron(k, 'api').url).toBe('https://www.onderwijsdoelen.be/');
    expect(bron(k, 'vlaanderen-tabel').url).toBe(
      'https://www.vlaanderen.be/onderwijs-en-vorming/leerstof/onderwijsdoelen/nieuwe-minimumdoelen-in-het-basisonderwijs',
    );
    expect(bron(k, 'vraag-antwoord').url).toBe('https://data-onderwijs.vlaanderen.be/documenten/bestanden/nieuwe-minimumdoelen-vraag-antwoord.pdf');
    expect(bron(k, 'mvt-od36').url).toContain('name=VR+2026+0805+DOC.0465-3+Onderwijsdecreet+XXXVI+-+MvT+TER.pdf&content-disposition=inline');
    expect(bron(k, 'cohortregel').url).toBeUndefined();
    expect(bron(k, 'klasse-2026').citaat).toBe(
      'Dit schooljaar ga je in het kleuteronderwijs en in het eerste tot en met derde leerjaar lager onderwijs verplicht aan de slag met de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek',
    );
    for (const b of INVOERINGSKALENDER.bronnen) {
      expect(BRON_HOE_WAARDEN, b.id).toContain(b.hoe);
      if (b.url !== undefined) expect(b.url.startsWith('https://'), b.id).toBe(true);
    }
  });

  it('kent alleen de officiële gegevens als bron met hoe gegevens, en laat de officiële tabel nog te lezen staan', () => {
    const per = (hoe: string) => INVOERINGSKALENDER.bronnen.filter((b) => b.hoe === hoe).map((b) => b.id);
    expect(per('gegevens')).toEqual(['api']);
    expect(per('afgeleid')).toEqual(['cohortregel']);
    expect(per('nog-te-lezen')).toEqual(['vlaanderen-tabel', 'vraag-antwoord']);
    const gekend = BRON_HOE_WAARDEN.reduce((som, hoe) => som + per(hoe).length, 0);
    expect(gekend).toBe(INVOERINGSKALENDER.bronnen.length);
  });

  it('heeft de opmerkingen woord voor woord', () => {
    expect(celVoor('bao', 1, 'L4')?.opmerking).toBe(
      'In 2026-2027 mag het 4de leerjaar de oude eindtermen nog volgen. Deze leerlingen halen hun getuigschrift (2028-2029) wel op de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek.',
    );
    expect(celVoor('bao', 1, 'L6')?.opmerking).toBe('Uiterlijk 2028-2029: de oude eindtermen voor deze vakken gelden tot 31 augustus 2028.');
    expect(celVoor('bao', 2, 'L6')?.opmerking).toBe('Uiterlijk 2030-2031: de oude eindtermen voor deze vakken gelden tot 31 augustus 2030.');
    const bubao =
      'Volgt de kalender van het gewoon basisonderwijs: de oude doelen eindigen op dezelfde dagen. Of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.';
    for (const golf of [1, 2] as const) {
      for (const lj of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const) expect(celVoor('bubao', golf, lj)?.opmerking, `bubao ${golf} ${lj}`).toBe(bubao);
      for (const lj of ['K1', 'K2', 'K3'] as const) expect(celVoor('bubao', golf, lj)?.opmerking, `bubao ${golf} ${lj}`).toBeUndefined();
    }
    // Verder heeft geen enkele cel van het gewoon basisonderwijs een opmerking.
    const metOpmerking = INVOERINGSKALENDER.cellen.filter((c) => c.soort === 'bao' && c.opmerking !== undefined);
    expect(metOpmerking.map((c) => `${c.golf} ${c.leerjaar}`)).toEqual(['1 L4', '1 L6', '2 L6']);
  });

  it('start de kleuterklassen in 2026 (golf 1) en 2027 (golf 2), voor het gewoon en het buitengewoon onderwijs', () => {
    for (const soort of ['bao', 'bubao'] as const) {
      for (const lj of ['K1', 'K2', 'K3'] as const) {
        expect(celVoor(soort, 1, lj), `${soort} 1 ${lj}`).toMatchObject({ vanaf: 2026, zekerheid: 'zeker' });
        expect(celVoor(soort, 2, lj), `${soort} 2 ${lj}`).toMatchObject({ vanaf: 2027, zekerheid: 'zeker' });
      }
    }
  });

  it('houdt de lagere cellen van het gewoon onderwijs op waarschijnlijk en die van het buitengewoon op onzeker', () => {
    for (const golf of [1, 2] as const) {
      for (const lj of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const) {
        expect(celVoor('bao', golf, lj)?.zekerheid, `bao ${golf} ${lj}`).toBe('waarschijnlijk');
        expect(celVoor('bubao', golf, lj)?.zekerheid, `bubao ${golf} ${lj}`).toBe('onzeker');
        expect(celVoor('bubao', golf, lj)?.bronnen, `bubao ${golf} ${lj}`).toEqual(['api']);
      }
    }
  });

  it('geeft met WERKT_NAAR elk leerjaar zijn eindmoment', () => {
    expect(Object.keys(WERKT_NAAR)).toEqual([...LEERJAREN_BASIS]);
    expect(WERKT_NAAR).toEqual({ K1: 'K3', K2: 'K3', K3: 'K3', L1: 'L4', L2: 'L4', L3: 'L4', L4: 'L4', L5: 'L6', L6: 'L6' });
  });
});

describe('INVOERINGSKALENDER: de golf per vak (eigen zekerheid)', () => {
  const verwacht = [
    [1, 'Nederlands', 'nederlands', 1, 'zeker'],
    [2, 'Wiskunde', 'wiskunde', 1, 'zeker'],
    [3, 'Wetenschap en techniek', 'wetenschap en techniek', 1, 'zeker'],
    [4, 'Aardrijkskunde', 'aardrijkskunde', 2, 'waarschijnlijk'],
    [5, 'Geschiedenis', 'geschiedenis', 2, 'waarschijnlijk'],
    [6, 'Muzische vorming', 'muzische vorming', 2, 'zeker'],
    [7, 'Lichamelijke opvoeding', 'lichamelijke opvoeding', 2, 'zeker'],
    [8, 'ICT', 'ict', 2, 'zeker'],
    [9, 'Attitudes', 'attitudes', 2, 'waarschijnlijk'],
    [10, 'Frans', 'frans', 2, 'zeker'],
  ] as const;

  it.each(verwacht)('vak %i %s: sleutel %s, golf %i, %s', (nr, naam, sleutel, golf, zekerheid) => {
    const v = INVOERINGSKALENDER.vakken.find((x) => x.nr === nr);
    expect(v).toMatchObject({ nr, naam, sleutel, golf, zekerheid });
  });

  it('steunt een zeker vak op de officiële gegevens en een waarschijnlijk vak alleen op zoekfragmenten van het decreet', () => {
    for (const v of INVOERINGSKALENDER.vakken) {
      const hoe = v.bronnen.map((id) => INVOERINGSKALENDER.bronnen.find((b) => b.id === id)?.hoe);
      if (v.zekerheid === 'zeker') {
        expect(v.bronnen, v.naam).toContain('api');
      } else {
        expect(hoe.every((h) => h === 'zoekfragment'), v.naam).toBe(true);
        expect(v.bronnen, v.naam).toEqual(['decreet-2025', 'kenniswest']);
      }
    }
  });
});

describe('controleerKalender: gebroken varianten', () => {
  it('meldt een ontbrekende cel', () => {
    const fouten = gebroken((k) => {
      k.cellen = k.cellen.filter((c) => !(c.soort === 'bao' && c.golf === 1 && c.leerjaar === 'L2'));
    });
    expect(fouten.length).toBeGreaterThan(0);
    expect(fouten.join(' ')).toMatch(/ontbreekt/);
  });

  it('meldt een dubbele cel', () => {
    const fouten = gebroken((k) => {
      k.cellen.push({ ...cel(k, 'bubao', 2, 'K1') });
    });
    expect(fouten.join(' ')).toMatch(/2 keer/);
  });

  it('meldt K2 die niet gelijk is aan K1', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bao', 1, 'K2').vanaf = 2027;
    });
    expect(fouten.join(' ')).toMatch(/K2/);
  });

  it('meldt L5 die vóór L4 start', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bao', 1, 'L5').vanaf = 2026;
    });
    expect(fouten.join(' ')).toMatch(/L5 \(2026\) start vóór L4 \(2027\)/);
  });

  it('meldt L6 die twee jaar na L5 start: een groep valt terug op de oude doelen', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bao', 1, 'L6').vanaf = 2029;
    });
    expect(fouten.join(' ')).toMatch(/L6 \(2029\) start meer dan een jaar na L5 \(2027\)/);
  });

  it('meldt golf 2 die vóór golf 1 start', () => {
    const fouten = gebroken((k) => {
      for (const lj of ['K1', 'K2', 'K3'] as const) cel(k, 'bao', 2, lj).vanaf = 2025;
    });
    expect(fouten.join(' ')).toMatch(/vóór golf 1/);
  });

  it('meldt een lagere cel van het buitengewoon die niet gelijk is aan die van het gewoon onderwijs', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bubao', 1, 'L4').vanaf = 2028;
    });
    expect(fouten.join(' ')).toMatch(/Golf 1, L4: het buitengewoon basisonderwijs start in 2028, het gewoon in 2027/);
  });

  it('meldt een onbekend bron-id in een cel', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bao', 2, 'L3').bronnen = ['sensoa', 'bestaat-niet'];
    });
    expect(fouten.join(' ')).toMatch(/onbekende bron 'bestaat-niet'/);
  });

  it('meldt een url met http://', () => {
    const fouten = gebroken((k) => {
      bron(k, 'ovsg').url = 'http://www.ovsg.be/';
    });
    expect(fouten.join(' ')).toMatch(/ovsg.*https/);
  });

  it("meldt 'zeker' met alleen zoekfragmenten", () => {
    const fouten = gebroken((k) => {
      const c = cel(k, 'bao', 1, 'L1');
      c.zekerheid = 'zeker';
    });
    expect(fouten.join(' ')).toMatch(/L1 staat op 'zeker' zonder een bron uit de gegevens of een nagelezen bron/);
  });

  it('meldt een cel met alleen een bron die nog te lezen is', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bao', 2, 'L1').bronnen = ['vlaanderen-tabel'];
    });
    expect(fouten.join(' ')).toMatch(/L1 steunt op geen enkele bron die al gekend is/);
  });

  it('meldt een cel zonder bronnen', () => {
    const fouten = gebroken((k) => {
      cel(k, 'bubao', 1, 'L2').bronnen = [];
    });
    expect(fouten.length).toBeGreaterThan(0);
  });

  it('meldt vaknummer 3 dat dubbel staat (en nummer 4 dat dan ontbreekt)', () => {
    const fouten = gebroken((k) => {
      vak(k, 4).nr = 3;
    });
    expect(fouten.join(' ')).toMatch(/nummer 3 staat 2 keer/);
    expect(fouten.join(' ')).toMatch(/nummer 4 ontbreekt/);
  });

  it('meldt een vaknummer buiten 1 tot 10', () => {
    const fouten = gebroken((k) => {
      vak(k, 10).nr = 11;
    });
    expect(fouten.join(' ')).toMatch(/nummer buiten 1 tot 10/);
  });

  it('meldt een dubbele sleutel van een vak', () => {
    const fouten = gebroken((k) => {
      vak(k, 5).sleutel = 'aardrijkskunde';
    });
    expect(fouten.join(' ')).toMatch(/sleutel 'aardrijkskunde' komt bij 2 vakken voor/);
  });

  it('meldt een sleutel met hoofdletters, accenten of dubbele spaties', () => {
    for (const sleutel of ['Frans', 'wereldoriëntatie', 'wetenschap  en techniek', '']) {
      const fouten = gebroken((k) => {
        vak(k, 10).sleutel = sleutel;
      });
      expect(fouten.length, JSON.stringify(sleutel)).toBeGreaterThan(0);
    }
  });

  it('meldt een vak met een golf die niet 1 of 2 is', () => {
    const fouten = gebroken((k) => {
      (vak(k, 8) as { golf: number }).golf = 3;
    });
    expect(fouten.join(' ')).toMatch(/golf 3: dat moet 1 of 2 zijn/);
  });

  it("meldt een vak op 'zeker' zonder bron uit de gegevens: de golf van aardrijkskunde steunt alleen op zoekfragmenten", () => {
    const fouten = gebroken((k) => {
      vak(k, 4).zekerheid = 'zeker';
    });
    expect(fouten.join(' ')).toMatch(/Aardrijkskunde.*staat op 'zeker' zonder een bron uit de gegevens/);
  });

  it('meldt een vak dat naar een onbekende bron verwijst', () => {
    const fouten = gebroken((k) => {
      vak(k, 1).bronnen = ['api', 'bestaat-niet'];
    });
    expect(fouten.join(' ')).toMatch(/Nederlands.*onbekende bron 'bestaat-niet'/);
  });

  it('meldt een vak zonder gekende bron', () => {
    const fouten = gebroken((k) => {
      const v = vak(k, 9);
      v.bronnen = ['vraag-antwoord'];
    });
    expect(fouten.join(' ')).toMatch(/Attitudes.*steunt op geen enkele bron die al gekend is/);
  });

  it('meldt een bron-id dat dubbel staat', () => {
    const fouten = gebroken((k) => {
      bron(k, 'vanin').id = 'sensoa';
    });
    expect(fouten.join(' ')).toMatch(/'sensoa' staat meer dan één keer/);
  });

  it('meldt een onbekende waarde voor hoe, een ongeldige datum en een onbekende zekerheid', () => {
    expect(
      gebroken((k) => {
        (bron(k, 'codex') as { hoe: string }).hoe = 'gehoord';
      }).join(' '),
    ).toMatch(/onbekende waarde voor hoe/);
    expect(
      gebroken((k) => {
        bron(k, 'codex').gevondenOp = '2026-13-01';
      }).join(' '),
    ).toMatch(/geen geldige datum gevondenOp/);
    expect(
      gebroken((k) => {
        k.samengesteldOp = '2 november 2026';
      }).join(' '),
    ).toMatch(/samengesteld/);
    expect(
      gebroken((k) => {
        (cel(k, 'bao', 1, 'L1') as { zekerheid: string }).zekerheid = 'misschien';
      }).join(' '),
    ).toMatch(/onbekende zekerheid/);
  });

  it('meldt een jaar buiten 2025 tot 2035, een jaar met een komma en een jaar vóór het eerste vrijwillige schooljaar', () => {
    expect(
      gebroken((k) => {
        for (const c of k.cellen) c.vanaf += 10;
      }).join(' '),
    ).toMatch(/geen geheel schooljaar van 2025 tot 2035/);
    expect(
      gebroken((k) => {
        cel(k, 'bao', 1, 'L1').vanaf = 2026.5;
      }).join(' '),
    ).toMatch(/geen geheel schooljaar/);
    expect(
      gebroken((k) => {
        k.vrijwilligVanaf = 2027;
      }).join(' '),
    ).toMatch(/vóór het eerste schooljaar waarin het nieuwe mocht/);
  });

  it('meldt een kalender met een andere versie', () => {
    const fouten = gebroken((k) => {
      (k as { v: number }).v = 2;
    });
    expect(fouten.join(' ')).toMatch(/versie/);
  });

  it("laat een cel op 'zeker' toe zodra een bron nagelezen is: bijwerken raakt alleen de gegevens", () => {
    const fouten = gebroken((k) => {
      const tabel = bron(k, 'vlaanderen-tabel');
      tabel.hoe = 'gelezen';
      tabel.gevondenOp = '2026-12-01';
      for (const lj of ['L1', 'L2', 'L3'] as const) {
        const c = cel(k, 'bao', 1, lj);
        c.zekerheid = 'zeker';
        c.bronnen = ['vlaanderen-tabel', ...c.bronnen];
      }
    });
    expect(fouten).toEqual([]);
  });
});

describe('schooljaarVan, schooljaarVanDatum en schooljaarTekst', () => {
  it('rekent een datum om naar het schooljaar waarin ze valt', () => {
    expect(schooljaarVan('2026-08-31')).toBe(2025);
    expect(schooljaarVan('2026-09-01')).toBe(2026);
    expect(schooljaarVan('2026-09-01T00:00:00Z')).toBe(2026);
    expect(schooljaarVan('2026-08-31T23:59:59Z')).toBe(2025);
    expect(schooljaarVan('2027-01-15')).toBe(2026);
    expect(schooljaarVan('2026-12-31')).toBe(2026);
    expect(schooljaarVan('2026-01-01')).toBe(2025);
  });

  it('geeft undefined voor een tekst die niet te lezen is', () => {
    expect(schooljaarVan('onzin')).toBeUndefined();
    expect(schooljaarVan('2026-13-01')).toBeUndefined();
    expect(schooljaarVan('2026-00-10')).toBeUndefined();
    expect(schooljaarVan('2026-09-32')).toBeUndefined();
    expect(schooljaarVan('2026-9-1')).toBeUndefined();
    expect(schooljaarVan('')).toBeUndefined();
    expect(schooljaarVan(undefined)).toBeUndefined();
  });

  it('rekent een Date in lokale tijd om', () => {
    expect(schooljaarVanDatum(new Date(2026, 7, 31))).toBe(2025);
    expect(schooljaarVanDatum(new Date(2026, 8, 1))).toBe(2026);
    expect(schooljaarVanDatum(new Date(2027, 0, 15))).toBe(2026);
    expect(schooljaarVanDatum(new Date(2026, 11, 31, 23, 59))).toBe(2026);
  });

  it('geeft undefined voor een ongeldige Date', () => {
    expect(schooljaarVanDatum(new Date(Number.NaN))).toBeUndefined();
  });

  it('schrijft een schooljaar als 2026-2027', () => {
    expect(schooljaarTekst(2026)).toBe('2026-2027');
    expect(schooljaarTekst(2030)).toBe('2030-2031');
  });
});

describe('celVoor, laatsteVanaf en eindeOudVoor', () => {
  it('zoekt de cel van een soort, golf en leerjaar', () => {
    expect(celVoor('bao', 1, 'L4')).toMatchObject({ soort: 'bao', golf: 1, leerjaar: 'L4', vanaf: 2027 });
    expect(celVoor('bubao', 2, 'L6')).toMatchObject({ soort: 'bubao', golf: 2, leerjaar: 'L6', vanaf: 2030 });
  });

  it('geeft undefined als de kalender de cel niet kent', () => {
    const leeg: Invoeringskalender = { ...INVOERINGSKALENDER, cellen: [] };
    expect(celVoor('bao', 1, 'L4', leeg)).toBeUndefined();
  });

  it('geeft het laatste jaar per moment', () => {
    expect(laatsteVanaf('bao', 1, 'kleuter')).toBe(2026);
    expect(laatsteVanaf('bao', 2, 'kleuter')).toBe(2027);
    expect(laatsteVanaf('bao', 1, 'lager')).toBe(2028);
    expect(laatsteVanaf('bao', 2, 'lager')).toBe(2030);
  });

  it('geeft de einddatum van de oude sets voor het gewoon en het buitengewoon basisonderwijs', () => {
    for (const soort of ['bao', 'bubao'] as const) {
      expect(eindeOudVoor(soort, 1, 'kleuter'), soort).toBe('2026-08-31');
      expect(eindeOudVoor(soort, 2, 'kleuter'), soort).toBe('2027-08-31');
      expect(eindeOudVoor(soort, 1, 'lager'), soort).toBe('2028-08-31');
      expect(eindeOudVoor(soort, 2, 'lager'), soort).toBe('2030-08-31');
    }
  });

  it('volgt een andere kalender dan de echte: de jaren komen uit de gegevens', () => {
    const k = kopie();
    for (const lj of ['L4', 'L5'] as const) cel(k, 'bao', 1, lj).vanaf = 2040;
    cel(k, 'bao', 1, 'L6').vanaf = 2041;
    expect(laatsteVanaf('bao', 1, 'lager', k)).toBe(2041);
    expect(eindeOudVoor('bao', 1, 'lager', k)).toBe('2041-08-31');
    expect(celVoor('bao', 1, 'L4', k)?.vanaf).toBe(2040);
  });
});

describe('cohortcontrole (intern, geen bewijs van de regel)', () => {
  // Een groep die in schooljaar j in leerjaar n zit, zit in het 6de leerjaar in schooljaar G = j + 6 - n.
  const nieuwGolf1 = (j: number, n: number) => {
    const g = j + 6 - n;
    return (j >= 2026 && g >= 2029) || (j >= 2027 && g >= 2028);
  };
  const nieuwGolf2 = (j: number, n: number) => j >= 2027 && j + 6 - n >= 2030;
  const jaren = Array.from({ length: 17 }, (_, i) => 2024 + i);

  it.each([
    [1, nieuwGolf1],
    [2, nieuwGolf2],
  ] as const)('golf %i: per schooljaar en leerjaar valt de cohortregel samen met de cellen van het gewoon onderwijs', (golf, nieuw) => {
    for (let n = 1; n <= 6; n++) {
      const c = celVoor('bao', golf, `L${n}` as LeerjaarBasis);
      expect(c, `L${n}`).toBeDefined();
      const eerste = jaren.find((j) => nieuw(j, n));
      expect(c?.vanaf, `golf ${golf} L${n}: eerste jaar`).toBe(eerste);
      for (const j of jaren) expect(nieuw(j, n), `golf ${golf} L${n} in ${j}`).toBe(j >= (c?.vanaf ?? Infinity));
    }
  });
});

describe('nagelezenOp', () => {
  it('geeft undefined zolang geen enkele bron nagelezen is', () => {
    expect(nagelezenOp()).toBeUndefined();
  });

  it('geeft de laatste dag waarop een bron nagelezen is', () => {
    const k = kopie();
    bron(k, 'vlaanderen-tabel').hoe = 'gelezen';
    bron(k, 'vlaanderen-tabel').gevondenOp = '2026-12-01';
    bron(k, 'codex').hoe = 'gelezen';
    bron(k, 'codex').gevondenOp = '2026-12-15';
    expect(nagelezenOp(k)).toBe('2026-12-15');
  });
});

describe('het bestand zelf', () => {
  it('bevat geen enkele regel import, zodat tools/ het via Node kan laden', () => {
    expect(BRON).not.toMatch(/^\s*import\s/m);
    expect(BRON).not.toMatch(/\brequire\(/);
  });

  it('gebruikt alleen erasable TypeScript: geen enums, namespaces of parameter properties', () => {
    expect(BRON).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m);
    expect(BRON).not.toMatch(/^\s*(export\s+)?(declare\s+)?namespace\s/m);
    expect(BRON).not.toMatch(/constructor\s*\(\s*(public|private|protected|readonly)\s/);
  });

  it('leest nergens de klok van het toestel', () => {
    expect(BRON).not.toMatch(/Date\.now\(/);
    expect(BRON).not.toMatch(/new Date\(\s*\)/);
    expect(BRON).not.toMatch(/performance\.now\(/);
  });

  it('noemt nergens het woord widget', () => {
    expect(BRON).not.toMatch(/widget/i);
  });
});
