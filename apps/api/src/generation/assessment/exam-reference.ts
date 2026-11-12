import { terms } from '../../sources/retrieval.js';

const examHeading = /\b(?:klassenarbeit|klausur|(?:sample|past|mock|practice)\s+(?:assessment|exam|test)|exam(?:ination)?\s+paper)\b/i;
const answerKey = /^\s*(?:erwartungshorizont|lösungsblatt|musterlösungen|answer key|mark scheme)\b/im;
const taskNumber = /^\s*(?:(?:aufgabe|question|task)\s+\d+\b|\d{1,2}[.)]\s)/gim;

export function isExamReference(name: string, text: string) {
  const hasExamHeading = examHeading.test(name.replace(/_/g, ' ')) || examHeading.test(text.slice(0, 1200));
  const hasAnswerKey = answerKey.test(text);
  return (hasExamHeading || hasAnswerKey) && [...text.matchAll(taskNumber)].length >= 2;
}

export function factPassages<T extends { text: string }>(passages: T[]) {
  const keyStart = passages.findIndex(passage => answerKey.test(passage.text));
  const start = Math.max(keyStart, 0);
  return passages.slice(start, start + 5);
}

export function comparable(text: string) {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
}

const segments = (text: string) => text.split(/\r?\n|[!?]+|\.(?=\s+\p{Lu})/u)
  .map(part => comparable(part.replace(/^\s*(?:\d+[.)]|[a-h]\))\s*/i, '')))
  .filter(part => part.length >= 16 && terms(part).length >= 3);

const phraseSize = 7;
function phrases(text: string) {
  const words = text.split(' ');
  return words.slice(phraseSize - 1).map((_, start) => words.slice(start, start + phraseSize).join(' '));
}

const mapTask = /\b(?:maßstab|massstab|scale|karte|karten|atlas|map)\b/i;
function mapDistances(text: string) {
  if (!mapTask.test(text)) return [];
  return [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:cm|zentimetern?|centimeters?)\b/gi)]
    .map(match => Number(match[1].replace(',', '.'))).filter(distance => distance !== 1);
}

function questionSections(references: string[]) {
  return references.map(text => {
    const key = text.search(answerKey);
    return key < 0 ? text : text.slice(0, key);
  });
}

export function referenceMapDistances(references: string[]) {
  return new Set(questionSections(references).flatMap(text =>
    text.split(/\n\s*(?=(?:aufgabe|question|task)\s+\d+\b)/i).flatMap(mapDistances)));
}

export function examQuestionCheck(references: string[]) {
  const questions = questionSections(references);
  const excerpts = questions.map(comparable);
  const referencePhrases = new Set(excerpts.flatMap(phrases));
  const referenceSegments = new Set(questions.flatMap(segments));
  const referenceTerms = [...referenceSegments].map(part => new Set(terms(part))).filter(words => words.size >= 4);
  const referenceDistances = referenceMapDistances(references);

  return (prompt: string) => {
    const normalized = comparable(prompt);
    if (normalized.length >= 28 && excerpts.some(text => (' ' + text + ' ').includes(' ' + normalized + ' '))) return true;
    if (phrases(normalized).some(phrase => referencePhrases.has(phrase) && terms(phrase).length >= 3)) return true;
    if (mapDistances(prompt).some(distance => referenceDistances.has(distance))) return true;

    return segments(prompt).some(part => {
      if (referenceSegments.has(part)) return true;
      const tokens = part.split(' ');
      if (tokens.length >= 4 && tokens.length <= 6) {
        const shortened = tokens.slice(1).map((_, i) =>
          new RegExp(' ' + tokens.slice(0, i + 1).join(' ') + ' (?:[\\p{L}\\p{N}]+ )?' + tokens.slice(i + 1).join(' ') + ' ', 'u'));
        if (shortened.some(pattern => excerpts.some(text => pattern.test(' ' + text + ' ')))) return true;
      }
      const words = new Set(terms(part));
      if (words.size < 4) return false;
      return referenceTerms.some(reference => {
        if (Math.min(words.size, reference.size) / Math.max(words.size, reference.size) < .8) return false;
        const shared = [...words].filter(word => reference.has(word)).length;
        return shared >= 4 && shared / (words.size + reference.size - shared) >= .8;
      });
    });
  };
}
