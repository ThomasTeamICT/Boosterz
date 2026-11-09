import { describe, expect, it } from 'vitest';
import {
  GO_NAAMSVERMELDING,
  GO_STUDIO_URL,
  GO_VAK_CODES,
  GO_VAKKEN,
  GO_VOORSTEL_LABEL,
  bijMinimumdoelShaInvoer,
  bronvermeldingLeerplan,
  bronvermeldingLesplan,
  isGoVak,
  leerplanShaInvoer,
  lesplanShaInvoer,
  type Blok,
  type Cel,
  type CelBlok,
  type GoBijMinimumdoelBestand,
  type GoIndex,
  type GoLeerplanBestand,
  type GoLeerplandoel,
  type GoLesplanBestand,
  type Regel,
  type Stuk,
  type TekstStuk,
} from './types';
import {
  regelOpWijzer,
  regelTekst,
  splitsCodes,
  splitsVerwijzingen,
  tekstOpWijzer,
  valideerGoBijMinimumdoel,
  valideerGoIndex,
  valideerGoLeerplan,
  valideerGoLesplan,
  vetBegin,
  wijzerVoorOfGelijk,
  zoekPersoonsgegevens,
  isZonderMinimumdoel,
} from './valideer';

// ── Kleine fixtures (naar LP0065 en de doelenset wetenschap en techniek, ingekort) ──
type Vlaggen = Omit<TekstStuk, 't'>;
const t = (s: string, opmaak: Vlaggen = {}): TekstStuk => ({ t: s, ...opmaak });
const B: Vlaggen = { b: true };
const I: Vlaggen = { i: true };
const alinea = (...tekst: Stuk[]): Extract<Blok, { soort: 'alinea' }> => ({ soort: 'alinea', tekst });
const kop = (niveau: 1 | 2 | 3 | 4, s: string): Blok => ({ soort: 'kop', niveau, tekst: [t(s)] });
const lijstBlok = (items: Regel[]): Extract<Blok, { soort: 'lijst' }> => ({ soort: 'lijst', genummerd: false, items });
const cel = (rol: Cel['rol'], blokken: CelBlok[], samengevoegd?: Cel['samengevoegd']): Cel => ({ rol, blokken, ...(samengevoegd ? { samengevoegd } : {}) });
const koprij = (): Cel[] => [cel('kolomkop', []), cel('kolomkop', [alinea(t('Inhoud (Wat?)', B))]), cel('kolomkop', [alinea(t('Didactiek (Hoe?)', B))])];
const SHA = 'c'.repeat(64);

function lesplan(): GoLesplanBestand {
  return {
    app: 'boosterz',
    kind: 'go-lesplan',
    v: 1,
    code: 'LP0065',
    titel: 'Dieren classificeren',
    leeftijd: '2,5-4',
    delen: [
      {
        nr: 0,
        blokken: [
          kop(1, 'Lesplan LP0065 Dieren classificeren (2,5-4 jaar)'),
          alinea(t('Vakdiscipline:', B), t(' Wetenschap en techniek')),
          alinea(t('Lessenlijn:', B), t(' Biologie van organismen')),
          alinea(t('Lessenreeks:', B), t(' Fauna: classificeren')),
          alinea(t('Lesplan:', B), t(' LP0065 Dieren classificeren')),
          alinea(t('Didactische fiche:', B), t(' DFWT005 Kenmerken van de organismen: Taxonomie van de fauna (GO! Navigator > …)')),
        ],
      },
      {
        nr: 1,
        blokken: [
          kop(2, '1. Wat moet de leraar weten?'),
          {
            soort: 'tabel',
            rijen: [
              koprij(),
              [
                cel('rijkop', [alinea(t('Kennis', B))]),
                cel('data', [alinea(t('Dieren en planten zijn levende organismen.'))]),
                cel('data', [lijstBlok([[t('Vertrek vanuit concrete materialen.')]])]),
              ],
            ],
          },
        ],
      },
      {
        nr: 2,
        blokken: [
          kop(2, '2. Wat moet de leerling kennen en kunnen?'),
          {
            soort: 'tabel',
            rijen: [
              koprij(),
              [
                cel('rijkop', [alinea(t('Leerplandoelen', B))]),
                cel('data', [
                  alinea(t('WT.001', B), t(' [begrijpen]', I), t(' Herkennen het organisme dier. (2,5-4 jaar)')),
                  alinea(t('WT.008', B), t(' [begrijpen]', I), t(' Herkennen de belangrijkste voedingswijze van dieren. (2,5-4 jaar)')),
                  alinea(t('MIA', B), t(' — Dieren:')),
                  lijstBlok([[t('zoogdieren')], [t('vogels')]]),
                ]),
                cel('data', [lijstBlok([[t('Laat leerlingen dieren herkennen.')]])]),
              ],
            ],
          },
        ],
      },
      {
        nr: 3,
        blokken: [
          kop(2, '3. Samenhang'),
          kop(3, 'Verticale samenhang'),
          alinea(t('Dit lesplan vormt een onderdeel van de lessenlijn '), t('Biologie van organismen', I), t('.')),
          kop(4, 'Vlaggen en schakels'),
          alinea({ icoon: 'schakel' }, t('   '), t('WT.229', B), t(' Herkennen de vijf zintuigen en bijbehorende lichaamsdelen. (2,5-4 jaar)')),
          {
            soort: 'tabel',
            rijen: [
              [cel('kolomkop', [alinea({ icoon: 'diploma' }, t('   '), t('Diploma', B))]), cel('kolomkop', [alinea({ icoon: 'deelconcept' }, t('   '), t('Deelconcepten', B))])],
              [cel('data', [alinea(t('De dierenkenner'))]), cel('data', [lijstBlok([[t('Bouw en functies van planten, dieren, mens')]])])],
            ],
          },
          alinea({ icoon: 'go-concept' }, t('   '), t('GO! concepten', B)),
          lijstBlok([[t('Structuur en functie: de bouw van een dier hangt samen met zijn functies.')]]),
          kop(4, 'Geïntegreerde samenhang met leren leren, ICT, sociale vaardigheden met dit lesplan'),
          alinea({ icoon: 'vlag' }, t('   '), t('LL.001', B), t(' Herkennen manieren om de impulsen te controleren. (2,5-4 jaar, 4-5 jaar, 5-6 jaar)')),
        ],
      },
      {
        nr: 4,
        blokken: [
          kop(2, '4. Lesopbouw'),
          {
            soort: 'tabel',
            rijen: [
              koprij(),
              [
                cel('rijkop', [alinea(t('Lesdoel', B))]),
                cel('data', [
                  alinea(t('Leerdoelen op leerlingenniveau vanuit het diploma: De dierenkenner 2,5-4 jaar', B)),
                  alinea(t('WT.001', B), t(' [begrijpen]', I), t(' (2,5-4 jaar)')),
                  lijstBlok([[t('Ik herken dieren.', B)]]),
                ]),
                cel('data', [
                  lijstBlok([[t('Vertaal het lesdoel naar een kindvriendelijk ik-doel.')]]),
                  {
                    soort: 'beeld',
                    bron: 'e11d61d723cc34e449f987f8bb06b5eb44de2082.png',
                    breedte: 400,
                    hoogte: 400,
                    status: 'getoond',
                    bestand: 'beelden/e11d61d723cc34e449f987f8bb06b5eb44de2082.webp',
                    alt: 'Mindmap "Mijn lichaam": in het midden MIJN LICHAAM, rond de lichaamsdelen met wat ze doen.',
                  },
                ]),
              ],
              [
                cel('rijkop', [alinea(t('Leskern', B))], 'begin'),
                cel('data', [alinea(t('1. Verkennen', B)), alinea(t('Het ontdekkend waarnemen van echte planten en dieren.'))]),
                cel('data', [alinea(t('1. Verkennen', B)), alinea(t('Vertrek bij voorkeur vanuit concrete waarnemingen.'))]),
              ],
              [
                cel('rijkop', [], 'vervolg'),
                cel('data', [alinea(t('2. Voorkeursinstructie', B))]),
                // Zo staat het in LP0065: een harde spatie tussen het nummer en de naam.
                cel('data', [alinea(t('2. Voorkeursinstructie', B)), alinea(t('Bekijk om beurt een dier en een plant.'))]),
              ],
              [cel('rijkop', [alinea(t('Vastlegging', B))]), cel('data', [alinea(t('Het borgen van het concept.'))]), cel('data', [alinea(t('W&T-hoek', B))])],
            ],
          },
        ],
      },
      {
        nr: 5,
        blokken: [
          kop(2, '5. Trainen'),
          alinea(t('Deze activiteiten geven richting.', I)),
          alinea(t('Dierenmand en plantenmand', B), { br: true }, t('Zet twee grote manden klaar.')),
          alinea(t('Wie heeft honger?', B), { br: true }, t('Zet enkele dierenknuffels op tafel.')),
          // Zoals in LP0014a: een vette titel als item midden in een lijst.
          lijstBlok([[t('lichaamsdelen benoemen')], [t('Lichaamsdelen-dobbelsteen', B)], [t('Gooi de dobbelsteen.')]]),
        ],
      },
      {
        nr: 6,
        blokken: [kop(2, '6. Didactisch materiaal bij dit lesplan'), alinea(t('Voorzie volgende didactische materialen:')), lijstBlok([[t('2 hoepels')], [t('een kartonnen doos')]])],
      },
    ],
    afgeleid: {
      vakdiscipline: 'Wetenschap en techniek',
      vak: 'WT',
      lessenlijn: 'Biologie van organismen',
      lessenreeks: 'Fauna: classificeren',
      didactischeFiches: [{ code: 'DFWT005', titel: 'Kenmerken van de organismen: Taxonomie van de fauna' }],
      leerplandoelen: [
        { code: 'WT.001', kennisverwerking: 'begrijpen', leeftijden: ['2,5-4'], tekst: 'Herkennen het organisme dier.', waar: { deel: 2, blok: 1, rij: 1, kolom: 1, regel: 0 } },
        {
          code: 'WT.008',
          kennisverwerking: 'begrijpen',
          leeftijden: ['2,5-4'],
          tekst: 'Herkennen de belangrijkste voedingswijze van dieren.',
          waar: { deel: 2, blok: 1, rij: 1, kolom: 1, regel: 1 },
        },
      ],
      diplomas: [{ naam: 'De dierenkenner', leeftijd: '2,5-4', ikDoelen: [{ code: 'WT.001', zinnen: ['Ik herken dieren.'] }], waar: { deel: 4, blok: 1, rij: 1, kolom: 1 } }],
      deelconcepten: ['Bouw en functies van planten, dieren, mens'],
      goConcepten: ['Structuur en functie'],
      vlaggen: ['LL.001'],
      schakels: ['WT.229'],
      stappen: [
        { nr: 1, naam: 'Verkennen', wat: { deel: 4, blok: 1, rij: 2, kolom: 1 }, hoe: { deel: 4, blok: 1, rij: 2, kolom: 2 } },
        { nr: 2, naam: 'Voorkeursinstructie', wat: { deel: 4, blok: 1, rij: 3, kolom: 1 }, hoe: { deel: 4, blok: 1, rij: 3, kolom: 2 } },
      ],
      trainen: [
        { titel: 'Dierenmand en plantenmand', vanaf: { deel: 5, blok: 2 }, tot: { deel: 5, blok: 2 } },
        { titel: 'Wie heeft honger?', vanaf: { deel: 5, blok: 3 }, tot: { deel: 5, blok: 4, item: 0 } },
        { titel: 'Lichaamsdelen-dobbelsteen', vanaf: { deel: 5, blok: 4, item: 1 }, tot: { deel: 5, blok: 4, item: 2 } },
      ],
      materiaal: { deel: 6, blok: 2 },
    },
    bron: {
      net: 'GO!',
      naamsvermelding: GO_NAAMSVERMELDING,
      waar: 'GO! studio',
      url: GO_STUDIO_URL,
      bestand: { naam: 'LP0065.docx', bytes: 207813, sha256: 'f7a8b2a20bdb6cc0d0c96c8628b16f0b15ea19473bc44286cf97661914ad7503', datum: '2026-10-01T08:00:00Z' },
      ingelezen: '2026-11-09',
    },
    sha256: SHA,
  };
}

const geenVerwijzing = () => ({ codes: [], kapot: [] });

function leerplan(): GoLeerplanBestand {
  return {
    app: 'boosterz',
    kind: 'go-leerplan',
    v: 1,
    vak: 'WT',
    naam: 'Wetenschap en techniek',
    rubrieken: [
      { id: 'WT-r001', soort: 'onderwerp', tekst: 'Biologie', rij: 2 },
      { id: 'WT-r002', soort: 'subthema', tekst: 'Organismen', ouder: 'WT-r001', rij: 3 },
      { id: 'WT-r003', soort: 'rubriek', tekst: 'Dieren', ouder: 'WT-r002', rij: 4 },
      { id: 'WT-r004', soort: 'subrubriek', tekst: 'Voeding', ouder: 'WT-r003', rij: 20 },
      { id: 'WT-r005', soort: 'subthema', tekst: 'De mens', ouder: 'WT-r001', rij: 30 },
      // Een niveau overgeslagen, zoals in wiskunde: een subrubriek rechtstreeks onder een subthema.
      { id: 'WT-r006', soort: 'subrubriek', tekst: 'Zintuigen', ouder: 'WT-r005', rij: 31 },
    ],
    doelen: [
      {
        code: 'WT.001',
        tekst: 'Herkennen het organisme dier. ',
        rij: 5,
        kennisverwerking: 'begrijpen',
        leeftijden: ['2,5-4'],
        rubriek: 'WT-r003',
        inhoud: [
          { soort: 'mia-titel', tekst: 'Herkennen:', rij: 6 },
          { soort: 'mia', tekst: 'zoogdieren', aanklikbaar: false, rij: 7 },
          { soort: 'begrip', tekst: 'het dier', leeftijden: ['2,5-4'], rij: 8 },
          // 17 begrippen in de bron hebben geen leeftijd (rechtzetting 4).
          { soort: 'begrip', tekst: 'de alleseter', leeftijden: [], rij: 9 },
          { soort: 'voorbeelden-titel', tekst: 'Voorbeelden', rij: 10 },
          { soort: 'voorbeeld', tekst: 'Lotte ziet een kat in de tuin.', rij: 11 },
          { soort: 'voetnoot', tekst: '* zie ook de dierenkenner', rij: 12 },
        ],
        minimumdoelen: { bron: { KO: '3.1.2' }, refs: [{ set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'officieel' }], problemen: [] },
        vlaggen: { bron: 'LL.001; LO.076', codes: ['LL.001', 'LO.076'], kapot: [] },
        schakels: geenVerwijzing(),
      },
      {
        code: 'WT.002',
        tekst: 'Gebruiken hun zintuigen om prikkels in de omgeving te onderscheiden.',
        rij: 13,
        kennisverwerking: 'gebruiken',
        leeftijden: ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10'],
        rubriek: 'WT-r003',
        inhoud: [],
        // Zoals WT.235: ook naar L6 3.3.2, wat niet bij 2,5-4 tot 9-10 jaar past.
        minimumdoelen: {
          bron: { KO: '3.3.1', L6: '3.3.2' },
          refs: [
            { set: 'ODS_3410', id: '92612', code: '3.3.1', moment: 'KO', status: 'officieel' },
            { set: 'ODS_3409', id: '92822', code: '3.3.2', moment: 'L6', status: 'officieel', twijfel: ['moment-buiten-leeftijden'] },
          ],
          problemen: [],
        },
        vlaggen: { bron: 'NL. 200, LL/095, WT.003, WT.999', codes: ['WT.003'], kapot: ['NL. 200', 'LL/095', 'WT.999'] },
        schakels: geenVerwijzing(),
      },
      {
        // Zoals WI.408: alleen een MIA-titel is gekoppeld; de doelzin zelf niet. Met een doorgehaalde spatie.
        code: 'WT.003',
        tekst: 'Tellen gerelateerde breuken op. ',
        opmaak: [t('Tellen gerelateerde'), t(' ', { s: true }), t('breuken op. ')],
        rij: 21,
        kennisverwerking: 'begrijpen',
        leeftijden: ['10-11'],
        rubriek: 'WT-r004',
        inhoud: [
          {
            soort: 'mia-titel',
            tekst: 'Aftrekken: ',
            rij: 22,
            koppeling: { bron: { L6: '2.2.7' }, refs: [{ set: 'ODS_3402', id: '93310', code: '2.2.7', moment: 'L6', status: 'officieel' }], problemen: [] },
          },
          { soort: 'mia', tekst: '1cm3: volume van een kubus met een ribbe van 1 cm', opmaak: [t('1cm'), t('3', { sup: true }), t(': volume van een kubus met een ribbe van 1 cm')], aanklikbaar: true, rij: 23 },
        ],
        minimumdoelen: { bron: {}, refs: [], problemen: [] },
        vlaggen: geenVerwijzing(),
        schakels: { bron: 'WT.001', codes: ['WT.001'], kapot: [] },
      },
      {
        // Zoals MV.040: '6.12' is geen geldige code; voorstel 6.1.2.
        code: 'WT.004',
        tekst: 'Verkennen vormgevingsmiddelen.',
        rij: 32,
        kennisverwerking: 'begrijpen',
        leeftijden: ['2,5-4', '4-5', '5-6'],
        rubriek: 'WT-r006',
        inhoud: [],
        minimumdoelen: {
          bron: { KO: '6.1.1, 6.12' },
          refs: [
            { set: 'ODS_3415', id: '92438', code: '6.1.1', moment: 'KO', status: 'officieel' },
            { set: 'ODS_3415', id: '92439', code: '6.1.2', moment: 'KO', status: 'voorstel', bronCode: '6.12' },
          ],
          problemen: [{ moment: 'KO', bronCode: '6.12', reden: 'onleesbaar' }],
        },
        vlaggen: geenVerwijzing(),
        schakels: geenVerwijzing(),
      },
      {
        code: 'WT.005',
        tekst: 'Herkennen wat planten nodig hebben om te groeien.',
        rij: 33,
        kennisverwerking: 'begrijpen',
        leeftijden: ['2,5-4'],
        rubriek: 'WT-r006',
        inhoud: [],
        minimumdoelen: { bron: {}, refs: [], problemen: [] },
        vlaggen: geenVerwijzing(),
        schakels: geenVerwijzing(),
      },
      {
        // Een code die niet bestaat, zonder voorstel.
        code: 'WT.006',
        tekst: 'Meten temperaturen.',
        rij: 34,
        kennisverwerking: 'gebruiken',
        leeftijden: ['8-9'],
        rubriek: 'WT-r006',
        inhoud: [],
        minimumdoelen: { bron: { L4: '2.4.44' }, refs: [], problemen: [{ moment: 'L4', bronCode: '2.4.44', reden: 'bestaat-niet' }] },
        vlaggen: geenVerwijzing(),
        schakels: geenVerwijzing(),
      },
      {
        // Zoals WI.706 → KO 4.2.3: een doel van een ander vak (alleen via bekende-afwijkingen.json).
        code: 'WT.007',
        tekst: '(De)monteren ruimtefiguren tot een bouwsel en omgekeerd.',
        rij: 35,
        kennisverwerking: 'gebruiken',
        leeftijden: ['2,5-4', '4-5', '5-6'],
        rubriek: 'WT-r006',
        inhoud: [],
        minimumdoelen: { bron: { KO: '4.2.3' }, refs: [{ set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO', status: 'officieel', twijfel: ['ander-vak'] }], problemen: [] },
        vlaggen: geenVerwijzing(),
        schakels: geenVerwijzing(),
      },
    ],
    bron: {
      net: 'GO!',
      naamsvermelding: GO_NAAMSVERMELDING,
      waar: 'GO! Navigator',
      leerplan: 'Het nieuwe GO! leerplan basisonderwijs',
      bestand: { naam: 'Doelenset BaO wetenschap en techniek.xlsx', bytes: 309202, sha256: '43e67805d68d7206b023b9e66fb06c66f9d842a8c0912b0ffee9702a1c52e617', datum: '2026-09-03T10:00:00Z' },
      ingelezen: '2026-11-09',
    },
    sha256: SHA,
  };
}

function bij(): GoBijMinimumdoelBestand {
  return {
    app: 'boosterz',
    kind: 'go-bij-minimumdoel',
    v: 1,
    vak: 3,
    doelen: {
      '92590': [
        { code: 'WT.001', moment: 'KO', status: 'officieel', tekst: 'Herkennen het organisme dier. ', kennisverwerking: 'begrijpen', leeftijden: ['2,5-4'], lesplannen: ['LP0065'] },
        { code: 'WT.028', moment: 'KO', status: 'officieel', tekst: 'Onderscheiden dieren en planten.', kennisverwerking: 'gebruiken', leeftijden: ['2,5-4'], lesplannen: ['LP0065', 'LP0074'] },
      ],
      '92822': [
        {
          code: 'WT.235',
          moment: 'L6',
          status: 'officieel',
          twijfel: ['moment-buiten-leeftijden'],
          tekst: 'Gebruiken hun zintuigen om prikkels in de omgeving te onderscheiden.',
          kennisverwerking: 'gebruiken',
          leeftijden: ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10'],
          lesplannen: ['LP0014b'],
        },
      ],
      '92613': [
        {
          code: 'WT.300',
          moment: 'L6',
          status: 'officieel',
          tekst: 'Tellen gerelateerde breuken op. ',
          opmaak: [t('Tellen gerelateerde'), t(' ', { s: true }), t('breuken op. ')],
          kennisverwerking: 'begrijpen',
          leeftijden: ['10-11'],
          lesplannen: [],
          via: [{ soort: 'mia-titel', tekst: 'Aftrekken: ', rij: 22 }],
        },
      ],
    },
    sha256: SHA,
  };
}

function bijVoorstel(): GoBijMinimumdoelBestand {
  return {
    app: 'boosterz',
    kind: 'go-bij-minimumdoel',
    v: 1,
    vak: 6,
    doelen: {
      '92439': [
        { code: 'MV.040', moment: 'KO', status: 'voorstel', bronCode: '6.12', tekst: 'Verkennen vormgevingsmiddelen.', kennisverwerking: 'begrijpen', leeftijden: ['2,5-4', '4-5', '5-6'], lesplannen: [] },
      ],
    },
    sha256: SHA,
  };
}

const perLeeftijd = { '2,5-4': 125, '4-5': 110, '5-6': 105, '6-7': 60, '7-8': 55, '8-9': 50, '9-10': 52, '10-11': 108, '11-12': 109 };

function index(): GoIndex {
  return {
    app: 'boosterz',
    kind: 'go-index',
    v: 1,
    naamsvermelding: GO_NAAMSVERMELDING,
    ingelezen: '2026-11-09',
    leerplan: [
      { vak: 'NL', naam: 'Nederlands', bestand: 'leerplan/NL.json', aantal: 622, zonderMinimumdoel: 46, perLeeftijd, bronDatum: '2026-09-03T10:00:00Z', sha256: SHA },
      { vak: 'WT', naam: 'Wetenschap en techniek', bestand: 'leerplan/WT.json', aantal: 528, zonderMinimumdoel: 106, perLeeftijd, bronDatum: '2026-09-03T10:00:00Z', sha256: SHA },
    ],
    bijMinimumdoel: [
      { vak: 1, bestand: 'bij-minimumdoel/1.json', sha256: SHA },
      { vak: 3, bestand: 'bij-minimumdoel/3.json', sha256: SHA },
    ],
    lesplannen: [
      { code: 'LP0014a', titel: 'De lichaamsdelen en hun bijhorende functie(s)', leeftijd: '2,5-4', vak: 'WT', lessenlijn: 'Biologie van de mens', lessenreeks: 'Het menselijk lichaam', doelen: ['WT.176', 'WT.177'], bestand: 'lesplannen/LP0014a.json', sha256: SHA },
      { code: 'LP0065', titel: 'Dieren classificeren', leeftijd: '2,5-4', vak: 'WT', lessenlijn: 'Biologie van organismen', lessenreeks: 'Fauna: classificeren', doelen: ['WT.001', 'WT.008', 'WT.028'], bestand: 'lesplannen/LP0065.json', sha256: SHA },
    ],
  };
}

// ── Hulp om te muteren ──
type Json = unknown;
type Pad = (string | number)[];
function kopie<T>(x: T): T {
  return structuredClone(x);
}
function zet(doel: Json, pad: Pad, waarde: Json): Json {
  const uit = kopie(doel) as Record<string | number, Json>;
  let o = uit;
  for (const k of pad.slice(0, -1)) o = o[k] as Record<string | number, Json>;
  const laatste = pad[pad.length - 1];
  if (waarde === undefined) delete o[laatste];
  else o[laatste] = waarde;
  return uit;
}
function met<T>(doel: T, wijzig: (x: T) => void): T {
  const k = kopie(doel);
  wijzig(k);
  return k;
}
/** Alle paden in een JSON-boom, met de waarde. */
function paden(x: Json, pad: Pad = []): [Pad, Json][] {
  const uit: [Pad, Json][] = [];
  if (Array.isArray(x)) x.forEach((v, i) => uit.push([[...pad, i], v], ...paden(v, [...pad, i])));
  else if (typeof x === 'object' && x !== null) for (const [k, v] of Object.entries(x)) uit.push([[...pad, k], v], ...paden(v, [...pad, k]));
  return uit;
}
const alles = (fouten: string[]) => fouten.join('\n');

const VALIDATORS = [
  ['lesplan', valideerGoLesplan, lesplan],
  ['leerplan', valideerGoLeerplan, leerplan],
  ['bij-minimumdoel', valideerGoBijMinimumdoel, bij],
  ['index', valideerGoIndex, index],
] as const;

// ── Algemeen ──
describe('de vier validators: algemeen', () => {
  it.each(VALIDATORS)('%s: de fixture is in orde', (_n, valideer, maak) => {
    expect(valideer(maak())).toEqual([]);
  });

  it('bij-minimumdoel met een voorstel is in orde', () => {
    expect(valideerGoBijMinimumdoel(bijVoorstel())).toEqual([]);
  });

  it.each(VALIDATORS)('%s: weigert iets wat geen object is, zonder vast te lopen', (_n, valideer) => {
    for (const x of [null, undefined, 42, 'tekst', [], true]) {
      const f = valideer(x);
      expect(f.length).toBeGreaterThan(0);
      expect(alles(f)).not.toMatch(/liep vast/);
    }
  });

  it.each(VALIDATORS)('%s: een onbekend veld is een fout, bovenaan en diep (zo glipt er geen metadata mee)', (_n, valideer, maak) => {
    expect(alles(valideer({ ...(maak() as object), maker: 'Jan Janssens' }))).toMatch(/onbekend veld "maker"/);
    // Diep: bij elk object in de boom een extra veld.
    const objecten = paden(maak()).filter(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v));
    expect(objecten.length).toBeGreaterThan(3);
    for (const [pad, v] of objecten) {
      // De sleutels van 'doelen' (bij-minimumdoel) zijn vaste nummers, die van een koppelingsbron momenten.
      const f = valideer(zet(maak(), pad, { ...(v as object), lastModifiedBy: 'x' }));
      expect(alles(f), pad.join('.')).toMatch(/onbekend (veld|moment) "lastModifiedBy"|vaste nummer/);
    }
  });

  it.each(VALIDATORS)('%s: elk blad is gecontroleerd: een waarde van het verkeerde soort geeft altijd een fout', (_n, valideer, maak) => {
    for (const [pad, v] of paden(maak())) {
      const vervangers: Json[] =
        typeof v === 'string' ? [42, null, []] : typeof v === 'number' ? ['x', null, 1.5] : typeof v === 'boolean' ? ['true', null] : Array.isArray(v) ? [null, {}, 'x'] : [null, [], 'x'];
      for (const w of vervangers) {
        const f = valideer(zet(maak(), pad, w));
        expect(f.length, `${pad.join('.')} → ${JSON.stringify(w)}`).toBeGreaterThan(0);
        expect(alles(f), `${pad.join('.')} → ${JSON.stringify(w)}`).not.toMatch(/liep vast/);
      }
    }
  });

  it.each(VALIDATORS)('%s: loopt nooit vast, ook niet als een veld wegvalt of leeg is', (_n, valideer, maak) => {
    for (const [pad] of paden(maak())) {
      for (const w of [undefined, '', ' ', 0, -1, {}, [{}], [null]]) {
        const f = valideer(zet(maak(), pad, w));
        expect(Array.isArray(f)).toBe(true);
        expect(alles(f), `${pad.join('.')} → ${JSON.stringify(w)}`).not.toMatch(/liep vast/);
      }
    }
  });

  it('beperkt het aantal meldingen', () => {
    const l = leerplan();
    for (const d of l.doelen) (d as { kennisverwerking: string }).kennisverwerking = 'weten';
    for (let i = 0; i < 200; i++) (l.rubrieken as unknown[]).push({ foutje: i });
    const f = valideerGoLeerplan(l);
    expect(f.length).toBe(101);
    expect(f[100]).toMatch(/^… en nog \d+ fouten$/);
  });
});

// ── Persoonsgegevens ──
describe('persoonsgegevens: geen e-mailadres en geen telefoonnummer', () => {
  const telefoons = ['+32 9 123 45 67', '0032 475 12 34 56', '+32 (0)9 123 45 67', '0475 12 34 56', '0475/12.34.56', '0475123456', '09 123 45 67', '02/123.45.67', '050 12 34 56', '015/12.34.56'];
  const geen = [
    '03/07/2018',
    'Geboren op 03/07/2018 in Gent.',
    '1 412 164 992',
    '10 000 000 000',
    '0 tot en met 100',
    '2,5-4 jaar, 4-5 jaar',
    'WT.086 LP0065 ODS_3410 92929 DFWT005',
    '1cm3: volume van een kubus',
    '3.1.3, 3.1.4',
    'speciale tekens: @, #, /, (, ), €, %,',
    'H@nd!g3Wachtw00rd',
    // Een sha-256 met een reeks cijfers die op een nummer lijkt.
    `a0912345678f${'e'.repeat(52)}`,
    `0475123456${'b'.repeat(54)}`,
    '04.05.2020',
    '09.10.2020 om 10.30 uur',
  ];

  it.each(telefoons)('herkent het telefoonnummer %s', (nr) => {
    expect(zoekPersoonsgegevens({ tekst: `Bel ${nr} na school.` })).toEqual([{ pad: 'tekst', soort: 'telefoon' }]);
  });

  it.each(geen)('geeft geen valse treffer op %s', (s) => {
    expect(zoekPersoonsgegevens([s])).toEqual([]);
  });

  it('herkent een e-mailadres, ook in een sleutel', () => {
    expect(zoekPersoonsgegevens({ a: ['x', 'Mail naar juf.an@school.be.'] })).toEqual([{ pad: 'a[1]', soort: 'e-mail' }]);
    expect(zoekPersoonsgegevens({ 'jan@voorbeeld.be': 1 })).toEqual([{ pad: '(bestand) (sleutel)', soort: 'e-mail' }]);
  });

  it('meldt het in elke validator, met de plaats maar zonder het nummer zelf', () => {
    const l = met(leerplan(), (x) => {
      x.doelen[0].inhoud[5].tekst = 'Lotte belt 0475 12 34 56.';
    });
    const f = valideerGoLeerplan(l);
    expect(f).toEqual(['doelen[0].inhoud[5].tekst: lijkt een telefoonnummer te bevatten']);
    expect(alles(f)).not.toMatch(/0475/);
    const p = met(lesplan(), (x) => {
      x.delen[6].blokken[1] = alinea(t('Vragen? juf.an@school.be'));
    });
    expect(valideerGoLesplan(p)).toEqual(['delen[6].blokken[1].tekst[0].t: lijkt een e-mailadres te bevatten']);
    const b = met(bij(), (x) => {
      x.doelen['92590'][0].tekst = 'Bel 09 123 45 67';
    });
    expect(valideerGoBijMinimumdoel(b)).toEqual(['doelen.92590[0].tekst: lijkt een telefoonnummer te bevatten']);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.lesplannen[0].titel = 'Info: x@y.be'))))).toMatch(/e-mailadres/);
  });

  it('loopt niet vast op een kringverwijzing', () => {
    const a: Record<string, unknown> = { tekst: 'ok' };
    a.zelf = a;
    expect(zoekPersoonsgegevens(a)).toEqual([]);
    // Ook niet als zo'n object in een veld staat (een object in het geheugen, vóór het schrijven).
    const l = leerplan() as unknown as { doelen: Record<string, unknown>[] };
    l.doelen[0].kennisverwerking = a;
    const f = valideerGoLeerplan(l);
    expect(alles(f)).toMatch(/kennisverwerking: object is geen geldige kennisverwerking/);
    expect(alles(f)).not.toMatch(/liep vast/);
  });
});

// ── Leerplan ──
describe('valideerGoLeerplan', () => {
  it('eist codes van 001 tot N met het voorvoegsel van het bestand', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[1].code = 'WT.003'))))).toMatch(/doelen\[1\].*moet "WT.002" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].code = 'AK.001'))))).toMatch(/moet "WT.001" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.vak = 'AA'))))).toMatch(/moet "Aardrijkskunde" zijn bij AA/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen = []))))).toMatch(/doelen: is leeg/);
  });

  it('eist de naam van het tabblad en de vaste kop', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.naam = 'W&T'))))).toMatch(/naam: moet "Wetenschap en techniek" zijn/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['kind'], 'go-lesplan') as GoLeerplanBestand))).toMatch(/"kind" moet "go-leerplan" zijn/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['v'], 2) as GoLeerplanBestand))).toMatch(/"v" moet 1 zijn/);
  });

  it('eist volgnummers en ouders van rubrieken zoals ze uit de bronvolgorde volgen', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.rubrieken[1].id = 'WT-r009'))))).toMatch(/rubrieken\[1\]\.id: moet "WT-r002" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.rubrieken[2].ouder = 'WT-r001'))))).toMatch(/rubrieken\[2\]\.ouder: moet "WT-r002" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.rubrieken[0].ouder = 'WT-r002'))))).toMatch(/rubrieken\[0\]\.ouder: er staat geen rubriek van een hoger niveau boven/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => delete x.rubrieken[5].ouder)))).toMatch(/rubrieken\[5\]\.ouder: moet "WT-r005" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.rubrieken[3].rij = 3))))).toMatch(/rubrieken\[3\]\.rij: de rubrieken staan in bronvolgorde/);
  });

  it('eist dat een doel bij de laatste rubriek erboven hoort', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[2].rubriek = 'WT-r003'))))).toMatch(/doelen\[2\] \(WT.003\)\.rubriek: moet "WT-r004" zijn/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].rij = 1))))).toMatch(/er staat geen rubriek boven dit doel/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[1].rij = 4))))).toMatch(/op die rij staat een rubriek|bronvolgorde/);
  });

  it('eist dat de inhoud tussen het doel en de volgende doel- of rubriekrij staat', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].inhoud[6].rij = 13))))).toMatch(/staat na de volgende doel- of rubriekrij \(13\)/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].inhoud[0].rij = 5))))).toMatch(/staat niet na het doel/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].inhoud[2].rij = 6))))).toMatch(/inhoud\[2\]\.rij: staat niet na het doel en na de inhoud ervoor/);
  });

  it('laat een begrip zonder leeftijd toe, een doel zonder leeftijd niet; leeftijden in volgorde en zonder dubbels', () => {
    expect(valideerGoLeerplan(leerplan())).toEqual([]);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].leeftijden = []))))).toMatch(/moet minstens één leeftijd hebben/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[3].leeftijden = ['4-5', '2,5-4', '5-6']))))).toMatch(/zonder dubbels en in volgorde/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[3].leeftijden = ['4-5', '4-5']))))).toMatch(/zonder dubbels en in volgorde/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 0, 'inhoud', 2, 'leeftijden'], ['3-4'])))).toMatch(/zonder dubbels en in volgorde/);
  });

  it('weigert een inhoudsveld dat niet bij de soort hoort', () => {
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 0, 'inhoud', 2, 'koppeling'], { bron: { KO: '3.1.2' }, refs: [], problemen: [] })))).toMatch(/onbekend veld "koppeling"/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 0, 'inhoud', 0, 'aanklikbaar'], true)))).toMatch(/onbekend veld "aanklikbaar"/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 0, 'inhoud', 0, 'soort'], 'mia - titel')))).toMatch(/geen geldige soort inhoud/);
  });

  describe('koppeling naar minimumdoelen', () => {
    it('eist dat elke code uit de bron verantwoord is: geen code valt stil weg', () => {
      const l = met(leerplan(), (x) => (x.doelen[0].minimumdoelen.bron.KO = '3.1.2, 3.1.3'));
      expect(alles(valideerGoLeerplan(l))).toMatch(/de code "3.1.3" bij KO is niet verantwoord/);
      const l2 = met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs = []));
      expect(alles(valideerGoLeerplan(l2))).toMatch(/de code "3.1.2" bij KO is niet verantwoord/);
    });

    it('eist dat een officiële ref letterlijk in de bron staat, bij het juiste moment', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].code = '3.1.3'))))).toMatch(/de code 3.1.3 staat niet in de bron bij KO/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].moment = 'L4'))))).toMatch(/staat niet in de bron bij L4/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[4].minimumdoelen.refs = [{ set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'officieel' }]))))).toMatch(
        /staat niet in de bron bij KO/,
      );
    });

    it('weigert een onbekend moment, een lege codekolom en dubbels', () => {
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 0, 'minimumdoelen', 'bron', 'L5'], '3.1.2')))).toMatch(/onbekend moment "L5"/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.bron.KO = ' , '))))).toMatch(/bevat geen code/);
      const dubbel = met(leerplan(), (x) => {
        x.doelen[0].minimumdoelen.bron.KO = '3.1.2, 3.1.2';
        x.doelen[0].minimumdoelen.refs.push({ ...x.doelen[0].minimumdoelen.refs[0] });
      });
      expect(alles(valideerGoLeerplan(dubbel))).toMatch(/het minimumdoel ODS_3410\/92590 staat er meer dan één keer/);
    });

    it('controleert set, vast nummer en code van een ref', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].set = '3410'))))).toMatch(/geen geldige set/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].id = '092590'))))).toMatch(/geen geldig vast nummer/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].id = '__proto__'))))).toMatch(/geen geldig vast nummer/);
    });

    it('eist de juiste reden bij een probleem: onleesbaar of bestaat-niet', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[3].minimumdoelen.problemen[0].reden = 'bestaat-niet'))))).toMatch(/bij "6.12" hoort de reden 'onleesbaar'/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[5].minimumdoelen.problemen[0].reden = 'onleesbaar'))))).toMatch(/bij "2.4.44" hoort de reden 'bestaat-niet'/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[5].minimumdoelen.problemen[0].bronCode = '2.4.45'))))).toMatch(/"2.4.45" staat niet in de bron bij L4/);
    });

    it('laat een voorstel toe voor een onleesbare en voor een onbestaande code, telkens met zijn probleem (rechtzetting 7)', () => {
      expect(valideerGoLeerplan(leerplan())).toEqual([]);
      const bestaatNiet = met(leerplan(), (x) => {
        x.doelen[5].minimumdoelen.refs = [{ set: 'ODS_3399', id: '93255', code: '2.3.44', moment: 'L4', status: 'voorstel', bronCode: '2.4.44' }];
      });
      expect(valideerGoLeerplan(bestaatNiet)).toEqual([]);
    });

    it('weigert een voorstel zonder probleem, zonder bronCode, of met de code van de bron', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[3].minimumdoelen.problemen = []))))).toMatch(/bij een voorstel hoort een probleem/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => delete x.doelen[3].minimumdoelen.refs[1].bronCode)))).toMatch(/een voorstel heeft een "bronCode"/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].bronCode = '3.1.2'))))).toMatch(/een officiële koppeling heeft geen "bronCode"/);
      const zelfde = met(leerplan(), (x) => {
        x.doelen[5].minimumdoelen.refs = [{ set: 'ODS_3399', id: '93255', code: '2.4.44', moment: 'L4', status: 'voorstel', bronCode: '2.4.44' }];
      });
      expect(alles(valideerGoLeerplan(zelfde))).toMatch(/een voorstel stelt een andere code voor/);
      const twee = met(leerplan(), (x) => x.doelen[3].minimumdoelen.refs.push({ set: 'ODS_3415', id: '92440', code: '6.1.3', moment: 'KO', status: 'voorstel', bronCode: '6.12' }));
      expect(alles(valideerGoLeerplan(twee))).toMatch(/er is al een voorstel voor KO "6.12"/);
    });

    it('weigert een code die zowel koppeling als probleem is', () => {
      const l = met(leerplan(), (x) => x.doelen[0].minimumdoelen.problemen.push({ moment: 'KO', bronCode: '3.1.2', reden: 'bestaat-niet' }));
      expect(alles(valideerGoLeerplan(l))).toMatch(/KO 3.1.2 staat zowel als koppeling als als probleem/);
    });

    it('eist de twijfel als het moment niet bij de leeftijden past, en alleen dan (rechtzetting 1)', () => {
      const zonder = met(leerplan(), (x) => delete x.doelen[1].minimumdoelen.refs[1].twijfel);
      expect(alles(valideerGoLeerplan(zonder))).toMatch(/het moment L6 past niet bij 2,5-4 jaar.*9-10 jaar: twijfel 'moment-buiten-leeftijden' ontbreekt/);
      const teVeel = met(leerplan(), (x) => (x.doelen[0].minimumdoelen.refs[0].twijfel = ['moment-buiten-leeftijden']));
      expect(alles(valideerGoLeerplan(teVeel))).toMatch(/twijfel 'moment-buiten-leeftijden' klopt niet: KO past bij 2,5-4 jaar/);
      // Ook op een koppeling via een MIA: de leeftijden van het doel gelden.
      const mia = met(leerplan(), (x) => (x.doelen[2].leeftijden = ['8-9']));
      expect(alles(valideerGoLeerplan(mia))).toMatch(/inhoud\[0\]\.koppeling\.refs\[0\]: het moment L6 past niet bij 8-9 jaar/);
    });

    it("laat 'ander-vak' alleen of samen met de leeftijdstwijfel toe, zonder dubbels en in vaste volgorde", () => {
      const beide = met(leerplan(), (x) => {
        x.doelen[6].leeftijden = ['6-7'];
        x.doelen[6].minimumdoelen.refs[0].twijfel = ['moment-buiten-leeftijden', 'ander-vak'];
      });
      expect(valideerGoLeerplan(beide)).toEqual([]);
      const omgekeerd = met(beide, (x) => (x.doelen[6].minimumdoelen.refs[0].twijfel = ['ander-vak', 'moment-buiten-leeftijden']));
      expect(alles(valideerGoLeerplan(omgekeerd))).toMatch(/in de volgorde van GO_TWIJFELS/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[6].minimumdoelen.refs[0].twijfel = ['ander-vak', 'ander-vak']))))).toMatch(/in de volgorde van GO_TWIJFELS/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[6].minimumdoelen.refs[0].twijfel = []))))).toMatch(/twijfel: is leeg/);
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 6, 'minimumdoelen', 'refs', 0, 'twijfel'], ['vreemd'])))).toMatch(/geen geldige twijfel/);
    });

    it('eist een bron op een koppeling via een MIA (anders: weglaten)', () => {
      const l = met(leerplan(), (x) => {
        const i = x.doelen[2].inhoud[0];
        if (i.soort === 'mia-titel') i.koppeling = { bron: {}, refs: [], problemen: [] };
      });
      expect(alles(valideerGoLeerplan(l))).toMatch(/inhoud\[0\]\.koppeling\.bron: is leeg; laat de koppeling dan weg/);
    });
  });

  describe('zonder minimumdoel (rechtzetting 2)', () => {
    it('alleen als noch de doelzin, noch een MIA- of voorbeeldrij een code draagt', () => {
      const d = leerplan().doelen;
      expect(isZonderMinimumdoel(d[0])).toBe(false); // gekoppeld
      expect(isZonderMinimumdoel(d[2])).toBe(false); // alleen via een MIA, zoals WI.408
      expect(isZonderMinimumdoel(d[4])).toBe(true); // echt zonder, zoals WT.057
      expect(isZonderMinimumdoel(d[5])).toBe(false); // alleen een kapotte code: 'kapot', niet 'zonder'
      const voorbeeld: GoLeerplandoel = {
        ...d[4],
        inhoud: [{ soort: 'voorbeeld', tekst: 'x', rij: 34, koppeling: { bron: { L6: '9.1.9' }, refs: [], problemen: [{ moment: 'L6', bronCode: '9.1.9', reden: 'bestaat-niet' }] } }],
      };
      expect(isZonderMinimumdoel(voorbeeld)).toBe(false);
    });
  });

  describe('vlaggen en schakels', () => {
    it('verdeelt de bron letterlijk over codes en kapotte waarden', () => {
      expect(valideerGoLeerplan(leerplan())).toEqual([]);
      expect(splitsVerwijzingen('WI.993, 994, 995, 996')).toEqual(['WI.993', '994', '995', '996']);
      expect(splitsVerwijzingen('LL.051, LL.091, WI,997, WI.998')).toEqual(['LL.051', 'LL.091', 'WI', '997', 'WI.998']);
      expect(splitsVerwijzingen('NL.3441 BU.146')).toEqual(['NL.3441 BU.146']);
    });

    it('weigert een deel van de bron dat nergens staat, en een code of waarde die niet in de bron staat', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[1].vlaggen.kapot = ['NL. 200', 'WT.999']))))).toMatch(/"LL\/095" uit de bron staat niet bij "codes" en niet bij "kapot"/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => x.doelen[1].vlaggen.codes.push('LL.001'))))).toMatch(/"LL.001" staat niet in de bron/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => delete x.doelen[0].vlaggen.bron)))).toMatch(/zonder "bron" zijn "codes" en "kapot" leeg/);
    });

    it('eist dat een code van het eigen vak bestaat, en dat een bestaande code niet bij kapot staat', () => {
      const onbestaand = met(leerplan(), (x) => {
        x.doelen[1].vlaggen.codes = ['WT.003', 'WT.999'];
        x.doelen[1].vlaggen.kapot = ['NL. 200', 'LL/095'];
      });
      expect(alles(valideerGoLeerplan(onbestaand))).toMatch(/WT.999 bestaat niet in dit leerplan; zet het bij "kapot"/);
      const bestaand = met(leerplan(), (x) => {
        x.doelen[1].vlaggen.codes = [];
        x.doelen[1].vlaggen.kapot = ['NL. 200', 'LL/095', 'WT.003', 'WT.999'];
      });
      expect(alles(valideerGoLeerplan(bestaand))).toMatch(/WT.003 bestaat wel; zet het bij "codes"/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[1].vlaggen.codes = ['WT.003', 'WT.003']))))).toMatch(/staat er meer dan één keer/);
    });
  });

  describe('tekst en opmaak (rechtzetting 3: doorgehaald en superschrift bewaren)', () => {
    it('aanvaardt een doorgehaalde spatie en een superschrift, met de letterlijke tekst in "tekst"', () => {
      expect(valideerGoLeerplan(leerplan())).toEqual([]);
    });

    it('weigert een "tekst" zonder de doorgehaalde stukken: woorden mogen niet aan elkaar plakken', () => {
      const l = met(leerplan(), (x) => (x.doelen[2].tekst = 'Tellen gerelateerdebreuken op. '));
      expect(alles(valideerGoLeerplan(l))).toMatch(/doelen\[2\] \(WT.003\)\.opmaak: geeft samen niet precies dezelfde tekst als "tekst"/);
    });

    it('weigert opmaak zonder opgemaakt stuk, niet samengevoegde stukken, een regeleinde of een vlag die niet true is', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[2].opmaak = [t('Tellen gerelateerde breuken op. ')]))))).toMatch(/heeft geen opgemaakt stuk/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[2].opmaak = [t('Tellen gerelateerde'), t(' breuken op. ')]))))).toMatch(/niet samengevoegd/);
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 2, 'opmaak', 1], { br: true })))).toMatch(/alleen tekststukken/);
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 2, 'opmaak', 1, 's'], false)))).toMatch(/"s" staat er alleen als het true is/);
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 2, 'opmaak', 1, 'sub'], true)))).toMatch(/onbekend veld "sub"/);
      expect(alles(valideerGoLeerplan(zet(leerplan(), ['doelen', 2, 'opmaak'], [])))).toMatch(/opmaak: is leeg/);
    });

    it('weigert een lege tekst of alleen witruimte, en een te lange tekst', () => {
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].tekst = '   '))))).toMatch(/tekst: moet een niet-lege tekst zijn/);
      expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.doelen[0].inhoud[1].tekst = 'x'.repeat(10001)))))).toMatch(/is langer dan 10000 tekens/);
    });
  });

  it('kent de kalender: schrikkeljaren, maanden van 30 dagen, tijdzones', () => {
    const datumFout = (d: string) => alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.ingelezen = d))));
    for (const goed of ['2028-02-29', '2000-02-29', '2026-04-30', '2026-12-31', '2026-01-01']) expect(datumFout(goed), goed).toBe('');
    for (const fout of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '1999-12-31', '2026-1-1', '2026-11-09T10:00:00Z']) {
      expect(datumFout(fout), fout).toMatch(/geen geldige datum/);
    }
    const tijdFout = (d: string) => alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.bestand.datum = d))));
    for (const goed of ['2026-09-03', '2026-09-03T10:00:00Z', '2026-09-03T10:00Z', '2026-09-03T10:00:00.123+02:00', '2026-09-03T23:59:59']) expect(tijdFout(goed), goed).toBe('');
    for (const fout of ['2026-09-03T24:00:00Z', '2026-09-03T10:60:00Z', '2026-09-03 10:00:00', '2026-02-30T10:00:00Z']) expect(tijdFout(fout), fout).toMatch(/geen geldige ISO-datum/);
  });

  it('controleert de bron: naamsvermelding, bestandsnaam zonder pad, geldige datum', () => {
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.naamsvermelding = 'GO!'))))).toMatch(/"naamsvermelding" moet/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.bestand.naam = '../Doelenset.xlsx'))))).toMatch(/geen bestandsnaam op .xlsx/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.bestand.naam = 'Doelenset.docx'))))).toMatch(/geen bestandsnaam op .xlsx/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.bestand.datum = '2026-02-30T10:00:00Z'))))).toMatch(/geen geldige ISO-datum/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.ingelezen = '9 november 2026'))))).toMatch(/geen geldige datum/);
    expect(alles(valideerGoLeerplan(met(leerplan(), (x) => (x.bron.bestand.sha256 = SHA.toUpperCase()))))).toMatch(/geen geldige sha-256/);
    expect(alles(valideerGoLeerplan(zet(leerplan(), ['bron', 'bestand', 'creator'], 'Jan')))).toMatch(/onbekend veld "creator"/);
  });
});

// ── Lesplan ──
describe('valideerGoLesplan', () => {
  it('eist de titel van het lesplan letterlijk als kop van niveau 1', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.titel = 'Dieren sorteren'))))).toMatch(/de titel moet "Lesplan LP0065 Dieren sorteren \(2,5-4 jaar\)" zijn/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.leeftijd = '4-5'))))).toMatch(/de titel moet/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.code = 'LP65'))))).toMatch(/geen geldige lesplancode/);
  });

  it('eist doorlopende delen die met hun kop beginnen, en koppen van niveau 1 en 2 alleen bovenaan', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[3].nr = 4))))).toMatch(/delen\[3\]\.nr: moet 3 zijn/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => x.delen[1].blokken.shift())))).toMatch(/deel 1 begint met een kop van niveau 2/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => x.delen[3].blokken.push(kop(2, 'Extra')))))).toMatch(/een kop van niveau 2 staat alleen bovenaan een deel/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => x.delen[0].blokken.push(kop(3, 'Tussenkop')))))).toMatch(/deel 0 .* heeft geen tussenkoppen/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken = []))))).toMatch(/delen\[6\]\.blokken: is leeg/);
  });

  it('weigert lege alinea\'s, ook met alleen een harde spatie of een regeleinde', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken[1] = alinea(t('  '))))))).toMatch(/bevat geen tekst en geen icoon/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken[1] = alinea({ br: true })))))).toMatch(/bevat geen tekst en geen icoon/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken[1] = alinea()))))).toMatch(/tekst: is leeg/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 6, 'blokken', 1, 'tekst', 0, 't'], '')))).toMatch(/"t" moet een niet-lege tekst zijn/);
  });

  it('eist dat aangrenzende stukken met dezelfde opmaak samengevoegd zijn, en kent alleen de zes iconen', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken[1] = alinea(t('Voorzie '), t('materialen'))))))).toMatch(/niet samengevoegd/);
    expect(valideerGoLesplan(met(lesplan(), (x) => (x.delen[6].blokken[1] = alinea(t('Voorzie'), { br: true }, t('materialen')))))).toEqual([]);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 3, 'blokken', 4, 'tekst', 0, 'icoon'], 'ster')))).toMatch(/geen geldig icoon/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 3, 'blokken', 4, 'tekst', 0], { icoon: 'vlag', t: 'x' })))).toMatch(/onbekend veld "icoon"/);
  });

  it('controleert lijsten: niet leeg, start alleen bij een genummerde lijst die verder telt', () => {
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 6, 'blokken', 2, 'items'], [])))).toMatch(/items: is leeg/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 6, 'blokken', 2, 'start'], 3)))).toMatch(/alleen een genummerde lijst heeft een start/);
    const genummerd = met(lesplan(), (x) => {
      const b = x.delen[6].blokken[2];
      if (b.soort === 'lijst') {
        b.genummerd = true;
        b.start = 1;
      }
    });
    expect(alles(valideerGoLesplan(genummerd))).toMatch(/start: 1 is geen geheel getal van 2 tot 1000/);
    expect(valideerGoLesplan(zet(genummerd, ['delen', 6, 'blokken', 2, 'start'], 3))).toEqual([]);
  });

  it('controleert tabellen: even veel cellen per rij, geen kop of tabel in een cel, samenvoegingen die kloppen', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => {
      const b = x.delen[1].blokken[1];
      if (b.soort === 'tabel') b.rijen[1].pop();
    })))).toMatch(/heeft 2 cellen, de eerste rij 3/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 1, 'blokken', 1, 'rijen', 1, 1, 'blokken', 0], kop(3, 'x'))))).toMatch(/een cel bevat geen kop/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 1, 'blokken', 1, 'rijen', 1, 1, 'blokken', 0], { soort: 'tabel', rijen: [[cel('data', [])]] })))).toMatch(/een cel bevat geen tabel/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 4, 'blokken', 1, 'rijen', 2, 0, 'samengevoegd'], undefined)))).toMatch(/een vervolgcel staat onder een cel met 'begin' of 'vervolg'/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 4, 'blokken', 1, 'rijen', 3, 0, 'samengevoegd'], undefined)))).toMatch(/onder een cel met 'begin' staat een vervolgcel/);
    // Tekst in een vervolgcel zou achter de samenvoeging verdwijnen.
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 4, 'blokken', 1, 'rijen', 3, 0, 'blokken'], [alinea(t('Leskern'))])))).toMatch(/een vervolgcel van een samenvoeging is leeg/);
    expect(alles(valideerGoLesplan(zet(lesplan(), ['delen', 1, 'blokken', 1, 'rijen', 1, 0, 'rol'], 'kop')))).toMatch(/geen geldige rol/);
  });

  it('toont de vrijgegeven mindmap met een alt-tekst, en weigert een beeld zonder alt-tekst of met een onveilig pad', () => {
    const pad = ['delen', 4, 'blokken', 1, 'rijen', 1, 2, 'blokken', 1];
    expect(valideerGoLesplan(lesplan())).toEqual([]);
    expect(alles(valideerGoLesplan(zet(lesplan(), [...pad, 'alt'], undefined)))).toMatch(/veld "alt" ontbreekt/);
    expect(alles(valideerGoLesplan(zet(lesplan(), [...pad, 'alt'], '  ')))).toMatch(/alt: moet een niet-lege tekst zijn/);
    expect(alles(valideerGoLesplan(zet(lesplan(), [...pad, 'bestand'], 'beelden/../../index.html')))).toMatch(/geen geldig pad/);
    expect(alles(valideerGoLesplan(zet(lesplan(), [...pad, 'bestand'], 'https://voorbeeld.be/mindmap.webp')))).toMatch(/geen geldig pad/);
    expect(alles(valideerGoLesplan(zet(lesplan(), [...pad, 'bron'], 'media/x.png')))).toMatch(/geen geldige naam in word\/media/);
    const weg = { soort: 'beeld', bron: 'x.png', breedte: 10, hoogte: 10, status: 'weggelaten', uitleg: 'In het originele lesplan staat hier een beeld.' };
    expect(valideerGoLesplan(zet(lesplan(), pad, weg))).toEqual([]);
    expect(alles(valideerGoLesplan(zet(lesplan(), pad, { ...weg, alt: 'x' })))).toMatch(/onbekend veld "alt"/);
    expect(alles(valideerGoLesplan(zet(lesplan(), pad, { ...weg, uitleg: undefined })))).toMatch(/veld "uitleg" ontbreekt/);
  });

  describe('afgeleide gegevens: alles staat letterlijk op zijn plek', () => {
    it('eist dat een leerplandoel met code, kennisverwerking, tekst en leeftijden op de wijzer staat', () => {
      const p = (wijzig: (a: GoLesplanBestand['afgeleid']['leerplandoelen'][number]) => void) => alles(valideerGoLesplan(met(lesplan(), (x) => wijzig(x.afgeleid.leerplandoelen[1]))));
      // WT.008: het lesplan schrijft 'de belangrijkste voedingswijze', de Excel 'verschillende voedingswijzen'.
      expect(p((d) => (d.tekst = 'Herkennen verschillende voedingswijzen van dieren.'))).toMatch(/de doelregel moet precies "WT.008 \[begrijpen\] Herkennen verschillende/);
      // Een ingekorte tekst geldt niet.
      expect(p((d) => (d.tekst = 'Herkennen de belangrijkste voedingswijze'))).toMatch(/de doelregel moet precies/);
      expect(p((d) => (d.kennisverwerking = 'gebruiken'))).toMatch(/de doelregel moet precies "WT.008 \[gebruiken\]/);
      expect(p((d) => (d.leeftijden = ['2,5-4', '4-5']))).toMatch(/de doelregel moet precies .*\(2,5-4 jaar, 4-5 jaar\)"/);
      expect(p((d) => (d.code = 'WT.009'))).toMatch(/de doelregel moet precies "WT.009/);
      expect(p((d) => (d.waar = { deel: 2, blok: 1, rij: 1, kolom: 1, regel: 0 }))).toMatch(/er staat "WT.001 \[begrijpen\] Herkennen het organisme dier/);
      expect(p((d) => (d.waar = { deel: 2, blok: 1, rij: 1, kolom: 1, regel: 9 }))).toMatch(/de wijzer wijst naar niets/);
      expect(p((d) => (d.waar = { deel: 2, blok: 1, rij: 1, kolom: 1 }))).toMatch(/de wijzer wijst geen alinea of lijstitem aan/);
      expect(p((d) => (d.code = 'WT.001'))).toMatch(/WT.001 staat er meer dan één keer/);
    });

    it('controleert de vorm van een wijzer', () => {
      const w = (waar: unknown) => alles(valideerGoLesplan(zet(lesplan(), ['afgeleid', 'leerplandoelen', 0, 'waar'], waar)));
      expect(w({ deel: 2, blok: 1, rij: 1 })).toMatch(/"rij" en "kolom" staan er samen of niet/);
      expect(w({ deel: 2, blok: 1, regel: 0 })).toMatch(/"regel" \(een blok in een cel\) kan alleen met "rij" en "kolom"/);
      expect(w({ deel: 2, blok: -1 })).toMatch(/geen geheel getal/);
      expect(w({ deel: 2, blok: 1, item: 0 })).toMatch(/de wijzer wijst naar niets/);
      expect(w({ deel: 9, blok: 0 })).toMatch(/de wijzer wijst naar niets/);
    });

    it('eist vakdiscipline, lessenlijn, lessenreeks en fiches in de kop, en een vakdiscipline die bij het vak past', () => {
      // Een ingekorte lessenlijn geldt niet: de hele metaregel moet kloppen.
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.lessenlijn = 'Biologie'))))).toMatch(/afgeleid\.lessenlijn: de regel "Lessenlijn: Biologie" staat niet letterlijk/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.lessenreeks = 'Flora: classificeren'))))).toMatch(/afgeleid\.lessenreeks: de regel "Lessenreeks: Flora: classificeren" staat niet letterlijk/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.vak = 'WI'))))).toMatch(/moet "Wiskunde" zijn bij WI/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.didactischeFiches[0].code = 'DFWT004'))))).toMatch(/de fiche "DFWT004 Kenmerken/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.didactischeFiches[0].titel = 'Kenmerken van de organismen'))))).toMatch(/de fiche "DFWT005 Kenmerken van de organismen" staat niet letterlijk/);
      // Twee fiches, gescheiden door een puntkomma, zoals in LP0074.
      const twee = met(lesplan(), (x) => {
        x.delen[0].blokken[5] = alinea(t('Didactische fiche:', B), t(' DFWT005 Kenmerken van de organismen: Taxonomie van de fauna; DFWT004 Kenmerken van de organismen: Taxonomie van de flora (GO! Navigator > …)'));
        x.afgeleid.didactischeFiches.push({ code: 'DFWT004', titel: 'Kenmerken van de organismen: Taxonomie van de flora' });
      });
      expect(valideerGoLesplan(twee)).toEqual([]);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.didactischeFiches[0].code = 'DF005'))))).toMatch(/geen geldige code van een didactische fiche/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.didactischeFiches = []))))).toMatch(/didactischeFiches: is leeg/);
    });

    it('eist het diploma met zijn leeftijd en zijn ik-doelen op de wijzer', () => {
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.diplomas[0].leeftijd = '4-5'))))).toMatch(/het diploma "De dierenkenner 4-5 jaar"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.diplomas[0].naam = 'dierenkenner'))))).toMatch(/het diploma "dierenkenner 2,5-4 jaar"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.diplomas[0].ikDoelen[0].code = 'WT.008'))))).toMatch(/de code "WT.008"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.diplomas[0].ikDoelen[0].zinnen = ['Ik ken dieren.']))))).toMatch(/de zin "Ik ken dieren."/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => x.afgeleid.diplomas[0].ikDoelen.push({ code: 'WT.001', zinnen: ['Ik herken dieren.'] }))))).toMatch(/WT.001 staat meer dan één keer bij dit diploma/);
    });

    it('eist deelconcepten, GO! concepten, vlaggen en schakels in deel 3, met het juiste pictogram', () => {
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => x.afgeleid.deelconcepten.push('Groei, ontwikkeling, voortplanting'))))).toMatch(/het deelconcept \(deel 3\) "Groei/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.deelconcepten = ['Bouw en functies']))))).toMatch(/het deelconcept \(deel 3\) "Bouw en functies"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.goConcepten = ['Structuur']))))).toMatch(/het GO! concept \(deel 3\) "Structuur"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.vlaggen = ['LL.096']))))).toMatch(/de code \(deel 3\) "LL.096"/);
      // Een verwisseling van vlag en schakel ziet een tekstvergelijking niet; het pictogram wel.
      const verwisseld = met(lesplan(), (x) => {
        x.afgeleid.vlaggen = ['WT.229'];
        x.afgeleid.schakels = ['LL.001'];
      });
      expect(valideerGoLesplan(verwisseld).length).toBe(0); // beide pictogrammen staan in deel 3 …
      const zonderSchakel = met(lesplan(), (x) => (x.afgeleid.schakels = []));
      expect(alles(valideerGoLesplan(zonderSchakel))).toMatch(/deel 3 heeft een pictogram schakel, maar de lijst is leeg/);
      const zonderVlagIcoon = met(lesplan(), (x) => (x.delen[3].blokken[9] = alinea(t('LL.001', B), t(' Herkennen manieren om de impulsen te controleren.'))));
      expect(alles(valideerGoLesplan(zonderVlagIcoon))).toMatch(/deel 3 heeft geen pictogram vlag/);
    });

    it('eist doorlopende stappen met hun nummer en naam in beide kolommen; een harde spatie telt als spatie', () => {
      expect(valideerGoLesplan(lesplan())).toEqual([]);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.stappen[1].nr = 3))))).toMatch(/stappen\[1\]\.nr: moet 2 zijn/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.stappen[1].naam = 'Terugkoppelen'))))).toMatch(/de stap "2. Terugkoppelen" staat niet letterlijk/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.stappen[1].naam = 'Voorkeurs'))))).toMatch(/de stap "2. Voorkeurs" staat niet letterlijk/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.stappen[1].hoe = { deel: 4, blok: 1, rij: 2, kolom: 2 }))))).toMatch(/stappen\[1\]\.hoe: de stap "2. Voorkeursinstructie"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.stappen = []))))).toMatch(/stappen: is leeg/);
    });

    it('eist een activiteit van Trainen met haar titel op "vanaf", en "vanaf" niet na "tot", ook binnen een lijst', () => {
      expect(valideerGoLesplan(lesplan())).toEqual([]);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[2].vanaf = { deel: 5, blok: 4, item: 0 }))))).toMatch(/de titel "Lichaamsdelen-dobbelsteen" is niet het vette begin/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[0].titel = 'Dierenmand'))))).toMatch(/de titel "Dierenmand" is niet het vette begin van die regel \("Dierenmand en plantenmand"\)/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[2].vanaf = { deel: 5, blok: 4 }))))).toMatch(/de wijzer wijst geen alinea of lijstitem aan/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[2].tot = { deel: 5, blok: 4, item: 0 }))))).toMatch(/"vanaf" ligt na "tot"/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[0].tot = { deel: 6, blok: 1 }))))).toMatch(/"vanaf" en "tot" liggen in hetzelfde deel/);
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.trainen[0].tot = { deel: 5, blok: 9 }))))).toMatch(/trainen\[0\]\.tot: de wijzer wijst naar niets/);
      // Zonder titel (zoals LP0017) mag, als de wijzer bestaat.
      expect(valideerGoLesplan(met(lesplan(), (x) => delete x.afgeleid.trainen[1].titel))).toEqual([]);
    });

    it('herkent de titel in de vormen van de lesplannen: na een opsommingsteken, en met tekst erachter', () => {
      // LP0001: '•' + harde spatie + een vette titel.
      expect(valideerGoLesplan(met(lesplan(), (x) => (x.delen[5].blokken[2] = alinea(t('•\u00a0'), t('Dierenmand en plantenmand', B)))))).toEqual([]);
      // LP0014a: een vette titel met een spatie erachter, en gewone tekst op dezelfde regel.
      expect(valideerGoLesplan(met(lesplan(), (x) => (x.delen[5].blokken[2] = alinea(t('Dierenmand en plantenmand ', B), t('zoals in de kring.')))))).toEqual([]);
      // Vet en cursief samen blijft vet.
      expect(valideerGoLesplan(met(lesplan(), (x) => (x.delen[5].blokken[2] = alinea(t('Dierenmand ', B), t('en plantenmand', { b: true, i: true }), { br: true }, t('Zet manden klaar.')))))).toEqual([]);
      // Een titel die niet vet is, is geen titel.
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.delen[5].blokken[2] = alinea(t('Dierenmand en plantenmand'))))))).toMatch(/is niet het vette begin van die regel \(""\)/);
    });

    it('eist dat het materiaal bestaat', () => {
      expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.afgeleid.materiaal = { deel: 6, blok: 3 }))))).toMatch(/materiaal: de wijzer wijst naar niets/);
    });
  });

  it('controleert de bron: GO! studio met https, de naamsvermelding, de bestandsnaam van het lesplan', () => {
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.bron.url = 'http://studio.g-o.be/'))))).toMatch(/geen geldige link naar GO! studio/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.bron.url = 'https://studio.g-o.be.voorbeeld.be/'))))).toMatch(/geen geldige link naar GO! studio/);
    expect(valideerGoLesplan(met(lesplan(), (x) => (x.bron.url = 'https://studio.g-o.be/lesplan/LP0065')))).toEqual([]);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.bron.bestand.naam = 'LP0074.docx'))))).toMatch(/moet "LP0065.docx" zijn/);
    expect(alles(valideerGoLesplan(met(lesplan(), (x) => (x.bron.waar = 'GO! Navigator' as 'GO! studio'))))).toMatch(/"waar" moet "GO! studio" zijn/);
  });
});

// ── Omgekeerd ──
describe('valideerGoBijMinimumdoel', () => {
  it('eist vaste nummers als sleutel, ook tegen __proto__', () => {
    const vreemd = JSON.parse(JSON.stringify(bij()).replace('"92590"', '"__proto__"'));
    expect(alles(valideerGoBijMinimumdoel(vreemd))).toMatch(/doelen\.__proto__: de sleutel is het vaste nummer/);
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '092590'], bij().doelen['92590'])))).toMatch(/de sleutel is het vaste nummer/);
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '92590'], [])))).toMatch(/doelen\.92590: is leeg/);
  });

  it('eist elke code één keer per minimumdoel, oplopend', () => {
    const b = met(bij(), (x) => x.doelen['92590'].reverse());
    expect(alles(valideerGoBijMinimumdoel(b))).toMatch(/elke code één keer, oplopend/);
  });

  it('eist een bronCode bij een voorstel en alleen daar', () => {
    expect(alles(valideerGoBijMinimumdoel(met(bijVoorstel(), (x) => delete x.doelen['92439'][0].bronCode)))).toMatch(/een voorstel heeft een "bronCode"/);
    expect(alles(valideerGoBijMinimumdoel(met(bij(), (x) => (x.doelen['92590'][0].bronCode = '3.1.2'))))).toMatch(/alleen een voorstel heeft een "bronCode"/);
  });

  it('eist de twijfel als het moment niet bij de leeftijden past', () => {
    expect(alles(valideerGoBijMinimumdoel(met(bij(), (x) => delete x.doelen['92822'][0].twijfel)))).toMatch(/twijfel 'moment-buiten-leeftijden' ontbreekt/);
  });

  it('eist een koppeling via een MIA- of voorbeeldrij, niet via een begrip, en niet leeg', () => {
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '92613', 0, 'via', 0, 'soort'], 'begrip')))).toMatch(/geen geldige soort inhoud met een koppeling/);
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '92613', 0, 'via'], [])))).toMatch(/via: is leeg/);
  });

  it('eist lesplancodes zonder dubbels en oplopend', () => {
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '92590', 1, 'lesplannen'], ['LP0074', 'LP0065'])))).toMatch(/niet in oplopende volgorde/);
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['doelen', '92590', 1, 'lesplannen'], ['LP0065', 'LP0065'])))).toMatch(/meer dan één keer/);
    expect(alles(valideerGoBijMinimumdoel(zet(bij(), ['vak'], 11)))).toMatch(/vak: 11 is geen geheel getal van 1 tot 10/);
  });
});

// ── Index ──
describe('valideerGoIndex', () => {
  it('eist elk vak één keer in vaste volgorde, met de juiste naam en het juiste bestand', () => {
    expect(alles(valideerGoIndex(met(index(), (x) => x.leerplan.reverse())))).toMatch(/elk vak één keer, in de volgorde van GO_VAK_CODES/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.leerplan[1].bestand = 'leerplan/wt.json'))))).toMatch(/moet "leerplan\/WT.json" zijn/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.leerplan[1].naam = 'W&T'))))).toMatch(/moet "Wetenschap en techniek" zijn/);
  });

  it('eist een telling per leeftijd voor alle negen groepen, niet groter dan het aantal', () => {
    expect(alles(valideerGoIndex(zet(index(), ['leerplan', 0, 'perLeeftijd'], { ...perLeeftijd, '11-12': undefined })))).toMatch(/veld "11-12" ontbreekt/);
    expect(alles(valideerGoIndex(zet(index(), ['leerplan', 0, 'perLeeftijd', '3-4'], 1)))).toMatch(/onbekend veld "3-4"/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.leerplan[0].zonderMinimumdoel = 700))))).toMatch(/zonderMinimumdoel: 700 is geen geheel getal van 0 tot 622/);
  });

  it('eist de bestanden van de omgekeerde index en de lesplannen, oplopend', () => {
    expect(alles(valideerGoIndex(met(index(), (x) => (x.bijMinimumdoel[1].bestand = 'bij-minimumdoel/03.json'))))).toMatch(/moet "bij-minimumdoel\/3.json" zijn/);
    expect(alles(valideerGoIndex(met(index(), (x) => x.bijMinimumdoel.reverse())))).toMatch(/elk vak één keer, oplopend/);
    expect(alles(valideerGoIndex(met(index(), (x) => x.lesplannen.reverse())))).toMatch(/elk lesplan één keer, oplopend op code/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.lesplannen[1].bestand = 'lesplannen/../LP0065.json'))))).toMatch(/moet "lesplannen\/LP0065.json" zijn/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.lesplannen[1].doelen = []))))).toMatch(/doelen: is leeg/);
    expect(alles(valideerGoIndex(met(index(), (x) => (x.naamsvermelding = 'Het GO!'))))).toMatch(/"naamsvermelding" moet/);
  });
});

// ── Hulpfuncties ──
describe('hulpfuncties voor de import en de schermen', () => {
  it('splitst codekolommen zoals de import: komma, witruimte weg, lege delen weg', () => {
    expect(splitsCodes('4.1.1, 4.1.4')).toEqual(['4.1.1', '4.1.4']);
    expect(splitsCodes('6.1.1, 6.12')).toEqual(['6.1.1', '6.12']);
    expect(splitsCodes(' ')).toEqual([]);
    expect(splitsCodes('3.1.3, 3.1.4,')).toEqual(['3.1.3', '3.1.4']);
    expect(splitsCodes('TE BEREIKEN OP POPULATIENIVEAU')).toEqual(['TE BEREIKEN OP POPULATIENIVEAU']);
  });

  it('geeft het vette begin van een regel', () => {
    expect(vetBegin([t('•\u00a0'), t('Waar hoort de baby?', B)])).toBe('Waar hoort de baby?');
    expect(vetBegin([t('Hoofd-schouders-knie-en-teen XL ', B)])).toBe('Hoofd-schouders-knie-en-teen XL');
    expect(vetBegin([t('Titel', B), { br: true }, t('meer', B)])).toBe('Titel');
    expect(vetBegin([{ icoon: 'vlag' }, t('   '), t('LL.001', B), t(' tekst')])).toBe('LL.001');
    expect(vetBegin([t('gewoon'), t('vet', B)])).toBe('');
  });

  it('maakt tekst van een regel: een regeleinde wordt een nieuwe regel, een icoon niets', () => {
    expect(regelTekst([{ icoon: 'vlag' }, t('   '), t('LL.001', B), { br: true }, t('tekst')])).toBe('   LL.001\ntekst');
  });

  it('leest de tekst op een wijzer: deel, cel, blok in een cel, lijstitem', () => {
    const p = lesplan();
    expect(tekstOpWijzer(p, { deel: 6, blok: 1 })).toBe('Voorzie volgende didactische materialen:');
    expect(tekstOpWijzer(p, { deel: 6, blok: 2, item: 1 })).toBe('een kartonnen doos');
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 2, kolom: 1 })).toBe('1. Verkennen\nHet ontdekkend waarnemen van echte planten en dieren.');
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 2, kolom: 1, regel: 1 })).toBe('Het ontdekkend waarnemen van echte planten en dieren.');
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 1, kolom: 1, regel: 2, item: 0 })).toBe('Ik herken dieren.');
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 1, kolom: 2, regel: 1 })).toBe('');
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 9, kolom: 1 })).toBeUndefined();
    expect(tekstOpWijzer(p, { deel: 4, blok: 1, rij: 1 })).toBeUndefined();
    expect(tekstOpWijzer(p, { deel: 6, blok: 1, item: 0 })).toBeUndefined();
    expect(tekstOpWijzer(p, { deel: 6, blok: 1, regel: 0 })).toBeUndefined();
    expect(tekstOpWijzer(p, { deel: 7, blok: 0 })).toBeUndefined();
    expect(regelOpWijzer(p, { deel: 6, blok: 2, item: 1 })).toEqual([t('een kartonnen doos')]);
    expect(regelOpWijzer(p, { deel: 2, blok: 1, rij: 1, kolom: 1, regel: 2 })).toEqual([t('MIA', B), t(' — Dieren:')]);
    expect(regelOpWijzer(p, { deel: 6, blok: 2 })).toBeUndefined();
    expect(regelOpWijzer(p, { deel: 4, blok: 1, rij: 2, kolom: 1 })).toBeUndefined();
  });

  it('vergelijkt wijzers: een ontbrekend veld bij "tot" loopt tot het einde', () => {
    expect(wijzerVoorOfGelijk({ deel: 5, blok: 4, item: 1 }, { deel: 5, blok: 4 })).toBe(true);
    expect(wijzerVoorOfGelijk({ deel: 5, blok: 4, item: 2 }, { deel: 5, blok: 4, item: 1 })).toBe(false);
    expect(wijzerVoorOfGelijk({ deel: 5, blok: 3 }, { deel: 5, blok: 4, item: 0 })).toBe(true);
    expect(wijzerVoorOfGelijk({ deel: 5, blok: 5 }, { deel: 5, blok: 4 })).toBe(false);
    expect(wijzerVoorOfGelijk({ deel: 4, blok: 1, rij: 3, kolom: 1 }, { deel: 4, blok: 1, rij: 2, kolom: 2 })).toBe(false);
    expect(wijzerVoorOfGelijk({ deel: 4, blok: 1 }, { deel: 4, blok: 1 })).toBe(true);
  });
});

// ── Vaste gegevens van het contract ──
describe('types: vaste gegevens', () => {
  it('kent de twaalf vakdisciplines met de namen van de tabbladen', () => {
    expect(GO_VAK_CODES).toEqual(['AA', 'BU', 'FR', 'GE', 'IT', 'LL', 'LO', 'MV', 'NL', 'SV', 'WI', 'WT']);
    expect(Object.keys(GO_VAKKEN)).toEqual([...GO_VAK_CODES]);
    expect(GO_VAK_CODES.map((v) => GO_VAKKEN[v].naam)).toEqual([
      'Aardrijkskunde',
      'Burgerschap',
      'Frans',
      'Geschiedenis',
      'ICT',
      'Leren leren',
      'Lichamelijke opvoeding',
      'Muzische vorming',
      'Nederlands',
      'Sociale vaardigheden',
      'Wiskunde',
      'Wetenschap en techniek',
    ]);
    expect(isGoVak('WT')).toBe(true);
    expect(isGoVak('AK')).toBe(false);
    expect(isGoVak('ICT')).toBe(false);
  });

  it('geeft de bronvermelding van de eigenaar letterlijk', () => {
    expect(bronvermeldingLesplan('LP0065')).toBe('Bron: GO! onderwijs van de Vlaamse Gemeenschap, lesplan LP0065 (GO! studio). Letterlijk overgenomen met toestemming.');
    expect(bronvermeldingLeerplan('WT')).toBe(
      'Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs, doelenset wetenschap en techniek. Letterlijk overgenomen met toestemming.',
    );
    expect(bronvermeldingLeerplan('NL')).toMatch(/doelenset Nederlands\. /);
    expect(GO_STUDIO_URL).toBe('https://studio.g-o.be/');
    expect(GO_VOORSTEL_LABEL).toBe('voorstel, nog niet bevestigd door het GO!');
  });

  it('legt vast wat de sha256 van elk bestand dekt (kop en bron niet)', () => {
    expect(Object.keys(lesplanShaInvoer(lesplan()))).toEqual(['code', 'titel', 'leeftijd', 'delen', 'afgeleid']);
    expect(Object.keys(leerplanShaInvoer(leerplan()))).toEqual(['vak', 'naam', 'rubrieken', 'doelen']);
    expect(Object.keys(bijMinimumdoelShaInvoer(bij()))).toEqual(['vak', 'doelen']);
  });
});
