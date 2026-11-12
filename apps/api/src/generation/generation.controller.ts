import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { generationSchema, uuid } from '../../../../libs/contracts/src/index.js';
import { check, editSchema } from '../http/validation.js';
import { GenerationService } from './generation.service.js';

const enqueueSchema = z.strictObject({ edit: editSchema, settings: generationSchema });

@Controller('documents/:id/jobs')
export class GenerationController {
  constructor(private readonly jobs: GenerationService) {}

  @Get()
  attempts(@Param('id') id: string) { return this.jobs.list(id); }

  @Post()
  @HttpCode(202)
  enqueue(@Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
    const { edit, settings } = check(enqueueSchema, body);
    return this.jobs.enqueue(id, check(uuid, key), edit, settings);
  }
}
