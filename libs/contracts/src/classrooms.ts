import { z } from 'zod';
import type { DocumentSummary } from './index.js';

export const classroomSchema = z.strictObject({
  title: z.string().trim().min(1, 'Enter a class title.').max(120),
  subject: z.string().trim().min(1, 'Enter a subject.').max(120),
  grade: z.string().trim().min(1, 'Enter a grade or year group.').max(80),
  schoolYear: z.string().trim().max(32).default(''),
  description: z.string().trim().max(2000).default(''),
  language: z.enum(['en', 'de']).default('en'),
});
export type ClassroomInput = z.infer<typeof classroomSchema>;

export const lessonSchema = z.strictObject({
  title: z.string().trim().min(1, 'Enter a lesson title.').max(160),
  description: z.string().trim().max(1800).default(''),
  goals: z.string().trim().max(1300).default(''),
  date: z.iso.date().nullable().default(null),
});
export type LessonInput = z.infer<typeof lessonSchema>;

export const documentContextInputSchema = z.strictObject({
  classId: z.uuid().nullable(),
  lessonId: z.uuid().nullable(),
}).refine(value => !value.lessonId || value.classId, 'Choose a class for the lesson.');
export type DocumentContextInput = z.infer<typeof documentContextInputSchema>;

export interface DocumentContext {
  classId: string;
  classTitle: string;
  lessonId: string | null;
  lessonTitle: string | null;
}

export interface Classroom extends ClassroomInput {
  id: string;
  archived: boolean;
}

export interface ClassroomSummary extends Classroom {
  lessonCount: number;
  documentCount: number;
}

export interface Lesson extends LessonInput {
  id: string;
  classId: string;
  documentCount: number;
}

export interface ClassroomDetail {
  classroom: Classroom;
  lessons: Lesson[];
  documents: DocumentSummary[];
}
