# Iconen en kleur in Boosterz

Afgesproken bij het herontwerp van september 2026. De ontwerprichting met
voorbeelden staat in het artefact "Boosterz herontwerp".

## Eén iconenset: Lucide

- Alle iconen in de interface komen uit [Lucide](https://lucide.dev) via
  `lucide-react` (vaste versie in `package.json`). Lijnen van 2 pixels,
  ronde uiteinden. Een icoon neemt de tekstkleur van zijn omgeving over.
- Lucide zet zelf `aria-hidden="true"` wanneer een icoon geen label heeft.
  Een icoon is dus versiering: de betekenis staat altijd in tekst ernaast,
  of in `aria-label` bij een knop met alleen een icoon.
- Emoji zijn **inhoud**, geen interface: ze mogen in lesmateriaal, in een
  felicitatie voor een leerling of in voorbeeldteksten. Niet in knoppen,
  koppen, navigatie, labels of statusmeldingen.

## Maten

| Plek | Grootte |
|---|---|
| `btn-sm`, badges, tabelcellen | 16 |
| `btn`, menu-items, navigatie | 18 |
| koppen h2 en h3 | 20 |
| kop h1 | 24 |
| lege toestand (`EmptyState`) | 40 |

In een `.btn` staan icoon en tekst al op 8 pixels van elkaar. Voor een icoon
midden in lopende tekst: `className="icon-inline"`.

## Vaste acties

Gebruik de namen uit `src/components/icons.ts`, niet zelf een icoon:

| Actie | Naam | Lucide |
|---|---|---|
| Bewerken | `EditIcon` | square-pen |
| Delen | `ShareIcon` | share-2 |
| Toewijzen aan klas | `AssignIcon` | users |
| Dupliceren | `DuplicateIcon` | copy-plus |
| Afdrukken | `PrintIcon` | printer |
| Importeren | `ImportIcon` | file-up |
| Exporteren | `ExportIcon` | file-down |
| Resultaten | `ResultsIcon` | chart-column |
| Met AI | `AIIcon` | sparkles |
| Verwijderen | `DeleteIcon` | trash |
| Uittesten, spelen | `TryIcon` | play |
| Terug | `BackIcon` | arrow-left |
| Studierichting | `RichtingIcon` | signpost |

En verder: `AddIcon`, `SearchIcon`, `MoreIcon`, `CloseIcon`, `GoalIcon`,
`CourseIcon`, `StudentIcon`, `QrIcon`, `LinkIcon`, `CopyIcon`, `TipIcon`,
`InfoIcon`, `WarningIcon`, `PrivacyIcon`, `DragIcon`, `MoveUpIcon`,
`MoveDownIcon`, `PreviewIcon`, `FolderIcon`, `SettingsIcon`,
`DownloadIcon`, `UploadIcon`, `CheckIcon`, `RetryIcon`.

Staat een actie er niet bij, kies dan een Lucide-icoon dat al elders in de
app voor hetzelfde gebruikt wordt, of voeg het toe aan `icons.ts` en aan deze
tabel.

## Widgetsoorten

- Elke soort heeft een icoon (`Icon`) en een tint (`hue`, OKLCH 0–360) in
  `src/widgets/registry.tsx`. Toon ze met `<TypeTile type=… size=… />`.
- Soorten van één categorie liggen in één tintgebied: toetsen blauw tot
  paars (236–285), spelletjes roze tot oranje (332–30), beeld turquoise tot
  hemelsblauw (166–215), rekenen groen (128–148), klashulpjes oker (50–92).
- Een nieuwe soort krijgt een tint binnen het gebied van zijn categorie, op
  minstens 3 graden van elke andere soort. `src/lib/color.test.ts` bewaakt
  dat, en ook het contrast van icoon op tegel in licht en donker.

## Kleurtokens

- Tekst op een zacht statusvlak: `--ok-text`, `--warn-text`, `--err-text`.
- Vlakken met witte tekst: `--brand-fill`, `--accent-fill`, `--ok-strong`,
  `--err-strong`, `--boost-fill`. Nooit `--brand` als achtergrond onder witte
  tekst: in het donkere thema is die licht.
- De contrasttest in `color.test.ts` leest de tokens rechtstreeks uit
  `global.css`. Voeg je een token toe dat tekst draagt, zet het paar erbij.
