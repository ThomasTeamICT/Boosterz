// Een leesbare tekstweergave van de bestanden van public/basis/go/, voor de nakijker (docs/basisonderwijs/GO-LEERPLAN.md,
// "Nakijken tegen het origineel", ronde 1). De weergave van een lesplan staat naast `lees_docx.py --tekst`: één regel per
// alinea of lijstitem, een regeleinde als \n, tabellen met [rij r kolom k]. Opmaak staat er als tekens bij:
// **vet**, _cursief_, __onderlijnd__, ~~doorgehaald~~, ^superschrift^, en een pictogram als [vlag], [schakel] …
// Plaatsen in In het kort tellen vanaf 1; blok 1 is de kop van het deel. Ook rij, kolom, regel (het blok binnen een
// cel) en item tellen vanaf 1, zoals de labels [rij r kolom k]; in de JSON tellen ze allemaal vanaf 0.
//
// Gebruik:
//   npx vite-node tools/basis/go/toon.ts <bestand.json>... [--uit <map>] [--doel <code>]...
//     lesplannen/<code>.json   het hele lesplan, daarna 'In het kort' (de afgeleide gegevens met hun plek)
//     leerplan/<vak>.json      alle leerplandoelen, of alleen die van --doel (bv. --doel WT.086 --doel WT.001)
//   Zonder --uit naar het scherm; met --uit één <naam>.txt per bestand, in een map buiten de repo.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { leeftijdenLabel } from '../../../src/lib/basis/go/leeftijden';
import { GO_VOORSTEL_LABEL, bronvermeldingLeerplan, bronvermeldingLesplan, type Blok, type Cel, type GoKoppeling, type GoLeerplanBestand, type GoLesplanBestand, type Regel, type Wijzer } from '../../../src/lib/basis/go/types';
import { tekstOpWijzer, valideerGoLeerplan, valideerGoLesplan } from '../../../src/lib/basis/go/valideer';

/** Een regel met de opmaak als tekens; een regeleinde als \n, zoals lees_docx.py --tekst. */
export function regelAlsTekst(r: Regel): string {
  return r
    .map((s) => {
      if ('br' in s) return '\\n';
      if ('icoon' in s) return `[${s.icoon}]`;
      let t = s.t.replace(/\n/g, '\\n');
      if (s.sup) t = `^${t}^`;
      if (s.s) t = `~~${t}~~`;
      if (s.u) t = `__${t}__`;
      if (s.i) t = `_${t}_`;
      if (s.b) t = `**${t}**`;
      return t;
    })
    .join('');
}

function blokAlsTekst(b: Blok | Cel['blokken'][number], inspring: string, uit: string[]): void {
  switch (b.soort) {
    case 'kop':
      uit.push(`${inspring}[kop ${b.niveau}] ${regelAlsTekst(b.tekst)}`);
      return;
    case 'alinea':
      uit.push(`${inspring}${regelAlsTekst(b.tekst)}`);
      return;
    case 'lijst':
      b.items.forEach((it, i) => uit.push(`${inspring}${b.genummerd ? `${(b.start ?? 1) + i}.` : '-'} ${regelAlsTekst(it)}`));
      return;
    case 'beeld':
      uit.push(`${inspring}[beeld: ${b.bron}, ${b.breedte}x${b.hoogte} px, ${b.status}${b.status === 'getoond' ? `, ${b.bestand}` : ''}]`);
      if (b.status === 'getoond') uit.push(`${inspring}  alt: ${b.alt}`);
      if (b.uitleg) uit.push(`${inspring}  uitleg: ${b.uitleg}`);
      return;
    case 'tabel':
      uit.push(`${inspring}[tabel]`);
      b.rijen.forEach((rij, r) =>
        rij.forEach((c, k) => {
          uit.push(`${inspring}  [rij ${r + 1} kolom ${k + 1} ${c.rol}${c.samengevoegd ? ` ${c.samengevoegd}` : ''}]`);
          for (const x of c.blokken) blokAlsTekst(x, `${inspring}    `, uit);
        }),
      );
      uit.push(`${inspring}[einde tabel]`);
      return;
  }
}

const wijzerTekst = (w: Wijzer) => `deel ${w.deel}, blok ${w.blok + 1}${w.rij !== undefined ? `, rij ${w.rij + 1}, kolom ${(w.kolom ?? 0) + 1}` : ''}${w.regel !== undefined ? `, regel ${w.regel + 1}` : ''}${w.item !== undefined ? `, item ${w.item + 1}` : ''}`;
const eersteRegel = (s: string | undefined) => (s ?? '').split('\n')[0];

export function lesplanAlsTekst(l: GoLesplanBestand): string {
  const uit: string[] = [`# ${l.code} — ${l.titel} (${l.leeftijd} jaar)`, bronvermeldingLesplan(l.code), `bron: ${l.bron.bestand.naam}, ${l.bron.bestand.bytes} bytes, sha256 ${l.bron.bestand.sha256}, gemaakt ${l.bron.bestand.datum}; ingelezen ${l.bron.ingelezen}`, ''];
  for (const d of l.delen) {
    uit.push(`== deel ${d.nr}`);
    for (const b of d.blokken) blokAlsTekst(b, '', uit);
    uit.push('');
  }
  const a = l.afgeleid;
  uit.push('== In het kort (afgeleid; elke tekst staat letterlijk op de aangegeven plek)');
  uit.push(`vakdiscipline: ${a.vakdiscipline} (${a.vak}); lessenlijn: ${a.lessenlijn}; lessenreeks: ${a.lessenreeks}`);
  uit.push(`didactische fiches: ${a.didactischeFiches.map((f) => `${f.code} ${f.titel}`).join('; ')}`);
  uit.push('leerplandoelen:');
  for (const d of a.leerplandoelen) uit.push(`  ${d.code} [${d.kennisverwerking}] ${d.tekst} (${leeftijdenLabel(d.leeftijden)})  ← ${wijzerTekst(d.waar)}`);
  uit.push("diploma's:");
  for (const d of a.diplomas) {
    uit.push(`  ${d.naam} ${d.leeftijd} jaar  ← ${wijzerTekst(d.waar)}`);
    for (const ik of d.ikDoelen) for (const z of ik.zinnen) uit.push(`    ${ik.code}: ${z.replace(/\n/g, '\\n')}`);
  }
  uit.push(`deelconcepten: ${a.deelconcepten.join(' | ')}`);
  uit.push(`GO! concepten: ${a.goConcepten.join(' | ')}`);
  uit.push(`vlaggen: ${a.vlaggen.join(', ') || 'geen'}; schakels: ${a.schakels.join(', ') || 'geen'}`);
  uit.push('stappen van de leskern:');
  for (const s of a.stappen) uit.push(`  ${s.nr}. ${s.naam}  Wat: "${eersteRegel(tekstOpWijzer(l, s.wat))}" ← ${wijzerTekst(s.wat)}; Hoe: "${eersteRegel(tekstOpWijzer(l, s.hoe))}" ← ${wijzerTekst(s.hoe)}`);
  uit.push('trainen:');
  for (const t of a.trainen) uit.push(`  ${t.titel ?? '(zonder titel)'}  van ${wijzerTekst(t.vanaf)} tot ${wijzerTekst(t.tot)}: "${eersteRegel(tekstOpWijzer(l, t.vanaf)).slice(0, 80)}"`);
  const mat = tekstOpWijzer(l, a.materiaal) ?? '';
  uit.push(`materiaal: ${mat.split('\n').length} regels  ← ${wijzerTekst(a.materiaal)}`);
  return `${uit.join('\n')}\n`;
}

function koppelingAlsTekst(k: GoKoppeling): string[] {
  const uit: string[] = [];
  const bron = Object.entries(k.bron)
    .map(([m, t]) => `${m} ${t}`)
    .join('; ');
  if (bron) uit.push(`bron: ${bron}`);
  for (const r of k.refs) {
    const extra = [r.status === 'voorstel' ? `${GO_VOORSTEL_LABEL}; in de bron "${r.bronCode ?? ''}"` : '', ...(r.twijfel ?? []).map((t) => `twijfel: ${t}`)].filter(Boolean);
    uit.push(`→ ${r.moment} ${r.code} (${r.set}/${r.id})${extra.length ? ` [${extra.join('; ')}]` : ''}`);
  }
  for (const p of k.problemen) uit.push(`✗ ${p.moment} "${p.bronCode}": ${p.reden === 'onleesbaar' ? 'geen geldig nummer' : 'bestaat niet in de officiële minimumdoelen'}`);
  return uit;
}

export function leerplanAlsTekst(l: GoLeerplanBestand, codes: readonly string[]): string {
  const rubriek = new Map(l.rubrieken.map((r) => [r.id, r]));
  const pad = (id: string): string[] => {
    const r = rubriek.get(id);
    return r ? [...(r.ouder ? pad(r.ouder) : []), r.tekst.trim()] : [];
  };
  const uit: string[] = [`# Leerplan van het GO!: ${l.naam} (${l.vak}), ${l.doelen.length} leerplandoelen`, bronvermeldingLeerplan(l.vak), `bron: ${l.bron.bestand.naam}, ${l.bron.bestand.bytes} bytes, sha256 ${l.bron.bestand.sha256}, gewijzigd ${l.bron.bestand.datum}; ingelezen ${l.bron.ingelezen}`, ''];
  for (const d of l.doelen) {
    if (codes.length > 0 && !codes.includes(d.code)) continue;
    uit.push(`== ${d.code} (rij ${d.rij}) — ${pad(d.rubriek).join(' › ')}`);
    uit.push(`${d.code} [${d.kennisverwerking}] ${d.opmaak ? regelAlsTekst(d.opmaak) : d.tekst} (${leeftijdenLabel(d.leeftijden)})`);
    for (const i of d.inhoud) {
      const t = i.opmaak ? regelAlsTekst(i.opmaak) : i.tekst;
      const soort = i.soort === 'mia' ? `mia${i.aanklikbaar ? ' (aanklikbaar)' : ''}` : i.soort;
      uit.push(`  ${soort}: ${t}${i.soort === 'begrip' ? ` (${leeftijdenLabel(i.leeftijden) || 'geen leeftijd'})` : ''}  [rij ${i.rij}]`);
      if ('koppeling' in i && i.koppeling) for (const k of koppelingAlsTekst(i.koppeling)) uit.push(`    ${k}`);
    }
    const k = koppelingAlsTekst(d.minimumdoelen);
    uit.push(k.length > 0 ? `minimumdoelen: ${k.join(' ')}` : 'minimumdoelen: het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel');
    if (d.vlaggen.bron) uit.push(`vlaggen: ${d.vlaggen.bron}${d.vlaggen.kapot.length ? ` (kapot: ${d.vlaggen.kapot.join(' | ')})` : ''}`);
    if (d.schakels.bron) uit.push(`schakels: ${d.schakels.bron}${d.schakels.kapot.length ? ` (kapot: ${d.schakels.kapot.join(' | ')})` : ''}`);
    uit.push('');
  }
  return `${uit.join('\n')}\n`;
}

function binnenRepo(pad: string): boolean {
  let p = existsSync(pad) ? realpathSync(pad) : resolve(pad);
  for (;;) {
    if (existsSync(join(p, '.git'))) return true;
    const ouder = dirname(p);
    if (ouder === p) return false;
    p = ouder;
  }
}

function hoofd(argv: string[]): number {
  const bestanden: string[] = [];
  const codes: string[] = [];
  let uitMap: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uit') uitMap = argv[++i];
    else if (a === '--doel') codes.push(argv[++i] ?? '');
    else if (a.startsWith('--')) {
      console.error(`FOUT: onbekend argument ${a}`);
      return 1;
    } else bestanden.push(a);
  }
  if (bestanden.length === 0 || (uitMap !== undefined && uitMap === '')) {
    console.error('Gebruik: npx vite-node tools/basis/go/toon.ts <bestand.json>... [--uit <map>] [--doel <code>]...');
    return 1;
  }
  if (uitMap && binnenRepo(uitMap)) {
    console.error(`FOUT: --uit ${uitMap} ligt binnen een git-repository; gebruik een map buiten de repo.`);
    return 1;
  }
  let code = 0;
  for (const b of bestanden) {
    const json = JSON.parse(readFileSync(b, 'utf8')) as { kind?: unknown };
    let tekst: string;
    if (json.kind === 'go-lesplan') {
      const fouten = valideerGoLesplan(json);
      if (fouten.length > 0) console.error(`LET OP ${b}: de validator meldt ${fouten.length} fouten, bv. ${fouten[0]}`);
      tekst = lesplanAlsTekst(json as GoLesplanBestand);
    } else if (json.kind === 'go-leerplan') {
      const fouten = valideerGoLeerplan(json);
      if (fouten.length > 0) console.error(`LET OP ${b}: de validator meldt ${fouten.length} fouten, bv. ${fouten[0]}`);
      tekst = leerplanAlsTekst(json as GoLeerplanBestand, codes);
    } else {
      console.error(`FOUT: ${b} is geen lesplan of leerplan van het GO!`);
      code = 1;
      continue;
    }
    if (uitMap) {
      mkdirSync(uitMap, { recursive: true });
      const doel = join(uitMap, `${basename(b, '.json')}.txt`);
      writeFileSync(doel, tekst);
      console.log(doel);
    } else {
      process.stdout.write(tekst);
    }
  }
  return code;
}

process.exitCode = hoofd(process.argv.slice(2));
