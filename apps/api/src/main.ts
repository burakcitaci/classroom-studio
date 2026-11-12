import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { StudioConfig } from './config/studio-config.js';
import { localOnly } from './http/local-only.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, bodyParser: false });
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

void bootstrap().catch(() => {
  console.error('Classroom Studio could not start. Check PostgreSQL, DATABASE_URL, the port and local data directory.');
  process.exitCode = 1;
});
