// Welke richtingen beroepskwalificaties kunnen hebben (`kanBkHebben`, docs/STUDIERICHTINGEN.md § 23.7) en wat de hook
// meteen teruggeeft. Op de echte matrix in public/leerplannen/structuur/: alleen voor een richting die er kan hebben, mag
// de pagina iets vragen in public/leerplannen/kwalificaties/ (een 404 daar is een consolefout, § 23.15 R11).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RichtingBk } from '../../lib/richtingBk';
import { richtingInfo, type RichtingInfo } from '../../lib/richtingKader';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { bksVan, kanBkHebben, useRichtingBk, type BkStand } from './useRichtingBk';

const VANDAAG = '2026-10-11';
const MATRIX = join(process.cwd(), 'public', 'leerplannen', 'structuur', 'studierichtingen.json');
const HEEFT_MATRIX = existsSync(MATRIX);
const matrix = HEEFT_MATRIX ? (JSON.parse(readFileSync(MATRIX, 'utf8')) as MatrixBestand) : undefined;

function info(groep: string): RichtingInfo {
  const i = richtingInfo(matrix!, groep, VANDAAG);
  if (!i) throw new Error(`geen richting ${groep}`);
  return i;
}

describe.runIf(HEEFT_MATRIX)('kanBkHebben op de echte matrix', () => {
  it('ja bij arbeidsmarktfinaliteit: Onthaal en recreatie (G-0393) en Afwerking bouw (G-0001)', () => {
    expect(kanBkHebben(info('G-0393'))).toBe(true);
    expect(kanBkHebben(info('G-0001'))).toBe(true);
  });

  it('ja bij een 7de jaar (Animator, G-0429) en bij basisverpleegkunde (G-0562, soort "ander", heeft een beroepskwalificatie)', () => {
    expect(info('G-0429').soort).toBe('zevende');
    expect(kanBkHebben(info('G-0429'))).toBe(true);
    expect(info('G-0562').soort).toBe('ander');
    expect(kanBkHebben(info('G-0562'))).toBe(true);
  });

  it('nee bij doorstroomfinaliteit (Natuurwetenschappen G-0193, Humane wetenschappen G-0327) en in de 1ste graad', () => {
    expect(kanBkHebben(info('G-0193'))).toBe(false);
    expect(kanBkHebben(info('G-0327'))).toBe(false);
    const eersteGraad = matrix!.groepen.filter((g) => g.graad === '1').map((g) => info(g.nummer));
    expect(eersteGraad.length).toBeGreaterThan(0);
    for (const i of eersteGraad) expect(kanBkHebben(i)).toBe(false);
  });

  it('nooit bij een afgebouwde richting, ook niet met arbeidsmarktfinaliteit', () => {
    const afgebouwd = matrix!.groepen.map((g) => info(g.nummer)).filter((i) => i.afgebouwd);
    expect(afgebouwd.length).toBeGreaterThan(0);
    for (const i of afgebouwd) expect(kanBkHebben(i)).toBe(false);
    expect(kanBkHebben({ ...info('G-0393'), afgebouwd: true })).toBe(false);
  });

  it('nooit bij een richting met doorstroomfinaliteit, over de hele matrix', () => {
    for (const g of matrix!.groepen) {
      if (g.finaliteit === 'DO') expect(kanBkHebben(info(g.nummer))).toBe(false);
    }
  });
});

/** Rendert een component die de hook gebruikt, op de server: effecten lopen dan niet, dus er wordt niets geladen. */
function eersteStand(groep: string): string {
  const i = info(groep);
  let uit = '';
  function Proef() {
    uit = useRichtingBk(i, { groep, soort: 'so' }, VANDAAG).stand.status;
    return null;
  }
  renderToStaticMarkup(createElement(Proef));
  return uit;
}

describe.runIf(HEEFT_MATRIX)('useRichtingBk: de eerste stand', () => {
  it('niet van toepassing voor een richting die geen beroepskwalificaties kan hebben (geen verzoek)', () => {
    expect(eersteStand('G-0193')).toBe('niet-van-toepassing');
  });

  it('laden voor een richting die er kan hebben', () => {
    expect(eersteStand('G-0393')).toBe('laden');
  });
});

describe('bksVan', () => {
  const kader: RichtingBk = {
    herkomst: 'api',
    bks: [{ bk: 'BK-0390-2', nummer: 'BK-0390', versie: 2, titel: 'Onthaalmedewerker', onderdelen: [504], alleOnderdelen: true }],
    bekrachtigingen: [],
  };

  it('geeft de BK\'s van een klare stand, anders een lege lijst', () => {
    expect(bksVan({ status: 'klaar', waarde: kader })).toHaveLength(1);
    const anders: (BkStand | undefined)[] = [undefined, { status: 'laden' }, { status: 'fout', fout: 'x' }, { status: 'niet-van-toepassing' }];
    for (const s of anders) expect(bksVan(s)).toEqual([]);
  });
});
