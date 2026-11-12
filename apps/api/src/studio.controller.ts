import { Controller, Get, Header, Inject, Param, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { StudioConfig } from './config/studio-config.js';
import type { Generator } from './generation/assessment/assessment-schema.js';
import { ProviderError } from './providers/provider-request.js';
import { check } from './http/validation.js';
import { GENERATOR } from './providers/providers.module.js';

const sampleSchema = z.enum(['notes', 'exam']);

@Controller()
export class StudioController {
  constructor(private readonly config: StudioConfig, @Inject(GENERATOR) private readonly generator: Generator) {}

  @Get('status')
  status() { return { provider: this.config.provider, model: this.generator.model }; }

  @Get('models')
  @Header('Cache-Control', 'no-store')
  async models() {
    try {
      return await this.generator.listModels?.() ?? [];
    } catch (error) {
      if (error instanceof ProviderError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  @Get('sample/:kind')
  sample(@Param('kind') value: string) {
    const kind = check(sampleSchema, value);
    const file = kind === 'notes' ? 'fixtures/teaching-notes.txt' : 'fixtures/sample-exam.txt';
    return new StreamableFile(Buffer.from(JSON.stringify(readFileSync(file, 'utf8'))),
      { type: 'application/json; charset=utf-8' });
  }
}
