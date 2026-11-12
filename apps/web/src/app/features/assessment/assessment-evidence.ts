import type { Assessment, Question } from '../../../../../../libs/contracts/src';

export function evidenceFor(draft: Assessment | null, question: Question) {
  const citations = new Set(question.citations);
  return (draft?.evidence ?? []).filter(excerpt => citations.has(excerpt.id));
}
