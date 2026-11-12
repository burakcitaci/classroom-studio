import { z } from 'zod';

export const documentTypeInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  guidance: z.string().trim().min(1).max(2500),
  audience: z.enum(['student', 'teacher']).default('student'),
});
export const documentTypeSnapshotSchema = documentTypeInputSchema.extend({ id: z.uuid(), edit: z.number().int().nonnegative() });
export type DocumentTypeInput = z.infer<typeof documentTypeInputSchema>;
export type DocumentTypeSnapshot = z.infer<typeof documentTypeSnapshotSchema>;
export interface DocumentType extends DocumentTypeSnapshot { archived: boolean; updated: string }
export function documentKind(brief: { kind: string; documentType?: DocumentTypeSnapshot }): string {
  return brief.documentType?.title ?? brief.kind;
}
