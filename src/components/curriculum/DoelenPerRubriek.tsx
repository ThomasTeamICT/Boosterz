// Doelen per rubriek, met de code in een vaste kolom. Gedeeld door de pagina "Officiële
// minimumdoelen" en het leerplan op slot (CurriculaPage). Alleen tekst: nooit HTML invoegen.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import '../../styles/doelenlijst.css';

export interface DoelRij {
  key: string;
  code: string;
  /** Gewone tekst; regeleinden blijven staan. */
  tekst: string;
  /** Rubriek(en), bv. "Muzikale opvoeding › Waarnemen". Leeg = geen rubriek. */
  rubriek?: string;
  /** Kleine labels onder de tekst (attitude, optioneel, verwijzingen). */
  labels?: ReactNode;
}

export interface RubriekGroep {
  rubriek: string;
  rijen: DoelRij[];
}

/** Groepeert per rubriek, in volgorde van het eerste voorkomen; de volgorde binnen een rubriek blijft. */
export function groepeerPerRubriek(rijen: readonly DoelRij[]): RubriekGroep[] {
  const groepen = new Map<string, RubriekGroep>();
  for (const rij of rijen) {
    const rubriek = (rij.rubriek ?? '').trim();
    const groep = groepen.get(rubriek) ?? { rubriek, rijen: [] };
    groep.rijen.push(rij);
    groepen.set(rubriek, groep);
  }
  return [...groepen.values()];
}

/**
 * Breedte van de codekolom in tekens: de langste code, met een ondergrens en een bovengrens. Codes van een zelf samengestelde
 * lijst kunnen langer zijn (bv. "01.01 (ODS_3032)", 16 tekens): de bovengrens laat die op één regel staan. Een nog langere code
 * breekt af op een spatie of, als het moet, ergens in het woord (zie `.dl-code` in doelenlijst.css).
 */
const MAX_CODEBREEDTE = 20;

function codeBreedte(rijen: readonly DoelRij[]): number {
  const langste = rijen.reduce((m, r) => Math.max(m, r.code.length), 0);
  return Math.min(MAX_CODEBREEDTE, Math.max(4, langste)) + 1;
}

export function DoelenPerRubriek({ rijen }: { rijen: readonly DoelRij[] }) {
  const groepen = useMemo(() => groepeerPerRubriek(rijen), [rijen]);
  const breedte = useMemo(() => codeBreedte(rijen), [rijen]);
  const metKoppen = groepen.some((g) => g.rubriek !== '');
  return (
    <div className="dl" style={{ '--dl-code': `${breedte}ch` } as CSSProperties}>
      {groepen.map((groep) => (
        <div key={groep.rubriek || '__zonder'} className="dl-groep">
          {metKoppen && <h3 className="dl-rubriek">{groep.rubriek || 'Overige doelen'}</h3>}
          <ol className="dl-lijst">
            {groep.rijen.map((rij) => (
              <li key={rij.key} className="dl-rij">
                <span className="dl-code">{rij.code}</span>
                <div className="dl-tekst">
                  <p className="dl-zin">{rij.tekst}</p>
                  {rij.labels && <div className="dl-labels">{rij.labels}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
