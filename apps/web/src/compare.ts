import type { Assessment, Question, Settings } from '../../../libs/contracts/src';

export interface Side {
  draft: Assessment;
  settings: Settings;
  label: string;
}

type Located = { question: Question; section: string; sectionId: string; position: number };

function locate(draft: Assessment): Map<string, Located> {
  return new Map(draft.sections.flatMap(section => section.questions.map((question, position) =>
    [question.id, { question, section: section.title, sectionId: section.id, position: position + 1 }] as const)));
}

function orderAmongShared(own: Map<string, Located>, other: Map<string, Located>) {
  const counts = new Map<string, number>();
  const ranks = new Map<string, number>();
  for (const [id, row] of own) {
    if (other.get(id)?.sectionId !== row.sectionId) continue;
    const rank = (counts.get(row.sectionId) ?? 0) + 1;
    counts.set(row.sectionId, rank);
    ranks.set(id, rank);
  }
  return ranks;
}

const fields = { prompt: 'Question', points: 'Points', lines: 'Answer space', answer: 'Answer', rubric: 'Scoring', citations: 'Citations' } as const;

export function compare(left: Side, right: Side) {
  const a = locate(left.draft);
  const b = locate(right.draft);
  const aRank = orderAmongShared(a, b);
  const bRank = orderAmongShared(b, a);
  const settings = (side: Side) => ({
    'RAG mode': side.settings.rag,
    'Retrieval settings': 'Top ' + side.settings.topK + ' · ' + side.settings.hops + ' graph hop(s)',
    'Total points requested': side.settings.brief.totalPoints?.toString() ?? 'Automatic',
    Language: side.settings.brief.language === 'de' ? 'German' : 'English',
  });
  const l = settings(left);
  const r = settings(right);
  const context = (draft: Assessment) => [
    ['Title', draft.title],
    ['Instructions', draft.instructions],
    ['Section titles and instructions', draft.sections.map(section => [section.title, section.instructions].filter(Boolean).join('\n')).join('\n\n')],
    ['Teacher notes', draft.teacherNotes],
  ];
  return {
    settings: (Object.keys(l) as (keyof typeof l)[]).map(key => ({ key, left: l[key], right: r[key] })),
    overview: context(left.draft).map(([key, value], i) => ({ key, left: value, right: context(right.draft)[i][1] })),
    questions: [...new Set([...a.keys(), ...b.keys()])].map(id => {
      const before = a.get(id);
      const after = b.get(id);
      const edited = before && after ? (Object.keys(fields) as (keyof typeof fields)[]).filter(key =>
        JSON.stringify(before.question[key]) !== JSON.stringify(after.question[key])).map(key => fields[key]) : [];
      const moved = Boolean(before && after && (before.sectionId !== after.sectionId || aRank.get(id) !== bRank.get(id)));
      const labels = !before ? ['Added'] : !after ? ['Removed'] : [...(edited.length ? ['Edited'] : []), ...(moved ? ['Reordered'] : [])];
      return { id, before, after, labels, edited };
    }),
  };
}
