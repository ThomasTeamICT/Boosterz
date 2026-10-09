import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Doelgroep } from './doelgroep';
import { richtingInfo } from './richtingKader';
import { cursusBijRichting, domeinTekst, metExtraLeerplan, richtingLinkTeksten, variantLabels } from './richtingWeergave';
import { isAfgebouwd, type MatrixBestand, type StudierichtingGroep, type Structuuronderdeel } from './studierichtingen';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

function onderdeel(nummer: number, extra: Partial<Structuuronderdeel> = {}): Structuuronderdeel {
  return {
    nummer, groep: 'G-0100', titel: 'Basisoptie', onderwijsvorm: 'BSO', begindatum: '2021-09-01',
    leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['321'], ...extra,
  };
}

function groep(nummer: string, titel: string, onderdelen: number[], extra: Partial<StudierichtingGroep> = {}): StudierichtingGroep {
  return { nummer, titel, graad: '3', finaliteit: 'DO', onderdelen, ...extra };
}

function matrixVan(groepen: StudierichtingGroep[], onderdelen: Structuuronderdeel[]): MatrixBestand {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: groepen.length, aantalOnderdelen: onderdelen.length, sha256: SHA, groepen, onderdelen,
  };
}

const labelsVan = (os: Structuuronderdeel[], vandaag?: string) => variantLabels(os, vandaag).map((v) => v.label);

// ── variantLabels ───────────────────────────────────────────────────────────

describe('variantLabels', () => {
  it('laat een titel die maar één keer voorkomt zoals ze is, met het nummer van het onderdeel', () => {
    const uit = variantLabels([onderdeel(1, { titel: 'Hout' }), onderdeel(2, { titel: 'Metaal' })]);
    expect(uit).toStrictEqual([{ nummer: 1, label: 'Hout' }, { nummer: 2, label: 'Metaal' }]);
  });

  it('zet het studiedomein erbij als twee onderdelen dezelfde titel hebben, en schrijft het leesbaar', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'Sport', studiedomein: { omschrijving: 'ECONOMIE EN ORGANISATIE' } }),
      onderdeel(2, { titel: 'Sport', studiedomein: { omschrijving: 'STEM' } }),
    ]);
    expect(uit).toStrictEqual(['Sport · Economie en organisatie', 'Sport · STEM']);
  });

  it('houdt gelijke titels met hetzelfde studiedomein uit elkaar met de leerjaren', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'Bandenmonteur', studiedomein: { omschrijving: 'STEM' }, leerjaren: [{ code: '1' }] }),
      onderdeel(2, { titel: 'Bandenmonteur', studiedomein: { omschrijving: 'STEM' }, leerjaren: [{ code: '1' }, { code: '2' }] }),
    ]);
    expect(uit).toStrictEqual(['Bandenmonteur · STEM · 1ste leerjaar', 'Bandenmonteur · STEM · 1ste en 2de leerjaar']);
  });

  it('noemt de leerjaren in de juiste volgorde en met "en"', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'A', leerjaren: [{ code: '3' }, { code: '1' }, { code: '2' }] }),
      onderdeel(2, { titel: 'A', leerjaren: [{ code: '3' }] }),
    ]);
    expect(uit).toStrictEqual(['A · 1ste, 2de en 3de leerjaar', 'A · 3de leerjaar']);
  });

  it('valt terug op de onderwijsvorm als de leerjaren gelijk zijn', () => {
    const uit = labelsVan([onderdeel(1, { titel: 'A', onderwijsvorm: 'TSO' }), onderdeel(2, { titel: 'A', onderwijsvorm: 'BSO' })]);
    expect(uit).toStrictEqual(['A · tso', 'A · bso']);
  });

  it('valt dan terug op de startdatum, met de maand leesbaar geschreven', () => {
    const uit = labelsVan([onderdeel(1, { titel: 'A', begindatum: '2023-09-01' }), onderdeel(2, { titel: 'A', begindatum: '2025-02-01' })]);
    expect(uit).toStrictEqual(['A · vanaf september 2023', 'A · vanaf februari 2025']);
  });

  it('zet kenmerken bijelkaar als één kenmerk niet genoeg is', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'A', leerjaren: [{ code: '1' }], onderwijsvorm: 'ASO' }),
      onderdeel(2, { titel: 'A', leerjaren: [{ code: '1' }], onderwijsvorm: 'TSO' }),
      onderdeel(3, { titel: 'A', leerjaren: [{ code: '2' }], onderwijsvorm: 'ASO' }),
    ]);
    expect(uit).toStrictEqual(['A · 1ste leerjaar · aso', 'A · 1ste leerjaar · tso', 'A · 2de leerjaar · aso']);
  });

  it('geeft een volgnummer aan onderdelen die ook dan nog gelijk zijn', () => {
    const uit = labelsVan([onderdeel(1, { titel: 'A' }), onderdeel(2, { titel: 'A' })]);
    expect(uit).toStrictEqual(['A (1 van 2)', 'A (2 van 2)']);
  });

  it('geeft het volgnummer alleen aan wie nog gelijk is', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'A', leerjaren: [{ code: '1' }] }),
      onderdeel(2, { titel: 'A', leerjaren: [{ code: '2' }] }),
      onderdeel(3, { titel: 'A', leerjaren: [{ code: '2' }] }),
      onderdeel(4, { titel: 'B' }),
    ]);
    expect(uit).toStrictEqual(['A · 1ste leerjaar', 'A · 2de leerjaar (1 van 2)', 'A · 2de leerjaar (2 van 2)', 'B']);
  });

  it('maakt het label ook uniek als een kenmerk toevallig gelijk is aan het label van een ander onderdeel', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'A', leerjaren: [{ code: '1' }] }),
      onderdeel(2, { titel: 'A', leerjaren: [{ code: '2' }] }),
      onderdeel(3, { titel: 'A · 1ste leerjaar' }),
    ]);
    expect(new Set(uit).size).toBe(3);
  });

  it('laat leerjaren die al afgebouwd zijn weg als de datum van vandaag meegegeven wordt', () => {
    const os = [
      onderdeel(1, { titel: 'A', onderwijsvorm: 'BSO', leerjaren: [{ code: '1', einddatum: '2020-08-31' }, { code: '2' }] }),
      onderdeel(2, { titel: 'A', onderwijsvorm: 'TSO', leerjaren: [{ code: '2' }] }),
    ];
    // Zonder datum verschillen de leerjaren; met datum zijn ze gelijk en houdt de onderwijsvorm ze uit elkaar.
    expect(labelsVan(os)).toStrictEqual(['A · 1ste en 2de leerjaar', 'A · 2de leerjaar']);
    expect(labelsVan(os, VANDAAG)).toStrictEqual(['A · bso', 'A · tso']);
  });

  it('houdt een leerjaar dat als enige afgebouwd is toch in beeld (anders is er niets meer te zeggen)', () => {
    const os = [
      onderdeel(1, { titel: 'A', leerjaren: [{ code: '1', einddatum: '2020-08-31' }] }),
      onderdeel(2, { titel: 'A', leerjaren: [{ code: '2' }] }),
    ];
    expect(labelsVan(os, VANDAAG)).toStrictEqual(['A · 1ste leerjaar', 'A · 2de leerjaar']);
  });

  it('gaat om met leerjaren zonder bruikbaar nummer en met een lege lijst', () => {
    const uit = labelsVan([
      onderdeel(1, { titel: 'A', leerjaren: [{ code: 'X', omschrijving: 'Aanloop' }] }),
      onderdeel(2, { titel: 'A', leerjaren: [] }),
    ]);
    expect(uit).toStrictEqual(['A · Aanloop', 'A']);
    expect(variantLabels([])).toStrictEqual([]);
  });

  it('domeinTekst laat een afkorting en gemengde schrijfwijze staan', () => {
    expect(domeinTekst('ECONOMIE EN ORGANISATIE')).toBe('Economie en organisatie');
    expect(domeinTekst('STEM')).toBe('STEM');
    expect(domeinTekst('Land- en tuinbouw')).toBe('Land- en tuinbouw');
    expect(domeinTekst('  ')).toBe('');
  });
});

// ── variantLabels op de echte matrix ────────────────────────────────────────

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const MATRIX_BESTAND = join(WORTEL, 'public', 'leerplannen', 'structuur', 'studierichtingen.json');

describe.runIf(existsSync(MATRIX_BESTAND))('variantLabels op de echte matrix', () => {
  const matrix = JSON.parse(readFileSync(MATRIX_BESTAND, 'utf8')) as MatrixBestand;
  const perGroep = new Map<string, Structuuronderdeel[]>();
  for (const o of matrix.onderdelen) perGroep.set(o.groep, [...(perGroep.get(o.groep) ?? []), o]);

  // De matrix wordt elke maand ververst: de test hangt niet af van welke richting een dubbel heeft, alleen van de regel.
  for (const vandaag of [VANDAAG, '2024-01-01', '2030-06-01']) {
    it(`geeft elke richting elk onderdeel een eigen naam (op ${vandaag})`, () => {
      let gecontroleerd = 0;
      const fouten: string[] = [];
      for (const [nummer, alle] of perGroep) {
        const geldig = alle.filter((o) => !isAfgebouwd(o, vandaag));
        if (geldig.length < 2) continue;
        gecontroleerd++;
        const labels = variantLabels(geldig, vandaag);
        const uniek = new Set(labels.map((l) => l.label));
        if (uniek.size !== labels.length) fouten.push(`${nummer}: ${labels.map((l) => l.label).join(' | ')}`);
        geldig.forEach((o, i) => {
          if (labels[i].nummer !== o.nummer || !labels[i].label.startsWith(o.titel)) fouten.push(`${nummer}: label past niet bij onderdeel ${o.nummer}`);
        });
      }
      expect(fouten).toStrictEqual([]);
      expect(gecontroleerd).toBeGreaterThan(0);
    });
  }

  it('onderscheidt twee onderdelen met dezelfde titel en hetzelfde studiedomein, als de matrix zo’n geval heeft', () => {
    for (const alle of perGroep.values()) {
      const geldig = alle.filter((o) => !isAfgebouwd(o, VANDAAG));
      const sleutel = (o: Structuuronderdeel) => `${o.titel}|${o.studiedomein?.omschrijving ?? ''}`;
      const dubbel = geldig.find((o) => geldig.filter((a) => sleutel(a) === sleutel(o)).length > 1);
      if (!dubbel) continue;
      const labels = variantLabels(geldig, VANDAAG).filter((l, i) => sleutel(geldig[i]) === sleutel(dubbel));
      expect(new Set(labels.map((l) => l.label)).size).toBe(labels.length);
      // Er zit een echt kenmerk in (geen kale titel), want de matrix kent leerjaren, onderwijsvorm of startdatum.
      expect(labels.every((l) => l.label !== dubbel.titel)).toBe(true);
      return;
    }
  });
});

// ── richtingLinkTeksten ─────────────────────────────────────────────────────

describe('richtingLinkTeksten', () => {
  it('zet graad en jaren bij de titel: "Animator · 3de graad · 7de jaar"', () => {
    const m = matrixVan(
      [groep('G-0200', 'Animator', [200], { graad: '3', finaliteit: undefined }), groep('G-0201', 'Animator', [201], { graad: '3', finaliteit: undefined })],
      [
        onderdeel(200, { groep: 'G-0200', leerjaren: [{ code: '1' }, { code: '2' }] }),
        onderdeel(201, { groep: 'G-0201', leerjaren: [{ code: '3' }] }),
      ],
    );
    const uit = richtingLinkTeksten(m, m.groepen, VANDAAG);
    expect(uit.get('G-0200')).toBe('Animator · 3de graad · 5de en 6de jaar');
    expect(uit.get('G-0201')).toBe('Animator · 3de graad · 7de jaar');
  });

  it('laat de graad weg met zonderGraad', () => {
    const m = matrixVan([groep('G-0201', 'Animator', [201])], [onderdeel(201, { groep: 'G-0201', leerjaren: [{ code: '3' }] })]);
    expect(richtingLinkTeksten(m, m.groepen, VANDAAG, { zonderGraad: true }).get('G-0201')).toBe('Animator · 7de jaar');
  });

  it('laat in de 1ste graad het jaar weg: de titel noemt het leerjaar al', () => {
    const m = matrixVan(
      [groep('G-0300', 'Eerste leerjaar A', [300], { graad: '1', finaliteit: undefined })],
      [onderdeel(300, { groep: 'G-0300', leerjaren: [{ code: '1' }] })],
    );
    expect(richtingLinkTeksten(m, m.groepen, VANDAAG).get('G-0300')).toBe('Eerste leerjaar A · 1ste graad');
  });

  it('noemt een richting van het buitengewoon onderwijs zo, zonder jaren', () => {
    const m = matrixVan(
      [groep('G-0400', 'Animator', [400], { graad: undefined, opleidingsvorm: { code: '3' } })],
      [onderdeel(400, { groep: 'G-0400' })],
    );
    expect(richtingLinkTeksten(m, m.groepen, VANDAAG).get('G-0400')).toBe('Animator · Buitengewoon onderwijs');
  });

  it('zet de finaliteit erbij als twee richtingen dan nog gelijk zijn', () => {
    const m = matrixVan(
      [groep('G-0200', 'Animator', [200], { finaliteit: 'DO' }), groep('G-0201', 'Animator', [201], { finaliteit: 'A' })],
      [onderdeel(200, { groep: 'G-0200', leerjaren: [{ code: '1' }] }), onderdeel(201, { groep: 'G-0201', leerjaren: [{ code: '1' }] })],
    );
    const uit = richtingLinkTeksten(m, m.groepen, VANDAAG);
    expect(uit.get('G-0200')).toBe('Animator · 3de graad · 5de jaar · Doorstroomfinaliteit');
    expect(uit.get('G-0201')).toBe('Animator · 3de graad · 5de jaar · Arbeidsmarktfinaliteit');
  });

  it('zet dan de onderwijsvorm erbij als ook de finaliteit gelijk is', () => {
    const m = matrixVan(
      [groep('G-0200', 'Animator', [200]), groep('G-0201', 'Animator', [201])],
      [
        onderdeel(200, { groep: 'G-0200', onderwijsvorm: 'TSO', leerjaren: [{ code: '1' }] }),
        onderdeel(201, { groep: 'G-0201', onderwijsvorm: 'ASO', leerjaren: [{ code: '1' }] }),
      ],
    );
    const uit = richtingLinkTeksten(m, m.groepen, VANDAAG);
    expect(uit.get('G-0200')).toBe('Animator · 3de graad · 5de jaar · tso');
    expect(uit.get('G-0201')).toBe('Animator · 3de graad · 5de jaar · aso');
  });

  it('maakt de tekst niet langer met een kenmerk dat ze toch niet uit elkaar haalt', () => {
    const m = matrixVan(
      [groep('G-0200', 'Animator', [200]), groep('G-0201', 'Animator', [201])],
      [onderdeel(200, { groep: 'G-0200', leerjaren: [{ code: '1' }] }), onderdeel(201, { groep: 'G-0201', leerjaren: [{ code: '1' }] })],
    );
    const uit = richtingLinkTeksten(m, m.groepen, VANDAAG);
    expect(uit.get('G-0200')).toBe('Animator · 3de graad · 5de jaar');
    expect(uit.get('G-0201')).toBe('Animator · 3de graad · 5de jaar');
  });

  it('geeft een groep die niet in de matrix staat gewoon haar titel, en een lege lijst een lege tabel', () => {
    const m = matrixVan([], []);
    expect(richtingLinkTeksten(m, [groep('G-0999', 'Onbekend', [])], VANDAAG).get('G-0999')).toBe('Onbekend');
    expect(richtingLinkTeksten(m, [], VANDAAG).size).toBe(0);
  });

  it('zet nooit een groepnummer of set-id in de tekst', () => {
    const m = matrixVan([groep('G-0200', 'Animator', [200])], [onderdeel(200, { groep: 'G-0200' })]);
    const tekst = richtingLinkTeksten(m, m.groepen, VANDAAG).get('G-0200') ?? '';
    expect(tekst).not.toMatch(/G-\d|ODS_/);
    expect(richtingInfo(m, 'G-0200', VANDAAG)).toBeDefined();
  });
});

// ── cursusBijRichting ───────────────────────────────────────────────────────

describe('cursusBijRichting', () => {
  const richting: Doelgroep = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so' };
  const eigen = { doelgroep: richting };
  const leerplanZelfde = { doelgroep: { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so' } };
  const leerplanAndere = { doelgroep: { groep: 'G-0200', titel: 'Latijn', graad: 2, soort: 'so' } };

  it('biedt "Haal weg" aan bij een eigen doelgroep zonder leerplan', () => {
    expect(cursusBijRichting(eigen, undefined, richting)).toStrictEqual({ eigen: true, viaLeerplan: false, kanWeghalen: true });
  });

  it('biedt "Haal weg" aan als het leerplan geen doelgroep heeft', () => {
    expect(cursusBijRichting(eigen, {}, richting).kanWeghalen).toBe(true);
  });

  it('biedt "Haal weg" aan als het leerplan bij een andere richting hoort', () => {
    expect(cursusBijRichting(eigen, leerplanAndere, richting).kanWeghalen).toBe(true);
  });

  it('biedt "Haal weg" aan als het leerplan bij dezelfde richting maar een ander soort onderwijs hoort', () => {
    const buso = { doelgroep: { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'buso' } };
    expect(cursusBijRichting(eigen, buso, richting).kanWeghalen).toBe(true);
  });

  it('biedt "Haal weg" niet aan als het leerplan bij dezelfde richting hoort: de cursus blijft er dan toch bij horen', () => {
    expect(cursusBijRichting(eigen, leerplanZelfde, richting)).toStrictEqual({ eigen: true, viaLeerplan: true, kanWeghalen: false });
  });

  it('biedt "Haal weg" niet aan bij een cursus die er alleen via haar leerplan bij hoort', () => {
    expect(cursusBijRichting({}, leerplanZelfde, richting)).toStrictEqual({ eigen: false, viaLeerplan: true, kanWeghalen: false });
  });

  it('telt een ongeldige doelgroep op de cursus niet als eigen doelgroep', () => {
    expect(cursusBijRichting({ doelgroep: { groep: 'kapot' } }, leerplanZelfde, richting)).toStrictEqual({ eigen: false, viaLeerplan: true, kanWeghalen: false });
  });

  it('gaat om met een leerplan met een ongeldige doelgroep en met een richting die ontbreekt', () => {
    expect(cursusBijRichting(eigen, { doelgroep: 'rommel' }, richting).kanWeghalen).toBe(true);
    expect(cursusBijRichting(eigen, leerplanZelfde, undefined)).toStrictEqual({ eigen: true, viaLeerplan: false, kanWeghalen: true });
  });
});

// ── metExtraLeerplan ────────────────────────────────────────────────────────

describe('metExtraLeerplan', () => {
  interface Rij { curriculum: { id: string; titel: string }; raakt: number }
  const rijen: Rij[] = [{ curriculum: { id: 'a', titel: 'A' }, raakt: 3 }, { curriculum: { id: 'b', titel: 'B' }, raakt: 1 }];
  const nieuw = (c: Rij['curriculum']): Rij => ({ curriculum: c, raakt: 0 });

  it('zet een leerplan dat nog niet in de lijst staat vooraan', () => {
    const uit = metExtraLeerplan(rijen, { id: 'c', titel: 'C' }, nieuw);
    expect(uit.map((r) => r.curriculum.id)).toStrictEqual(['c', 'a', 'b']);
  });

  it('voegt niets toe als de id er al in staat (geen dubbels)', () => {
    const uit = metExtraLeerplan(rijen, { id: 'b', titel: 'Andere titel' }, nieuw);
    expect(uit).toStrictEqual(rijen);
    expect(uit).not.toBe(rijen);
  });

  it('geeft de lijst terug als er geen leerplan is, en past de oorspronkelijke lijst niet aan', () => {
    expect(metExtraLeerplan(rijen, undefined, nieuw)).toStrictEqual(rijen);
    metExtraLeerplan(rijen, { id: 'c', titel: 'C' }, nieuw);
    expect(rijen).toHaveLength(2);
  });
});
