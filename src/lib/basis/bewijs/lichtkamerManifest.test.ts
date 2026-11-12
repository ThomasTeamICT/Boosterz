// Tests van manifest v1 van de Lichtkamer (LK-2), naast het prototype en naast de gegevens van de app.
//
// Twee bronnen worden ingelezen:
// - het prototype tools/prototypes/lichtkamer/lichtkamer.html: DOELEN, VOORBEELDKLAS, voorbeeldResultaten,
//   BEWIJS_PER_DOEL, statusVoor en CHECKS worden uit de pagina geknipt en in een eigen Node-context uitgevoerd, zodat
//   de vergelijking met de echte code van het prototype gebeurt en niet met een overgetypte kopie;
// - de sets in public/leerplannen/minimumdoelen en het leerplan van het GO! in public/basis/go. Zoals in
//   momentmodel.echt.test.ts slaat GEGEVENSRUN=1 dat deel over: de maandelijkse ophaling wordt er nooit door
//   tegengehouden. De deploy-workflow zet het niet en draait het streng.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../minimumdoelen';
import { goDoelBestaat } from '../go/goModel';
import type { GoIndex, GoLeerplanBestand } from '../go/types';
import { basisSet } from '../moment';
import { geldendeBewijzen, samenvoegen, statusVoor, STATUS_TEKST, type BewijsRecord, type BewijsStatus } from './bewijs';
import { doelSleutelTekst, goDoel, minimumdoel, redenOngeldigeDoelSleutel } from './doelSleutel';
import { LICHTKAMER_MANIFESTEN, LICHTKAMER_MOMENTEN, controleerMoment, lichtkamerMoment, type LichtkamerMoment } from './lichtkamerManifest';
import { MAX_BEWIJZEN, bewijsSleutel, controleerPakket, laatsteVersie, maakBewijsIndex, type BewijsDef, type PakketManifest } from './pakket';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const HTML = readFileSync(join(REPO, 'tools', 'prototypes', 'lichtkamer', 'lichtkamer.html'), 'utf8');
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';

// ─── Het prototype inlezen ───────────────────────────────────────────────────

/** De tekst van `start` tot vóór `eind` (eind niet inbegrepen), of `eind` inbegrepen als `metEind`. */
function knip(start: string, eind: string, metEind = true): string {
  const i = HTML.indexOf(start);
  if (i < 0) throw new Error(`Niet gevonden in lichtkamer.html: ${start}`);
  const j = HTML.indexOf(eind, i + start.length);
  if (j < 0) throw new Error(`Geen einde '${eind}' na '${start}' in lichtkamer.html`);
  return HTML.slice(i, metEind ? j + eind.length : j);
}

interface ProtoDoel {
  code: string;
  id: string;
  tekst: string;
}
interface ProtoOptie {
  t: string;
  juist?: boolean;
  fout?: string;
}
interface ProtoCheck {
  id: string;
  doel: string;
  opties: ProtoOptie[];
}
type ProtoRes = Record<string, { juist: boolean; fout: string | null }>;
type ProtoMoment = 'k' | '4' | '6';

const proto = (() => {
  const bron = [
    knip('const DOELEN = {', '\n};'),
    knip('const VOORBEELDKLAS = [', '];'),
    knip('function voorbeeldResultaten(){', '\n}\n'),
    knip('const BEWIJS_PER_DOEL = {', '\n};'),
    knip('function statusVoor(', '\n'),
    knip('const svg = ', '\nlet checkIdx', false),
  ].join('\n');
  const uit = runInNewContext(`${bron}\n;({ DOELEN, VOORBEELDKLAS, vb: voorbeeldResultaten(), BEWIJS_PER_DOEL, statusVoor, CHECKS })`, {}) as {
    DOELEN: unknown;
    VOORBEELDKLAS: unknown;
    vb: unknown;
    BEWIJS_PER_DOEL: unknown;
    statusVoor: (res: ProtoRes | undefined, doelId: string) => { k: string; t: string };
    CHECKS: unknown;
  };
  // gegevens uit de andere context als gewone JSON, zodat vergelijken in deze context zuiver gebeurt
  const json = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    DOELEN: json<Record<ProtoMoment, ProtoDoel[]>>(uit.DOELEN),
    VOORBEELDKLAS: json<string[]>(uit.VOORBEELDKLAS),
    vb: json<Record<string, ProtoRes>>(uit.vb),
    BEWIJS_PER_DOEL: json<Record<string, string[]>>(uit.BEWIJS_PER_DOEL),
    CHECKS: json<Record<ProtoMoment, ProtoCheck[]>>(uit.CHECKS),
    statusVoor: uit.statusVoor,
  };
})();

/** TAKEN per moment: titel, doel en bewijzen, in de volgorde van het prototype (met de herschikking van TAKEN[4]). */
const protoTaken = (() => {
  const taken: Record<ProtoMoment, { titel: string; doel: string[]; bewijzen: string[] }[]> = { k: [], 4: [], 6: [] };
  const lijst = (s: string) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const re = /TAKEN(?:\.(k)|\[(\d)\])\.push\(\{\s*titel:'([^']*)', hint:'[^']*', doel:\[([^\]]*)\], bewijzen:\[([^\]]*)\]/g;
  for (const m of HTML.matchAll(re)) taken[(m[1] ?? m[2]) as ProtoMoment].push({ titel: m[3], doel: lijst(m[4]), bewijzen: lijst(m[5]) });
  for (const m of HTML.matchAll(/TAKEN\[(\d)\] = \[TAKEN\[\d\]\[(\d)\], TAKEN\[\d\]\[(\d)\], TAKEN\[\d\]\[(\d)\]\];/g)) {
    const k = m[1] as ProtoMoment;
    const oud = taken[k];
    taken[k] = [oud[Number(m[2])], oud[Number(m[3])], oud[Number(m[4])]];
  }
  return taken;
})();

const PROTO_MOMENT: Record<LichtkamerMoment['moment'], ProtoMoment> = { 'einde-kleuter': 'k', 'einde-4de': '4', 'einde-6de': '6' };
const PROTO_STATUS: Record<string, BewijsStatus> = { ja: 'toont-het', bijna: 'nog-wankel', nee: 'nog-niet', leeg: 'nog-geen-bewijs' };

const index = maakBewijsIndex(LICHTKAMER_MANIFESTEN);
const ALLE_DOELEN = LICHTKAMER_MOMENTEN.flatMap((m) => m.doelen);

/** Waar een bewijs-id van het prototype staat: pakket, nummer en definitie. */
function zoek(bewijsId: string): { pakket: string; nummer: number; def: BewijsDef } {
  for (const m of LICHTKAMER_MANIFESTEN) {
    const nummer = laatsteVersie(m).bewijzen.findIndex((b) => b.id === bewijsId);
    if (nummer >= 0) return { pakket: m.pakket, nummer, def: laatsteVersie(m).bewijzen[nummer] };
  }
  throw new Error(`Bewijs ${bewijsId} staat in geen enkel manifest`);
}

/** Kindcodes in plaats van de namen van de voorbeeldklas: het model kent geen namen. */
const KINDCODES = ['AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AJ'];
const T0 = 29_500_000;

/** Records voor de resultaten van het prototype (één kind), met het foutpatroon als nummer. */
function recordsVoor(kindcode: string, res: ProtoRes, tijd: number, toestel: string): BewijsRecord[] {
  return Object.entries(res).map(([id, r]) => {
    const { pakket, nummer, def } = zoek(id);
    const fp = r.juist || !r.fout ? -1 : def.foutpatronen.findIndex((f) => f.tekst === r.fout);
    if (!r.juist && r.fout && fp < 0) throw new Error(`Foutpatroon '${r.fout}' van ${id} staat niet in het manifest`);
    return {
      kindcode,
      pakket,
      versie: 1,
      bewijsnummer: nummer,
      juist: r.juist,
      ...(fp >= 0 ? { foutpatroon: fp } : {}),
      tijd,
      bron: { soort: 'toestel', toestelId: toestel, toestelnummer: 1 },
    };
  });
}

/** De status volgens het prototype en volgens het model, voor dezelfde resultaten. */
function beide(res: ProtoRes, doelId: string): { proto: BewijsStatus; model: BewijsStatus; protoTekst: string } {
  const p = proto.statusVoor(res, doelId);
  const g = geldendeBewijzen(recordsVoor('AB', res, T0, 'XXXX'), index);
  const doel = ALLE_DOELEN.find((d) => d.id === doelId);
  if (!doel) throw new Error(`Doel ${doelId} staat in geen enkel moment`);
  return { proto: PROTO_STATUS[p.k], model: statusVoor(doel, g.perKind.get('AB'), index), protoTekst: p.t };
}

// ─── Het manifest op zich ────────────────────────────────────────────────────

describe('manifest v1 van de Lichtkamer', () => {
  it('drie momenten met elk een eigen pakket, versie 1', () => {
    expect(LICHTKAMER_MOMENTEN.map((m) => [m.moment, m.eindmoment, m.set, m.manifest.pakket])).toEqual([
      ['einde-kleuter', 'K3', 'ODS_3410', 'LKK'],
      ['einde-4de', 'L4', 'ODS_3408', 'LK4'],
      ['einde-6de', 'L6', 'ODS_3409', 'LK6'],
    ]);
    for (const m of LICHTKAMER_MANIFESTEN) expect(m.versies.map((v) => v.versie)).toEqual([1]);
    expect(lichtkamerMoment('einde-4de')?.manifest.pakket).toBe('LK4');
    expect(lichtkamerMoment('einde-5de')).toBeUndefined();
  });

  it.each(LICHTKAMER_MOMENTEN.map((m) => [m.moment, m] as const))('%s: controleerPakket en controleerMoment geven geen fouten', (_n, m) => {
    expect(controleerPakket(m.manifest)).toEqual([]);
    expect(controleerMoment(m)).toEqual([]);
    expect(laatsteVersie(m.manifest).bewijzen.length).toBeLessThanOrEqual(MAX_BEWIJZEN);
  });

  it('de tien doelen van het prototype, elk precies één keer', () => {
    expect(ALLE_DOELEN.map((d) => d.id)).toEqual(['92730', '92729', '92734', '92735', '92767', '92775', '92777', '92833', '92836', '92849']);
    expect([...index.perDoel.keys()].sort()).toEqual(ALLE_DOELEN.map(doelSleutelTekst).sort());
  });

  it('is diep bevroren: niemand verandert tijdens het draaien een bewijsnummer', () => {
    const m = LICHTKAMER_MOMENTEN[1];
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.manifest.versies[0].bewijzen)).toBe(true);
    expect(Object.isFrozen(m.manifest.versies[0].bewijzen[2].doelen[0])).toBe(true);
    expect(() => (m.manifest.versies[0].bewijzen as BewijsDef[]).reverse()).toThrow(TypeError);
  });

  it('controleerMoment vangt een bewijs zonder oefening, een bewijs bij twee oefeningen, een checkvraag bij een oefening en een doel dat niet past', () => {
    const m = LICHTKAMER_MOMENTEN[1];
    const zonderKaartjes = { ...m, oefeningen: m.oefeningen.filter((o) => o.id !== 'drie-kaartjes') };
    expect(controleerMoment(zonderKaartjes).join('\n')).toContain("'4-kaartjes' komt uit geen enkele oefening");
    const checkBijOefening = { ...m, oefeningen: [...m.oefeningen, { id: 'extra', bewijzen: ['4c1'] }] };
    expect(controleerMoment(checkBijOefening).join('\n')).toContain("'4c1' is een checkvraag");
    const vreemdDoel = { ...m, doelen: [...m.doelen, minimumdoel('ODS_3409', '92833')] };
    expect(controleerMoment(vreemdDoel).join('\n')).toContain('komt uit ODS_3409');
    const zonderDoel = { ...m, doelen: m.doelen.slice(1) };
    expect(controleerMoment(zonderDoel).join('\n')).toContain('niet op de doelkaart');
    const dubbel = { ...m, oefeningen: [...m.oefeningen, { id: 'extra', bewijzen: ['4-kaartjes'] }] };
    expect(controleerMoment(dubbel).join('\n')).toContain("'4-kaartjes' hoort bij drie-kaartjes en bij extra");
  });

  it('bevat geen namen van de voorbeeldklas', () => {
    const tekst = JSON.stringify(LICHTKAMER_MOMENTEN);
    expect(proto.VOORBEELDKLAS.length).toBe(8);
    for (const naam of proto.VOORBEELDKLAS) expect(tekst).not.toContain(naam);
  });

  it('een uitgegeven versie ligt vast: wie ze ter plaatse wijzigt, maakt beter een nieuwe versie', () => {
    // De vastgelegde lijsten. Een bewijs: id, soort, doelen, foutpatronen. controleerPakket vergelijkt alleen versies
    // binnen één manifest; deze lijst vangt een wijziging in versie 1 zelf (herschikken, wissen, een ander doel).
    // Nieuwe versie? Voeg ze hier toe, en laat de bestaande regels staan.
    const VASTGELEGD: Record<string, string[]> = {
      'LKK@1': [
        'k-bronnen oefening 92730,92729 glimmen-is-licht',
        'k-spiegel oefening 92730 -',
        'k-kring observatie 92735 -',
        'k-schaduw oefening 92734,92729 -',
        'kc1 check 92730 glimmen-is-licht',
        'kc2 check 92734 schaduw-kant-lamp',
        'kc3 check 92730 geen-spiegel',
      ],
      'LK4@1': [
        '4-voorspel oefening 92767 schaduw-kant-lamp',
        '4-kaartjes oefening 92767 -',
        '4-meten oefening 92775,92777 meetlat-onnauwkeurig,metingen-passen-niet',
        '4-besluit oefening 92777 conclusie-past-niet',
        '4c1 check 92767 schaduw-kant-lamp,schaduw-recht-achter',
        '4c2 check 92767 kleiner-als-dichter,afstand-maakt-niet-uit',
        '4c3 check 92767 gaatjes-even-hoog,licht-maakt-bocht',
      ],
      'LK6@1': [
        '6-stoffen oefening 92833 reflecteren-absorberen,stof-verkeerd',
        '6-voorspel oefening 92833 -',
        '6-cyclus oefening 92836 -',
        '6-plan oefening 92849 meer-dan-een-ding',
        '6-herhaal oefening 92849 -',
        '6c1 check 92833 glas-reflecteert,glas-absorbeert',
        '6c2 check 92833 reflecteren-absorberen,doorlaten-absorberen',
        '6c3 check 92849 meer-dan-een-ding,andere-vraag',
      ],
    };
    const regel = (b: BewijsDef) =>
      `${b.id} ${b.soort} ${b.doelen.map((d) => (d.soort === 'minimumdoel' ? d.id : d.code)).join(',')} ${b.foutpatronen.map((f) => f.id).join(',') || '-'}`;
    const inCode = Object.fromEntries(LICHTKAMER_MANIFESTEN.flatMap((m) => m.versies.map((v) => [`${m.pakket}@${v.versie}`, v.bewijzen.map(regel)])));
    expect(inCode).toEqual(VASTGELEGD);
  });

  it('een versie 2 die achteraan een GO!-code bij een bewijs zet, mag; een die herschikt, niet', () => {
    const lk4 = lichtkamerMoment('einde-4de')?.manifest as PakketManifest;
    const v1 = lk4.versies[0];
    const metGo = v1.bewijzen.map((b) => (b.id === '4-meten' ? { ...b, doelen: [...b.doelen, goDoel('WT.408')] } : b));
    expect(controleerPakket({ ...lk4, versies: [v1, { versie: 2, bewijzen: metGo }] })).toEqual([]);
    const herschikt = [v1.bewijzen[1], v1.bewijzen[0], ...v1.bewijzen.slice(2)];
    expect(controleerPakket({ ...lk4, versies: [v1, { versie: 2, bewijzen: herschikt }] }).join('\n')).toContain('alleen achteraan');
  });
});

// ─── Naast het prototype ─────────────────────────────────────────────────────

describe('manifest v1 naast het prototype (lichtkamer.html)', () => {
  it('BEWIJS_PER_DOEL is hetzelfde als in het prototype', () => {
    const vanManifest = Object.fromEntries(ALLE_DOELEN.map((d) => [d.id, (index.perDoel.get(doelSleutelTekst(d)) ?? []).map((s) => s.split('/')[1]).sort()]));
    const vanPrototype = Object.fromEntries(Object.entries(proto.BEWIJS_PER_DOEL).map(([d, ids]) => [d, ids.slice().sort()]));
    expect(vanManifest).toEqual(vanPrototype);
  });

  it('elke checkvraag: soort check, het doel, de volgorde en de foutpatronen letterlijk', () => {
    for (const m of LICHTKAMER_MOMENTEN) {
      const vragen = proto.CHECKS[PROTO_MOMENT[m.moment]];
      expect(m.check).toEqual(vragen.map((q) => q.id));
      for (const q of vragen) {
        const def = zoek(q.id).def;
        expect(zoek(q.id).pakket).toBe(m.manifest.pakket);
        expect(def.soort).toBe('check');
        expect(def.doelen.map(doelSleutelTekst)).toEqual([`md:${q.doel}`]);
        const fouten = [...new Set(q.opties.flatMap((o) => (o.fout ? [o.fout] : [])))];
        expect(def.foutpatronen.map((f) => f.tekst), q.id).toEqual(fouten);
        expect(q.opties.filter((o) => o.juist)).toHaveLength(1);
      }
    }
  });

  it('elke oefening: dezelfde bewijzen in dezelfde volgorde, en dezelfde doelen als TAKEN', () => {
    for (const m of LICHTKAMER_MOMENTEN) {
      const taken = protoTaken[PROTO_MOMENT[m.moment]];
      expect(taken.length).toBeGreaterThan(0);
      expect(m.oefeningen.map((o) => o.bewijzen)).toEqual(taken.map((t) => t.bewijzen));
      m.oefeningen.forEach((o, i) => {
        const doelen = new Set(o.bewijzen.flatMap((id) => zoek(id).def.doelen.map((d) => (d.soort === 'minimumdoel' ? d.id : d.code))));
        expect([...doelen].sort(), o.id).toEqual(taken[i].doel.slice().sort());
      });
    }
  });

  it("k-kring is een observatie van de leerkracht; de andere oefeningbewijzen zijn oefeningen", () => {
    for (const m of LICHTKAMER_MOMENTEN)
      for (const o of m.oefeningen) for (const id of o.bewijzen) expect(zoek(id).def.soort, id).toBe(id === 'k-kring' ? 'observatie' : 'oefening');
  });

  it('elk foutpatroon staat letterlijk in het prototype, en elk foutpatroon van het prototype staat in het manifest', () => {
    const inManifest = new Set(LICHTKAMER_MANIFESTEN.flatMap((m) => laatsteVersie(m).bewijzen.flatMap((b) => b.foutpatronen.map((f) => f.tekst))));
    for (const t of inManifest) expect(HTML, t).toContain(`'${t}'`);
    // fout:'…' en fout: ok?null:'…'; de vormen met een keuze (verwar?…, kantFout?…) dekt de regel hierboven
    const inPrototype = new Set([...HTML.matchAll(/fout:\s*(?:ok\s*\?\s*null\s*:\s*)?'([^']+)'/g)].map((m) => m[1]));
    for (const t of inPrototype) expect(inManifest.has(t), t).toBe(true);
    expect(inPrototype.size).toBeGreaterThan(10);
    // 'andere fout' is geen foutpatroon: zo'n record is gewoon 'nog niet', zonder patroon
    expect(HTML).toContain("'andere fout'");
    expect(inManifest.has('andere fout')).toBe(false);
  });

  it('de woorden van de status zijn die van statusVoor in het prototype', () => {
    const leeg = proto.statusVoor({}, '92767');
    expect(leeg).toMatchObject({ k: 'leeg', t: STATUS_TEKST['nog-geen-bewijs'] });
  });

  it('de voorbeeldklas van het prototype krijgt dezelfde status als met statusVoor in lichtkamer.html', () => {
    expect(proto.VOORBEELDKLAS).toHaveLength(KINDCODES.length);
    // Elk kind werkte op een ander toestel; de records komen in drie stukken en in een andere volgorde binnen.
    const records = proto.VOORBEELDKLAS.flatMap((naam, i) => recordsVoor(KINDCODES[i], proto.vb[naam], T0 + i, `T${'ABCDEFGH'[i]}${'ABCDEFGH'[i]}${'ABCDEFGH'[i]}`));
    const stukken = [records.filter((_, i) => i % 3 === 0), records.filter((_, i) => i % 3 === 1), records.filter((_, i) => i % 3 === 2)];
    const samen = samenvoegen(stukken[2], stukken[0].slice().reverse(), stukken[1], stukken[0]);
    expect(samen).toHaveLength(records.length);
    const g = geldendeBewijzen(samen, index);
    let vergeleken = 0;
    const gezien = new Set<BewijsStatus>();
    proto.VOORBEELDKLAS.forEach((naam, i) => {
      for (const d of ALLE_DOELEN) {
        const p = proto.statusVoor(proto.vb[naam], d.id);
        const model = statusVoor(d, g.perKind.get(KINDCODES[i]), index);
        expect(model, `kind ${i + 1}, doel ${d.id}`).toBe(PROTO_STATUS[p.k]);
        expect(STATUS_TEKST[model]).toBe(p.t);
        gezien.add(model);
        vergeleken++;
      }
    });
    expect(vergeleken).toBe(80);
    // de voorbeeldklas raakt alle vier de statussen
    expect([...gezien].sort()).toEqual(['nog-geen-bewijs', 'nog-niet', 'nog-wankel', 'toont-het']);
  });

  it('op willekeurige resultaten: dezelfde status als statusVoor in het prototype', () => {
    const ids = Object.keys(Object.fromEntries(Object.values(proto.BEWIJS_PER_DOEL).flat().map((id) => [id, true])));
    let a = 12345;
    const r = () => {
      a = (Math.imul(a, 1103515245) + 12345) >>> 0;
      return a / 4294967296;
    };
    for (let n = 0; n < 400; n++) {
      const res: ProtoRes = {};
      for (const id of ids) if (r() < 0.6) res[id] = { juist: r() < 0.6, fout: null };
      for (const d of ALLE_DOELEN) {
        const b = beide(res, d.id);
        expect(b.model, `${JSON.stringify(res)} ${d.id}`).toBe(b.proto);
      }
    }
  });

  it('met meer pogingen per bewijs: de regel per soort kiest, daarna dezelfde status als in het prototype', () => {
    // check: het eerste antwoord telt; oefening en observatie: de laatste poging telt.
    const kc1 = zoek('kc1');
    const kspiegel = zoek('k-spiegel');
    const lijst: BewijsRecord[] = [
      { kindcode: 'AB', pakket: kc1.pakket, versie: 1, bewijsnummer: kc1.nummer, juist: false, foutpatroon: 0, tijd: T0, bron: { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 1 } },
      { kindcode: 'AB', pakket: kc1.pakket, versie: 1, bewijsnummer: kc1.nummer, juist: true, tijd: T0 + 5, bron: { soort: 'toestel', toestelId: 'YYYY', toestelnummer: 2 } },
      { kindcode: 'AB', pakket: kspiegel.pakket, versie: 1, bewijsnummer: kspiegel.nummer, juist: false, tijd: T0, bron: { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 1 } },
      { kindcode: 'AB', pakket: kspiegel.pakket, versie: 1, bewijsnummer: kspiegel.nummer, juist: true, tijd: T0 + 5, bron: { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 1 } },
    ];
    const g = geldendeBewijzen(lijst, index).perKind.get('AB');
    expect(g?.get(bewijsSleutel('LKK', 'kc1'))?.juist).toBe(false);
    expect(g?.get(bewijsSleutel('LKK', 'k-spiegel'))?.juist).toBe(true);
    const res: ProtoRes = { kc1: { juist: false, fout: 'verwart glimmen met zelf licht maken' }, 'k-spiegel': { juist: true, fout: null } };
    expect(statusVoor(minimumdoel('ODS_3410', '92730'), g, index)).toBe(PROTO_STATUS[proto.statusVoor(res, '92730').k]);
  });
});

// ─── Naast de gegevens van de app ────────────────────────────────────────────

const MINIMUMDOELEN = join(REPO, 'public', 'leerplannen', 'minimumdoelen');
const GO_MAP = join(REPO, 'public', 'basis', 'go');
const leesJson = <T>(...pad: string[]): T => JSON.parse(readFileSync(join(...pad), 'utf8')) as T;
const zonderOpmaak = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe.skipIf(GEGEVENSRUN)('manifest v1 naast de sets van de app (public/leerplannen/minimumdoelen)', () => {
  it.each(LICHTKAMER_MOMENTEN.map((m) => [m.moment, m] as const))('%s: elk doel-id bestaat in de set, met de code en de tekst van het prototype', (_n, m) => {
    const bestand = leesJson<MinimumdoelenSetBestand>(MINIMUMDOELEN, `${m.set}.json`);
    expect(bestand.set.id).toBe(m.set);
    const perId = new Map(bestand.doelen.map((d) => [String(d.id), d]));
    const protoDoelen = proto.DOELEN[PROTO_MOMENT[m.moment]];
    expect(m.doelen.map((d) => d.id)).toEqual(protoDoelen.map((d) => d.id));
    for (const d of m.doelen) {
      const inSet = perId.get(d.id);
      expect(inSet, `${d.id} staat niet in ${m.set}`).toBeDefined();
      const p = protoDoelen.find((x) => x.id === d.id) as ProtoDoel;
      expect(inSet?.code, d.id).toBe(p.code);
      // de doelzin van de set en de tekst van het prototype: de ene begint met de andere (het prototype schrijft bij
      // 92729 de opsomming achter de doelzin, de set zet ze in de uitbreiding)
      const uitSet = zonderOpmaak(String(inSet?.tekst));
      const uitProto = p.tekst.replace(/\s+/g, ' ').trim();
      expect(Math.min(uitSet.length, uitProto.length), d.id).toBeGreaterThan(40);
      expect(uitSet.startsWith(uitProto) || uitProto.startsWith(uitSet), `${d.id}: '${uitSet}' tegenover '${uitProto}'`).toBe(true);
    }
  });

  it('elke set hoort bij het eindmoment van zijn moment', () => {
    const indexSets = leesJson<{ sets: MinimumdoelenIndexSet[] }>(MINIMUMDOELEN, 'index.json').sets;
    for (const m of LICHTKAMER_MOMENTEN) {
      const kop = indexSets.find((s) => s.id === m.set);
      expect(kop, m.set).toBeDefined();
      expect(basisSet(kop as MinimumdoelenIndexSet)?.eindmoment, m.set).toBe(m.eindmoment);
    }
  });

  it('elk doel van elk bewijs komt uit de set van zijn moment', () => {
    for (const m of LICHTKAMER_MOMENTEN)
      for (const b of laatsteVersie(m.manifest).bewijzen) for (const d of b.doelen) expect(d.soort === 'minimumdoel' ? d.set : 'go', b.id).toBe(m.set);
  });
});

describe.skipIf(GEGEVENSRUN)('de doelsleutel naast alle sets (public/leerplannen/minimumdoelen)', () => {
  it('elk vast nummer past in de doelsleutel, en een nummer in meer dan één set is overal hetzelfde doel', () => {
    // Hierop rust de keuze om een minimumdoel alleen op zijn vaste nummer te sleutelen (doelSleutel.ts). Verandert de
    // API dat ooit, dan valt deze test, en moet de sleutel de set erbij nemen.
    const perId = new Map<string, { set: string; code: string; tekst: string }>();
    const fouten: string[] = [];
    let tweelingen = 0;
    for (const naam of readdirSync(MINIMUMDOELEN).filter((n) => /^ODS_\d+\.json$/.test(n))) {
      const bestand = leesJson<MinimumdoelenSetBestand>(MINIMUMDOELEN, naam);
      for (const d of bestand.doelen) {
        const sleutel = { soort: 'minimumdoel', set: bestand.set.id, id: d.id };
        const reden = redenOngeldigeDoelSleutel(sleutel);
        if (reden) {
          fouten.push(`${bestand.set.id} ${String(d.id)}: ${reden}`);
          continue;
        }
        const id = String(d.id);
        const al = perId.get(id);
        if (!al) perId.set(id, { set: bestand.set.id, code: d.code, tekst: d.tekst });
        else {
          tweelingen++;
          if (al.code !== d.code || al.tekst !== d.tekst) fouten.push(`${id} heeft in ${al.set} en ${bestand.set.id} een andere code of tekst`);
        }
      }
    }
    expect(fouten.slice(0, 10)).toEqual([]);
    expect(perId.size).toBeGreaterThan(10_000);
    expect(tweelingen).toBeGreaterThan(1_000);
  });
});

describe.skipIf(GEGEVENSRUN)('een GO!-sleutel naast het leerplan van het GO! (public/basis/go)', () => {
  const goIndex = GEGEVENSRUN ? undefined : leesJson<GoIndex>(GO_MAP, 'index.json');
  const wt = GEGEVENSRUN ? undefined : leesJson<GoLeerplanBestand>(GO_MAP, 'leerplan', 'WT.json');

  it('WT.008 bestaat en heeft geen minimumdoel; WT.408 is officieel gekoppeld aan 92775 in ODS_3408', () => {
    expect(goDoelBestaat(goIndex as GoIndex, 'WT.008')).toBe(true);
    expect(goDoelBestaat(goIndex as GoIndex, 'WT.999')).toBe(false);
    const doel = (code: string) => wt?.doelen.find((d) => d.code === code);
    expect(doel('WT.008')?.minimumdoelen.refs).toEqual([]);
    expect(doel('WT.408')?.minimumdoelen.refs.map((r) => [r.set, r.id, r.status])).toEqual([['ODS_3408', '92775', 'officieel']]);
  });

  it('bewijs op een GO!-code telt voor dat leerplandoel, los van het minimumdoel waar het GO! het aan koppelt', () => {
    // Een pakket van het GO! met een oefening voor WT.008 (zonder minimumdoel) en een check voor WT.408 én 92775.
    const go: PakketManifest = {
      pakket: 'GO1',
      versies: [
        {
          versie: 1,
          bewijzen: [
            { id: 'dieren-sorteren', soort: 'oefening', doelen: [goDoel('WT.008')], foutpatronen: [] },
            { id: 'eerlijk-onderzoek', soort: 'check', doelen: [goDoel('WT.408'), minimumdoel('ODS_3408', '92775')], foutpatronen: [{ id: 'twee-dingen', tekst: 'verandert twee dingen tegelijk' }] },
          ],
        },
      ],
    };
    for (const b of go.versies[0].bewijzen)
      for (const d of b.doelen) if (d.soort === 'go') expect(goDoelBestaat(goIndex as GoIndex, d.code), d.code).toBe(true);
    const idx = maakBewijsIndex([...LICHTKAMER_MANIFESTEN, go]);
    // 92775 krijgt nu bewijs uit twee pakketten: 4-meten (LK4) en eerlijk-onderzoek (GO1)
    expect(idx.perDoel.get('md:92775')).toEqual(['LK4/4-meten', 'GO1/eerlijk-onderzoek']);
    expect(idx.perDoel.get('go:WT.408')).toEqual(['GO1/eerlijk-onderzoek']);
    const bron = { soort: 'eigen', toestelId: 'EEEE' } as const;
    const records: BewijsRecord[] = [
      { kindcode: 'AB', pakket: 'GO1', versie: 1, bewijsnummer: 0, juist: true, tijd: T0, bron },
      { kindcode: 'AB', pakket: 'GO1', versie: 1, bewijsnummer: 1, juist: false, foutpatroon: 0, tijd: T0 + 1, bron },
      { kindcode: 'AB', pakket: 'GO1', versie: 1, bewijsnummer: 1, juist: true, tijd: T0 + 2, bron }, // telt niet: het eerste antwoord telt
      { kindcode: 'AB', pakket: 'LK4', versie: 1, bewijsnummer: 2, juist: true, tijd: T0 + 3, bron: { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 4 } },
    ];
    const g = geldendeBewijzen(records, idx).perKind.get('AB');
    expect(statusVoor(goDoel('WT.008'), g, idx)).toBe('toont-het');
    expect(statusVoor(goDoel('WT.408'), g, idx)).toBe('nog-niet');
    expect(statusVoor(minimumdoel('ODS_3408', '92775'), g, idx)).toBe('nog-wankel'); // 4-meten juist, eerlijk-onderzoek fout
    expect(statusVoor(minimumdoel('ODS_3408', '92767'), g, idx)).toBe('nog-geen-bewijs');
    // zonder het GO!-pakket ziet hetzelfde toestel de GO!-records als onbekend, en 92775 als 'toont het'
    const zonderGo = geldendeBewijzen(records, index);
    expect(zonderGo.onbekend).toHaveLength(3);
    expect(statusVoor(minimumdoel('ODS_3408', '92775'), zonderGo.perKind.get('AB'), index)).toBe('toont-het');
  });
});
