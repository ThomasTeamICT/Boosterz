// ── Bordles: de tekenmotor (hand met krijt) ─────────────────────────────────
//
// Neemt een <g> met pas getekende bordelementen en laat een hand ze stap voor
// stap tekenen en schrijven: lijnen volgen met de krijtpunt, tekst onthullen
// van links naar rechts met een groeiend knipvlak, krijtstof, opgetild
// verplaatsen, wijzen. Een tik op het bord (maakAf) zet alles meteen af.
//
// De motor tekent zelf niets: hij werkt op elementen die de speler (React)
// al rendert, herkenbaar aan data-b="lijn" | "tekst" | "vulling". Hij beheert
// alleen zijn eigen laag (knipvlakken, krijtstof, hand).
// Ontwerp: docs/UITLEGVORMEN.md § 3.3; voorbeeld: tools/prototypes/bordles/.

import type { BordlesSnelheid, BordPunt } from '../types';
import { lijnDuur, tekstDuur, verplaatsDuur, zacht } from './vormen';

const NS = 'http://www.w3.org/2000/svg';

export type HandPose = 'schrijven' | 'lijn' | 'opgetild' | 'wijzen' | 'tikken';

/** Afmetingen van de handafbeeldingen en waar de krijtpunt zit (tools/prototypes/bordles/handen/krijtpunten.json). */
export const HANDEN: Record<HandPose, { b: number; h: number; x: number; y: number }> = {
  schrijven: { b: 318, h: 333, x: 0, y: 31.6 },
  lijn: { b: 318, h: 326, x: 0, y: 23.8 },
  opgetild: { b: 325, h: 338, x: 0, y: 29.5 },
  wijzen: { b: 319, h: 312, x: 0, y: 11 },
  tikken: { b: 321, h: 332, x: 0, y: 35.6 },
};
const HAND_SCHAAL = 0.5;
/** Rustplaats van de hand: rechtsonder, net naast het bord. */
const RUST: BordPunt = [640, 560];
/** Over alle motoren heen: zo botsen de knipvlakken van twee bordlessen op één pagina niet. */
let clipTeller = 0;

export interface Motor {
  /** Teken de elementen in `groep`. Lost op als alles getekend is (of afgebroken). */
  speel(groep: SVGGElement, snelheid: BordlesSnelheid, opties?: { wijsNaar?: BordPunt }): Promise<void>;
  /** Alles meteen afwerken, hand weg. */
  maakAf(): void;
  bezig(): boolean;
  /** Motor opruimen (bij het sluiten van de speler). */
  stop(): void;
}

export function maakMotor(laag: SVGGElement, handMap: string): Motor {
  const doc = laag.ownerDocument;
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ouder?: Element) => {
    const e = doc.createElementNS(NS, tag) as SVGElementTagNameMap[K];
    for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    if (ouder) ouder.appendChild(e);
    return e;
  };

  while (laag.firstChild) laag.removeChild(laag.firstChild);
  const defs = el('defs', {}, laag);
  const stof = el('g', { class: 'bl-stof', 'aria-hidden': 'true' }, laag);
  const hand = el('g', { class: 'bl-hand', opacity: 0, 'aria-hidden': 'true' }, laag);
  const beelden = new Map<HandPose, SVGImageElement>();
  (Object.keys(HANDEN) as HandPose[]).forEach((pose) => {
    const m = HANDEN[pose];
    const im = el('image', {
      width: m.b * HAND_SCHAAL, height: m.h * HAND_SCHAAL,
      x: -m.x * HAND_SCHAAL, y: -m.y * HAND_SCHAAL, display: 'none',
    }, hand);
    const url = `${handMap}hand-${pose}.webp`;
    im.setAttribute('href', url);
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
    beelden.set(pose, im);
  });

  let token = 0;
  let afmakers: (() => void)[] = [];
  let pos: BordPunt = RUST;
  let pose: HandPose | null = null;
  let laatsteStof = 0;

  const zetPose = (p: HandPose) => {
    if (p === pose) return;
    pose = p;
    beelden.forEach((im, k) => im.setAttribute('display', k === p ? 'inline' : 'none'));
  };
  const zetHand = (x: number, y: number, opgetild = false) => {
    pos = [x, y];
    hand.setAttribute('transform', `translate(${x.toFixed(1)} ${(y - (opgetild ? 8 : 0)).toFixed(1)})`);
  };
  const strooi = (x: number, y: number) => {
    const nu = performance.now();
    if (nu - laatsteStof < 70) return;
    laatsteStof = nu;
    const c = el('circle', {
      cx: (x + Math.random() * 6 - 3).toFixed(1), cy: (y + Math.random() * 4).toFixed(1),
      r: (0.8 + Math.random() * 1.4).toFixed(1),
    }, stof);
    setTimeout(() => c.remove(), 950);
  };
  const tween = (ms: number, t: number, stapFn: (p: number) => void) => new Promise<boolean>((klaar) => {
    const t0 = performance.now();
    const frame = (nu: number) => {
      if (t !== token) { klaar(false); return; }
      const p = Math.min(1, (nu - t0) / ms);
      stapFn(p);
      if (p < 1) requestAnimationFrame(frame); else klaar(true);
    };
    requestAnimationFrame(frame);
  });
  const verplaats = (doel: BordPunt, s: Exclude<BordlesSnelheid, 'meteen'>, t: number) => {
    const [x0, y0] = pos;
    zetPose('opgetild');
    return tween(verplaatsDuur(Math.hypot(doel[0] - x0, doel[1] - y0), s), t, (p) => {
      const e = zacht(p);
      zetHand(x0 + (doel[0] - x0) * e, y0 + (doel[1] - y0) * e, true);
    });
  };

  type Item =
    | { soort: 'lijn'; e: SVGPathElement; len: number }
    | { soort: 'tekst'; e: SVGTextElement; r: SVGRectElement; bb: DOMRect; tekens: number }
    | { soort: 'vulling'; e: SVGElement }
    | { soort: 'prent'; e: SVGGraphicsElement; bb: DOMRect };

  /** Maakt de elementen onzichtbaar maar klaar om getekend te worden. */
  const bereid = (groep: SVGGElement): Item[] => {
    const items: Item[] = [];
    groep.querySelectorAll<SVGElement>('[data-b]').forEach((e) => {
      const soort = e.getAttribute('data-b');
      if (soort === 'lijn') {
        const p = e as SVGPathElement;
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        items.push({ soort: 'lijn', e: p, len });
        afmakers.push(() => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
      } else if (soort === 'tekst') {
        const t = e as SVGTextElement;
        const bb = t.getBBox();
        const id = `bl-knip-${++clipTeller}`;
        const cp = el('clipPath', { id }, defs);
        const r = el('rect', { x: bb.x - 6, y: bb.y - 8, width: 0, height: bb.height + 16 }, cp);
        t.setAttribute('clip-path', `url(#${id})`);
        items.push({ soort: 'tekst', e: t, r, bb, tekens: (t.textContent ?? '').length });
        afmakers.push(() => { t.removeAttribute('clip-path'); cp.remove(); });
      } else if (soort === 'prent') {
        const g = e as SVGGraphicsElement;
        const bb = g.getBBox();
        g.style.opacity = '0';
        items.push({ soort: 'prent', e: g, bb });
        afmakers.push(() => { g.style.opacity = ''; g.style.transform = ''; });
      } else if (soort === 'vulling') {
        e.style.opacity = '0';
        items.push({ soort: 'vulling', e });
        afmakers.push(() => { e.style.opacity = ''; });
      }
    });
    return items;
  };

  const verberg = () => {
    hand.setAttribute('opacity', '0');
    zetHand(RUST[0], RUST[1]);
  };

  const maakAf = () => {
    token++;
    afmakers.forEach((f) => f());
    afmakers = [];
    verberg();
  };

  const speel: Motor['speel'] = async (groep, snelheid, opties) => {
    maakAf();
    if (snelheid === 'meteen') return;
    const items = bereid(groep);
    if (items.length === 0 && !opties?.wijsNaar) return;
    const t = token;
    hand.setAttribute('opacity', '1');
    for (const it of items) {
      if (t !== token) return;
      if (it.soort === 'lijn') {
        const p0 = it.e.getPointAtLength(0);
        await verplaats([p0.x, p0.y], snelheid, t);
        zetPose('lijn');
        await tween(lijnDuur(it.len, snelheid), t, (p) => {
          const e = zacht(p) * 0.15 + p * 0.85;
          it.e.style.strokeDashoffset = String(it.len * (1 - e));
          const pt = it.e.getPointAtLength(it.len * e);
          zetHand(pt.x, pt.y); strooi(pt.x, pt.y);
        });
        it.e.style.strokeDasharray = ''; it.e.style.strokeDashoffset = '';
      } else if (it.soort === 'tekst') {
        const { bb } = it;
        const basis = bb.y + bb.height * 0.78;
        await verplaats([bb.x, basis], snelheid, t);
        zetPose('schrijven');
        await tween(tekstDuur(it.tekens, snelheid), t, (p) => {
          const w = (bb.width + 12) * p;
          it.r.setAttribute('width', w.toFixed(1));
          // op en neer per letter: zo lijkt het op schrijven
          const golf = Math.sin(p * it.tekens * Math.PI * 2) * bb.height * 0.18;
          const x = bb.x + w - 4, y = basis - bb.height * 0.25 + golf;
          zetHand(x, y); strooi(x, y);
        });
        it.e.removeAttribute('clip-path');
        zetPose('tikken');
        await tween(110, t, () => undefined);
      } else if (it.soort === 'prent') {
        // De hand neemt de prent op en legt ze op haar plaats.
        const { bb } = it;
        const midden: BordPunt = [bb.x + bb.width * 0.5, bb.y + bb.height * 0.5];
        await verplaats(midden, snelheid, t);
        zetPose('wijzen');
        const e = it.e;
        e.style.transformBox = 'fill-box';
        e.style.transformOrigin = 'center';
        await tween(snelheid === 'traag' ? 650 : snelheid === 'normaal' ? 450 : 260, t, (p) => {
          const z = zacht(p);
          e.style.opacity = String(z);
          e.style.transform = `scale(${(0.85 + 0.15 * z).toFixed(3)})`;
        });
        e.style.opacity = ''; e.style.transform = '';
        zetPose('tikken');
        await tween(110, t, () => undefined);
      } else {
        it.e.style.transition = 'opacity .5s';
        it.e.style.opacity = '';
      }
      if (t !== token) return;
      await tween(70, t, () => undefined);
    }
    if (opties?.wijsNaar && t === token) {
      const [wx, wy] = opties.wijsNaar;
      await verplaats([wx, wy], snelheid, t);
      zetPose('wijzen');
      await tween(1100, t, (p) => zetHand(wx + Math.sin(p * Math.PI * 4) * 4, wy));
    }
    // Alles staat op het bord: vanaf nu is er niets meer af te maken, ook al loopt de hand nog weg.
    if (t !== token) return;
    afmakers = [];
    await verplaats(RUST, snelheid, t);
    if (t === token) verberg();
  };

  verberg();
  return {
    speel,
    maakAf,
    bezig: () => afmakers.length > 0,
    stop: () => { maakAf(); while (laag.firstChild) laag.removeChild(laag.firstChild); },
  };
}
