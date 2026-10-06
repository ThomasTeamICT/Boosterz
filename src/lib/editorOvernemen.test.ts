// Widget-editor: overnemen, focus en weggaan (debugronde oktober 2026, P3).
import { describe, expect, it } from 'vitest';
import { countMediaRefs, leaveMessage, pickFocusIndex, shouldRefreshMedia } from './editorOvernemen';

describe('countMediaRefs (B4)', () => {
  it('telt enkel open verwijzingen, geen blob-URL\'s of gewone tekst', () => {
    const w = {
      config: {
        imageUrl: 'wfmedia:m_een',
        questions: [{ image: 'wfmedia:m_twee' }, { image: 'blob:http://localhost/abc' }],
        note: 'geen verwijzing',
      },
    };
    expect(countMediaRefs(w)).toBe(2);
  });

  it('een widget zonder media telt 0, en iets wat niet in JSON past ook', () => {
    expect(countMediaRefs({ config: { a: 1 } })).toBe(0);
    expect(countMediaRefs(undefined)).toBe(0);
    const kring: Record<string, unknown> = {};
    kring.zelf = kring;
    expect(countMediaRefs(kring)).toBe(0);
  });
});

describe('shouldRefreshMedia (B4)', () => {
  const basis = { unsaved: false, holding: false, storedVersion: 100, knownVersion: 100, shownRefs: 1, storedRefs: 0 };

  it('niets onbewaard, dezelfde versie, en de blob is nu geladen: opnieuw lezen', () => {
    expect(shouldRefreshMedia(basis)).toBe(true);
  });

  it('onbewaard werk (of een open AI-assistent) blijft onaangeroerd', () => {
    expect(shouldRefreshMedia({ ...basis, unsaved: true })).toBe(false);
  });

  it('terwijl er een keuze wacht (conflict of verwijderd) wordt niets vervangen', () => {
    expect(shouldRefreshMedia({ ...basis, holding: true })).toBe(false);
  });

  it('een andere versie in de opslag is geen mediaverhaal: overnemen of conflict regelt de rest', () => {
    expect(shouldRefreshMedia({ ...basis, storedVersion: 200 })).toBe(false);
    expect(shouldRefreshMedia({ ...basis, storedVersion: null })).toBe(false);
  });

  it('alleen als het iets oplevert: niet bij een niet-gerelateerd laadevent', () => {
    expect(shouldRefreshMedia({ ...basis, shownRefs: 0, storedRefs: 0 })).toBe(false);
    expect(shouldRefreshMedia({ ...basis, shownRefs: 2, storedRefs: 2 })).toBe(false);
    expect(shouldRefreshMedia({ ...basis, shownRefs: 2, storedRefs: 1 })).toBe(true);
  });
});

describe('pickFocusIndex (B5)', () => {
  const lijst = [
    { tag: 'INPUT', label: 'Titel' },
    { tag: 'TEXTAREA', label: 'Vraag 1' },
    { tag: 'BUTTON', label: 'Verwijderen' },
    { tag: 'TEXTAREA', label: 'Vraag 2' },
  ];

  it('hetzelfde veld op dezelfde plaats krijgt de focus terug', () => {
    expect(pickFocusIndex(lijst, { index: 1, tag: 'TEXTAREA', label: 'Vraag 1' })).toBe(1);
    expect(pickFocusIndex(lijst, { index: 3, tag: 'TEXTAREA', label: 'Vraag 2' })).toBe(3);
  });

  it('een verschoven lijst (er kwam een veld bij): het veld met dezelfde naam, het dichtstbijzijnde', () => {
    const verschoven = [{ tag: 'BUTTON', label: 'Nieuw' }, ...lijst];
    expect(pickFocusIndex(verschoven, { index: 3, tag: 'TEXTAREA', label: 'Vraag 2' })).toBe(4);
    expect(pickFocusIndex(verschoven, { index: 1, tag: 'INPUT', label: 'Titel' })).toBe(1);
  });

  it('is de naam weg (veld verwijderd), dan het dichtstbijzijnde veld van dezelfde soort', () => {
    const korter = lijst.filter((c) => c.label !== 'Vraag 2');
    expect(pickFocusIndex(korter, { index: 3, tag: 'TEXTAREA', label: 'Vraag 2' })).toBe(1);
  });

  it('niets van dezelfde soort of een lege lijst: -1, de focus blijft waar ze is', () => {
    expect(pickFocusIndex([{ tag: 'BUTTON', label: 'Ok' }], { index: 0, tag: 'TEXTAREA', label: 'x' })).toBe(-1);
    expect(pickFocusIndex([], { index: 0, tag: 'TEXTAREA', label: 'x' })).toBe(-1);
  });

  it('velden zonder naam van dezelfde soort: de plaats beslist', () => {
    const naamloos = [{ tag: 'TEXTAREA', label: '' }, { tag: 'TEXTAREA', label: '' }, { tag: 'TEXTAREA', label: '' }];
    expect(pickFocusIndex(naamloos, { index: 2, tag: 'TEXTAREA', label: '' })).toBe(2);
    expect(pickFocusIndex(naamloos.slice(0, 2), { index: 2, tag: 'TEXTAREA', label: '' })).toBe(1);
  });
});

describe('leaveMessage (B9)', () => {
  it('conflict en verwijderd houden hun eigen tekst', () => {
    expect(leaveMessage('conflict')).toContain('een andere versie');
    expect(leaveMessage('verwijderd')).toContain('verwijderd');
  });

  it('een volle opslag noemt de opslag; een andere fout noemt de opslag niet vol', () => {
    const vol = leaveMessage('mislukt', 'De opslag van dit toestel is vol. Exporteer je materiaal op.');
    expect(vol).toContain('De opslag van dit toestel is vol.');
    const anders = leaveMessage('mislukt', 'Bewaren op dit toestel is mislukt — Staat de browser misschien in privémodus?');
    expect(anders).not.toMatch(/\bvol\b/);
    expect(anders).toContain('privémodus');
  });

  it('elke mislukte-tekst zegt wat er verloren gaat en wat je kan doen', () => {
    for (const reden of [undefined, null, '', '   ', 'Een reden.']) {
      const t = leaveMessage('mislukt', reden);
      expect(t).toContain('gaan je laatste wijzigingen verloren');
      expect(t).toContain('Download de widget eerst als bestand');
    }
  });

  it('zonder reden valt ze terug op een neutrale zin, nooit op "vol"', () => {
    expect(leaveMessage('mislukt')).toContain('Bewaren op dit toestel lukt niet.');
    expect(leaveMessage('mislukt')).not.toMatch(/\bvol\b/);
  });
});
