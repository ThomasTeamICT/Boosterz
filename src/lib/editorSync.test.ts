// Widget-editor naast andere tabbladen (debugronde oktober 2026, OP4).
import { describe, expect, it } from 'vitest';
import { syncState, versionOf } from './editorSync';

describe('syncState (OP4)', () => {
  it('niemand anders schreef: gewoon verder (ook met onbewaarde wijzigingen)', () => {
    expect(syncState(100, 100, false)).toBe('gelijk');
    expect(syncState(100, 100, true)).toBe('gelijk');
  });

  it('een ander tabblad bewaarde en hier staat niets onbewaards: die versie overnemen', () => {
    expect(syncState(200, 100, false)).toBe('overnemen');
  });

  it('een ander tabblad bewaarde én hier staan wijzigingen: conflict, nooit stil overschrijven', () => {
    expect(syncState(200, 100, true)).toBe('conflict');
    // ook een "oudere" versie (andere klok) is een andere versie dan de onze
    expect(syncState(50, 100, true)).toBe('conflict');
  });

  it('de widget staat niet meer in de opslag: verwijderd, met of zonder wijzigingen', () => {
    expect(syncState(null, 100, false)).toBe('verwijderd');
    expect(syncState(null, 100, true)).toBe('verwijderd');
  });
});

describe('versionOf', () => {
  it('updatedAt is de versie; oude data zonder getal telt als 0; geen widget = null', () => {
    expect(versionOf({ updatedAt: 123 })).toBe(123);
    expect(versionOf({ updatedAt: undefined })).toBe(0);
    expect(versionOf({ updatedAt: 'gisteren' })).toBe(0);
    expect(versionOf({ updatedAt: NaN })).toBe(0);
    expect(versionOf(undefined)).toBeNull();
    expect(versionOf(null)).toBeNull();
  });
});
