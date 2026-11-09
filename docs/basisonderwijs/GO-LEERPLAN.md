# Leerplan en lesplannen van het GO! in Boosterz: ontwerp

Ontworpen op 9 november 2026, na de aanlevering door de eigenaar (Drive-map "Lesplannen": 8 lesplannen W&T voor 2,5-4 jaar en het volledige nieuwe GO! leerplan basisonderwijs: 12 doelensets als Excel, pdf's, visieteksten, minimale materiële vereisten, kenniskaarten). Verkend, ontworpen en nagekeken door een rechter. **De rechtzettingen van de rechter (onderaan) gaan voor op het ontwerp.** Stand van zaken: `docs/BASISONDERWIJS.md`.

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| Verkennen, ontwerp en rechter | **Klaar** (9 november 2026) | hoofdsessie |
| Vragen aan de eigenaar (onderaan) | **Beantwoord** (9 november 2026): zie "Antwoorden van de eigenaar" | eigenaar |
| Bouw (pakketten G1 tot G13) | **Klaar en live** (9 november 2026): zie "Stand na de bouw" hieronder | hoofdsessie |
| Foutenlijst voor het GO! (`docs/basisonderwijs/go-bronfouten.md`) | **Klaar**; doorsturen naar het GO! **wacht** | eigenaar |
| Visieteksten, minimale materiële vereisten en kenniskaarten (bij het vak en de doelen) | **Wacht**, volgende stap | hoofdsessie |
| Het aanbod (A1 tot A5): beelden, proefklas | **Wacht** tot G13; vragen 8 en 9 worden dan gesteld | hoofdsessie, eigenaar |

## Stand na de bouw (9 november 2026)

KORT: het volledige GO! leerplan basisonderwijs en de eerste 8 lesplannen staan letterlijk in `#/basis`, gekoppeld aan de minimumdoelen. Gebouwd in één ronde van 22 agents (G1 tot G12), daarna eindcontrole door de hoofdsessie (G13).

- **Gegevens** in `public/basis/go/` (32 bestanden, 4,6 MB, lui geladen per vak, niet in de voorcache van de service worker): `index.json`, `leerplan/<vak>.json` (12 vakken, 3490 leerplandoelen met MIA, begrippen en voorbeelden), `bij-minimumdoel/<vaknummer>.json` (de omgekeerde index, alle 998 minimumdoelen), `lesplannen/LP*.json` (8) en `beelden/` (de vrijgegeven mindmap als WebP).
- **Import**: `tools/basis/go/` (lezers in Python zonder externe pakketten, `maak.ts` met vite-node; uitleg in `tools/basis/go/LEESMIJ.md`). De import controleert dat elke zin van de bron letterlijk terugkomt (rondgang 8 van 8 lesplannen en 12 van 12 doelensets) en stopt met exit 3 bij elke afwijking die niet in `bekende-afwijkingen.json` staat, of bij een wijziging tegenover de vorige import zonder `--aanvaard-wijzigingen`. Een tweede run verandert niets.
- **Koppeling**: 4972 van de 4973 verwijzingen vinden precies één minimumdoel; MV.040 "6.12" staat als voorstel (6.1.2), gemarkeerd. 465 leerplandoelen hebben geen minimumdoel (468 min de 3 die alleen via een MIA gekoppeld zijn). 326 verwijzingen bij 286 doelen krijgen de vermelding dat het moment niet bij de leeftijd past; WI.706 verwijst naar een ander vak.
- **Schermen**: `#/basis/go` (overzicht), `#/basis/lesplannen`, `#/basis/lesplan/LP0065` (met `?stap=3`), `#/basis/lessenlijn/wt/<lijn>`, `#/basis/leerplandoelen/wt?leerjaar=K1`, `#/basis/leerplandoel/WT.086`; "Leerplan van het GO!" op elke doelpagina (ook buitengewoon), "Van het GO!" op de pagina van het leerjaar, GO!-codes in Zoeken. Bronvermelding op elke pagina.
- **Nagekeken**: twee nakijkrondes tegen de originelen (ronde 1 op de gegevens: cursief in 8 voorbeelden van wiskunde en een valse titel in LP0014a hersteld; ronde 2 op de schermtekst: niets bevestigd), drie reviewers (eerlijk tegenover de bron, toegankelijkheid en taal, leerlingpad en privacy), een rechter per ronde. Hersteld na de review: de inleiding zei ten onrechte dat elk leerplandoel een minimumdoel heeft; een spatie achteraan gaf een vals verschil bij WT.039. De hoofdsessie herstelde nog dat lege cellen op een smal scherm echt verdwijnen.
- **Poort**: lint 0 fouten (47 waarschuwingen, gelijk), typecheck, vitest 168 bestanden en 7524 tests, build binnen het budget (335,2 van 335,7 kB, het leerlingpad is niet geraakt), `tests/basis/go-los.mjs` (16 checks), `tests/basis/ingang-los.mjs` en de volledige rooktest groen.
- **Open**: de foutenlijst naar het GO! (eigenaar); een volgende reeks lesplannen gaat door dezelfde import (`maak.ts`); de vormcontrole is streng, dus een lesplan met een andere vorm wordt geweigerd tot de lezer is aangepast. Bekende beperkingen: `WI.json` is 0,9 MB (wordt alleen geladen wie wiskunde opent); de opmaak (doorhaling, superschrift, cursief) van de leerplantekst wordt nog niet getoond.

## Antwoorden van de eigenaar (9 november 2026)

- **Het volledige leerplan mag openbaar**, met bronvermelding: alle 3490 leerplandoelen van de 12 vakken, met MIA, begrippen en voorbeelden. Rechtzetting 5 van de rechter (geen tekst in de omgekeerde index) vervalt daardoor.
- **De mindmap "Mijn lichaam"** (LP0014a en LP0014b, foto's van kinderen): de eigenaar heeft hem bekeken en geeft hem vrij ("jaja dat is zeker ok", 9 november 2026). Hij staat in het lesplan zoals in het origineel, met een beschrijving als alt-tekst. Dit vervangt het voorstel "standaard weg" in het ontwerp.
- **Ook bij het buitengewoon basisonderwijs** (zelfde minimumdoelen, zelfde nummer) staan de leerplandoelen en lesplannen van het GO!, zonder iets te beweren over voor welk onderwijs het GO! zijn leerplan schrijft.
- **De Drive-map "Lesplannen" mag opgelijst worden**, alleen die map, op voorwaarde dat er alleen materiaal van het GO! in staat. Een bijgewerkt bestand vervangt het oude in die map.
- Niet apart gevraagd; de hoofdsessie volgt het voorstel van het ontwerp: de bronvermelding "Bron: GO! onderwijs van de Vlaamse Gemeenschap, lesplan LPxxxx (GO! studio). Letterlijk overgenomen met toestemming." met een link naar https://studio.g-o.be/ tot de vorm van een lesplanlink gekend is; MV.040 "6.12" wordt getoond als voorstel, gemarkeerd als "voorstel, nog niet bevestigd door het GO!"; de lijst met fouten in de bron komt in `docs/basisonderwijs/go-bronfouten.md`, zodat de eigenaar ze aan het GO! kan bezorgen.

## De officiële koppeling (nagerekend)

KORT: de officiële koppeling leerplandoel naar minimumdoel staat in de 12 doelensets en is bijna foutloos om te zetten. Van de 4973 codeverwijzingen op doelzin-rijen vinden er 4972 precies één doel (vast nummer). Dat lukt in de 34 sets van het gewoon basisonderwijs in public/leerplannen/minimumdoelen/ (ODS_3395 tot ODS_3428), op moment plus code; het eerste cijfer van de code geeft het vak. Er is geen enkele dubbelzinnige code. De enige mislukking is een tikfout in de bron. Alle 998 minimumdoelen van het gewoon basisonderwijs worden door minstens één leerplandoel van het GO! genoemd (zeker, nagerekend). Er is niets in de repo gewijzigd (git status: 0 regels).

1. DOWNLOAD EN VORM (zeker). Ik heb de 12 bestanden op hun id gedownload met download_file_content. Het id is nagekeken, de zip-test is OK en er zijn geen gevaarlijke paden. Titels "Doelenset BaO <vak>.xlsx", dc:created 2025-05-15, dc:modified 2026-09-03. Wetenschap en techniek is byte-gelijk aan de bestaande kopie (sha256 43e67805…). Ik las ze met een eigen script (zipfile, xml.etree, python -I); openpyxl is er niet. Elke set heeft één tabblad. De 24 kolomkoppen zijn overal letterlijk gelijk, behalve in wiskunde: daar is de kop van kolom M ("KENNISVERWERKING") leeg, maar de waarden staan er wel. KENNISVERWERKING heeft overal alleen begrijpen, gebruiken of engageren. De leeftijdskolommen bevatten alleen 0 of 1, en elke doelzin heeft minstens één leeftijd.

TYPE-waarden: dezelfde familie overal, met deze afwijkingen:
- een extra type "asterisk" (een voetnoot met *): NL 29, SV 7, WI 6, BU, FR en GE elk 1;
- geen rij "onderwerp" in leren leren, LO en SV;
- "subrubriek" alleen in AA, BU, GE, MV, NL, WT en WI;
- onderaan elk blad lege rijen met alleen nullen (bv. AA vanaf rij 2067).

Voorvoegsels en aantallen (doelen / zonder minimumdoel / met KO, L4, L6):

| Set | Voorvoegsel | Doelen | Zonder minimumdoel | Met KO / L4 / L6 |
|---|---|---|---|---|
| aardrijkskunde | AA | 276 | 29 | 54 / 131 / 90 |
| burgerschap | BU | 148 | 36 | 24 / 58 / 44 |
| Frans | FR | 112 | 6 | 0 / 0 / 106 |
| geschiedenis | GE | 244 | 54 | 50 / 100 / 67 |
| ICT | IT | 93 | 17 | 0 / 36 / 48 |
| leren leren | LL | 114 | 53 | 31 / 17 / 36 |
| lichamelijke opvoeding | LO | 189 | 26 | 75 / 105 / 69 |
| muzische vorming | MV | 98 | 19 | 32 / 31 / 27 |
| Nederlands | NL | 622 | 46 | 140 / 328 / 215 |
| sociale vaardigheden | SV | 68 | 20 | 17 / 18 / 20 |
| wetenschap en techniek | WT | 528 | 106 | 125 / 162 / 217 |
| wiskunde | WI | 998 | 56 | 164 / 536 / 337 |
| **Totaal** | | **3490** | **468** | 3022 met minstens één koppeling |

Let op de voorvoegsels: AA (niet AK) en IT (niet ICT). Elke set is doorlopend genummerd van 001 tot N, oplopend, zonder gaten of dubbels.

Codes over de vakken heen:
- BU wijst naar Attitudes (9.x, 121 keer) en geschiedenis (5.x, 23);
- LL (118) en SV (59) wijzen alleen naar Attitudes;
- LO naar 7.x (382) en 9.x (15);
- WT naar 3.x (817) en 9.x (6);
- WI naar 2.x (1523), ICT 8.x (12) en 4.x (1);
- AA 1 keer en GE 23 keer naar wiskunde 2.x.

Op doelzin-rijen scheidt alleen een komma de codes. Een puntkomma komt alleen voor in VLAGGEN en SCHAKELS (3 keer WI, 1 keer WT) en in de verschoven tekst bij GE.

Vlaggen en schakels: 16 vlaggen en 2 schakels verwijzen naar iets dat niet bestaat of slecht geschreven is, bv. "NL.3441 BU.146", "NL. 200", "994" (WI.262 en WI.263), "LL/095", "AA?042", "GE.316" en "NL.624".

Op 14 MIA- en voorbeeldrijen staat ook een code: een fijnere koppeling op het niveau van een MIA. Bv. WI.351 "Vermenigvuldigen:" naar L4 2.2.19 (93201), BU.106 naar L6 9.1.9 (92664). In NL rij 1209 staat er alleen een spatie.

2. OMZETTING NAAR HET VASTE NUMMER (zeker). Ik heb zelf een opzoektabel (moment, code) gemaakt over de 998 doelen van de gewone sets.
- Er is geen enkele dubbele code binnen een moment, ook niet over de twee kleutersets NL (ODS_3397/ODS_3401) en WI (ODS_3404/ODS_3405).
- De tweelingen van het buitengewoon onderwijs (ODS_3456 tot ODS_3485) hebben hetzelfde nummer: 0 afwijkingen.
- Per set lukt alles, behalve 1 keer in MV: MV.040 KO "6.1.1, 6.12". Waarschijnlijk is 6.1.2 (92439) bedoeld.

Plausibiliteit: 20 verwijzingen staan niet bij de minimumdoel-rijen van hun eigen onderwerp. Elk van die 20 is verklaard door een fout in de bron:
- GE rij 1551 en 1552 zijn één kolom naar rechts verschoven: "5.3.3" en "5.3.4" staan in "L4 minimumdoel", de bullets in "L6 nummer". Daardoor hebben 18 GE-verwijzingen geen minimumdoel-rij.
- WI rij 4379 en 4380 dragen de codes 2.4.44 en 2.4.45, die niet bestaan. De tekst is die van L4 2.3.44 (93255) en 2.3.45 (93256), waar WI.756 naar verwijst.
- WI.706 verwijst naar KO 4.2.3, een code van aardrijkskunde.

Daarnaast vallen 178 van de 4972 verwijzingen (3,6 %) op een moment dat niet past bij de leeftijden van het doel. Voorbeelden: BU.001 (2,5-4) naar L4 5.3.1, WT.113 (10-11, 11-12) naar L4 3.2.1 en 3.2.6, WT.316 (6-7) naar L6 3.5.1, LO.076 (2,5-4 tot 5-6) naar L4 7.1.10. Of dat bedoeld is (het doel bereidt een later minimumdoel voor) of een fout, is **onzeker**. Melden, niet zelf verbeteren.

3. TEKST VAN DE MINIMUMDOEL-RIJEN NAAST DE API (zeker voor de tellingen, waarschijnlijk voor de verklaring). Er zijn 1139 minimumdoel-rijen.
- 4 rijen hebben geen bruikbare code: NL rij 1639 en 2312 met "TE BEREIKEN OP POPULATIENIVEAU" en "…POPULATIENIEVEAU" in "KO nummer", en de 2 verschoven GE-rijen.
- 2 rijen hebben een code die niet bestaat (WI 2.4.44 en 2.4.45).
- De overige 1133 heb ik vergeleken met de API-tekst. Aan de API-kant: doelzin plus uitbreiding_op_doelzin, zonder HTML, met MathML-breuken als a/b. Aan de Excel-kant: entiteiten gedecodeerd, nulbreedte-spaties weg, witruimte gelijkgemaakt.

| Uitkomst | Aantal |
|---|---|
| Gelijk | 1062 |
| Alleen witruimte of opsommingstekens anders | 21 |
| Alleen leestekens anders (◦ tegenover * in ICT, slotpunt, ’ tegenover ', … tegenover ...) | 20 |
| Alleen een hoofdletter anders | 1 |
| Echt andere woorden | 28 |
| Excel mist de uitbreiding (GE KO 2.3.20, 93001: "< bv. ik ben over 2 dagen jarig >") | 1 |

Eigenaardigheden in de Excel:
- letterlijk "&lt; … &gt;" in 2 rijen (GE L4 5.1.3, MV L4 6.1.2);
- nulbreedte-spaties uit de API in 2 rijen: de Excel is dus van de API-tekst afgeleid;
- "o" als subbullet in 6 rijen;
- een code in de tekst ("1.2.11 De leerlingen…").

Voorbeelden van de echte verschillen:
- NL L6 1.1.7 (93113) is afgekapt: "…indien nodig relevante." tegenover "…relevante leesstrategieën te selecteren en te gebruiken."
- NL KO 1.3.4 (93030): de Excel mist "voorspellingen te maken," en heeft "De kleuter kunnen".
- WI L4 2.5.2 (93282) mist "lijngrafieken".
- WI L4 2.2.24 (93206) heeft extra tekst ("of breuken die te vereenvoudigen zijn…").
- WI L4 2.2.22: "797 + … = 801" tegenover "796 + … = 801".
- WI KO 2.3.8 en 2.3.9: de Excel voegt "(‘gewicht’)" toe.
- FR L6 10.6.1 (92713): de Excel mist "de" en "(Word, Pdf)".
- WT L6 3.2.9 "De leerlinge"; WT KO 3.3.1 "kennen volgende"; WT L6 3.1.5 "zich" tegenover "zichzelf".
- AA L6 4.2.13 "planetenstelstel"; WI 2.3.42 "Celcius".

Een deel zijn tikfouten in de Excel. Een ander deel lijkt een oudere stand van de API-tekst (de minimumdoelen van het basisonderwijs zijn in juni 2026 gewijzigd; **onzeker**). Daarnaast staat dezelfde code 25 keer met twee verschillende teksten in één Excel. **Besluit:** de API blijft de bron voor de tekst; de Excel dient alleen voor de koppeling.

4. DE 8 LESPLANNEN (zeker, uit de docx-dumps in go-lesplannen/dump/). 19 verschillende WT-doelen, 22 vermeldingen.
- Code, niveau en leeftijden zijn bij alle 22 gelijk aan de Excel. De tekst is bij 21 gelijk. Uitzondering: WT.008 in LP0065, "Herkennen de belangrijkste voedingswijze van dieren.", terwijl de Excel "Herkennen verschillende voedingswijzen van dieren." heeft. Het woord "belangrijkste" staat in de Excel pas bij WT.011 tot WT.015 (6-7 jaar en ouder).
- Alle MIA-blokken (titel en items) zijn letterlijk gelijk aan de MIA-rijen van de Excel, ook de fouten zoals "dat gaat ontkiemt". Die fouten komen dus uit het leerplan zelf.
- "Te hanteren begrippen: de baby" (LP0001) is gelijk aan de Excel.
- De Excel heeft voorbeelden die de lesplannen niet tonen: bij WT.008, WT.094, WT.184 en WT.216. Ze bevatten verzonnen kindernamen.
- De vlaggen en schakels van elk lesplan zijn precies de unie van VLAGGEN (icoon vlag) en SCHAKELS (icoon schakel) van zijn doelen in de Excel, 8 op 8. Bij LP0087 verwijzen WT.021 en WT.094 in de Excel naar elkaar. Dat is dus geen fout van het lesplan, wat de verkenner vermoedde.
- WT.008 en WT.057 hebben geen minimumdoel: het zijn eigen doelen van het GO!.
- Alle koppelingen gaan naar ODS_3410 (kleuter), behalve WT.235: dat doel gaat ook naar L6 3.3.2 (92822, ODS_3409).
- De 8 lesplannen raken 7 van de 21 kleuterdoelen W&T: 3.1.2, 3.1.3, 3.1.4, 3.2.2, 3.3.1, 3.3.2 en 3.3.3.

De vlagdoelen uit de lesplannen:
- LL.001 naar KO 9.3.5 (92630, ODS_3425);
- LL.068 naar KO 9.2.2 (92487), L4 9.2.2 (92490) en L6 9.2.4 (92548);
- LO.076 en LO.077 naar L4 7.1.10 (92532, ODS_3421);
- LL.096 en LO.021: geen minimumdoel.

HERBRUIKBAAR (waarschijnlijk). CurriculumGoal in src/lib/curriculumTypes.ts heeft al refs: MinimumdoelRef {set, id, code} ("de sleutel is set + vast nummer, nooit de code alleen") en refsBron voor de letterlijke verwijzing (bv. "KO 3.1.3, 3.1.4"). Het net 'go' bestaat al. Een leerplandoel van het GO! past daar zonder nieuw veld in. Niveau, leeftijden, MIA, begrippen, vlaggen en schakels vragen wel extra velden.

BESTANDEN (scratchpad):
- de xlsx: (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/xlsx/;
- als JSON: (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/json-doelensets/;
- de scripts: (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/scripts-doelensets/ (decodeer_xlsx.py, lees_xlsx.py, overzicht.py, codes.py, koppel.py, plausibel.py, lesplannen.py);
- de resultaten: (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/analyse-doelensets/koppeling.json (tellingen, verschillen, dekking), (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/analyse-doelensets/koppeling-compact.json (alle 3490 leerplandoelen met moment, code, id, set en status), (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/analyse-doelensets/leerplandoelen.json (ook MIA, begrippen, voorbeelden, context, vlaggen) en (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/analyse-doelensets/lesplannen-vs-excel.json.

### Wat er nog nodig is

De officiële bron is er nu. Het zijn de 12 Excel-bestanden "Doelenset BaO <vak>.xlsx" van het nieuwe GO! leerplan basisonderwijs (op de Drive van de eigenaar, map 1QU-9ZbRfYj8on-6QtbeeR5cbWsmZfTkW; dc:modified 2026-09-03). Op elke doelzin-rij staat de koppeling in de kolommen "KO nummer", "L4 nummer" en "L6 nummer". Die moet niet meer uit GO! Navigator komen.

Wat er nog nodig is om ze sluitend in de app te zetten:

(1) **Het vaste nummer.** De Excel geeft alleen codes. Het nummer volgt uit moment plus code; het eerste cijfer van de code geeft het vak. Het moment wijst de set aan:
- KO: Kleuteronderwijs (bij NL en WI de twee kleutersets samen);
- L4 en L6: Lager Onderwijs 4de en 6de leerjaar;
- gewone sets ODS_3395 tot ODS_3428.

Zo vinden 4972 van de 4973 verwijzingen precies één doel (zeker). De tweelingen van het buitengewoon onderwijs dragen hetzelfde nummer. Bewaar per leerplandoel `refs` {set, id, code} en `refsBron` letterlijk (bv. "KO 3.1.3, 3.1.4"), zoals CurriculumGoal al voorziet. Laat een script de koppeling bij elke maandelijkse ophaling opnieuw narekenen: een code die verdwijnt of verandert, moet de poort tegenhouden.

(2) **Een beslissing of melding aan het GO! over de fouten in de bron:**
- MV.040 KO "6.12": waarschijnlijk 6.1.2, nummer 92439.
- GE rij 1551 en 1552 staan één kolom te ver naar rechts (L4 5.3.3 en 5.3.4).
- WI-minimumdoel-rijen 2.4.44 en 2.4.45 bestaan niet; bedoeld zijn 2.3.44 (93255) en 2.3.45 (93256).
- NL rij 1639 en 2312 hebben een kop in de codekolom.
- 178 verwijzingen hebben een moment dat niet bij de leeftijden van het doel past. Bedoeld of fout: onzeker.
- 18 vlaggen en schakels zijn kapot.
- WT.008 heeft in LP0065 een andere tekst dan in de Excel. Welke versie leidt?

(3) **Wat NIET in de Excel staat** en waarvoor GO! Navigator (achter een login) of de eigenaar nodig blijft:
- de diploma's met hun ik-doelen (Het nieuwe GO! leerplan > Conceptkaarten > Diploma's);
- lessenlijnen en lessenreeksen;
- de didactische fiches (DFWTnnn);
- deelconcepten en GO! concepten;
- wat "MIA" betekent;
- een versienummer of datum van het leerplan, behalve de bestandsdatum.

Diploma's, lessenreeksen, fiches en concepten staan per lesplan in de lesplannen zelf. Een volledige lijst komt alleen uit Navigator.

(4) **Wat de tekst van een minimumdoel betreft** blijft de Onderwijsdoelen-API de bron. 71 van de 1133 vergeleken minimumdoel-rijen in de Excel wijken af, waarvan 29 met andere woorden (tikfouten of een oudere stand). Neem de documenteigenschappen van de Excel (namen van makers) nooit over.

### De leerplandoelen in de eerste reeks lesplannen

| Leerplandoel | Tekst | Lesplannen | Minimumdoelen (officieel) |
|---|---|---|---|
| WT.086 | Herkennen dat mensen leven geven aan nieuwe mensen. | LP0001 | 3.1.3 (ODS_3410, 92929), 3.1.4 (ODS_3410, 93034) |
| WT.176 | Herkennen lichaamsdelen. | LP0014a | 3.3.2 (ODS_3410, 92613) |
| WT.177 | Herkennen de functie van lichaamsdelen. | LP0014a | 3.3.2 (ODS_3410, 92613) |
| WT.184 | Tonen hun kennis van lichaamsdelen in verschillende contexten. | LP0014a | 3.3.2 (ODS_3410, 92613), 3.3.1 (ODS_3410, 92612), 3.3.3 (ODS_3410, 92614) |
| WT.190 | Herkennen hoe het lichaam beweegt. | LP0014a | 3.3.2 (ODS_3410, 92613) |
| WT.205 | Herkennen de ademhaling. | LP0014a | 3.3.2 (ODS_3410, 92613) |
| WT.216 | Herkennen bloed. | LP0014b | 3.3.2 (ODS_3410, 92613) |
| WT.229 | Herkennen de vijf zintuigen en bijbehorende lichaamsdelen. | LP0014b | 3.3.2 (ODS_3410, 92613) |
| WT.232 | Lokaliseren de 5 zintuigen en de bijhorende lichaamsdelen op het lichaam(schema). | LP0014b | 3.3.3 (ODS_3410, 92614) |
| WT.235 | Gebruiken hun zintuigen om prikkels in de omgeving te onderscheiden. | LP0014b | 3.3.1 (ODS_3410, 92612), 3.3.2 (ODS_3409, 92822) |
| WT.155 | Herkennen verschillende voedingsmiddelen. | LP0017 | 3.2.2 (ODS_3410, 92609) |
| WT.001 | Herkennen het organisme dier. | LP0065 | 3.1.2 (ODS_3410, 92590) |
| WT.008 | Herkennen verschillende voedingswijzen van dieren. (tekst volgens de Excel; LP0065 schrijft: "Herkennen de belangrijkste voedingswijze van dieren.") | LP0065 | geen (doel van het GO!) |
| WT.028 | Onderscheiden dieren en planten. | LP0065, LP0074 | 3.1.2 (ODS_3410, 92590) |
| WT.039 | Herkennen het organisme plant. | LP0074 | 3.1.2 (ODS_3410, 92590) |
| WT.057 | Herkennen wat planten nodig hebben om te groeien. | LP0074 | geen (doel van het GO!) |
| WT.021 | Herkennen de voortplanting bij dieren. | LP0087 | 3.1.4 (ODS_3410, 93034) |
| WT.094 | Herkennen het jong van zoogdieren. | LP0087 | 3.1.4 (ODS_3410, 93034) |
| WT.101 | Herkennen de levenscyclus van planten. | LP0094 | 3.1.4 (ODS_3410, 93034) |

## Kern

Drie lagen, elk met eigen bestanden en één vaste sleutel. Ertussen komen alleen officiële verbanden.

1. **Minimumdoel (overheid).** Blijft zoals het is, in public/leerplannen/minimumdoelen/. De sleutel is set + vast nummer (MinimumdoelRef, src/lib/curriculumTypes.ts:75-82). De tekst van een minimumdoel komt altijd hieruit, dus uit de API.
2. **Leerplandoel (GO!).** Nieuw: alle 3490 doelen uit de 12 doelensets (Excel). De sleutel is de code, bv. WT.086. Elk doel draagt de OFFICIËLE koppeling uit de kolommen ‘KO nummer’, ‘L4 nummer’ en ‘L6 nummer’, omgezet naar MinimumdoelRef {set, id, code} plus het moment. 468 doelen hebben geen minimumdoel. Daarbij staat letterlijk: ‘het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel’.
3. **Lesplan (GO!).** Nieuw, letterlijk en volledig. Het lesplan wordt bewaard als blokken: kop, alinea, lijst, tabel en beeld, met vet, cursief, onderlijnd en de pictogrammen. De sleutel is de lesplancode, bv. LP0065. De koppeling naar de leerplandoelen komt uit deel 2 van het lesplan zelf.

De weg terug (minimumdoel → leerplandoelen → lesplannen) rekent de import uit: per vak een kleine index. Zo moet de doelpagina niet 3490 doelen laden.

**Wat anders is dan in de opdracht.** De officiële koppeling hoeft niet meer te wachten op GO! Navigator: de doelensets zijn die bron. Dat is zeker: 4972 van de 4973 codes vinden precies één minimumdoel. De enige mislukking is een tikfout: MV.040 ‘6.12’. ‘Voorstel’ blijft alleen bestaan voor zo’n kapotte code, nooit voor een doel zonder minimumdoel.

**De weg is dezelfde voor elke reeks.**
- Drive, alleen op id.
- Een werkmap buiten de repo.
- Python (alleen de standaardbibliotheek, met -I) leest de docx en xlsx in naar neutrale JSON.
- Een TS-script (npx vite-node) legt de vorm van het GO! erover, koppelt en controleert de vorm. Het controleert ook de rondgang: alle tekst van het origineel komt exact terug. Het schrijft public/basis/go/ alleen als alles klopt; anders stopt het met exit 3, zoals haal-minimumdoelen.mjs.
- Vitest valideert de meegeleverde bestanden in de uitrolpoort.
- Een echte-gegevenstest kijkt de koppeling na tegen de minimumdoelen.
- Een nakijker legt de pagina in de app naast het origineel. Bij twijfel beslist de rechter.

**In de app.** Alles zit binnen de bestaande luie route /basis/*:
- een pagina per lesplan en per leerplandoel;
- de leerplandoelen per vak en leeftijd;
- de lesplannen per leerjaar en per lessenlijn;
- een deel ‘Leerplan van het GO!’ in DOEL_DELEN;
- een blok op de leerjaarpagina.

Niets komt op het leerlingpad. App.tsx, curriculum.ts, curriculumTypes.ts, minimumdoelen.ts en de schermen van het secundair blijven ongewijzigd.

**Daarna het aanbod.** Per lesplan komt er een manifest. Het wijst naar de stappen van de leskern, de activiteiten van ‘Trainen’, de vastlegging en de leerplandoelen. Het manifest staat vast op de sha256 van het lesplan: verandert het lesplan, dan wordt het aanbod ‘na te kijken’. Uitgewerkt voor LP0065.

**Wat nooit gebeurt:**
- een koppeling verzinnen of afleiden uit leeftijden;
- de tekst van het GO! verbeteren (fouten gaan als lijst naar de eigenaar);
- de tekst van een minimumdoel uit de Excel tonen;
- een leeftijdsgroep voorstellen als een leerjaar dat het GO! zelf noemt.

## Ophalen

**Wie:** de hoofdsessie. Zij gebruikt de Drive-tools; een agent krijgt alleen de bestanden in de werkmap.

1. **Tools laden.** ToolSearch ‘select:mcp__Google_Drive__get_file_metadata,mcp__Google_Drive__download_file_content’. read_file_content is niet nodig. Op LP0017 vergeleken: het plakt alinea’s in cellen aan elkaar, verschuift kolommen en laat opmaak en iconen weg.
2. **Alleen op id.** Per reeks geeft de eigenaar de id’s, zoals nu. Staat hij het toe (vraag 7), dan lijst de hoofdsessie alleen de map 1QU-9ZbRfYj8on-6QtbeeR5cbWsmZfTkW op. Nooit breed zoeken: elders op de Drive staan schooldocumenten met persoonsgegevens.
3. **Eerst de metadata.** Per id get_file_metadata. Voorwaarden:
   - het mimeType is docx of xlsx;
   - de naam is ‘LP[0-9]{4}[a-z]?.docx’ of ‘Doelenset BaO <vak>.xlsx’.
   fileSize en modifiedTime gaan mee. Klopt iets niet: stoppen.
4. **Downloaden.** download_file_content. Het antwoord is te groot voor de beurt; de harness bewaart het als JSON {content (base64), id, mimeType, title} onder /root/.claude/projects/…/tool-results/. Zeker: zo kwamen alle 8 lesplannen en de 12 doelensets binnen, ook LP0014b met 2,1 miljoen base64-tekens.
5. **Decoderen.** `python3 -I tools/basis/go/decodeer.py --werkmap <map> --drive-id <id> --bytes <fileSize> --gewijzigd <modifiedTime> <toolresult.json>`. Het script:
   - controleert id, mimeType en titel tegen de metadata;
   - decodeert en eist dat het aantal bytes gelijk is aan fileSize;
   - eist een geldige zip, zonder absolute paden of ‘..’, en met een redelijk totaal na het uitpakken (tegen een zip-bom);
   - schrijft <werkmap>/bron/<naam>;
   - schrijft een regel in <werkmap>/manifest.json: naam, soort, bytes, sha256, Drive-id en modifiedTime.
6. **De werkmap ligt altijd buiten de repo**, in de scratchpad van de sessie (bv. …/scratchpad/go-<datum>/). Elk script weigert een werkmap binnen /home/user/Bookwidgetzzz, zodat een origineel nooit per ongeluk gecommit wordt. De Drive-id’s staan alleen in de werkmap en in het ontwerpdocument, nooit in public/.
7. **Geen persoonsgegevens.**
   - Uit docProps/core.xml lezen de scripts alleen dcterms:created (docx) en dcterms:modified (xlsx), nooit dc:creator of cp:lastModifiedBy. In de xlsx staan daar namen van makers.
   - Metadata van de Drive over de eigenaar gaat nergens heen.
   - In de 8 lesplannen is het enige persoonsgegeven de plaatshouder [Naam] (1 keer, LP0001). Die blijft letterlijk staan.
   - De validator weigert onbekende velden en zoekt in alle uitvoer naar e-mailadressen en telefoonnummers.
8. **Herhaalbaar.** Per reeks dezelfde stappen. De sha256 in het manifest wordt vergeleken met bron.bestand.sha256 van de vorige import: is er niets veranderd, dan wordt er niets herschreven.

**Voor de eerste import** staan alle 20 bestanden al in (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/docx/ en (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/xlsx/. De bytes zijn gelijk aan de Drive en de sha256 staat in (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/manifest.json. De hoofdsessie kan daar starten zodra decodeer.py en het manifestformaat bestaan (pakket G2). De ruwe tool-uitvoer blijft buiten de repo.

## Gegevensmodel

Bestanden in de repo (alleen wat eruit gehaald wordt; de originelen blijven op de Drive):
```
public/basis/go/
  index.json                         GoIndex: het enige bestand voor de leerjaarpagina en de overzichten
  leerplan/AA.json … WT.json         GoLeerplanBestand, één per doelenset (12)
  bij-minimumdoel/1.json … 10.json   GoBijMinimumdoelBestand, per vak van het minimumdoel
  lesplannen/LP0001.json …           GoLesplanBestand, één per lesplan
  beelden/                           alleen beelden die de eigenaar vrijgeeft (nu leeg)
```
Niet in de voorcache (PRECACHE_PUBLIC blijft gelijk). De service worker bewaart ze na het eerste gebruik: ‘netwerk eerst, cache als terugval’.

```ts
// src/lib/basis/go/types.ts
// De drie lagen van #/basis: minimumdoel (overheid) ← leerplandoel (GO!) ← lesplan (GO!).
// Alle tekst van het GO! is letterlijk; de app maakt er alleen opmaak van, nooit een andere tekst.
import type { MinimumdoelRef } from '../../curriculumTypes';

/** De twaalf vakdisciplines van het nieuwe GO! leerplan basisonderwijs (het voorvoegsel van de code). */
export type GoVak = 'AA' | 'BU' | 'FR' | 'GE' | 'IT' | 'LL' | 'LO' | 'MV' | 'NL' | 'SV' | 'WI' | 'WT';
/** De leeftijdsgroepen van het GO! (de kolommen 2,5-4 … 11-12; tussen haakjes in een lesplan). */
export type GoLeeftijd = '2,5-4' | '4-5' | '5-6' | '6-7' | '7-8' | '8-9' | '9-10' | '10-11' | '11-12';
/** Kolom KENNISVERWERKING; in een lesplan cursief tussen haken, bv. [begrijpen]. */
export type Kennisverwerking = 'begrijpen' | 'gebruiken' | 'engageren';
/** De kolommen 'KO nummer', 'L4 nummer' en 'L6 nummer'. */
export type GoMoment = 'KO' | 'L4' | 'L6';

// ── Letterlijke, opgemaakte tekst ────────────────────────────────────
export type GoIcoon = 'vlag' | 'schakel' | 'diploma' | 'deelconcept' | 'go-concept' | 'denklens';
/** Tekst met de opmaak van de bron, een regeleinde (w:br of een regeleinde in w:t) of een pictogram. */
export type Stuk = { t: string; b?: true; i?: true; u?: true } | { br: true } | { icoon: GoIcoon };
/** Eén alinea of één lijstitem. Aangrenzende stukken met dezelfde opmaak zijn samengevoegd. */
export type Regel = Stuk[];

export interface GoBeeld {
  soort: 'beeld';
  /** Naam in word/media van het origineel (sha1) en de maat uit wp:extent, in px. */
  bron: string;
  breedte: number;
  hoogte: number;
  /** 'weggelaten' tot de eigenaar het beeld vrijgeeft; dan staat 'uitleg' zichtbaar op de plaats van het beeld. */
  status: 'getoond' | 'weggelaten';
  /** Bij 'getoond': pad onder public/basis/go/beelden/. */
  bestand?: string;
  /** Bij 'getoond' verplicht: geschreven en nagekeken, want de bron heeft geen alt-tekst. */
  alt?: string;
  uitleg: string;
}

export type Blok =
  | { soort: 'kop'; niveau: 1 | 2 | 3 | 4; tekst: Regel }
  | { soort: 'alinea'; tekst: Regel }
  | { soort: 'lijst'; genummerd: boolean; start?: number; items: Regel[] }
  | { soort: 'tabel'; rijen: Cel[][] }
  | GoBeeld;

export interface Cel {
  /** kolomkop: de grijze koprij (F2F2F2); rijkop: de eerste kolom van de tabellen in deel 1, 2 en 4. */
  rol: 'kolomkop' | 'rijkop' | 'data';
  /** Verticaal samengevoegd (w:vMerge), zoals 'Leskern' over de stappen. */
  samengevoegd?: 'begin' | 'vervolg';
  /** Geen koppen en geen tabellen in een cel (de bron heeft er geen; de validator weigert ze). */
  blokken: (Extract<Blok, { soort: 'alinea' | 'lijst' }> | GoBeeld)[];
}

/** Een plek in de letterlijke tekst: deel, blok, en in een tabel rij en kolom. */
export interface Wijzer {
  deel: number;
  blok: number;
  rij?: number;
  kolom?: number;
}

// ── Laag 3: lesplan ──────────────────────────────────────────────────
/** public/basis/go/lesplannen/<code>.json */
export interface GoLesplanBestand {
  app: 'boosterz';
  kind: 'go-lesplan';
  v: 1;
  /** 'LP0065', gelijk aan de bestandsnaam (LP[0-9]{4}[a-z]?). */
  code: string;
  /** 'Dieren classificeren'. */
  titel: string;
  /** Uit de titel: '(2,5-4 jaar)'. */
  leeftijd: GoLeeftijd;
  /**
   * De volledige tekst, in de volgorde van de bron. Deel 0 is de kop (Heading1 en de metaregels), daarna deel 1 tot 6
   * (deel 7 = Bijlagen, alleen LP0014a). Elk deel begint met zijn kop.
   */
  delen: { nr: number; blokken: Blok[] }[];
  afgeleid: GoLesplanAfgeleid;
  bron: GoLesplanBron;
  /** sha-256 van canoniek({ code, titel, leeftijd, delen, afgeleid }). */
  sha256: string;
}

/** Wat de app nodig heeft om te zoeken, te filteren en te koppelen. Elke tekst hierin staat letterlijk op de plek van de wijzer. */
export interface GoLesplanAfgeleid {
  /** 'Wetenschap en techniek'. */
  vakdiscipline: string;
  vak: GoVak;
  lessenlijn: string;
  lessenreeks: string;
  /** Een of meer, bv. LP0074: DFWT005 en DFWT004. */
  didactischeFiches: { code: string; titel: string }[];
  /** Uit deel 2. */
  leerplandoelen: { code: string; kennisverwerking: Kennisverwerking; leeftijden: GoLeeftijd[]; tekst: string; waar: Wijzer }[];
  /** Uit de rij Lesdoel van deel 4. */
  diplomas: { naam: string; leeftijd: GoLeeftijd; ikDoelen: { code: string; zinnen: string[] }[]; waar: Wijzer }[];
  deelconcepten: string[];
  goConcepten: string[];
  /** Codes met het pictogram vlag in deel 3. */
  vlaggen: string[];
  /** Codes met het pictogram schakel in deel 3. */
  schakels: string[];
  /** LP0014b heeft er 5. */
  stappen: { nr: 1 | 2 | 3 | 4 | 5 | 6; naam: string; wat: Wijzer; hoe: Wijzer }[];
  /** LP0017 heeft 3 activiteiten zonder titel. */
  trainen: { titel?: string; vanaf: Wijzer; tot: Wijzer }[];
  materiaal: Wijzer;
}

export interface GoBronBestand {
  naam: string;
  bytes: number;
  sha256: string;
  /** dcterms:created (docx) of dcterms:modified (xlsx), ISO. */
  datum: string;
}

export interface GoLesplanBron {
  net: 'GO!';
  /** GO_NAAMSVERMELDING. */
  naamsvermelding: string;
  waar: 'GO! studio';
  /** 'https://studio.g-o.be/' tot het patroon van een link per lesplan gekend is. */
  url: string;
  bestand: GoBronBestand;
  /** ISO-datum van de import. */
  ingelezen: string;
}

// ── Laag 2: leerplandoelen ───────────────────────────────────────────
/** public/basis/go/leerplan/<vak>.json, één per doelenset. */
export interface GoLeerplanBestand {
  app: 'boosterz';
  kind: 'go-leerplan';
  v: 1;
  vak: GoVak;
  /** De naam van het tabblad, bv. 'Wetenschap en techniek'. */
  naam: string;
  /** De hiërarchie, in bronvolgorde. */
  rubrieken: GoRubriek[];
  /** In bronvolgorde: de code loopt op van 001 tot N, zonder gaten. */
  doelen: GoLeerplandoel[];
  bron: GoLeerplanBron;
  /** sha-256 van canoniek({ vak, naam, rubrieken, doelen }). */
  sha256: string;
}

export interface GoLeerplanBron {
  net: 'GO!';
  naamsvermelding: string;
  waar: 'GO! Navigator';
  leerplan: 'Het nieuwe GO! leerplan basisonderwijs';
  /** 'Doelenset BaO wetenschap en techniek.xlsx'. */
  bestand: GoBronBestand;
  ingelezen: string;
}

export interface GoRubriek {
  /** 'WT-r012': een volgnummer in de set, want de bron nummert rubrieken niet. */
  id: string;
  soort: 'onderwerp' | 'subthema' | 'rubriek' | 'subrubriek';
  tekst: string;
  ouder?: string;
  /** Rij in de Excel. */
  rij: number;
}

export interface GoLeerplandoel {
  /** 'WT.086'. */
  code: string;
  rij: number;
  /** Kolom INHOUD, letterlijk. */
  tekst: string;
  kennisverwerking: Kennisverwerking;
  /** De leeftijdskolommen met 1, in volgorde; minstens één. */
  leeftijden: GoLeeftijd[];
  /** id van de diepste rubriek erboven. */
  rubriek: string;
  /** MIA, begrippen, voorbeelden en voetnoten, in bronvolgorde. */
  inhoud: GoDoelInhoud[];
  minimumdoelen: GoKoppeling;
  /** Kolom VLAGGEN. */
  vlaggen: GoVerwijzingen;
  /** Kolom SCHAKELS. */
  schakels: GoVerwijzingen;
}

export type GoDoelInhoud =
  | { soort: 'mia-titel'; tekst: string; rij: number; refs?: GoMinimumdoelRef[] }
  | { soort: 'mia'; tekst: string; aanklikbaar: boolean; rij: number; refs?: GoMinimumdoelRef[] }
  | { soort: 'begrip'; tekst: string; leeftijden: GoLeeftijd[]; rij: number }
  | { soort: 'voorbeelden-titel'; tekst: string; rij: number; refs?: GoMinimumdoelRef[] }
  | { soort: 'voorbeeld'; tekst: string; rij: number; refs?: GoMinimumdoelRef[] }
  | { soort: 'voetnoot'; tekst: string; rij: number }; // TYPE 'asterisk'

export interface GoKoppeling {
  /** Letterlijk uit de kolommen, bv. { KO: '3.1.3, 3.1.4' }. */
  bron: Partial<Record<GoMoment, string>>;
  /** Leeg en geen bron: het leerplan koppelt dit doel aan geen minimumdoel. */
  refs: GoMinimumdoelRef[];
  problemen: { moment: GoMoment; bronCode: string; reden: 'bestaat-niet' | 'onleesbaar' }[];
}

/** De sleutel van de app (set + vast nummer + code), met het moment en de status. */
export interface GoMinimumdoelRef extends MinimumdoelRef {
  moment: GoMoment;
  status: 'officieel' | 'voorstel';
  /** Officieel, maar het moment past niet bij de leeftijden van het doel: melden, niet verbeteren. */
  twijfel?: 'moment-buiten-leeftijden';
  /** Bij een voorstel: wat er letterlijk in de bron staat, bv. '6.12'. */
  bronCode?: string;
}

export interface GoVerwijzingen {
  bron?: string;
  codes: string[];
  kapot: string[];
}

// ── Omgekeerd: per minimumdoel ───────────────────────────────────────
/**
 * public/basis/go/bij-minimumdoel/<vak 1-10>.json: per vast nummer de leerplandoelen die ernaar verwijzen.
 * Geldt voor gewoon en buitengewoon onderwijs: de tweelingsets hebben hetzelfde nummer.
 */
export interface GoBijMinimumdoelBestand {
  app: 'boosterz';
  kind: 'go-bij-minimumdoel';
  v: 1;
  vak: number;
  /** Sleutels alleen cijfers; inlezen in een Map, nooit opzoeken op een gewoon object. */
  doelen: Record<string, GoBijDoel[]>;
  sha256: string;
}

export interface GoBijDoel {
  code: string;
  moment: GoMoment;
  status: 'officieel' | 'voorstel';
  twijfel?: 'moment-buiten-leeftijden';
  tekst: string;
  kennisverwerking: Kennisverwerking;
  leeftijden: GoLeeftijd[];
  lesplannen: string[];
}

// ── Index ────────────────────────────────────────────────────────────
/** public/basis/go/index.json */
export interface GoIndex {
  app: 'boosterz';
  kind: 'go-index';
  v: 1;
  naamsvermelding: string;
  ingelezen: string;
  leerplan: {
    vak: GoVak;
    naam: string;
    bestand: string;
    aantal: number;
    zonderMinimumdoel: number;
    perLeeftijd: Record<GoLeeftijd, number>;
    bronDatum: string;
    sha256: string;
  }[];
  bijMinimumdoel: { vak: number; bestand: string; sha256: string }[];
  lesplannen: {
    code: string;
    titel: string;
    leeftijd: GoLeeftijd;
    vak: GoVak;
    lessenlijn: string;
    lessenreeks: string;
    doelen: string[];
    bestand: string;
    sha256: string;
  }[];
}
```

**Validator** (src/lib/basis/go/valideer.ts, zuiver en zonder crypto, zoals valideerSetBestand): valideerGoIndex, valideerGoLeerplan, valideerGoLesplan en valideerGoBijMinimumdoel(json: unknown): string[]. Een lege lijst betekent ‘in orde’. De validator controleert dit:
- **Strikt:** een onbekend veld is een fout. Zo glipt er nooit metadata mee.
- **Waarden:** enums, codepatronen en lengtegrenzen; leeftijden uniek, in volgorde en niet leeg.
- **Leerplan:** de codes lopen door van 001 tot N met het voorvoegsel van het bestand; elke rubriek-id en elke ouder bestaat.
- **Verwijzingen:** set ODS_[0-9]+ en id [0-9]+.
- **Wijzers:** elke wijzer bestaat, en de afgeleide tekst staat letterlijk op die plek.
- **Blokken:** cellen bevatten geen kop of tabel; een lijst heeft minstens één item; er zijn geen lege alinea’s; een beeld met status ‘getoond’ heeft een bestand en een alt-tekst.
- **Persoonsgegevens:** er staat geen e-mailadres of telefoonnummer in.

De sha256 rekenen goBestanden.test.ts en maak.ts na met canoniek uit src/lib/minimumdoelen.ts.

**Voorbeeld van één cel** (LP0001, deel 4, Leskern, Didactiek):
```ts
[
  { soort: 'alinea', tekst: [{ t: '1. Verkennen', b: true }] },
  { soort: 'alinea', tekst: [{ t: 'Zintuiglijke en betekenisvolle start:', u: true }] },
  { soort: 'alinea', tekst: [{ t: 'De kinderen zitten in de kring.' }] },
  // … tot 'Prikkelvraag: …' (7 alinea’s, zoals de 7 w:p van het origineel)
]
```

## Import

Drie stappen in één richting. Er wordt niets geschreven tenzij alles klopt.

## 1. Uitlezen (Python 3)

Alleen de standaardbibliotheek, altijd `python3 -I`. De scripts staan in tools/basis/go/, de gegevens in de werkmap.

- **`lees_docx.py <docx> <ruw.json>`** leest alleen:
  - word/document.xml, numbering.xml, styles.xml (voor de stijlnamen) en _rels/document.xml.rels;
  - de namen en de sha1 van word/media/*;
  - uit docProps/core.xml alleen dcterms:created.

  Het geeft neutrale blokken: alinea’s (stijl, numId/ilvl/numFmt, runs met b/i/u, w:br, regeleinden in w:t, en w:drawing met doel en maat) en tabellen (rijen, cellen, gridSpan, vMerge en vulling). Het script weet niets van het GO!.

  Met `--tekst` schrijft het een leesbare weergave voor de nakijker.
- **`lees_xlsx.py <xlsx> <ruw.json>`** leest:
  - workbook.xml voor de bladnaam;
  - sharedStrings.xml (rich text wordt samengevoegd, regeleinden blijven);
  - sheet1.xml;
  - uit core.xml alleen dcterms:modified.

  Per rij geeft het de 24 cellen als tekst.
- **Veiligheid** (veilig_zip.py):
  - ledennamen zonder ‘..’ en zonder absoluut pad;
  - hoogstens 50 MB uitgepakt, met een redelijke verhouding tegen een zip-bom;
  - een XML-bestand met <!DOCTYPE of <!ENTITY wordt geweigerd vóór het parsen, want expat werkt interne entiteiten uit.

**Waarom Python:** zipfile en xml.etree zitten in de standaardbibliotheek en zijn betrouwbaar. De verkenners hebben er alle 20 bestanden mee gelezen. De regel ‘python -I voor gedownloade bestanden’ is zo vanzelf voldaan. Python leest alleen; alle betekenis zit in TypeScript.

## 2. Omzetten en koppelen (TypeScript)

Commando: `npx vite-node tools/basis/go/maak.ts --werkmap <map> [--uit public/basis/go] [--aanvaard-wijzigingen]`

Het draait met vite-node, zoals tools/basis/meet-zoeken.ts. De modules van src/lib/basis importeren zonder extensie, bv. basisRoutes.ts → './kalender'. Type stripping van Node lukt dat niet. haal-minimumdoelen.mjs kan het alleen omdat minimumdoelen.ts zelf niets importeert.

De logica staat in zuivere modules met unittests:
- **src/lib/basis/go/vorm.ts:** de verwachte vorm, als gegevens.
- **src/lib/basis/go/omzetten.ts:** ruw → GoLesplanBestand en ruw → GoLeerplanBestand. Regels:
  - runs met dezelfde opmaak worden samengevoegd;
  - een regeleinde in w:t wordt {br:true} (18 keer, vooral liedjes; dat het als nieuwe regel bedoeld is, is waarschijnlijk);
  - een alinea met alleen witruimte of een harde spatie (NBSP) valt weg;
  - opeenvolgende alinea’s in de stijl ListParagraph met dezelfde numId worden één lijst; is een genummerde lijst onderbroken, dan krijgt het vervolg een start;
  - een icoon wordt {icoon} op basis van de bestandsnaam in word/media;
  - de mindmap wordt een GoBeeld met status ‘weggelaten’.
- **src/lib/basis/go/koppelen.ts:** zie het veld koppeling.
- **src/lib/basis/go/rondgang.ts:** de tekstvergelijking (zie de controles).
- **src/lib/basis/go/valideer.ts:** dezelfde validator als in de app, op elk bestand vóór het schrijven.

**Uitgangscodes:**
- 0: geschreven. Een ongewijzigd bestand wordt niet aangeraakt.
- 1: fout.
- 3: de vorm wijkt af of de gegevens zijn niet betrouwbaar. Er is niets geschreven behalve <werkmap>/rapport.json.

Krijgt een bestaande code een andere tekst (een nieuwe versie van het GO!), dan stopt de import tot de hoofdsessie `--aanvaard-wijzigingen` meegeeft. Het rapport noemt die codes, met de lesplannen en het aanbod die erop steunen.

## 3. Controles

Dit doet een script, geen model. Elke afwijking geeft exit 3.

### Lesplan (docx)

- **Titel:** precies één Heading1 van de vorm ‘Lesplan <code> <titel> (<leeftijd> jaar)’. De code is gelijk aan de bestandsnaam, de leeftijd is een van de 9.
- **Metaregels:** Vakdiscipline, Lessenlijn, Lessenreeks, Lesplan en Didactische fiche, in die volgorde en met een vet label.
  - ‘Lesplan:’ is gelijk aan code + titel.
  - Fiches hebben de vorm DF<vak><3 cijfers>; het kunnen er meer zijn.
- **Delen:** de Heading2-koppen zijn precies ‘1. Wat moet de leraar weten?’ tot ‘6. Didactisch materiaal bij dit lesplan’. ‘7. Bijlagen’ mag alleen via bekende-afwijkingen.json (LP0014a). Heading3 en Heading4 komen alleen in deel 3 voor en alleen uit de gekende lijst.
- **Tabellen:**
  - deel 1: 3x3, met de rijkoppen Kennis en Misconcept;
  - deel 2: 2x3, met Leerplandoelen;
  - deel 3: drie tabellen met de iconen diploma/deelconcept, deelconcept/go-concept en de denklenzen;
  - deel 4: Voorkennis, Doeloriëntatie / belang, Lesdoel, Leskern (vMerge: begin + vervolg) en Vastlegging;
  - de koprij is grijs (F2F2F2), met de kolommen ‘Inhoud (Wat?)’ en ‘Didactiek (Hoe?)’.
- **Leskern:** 5 of 6 stappen met de gekende namen, in deze volgorde: Verkennen, Voorkeursinstructie, Terugkoppelen, Begeleid inoefenen, Kleine lesafsluiting, Zelfstandige verwerking. In beide kolommen staan hetzelfde nummer en dezelfde naam; witruimte achteraan mag. LP0014b heeft er 5: zeker, er staat geen ‘6. Zelfstandige verwerking’ in.
- **Doelregels in deel 2:** vette code <vak>.<3 cijfers>, cursief niveau tussen haken, de tekst, de leeftijden tussen haakjes.
- **Media en opmaak:**
  - alleen de 6 gekende iconen; een ander beeld alleen via bekende-afwijkingen.json, op zijn sha1;
  - geen geneste tabellen, geen opmerkingen, geen bijgehouden wijzigingen, geen tekstvakken, geen inhoudsbesturingselementen, geen hyperlinks en geen velden in de body;
  - geen w:tab;
  - alleen lijstniveau 0, met numFmt bullet of decimal.

### Doelenset (xlsx)

- **Blad:** één blad; de koprij heeft exact de 24 gekende kolommen. De lege kop van kolom M in wiskunde mag via bekende-afwijkingen.json.
- **TYPE** komt uit de gekende lijst: onderwerp, subthema, rubriek, subrubriek, minimumdoel, doelzin, MIA - titel, MIA - aanklikbaar, MIA - niet aanklikbaar, te hanteren begrippen, voorbeelden - titel, voorbeelden - bullet, asterisk. Rijen met alleen nullen mogen alleen na de laatste inhoud staan.
- **GO! NR.** staat alleen op doelzin-rijen, met het voorvoegsel van de set, en loopt door van 001 tot N.
- **KENNISVERWERKING** is begrijpen, gebruiken of engageren.
- **Leeftijdskolommen** bevatten alleen 0 of 1, met minstens één 1 op een doelzin. De ene rubriekrij met een leeftijd mag via bekende-afwijkingen.json.
- **Codekolommen:** codes van de vorm cijfer.cijfer.cijfer, gescheiden door een komma.
- **VLAGGEN en SCHAKELS:** codes van de vorm <vak>.<3 cijfers>, gescheiden door een komma of een puntkomma. Elke kapotte waarde moet in bekende-afwijkingen.json staan; nu zijn het er 18.
- **Koppeling:** elke code vindt precies één doel, of staat in bekende-afwijkingen.json; nu één: MV.040 ‘6.12’.

### Over lesplan en doelenset heen

- Elke doelregel in deel 2 van een lesplan bestaat in de doelenset, met dezelfde code, kennisverwerking en leeftijden.
- De tekst is gelijk volgens normaliseerDoeltekst (src/lib/curriculum.ts:360), of staat in bekende-afwijkingen.json. Nu één: WT.008 in LP0065.
- De MIA-blokken en begrippen van het lesplan staan letterlijk bij dat doel.
- De vlaggen en schakels van deel 3 zijn samen precies de vlaggen en schakels (kolommen VLAGGEN en SCHAKELS) van zijn doelen. Nu 8 van 8.

### Rondgang

- **docx:** alle tekst uit de body (w:t, w:br, regeleinden en iconen, in documentvolgorde, zonder lege alinea’s en paginabreuken) is exact gelijk aan de tekst van het lesplanbestand. Ook gelijk zijn de aantallen tabellen, rijen, cellen, lijstitems, vette, cursieve en onderlijnde stukken en iconen. De voettekst (bv. ‘LP0017 - Onze voedingsmiddelen’ met een paginanummer) hoort niet bij de body.
- **xlsx:** elke niet-lege cel van een inhoudsrij komt precies één keer terug, op zijn rijnummer. De minimumdoel-rijen gaan alleen naar het rapport, want hun tekst komt uit de API.

### Bekende afwijkingen

bekende-afwijkingen.json wijzigt alleen de hoofdsessie, met een reden en een datum per regel. Een nieuwe afwijking stopt de import.

## 4. Uitrolpoort (vitest)

- **src/lib/basis/go/goBestanden.test.ts** leest alle bestanden in public/basis/go/ en eist:
  - dat valideer* niets meldt;
  - dat elke sha256 klopt;
  - dat index, leerplannen, lesplannen en omgekeerde index bij elkaar passen.
- **src/lib/basis/go.echt.test.ts** staat bovenaan src/lib/basis, zodat de glob src/lib/basis/*.echt.test.ts van de maandelijkse ophaling hem meeneemt (minimumdoelenWorkflow.test.ts:741). Bij GEGEVENSRUN=1 slaat hij over, zoals momentmodel.echt.test.ts. Hij eist:
  - dat elke ref nog bestaat in public/leerplannen/minimumdoelen, met dezelfde code, in een nieuwe gewone set van het juiste vak en eindmoment;
  - dat de tweeling in het buitengewoon onderwijs hetzelfde nummer heeft.

  De aantallen (3490, 3022, 998) staan alleen achter een momentopname-wacht.

## 5. Nakijken tegen het origineel

Dit is wat een script niet kan.

- **Ronde 1, na de eerste import:** tools/basis/go/toon.ts schrijft per lesplan het JSON als leesbare tekst. Die tekst gaat naast `lees_docx.py --tekst`.
- **Ronde 2, na de lesplanpagina:** tests/basis/go-tekst.mjs (Playwright) schrijft de zichtbare tekst per deel. Twee nakijkers (sonnet), elk 4 lesplannen, kijken na:
  - staat alles in de goede kolom (Wat? of Hoe?);
  - hoort elke stap bij Leskern;
  - is een lijst een lijst;
  - staat bij het juiste pictogram ‘vlag’ of ‘schakel’;
  - verdwijnt er niets achter een dichtgeklapt blok zonder zichtbaar label;
  - staat de bron erbij.
- **Doelensets:** een nakijker controleert steekproefsgewijs 43 leerplandoelen tegen de Excel: 2 per vak en de 19 uit de lesplannen, telkens met MIA, begrippen en koppeling.
- **Bij twijfel** beslist de rechter (opus). De hoofdsessie herstelt dan het script of het scherm, nooit het JSON-bestand met de hand.

## Herhaalbaar

Voor elke volgende reeks lopen dezelfde stappen, beschreven in tools/basis/go/LEESMIJ.md:
1. ophalen;
2. decodeer.py;
3. lees_docx.py en lees_xlsx.py;
4. maak.ts.

Geeft maak.ts exit 3, dan leest de hoofdsessie het rapport en kiest bewust: vorm.ts uitbreiden of een afwijking met reden opnemen. Daarna volgen de nakijker en de poort. Bij een nieuwe vorm (andere stapnamen in het lager, andere tabellen) stopt de import met opzet.

## Beelden

**In de lesplannen** staan 4 tot 7 bestanden per lesplan in word/media (zeker).

**Zes pictogrammen** van 32x32 px: lesplan-vlag, -schakel, -diploma, -deelconcept, -go-concept en -denklens.
- Ze gaan niet als png mee. Het script maakt er {icoon:'…'} van op basis van de bestandsnaam.
- Die bestandsnaam is de enige plek waar ‘vlag’ of ‘schakel’ staat: descr en title zijn leeg. Een onbekende naam stopt de import.
- In de app staat een Lucide-icoon: Flag, Link2, Award, Puzzle, Lightbulb en Glasses. Alle zes bestaan in lucide-react 1.48.0.
- Er staat altijd een zichtbaar woord bij (‘vlag’, ‘schakel’), want het icoon draagt betekenis.
- De iconen staan in src/components/basis/go/goIconen.ts, niet in icons.ts en niet in EAGER_ICON_NAMES.
- Het script telt de iconen per soort en vergelijkt ze met de kolommen VLAGGEN en SCHAKELS van de Excel. Een verwisseling valt zo op, ook al vergelijkt de rondgang alleen tekst.

**De mindmap ‘Mijn lichaam’** in LP0014a en LP0014b.
- Bestand e11d61d723cc34e449f987f8bb06b5eb44de2082.png: 1254x1254 px, 1,28 MB.
- Er staat tekst in die alleen in het beeld voorkomt.
- Er staan foto’s van kinderen op, deels in ondergoed. Of ze gegenereerd zijn, is onzeker.
- Standaard: niet publiceren. Op die plaats komt een GoBeeld met status ‘weggelaten’ en een zichtbare zin: ‘In het originele lesplan staat hier een mindmap “Mijn lichaam” met de lichaamsdelen en wat ze doen. Dit beeld staat niet in Boosterz.’
- Deel 7 (Bijlagen) van LP0014a noemt het bestand letterlijk. Die regel blijft.
- Geeft de eigenaar het beeld vrij (vraag 2):
  - omzetten naar WebP van hoogstens 1000 px (Pillow 10.2 staat in deze container, maar de repo vereist het niet);
  - een alt-tekst die de labels in het beeld letterlijk overneemt (‘HOOFD’, ‘het oor – om te horen’ …): de inhoudschrijver schrijft, de nakijker kijkt na tegen het beeld;
  - een langere beschrijving in een details-blok;
  - pad public/basis/go/beelden/<sha1>.webp.

**Voor het aanbod** (later) vragen de lesplannen zelf foto’s en prenten, met ‘zorg voor diversiteit’. Bijvoorbeeld LP0065: ‘een doos foto’s van de al verkende dieren en planten’; LP0001: ‘Foto’s van: een baby in de buik, …’.
- Elk beeld krijgt een regel in public/basis/aanbod/beelden.json, met bron, maker, licentie en alt-tekst. De validator eist ze.
- Geen foto’s van herkenbare kinderen.
- Eén vaste stijl per pakket.
- Waar de beelden vandaan komen, beslist de eigenaar (vraag 8).
- Geen externe beeldlinks: alles staat naast de app, zodat het offline werkt via de service worker.

## Koppeling

## Bron

De doelensets van het GO! (Excel), kolommen ‘KO nummer’, ‘L4 nummer’ en ‘L6 nummer’ op elke doelzin-rij. Daarnaast hebben 14 MIA- en voorbeeldrijen een eigen code: een fijnere koppeling, bv. WI.351 ‘Vermenigvuldigen:’ → L4 2.2.19. De Excel geeft alleen codes. Een code is pas eenduidig samen met het moment.

## Omzetting

src/lib/basis/go/koppelen.ts is zuiver; de index en de setbestanden zijn de invoer.

1. Splits op komma en trim. Eis de vorm cijfer.cijfer.cijfer; anders is het een probleem ‘onleesbaar’.
2. Het vak is het eerste getal (1 Nederlands … 10 Frans). Het eindmoment: KO → K3, L4 → L4, L6 → L6.
3. Kandidaten: de nieuwe, niet-lege sets van het gewoon basisonderwijs van dat vak en eindmoment, via basisSet en setsVanVak (src/lib/basis/moment.ts, doelBasis.ts). Voor kleuter Nederlands en wiskunde zijn dat telkens twee sets: ODS_3397/3401 en ODS_3404/3405.
4. Precies één doel met die code → GoMinimumdoelRef {set, id, code, moment, status:'officieel'}. De tweeling in het buitengewoon onderwijs heeft hetzelfde nummer (0 afwijkingen, zeker). Er komt dus geen tweede ref: de doelpagina van beide sets vindt het leerplandoel op het nummer.
5. Geen doel → probleem ‘bestaat-niet’. Staat er in bekende-afwijkingen.json een voorstel bij, dan komt er een ref met status ‘voorstel’ en de letterlijke bronCode. Meer dan één doel komt niet voor (geen dubbele codes binnen een moment, zeker); gebeurt het toch, dan stopt de import.
6. Past het moment niet bij de leeftijden van het doel, dan blijft de ref officieel, met twijfel ‘moment-buiten-leeftijden’. Dat is zo bij KO zonder 2,5-4, 4-5 of 5-6; bij L4 zonder een van 6-7 tot 9-10; bij L6 zonder 10-11 of 11-12.

## Stand bij de eerste lezing

Dit vond de verkenner (zeker); de import rekent het opnieuw na.
- Er zijn 4973 verwijzingen. 4972 vinden precies één doel.
- 3022 van de 3490 leerplandoelen hebben minstens één verwijzing, 468 geen.
- Elk van de 998 minimumdoelen van het gewoon basisonderwijs wordt door minstens één leerplandoel genoemd.
- 178 verwijzingen (3,6 %) hebben een moment buiten de leeftijden. Voorbeeld: LO.076 (2,5-4 tot 5-6) → L4 7.1.10.

Voor de 8 lesplannen:
- 19 leerplandoelen, 22 vermeldingen.
- 17 van die doelen koppelt het leerplan aan een minimumdoel in ODS_3410 (kleuter wetenschap en techniek). WT.235 gaat daarnaast ook naar L6 3.3.2 (92822, ODS_3409). WT.008 en WT.057 hebben geen minimumdoel.
- Ze raken 7 van de 21 kleuterdoelen wetenschap en techniek: 3.1.2, 3.1.3, 3.1.4, 3.2.2, 3.3.1, 3.3.2 en 3.3.3.

## Vijf standen en hoe ze zichtbaar zijn

- **Officieel.** ‘Volgens het leerplan van het GO!’, met het moment (bv. ‘Einde kleuter’), de code en de volledige tekst van het minimumdoel uit de API (VolledigeDoeltekst), plus een link naar #/basis/doel/<set>/<id>. In een details-blok: ‘Zo staat het in het leerplan: KO 3.1.3, 3.1.4’, de bron letterlijk, zoals refsBron.
- **Officieel met twijfel.** Dezelfde weergave. Alleen onder ‘Hoe zeker is dit?’ staat de zin: ‘Dit doel is voor 2,5-4 jaar; het leerplan koppelt het ook aan een doel voor het einde van het 4de leerjaar.’ De verwijzing komt op de lijst voor het GO!.
- **Voorstel.** Een badge ‘voorstel, nog niet bevestigd door het GO!’ en de zin: ‘In het leerplan staat “6.12”. Dat nummer bestaat niet; waarschijnlijk is 6.1.2 bedoeld.’ Dat gebeurt nu 1 keer, bij MV.040. Of dit zichtbaar mag, beslist de eigenaar (vraag 5).
- **Kapot, zonder voorstel.** Geen link. Wel de zin: ‘In het leerplan staat ook “…” bij <moment>. Dat nummer bestaat niet in de officiële minimumdoelen.’
- **Zonder minimumdoel.** ‘Het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel.’ Het overzicht per vak krijgt een filter ‘zonder minimumdoel’. Nooit een eigen voorstel: dat zou iets beweren wat het GO! niet zegt.

## Tekst van een minimumdoel

Altijd uit public/leerplannen/minimumdoelen (de API), via laadSet en VolledigeDoeltekst. De minimumdoel-rijen van de Excel komen niet in public/: ze staan alleen in het importrapport, als controle. Van de 1133 vergeleken rijen:

| Uitkomst | Aantal |
|---|---|
| Gelijk | 1062 |
| Alleen witruimte anders | 21 |
| Alleen leestekens anders | 20 |
| Alleen een hoofdletter anders | 1 |
| Andere woorden | 28 |
| Zonder de uitbreiding | 1 |

Daarnaast hebben 6 rijen geen bruikbare code. Zo kan er in de app nooit een tweede, afwijkende tekst van een minimumdoel staan.

## Lesplan → leerplandoel

Uit deel 2 van het lesplan (de vette code), nagekeken tegen de Excel:
- code, kennisverwerking en leeftijden: 22 van 22 gelijk;
- tekst: 21 van 22 gelijk. WT.008 wijkt af: in LP0065 ‘Herkennen de belangrijkste voedingswijze van dieren.’, in de Excel ‘Herkennen verschillende voedingswijzen van dieren.’

Beide blijven letterlijk. Het lesplan toont zijn eigen tekst. De leerplandoelpagina toont die van de Excel, met ‘In lesplan LP0065 staat: …’.

## Vlaggen en schakels

Uit de kolommen VLAGGEN en SCHAKELS van de Excel. Een code die bestaat, wordt een link naar dat leerplandoel. Kapotte waarden blijven letterlijk staan, zonder link; er zijn er 18, bv. ‘NL. 200’ en ‘LL/095’.

## Over de tijd

De koppeling hangt vast aan set + vast nummer. Bij de maandelijkse ophaling kan een doel verdwijnen.
- go.echt.test.ts meldt dat in de pull request (de stap met continue-on-error).
- De uitrol blijft tegengehouden tot de hoofdsessie de import opnieuw draait; de koppeling wordt dan opnieuw uit de bron berekend.
- De app toont zo’n verwijzing zonder doel als ‘Dit minimumdoel staat niet meer in de officiële gegevens’, zonder fout.

## Omgekeerd

bij-minimumdoel/<vak>.json bestaat per vak van het minimumdoel (1 tot 10), met het vaste nummer als sleutel. Zo laadt de doelpagina één klein bestand. Bij één minimumdoel horen hoogstens 57 leerplandoelen (bij 93408). Daarom worden ze gegroepeerd per vakdiscipline en leeftijd.

## Leeftijden

Het GO! deelt in per leeftijd, niet per leerjaar. Er zijn negen groepen: 2,5-4, 4-5, 5-6, 6-7, 7-8, 8-9, 9-10, 10-11 en 11-12 jaar. Dat is zeker: zo staan ze in de kolommen van de doelensets, tussen haakjes in de lesplannen en in de diplomakoppen (‘De zelfzorger 2,5-4 jaar’).

**Leesbril naar de leerjaren van de app.** Staat in src/lib/basis/go/leeftijden.ts, met zekerheid ‘waarschijnlijk’. Eén test legt de 9 regels vast.

| GO! | meestal | leerjaar in de app | werkt naar (WERKT_NAAR) |
|---|---|---|---|
| 2,5-4 jaar | instapklas en 1ste kleuterklas | K1 | einde kleuter |
| 4-5 jaar | 2de kleuterklas | K2 | einde kleuter |
| 5-6 jaar | 3de kleuterklas | K3 | einde kleuter |
| 6-7 jaar | 1ste leerjaar | L1 | einde 4de |
| 7-8 jaar | 2de leerjaar | L2 | einde 4de |
| 8-9 jaar | 3de leerjaar | L3 | einde 4de |
| 9-10 jaar | 4de leerjaar | L4 | einde 4de |
| 10-11 jaar | 5de leerjaar | L5 | einde 6de |
| 11-12 jaar | 6de leerjaar | L6 | einde 6de |

De app kent geen instapklas als leerjaar: LeerjaarBasis loopt van K1 tot L6 (kalender.ts:22). Daarom hoort 2,5-4 jaar bij K1, met de tekst ‘instapklas en 1ste kleuterklas’.

**Regels, zodat de app niets beweert wat het GO! niet zegt:**
- **Eerst de leeftijd van het GO!** Overal staat eerst ‘2,5-4 jaar’, pas daarna ‘meestal instapklas en 1ste kleuterklas’, met de ZekerheidBadge ‘waarschijnlijk’. Onder ‘Hoe zeker is dit?’ staat: ‘Het GO! deelt zijn leerplan in per leeftijd. Welk leerjaar dat is, hangt af van het kind; dit is de leeftijd van de meeste kinderen in dat leerjaar.’
- **Eén adres per groep.** Het gekozen leerjaar (de bewaarde keuze wf.basis.keuze.v1) bepaalt de leeftijdsgroep: K1 → 2,5-4. Omgekeerd hoort 2,5-4 alleen bij K1. Zo heeft elke groep één adres (?leerjaar=K1).
- **Een doel met meer groepen** staat bij elke groep, bv. WT.235 van 2,5-4 tot 9-10.
  - De tekst blijft dezelfde, want zo staat het in de bron.
  - De begrippen kunnen per groep verschillen: de leeftijdskolommen staan ook op 4665 van de 4682 begrippenrijen.
  - De MIA verschilt niet: MIA-rijen hebben nooit een leeftijd.
- **Geen koppeling uit leeftijden.** De koppeling komt alleen uit de codekolommen. Past het moment niet bij de leeftijden, dan blijft de koppeling officieel, met twijfel.
- **Kennisverwerking is iets anders dan een niveau.** [begrijpen], [gebruiken] en [engageren] zijn een eigen indeling van het GO!, niet de niveaus E tot A uit docs/NIVEAUS.md. De app legt er geen verband tussen.

## Leerplandoelen

Een eigen laag tussen minimumdoel en lesplan. Ze komt volledig uit de 12 doelensets van het nieuwe GO! leerplan basisonderwijs (Excel, dc:modified 2026-09-03), en niet stukje bij beetje uit de lesplannen: de bron is er nu.

## Model

Zie GoLeerplanBestand in het veld gegevensmodel. Per vakdiscipline komt er één bestand public/basis/go/leerplan/<vak>.json, voor AA, BU, FR, GE, IT, LL, LO, MV, NL, SV, WI en WT. Elk bestand bevat:

**De hiërarchie.** Onderwerp, subthema, rubriek en subrubriek: over de 12 sets samen 44, 131, 229 en 141 rijen. De bron nummert ze niet, dus elke rubriek krijgt een volgnummer als id.

**De leerplandoelen.** In totaal 3490:

| Vak | Doelen |
|---|---|
| AA | 276 |
| BU | 148 |
| FR | 112 |
| GE | 244 |
| IT | 93 |
| LL | 114 |
| LO | 189 |
| MV | 98 |
| NL | 622 |
| SV | 68 |
| WT | 528 |
| WI | 998 |

Per doel:
- de code;
- de tekst, letterlijk;
- de kennisverwerking: begrijpen, gebruiken of engageren;
- de leeftijden: de kolommen met een 1;
- de inhoud eronder, in bronvolgorde:
  - MIA-titels;
  - MIA-items: 5042 aanklikbaar en 2387 niet. Die vlag blijft bewaard, maar staat niet op het scherm zolang de betekenis niet gekend is;
  - te hanteren begrippen, met hun eigen leeftijden (4682);
  - voorbeelden: 838 titels en 2035 bullets. Sommige bevatten verzonnen kindernamen uit de bron; die blijven letterlijk;
  - voetnoten (45, TYPE ‘asterisk’).

**De koppelingen van elk doel:**
- naar minimumdoelen: de bron letterlijk, de refs en de problemen;
- vlaggen en schakels: de bron letterlijk, de geldige codes en de kapotte waarden.

**Wat niet in de Excel staat.** Diploma’s, deelconcepten en GO! concepten. Die komen per lesplan uit deel 3 en 4 (in afgeleid: diplomas met de ik-doelen, deelconcepten, goConcepten). De leerplandoelpagina toont ze met ‘volgens lesplan LP0065’. Een volledige lijst komt pas uit GO! Navigator (de conceptkaarten) of uit de kenniskaarten die al in de map staan (volgende stap, pakket A1). Lessenlijn en lessenreeks horen bij het lesplan, niet bij het doel.

## Herkomst en updates

Dezelfde import als voor de lesplannen: lees_xlsx.py en daarna maak.ts. Werkt het GO! de Excel bij, dan:
1. vervangt de eigenaar het bestand in de map, liefst met hetzelfde Drive-id;
2. draait de hoofdsessie de import;
3. toont het rapport welke codes nieuw zijn, verdwenen zijn of een andere tekst kregen;
4. stopt de import bij een gewijzigde tekst van een bestaande code, tot de hoofdsessie --aanvaard-wijzigingen meegeeft.

De Excel heeft geen versienummer. De versie is dus de bestandsdatum plus de sha256.

## Schermen

Zie het veld inDeApp:
- een pagina per leerplandoel (#/basis/leerplandoel/WT.086);
- de leerplandoelen per vakdiscipline en leeftijdsgroep (#/basis/leerplandoelen/wt?leerjaar=K1);
- bij een minimumdoel de leerplandoelen van het GO! (DOEL_DELEN ‘go’);
- omgekeerd, bij een leerplandoel, zijn minimumdoelen met de tekst uit de API.

## Herbruikbaar uit het leerplanmodel van de app

Gelezen; er verandert niets aan.
- **MinimumdoelRef {set, id, code}** (src/lib/curriculumTypes.ts:75-82). GoMinimumdoelRef breidt het uit. De regel ‘de sleutel is set + vast nummer, nooit de code alleen’ geldt ook hier.
- **refsBron** (curriculumTypes.ts:48): de letterlijke bron van de koppeling, bv. ‘KO 3.1.3, 3.1.4’.
- **Het net ‘go’** bestaat al in CurriculumNet (curriculumTypes.ts:11). De methode ‘export’ (‘een gestructureerd bestand van het net’, :97) past precies.
- **canoniek** (src/lib/minimumdoelen.ts:618) voor de sha256. Het patroon van valideerSetBestand (:713) en laadSet (src/lib/minimumdoelenBron.ts:112): valideren bij het laden, een cache, een strikt patroon voor elke bestandsnaam.
- **normaliseerDoeltekst** (src/lib/curriculum.ts:360) om een doelregel uit een lesplan te vergelijken met de Excel.
- **De controlepoort** van docs/LEERPLANNEN.md § 7 (letterlijk, volledig, verwijzingen, herkomst) als idee. Hier is ze strenger, omdat een script de rondgang kan nakijken.
- **Op de schermen:** VolledigeDoeltekst, DoelRij, RubriekenLijst, LeerlijnTabel (de vorm), ZekerheidBadge en useSetBestanden.
- **Later (pakket A2): een selectie als gewoon leerplan.** Een GO!-selectie (vakdiscipline + leeftijd) wordt met createCurriculum een gewoon Curriculum. Zo dragen oefeningen een goalCode ‘WT.028’ en een curriculumId, en werken de dekking en het nakijken per doel. De velden:
  - code ‘WT.086’;
  - id ‘go-WT-086’, want een doel-id mag geen punt bevatten (isVeiligDoelId, curriculum.ts:378);
  - text letterlijk;
  - theme = het rubriekpad;
  - note = de MIA en de begrippen, letterlijk;
  - refs = alleen de officiële refs, refsBron letterlijk;
  - net ‘go’, kind ‘leerplan’, herkomst methode ‘export’ met bronSha256 van de Excel.

  Dit wordt een zuivere functie in src/lib/basis/go/alsLeerplan.ts, die curriculum.ts alleen aanroept.

## Niet herbruikbaar

- De GO!-laag niet als Curriculum bewaren in localStorage: 3490 doelen, ±4 MB, en ze zouden opduiken in de leerplanlijsten en de wizard van het secundair.
- Geen nieuwe velden in CurriculumGoal of Curriculum.
- Geen wijziging aan Samenstellen, de wizard, CurriculaPage of MinimumdoelenPage.

## In de app

Alles valt binnen de bestaande luie route /basis/* (BasisDeel).

**Laden en bundel**
- Nieuwe schermen laden met React.lazy, zoals LeerlijnScherm en ZoekScherm.
- Het BasisDeel-chunk weegt al 59,4 kB van de 80 kB (build in dist/ van 3 november; DEFAULT_MAX_KB in vite.config.ts:112).
- App.tsx, EAGER_ICON_NAMES en het leerlingpad blijven onaangeroerd. Het bundelbudget blijft gelijk.

## Adressen

src/lib/basis/basisRoutes.ts krijgt padlezer en padbouwer voor deze schermen. Een test bewaakt de rondgang basisRoute(basisPad(x)) = x.

| Adres | Scherm | Inhoud |
|---|---|---|
| /basis/go | {s:'go'} | overzicht ‘Leerplan en lesplannen van het GO!’: 12 vaktegels en de lesplannen per leeftijd |
| /basis/lesplannen?leerjaar=K1&vak=wt | {s:'lesplannen', leerjaar?, vak?} | lesplannen per leeftijdsgroep, per vakdiscipline › lessenlijn › lessenreeks |
| /basis/lesplan/LP0065?stap=3 | {s:'lesplan', code, stap?} | lesplanpagina; code LP[0-9]{4}[a-z]?, kleine letters mogen |
| /basis/lessenlijn/wt/biologie-van-organismen?leerjaar=K1 | {s:'lessenlijn', vak, lijn, leerjaar?} | één lessenlijn |
| /basis/leerplandoelen/wt?leerjaar=K1&rubriek=WT-r012 | {s:'leerplandoelen', vak, leerjaar?, rubriek?} | leerplandoelen van een vak |
| /basis/leerplandoel/WT.086 | {s:'leerplandoel', code} | leerplandoelpagina |

Paginatitels komen in src/lib/paginaTitel.ts (bv. ‘Lesplan · Basisonderwijs’), vóór ['/basis', …].

## 1. Lesplanpagina (LesplanScherm)

**Kop**
- De h1 is de letterlijke Heading1: ‘Lesplan LP0065 Dieren classificeren (2,5-4 jaar)’, met de lampstreep.
- Onderregel: ‘Wetenschap en techniek · Biologie van organismen › Fauna: classificeren · 2,5-4 jaar (meestal instapklas en 1ste kleuterklas)’.
- Kruimelpad: Lesplannen › 2,5-4 jaar › Wetenschap en techniek › lessenlijn.

**Bronkader** (GoBronvermelding), direct onder de h1: ‘Bron: GO! onderwijs van de Vlaamse Gemeenschap · lesplan LP0065 · GO! studio · letterlijk overgenomen met toestemming · ingelezen op 9 november 2026’. ‘GO! studio’ is een externe link via webUrl (src/lib/veiligeUrl.ts).

**‘In het kort’** (h2). Dit deel is afgeleid: het toont alleen letterlijke stukken, telkens met een link naar hun plaats in het lesplan.
- De leerplandoelen: code, [kennisverwerking], tekst en leeftijden. Hun minimumdoelen staan als chips (‘Einde kleuter 3.1.2’ → doelpagina), of ‘zonder minimumdoel’.
- De ik-doelen per diploma.
- Het lesverloop: de 5 of 6 stappen met de tekst uit de kolom Wat?, elk met een link naar de stap.
- ‘Materiaal’, met het aantal regels.
- Later ook ‘Aanbod in Boosterz’, maar alleen als er een aanbod is (geen lege kopjes, H5).

**Het lesplan zelf**, volledig en in de volgorde van de bron.
- Elk deel krijgt een h2 met zijn letterlijke kop. Heading3 en Heading4 worden h3 en h4.
- Tabellen zijn echte tabellen: th scope=col voor de koprij, th scope=row voor Kennis, Leskern …, en rowSpan voor Leskern.
- Op 760 px of smaller wordt elke rij een kaart, met ‘Inhoud (Wat?)’ en ‘Didactiek (Hoe?)’ als label boven de cel. role=table/row/cell houdt het een tabel voor een schermlezer.
- Tekst in Atkinson op 16 px, hoogstens 72 tekens per regel.

**Navigeren**
- Een balk ‘Ga naar’: Wat moet de leraar weten, Doelen, Samenhang, Lesopbouw, Trainen, Materiaal.
- ?stap=3 springt naar die stap. In een hash-router is een anker een route, dus de focus wordt zelf gezet, op de kop van de stap (zoals de skip-link in BasisSchil).
- Een vette code van een bestaand leerplandoel in de tekst (bv. ‘WT.229’ achter een schakel) wordt een link naar dat doel. De tekst zelf verandert niet.

**Printstijl** (@media print): geen kop en geen navigatie, zwart op wit. Leerkrachten drukken een lesplan af.

## 2. Leerplandoelpagina (LeerplandoelScherm)

- Bovenaan het rubriekpad: onderwerp › subthema › rubriek › subrubriek.
- h1 ‘Leerplandoel WT.086’, de tekst groot, badges voor kennisverwerking en leeftijden.
- ‘Inhoud’, letterlijk: de MIA-blokken (titel en items), de te hanteren begrippen met hun leeftijden, de voorbeelden en de voetnoten.
- ‘Minimumdoelen’: de vijf standen uit het veld koppeling. De tekst van het minimumdoel komt uit de API, via laadSet en useSetBestanden.
- ‘Vlaggen en schakels’.
- ‘Lesplannen met dit doel’, met de ik-doelen per diploma uit die lesplannen.
- De bron.

## 3. Leerplandoelen per vak en leeftijd (LeerplandoelenScherm)

- h1 ‘Leerplan van het GO!: wetenschap en techniek’.
- LeeftijdKiezer: 9 pillen met aria-pressed. Standaard staat de groep van het bewaarde leerjaar aan.
- RubriekenLijst per onderwerp.
- Elk onderwerp een h2, elk subthema een h3, elke rubriek een h4. Een subrubriek wordt een vette tussenregel, geen h5, zodat de kopstructuur bruikbaar blijft.
- Elk doel: code, kennisverwerking, tekst, chips voor de minimumdoelen en het aantal lesplannen.
- Een filter ‘zonder minimumdoel’.
- Laadt één leerplanbestand: WT ±0,5 MB (±66 kB gzip), WI ±0,8 MB (±82 kB gzip). Dat is een ordegrootte uit de verkenning.

## 4. Bij het doel (DOEL_DELEN)

- Na ‘wanneer’ komt een regel { id: 'go', kop: 'Leerplan van het GO!', Deel: GoBijDoel }.
- GoBijDoel is een klein omhulsel met React.lazy en Suspense (fallback null). Het laadt bij-minimumdoel/<doel.vak>.json en de index. Is er niets, dan rendert het null (H5).
- Inhoud: ‘Het leerplan van het GO! koppelt deze leerplandoelen aan dit minimumdoel’, gegroepeerd per vakdiscipline, met bij elk doel de lesplannen (code, titel, leeftijd).
- Meer dan 6 in een groep: een details-blok ‘Toon alle n’.
- Op de tweelingpagina in het buitengewoon onderwijs (zelfde nummer) staat hetzelfde deel (vraag 6).

## 5. Per leerjaar

- LeerjaarScherm krijgt een blok ‘Van het GO!’ (h2) met:
  - ‘Leerplandoelen voor 2,5-4 jaar: n in 12 vakdisciplines’;
  - alleen als er zijn: ‘Lesplannen voor 2,5-4 jaar: 8 (wetenschap en techniek)’;
  - telkens een link.
- Het blok laadt alleen index.json (perLeeftijd).
- LesplannenScherm toont de lijst, met dezelfde LeeftijdKiezer.

## 6. Per lessenlijn (LessenlijnScherm)

- h1 ‘Lessenlijn Biologie van organismen’.
- Een tabel zoals LeerlijnTabel: de rijen zijn de lessenreeksen, de kolommen de leeftijdsgroepen met lesplannen, de cellen de lesplannen. Nu zijn dat 2 lessenlijnen, 7 lessenreeksen en één kolom.
- Met de zin: ‘De volgorde volgt de lesplancodes; het GO! legt de volgorde van de lessen niet vast in deze gegevens.’
- Een lessenlijn komt alleen uit de lesplannen, niet uit de Excel.
- De slug is de naam in kleine letters, zonder accenten.
- Een onbekende slug geeft ‘Deze lessenlijn vonden we niet’, met een link naar alle lesplannen.

## 7. Toegang

- Een vijfde item ‘GO!’ in de navigatie van BasisSchil. Die loopt op 390 px al door over twee regels.
- Een tegel op StartScherm.
- In ZoekScherm herkent de zoekvraag een leerplandoelcode (WT.086) of een lesplancode (LP0065) en toont meteen de link, zoals nu bij een doelnummer.
- Op de schermen van het GO! toont de voet ook de naamsvermelding van het GO!.

## Overal

- Eén main (BasisSchil) en één h1.
- Lamplicht-tokens en b-klassen, Fredoka voor de koppen.
- Tikdoelen van 44 px.
- 390 px breed zonder horizontaal scrollen: tabellen worden kaarten.
- Alles bedienbaar met het toetsenbord.
- Statussen altijd als tekst (badges).
- Contrast via de tokens; basisKleuren.test.ts dekt de nieuwe css-bestanden.
- Nieuwe css in src/styles/basis-lesplan.css en basis-go.css. Elke selector begint met :root[data-deel='basis'] of .b-.

## Opslag

- Er wordt niets nieuws bewaard: de bestaande keuze wf.basis.keuze.v1 volstaat.
- De bestanden komen uit public/basis/go/ via goBron.ts:
  - de index één keer;
  - leerplannen en lesplannen lui, met hoogstens enkele tegelijk in het geheugen;
  - elk bestand gevalideerd bij het laden.
- De service worker bewaart ze voor offline gebruik (‘andere eigen bestanden: netwerk eerst, cache als terugval’).

## Aanbod

Het aanbod hangt altijd aan een lesplan, nooit los. Per lesplan komt er een manifest dat per onderdeel zegt:
- welke stap van de leskern, welke activiteit van ‘Trainen’ of de vastlegging het ondersteunt;
- voor welke leerplandoelen het is.

De minimumdoelen volgen uit de koppeling. Ze worden niet opnieuw opgeschreven.

```ts
// public/basis/aanbod/<lesplancode>.json (pakket A2)
export interface GoAanbodBestand {
  app: 'boosterz';
  kind: 'go-aanbod';
  v: 1;
  /** Het lesplan waarop dit steunt. Wijkt de sha256 af, dan toont de app 'na te kijken'. */
  lesplan: { code: string; sha256: string };
  onderdelen: {
    id: string;
    soort: 'digibord' | 'oefening' | 'materiaal';
    titel: string;
    /** trainen: de titel letterlijk uit deel 5. */
    steunt: { stappen?: (1 | 2 | 3 | 4 | 5 | 6)[]; trainen?: string[]; vastlegging?: true };
    /** Leerplandoelen uit deel 2 van dat lesplan. */
    doelen: string[];
    /** Zo zie je dat het lukt. */
    bewijs?: string;
    /** Configuratie in public/basis/aanbod/<code>/<id>.json. */
    widget?: { type: WidgetTypeId; bestand: string };
  }[];
}
```

**Wat de validator eist:**
- elke stap bestaat in het lesplan (LP0014b heeft geen stap 6);
- elke titel uit ‘Trainen’ staat letterlijk in deel 5;
- elke doelcode staat in deel 2 van dat lesplan.

**Waar het aanbod zichtbaar wordt:**
- Op de lesplanpagina komt ‘Aanbod in Boosterz’ in ‘In het kort’.
- Bij elke stap staat een korte verwijzing, bv. ‘Op het bord: Dierenhok en plantentuin’.
- Een knop ‘Zet in mijn oefeningen’ zet de oefeningen in een eigen map, zoals installExampleCourse (src/lib/examples.ts). Het GO!-leerplan wordt hun curriculumId (alsLeerplan.ts).

**Het lesplan blijft de baas.** Het aanbod vervangt geen enkele fysieke stap, het vult aan. De lesplannen vragen zelf om ‘concrete en herkenbare materialen’ en om handelend leren. De Lichtkamer is de ondergrens voor het digibord-deel (eigenaar, 2 november 2026).

## Uitgewerkt voorbeeld: LP0065 Dieren classificeren (2,5-4 jaar)

**Waarom dit lesplan:**
- De kern is sorteren en koppelen (dier of plant, dier en eten). Dat werkt goed op een bord.
- Er is geen gevoelige thuissituatie. LP0001 vraagt daar zelf voorzichtigheid voor.
- Het toont twee soorten doelen: WT.001 en WT.028 → KO 3.1.2 (92590), en WT.008 zonder minimumdoel.
- WT.028 staat ook in LP0074. Het digibord-deel komt daar terug, met planten.

**Leerplandoelen** (letterlijk uit het lesplan):
- WT.001 [begrijpen] Herkennen het organisme dier.
- WT.008 [begrijpen] Herkennen de belangrijkste voedingswijze van dieren. MIA — Dieren: zoogdieren, vogels, vissen, insecten.
- WT.028 [gebruiken] Onderscheiden dieren en planten.

**Minimumdoel:** ODS_3410 3.1.2 (92590): ‘De kleuters kunnen: organismen beschrijven op basis van waarneembare kenmerken; fauna beschrijven op basis van voortplantingswijze.’

| Onderdeel | Soort in Boosterz | Steunt | Doelen |
|---|---|---|---|
| 1. Dierenhok en plantentuin (digibord) | nieuw digibord-deel, een diorama op het niveau van de Lichtkamer (details hieronder) | stap 2 (voorkeursinstructie: kenmerken en verbanden), stap 3 (terugkoppelen: de twee hoepels en het voedselprentje), stap 5 (kort herhalen) | WT.001, WT.028, WT.008 |
| 2. Zoek de dieren | hotspot in de modus ‘quiz’, of een quiz met het vraagtype imagepoint: een tekening van een speelplaats of kinderboerderij, de kinderen tikken de dieren aan. De opdracht wordt voorgelezen | stap 1 (verkennen, als er geen echte dieren te zien zijn; het lesplan noemt zelf ‘foto’s, filmpjes’), trainen ‘De dierenzoektocht’ | WT.001 |
| 3. Wie heeft honger? | memory met prentjes (MemoryPair heeft aImage en bImage, src/lib/types.ts:347): dier en zijn eten | trainen ‘Wie heeft honger?’ en ‘Het hongerige dier’ | WT.008 |
| 4. Dier of plant? in de hoek | sorteren met prentjes op een gedeeld toestel: de hoekstand van onderdeel 1 (zelfde diorama, één kind, groot en voorgelezen), zie hieronder | stap 4 (begeleid inoefenen in een klein groepje), trainen ‘Dierenmand en plantenmand’ | WT.028 |
| 5. Onze W&T-hoek | tip-tegels (TipTile heeft imageUrl, :488) met de dieren en planten van de les, op het bord of in de hoek | vastlegging (‘fotokaarten van verschillende dieren naast planten’) | WT.001, WT.028 |
| 6. Materiaal om af te drukken | een afdrukpagina met fotokaarten (dieren, planten, voedsel), twee bordjes ‘het dierenhok’ en ‘de plantentuin’ en een sorteermat in A3. Deel 6 van het lesplan blijft als afvinklijst ernaast | stap 3 en 4, vastlegging | — |

**Onderdeel 1 in detail.** Een grasveld met twee hoepels (het dierenhok en de plantentuin) en een doos. Uit de doos komt telkens één dier of één plant: schaap, kat, kip, goudvis, mier; gras, tuinkers, bonenplant, prei. Dat zijn de voorbeelden uit stap 1 en 2.
- De klas voorspelt eerst: dier of plant? Daarna zet een kind of de leerkracht het in een hoepel. Pas dan antwoordt de scène: het dier beweegt, bij de plant verschijnt de aarde.
- Knoppen ‘Toon de poten’, ‘Toon de kop’ en ‘Toon de aarde’ steunen het hardop denken.
- Ronde 2, ‘Wat eet het?’: bij elk dier kiest de klas een voedselprentje (gras, zaadjes, vis, vlees) en hoort het woord ‘plant’ of ‘vlees’.
- Alles wordt voorgelezen. De scène is prikkelarm, werkt met knoppen en het toetsenbord, en elke stand staat ook in tekst.
- Op het bord wordt niets bewaard.

**Waarom niet de quiz voor onderdeel 4.** De quizvraag ‘sort’ kent alleen tekst per item (SortQuestion, src/lib/types.ts:288-292), en het koppelspel ook (PairsConfig, :352). Voor kinderen die niet lezen volstaat dat niet. De quiz uitbreiden raakt ook het secundair; de hoekstand van het diorama doet dat niet.

**Wat niet op een scherm komt, en zo blijft:**
- stap 1 met echte dieren en planten;
- stap 5 (handgebaren);
- stap 6 (speelhoek, een kinderboerderij nabouwen);
- de activiteiten ‘Het restaurant voor dieren’, ‘Voer de vogel!’ en ‘Het hongerige dier’ als rollenspel.

De lesplanpagina zegt dat zo, met een link naar de letterlijke tekst.

## Bewijs en voorlezen

**Bewijs.** Het bord bewaart niets (AANMELDEN-ontwerp, ‘Op het bord’). In de hoek legt het toestel per kind bewijs vast op de GO!-code. WT.008 heeft geen minimumdoel. Het bewijsmodel van bouwstap 4 moet dus naast het vaste nummer van een minimumdoel ook een GO!-code als sleutel aankunnen.

**Voorlezen** gebeurt met opgenomen geluid (bouwpakket 16). Tot dan gebruikt de quiz de stem van het toestel waar die er is; anders leest de leerkracht voor.

## Hergebruik in de reeks

- Hetzelfde diorama met een andere set: LP0074 ‘De grote natuurmand’, en ‘Voed de plant’ met water en licht voor WT.057.
- Voor de volgordes van LP0001 (buik → baby → peuter) en LP0094 (zaad → kiemen → plant): de tijdlijn (TimelineEvent heeft imageUrl, modus ‘exercise’) of framesequence.

## Pakketten

### G0. Ontwerp en stand van zaken vastleggen

Agent: hoofdsessie (opus).

Het ontwerp komt in een eigen document met bovenaan de tabel ‘Stand van zaken’. Daarbij:
- de rij over fase 3 in BASISONDERWIJS.md bijwerken;
- in INGANG.md bij ‘Later’ verwijzen naar het nieuwe document;
- in CLAUDE.md één regel toevoegen.

De commit komt pas na de beslissing van de eigenaar over dit ontwerp.

Bestanden: `docs/basisonderwijs/GO-LEERPLAN.md`, `docs/BASISONDERWIJS.md`, `docs/basisonderwijs/INGANG.md`, `CLAUDE.md`

### G1. Gegevensmodel, leeftijden en validator

Agent: kernbouwer (opus).

De types uit het veld gegevensmodel, letterlijk overgenomen.

leeftijden.ts bevat:
- de 9 groepen;
- de leesbril naar K1-L6, met zekerheid ‘waarschijnlijk’ en de teksten;
- leeftijdVanLeerjaar.

valideer.ts bevat valideerGoIndex, valideerGoLeerplan, valideerGoLesplan en valideerGoBijMinimumdoel. Ze zijn strikt: een onbekend veld is een fout, wijzers moeten bestaan en er mag geen e-mailadres of telefoonnummer in staan.

Tests met kleine fixtures, als tekst in het testbestand.

Poort: npm run lint, npm run typecheck, npx vitest run.
Niet aanraken: curriculum*.ts, minimumdoelen*.ts en alles buiten src/lib/basis/go/.

Bestanden: `src/lib/basis/go/types.ts`, `src/lib/basis/go/leeftijden.ts`, `src/lib/basis/go/leeftijden.test.ts`, `src/lib/basis/go/valideer.ts`, `src/lib/basis/go/valideer.test.ts`

### G2. Ophalen en uitlezen van docx en xlsx (Python, alleen de standaardbibliotheek)

Agent: bouwer (sonnet).

Te maken:
- decodeer.py: van tool-uitvoer naar het bestand en manifest.json;
- lees_docx.py en lees_xlsx.py: neutrale ruwe JSON. lees_docx.py krijgt ook --tekst;
- veilig_zip.py: padcontrole, limieten en weigeren van DOCTYPE en ENTITY;
- een werkmap binnen de repo weigeren;
- uit core.xml alleen de dcterms-datums lezen;
- unittests die zelf een kleine docx en xlsx bouwen;
- LEESMIJ.md met de stappen per reeks.

Poort:
- python3 -I -m unittest discover -s tools/basis/go;
- op de 8 docx-bestanden en de 12 xlsx-bestanden in de werkmap van de scratchpad geven de tellingen hetzelfde als de verkenners: alinea’s, tabellen, lijstalinea’s en beelden per lesplan, en rijen per TYPE.

Niet aanraken: src/, public/.

Bestanden: `tools/basis/go/veilig_zip.py`, `tools/basis/go/decodeer.py`, `tools/basis/go/lees_docx.py`, `tools/basis/go/lees_xlsx.py`, `tools/basis/go/test_lees.py`, `tools/basis/go/LEESMIJ.md`

### G3. Omzetten, koppelen, vorm en rondgang

Agent: kernbouwer (opus).

Te bouwen:
- vorm.ts: de verwachte vorm, als gegevens;
- omzetten.ts: ruwe JSON naar de bestanden van G1;
- koppelen.ts: moment + code naar MinimumdoelRef, via basisSet en setsVanVak;
- rondgang.ts: de tekst vergelijken;
- maak.ts (vite-node): exitcodes 0, 1 en 3, het rapport, een ongewijzigd bestand niet herschrijven, en --aanvaard-wijzigingen;
- toon.ts: een tekstweergave voor de nakijker;
- bekende-afwijkingen.json: de afwijkingen die nu gekend zijn, met reden.

De controles staan in het veld import.

Poort:
- lint, typecheck en vitest;
- npx vite-node tools/basis/go/maak.ts --werkmap <scratchpad> --uit <scratchpad>/uit geeft exit 0, met 4972 van 4973 koppelingen en 8 van 8 rondgangen gelijk.

Niet aanraken: public/ (de echte import is G4), curriculum*.ts, minimumdoelen*.ts.

Bestanden: `src/lib/basis/go/vorm.ts`, `src/lib/basis/go/omzetten.ts`, `src/lib/basis/go/omzetten.test.ts`, `src/lib/basis/go/koppelen.ts`, `src/lib/basis/go/koppelen.test.ts`, `src/lib/basis/go/rondgang.ts`, `src/lib/basis/go/rondgang.test.ts`, `tools/basis/go/maak.ts`, `tools/basis/go/toon.ts`, `tools/basis/go/bekende-afwijkingen.json`

### G4. Eerste import en de lijst voor het GO!

Agent: hoofdsessie (opus), met klusjes (haiku) voor tellingen.

De ketting draaien op de 20 bestanden van 9 november. Het rapport lezen en de afwijkingen bewust beslissen.

De lijst met fouten in de bron schrijven, voor de eigenaar (vraag 4).

Het volledige leerplan gaat pas in public/ na het antwoord op vraag 1. Tot dan:
- de lesplannen;
- de omgekeerde index;
- de doelen uit de lesplannen.

De tellingen laat de hoofdsessie nakijken door klusjes (haiku).

Bestanden: `public/basis/go/index.json`, `public/basis/go/leerplan/`, `public/basis/go/bij-minimumdoel/`, `public/basis/go/lesplannen/`, `docs/basisonderwijs/go-bronfouten.md`, `tools/basis/go/bekende-afwijkingen.json`

### G5. Tests op de meegeleverde gegevens

Agent: bouwer (sonnet), een andere agent dan G3.

Te schrijven door een andere agent dan die van G3.

goBestanden.test.ts loopt altijd en hard:
- valideer* geeft niets;
- elke sha256 klopt;
- de bestanden passen bij elkaar.

go.echt.test.ts staat bovenaan src/lib/basis, zodat de glob van de maandelijkse ophaling hem vindt:
- slaat over met GEGEVENSRUN=1, volgens het patroon van momentmodel.echt.test.ts;
- elke ref bestaat nog in public/leerplannen/minimumdoelen, met dezelfde code;
- elke tweeling heeft hetzelfde nummer;
- aantallen alleen achter de momentopname-wacht.

minimumdoelenWorkflow.test.ts blijft groen, zonder dat het aangepast wordt.

Poort: npx vitest run.

Bestanden: `src/lib/basis/go/goBestanden.test.ts`, `src/lib/basis/go.echt.test.ts`

### G6. Nakijken tegen het origineel (twee rondes)

Agent: 2 × nakijker (sonnet), rechter (opus).

Ronde 1, na G4: de tekstweergave van toon.ts naast lees_docx.py --tekst.

Ronde 2, na G8: de zichtbare tekst van de pagina (tests/basis/go-tekst.mjs) naast het origineel.

Twee nakijkers, elk 4 lesplannen. Daarnaast een steekproef van 43 leerplandoelen tegen de Excel.

De nakijkers rapporteren alleen, in de scratchpad. Bij twijfel beslist de rechter. De hoofdsessie herstelt het script of het scherm, nooit het JSON-bestand met de hand.

Bestanden: 

### G7. Laden, model en adressen

Agent: bouwer (sonnet).

goBron.ts:
- laadGoIndex, laadGoLeerplan, laadGoLesplan en laadGoBijMinimumdoel;
- een strikt patroon voor elke bestandsnaam;
- valideren bij het laden;
- een kleine cache, zoals laadSet.

goModel.ts bevat zuivere selectors: lesplannen per leeftijd, lessenlijnen en slugs, het rubriekpad, de leerplandoelen bij een minimumdoel en de ik-doelen van een doel.

useGo.ts: de hooks.

Nieuwe schermen in basisRoutes, met de test op de rondgang. Paginatitels.

Poort: lint, typecheck, vitest, build. Het bundelbudget blijft ongewijzigd.
Niet aanraken: App.tsx en EAGER_ICON_NAMES.

Bestanden: `src/lib/basis/go/goBron.ts`, `src/lib/basis/go/goBron.test.ts`, `src/lib/basis/go/goModel.ts`, `src/lib/basis/go/goModel.test.ts`, `src/components/basis/useGo.ts`, `src/lib/basis/basisRoutes.ts`, `src/lib/basis/basisRoutes.test.ts`, `src/lib/paginaTitel.ts`

### G8. Lesplanpagina

Agent: bouwer (sonnet).

LesplanScherm, lui geladen. De opbouw staat in het veld inDeApp: de h1 letterlijk, het bronkader, ‘In het kort’, de volledige tekst, ‘Ga naar’, ?stap en een printstijl.

GoTekst rendert Stuk, Regel en Blok, met echte tabellen die op 760 px of smaller kaarten worden.

Iconen met een zichtbaar woord erbij, uit goIconen.ts.

Componenttests in een .test.ts-bestand: vitest leest alleen src/**/*.test.ts.

Poort: lint, typecheck, vitest en build. Het BasisDeel-chunk blijft onder 80 kB.

Bestanden: `src/pages/basis/LesplanScherm.tsx`, `src/components/basis/go/GoTekst.tsx`, `src/components/basis/go/GoBronvermelding.tsx`, `src/components/basis/go/goIconen.ts`, `src/components/basis/go/goComponenten.test.ts`, `src/styles/basis-lesplan.css`, `src/pages/basis/BasisDeel.tsx`

### G9. Schermen van de leerplandoelen

Agent: bouwer (sonnet).

GoScherm: het overzicht met 12 vaktegels.

LeerplandoelScherm toont de MIA, de begrippen met hun leeftijden, de voorbeelden, de koppeling in vijf standen met de tekst uit de API, de vlaggen en schakels, en de lesplannen met hun ik-doelen.

LeerplandoelenScherm heeft LeeftijdKiezer, RubriekenLijst en een filter ‘zonder minimumdoel’.

Iconen voor BU, LL en SV in vakIconen.ts.

G9 komt na G8: BasisDeel.tsx krijgt in elk pakket één regel.

Poort: lint, typecheck, vitest en build.

Bestanden: `src/pages/basis/GoScherm.tsx`, `src/pages/basis/LeerplandoelScherm.tsx`, `src/pages/basis/LeerplandoelenScherm.tsx`, `src/components/basis/go/KoppelingLijst.tsx`, `src/components/basis/go/MiaBlok.tsx`, `src/components/basis/go/LeeftijdKiezer.tsx`, `src/components/basis/vakIconen.ts`, `src/styles/basis-go.css`, `src/pages/basis/goSchermen.test.ts`, `src/pages/basis/BasisDeel.tsx`

### G10. Bij het doel, per leerjaar, per lessenlijn, zoeken en toegang

Agent: bouwer (sonnet).

GoBijDoel is lui en komt in DOEL_DELEN, na ‘wanneer’. Is er niets, dan rendert het null. Meer dan 6 in een groep: een details-blok.

Op LeerjaarScherm komt een blok ‘Van het GO!’.

Nieuwe schermen: LesplannenScherm en LessenlijnScherm.

Toegang:
- een tegel op StartScherm;
- het item ‘GO!’ in de navigatie van BasisSchil;
- de voet met de naamsvermelding van het GO!;
- in ZoekScherm de codes WT.086 en LP0065 herkennen.

Bestaande tests uitbreiden, niet herschrijven.

Poort: lint, typecheck, vitest en build.

Bestanden: `src/components/basis/go/GoBijDoel.tsx`, `src/pages/basis/DoelScherm.tsx`, `src/pages/basis/LeerjaarScherm.tsx`, `src/pages/basis/LesplannenScherm.tsx`, `src/pages/basis/LessenlijnScherm.tsx`, `src/pages/basis/StartScherm.tsx`, `src/components/basis/BasisSchil.tsx`, `src/pages/basis/ZoekScherm.tsx`, `src/pages/basis/doelenSchermen.test.ts`, `src/styles/basis-go.css`

### G11. Rooktest

Agent: bouwer (sonnet), een andere agent dan G8-G10.

Een eigen module met een losse uitvoerder, zoals tests/basis/ingang-los.mjs. Checks:
- per lesplan één h1 en geen horizontaal scrollen op 390 px;
- de tabel wordt een kaart;
- ?stap=3 zet de focus;
- de doelpagina ODS_3410/92929 toont WT.086 en LP0001;
- WT.008 toont ‘koppelt dit doel aan geen enkel minimumdoel’;
- K1 toont het blok ‘Van het GO!’;
- de printstijl.

go-tekst.mjs schrijft de tekst per deel voor G6.

De aanroep komt in smoke.mjs.

Poort: build, preview op 4173 (stoppen met kill op de pid) en de losse uitvoerder. Daarna één keer smoke.mjs.

Bestanden: `tests/basis/go.mjs`, `tests/basis/go-los.mjs`, `tests/basis/go-tekst.mjs`, `tests/smoke.mjs`

### G12. Review vanuit drie invalshoeken

Agent: 3 × reviewer (sonnet), rechter (opus).

(a) Eerlijkheid tegenover de bron:
- de tekst is letterlijk;
- de stand van elke koppeling klopt;
- geen bewering over leeftijd of leerjaar die het GO! niet doet;
- de tekst van een minimumdoel komt alleen uit de API;
- de bron staat bij elk lesplan en elk leerplandoel.

(b) Toegankelijkheid, taal, tikdoelen van 44 px, 390 px, contrast en tabellen voor de schermlezer.

(c) Het leerlingpad, de bundel, de opslag, het secundair (onaangeroerd), privacy (geen metadata en geen namen) en de veiligheid van het uitlezen.

De rechter bevestigt of weerlegt. Alleen bevestigde bevindingen worden opgelost.

Bestanden: 

### G13. Integratie en commit

Agent: hoofdsessie (opus).

De volledige poort draaien, met de rooktest.

De stand van zaken bijwerken in GO-LEERPLAN.md en BASISONDERWIJS.md. In CLAUDE.md één regel.

Committen op claude/bookwidgets-web-app-kvcfim, pas na de antwoorden op vraag 1 en 2.

Bestanden: `docs/basisonderwijs/GO-LEERPLAN.md`, `docs/BASISONDERWIJS.md`, `CLAUDE.md`

### A1. Begrippen van het leerplanconcept uit de kenniskaarten

Agent: hoofdsessie (opus), nakijker (sonnet).

De kenniskaarten in dezelfde map lezen, op hun id. Ze leggen waarschijnlijk uit wat MIA, vlag, schakel, kennisverwerking en diploma betekenen.

De uitleg komt er letterlijk in, met de bron. Daarna toont de app de uitleg op de leerplandoelpagina en de lesplanpagina. Tot dan staan die woorden er zonder uitleg.

De nakijker kijkt na tegen het origineel.

Bestanden: `public/basis/go/begrippen.json`, `src/lib/basis/go/valideer.ts`, `docs/basisonderwijs/GO-LEERPLAN.md`

### A2. Aanbodmodel, ‘Gebruik als leerplan’ en installeren

Agent: kernbouwer (opus).

GoAanbodBestand, met een validator die eist:
- stappen die bestaan;
- titels uit ‘Trainen’ die letterlijk in het lesplan staan;
- doelen uit deel 2.

Is de sha256 van het lesplan veranderd, dan staat het aanbod op ‘na te kijken’.

alsLeerplan.ts maakt van een GO!-selectie een Curriculum (net ‘go’, methode ‘export’). curriculum.ts wordt alleen aangeroepen, niet gewijzigd.

aanbodInstalleren.ts zet de oefeningen in een eigen map, volgens het patroon van examples.ts.

Op de lesplanpagina komt de sectie ‘Aanbod in Boosterz’.

Poort: lint, typecheck, vitest en build.

Bestanden: `src/lib/basis/go/aanbod.ts`, `src/lib/basis/go/aanbod.test.ts`, `src/lib/basis/go/alsLeerplan.ts`, `src/lib/basis/go/alsLeerplan.test.ts`, `src/lib/basis/go/aanbodInstalleren.ts`, `src/lib/basis/go/aanbodInstalleren.test.ts`, `src/pages/basis/LesplanScherm.tsx`

### A3. Aanbod LP0065: inhoud

Agent: inhoudschrijver (opus), nakijker (sonnet), rechter (opus).

Te schrijven:
- het manifest;
- de oefeningen: hotspot of imagepoint, memory en tip-tegels;
- de afdrukpagina;
- de beeldenlijst, met bron en licentie;
- de inspreeklijst, in kindertaal.

Alles hoort bij de stappen en activiteiten uit het veld aanbod.

De nakijker controleert tegen de letterlijke tekst van LP0065: geen stap, doel of begrip dat er niet in staat. Bij twijfel beslist de rechter.

Wacht op vraag 8 (beelden).

Bestanden: `public/basis/aanbod/LP0065.json`, `public/basis/aanbod/LP0065/`, `public/basis/aanbod/beelden.json`, `tools/basis/aanbod/LP0065-inspreeklijst.md`

### A4. Digibord-deel ‘Dierenhok en plantentuin’

Agent: kernbouwer (opus), reviewer (sonnet), rechter (opus).

Eerst een los prototype, zoals de Lichtkamer.

Twee standen:
- het bord: de klas voorspelt eerst en pas daarna antwoordt de scène;
- de hoek: één kind, groot en voorgelezen.

Twee rondes: ‘Dier of plant?’ en ‘Wat eet het?’.

Voor allebei:
- bediening met knoppen en het toetsenbord;
- elke stand ook in tekst;
- prikkelarm;
- op het bord wordt niets bewaard;
- het werkt ook zonder 3D.

Een reviewer en de rechter beoordelen het prototype. De eigenaar keurt het goed.

Daarna komt het in de oefeningsoort van bouwstap 5.

Bestanden: `tools/prototypes/dierenhok/dierenhok.html`, `tools/prototypes/dierenhok/README.md`, `tools/prototypes/dierenhok/test.cjs`

### A5. Uitproberen in de klas

Agent: hoofdsessie (opus) en eigenaar.

Met de klas uit vraag 9. Een spiekkaart voor de leerkracht, gekoppeld aan de stappen van LP0065.

We noteren wat werkt, wat niet werkt en wat de kinderen tonen. De bevindingen gaan naar het ontwerpdocument.

Bestanden: `docs/basisonderwijs/GO-LEERPLAN.md`

## Risico's

- Beeld met kinderen in ondergoed (de mindmap in LP0014a en LP0014b). Op een openbare site raakt dat aan privacy en gepastheid. Of de foto’s gegenereerd zijn, is onzeker. Aanpak: standaard weglaten, met een zichtbare zin op die plaats (vraag 2).
- Reikwijdte van het akkoord. De map mag gebruikt worden, en ‘openbaar’ is bevestigd voor de lesplannen, niet uitdrukkelijk voor het volledige leerplan (3490 doelen). Aanpak: het volledige leerplan pas na vraag 1 in public/; tot dan alleen de lesplannen en de koppeling.
- Fouten in de bron worden letterlijk getoond (‘Kjk’, ‘klind’, WT.008 met twee teksten, 18 kapotte vlaggen en schakels). Een leerkracht kan denken dat de fout van Boosterz komt. Aanpak: ‘letterlijk overgenomen’ in het bronkader en een lijst voor het GO! (vraag 4).
- Een nieuwe versie van de Excel kan een code stil een andere betekenis geven: de bron heeft geen versienummer. Aanpak: een wijzigingsrapport en de stopregel --aanvaard-wijzigingen. Het aanbod staat vast op de sha256 van het lesplan.
- De maandelijkse ophaling van de minimumdoelen kan een koppeling breken (een doel verdwijnt of krijgt een andere code). go.echt.test.ts meldt dat in de pull request. Na het samenvoegen houdt hij de uitrol tegen tot de import opnieuw draait, zoals bij de andere echte-gegevenstests. De app toont zo’n koppeling zonder fout als ‘niet meer in de officiële gegevens’.
- Een leeftijd kan gelezen worden als een leerjaar dat het GO! zelf noemt. Aanpak: overal eerst de leeftijd van het GO!, daarna ‘meestal’ en een badge ‘waarschijnlijk’. Een koppeling wordt nooit uit een leeftijd afgeleid.
- Bundel: het BasisDeel-chunk weegt al 59,4 van de 80 kB. Aanpak: elk nieuw scherm en GoBijDoel lui laden; de rooktest en de build meten het; geen nieuwe iconen op het leerlingpad.
- Gegevens op een Chromebook: een leerplanbestand weegt tot ±0,8 MB (WI, ±82 kB gzip). Aanpak: per vak lui laden, met cache in de service worker. De doelpagina laadt alleen bij-minimumdoel/<vak>.json, niet het hele leerplan.
- Lange letterlijke lesplannen: ±19.000 tot 42.000 tekens, met tabelcellen tot 95 alinea’s (LP0014b). Op 390 px wordt dat moeilijk lezen. Aanpak: ‘In het kort’, ‘Ga naar’ en ?stap, tabellen als kaarten, en een rooktest per lesplan op horizontaal scrollen.
- Iconen dragen betekenis, maar hebben geen alt-tekst. Een verwisseling van vlag en schakel ziet een tekstvergelijking niet. Aanpak: iconen tellen per soort en vergelijken met de kolommen VLAGGEN en SCHAKELS van de Excel; de nakijker kijkt het na; in de app staat altijd een zichtbaar woord bij het icoon.
- Volgende reeksen (4-5 jaar, het lager, andere vakken) kunnen een andere vorm hebben: andere stapnamen of tabellen. De import stopt dan met opzet (exit 3), en de hoofdsessie past vorm.ts bewust aan. Dat kost een sessie per nieuwe vorm.
- Twee talen in de keten: Python leest, TypeScript beslist. Een verschil in de omgang met NBSP of regeleinden kan tekst ongemerkt veranderen. Aanpak: de rondgang vergelijkt exact; de uitvoer van Python bevat geen interpretatie en wordt alleen als JSON gelezen.
- Onveilige invoer van de Drive: een zip-bom of XML-entiteiten. Aanpak: veilig_zip.py met limieten, weigeren van DOCTYPE en ENTITY, python3 -I, een aparte werkmap buiten de repo, en een werkmap binnen de repo weigeren.
- Persoonsgegevens via metadata: in de xlsx staan namen van makers in core.xml. Aanpak: alleen de dcterms-datums lezen; een strikte validator die onbekende velden weigert; een zoektocht naar e-mailadressen en telefoonnummers; Drive-id’s nooit in public/.
- Woorden zonder uitleg in de bestanden: MIA, vlag, schakel en ‘aanklikbaar’. Aanpak: letterlijk tonen, zonder zelf uitleg te verzinnen, tot de kenniskaarten gelezen zijn (A1).
- Voor 2,5-4 jaar zijn de quizvraag ‘sort’ en het koppelspel niet bruikbaar: ze hebben alleen tekst per item. Aanpak: de hoekstand van het diorama, niet de quiz uitbreiden (die raakt het secundair). Voorlezen hangt af van bouwpakket 16.
- Te veel scherm voor kleuters. Aanpak: het aanbod vult de fysieke stappen aan en vervangt ze niet (stap 1, 5 en 6 en de rollenspelen blijven zonder scherm). Het bord bewaart niets.
- Het bewijs per kind (bouwstap 4) sleutelt nu op het vaste nummer van een minimumdoel. WT.008 en 467 andere GO!-doelen hebben er geen. Het bewijsmodel moet dus ook een GO!-code als sleutel aankunnen, anders valt dat bewijs weg.

## Vragen aan de eigenaar

- Mag het volledige leerplan van het GO! openbaar? Je akkoord dekt de lesplannen op de openbare site en in de openbare repo. Het volledige leerplan is meer: alle 3490 leerplandoelen uit de 12 doelensets, met hun inhoud en voorbeelden. Voorstel: ja, met dezelfde bronvermelding als bij de lesplannen. Is het nee, dan zetten we alleen online welke minimumdoelen bij elk leerplandoel horen, plus de doelen die in een lesplan staan.
- De mindmap ‘Mijn lichaam’ in LP0014a en LP0014b toont foto’s van kinderen, deels in ondergoed. Mag dat beeld openbaar? Voorstel: nee, tot het GO! bevestigt dat de foto’s gegenereerd of vrijgegeven zijn. Tot dan staat er op die plaats een korte zin, en blijft de rest van het lesplan volledig.
- Welke bronvermelding wil het GO! bij elk lesplan? En kan je één link naar een lesplan in GO! studio doorsturen? Dan kennen we de vorm van zo’n link. Voorstel voor de zin: ‘Bron: GO! onderwijs van de Vlaamse Gemeenschap, lesplan LP0065 (GO! studio). Letterlijk overgenomen met toestemming.’ Tot we het weten, linken we naar https://studio.g-o.be/.
- In de bron van het GO! zitten fouten. Een paar voorbeelden: tikfouten zoals ‘Kjk’ en ‘klind’; doel WT.008 heeft in LP0065 een andere tekst dan in het leerplan; bij MV.040 staat code ‘6.12’; in geschiedenis zijn rijen verschoven; 18 kapotte vlaggen en schakels; 178 koppelingen met een moment dat niet bij de leeftijd past. Wij nemen alles letterlijk over en maken er een lijst van. Wil jij die lijst aan het GO! bezorgen? Voorstel: ja, in één document na de eerste import.
- Soms klopt een code in het leerplan niet, maar lijkt duidelijk wat bedoeld is. Nu is dat één keer zo: bij MV.040 staat ‘6.12’, waarschijnlijk is 6.1.2 bedoeld. Tonen we ons voorstel met de vermelding ‘voorstel, nog niet bevestigd door het GO!’, of tonen we niets tot het GO! antwoordt? Voorstel: tonen, met die vermelding.
- Het buitengewoon basisonderwijs heeft dezelfde minimumdoelen, met hetzelfde nummer. Tonen we de leerplandoelen en lesplannen van het GO! ook bij die doelen in het buitengewoon? Voorstel: ja. We zeggen er niets bij over voor welk onderwijs het GO! zijn leerplan schrijft.
- Mogen we voor de volgende reeksen in een sessie de inhoud van die ene Drive-map oplijsten, en alleen die map? Dan hoef je niet telkens de id’s door te geven. Voorstel: ja, op voorwaarde dat er alleen materiaal van het GO! in die map staat. En als het GO! een doelenset bijwerkt: vervang het bestand in de map, liefst als nieuwe versie van hetzelfde bestand.
- Waar komen de beelden voor het aanbod vandaan (dieren, planten, voedsel)? De lesplannen vragen zelf om diversiteit. Voorstel: tekeningen in één vaste stijl, gemaakt of besteld door de scholengroep, met een licentie per beeld. Geen foto’s van herkenbare kinderen.
- Wie probeert het eerste aanbod (LP0065) uit? De proefklas is een 3de leerjaar, maar deze reeks is voor 2,5-4 jaar. Voorstel: een instapklas of 1ste kleuterklas van dezelfde school, alleen op het digibord, met de laptop van de leerkracht.

## Oordeel van de rechter (gaat voor op het ontwerp)

Het ontwerp staat er grotendeels. Ik heb het nagerekend op de 8 docx-bestanden en de 12 xlsx-bestanden in (scratchpad van de ontwerpsessie, niet bewaard) go-lesplannen/, met eigen scripts. Die staan in (scratchpad van de ontwerpsessie, niet bewaard) rechter-go/, alleen standaardbibliotheek, uitgevoerd met python3 -I. Ik heb ook de code van #/basis nagekeken.

**Over de opdrachtpunten (a) tot (i):**
- De drie lagen zijn er (i).
- De koppeling komt uit de bron. Geen enkele koppeling wordt uit een leeftijd afgeleid.
- De tekst van een minimumdoel komt alleen uit de API.
- Het leerlingpad en het secundair blijven onaangeroerd (f).
- Het voorbeeld van het aanbod (LP0065) klopt met de letterlijke tekst van het lesplan (g).

**Voorstel als officieel?** Nee. Alleen MV.040 ‘6.12’ wordt een voorstel, en dat is duidelijk zo gemarkeerd.

**Toch drie plekken waar de app iets over het GO! zou beweren dat niet klopt:**
1. Het getal 178 hoort niet bij de regel die het ontwerp zelf geeft. Met die regel zijn het er 326.
2. Bij 3 WI-doelen zou de app zeggen dat het leerplan het doel aan geen enkel minimumdoel koppelt, terwijl een MIA van dat doel wel gekoppeld is.
3. Doorgehaalde tekst in de Excel wordt meegelezen als gewone tekst. Daardoor staan 4 valse ‘fouten’ op de lijst voor het GO!.

**Andere problemen:**
- Met de controles zoals ze nu beschreven staan, zou de import op de echte bestanden stoppen. Er zijn meer afwijkingen dan de lijst bekende afwijkingen noemt.
- De omgekeerde index publiceert vóór vraag 1 al de tekst van zo'n 3022 leerplandoelen.
- De wijzers kunnen 6 activiteiten van LP0014a niet aanwijzen.

**Besluit:** de 4 punten van ernst middel verwerken vóór G1 en G3. De punten van ernst laag kunnen mee in de spec van het pakket waar ze bij horen.

### Rechtzettingen

- **[middel] 178 koppelingen met een moment buiten de leeftijden: dat getal hoort niet bij de regel in het ontwerp** Het ontwerp schrijft: ‘bij L6 zonder 10-11 of 11-12’. Met die regel reken ik 326 verwijzingen (286 doelen): KO 31, L4 94, L6 201. De 178 komt uit plausibel.py van de verkenner, dat bij L6 ook 8-9 en 9-10 goedkeurt (`lft & (L56 | {'9-10','8-9'})`). Met die soepele regel krijg ik ook precies 178. Gevolg: de test achter de momentopname-wacht en de lijst voor het GO! (vraag 4) noemen een ander getal dan de code. Ook WT.235 uit de eerste reeks (2,5-4 tot 9-10 jaar → L6 3.3.2, 92822) krijgt volgens de eigen regel ‘twijfel’; dat staat nergens. Daarnaast staat WI.706 ‘(De)monteren ruimtefiguren…’ → KO 4.2.3, een doel van aardrijkskunde (92500, ODS_3411). De koppeling noemt dit zelf een fout in de bron, maar in de app zou het zonder twijfel als officieel verschijnen. **Herstel:** De regel houden, want die volgt WERKT_NAAR in kalender.ts. Overal 178 vervangen door 326 verwijzingen en 286 doelen (in de koppeling, de risico's en vraag 4). Bij de eerste reeks vermelden dat WT.235 → L6 3.3.2 twijfel krijgt. WI.706 → 4.2.3 met reden in bekende-afwijkingen.json zetten, als twijfel ‘ander vak’.
- **[middel] ‘Zonder minimumdoel’ is onwaar voor 3 doelen: de koppeling op het niveau van een MIA wordt genegeerd** De Excel heeft 14 MIA- en voorbeeldrijen met een eigen code. Bij WI.408 (L6 2.2.7, 93310), WI.411 (L6 2.2.17, 93320) en WI.963 (L4 2.5.3, 93283) heeft de doelzin-rij zelf geen enkele code; alleen een MIA-titel van het doel is gekoppeld. Ze zitten dus in de 468 doelen ‘zonder minimumdoel’. De app zou er letterlijk zeggen ‘Het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel’, en dat zegt het GO! niet. Ook WI.610 heeft alleen via een MIA een L6-koppeling (2.3.10, 2.3.16). De doelzin zelf gaat naar L4. GoBijDoel heeft geen veld om zo'n koppeling via een MIA mee te nemen, dus de doelpagina's van 93310, 93320 en 93283 tonen die doelen niet. **Herstel:** De stand ‘zonder minimumdoel’ alleen gebruiken als noch de doelzin, noch een MIA- of voorbeeldrij van het doel een code heeft. Een eigen tekst voorzien: ‘Het leerplan koppelt een onderdeel van dit doel (MIA “Aftrekken:”) aan …’. In GoBijDoel een veld toevoegen, bijvoorbeeld `via?: 'mia'`, en die refs opnemen in bij-minimumdoel. Het aantal echt zonder minimumdoel wordt dan 465.
- **[middel] Opmaak in de Excel gaat verloren: doorgehaalde tekst en superschrift (lees_xlsx.py voegt rich text gewoon samen)** De sharedStrings.xml-bestanden hebben runs met doorhaling (BU 3, NL 1, WI 13) en superschrift (GE 3, WI 8). Bij de verkenner werd doorgehaalde tekst als echte tekst gelezen. 4 van de 28 ‘andere woorden’ zijn daardoor schijnfouten: WI KO 2.3.8 en 2.3.9 (‘(‘gewicht’)’ is doorgehaald, niet toegevoegd), WI L4 2.2.24 (‘of breuken die te vereenvoudigen zijn…’ is doorgehaald), en NL L6 1.4.2 ‘kanent’ (‘ent’ is doorgehaald). Het ontwerp noemt er drie als voorbeeld van een fout in de bron (WI 2.3.8/2.3.9 en WI 2.2.24). In gepubliceerde rijen wordt de doelzin WI.604 ‘…grillige figuur..’ getoond, met de doorgehaalde tweede punt. ‘1cm³’, ‘1dm³’, ‘cm³, dm³, m³’, ‘1cm²’ en ‘19e eeuw’ worden ‘1cm3’, ‘cm2’ en ‘19e’. In de docx-bestanden is er geen probleem: daar staan alleen b, i en u. **Herstel:** lees_xlsx.py moet de runs met strike en vertAlign bewaren. omzetten.ts moet stoppen met exit 3 zodra zo'n run in een gepubliceerde rij staat, en de hoofdsessie beslist per geval in bekende-afwijkingen.json: doorgehaald weglaten of tonen als doorgehaald; superschrift als ‘³’ of als een eigen Stuk. Die beslissing liefst toetsen aan de pdf-versie van de doelenset, die ook in de map staat. De 4 schijnfouten van de lijst voor het GO! halen.
- **[middel] De vormcontroles en de bekende afwijkingen kloppen niet met de bestanden: G3 zou met exit 3 stoppen** De controles zoals beschreven (codekolommen ‘cijfer.cijfer.cijfer’, elke code vindt één doel, leeftijden niet leeg) gelden zonder afbakening per soort rij. De lijst bekende afwijkingen mist:
- NL rij 1639 en 2312, met ‘TE BEREIKEN OP POPULATIENI(E)VEAU’ in ‘KO nummer’;
- GE rij 1551 en 1552, met tekst van opsommingstekens in ‘L6 nummer’;
- WI rij 4379 en 4380, met codes 2.4.44 en 2.4.45 die niet bestaan;
- 17 rijen ‘te hanteren begrippen’ zonder leeftijd (bv. WT ‘de alleseter’, FR ‘le/la/les’), terwijl Begrip.leeftijden onder ‘niet leeg’ valt.
WI rij 521 heeft TYPE ‘minimumdoel’, maar is duidelijk een MIA-item van WI.102 (‘0 tot en met 100’ onder ‘Natuurlijke getallen:’). Omdat minimumdoel-rijen alleen naar het rapport gaan, valt die tekst stil weg, en de rondgang ziet het niet. Aan de docx-kant: in LP0065 staat stap 2 in de Hoe-kolom als ‘2.’+NBSP+‘Voorkeursinstructie’. ‘Witruimte achteraan mag’ dekt dat niet. Elke kop heeft ook twee w:pStyle (‘2’ en ‘Heading2’), en ‘2’ is geen gedefinieerde stijl. **Herstel:** De controles op codes en koppeling alleen laten gelden voor doelzin- en MIA-rijen. Op minimumdoel-rijen alleen rapporteren, en daar eisen dat de kolom INHOUD leeg is. De genoemde rijen met reden in bekende-afwijkingen.json zetten; WI 521 als MIA-item van WI.102. Leeftijden van een begrip mogen leeg zijn. Bij de stapnamen NBSP gelijkstellen aan een spatie. In lees_docx.py de pStyle nemen die in styles.xml bestaat.
- **[middel] Vóór vraag 1 publiceert de omgekeerde index al de tekst van bijna het hele leerplan** G4: ‘Het volledige leerplan gaat pas in public/ na het antwoord op vraag 1. Tot dan: de lesplannen, de omgekeerde index, de doelen uit de lesplannen.’ Maar GoBijDoel heeft een verplicht veld `tekst`, en bij-minimumdoel/1..10.json bevat elk gekoppeld leerplandoel. Dat zijn de doelzinnen van 3022 van de 3490 doelen, precies wat vraag 1 nog moet toelaten. Het ontwerp beschrijft ook niet wat de doelpagina, de LeerjaarScherm-regel ‘n in 12 vakdisciplines’ en GoIndex.leerplan[].bestand tonen of waar ze naar linken als de leerplanbestanden er niet zijn. Zo ook: G13 wacht alleen op vraag 1 en 2, terwijl G9 en G10 het voorgestelde antwoord op vraag 5 (voorstel tonen) en vraag 6 (buitengewoon) al inbouwen. **Herstel:** In GoBijDoel `tekst` optioneel maken. Tot vraag 1 ‘ja’ is, bevat bij-minimumdoel alleen code, moment, status en lesplannen, plus de tekst van de 19 doelen uit de lesplannen. Links naar een leerplandoelpagina alleen tonen als dat bestand bestaat. G13 laten wachten op vraag 1, 2, 5 en 6, of tot dan de voorzichtige keuze nemen: geen voorstel tonen en niet bij het buitengewoon tonen.
- **[laag] Wijzer kan in LP0014a 6 activiteiten van deel 5 niet aanwijzen, en de vorm van ‘Trainen’ is niet beschreven** Volgens de regel van omzetten.ts worden opeenvolgende ListParagraph-alinea's met dezelfde numId één lijst. In LP0014a volgt 6 keer een vette activiteitstitel (ook ListParagraph, numId 1) direct op een gewoon lijstitem van de vorige activiteit, bv. ‘lichaamsdelen benoemen’ → ‘Lichaamsdelen-dobbelsteen’. De titel wordt zo een item midden in een lijst. Wijzer (deel, blok, rij, kolom) heeft geen itemindex, dus trainen.vanaf en trainen.tot vallen verkeerd. Bovendien heeft deel 5 vijf vormen:
- een vette ListParagraph (LP0014a, LP0074, LP0087);
- een vette gewone alinea (LP0014b, LP0094);
- ‘•’+NBSP gevolgd door een vette run (LP0001);
- een vette titel + ‘\n’ in w:t + de tekst in één alinea (LP0065; 6 van de 18 regeleinden, dus niet ‘vooral liedjes’);
- geen titel (LP0017).
vorm.ts heeft daar geen regel voor. **Herstel:** Wijzer uitbreiden met `item?: number` (lijstitem) en `regel?: number` (blok binnen een cel). De vijf vormen van een activiteitstitel in deel 5 als gegevens in vorm.ts zetten. Een onbekende vorm geeft exit 3.
- **[laag] Het voorstel voor MV.040 valt niet onder de regel die voorstellen mogelijk maakt** ‘6.12’ heeft niet de vorm cijfer.cijfer.cijfer, dus stap 1 van koppelen.ts maakt er een probleem ‘onleesbaar’ van. Stap 5, die een voorstel uit bekende-afwijkingen.json toelaat, geldt alleen voor ‘bestaat-niet’. De zin in de app (‘Dat nummer bestaat niet’) past ook niet bij ‘onleesbaar’. **Herstel:** Een voorstel toelaten voor beide redenen, met als sleutel doel + moment + letterlijke bronCode. Bij ‘onleesbaar’ de tekst ‘Dat is geen geldig nummer’ gebruiken.
- **[laag] Kleinere beweringen die niet kloppen** (1) ‘De sha256 staat in manifest.json’ voor alle 20 bestanden: manifest.json heeft alleen de 8 docx-bestanden. decodeer_xlsx.py vergelijkt de bytes niet met fileSize, dus ‘bytes gelijk aan de Drive’ is voor de xlsx-bestanden niet aangetoond. (2) ‘basisKleuren.test.ts dekt de nieuwe css-bestanden’: de test leest alleen global.css en basis.css (regels 10-11). basis-lesplan.css en basis-go.css vallen er dus buiten, ook voor de regel dat elke selector met :root[data-deel='basis'] of .b- begint. Dat bestand staat niet bij G8 of G9. (3) Een telefoonnummercontrole die de import kan stoppen, geeft valse treffers op de echte gegevens: ‘03/07/2018’ (GE rij 1305) past op een gewoon Belgisch patroon, en WI heeft getallen als ‘1 412 164 992’. **Herstel:** (1) In G2 decodeer.py op alle 20 bestanden draaien, met fileSize uit get_file_metadata, vóór G4. (2) basisKleuren.test.ts toevoegen aan G8 en G9 en de test uitbreiden naar src/styles/basis*.css. (3) Het patroon smal definiëren en vastleggen in een test op de 12 echte sets, of van de telefooncheck een melding maken in plaats van een stop.

### Nagerekend en juist

- Doelensets nagerekend: 3490 leerplandoelen, per vak exact zoals in de tabel (AA 276 … WI 998). Codes lopen van 001 tot N zonder gaten. GO! NR. staat alleen op doelzin-rijen. Kennisverwerking alleen begrijpen, gebruiken of engageren. Onderwerp, subthema, rubriek en subrubriek: 44, 131, 229, 141. MIA aanklikbaar 5042 en niet aanklikbaar 2387; begrippen 4682, waarvan 4665 met een leeftijd; voorbeelden 838 titels en 2035 opsommingstekens; 45 rijen asterisk. MIA-rijen hebben nooit een leeftijd. Eén rubriekrij met een leeftijd (FR). In WI is de kop van kolom M leeg.
- Koppeling nagerekend: 4973 verwijzingen op doelzin-rijen, 4972 vinden precies één doel in ODS_3395-3428. De enige mislukking is MV.040 KO ‘6.12’; 6.1.2 (92439, ‘vormgevingsmiddelen … verkennen’) is een redelijk voorstel. 3022 doelen met en 468 zonder koppeling. Alle 998 minimumdoelen worden genoemd. Geen dubbele code binnen een moment. De tweelingen in het buitengewoon onderwijs hebben hetzelfde nummer (0 afwijkingen). Hoogstens 57 leerplandoelen bij één minimumdoel (93408). 18 kapotte vlaggen en schakels (16 + 2), letterlijk zoals opgesomd.
- Eerste reeks: 22 doelregels in deel 2. Code, kennisverwerking en leeftijden zijn 22 op 22 gelijk aan de Excel; de tekst 21 op 22, alleen WT.008 in LP0065 wijkt af. De 36 MIA- en begrippenregels staan letterlijk in de Excel. Vlag- en schakeliconen per lesplan zijn per soort exact gelijk aan de kolommen VLAGGEN en SCHAKELS (8 op 8). 17 doelen naar ODS_3410, WT.235 ook naar L6 3.3.2 (92822, ODS_3409), WT.008 en WT.057 zonder minimumdoel, 7 van de 21 kleuterdoelen.
- Vorm van de docx-bestanden zoals beschreven: één Heading1 ‘Lesplan <code> <titel> (2,5-4 jaar)’ en vijf metaregels met een vet label. ‘Lesplan:’ is overal gelijk aan code + titel; LP0074 en LP0087 hebben twee fiches. Delen 1-6, plus 7 in LP0014a. H3 en H4 alleen in deel 3 (9 per bestand). 6 tabellen, geen geneste tabellen, geen gridSpan, geen kop in een cel. Deel 4 is 11x3, in LP0014b 10x3 met 5 stappen: ‘Zelfstandige verwerking’ komt er niet in voor. Leskern met vMerge. Geen w:tab, hyperlink, sdt, tekstvak, ins/del of veld in de body. Alleen lijstniveau 0 (numId 1 opsomming; numId 2 genummerd in LP0087). Runopmaak alleen b, i en u (single). 18 w:t met een regeleinde. Alleen de 6 gekende iconen plus de mindmap in deel 4 van LP0014a en LP0014b.
- Verwijzingen naar de code kloppen:
- MinimumdoelRef in curriculumTypes.ts:75-82, net ‘go’ op :11, methode ‘export’;
- canoniek op minimumdoelen.ts:618, valideerSetBestand op :713, laadSet op minimumdoelenBron.ts:112;
- normaliseerDoeltekst op curriculum.ts:360, isVeiligDoelId op :378; DOEL_ID laat ‘go-WT-086’ toe;
- LeerjaarBasis op kalender.ts:22 en WERKT_NAAR;
- DOEL_DELEN met ‘wanneer’ en ‘leerlijn’;
- DEFAULT_MAX_KB 80; BasisDeel-chunk 59.379 bytes (build van 3 november);
- vitest leest alleen src/**/*.test.ts; vite-node is aanwezig;
- ECHT_TEST-glob op minimumdoelenWorkflow.test.ts:741, met de eis GEGEVENSRUN plus skipIf;
- momentopname-wacht in basisIngang.echt.test.ts;
- lucide-react 1.48.0 heeft Flag, Link2, Award, Puzzle, Lightbulb en Glasses;
- types.ts: SortQuestion 288-292, MemoryPair 347, PairsConfig 352, TipTile 488, Timeline in de modus exercise, Hotspot in de modus quiz, imagepoint;
- service worker ‘netwerk eerst, cache als terugval’; wf.basis.keuze.v1; vier items in de navigatie van BasisSchil.
- Eerlijkheid in de opzet: geen koppeling uit leeftijden. Twijfel blijft officieel en wordt gemeld, niet verbeterd. Een voorstel bestaat alleen voor een kapotte code en is gemarkeerd. De tekst van een minimumdoel komt alleen uit de API. Leeftijd eerst, het leerjaar als ‘meestal’ met ‘waarschijnlijk’. Kennisverwerking wordt niet verward met de niveaus E tot A. De mindmap blijft standaard weg. Geen dc:creator of lastModifiedBy; [Naam] is het enige persoonsgegeven.
- Inpassing: alles binnen de luie route /basis/*. App.tsx, EAGER_ICON_NAMES, curriculum*.ts, minimumdoelen*.ts en het secundair blijven onaangeroerd. vakIconen.ts toont al het patroon ‘iconen buiten icons.ts’. Er wordt niets nieuws in localStorage bewaard.
- Het aanbod voor LP0065 steunt op de letterlijke tekst: stap 1 met tuinkers, bonenplanten en preischeuten; stap 2 met schaap, kat, kip, goudvis en mier en ‘planten of vlees’; stap 3 met de doos foto's, de twee hoepels ‘het dierenhok’ en ‘de plantentuin’ en het voedselprentje; stap 5 met handgebaren; stap 6 met de kinderboerderij in de speelhoek. De Trainen-titels bestaan letterlijk, net als de vastlegging ‘fotokaarten van verschillende dieren naast planten’. Waarom LP0001 niet als eerste: dat lesplan vraagt zelf om de thuissituatie niet centraal te zetten.
