import type { Question, QuizConfig } from './types';
import { extractGaps } from './grading';
import { normalizeAnswer } from './utils';

export interface LintWarning {
  /**
   * Vraagnummer zoals de editor het toont: 1-gebaseerde positie in
   * `config.questions`, infoblokken tellen mee. Null voor widget-brede signalen.
   */
  questionNo: number | null;
  text: string;
  /**
   * Raakt de punten rechtstreeks (bv. geen juist antwoord aangeduid, zodat
   * blanco alle punten krijgt). Zulke signalen staan vooraan in de lijst.
   */
  severe?: boolean;
}

/** Begin van elk signaal over een ontbrekende sleutel; ook in de tests gebruikt. */
export const NO_KEY_TEXT = 'Geen juist antwoord aangeduid';

/**
 * Ontbreekt de sleutel van deze vraag? Geeft de signalen terug, leeg als er
 * een bruikbaar juist antwoord is. Zonder sleutel kan blanco alle punten
 * opleveren (meerdere antwoorden zonder aangevinkte optie, een gat "[ ]") of
 * kan niemand ooit juist antwoorden.
 */
function missingKey(q: Question): string[] {
  const out: string[] = [];
  if (q.type === 'mc' || q.type === 'multi') {
    const options = Array.isArray(q.options) ? q.options : [];
    const filled = (ci: unknown) =>
      typeof ci === 'number' && Number.isInteger(ci) && ci >= 0 && ci < options.length
      && (options[ci] ?? '').trim() !== '';
    if (q.type === 'mc') {
      const ci = q.correctIndex;
      const inRange = typeof ci === 'number' && Number.isInteger(ci) && ci >= 0 && ci < options.length;
      if (!inRange) out.push(`${NO_KEY_TEXT}: vink de juiste optie aan.`);
      else if (!filled(ci)) out.push(`${NO_KEY_TEXT}: de aangevinkte optie is leeg.`);
    } else {
      const cis = Array.isArray(q.correctIndices) ? q.correctIndices : [];
      if (cis.length === 0) out.push(`${NO_KEY_TEXT}: wie niets aanvinkt, krijgt nu alle punten.`);
      else if (!cis.some(filled)) out.push(`${NO_KEY_TEXT}: de aangevinkte opties zijn leeg.`);
    }
  }
  if (q.type === 'tf' && typeof q.answer !== 'boolean') {
    out.push(`${NO_KEY_TEXT}: kies juist of onjuist.`);
  }
  if (q.type === 'short') {
    const accepted = Array.isArray(q.accepted) ? q.accepted : [];
    if (!accepted.some((a) => typeof a === 'string' && normalizeAnswer(a) !== '')) {
      out.push(`${NO_KEY_TEXT}: vul minstens één aanvaard antwoord in.`);
    }
  }
  if (q.type === 'gap') {
    extractGaps(q.text ?? '').forEach((g, gi) => {
      const alts = g.split('|');
      if (alts.every((o) => normalizeAnswer(o) === '')) {
        out.push(`${NO_KEY_TEXT} in gat ${gi + 1}: een leeg vakje telt nu als juist.`);
      } else if (alts.some((o) => normalizeAnswer(o) === '')) {
        out.push(`${NO_KEY_TEXT} in gat ${gi + 1}: [${g}] heeft een leeg alternatief, dus een leeg vakje telt als juist.`);
      }
    });
  }
  return out;
}

/**
 * Vraag-linter: signaleert bekende constructiefouten uit de toetsliteratuur.
 * Signalen, geen wetten — de leerkracht beslist. Signalen die de punten raken
 * (geen sleutel) staan vooraan, want de editor toont er maar een handvol.
 */
export function lintQuiz(config: QuizConfig): LintWarning[] {
  const severe: LintWarning[] = [];
  const warnings: LintWarning[] = [];
  const questions = Array.isArray(config.questions) ? config.questions : [];
  const gradable = questions.filter((q) => q.type !== 'info');

  questions.forEach((q, i) => {
    if (q.type === 'info') return;
    // zelfde nummer als de badge in de editor (infoblokken tellen mee)
    const no = i + 1;
    const add = (text: string) => warnings.push({ questionNo: no, text });

    for (const text of missingKey(q)) severe.push({ questionNo: no, text, severe: true });

    // dubbele ontkenning in de vraagstam
    const negations = ((q.prompt ?? '').toLowerCase().match(/\b(niet|geen|nooit|niemand)\b/g) ?? []).length;
    if (negations >= 2) add('Dubbele ontkenning in de vraag — herformuleer positief voor betere validiteit.');

    if (q.type === 'mc' || q.type === 'multi') {
      const options = Array.isArray(q.options) ? q.options : [];
      const opts = options.filter((o) => o.trim());
      if (opts.length < 3) add('Minder dan 3 antwoordopties — gokkans is groot.');
      const correctIdx = q.type === 'mc' ? [q.correctIndex] : (Array.isArray(q.correctIndices) ? q.correctIndices : []);
      const correct = correctIdx.map((ci) => options[ci] ?? '').filter(Boolean);
      const wrong = options.filter((_, oi) => !correctIdx.includes(oi)).filter((o) => o.trim());
      if (correct.length > 0 && wrong.length > 0) {
        const avgWrong = wrong.reduce((a, o) => a + o.length, 0) / wrong.length;
        if (correct.some((c) => c.length > avgWrong * 1.7 && c.length > 20)) {
          add('Het juiste antwoord is opvallend langer dan de afleiders — een bekende weggever.');
        }
      }
      if (options.some((o) => /\b(alle bovenstaande|geen van bovenstaande|alle antwoorden)\b/i.test(o))) {
        add('“Alle/geen van bovenstaande” meet vaak testwijsheid in plaats van kennis.');
      }
    }

    if (q.type === 'gap' && extractGaps(q.text ?? '').length === 0) {
      add('Invuloefening zonder gaten — zet woorden tussen [vierkante haken].');
    }
    // rating/likert staan per ontwerp op 0 punten (geen juist/fout) — daar is 0 geen fout.
    if (q.points === 0 && q.type !== 'rating' && q.type !== 'likert') add('Deze vraag staat op 0 punten — bedoeling?');
  });

  // widget-brede signalen
  if (gradable.length >= 4) {
    const allRecognition = gradable.every((q) => q.type === 'mc' || q.type === 'multi' || q.type === 'tf');
    if (allRecognition) {
      warnings.push({ questionNo: null, text: 'Alle vragen zijn herkenvragen (meerkeuze/juist-onjuist). Overweeg ook productieve vragen (kort antwoord, open vraag) voor dieper leren.' });
    }
    const withExplanation = gradable.filter((q) => q.explanation?.trim()).length;
    if (withExplanation / gradable.length < 0.3) {
      warnings.push({ questionNo: null, text: 'Weinig vragen hebben uitleg bij de feedback — juist die uitleg maakt van een fout een leermoment.' });
    }
  }

  return [...severe, ...warnings];
}
