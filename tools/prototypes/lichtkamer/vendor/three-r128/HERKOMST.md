# three.js r128, vastgelegde kopie

Bestanden uit het npm-pakket `three@0.128.0` (MIT-licentie, zie `LICENSE`), ongewijzigd, alleen de bestanden die het prototype van de Lichtkamer laadt: `build/three.min.js` en tien voorbeeldscripts uit `examples/js/`.

- Pakket: `three-0.128.0.tgz`, sha256 `df6a5d06dcd9a361831669f1b6dd081b2a43f9933d7b16de532417cc8d7c6153`.
- Integriteit volgens het npm-register (`dist.integrity`): `sha512-i0ap/E+OaSfzw7bD1TtYnPo3VEplkl70WX5fZqZnfZsE3k3aSFudqrrC9ldFZfYFkn1zwDmBcdGfiIm/hnbyZA==`.
- Controlesom per bestand: `SHA256SUMS` (`cd vendor/three-r128 && sha256sum -c SHA256SUMS`). `maak-proef.mjs` weigert te werken als een bestand afwijkt of als er een bestand bijkomt dat niet in de lijst staat.
- Waarom deze kopie en geen `node_modules/three`: Boosterz heeft three r128 niet als afhankelijkheid (de kijkdoos in de app komt later, op r162, in LK-5). Dit is de versie waarmee het prototype is goedgekeurd.
- Opnieuw vastleggen: `npm pack three@0.128.0`, uitpakken, dezelfde elf bestanden kopiëren en `SHA256SUMS` opnieuw maken.
