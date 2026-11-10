// Wijzigingen van een nieuwe import tegenover wat er al in --uit staat (tools/basis/go/maak.ts, stap 9), en de
// schermuitvoer van een run (docs/basisonderwijs/GO-LEERPLAN.md, "Import"; IMP-1, IMP-3 en IMP-7 van de doorlichting
// van november 2026).
//
// De regel: elke wijziging aan een bestaande code, een bestaand lesplan of een bestaande doelenset stopt de import,
// tenzij de hoofdsessie ze bewust aanvaardt met --aanvaard-wijzigingen. Een verdwenen doelenset stopt altijd. Alleen
// iets nieuws (een nieuwe code, een nieuw lesplan, een nieuwe doelenset) stopt niet. Wat er veranderde, staat met oud
// en nieuw in 'wat', zodat niemand blind aanvaardt.
//
// Zuiver: geen I/O. maak.ts leest de oude bestanden en geeft ze mee.
import { canoniek } from '../../minimumdoelen';
import type { Afwijking } from './omzetten';
import { lesplanRegels } from './rondgang';
import {
  GO_MOMENTEN,
  GO_VAKKEN,
  type GoDoelInhoud,
  type GoIndex,
  type GoKoppeling,
  type GoLeerplanBestand,
  type GoLeerplandoel,
  type GoLesplanBestand,
  type GoVak,
  type GoVerwijzingen,
} from './types';

export interface Wijziging {
  /** 'andere tekst', 'andere koppeling', 'verdwenen lesplan' … */
  soort: string;
  /** Wat er veranderde, met oud → nieuw. */
  wat: string;
  /** De lesplannen die de code gebruiken. */
  lesplannen?: string[];
  /** Bij een wijziging van een lesplan: de code van dat lesplan. */
  lesplan?: string;
  /** Stopt de import, tenzij --aanvaard-wijzigingen. */
  stopt: boolean;
  /** Stopt de import altijd, ook met --aanvaard-wijzigingen (een verdwenen doelenset). */
  altijd?: true;
}

const MAX_TEKST = 120;
const kort = (t: string, n = MAX_TEKST) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const gelijk = (a: unknown, b: unknown) => canoniek(a) === canoniek(b);

// ── Doelensets ───────────────────────────────────────────────────────

/**
 * Het pad van elke rubriek: als tekst ('Organismen > Fauna') voor het rapport, en als sleutel (soort, tekst en opmaak
 * van elke rubriek erboven) om te vergelijken. Zo mag een ingevoegde rubriek elders de id's en rijen verschuiven.
 */
function rubriekPaden(b: GoLeerplanBestand): Map<string, { tekst: string; sleutel: string }> {
  const perId = new Map(b.rubrieken.map((r) => [r.id, r]));
  const uit = new Map<string, { tekst: string; sleutel: string }>();
  for (const r of b.rubrieken) {
    const keten: (typeof r)[] = [];
    const gezien = new Set<string>();
    for (let x: typeof r | undefined = r; x && !gezien.has(x.id); x = x.ouder ? perId.get(x.ouder) : undefined) {
      gezien.add(x.id);
      keten.unshift(x);
    }
    uit.set(r.id, { tekst: keten.map((x) => x.tekst).join(' > '), sleutel: canoniek(keten.map((x) => ({ soort: x.soort, tekst: x.tekst, opmaak: x.opmaak ?? null }))) });
  }
  return uit;
}

/** Een koppeling in woorden: 'KO 3.1.3, 3.1.4; L4 2.3.1', met wat niet officieel is of twijfel heeft erbij. */
function koppelingTekst(k: GoKoppeling): string {
  const delen: string[] = [];
  for (const m of GO_MOMENTEN) {
    const refs = k.refs
      .filter((r) => r.moment === m)
      .map((r) => `${r.code}${r.status !== 'officieel' ? ` (${r.status}${r.bronCode !== undefined ? ` voor "${r.bronCode}"` : ''})` : ''}${r.twijfel?.length ? ` [${r.twijfel.join(', ')}]` : ''}`);
    const problemen = k.problemen.filter((p) => p.moment === m).map((p) => `"${p.bronCode}" (${p.reden})`);
    if (refs.length + problemen.length > 0) delen.push(`${m} ${[...refs, ...problemen].join(', ')}`);
  }
  return delen.length > 0 ? delen.join('; ') : 'geen';
}

const verwijzingTekst = (v: GoVerwijzingen) => (v.codes.length + v.kapot.length === 0 ? 'geen' : [...v.codes, ...v.kapot.map((x) => `${x} (kapot)`)].join(', '));
const leeftijdTekst = (l: readonly string[]) => (l.length > 0 ? l.map((x) => `${x} jaar`).join(', ') : 'geen');
const zonderRij = (i: GoDoelInhoud) => ({ ...i, rij: 0 });

/** Hoeveel inhoudsrijen anders zijn, erbij kwamen of verdwenen (langste gemeenschappelijke deelrij), en de eerste die verschilt. */
export function verschilInhoud(oud: readonly GoDoelInhoud[], nieuw: readonly GoDoelInhoud[]): { anders: number; erbij: number; weg: number; eerste: string } {
  const a = oud.map((i) => canoniek(zonderRij(i)));
  const b = nieuw.map((i) => canoniek(zonderRij(i)));
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const samen = lcs[0][0];
  const anders = Math.min(a.length - samen, b.length - samen);
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  const t = (i: GoDoelInhoud | undefined) => (i ? `${i.soort} "${kort(i.tekst, 60)}"` : 'niets');
  return { anders, erbij: b.length - samen - anders, weg: a.length - samen - anders, eerste: `${t(oud[k])} → ${t(nieuw[k])}` };
}

/**
 * De wijzigingen van één doelenset tegenover de vorige import. Per bestaande code apart: de tekst en de opmaak, de
 * koppeling met de minimumdoelen, de leeftijden, de kennisverwerking, de vlaggen en schakels, de rubriek (als pad van
 * teksten) en de inhoud (zonder rijnummers: alleen verschoven rijen zijn geen wijziging). Blijft er daarna nog een
 * verschil over, dan is dat 'aangepast'. Een verdwenen code of een rubriek die er niet meer is, stopt ook; alleen een
 * nieuwe code niet.
 */
export function wijzigingenLeerplan(oud: GoLeerplanBestand, nieuw: GoLeerplanBestand, lesplannen: readonly GoLesplanBestand[]): Wijziging[] {
  const uit: Wijziging[] = [];
  const padOud = rubriekPaden(oud);
  const padNieuw = rubriekPaden(nieuw);
  const nieuwPer = new Map(nieuw.doelen.map((d) => [d.code, d]));
  const lesplannenVan = (code: string) => lesplannen.filter((x) => x.afgeleid.leerplandoelen.some((y) => y.code === code)).map((x) => x.code);
  const genormaliseerd = (d: GoLeerplandoel, paden: ReturnType<typeof rubriekPaden>) => ({ ...d, rij: 0, rubriek: paden.get(d.rubriek)?.sleutel ?? d.rubriek, inhoud: d.inhoud.map(zonderRij) });

  for (const d of oud.doelen ?? []) {
    const n = nieuwPer.get(d.code);
    const lps = lesplannenVan(d.code);
    const met = (soort: string, wat: string): Wijziging => ({ soort, wat, ...(lps.length > 0 ? { lesplannen: lps } : {}), stopt: true });
    if (!n) {
      uit.push(met('verdwenen', d.code));
      continue;
    }
    const voor = uit.length;
    if (n.tekst !== d.tekst) uit.push(met('andere tekst', `${d.code}: "${d.tekst}" → "${n.tekst}"`));
    else if (!gelijk(n.opmaak ?? null, d.opmaak ?? null)) uit.push(met('andere tekst', `${d.code}: de opmaak van "${kort(d.tekst)}" is anders`));
    if (!gelijk(n.minimumdoelen, d.minimumdoelen)) {
      const o = koppelingTekst(d.minimumdoelen);
      const w = koppelingTekst(n.minimumdoelen);
      uit.push(met('andere koppeling', `${d.code}: ${o} → ${w}${o === w ? ` (in de bron: ${JSON.stringify(d.minimumdoelen.bron)} → ${JSON.stringify(n.minimumdoelen.bron)})` : ''}`));
    }
    if (!gelijk(n.leeftijden, d.leeftijden)) uit.push(met('andere leeftijd', `${d.code}: ${leeftijdTekst(d.leeftijden)} → ${leeftijdTekst(n.leeftijden)}`));
    if (n.kennisverwerking !== d.kennisverwerking) uit.push(met('ander niveau', `${d.code}: ${d.kennisverwerking} → ${n.kennisverwerking}`));
    const vs: string[] = [];
    if (!gelijk(n.vlaggen, d.vlaggen)) vs.push(`VLAGGEN ${verwijzingTekst(d.vlaggen)} → ${verwijzingTekst(n.vlaggen)}`);
    if (!gelijk(n.schakels, d.schakels)) vs.push(`SCHAKELS ${verwijzingTekst(d.schakels)} → ${verwijzingTekst(n.schakels)}`);
    if (vs.length > 0) uit.push(met('andere vlaggen of schakels', `${d.code}: ${vs.join('; ')}`));
    const ro = padOud.get(d.rubriek) ?? { tekst: d.rubriek, sleutel: d.rubriek };
    const rn = padNieuw.get(n.rubriek) ?? { tekst: n.rubriek, sleutel: n.rubriek };
    if (ro.sleutel !== rn.sleutel) uit.push(met('andere rubriek', `${d.code}: ${ro.tekst} → ${rn.tekst}${ro.tekst === rn.tekst ? ' (soort of opmaak van een rubriek)' : ''}`));
    if (!gelijk(n.inhoud.map(zonderRij), d.inhoud.map(zonderRij))) {
      const v = verschilInhoud(d.inhoud, n.inhoud);
      uit.push(met('andere inhoud', `${d.code}: ${v.anders} rijen anders, ${v.erbij} erbij, ${v.weg} weg (eerste verschil: ${v.eerste})`));
    }
    // Het vangnet: elk ander verschil (een veld dat hierboven niet vergeleken wordt) stopt ook.
    if (uit.length === voor && !gelijk(genormaliseerd(n, padNieuw), genormaliseerd(d, padOud))) uit.push(met('aangepast', `${d.code}: andere gegevens`));
  }
  const nieuwePaden = new Set([...padNieuw.values()].map((x) => x.sleutel));
  const gemeld = new Set<string>();
  for (const pad of padOud.values()) {
    if (nieuwePaden.has(pad.sleutel) || gemeld.has(pad.sleutel)) continue;
    gemeld.add(pad.sleutel);
    uit.push({ soort: 'andere rubriek', wat: `${oud.vak}: de rubriek "${kort(pad.tekst)}" bestaat niet meer (of heeft een andere soort of opmaak)`, stopt: true });
  }
  const oudeCodes = new Set((oud.doelen ?? []).map((d) => d.code));
  for (const d of nieuw.doelen) if (!oudeCodes.has(d.code)) uit.push({ soort: 'nieuw', wat: d.code, stopt: false });
  return uit;
}

/**
 * De doelensets van de vorige index tegenover deze run. Een doelenset die ontbreekt, stopt altijd (ook met
 * --aanvaard-wijzigingen): een vak verdwijnt nooit stil uit de app. Een nieuwe doelenset stopt niet.
 */
export function wijzigingenDoelensets(oudeIndex: GoIndex | undefined, vakken: readonly GoVak[]): Wijziging[] {
  if (!oudeIndex) return [];
  const uit: Wijziging[] = [];
  const oud = new Set((oudeIndex.leerplan ?? []).map((l) => l.vak));
  for (const v of oud) {
    if (!vakken.includes(v)) uit.push({ soort: 'verdwenen doelenset', wat: `${v} (${GO_VAKKEN[v]?.naam ?? '?'}): de doelenset ontbreekt in de invoer`, stopt: true, altijd: true });
  }
  for (const v of vakken) if (!oud.has(v)) uit.push({ soort: 'nieuwe doelenset', wat: `${v} (${GO_VAKKEN[v].naam})`, stopt: false });
  return uit;
}

// ── Lesplannen ───────────────────────────────────────────────────────

/** Wat er aan een lesplan veranderde: de eerste regel tekst die verschilt, anders de velden die anders zijn. */
export function verschilLesplan(oud: GoLesplanBestand, nieuw: GoLesplanBestand): string {
  const a = lesplanRegels(oud).regels;
  const b = lesplanRegels(nieuw).regels;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `regel ${i}: "${kort(a[i] ?? '')}" → "${kort(b[i] ?? '')}"`;
  }
  const velden: string[] = [];
  if (oud.titel !== nieuw.titel) velden.push(`titel "${oud.titel}" → "${nieuw.titel}"`);
  if (oud.leeftijd !== nieuw.leeftijd) velden.push(`leeftijd ${oud.leeftijd} → ${nieuw.leeftijd}`);
  if (!gelijk(oud.delen, nieuw.delen)) velden.push('de opbouw van de delen (dezelfde tekst)');
  const ao = (oud.afgeleid ?? {}) as unknown as Record<string, unknown>;
  const an = nieuw.afgeleid as unknown as Record<string, unknown>;
  const sleutels = [...new Set([...Object.keys(ao), ...Object.keys(an)])].filter((k) => !gelijk(ao[k], an[k]));
  if (sleutels.length > 0) velden.push(`afgeleid: ${sleutels.join(', ')}`);
  return velden.length > 0 ? velden.join('; ') : 'andere gegevens';
}

/**
 * De lesplannen van deze run tegenover de vorige index en de bestanden in --uit. 'ander lesplan' (de tekst of de
 * afgeleide gegevens zijn veranderd) en 'verdwenen lesplan' stoppen; 'nieuw lesplan' (niet in de vorige index) niet.
 * `oud(code)` geeft het lesplan uit --uit, of undefined als het bestand er niet is.
 */
export function wijzigingenLesplannen(oudeIndex: GoIndex | undefined, oud: (code: string) => GoLesplanBestand | undefined, lesplannen: readonly GoLesplanBestand[]): Wijziging[] {
  const uit: Wijziging[] = [];
  const inIndex = new Set((oudeIndex?.lesplannen ?? []).map((l) => l.code));
  for (const lp of lesplannen) {
    const vorig = oud(lp.code);
    if (vorig) {
      if (vorig.sha256 !== lp.sha256) uit.push({ soort: 'ander lesplan', wat: `${lp.code}: ${verschilLesplan(vorig, lp)} (het aanbod dat erop steunt, wordt 'na te kijken')`, lesplan: lp.code, stopt: true });
    } else if (inIndex.has(lp.code)) {
      uit.push({ soort: 'ander lesplan', wat: `${lp.code}: de vorige index noemt het, maar het bestand in --uit ontbreekt`, lesplan: lp.code, stopt: true });
    } else if (oudeIndex) {
      uit.push({ soort: 'nieuw lesplan', wat: `${lp.code} ${lp.titel} (${lp.leeftijd} jaar), ${lp.afgeleid.leerplandoelen.map((d) => d.code).join(', ')}`, lesplan: lp.code, stopt: false });
    }
  }
  for (const l of oudeIndex?.lesplannen ?? []) {
    if (!lesplannen.some((x) => x.code === l.code)) uit.push({ soort: 'verdwenen lesplan', wat: `${l.code} ${l.titel}`, lesplan: l.code, stopt: true });
  }
  return uit;
}

// ── Schermuitvoer ────────────────────────────────────────────────────

const MAX_REGEL = 240;

/** De wijzigingen gegroepeerd per soort, hoogstens `max` regels; de rest staat in rapport.json. */
export function schermWijzigingen(lijst: readonly Wijziging[], max = 30): string[] {
  const soorten = [...new Set(lijst.map((w) => w.soort))];
  const gesorteerd = soorten.flatMap((s) => lijst.filter((w) => w.soort === s));
  const regels = gesorteerd.slice(0, max).map((w) => {
    const hoe = w.altijd ? ' (stopt altijd)' : w.stopt ? '' : ' (stopt niet)';
    return kort(`  WIJZIGING ${w.soort}${hoe}: ${w.wat}${w.lesplannen?.length ? ` [${w.lesplannen.join(', ')}]` : ''}`, MAX_REGEL);
  });
  if (gesorteerd.length > max) regels.push(`  … en nog ${gesorteerd.length - max} (zie rapport.json)`);
  return regels;
}

/** 'andere tekst 2, nieuw 1': het aantal wijzigingen per soort. */
export function tellingWijzigingen(lijst: readonly Wijziging[]): string {
  const per = new Map<string, number>();
  for (const w of lijst) per.set(w.soort, (per.get(w.soort) ?? 0) + 1);
  return [...per].map(([s, n]) => `${s} ${n}`).join(', ');
}

/**
 * De nieuwe afwijkingen, gelijke soort en bericht samen ('3 × [lesplan-doeltekst]: … — LP1000 deel 2, WT.008; …'),
 * hoogstens `max` regels; de rest staat in rapport.json.
 */
export function schermAfwijkingen(lijst: readonly Afwijking[], max = 30): string[] {
  const groepen = new Map<string, Afwijking[]>();
  for (const a of lijst) {
    const k = `${a.soort}\u0000${a.bericht}`;
    groepen.set(k, [...(groepen.get(k) ?? []), a]);
  }
  const regels = [...groepen.values()].slice(0, max).map((g) => {
    const a = g[0];
    if (g.length === 1) return kort(`  NIEUW ${a.bestand} ${a.waar} [${a.soort}]: ${a.bericht}`, MAX_REGEL);
    const plaatsen = g.slice(0, 5).map((x) => `${x.bestand} ${x.waar}`).join('; ');
    return kort(`  NIEUW ${g.length} × [${a.soort}]: ${a.bericht} — ${plaatsen}${g.length > 5 ? `; … (+${g.length - 5})` : ''}`, MAX_REGEL);
  });
  if (groepen.size > max) regels.push(`  … en nog ${groepen.size - max} groepen (zie rapport.json)`);
  return regels;
}
