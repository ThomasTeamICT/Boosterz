// ── Bordles: controle van het lesformaat en hulpfuncties zonder scherm ──────
//
// Een bordles is data (BordlesConfig in lib/types.ts). Deze module kijkt na of
// die data klopt voor de speler ze toont, en bevat de regels die de speler
// gebruikt: antwoorden vergelijken, welke stappen meetellen voor de resultaten.
// Ontwerp: docs/UITLEGVORMEN.md § 3.

import type { BordElement, BordlesConfig, BordlesFase, BordlesStap } from '../types';

export interface Fout { pad: string; melding: string }

/** Het bord is 600 breed en 500 hoog; iets erbuiten mag (hand, schaduw), ver erbuiten niet. */
export const BORD_BREEDTE = 600;
export const BORD_HOOGTE = 500;
const MARGE = 60;

function punt(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));
}
function opBord(p: [number, number]): boolean {
  return p[0] >= -MARGE && p[0] <= BORD_BREEDTE + MARGE && p[1] >= -MARGE && p[1] <= BORD_HOOGTE + MARGE;
}

function puntenVan(el: BordElement): unknown[] {
  switch (el.soort) {
    case 'lijn': case 'pijl': return [el.van, el.naar];
    case 'veelhoek': return el.punten;
    case 'cirkel': return [el.midden];
    case 'tekst': return [el.plek];
    default: return [];
  }
}

/** Alle stappen van een les, met de fase erbij (de instapvraag heeft fase null). */
export function alleStappen(cfg: BordlesConfig): { fase: BordlesFase | null; stap: BordlesStap }[] {
  const uit: { fase: BordlesFase | null; stap: BordlesStap }[] = [];
  if (cfg.instapvraag) uit.push({ fase: null, stap: cfg.instapvraag });
  for (const f of cfg.fases ?? []) for (const s of f.stappen ?? []) uit.push({ fase: f, stap: s });
  return uit;
}

/**
 * Kijkt een bordles na. Geeft een lege lijst als alles klopt; anders per
 * probleem waar het zit en wat er mis is, in gewone taal voor de leerkracht.
 */
export function valideerBordles(cfg: BordlesConfig): Fout[] {
  const fouten: Fout[] = [];
  const fout = (pad: string, melding: string) => fouten.push({ pad, melding });

  if (!cfg || !Array.isArray(cfg.fases) || cfg.fases.length === 0) {
    fout('fases', 'De bordles heeft nog geen fases.');
    return fouten;
  }

  const stapIds = new Set<string>();
  const invulIds = new Set<string>();
  for (const { stap } of alleStappen(cfg)) {
    if (stap.invul && stap.id) invulIds.add(stap.id);
  }
  const faseIds = new Set<string>();

  const controleerStap = (stap: BordlesStap, pad: string, elementIdsTotNu: Set<string>) => {
    if (!stap.id || !stap.id.trim()) fout(pad, 'Een stap heeft geen id.');
    else if (stapIds.has(stap.id)) fout(pad, `Het id "${stap.id}" komt twee keer voor.`);
    else stapIds.add(stap.id);
    if (!stap.uitleg || !stap.uitleg.trim()) fout(pad, 'De uitleg bij deze stap is leeg.');

    const interacties = [stap.invul, stap.keuze, stap.waarom].filter(Boolean).length;
    if (interacties > 1) fout(pad, 'Een stap kan maar één ding vragen: invullen, kiezen of een waaromvraag.');

    if (stap.invul) {
      if (!stap.invul.label?.trim()) fout(`${pad}.invul`, 'De invulvraag heeft geen label (bv. "c =").');
      if (!String(stap.invul.antwoord ?? '').trim()) fout(`${pad}.invul`, 'De invulvraag heeft geen juist antwoord.');
      if (!Array.isArray(stap.invul.hints)) fout(`${pad}.invul`, 'De hints ontbreken.');
      else if (stap.invul.hints.length > 3) fout(`${pad}.invul`, 'Gebruik hoogstens drie hints.');
      for (const g of stap.invul.gekendeFouten ?? []) {
        if (antwoordGelijk(g.antwoord, stap.invul.antwoord)) {
          fout(`${pad}.invul`, `Het gekende foute antwoord "${g.antwoord}" is gelijk aan het juiste antwoord.`);
        }
      }
    }
    if (stap.keuze) {
      const opties = stap.keuze.opties ?? [];
      if (opties.length < 2) fout(`${pad}.keuze`, 'Een keuzevraag heeft minstens twee opties nodig.');
      const juist = opties.filter((o) => o.juist).length;
      if (juist !== 1) fout(`${pad}.keuze`, `Een keuzevraag heeft precies één juiste optie nodig (nu ${juist}).`);
      opties.forEach((o, i) => {
        if (!o.tekst?.trim()) fout(`${pad}.keuze.opties[${i}]`, 'Een optie is leeg.');
        if (!o.uitleg?.trim()) fout(`${pad}.keuze.opties[${i}]`, 'Elke optie heeft uitleg nodig: waarom ze klopt of niet.');
      });
    }
    if (stap.waarom) {
      if (!stap.waarom.vraag?.trim()) fout(`${pad}.waarom`, 'De waaromvraag is leeg.');
      if (!stap.waarom.modelantwoord?.trim()) fout(`${pad}.waarom`, 'De waaromvraag heeft een modelantwoord nodig.');
    }
    if (stap.wijsNaar && (!punt(stap.wijsNaar) || !opBord(stap.wijsNaar))) {
      fout(`${pad}.wijsNaar`, 'De hand wijst naar een punt buiten het bord.');
    }

    (stap.teken ?? []).forEach((el, i) => {
      const ep = `${pad}.teken[${i}]`;
      const pts = puntenVan(el);
      if (el.soort === 'veelhoek' && pts.length < 2) fout(ep, 'Een veelhoek heeft minstens twee punten nodig.');
      for (const p of pts) {
        if (!punt(p)) { fout(ep, 'Een punt is geen paar getallen.'); break; }
        if (!opBord(p)) { fout(ep, `Het punt (${p[0]}, ${p[1]}) ligt buiten het bord (600 op 500).`); break; }
      }
      if (el.soort === 'cirkel' && !(el.straal > 0)) fout(ep, 'Een cirkel heeft een straal groter dan 0 nodig.');
      if (el.soort === 'tekst') {
        if (!Array.isArray(el.delen) || el.delen.length === 0 || el.delen.every((d) => !d.tekst)) fout(ep, 'Deze tekst is leeg.');
        if (el.verborgenTot && !invulIds.has(el.verborgenTot)) {
          fout(ep, `"verborgenTot" wijst naar "${el.verborgenTot}", maar dat is geen invulstap.`);
        }
      }
      if (el.vervangt && !elementIdsTotNu.has(el.vervangt)) {
        fout(ep, `"vervangt" wijst naar "${el.vervangt}", maar dat element staat niet eerder in deze fase.`);
      }
      if (el.id) {
        if (elementIdsTotNu.has(el.id)) fout(ep, `Het element-id "${el.id}" komt twee keer voor in deze fase.`);
        elementIdsTotNu.add(el.id);
      }
    });
  };

  if (cfg.instapvraag) {
    if (!cfg.instapvraag.invul && !cfg.instapvraag.keuze) {
      fout('instapvraag', 'De instapvraag moet iets vragen: invullen of kiezen.');
    }
    controleerStap(cfg.instapvraag, 'instapvraag', new Set());
  }

  cfg.fases.forEach((f, fi) => {
    const fp = `fases[${fi}]`;
    if (!f.id?.trim()) fout(fp, 'Een fase heeft geen id.');
    else if (faseIds.has(f.id)) fout(fp, `Het fase-id "${f.id}" komt twee keer voor.`);
    else faseIds.add(f.id);
    if (!['kijk', 'doe', 'fout', 'alleen'].includes(f.soort)) fout(fp, `Onbekende soort fase "${String(f.soort)}".`);
    if (!Array.isArray(f.stappen) || f.stappen.length === 0) { fout(fp, 'Deze fase heeft nog geen stappen.'); return; }
    const ids = new Set<string>();
    f.stappen.forEach((s, si) => controleerStap(s, `${fp}.stappen[${si}]`, ids));
  });

  for (const w of cfg.woorden ?? []) {
    if (!w.woord?.trim() || !w.uitleg?.trim()) fout('woorden', 'Elk vakwoord heeft een woord en een uitleg nodig.');
  }
  return fouten;
}

/** Maakt een antwoord vergelijkbaar: spaties weg, kleine letters, komma als punt. */
export function normaliseer(antwoord: string): string {
  return String(antwoord ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
}

/** Klopt het antwoord van de leerling? Getallen numeriek ("10" = "10,0"), tekst zonder hoofdletters en spaties. */
export function antwoordGelijk(gegeven: string, juist: string): boolean {
  const a = normaliseer(gegeven), b = normaliseer(juist);
  if (a === '' || b === '') return false;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/.test(a)) return Math.abs(na - nb) < 1e-9;
  return a === b;
}

/** Zoekt bij een fout antwoord de gerichte uitleg, als die er is. */
export function gekendeFout(stap: BordlesStap, gegeven: string): string | null {
  for (const g of stap.invul?.gekendeFouten ?? []) if (antwoordGelijk(gegeven, g.antwoord)) return g.uitleg;
  return null;
}

/**
 * Stappen die meetellen in de resultaten: invullen en kiezen in de fases
 * 'doe', 'fout' en 'alleen'. Kijk mee (en daarin een waaromvraag) en de
 * instapvraag tellen niet mee: die zijn er om te leren, niet om te scoren.
 */
export function telendeStappen(cfg: BordlesConfig): BordlesStap[] {
  const uit: BordlesStap[] = [];
  for (const f of cfg.fases ?? []) {
    if (f.soort === 'kijk') continue;
    for (const s of f.stappen ?? []) if (s.invul || s.keuze) uit.push(s);
  }
  return uit;
}

export type Uitkomst = 'zonder hulp' | 'met hulp' | 'oplossing getoond' | 'samen in de klas' | 'niet gemaakt';

export interface StapVoortgang {
  opgelost: boolean;
  pogingen: number;
  hints: number;
  getoond: boolean;
  zeker?: 'zeker' | 'twijfel' | 'gok';
  /** In de bordstand opgelost door de leerkracht (klasmoment): telt niet mee als eigen werk. */
  klas?: boolean;
}

export function uitkomstVan(v: StapVoortgang | undefined): Uitkomst {
  if (!v || !v.opgelost) return 'niet gemaakt';
  if (v.klas) return 'samen in de klas';
  if (v.getoond) return 'oplossing getoond';
  if (v.pogingen === 0 && v.hints === 0) return 'zonder hulp';
  return 'met hulp';
}

/** Telt een uitkomst als eigen werk (een punt in de resultaten)? */
export function teltAlsEigenWerk(u: Uitkomst): boolean {
  return u === 'zonder hulp' || u === 'met hulp';
}

/** Een getal zonder teken krijgt het cijfertoetsenbord; al de rest (minteken, eenheid, woord) het gewone. */
export function toetsenbordVoor(antwoord: string): 'decimal' | 'text' {
  return /^\d+([.,]\d+)?$/.test(String(antwoord ?? '').trim()) ? 'decimal' : 'text';
}

/** Na zoveel foute pogingen toont de speler de oplossing. */
export const MAX_POGINGEN = 3;
