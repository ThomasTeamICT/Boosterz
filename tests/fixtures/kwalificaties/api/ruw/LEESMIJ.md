# Uittreksel van de verkenning van de beroepskwalificaties

Bron: de logboeken van twee runs van de workflow "Verkenning Onderwijs-API's" (GitHub Actions, 10 oktober 2026):

- `ronde6-kwalificaties.log`: run 38044584119, stand `kwalificaties` (regels `KWAL|` en `KWAL-SAMENVATTING|`);
- `ronde7-dossier.log`: run 38047507450, stand `dossier` (regels `DOSSIER|` en `DOSSIER-SAMENVATTING|`).

Elke regel is JSON: de veldnamen en soorten van een antwoord, met korte, ingekorte proeven. Het zijn dus geen volledige
API-antwoorden (de artifacts met de volledige rapporten zijn vanuit de cloudsessie niet te downloaden). Ze leggen de vorm vast
waarop de fixtures in `tests/fixtures/kwalificaties/api/` gebouwd worden (regel 11: de eerste echte run bevestigt de vorm).

Er staat geen sleutel in: het verkenningsscript wist de sleutel en elke sleutelvormige reeks (`<verborgen>`) vóór het logt.
Bevindingen: `docs/ONDERWIJS-API.md` § 4. Ontwerp: `docs/STUDIERICHTINGEN.md` § 23.
