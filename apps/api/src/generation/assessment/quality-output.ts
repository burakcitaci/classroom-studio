import { z } from 'zod';
import type { Brief } from '../../../../../libs/contracts/src/index.js';
import { outputSchema } from './assessment-schema.js';
import { assessmentRequirements } from './assessment-quality.js';

// Fixed slots constrain the model to the requested practice scope. Points are
// still generated and checked against the teacher's total when one is supplied.
export function qualityOutput(brief: Brief) {
  const requirements = assessmentRequirements(brief);
  if (!requirements) return undefined;
  const section = outputSchema.shape.sections.element;
  const groups = Array.from({ length: requirements.minimumSections }, (_, i) => ({
    key: 'area' + (i + 1), label: requirements.cognitiveAreas[i]?.split(':')[0],
    count: Math.floor(requirements.minimumQuestions / requirements.minimumSections) + Number(i < requirements.minimumQuestions % requirements.minimumSections),
  }));
  const keys = (count: number) => Array.from({ length: count }, (_, i) => 'task' + (i + 1));
  const schema = outputSchema.omit({ sections: true }).extend({
    sections: z.strictObject(Object.fromEntries(groups.map(group => [group.key,
      section.omit({ questions: true }).extend({ questions: z.strictObject(Object.fromEntries(keys(group.count).map(key => [key, section.shape.questions.element]))) }),
    ]))),
  });
  return { schema, project(output: unknown) {
    const parsed = schema.safeParse(output);
    if (!parsed.success) return null;
    return { ...parsed.data, sections: groups.map(group => {
      const value = parsed.data.sections[group.key];
      const heading = value.title.replace(/^(?:\s*AFB\s*(?:III|II|I)\b\s*[:–—-]?\s*)+/i, '');
      return { ...value, title: ((group.label ? group.label + ': ' : '') + heading).slice(0, 140), questions: keys(group.count).map(key => value.questions[key]) };
    }) };
  } };
}
