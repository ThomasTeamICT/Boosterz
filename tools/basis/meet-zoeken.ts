// Meetscript voor het zoeken in het basisonderwijs (INGANG.md, § Zoeken en H4). Geen uitrolpoort: de drempels voor de
// zoekkwaliteit staan hier, niet in de tests.
//
// Meet recall, P@3 en het aantal vragen zonder treffer op de bevroren toets src/lib/basis/zoektoets.json (66 vragen,
// sha256 4671c4c7…) over de 998 doelen van het gewoon basisonderwijs. Het goud is het oordeel van agents, niet van
// leerkrachten. Vergelijkt met de oude zoekfunctie (doelPastBijZoek) en met de tabel uit zoekwoorden.ts.
//
// Gebruik:  npx vite-node tools/basis/meet-zoeken.ts [--zonder-tabel] [--details]
//   --zonder-tabel  meet met een lege tabel `ook` (de mechaniek alleen)
//   --details       toont per vraag de cijfers

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlNaarTekst, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from '../../src/lib/minimumdoelen';
import { doelPastBijZoek, zoekTermen } from '../../src/lib/minimumdoelenBron';
import { doelenVanSet, type DoelBasis } from '../../src/lib/basis/doelBasis';
import { basisSet } from '../../src/lib/basis/moment';
import { leesVraag, zoekDoelen, zoekDoelVan, type Zoekwoorden } from '../../src/lib/basis/zoekBasis';
import { ZOEKWOORDEN } from '../../src/lib/basis/zoekwoorden';

const MAP = join(process.cwd(), 'public', 'leerplannen', 'minimumdoelen');
const TOETS = join(process.cwd(), 'src', 'lib', 'basis', 'zoektoets.json');
const SHA = '4671c4c7c4ec40bf72c7b32362733afd59018d616197dae9fc20abed7327cb6f';
const args = new Set(process.argv.slice(2));

const bytes = readFileSync(TOETS);
if (createHash('sha256').update(bytes).digest('hex') !== SHA) throw new Error('zoektoets.json is gewijzigd: de toets is bevroren.');
const toets = JSON.parse(bytes.toString('utf8')) as { vragen: { q: string; goud: string[] }[] };

if (!existsSync(join(MAP, 'index.json'))) throw new Error('De gegevens van de minimumdoelen ontbreken (public/leerplannen/minimumdoelen).');
const index = (JSON.parse(readFileSync(join(MAP, 'index.json'), 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
const doelen: DoelBasis[] = [];
for (const set of index) {
  const info = basisSet(set);
  if (!info || info.soort !== 'bao' || info.generatie !== 'nieuw' || info.leeg) continue;
  const bestand = JSON.parse(readFileSync(join(MAP, set.bestand), 'utf8')) as MinimumdoelenSetBestand;
  doelen.push(...doelenVanSet(bestand, info));
}
const zoekdoelen = doelen.map(zoekDoelVan);
console.log(`${doelen.length} doelen van het gewoon basisonderwijs, ${toets.vragen.length} vragen.`);

const woorden: Zoekwoorden = args.has('--zonder-tabel') ? { ...ZOEKWOORDEN, ook: {} } : ZOEKWOORDEN;

interface Maat {
  n: number;
  recall: number;
  p3: number;
}
function maat(treffers: string[], goud: string[]): Maat {
  const g = new Set(goud);
  const juist = treffers.filter((i) => g.has(i)).length;
  const top = treffers.slice(0, 3);
  return { n: treffers.length, recall: juist / g.size, p3: top.length ? top.filter((i) => g.has(i)).length / top.length : 0 };
}

const doelTekst = new Map(doelen.map((d) => [d.id, `${htmlNaarTekst(d.doelzinHtml)} ${d.uitbreidingHtml ? htmlNaarTekst(d.uitbreidingHtml) : ''}`]));
const oud = (q: string): string[] => {
  const t = zoekTermen(q);
  return doelen
    .filter((d) => doelPastBijZoek({ code: d.code, tekst: doelTekst.get(d.id) ?? '', rubriek: [d.onderwerp, d.subthema].filter(Boolean).join(' › ') }, t))
    .map((d) => d.id);
};
// A: alleen de treffers met alle woorden, en pas bij 0 de deeltreffers (zoals het prototype); B: altijd treffers en dan deeltreffers.
const nieuw = (q: string, deelsAltijd: boolean): string[] => {
  const u = zoekDoelen(zoekdoelen, leesVraag(q, woorden));
  const t = u.treffers.map((x) => x.doel.id);
  return deelsAltijd || t.length === 0 ? [...t, ...u.deels.map((x) => x.doel.id)] : t;
};

const reeksen: [string, (q: string) => string[]][] = [
  ['huidige zoekfunctie (doelPastBijZoek)', oud],
  ['nieuw, treffers (deels pas bij 0)', (q) => nieuw(q, false)],
  ['nieuw, treffers en dan deels', (q) => nieuw(q, true)],
];
const f = (x: number): string => x.toFixed(2).replace('.', ',');
for (const [naam, zoek] of reeksen) {
  let r = 0;
  let p = 0;
  let nul = 0;
  for (const v of toets.vragen) {
    const m = maat(zoek(v.q), v.goud);
    r += m.recall;
    p += m.p3;
    if (m.n === 0) nul++;
    if (args.has('--details')) console.log(`  "${v.q}" n=${m.n} recall=${f(m.recall)} P@3=${f(m.p3)}`);
  }
  const n = toets.vragen.length;
  console.log(`${naam}: recall ${f(r / n)}, P@3 ${f(p / n)}, ${nul} vragen zonder treffer${args.has('--zonder-tabel') ? ' (zonder tabel)' : ''}`);
}

// Acceptatie van H3: 92767 in de top 3 voor einde 4de leerjaar.
for (const q of ['schaduw', 'schaduw onderzoeken', 'schaduw maken', 'licht en schaduw']) {
  const v = leesVraag(q, woorden);
  v.eind = ['L4'];
  const u = zoekDoelen(zoekdoelen, v, { eigenEind: 'L4' });
  const lijst = [...u.treffers, ...u.deels].map((t) => t.doel.id);
  const plek = lijst.indexOf('92767') + 1;
  console.log(`"${q}" einde 4de: 92767 op plaats ${plek || 'niet gevonden'} van ${lijst.length}${plek >= 1 && plek <= 3 ? ' (top 3)' : ' (NIET top 3)'}`);
}
