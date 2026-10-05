// ── De controlepoort voor leerplannen (docs/LEERPLANNEN.md § 7) ─────────────
//
// Een pure functie zonder model: elk doel moet letterlijk in de bron staan, de
// nummering moet volledig zijn, elke verwijzing naar een minimumdoel moet bestaan
// en de herkomst moet ingevuld zijn. Pas als er geen enkele fout is, mag een mens
// het leerplan als nagekeken bevestigen (`kanBevestigen`). De berichten zijn voor
// de leerkracht: gewone taal, en "nakijken" in plaats van "controleren".

import type { Curriculum, MinimumdoelRef } from './curriculumTypes';
import { normalizeGoalCode } from './curriculum';
import { beschrijfGat, bronZonderOpmaak, gatenInNummering, schrijfLigaturenUit, voegRegelsSamen } from './leerplanLezer';
import type { MinimumdoelenSetBestand } from './minimumdoelen';

export type BevindingSoort = 'letterlijk' | 'volledig' | 'verwijzing' | 'herkomst' | 'dekking';
export type BevindingErnst = 'fout' | 'waarschuwing' | 'info';

export interface Bevinding {
  soort: BevindingSoort;
  ernst: BevindingErnst;
  doelId?: string;
  code?: string;
  bericht: string;
}

export interface DoelRapport {
  letterlijk: 'ja' | 'nee' | 'onbekend';
  /** ±200 tekens bron rond de vondst (genormaliseerd), met "…" waar afgeknipt. */
  vindplaats?: string;
  verwijzingen: 'ok' | 'probleem' | 'geen';
}

export interface ControleRapport {
  bevindingen: Bevinding[];
  perDoel: Record<string, DoelRapport>;
  tellers: { doelen: number; letterlijk: number; nietLetterlijk: number; verwijzingen: number; verwijzingenOk: number };
  dekking: { set: string; naam: string; nietGedekt: MinimumdoelRef[] }[];
  kanBevestigen: boolean;
  samenvatting: string;
}

export interface ControleOpties {
  /** De brontekst (pdf of geplakte tekst). Zonder bron blijft "letterlijk" onbekend. */
  bronTekst?: string;
  /** De sets minimumdoelen waar het leerplan naar verwijst. */
  sets?: MinimumdoelenSetBestand[];
  /** De bron is niet volledig gelezen (zie `extractPdfLines`). */
  bronAfgekapt?: boolean;
}

// ── Normaliseren voor de vergelijking ───────────────────────────────────────

const AANHALINGSTEKENS_ENKEL = /[‘’‚‛′‹›`´]/g;
const AANHALINGSTEKENS_DUBBEL = /[“”„‟″«»]/g;
const STREEPJES = /[\u2010\u2011\u2012–—―\u2212]/g;
// Als alternatieven en niet als tekenklasse: de verbinder U+200D in een tekenklasse is misleidend.
const NULBREEDTE = /\u200b|\u200c|\u200d|\u2060|\ufeff/g;

/**
 * Tekst klaarmaken om te vergelijken: NFC; zachte afbreekstreepjes weg; afbreking aan het regeleinde
 * hersteld zoals in de lezer ("verwe-" + "ring" → "verwering", "natuur-" + "en" blijft "natuur- en");
 * opsommingstekens vooraan een regel weg; ligaturen uitgeschreven; typografische aanhalingstekens en
 * apostrofs gelijkgetrokken; en- en em-streepjes (en verwante streepjes) → "-"; alle witruimte → één
 * spatie; getrimd. Hoofdletters blijven tellen.
 */
export function normaliseerVoorVergelijking(t: string): string {
  const regels = t.normalize('NFC').split(/\r\n|\r|\n|\f|\u2028|\u2029/);
  return schrijfLigaturenUit(voegRegelsSamen(regels))
    .replace(NULBREEDTE, '')
    .replace(AANHALINGSTEKENS_ENKEL, "'")
    .replace(AANHALINGSTEKENS_DUBBEL, '"')
    .replace(STREEPJES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Hulp ────────────────────────────────────────────────────────────────────

const ERNST_VOLGORDE: Record<BevindingErnst, number> = { fout: 0, waarschuwing: 1, info: 2 };
const VINDPLAATS_MARGE = 200;
const CITAAT = 40;

function meervoud(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}

function kort(t: string, max: number, vanachter = false): string {
  if (t.length <= max) return t;
  return vanachter ? `…${t.slice(t.length - max).trimStart()}` : `${t.slice(0, max).trimEnd()}…`;
}

function uitsnede(bron: string, start: number, lengte: number): string {
  const van = Math.max(0, start - VINDPLAATS_MARGE);
  const tot = Math.min(bron.length, start + lengte + VINDPLAATS_MARGE);
  return `${van > 0 ? '…' : ''}${bron.slice(van, tot)}${tot < bron.length ? '…' : ''}`;
}

const KERN = 12;

/**
 * De langste beginreeks van `t` die in een van de bronnen staat, met de plaats ervan. Eerst de
 * plaatsen waar de eerste 12 tekens staan, en vanaf elk daarvan zo ver mogelijk vergelijken; staan
 * zelfs die 12 tekens nergens, dan binair zoeken op een korter begin (vinden is monotoon: een korter
 * begin vind je altijd als een langer gevonden is). Zo blijft het snel, ook bij een verkeerde bron.
 */
function langsteBegin(t: string, bronnen: readonly string[]): { lengte: number; bron?: string; plaats: number } {
  let beste: { lengte: number; bron?: string; plaats: number } = { lengte: 0, plaats: -1 };
  const kern = t.slice(0, KERN);
  for (const bron of bronnen) {
    for (let p = bron.indexOf(kern); p >= 0; p = bron.indexOf(kern, p + 1)) {
      let k = kern.length;
      while (k < t.length && bron.charCodeAt(p + k) === t.charCodeAt(k)) k++;
      if (k > beste.lengte) beste = { lengte: k, bron, plaats: p };
      if (k === t.length) return beste;
    }
  }
  if (beste.lengte > 0) return beste;
  let laag = 0;
  let hoog = kern.length - 1;
  while (laag < hoog) {
    const midden = Math.ceil((laag + hoog) / 2);
    if (bronnen.some((b) => b.includes(t.slice(0, midden)))) laag = midden;
    else hoog = midden - 1;
  }
  if (laag === 0) return beste;
  const deel = t.slice(0, laag);
  const bron = bronnen.find((b) => b.includes(deel));
  return bron === undefined ? beste : { lengte: laag, bron, plaats: bron.indexOf(deel) };
}

/** Hoe heet een doel in een bericht: zijn code, of "Doel n" zonder code. */
function naamVan(code: string, index: number): string {
  return code.trim() || `Doel ${index + 1}`;
}

// ── De poort ────────────────────────────────────────────────────────────────

/**
 * Kijkt een leerplan na tegen zijn bron en de minimumdoelen (zie de uitleg bovenaan en § 7 van het
 * ontwerp). Letterlijk betekent: de genormaliseerde doeltekst staat in de genormaliseerde bron. Een
 * doel mag daarbij over een paginagrens lopen (kop- en voetregels, paginamarkeringen) en een
 * verwijzing naar een minimumdoel mag uit de zin gehaald zijn; verder moet elk teken kloppen.
 */
export function controleerLeerplan(cur: Curriculum, opties: ControleOpties = {}): ControleRapport {
  const goals = Array.isArray(cur.goals) ? cur.goals : [];
  const bevindingen: (Bevinding & { plaats: number; volg: number })[] = [];
  const voeg = (b: Bevinding, plaats = -1) => bevindingen.push({ ...b, plaats, volg: bevindingen.length });
  const perDoel: Record<string, DoelRapport> = {};
  const tellers = { doelen: goals.length, letterlijk: 0, nietLetterlijk: 0, verwijzingen: 0, verwijzingenOk: 0 };

  // ── Letterlijk ──
  const metBron = typeof opties.bronTekst === 'string';
  const bronnen: string[] = [];
  if (metBron) {
    const bron = opties.bronTekst as string;
    bronnen.push(normaliseerVoorVergelijking(bron));
    const zonderOpmaak = normaliseerVoorVergelijking(bronZonderOpmaak(bron));
    if (zonderOpmaak !== bronnen[0]) bronnen.push(zonderOpmaak);
  } else {
    voeg({
      soort: 'letterlijk',
      ernst: 'info',
      bericht: 'Er is geen brontekst meegegeven: of de doelen letterlijk overgenomen zijn, is niet nagekeken.',
    });
  }
  const vind = (t: string): { bron: string; plaats: number } | undefined => {
    for (const bron of bronnen) {
      const plaats = bron.indexOf(t);
      if (plaats >= 0) return { bron, plaats };
    }
    return undefined;
  };

  goals.forEach((goal, index) => {
    const rapport: DoelRapport = { letterlijk: 'onbekend', verwijzingen: 'geen' };
    perDoel[goal.id] = rapport;
    if (!metBron) return;
    const naam = naamVan(goal.code, index);
    const tekst = normaliseerVoorVergelijking(typeof goal.text === 'string' ? goal.text : '');
    const vondst = tekst ? vind(tekst) : undefined;
    if (vondst) {
      rapport.letterlijk = 'ja';
      rapport.vindplaats = uitsnede(vondst.bron, vondst.plaats, tekst.length);
      tellers.letterlijk++;
      return;
    }
    rapport.letterlijk = 'nee';
    tellers.nietLetterlijk++;
    if (!tekst) {
      voeg({ soort: 'letterlijk', ernst: 'fout', doelId: goal.id, code: goal.code, bericht: `${naam} heeft geen tekst.` }, index);
      return;
    }
    const begin = langsteBegin(tekst, bronnen);
    const goed = tekst.slice(0, begin.lengte);
    const fout = tekst.slice(begin.lengte);
    let bericht: string;
    if (begin.lengte === 0) {
      bericht = `${naam} staat niet letterlijk in de bron: al het begin ("${kort(fout, CITAAT)}") is niet terug te vinden.`;
    } else {
      bericht = `${naam} staat niet letterlijk in de bron. Tot "${kort(goed.trimEnd(), CITAAT, true)}" klopt het; daarna loopt het mis bij "${kort(fout.trimStart(), CITAAT)}".`;
      if (begin.lengte >= 15 && begin.bron !== undefined) rapport.vindplaats = uitsnede(begin.bron, begin.plaats, begin.lengte);
    }
    voeg({ soort: 'letterlijk', ernst: 'fout', doelId: goal.id, code: goal.code, bericht }, index);
  });

  // ── Volledig ──
  if (goals.length === 0) voeg({ soort: 'volledig', ernst: 'fout', bericht: 'Het leerplan heeft geen doelen.' });
  if (opties.bronAfgekapt) {
    voeg({
      soort: 'volledig',
      ernst: 'fout',
      bericht: 'De bron is niet volledig gelezen (te veel pagina\'s of tekst). Er kunnen doelen ontbreken; lees het leerplan in delen in.',
    });
  }
  const eersteMetCode = new Map<string, number>();
  goals.forEach((goal, index) => {
    const code = normalizeGoalCode(typeof goal.code === 'string' ? goal.code : '');
    if (!code) {
      voeg({ soort: 'volledig', ernst: 'fout', doelId: goal.id, bericht: `${naamVan('', index)} heeft geen code.` }, index);
      return;
    }
    const eerder = eersteMetCode.get(code);
    if (eerder === undefined) {
      eersteMetCode.set(code, index);
      return;
    }
    voeg(
      {
        soort: 'volledig',
        ernst: 'fout',
        doelId: goal.id,
        code: goal.code,
        bericht: `De code ${code} komt meer dan één keer voor (doel ${eerder + 1} en doel ${index + 1}). Elke code moet uniek zijn.`,
      },
      index,
    );
  });
  for (const gat of gatenInNummering(goals.map((g) => (typeof g.code === 'string' ? g.code : '')))) {
    const na = goals[gat.voorIndex];
    const enkel = gat.aantal === 1;
    voeg(
      {
        soort: 'volledig',
        ernst: 'waarschuwing',
        doelId: na?.id,
        code: gat.ontbrekend[0],
        bericht: `${beschrijfGat(gat)}; ${enkel ? 'staat het niet in de bron of las de lezer het niet?' : 'staan ze niet in de bron of las de lezer ze niet?'}`,
      },
      gat.voorIndex,
    );
  }

  // ── Verwijzingen ──
  const sets = (opties.sets ?? []).filter((s) => s && s.set && typeof s.set.id === 'string' && Array.isArray(s.doelen));
  const setsOpId = new Map<string, { naam: string; doelen: Map<string, string> }>();
  for (const s of sets) {
    if (setsOpId.has(s.set.id)) continue;
    const doelen = new Map<string, string>();
    for (const d of s.doelen) if (d && typeof d.id === 'string' && d.id.trim() !== '') doelen.set(d.id, d.code);
    setsOpId.set(s.set.id, { naam: s.set.korteNaam?.trim() || s.set.naam, doelen });
  }
  const gedekt = new Set<string>();
  goals.forEach((goal, index) => {
    const rapport = perDoel[goal.id];
    const naam = naamVan(goal.code, index);
    const refs = Array.isArray(goal.refs) ? goal.refs : [];
    if (refs.length === 0) {
      if (goal.refsBron && goal.refsBron.trim()) {
        rapport.verwijzingen = 'probleem';
        voeg(
          {
            soort: 'verwijzing',
            ernst: 'waarschuwing',
            doelId: goal.id,
            code: goal.code,
            bericht: `${naam} verwijst in de bron naar "${kort(goal.refsBron.trim(), 80)}", maar de verwijzing is nog niet gekoppeld aan een minimumdoel.`,
          },
          index,
        );
      }
      return;
    }
    let allesOk = true;
    for (const ref of refs) {
      tellers.verwijzingen++;
      gedekt.add(`${ref.set}\u0000${ref.id}`);
      const set = setsOpId.get(ref.set);
      const wie = `${ref.code || ref.id} (${ref.set})`;
      if (!set) {
        allesOk = false;
        voeg(
          sets.length === 0
            ? { soort: 'verwijzing', ernst: 'info', doelId: goal.id, code: goal.code, bericht: `${naam} verwijst naar ${wie}; die set is niet meegegeven, dus de verwijzing is niet nagekeken.` }
            : { soort: 'verwijzing', ernst: 'fout', doelId: goal.id, code: goal.code, bericht: `${naam} verwijst naar ${wie}, maar die set hoort niet bij de gekozen minimumdoelen.` },
          index,
        );
        continue;
      }
      const codeInSet = set.doelen.get(ref.id);
      if (codeInSet === undefined) {
        allesOk = false;
        voeg({ soort: 'verwijzing', ernst: 'fout', doelId: goal.id, code: goal.code, bericht: `${naam} verwijst naar ${wie}, maar dat minimumdoel bestaat niet in de set ${set.naam}.` }, index);
        continue;
      }
      if ((ref.code ?? '').trim() !== codeInSet.trim()) {
        allesOk = false;
        voeg(
          {
            soort: 'verwijzing',
            ernst: 'waarschuwing',
            doelId: goal.id,
            code: goal.code,
            bericht: `${naam} verwijst naar minimumdoel ${codeInSet} van ${set.naam}, maar de verwijzing noemt het "${ref.code}". Kijk na of het juiste doel gekoppeld is.`,
          },
          index,
        );
        continue;
      }
      tellers.verwijzingenOk++;
    }
    rapport.verwijzingen = allesOk ? 'ok' : 'probleem';
  });

  // ── Herkomst ──
  const herkomst = cur.herkomst;
  if (cur.kind === 'leerplan' && !herkomst) {
    voeg({ soort: 'herkomst', ernst: 'fout', bericht: 'De herkomst ontbreekt: vul in waar het leerplan vandaan komt (net, leerplancode, versie, bron).' });
  }
  if (herkomst && (herkomst.methode === 'pdf' || herkomst.methode === 'tekst') && !herkomst.bronSha256) {
    voeg({ soort: 'herkomst', ernst: 'waarschuwing', bericht: 'De vingerafdruk van het bronbestand ontbreekt: later kan niemand nagaan uit welke bron de doelen komen.' });
  }
  if (cur.net !== 'eigen' && cur.net !== 'minimumdoelen' && !herkomst?.leerplancode?.trim()) {
    voeg({ soort: 'herkomst', ernst: 'waarschuwing', bericht: 'De leerplancode ontbreekt (bv. "I-Aar-a"): vul ze in, zodat je ziet welk leerplan van het net dit is.' });
  }

  // ── Dekking ──
  const dekking: ControleRapport['dekking'] = [];
  for (const [setId, set] of setsOpId) {
    const nietGedekt: MinimumdoelRef[] = [];
    for (const [id, code] of set.doelen) if (!gedekt.has(`${setId}\u0000${id}`)) nietGedekt.push({ set: setId, id, code });
    dekking.push({ set: setId, naam: set.naam, nietGedekt });
    if (nietGedekt.length > 0) {
      voeg({
        soort: 'dekking',
        ernst: 'info',
        bericht: `${nietGedekt.length} van de ${set.doelen.size} minimumdoelen van ${set.naam} (${setId}) ${nietGedekt.length === 1 ? 'wordt' : 'worden'} door geen enkel leerplandoel gedekt.`,
      });
    }
  }

  // ── Samen ──
  bevindingen.sort((a, b) => ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst] || a.plaats - b.plaats || a.volg - b.volg);
  const uit: Bevinding[] = bevindingen.map(({ plaats: _plaats, volg: _volg, ...b }) => b);
  const fouten = uit.filter((b) => b.ernst === 'fout').length;
  const waarschuwingen = uit.filter((b) => b.ernst === 'waarschuwing').length;

  const delen: string[] = [];
  const doelWoord = goals.length === 1 ? 'doel' : 'doelen';
  delen.push(metBron ? `${tellers.letterlijk} van ${goals.length} ${doelWoord} letterlijk` : `${goals.length} ${doelWoord}, letterlijk niet nagekeken (geen bron)`);
  delen.push(tellers.verwijzingen > 0 ? `${tellers.verwijzingenOk} van ${tellers.verwijzingen} ${tellers.verwijzingen === 1 ? 'verwijzing' : 'verwijzingen'} in orde` : 'geen verwijzingen');
  if (fouten > 0) delen.push(meervoud(fouten, 'fout', 'fouten'));
  if (waarschuwingen > 0) delen.push(meervoud(waarschuwingen, 'waarschuwing', 'waarschuwingen'));
  if (fouten === 0 && waarschuwingen === 0) delen.push('geen fouten of waarschuwingen');

  return {
    bevindingen: uit,
    perDoel,
    tellers,
    dekking,
    kanBevestigen: fouten === 0,
    samenvatting: `${delen.join(', ')}.`,
  };
}
