# Aanmelden en inleveren: bouwpakketten en eisen (1 november 2026)

Bijlage bij `docs/BASISONDERWIJS.md`, § "Aanmelden en inleveren per leeftijd". Hier staat de volledige spec per bouwpakket en de harde eisen van de twee rechters (klaspraktijk, techniek en privacy). Het model is het "hoektoestel", met de beste delen van de twee andere ontwerpen erbij. Bouwen begint pas na de antwoorden van de eigenaar en de proef op echte schooltoestellen (pakketten 1 en 2).

## Model per leeftijd

### Kleuter

- **Aanmelden.** Een kleuter meldt zich nooit aan met een account, een kaart of de camera. Er zijn twee wegen.

1. Aan het digibord (de laptop van de leerkracht): de leerkracht tikt op 'Wie komt?' en dan op het prentje van het kind. Dat zijn twee tikken, ongeveer 3 seconden. Het bord toont alleen het prentje, nooit een naam.

2. Op een gedeeld klastoestel (een Chromebook in een hoek, één keer klaargezet met de toestellink van de leerkracht) staat altijd de muur 'Wie werkt?'. Een opgenomen stem zegt 'Wie werkt? Tik op je prentje.' Elke tegel is minstens 96 px groot en toont het vaste prentje van een kind: een vorm (kat, vis, maan, tractor…) in een vaste kleur, zonder naam. De vorm draagt de betekenis, de kleur helpt alleen. Koos de leerkracht een hoekgroep, dan staan alleen die 4 tot 8 kinderen op de muur.
- Tik 1: het kind tikt zijn prentje. Het toestel toont het groot en vraagt met een opgenomen stem: 'Ben jij de kat?'
- Tik 2: de grote knop 'Ja, dat ben ik' (minstens 64 px). Een kleine knop gaat terug.
- In duo (als de leerkracht 'vandaag in duo' aanzette): het eigen prentje, dan dat van het maatje, dan 'Ja'. Samen 3 tikken.
Daarna start de oefening van vandaag, of het kind kiest er een uit 2 of 3 prenten.

Het toestel vergeet wie er werkt:
- na elke oefening: de muur komt terug, met bovenaan groot het prentje van wie net werkte en 'Ga verder' (1 tik);
- na een tik op de grote tegel 'Ik ben klaar', die altijd zichtbaar is;
- na herladen;
- na 2 minuten zonder aanraking: eerst 'Ben je er nog?', met het prentje en geluid, en na nog 1 minuut de muur. De leerkracht kan die tijd langer zetten of uitzetten.
Wie vandaag al werkte, krijgt een vinkje op zijn tegel. Dan vraagt het toestel: 'De kat was er al. Ben jij de kat?'

De identiteit staat alleen in het geheugen van de pagina, nooit in 'wf.student.v1'. Er is geen tegel 'gast' of 'ik sta er niet bij'. Wat het kind zelf moet kunnen: zijn prentje herkennen en twee keer tikken. De eerste week doet de leerkracht het voor in de kring.
- **Waar het werk leeft.** Beurten aan het bord en observaties ('Ik zag het') komen meteen op het toestel van de leerkracht. Ze staan in haar bewijsopslag per klas: localStorage 'wf.bewijs.v1.<klas>', met een controle bij elke schrijfactie. Een klas met een jaar bewijs neemt enkele honderden kB in. IndexedDB 'wf-files' blijft voor bestanden: die database heeft bewust één store zonder versiebump (idb.ts r. 3-8).

Op een gedeeld klastoestel staat in de opslag van dat browserprofiel:
- de toestelkaart ('wf.basis.toestel.v1'): de klascode, per kind een vaste kindcode van 2 tekens met prentje en kleur, de pakketten van de klas, het toestelnummer ('Toestel 2') en de vlag 'dit toestel vergeet alles bij afmelden'. Bij de kleuters staat er geen enkele naam;
- de buffer ('wf.basis.bewijs.v1'): per pakket en versie, per kindcode en per bewijs één stand (juist, nog niet, of nog niet met foutpatroon n), met het uur en of de leerkracht het al ontving. Bij een checkvraag telt het eerste antwoord, bij een oefening de laatste poging.
De stand van de 3D-scène wordt niet bewaard, alleen het bewijs. Er komt geen WF1-inzending, dus /voortgang toont niets van de kleuters.

De pakketten zijn openbaar. Ze staan naast de app op GitHub Pages, blijven offline beschikbaar via de service worker en reizen nooit mee in een code.
- **Naar de leerkracht.** Een beurt aan het bord of een observatie staat al bij de leerkracht. Daar is niets voor te doen.

Van een gedeeld klastoestel, na elke hoekenronde en altijd vóór het afmelden:
1. De leerkracht tikt op het toestel op 'Voor de juf of meester'. Dat is een gewone knop in de hoek, die ook met het toetsenbord werkt. De code tonen kan geen kwaad, dus er is geen drempel.
2. Het toestel toont één bewijscode (WB1), groot (8 px per module), met alles wat de leerkracht nog niet ontving. Eronder staat 'Toestel 2 · 6 kinderen · 17 bewijzen'. Gemeten met qrcode 1.5.4 bij foutcorrectie L: 6 kinderen met een oefening en een check (6 bewijzen per kind) geven 173 tekens, QR versie 6. 8 kinderen geven 221 tekens, versie 7. Boven 395 tekens (versie 10) komen er delen die elk op zich geldig zijn ('deel 1 van 2', met een knop 'volgende').
3. Op haar laptop staat het bestaande Inleverpunt open met de doorlopende scanner. Ze houdt het scherm voor haar webcam. Er klinkt een piep. De log toont 'Toestel 2: 6 kinderen, 17 bewijzen, 12 nieuw' en groot het ontvangstteken: twee prentjes. De log toont geen namen.
4. Het toestel vraagt: 'Welke prentjes zie je bij de juf of meester?' Ze kiest twee keer uit 4. Juist: 'ontvangen om 10.42' in het groen, en dat bewijs zit niet meer in de volgende code. Fout: het blijft 'nog niet ontvangen'.
5. Er wordt niets gewist. Opnieuw scannen geeft hoogstens 'al aanwezig', en een gemiste scan komt vanzelf mee in de volgende code.

Zonder camera: op het toestel 'Kopieer als tekst' of 'Bewaar als bestand', en de leerkracht plakt de code in het Inleverpunt. Ook dan krijgt ze het ontvangstteken. Het leerlingtoestel heeft nooit een camera nodig.

Duur: ongeveer 20 seconden per toestel.
- **De leerkracht per les.** Eenmalig per klas (±10 min): de bestaande klaslijst openen en op 'Klaar voor het basisonderwijs' tikken. De app geeft elk kind een kindcode, een prentje en een kleur. De leerkracht kijkt de prentjes na, bijvoorbeeld gelijk aan het kapstoksymbool, en zet de klas op 'leest nog niet'.

Eenmalig per toestel (±1 min) op een klasaccount dat niets wist: de toestellink openen (bladwijzer, Smartschool of plakken), een toestelnummer kiezen, en de app vraagt persist(). In een beheerde gastsessie zet de beheerder die link als startpagina (hij bevat bij de kleuters geen namen). Dan kost het niets extra; anders ±30 s per toestel per dag.

Voor de les (±2 min): het pakket op het bord openen (1 min) en per hoektoestel de oefening van vandaag vastzetten (±15 s per toestel).

Tijdens de les: beurten aan het bord, 2 tikken per kind (±3 s).

Na de les (±6 min):
- verzamelen: ±20 s per toestel, ±1,5 min voor 4 toestellen;
- 'Ik zag het' invullen voor wat een klik niet meet, zoals 92735 in de kring (±2 min);
- het overzicht per doel bekijken en af en toe een verkeerd prentje verplaatsen (±3 min).

Samen ±8 min per les met 4 hoektoestellen, en ±5 min zonder hoektoestellen.
- **Risico op verlies.** Bij de leerkracht is het veilig zolang haar opslag blijft. Elke week vraagt een herinnering om het klasbestand (de back-up) te bewaren.

Op een gedeeld toestel gaat verloren wat nog niet ontvangen is:
- in een gastsessie of met 'ephemeral users', bij het afmelden;
- bij gewiste sitegegevens;
- bij een volle schijf.
Dat raakt de kinderen van die hoek sinds de laatste ontvangst. Daarom staat op de muur altijd 'Nog niet bij de juf of meester: 4 kinderen'. Op een toestel met de vlag 'vergeet alles bij afmelden' komt die melding groot na elke beurt. Het overzicht toont dan 'nog geen bewijs', nooit 'nog niet'.

Tikt een kind een verkeerd prentje, of vergeet het 'Ik ben klaar', dan blijft de schade beperkt tot één oefening, door de muur na elke oefening en de vraag 'Ben je er nog?'. De leerkracht ziet bij elk bewijs de bron ('Toestel 2, 10.42') en kan het verplaatsen.

Een gegokt ontvangstteken (kans 1 op 16) haalt bewijs uit de volgende code, maar wist niets. Met 'Alles opnieuw doorgeven' (achter de drempel) toont het toestel alles van de laatste 14 dagen opnieuw.

Is de camera geblokkeerd, dan gaat er niets verloren: alleen de leerkracht scant, en plakken of een bestand kan altijd.

### 1ste graad

- **Aanmelden.** Alles werkt zoals bij de kleuters: beurten aan het bord, en op een gedeeld klastoestel de muur 'Wie werkt?' met de bevestiging, 'Ga verder', 'Ik ben klaar', het vinkje 'was er al' en 'Ben je er nog?'.

Het verschil zit in één klasinstelling, niet in het leerjaar: 'leest nog niet' of 'leest'. De leerkracht zet ze om zodra de klas leest, meestal in de loop van het 1ste leerjaar. Zo kan ook het buitengewoon lager mee.
- 'leest nog niet': alleen prentjes, en alles wordt voorgelezen.
- 'leest': als de leerkracht 'voornamen op de toestellen' aanzet, staat de voornaam groot onder het prentje. Het prentje wordt voorgelezen met het opgenomen geluid, de voornaam met de stem van het toestel als er een Nederlandse stem is.

Duo (het lesverloop van de Lichtkamer zegt 'Chromebook in duo'): het eigen prentje, het prentje van het maatje en 'Ja', dus 3 tikken. De check maakt elk kind apart: 'Nu de kat', 'Nu de vis'.

Wat het kind zelf moet kunnen: zijn prentje of zijn voornaam herkennen en 2 of 3 keer tikken.
- **Waar het werk leeft.** Zoals bij de kleuters. Werk op een gedeeld toestel staat in de buffer van dat toestel, per kindcode. Beurten en observaties staan meteen bij de leerkracht.

Staan de voornamen aan, dan kent het toestel ook de voornamen van de klas. Die komen alleen mee in de toestellink, als apart deel 'n=' na de code. Ze staan nooit in een QR-code en nooit in een bewijscode. Bewijs uit duowerk krijgt het merkje 'in duo met <kindcode>'.
- **Naar de leerkracht.** Met dezelfde bewijscode als bij de kleuters, en met twee verschillen.
- De klasdienst mag inleveren. Het kind brengt het toestel naar de laptop, houdt het voor de webcam, wacht op de piep en tikt de twee prentjes aan die het Inleverpunt toont. Tikt het fout, dan blijft het toestel op 'nog niet ontvangen' en probeert het opnieuw. De leerkracht kijkt alleen naar de teller op haar scherm.
- Er staat meer per toestel. Gemeten (L): 12 kinderen met elk 7 bewijzen geven 341 tekens, versie 10. Werkt een klas van 25 op één toestel, dan zijn het 2 delen: ±393 tekens (versie 10) en ±315 tekens (versie 9).

Wanneer: na elke hoekenronde. Op een klasaccount dat niets wist mag het uiterlijk op het einde van de dag.
- **De leerkracht per les.** Eenmalig en voor de les zoals bij de kleuters: ±10 min per klas, ±1 min per toestel, ±2 min per les.

Tijdens de les: niets voor het aanmelden, want vanaf de tweede les doen de kinderen 'Wie werkt?' zelf. Beurten aan het bord waar nodig.

Na de les: ±1 min verzamelen (de klasdienst levert in) en 3 tot 5 min voor het overzicht, nu ook om de duo's na te kijken.

Samen ±6 tot 8 min per les.
- **Risico op verlies.** Dezelfde risico's als bij de kleuters, met drie extra's.
- Een kind dat leest, kiest sneller (ook voor de grap) de naam van een ander. Het vinkje 'was er al' en de bron bij elk bewijs helpen de leerkracht om het te zien en te verplaatsen.
- Bij duowerk staat het bewijs van de oefening bij beide kinderen, ook als één kind het werk deed. Het merkje 'in duo' blijft zichtbaar, en de check blijft per kind.
- De klasdienst kan het teken gokken (kans 1 op 16). Ook dan wordt niets gewist. Afsluiten en wissen staan achter de drempel (de klascode typen) en kunnen pas als alles ontvangen is, of na een uitdrukkelijke waarschuwing met het aantal.

### 2de en 3de graad

- **Aanmelden.** Het kind meldt zich op de Chromebook aan met zijn eigen account. Dat regelt de school, niet Boosterz. In Boosterz gebeurt het één keer per profiel en per toestel:
1. Het kind opent de toestellink 'voor de eigen Chromebook' die de leerkracht in Smartschool of Classroom zet, of een bladwijzer.
2. De muur toont de voornamen met hun prentje, met tikdoelen van minstens 44 px. Het kind tikt zijn naam en dan 'Ja, dat ben ik'.
3. 'Dag Amira'. Het profiel onthoudt de klascode en de kindcode ('wf.basis.ik.v1'). De volgende lessen is er niets meer te doen.

Op een ander toestel uit de kar, of op een van 4 gedeelde Chromebooks waar elk kind met zijn eigen account aanmeldt, tikt het kind zijn naam één keer opnieuw (±5 s). 'Niet jij?' gaat terug naar de muur, nooit naar een vrij naamveld zonder kind erachter.

Duo: 'Werk je samen?' en dan het maatje kiezen. De check maakt elk kind apart, ook op hetzelfde toestel.

Werkt een 3de of 4de leerjaar op gedeelde toestellen met één klasaccount, dan zet de leerkracht die klaar als gedeeld klastoestel, met 'leest' en voornamen. Dan geldt de werkwijze van de 1ste graad.

Wat het kind zelf moet kunnen: zich aanmelden op de Chromebook, één keer een link openen, zijn naam tikken en op 'Lever in' tikken.
- **Waar het werk leeft.** In het eigen profiel van het kind, op dat toestel. Het is dezelfde buffer per kindcode ('wf.basis.bewijs.v1'), maar met alleen het eigen bewijs en, bij duowerk, dat van het maatje. Het is een buffer en geen bewaarplek. Hij blijft staan tenzij de school het laat wissen (ephemeral mode, wissen van sitegegevens, oude profielen opruimen als de schijf vol raakt), en hij volgt het kind niet naar een ander toestel.

Op het eigen profiel mag het kind 'Wat ik al kan' zien, per doel in kindertaal, met de zin 'Werk van andere toestellen staat bij je juf of meester'. Er staat nooit 'je bent alles kwijt'.

Het geheel staat alleen bij de leerkracht. De bestaande klaslink en 'Wie ben jij?' blijven voor de gewone oefeningen met een WF1-code. De basispakketten maken geen WF1-inzending.
- **Naar de leerkracht.** 1. In de laatste minuten van de les tikt het kind op 'Lever in'. Het toestel toont één bewijscode, groot (8 px per module), met alles wat de leerkracht nog niet ontving, over alle pakketten heen. Gemeten (L): 1 kind met een oefening en een check (7 bewijzen) geeft 55 tekens, versie 3. Een duo geeft 87 tekens, versie 4.
2. Per tafel komen de kinderen naar de laptop met het Inleverpunt en houden ze hun scherm voor de webcam. Er klinkt een piep, en de log toont '1 kind, 7 bewijzen, 7 nieuw' met het ontvangstteken.
3. Het kind tikt de twee prentjes aan: 'ontvangen'. Lukt dat niet, dan blijft alles staan. Bij de volgende start toont de hub dan bovenaan 'Nog niet bij de juf of meester'.
4. Zonder camera: 'Kopieer als tekst', en plakken in een bericht aan de leerkracht (Smartschool). Zij plakt het in het Inleverpunt. De code bevat geen naam, alleen een klascode en een kindcode.

Duur: 25 kinderen × ±6 s is ongeveer 3 minuten. Dat kan ook verspreid, voor wie klaar is.
- **De leerkracht per les.** Eenmalig: de toestellink posten (1 min). In de eerste les kiezen de kinderen hun naam (±3 min klastijd).

Voor de les: het Inleverpunt openen (±30 s).

Tijdens de les: niets, behalve een observatie waar dat zin heeft, bijvoorbeeld als een duo in het 6de zijn conclusie zegt.

Na de les: de inleverronde (±3 min) en het overzicht per doel (3 tot 5 min).

Samen ±5 tot 8 min per les. Staat de ephemeral mode aan, dan tikt elk kind elke les opnieuw zijn naam (±5 s), en is inleveren op het einde verplicht.
- **Risico op verlies.** Wat niet ingeleverd is, verdwijnt:
- bij de ephemeral mode of een beleid dat sitegegevens wist, bij het afmelden;
- als ChromeOS de oudste profielen opruimt omdat de schijf vol is;
- als iemand de browsergegevens wist.
Daarom wordt er elke les ingeleverd.

Neemt een kind telkens een ander toestel, dan staat zijn werk verspreid, maar het is niet weg: het Inleverpunt voegt samen wat binnenkomt.

Kiest een kind een andere naam, dan gebeurt dat hoogstens één keer per profiel. De leerkracht ziet de bron en verplaatst het bewijs.

'Ontvangen' komt alleen na het juiste teken van de laptop, nooit na een vinkje dat het kind zelf zet.

### Digibord

Het digibord is het scherm van de laptop van de leerkracht. Opent ze een basispakket, dan staat de schakelaar 'Op het bord' standaard aan (per tabblad, zodat een nieuw tabblad weer veilig begint).

Met 'Op het bord' aan:
- Klas samen (de standaard). Groot beeld, eerst voorspellen en dan de uitkomst, en een klasvraag met stemmen per letter of nummer. Geen namen, geen muur, geen inleverknop. Er wordt niets bewaard: geen inzending (WidgetRunner krijgt recordSubmission false), geen inzendingen of pogingen uit cursusblokken (BlockRenderer.tsx r. 630-658 bewaart nu buiten de speler om, dus ook daar), geen leesvoortgang, en bewijs() van de Lichtkamer bewaart niets. Dat loopt via één functie, bewaarModus(). Buiten het basisdeel verandert er niets.
- Beurt. 'Wie komt?' opent een strook prentjes zonder namen (het aria-label noemt de prentnaam). Na één tik toont een badge in de hoek 'Beurt: de kat', zodat iedereen ziet dat er bewaard wordt. Die ene oefening gaat meteen naar de bewijsopslag van de leerkracht, met de bron 'aan het bord, met de klas erbij'. Daarna gaat het bord vanzelf terug naar Klas samen.
- Het bord toont nooit een stand per kind, want klasgenoten kennen elkaars prentje.

Met 'Op het bord' uit, en pas na de vraag 'Staat dit scherm op het digibord? Dan ziet de klas de namen.', opent de leerkracht het overzicht per doel, 'Ik zag het' en de toestellinks. Staat het Inleverpunt open terwijl het bord projecteert, dan toont de log alleen aantallen en het ontvangstteken. Een QR-code van een toestellink bevat nooit namen.

Een gedeelde bord-pc die niet van de leerkracht is, of die 's nachts teruggezet wordt, zet ze op de stand 'bordtoestel'. Die toont altijd Klas samen, geeft geen beurten en bewaart niets.

## Wat we hergebruiken

- /home/user/Bookwidgetzzz/src/pages/InboxPage.tsx en /home/user/Bookwidgetzzz/src/lib/inbox.ts (splitCodes, processCodes, looksLikeCode): het Inleverpunt met plakken en doorlopend scannen, één verslagregel per code, en een kapotte code houdt de rest niet tegen. Er komt een tak voor WB1 bij: het patroon /W(?:FC?|B)1\./ op r. 123 en r. 448, en de melding op InboxPage r. 43.
- /home/user/Bookwidgetzzz/src/components/QrScanner.tsx: de doorlopende scanner (elke 220 ms, ontdubbelen met seenRef, piep en tril, aria-live-log, BarcodeDetector op ChromeOS en jsqr elders). Er komen een camerakeuze (nu facingMode 'environment', r. 117), een gespiegelde weergave (alleen het beeld op het scherm) en een groot kader bij.
- /home/user/Bookwidgetzzz/src/components/CodeQr.tsx en /home/user/Bookwidgetzzz/src/lib/qrLimits.ts: QR-codes tonen met foutcorrectie L en een gehele schaal (r. 14). Er komt een instelbare grootte per module bij (8 px voor de basiscodes), en het commentaar 'alfanumerieke tekens' op r. 2 wordt rechtgezet.
- /home/user/Bookwidgetzzz/src/lib/classTypes.ts en /home/user/Bookwidgetzzz/src/lib/classes.ts (createClass, sanitizeClass, matchesStudent): de klaslijst met vaste studentId, alleen op het toestel van de leerkracht. Er komen een kindcode, een prentje, een kleur en een klasinstelling bij.
- /home/user/Bookwidgetzzz/src/lib/utils.ts (makeCode, alfabet zonder 0/O en 1/I op r. 8): voor de kindcode van 2 tekens (1 024 per klas), het toestel-id en de controle.
- /home/user/Bookwidgetzzz/src/lib/storage.ts (reportWriteFailure r. 91, saveSubmission die false teruggeeft) en /home/user/Bookwidgetzzz/src/lib/storageHealth.ts (askPersistenceOnce r. 286): elke schrijfactie nakijken en melden, en persist() vragen bij het klaarzetten van een toestel.
- /home/user/Bookwidgetzzz/src/lib/progressTransfer.ts (sanitizeSubmission, SUBMISSION_LIMITS, submissionDupKey): het model voor de sanering, de grenzen en het ontdubbelen van de nieuwe codes.
- /home/user/Bookwidgetzzz/src/pages/ClassOpenPage.tsx: het patroon om een link te openen, tekst te plakken of een bestand in te lezen, voor de toestellink.
- /home/user/Bookwidgetzzz/src/pages/ClassDashboardPage.tsx: de plek voor het paneel met toestellinks en het overzicht per doel, met de bestaande melding 'wat dit toestel weet' (r. 329-333).
- /home/user/Bookwidgetzzz/src/pages/ClassStudentPage.tsx (HandInSection r. 367-519): het model voor 'Lever in' (code pas op vraag, kopiëren, terughalen), maar met één code in plaats van één per oefening.
- /home/user/Bookwidgetzzz/src/pages/PlayerPage.tsx (WidgetRunner met de prop recordSubmission, r. 96-98) en /home/user/Bookwidgetzzz/src/components/course/BlockRenderer.tsx (de vlag preview, r. 630-658): de plekken waar de bordweergave en het basisdeel het bewaren uitzetten.
- /home/user/Bookwidgetzzz/src/offline/serviceWorker.js, /home/user/Bookwidgetzzz/src/lib/examples.ts en /home/user/Bookwidgetzzz/public/voorbeelden/: openbare inhoud naast de app, offline beschikbaar. Dat is het model voor de openbare pakketten en de geluidsfragmenten.
- /home/user/Bookwidgetzzz/public/manifest.webmanifest: Boosterz als app installeren, wat de kans groter maakt dat persist() toegekend wordt.
- /home/user/Bookwidgetzzz/tools/prototypes/lichtkamer/lichtkamer.html: bewijs() met 'eerste telt', statusVoor, BEWIJS_PER_DOEL, de foutpatronen, controleerBewijs en de bordstand die niets bewaart. Dat wordt geteste code en het eerste pakketmanifest.
- /home/user/Bookwidgetzzz/src/components/A11yMenu.tsx: de rustmodus (prikkelarm: niets vanzelf voorlezen, geen piep) en het voorleestempo.
- /home/user/Bookwidgetzzz/src/components/icons.ts en lucide-react: de prentenset zonder emoji, volgens docs/ontwerp/ICONEN.md. Nagekeken in node_modules: cat, dog, fish, bird, rabbit, turtle, snail, squirrel, panda, apple, carrot, cherry, banana, sun, moon, star, cloud, flower, tree-pine, leaf, bike, bus, tractor, rocket, ship, umbrella, key, bell, house, castle, drum, crown, anchor, feather, shell, snowflake. Een vos zit er niet bij.
- /home/user/Bookwidgetzzz/src/pages/PrivacyPage.tsx: aan te vullen met wat het basisdeel bewaart, en met een tekst voor de GEB van de school.
- /home/user/Bookwidgetzzz/src/lib/sync/types.ts: de ontwerpregel 'het toestel van de leerkracht blijft de bron van waarheid'. Komt het klaskanaal er ooit, dan kan een gebeurtenis 'bewijs' naast 'submission' komen.

## Bouwpakketten

### 1. Toestelproef: een losse proefpagina

Agent: `bouwer`. Hangt af van: niets.

Een losse pagina buiten de app meet op de echte schooltoestellen wat het ontwerp aanneemt. Een script maakt één zelfstandig html-bestand, zonder CDN, met vier onderdelen.
(a) Bewijscodes in de vorm van WB1, van versie 3, 6 en 10, elk op 6 en op 8 px per module, gemaakt met qrcode uit de repo bij foutcorrectie L.
(b) Een scanner met camerakeuze en gespiegelde weergave. Hij gebruikt BarcodeDetector waar die bestaat, en anders jsqr (uit node_modules ingevoegd) op 640 px. Een log toont wat hij las en hoe lang dat duurde.
(c) De lijst van speechSynthesis.getVoices(), met een knop 'zeg: Wie werkt?'.
(d) Een opslagproef: een merkje met het uur in localStorage en in IndexedDB. Bij het openen meldt de pagina of het vorige merkje er nog is, zodat je ziet of afmelden alles wist.
De pagina komt in public/proef/, zodat ze op hetzelfde adres als Boosterz draait, met dezelfde opslag en dezelfde toelating voor de camera. Ze bevat geen persoonsgegevens en geen tracking.

Bestanden: `/home/user/Bookwidgetzzz/tools/prototypes/toestelproef/maak-proef.mjs`, `/home/user/Bookwidgetzzz/tools/prototypes/toestelproef/rooktest.mjs`, `/home/user/Bookwidgetzzz/public/proef/toestelproef.html`

Test: Draai node tools/prototypes/toestelproef/maak-proef.mjs. Elke ingebedde QR-code moet in node met jsqr de verwachte tekst geven, met de gemeten versie. Draai dan node tools/prototypes/toestelproef/rooktest.mjs met Chromium (--use-fake-device-for-media-stream --use-fake-ui-for-media-stream): de pagina laadt zonder fout, de scanner start en het opslagmerkje is er na herladen. npm run build blijft groen.

### 2. Proef op echte schooltoestellen

Agent: `hoofdsessie`. Hangt af van: 1.

Samen met de ICT-coördinator van de proefschool (de eigenaar gaf zijn akkoord op 2 november 2026), op vier toestellen: een Chromebook van de kleuters of de 1ste graad (gastsessie of klasaccount), een Chromebook van het 3de leerjaar (eigen account), de Windows-laptop van de leerkracht (het toestel van de leerkracht) en het digibord. We gaan vier dingen na.
(1) Hoe de toestellen ingesteld zijn, en of afmelden de opslag wist (de opslagproef).
(2) Of de camera voor het adres van Boosterz zonder vraag mag (VideoCaptureAllowedUrls), en of een webcam van 720p de codes van versie 3, 6 en 10 leest op 6 en 8 px: met BarcodeDetector op ChromeOS en met jsqr op Windows.
(3) Of er een Nederlandse stem is, ook offline.
(4) Welk toestel aan het digibord hangt, en of het een webcam heeft.
De uitkomst komt in docs/BASISONDERWIJS.md. Ze legt twee grenzen vast voor pakket 5: de hoogste QR-versie per deel (voorstel: 10) en het aantal px per module (voorstel: 8).

Bestanden: `/home/user/Bookwidgetzzz/docs/BASISONDERWIJS.md`

Test: De checklist is per toestel ingevuld. Leest de webcam versie 10 op 8 px niet vlot, dan zakt de grens naar versie 7 (224 tekens) en worden de delen in pakket 5 kleiner.

### 3. Het bewijsmodel als geteste code (bouwstap 4)

Agent: `kernbouwer`. Hangt af van: niets.

Pure, geteste code in src/lib/basis/, zonder schermen.
(a) Pakketmanifest: een pakketcode van 3 tekens, een versie, en per versie een vaste lijst van hoogstens 32 bewijzen {id, soort check|oefening|observatie, doel-id, foutpatronen}. Daaruit volgt BEWIJS_PER_DOEL. Een nieuwe versie mag de lijst alleen achteraan aanvullen: controleerPakket weigert herschikken en wissen, in het verlengde van controleerBewijs in de Lichtkamer.
(b) BewijsRecord {kindcode, pakket, versie, bewijsnummer, juist, foutpatroon?, tijd op de minuut, bron {soort toestel|eigen|bord|observatie, toestelId?, toestelnummer?}, duoMet?, naar? (na verplaatsen)}.
(c) Regels: bij een checkvraag telt het vroegste record, bij een oefening en een observatie het laatste. Samenvoegen is idempotent en hangt niet af van de volgorde. De sleutel om te ontdubbelen is kindcode + pakket@versie + bewijs + tijd + toestel.
(d) statusVoor per doel-id zoals in het prototype: toont het, nog wankel, nog niet, nog geen bewijs.
(e) De gegevens van de Lichtkamer (BEWIJS_PER_DOEL en foutpatronen) worden het eerste manifest.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/pakket.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/pakket.test.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/bewijs.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/bewijs.test.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/lichtkamerManifest.ts`

Test: npx vitest run src/lib/basis, met deze gevallen:
- samenvoegen in elke volgorde, en twee keer, geeft dezelfde status;
- een check op twee toestellen: het vroegste uur telt;
- 'nog geen bewijs' is iets anders dan 'nog niet';
- een versie die herschikt, wordt geweigerd;
- de voorbeeldklas van het prototype krijgt dezelfde status als met statusVoor in lichtkamer.html.
Daarna npm run lint en npm run typecheck.

### 4. Klaslijst voor het basisonderwijs en de prentenset

Agent: `bouwer`. Hangt af van: niets.

ClassStudent krijgt drie velden: kindcode (2 tekens uit het alfabet van makeCode, uniek in de klas, het hele jaar vast en nooit hergebruikt), prent (een id uit de vaste set) en kleur. ClassGroup krijgt basis {leest, voornamenOpToestellen, kindcodesGebruikt}. Het klasnummer blijft los van de kindcode.
zetBasisKlaar(klas) vult aan wat ontbreekt en stelt per kind een andere vorm voor; dat lukt tot 30 kinderen, daarboven telt de combinatie van vorm en kleur.
sanitizeClass neemt de nieuwe velden mee en laat kapotte velden weg. Oude klassen blijven ongewijzigd leesbaar.
prenten.ts: ±32 Lucide-iconen, elk met een Vlaamse naam ('de kat', 'de maan') en de naam van het geluidsfragment. Geen emoji, volgens docs/ontwerp/ICONEN.md. Geen vos, want die bestaat niet in lucide-react. De kleuren komen uit de tokens.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/classTypes.ts`, `/home/user/Bookwidgetzzz/src/lib/classes.ts`, `/home/user/Bookwidgetzzz/src/lib/classes.test.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/prenten.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/prenten.test.ts`

Test: vitest, met deze gevallen:
- een klas zonder de nieuwe velden blijft gelijk na sanitizeClass;
- kindcodes zijn uniek, en worden na verwijderen en opnieuw toevoegen niet opnieuw uitgedeeld;
- elk prent-id wijst naar een bestaand icoon in lucide-react;
- geen twee prenten hebben dezelfde naam.
Daarna lint en typecheck.

### 5. De codes WB1 (bewijs) en WK1 (toestelkaart)

Agent: `bouwer`. Hangt af van: 2, 3, 4.

Alles in src/lib/basis/codes.ts.

WB1 (de bewijscode):
- 'WB1.' en een kop van 18 tekens: klascode 6, toestel-id 4, toestelnummer 1, bundelnummer 2, deel 1, van 1, basisdag 3;
- dan '.' en per pakket de pakketcode (3) en de versie (1), gevolgd door de rijen, gescheiden door '-'. Pakketten worden gescheiden door '/';
- op het einde '.' en een controle van 2 tekens.
Een rij bevat de kindcode (2), de tijd (3 tekens, minuten sinds de basisdag), eventueel '*' met de kindcode van het maatje, en dan per bewijs het nummer (1 teken) en de uitkomst (1 teken: J, N, of 2 tot 9 voor een foutpatroon).
Opsplitsen gebeurt in delen van hoogstens 395 tekens (QR versie 10 bij L, of de grens uit pakket 2). Elk deel is op zich geldig, en krijgt een eigen basisdag als de tijdspanne langer is dan 22 dagen.
Het ontvangstteken bestaat uit twee prentjes uit 16, afgeleid uit de controle, het toestel, de bundel en het deel.

WK1 (de toestelkaart):
- 'WK1.' met de klascode, de stand (G gedeeld, E eigen, B bord) en de leesstand;
- dan de pakketten, en per kind de kindcode, het prentje en de kleur;
- op het einde de controle.
Voornamen staan nooit in WK1. Ze komen alleen als apart deel 'n=' in de link.

Decoderen gebeurt met sanering en grenzen, zoals sanitizeSubmission. Een LeerID-link, een WF1-code of een andere QR-code krijgt een vriendelijke weigering.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/codes.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/codes.test.ts`, `/home/user/Bookwidgetzzz/src/lib/qrLimits.ts`

Test: vitest, met deze gevallen:
- coderen en weer decoderen geeft hetzelfde;
- elke code bevat alleen 0-9, A-Z en . / - *, geen spatie, en eindigt niet op . , ; of :;
- splitCodes vindt de code midden in een zin;
- met qrcode (errorCorrectionLevel 'L') blijft elk deel op versie 10 of lager: 1 kind met 7 bewijzen geeft versie 3, 8 kinderen versie 7, 25 kinderen 2 delen;
- één gewijzigd teken faalt op de controle;
- te veel rijen of een te lange code wordt geweigerd.
Daarna lint en typecheck.

### 6. Scanner en QR-code voor een webcam

Agent: `bouwer`. Hangt af van: niets.

QrScanner krijgt:
- een keuze van de camera, uit de lijst van enumerateDevices. Op een laptop of Chromebook is de standaard de camera aan de kant van het scherm (nu staat facingMode op 'environment', r. 117). De keuze wordt per toestel onthouden;
- een gespiegelde weergave met css op het video-element. De beelden die naar BarcodeDetector en jsqr gaan, blijven ongespiegeld;
- een groot kader;
- een instelling om de log zonder namen te houden.
CodeQr krijgt een prop voor het aantal px per module: 8 voor de basiscodes, minstens 6, en kleiner alleen als het scherm smaller is.
qrLimits.ts: het commentaar op r. 2 spreekt van 'alfanumerieke tekens', maar de codes staan in bytemodus. Dat wordt rechtgezet.
Niets hiervan komt op het leerlingpad: beide onderdelen worden lui geladen.

Bestanden: `/home/user/Bookwidgetzzz/src/components/QrScanner.tsx`, `/home/user/Bookwidgetzzz/src/components/CodeQr.tsx`, `/home/user/Bookwidgetzzz/src/lib/qrLimits.ts`, `/home/user/Bookwidgetzzz/src/lib/qrLimits.test.ts`

Test: vitest voor de rekenregel van de breedte: versie 10 op 8 px is 488 px, en op 390 px breed wordt het 6 px. npm run build: het kritieke pad blijft binnen het budget. De bestaande rooktest blijft groen. Een rooktest met Chromium en een nepcamera opent de scanner, kiest een andere camera en toont het gespiegelde beeld zonder fout.

### 7. Het Inleverpunt neemt bewijs aan, met de bewijsopslag bij de leerkracht

Agent: `kernbouwer`. Hangt af van: 3, 5.

De bewijsopslag bij de leerkracht komt in src/lib/basis/bewijsLeerkracht.ts:
- per klas één sleutel 'wf.bewijs.v1.<klasId>' in localStorage, met de records uit pakket 3. Een klas met een jaar bewijs neemt enkele honderden kB in;
- een verplaatsing blijft gelden als dezelfde code later nog eens binnenkomt;
- per toestel 'laatst ontvangen';
- niet in IndexedDB 'wf-files', want die heeft bewust één store zonder versiebump (idb.ts r. 3-8). Wordt het krap, dan komt er een eigen database;
- elke schrijfactie wordt nagekeken (reportWriteFailure). Mislukt ze, dan blijft de code in het tekstvak staan, zoals nu.

In inbox.ts:
- splitCodes en looksLikeCode gebruiken /W(?:FC?|B)1\./ (r. 123 en r. 448);
- processCodes krijgt een tak voor WB1: decoderen, de klas zoeken op klascode, de records toevoegen, en een onbekende kindcode bewaren als 'onbekend kind';
- de logregel heeft geen namen ('Toestel 2: 6 kinderen, 17 bewijzen, 12 nieuw') en toont groot het ontvangstteken, ook na plakken.

In InboxPage noemt de melding op r. 43 ook WB1. Een WK1-code krijgt de melding 'Dit is een toestellink, geen bewijs.'

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/bewijsLeerkracht.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/bewijsLeerkracht.test.ts`, `/home/user/Bookwidgetzzz/src/lib/inbox.ts`, `/home/user/Bookwidgetzzz/src/lib/inbox.test.ts`, `/home/user/Bookwidgetzzz/src/pages/InboxPage.tsx`, `/home/user/Bookwidgetzzz/tests/basis/inleveren.mjs`

Test: vitest, met deze gevallen:
- dezelfde code twee keer geeft 'al aanwezig';
- de volgorde van de delen maakt niet uit;
- een verplaatst bewijs blijft verplaatst na een nieuwe scan;
- een onbekende kindcode wordt bewaard en is toe te wijzen;
- een volle opslag wordt gemeld, en niets valt stil weg;
- WF1 en WFC1 werken zoals voorheen (de bestaande tests).
Rooktest tests/basis/inleveren.mjs: een gezaaide klas, een WB1-code plakken, het rapport en het ontvangstteken zijn zichtbaar, en de log toont geen naam. Daarna lint, typecheck en build.

### 8. De buffer en de stand van het toestel

Agent: `kernbouwer`. Hangt af van: 3, 5.

Alles in src/lib/basis/toestel.ts en buffer.ts.

'wf.basis.toestel.v1' houdt bij:
- de stand (gedeeld, eigen of bord), die uit de toestellink komt;
- de toestelkaart;
- het toestel-id, dat bij elk klaarzetten nieuw is;
- het toestelnummer;
- de vlag 'dit toestel vergeet alles bij afmelden';
- de hoekgroep, de oefening van vandaag, de time-out en duo.

'wf.basis.ik.v1' bestaat alleen bij de stand eigen (klascode en kindcode). Op een gedeeld toestel staat de identiteit alleen in het geheugen, nooit in 'wf.student.v1'.

'wf.basis.bewijs.v1' houdt de stand bij per pakket@versie, kindcode en bewijs, met de regels uit pakket 3, en 'ontvangen in bundel n, deel d'.

Functies:
- legBewijsVast;
- teLeveren: alles zonder ontvangst, als delen via pakket 5;
- bevestig(deel, gekozen prentjes): alleen het juiste teken telt;
- allesOpnieuw: de laatste 14 dagen opnieuw doorgeven;
- afsluiten en wissen: alleen als alles ontvangen is, anders met het aantal erbij;
- telNogNietOntvangen.
Elke schrijfactie wordt nagekeken, en bij het klaarzetten wordt askPersistenceOnce gevraagd.

bewaarModus() geeft drie antwoorden:
- 'gewoon' buiten het basisdeel: niets verandert voor het secundair;
- 'bewijs' op een basistoestel: geen WF1-inzending en geen leesvoortgang;
- 'niets' in de bordweergave (sessionStorage per tabblad, standaard aan) en bij de stand bord.
De module blijft klein en zonder iconen, want PlayerPage importeert ze.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/toestel.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/toestel.test.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/buffer.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/buffer.test.ts`

Test: vitest, met deze gevallen:
- een verkeerd teken markeert niets;
- na bevestigen zit het bewijs niet meer in teLeveren, maar wel nog in de buffer;
- allesOpnieuw brengt het terug;
- wissen weigert als er iets niet ontvangen is;
- een mislukte schrijfactie geeft false en een melding;
- de stand gedeeld schrijft nooit 'wf.basis.ik.v1' of 'wf.student.v1';
- bewaarModus geeft 'gewoon' zonder basistoestel.
Daarna lint en typecheck.

### 9. Toestellinks en klasinstellingen bij de leerkracht

Agent: `bouwer`. Hangt af van: 4, 5, 6.

Een paneel 'Toestellen voor het basisonderwijs' in het klasscherm, lui geladen. Het bevat:
- de klasinstelling 'leest nog niet' of 'leest';
- 'voornamen op de toestellen', dat standaard de leesstand volgt (uit bij 'leest nog niet');
- de prentjes nakijken en wijzigen op een muur (vorm en kleur, met de naam erbij voor de leerkracht);
- drie links met een kopieerknop: voor de eigen Chromebook van elk kind, om een gedeeld toestel klaar te zetten, en voor een bordtoestel.
Elke link heeft een QR-code zonder namen (WK1). Bevat een link voornamen, dan staat erbij: 'Deze link bevat voornamen. Zet hem niet op het bord en niet op een openbare plek.' Het paneel opent pas na de vraag of het scherm op het digibord staat.

Bestanden: `/home/user/Bookwidgetzzz/src/pages/basis/ToestellenPaneel.tsx`, `/home/user/Bookwidgetzzz/src/pages/ClassDashboardPage.tsx`, `/home/user/Bookwidgetzzz/src/styles/basis-klas.css`, `/home/user/Bookwidgetzzz/tests/basis/toestellink.mjs`

Test: Rooktest tests/basis/toestellink.mjs, met deze controles:
- een klas met 3 leerlingen krijgt prentjes na 'Klaar voor het basisonderwijs';
- bij 'leest nog niet' bevat geen enkele link een naam;
- de tekst in een QR-code bevat nooit een naam;
- het scherm heeft één main en één h1, werkt op 390 px zonder horizontaal te scrollen, en alles werkt met het toetsenbord.
Daarna lint, typecheck en build.

### 10. Eigen toestel vanaf het 3de leerjaar

Agent: `bouwer`. Hangt af van: 6, 7, 8, 9.

Lui geladen routes onder #/basis.
- ToestelOpenPage leest de toestellink (ook geplakt of als bestand, zoals ClassOpenPage) en zet de stand.
- Muur.tsx toont tegels met prentje en voornaam (minstens 44 px, en 96 px op een gedeeld toestel), en werkt met pijltjes, Enter en Escape.

Op een eigen toestel:
- het kind tikt zijn naam, krijgt 'Ben jij Amira?', en het toestel onthoudt het in 'wf.basis.ik.v1'. Daarna staat er 'Dag Amira';
- 'Niet jij?' gaat terug naar de muur, nooit naar een vrij naamveld;
- duo met 'Werk je samen?', en de check per kind;
- de oefeningen van de klas krijgen een BewijsContext (kindcode of duo, pakket) en recordSubmission false, dus geen WF1-inzending;
- 'Lever in' (zoals HandInSection, maar met één code): de bewijscode groot, 'Kopieer als tekst', en daarna 'Welke prentjes zie je bij de juf of meester?' (2 × 4);
- bovenaan de band 'Nog niet bij de juf of meester' zolang er iets wacht;
- 'Wat ik al kan' per doel in kindertaal, met 'Werk van andere toestellen staat bij je juf of meester'.
Voor de rooktest is er een klein testpakket met 3 bewijzen. De Lichtkamer zelf komt met bouwstap 5.

Bestanden: `/home/user/Bookwidgetzzz/src/App.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/ToestelOpenPage.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/Muur.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/EigenToestelPage.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/LeverIn.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/BewijsContext.tsx`, `/home/user/Bookwidgetzzz/src/styles/basis-toestel.css`, `/home/user/Bookwidgetzzz/public/basis/testpakket.json`, `/home/user/Bookwidgetzzz/tests/basis/eigen-toestel.mjs`

Test: Rooktest met twee browsercontexten (kind en leerkracht), met deze controles:
- link openen, naam kiezen, en na herladen staat er 'Dag Amira';
- het testpakket legt bewijs vast;
- 'Lever in' geeft een code die in het Inleverpunt van de leerkracht 'nieuw' geeft;
- het juiste teken zet 'ontvangen', een fout teken niet;
- 'wf.student.v1' en 'wf.submissions.v1' blijven leeg;
- één main en één h1, 390 px, toetsenbord.
Daarna lint, typecheck en build. EAGER_ICON_NAMES blijft ongewijzigd, want alles laadt lui.

### 11. Bordweergave die niets bewaart, en een beurt aan het bord

Agent: `bouwer`. Hangt af van: 7, 8.

bewaarModus() uit pakket 8 komt op de drie plekken waar nu bewaard wordt:
- WidgetRunner: recordSubmission alleen bij 'gewoon';
- BlockRenderer (r. 630-658): geen saveSubmission en geen bumpAttemptCount buiten 'gewoon', zoals nu bij preview;
- de leesvoortgang in CourseViewerPage.
Daarbij krijgt een mislukte saveSubmission in de speler (PlayerPage r. 250) en in BlockRenderer een zichtbare melding: 'Niet bewaard. Geef je code door.'

In het basisdeel:
- een balk 'Op het bord', standaard aan en per tabblad. Op het bord staan geen namen, geen muur en geen inleverknop;
- 'Wie komt?' toont een strook prentjes (het aria-label noemt de prentnaam). Na één tik verschijnt de badge 'Beurt: de kat', en die ene oefening gaat naar de bewijsopslag van de leerkracht, met de bron 'bord'. Daarna gaat het bord terug naar Klas samen;
- het overzicht met namen opent pas na 'Staat dit scherm op het digibord?';
- bij de stand bord staat het bord altijd aan, zonder beurten.

Bestanden: `/home/user/Bookwidgetzzz/src/pages/PlayerPage.tsx`, `/home/user/Bookwidgetzzz/src/components/course/BlockRenderer.tsx`, `/home/user/Bookwidgetzzz/src/pages/CourseViewerPage.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/BordBalk.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/BeurtStrook.tsx`, `/home/user/Bookwidgetzzz/src/styles/basis-bord.css`, `/home/user/Bookwidgetzzz/tests/basis/bord.mjs`

Test: Rooktest tests/basis/bord.mjs, met deze controles:
- op het bord een oefening en een cursusoefening maken laat 'wf.submissions.v1', de pogingen en de leesvoortgang ongewijzigd;
- een beurt geeft precies één bewijsrecord, met de bron bord;
- op het bord staat geen naam in de DOM;
- buiten het basisdeel blijft alles zoals nu: tests/smoke.mjs en tests/herstel blijven groen.
npm run build: het kritieke pad blijft binnen het budget. Daarna lint, typecheck en vitest.

### 12. Overzicht per doel, verplaatsen en 'Ik zag het'

Agent: `bouwer`. Hangt af van: 3, 7, 9.

src/lib/basis/overzicht.ts (pure code) en een scherm per klas.
- Per kind en per doel-id: 'toont het', 'nog wankel', 'nog niet' of 'nog geen bewijs', met een vorm en tekst, nooit alleen een kleur.
- De foutpatronen in woorden.
- Bij elk bewijs de bron: 'Toestel 2, 10.42', 'aan het bord', 'eigen toestel', 'gezien door de juf' of 'in duo met …'.
- Een bewijs naar een ander kind verplaatsen (met spoor), een 'onbekend kind' toewijzen, en per toestel 'laatst ontvangen'.
- 'Ik zag het': een raster met prentje en voornaam per kind, voor de bewijzen van de soort observatie. Elke tik schuift verder: toont het, nog wankel, nog niet, leeg. Alleen met het bord uit.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/overzicht.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/overzicht.test.ts`, `/home/user/Bookwidgetzzz/src/pages/basis/KlasoverzichtBasis.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/IkZagHet.tsx`, `/home/user/Bookwidgetzzz/src/pages/ClassDashboardPage.tsx`, `/home/user/Bookwidgetzzz/src/styles/basis-overzicht.css`, `/home/user/Bookwidgetzzz/tests/basis/klasoverzicht.mjs`

Test: vitest, met deze gevallen:
- de statussen per doel kloppen;
- verplaatsen behoudt de bron;
- een kind zonder bewijs krijgt 'nog geen bewijs'.
Rooktest met gezaaide records: de matrix is zichtbaar, verplaatsen werkt, en 'Ik zag het' bewaart een observatie. Eén main en één h1, 390 px, toetsenbord. Daarna lint, typecheck en build.

### 13. Klasbestand, wissen en bewaartermijn

Agent: `kernbouwer`. Hangt af van: 4, 7.

src/lib/basis/klasbestand.ts maakt één bestand per klas. Het bevat de klaslijst (studentId, voornaam, kindcode, prent, kleur, gebruikte kindcodes, klasinstelling) en al het bewijs en de observaties.
- Terug inlezen voegt samen met de regels van pakket 3: twee keer inlezen verandert niets. Dat werkt ook op een tweede toestel van de leerkracht of bij een duobaan.
- Een kapot of vreemd bestand wordt geweigerd, met een duidelijke melding.
- Na 7 dagen zonder back-up komt er een herinnering.
- 'Wis deze klas' wist de klaslijst en het bewijs, na een bevestiging.
- Bewaartermijn: een herinnering in juni, en het voorstel om na 31 augustus te wissen.
PrivacyPage krijgt: wat er bewaard wordt, waar en hoe lang, dat de codes geen namen bevatten, en dat GitHub Pages technische logs met IP-adressen bijhoudt. Daarbij komt een korte tekst om af te drukken voor de GEB van de school.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/klasbestand.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/klasbestand.test.ts`, `/home/user/Bookwidgetzzz/src/pages/basis/KlasbestandPaneel.tsx`, `/home/user/Bookwidgetzzz/src/pages/PrivacyPage.tsx`, `/home/user/Bookwidgetzzz/tests/basis/klasbestand.mjs`

Test: vitest, met deze gevallen:
- bewaren en terugzetten geeft hetzelfde;
- twee keer samenvoegen geeft hetzelfde;
- de kindcodes blijven gelijk na terugzetten;
- een bestand van een andere klas of een kapot bestand wordt geweigerd.
Rooktest: bewaren, de klas wissen en terugzetten; daarna is het overzicht gelijk. Daarna lint, typecheck en build.

### 14. Gedeeld klastoestel voor de kleuters en de 1ste graad

Agent: `bouwer`. Hangt af van: 8, 10.

src/lib/basis/beurt.ts beschrijft het verloop van een beurt als pure toestand: muur, bevestigen, werken, 'Ga verder', 'Ben je er nog?' en terug. De time-out is 2 minuten en dan nog 1 minuut, langer of uit te zetten.

GedeeldToestelPage:
- de muur met tegels van minstens 96 px (alleen prentjes bij 'leest nog niet') en de hoekgroep;
- de bevestiging met het prentje groot, en hoogstens 3 tikken;
- terug naar de muur na elke oefening, met bovenaan 'Ga verder';
- 'Ik ben klaar' altijd zichtbaar, het vinkje 'was er al', en duo met de check per kind;
- de identiteit alleen in het geheugen van de pagina;
- 'Voor de juf of meester': een gewone knop zonder drempel. De bewijscode komt in delen met 'volgende', 'Kopieer als tekst', 'Bewaar als bestand' en het ontvangstteken;
- de band 'Nog niet bij de juf of meester: N kinderen' staat er altijd, en komt groot na elke beurt bij de vlag 'vergeet alles bij afmelden';
- een drempel (de klascode typen, ook met het toetsenbord) voor de instellingen, de oefening van vandaag, wissen, afsluiten en 'Alles opnieuw doorgeven';
- geen links naar /voortgang of de hub;
- in de prikkelarme stand geen animatie en geen piep.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/beurt.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/beurt.test.ts`, `/home/user/Bookwidgetzzz/src/pages/basis/GedeeldToestelPage.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/Muur.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/VoorDeJuf.tsx`, `/home/user/Bookwidgetzzz/src/pages/basis/Drempel.tsx`, `/home/user/Bookwidgetzzz/src/styles/basis-toestel.css`, `/home/user/Bookwidgetzzz/tests/basis/gedeeld-toestel.mjs`

Test: vitest voor het beurtverloop: time-out, herladen, terug na elke oefening en duo.
Rooktest, met deze controles:
- twee kinderen na elkaar: het bewijs staat bij twee kindcodes;
- herladen geeft de muur;
- met nep-timers komt de vraag 'Ben je er nog?', en daarna de muur;
- pijltjes, Enter en Escape werken;
- de tegels zijn minstens 96 px;
- bij 'leest nog niet' staat er geen naam in de DOM;
- één main en één h1, 390 px.
Daarna lint, typecheck en build.

### 15. Inspreeklijst: prentnamen en vaste zinnen in kindertaal

Agent: `inhoudschrijver`. Hangt af van: 4.

De tekst van alles wat voorgelezen wordt, kort en in Vlaams kindertaal: de namen van de prentjes ('de kat') en de vaste zinnen. Bijvoorbeeld: 'Wie werkt? Tik op je prentje.', 'Ben jij de kat?', 'Ja, dat ben ik', 'Ga verder', 'Ik ben klaar', 'Ben je er nog?', 'Goed gewerkt. Geef het toestel door.', 'Welke prentjes zie je bij de juf of meester?' en 'Nu de kat'. Elk fragment krijgt een id. Het formaat is een JSON-lijst {id, tekst, waar}. De nakijker leest na op eenvoud en Vlaams, en de rechter beslist bij twijfel.

Bestanden: `/home/user/Bookwidgetzzz/public/basis/geluid/inspreeklijst.json`, `/home/user/Bookwidgetzzz/src/lib/basis/inspreeklijst.test.ts`

Test: vitest, met deze gevallen:
- elk prent-id en elke zin-id die de code gebruikt, staat in de lijst, en omgekeerd;
- geen zin is langer dan 10 woorden;
- er staat geen emoji in.
Daarna kijkt de nakijker na.

### 16. Voorlezen met opgenomen geluid

Agent: `bouwer`. Hangt af van: 10, 15.

src/lib/basis/voorlezen.ts kiest in deze volgorde:
1. het opgenomen fragment (public/basis/geluid/<id>.mp3 of .ogg);
2. is dat er niet, de stem van het toestel (nl-BE, dan nl-NL). Die dient vooral voor een voornaam;
3. anders blijft het stil, zonder fout.
De muur en de vragen krijgen een knop 'Hoor het nog eens'. In de prikkelarme stand leest niets vanzelf voor, en het tempo volgt de voorleesinstelling van A11yMenu. De fragmenten komen in de precache van de service worker, zodat ze ook offline werken (sw.js wordt niet hernoemd). Voor het inspreken zorgt de eigenaar zodra de rest klaar is (antwoord van 2 november 2026); tot dan dient de stem van het toestel, of blijft het stil.

Bestanden: `/home/user/Bookwidgetzzz/src/lib/basis/voorlezen.ts`, `/home/user/Bookwidgetzzz/src/lib/basis/voorlezen.test.ts`, `/home/user/Bookwidgetzzz/src/pages/basis/Muur.tsx`, `/home/user/Bookwidgetzzz/src/offline/serviceWorker.js`, `/home/user/Bookwidgetzzz/public/basis/geluid/`

Test: vitest met een nagebootste speechSynthesis en Audio: eerst het fragment, dan de stem, dan stil; in de prikkelarme stand leest niets vanzelf voor. Rooktest: een tik op een prentje start het juiste fragment. De build blijft groen, en dist/sw.js wordt nog gemaakt.

## Harde eisen van de rechters

### Lens klaspraktijk

- Op een gedeeld toestel blijft niemand aangemeld na zijn beurt. De identiteit staat alleen in het geheugen van de pagina, nooit in 'wf.student.v1'. Het toestel gaat terug naar 'Wie werkt?' na elke oefening, na 'Klaar', na herladen en na een time-out. Vóór de terugzet vraagt het 'Ben je er nog?', met de prent en geluid.
- Een kleuter of een kind van de 1ste graad meldt zich aan zonder te lezen, te typen of de camera te gebruiken: prent (vorm) plus kleur, tegels van minstens 96 px, hoogstens 3 tikken per beurt, en opgenomen geluid voor de prentnamen en de vaste zinnen. Scannen is altijd een extra, nooit de enige weg.
- Er gaat nooit stil iets verloren. 'Niets bewaren' (gast) staat niet als tegel op het kiesscherm van een kind en is altijd zichtbaar als het aanstaat. Op een gedeeld toestel staat altijd 'Nog niet bij de juf of meester: N kinderen'. Een mislukte schrijfactie wordt gemeld, en de terugwaarde van het bewaren wordt nagekeken (niet zoals PlayerPage r. 250).
- Inleveren mag twee keer gebeuren en herstelt zichzelf. Een bundel bevat alles wat de leerkracht nog niet bevestigde. Dezelfde of een oudere bundel opnieuw scannen verandert niets, en een gemiste scan komt met de volgende bundel mee. Niets valt uit een bundel door alleen een tik van een kind.
- De ontvangst wordt bevestigd van de kant van de leerkracht (een ontvangstteken of iets gelijkaardigs) voor een toestel iets mag afsluiten of wissen. Afsluiten en wissen staan achter een drempel die een kind niet per ongeluk neemt, en die ook met het toetsenbord werkt (geen actie die alleen met lang indrukken kan).
- De codes zijn kort en in de klas te scannen. Ze gebruiken alleen tekens uit de alfanumerieke QR-set, zonder spatie, en mogen niet eindigen op . , ; of :, want splitCodes in src/lib/inbox.ts (r. 120-121) knipt op witruimte en haalt die tekens achteraan weg. Het voorvoegsel komt bij in het patroon /WFC?1\./ (r. 123 en r. 448). Per QR hoogstens versie 10. Wat groter is, wordt opgesplitst in delen die elk op zich geldig zijn. De code staat standaard op minstens 6 px per module.
- Er is altijd een weg zonder camera: de code als tekst plakken, een bestand (USB-stick), of het overzicht van één toestel bekijken bij de leerkracht.
- Per les kost het de leerkracht weinig: verzamelen in hoogstens 30 seconden per toestel (±2 minuten voor 4 toestellen). Op een klasaccount dat niets wist, zet ze een toestel één keer klaar. In een gastsessie kost het hoogstens 30 seconden per toestel per dag (met een startlink zonder namen).
- Het digibord toont geen namen, bewaart niets (recordSubmission={false}, zoals bewijs() in de Lichtkamer) en heeft geen inleverknop. Het klasoverzicht met namen opent pas na een bevestiging dat het scherm niet geprojecteerd wordt. Staat het Inleverpunt op het bord, dan toont de log alleen aantallen en prentjes.
- Een verkeerd gekozen kind is recht te zetten. Bij elk bewijs staat de bron (toestel of bord, uur, duo of alleen), en de leerkracht kan het naar een ander kind verplaatsen. Van een kind zonder bewijs toont het overzicht 'nog geen bewijs', nooit 'nog niet'.
- In geen enkele code staat een naam. Op gedeelde toestellen staat nooit een achternaam, en bij de kleuters standaard ook geen voornaam. Alleen het toestel van de leerkracht zet een kindnummer om naar een kind. Het kindnummer blijft het hele schooljaar hetzelfde en is niet het klasnummer.
- De app werkt ook als alles bij het afmelden gewist wordt. De leerkracht duidt per toestel aan 'dit toestel vergeet alles bij afmelden', en dan krijgt elke beurt een duidelijke herinnering om in te leveren. De lokale opslag is een buffer; bij de leerkracht staat het echte geheel.
- Vanaf de 2de graad meldt het kind zich één keer per profiel en per toestel aan (klaslijst of kaart). 'Niet jij?' gaat terug naar de klaslijst of de kaart, nooit naar een vrije naam zonder studentId. Eén knop 'Lever in' geeft alles in één code. Dit moet ook lopen op 4 gedeelde Chromebooks met eigen accounts, waar het werk over toestellen verspreid staat en pas bij de leerkracht samenkomt.
- Er komt een herstelbare back-up bij de leerkracht (klaslijst met kindnummers en prentjes, plus het bewijs), met een herinnering elke week. Zonder die koppeling zijn na het wissen alle codes waardeloos.
- Toegankelijkheid: in het raster pijltjestoetsen, Enter en Escape; een prikkelarme stand zonder automatisch voorlezen en zonder piep; een time-out die langer kan of helemaal uit; één main en één h1; werkt op 390 px; in de schermteksten 'oefening'.
- Een pakket nummert zijn bewijzen nooit opnieuw: per versie wordt de lijst alleen achteraan aangevuld, en het toestel van de leerkracht kan oude versies blijven lezen.
- Vóór er gebouwd wordt, volgt een proef op echte schooltoestellen: een QR van versie 3 tot 10 scannen vanaf een Chromebookscherm met de webcam van de laptop (ChromeOS en Windows), de Nederlandse stem, een gastsessie tegenover een klasaccount, en de camera die de beheerder toelaat. Kijk ook na welk toestel aan het bord hangt en of het een webcam heeft.

### Lens techniek en privacy

- De identiteit hangt af van de toestelstand die de leerkracht instelt (gedeeld toestel, eigen profiel of digibord), niet van een leerjaar dat de app zou raden. Op een gedeeld toestel staat de identiteit alleen in het geheugen van de pagina, nooit in 'wf.student.v1'. Ze wordt gewist na elke oefening, na 'Ik ben klaar' en na de time-out, en bij elke nieuwe oefening volgt een bevestiging. Alleen op een eigen profiel (vanaf het 3de leerjaar) mag de keuze blijven staan.
- In het basisdeel nooit een vrije naam zonder studentId. 'Ik sta er niet bij' wordt 'Speel als gast' (niets bewaard). 'Niet jij?' gaat terug naar de muur, de kaart of de klaslijst, niet zoals nu in PlayerPage.tsx r. 393-400, waar de klasidentiteit gewist wordt en een vrij tekstveld volgt.
- De nieuwe codes bevatten geen naam, alleen hoofdletters, cijfers en tekens uit de alfanumerieke QR-set, zonder spatie, met een controleteken op het einde. Ze mogen nooit eindigen op een punt, komma, puntkomma of dubbelpunt. splitCodes (inbox.ts r. 121) knipt die tekens weg en splitst op witruimte, ook bij een scan (InboxPage.tsx r. 63-64). Het voorvoegsel komt in het patroon van inbox.ts r. 123 en in de melding van InboxPage.tsx r. 43. Decoderen gebeurt met sanering, grenzen en unittests, zoals sanitizeSubmission.
- Een QR komt nooit boven versie 11 bij foutcorrectie L (±450 alfanumerieke tekens; 428 tekens is versie 11, nagemeten). Een grotere bundel wordt opgesplitst in delen die elk op zich geldig zijn, en staat standaard vergroot. Versies worden gemeten met errorCorrectionLevel 'L', zoals in CodeQr.tsx r. 14, niet met de standaard M van de bibliotheek.
- Inleveren verdraagt herhaling en verliest niets. Opnieuw scannen geeft hoogstens 'dubbel', een gemiste scan herstelt zich met de volgende bundel, en er wordt ontdubbeld op toestel plus bundelnummer. Op een toestel wordt pas gewist of afgesloten na een bevestiging die van de leerkracht komt, nooit na een vinkje dat het kind zet. De tijd per bewijs blijft bewaard, zodat 'eerste telt' en 'laatste telt' over toestellen heen kloppen.
- Elke schrijfactie wordt gecontroleerd. Een volle opslag wordt gemeld en niet genegeerd, zoals nu in PlayerPage.tsx r. 250 en BlockRenderer.tsx r. 658. Bij het instellen van een toestel vraagt de app persist(). Er is een teller 'nog niet bij de juf of meester' en een vlag 'dit toestel vergeet alles bij afmelden', met een herinnering. Het kind ziet nooit 'je bent alles kwijt'.
- Het toestel van de leerkracht is de bron, met een back-upbestand van de klaslijst (vaste kindcodes, prentjes, studentId) én van het ontvangen bewijs, dat ze terug kan inlezen en samenvoegen. Verder: bewijs naar een ander kind verplaatsen met de bron erbij (hoek, bord, eigen toestel of observatie), 'alles van deze klas wissen', en een bewaartermijn met een herinnering.
- De digibordstand bewaart echt niets. Dat geldt voor WidgetRunner (recordSubmission false), voor de oefeningen in cursussen (BlockRenderer.tsx r. 630-658: saveSubmission en bumpAttemptCount), voor de leesvoortgang en voor bewijs() in de Lichtkamer. Het bord toont geen namen. Het klasoverzicht en een log met namen verschijnen alleen na een bevestiging.
- Privacy. Op gedeelde toestellen staat hoogstens een voornaam (bij kleuters standaard geen), nooit een achternaam, foto of geboortedatum. Een QR met namen komt nooit op het bord of op een openbare plek. Codes met kindcodes zijn gepseudonimiseerde persoonsgegevens, dus er komt een korte tekst voor de GEB van de school, en de school blijft verwerkingsverantwoordelijke. Op een gedeeld toestel zijn /voortgang, de hub en 'wat ik al kan' verborgen. Moet het bewijs naar buiten (export, rapport, leerlingvolgsysteem), dan komt er eerst een nieuwe beoordeling.
- De openbare pakketten staan los van de klaslijst, zonder leerlinggegevens. Hun lijst bewijzen kan per versie alleen achteraan groeien, en het toestel van de leerkracht leest ook oude versies. Op het leerlingpad wordt niets van een CDN geladen: three.js, de prentjes en de geluidsfragmenten zitten in de eigen bundel of in het openbare pakket. Nieuwe iconen op het leerlingpad komen in EAGER_ICON_NAMES, of de pagina laadt lui.
- Scannen is nooit de enige weg: aantikken, plakken (InboxPage) en een bestand blijven altijd mogelijk. De scanner krijgt een keuze voor de camera, want nu staat facingMode op ideal 'environment' (QrScanner.tsx r. 117). Alleen de weergave wordt gespiegeld, niet het beeld dat naar BarcodeDetector of jsQR gaat.
- Toegankelijkheid. Tegels van minstens 96 px voor kleuters en tikdoelen van minstens 44 px overal. De muur werkt met de pijltjestoetsen en Enter. Er is geen lang indrukken zonder toetsenbordweg. Voorlezen werkt met opgenomen fragmenten, zonder te rekenen op een stem van het toestel. Er is een prikkelarme stand. Elk scherm heeft één main en één h1 en werkt op 390 px breed. In de schermen staat 'oefening'.
- Eerst een proef op echte schooltoestellen, voor de codes vastliggen (werkwijze, regel 11): een QR van versie 4 tot 11 scannen vanaf een Chromebookscherm met een webcam van 720p, zowel met BarcodeDetector op ChromeOS als met jsqr op 640 px op Windows. Daarnaast de cameravraag en het wissen in een gastsessie, en de Nederlandse stem.

## Risico's en maatregelen

- **Bewijs verdwijnt stil van een gedeeld toestel of een eigen profiel: door een gastsessie, de ephemeral mode, gewiste sitegegevens of een volle schijf.** Inleveren na elke hoekenronde en elke les. De band 'Nog niet bij de juf of meester: N kinderen' is altijd zichtbaar, en de vlag 'vergeet alles bij afmelden' maakt er een herinnering van na elke beurt. Bij het klaarzetten vraagt de app persist(). Pakket 2 zoekt uit hoe de toestellen ingesteld zijn.
- **Werk komt bij het verkeerde kind: een verkeerd prentje, een vergeten 'Ik ben klaar', een grap of een duo.** Terug naar de muur na elke oefening, met een bevestiging, het vinkje 'was er al' en 'Ben je er nog?'. Bij elk bewijs staat de bron, en de leerkracht kan het verplaatsen in het overzicht. 'In duo' blijft zichtbaar, en de check gebeurt per kind.
- **Scannen met de webcam lukt slecht, of de camera is geblokkeerd (door de beheerder, het schuifje of een vraag om toestemming).** Korte codes van hoogstens versie 10, op 8 px per module, met een camerakeuze en een gespiegeld beeld. Eerst een proef op echte toestellen: ChromeOS met BarcodeDetector, en Windows met jsqr op 640 px. Plakken of een bestand blijft altijd mogelijk. Het leerlingtoestel heeft nooit een camera nodig.
- **Een gegokt of per vergissing gekozen ontvangstteken haalt bewijs uit de volgende code.** Twee prentjes na elkaar, dus de kans om te gokken is 1 op 16. Bevestigen wist niets. 'Alles opnieuw doorgeven' toont de laatste 14 dagen opnieuw. Afsluiten kan pas als alles ontvangen is, en alleen achter de drempel.
- **De opslag van de leerkracht wordt gewist, of ze scant soms met een ander toestel. Dan zijn de koppeling van kindcode naar kind en het ontvangen bewijs weg.** Een klasbestand met een herinnering elke week. Terugzetten voegt samen, ook voor een tweede toestel of een duobaan. Bewijs met een onbekende kindcode wordt bewaard en is toe te wijzen. Het Inleverpunt hoort op één vast toestel.
- **Een pakket van de scholengroep verandert, en de bewijsnummers in oude codes wijzen naar het verkeerde bewijs.** Per versie mag de lijst bewijzen alleen achteraan groeien, tot hoogstens 32. controleerPakket (pakket 3) weigert herschikken. De leerkracht kan oude versies blijven lezen.
- **Namen lekken: een toestellink met voornamen belandt op het bord, in een openbare plek of op een foto.** QR-codes en bewijscodes bevatten nooit een naam, en bij de kleuters staan er geen namen op de toestellen. Een link met voornamen krijgt een waarschuwing. Het overzicht met namen opent pas na de vraag over het bord. Er komt een GEB-tekst voor de school.
- **Op de Chromebook is er geen Nederlandse stem, of ze werkt niet offline.** Opgenomen fragmenten voor de prentnamen en de vaste zinnen, in het openbare pakket en offline via de service worker. De stem van het toestel dient alleen voor een voornaam. Zonder geluid werkt alles nog met de prentjes.
- **De klokken van de toestellen lopen uiteen, waardoor 'eerste telt' over toestellen heen fout kan uitvallen.** Een tijd per beurt in de code, op de minuut. Chromebooks zetten hun klok via het netwerk, en de leerkracht ziet bij elk bewijs de bron en het uur. Het risico is klein, want een kind maakt de check zelden twee keer op twee toestellen.
- **Het toestel aan het digibord is een gedeelde pc zonder webcam, die 's nachts teruggezet wordt.** Die pc krijgt de stand 'bordtoestel' en bewaart niets. De bron en het Inleverpunt staan op de eigen laptop van de leerkracht (vraag 1). Plakken blijft de terugval.
- **Er is veel nieuw te bouwen, en de bouw loopt uit voor de proefklas er iets aan heeft.** Eerst de proef en wat het 3de leerjaar nodig heeft (pakketten 1 tot 13), pas daarna de gedeelde toestellen en het geluid. Inleverpunt, scanner, CodeQr en klaslijst worden hergebruikt, en er is maar één codesoort voor bewijs.
- **Kleuters kennen hun prentje in september nog niet.** Waar het kan, is het prentje hetzelfde als het kapstoksymbool. De eerste week doet de leerkracht het voor in de kring, en een hoekgroep zet minder tegels op de muur.

