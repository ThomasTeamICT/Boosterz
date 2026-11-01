# Afspraak voor de diorama-modules van de Lichtkamer

De Lichtkamer is een prototype voor Boosterz basisonderwijs: een eenvoudige 3D-omgeving (three.js r128, UMD, global `THREE`) rond de nieuwe minimumdoelen wetenschap en techniek over licht. De eigenaar vond de eerste versie te kaal: "ik had wat meer details verwacht zoals in een diorama zonder té veel afleiding, ik wil dat dit er visueel heel aantrekkelijk uitziet, komt op een groot digibord dus mag opvallen."

## Bestanden

- `v2.html`: de pagina (logica, opdrachten, panelen). **Niet wijzigen.**
- `lk-wereld.js`: de basis (renderer met gloed, omgeving, sokkel, texturen, materialen, helpers, zaklamp, figuren, kaartjes, meetlat en het schaduwtheater `LK.decor['4']` als referentie). **Niet wijzigen.** Lees het volledig: het is je stijlgids en gereedschapskist.
- `lk-kleuter.js`: poppenhuis voor einde kleuter (agent K).
- `lk-labo.js`: lichtlabo voor het 6de leerjaar (agent L).

Elke module is een IIFE die `window.LK.decor[...]` en `window.LK.props.*` vult. Gebruik `LK.mesh`, `LK.blob`, `LK.geo.rbox`, `LK.mat.*`, `LK.tex.*`, `LK.gordijn`, `LK.KLEUR`, `LK.shade`. Geen andere externe bestanden, geen afbeeldingen: texturen maak je met canvas (zoals `LK.tex`). Gebruik `THREE.Reflector` alleen als het bestaat (`if (THREE.Reflector)`), met een eenvoudige terugval.

## Eenheden en ruimte

- 1 eenheid = 10 cm. De vloer van het diorama ligt op y = 0, het scherm (achterwand) op z = 0. De kijker staat aan +z. De sokkel (uit lk-wereld.js) ligt onder de vloer: x van −4 tot 4, z van −0,7 tot 5,3. Bouw de vloer zoals in `LK.decor['4']` (afgeronde plaat 7,0 × 0,14 × 4,9, centrum (0, −0,07, 2,35)).
- De achterwand moet licht en schaduw goed tonen: een effen, licht oppervlak waar het licht valt (zie de vrije zones). Elk vlak dat licht of schaduw moet ontvangen: `receiveShadow = true`.
- `decor(ctx)` krijgt `ctx = { root, taak, voorwerp }`. Voeg alles toe aan `ctx.root` (niet aan de scène). Geef terug: `{ scherm, versiering }`, waarbij `versiering` een `THREE.Group` is met ALLEEN de pure versiering. Die groep wordt verborgen in de prikkelarme stand. Vloer, wanden en scherm horen niet in `versiering`.
- Geen extra lichtbronnen in het decor (geen lampen die branden, geen vensterlicht dat schaduw geeft): het licht is het leerdoel. Een donkere nachthemel met kleine sterretjes buiten een raam mag (geen maan: die is geen lichtbron, en dat zou verwarren).
- Didactisch principe: geen verleidelijke details. Het decor is rijk maar gedempt van kleur en contrast; wat het kind bedient (lamp, spiegel, beer, stoffen, meters) krijgt het sterkste contrast. Geen mascotte, geen tekst in beeld (behalve labels op meters), geen bewegende versiering.

## Stijl

Speelgoedachtig miniatuur: afgeronde vormen (`LK.geo.rbox`), zachte contactschaduwen (`LK.blob`), warme houttinten, stof met plooien (`LK.gordijn`), patroonbehang (`LK.tex.patroon`), kleine details die je pas bij tweede blik ziet (een boek met een bladwijzer, een plint, een schakelaar zonder licht, een vloerkleed met rand). Wanden met zichtbare dikte (zoals een poppenhuis of een opengewerkte kijkdoos). Kijk naar het schaduwtheater als referentie voor detailniveau en afwerking.

Prestatie: het draait ook op Chromebooks. Hou het onder ongeveer 250 meshes per scène, hergebruik geometrie en materialen, geen schaduw werpen voor kleine versiering (`cast: false`), geen texturen groter dan 512 px.

## Agent K: `lk-kleuter.js`, het poppenhuis van Beer (einde kleuter)

`LK.decor.k = function (ctx) { ... }` met `ctx.taak` = `'licht'`, `'spiegel'` of `'schaduw'`. Een opengewerkte kinderkamer bij avond: achterwand en linkerwand met behang en plint, wandranden met dikte, een raam in de linkerwand met gordijnen en een nachthemel met sterretjes (zonder maan), houten vloer, vloerkleed, bed met deken, nachtkastje, speelgoed, boekenplank. Bij `'schaduw'` hangt er een wit laken (scherm) tegen de achterwand, minstens x ∈ [−1,8; 1,8], y ∈ [0,05; 2,4], op z ≈ 0,02, `receiveShadow = true`; geef het terug als `scherm`.

Vrije zones (geen hoge voorwerpen; een vloerkleed van hoogstens 0,02 mag wel):
- `'licht'`: de rij voorwerpen staat op z = 2,2, x = −2,0; −1,0; 0,05; 1,05; 2,0. Hou x ∈ [−2,6; 2,6], z ∈ [1,6; 2,8] vrij.
- `'spiegel'`: zaklamp op (−2,2; 0,35; 2,4) schijnt naar +x; spiegel op (0,6; 0,35; 2,4); kast (prop) op (−0,7; 0; 1,2); beer op (0,6; 0; 0,55) en daarna op (2,6; 0; 1,25). Hou x ∈ [−2,6; 3,0], z ∈ [0,2; 3,4] vrij behalve die voorwerpen. De camera kijkt van boven (schuin).
- `'schaduw'`: kartonnen figuur op (0; 0; 1,0), zaklamp op x = 0, z tussen 1,6 en 4,4. Hou x ∈ [−1,2; 1,2], z ∈ [0,3; 4,5] vrij, en het laken.

Props (elk een `THREE.Group`, oorsprong zoals aangegeven; de pagina zet positie en rotatie):
- `LK.props.lampje()`: tafellampje (ongeveer 0,9 hoog), oorsprong aan de voet. `userData.zet(aan)`: aan = `PointLight` (kleur 0xffd58a, intensiteit 1,4, afstand 7, decay 1,2) op de hoogte van het peertje, en het peertje gloeit (`LK.mat.gloei`); uit = intensiteit 0 en een grijs peertje. Begin uit.
- `LK.props.kaars()`: kaars op een schoteltje (ongeveer 0,5 hoog). `userData.zet(aan)`: vlam zichtbaar en gloeiend plus `PointLight` (0xffa64d, 0,9, 4, 1,4); uit = geen vlam, geen licht.
- `LK.props.zaklampKlein()`: een zaklamp die plat op de vloer ligt en naar −x schijnt (ongeveer 0,4 lang). `userData.zet(aan)`: `SpotLight` (0xfff1c9, 1,4, 0, hoek 0,5, penumbra 0,4) naar (−3; 0,3; −1,2) relatief, en een gloeiende lens.
- `LK.props.spiegelKlein()`: staande spiegel (ongeveer 0,65 hoog) in een houten lijst, licht naar links gedraaid (rotation.y ≈ −0,35 binnen de groep). Geen API. Ze mag zelf geen licht geven.
- `LK.props.bal()`: glimmende kerstbal of knikker (ongeveer 0,4), glanzend (`LK.mat.metaal` of `glans`), op een kleine voet. Geen API.
- `LK.props.kast()`: speelgoedkast als blokkade, oorsprong aan de voet, ongeveer 0,9 × 0,9 × 0,7 (breedte × hoogte × diepte), `castShadow = true`.
- `LK.props.spiegelDraai()`: spiegel op een draaivoet. De oorsprong ligt in het MIDDEN van het spiegelvlak (op 0,35 boven de vloer). Het vlak ligt in het lokale xy-vlak, ongeveer 0,54 breed en 0,52 hoog, en is aan beide kanten spiegelend. De voet reikt tot y = −0,35 (de vloer). De pagina draait de groep rond y.
- `LK.props.beer()`: een lieve knuffelbeer (ongeveer 0,75 hoog), oorsprong aan de voeten, kijkt naar +z. `userData.verlicht(aan)`: als het licht op de beer valt, gloeit hij warm op (emissive, bv. 0x5a3a12). Geen gezicht dat lacht of reageert: alleen het licht verandert.

## Agent L: `lk-labo.js`, het lichtlabo (6de leerjaar)

`LK.decor['6'] = function (ctx) { ... }` met `ctx.taak` = `'stoffen'` of `'gordijn'`. Een warme, ordelijke labotafel: werkblad (vloer), achterwand met een groot wit scherm in een lijst, minstens x ∈ [−1,6; 1,6], y ∈ [0,05; 2,4], op z ≈ 0,01, en daarrond gedempte versiering: gaatjesbord met gereedschap, plankje met potjes en stalen, een optische bank (rail met cm-streepjes) langs de lichtweg. Bij `'stoffen'` maak je ook het zijscherm: een wit vlak op x = 2,3, centrum (2,3; 0,8; 2,0), 2,6 × 1,6, dat naar −x kijkt (`rotation.y = −π/2`, `side: DoubleSide`, `receiveShadow`), op een voet. Geef het terug als `zijscherm`.

Vrije zones:
- `'stoffen'`: zaklamp op (0; 0,6; 3,6) schijnt naar −z; stofhouder op (0; 0,6; 2,0), 45° gedraaid; doorgelaten licht naar (0; 0,6; 0); teruggekaatst licht naar (2,3; 0,6; 2,0). Meter A op (−1,15; 0; 0,42), meter B op (1,95; 0; 1,0). Hou de lichtwegen en een strook van 0,6 errond vrij.
- `'gordijn'`: zaklamp op x = 0, y = 0,6, z tussen 2,4 en 4,5; gordijnstaal op (0; 0; 1,2); meter M op (−1,1; 0; 0,42). Hou x ∈ [−1,0; 1,0] tussen z = 0 en 4,6 vrij.

Props:
- `LK.props.houder()`: oorsprong in het midden van het stofvel (0,6 boven de vloer). Een vel van 0,8 × 0,8 in het lokale xy-vlak, in een klem op een staafje tot de vloer (y = −0,6). Het vel werpt schaduw (`castShadow = true`). `userData.zetStof(s)` met `s = { id, kleur, opac, metaal }`: kleur en doorzichtigheid aanpassen. Metaal (`'alu'` gekreukt, `'spiegel'` glad): glanzend met `LK.env`. Glas: bijna doorzichtig met een lichte blauwe rand.
- `LK.props.meter()`: een lichtmeter als speelgoedachtig toestel (ongeveer 0,45 × 0,5 × 0,25) met een wijzerplaat (0 tot 10, canvas) en een wijzer, oorsprong aan de voet, wijzerplaat naar +z. `userData.zet(v)`: v tussen 0 en 1 zet de wijzer; `null` zet hem op 0 met een gedimde plaat ("nog niet gemeten"). `userData.label('A')` zet een grote letter op het toestel.
- `LK.props.gordijnstaal()`: een stuk stof (1,2 breed, 1,1 hoog, met plooien) aan een stang op een standaard. Oorsprong aan de voet, midden onder de stof. De stof hangt tussen y = 0,05 en 1,15, en het midden van de stof zit op y = 0,6. De stof werpt schaduw. `userData.zetStof(g)` met `g = { kleur, op }`.

## Testen (verplicht vóór je oplevert)

```bash
cd /tmp/claude-0/-home-user-Bookwidgetzzz/6982f99e-483d-5e21-8ce6-7865b4915a00/scratchpad/lichtkamer
node test-v2.cjs $PWD v2.html shots-<jouw-letter> k     # agent K
node test-v2.cjs $PWD v2.html shots-<jouw-letter> 6     # agent L
```

Het harnas serveert de pagina, je module, three.js en de voorbeeldmodules lokaal. Het maakt schermafbeeldingen in `shots-<letter>/` en drukt consolefouten af. Er mogen geen fouten zijn. Bekijk ELKE schermafbeelding zelf (Read op het png-bestand), verbeter, en herhaal tot het er echt mooi uitziet. Daarbij moet het leerdoel duidelijk blijven: lichtvlek, schaduw en bundel goed zichtbaar, en niets in de vrije zones. Wijzig v2.html, lk-wereld.js en het harnas niet. Maak geen git-commits. Lever een korte beschrijving op van wat je bouwde en welke schermafbeeldingen het best tonen hoe het eruitziet.
