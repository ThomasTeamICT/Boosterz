// ── Opslag van leerplannen (wf.curricula.v1) ────────────────────────────────
// Basis-CRUD en opzoekhulpen. Uitgebreidere logica (AI-structurering, import
// uit pdf/tekst, dekking) staat in aiCurriculum.ts en de leerplanpagina.

import type {
  ControleStatus,
  Curriculum,
  CurriculumControle,
  CurriculumGoal,
  CurriculumHerkomst,
  CurriculumMethode,
  MinimumdoelRef,
} from './curriculumTypes';
import { CURRICULUM_NETS } from './curriculumTypes';
import { sha256Hex } from './sha256';
import { notifyChange, reportWriteFailure } from './storage';
import { uid } from './utils';

const KEY = 'wf.curricula.v1';

function read(): Curriculum[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Curriculum[]).filter((c) => c && typeof c === 'object' && Array.isArray(c.goals)) : [];
  } catch {
    return [];
  }
}

function write(list: Curriculum[]): boolean {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    ok = false;
    reportWriteFailure(KEY, e);
  }
  notifyChange();
  return ok;
}

export function getCurricula(): Curriculum[] {
  return read();
}
export function getCurriculum(id: string): Curriculum | undefined {
  return read().find((c) => c.id === id);
}
export function saveCurriculum(cur: Curriculum): boolean {
  const all = read();
  const i = all.findIndex((c) => c.id === cur.id);
  // Wie een nagekeken leerplan wijzigt, bewaart het als "gewijzigd": de vingerafdruk beslist.
  const updated = bewaakControle({ ...cur, updatedAt: Date.now() });
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  return write(all);
}
export function deleteCurriculum(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function createCurriculum(init: Partial<Curriculum> & Pick<Curriculum, 'title' | 'net' | 'subject' | 'level'>): Curriculum {
  return {
    id: uid(),
    goals: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...init,
  };
}

/** Doelcode normaliseren voor vergelijking: spaties samenvouwen, hoofdletters. */
export function normalizeGoalCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ').toUpperCase();
}

export interface GoalOption {
  curriculumId: string;
  curriculumTitle: string;
  goal: CurriculumGoal;
}

/** Alle doelen van alle leerplannen, voor keuzelijsten en autocomplete. */
export function allGoalOptions(curriculumId?: string): GoalOption[] {
  const out: GoalOption[] = [];
  for (const cur of read()) {
    if (curriculumId && cur.id !== curriculumId) continue;
    for (const goal of cur.goals) out.push({ curriculumId: cur.id, curriculumTitle: cur.title, goal });
  }
  return out;
}

/** Doel opzoeken op code (in één leerplan, of over alle leerplannen heen). */
export function findGoalByCode(code: string, curriculumId?: string): GoalOption | undefined {
  const want = normalizeGoalCode(code);
  return allGoalOptions(curriculumId).find((o) => normalizeGoalCode(o.goal.code) === want);
}

/** Korte weergave "WIS 2.3 — De leerlingen kunnen …" (afgekapt). */
export function goalLabel(code: string, curriculumId?: string, maxChars = 90): string {
  const hit = findGoalByCode(code, curriculumId);
  if (!hit) return code;
  const t = hit.goal.text.length > maxChars ? hit.goal.text.slice(0, maxChars - 1) + '…' : hit.goal.text;
  return `${hit.goal.code} — ${t}`;
}

// ── Uitbreidingen: labels, groeperen, saneren, JSON-uitwisseling ────────────

/**
 * Vast id van het meegeleverde voorbeeldleerplan (zie lib/seed.ts). Staat hier
 * zodat ook de democursus ernaar kan verwijzen zonder de voorbeelddata zelf te
 * moeten inladen.
 */
export const EXAMPLE_CURRICULUM_ID = 'wf-voorbeeld-nw-1egraad';

/** Leesbare naam van een net/uitgever. */
export function netLabel(net: string): string {
  return CURRICULUM_NETS.find((n) => n.id === net)?.label ?? 'Eigen leerplan';
}

/** Korte omschrijving van een leerplan voor lijsten en keuzevelden. */
export function curriculumLabel(cur: Curriculum): string {
  return [cur.subject, cur.level].filter(Boolean).join(' · ') || netLabel(cur.net);
}

/** Lijst doelcodes opschonen: trimmen, normaliseren, leeg weg, ontdubbelen. */
export function normalizeGoalCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    if (typeof raw !== 'string') continue;
    const code = normalizeGoalCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export interface GoalThemeGroup {
  /** Lege string = doelen zonder thema. */
  theme: string;
  goals: CurriculumGoal[];
}

/** Doelen gegroepeerd per thema, in volgorde van eerste voorkomen. */
export function goalsByTheme(goals: CurriculumGoal[]): GoalThemeGroup[] {
  const groups = new Map<string, GoalThemeGroup>();
  for (const goal of goals) {
    const theme = (goal.theme ?? '').trim();
    const group = groups.get(theme) ?? { theme, goals: [] };
    group.goals.push(goal);
    groups.set(theme, group);
  }
  return [...groups.values()];
}

/** Doelen opzoeken bij een lijst codes (volgorde van de codes blijft). */
export function goalsForCodes(codes: string[], curriculumId?: string): CurriculumGoal[] {
  const out: CurriculumGoal[] = [];
  for (const code of normalizeGoalCodes(codes)) {
    const hit = findGoalByCode(code, curriculumId);
    if (hit) out.push(hit.goal);
  }
  return out;
}

/** Doeltekst afkappen voor chips en tabellen. */
export function shortGoalText(text: string, maxChars = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Tekst inkorten tot `max` tekens zonder een tekenpaar (emoji, …) doormidden te knippen, en
 * opnieuw trimmen. Twee keer toepassen geeft hetzelfde: saneren blijft idempotent.
 */
function kap(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, max);
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return uit.trim();
}

/** Getrimde tekst van hoogstens `max` tekens, of `undefined` als er niets overblijft. */
function tekstVeld(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = kap(v.trim(), max);
  return t === '' ? undefined : t;
}

const SET_ID = /^ODS_\d{1,9}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REFS = 50;
const MAX_SETS = 50;
const METHODES: readonly CurriculumMethode[] = ['officieel', 'export', 'pdf', 'tekst', 'ai', 'handmatig'];
const CONTROLE_STATUSSEN: readonly ControleStatus[] = ['niet-gecontroleerd', 'gecontroleerd', 'gewijzigd'];

function isEindig(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Verwijzingen naar minimumdoelen saneren: alleen elementen met een geldige set ("ODS_<getal>"),
 * een niet-leeg id van hoogstens 64 tekens (een getal wordt tekst) en een code van hoogstens 40
 * tekens (geen tekst = lege code; een te lange code maakt de verwijzing ongeldig). Ontdubbeld op
 * set + id, hoogstens 50. Leeg = `undefined`.
 */
function sanitizeRefs(raw: unknown): MinimumdoelRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const uit: MinimumdoelRef[] = [];
  const gezien = new Set<string>();
  for (const item of raw) {
    if (uit.length >= MAX_REFS) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const set = typeof r.set === 'string' ? r.set.trim() : '';
    if (!SET_ID.test(set)) continue;
    const id = typeof r.id === 'string' ? r.id.trim() : isEindig(r.id) ? String(r.id) : '';
    if (id === '' || id.length > 64) continue;
    const code = typeof r.code === 'string' ? r.code.trim() : '';
    if (code.length > 40) continue;
    const sleutel = `${set}\u0000${id}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ set, id, code });
  }
  return uit.length > 0 ? uit : undefined;
}

/**
 * Tekst met regels: "\r\n" en "\r" worden "\n", per regel witruimte samengevouwen en getrimd, lege
 * regels weg. Officiële doelen bevatten lijsten en alinea's (na `htmlNaarTekst` gescheiden door
 * "\n"); die regeleinden horen bij de tekst en dus bij de vingerafdruk. Idempotent.
 */
function tekstMetRegels(t: string): string {
  return t
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((regel) => regel.replace(/\s+/g, ' ').trim())
    .filter((regel) => regel !== '')
    .join('\n');
}

/** Eén doel defensief saneren (JSON-import, AI-antwoord). */
export function sanitizeGoal(raw: unknown): CurriculumGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const text = tekstMetRegels(str(g.text ?? g.doel ?? g.omschrijving));
  if (!text) return null; // een doel zonder tekst zegt niets
  const code = normalizeGoalCode(str(g.code ?? g.nummer));
  const level = g.level === 'uitbreiding' ? 'uitbreiding' : g.level === 'basis' ? 'basis' : undefined;
  const theme = str(g.theme ?? g.thema ?? g.rubriek).trim();
  const note = tekstMetRegels(str(g.note ?? g.toelichting));
  const goal: CurriculumGoal = {
    id: str(g.id) || uid(),
    code,
    text,
    theme: theme || undefined,
    level,
    note: note || undefined,
  };
  // Versie 2: verwijzingen naar minimumdoelen. Geen lege `refs: []` bewaren.
  const refs = sanitizeRefs(g.refs);
  if (refs) goal.refs = refs;
  const refsBron = tekstVeld(g.refsBron, 500);
  if (refsBron) goal.refsBron = refsBron;
  return goal;
}

/**
 * Lijst doelen saneren: lege doelen vallen weg, codes worden genormaliseerd en
 * ontdubbeld. Doelen zonder code krijgen er zelf een, opgebouwd per thema:
 * "<PREFIX> <thema-nr>.<volgnr>" (bv. "NW 2.3").
 */
export function sanitizeGoals(raw: unknown, opts: { autoPrefix?: string } = {}): CurriculumGoal[] {
  const list = Array.isArray(raw) ? raw : [];
  const goals: CurriculumGoal[] = [];
  for (const item of list) {
    const goal = sanitizeGoal(item);
    if (goal) goals.push(goal);
  }
  const prefix = normalizeGoalCode(opts.autoPrefix ?? 'DOEL') || 'DOEL';
  const themeNumbers = new Map<string, number>();
  const perTheme = new Map<string, number>();
  const used = new Set<string>();
  const out: CurriculumGoal[] = [];
  for (const goal of goals) {
    let code = goal.code;
    if (!code) {
      const theme = (goal.theme ?? '').trim().toLowerCase();
      let nr = themeNumbers.get(theme);
      if (nr === undefined) {
        nr = themeNumbers.size + 1;
        themeNumbers.set(theme, nr);
      }
      const seq = (perTheme.get(theme) ?? 0) + 1;
      perTheme.set(theme, seq);
      code = `${prefix} ${nr}.${seq}`;
    }
    if (used.has(code)) continue; // dubbele code = dubbel doel
    used.add(code);
    out.push({ ...goal, code });
  }
  return out;
}

/**
 * Herkomst saneren: alleen met een geldige methode. Tekstvelden getrimd en ingekort; `bronUrl`
 * alleen als http(s)-adres (een "javascript:"-link uit een gedeeld bestand mag nooit een link in de
 * app worden); `geldigVanaf` alleen als JJJJ-MM-DD; `bronSha256` alleen als 64 kleine hex-tekens;
 * `ingelezenOp` een eindig getal, anders het tijdstip waarop het leerplan gemaakt is.
 */
function sanitizeHerkomst(raw: unknown, createdAt: number): CurriculumHerkomst | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const h = raw as Record<string, unknown>;
  const methode = METHODES.find((m) => m === h.methode);
  if (!methode) return undefined;
  const uit: CurriculumHerkomst = { methode, ingelezenOp: isEindig(h.ingelezenOp) ? h.ingelezenOp : createdAt };
  const leerplancode = tekstVeld(h.leerplancode, 80);
  if (leerplancode) uit.leerplancode = leerplancode;
  const versie = tekstVeld(h.versie, 80);
  if (versie) uit.versie = versie;
  const geldigVanaf = typeof h.geldigVanaf === 'string' ? h.geldigVanaf.trim() : '';
  if (ISO_DATUM.test(geldigVanaf)) uit.geldigVanaf = geldigVanaf;
  const bronUrl = typeof h.bronUrl === 'string' ? h.bronUrl.trim() : '';
  if (bronUrl.length <= 2000 && /^https?:\/\/\S+$/i.test(bronUrl)) uit.bronUrl = bronUrl;
  const bronNaam = tekstVeld(h.bronNaam, 255);
  if (bronNaam) uit.bronNaam = bronNaam;
  if (typeof h.bronSha256 === 'string' && SHA256_HEX.test(h.bronSha256)) uit.bronSha256 = h.bronSha256;
  return uit;
}

/** Nakijkstatus saneren: alleen met een geldige status; de andere velden alleen als ze kloppen. */
function sanitizeControle(raw: unknown): CurriculumControle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const status = CONTROLE_STATUSSEN.find((s) => s === c.status);
  if (!status) return undefined;
  const uit: CurriculumControle = { status };
  const door = tekstVeld(c.door, 120);
  if (door) uit.door = door;
  if (isEindig(c.op)) uit.op = c.op;
  if (typeof c.doelenSha256 === 'string' && SHA256_HEX.test(c.doelenSha256)) uit.doelenSha256 = c.doelenSha256;
  const samenvatting = tekstVeld(c.samenvatting, 500);
  if (samenvatting) uit.samenvatting = samenvatting;
  return uit;
}

/** Lijst sets van laag 1: geldige ids ("ODS_<getal>"), ontdubbeld, hoogstens 50. Leeg = `undefined`. */
function sanitizeSets(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const uit: string[] = [];
  for (const item of raw) {
    if (uit.length >= MAX_SETS) break;
    const id = typeof item === 'string' ? item.trim() : '';
    if (SET_ID.test(id) && !uit.includes(id)) uit.push(id);
  }
  return uit.length > 0 ? uit : undefined;
}

/**
 * Een nagekeken leerplan waarvan de doelen niet meer bij de vingerafdruk passen, is "gewijzigd".
 * Status "gecontroleerd" zonder vingerafdruk telt ook als gewijzigd: niemand kan dan nog zeggen
 * welke doelen nagekeken zijn. Geeft een kopie terug (naam, tijdstip en samenvatting blijven) of,
 * als alles klopt, hetzelfde object. Geen beveiliging, wel eerlijkheid (docs/LEERPLANNEN.md § 8).
 */
export function bewaakControle(cur: Curriculum): Curriculum {
  const controle = cur.controle;
  if (!controle || controle.status !== 'gecontroleerd') return cur;
  if (controle.doelenSha256 && controle.doelenSha256 === doelenVingerafdruk(cur.goals)) return cur;
  return { ...cur, controle: { ...controle, status: 'gewijzigd' } };
}

/**
 * Volledig leerplan defensief saneren (JSON-import of gedeeld bestand), versie 1 en 2. Onbekende
 * velden vallen weg. Saneren is idempotent: twee keer saneren geeft hetzelfde als één keer.
 */
export function sanitizeCurriculum(raw: unknown): Curriculum | null {
  if (!raw || typeof raw !== 'object') return null;
  const outer = raw as Record<string, unknown>;
  const c = (outer.curriculum && typeof outer.curriculum === 'object'
    ? outer.curriculum
    : outer.leerplan && typeof outer.leerplan === 'object'
      ? outer.leerplan
      : outer) as Record<string, unknown>;
  const goals = sanitizeGoals(c.goals ?? c.doelen, { autoPrefix: str(c.subject).slice(0, 3) || 'DOEL' });
  if (!goals.length) return null;
  const net = CURRICULUM_NETS.some((n) => n.id === c.net) ? (c.net as Curriculum['net']) : 'eigen';
  const createdAt = typeof c.createdAt === 'number' ? c.createdAt : Date.now();
  const cur: Curriculum = {
    id: str(c.id) || uid(),
    title: str(c.title ?? c.titel).trim() || 'Leerplan',
    net,
    subject: str(c.subject ?? c.vak).trim(),
    level: str(c.level ?? c.niveau).trim(),
    source: str(c.source ?? c.bron).trim() || undefined,
    example: c.example === true || undefined,
    goals,
    createdAt,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
  };
  // Versie 2: alleen meenemen wat klopt, en geen lege velden toevoegen.
  if (c.kind === 'leerplan' || c.kind === 'eigen') cur.kind = c.kind;
  const herkomst = sanitizeHerkomst(c.herkomst, createdAt);
  if (herkomst) cur.herkomst = herkomst;
  const controle = sanitizeControle(c.controle);
  if (controle) cur.controle = controle;
  const sets = sanitizeSets(c.minimumdoelenSets);
  if (sets) cur.minimumdoelenSets = sets;
  return bewaakControle(cur);
}

/**
 * Vingerafdruk (sha-256, hex) van de doelen van een leerplan: code, tekst, rubriek, niveau,
 * toelichting en verwijzingen, in volgorde. Het interne `id` telt niet mee. Wie na het
 * bevestigen een doel wijzigt, krijgt een andere vingerafdruk; zo wordt "gecontroleerd"
 * zichtbaar "gewijzigd" (docs/LEERPLANNEN.md § 8).
 */
export function doelenVingerafdruk(goals: readonly CurriculumGoal[]): string {
  const vast = goals.map((g) => {
    const o: Record<string, unknown> = { code: g.code, text: g.text };
    if (g.theme) o.theme = g.theme;
    if (g.level) o.level = g.level;
    if (g.note) o.note = g.note;
    if (g.refs && g.refs.length > 0) o.refs = g.refs.map((r) => ({ set: r.set, id: r.id, code: r.code }));
    if (g.refsBron) o.refsBron = g.refsBron;
    return o;
  });
  return sha256Hex(JSON.stringify(vast));
}

/** Status van het nakijken; een leerplan zonder `controle` is niet nagekeken. */
export function controleStatus(cur: Curriculum): ControleStatus {
  return cur.controle?.status ?? 'niet-gecontroleerd';
}

/**
 * Bevestigt dat een mens elk doel met de bron vergeleken heeft: status "gecontroleerd", met
 * naam, tijdstip en de vingerafdruk van de doelen op dit moment. Geeft een nieuw object terug.
 */
export function bevestigLeerplan(cur: Curriculum, opts: { door: string; samenvatting?: string; op?: number }): Curriculum {
  return {
    ...cur,
    kind: 'leerplan',
    controle: {
      status: 'gecontroleerd',
      door: opts.door.trim() || undefined,
      op: opts.op ?? Date.now(),
      doelenSha256: doelenVingerafdruk(cur.goals),
      samenvatting: opts.samenvatting?.trim() || undefined,
    },
  };
}

/**
 * Een eigen, bewerkbare kopie van een (nagekeken) leerplan: nieuw id, soort "eigen", niet
 * nagekeken. De herkomst blijft staan, zodat je ziet waar de doelen vandaan kwamen.
 */
export function maakEigenKopie(cur: Curriculum, titel?: string): Curriculum {
  const nu = Date.now();
  const { controle: _controle, ...rest } = cur;
  void _controle;
  return {
    ...rest,
    id: uid(),
    title: titel?.trim() || `${cur.title} (eigen kopie)`,
    kind: 'eigen',
    example: undefined,
    goals: cur.goals.map((g) => ({ ...g, id: uid(), refs: g.refs?.map((r) => ({ ...r })) })),
    createdAt: nu,
    updatedAt: nu,
  };
}

/**
 * Leerplan als JSON-bestand (met kop, zodat import het herkent). Versie 2: met soort, herkomst,
 * nakijkstatus, sets en verwijzingen. Een nagekeken leerplan waarvan de doelen intussen veranderd
 * zijn, gaat als "gewijzigd" de deur uit.
 */
export function exportCurriculumJson(cur: Curriculum): string {
  return JSON.stringify({ app: 'boosterz', kind: 'leerplan', v: 2, curriculum: bewaakControle(cur) }, null, 2);
}

/**
 * JSON-bestand inlezen (versie 1 en 2, ook zonder kop); null als er niets bruikbaars in staat.
 * De vingerafdruk wordt opnieuw uitgerekend: klopt die niet, dan is het leerplan "gewijzigd".
 */
export function importCurriculumJson(json: string): Curriculum | null {
  try {
    return sanitizeCurriculum(JSON.parse(json));
  } catch {
    return null;
  }
}
