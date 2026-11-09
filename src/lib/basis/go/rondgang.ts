// De rondgang (docs/basisonderwijs/GO-LEERPLAN.md, "Controles", § Rondgang): komt alle tekst van het origineel exact
// terug in het omgezette bestand?
//
// Bewust los van omzetten.ts geschreven: de ruwe kant wordt hier rechtstreeks uit de JSON van de lezers opgebouwd, zodat
// een fout in de omzetting (een weggevallen run, een verschoven cel, een lijstitem dat verdwijnt) niet door dezelfde
// fout aan beide kanten verborgen blijft.
//
// - docx: alle tekst uit de body (w:t, w:br, regeleinden en pictogrammen, in documentvolgorde, zonder alinea's met
//   alleen witruimte en zonder paginabreuken) is exact gelijk aan de tekst van het lesplanbestand, met dezelfde
//   tabelstructuur (rij, cel, samenvoeging). Ook gelijk: de aantallen tabellen, rijen, cellen, lijstitems, vette,
//   cursieve en onderlijnde tekens, pictogrammen per soort en beelden.
// - xlsx: elke niet-lege cel van een inhoudsrij komt precies één keer terug, op zijn rijnummer; elk object in het
//   bestand heeft zijn rij in de bron. De minimumdoel-rijen gaan alleen naar het rapport.
//
// Zuiver: geen I/O.
import { GO_LEEFTIJDEN } from './leeftijden';
import type { RuwBlok, RuwDocx, RuwXlsx } from './omzetten';
import { GO_ICONEN, GO_MOMENTEN, type Blok, type Cel, type GoDoelInhoud, type GoIcoon, type GoKoppeling, type GoLeerplanBestand, type GoLeerplandoel, type GoLesplanBestand, type GoRubriek, type Regel } from './types';
import { ICOON_MEDIA, KOL, MOMENT_KOLOMMEN, TYPES, isLeeg } from './vorm';

// ── docx ─────────────────────────────────────────────────────────────

export interface DocxTellingen {
  tabellen: number;
  rijen: number;
  cellen: number;
  lijstitems: number;
  /** Tekens (zonder regeleinden) in vette, cursieve en onderlijnde stukken. */
  vet: number;
  cursief: number;
  onderlijnd: number;
  iconen: Record<GoIcoon, number>;
  beelden: number;
  regels: number;
}

const leegTellingen = (): DocxTellingen => ({
  tabellen: 0,
  rijen: 0,
  cellen: 0,
  lijstitems: 0,
  vet: 0,
  cursief: 0,
  onderlijnd: 0,
  iconen: Object.fromEntries(GO_ICONEN.map((i) => [i, 0])) as Record<GoIcoon, number>,
  beelden: 0,
  regels: 0,
});

const tekens = (s: string) => s.replace(/\n/g, '').length;

/** De regels van de ruwe body: 'P <tekst>' per zichtbare alinea, 'T', 'R', 'C', 'C+' (begin), 'C=' (vervolg), '/T'. */
export function docxRegels(ruw: RuwDocx): { regels: string[]; tellingen: DocxTellingen } {
  const regels: string[] = [];
  const t = leegTellingen();
  const bezoek = (blokken: readonly RuwBlok[]) => {
    for (const b of blokken) {
      if (b.t === 'p') {
        let s = '';
        let zichtbaar = false;
        const opmaak = { vet: 0, cursief: 0, onderlijnd: 0 };
        const iconen: GoIcoon[] = [];
        let beelden = 0;
        for (const r of b.runs) {
          if (r.t === 'tekst') {
            s += r.tekst;
            if (r.tekst.trim() !== '') zichtbaar = true;
            if (r.b) opmaak.vet += tekens(r.tekst);
            if (r.i) opmaak.cursief += tekens(r.tekst);
            if (r.u) opmaak.onderlijnd += tekens(r.tekst);
          } else if (r.t === 'br') {
            if (r.soort !== 'page') s += '\n';
          } else if (r.t === 'tab') {
            s += '\t';
          } else if (r.t === 'beeld') {
            const icoon = r.bestand ? ICOON_MEDIA[r.bestand] : undefined;
            zichtbaar = true;
            if (icoon) {
              s += `⟦${icoon}⟧`;
              iconen.push(icoon);
            } else {
              s += `⟦beeld:${(r.bestand ?? '').split('/').pop() ?? ''}⟧`;
              beelden++;
            }
          }
        }
        if (!zichtbaar) continue;
        regels.push(`P ${s}`);
        t.regels++;
        if (b.num) t.lijstitems++;
        t.vet += opmaak.vet;
        t.cursief += opmaak.cursief;
        t.onderlijnd += opmaak.onderlijnd;
        for (const i of iconen) t.iconen[i]++;
        t.beelden += beelden;
      } else if (b.t === 'tbl') {
        regels.push('T');
        t.tabellen++;
        for (const rij of b.rijen) {
          regels.push('R');
          t.rijen++;
          for (const c of rij.cellen) {
            regels.push(c.vmerge === 'restart' ? 'C+' : c.vmerge ? 'C=' : 'C');
            t.cellen++;
            bezoek(c.blokken);
          }
        }
        regels.push('/T');
      } else {
        regels.push(`? ${b.tag}`);
      }
    }
  };
  bezoek(ruw.body);
  return { regels, tellingen: t };
}

/** Dezelfde regels, uit het omgezette lesplan. */
export function lesplanRegels(lesplan: Pick<GoLesplanBestand, 'delen'>): { regels: string[]; tellingen: DocxTellingen } {
  const regels: string[] = [];
  const t = leegTellingen();
  const regel = (r: Regel, lijstitem: boolean) => {
    let s = '';
    for (const x of r) {
      if ('t' in x) {
        s += x.t;
        if (x.b) t.vet += tekens(x.t);
        if (x.i) t.cursief += tekens(x.t);
        if (x.u) t.onderlijnd += tekens(x.t);
      } else if ('br' in x) {
        s += '\n';
      } else {
        s += `⟦${x.icoon}⟧`;
        t.iconen[x.icoon]++;
      }
    }
    regels.push(`P ${s}`);
    t.regels++;
    if (lijstitem) t.lijstitems++;
  };
  const blok = (b: Blok | Cel['blokken'][number]) => {
    switch (b.soort) {
      case 'kop':
      case 'alinea':
        regel(b.tekst, false);
        return;
      case 'lijst':
        for (const it of b.items) regel(it, true);
        return;
      case 'tabel':
        regels.push('T');
        t.tabellen++;
        for (const rij of b.rijen) {
          regels.push('R');
          t.rijen++;
          for (const c of rij) {
            regels.push(c.samengevoegd === 'begin' ? 'C+' : c.samengevoegd === 'vervolg' ? 'C=' : 'C');
            t.cellen++;
            c.blokken.forEach(blok);
          }
        }
        regels.push('/T');
        return;
      case 'beeld':
        regels.push(`P ⟦beeld:${b.bron}⟧`);
        t.regels++;
        t.beelden++;
        return;
    }
  };
  for (const d of lesplan.delen) d.blokken.forEach(blok);
  return { regels, tellingen: t };
}

export interface RondgangUitkomst {
  gelijk: boolean;
  /** De eerste plaats waar de regels verschillen. */
  verschil?: { plaats: number; bron: string | undefined; bestand: string | undefined };
  /** Tellingen die verschillen: naam → [bron, bestand]. */
  tellingen: Record<string, [number, number]>;
  aantalRegels: number;
}

/** Vergelijkt een lesplan met zijn ruwe docx: exact dezelfde regels en dezelfde tellingen. */
export function rondgangLesplan(ruw: RuwDocx, lesplan: Pick<GoLesplanBestand, 'delen'>): RondgangUitkomst {
  const a = docxRegels(ruw);
  const b = lesplanRegels(lesplan);
  let verschil: RondgangUitkomst['verschil'];
  const n = Math.max(a.regels.length, b.regels.length);
  for (let i = 0; i < n; i++) {
    if (a.regels[i] !== b.regels[i]) {
      verschil = { plaats: i, bron: a.regels[i], bestand: b.regels[i] };
      break;
    }
  }
  const tellingen: Record<string, [number, number]> = {};
  for (const k of ['tabellen', 'rijen', 'cellen', 'lijstitems', 'vet', 'cursief', 'onderlijnd', 'beelden', 'regels'] as const) {
    if (a.tellingen[k] !== b.tellingen[k]) tellingen[k] = [a.tellingen[k], b.tellingen[k]];
  }
  for (const i of GO_ICONEN) if (a.tellingen.iconen[i] !== b.tellingen.iconen[i]) tellingen[`icoon ${i}`] = [a.tellingen.iconen[i], b.tellingen.iconen[i]];
  return { gelijk: verschil === undefined && Object.keys(tellingen).length === 0, verschil, tellingen, aantalRegels: a.regels.length };
}

// ── xlsx ─────────────────────────────────────────────────────────────

export interface XlsxRondgangOpties {
  /** Een rij die volgens bekende-afwijkingen.json een ander TYPE heeft dan er staat (WI rij 521): het TYPE dat geldt. */
  typeVan?: (rij: number) => string | undefined;
  /** Een rubriekrij waarvan de leeftijd bewust niet overgenomen wordt (bekende afwijking). */
  leeftijdGenegeerd?: (rij: number) => boolean;
}

export interface XlsxRondgangUitkomst {
  gelijk: boolean;
  verschillen: string[];
  /** Inhoudsrijen die terugkomen, en de cellen met inhoud daarin (bij de leeftijden alleen een 1). */
  rijen: number;
  cellen: number;
  /** Minimumdoel-rijen (alleen in het rapport). */
  minimumdoelRijen: number;
}

type Treffer =
  | { soort: 'rubriek'; r: GoRubriek }
  | { soort: 'doel'; d: GoLeerplandoel }
  | { soort: 'inhoud'; i: GoDoelInhoud; d: GoLeerplandoel };

/** Het TYPE van de bron voor een object uit het bestand. */
function typeVan(t: Treffer): string {
  if (t.soort === 'rubriek') return t.r.soort;
  if (t.soort === 'doel') return 'doelzin';
  switch (t.i.soort) {
    case 'mia-titel':
      return 'MIA - titel';
    case 'mia':
      return t.i.aanklikbaar ? 'MIA - aanklikbaar' : 'MIA - niet aanklikbaar';
    case 'begrip':
      return 'te hanteren begrippen';
    case 'voorbeelden-titel':
      return 'voorbeelden - titel';
    case 'voorbeeld':
      return 'voorbeelden - bullet';
    default:
      return 'asterisk';
  }
}

/** Vergelijkt een leerplanbestand met zijn ruwe xlsx, cel per cel. */
export function rondgangLeerplan(ruw: RuwXlsx, leerplan: Pick<GoLeerplanBestand, 'rubrieken' | 'doelen'>, opties: XlsxRondgangOpties = {}): XlsxRondgangUitkomst {
  const verschillen: string[] = [];
  const fout = (s: string) => {
    if (verschillen.length < 200) verschillen.push(s);
  };
  const perRij = new Map<number, Treffer>();
  const zet = (rij: number, t: Treffer) => {
    if (perRij.has(rij)) fout(`rij ${rij} staat meer dan één keer in het bestand`);
    perRij.set(rij, t);
  };
  for (const r of leerplan.rubrieken) zet(r.rij, { soort: 'rubriek', r });
  for (const d of leerplan.doelen) {
    zet(d.rij, { soort: 'doel', d });
    for (const i of d.inhoud) zet(i.rij, { soort: 'inhoud', i, d });
  }

  const gezien = new Set<number>();
  let rijen = 0;
  let cellen = 0;
  let minimumdoelRijen = 0;
  for (const rij of ruw.rijen.slice(1)) {
    const c = (k: number) => rij.c[k] ?? null;
    const bronType = c(KOL.type) ?? '';
    if (isLeeg(bronType)) continue;
    const t = perRij.get(rij.r);
    const geldendType = opties.typeVan?.(rij.r) ?? bronType;
    if (!t) {
      if (bronType === 'minimumdoel' && geldendType === 'minimumdoel') minimumdoelRijen++;
      else fout(`rij ${rij.r} (${bronType}) komt niet terug in het bestand`);
      continue;
    }
    gezien.add(rij.r);
    rijen++;
    if (!(geldendType in TYPES)) fout(`rij ${rij.r}: onbekend TYPE "${geldendType}"`);
    if (typeVan(t) !== geldendType) fout(`rij ${rij.r}: TYPE "${geldendType}" in de bron, "${typeVan(t)}" in het bestand`);
    const verantwoord = new Set<number>([KOL.type]);
    cellen++;

    // INHOUD, letterlijk.
    const tekst = t.soort === 'rubriek' ? t.r.tekst : t.soort === 'doel' ? t.d.tekst : t.i.tekst;
    if (c(KOL.inhoud) !== tekst) fout(`rij ${rij.r}: de tekst is niet letterlijk die van de bron`);
    verantwoord.add(KOL.inhoud);
    cellen++;

    // GO! NR. en KENNISVERWERKING (alleen een doelzin).
    if (t.soort === 'doel') {
      if ((c(KOL.code) ?? '').trim() !== t.d.code) fout(`rij ${rij.r}: code "${c(KOL.code) ?? ''}" in de bron, ${t.d.code} in het bestand`);
      if ((c(KOL.kennisverwerking) ?? '').trim() !== t.d.kennisverwerking) fout(`rij ${rij.r}: kennisverwerking anders dan in de bron`);
      verantwoord.add(KOL.code).add(KOL.kennisverwerking);
      cellen += 2;
    }

    // De codekolommen: letterlijk in de bron van de koppeling.
    const koppeling: GoKoppeling | undefined = t.soort === 'doel' ? t.d.minimumdoelen : t.soort === 'inhoud' && 'koppeling' in t.i ? t.i.koppeling : undefined;
    for (const m of GO_MOMENTEN) {
      const k = MOMENT_KOLOMMEN[m].nummer;
      const bron = c(k);
      const inBestand = koppeling?.bron[m];
      if (isLeeg(bron)) {
        if (inBestand !== undefined) fout(`rij ${rij.r}: een koppeling ${m} die niet in de bron staat`);
      } else {
        if (inBestand !== bron) fout(`rij ${rij.r}: de codekolom ${m} ("${bron}") staat niet letterlijk in het bestand`);
        verantwoord.add(k);
        cellen++;
      }
    }

    // VLAGGEN en SCHAKELS (alleen een doelzin).
    if (t.soort === 'doel') {
      for (const [k, v] of [
        [KOL.vlaggen, t.d.vlaggen],
        [KOL.schakels, t.d.schakels],
      ] as const) {
        const bron = c(k);
        if (isLeeg(bron)) {
          if (v.bron !== undefined) fout(`rij ${rij.r}: ${k === KOL.vlaggen ? 'vlaggen' : 'schakels'} die niet in de bron staan`);
        } else {
          if (v.bron !== bron) fout(`rij ${rij.r}: de kolom ${k === KOL.vlaggen ? 'VLAGGEN' : 'SCHAKELS'} staat niet letterlijk in het bestand`);
          verantwoord.add(k);
          cellen++;
        }
      }
    }

    // De leeftijden: een doelzin en een begrip dragen ze; anders alleen nullen (of een bekende uitzondering).
    const lftBron = GO_LEEFTIJDEN.filter((_, i) => c(KOL.eersteLeeftijd + i) === '1');
    const lftBestand = t.soort === 'doel' ? t.d.leeftijden : t.soort === 'inhoud' && t.i.soort === 'begrip' ? t.i.leeftijden : undefined;
    if (lftBestand !== undefined) {
      if (lftBron.join('|') !== lftBestand.join('|')) fout(`rij ${rij.r}: de leeftijden zijn niet die van de bron`);
    } else if (lftBron.length > 0 && !opties.leeftijdGenegeerd?.(rij.r)) {
      fout(`rij ${rij.r}: een leeftijd in de bron die niet in het bestand staat`);
    }
    // Een 0 betekent 'niet voor deze leeftijd': alleen een 1 telt als cel met inhoud. Een andere waarde is niet verantwoord.
    for (let k = KOL.eersteLeeftijd; k <= KOL.laatsteLeeftijd; k++) {
      const v = c(k);
      if (v === '0' || v === '1' || isLeeg(v)) verantwoord.add(k);
      if (v === '1') cellen++;
    }

    // Elke andere niet-lege cel is niet verantwoord.
    rij.c.forEach((v, k) => {
      if (!verantwoord.has(k) && !isLeeg(v)) fout(`rij ${rij.r}, kolom ${k}: de waarde "${(v ?? '').slice(0, 40)}" komt niet terug in het bestand`);
    });
  }
  for (const r of perRij.keys()) if (!gezien.has(r)) fout(`rij ${r} staat in het bestand, maar is geen inhoudsrij van de bron`);
  return { gelijk: verschillen.length === 0, verschillen, rijen, cellen, minimumdoelRijen };
}
