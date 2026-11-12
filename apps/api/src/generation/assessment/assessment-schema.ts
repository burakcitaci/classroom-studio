import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assessmentSchema, questionBodySchema, type Assessment, type Evidence, type Generation, type Job, type Question } from '../../../../../libs/contracts/src/index.js';
import { ProviderError } from '../../providers/provider-request.js';
import { comparable, examQuestionCheck } from './exam-reference.js';
import { assessmentRequirements } from './assessment-quality.js';

const modelQuestion = questionBodySchema.extend({ citations: z.array(z.number().int().positive()).max(8) });
export const outputSchema = z.strictObject({
  title: z.string().trim().min(1).max(180),
  instructions: z.string().max(2500),
  sections: z.array(z.strictObject({
    title: z.string().trim().min(1).max(140),
    instructions: z.string().max(1500),
    questions: z.array(modelQuestion).min(1).max(30),
  })).min(1).max(8),
  teacherNotes: z.string().max(3500),
  warnings: z.array(z.string().trim().min(1).max(500)).max(12),
});
export type ModelOutput = z.infer<typeof outputSchema>;
export type ModelQuestion = z.infer<typeof modelQuestion>;

export const PROMPT_VERSION = 'assessment-v9';
export const parameters = { temperature: 0.2, seed: 42, numPredict: 5500 };
export function generationParameters(settings: Generation) {
  return { ...parameters, numPredict: !settings.questionId && assessmentRequirements(settings.brief) ? 10000 : parameters.numPredict };
}
export type FactPassage = Pick<Evidence, 'sourceId' | 'name' | 'ordinal' | 'text'>;
export interface Generator {
  model: string;
  listModels?(): Promise<string[]>;
  extractFacts?(settings: Generation, passages: FactPassage[]): Promise<{ evidence: Evidence[]; usage?: Job['usage']; warnings?: string[] }>;
  generate(context: GenerationContext): Promise<{ output: unknown; usage?: Job['usage']; warnings?: string[] }>;
}
export interface GenerationContext {
  settings: Generation;
  evidence: Evidence[];
  format: Evidence[];
  existing?: Question;
  referenceText?: string[];
}

export function atlasPlaceholder(brief: Generation['brief']) {
  return /atlas/i.test(brief.brief) ? brief.brief.match(/\bS\.\s*_{2,}/i)?.[0] : undefined;
}

export function draftIssue(output: ModelOutput, context: GenerationContext) {
  const questions = output.sections.flatMap(section => section.questions);
  const issues: string[] = [];
  const studentText = [output.instructions, ...output.sections.map(section => section.instructions)].map(comparable).join(' ');
  const teacherText = [context.settings.brief.brief, context.settings.brief.documentType?.guidance ?? ''];
  const copiedBrief = teacherText.some(text => {
    const words = comparable(text).split(' ').filter(Boolean);
    return words.length >= 12 && words.some((_, index) => index + 12 <= words.length && studentText.includes(words.slice(index, index + 12).join(' ')));
  });
  if (copiedBrief) issues.push('Student instructions copy the teacher brief or reusable generation guidance. Replace them with concise directions addressed to students. Never print instructions about creating the assessment.');
  const requirements = !context.existing && assessmentRequirements(context.settings.brief);
  if (requirements) {
    if (questions.length < requirements.minimumQuestions) issues.push('The Abitur practice is too short. Supply at least ' + requirements.minimumQuestions + ' substantial tasks, including application and evaluation, rather than a definition quiz.');
    if (output.sections.length < requirements.minimumSections) issues.push('Create separate sections for ' + requirements.cognitiveAreas.join(', ') + '.');
    if (requirements.cognitiveAreas.length) {
      const areas = [
        { title: /\bAFB\s*I\b|reproduktion|grundwissen|recall/i, task: /./s },
        { title: /\bAFB\s*II\b|anwendung|analyse|application|analysis/i, task: /analys|erklär|erläut|vergleich|untersuch|berechn|anwenden|wende|explain|compare|apply|calculat/i },
        { title: /\bAFB\s*III\b|transfer|bewertung|beurteilung|evaluation/i, task: /beurteil|bewert|erörter|diskut|begründe|begr[uü]nd|entwick|prüf|evaluate|assess|justify|discuss|propose|design|argue|stellung/i },
      ];
      areas.forEach((area, index) => {
        const sections = output.sections.filter(section => area.title.test(section.title));
        if (!sections.some(section => section.questions.some(question => area.task.test(question.prompt)))) issues.push('Missing substantive tasks for ' + requirements.cognitiveAreas[index] + '. Use that AFB label in the section title and an appropriate task operator.');
        if (context.evidence.length && sections.length && !sections.some(section => section.questions.some(question => question.citations.length))) issues.push('Ground ' + requirements.cognitiveAreas[index] + ' in the supplied excerpts and cite its supporting evidence.');
      });
    }
  }
  const expected = context.existing?.points ?? context.settings.brief.totalPoints;
  if (expected !== null && questions.reduce((sum, question) => sum + question.points, 0) !== expected) {
    issues.push('The generated points did not add up to ' + expected + '. Create tasks and rubrics totaling exactly ' + expected + '.');
  }
  const incomplete = questions.flatMap((question, i) =>
    !question.answer.trim() || (question.points > 0 && !question.rubric.trim()) ? [i + 1] : []);
  if (incomplete.length) {
    issues.push('The model did not supply an answer and scoring guidance for every question. Write a concrete answer ' +
      'and complete scoring guidance for question(s) ' + incomplete.join(', ') + '.');
  }
  if (!context.existing && atlasPlaceholder(context.settings.brief) && !output.sections.some(section =>
    [section.instructions, ...section.questions.map(question => question.prompt)].some(text => /atlas/i.test(text) && /\bS\.\s*_{2,}/i.test(text)))) {
    issues.push('The draft is missing an atlas task with the requested page placeholder. Include an atlas instruction with “S. ___”.');
  }
  const references = context.referenceText ?? context.format.map(item => item.text);
  if (references.length && context.settings.brief.documentType?.audience !== 'teacher') {
    const isCopied = examQuestionCheck(references);
    const copied = questions.flatMap((question, i) => isCopied(question.prompt) ? [i + 1] : []);
    if (copied.length) issues.push('The model copied or closely repeated reference tasks at position(s) ' + copied.join(', ') +
      '. Invent a different task for those topics, including a new scenario and different calculation inputs where relevant.');
  }
  return issues.length ? issues.join(' ') : undefined;
}

export function validateAssessment(raw: unknown, context: GenerationContext, previous?: Assessment | null): Assessment {
  const result = outputSchema.safeParse(raw);
  if (!result.success) throw new ProviderError('The model returned an incomplete assessment. Try a shorter or more specific brief.');
  const { settings, evidence, existing, format } = context;
  const output = result.data;
  const questions = output.sections.flatMap(section => section.questions);
  if ((existing && questions.length !== 1) || questions.length > 40) {
    throw new ProviderError('The model returned the wrong number of questions. Retry with a more specific brief.');
  }
  const issue = draftIssue(output, context);
  if (issue) throw new ProviderError(issue);
  const prompts = questions.map(question => comparable(question.prompt));
  if (new Set(prompts).size !== prompts.length || (existing && settings.brief.documentType?.audience !== 'teacher' && prompts[0] === comparable(existing.prompt))) {
    throw new ProviderError('The model repeated a question. Try a new draft with distinct tasks.');
  }
  const warnings = [...output.warnings];
  if (questions.some(question => question.citations.length === 0)) {
    warnings.push(settings.brief.language === 'de'
      ? 'Einige Aufgaben haben keinen Quellenbeleg. Prüfe diese vor der Weitergabe.'
      : 'Some questions have no cited excerpt. Review them before sharing.');
  }
  const oldQuestions = previous?.sections.flatMap(section => section.questions) ?? [];
  const oldSections = previous?.sections ?? [];
  const usedIds = new Set<string>();
  return assessmentSchema.parse({
    ...output,
    warnings,
    evidence: [...format, ...evidence],
    sections: output.sections.map(section => {
      const previousSection = oldSections.find(item => item.title === section.title && !usedIds.has(item.id));
      const sectionId = previousSection?.id ?? randomUUID();
      usedIds.add(sectionId);
      return { ...section, id: sectionId, questions: section.questions.map(question => {
        const old = !existing && oldQuestions.find(item => item.prompt === question.prompt && !usedIds.has(item.id));
        const id = old ? old.id : randomUUID();
        usedIds.add(id);
        return {
          ...question, id,
          citations: [...new Set(question.citations)].map(index => {
            const item = evidence[index - 1];
            if (!item) throw new ProviderError('The model cited material outside the supplied excerpts. Retry generation.');
            return item.id;
          }),
        };
      }) };
    }),
  });
}
