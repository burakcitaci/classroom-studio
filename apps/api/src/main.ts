import 'reflect-metadata';
import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, HttpCode, Module, Param, Patch, Post, Query, Res,
  StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor, type NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { generationSchema, initialSettings, kinds, settingsSchema, updateSchema, uuid } from '../../../libs/contracts/src/index.js';
import { DemoGenerator, OllamaGenerator } from './assessment.js';
import { exportDocx, exportPrint } from './exports.js';
import { MAX_UPLOAD } from './extract.js';
import { JobService } from './jobs.js';
import { QdrantIndex } from './ollama.js';
import { DemoIndex } from './retrieval.js';
import { SourceService } from './sources.js';
import { Store } from './store.js';

const env = process.env;
const provider = env['STUDIO_PROVIDER'] ?? 'demo';
if (provider !== 'demo' && provider !== 'ollama') throw new Error('Set STUDIO_PROVIDER to demo or ollama.');
const config = {
  ollamaUrl: env['OLLAMA_URL'] || 'http://127.0.0.1:11434',
  embedding: env['OLLAMA_EMBED_MODEL'] || 'nomic-embed-text',
  qdrantUrl: env['QDRANT_URL'] || 'http://127.0.0.1:6335',
  qdrantKey: env['QDRANT_API_KEY'],
};
const store = new Store();
const index = provider === 'demo' ? new DemoIndex() : new QdrantIndex(config);
const generator = provider === 'demo' ? new DemoGenerator() : new OllamaGenerator(config.ollamaUrl, env['OLLAMA_MODEL'] || 'qwen3:8b');
const demoDelay = env['NODE_ENV'] === 'test' ? Math.min(5000, Number(env['STUDIO_TEST_DELAY'] ?? 0)) : 400;
const jobs = new JobService(store, index, generator, provider === 'demo' ? demoDelay : 0);
const sources = new SourceService(store, index);

function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const key = issue.path.join('.');
    throw new BadRequestException(key ? 'Check ' + key + '. ' + issue.message : issue.message);
  }
  return result.data;
}

const editSchema = z.number().int().nonnegative();
const commitSchema = z.strictObject({ edit: editSchema, kind: z.enum(['Teacher', 'Ready']), acceptWarnings: z.boolean().default(false) });
const noteSchema = z.strictObject({ name: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(9000) });
const enqueueSchema = z.strictObject({ edit: editSchema, settings: generationSchema });
const copySchema = z.enum(['student', 'teacher']);

@Controller('api')
class StudioController {
  @Get('status')
  status() { return { provider, model: generator.model }; }

  @Get('sample/:kind')
  sample(@Param('kind') value: string) {
    const kind = check(z.enum(['notes', 'exam']), value);
    return new StreamableFile(Buffer.from(JSON.stringify(readFileSync(kind === 'notes' ? 'fixtures/teaching-notes.txt' : 'fixtures/sample-exam.txt', 'utf8'))),
      { type: 'application/json; charset=utf-8' });
  }

  @Get('documents')
  list() { return store.list(); }

  @Post('documents')
  create(@Body() body: unknown) {
    const input = check(z.strictObject({ kind: z.enum(kinds), settings: settingsSchema.optional() }), body);
    if (input.settings?.sources.length) throw new BadRequestException('Upload sources after creating the document.');
    return store.create(input.settings ?? initialSettings(input.kind));
  }

  @Get('documents/:id')
  document(@Param('id') id: string) { return store.document(id); }

  @Patch('documents/:id')
  save(@Param('id') id: string, @Body() body: unknown) { return store.save(id, check(updateSchema, body)); }

  @Get('documents/:id/versions')
  versions(@Param('id') id: string) { return store.snapshots(id); }

  @Post('documents/:id/versions')
  commit(@Param('id') id: string, @Body() body: unknown) {
    const { edit, kind, acceptWarnings } = check(commitSchema, body);
    return store.commit(id, edit, kind, acceptWarnings);
  }

  @Post('documents/:id/versions/:version/restore')
  restore(@Param('id') id: string, @Param('version') version: string, @Body() body: unknown) {
    return store.restore(id, version, check(z.strictObject({ edit: editSchema }), body).edit);
  }

  @Post('documents/:id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 0, parts: 2 } }))
  file(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) { return sources.addFile(id, file); }

  @Post('documents/:id/notes')
  note(@Param('id') id: string, @Body() body: unknown) {
    const { name, text } = check(noteSchema, body);
    return sources.addNote(id, name, text);
  }

  @Post('documents/:id/sources/:source/retry')
  retry(@Param('id') id: string, @Param('source') source: string) { return sources.retry(id, source); }

  @Delete('documents/:id/sources/:source')
  remove(@Param('id') id: string, @Param('source') source: string) { return sources.remove(id, source); }

  @Get('documents/:id/jobs')
  attempts(@Param('id') id: string) { return jobs.list(id); }

  @Post('documents/:id/jobs')
  @HttpCode(202)
  enqueue(@Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
    const { edit, settings } = check(enqueueSchema, body);
    return jobs.enqueue(id, check(uuid, key), edit, settings);
  }

  @Get('documents/:id/export')
  @Header('Cache-Control', 'no-store')
  async export(@Param('id') id: string, @Query('copy') copyValue: string, @Query('format') formatValue: string,
    @Query('version') version: string | undefined, @Res({ passthrough: true }) response: Response) {
    const copy = check(copySchema, copyValue);
    const format = check(z.enum(['docx', 'print']), formatValue);
    const data = version ? store.snapshot(id, version) : store.document(id);
    if (!data.draft) throw new BadRequestException('Generate a draft before exporting.');
    if (format === 'print') {
      response.type('html');
      response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'");
      return exportPrint(data.draft, data.settings, copy);
    }
    return new StreamableFile(await exportDocx(data.draft, data.settings, copy), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: 'attachment; filename="classroom-studio-' + copy + '.docx"',
    });
  }
}

@Module({ controllers: [StudioController] })
class StudioModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(StudioModule, { logger: false, bodyParser: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const isLocal = (host: string) => /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
    const host = request.get('host') ?? '';
    const origin = request.get('origin');
    const badOrigin = origin && origin !== 'http://' + host && origin !== 'http://127.0.0.1:4200' && origin !== 'http://localhost:4200';
    if (!isLocal(host) || badOrigin || request.get('sec-fetch-site') === 'cross-site') {
      response.status(403).json({ message: 'Open Classroom Studio on localhost.' });
      return;
    }
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.path.startsWith('/api')) response.set('Cache-Control', 'no-store');
    next();
  });
  app.useBodyParser('json', { limit: '2mb' });
  const web = resolve('dist/web/browser');
  if (existsSync(web)) app.useStaticAssets(web);
  const port = Number(env['STUDIO_PORT'] || 4300);
  await app.listen(port, '127.0.0.1');
  jobs.recover();
  void sources.drain();
  console.log('Classroom Studio (' + provider + ') at http://127.0.0.1:' + port);
}

void bootstrap().catch(() => {
  console.error('Classroom Studio could not start. Check the port, runtime and local data directory.');
  process.exitCode = 1;
});
