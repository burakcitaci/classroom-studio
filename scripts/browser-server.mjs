import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { postgresFixture } from '../tests/postgres-fixture.mjs';

const database = await postgresFixture(process.env['STUDIO_BROWSER_SCHEMA']);

const directory = mkdtempSync(join(tmpdir(), 'studio-browser-'));
const api = spawn(process.execPath, ['dist/api/apps/api/src/main.js'], {
  env: { ...process.env, ...database.env, NODE_ENV: 'test', STUDIO_PROVIDER: 'demo', STUDIO_DATA: directory, STUDIO_PORT: '4372', STUDIO_TEST_DELAY: '2600' },
  stdio: 'inherit',
});
process.on('SIGTERM', () => api.kill());
process.on('SIGINT', () => api.kill());
api.on('exit', async code => {
  if (code) console.error('Browser test API exited:', code, 'on', process.version);
  await database.close();
  rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  process.exitCode = code ?? 0;
});
