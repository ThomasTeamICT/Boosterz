# Lichtkamer: prototype voor het basisonderwijs

Een werkend voorbeeld van hoe een interactieve 3D-omgeving aan de minimumdoelen hangt (wetenschap en techniek, leerlijn licht).
Het staat los van de app: één pagina met three.js r128 van de CDN en drie eigen modules. Ontwerp, beslissingen en stand van
zaken: `docs/BASISONDERWIJS.md`, § "Ontwerp: een oefening aan een eindterm hangen".

| Bestand | Wat |
|---|---|
| `lichtkamer.html` | De pagina: doelen, oefeningen per moment (einde kleuter, 4de, 6de), check, klasoverzicht, lesverloop, digibordstand. Zonder `<html>`, `<head>` en `<body>`: het publiceren voegt die toe. |
| `lk-wereld.js` | De 3D-basis: renderer, licht, texturen, zaklamp, figuren, kaartjes, meetlat, het schaduwtheater (4de). |
| `lk-kleuter.js` | Het poppenhuis (einde kleuter) en zijn voorwerpen. |
| `lk-labo.js` | Het labo (6de): houder met stoffen, lichtmeters, gordijnstaal. |
| `SPEC-decor.md` | Afspraken tussen de pagina en de decors: vrije zones, maten, de API van de voorwerpen. |
| `test.cjs` | Rooktest met Playwright: alle oefeningen, de digibordstand en 390 pixels breed, zonder internet. |

De rooktest bedient three.js lokaal. Pak eerst `npm pack three@0.128.0` uit en geef de map `package` mee:

```bash
THREE_PKG=/pad/naar/package node tools/prototypes/lichtkamer/test.cjs "$PWD/tools/prototypes/lichtkamer" lichtkamer.html /tmp/lichtkamer-shots alles
```

De uitvoer eindigt op `ERRORS:` en een lege lijst als alles goed gaat, met de schermafbeeldingen in de opgegeven map.

De voorbeeldklas is verzonnen. Resultaten blijven in de browser (localStorage) en de digibordstand bewaart niets.
