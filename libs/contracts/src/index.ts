import { z } from 'zod';
import { documentTypeSnapshotSchema, type DocumentTypeSnapshot } from './document-types.js';
export * from './document-types.js';
import type { DocumentContext } from './classrooms.js';

export * from './classrooms.js';

export const kinds = ['Exam', 'Quiz', 'Worksheet', 'Practice Test', 'Custom'] as const;
export const modes = ['Off', 'Basic', 'Advanced', 'Graph'] as const;
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
  sources: z.array(selectionSchema).max(8).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
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
}
export interface Revision {
  id: string;
  number: number;
  kind: 'AI' | 'Teacher' | 'Ready' | 'Restored';
  created: string;
  draft: Assessment;
  settings: Settings;
  jobId?: string;
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
export const isActive = (job: Job) => job.stage !== 'succeeded' && job.stage !== 'failed';
export const totalPoints = (draft: Assessment) =>
  draft.sections.flatMap(section => section.questions).reduce((sum, question) => sum + question.points, 0);

export function initialSettings(kind: Brief['kind'] = 'Exam'): Settings {
  return {
    brief: { kind, brief: '', subject: '', grade: '', topics: '', language: 'en', duration: null,
      difficulty: 'Mixed', mix: '', totalPoints: null },
    sources: [], rag: 'Off', automatic: true, topK: 4, hops: 1,
  };
}
