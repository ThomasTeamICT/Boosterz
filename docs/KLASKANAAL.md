# Klaskanaal — concept voor synchronisatie tussen toestellen

*Status: ontwerp, nog niet gebouwd. Beslissing van de school nodig vóór fase 2.*

## 1. Waarom

Boosterz werkt volledig op het toestel. Werk van leerlingen komt bij de leerkracht via
QR-codes en resultaat-/voortgangscodes (Inleverpunt). Dat is betrouwbaar en privacyvriendelijk,
maar het is een handeling per leerling. In een klas met 25 tablets wil de leerkracht dat
inzendingen en leesvoortgang *vanzelf* op haar scherm verschijnen, en dat een nieuwe
opdracht *vanzelf* bij de leerlingen belandt. Dat vraagt een tweede transport naast de codes:
het **klaskanaal**.

## 2. Uitgangspunten (niet onderhandelbaar)

1. **Het toestel van de leerkracht blijft de bron van waarheid.** Het kanaal is transport en
   een korte buffer, geen database van de school.
2. **End-to-end versleuteld.** Alles wat een toestel verlaat, is versleuteld met een
   klassleutel die alleen in de klaslink zit (in het hash-fragment, dat een browser nooit
   naar een server stuurt). De dienst ziet kanaal-id's, tijdstippen en cijfertekst. Geen
   namen, geen antwoorden, geen scores.
3. **Geen accounts voor leerlingen.** De leerling kiest zijn naam uit de klaslijst, zoals nu.
4. **Offline eerst.** Zonder wifi werkt alles zoals vandaag; gebeurtenissen wachten in een
   uitgaande rij en vertrekken zodra er verbinding is.
5. **De codes blijven bestaan.** QR en Inleverpunt zijn de terugval als het kanaal uitvalt of
   de school er niet voor kiest. Beide wegen schrijven dezelfde records.
6. **Idempotent.** Elke gebeurtenis heeft een id; dubbel ontvangen is onschuldig. De
   ontvanger ontdubbelt met de logica die er al is (`submissionDupKey`, `mergeProgressRecords`).

## 3. Drie opties, één keuze

| | A. Relay met end-to-end-encryptie | B. Peer-to-peer (WebRTC) | C. Volwaardige backend met accounts |
|---|---|---|---|
| Wat het is | Piepkleine dienst die per klas een versleuteld logboek van gebeurtenissen bewaart | Toestellen praten rechtstreeks, via een signaleringsserver | Database met leerlingaccounts, rollen, alles op de server |
| Privacy | Dienst leest niets; alleen metadata | Idem, maar signalering nodig | Persoonsgegevens van minderjarigen op een server: DPIA, verwerkersovereenkomst, toegangsbeheer |
| Betrouwbaarheid op schoolnetwerk | Goed (gewoon https) | Slecht (NAT, firewalls, wisselende wifi) | Goed |
| Offline | Natuurlijk (uitgaande rij) | Moeilijk (peers moeten tegelijk online zijn) | Extra werk |
| Kost | < €10 per maand voor een school | Signaleringsserver toch nodig | Hosting + beheer + juridisch |
| Complexiteit in de app | Laag: één adapter | Hoog | Hoog, en de serverloze belofte is weg |

**Keuze: A.** Het past bij de architectuur (het klaspakket bestaat al, de codes bestaan al) en
verandert de privacypositie het minst: de dienst is een postbus die dichte enveloppen bewaart.

## 4. Ontwerp

```
leerlingtoestel                      klaskanaal (dienst)                 leerkrachttoestel
┌────────────────┐   inzending,     ┌──────────────────────┐   ophalen    ┌────────────────┐
│ Boosterz       │ ── voortgang ──▶ │ per klas een logboek │ ◀── since ── │ Boosterz       │
│ (leerlinghub)  │   versleuteld    │ van cijfertekst      │   seq        │ (klasoverzicht)│
│                │ ◀── opdrachten ──│ (seq, nonce, sig)    │ ◀── publiceer│                │
└────────────────┘   & pakket,      └──────────────────────┘   (getekend) └────────────────┘
        │             getekend                                                    ▲
        └──────────────── terugval: QR-code of resultaatcode (zoals vandaag) ─────┘
```

### 4.1 Sleutels

- **Klassleutel** (AES-GCM 256): per klas gemaakt op het toestel van de leerkracht. Reist mee
  in de klaslink (`#/klas/open?d=…&k=…`) en in het klaspakket. Wie de link heeft, zit in de klas
  — precies zoals vandaag.
- **Kanaal-id** = SHA-256 van de klassleutel. De dienst kent alleen dit; uit het id valt de
  sleutel niet af te leiden.
- **Sleutelpaar van de leerkracht** (ECDSA P-256, WebCrypto): de publieke sleutel zit in de
  klaslink, de private blijft op haar toestel. Opdrachten, pakketten en "kanaal wissen" zijn
  getekend; leerlingtoestellen weigeren ongetekende leerkrachtgebeurtenissen. Zo kan een
  leerling met de klaslink geen opdracht verzinnen of de klas wissen.
- **Nieuwe sleutel** ("klas herstarten"): nieuwe klaslink delen; het oude kanaal verloopt.

### 4.2 Gebeurtenissen

Het contract staat in `src/lib/sync/types.ts`:

| kind | van | inhoud | ontvanger doet |
|---|---|---|---|
| `submission` | leerling | een `Submission` (met classId/studentId) | `saveSubmission` na ontdubbeling |
| `progress` | leerling | een `CourseProgress` | `mergeProgressRecords` |
| `presence` | leerling | "bezig met …" (kortlevend) | live-balk in het klasoverzicht |
| `assignment` | leerkracht (getekend) | opdracht toegevoegd/gewijzigd/verwijderd | opdrachtenlijst bijwerken |
| `pack` | leerkracht (getekend) | inhoudshash van een klaspakket | pakket ophalen uit de blobopslag, `adoptClassPack` |
| `wipe` | leerkracht (getekend) | kanaal leegmaken | lokaal niets; dienst verwijdert |

Inhoud (cursussen, widgets, media) gaat níét als gebeurtenis maar als **blob op inhoudshash**
(zelfde idee als de medialaag): één upload per versie, elke leerling haalt ze één keer.
Het klaspakket draagt ook `klas.doelgroep` (studierichting en jaar, geen persoonsgegevens).

### 4.3 Dienst (API)

```
POST   /k/{channelId}/events            envelop(pen) toevoegen  → { seq }
GET    /k/{channelId}/events?since=N    ophalen, long-poll of SSE
PUT    /k/{channelId}/blobs/{hash}      klaspakket (cijfertekst), idempotent
GET    /k/{channelId}/blobs/{hash}
DELETE /k/{channelId}                   alleen met geldige leerkrachthandtekening
```

- Envelop: `{ id, ciphertext, nonce, from, signature? }`; de dienst voegt `seq` en `receivedAt` toe.
- Limieten: envelop ≤ 64 kB, blob ≤ 25 MB, kanaal ≤ 10 000 gebeurtenissen; oudere verlopen na
  **90 dagen** (de leerkracht heeft ze dan al lang lokaal).
- Geen accounts, geen cookies. Misbruikrem: rate limit per kanaal en per IP.

### 4.4 In de app

- `SyncAdapter` (types.ts) met drie implementaties: `NoopAdapter` (vandaag),
  `BroadcastChannelAdapter` (demo in één browser, fase 1), `HttpRelayAdapter` (fase 2).
- **Uitgaande rij** in IndexedDB (`wf-files`, store `outbox`): elke gebeurtenis eerst lokaal,
  dan versturen; bij succes markeren. Herstart = rij opnieuw proberen.
- **Inhalen**: per kanaal onthoudt het toestel `lastSeq`; bij verbinden alles sinds dan.
- **Klasoverzicht**: statuslampje (uit / verbinden / verbonden / offline / fout), knop
  "Klaskanaal aan" per klas, live-balk "wie is bezig".
- **Leerlinghub**: geen extra stap. Inleveren-sectie blijft (met de melding "al doorgestuurd
  via het kanaal" zodra een gebeurtenis bevestigd is).
- **Privacypagina**: toont per klas of het kanaal aanstaat, welk eindpunt, en de knop
  "kanaal wissen".

## 5. Privacy en AVG

- Wat de dienst ziet: kanaal-id, tijdstippen, groottes, IP-adressen in logs (kort bewaard),
  cijfertekst. Niet: namen, antwoorden, scores, cursusinhoud.
- Toch **persoonsgegevens in de zin van de AVG** (versleuteld ≠ anoniem): de school blijft
  verwerkingsverantwoordelijke; wie de dienst host, is verwerker. Bij externe hosting is een
  verwerkersovereenkomst nodig en een keuze voor EU-locatie.
- Bewaartermijn 90 dagen op de dienst; lokaal beslist de leerkracht (bestaande wisknoppen).
- Recht op wissen: "kanaal wissen" + lokale wisknoppen dekken alles.
- Aanbevolen: hosting door de scholengroep zelf of bij een Belgische/EU-partij; het is één
  klein proces zonder database-vereisten.

## 6. Hosting en kost

| Optie | Geschikt voor | Kost | Opmerking |
|---|---|---|---|
| Cloudflare Worker + Durable Object (EU-jurisdictie) | eerste piloot | ± €5/maand | minste beheer; verwerkersovereenkomst van Cloudflare |
| Kleine Node/Deno-dienst bij een EU-hoster (Hetzner, Scaleway, Combell) | school of scholengroep | € 5–10/maand | eigen beheer, volledig in eigen hand |
| Op een schoolserver in het netwerk | scholen zonder cloud | 0 | alleen bereikbaar op school; thuiswerk via codes |

Volume: 25 leerlingen × 5 gebeurtenissen per les × 6 lessen per dag = 750 enveloppen per klas
per dag, elk enkele kB. Dat is verwaarloosbaar.

## 7. Wat blijft zoals het is

Alles. Widgets, cursussen, klassen, klaspakket, QR en Inleverpunt werken zonder kanaal. Het
kanaal is een extra transport dat dezelfde records aanmaakt. Een school die het niet wil,
merkt er niets van; een school die het wil, zet het per klas aan.

## 8. Roadmap

| Fase | Wat | Bewijs |
|---|---|---|
| 0 (nu) | Contract in code (`src/lib/sync/types.ts`), dit document | typecheck |
| 1 | `BroadcastChannelAdapter` + uitgaande rij + statuslampje: live sync tussen twee tabbladen op één toestel | rooktest: tab A dient in, tab B (klasoverzicht) toont het zonder herladen |
| 2 | Dienst (Worker) + `HttpRelayAdapter` met AES-GCM en klassleutel in de klaslink; piloot in één klas | lokale relay in de testsuite; piloot met echte tablets |
| 3 | Getekende leerkrachtgebeurtenissen, retentie, "kanaal wissen", rate limits, verwerkersovereenkomst | beveiligingsreview |
| 4 | Presence ("wie is bezig"), pakket-updates pushen, toetsmodus op afstand vergrendelen | klasproef |

## 9. Beslispunten voor de school

1. Willen we dit? (Zonder: alles werkt via codes.)
2. Wie host de dienst: scholengroep, EU-hoster of Cloudflare?
3. Bewaartermijn op de dienst (voorstel 90 dagen) en wie "kanaal wissen" mag.
4. Piloot: één klas, één vak, vier weken; daarna evalueren met de leerkracht.
