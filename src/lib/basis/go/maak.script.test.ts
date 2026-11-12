// Integratietests voor tools/basis/go/maak.ts (de import van het GO! leerplan, docs/basisonderwijs/GO-LEERPLAN.md):
// het script draait als apart proces (vite-node), op een kleine werkmap in de tijdelijke map van het systeem, met twee
// kleine doelensets (WT en LL) en één klein lesplan (testRuw.ts), de echte minimumdoelen uit public/ en een eigen lijst
// bekende afwijkingen. De originelen in bron/ zijn nagebootst: maak.ts leest alleen hun bytes en sha256. Er wordt
// nooit in de repo geschreven (eisTijdelijk).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BekendeAfwijking, RuwDocx, RuwXlsx } from './omzetten';
import { lesplanRuw, llRuw, p, rij, wtRuw } from './testRuw';

// Elke run start Node met vite-node als apart proces (ongeveer een seconde).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const VITE_NODE = join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs');
const MAAK = join(ROOT, 'tools', 'basis', 'go', 'maak.ts');

let TMP = '';
beforeAll(() => {
  TMP = mkdtempSync(join(realpathSync(tmpdir()), 'go-maak-'));
});
afterAll(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

// ── Hulp ─────────────────────────────────────────────────────────────

interface Uitkomst {
  status: number;
  stdout: string;
  rapport: { uitkomst: string; uitleg: string[]; wijzigingen: { soort: string; wat: string; stopt: boolean; altijd?: boolean }[]; bestanden: { geschreven: string[]; ongewijzigd: string[]; verwijderd: string[] }; afwijkingen: { nieuw: { soort: string }[] } };
}

/** Een werkmap en een --uit mogen alleen in de tijdelijke map staan. */
function eisTijdelijk(...paden: string[]) {
  for (const pad of paden) if (!resolve(pad).startsWith(TMP + sep)) throw new Error(`${pad} ligt niet in ${TMP}`);
}

interface Invoer {
  lesplan?: RuwDocx | null;
  wt?: RuwXlsx | null;
  ll?: RuwXlsx | null;
  bekende?: BekendeAfwijking[];
  /** Een eigen manifest.json (anders geen). */
  manifest?: unknown;
}

/** Het lesplan noemt WT.008 met een andere tekst dan de doelenset (zoals LP0065 in de echte bron). */
const DOELTEKST: BekendeAfwijking = { soort: 'lesplan-doeltekst', lesplan: 'LP0065', doel: 'WT.008', tekst: 'Herkennen de belangrijkste voedingswijze van dieren.', reden: 'Het lesplan heeft een andere tekst (test).', datum: '2026-11-09' };

/** WT met een officiële koppeling bij WT.001 (KO 3.1.2, ODS_3410/92590 in de echte minimumdoelen). */
function wt(ko = '3.1.2', tekst002 = 'Doel 2.'): RuwXlsx {
  const ruw = wtRuw();
  ruw.bestand = 'Doelenset BaO wetenschap en techniek.xlsx';
  ruw.rijen = ruw.rijen.map((x) => {
    if (x.c[1] === 'WT.001') return rij(x.r, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko, kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' });
    if (x.c[1] === 'WT.002') return rij(x.r, 'doelzin', tekst002, { code: 'WT.002', kv: 'begrijpen', lft: ['2,5-4'] });
    return x;
  });
  return ruw;
}
const ll = (): RuwXlsx => ({ ...llRuw(), bestand: 'Doelenset BaO leren leren.xlsx' });

/** Schrijft bron/ (nagebootste originelen), ruw/ (met het veld bron van dat origineel) en bekende.json. */
function werkmap(werk: string, inv: Invoer = {}): { bekende: string } {
  eisTijdelijk(werk);
  rmSync(join(werk, 'bron'), { recursive: true, force: true });
  rmSync(join(werk, 'ruw'), { recursive: true, force: true });
  rmSync(join(werk, 'manifest.json'), { force: true });
  mkdirSync(join(werk, 'bron'), { recursive: true });
  mkdirSync(join(werk, 'ruw'), { recursive: true });
  const stukken: [string, RuwDocx | RuwXlsx | null][] = [
    ['LP0065', inv.lesplan === undefined ? lesplanRuw() : inv.lesplan],
    ['WT', inv.wt === undefined ? wt() : inv.wt],
    ['LL', inv.ll === undefined ? ll() : inv.ll],
  ];
  for (const [naam, ruw] of stukken) {
    if (!ruw) continue;
    const { bron: _bron, ...zonder } = ruw;
    const data = Buffer.from(`nagebootst origineel ${JSON.stringify(zonder)}`);
    writeFileSync(join(werk, 'bron', ruw.bestand), data);
    writeFileSync(join(werk, 'ruw', `${naam}.json`), JSON.stringify({ ...ruw, bron: { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') } }));
  }
  if (inv.manifest !== undefined) writeFileSync(join(werk, 'manifest.json'), JSON.stringify(inv.manifest));
  const bekende = join(werk, '..', `bekende-${werk.split(sep).pop() ?? 'x'}.json`);
  writeFileSync(bekende, JSON.stringify({ uitleg: 'Bekende afwijkingen voor de scripttest.', afwijkingen: inv.bekende ?? [DOELTEKST] }));
  return { bekende };
}

function draai(werk: string, uit: string, bekende: string, ...extra: string[]): Uitkomst {
  eisTijdelijk(werk, uit, bekende);
  const r = spawnSync(process.execPath, [VITE_NODE, MAAK, '--werkmap', werk, '--uit', uit, '--ingelezen', '2026-11-09', '--bekende', bekende, ...extra], { cwd: ROOT, encoding: 'utf8' });
  const rapportPad = join(werk, 'rapport.json');
  return { status: r.status ?? 1, stdout: `${r.stdout}${r.stderr}`, rapport: existsSync(rapportPad) ? (JSON.parse(readFileSync(rapportPad, 'utf8')) as Uitkomst['rapport']) : (undefined as never) };
}

/** Alle bestanden onder een map, relatief pad → sha256. */
function opname(map: string): Record<string, string> {
  const uit: Record<string, string> = {};
  const loop = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const naam of readdirSync(dir).sort()) {
      const pad = join(dir, naam);
      if (statSync(pad).isDirectory()) loop(pad, `${prefix}${naam}/`);
      else uit[`${prefix}${naam}`] = createHash('sha256').update(readFileSync(pad)).digest('hex');
    }
  };
  loop(map, '');
  return uit;
}

const BESTANDEN = ['bij-minimumdoel/3.json', 'index.json', 'leerplan/LL.json', 'leerplan/WT.json', 'lesplannen/LP0065.json'];

// ── De gewone stroom en de vlag ──────────────────────────────────────

describe('maak.ts: schrijven, niets herschrijven, stoppen bij een wijziging en de vlag', () => {
  let werk = '';
  let uit = '';
  let bekende = '';
  beforeAll(() => {
    werk = join(TMP, 'stroom', 'werk');
    uit = join(TMP, 'stroom', 'uit');
    bekende = werkmap(werk).bekende;
  });

  it('een eerste run schrijft alle bestanden (exit 0), een tweede run met dezelfde invoer schrijft niets', () => {
    const r1 = draai(werk, uit, bekende);
    expect(r1.status, r1.stdout).toBe(0);
    expect(Object.keys(opname(uit))).toEqual(BESTANDEN);
    expect(r1.rapport.bestanden.geschreven.sort()).toEqual(BESTANDEN);
    const voor = opname(uit);
    const r2 = draai(werk, uit, bekende);
    expect(r2.status, r2.stdout).toBe(0);
    expect(r2.stdout).toContain('Bestanden: 0 geschreven, 5 ongewijzigd.');
    expect(opname(uit)).toEqual(voor);
  });

  it('een andere tekst bij een bestaande code stopt (exit 3, niets geschreven), met oud en nieuw op het scherm', () => {
    werkmap(werk, { wt: wt('3.1.2', 'Doel twee.') });
    const voor = opname(uit);
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('  WIJZIGING andere tekst: WT.002: "Doel 2." → "Doel twee."');
    expect(r.stdout).toContain('GESTOPT: bestaande codes, rubrieken of lesplannen zijn veranderd of verdwenen');
    expect(r.rapport.uitkomst).toBe('gestopt');
    expect(opname(uit)).toEqual(voor);
  });

  it('met --aanvaard-wijzigingen gaat dezelfde run door (exit 0)', () => {
    const r = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r.status, r.stdout).toBe(0);
    expect(r.rapport.bestanden.geschreven).toContain('leerplan/WT.json');
    expect(readFileSync(join(uit, 'leerplan', 'WT.json'), 'utf8')).toContain('Doel twee.');
  });

  it('een andere koppeling bij een doel uit een lesplan stopt ook (IMP-1)', () => {
    werkmap(werk, { wt: wt('3.1.3', 'Doel twee.') });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('  WIJZIGING andere koppeling: WT.001: KO 3.1.2 → KO 3.1.3 [LP0065]');
    expect(r.rapport.wijzigingen.filter((w) => w.stopt).map((w) => w.soort)).toEqual(['andere koppeling']);
  });

  it('een verdwenen lesplan stopt; met de vlag wordt het bestand gewist', () => {
    werkmap(werk, { wt: wt('3.1.2', 'Doel twee.'), lesplan: null, bekende: [] });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('  WIJZIGING verdwenen lesplan: LP0065 Dieren classificeren');
    expect(existsSync(join(uit, 'lesplannen', 'LP0065.json'))).toBe(true);
    const r2 = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r2.status, r2.stdout).toBe(0);
    expect(r2.rapport.bestanden.verwijderd).toEqual(['lesplannen/LP0065.json']);
    expect(existsSync(join(uit, 'lesplannen', 'LP0065.json'))).toBe(false);
    expect(Object.keys(opname(uit))).toEqual(BESTANDEN.filter((b) => !b.startsWith('lesplannen/')));
  });
});

// ── Een voorstel naast een koppeling met een ander vak (vorm B) ──────

describe('maak.ts: een voorstel naast een officiële koppeling met twijfel ander-vak (vorm B, zoals WI.706)', () => {
  // WT.001 verwijst naar KO 4.2.3, een minimumdoel van aardrijkskunde (ODS_3411/92500 in de echte minimumdoelen).
  const anderVak = (voorstel: string): BekendeAfwijking => ({ soort: 'koppeling-ander-vak', doel: 'WT.001', moment: 'KO', code: '4.2.3', voorstel, reden: 'Een code van aardrijkskunde, met een voorstel (test).', datum: '2026-11-11' });
  let werk = '';
  let uit = '';

  beforeAll(() => {
    werk = join(TMP, 'andervak', 'werk');
    uit = join(TMP, 'andervak', 'uit');
  });

  it('mutatie: een voorstel dat geen doel vindt, stopt (exit 3, niets geschreven)', () => {
    const { bekende } = werkmap(werk, { wt: wt('4.2.3'), bekende: [DOELTEKST, anderVak('3.9.9')] });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('  NIEUW WT rij 3 (WT.001) [koppeling-voorstel]: het voorstel 3.9.9 voor KO "4.2.3" vindt geen doel');
    expect(r.rapport.afwijkingen.nieuw.map((a) => a.soort)).toEqual(['koppeling-voorstel']);
    expect(opname(uit)).toEqual({});
  });

  it('een voorstel dat precies één doel van een verwacht vak vindt, gaat door: officieel blijft, het voorstel staat erbij', () => {
    const { bekende } = werkmap(werk, { wt: wt('4.2.3'), bekende: [DOELTEKST, anderVak('3.1.2')] });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('Koppeling op doelzin-rijen: 1 van 1 vinden precies één doel; 1 voorstel (WT.001 KO "4.2.3" → 3.1.2 (ODS_3410/92590)); 0 problemen.');
    const wtBestand = JSON.parse(readFileSync(join(uit, 'leerplan', 'WT.json'), 'utf8')) as { doelen: { code: string; minimumdoelen: { refs: unknown[] } }[] };
    expect(wtBestand.doelen.find((d) => d.code === 'WT.001')?.minimumdoelen.refs).toEqual([
      { set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO', status: 'officieel', twijfel: ['ander-vak'] },
      { set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'voorstel', bronCode: '4.2.3' },
    ]);
    const vier = JSON.parse(readFileSync(join(uit, 'bij-minimumdoel', '4.json'), 'utf8')) as { doelen: Record<string, { code: string; voorstel?: unknown }[]> };
    expect(vier.doelen['92500'].map((d) => [d.code, d.voorstel])).toEqual([['WT.001', { set: 'ODS_3410', id: '92590', code: '3.1.2' }]]);
  });

  it('mutatie: een voorstel naar een doel van een vak dat de vakdiscipline niet verwacht, stopt', () => {
    const { bekende } = werkmap(werk, { wt: wt('4.2.3'), bekende: [DOELTEKST, anderVak('2.4.3')] });
    const voor = opname(uit);
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('[koppeling-voorstel]: het voorstel 2.4.3 voor KO 4.2.3 is een minimumdoel van vak 2, niet van een vak dat WT verwacht');
    expect(opname(uit)).toEqual(voor);
  });
});

// ── Wat altijd stopt ─────────────────────────────────────────────────

describe('maak.ts: een ontbrekende doelenset, een wees in --uit, een verkeerde invoer', () => {
  let werk = '';
  let uit = '';
  let bekende = '';
  beforeAll(() => {
    werk = join(TMP, 'stop', 'werk');
    uit = join(TMP, 'stop', 'uit');
    bekende = werkmap(werk).bekende;
    const r = draai(werk, uit, bekende);
    if (r.status !== 0) throw new Error(r.stdout);
  });

  it('een doelenset die ontbreekt, stopt altijd, ook met --aanvaard-wijzigingen (IMP-3)', () => {
    werkmap(werk, { ll: null, lesplan: null, bekende: [] });
    const voor = opname(uit);
    const r = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('WIJZIGING verdwenen doelenset (stopt altijd): LL (Leren leren)');
    expect(r.stdout).toContain('bestanden in --uit die de nieuwe index niet noemt: leerplan/LL.json');
    expect(r.rapport.wijzigingen.find((w) => w.soort === 'verdwenen doelenset')).toMatchObject({ stopt: true, altijd: true });
    expect(opname(uit)).toEqual(voor);
  });

  it('een bestand in --uit dat de nieuwe index niet noemt, stopt ook met de vlag', () => {
    werkmap(werk);
    writeFileSync(join(uit, 'lesplannen', 'LP9999.json'), '{}');
    const r = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('bestanden in --uit die de nieuwe index niet noemt: lesplannen/LP9999.json');
    unlinkSync(join(uit, 'lesplannen', 'LP9999.json'));
    expect(draai(werk, uit, bekende).status).toBe(0);
  });

  it('een afwijkend manifest stopt (exit 3)', () => {
    werkmap(werk, { manifest: [{ naam: 'LP0065.docx', bytes: 1, sha256: 'f'.repeat(64) }] });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('GESTOPT: LP0065.docx: bytes of sha256 wijken af van manifest.json.');
  });

  it('een ruwe JSON die niet uit het origineel in bron/ gelezen is, stopt (IMP-2)', () => {
    werkmap(werk);
    // Een nieuwer origineel in bron/, maar de oude ruwe JSON: de bronvermelding zou niet bij de tekst horen.
    writeFileSync(join(werk, 'bron', 'LP0065.docx'), 'een nieuwere versie van het lesplan');
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain('GESTOPT: LP0065.docx: de ruwe JSON LP0065.json is niet uit dit bestand gelezen');
    const ruw = JSON.parse(readFileSync(join(werk, 'ruw', 'LP0065.json'), 'utf8')) as Record<string, unknown>;
    delete ruw.bron;
    writeFileSync(join(werk, 'ruw', 'LP0065.json'), JSON.stringify(ruw));
    const r2 = draai(werk, uit, bekende);
    expect(r2.status, r2.stdout).toBe(3);
    expect(r2.stdout).toMatch(/VALIDATIE ruw\/LP0065\.json: "bron" ontbreekt/);
  });
});

// ── Een doorhaling weglaten (besluit 'opmaak-weglaten') ──────────────

describe("maak.ts: besluit 'opmaak-weglaten' (een doorgehaalde spatie of punt zonder doorhaling tonen)", () => {
  // WT.002 staat op rij 4 van wt(); 'Doel' + doorgehaald stuk + rest, samen 'Doel 2.'.
  const metDoorhaling = (doorgehaald: string, rest: string): RuwXlsx => {
    const ruw = wt('3.1.2', `Doel${doorgehaald}${rest}`);
    const x = ruw.rijen.find((y) => y.c[1] === 'WT.002');
    if (!x) throw new Error('WT.002 ontbreekt in de testdoelenset');
    x.opmaak = { '2': [{ t: 'Doel' }, { t: doorgehaald, strike: true }, { t: rest }] };
    return ruw;
  };
  const besluit = (b: 'opmaak-bewaren' | 'opmaak-weglaten', tekst = 'Doel 2.'): BekendeAfwijking => ({ soort: 'opmaak', vak: 'WT', rij: 4, kolom: 2, tekst, besluit: b, reden: 'Een doorgehaalde spatie (test).', datum: '2026-11-12' });
  const wt002 = (uit: string) => (JSON.parse(readFileSync(join(uit, 'leerplan', 'WT.json'), 'utf8')) as { doelen: { code: string; tekst: string; opmaak?: unknown }[] }).doelen.find((d) => d.code === 'WT.002');
  let werk = '';
  let uit = '';
  beforeAll(() => {
    werk = join(TMP, 'weglaten', 'werk');
    uit = join(TMP, 'weglaten', 'uit');
  });

  it('van bewaren naar weglaten: een wijziging die stopt; met de vlag verdwijnt alleen de doorhaling, de tekst blijft', () => {
    const { bekende } = werkmap(werk, { wt: metDoorhaling(' ', '2.'), bekende: [DOELTEKST, besluit('opmaak-bewaren')] });
    const r1 = draai(werk, uit, bekende);
    expect(r1.status, r1.stdout).toBe(0);
    expect(wt002(uit)).toMatchObject({ tekst: 'Doel 2.', opmaak: [{ t: 'Doel' }, { t: ' ', s: true }, { t: '2.' }] });

    werkmap(werk, { wt: metDoorhaling(' ', '2.'), bekende: [DOELTEKST, besluit('opmaak-weglaten')] });
    const voor = opname(uit);
    const r2 = draai(werk, uit, bekende);
    expect(r2.status, r2.stdout).toBe(3);
    expect(r2.stdout).toContain('  WIJZIGING andere tekst: WT.002: de opmaak van "Doel 2." is anders');
    expect(r2.rapport.wijzigingen.filter((w) => w.stopt).map((w) => w.soort)).toEqual(['andere tekst']);
    expect(opname(uit)).toEqual(voor);

    const r3 = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r3.status, r3.stdout).toBe(0);
    const doel = wt002(uit);
    expect(doel?.tekst).toBe('Doel 2.');
    expect(doel && 'opmaak' in doel).toBe(false);
    const r4 = draai(werk, uit, bekende);
    expect(r4.status, r4.stdout).toBe(0);
    expect(r4.stdout).toContain('Bestanden: 0 geschreven, 5 ongewijzigd.');
  });

  it('mutatie: weglaten bij een doorgehaald woord stopt (exit 3, niets geschreven) en noemt het doorgehaalde stuk', () => {
    const { bekende } = werkmap(werk, { wt: metDoorhaling(' twee', ' 2.'), bekende: [DOELTEKST, besluit('opmaak-weglaten', 'Doel twee 2.')] });
    const voor = opname(uit);
    const r = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain(`NIEUW WT rij 4, kolom 2 [opmaak]: het besluit 'opmaak-weglaten' geldt alleen voor een doorgehaalde spatie of een doorgehaald leesteken; hier is " twee" doorgehaald`);
    expect(r.rapport.afwijkingen.nieuw.map((a) => a.soort)).toEqual(['opmaak']);
    expect(opname(uit)).toEqual(voor);
  });

  it("mutatie: een onbekend besluit in bekende-afwijkingen.json stopt de run", () => {
    const { bekende } = werkmap(werk, { wt: metDoorhaling(' ', '2.'), bekende: [DOELTEKST, { ...besluit('opmaak-weglaten'), besluit: 'weglaten' } as unknown as BekendeAfwijking] });
    const voor = opname(uit);
    const r = draai(werk, uit, bekende, '--aanvaard-wijzigingen');
    expect(r.status, r.stdout).not.toBe(0);
    expect(r.stdout).toContain(`"besluit" is 'opmaak-bewaren' of 'opmaak-weglaten'`);
    expect(opname(uit)).toEqual(voor);
  });
});

// ── Het getoonde beeld ───────────────────────────────────────────────

describe('maak.ts: een getoond beeld is byte-gelijk aan wat de eigenaar vrijgaf (IMP-6)', () => {
  const SHA1 = 'e'.repeat(40);
  const BESTAND = `beelden/${SHA1}.webp`;
  const WEBP = Buffer.from('RIFF....WEBPVP8 nagebootst beeld');
  const beeld = p([{ t: 'beeld', bestand: 'word/media/image1.png', sha1: SHA1, breed: 952500, hoog: 952500 }]);
  const regel = (sha256: string): BekendeAfwijking => ({ soort: 'lesplan-beeld', sha1: SHA1, lesplannen: ['LP0065'], status: 'getoond', bestand: BESTAND, sha256, alt: 'Een beeld.', reden: 'Vrijgegeven door de eigenaar (test).', datum: '2026-11-09' });
  const goed = createHash('sha256').update(WEBP).digest('hex');
  let werk = '';
  let uit = '';
  let bekende = '';
  beforeAll(() => {
    werk = join(TMP, 'beeld', 'werk');
    uit = join(TMP, 'beeld', 'uit');
    bekende = werkmap(werk, { lesplan: lesplanRuw({ deel4Extra: [beeld] }), bekende: [DOELTEKST, regel(goed)] }).bekende;
  });

  it('ontbreekt het beeld in de werkmap en in --uit, dan stopt de run', () => {
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain(`getoonde beelden ontbreken of kloppen niet: ${BESTAND} (niet in de werkmap)`);
  });

  it('met het juiste beeld in de werkmap wordt het mee geschreven', () => {
    mkdirSync(join(werk, 'beelden'), { recursive: true });
    writeFileSync(join(werk, BESTAND), WEBP);
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(0);
    expect(readFileSync(join(uit, BESTAND))).toEqual(WEBP);
  });

  it('zonder beeld in de werkmap neemt maak.ts het uit --uit als de sha256 klopt', () => {
    rmSync(join(werk, 'beelden'), { recursive: true });
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('Bestanden: 0 geschreven, 6 ongewijzigd.');
  });

  it('een ander bestand onder dezelfde naam stopt, in de werkmap en in --uit', () => {
    mkdirSync(join(werk, 'beelden'), { recursive: true });
    writeFileSync(join(werk, BESTAND), 'een ander beeld');
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain(`${BESTAND} (sha256 wijkt af van bekende-afwijkingen.json)`);
    rmSync(join(werk, 'beelden'), { recursive: true });
    writeFileSync(join(uit, BESTAND), 'een ander beeld');
    const r2 = draai(werk, uit, bekende);
    expect(r2.status, r2.stdout).toBe(3);
    expect(r2.stdout).toContain(`${BESTAND} (niet in de werkmap, en in --uit met een andere inhoud)`);
  });

  it('een getoond beeld zonder sha256 in bekende-afwijkingen.json stopt', () => {
    const { sha256: _weg, ...zonder } = regel(goed) as BekendeAfwijking & { sha256: string };
    writeFileSync(bekende, JSON.stringify({ afwijkingen: [DOELTEKST, zonder] }));
    writeFileSync(join(uit, BESTAND), WEBP);
    const r = draai(werk, uit, bekende);
    expect(r.status, r.stdout).toBe(3);
    expect(r.stdout).toContain(`${BESTAND} (geen sha256 in bekende-afwijkingen.json)`);
  });
});
