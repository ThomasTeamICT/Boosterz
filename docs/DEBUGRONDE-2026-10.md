# Grondige debugronde (oktober 2026)

Op vraag van de eigenaar, na het samenstellen van doelenlijsten (docs/LEERPLANNEN.md § 15). Acht
reviewers liepen elk een deel van de app na, in de code en in de echte browser; per stapel
beoordeelt een rechter elke bevinding en probeert ze te weerleggen. Alleen bevestigde punten worden
opgelost, in pakketten die elkaars bestanden niet raken, ernstigste eerst.

## Stand van zaken (bijgewerkt 6 oktober 2026)

| Wat | Stand |
|---|---|
| Reviews (8 domeinen, ±120 kandidaat-bevindingen) | **Klaar.** Leerlingpad en delen (15), oefeningen en verbeteren (15), klassen en resultaten (15), cursussen en materiaal (15), opslag/import/offline (15), AI-functies (15), beveiliging en privacy (12), toegankelijkheid en taal over de hele app (20). |
| Rechter beveiliging en privacy | **Klaar.** 8 bevestigd (1 hoog), 4 ontwerpgrens. |
| Rechters leerlingpad + klassen, oefeningen + cursussen, opslag + AI, toegankelijkheid | Bezig. |
| Herstel V1 (hoog): `javascript:`-links in gedeelde inhoud | Bezig (kernbouwer), samen met V7 (SVG/html als blob) en V9 (`__proto__` als id). |
| CSP, lettertypes zelf hosten, YouTube nocookie, privacytekst (V1 tweede linie, V5) | Wacht op het herstel van V1. |
| Overige herstelpakketten | Wachten op de rechters. |

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
