import { z } from 'zod';
import type { Brief } from '../../../../../libs/contracts/src/index.js';
import { outputSchema } from './assessment-schema.js';

const areas = ['I', 'II', 'III'];
const section = outputSchema.shape.sections.element;
const task = section.shape.questions.element.omit({ points: true });

export function assessmentMarkPlan(brief: Brief) {
  const total = brief.totalPoints;
  if (!total || brief.mix || /\b(?:genau|exactly)\s+\d+\s+(?:aufgaben|fragen|questions|tasks)\b/i.test(brief.brief)) return;
  const weights = new Map([...brief.brief.matchAll(/\bAFB\s+(III|II|I)\b[^%\r\n]{0,120}?(\d{1,3})\s*%/gi)]
    .map(match => [match[1].toUpperCase(), Number(match[2])]));
  const shares = areas.map(area => weights.get(area) ?? 0);
  if (shares.some(share => share <= 0) || shares.reduce((sum, share) => sum + share, 0) !== 100) return;
  const first = Math.round(total * shares[0] / 100);
  const second = Math.round(total * shares[1] / 100);
  const budgets = [first, second, total - first - second];
  if (budgets.some(points => points < 1)) return;
  return areas.map((area, i) => {
    const points = budgets[i];
    const split = Math.ceil(points / 2);
    return { key: 'afb' + area, area: 'AFB ' + area,
      tasks: (points >= 10 ? [split, points - split] : [points]).map((marks, index) => ({ key: 'task' + (index + 1), marks })) };
  });
}

export function plannedOutput(plan: NonNullable<ReturnType<typeof assessmentMarkPlan>>) {
  const schema = outputSchema.omit({ sections: true }).extend({
    sections: z.strictObject(Object.fromEntries(plan.map(group => [
      group.key, section.omit({ questions: true }).extend({
        questions: z.strictObject(Object.fromEntries(group.tasks.map(item => [item.key, task]))),
      }),
    ]))),
  });
  return {
    schema,
    project(output: unknown) {
      const result = schema.safeParse(output);
      if (!result.success) return null;
      const { sections, ...fields } = result.data;
      return { ...fields, sections: plan.map(group => {
        const { questions, ...heading } = sections[group.key];
        return { ...heading, questions: group.tasks.map(item => ({ ...questions[item.key], points: item.marks })) };
      }) };
    },
  };
}
