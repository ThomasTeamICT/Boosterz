# Lettertypes (zelf gehost)

Boosterz laadt geen lettertypes van Google Fonts meer: de app maakt zo geen verbinding met Google
(privacy, debugronde oktober 2026, V5), en de lettertypes werken ook offline (de service worker
bewaart ze bij de installatie).

| Bestand | Lettertype | Stijl | Tekens |
|---|---|---|---|
| `atkinson-hyperlegible-400-latin(-ext).woff2` | Atkinson Hyperlegible | 400 | latin, latin-ext |
| `atkinson-hyperlegible-700-latin(-ext).woff2` | Atkinson Hyperlegible | 700 | latin, latin-ext |
| `atkinson-hyperlegible-400-italic-latin(-ext).woff2` | Atkinson Hyperlegible | 400 cursief | latin, latin-ext |
| `outfit-latin(-ext).woff2` | Outfit (variabel) | 600, 700, 800 | latin, latin-ext |
| `fredoka-latin.woff2` | Fredoka (variabel) | 300 tot 700 | latin |

- Bron: Google Fonts (Atkinson Hyperlegible v12, Outfit v15), opgehaald op 6 oktober 2026, met
  dezelfde stijlen en tekenbereiken als de vroegere link in `index.html`.
- De `@font-face`-regels staan bovenaan `src/styles/global.css`.
- Licentie: SIL Open Font License 1.1, zie `OFL-AtkinsonHyperlegible.txt` (© 2020 Braille Institute
  of America, Inc.) en `OFL-Outfit.txt` (© 2021 The Outfit Project Authors). De lettertypes mogen
  vrij gebruikt en meegeleverd worden, maar niet apart verkocht.

## Fredoka (alleen in het deel basisonderwijs)

- `fredoka-latin.woff2` is het latin-bestand van Fredoka v17 (Google Fonts), opgehaald op 2 november 2026 voor de eigen
  ingang van het basisonderwijs (`#/basis`). Eén variabel bestand voor gewicht 300 tot 700.
- De `@font-face`-regel staat alleen in `src/styles/basis.css`, niet in `global.css`: het lettertype laadt pas met het lui
  geladen basisdeel en zit niet in de voorcache van het leerlingpad. Offline werkt het dus pas na een eerste bezoek aan
  het deel; tot dan toont de browser Outfit.
- Licentie: SIL Open Font License 1.1, zie `OFL-Fredoka.txt` (© 2016 The Fredoka Project Authors). Die tekst komt uit het
  pakket `@fontsource/fredoka` 5.3.0 (licentie OFL-1.1).

## Patrick Hand (alleen in de bordles)

- `patrick-hand-400-latin.woff2` is het latin-bestand van Patrick Hand uit het pakket `@fontsource/patrick-hand` 5.3.0,
  opgehaald op 13 november 2026 voor het krijtschrift van de bordles (`docs/UITLEGVORMEN.md`).
- De `@font-face`-regel staat alleen in `src/styles/bordles.css`: het lettertype laadt pas met de lui geladen bordles en zit
  niet in de voorcache van het leerlingpad. Tot het geladen is, toont de browser een cursief systeemlettertype.
- Licentie: SIL Open Font License 1.1, zie `OFL-PatrickHand.txt` (© 2010-2012 Patrick Wagesreiter).
