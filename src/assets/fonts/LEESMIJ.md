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

- Bron: Google Fonts (Atkinson Hyperlegible v12, Outfit v15), opgehaald op 6 oktober 2026, met
  dezelfde stijlen en tekenbereiken als de vroegere link in `index.html`.
- De `@font-face`-regels staan bovenaan `src/styles/global.css`.
- Licentie: SIL Open Font License 1.1, zie `OFL-AtkinsonHyperlegible.txt` (© 2020 Braille Institute
  of America, Inc.) en `OFL-Outfit.txt` (© 2021 The Outfit Project Authors). De lettertypes mogen
  vrij gebruikt en meegeleverd worden, maar niet apart verkocht.
