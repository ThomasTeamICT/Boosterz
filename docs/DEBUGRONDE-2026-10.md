# Grondige debugronde (oktober 2026)

Op vraag van de eigenaar, na het samenstellen van doelenlijsten (docs/LEERPLANNEN.md § 15). Acht
reviewers liepen elk een deel van de app na, in de code en in de echte browser; per stapel
beoordeelt een rechter elke bevinding en probeert ze te weerleggen. Alleen bevestigde punten worden
opgelost, in pakketten die elkaars bestanden niet raken, ernstigste eerst.

## Stand van zaken (bijgewerkt 6 oktober 2026, 02:30)

| Wat | Stand |
|---|---|
| Reviews (8 domeinen, ±127 kandidaat-bevindingen) | **Klaar.** Leerlingpad en delen (15), oefeningen en verbeteren (15), klassen en resultaten (15), cursussen en materiaal (15), opslag/import/offline (15), AI-functies (15), beveiliging en privacy (12), toegankelijkheid en taal over de hele app (20). |
| Uitspraken van vijf rechters | **Klaar.** Bijna alles bevestigd; weerlegd: OP15 (html-import kwadratisch), CU9 (luie afbeeldingen bij afdrukken), CU10 (onbekend widgettype); enkele punten zijn een ontwerpgrens (zie onder). Hoog: V1 (`javascript:`-links), OP1 (IndexedDB), AI1 (afkappen bij herwerken), LL1 (deadline sluit lopend werk af), KL1 (voortgangscodes van een tweede toestel), W1 (optie verwijderen verschuift het juiste antwoord), CU1 (afgedrukte toets verklapt antwoorden), A11Y1 (skiplink), A11Y2 (resultaten niet met het toetsenbord). |
| **Klaar en live** | IndexedDB eerlijk bewaren (OP1, OP5); beveiliging van links en bestanden (V1, V7, V9); afgedrukte toets (CU1); doelscores, pogingen en klasfilter in de bibliotheek (KL3–KL7); tekst importeren (OP6–OP9); AI bij cursussen (AI1, AI2, AI5, AI6, AI10, AI9-cursus); AI-verbinding en instel-link (V2, AI3, AI4, AI8, AI13–AI15); quiz-editor en verbeteren (W1, W2, W7–W10, W13–W15, V4); woordspellen (W3, W4, W12); leerlingscherm (LL1, LL4, LL5, LL7, LL8, LL11, LL14); leerlinghub en Mijn voortgang (LL2, LL6); schil en dialogen (A11Y1, A11Y3–A11Y5, A11Y15); centrale css en tikdoelen (A11Y8a, A11Y9, A11Y16, CU6, KL10); QR van de deellink (LL10); toetsenbord voor woordzoeker en zoek-de-verschillen (A11Y7); overige spellen (W5, W6, W9–W15 in koppelspel, memory, bingo, flitskaarten, tijdlijn, hotspot, checklist, peiling, rekenen, carrousel, whiteboard); lidwoorden bij nieuwe widgets (A11Y18); leesbare accentkleur op het leerlingscherm (W15d). |
| Bezig | Gedeelde inhoud, klaspakketten en voortgangscodes (KL1, KL2, LL3/CU5, V3, LL9, LL12, LL13, CU4, CU7, CU11, CU15a), resultatenschermen (A11Y2/KL8, A11Y14, KL3, KL5, KL7, KL11–KL15), klasdashboard en klassen (KL4, KL5, KL9, KL11, KL14), cursuslezer (CU12–CU15, LL1 in cursussen, A11Y11, A11Y12), CSP + lettertypes zelf hosten + YouTube zonder cookies + eerlijke privacypagina (V1-CSP, V5, V6, OP13), AI bij widgets (AI7, AI9, AI11, AI12). |
| Wacht | Widget-editor en import (OP2–OP4, OP10, OP11, OP14) en cursuseditor (CU2, CU3, CU7-scherm, CU15c, CU15e): na het pakket gedeelde inhoud, omdat ze dezelfde opslag raken. |
| Werkwijze | Elk pakket in een eigen worktree, alleen eigen bestanden; de hoofdsessie neemt over, bouwt en test in een schone kopie (lint, typecheck, unittests, build met bundelbudget, volledige rooktest) en zet pas dan online. Nieuwe browsertests van de herstelpakketten staan in `tests/herstel/`. |

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
