// Tests van het lesmateriaal voor proefles 1 (LK-7): elk id bestaat, elke tekst van een doel komt letterlijk uit de
// gegevens, elk antwoord klopt met de lichtlogica, en de spiekkaart blijft kort genoeg voor één A4.
//
// Zoals lichtkamerManifest.test.ts leest dit de bestanden van de app in public/. GEGEVENSRUN=1 slaat dat deel over: de
// maandelijkse ophaling wordt er nooit door tegengehouden. De deploy-workflow zet het niet en draait het streng.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { htmlNaarTekst, type MinimumdoelenSetBestand } from '../../minimumdoelen';
import { lichtkamerMoment } from '../bewijs/lichtkamerManifest';
import { laatsteVersie } from '../bewijs/pakket';
import { bronvermeldingLeerplan, type GoBijMinimumdoelBestand, type GoLeerplanBestand } from '../go/types';
import { CHECKS_4, juisteIndex } from './checks';
import { alleOplossingen, isSchuin, oplossingSleutel } from './kaartjes';
import { MEETBLAD, OBSERVATIEBLAD, OEFENING_TITEL, SPIEKKAART, leeftijdBereik, telWoorden, tekstenVanSpiekkaart, vulSpiekkaart, type LesmateriaalBronnen } from './lesmateriaal';
import { STANDAARD_AFSTANDEN, STREEP_CM, echteHoogtes, kijkOnderzoekNa } from './onderzoek';
import { LETTERS, maakRonde, plaatsVan } from './rondes';
import { VOORWERPEN, afstandCm, kantVanLamp, type Voorwerp } from './schaduw';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';
const leesJson = <T>(...pad: string[]): T => JSON.parse(readFileSync(join(REPO, ...pad), 'utf8')) as T;

const MOMENT = lichtkamerMoment('einde-4de');
if (!MOMENT) throw new Error('Het moment einde-4de staat niet in het manifest.');
const VERSIE = laatsteVersie(MOMENT.manifest);
const BEWIJZEN = new Map(VERSIE.bewijzen.map((b) => [b.id, b]));
/** Het foutpatroon dat in de app niet meer voorkomt: geen rij op de spiekkaart. */
const NIET_MEER = 'metingen-passen-niet';

/** De bronnen zoals het scherm ze geeft, maar uit het manifest alleen (zonder bestanden). */
function foutpatroonUitManifest(id: string): string | undefined {
  for (const b of VERSIE.bewijzen) for (const f of b.foutpatronen) if (f.id === id) return f.tekst;
  return undefined;
}

describe('spiekkaart naast manifest v1 (LK4)', () => {
  it('de oefeningen zijn precies die van het moment, met een titel per oefening', () => {
    expect(Object.keys(OEFENING_TITEL).sort()).toEqual(MOMENT.oefeningen.map((o) => o.id).sort());
  });

  it('elke oefening van een fase en van een antwoord bestaat', () => {
    const ids = new Set(MOMENT.oefeningen.map((o) => o.id));
    for (const f of SPIEKKAART.fasen) for (const o of f.oefeningen) expect(ids.has(o), o).toBe(true);
    for (const a of SPIEKKAART.antwoorden) if (a.waar !== 'check') expect(ids.has(a.waar), a.waar).toBe(true);
    for (const r of SPIEKKAART.fouten) if (r.ookBij) expect(ids.has(r.ookBij), r.ookBij).toBe(true);
  });

  it('elk bewijs van een antwoord bestaat en hoort bij die oefening of bij de check; samen dekken ze alle bewijzen', () => {
    const gezien: string[] = [];
    for (const a of SPIEKKAART.antwoorden) {
      const verwacht = a.waar === 'check' ? MOMENT.check : MOMENT.oefeningen.find((o) => o.id === a.waar)?.bewijzen;
      expect([...a.bewijzen].sort(), a.waar).toEqual([...(verwacht ?? [])].sort());
      for (const b of a.bewijzen) expect(BEWIJZEN.has(b), b).toBe(true);
      gezien.push(...a.bewijzen);
    }
    expect(gezien.sort()).toEqual([...BEWIJZEN.keys()].sort());
  });

  it('één rij per foutpatroon van LK4, behalve het foutpatroon dat niet meer voorkomt', () => {
    const inManifest = new Set(VERSIE.bewijzen.flatMap((b) => b.foutpatronen.map((f) => f.id)));
    expect(inManifest.has(NIET_MEER)).toBe(true);
    inManifest.delete(NIET_MEER);
    const rijen = SPIEKKAART.fouten.map((r) => r.foutpatroon);
    expect(new Set(rijen).size).toBe(rijen.length);
    expect([...rijen].sort()).toEqual([...inManifest].sort());
    expect(rijen).not.toContain(NIET_MEER);
  });

  it('de bewijzen van een rij zijn precies de bewijzen die dat foutpatroon dragen', () => {
    for (const r of SPIEKKAART.fouten) {
      const dragers = VERSIE.bewijzen.filter((b) => b.foutpatronen.some((f) => f.id === r.foutpatroon)).map((b) => b.id);
      expect([...r.bewijzen].sort(), r.foutpatroon).toEqual(dragers.sort());
    }
  });

  it('de doelen zijn de doelen van het moment, in dezelfde volgorde en uit dezelfde set', () => {
    expect(SPIEKKAART.doelen.map((d) => [d.set, d.id])).toEqual(MOMENT.doelen.map((d) => [d.set, d.id]));
  });

  it('het lesverloop: 50 minuten zonder gaten, het bord vóór de Chromebook, elke oefening één keer', () => {
    const f = SPIEKKAART.fasen;
    expect(f[0].van).toBe(0);
    expect(f[f.length - 1].tot).toBe(50);
    for (let i = 1; i < f.length; i++) expect(f[i].van).toBe(f[i - 1].tot);
    expect(f.map((x) => [x.van, x.tot])).toEqual([
      [0, 5],
      [5, 20],
      [20, 40],
      [40, 45],
      [45, 50],
    ]);
    const plek = (o: string) => f.find((x) => x.oefeningen.some((y) => y === o))?.plek;
    expect(plek('waar-valt-de-schaduw')).toBe('bord');
    expect(plek('drie-kaartjes')).toBe('chromebook');
    expect(plek('onderzoek-schaduw')).toBe('chromebook');
    expect(f.flatMap((x) => x.oefeningen).sort()).toEqual(Object.keys(OEFENING_TITEL).sort());
  });

  it('de afstanden van het onderzoek en het meetblad zijn 30, 15 en 10 cm', () => {
    expect(STANDAARD_AFSTANDEN).toEqual([30, 15, 10]);
    expect(MEETBLAD.afstanden).toEqual(STANDAARD_AFSTANDEN);
    expect(SPIEKKAART.fasen.some((f) => f.doe.some((d) => d.includes('30, 15 en 10 cm')))).toBe(true);
  });
});

// ─── De antwoorden, nagerekend met de lichtlogica ────────────────────────────

const antwoord = (waar: string) => SPIEKKAART.antwoorden.find((a) => a.waar === waar)?.regels.join(' ') ?? '';
const komma = (n: number) => String(n).replace('.', ',');

/** De aflezingen op de streepjes van de meetlat die het nakijken goedkeurt, bij één afstand. */
function goedeAflezingen(voorwerp: Voorwerp, cm: number): number[] {
  const echt = echteHoogtes(voorwerp);
  const goed: number[] = [];
  for (let v = 0; v <= 30; v += STREEP_CM) {
    // de andere afstanden krijgen hun echte hoogte; alleen deze afstand wordt afgelezen
    const metingen: Record<number, unknown> = {};
    for (const a of STANDAARD_AFSTANDEN) metingen[a] = a === cm ? v : echt[a];
    const u = kijkOnderzoekNa({ voorwerp, metingen, hypothese: 'groter', conclusie: null });
    if (u.stap === 'conclusie') goed.push(v);
    else expect(u.stap, `${voorwerp} ${cm} cm: ${v}`).toBe('fout');
  }
  return goed;
}

describe('de antwoorden op de spiekkaart kloppen met de lichtlogica', () => {
  it("'Waar valt de schaduw?': ronde 1 A, ronde 2 B, ronde 3 C, voor elk voorwerp", () => {
    expect(antwoord('waar-valt-de-schaduw')).toContain('Ronde 1: A. Ronde 2: B. Ronde 3: C');
    for (const v of VOORWERPEN) expect([0, 1, 2].map((r) => LETTERS[maakRonde(r, v).juistIdx]), v).toEqual(['A', 'B', 'C']);
  });

  it('ronde 3: de lamp staat het verst en een beetje rechts; de schaduw valt bijna recht achter het voorwerp, aan de andere kant', () => {
    const r = [0, 1, 2].map((i) => maakRonde(i, 'boom'));
    expect(afstandCm(r[2].lamp)).toBeGreaterThan(Math.max(afstandCm(r[0].lamp), afstandCm(r[1].lamp)));
    expect(kantVanLamp(r[2].lamp)).toBe('rechts');
    expect(plaatsVan(r[2], r[2].juistIdx)).toBe('in het midden');
    expect(r[2].schaduwX).toBeLessThan(0);
    // en in de andere rondes valt de schaduw duidelijk aan de andere kant dan de lamp
    for (const x of r.slice(0, 2)) expect(Math.sign(x.schaduwX)).toBe(-Math.sign(x.lamp.x));
  });

  it("'Drie kaartjes': recht is alles even hoog; schuin zijn er precies twee oplossingen, met de lamp heel hoog of heel laag", () => {
    const opl = alleOplossingen().map(oplossingSleutel);
    // de sleutel: lamp (0 heel laag … 4 heel hoog), dan de gaatjes van kaartje 3 (bij het scherm), 2 en 1 (0 laag, 2 hoog)
    expect(opl.filter((s) => !isSchuin(s)).sort()).toEqual(['1-000', '2-111', '3-222']);
    expect(opl.filter(isSchuin).sort()).toEqual(['0-210', '4-012']);
    const t = antwoord('drie-kaartjes');
    expect(t).toContain('de lamp heel hoog (gaatje 1, 2, 3: hoog, midden, laag)'); // 4-012: kaartje 3 laag, 2 midden, 1 hoog
    expect(t).toContain('heel laag (laag, midden, hoog)'); // 0-210
    expect(t).toContain('Gaatje 1 zit bij de lamp');
  });

  it('het onderzoek: de goede aflezingen per afstand staan juist op de spiekkaart', () => {
    const tekst = antwoord('onderzoek-schaduw');
    const regel = (v: Voorwerp) =>
      STANDAARD_AFSTANDEN.map((cm) => {
        const g = goedeAflezingen(v, cm);
        return `${cm} cm: ${komma(g[0])}-${komma(g[g.length - 1])}`;
      }).join(', ');
    // boompje en huisje geven dezelfde hoogtes (top op 10 cm)
    expect(regel('huis')).toBe(regel('boom'));
    expect(tekst).toContain(`Goed, boompje of huisje: ${regel('boom')}.`);
    expect(tekst).toContain(`Kartonnen kind: ${regel('kind')}.`);
    // de goede aflezingen liggen aaneen, zonder gat
    for (const v of VOORWERPEN)
      for (const cm of STANDAARD_AFSTANDEN) {
        const g = goedeAflezingen(v, cm);
        expect(g.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < g.length; i++) expect(g[i] - g[i - 1]).toBe(STREEP_CM);
      }
  });

  it('het onderzoek: met de uitersten van de spiekkaart en de juiste conclusie is het onderzoek af', () => {
    for (const v of VOORWERPEN) {
      for (const kies of ['laagste', 'hoogste'] as const) {
        const metingen: Record<number, string> = {};
        for (const cm of STANDAARD_AFSTANDEN) {
          const g = goedeAflezingen(v, cm);
          metingen[cm] = komma(g[kies === 'laagste' ? 0 : g.length - 1]);
        }
        expect(kijkOnderzoekNa({ voorwerp: v, metingen, hypothese: 'kleiner', conclusie: 'dichter-groter' }).stap, `${v} ${kies}`).toBe('klaar');
      }
    }
    expect(antwoord('onderzoek-schaduw')).toContain('hoe dichter de zaklamp, hoe groter de schaduw');
  });

  it('een streepje van de meetlat is een halve centimeter', () => {
    expect(STREEP_CM).toBe(0.5);
    expect(SPIEKKAART.fouten.find((r) => r.foutpatroon === 'meetlat-onnauwkeurig')?.zeg).toContain('Een streepje is een halve centimeter');
  });

  it('de check: vraag 1 C, vraag 2 groter, vraag 3 A', () => {
    expect(CHECKS_4.map((v) => v.opties[juisteIndex(v)].t)).toEqual(['C', 'groter', 'A']);
    expect(antwoord('check')).toBe('Vraag 1: C. Vraag 2: groter. Vraag 3: A.');
  });

  it('de foutpatronen van de check horen bij de keuze die ze verraden', () => {
    const uitCheck = new Set(CHECKS_4.flatMap((v) => v.opties.flatMap((o) => (o.fout ? [o.fout] : []))));
    for (const r of SPIEKKAART.fouten.filter((x) => x.bewijzen.some((b) => b.startsWith('4c')))) {
      expect(uitCheck.has(foutpatroonUitManifest(r.foutpatroon) as string), r.foutpatroon).toBe(true);
    }
  });
});

// ─── Letterlijke teksten uit de gegevens ─────────────────────────────────────

describe.skipIf(GEGEVENSRUN)('de teksten van de doelen komen letterlijk uit public/', () => {
  const set = GEGEVENSRUN ? undefined : leesJson<MinimumdoelenSetBestand>('public', 'leerplannen', 'minimumdoelen', 'ODS_3408.json');
  const bij = GEGEVENSRUN ? undefined : leesJson<GoBijMinimumdoelBestand>('public', 'basis', 'go', 'bij-minimumdoel', '3.json');
  const wt = GEGEVENSRUN ? undefined : leesJson<GoLeerplanBestand>('public', 'basis', 'go', 'leerplan', 'WT.json');
  const html = readFileSync(join(REPO, 'tools', 'prototypes', 'lichtkamer', 'lichtkamer.html'), 'utf8');

  const bronnen: LesmateriaalBronnen = {
    minimumdoel(s, id) {
      if (s !== set?.set.id) return undefined;
      const d = set.doelen.find((x) => String(x.id) === id);
      return d ? { code: d.code, tekst: htmlNaarTekst(d.tekst) } : undefined;
    },
    goBijMinimumdoel(id, code) {
      const lijst = new Map(Object.entries(bij?.doelen ?? {})).get(id) ?? [];
      const g = lijst.find((x) => x.code === code && x.status === 'officieel');
      return g ? { tekst: g.tekst, leeftijden: g.leeftijden } : undefined;
    },
    foutpatroon: foutpatroonUitManifest,
  };

  it('vulSpiekkaart vindt alles, zonder fouten', () => {
    const { kaart, fouten } = vulSpiekkaart(SPIEKKAART, bronnen);
    expect(fouten).toEqual([]);
    expect(kaart?.doelen.map((d) => [d.id, d.code, d.tekst])).toEqual([
      ['92767', '3.5.4', 'De leerlingen kennen licht: rechtlijnige beweging.'],
      ['92775', '3.6.3', 'De leerlingen kunnen een voorafgaand opgezet eerlijk onderzoek uitvoeren.'],
      ['92777', '3.6.4', 'De leerlingen kunnen systematisch waarnemingen noteren en conclusies trekken.'],
    ]);
    expect(kaart?.fouten.find((r) => r.foutpatroon === 'schaduw-kant-lamp')?.tekst).toBe('schaduw aan de kant van de lamp');
  });

  it('een ontbrekend id geeft een fout en geen halve spiekkaart', () => {
    const kapot = { ...SPIEKKAART, doelen: [{ ...SPIEKKAART.doelen[0], id: '99999', go: [{ code: 'WT.999' }] }], fouten: [{ ...SPIEKKAART.fouten[0], foutpatroon: 'bestaat-niet' }] };
    const { kaart, fouten } = vulSpiekkaart(kapot, bronnen);
    expect(kaart).toBeNull();
    expect(fouten).toHaveLength(3);
  });

  it('elk leerplandoel van het GO! is officieel aan zijn minimumdoel gekoppeld, met dezelfde tekst als in het leerplan', () => {
    const perCode = new Map((wt?.doelen ?? []).map((d) => [d.code, d]));
    for (const d of SPIEKKAART.doelen)
      for (const g of d.go) {
        const gb = bronnen.goBijMinimumdoel(d.id, g.code);
        expect(gb, `${g.code} bij ${d.id}`).toBeDefined();
        const lp = perCode.get(g.code);
        expect(lp?.tekst, g.code).toBe(gb?.tekst);
        expect(lp?.minimumdoelen.refs.some((r) => r.set === d.set && r.id === d.id && r.status === 'officieel'), g.code).toBe(true);
      }
  });

  it('wat de spiekkaart over het GO! zegt, klopt: voor 8-9 jaar geen doel over schaduw bij 92767', () => {
    const lijst = new Map(Object.entries(bij?.doelen ?? {})).get('92767') ?? [];
    expect(lijst.filter((g) => g.leeftijden.includes('8-9') && /schaduw/i.test(g.tekst))).toEqual([]);
    // de schaduwdoelen die wel op de kaart staan, zijn voor jongere kinderen
    expect(lijst.filter((g) => /schaduw/i.test(g.tekst)).map((g) => g.code)).toEqual(['WT.343', 'WT.344']);
    expect(SPIEKKAART.goTerInfo.zin).toContain('Voor 8-9 jaar koppelt het GO! geen doel over schaduw aan 92767.');
    expect(bronvermeldingLeerplan(SPIEKKAART.goTerInfo.goVak)).toContain('doelenset wetenschap en techniek');
  });

  it('de zin in kindertaal en "zo zie je het" staan letterlijk zo in de doelkaart van het prototype', () => {
    for (const d of SPIEKKAART.doelen) {
      expect(html, d.id).toContain(`id:'${d.id}'`);
      expect(html, d.id).toContain(`kind:'${d.kind}'`);
      expect(html, d.id).toContain(`zie:'${d.zie}'`);
    }
  });

  it('de spiekkaart past op één blad A4, recto-verso: hoogstens 500 woorden per kant, met de doelteksten erbij', () => {
    // Voorkant: titel, doelen, materiaal, lesverloop en antwoorden. Achterkant: als het misloopt, plan B en ter info.
    // 500 woorden per kant blijft leesbaar op 10 punt; LK-8 kijkt in de afdruk na dat het twee bladzijden zijn.
    const { kaart } = vulSpiekkaart(SPIEKKAART, bronnen);
    const teksten = [...tekstenVanSpiekkaart(kaart as NonNullable<typeof kaart>), bronvermeldingLeerplan(SPIEKKAART.goTerInfo.goVak)];
    const keer = teksten.indexOf('Als het misloopt bij een kind');
    expect(keer).toBeGreaterThan(0);
    const voor = telWoorden(teksten.slice(0, keer));
    const achter = telWoorden(teksten.slice(keer));
    expect(voor, 'voorkant').toBeLessThanOrEqual(500);
    expect(achter, 'achterkant').toBeLessThanOrEqual(500);
    expect(voor + achter).toBeGreaterThan(300);
  });
});

// ─── Taal en privacy ─────────────────────────────────────────────────────────

/** Alle tekst van het lesmateriaal, ook die van het observatieblad en het meetblad. */
function alleTekst(): string[] {
  const uit: string[] = [];
  const loop = (x: unknown) => {
    if (typeof x === 'string') uit.push(x);
    else if (Array.isArray(x)) x.forEach(loop);
    else if (x && typeof x === 'object') Object.values(x).forEach(loop);
  };
  loop([SPIEKKAART, OBSERVATIEBLAD, MEETBLAD, OEFENING_TITEL]);
  return uit;
}

describe('leeftijdBereik', () => {
  it('maakt aaneensluitende leeftijden kort, en laat de rest staan', () => {
    expect(leeftijdBereik(['4-5', '5-6', '6-7', '7-8'])).toBe('4-8');
    expect(leeftijdBereik(['8-9', '9-10'])).toBe('8-10');
    expect(leeftijdBereik(['6-7'])).toBe('6-7');
    expect(leeftijdBereik(['2,5-4', '4-5'])).toBe('2,5-5');
    expect(leeftijdBereik(['6-7', '8-9'])).toBe('6-7, 8-9');
    expect(leeftijdBereik([])).toBe('');
  });
});

describe('taal en privacy', () => {
  const tekst = alleTekst().join('\n');

  it('geen emoji en geen "widget"', () => {
    expect(/\p{Extended_Pictographic}/u.test(tekst)).toBe(false);
    expect(/widget/i.test(tekst)).toBe(false);
  });

  it('geen enkel veld vraagt een naam; het observatieblad zegt dat er geen namen op mogen', () => {
    for (const b of OBSERVATIEBLAD.blokken) for (const v of b.velden) expect(/naam|namen/i.test(v.vraag), v.vraag).toBe(false);
    expect(OBSERVATIEBLAD.geenNamen).toContain('Schrijf geen namen van kinderen');
    expect(MEETBLAD.noot).toContain('Geen naam nodig');
  });

  it('het observatieblad vraagt naar toestel, link, 3D, oefening en tijd, en naar wat de leerkracht miste', () => {
    const onderwerpen = new Set(OBSERVATIEBLAD.blokken.map((b) => b.onderwerp));
    for (const o of ['tijd', 'toestel', 'link', '3d', 'oefening', 'gemist'] as const) expect(onderwerpen.has(o), o).toBe(true);
    const turven = OBSERVATIEBLAD.blokken.flatMap((b) => b.velden).find((v) => v.soort === 'turven');
    expect(turven?.soort === 'turven' && turven.foutpatronen).toEqual(SPIEKKAART.fouten.map((r) => r.foutpatroon));
    expect(tekst).toContain('wie welk doel haalde');
  });

  it('plan B heeft de vier storingen van het ontwerp', () => {
    const storingen = SPIEKKAART.planB.map((p) => p.storing);
    for (const s of ['De kijkdoos laadt niet', 'Het netwerk valt weg', 'Een Chromebook valt uit', 'Een kind zit vast']) expect(storingen).toContain(s);
    expect(SPIEKKAART.planB.find((p) => p.storing === 'Een kind zit vast')?.doe).toContain('Lichtstralen');
  });
});
