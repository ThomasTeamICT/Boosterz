// Een bak voor alles wat vrijgegeven moet worden: geometrie, materialen, texturen, schaduwkaarten, luisteraars en lussen.
//
// Zuiver: geen three.js. Wat de kijkdoos maakt, gaat in een bak; bij het opruimen gaat alles eruit, in omgekeerde
// volgorde, en een fout bij één ding houdt de rest niet tegen. In het prototype bleven die dingen globaal staan
// (lichtkamer.html r. 380, 403, 410; lk-wereld.js r. 134).

export type Vrijgeefbaar = { dispose(): void };

export class Bak {
  private dingen: Vrijgeefbaar[] = [];
  private leeggemaakt = 0;

  /** Neemt iets op en geeft het terug, zodat je kan schrijven: `const m = bak.neem(new T.MeshBasicMaterial())`. */
  neem<D extends Vrijgeefbaar>(ding: D): D {
    this.dingen.push(ding);
    return ding;
  }

  /** Een opruimfunctie (een luisteraar weghalen, een lus stoppen). */
  bijHetOpruimen(f: () => void): void {
    this.dingen.push({ dispose: f });
  }

  get aantal(): number {
    return this.dingen.length;
  }

  /** Hoe vaak de bak al leeggemaakt is (voor de tests). */
  get keerLeeg(): number {
    return this.leeggemaakt;
  }

  /** Geeft alles vrij, het laatst opgenomene eerst. Twee keer leegmaken is geen fout. */
  leeg(): void {
    const lijst = this.dingen;
    this.dingen = [];
    this.leeggemaakt++;
    for (let i = lijst.length - 1; i >= 0; i--) {
      try {
        lijst[i]?.dispose();
      } catch (e) {
        console.warn('Kijkdoos: opruimen mislukt', e);
      }
    }
  }
}

/** Een luisteraar die ook weer weg moet. Geen `signal` in de opties: Safari 14 kent dat niet. */
export function luister(
  bak: Bak,
  doel: EventTarget,
  soort: string,
  f: (ev: Event) => void,
  opties?: AddEventListenerOptions | boolean,
): void {
  doel.addEventListener(soort, f, opties);
  bak.bijHetOpruimen(() => doel.removeEventListener(soort, f, opties));
}
