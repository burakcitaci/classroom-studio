import { z } from 'zod';
import { documentTypeSnapshotSchema, type DocumentTypeSnapshot } from './document-types.js';
export * from './document-types.js';
import type { DocumentContext } from './classrooms.js';

export * from './classrooms.js';

export const kinds = ['Exam', 'Quiz', 'Worksheet', 'Practice Test', 'Custom'] as const;
export const modes = ['Off', 'Basic', 'Advanced', 'Graph'] as const;
export const sourceLimit = 8;
export const roles = ['format', 'content', 'both'] as const;
export const roleLabels = { format: 'Match this format', content: 'Use this content', both: 'Both' } as const;
export type RagMode = typeof modes[number];
export type SourceRole = typeof roles[number];
export const uuid = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default('');

export const briefSchema = z.strictObject({
  kind: z.enum(kinds),
  documentType: documentTypeSnapshotSchema.optional(),
  brief: z.string().trim().max(3500),
  subject: optionalText(120),
  grade: optionalText(80),
  topics: optionalText(350),
  language: z.enum(['en', 'de']).default('en'),
  duration: z.number().int().min(1).max(480).nullable().default(null),
  difficulty: z.enum(['Mixed', 'Introductory', 'Standard', 'Challenging']).default('Mixed'),
  mix: optionalText(350),
  totalPoints: z.number().int().min(1).max(500).nullable().default(null),
});
export type Brief = z.infer<typeof briefSchema>;

export const selectionSchema = z.strictObject({ id: uuid, role: z.enum(roles) });
export const settingsSchema = z.strictObject({
  brief: briefSchema,
  sources: z.array(selectionSchema).max(sourceLimit).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
  rag: z.enum(modes),
  generationModel: text(240).optional(),
  automatic: z.boolean().default(true),
  topK: z.number().int().min(1).max(8).default(4),
  hops: z.number().int().min(1).max(2).default(1),
});
export type Settings = z.infer<typeof settingsSchema>;
export const generationSchema = settingsSchema.extend({ questionId: uuid.optional() })
  .refine(value => value.brief.brief.length > 0, { message: 'Write a short brief first.' });
export type Generation = z.infer<typeof generationSchema>;

export const evidenceSchema = z.strictObject({
  id: uuid,
  sourceId: uuid,
  name: text(240),
  ordinal: z.number().int().nonnegative(),
  text: text(1600),
  sourceQuote: text(500).optional(),
  score: z.number().optional(),
  path: z.array(text(400)).max(7).optional(),
  use: z.enum(['content', 'notes', 'format']),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const questionBodySchema = z.strictObject({
  prompt: text(2200),
  points: z.number().int().min(0).max(500),
  lines: z.number().int().min(0).max(12),
  answer: z.string().max(3500),
  rubric: z.string().max(3500),
  citations: z.array(uuid).max(12).refine(ids => new Set(ids).size === ids.length),
});
export const questionSchema = questionBodySchema.extend({ id: uuid });
export type Question = z.infer<typeof questionSchema>;
export const assessmentSchema = z.strictObject({
  title: text(180),
  instructions: z.string().max(2500),
  sections: z.array(z.strictObject({
    id: uuid,
    title: text(140),
    instructions: z.string().max(1500),
    questions: z.array(questionSchema).max(30),
  })).min(1).max(8),
  teacherNotes: z.string().max(3500),
  evidence: z.array(evidenceSchema).max(40),
  warnings: z.array(text(500)).max(24),
}).superRefine((assessment, ctx) => {
  const questions = assessment.sections.flatMap(section => section.questions);
  const ids = [...assessment.sections, ...questions].map(item => item.id);
  const evidence = new Map(assessment.evidence.map(item => [item.id, item.use]));
  if (questions.length > 40 || new Set(ids).size !== ids.length || evidence.size !== assessment.evidence.length) {
    ctx.addIssue({ code: 'custom', message: 'Use unique IDs and at most 40 questions.' });
  }
  if (questions.some(question => question.citations.some(id => !evidence.has(id) || evidence.get(id) === 'format'))) {
    ctx.addIssue({ code: 'custom', message: 'Question citations must link to supplied content or notes.' });
  }
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const updateSchema = z.strictObject({
  edit: z.number().int().nonnegative(),
  settings: settingsSchema,
  draft: assessmentSchema.nullable(),
});
export type Working = z.infer<typeof updateSchema>;
export type SourceStatus = 'extracting' | 'indexing' | 'ready' | 'error';
export interface Source {
  id: string;
  name: string;
  type: 'file' | 'note';
  status: SourceStatus;
  preview: string;
  chunks: number;
  error?: string;
  retryable: boolean;
  archived?: boolean;
  materialId?: string;
}
export interface ClassMaterial {
  id: string;
  name: string;
  type: Source['type'];
}

export interface DocumentPage {
  items: DocumentSummary[];
  hasMore: boolean;
}

export interface DocumentSummary {
  id: string;
  title: string;
  kind: Brief['kind'];
  documentType?: DocumentTypeSnapshot;
  subject: string;
  grade: string;
  language: Brief['language'];
  status: 'Ready' | 'Draft' | 'Planning';
  updated: string;
  context: DocumentContext | null;
}
export interface StudioDocument extends Working {
  id: string;
  context: DocumentContext | null;
  updated: string;
  ready: boolean;
  sources: Source[];
  restoreCheckpoint?: string;
}
export interface Revision {
  id: string;
  number: number;
  name?: string;
  nameEdit?: number;
  kind: 'AI' | 'Teacher' | 'Ready' | 'Restored';
  created: string;
  draft: Assessment;
  settings: Settings;
  jobId?: string;
}

export function normalizeSectionHeading(title: string): string {
  const first = /^\s*AFB\s*(III|II|I)\b/i.exec(title);
  if (!first) return title;
  const heading = title.replace(/^(?:\s*AFB\s*(?:III|II|I)\b\s*[:–—-]?\s*)+/i, '');
  return 'AFB ' + first[1].toUpperCase() + ': ' + heading;
}
export type JobStage = 'queued' | 'retrieving' | 'generating' | 'validating' | 'succeeded' | 'failed';
export interface Job {
  id: string;
  stage: JobStage;
  created: string;
  duration?: number;
  model: string;
  promptVersion: string;
  parameters: { temperature: number; seed: number; numPredict: number };
  settings: Generation;
  sources: Pick<Source, 'id' | 'name' | 'type'>[];
  evidence: Evidence[];
  warnings: string[];
  error?: string;
  usage?: { input?: number; output?: number };
  versionId?: string;
  preview?: Question;
}
export interface JobSummary extends Pick<Job, 'id' | 'stage' | 'created' | 'model' | 'error' | 'versionId'> {
  settings: Pick<Generation, 'questionId' | 'rag'>;
  hasPreview: boolean;
}

export function summarizeJob(job: Job): JobSummary {
  return { id: job.id, stage: job.stage, created: job.created, model: job.model, error: job.error,
    versionId: job.versionId, settings: { questionId: job.settings.questionId, rag: job.settings.rag }, hasPreview: Boolean(job.preview) };
}

export interface DocumentActivity {
  edit: number;
  sources: Pick<Source, 'id' | 'status' | 'error' | 'retryable' | 'archived'>[];
  jobs: JobSummary[];
}

export const isActive = (job: Pick<Job, 'stage'>) => job.stage !== 'succeeded' && job.stage !== 'failed';
export const totalPoints = (draft: Assessment) =>
  draft.sections.flatMap(section => section.questions).reduce((sum, question) => sum + question.points, 0);

export type ReadinessIssue =
  | { code: 'noQuestions' }
  | { code: 'pointsMismatch'; actual: number; expected: number }
  | { code: 'missingAnswer' | 'missingScoring'; questionId: string; question: number };

export function readinessIssues(draft: Assessment, brief: Brief): ReadinessIssue[] {
  const questions = draft.sections.flatMap(section => section.questions);
  if (!questions.length) return [{ code: 'noQuestions' }];
  const issues: ReadinessIssue[] = [];
  const actual = totalPoints(draft);
  if (brief.totalPoints != null && actual !== brief.totalPoints) {
    issues.push({ code: 'pointsMismatch', actual, expected: brief.totalPoints });
  }
  questions.forEach((question, index) => {
    if (brief.documentType?.audience === 'teacher' || question.points > 0) {
      const location = { questionId: question.id, question: index + 1 };
      if (!question.answer.trim()) issues.push({ code: 'missingAnswer', ...location });
      if (question.points > 0 && !question.rubric.trim()) issues.push({ code: 'missingScoring', ...location });
    }
  });
  return issues;
}

export function initialSettings(kind: Brief['kind'] = 'Exam'): Settings {
  return {
    brief: { kind, brief: '', subject: '', grade: '', topics: '', language: 'en', duration: null,
      difficulty: 'Mixed', mix: '', totalPoints: null },
    sources: [], rag: 'Off', automatic: true, topK: 4, hops: 1,
  };
}
