// ── Voorbeeldles: de stelling van Pythagoras ────────────────────────────────
//
// De les uit de goedgekeurde demo (tools/prototypes/bordles/), omgezet naar
// het lesformaat en aangevuld met het expertadvies van 13 november 2026:
// deeldoelen, een waaromvraag, een klasmoment, een instapvraag, vakwoorden en
// variatie (de laatste driehoek staat anders en het foute voorbeeld heeft andere getallen).

import type { BordElement, BordlesConfig, BordPunt, Krijtkleur } from '../types';

// 3-4-5-vorm (eenheid 40): rechte hoek in A, a verticaal, b horizontaal.
const A: BordPunt = [230, 300], B: BordPunt = [230, 180], C: BordPunt = [390, 300];
const SQ_A: BordPunt[] = [[110, 180], [230, 180], [230, 300], [110, 300]];
const SQ_B: BordPunt[] = [[230, 300], [390, 300], [390, 460], [230, 460]];
const SQ_C: BordPunt[] = [[230, 180], [390, 300], [510, 140], [350, 20]];

function tekst(plek: BordPunt, delen: [string, Krijtkleur?][], extra: Partial<Extract<BordElement, { soort: 'tekst' }>> = {}): BordElement {
  return { soort: 'tekst', plek, delen: delen.map(([t, k]) => ({ tekst: t, kleur: k })), grootte: 26, ...extra };
}

function driehoek(): BordElement[] {
  return [
    { soort: 'veelhoek', punten: [A, B, C], dikte: 4 },
    { soort: 'veelhoek', punten: [[230, 282], [248, 282], [248, 300]], gesloten: false, dikte: 3 },
  ];
}
function labels(a: number, b: number, idPrefix: string): BordElement[] {
  return [
    tekst([240, 254], [[String(a), 'geel']], { grootte: 30 }),
    tekst([310, 292], [[String(b), 'blauw']], { grootte: 30, uitlijning: 'midden' }),
    tekst([300, 262], [['?', 'roze']], { grootte: 30, uitlijning: 'midden', id: `${idPrefix}-c` }),
  ];
}
function vierkanten(): BordElement[] {
  return [
    { soort: 'veelhoek', punten: SQ_A, kleur: 'geel', vulling: true, dikte: 3 },
    { soort: 'veelhoek', punten: SQ_B, kleur: 'blauw', vulling: true, dikte: 3 },
    { soort: 'veelhoek', punten: SQ_C, kleur: 'roze', vulling: true, dikte: 3 },
  ];
}
function formule(): BordElement {
  return tekst([22, 362], [['a²', 'geel'], [' + '], ['b²', 'blauw'], [' = '], ['c²', 'roze']]);
}

export function voorbeeldPythagoras(): BordlesConfig {
  return {
    standaardSnelheid: 'normaal',
    leerdoel: 'Je kunt de lange zijde van een rechthoekige driehoek berekenen met de stelling van Pythagoras.',
    woorden: [
      { woord: 'rechthoekige driehoek', uitleg: 'Een driehoek met één rechte hoek (90°).' },
      { woord: 'rechthoekszijde', uitleg: 'Een van de twee zijden die de rechte hoek vormen. We noemen ze a en b.' },
      { woord: 'schuine zijde', uitleg: 'De langste zijde, tegenover de rechte hoek. We noemen ze c.' },
      { woord: 'kwadraat', uitleg: 'Een getal maal zichzelf: 4² = 4 · 4 = 16.' },
      { woord: 'vierkantswortel', uitleg: 'Het getal dat maal zichzelf het gegeven getal geeft: √25 = 5, want 5 · 5 = 25.' },
    ],
    instapvraag: {
      id: 'instap',
      uitleg: 'Eerst een korte vraag. Ken je dit al, dan mag je meteen alleen oefenen.',
      teken: [
        { soort: 'veelhoek', punten: [[160, 330], [160, 200], [470, 330]], dikte: 4 },
        { soort: 'veelhoek', punten: [[160, 312], [178, 312], [178, 330]], gesloten: false, dikte: 3 },
        tekst([140, 272], [['5', 'geel']], { grootte: 30, uitlijning: 'rechts' }),
        tekst([315, 365], [['12', 'blauw']], { grootte: 30, uitlijning: 'midden' }),
        tekst([330, 252], [['?', 'roze']], { grootte: 30, uitlijning: 'midden' }),
      ],
      invul: {
        label: 'Hoe lang is de schuine zijde?',
        antwoord: '13',
        hints: [],
      },
    },
    fases: [
      {
        id: 'kijk', soort: 'kijk', titel: 'Kijk mee',
        stappen: [
          { id: 'k1', deeldoel: 'Herken de driehoek', uitleg: 'Dit is een rechthoekige driehoek. Het vierkantje toont de rechte hoek.', teken: driehoek() },
          {
            id: 'k2', deeldoel: 'Zoek de schuine zijde',
            uitleg: 'Ik kijk eerst welke zijde tegenover de rechte hoek ligt: dat is de langste, de schuine zijde c. Die zoeken we. De twee andere zijden zijn a = 3 en b = 4.',
            teken: labels(3, 4, 'k'),
          },
          { id: 'k3', deeldoel: 'Teken de vierkanten', uitleg: 'Op elke zijde teken ik een vierkant.', teken: vierkanten() },
          {
            id: 'k4', deeldoel: 'Kwadrateer',
            uitleg: 'De oppervlakte van de vierkanten op a en b: 3² = 3 · 3 = 9 en 4² = 4 · 4 = 16.',
            teken: [
              tekst([170, 248], [['3² = 9', 'geel']], { grootte: 24, uitlijning: 'midden' }),
              tekst([310, 388], [['4² = 16', 'blauw']], { grootte: 24, uitlijning: 'midden' }),
              tekst([370, 168], [['c² = ?', 'roze']], { grootte: 24, uitlijning: 'midden', id: 'k-c2' }),
            ],
          },
          {
            id: 'k5', deeldoel: 'Gebruik de stelling',
            uitleg: 'Pythagoras ontdekte: de twee kleine vierkanten samen zijn even groot als het grote vierkant. Als formule: a² + b² = c².',
            teken: [formule()],
          },
          {
            id: 'k5w', uitleg: 'Even nadenken voor we verder gaan.', teken: [],
            keuze: {
              vraag: 'Waarom tellen we de oppervlaktes op en niet gewoon de zijden?',
              opties: [
                { tekst: 'Omdat de stelling over de vierkanten op de zijden gaat.', juist: true, uitleg: 'Juist. 9 + 16 = 25 klopt met het grote vierkant. De zijden optellen geeft 3 + 4 = 7, maar c is geen 7.' },
                { tekst: 'Dat maakt niet uit, allebei werkt.', uitleg: 'Probeer het: 3 + 4 = 7, maar de schuine zijde is korter dan 7. De zijden optellen werkt dus niet.' },
                { tekst: 'Omdat optellen van zijden alleen bij grote driehoeken mag.', uitleg: 'Nee, de grootte maakt niet uit. De stelling gaat altijd over de oppervlaktes van de vierkanten.' },
              ],
            },
          },
          {
            id: 'k6', deeldoel: 'Tel op',
            uitleg: 'Ik vul in: 9 + 16 = 25. Het grote vierkant is dus 25 groot: c² = 25.',
            teken: [
              tekst([22, 410], [['9', 'geel'], [' + '], ['16', 'blauw'], [' = '], ['25', 'roze']]),
              tekst([370, 168], [['c² = 25', 'roze']], { grootte: 24, uitlijning: 'midden', vervangt: 'k-c2' }),
            ],
          },
          {
            id: 'k7', deeldoel: 'Neem de wortel',
            uitleg: 'Welk getal maal zichzelf geeft 25? Dat is 5, de vierkantswortel van 25. Dus c = 5.',
            teken: [
              tekst([22, 458], [['c', 'roze'], [' = √25 = '], ['5', 'roze']]),
              tekst([300, 262], [['5', 'roze']], { grootte: 30, uitlijning: 'midden', vervangt: 'k-c' }),
            ],
          },
        ],
      },
      {
        id: 'doe', soort: 'doe', titel: 'Doe mee',
        stappen: [
          { id: 'd1', deeldoel: 'Zoek de schuine zijde', uitleg: 'Nieuwe driehoek: a = 6 en b = 8. We zoeken de schuine zijde c. Je kent de aanpak al.', teken: [...driehoek(), ...labels(6, 8, 'd'), ...vierkanten()] },
          {
            id: 'd2', deeldoel: 'Kwadrateer', uitleg: 'De oppervlaktes van de kleine vierkanten: 6² = 36 en 8² = 64.',
            teken: [
              tekst([170, 248], [['6² = 36', 'geel']], { grootte: 24, uitlijning: 'midden' }),
              tekst([310, 388], [['8² = 64', 'blauw']], { grootte: 24, uitlijning: 'midden' }),
              tekst([370, 168], [['c² = 100', 'roze']], { grootte: 24, uitlijning: 'midden', verborgenTot: 'd4', plaatshouder: 'c² = ?' }),
            ],
          },
          { id: 'd3', deeldoel: 'Gebruik de stelling', uitleg: 'De formule blijft dezelfde: a² + b² = c².', teken: [formule()] },
          {
            id: 'd4', deeldoel: 'Tel op', uitleg: 'Nu jij. Hoeveel is c²?',
            teken: [tekst([22, 410], [['36', 'geel'], [' + '], ['64', 'blauw'], [' = '], ['100', 'roze']], { verborgenTot: 'd4', plaatshouder: '36 + 64 = ?' })],
            invul: {
              label: 'c² =', antwoord: '100',
              hints: ['Kijk naar de formule: a² + b² = c². Gebruik de getallen in de kleine vierkanten.', 'Tel de twee oppervlaktes op: 36 + 64.', '36 + 64 = 100.'],
              gekendeFouten: [
                { antwoord: '14', uitleg: 'Je telde 6 + 8 op. Kwadrateer eerst elke zijde: 6² en 8².' },
                { antwoord: '48', uitleg: 'Je deed 6 · 8. Elke zijde moet met zichzelf vermenigvuldigd worden: 6 · 6 en 8 · 8.' },
              ],
            },
            klasmoment: { opdracht: 'Iedereen: schrijf c² op je wisbordje en steek het omhoog.' },
          },
          {
            id: 'd5', deeldoel: 'Neem de wortel', uitleg: 'Goed zo. De laatste stap: hoe lang is c?',
            teken: [
              tekst([22, 458], [['c', 'roze'], [' = √100 = '], ['10', 'roze']], { verborgenTot: 'd5', plaatshouder: 'c = √100 = ?' }),
              tekst([300, 262], [['10', 'roze']], { grootte: 30, uitlijning: 'midden', vervangt: 'd-c', verborgenTot: 'd5', plaatshouder: '?' }),
            ],
            invul: {
              label: 'c =', antwoord: '10',
              hints: ['c² = 100 is de oppervlakte van het grote vierkant. Je zoekt de zijde.', 'Welk getal maal zichzelf geeft 100?', '10 · 10 = 100, dus √100 = 10.'],
              gekendeFouten: [
                { antwoord: '100', uitleg: 'Dat is c², de oppervlakte van het grote vierkant. Je zoekt de zijde zelf: neem de vierkantswortel.' },
                { antwoord: '50', uitleg: 'Je deelde door 2. Zoek een getal dat maal zichzelf 100 geeft.' },
              ],
            },
          },
        ],
      },
      {
        id: 'fout', soort: 'fout', titel: 'Zoek de fout',
        stappen: [
          {
            id: 'f1', uitleg: 'Lies rekende de schuine zijde uit van een driehoek met a = 8 en b = 15. Lees haar uitwerking op het bord.',
            teken: [
              { soort: 'veelhoek', punten: [[70, 190], [70, 110], [220, 190]], dikte: 3 },
              { soort: 'veelhoek', punten: [[70, 176], [84, 176], [84, 190]], gesloten: false, dikte: 2 },
              tekst([56, 158], [['8', 'geel']], { uitlijning: 'rechts' }),
              tekst([145, 216], [['15', 'blauw']], { uitlijning: 'midden' }),
              tekst([160, 138], [['?', 'roze']], { uitlijning: 'midden' }),
              tekst([330, 70], [['Uitwerking van Lies', 'oranje']], { grootte: 24 }),
              tekst([40, 270], [['a² + b² = c²', 'oranje']], { grootte: 27 }),
              tekst([40, 315], [['8² + 15² = c²', 'oranje']], { grootte: 27 }),
              tekst([40, 360], [['64 + 225 = c²', 'oranje']], { grootte: 27 }),
              tekst([40, 405], [['289 = c²', 'oranje']], { grootte: 27 }),
              tekst([40, 450], [['dus c = 289', 'oranje']], { grootte: 27 }),
            ],
            wijsNaar: [210, 440],
          },
          {
            id: 'f2', uitleg: 'Lies maakte één fout. Welke?',
            teken: [],
            keuze: {
              opties: [
                { tekst: 'Ze had 8 + 15 moeten optellen in plaats van te kwadrateren.', uitleg: 'Nee. Kwadrateren is net juist: de stelling gaat over de oppervlaktes van de vierkanten.' },
                { tekst: '64 + 225 is niet gelijk aan 289.', uitleg: 'Reken eens na: 64 + 225 = 289. Dat klopt wel.' },
                { tekst: 'Ze stopte bij c² en vergat de vierkantswortel te nemen.', juist: true, uitleg: 'Juist! 289 is c², de oppervlakte van het grote vierkant. De zijde zelf is √289 = 17. Dit is de fout die het vaakst gemaakt wordt.' },
              ],
            },
          },
          {
            id: 'f3', deeldoel: 'Neem de wortel', uitleg: 'Zo verbeter je het: c = √289 = 17.',
            teken: [
              { soort: 'lijn', van: [34, 442], naar: [214, 442], kleur: 'oranje', dikte: 3 },
              tekst([250, 450], [['c = √289 = 17', 'groen']], { grootte: 28 }),
            ],
          },
        ],
      },
      {
        id: 'alleen', soort: 'alleen', titel: 'Alleen',
        stappen: [
          {
            id: 'a1', deeldoel: 'Zoek de schuine zijde',
            uitleg: 'Laatste opgave, nu helemaal alleen. Let op: deze driehoek staat anders. Zoek eerst de rechte hoek. Reken op papier mee.',
            teken: [
              { soort: 'veelhoek', punten: [[120, 110], [120, 290], [360, 110]], dikte: 4 },
              { soort: 'veelhoek', punten: [[120, 128], [138, 128], [138, 110]], gesloten: false, dikte: 3 },
              tekst([102, 208], [['9', 'geel']], { grootte: 30, uitlijning: 'rechts' }),
              tekst([240, 96], [['12', 'blauw']], { grootte: 30, uitlijning: 'midden' }),
              tekst([262, 228], [['?', 'roze']], { grootte: 30, uitlijning: 'midden', id: 'a-c' }),
            ],
          },
          {
            id: 'a2', uitleg: 'Hoe lang is de schuine zijde? Kies eerst hoe zeker je bent.',
            teken: [],
            invul: {
              label: 'c =', antwoord: '15', zekerheid: true,
              hints: ['Begin met de formule: a² + b² = c².', '9² = 81 en 12² = 144. Tel ze op.', 'c² = 225. Welk getal maal zichzelf geeft 225? (15 · 15)'],
              gekendeFouten: [
                { antwoord: '21', uitleg: 'Je telde 9 + 12 op. Kwadrateer eerst elke zijde.' },
                { antwoord: '225', uitleg: 'Dat is c². Neem nog de vierkantswortel.' },
              ],
            },
          },
          {
            id: 'a3', deeldoel: 'Controleer je aanpak', uitleg: 'Zo ging het: kwadrateren, optellen, de wortel nemen.',
            teken: [
              tekst([330, 340], [['a²', 'geel'], [' + '], ['b²', 'blauw'], [' = '], ['c²', 'roze']]),
              tekst([330, 390], [['81', 'geel'], [' + '], ['144', 'blauw'], [' = '], ['225', 'roze']]),
              tekst([330, 440], [['c', 'roze'], [' = √225 = '], ['15', 'roze']]),
              tekst([262, 228], [['15', 'roze']], { grootte: 30, uitlijning: 'midden', vervangt: 'a-c' }),
            ],
          },
        ],
      },
    ],
  };
}
