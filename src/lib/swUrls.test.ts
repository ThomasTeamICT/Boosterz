import { describe, expect, it } from 'vitest';
import { assetUrlsToWarm, nietLangsServiceWorker, serviceWorkerUrls } from './swUrls';

describe('serviceWorkerUrls', () => {
  it('GitHub Pages onder /Boosterz/', () => {
    expect(serviceWorkerUrls('https://thomasteamict.github.io/Boosterz/assets/index-abc123.js')).toEqual({
      script: 'https://thomasteamict.github.io/Boosterz/sw.js',
      scope: 'https://thomasteamict.github.io/Boosterz/',
    });
  });

  it('lokale preview op /', () => {
    expect(serviceWorkerUrls('http://localhost:4187/assets/index-abc123.js')).toEqual({
      script: 'http://localhost:4187/sw.js',
      scope: 'http://localhost:4187/',
    });
  });

  it('dieper subpad', () => {
    expect(serviceWorkerUrls('https://example.org/a/b/assets/index-x.js')?.scope).toBe('https://example.org/a/b/');
  });

  it('niets registreren als de bundel niet in assets/ staat of de URL vreemd is', () => {
    expect(serviceWorkerUrls('http://localhost:5173/src/main.tsx')).toBeNull();
    expect(serviceWorkerUrls('http://localhost:4187/assets/sub/index-x.js')).toBeNull();
    expect(serviceWorkerUrls('blob:http://localhost:4187/1234')).toBeNull();
    expect(serviceWorkerUrls('file:///tmp/assets/index-x.js')).toBeNull();
    expect(serviceWorkerUrls('geen url')).toBeNull();
  });
});

describe('assetUrlsToWarm', () => {
  const scope = 'https://thomasteamict.github.io/Boosterz/';
  it('alle eigen bestanden van deze app (chunks en gegevens), zonder dubbels of query', () => {
    const urls = assetUrlsToWarm(
      [
        scope + 'assets/index-a.js',
        scope + 'assets/seed-b.js',
        scope + 'assets/seed-b.js',
        scope + 'assets/quiz-c.js#x',
        scope + 'assets/x.js?v=2',
        scope + 'voorbeelden/nw/h01-01.jpg',
        scope + 'basis/go/index.json',
        scope + 'basis/go/lesplannen/LP0065.json',
        scope + 'basis/aanbod/LP0065.json',
        scope + 'basis/aanbod/LP0065/dier-of-plant.json',
        scope + 'leerplannen/minimumdoelen/index.json',
        scope + 'basis/go/leerplan/WT.json?v=1',
        'https://fonts.googleapis.com/css2?family=Outfit',
        'https://thomasteamict.github.io/Ander/assets/index-z.js',
        'https://thomasteamict.github.io/Ander/basis/go/index.json',
        'https://thomasteamict.github.io/Boosterzzz/assets/index-z.js',
        'https://thomasteamict.github.io/Boosterzzz/basis/go/index.json',
      ],
      scope
    );
    expect(urls).toEqual([
      scope + 'assets/index-a.js',
      scope + 'assets/seed-b.js',
      scope + 'assets/quiz-c.js',
      scope + 'voorbeelden/nw/h01-01.jpg',
      scope + 'basis/go/index.json',
      scope + 'basis/go/lesplannen/LP0065.json',
      scope + 'basis/aanbod/LP0065.json',
      scope + 'basis/aanbod/LP0065/dier-of-plant.json',
      scope + 'leerplannen/minimumdoelen/index.json',
    ]);
  });
});

describe('nietLangsServiceWorker', () => {
  it('alleen wat vertrok voor de service worker de pagina bediende (workerStart 0 of ontbrekend)', () => {
    expect(
      nietLangsServiceWorker([
        { name: 'a', workerStart: 0 },
        { name: 'b', workerStart: 812.4 },
        { name: 'c' },
      ])
    ).toEqual(['a', 'c']);
    expect(nietLangsServiceWorker([])).toEqual([]);
  });
});
