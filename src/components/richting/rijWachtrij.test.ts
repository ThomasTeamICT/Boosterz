import { describe, expect, it } from 'vitest';
import { maakWachtrij, type BeurtMelder, type Deelname, type Wachtrij } from './rijWachtrij';

/** Een rij met een logboek: hoe vaak ze de beurt kreeg, en haar handvat om klaar te zijn. */
function rij(q: Wachtrij, naam: string, logboek: string[]): { deelname: Deelname; beurten: () => number } {
  let beurten = 0;
  const melder: BeurtMelder = (aan) => {
    expect(aan).toBe(true); // de melder krijgt nooit false
    beurten += 1;
    logboek.push(naam);
  };
  return { deelname: q.meld(melder), beurten: () => beurten };
}

/**
 * Een rij die werkt zoals `DekkingKort`: ze vraagt de beurt, rekent (een belofte) en geeft de beurt terug, of het gelukt is of
 * niet. Geeft een belofte die klaar is als de rij uitgerekend is, hoe dan ook.
 */
function rekenRij(q: Wachtrij, naam: string, logboek: string[], werk: () => Promise<void>): Promise<'gelukt' | 'mislukt'> {
  return new Promise((klaar) => {
    // `meld` kan de melder aanroepen voor het handvat er is: dan starten we pas als het er is.
    const staat: { deelname?: Deelname; aanDeBeurt: boolean; gestart: boolean } = { aanDeBeurt: false, gestart: false };
    const start = (): void => {
      if (staat.gestart || !staat.deelname || !staat.aanDeBeurt) return;
      staat.gestart = true;
      logboek.push(`${naam} begint`);
      werk().then(
        () => { logboek.push(`${naam} klaar`); klaar('gelukt'); },
        () => { logboek.push(`${naam} mislukt`); klaar('mislukt'); },
      ).finally(() => staat.deelname?.klaar());
    };
    staat.deelname = q.meld(() => {
      staat.aanDeBeurt = true;
      start();
    });
    start();
  });
}

describe('maakWachtrij', () => {
  it('geeft de eerste rij meteen de beurt, nog voor `meld` terugkeert', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    expect(log).toEqual(['a']);
    expect(a.beurten()).toBe(1);
    expect(q.bezig()).toBe(true);
    expect(q.wachtend()).toBe(0);
  });

  it('laat maar één rij tegelijk aan de beurt: de anderen wachten, in de volgorde van aanmelden', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    const b = rij(q, 'b', log);
    const c = rij(q, 'c', log);
    expect(log).toEqual(['a']);
    expect(q.wachtend()).toBe(2);
    expect(b.beurten()).toBe(0);
    expect(c.beurten()).toBe(0);
    a.deelname.klaar();
    expect(log).toEqual(['a', 'b']);
    expect(q.wachtend()).toBe(1);
    b.deelname.klaar();
    expect(log).toEqual(['a', 'b', 'c']);
    c.deelname.klaar();
    expect(q.bezig()).toBe(false);
    expect(q.wachtend()).toBe(0);
  });

  it('geeft de beurt aan de volgende zodra de eerste klaar is, ook als haar berekening mislukte', async () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const eerste = rekenRij(q, 'a', log, () => Promise.reject(new Error('de set kon niet geladen worden')));
    const tweede = rekenRij(q, 'b', log, () => Promise.resolve());
    const derde = rekenRij(q, 'c', log, () => Promise.reject(new Error('geen verbinding')));
    const vierde = rekenRij(q, 'd', log, () => Promise.resolve());
    expect(await Promise.all([eerste, tweede, derde, vierde])).toEqual(['mislukt', 'gelukt', 'mislukt', 'gelukt']);
    // Nooit twee tegelijk, en na elke mislukking gaat het gewoon door.
    expect(log).toEqual(['a begint', 'a mislukt', 'b begint', 'b klaar', 'c begint', 'c mislukt', 'd begint', 'd klaar']);
    expect(q.bezig()).toBe(false);
  });

  it('geeft een rij die verdwijnt terwijl ze aan de beurt is, haar beurt terug', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    rij(q, 'b', log);
    a.deelname.klaar(); // de rij verlaat het scherm midden in haar berekening
    expect(log).toEqual(['a', 'b']);
  });

  it('laat een rij die verdwijnt terwijl ze nog wacht, gewoon weg zonder iemand op te houden', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    const b = rij(q, 'b', log);
    rij(q, 'c', log);
    b.deelname.klaar(); // b verdwijnt voor ze aan de beurt was
    expect(q.wachtend()).toBe(1);
    a.deelname.klaar();
    expect(log).toEqual(['a', 'c']); // b kreeg de beurt nooit
    expect(b.beurten()).toBe(0);
  });

  it('is veilig als `klaar` vaker wordt aangeroepen: de beurt van de volgende blijft van de volgende', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    const b = rij(q, 'b', log);
    rij(q, 'c', log);
    a.deelname.klaar();
    a.deelname.klaar(); // tweede keer: a heeft niets meer te geven
    expect(log).toEqual(['a', 'b']);
    expect(q.wachtend()).toBe(1);
    b.deelname.klaar();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('laat een rij die opnieuw wil, achteraan aansluiten', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    rij(q, 'b', log);
    a.deelname.klaar();
    expect(log).toEqual(['a', 'b']);
    const a2 = rij(q, 'a', log); // a wil opnieuw, b is nog bezig
    expect(log).toEqual(['a', 'b']);
    expect(q.wachtend()).toBe(1);
    expect(a2.beurten()).toBe(0);
  });

  it('zet na de laatste rij alles terug op leeg, en de eerstvolgende rij heeft meteen de beurt', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    rij(q, 'a', log).deelname.klaar();
    expect(q.bezig()).toBe(false);
    rij(q, 'b', log);
    expect(log).toEqual(['a', 'b']);
    expect(q.bezig()).toBe(true);
  });

  it('gaat door met de volgende als een melder zelf een fout gooit', () => {
    const q = maakWachtrij();
    const log: string[] = [];
    const a = rij(q, 'a', log);
    q.meld(() => {
      throw new Error('deze rij is al weg');
    });
    rij(q, 'c', log);
    a.deelname.klaar();
    expect(log).toEqual(['a', 'c']);
    expect(q.bezig()).toBe(true);
  });

  it('houdt twee wachtrijen los van elkaar', () => {
    const q1 = maakWachtrij();
    const q2 = maakWachtrij();
    const log: string[] = [];
    rij(q1, 'een', log);
    rij(q2, 'twee', log);
    expect(log).toEqual(['een', 'twee']);
  });
});
