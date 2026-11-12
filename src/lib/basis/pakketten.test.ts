// Het register van de pakketten: het klopt met het manifest van het bewijsmodel en met de lesmachine.

import { describe, expect, it } from 'vitest';
import { lichtkamerMoment } from './bewijs/lichtkamerManifest';
import { EIND_SLUG } from './basisRoutes';
import { WERKT_NAAR } from './kalender';
import {
  PAKKET_BEGINSCHERMEN,
  PAKKETTEN,
  pakketBeginScherm,
  pakketBijMoment,
  pakketLeerjaar,
  pakketVan,
  volledigAdres,
} from './pakketten';

describe('het register en het manifest', () => {
  const p = PAKKETTEN.lichtkamer;
  const moment = lichtkamerMoment(p.moment);

  it('het moment van het register staat in het manifest, met hetzelfde eindmoment en dezelfde set', () => {
    expect(moment, p.moment).toBeDefined();
    expect(moment?.eindmoment).toBe(p.eind);
    expect(EIND_SLUG[p.eind]).toBe(p.moment);
    for (const d of p.doelen) expect(d.set).toBe(moment?.set);
  });

  it('register en manifest noemen precies dezelfde doelen, in dezelfde volgorde', () => {
    const uitManifest = (moment?.doelen ?? []).map((d) => `${d.set}/${d.id}`);
    expect(p.doelen.map((d) => `${d.set}/${d.id}`)).toEqual(uitManifest);
    expect(p.doelen).toHaveLength(3);
  });

  it('de leerjaren werken naar het eindmoment van het pakket, het laatste is het leerjaar van het eindmoment zelf', () => {
    for (const lj of p.leerjaren) expect(WERKT_NAAR[lj]).toBe(p.eind);
    expect(p.leerjaren).toEqual(['L3', 'L4']);
  });

  it('elk pakket staat onder zijn eigen naam', () => {
    for (const [naam, pak] of Object.entries(PAKKETTEN)) expect(pak.naam).toBe(naam);
  });
});

describe('opzoeken', () => {
  it('pakketVan en pakketBijMoment kennen alleen wat bestaat', () => {
    expect(pakketVan('lichtkamer')?.titel).toBe('Lichtkamer: schaduwtheater');
    expect(pakketVan('toString')).toBeUndefined();
    expect(pakketVan('__proto__')).toBeUndefined();
    expect(pakketVan(undefined)).toBeUndefined();
    expect(pakketBijMoment('lichtkamer', 'einde-4de')).toBe(PAKKETTEN.lichtkamer);
    expect(pakketBijMoment('lichtkamer', 'einde-6de')).toBeUndefined();
    expect(pakketBijMoment('lichtkamer', undefined)).toBeUndefined();
  });

  it('pakketLeerjaar leest alleen de leerjaren van het pakket', () => {
    const p = PAKKETTEN.lichtkamer;
    expect(pakketLeerjaar(p, 'L3')).toBe('L3');
    expect(pakketLeerjaar(p, ' l4 ')).toBe('L4');
    for (const x of ['L5', 'K3', 'alle', '', null, undefined]) expect(pakketLeerjaar(p, x)).toBeUndefined();
  });

  it('pakketBeginScherm leest alleen de bekende schermen', () => {
    for (const s of PAKKET_BEGINSCHERMEN) expect(pakketBeginScherm(s)).toBe(s);
    expect(pakketBeginScherm('xyz')).toBeUndefined();
    expect(pakketBeginScherm(null)).toBeUndefined();
  });
});

describe('volledigAdres', () => {
  it('zet de plaats van de app, een hekje en het pad aan elkaar, zonder zoekopdracht of oude hash', () => {
    expect(volledigAdres('/basis/oefen/lichtkamer/einde-4de', { origin: 'https://thomasteamict.github.io', pathname: '/Boosterz/' })).toBe(
      'https://thomasteamict.github.io/Boosterz/#/basis/oefen/lichtkamer/einde-4de',
    );
    expect(volledigAdres('/basis/oefen/lichtkamer/einde-4de', { origin: 'http://localhost:4188', pathname: '/' })).toBe(
      'http://localhost:4188/#/basis/oefen/lichtkamer/einde-4de',
    );
  });
});
