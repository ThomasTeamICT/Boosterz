# Grondige debugronde (oktober 2026)

Op vraag van de eigenaar, na het samenstellen van doelenlijsten (docs/LEERPLANNEN.md § 15). Acht
reviewers liepen elk een deel van de app na, in de code en in de echte browser; per stapel
beoordeelt een rechter elke bevinding en probeert ze te weerleggen. Alleen bevestigde punten worden
opgelost, in pakketten die elkaars bestanden niet raken, ernstigste eerst.

## Stand van zaken (bijgewerkt 6 oktober 2026, avond)

| Wat | Stand |
|---|---|
| Reviews (8 domeinen, ±127 kandidaat-bevindingen) | **Klaar.** Leerlingpad en delen (15), oefeningen en verbeteren (15), klassen en resultaten (15), cursussen en materiaal (15), opslag/import/offline (15), AI-functies (15), beveiliging en privacy (12), toegankelijkheid en taal over de hele app (20). |
| Uitspraken van vijf rechters | **Klaar.** Bijna alles bevestigd; weerlegd: OP15 (html-import kwadratisch), CU9 (luie afbeeldingen bij afdrukken), CU10 (onbekend widgettype); enkele punten zijn een ontwerpgrens (zie onder). Hoog: V1 (`javascript:`-links), OP1 (IndexedDB), AI1 (afkappen bij herwerken), LL1 (deadline sluit lopend werk af), KL1 (voortgangscodes van een tweede toestel), W1 (optie verwijderen verschuift het juiste antwoord), CU1 (afgedrukte toets verklapt antwoorden), A11Y1 (skiplink), A11Y2 (resultaten niet met het toetsenbord). |
| **Klaar en live** | IndexedDB (OP1, OP5); beveiliging van links en bestanden (V1, V7, V9); CSP, eigen lettertypes, YouTube zonder cookies, eerlijke privacypagina en wissen (V1-CSP, V5, V6, OP13); afgedrukte toets (CU1); doelscores, pogingen en klasfilter (KL3–KL7); tekst importeren (OP6–OP9); AI bij cursussen (AI1, AI2, AI5, AI6, AI10, AI9); AI-verbinding en instel-link (V2, AI3, AI4, AI8, AI13–AI15); AI bij widgets (AI7, AI9, AI11, AI12); quiz-editor en verbeteren (W1, W2, W7–W10, W13–W15, V4); woordspellen en overige spellen (W3–W6, W9–W15); leerlingscherm (LL1, LL4, LL5, LL7, LL8, LL11, LL14); leerlinghub (LL2, LL6); schil en dialogen (A11Y1, A11Y3–A11Y5, A11Y15); centrale css (A11Y8a, A11Y9, A11Y16, CU6, KL10); QR (LL10); toetsenbord voor woordzoeker en zoek-de-verschillen (A11Y7); resultatenschermen (A11Y2/KL8, A11Y14, KL3, KL5, KL7, KL11–KL15); klassen (KL4, KL5, KL9, KL11, KL14); cursuslezer (CU12–CU15, LL1, A11Y11, A11Y12, A11Y19); lidwoorden (A11Y18); leesbare accentkleur (W15d). |
| **Klaar en live (tweede golf)** | Gedeelde inhoud, klaspakketten en voortgangscodes (KL1, KL2, LL3/CU5, V3, LL9, LL12, LL13, CU4, CU7, CU11, CU15a), na een eigen review hersteld (H1: S1, S3, G4, G1, G7, S7c, S9, door de rechter gecontroleerd; H2: G5, G8, G14, G15, S2 voor resultaatcodes, S4); cursuseditor (CU2, CU3, CU7, CU14, CU15c, CU15e) en widget-editor en import (OP2–OP4, OP10, OP11, OP14, W5, G3), elk met een eigen review en rechter en de herstelpakketten P1 (geen media wissen die een ander tabblad toont: E1, B1, E3), P2 (E2, E3, E5, E6, E8, B4), P3 (B1, B4, B5, B6, B8a, B9), P4 (B2, B3, B7, B8b, H1-N1) en P5 (bevestigingsvensters voor schermlezers); eerlijke meldingen bij volle opslag op de overige plaatsen (G8). |
| Bezig | Niets. |
| Later | In `courses.ts`: klokverschil bij gedeelde versies (G10), grenzen op cursuslinks en voortgangscodes (S2-rest, S10), dubbele deelcodes van binnenkomende inhoud (S5, vraagt een ontwerp). Voortgang op naam over klassen heen (nieuw 3, ontwerpbeslissing). Kleiner: `CoursesPage` meldt "bijgewerkt" bij een identiek bestand over een zuivere kopie (spiegelbeeld van H1-N1); een veld in `AdoptResult` met de uitgevoerde actie per onderdeel zou de importmeldingen exact maken; de cursuseditor toont "Bijgewerkt uit een ander tabblad" nog maar 1,2 s (de widget-editor laat het staan). |
| Werkwijze | Elk pakket in een eigen worktree, alleen eigen bestanden; de hoofdsessie neemt over, bouwt en test in een schone kopie (lint, typecheck, unittests, build met bundelbudget, volledige rooktest) en zet pas dan online. Pakketten die de opslag van werk raken, krijgen eerst een eigen review en rechter. Nieuwe browsertests staan in `tests/herstel/`. |

## Gedeelde inhoud: ontwerpgrenzen (rechter, oktober 2026)

- **Rest van S1.** Wat via een deellink of klaspakket binnenkwam ("zuivere kopie" in het register
  `wf.gedeeld.v1`), wordt stil bijgewerkt door een nieuwere versie met dezelfde id's. Een klasgenoot
  met een echte link kan zo een kopie op een leerlingtoestel vervangen. Links zijn niet ondertekend
  (geen server), en een vraag zou een leerling toch met "Bijwerken" beantwoorden. Eigen werk en
  kopieën uit een bestand of het voorbeeld worden nooit stil vervangen.
- **G6.** Een oude gedeeltelijke cursuslink kan een hoofdstuk terugzetten dat de bron intussen
  verwijderde. Herstellen zou het geval breken waarin een leerling links in een andere volgorde opent.
- **G9.** Een klaspakket heeft geen versie: een oude klaslink zet het bewaarde pakket terug.
- **G12.** Gedeelde inhoud van vóór oktober 2026 heeft geen register en telt als eigen werk: de
  eerste nieuwere versie geeft eenmalig een vraag in plaats van een stille update.
- **S6.** Een gecomprimeerde code kan bij het uitpakken veel groter worden (alle deelcodes). Bestond
  al; de nieuwe grenzen op resultaatcodes (H2) beperken wat er bewaard wordt.
- **S7b.** Een pdf uit een cursusbestand wordt niet op `%PDF-` gecontroleerd; ze wordt altijd als
  `application/pdf` bewaard en nooit als pagina geopend.
- **Editors (rechter, oktober 2026).** Twee tabbladen die binnen enkele milliseconden tegelijk
  bewaren, kunnen elkaar nog overschrijven (E4; sluitend maken vraagt een asynchroon slot bij elk
  bewaren). Weggaan met een open conflict bewaart je werk als kopie "(mijn versie)" (E7): liever
  een kopie te veel dan stil verlies. Zolang twee app-tabbladen open zijn, worden losse
  mediabestanden niet opgeruimd (P1); dat gebeurt bij de volgende opstart met één tabblad.
- **Gevolg van S1 dat zo afgesproken is:** een niet-aangepaste voorbeeldoefening krijgt bij een
  nieuwere voorbeeldbundel geen stille update meer.

## Beveiliging en privacy: uitspraak

- **V1 (hoog), bevestigd.** Een `javascript:`-URL in gedeelde inhoud (pdf-blok van een cursus,
  `pdfUrl` van een gesplitst werkblad, bijlage) werd uitgevoerd in de app en kon localStorage lezen,
  ook de AI-sleutel. Wegen: cursuslink (zonder klik), widgetlink, klaspakket, JSON-import,
  AI-uitvoer. Herstel: URL-schema's controleren bij binnenkomst en bij gebruik; daarna een
  Content-Security-Policy als tweede linie.
- **Bevestigd (middel/laag):** instel-link met `auto=1` vervangt stil de AI-sleutel (V2); een
  klaspakket overschrijft een eigen cursus zonder vraag (V3); CSV-injectie in exports (V4); de
  privacypagina belooft "niets naar het internet" terwijl Google Fonts en YouTube geladen worden
  (V5); "leerlinggegevens wissen" laat ingeleverde bestanden staan (V6); een SVG- of html-bestand
  wordt een blob die script uitvoert bij "openen in nieuw tabblad" (V7); een id `__proto__` laat
  het leesscherm crashen (V9).
- **Ontwerpgrens (geen herstel nu):** een embedkader laadt meteen (nodig voor Google Forms en
  GeoGebra; de app zelf is afgeschermd); localStorage gedeeld met andere sites onder
  thomasteamict.github.io (afspraak: daar geen onbetrouwbare HTML publiceren); resultaatcodes zijn
  niet ondertekend (de antwoorden staan toch al in de deellink); geen rollen op een gedeeld toestel.
