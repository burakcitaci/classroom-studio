import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudioStore } from '../dist/api/apps/api/src/persistence/studio-store.js';
import { initialSettings } from '../dist/api/libs/contracts/src/index.js';
import { postgresFixture } from './postgres-fixture.mjs';

test('PostgreSQL preserves saved work across reconnects, serializes concurrent saves and rolls back failed transactions', async () => {
  const database = await postgresFixture();
  const temp = await realpath(tmpdir());
  const folder = await realpath(await mkdtemp(join(temp, 'studio-pg-persistence-')));
  assert.equal(dirname(folder), temp);
  let store;
  try {
    store = await StudioStore.connect(folder, database.env.DATABASE_URL, database.env.STUDIO_DATABASE_SCHEMA);
    const settings = initialSettings();
    const classroom = randomUUID();
    const lesson = randomUUID();
    const source = randomUUID();
    const job = randomUUID();
    const timestamp = '2026-11-10T10:00:00.000Z';
    const draft = { title: 'Saved geography exam', instructions: '', warnings: [], teacherNotes: '', evidence: [],
      sections: [{ id: randomUUID(), title: 'Directions', instructions: '', questions: [
        { id: randomUUID(), prompt: 'Name a cardinal direction.', points: 5, lines: 2,
          answer: 'North.', rubric: 'Correct direction.', citations: [] },
      ] }] };
    await store.run('INSERT INTO classrooms (id, title, subject, grade, language, updated) VALUES ($1, $2, $3, $4, $5, $6)',
      classroom, 'Geography 5A', 'Geography', 'Grade 5', 'en', timestamp);
    await store.run('INSERT INTO lessons (id, class_id, title) VALUES ($1, $2, $3)', lesson, classroom, 'Maps');
    const created = await store.create(settings, { classId: classroom, lessonId: lesson });
    const document = created.id;
    const savedDraft = await store.save(document, { edit: created.edit, settings, draft });
    await store.run('INSERT INTO sources (id, doc_id, name, type, status, preview) VALUES ($1, $2, $3, $4, $5, $6)',
      source, document, 'Teaching facts', 'note', 'ready', 'Maps represent distances.');
    await store.run('INSERT INTO chunks (id, source_id, ordinal, text) VALUES ($1, $2, $3, $4)',
      randomUUID(), source, 0, 'Maps represent distances.');
    const revision = await store.addSnapshot(document, 'Teacher', draft, settings, job);
    await store.run('INSERT INTO jobs (id, doc_id, request_key, input, base_edit, created, stage, audit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      job, document, randomUUID(), JSON.stringify({ settings }), savedDraft.edit, timestamp, 'succeeded',
      JSON.stringify({ id: job, stage: 'succeeded' }));
    const beforeRestart = await store.document(document);
    await store.close();
    store = undefined;
    store = await StudioStore.connect(folder, database.env.DATABASE_URL, database.env.STUDIO_DATABASE_SCHEMA);
    const persisted = await store.document(document);
    assert.deepEqual(persisted, beforeRestart);
    assert.equal(persisted.context.classId, classroom);
    assert.equal(persisted.context.lessonId, lesson);
    assert.deepEqual(persisted.draft, draft);
    assert.equal(persisted.sources[0].id, source);
    assert.equal((await store.snapshot(document, revision.id)).jobId, job);
    assert.equal((await store.chunks(source))[0].text, 'Maps represent distances.');
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.jobRows(document)).length, 1);
    assert.deepEqual(await store.all('SELECT name FROM migrations ORDER BY name'), [{ name: '001-initial.sql' }, { name: '002-document-types.sql' }]);
    const saved = await Promise.allSettled([1, 2].map(number => store.save(document, {
      edit: persisted.edit, settings: { ...settings, brief: { ...settings.brief, brief: 'Edit ' + number } }, draft,
    })));
    assert.equal(saved.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = saved.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.getStatus(), 409);
    const current = await store.document(document);
    await Promise.all([store.commit(document, current.edit, 'Teacher', false), store.commit(document, current.edit, 'Teacher', false)]);
    assert.deepEqual((await store.snapshots(document)).map(snapshot => snapshot.number), [3, 2, 1]);
    await assert.rejects(store.transaction(async () => {
      await store.run('UPDATE documents SET ready = 1 WHERE id = $1', document);
      throw new Error('Rollback fixture');
    }), /Rollback fixture/);
    assert.equal((await store.document(document)).ready, false);
  } finally {
    await store?.close();
    await database.close();
    await rm(folder, { recursive: true, force: true });
  }
});
