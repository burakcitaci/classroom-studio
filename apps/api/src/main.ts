import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { StudioConfig } from './config/studio-config.js';
import { localOnly } from './http/local-only.middleware.js';
import { watchParentProcess } from './parent-process.js';

async function bootstrap() {
  watchParentProcess();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, bodyParser: false, abortOnError: false });
  const { port, provider } = app.get(StudioConfig);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(localOnly);
  app.useBodyParser('json', { limit: '2mb' });

  const web = resolve('dist/web/browser');
  if (existsSync(web)) app.useStaticAssets(web);
  await app.listen(port, '127.0.0.1');
  console.log('Classroom Studio (' + provider + ') at http://127.0.0.1:' + port);
}

void bootstrap().catch((error: unknown) => {
  const code = error instanceof Error && 'code' in error ? String(error.code) : undefined;
  const hint = code === 'EADDRINUSE'
    ? 'The API port is already in use. Stop the existing API process, then retry.'
    : 'Check PostgreSQL, DATABASE_URL, the port and local data directory.';
  console.error('Classroom Studio could not start' + (code ? ' (' + code + ')' : '') + '. ' + hint);
  // A failed listen can leave the database pool open, so exit after reporting the failure.
  process.exit(1);
});
