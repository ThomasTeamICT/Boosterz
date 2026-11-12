// De bronnen voor de spiekkaart van de Lichtkamer (LK-8): wat vulSpiekkaart (lichtkamer/lesmateriaal.ts) nodig heeft om de
// teksten van de doelen letterlijk uit de gegevens van de app te halen. Het scherm geeft de geladen bestanden mee; zonder
// bestand geven de bronnen niets terug, en vulSpiekkaart meldt dan wat er mist in plaats van een tekst te verzinnen.
//
// - minimumdoel: code en tekst (zonder opmaak) uit de set (public/leerplannen/minimumdoelen/ODS_3408.json);
// - goBijMinimumdoel: het leerplandoel van het GO! zoals het GO! het bij dit minimumdoel zet (public/basis/go/bij-minimumdoel/3.json),
//   alleen als de koppeling officieel is;
// - foutpatroon: de tekst in het manifest van het bewijsmodel (er is geen netwerk voor nodig).
//
// Zuiver: geen React, geen opslag, geen netwerk.

import { htmlNaarTekst, type MinimumdoelenSetBestand } from '../minimumdoelen';
import { lichtkamerMoment } from './bewijs/lichtkamerManifest';
import { laatsteVersie } from './bewijs/pakket';
import type { GoBijMinimumdoelBestand } from './go/types';
import { SPIEKKAART, vulSpiekkaart, type GevuldeSpiekkaart, type LesmateriaalBronnen } from './lichtkamer/lesmateriaal';

/** Het vak van de minimumdoelen van de Lichtkamer (3 = wetenschap en techniek): het bestand van het GO! bij die doelen. */
export const LICHTKAMER_GO_VAK = 3;

/** De tekst van een foutpatroon van het moment einde 4de leerjaar in het manifest, of undefined. */
export function foutpatroonTekst(id: string): string | undefined {
  const moment = lichtkamerMoment('einde-4de');
  if (!moment) return undefined;
  for (const b of laatsteVersie(moment.manifest).bewijzen) for (const f of b.foutpatronen) if (f.id === id) return f.tekst;
  return undefined;
}

export function maakLesmateriaalBronnen(set: MinimumdoelenSetBestand | undefined, bij: GoBijMinimumdoelBestand | undefined): LesmateriaalBronnen {
  // De sleutels van het bestand van het GO! zijn cijfers: altijd in een Map lezen, nooit opzoeken op een gewoon object.
  const perDoel = new Map(Object.entries(bij?.doelen ?? {}));
  return {
    minimumdoel(setId, id) {
      if (!set || set.set.id !== setId) return undefined;
      const d = set.doelen.find((x) => String(x.id) === id);
      return d ? { code: d.code, tekst: htmlNaarTekst(d.tekst) } : undefined;
    },
    goBijMinimumdoel(id, code) {
      const g = (perDoel.get(id) ?? []).find((x) => x.code === code && x.status === 'officieel');
      return g ? { tekst: g.tekst, leeftijden: g.leeftijden } : undefined;
    },
    foutpatroon: foutpatroonTekst,
  };
}

/**
 * De spiekkaart met wat er geladen is, ook als er iets ontbreekt: een tekst die niet geladen is, blijft leeg ('') en
 * `volledig` is dan false. Zo toont het scherm de rest van de spiekkaart en zegt het eerlijk wat mist, in plaats van
 * een halve kaart weg te laten of tekst te verzinnen. De foutpatronen komen uit het manifest en ontbreken nooit.
 */
export function vulSpiekkaartTolerant(bronnen: LesmateriaalBronnen): { kaart: GevuldeSpiekkaart; volledig: boolean; fouten: string[] } {
  const strikt = vulSpiekkaart(SPIEKKAART, bronnen);
  if (strikt.kaart) return { kaart: strikt.kaart, volledig: true, fouten: [] };
  const kaart: GevuldeSpiekkaart = {
    ...SPIEKKAART,
    doelen: SPIEKKAART.doelen.map((d) => {
      const md = bronnen.minimumdoel(d.set, d.id);
      const goDoelen = d.go.flatMap((g) => {
        const gd = bronnen.goBijMinimumdoel(d.id, g.code);
        return gd ? [{ code: g.code, tekst: gd.tekst, leeftijden: gd.leeftijden }] : [];
      });
      return { ...d, code: md?.code ?? '', tekst: md?.tekst ?? '', goDoelen };
    }),
    fouten: SPIEKKAART.fouten.map((f) => ({ ...f, tekst: bronnen.foutpatroon(f.foutpatroon) ?? f.foutpatroon })),
  };
  return { kaart, volledig: false, fouten: strikt.fouten };
}
