import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'studio-browser-'));
const api = spawn(process.execPath, ['dist/api/apps/api/src/main.js'], {
  env: { ...process.env, NODE_ENV: 'test', STUDIO_PROVIDER: 'demo', STUDIO_DATA: directory, STUDIO_PORT: '4372', STUDIO_TEST_DELAY: '2600' },
  stdio: 'inherit',
});
process.on('SIGTERM', () => api.kill());
process.on('SIGINT', () => api.kill());
api.on('exit', code => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  process.exitCode = code ?? 0;
});
