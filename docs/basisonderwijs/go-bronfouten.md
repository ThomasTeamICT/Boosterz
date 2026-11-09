# Meldingen voor het GO!: fouten en vragen in de bron

Opgemaakt op 9 november 2026 bij de eerste import van het nieuwe GO! leerplan basisonderwijs en de eerste reeks lesplannen in Boosterz. Deze lijst is voor de eigenaar, om aan het GO! te bezorgen.

**Wat er nagekeken is.** De 12 doelensets ‘Doelenset BaO … .xlsx’ (bestandsdatum 3 september 2026) en de 8 lesplannen wetenschap en techniek voor 2,5-4 jaar (LP0001, LP0014a, LP0014b, LP0017, LP0065, LP0074, LP0087, LP0094). Een script heeft elke rij gelezen en elke verwijzing naar een minimumdoel opgezocht in de officiële minimumdoelen van de Vlaamse overheid (de Onderwijsdoelen-API).

**Hoe je de lijst leest.**
- *Rij* is het rijnummer in het Excel-blad van die doelenset (rij 1 is de koprij).
- *Code* is de code van het leerplandoel in de kolom ‘GO! NR.’, bv. WT.086.
- *KO, L4, L6* zijn de kolommen ‘KO nummer’, ‘L4 nummer’ en ‘L6 nummer’: het minimumdoel voor het einde van het kleuteronderwijs, het 4de en het 6de leerjaar.
- *Officiële tekst* is de tekst van het minimumdoel zoals de overheid hem publiceert.

**Wat Boosterz ermee doet.** Boosterz neemt de tekst van het GO! letterlijk over en verbetert niets, ook geen tikfouten. Een verwijzing die niet bestaat, staat er zonder link. Eén keer tonen we een voorstel, duidelijk gemarkeerd als ‘voorstel, nog niet bevestigd door het GO!’ (MV.040). De tekst van een minimumdoel komt in Boosterz altijd van de overheid, nooit uit de Excel: een afwijkende tekst in de Excel komt dus nergens op het scherm.

## In het kort

- **Verwijzingen naar een minimumdoel:** 4972 van de 4973 verwijzingen op de doelzinnen vinden precies één minimumdoel. Eén verwijzing is geen geldig nummer (MV.040, ‘6.12’). Eén verwijzing wijst naar een minimumdoel van een ander vak (WI.706 naar aardrijkskunde).
- **Moment en leeftijd:** 326 verwijzingen bij 286 leerplandoelen gaan naar een minimumdoel voor een moment dat niet past bij de leeftijden van het doel. Misschien is dat bedoeld (het doel bereidt een later minimumdoel voor); dat is een vraag, geen vaststelling.
- **Vlaggen en schakels:** 18 waarden in de kolommen VLAGGEN en SCHAKELS (bij 13 doelen) zijn geen bestaande code.
- **Tekst van de minimumdoelen in de Excel:** van de 1133 minimumdoel-rijen met een bruikbare code is de tekst bij 1060 gelijk aan de officiële tekst. Bij 49 verschillen alleen witruimte, opsommingstekens, leestekens of een hoofdletter. Bij 24 staan er echt andere woorden. Daarnaast hebben 6 minimumdoel-rijen geen bruikbare code.
- **Andere vormfouten:** verschoven rijen (geschiedenis), een kop in een codekolom (Nederlands), een rij met het verkeerde TYPE (wiskunde), 17 begrippen zonder leeftijd, een rubriek met een leeftijd (Frans), een lege kolomkop (wiskunde) en doorgehaalde tekst die nog in de cellen staat.
- **Lesplannen:** WT.008 heeft in LP0065 een andere tekst dan in de doelenset, en er staan een paar tikfouten in.

| Vak | Verwijzing naar een minimumdoel | Moment past niet bij de leeftijd | Vlaggen en schakels | Tekst minimumdoel: andere woorden | Tekst minimumdoel: alleen tekens | Andere |
|---|---|---|---|---|---|---|
| Aardrijkskunde (AA) | – | 14 | – | 3 | 4 | 4 |
| Burgerschap (BU) | – | 24 | – | – | 1 | 3 |
| Frans (FR) | – | – | – | 1 | – | 5 |
| Geschiedenis (GE) | – | 17 | 1 | 1 | 3 | 8 |
| ICT (IT) | – | 7 | – | – | 8 | – |
| Leren leren (LL) | – | 18 | – | – | – | – |
| Lichamelijke opvoeding (LO) | – | 24 | – | – | – | 2 |
| Muzische vorming (MV) | 1 | 6 | – | – | 6 | 1 |
| Nederlands (NL) | – | 39 | 4 | 3 | 4 | 8 |
| Sociale vaardigheden (SV) | – | 7 | – | – | – | – |
| Wiskunde (WI) | 1 | 105 | 13 | 13 | 21 | 28 |
| Wetenschap en techniek (WT) | – | 65 | – | 3 | 2 | 7 |

‘Andere’ telt per vak: rijen zonder bruikbare code of met het verkeerde TYPE, dezelfde code met twee teksten, begrippen zonder leeftijd, een rubriek met een leeftijd, een lege kolomkop, doorgehaalde tekst, een codekolom met alleen een spatie en doelen die alleen via een MIA gekoppeld zijn.

## Over alle doelensets

### Moment past niet bij de leeftijden (vraag)

Een leerplandoel heeft leeftijden (de kolommen 2,5-4 tot 11-12). Het verwijst naar minimumdoelen voor het einde van het kleuteronderwijs (KO), het 4de leerjaar (L4) of het 6de leerjaar (L6). Wij noemen een verwijzing ‘opvallend’ als:
- KO: het doel geen leeftijd heeft van 2,5-4, 4-5 of 5-6 jaar;
- L4: het doel geen leeftijd heeft van 6-7 tot 9-10 jaar;
- L6: het doel geen leeftijd heeft van 10-11 of 11-12 jaar.

Voorbeeld: WT.235 (2,5-4 tot 9-10 jaar) verwijst naar L6 3.3.2. De volledige lijst staat per vak hieronder. **Vraag aan het GO!:** zijn deze verwijzingen bedoeld (een doel dat een later minimumdoel voorbereidt), of is het moment of de leeftijd fout? Boosterz toont de verwijzing zoals ze in de doelenset staat, met de vermelding dat het moment niet bij de leeftijd past.

| Vak | Verwijzingen | Doelen | KO | L4 | L6 |
|---|---|---|---|---|---|
| Aardrijkskunde | 14 | 14 | 1 | 2 | 11 |
| Burgerschap | 24 | 24 | 4 | 12 | 8 |
| Geschiedenis | 17 | 17 | 0 | 7 | 10 |
| ICT | 7 | 7 | 0 | 0 | 7 |
| Leren leren | 18 | 13 | 1 | 1 | 16 |
| Lichamelijke opvoeding | 24 | 23 | 0 | 10 | 14 |
| Muzische vorming | 6 | 3 | 4 | 1 | 1 |
| Nederlands | 39 | 38 | 4 | 12 | 23 |
| Sociale vaardigheden | 7 | 7 | 0 | 1 | 6 |
| Wiskunde | 105 | 93 | 15 | 37 | 53 |
| Wetenschap en techniek | 65 | 47 | 2 | 11 | 52 |
| **Samen** | **326** | **286** | **31** | **94** | **201** |

### Tekst van de minimumdoelen in de Excel

De rijen met TYPE ‘minimumdoel’ herhalen de tekst van het minimumdoel. Wij hebben die tekst naast de officiële tekst gelegd (doorgehaalde tekst niet meegeteld, breuken als a/b, witruimte gelijkgemaakt).

| Uitkomst | Rijen |
|---|---|
| Gelijk | 1060 |
| Alleen witruimte, opsommingstekens of leestekens anders | 48 |
| Alleen een hoofdletter anders | 1 |
| Andere woorden (tikfout, ontbrekende of extra woorden, of een oudere versie van de tekst) | 24 |

Een deel van de verschillen lijkt een oudere versie van de officiële tekst (de minimumdoelen van het basisonderwijs zijn in juni 2026 nog gewijzigd); een ander deel zijn tikfouten. Wij kunnen niet zien welke van de twee het is. Niet elk verschil is een fout van het GO!: soms is de tekst in de Excel juister dan de officiële tekst (bv. ‘het koraalrif’ in aardrijkskunde rij 657, waar de officiële tekst ‘de koraalrif’ heeft). Dezelfde code staat soms ook twee of meer keer in één doelenset, met een andere tekst. Beide staan per vak hieronder.

### Doorgehaalde tekst en superschrift

In burgerschap, Nederlands en wiskunde staat doorgehaalde tekst in de cellen, in geschiedenis en wiskunde superschrift. Superschrift is geen fout (bv. cm³, 19e eeuw). Doorgehaalde tekst is wel verwarrend: wie de Excel als gewone tekst leest, krijgt die tekst mee. **Vraag aan het GO!:** mag de doorgehaalde tekst weg? Boosterz bewaart hem nu letterlijk, als doorgehaald. De rijen staan per vak hieronder.

## Per vak

### Aardrijkskunde (AA)

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 420, L4 4.2.4 (minimumdoel 92562), onder AA.063: Excel “proces van: het”, officieel “proces ervan: het”.
- Rij 657, L6 4.2.6 (minimumdoel 92588), onder AA.100: Excel “zandduin, het koraalrif,”, officieel “zandduin, de koraalrif,”.
- Rij 1426, L6 4.2.13 (minimumdoel 92598), onder AA.179: Excel “heelal: planetenstelstel, zonnestelstel, sterren.”, officieel “heelal: planetenstelsel, zonnestelsel, sterren.”.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 5, KO 4.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 7, L4 4.1.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 250, KO 4.1.4: alleen een hoofdletter anders.
- Rij 1978, L6 4.3.2: alleen witruimte, opsommingstekens of leestekens anders.

**Dezelfde code met twee teksten in deze doelenset**

- KO 4.1.4: rij 5 en rij 250 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 4.1.3: rij 7 en rij 252 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 4.2.4: rij 420 “proces van: het”, rij 653 “proces ervan: het”.

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- AA.070, rij 463: “het land”.

**Moment past niet bij de leeftijden (vraag)**

14 verwijzingen bij 14 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- AA.003 (rij 22), 6-7 tot 7-8 jaar: KO 4.1.4
- AA.066 (rij 433), 8-9 tot 9-10 jaar: L6 4.2.2
- AA.189 (rij 1487), 9-10 jaar: L6 4.2.18
- AA.190 (rij 1490), 9-10 jaar: L6 4.2.18
- AA.200 (rij 1559), 9-10 jaar: L6 4.2.13
- AA.201 (rij 1564), 10-11 jaar: L4 4.2.11
- AA.215 (rij 1651), 4-5 tot 6-7 jaar: L6 4.3.1
- AA.216 (rij 1659), 4-5 jaar: L6 4.3.1
- AA.217 (rij 1660), 5-6 tot 6-7 jaar: L6 4.3.1
- AA.218 (rij 1663), 6-7 tot 7-8 jaar: L6 4.3.1
- AA.219 (rij 1667), 8-9 tot 9-10 jaar: L6 4.3.1
- AA.232 (rij 1749), 8-9 tot 9-10 jaar: L6 4.3.1
- AA.259 (rij 1938), 10-11 jaar: L4 4.3.2
- AA.262 (rij 1959), 9-10 jaar: L6 4.3.1

### Burgerschap (BU)

**Tekst van een minimumdoel: kleine verschillen**

- Rij 268, KO 9.1.1: alleen witruimte, opsommingstekens of leestekens anders.

**Doorgehaalde tekst**

- Rij 792 (MIA - aanklikbaar, onder BU.093): een doorgehaalde spatie.
- Rij 896 (MIA - aanklikbaar, onder BU.102): een doorgehaalde spatie.
- Rij 1086 (voorbeelden - bullet, onder BU.130): een doorgehaalde spatie.

**Moment past niet bij de leeftijden (vraag)**

24 verwijzingen bij 24 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- BU.001 (rij 17), 2,5-4 jaar: L4 5.3.1
- BU.002 (rij 23), 4-5 tot 5-6 jaar: L4 5.3.1
- BU.009 (rij 63), 10-11 jaar: L4 5.3.1
- BU.013 (rij 104), 8-9 jaar: KO 5.3.1
- BU.032 (rij 287), 2,5-4 tot 5-6 jaar: L4 5.3.1
- BU.034 (rij 299), 4-5 tot 5-6 jaar: L4 5.3.1
- BU.041 (rij 372), 8-9 tot 9-10 jaar: L6 9.1.1
- BU.049 (rij 491), 10-11 tot 11-12 jaar: L4 9.1.4
- BU.055 (rij 526), 4-5 tot 5-6 jaar: L4 9.1.3
- BU.068 (rij 594), 7-8 tot 9-10 jaar: KO 9.1.3
- BU.070 (rij 607), 7-8 tot 11-12 jaar: KO 9.1.3
- BU.071 (rij 613), 7-8 tot 9-10 jaar: KO 9.1.3
- BU.074 (rij 627), 2,5-4 jaar: L6 9.1.5
- BU.075 (rij 630), 4-5 tot 5-6 jaar: L6 9.1.5
- BU.076 (rij 643), 6-7 tot 7-8 jaar: L6 9.1.5
- BU.077 (rij 661), 8-9 tot 9-10 jaar: L6 9.1.5
- BU.090 (rij 752), 9-10 jaar: L6 9.1.6
- BU.101 (rij 877), 10-11 tot 11-12 jaar: L4 9.1.13
- BU.102 (rij 890), 8-9 tot 9-10 jaar: L6 9.1.9
- BU.106 (rij 910), 10-11 tot 11-12 jaar: L4 9.1.13
- BU.108 (rij 937), 10-11 tot 11-12 jaar: L4 9.1.13
- BU.123 (rij 1021), 10-11 tot 11-12 jaar: L4 9.1.11
- BU.126 (rij 1033), 8-9 tot 9-10 jaar: L6 9.1.8
- BU.131 (rij 1087), 10-11 tot 11-12 jaar: L4 9.1.11

### Frans (FR)

**Vorm van de doelenset**

- Rij 450 (rubriek ‘Zinnen en zinsdelen’) heeft een 1 bij een leeftijd (10-11 en 11-12 jaar). Een rubriek heeft geen leeftijd; Boosterz neemt die waarde niet over.

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 380, L6 10.6.1 (minimumdoel 92713), onder FR.063: Excel “kennen woorden”, officieel “kennen de woorden”; Excel “woordenlijst Frans.”, officieel “woordenlijst Frans (Word, Pdf).”.

**Dezelfde code met twee teksten in deze doelenset**

- L6 10.6.1: rij 362 “kennen de woorden”, rij 380 “kennen woorden”; rij 362 “woordenlijst Frans (Word, Pdf).”, rij 380 “woordenlijst Frans.”.

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- FR.074, rij 533: “le”.
- FR.074, rij 534: “la”.
- FR.074, rij 535: “les”.

### Geschiedenis (GE)

**Vorm van de doelenset**

- Rij 1551 (TYPE minimumdoel) staat één kolom te ver naar rechts: de code en de tekst staan in ‘L4 minimumdoel’, de opsomming in ‘L6 nummer’.
- Rij 1552 (TYPE minimumdoel) staat één kolom te ver naar rechts: de code en de tekst staan in ‘L4 minimumdoel’, de opsomming in ‘L6 nummer’.

**Vlaggen en schakels**

Deze waarden zijn geen bestaande code (verkeerd leesteken, een spatie, een ontbrekend voorvoegsel, of een nummer dat te hoog is). Boosterz toont ze letterlijk, zonder link.
- GE.052 (rij 472), kolom SCHAKELS: “GE.316”. Niet in orde: “GE.316”.

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 939, KO 2.3.20 (minimumdoel 93001), onder GE.125: Excel “week.”, officieel “week. < bv. ik ben over 2 dagen jarig >”.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 9, L4 5.1.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 10, L4 5.1.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 17, L6 5.1.1: alleen witruimte, opsommingstekens of leestekens anders.

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- GE.118, rij 895: “de geschreven bron”.
- GE.118, rij 896: “de materiële bron”.
- GE.118, rij 897: “de mondelinge bron”.
- GE.118, rij 898: “de traditie”.
- GE.118, rij 899: “de audiovisuele bron”.
- GE.118, rij 900: “de beeldende bron”.

**Moment past niet bij de leeftijden (vraag)**

17 verwijzingen bij 17 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- GE.028 (rij 311), 4-5 tot 5-6 jaar: L4 5.2.5
- GE.047 (rij 460), 4-5 tot 5-6 jaar: L4 5.2.5
- GE.066 (rij 569), 4-5 tot 5-6 jaar: L4 5.2.5
- GE.079 (rij 625), 6-7 tot 7-8 jaar: L6 5.1.2
- GE.080 (rij 635), 8-9 tot 9-10 jaar: L6 5.1.2
- GE.084 (rij 697), 4-5 tot 5-6 jaar: L4 5.2.5
- GE.097 (rij 752), 6-7 tot 7-8 jaar: L6 5.1.3
- GE.098 (rij 763), 6-7 tot 7-8 jaar: L6 5.2.2
- GE.099 (rij 770), 8-9 tot 9-10 jaar: L6 5.1.3
- GE.103 (rij 819), 4-5 tot 5-6 jaar: L4 5.2.5
- GE.118 (rij 885), 10-11 tot 11-12 jaar: L4 5.2.2
- GE.216 (rij 1517), 9-10 jaar: L6 5.2.7
- GE.225 (rij 1568), 6-7 jaar: L6 5.3.3
- GE.226 (rij 1573), 7-8 jaar: L6 5.3.3
- GE.227 (rij 1578), 8-9 jaar: L6 5.3.3
- GE.231 (rij 1594), 9-10 jaar: L6 5.3.3
- GE.234 (rij 1620), 11-12 jaar: L4 5.3.3

### ICT (IT)

**Tekst van een minimumdoel: kleine verschillen**

- Rij 4, L6 8.1.1: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 123, L4 8.1.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 220, L6 8.2.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 221, L6 8.2.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 501, L4 8.3.1: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 502, L6 8.3.1: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 504, L6 8.3.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 505, L6 8.3.4: alleen witruimte, opsommingstekens of leestekens anders.

**Moment past niet bij de leeftijden (vraag)**

7 verwijzingen bij 7 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- IT.029 (rij 280), 7-8 tot 9-10 jaar: L6 8.2.4
- IT.061 (rij 521), 6-7 tot 7-8 jaar: L6 8.3.4
- IT.062 (rij 530), 8-9 tot 9-10 jaar: L6 8.3.4
- IT.077 (rij 635), 9-10 jaar: L6 8.3.4
- IT.085 (rij 668), 8-9 jaar: L6 8.4.1
- IT.086 (rij 677), 8-9 jaar: L6 8.4.1
- IT.087 (rij 682), 9-10 jaar: L6 8.4.1

### Leren leren (LL)

**Moment past niet bij de leeftijden (vraag)**

18 verwijzingen bij 13 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- LL.002 (rij 34), 6-7 tot 7-8 jaar: L6 9.2.5
- LL.008 (rij 82), 6-7 tot 8-9 jaar: KO 9.3.1
- LL.009 (rij 94), 4-5 tot 6-7 jaar: L6 9.3.3, L6 9.2.5
- LL.010 (rij 104), 7-8 tot 9-10 jaar: L6 9.3.3, L6 9.2.5
- LL.016 (rij 155), 5-6 tot 8-9 jaar: L6 9.2.3
- LL.019 (rij 172), 4-5 tot 5-6 jaar: L6 9.2.1
- LL.020 (rij 179), 6-7 tot 7-8 jaar: L6 9.2.1
- LL.021 (rij 186), 8-9 tot 9-10 jaar: L6 9.2.1
- LL.032 (rij 273), 8-9 tot 9-10 jaar: L6 9.2.6
- LL.038 (rij 310), 2,5-4 jaar: L4 9.2.3
- LL.053 (rij 451), 7-8 tot 9-10 jaar: L6 9.2.6
- LL.056 (rij 485), 7-8 tot 9-10 jaar: L6 9.2.6, L6 9.2.7
- LL.061 (rij 529), 7-8 tot 9-10 jaar: L6 9.2.6, L6 9.2.7, L6 9.2.8

### Lichamelijke opvoeding (LO)

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- LO.169, rij 935: “(weg)trappen”.
- LO.169, rij 936: “schoppen”.

**Moment past niet bij de leeftijden (vraag)**

24 verwijzingen bij 23 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- LO.076 (rij 431), 2,5-4 tot 5-6 jaar: L4 7.1.10
- LO.077 (rij 432), 2,5-4 tot 5-6 jaar: L4 7.1.10
- LO.078 (rij 436), 2,5-4 tot 5-6 jaar: L4 7.1.10
- LO.088 (rij 480), 2,5-4 tot 5-6 jaar: L4 9.1.9
- LO.089 (rij 488), 2,5-4 tot 5-6 jaar: L4 9.1.9
- LO.090 (rij 489), 4-5 tot 5-6 jaar: L4 9.1.7
- LO.091 (rij 492), 4-5 tot 5-6 jaar: L4 9.1.9
- LO.096 (rij 510), 8-9 tot 9-10 jaar: L6 9.1.2
- LO.101 (rij 523), 10-11 tot 11-12 jaar: L4 9.1.9
- LO.142 (rij 801), 4-5 tot 5-6 jaar: L4 7.1.2, L4 7.1.3
- LO.175 (rij 972), 4-5 tot 5-6 jaar: L6 7.1.6
- LO.176 (rij 984), 4-5 tot 5-6 jaar: L6 7.1.6
- LO.177 (rij 992), 4-5 tot 5-6 jaar: L6 7.1.6
- LO.178 (rij 1002), 5-6 jaar: L6 7.1.6
- LO.179 (rij 1009), 6-7 jaar: L6 7.1.6
- LO.180 (rij 1019), 7-8 jaar: L6 7.1.6
- LO.181 (rij 1024), 6-7 jaar: L6 7.1.6
- LO.182 (rij 1033), 7-8 jaar: L6 7.1.6
- LO.183 (rij 1038), 6-7 jaar: L6 7.1.6
- LO.184 (rij 1046), 7-8 jaar: L6 7.1.6
- LO.185 (rij 1056), 6-7 jaar: L6 7.1.6
- LO.186 (rij 1061), 7-8 jaar: L6 7.1.6
- LO.187 (rij 1068), 8-9 jaar: L6 7.1.6

### Muzische vorming (MV)

**Verwijzingen naar een minimumdoel**

- MV.040 (rij 638), kolom KO nummer: “6.1.1, 6.12”. ‘6.12’ is geen geldig nummer. Waarschijnlijk is 6.1.2 bedoeld (minimumdoel 92439); Boosterz toont dat als voorstel, gemarkeerd ‘voorstel, nog niet bevestigd door het GO!’.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 122, L4 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 130, L6 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 387, L6 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 656, L6 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 859, L6 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1093, L6 6.1.4: alleen witruimte, opsommingstekens of leestekens anders.

**Dezelfde code met twee teksten in deze doelenset**

- L4 6.1.4: rij 122 en rij 377 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 6.1.4: rij 122 en rij 648 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 6.1.4: rij 122 en rij 849 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 6.1.4: rij 122 en rij 1085 verschillen alleen in witruimte, leestekens of een hoofdletter.

**Moment past niet bij de leeftijden (vraag)**

6 verwijzingen bij 3 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- MV.001 (rij 8), 2,5-4 tot 5-6 jaar: L4 6.1.1
- MV.017 (rij 292), 6-7 tot 9-10 jaar: L6 6.2.4
- MV.067 (rij 990), 6-7 tot 7-8 jaar: KO 6.5.2, KO 6.5.3, KO 6.5.4, KO 6.5.5

### Nederlands (NL)

**Vorm van de doelenset**

- Rij 1639 (TYPE minimumdoel): in ‘KO nummer’ staat ‘TE BEREIKEN OP POPULATIENIVEAU’, een kop in plaats van een code.
- Rij 2312 (TYPE minimumdoel): in ‘KO nummer’ staat ‘TE BEREIKEN OP POPULATIENIEVEAU’, een kop in plaats van een code.
- Rij 1209: in de kolom ‘KO nummer’ staat alleen een spatie.

**Vlaggen en schakels**

Deze waarden zijn geen bestaande code (verkeerd leesteken, een spatie, een ontbrekend voorvoegsel, of een nummer dat te hoog is). Boosterz toont ze letterlijk, zonder link.
- NL.096 (rij 512), kolom VLAGGEN: “NL.3441 BU.146”. Niet in orde: “NL.3441 BU.146”.
- NL.516 (rij 2669), kolom SCHAKELS: “NL.0610, NL.618”. Niet in orde: “NL.0610”.
- NL.529 (rij 2742), kolom VLAGGEN: “NL.187, NL.190, NL.624”. Niet in orde: “NL.624”.
- NL.539 (rij 2780), kolom VLAGGEN: “NL.197, NL.198, NL.199, NL. 200, NL.201, NL.202, NL.203, NL.204, NL.205”. Niet in orde: “NL. 200”.

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 385, KO 1.3.4 (minimumdoel 93030), onder NL.069: Excel “De kleuter kunnen”, officieel “De kleuters kunnen”; Excel “door vragen”, officieel “door voorspellingen te maken, vragen”.
- Rij 397, L6 1.1.7 (minimumdoel 93113), onder NL.069: Excel “nodig relevante.”, officieel “nodig relevante leesstrategieën te selecteren en te gebruiken.”.
- Rij 1368, L4 1.2.11 (minimumdoel 93058), onder NL.266: Excel “1.2.11 De”, officieel “De”.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 11, L4 1.1.12: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 789, L4 1.2.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 920, L4 1.2.5: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2329, L6 1.4.7: alleen witruimte, opsommingstekens of leestekens anders.

**Dezelfde code met twee teksten in deze doelenset**

- L4 1.1.12: rij 11 en rij 616 verschillen alleen in witruimte, leestekens of een hoofdletter.
- KO 1.3.4: rij 385 “De kleuter kunnen”, rij 1643 “De kleuters kunnen”; rij 385 “door vragen”, rij 1643 “door voorspellingen te maken, vragen”.
- L6 1.4.7: rij 2329 en rij 2642 verschillen alleen in witruimte, leestekens of een hoofdletter.

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- NL.539, rij 2787: “de vervoeging”.

**Doorgehaalde tekst**

- Rij 2326, L6 1.4.2 (minimumdoel-rij): doorgehaald “ent”.

**Moment past niet bij de leeftijden (vraag)**

39 verwijzingen bij 38 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- NL.055 (rij 310), 7-8 tot 8-9 jaar: L6 1.1.2
- NL.056 (rij 311), 7-8 tot 9-10 jaar: L6 1.1.2
- NL.058 (rij 319), 4-5 tot 5-6 jaar: L4 1.1.1, L4 1.1.2
- NL.063 (rij 350), 7-8 tot 9-10 jaar: L6 1.1.1
- NL.110 (rij 564), 6-7 tot 9-10 jaar: L6 1.1.7
- NL.128 (rij 667), 4-5 tot 5-6 jaar: L4 1.1.12
- NL.139 (rij 760), 9-10 jaar: L6 1.1.9
- NL.140 (rij 771), 10-11 tot 11-12 jaar: L4 1.1.12
- NL.197 (rij 1031), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.198 (rij 1042), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.199 (rij 1043), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.200 (rij 1050), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.201 (rij 1051), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.202 (rij 1058), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.203 (rij 1064), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.204 (rij 1065), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.205 (rij 1071), 8-9 tot 9-10 jaar: L6 1.2.5
- NL.223 (rij 1128), 9-10 jaar: L6 1.2.4
- NL.248 (rij 1274), 8-9 jaar: L6 1.2.6
- NL.286 (rij 1476), 6-7 tot 8-9 jaar: KO 1.2.10
- NL.306 (rij 1572), 10-11 tot 11-12 jaar: L4 1.2.18
- NL.314 (rij 1614), 7-8 tot 8-9 jaar: L6 1.2.14
- NL.367 (rij 1871), 4-5 tot 5-6 jaar: L4 1.3.9
- NL.391 (rij 1974), 6-7 tot 7-8 jaar: KO 1.3.7
- NL.394 (rij 2012), 5-6 jaar: L4 1.3.13
- NL.395 (rij 2015), 5-6 jaar: L4 1.3.13
- NL.450 (rij 2273), 10-11 tot 11-12 jaar: L4 1.3.14
- NL.482 (rij 2464), 10-11 tot 11-12 jaar: L4 1.4.6
- NL.503 (rij 2588), 9-10 jaar: L6 1.4.7
- NL.505 (rij 2597), 8-9 tot 9-10 jaar: L6 1.4.9
- NL.518 (rij 2680), 5-6 jaar: L4 1.4.8
- NL.539 (rij 2780), 8-9 tot 9-10 jaar: L6 1.4.7
- NL.571 (rij 2981), 8-9 tot 9-10 jaar: L6 1.4.14
- NL.581 (rij 3060), 7-8 tot 9-10 jaar: KO 1.5.4
- NL.611 (rij 3252), 6-7 tot 7-8 jaar: KO 1.5.5
- NL.615 (rij 3276), 6-7 tot 7-8 jaar: L6 1.5.5
- NL.616 (rij 3279), 8-9 tot 9-10 jaar: L6 1.5.5
- NL.617 (rij 3283), 10-11 tot 11-12 jaar: L4 1.5.9

### Sociale vaardigheden (SV)

**Moment past niet bij de leeftijden (vraag)**

7 verwijzingen bij 7 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- SV.014 (rij 99), 2,5-4 jaar: L4 9.1.14
- SV.039 (rij 257), 6-7 tot 7-8 jaar: L6 9.3.5
- SV.040 (rij 258), 8-9 tot 9-10 jaar: L6 9.3.5
- SV.050 (rij 301), 6-7 tot 7-8 jaar: L6 9.3.1
- SV.051 (rij 304), 6-7 tot 7-8 jaar: L6 9.3.1
- SV.052 (rij 307), 8-9 tot 9-10 jaar: L6 9.3.1
- SV.053 (rij 311), 8-9 tot 9-10 jaar: L6 9.3.1

### Wiskunde (WI)

**Verwijzingen naar een minimumdoel**

- WI.706 (rij 4402) verwijst naar KO 4.2.3: dat is een minimumdoel van aardrijkskunde (minimumdoel 92500), niet van wiskunde. Is dit bedoeld?

**Vorm van de doelenset**

- Rij 4379 (TYPE minimumdoel): de code L4 2.4.44 bestaat niet. De tekst is die van L4 2.3.44 (minimumdoel 93255), en WI.756 verwijst ook naar 2.3.44.
- Rij 4380 (TYPE minimumdoel): de code L4 2.4.45 bestaat niet. De tekst is die van L4 2.3.45 (minimumdoel 93256), en WI.756 verwijst ook naar 2.3.45.
- Rij 521 heeft TYPE ‘minimumdoel’, maar zonder code en met tekst in INHOUD (‘0 tot en met 100’): het is een MIA-item van WI.102 (zoals hetzelfde item in rij 518 bij WI.101). Boosterz leest het als MIA.
- De kop van kolom M (KENNISVERWERKING) is leeg; de waarden eronder zijn wel begrijpen, gebruiken of engageren.

**Vlaggen en schakels**

Deze waarden zijn geen bestaande code (verkeerd leesteken, een spatie, een ontbrekend voorvoegsel, of een nummer dat te hoog is). Boosterz toont ze letterlijk, zonder link.
- WI.262 (rij 1446), kolom VLAGGEN: “WI.993, 994, 995, 996”. Niet in orde: “994”; “995”; “996”.
- WI.263 (rij 1451), kolom VLAGGEN: “WI.993, 994, 995, 996”. Niet in orde: “994”; “995”; “996”.
- WI.668 (rij 4089), kolom VLAGGEN: “GE.148, GE. 149”. Niet in orde: “GE. 149”.
- WI.703 (rij 4390), kolom VLAGGEN: “MV.026, LL/095, LL.096”. Niet in orde: “LL/095”.
- WI.711 (rij 4436), kolom VLAGGEN: “L.099”. Niet in orde: “L.099”.
- WI.846 (rij 5215), kolom VLAGGEN: “LL.095, LL.097, AA.041, AA?042, AA.210”. Niet in orde: “AA?042”.
- WI.852 (rij 5272), kolom VLAGGEN: “L.099”. Niet in orde: “L.099”.
- WI.987 (rij 6163), kolom VLAGGEN: “LL.051, LL.091, WI,997, WI.998”. Niet in orde: “WI”; “997”.

**Koppeling alleen via een MIA (vraag)**

- WI.408 (rij 2566): de doelzin zelf heeft geen code, maar de MIA in rij 2567 wel. Is het doel zo bedoeld (alleen dat onderdeel gekoppeld), of mist de doelzin zijn code? Boosterz zegt: ‘het leerplan koppelt een onderdeel van dit doel aan …’.
- WI.411 (rij 2592): de doelzin zelf heeft geen code, maar de MIA in rij 2593 wel. Is het doel zo bedoeld (alleen dat onderdeel gekoppeld), of mist de doelzin zijn code? Boosterz zegt: ‘het leerplan koppelt een onderdeel van dit doel aan …’.
- WI.963 (rij 5951): de doelzin zelf heeft geen code, maar de MIA in rij 5952 wel. Is het doel zo bedoeld (alleen dat onderdeel gekoppeld), of mist de doelzin zijn code? Boosterz zegt: ‘het leerplan koppelt een onderdeel van dit doel aan …’.

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 845, L6 2.1.15 (minimumdoel 93300), onder WI.160: Excel “1/100 en hun”, officieel “1/100 hun”.
- Rij 1466, L4 2.2.14 (minimumdoel 93196), onder WI.264: Excel “flexibel en doelmatige”, officieel “flexibel een doelmatige”.
- Rij 1469, L4 2.2.22 (minimumdoel 93204), onder WI.264: Excel “als 797 +”, officieel “als 796 +”.
- Rij 1946, L4 2.2.14 (minimumdoel 93196), onder WI.326: Excel “flexibel en doelmatige”, officieel “flexibel een doelmatige”.
- Rij 1952, L4 2.2.22 (minimumdoel 93204), onder WI.326: Excel “= 239>”, officieel “= 239 of 32 x 5 = 32 x 10 : 2 = 160 >”.
- Rij 1962, L6 2.2.23 (minimumdoel 93326), onder WI.326: Excel “van de bewerking”, officieel “van een bewerking”.
- Rij 2655, L4 2.2.7 (minimumdoel 93189), onder WI.423: Excel “benadrukken [I] . <”, officieel “benadrukken [I]. <”; Excel “+ 4)/rekenvolgorde te benadrukken:”, officieel “+ 4) / rekenvolgorde benadrukken:”.
- Rij 2882, L4 2.4.2 (minimumdoel 93258), onder WI.452: Excel “veelhoek; ruimtefiguur: de”, officieel “veelhoek; ruimtefiguren: de”.
- Rij 2900, L6 2.4.2 (minimumdoel 93364), onder WI.452: Excel “kent volgende”, officieel “kent de volgende”; Excel “notaties: de punt”, officieel “notaties: het punt”; Excel “[AB, lijnstuk”, officieel “[AB, het lijnstuk”; Excel “figuur (∆ABC, de vierhoek”, officieel “figuur (ΔABC, vierhoek”.
- Rij 4005, L4 2.3.42 (minimumdoel 93253), onder WI.660: Excel “graden Celcius (°C).”, officieel “graden Celsius (°C).”.
- Rij 4368, KO 2.4.18 (minimumdoel 93020), onder WI.702: Excel “< bv. kwalitatief”, officieel “< kwalitatief”.
- Rij 4956, KO 2.4.18 (minimumdoel 93020), onder WI.807: Excel “< bv. kwalitatief”, officieel “< kwalitatief”.
- Rij 5673, L4 2.5.2 (minimumdoel 93282), onder WI.911: Excel “uit tabellen en beeld-,”, officieel “uit tabellen, lijngrafieken, beeld-,”; Excel “beeld-, staaf-, lijn- en”, officieel “beeld-, staaf- en”.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 21, L4 2.1.6: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 835, L4 2.1.15: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 838, L4 2.1.18: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 841, L6 2.1.11: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1459, KO 2.2.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1468, L4 2.2.18: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1475, L6 2.2.5: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1938, KO 2.2.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1949, L4 2.2.18: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 1955, L6 2.2.5: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2368, L6 2.2.10: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2369, L6 2.2.12: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2371, L6 2.2.14: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2654, L4 2.2.6: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2660, L4 2.2.17: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 2891, L6 2.3.13: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 4382, L6 2.4.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 5682, L6 2.5.12: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 5994, L4 8.1.3: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 6171, L4 2.6.2: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 6172, L6 2.6.2: alleen witruimte, opsommingstekens of leestekens anders.

**Dezelfde code met twee teksten in deze doelenset**

- KO 2.4.18: rij 16 “< kwalitatief”, rij 4368 “< bv. kwalitatief”.
- KO 2.4.18: rij 16 “< kwalitatief”, rij 4956 “< bv. kwalitatief”.
- L4 2.2.7: rij 1462 “benadrukken [I]. <”, rij 2655 “benadrukken [I] . <”; rij 1462 “+ 4) / rekenvolgorde benadrukken:”, rij 2655 “+ 4)/rekenvolgorde te benadrukken:”.
- L4 2.2.14: rij 1466 “flexibel en doelmatige”, rij 2658 “flexibel een doelmatige”.
- L4 2.2.22: rij 1469 “als 797 +”, rij 1952 “als 796 +”; rij 1469 “= 239 of 32 x 5 = 32 x 10 : 2 = 160 >”, rij 1952 “= 239>”.
- L6 2.2.5: rij 1475 en rij 2665 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L6 2.2.10: rij 1477 en rij 2368 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L6 2.2.23: rij 1478 “van een bewerking”, rij 1962 “van de bewerking”.
- L4 2.2.17: rij 1948 en rij 2660 verschillen alleen in witruimte, leestekens of een hoofdletter.
- L4 2.4.2: rij 2882 “veelhoek; ruimtefiguur: de”, rij 4370 “veelhoek; ruimtefiguren: de”.
- L4 2.4.2: rij 2882 “veelhoek; ruimtefiguur: de”, rij 5492 “veelhoek; ruimtefiguren: de”.
- L6 2.4.2: rij 2900 “kent volgende”, rij 4382 “kent de volgende”; rij 2900 “notaties: de punt”, rij 4382 “notaties: het punt”; rij 2900 “[AB, lijnstuk”, rij 4382 “[AB, het lijnstuk”; rij 2900 “(∆ABC, de vierhoek”, rij 4382 “(∆ABC, vierhoek”.

**Doorgehaalde tekst**

- Rij 2362, L4 2.2.24 (minimumdoel-rij): doorgehaald “of breuken die te vereenvoudigen zijn tot deze breuken”.
- Rij 2860, KO 2.3.8 (minimumdoel-rij): doorgehaald “(‘gewicht’)”.
- Rij 2861, KO 2.3.9 (minimumdoel-rij): doorgehaald “(‘gewicht’)”.
- Rij 586 (MIA - niet aanklikbaar, onder WI.114): een doorgehaalde spatie.
- Rij 792 (voorbeelden - bullet, onder WI.151): een doorgehaalde spatie.
- Rij 1006 (doelzin, onder WI.184): een doorgehaalde spatie.
- Rij 1790 (MIA - aanklikbaar, onder WI.308): een doorgehaalde spatie.
- Rij 2413 (doelzin, onder WI.386): een doorgehaalde spatie.
- Rij 3045 (doelzin, onder WI.476): een doorgehaalde spatie.
- Rij 3662 (doelzin, onder WI.604): doorgehaald “.”.
- Rij 5689 (voorbeelden - bullet, onder WI.912): een doorgehaalde spatie.

**Moment past niet bij de leeftijden (vraag)**

105 verwijzingen bij 93 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- WI.030 (rij 153), 6-7 jaar: KO 2.1.8
- WI.031 (rij 158), 6-7 jaar: KO 2.1.8
- WI.032 (rij 165), 6-7 jaar: KO 2.1.8
- WI.033 (rij 169), 6-7 jaar: KO 2.1.9
- WI.091 (rij 470), 6-7 jaar: KO 2.1.10
- WI.121 (rij 621), 10-11 jaar: L4 2.1.6
- WI.122 (rij 624), 10-11 jaar: L4 2.1.6
- WI.123 (rij 629), 10-11 jaar: L4 2.1.6
- WI.124 (rij 634), 10-11 jaar: L4 2.1.6
- WI.156 (rij 806), 10-11 jaar: L4 2.1.8
- WI.167 (rij 898), 8-9 tot 9-10 jaar: L6 2.1.16
- WI.168 (rij 900), 8-9 tot 9-10 jaar: L6 2.1.16
- WI.182 (rij 990), 9-10 jaar: L6 2.1.18
- WI.232 (rij 1270), 9-10 jaar: L6 2.1.18
- WI.256 (rij 1401), 9-10 jaar: L6 2.1.12, L6 2.1.17
- WI.257 (rij 1416), 9-10 jaar: L6 2.1.12, L6 2.1.17
- WI.309 (rij 1796), 9-10 jaar: L6 2.2.2
- WI.310 (rij 1797), 9-10 jaar: L6 2.2.10
- WI.311 (rij 1804), 9-10 jaar: L6 2.2.2
- WI.312 (rij 1805), 9-10 jaar: L6 2.2.10
- WI.353 (rij 2142), 9-10 jaar: L6 2.2.10
- WI.355 (rij 2159), 9-10 jaar: L6 2.2.10
- WI.358 (rij 2187), 9-10 jaar: L6 2.2.9
- WI.359 (rij 2199), 9-10 jaar: L6 2.2.9
- WI.368 (rij 2265), 9-10 jaar: L6 2.2.19, L6 2.2.20
- WI.370 (rij 2275), 9-10 jaar: L6 2.2.19, L6 2.2.20
- WI.371 (rij 2279), 9-10 jaar: L6 2.2.19, L6 2.2.20
- WI.375 (rij 2303), 9-10 jaar: L6 2.2.9
- WI.384 (rij 2396), 9-10 jaar: L6 2.1.18
- WI.385 (rij 2404), 9-10 jaar: L6 2.1.18
- WI.424 (rij 2671), 4-5 jaar: L4 2.2.5
- WI.428 (rij 2692), 9-10 jaar: L6 2.2.22
- WI.430 (rij 2699), 10-11 tot 11-12 jaar: L4 2.2.11
- WI.465 (rij 2995), 6-7 jaar: KO 2.3.5
- WI.476 (rij 3045), 6-7 jaar: KO 2.3.5
- WI.483 (rij 3091), 6-7 jaar: KO 2.3.6
- WI.484 (rij 3096), 6-7 jaar: KO 2.3.6
- WI.488 (rij 3109), 6-7 jaar: KO 2.3.6
- WI.489 (rij 3114), 6-7 jaar: KO 2.3.6
- WI.493 (rij 3127), 6-7 jaar: KO 2.3.9
- WI.494 (rij 3135), 6-7 jaar: KO 2.3.9
- WI.511 (rij 3198), 8-9 tot 9-10 jaar: L6 2.3.13
- WI.512 (rij 3202), 10-11 tot 11-12 jaar: L4 2.3.15
- WI.559 (rij 3437), 10-11 jaar: L4 2.3.19
- WI.586 (rij 3551), 10-11 tot 11-12 jaar: L4 2.3.6
- WI.587 (rij 3560), 10-11 tot 11-12 jaar: L4 2.3.6
- WI.599 (rij 3637), 10-11 tot 11-12 jaar: L4 2.3.6
- WI.610 (rij 3689), 10-11 tot 11-12 jaar: L4 2.3.12, L4 2.3.18
- WI.611 (rij 3692), 10-11 tot 11-12 jaar: L4 2.3.14
- WI.624 (rij 3763), 10-11 tot 11-12 jaar: L4 2.3.14
- WI.663 (rij 4020), 9-10 jaar: L6 2.3.32
- WI.678 (rij 4197), 10-11 tot 11-12 jaar: L4 2.3.31, L4 2.3.32, L4 2.3.37
- WI.683 (rij 4221), 7-8 tot 8-9 jaar: L6 2.3.28
- WI.694 (rij 4309), 9-10 jaar: L6 2.3.27
- WI.695 (rij 4323), 10-11 tot 11-12 jaar: L4 2.3.39
- WI.710 (rij 4428), 7-8 jaar: L6 2.4.2
- WI.713 (rij 4454), 8-9 tot 9-10 jaar: L6 2.4.4
- WI.760 (rij 4683), 9-10 jaar: L6 2.4.2
- WI.761 (rij 4685), 9-10 jaar: L6 2.4.2, L6 2.4.3
- WI.771 (rij 4749), 9-10 jaar: L6 2.4.2
- WI.773 (rij 4762), 10-11 tot 11-12 jaar: L4 2.4.1, L4 2.4.3
- WI.775 (rij 4781), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.776 (rij 4785), 11-12 jaar: L4 2.4.3
- WI.783 (rij 4829), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.784 (rij 4833), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.785 (rij 4837), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.786 (rij 4843), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.787 (rij 4850), 10-11 tot 11-12 jaar: L4 2.4.3
- WI.789 (rij 4861), 10-11 tot 11-12 jaar: L4 2.4.4
- WI.790 (rij 4875), 10-11 tot 11-12 jaar: L4 2.4.5
- WI.814 (rij 5006), 6-7 tot 7-8 jaar: KO 2.4.15
- WI.819 (rij 5032), 8-9 tot 9-10 jaar: L6 2.4.18
- WI.838 (rij 5145), 6-7 tot 7-8 jaar: L6 2.4.11, L6 2.4.15
- WI.839 (rij 5148), 8-9 tot 9-10 jaar: L6 2.4.11, L6 2.4.15
- WI.849 (rij 5250), 6-7 tot 7-8 jaar: KO 2.4.7
- WI.862 (rij 5331), 10-11 tot 11-12 jaar: L4 2.4.10
- WI.866 (rij 5348), 8-9 jaar: L6 2.4.8
- WI.881 (rij 5463), 10-11 tot 11-12 jaar: L4 2.4.23
- WI.901 (rij 5592), 6-7 tot 7-8 jaar: L6 2.1.7
- WI.902 (rij 5604), 8-9 tot 9-10 jaar: L6 2.1.7
- WI.917 (rij 5707), 7-8 tot 8-9 jaar: L6 2.5.5
- WI.926 (rij 5749), 8-9 jaar: L6 2.5.5
- WI.929 (rij 5766), 7-8 jaar: L6 2.5.5
- WI.932 (rij 5778), 8-9 jaar: L6 2.5.11
- WI.934 (rij 5787), 10-11 tot 11-12 jaar: L4 2.5.3
- WI.940 (rij 5820), 10-11 tot 11-12 jaar: L4 2.5.3
- WI.944 (rij 5842), 8-9 jaar: L6 2.5.13
- WI.957 (rij 5922), 9-10 jaar: L6 2.5.5
- WI.958 (rij 5927), 9-10 jaar: L6 2.5.5
- WI.959 (rij 5935), 10-11 tot 11-12 jaar: L4 2.5.1
- WI.964 (rij 5955), 8-9 tot 9-10 jaar: L6 2.5.13
- WI.965 (rij 5961), 10-11 tot 11-12 jaar: L4 2.5.3
- WI.974 (rij 6042), 8-9 tot 9-10 jaar: L6 8.1.3

### Wetenschap en techniek (WT)

**Tekst van een minimumdoel: andere woorden dan de officiële tekst**

- Rij 1269, L6 3.1.5 (minimumdoel 92790), onder WT.143: Excel “organismen zich voortplanten.”, officieel “organismen zichzelf voortplanten.”.
- Rij 1396, KO 3.3.1 (minimumdoel 92612), onder WT.154: Excel “kennen volgende”, officieel “kennen de volgende”.
- Rij 1598, L6 3.2.9 (minimumdoel 92806), onder WT.175: Excel “De leerlinge kennen”, officieel “De leerlingen kennen”.

**Tekst van een minimumdoel: kleine verschillen**

- Rij 2291, L4 3.4.1: alleen witruimte, opsommingstekens of leestekens anders.
- Rij 3294, L6 3.7.6: alleen witruimte, opsommingstekens of leestekens anders.

**Dezelfde code met twee teksten in deze doelenset**

- L6 3.1.5: rij 18 “organismen zichzelf voortplanten.”, rij 1269 “organismen zich voortplanten.”.
- L6 3.2.9: rij 22 “De leerlingen kennen”, rij 1598 “De leerlinge kennen”.
- KO 3.3.1: rij 1396 “kennen volgende”, rij 1592 “kennen de volgende”.

**Begrippen zonder leeftijd**

Alle andere begrippen (‘te hanteren begrippen’) hebben minstens één leeftijd. Deze niet:
- WT.127, rij 1164: “de alleseter”.
- WT.298, rij 2528: “de druk”.
- WT.456, rij 3400: “onderhouden”.
- WT.496, rij 3591: “de hefboom”.

**Moment past niet bij de leeftijden (vraag)**

65 verwijzingen bij 47 doelen (zie ‘Moment past niet bij de leeftijden’ hierboven):
- WT.011 (rij 166), 6-7 tot 7-8 jaar: L6 3.1.3
- WT.012 (rij 175), 8-9 tot 9-10 jaar: L6 3.1.3
- WT.013 (rij 187), 8-9 tot 9-10 jaar: L6 3.1.3
- WT.027 (rij 289), 10-11 tot 11-12 jaar: L4 3.1.7
- WT.060 (rij 553), 8-9 tot 9-10 jaar: L6 3.1.3
- WT.061 (rij 559), 9-10 jaar: L6 3.1.3
- WT.062 (rij 565), 9-10 jaar: L6 3.1.3
- WT.113 (rij 1038), 10-11 tot 11-12 jaar: L4 3.2.1, L4 3.2.6
- WT.150 (rij 1362), 10-11 tot 11-12 jaar: L4 3.2.10
- WT.151 (rij 1366), 10-11 tot 11-12 jaar: L4 3.2.10
- WT.165 (rij 1510), 9-10 tot 11-12 jaar: KO 3.2.3, KO 3.2.4
- WT.209 (rij 1866), 7-8 jaar: L6 3.3.2
- WT.210 (rij 1872), 8-9 tot 9-10 jaar: L6 3.3.2
- WT.219 (rij 1931), 7-8 jaar: L6 3.3.1, L6 3.3.2
- WT.220 (rij 1936), 8-9 tot 9-10 jaar: L6 3.3.1, L6 3.3.2
- WT.234 (rij 2026), 7-8 tot 8-9 jaar: L6 3.3.2
- WT.235 (rij 2046), 2,5-4 tot 9-10 jaar: L6 3.3.2
- WT.249 (rij 2142), 8-9 jaar: L6 3.3.2
- WT.250 (rij 2148), 5-6 tot 9-10 jaar: L6 3.3.3
- WT.251 (rij 2149), 9-10 jaar: L6 3.3.1, L6 3.3.2
- WT.256 (rij 2177), 4-5 tot 7-8 jaar: L6 3.3.1, L6 3.3.2
- WT.257 (rij 2183), 8-9 tot 9-10 jaar: L6 3.3.1, L6 3.3.2
- WT.316 (rij 2597), 6-7 jaar: L6 3.5.1
- WT.317 (rij 2605), 6-7 tot 7-8 jaar: L6 3.5.1
- WT.318 (rij 2610), 6-7 tot 7-8 jaar: L6 3.5.1, L6 3.5.7
- WT.319 (rij 2614), 8-9 tot 9-10 jaar: L6 3.5.1
- WT.320 (rij 2620), 8-9 tot 9-10 jaar: L6 3.5.1
- WT.321 (rij 2626), 8-9 tot 9-10 jaar: L6 3.5.1, L6 3.5.7, L6 3.7.9
- WT.322 (rij 2630), 8-9 tot 9-10 jaar: L6 3.5.1, L6 3.5.6
- WT.323 (rij 2634), 9-10 jaar: L6 3.5.1, L6 3.5.3
- WT.349 (rij 2777), 9-10 jaar: L6 3.7.9
- WT.375 (rij 2915), 10-11 tot 11-12 jaar: L4 3.5.1
- WT.427 (rij 3221), 8-9 jaar: L6 3.7.2
- WT.428 (rij 3232), 9-10 jaar: L6 3.7.2
- WT.453 (rij 3387), 4-5 tot 7-8 jaar: L6 3.7.6
- WT.454 (rij 3388), 8-9 tot 9-10 jaar: L6 3.7.3, L6 3.7.5, L6 3.7.6
- WT.459 (rij 3410), 5-6 tot 7-8 jaar: L6 3.7.6
- WT.460 (rij 3415), 8-9 tot 9-10 jaar: L6 3.7.5
- WT.489 (rij 3548), 8-9 tot 9-10 jaar: L6 3.7.7, L6 3.7.8
- WT.490 (rij 3562), 10-11 jaar: L4 3.7.5
- WT.491 (rij 3569), 10-11 jaar: L4 3.7.5
- WT.492 (rij 3572), 10-11 jaar: L4 3.7.5
- WT.493 (rij 3575), 10-11 tot 11-12 jaar: L4 3.7.5
- WT.495 (rij 3588), 11-12 jaar: L4 3.7.5
- WT.496 (rij 3590), 6-7 tot 7-8 jaar: L6 3.7.7, L6 3.7.8
- WT.497 (rij 3592), 8-9 tot 9-10 jaar: L6 3.7.7, L6 3.7.8
- WT.503 (rij 3618), 8-9 tot 9-10 jaar: L6 3.7.7, L6 3.7.8

## Lesplannen (wetenschap en techniek, 2,5-4 jaar)

Code, kennisverwerking en leeftijden van de 20 doelregels in deel 2 zijn gelijk aan de doelenset. De vlaggen en schakels in deel 3 komen in alle 8 lesplannen precies overeen met de doelenset. Wat wel opvalt:

- **LP0065, deel 2, WT.008:** het lesplan schrijft ‘Herkennen de belangrijkste voedingswijze van dieren.’, de doelenset ‘Herkennen verschillende voedingswijzen van dieren.’ (wetenschap en techniek, rij 142). **Vraag aan het GO!:** welke versie leidt? Boosterz toont in het lesplan de tekst van het lesplan en op de pagina van het leerplandoel de tekst van de doelenset, met de vermelding van het verschil.
- **LP0001, deel 4 (Lesopbouw), Leskern, stap 2 Voorkeursinstructie, kolom Didactiek (Hoe?):** ‘Kjk nu eens naar …’ (bedoeld: ‘Kijk’).
- **LP0001, deel 4 (Lesopbouw), Vastlegging, kolom Didactiek (Hoe?):** ‘Wanneer een klind de kans krijgt …’ (bedoeld: ‘kind’).
- **LP0094, deel 2, MIA bij WT.101:** ‘Een plant begint als zaad dat gaat ontkiemt, …’ (bedoeld: ‘ontkiemen’ of ‘dat ontkiemt’). Zo staat het ook in de doelenset wetenschap en techniek, rij 899.

Er is geen volledige spellingcontrole gedaan: dit zijn de tikfouten die bij het nalezen opvielen.

## Wat niet in de bron staat

Voor de volledigheid, geen fout: de doelensets hebben geen versienummer of datum, behalve de bestandsdatum. Bij een nieuwe versie kan een code zo stil een andere betekenis krijgen. Een versienummer of datum in de doelenset zou helpen.
