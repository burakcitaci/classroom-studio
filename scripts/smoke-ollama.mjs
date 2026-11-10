import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiClient, until } from '../tests/fixtures.mjs';

const folder = await mkdtemp(join(tmpdir(), 'studio-ollama-'));
const port = Number(process.env['STUDIO_SMOKE_PORT'] || 4373);
const client = apiClient('http://127.0.0.1:' + port);
const server = spawn(process.execPath, ['dist/api/apps/api/src/main.js'], {
  env: { ...process.env, STUDIO_PROVIDER: 'ollama', STUDIO_PORT: String(port), STUDIO_DATA: folder },
  stdio: 'inherit',
});
try {
  const status = await until(async () => {
    if (server.exitCode !== null) throw new Error('The local API stopped before the smoke test.');
    return client.json('/status').catch(() => null);
  });
  assert.equal(status.provider, 'ollama');
  let doc = await client.create();
  const uploaded = await client.upload(doc.id, 'Teaching notes.txt', await readFile('fixtures/teaching-notes.txt'));
  doc = await client.sourcesReady(doc.id, [uploaded], 100_000);
  assert.equal(doc.sources[0].status, 'ready', doc.sources[0].error);
  const settings = { ...doc.settings, rag: 'Basic', topK: 3, sources: [{ id: uploaded.id, role: 'content' }],
    brief: { ...doc.settings.brief, language: 'de', subject: 'Biologie', topics: 'Ökosysteme und Nahrungsketten',
      grade: 'Klasse 7', totalPoints: 6, mix: '2 kurze Fragen mit je 3 Punkten',
      brief: 'Erstelle einen kurzen Test mit genau zwei Fragen über Nahrungsketten. Nutze die Quelle zu Klee, Kaninchen und Füchsen.' } };
  const job = await client.terminal(doc.id, await client.attempt(doc, settings), 250_000);
  assert.equal(job.stage, 'succeeded', job.error);
  assert.ok(job.versionId);
  assert.ok(job.evidence.length > 0);
  assert.ok(job.usage?.input > 0 && job.usage?.output > 0);
  doc = await client.doc(doc.id);
  const questions = doc.draft.sections.flatMap(section => section.questions);
  assert.equal(questions.length, 2);
  assert.equal(questions.reduce((sum, question) => sum + question.points, 0), 6);
  assert.ok(questions.some(question => question.citations.length));
  console.log('Live smoke passed with ' + status.model + ', ' + job.evidence.length + ' excerpts, 2 questions, and ' +
    job.usage.input + ' input / ' + job.usage.output + ' output tokens.');
} finally {
  if (server.exitCode === null) {
    const exit = once(server, 'exit');
    server.kill();
    await exit;
  }
  await rm(folder, { recursive: true, force: true });
}
