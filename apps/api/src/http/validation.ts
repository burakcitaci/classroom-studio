import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const editSchema = z.number().int().nonnegative();

export function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const key = issue.path.join('.');
    throw new BadRequestException(key ? 'Check ' + key + '. ' + issue.message : issue.message);
  }
  return result.data;
}
