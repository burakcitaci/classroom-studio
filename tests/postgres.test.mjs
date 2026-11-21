import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile as runFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudioStore } from '../dist/api/apps/api/src/persistence/studio-store.js';
import { initialSettings } from '../dist/api/libs/contracts/src/index.js';
import { dropTestSchema, postgresFixture } from './postgres-fixture.mjs';

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
    await store.renameSnapshot(document, revision.id, 'Reviewed for 9B', 0);
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
    assert.equal((await store.snapshot(document, revision.id)).name, 'Reviewed for 9B');
    assert.equal((await store.chunks(source))[0].text, 'Maps represent distances.');
    assert.equal((await store.list()).length, 1);
    await store.run(`INSERT INTO documents (id, updated, settings)
      SELECT gen_random_uuid(), NOW(), $1::json FROM generate_series(1, 260)`, JSON.stringify(settings));
    assert.equal((await store.list()).some(item => item.id === document), false);
    const found = await store.searchDocuments({ query: 'saved geography', page: 1 });
    assert.deepEqual(found.items.map(item => item.id), [document]);
    assert.equal((await store.searchDocuments({ query: '', page: 1 })).hasMore, true);
    assert.equal((await store.searchDocuments({ query: '', page: 6 })).items.length, 11);
    assert.equal((await store.jobRows(document)).length, 1);
    assert.deepEqual(await store.all('SELECT name FROM migrations ORDER BY name'), [{ name: '001-initial.sql' }, { name: '002-document-types.sql' }, { name: '003-version-names.sql' }, { name: '004-source-archive.sql' }, { name: '005-class-materials.sql' }]);
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

test('portable backup preserves database records and original files in a new workspace', async () => {
  const database = await postgresFixture();
  const restoredSchema = 'studio_test_' + randomUUID().replaceAll('-', '');
  const temp = await realpath(tmpdir());
  const folder = await realpath(await mkdtemp(join(temp, 'studio-pg-backup-')));
  assert.equal(dirname(folder), temp);
  const data = join(folder, 'original');
  const restoredData = join(folder, 'restored');
  const backup = join(folder, 'backup');
  const env = { ...process.env, ...database.env, STUDIO_DATA: data };
  const backupCommand = (...args) => promisify(runFile)(process.execPath, ['scripts/studio-backup.mjs', ...args], { env });
  let store;
  try {
    store = await StudioStore.connect(data, database.env.DATABASE_URL, database.env.STUDIO_DATABASE_SCHEMA);
    const document = await store.create(initialSettings('Worksheet'));
    const sourceId = randomUUID();
    await store.run("INSERT INTO sources (id, doc_id, name, type, file_ext, status) VALUES ($1, $2, 'Map.txt', 'file', '.txt', 'ready')",
      sourceId, document.id);
    await writeFile(store.file(sourceId), 'A map legend explains symbols.');
    await store.close();
    store = undefined;
    await backupCommand('create', backup);
    assert.match((await backupCommand('inspect', backup)).stdout, /original uploads/);
    await backupCommand('restore', backup, restoredSchema, restoredData);
    await assert.rejects(backupCommand('restore', backup, restoredSchema, restoredData), /does not already exist/);
    store = await StudioStore.connect(restoredData, database.env.DATABASE_URL, restoredSchema);
    assert.equal((await store.document(document.id)).sources[0].id, sourceId);
    assert.equal(await readFile(store.file(sourceId), 'utf8'), 'A map legend explains symbols.');
  } finally {
    await store?.close();
    await dropTestSchema(restoredSchema);
    await database.close();
    await rm(folder, { recursive: true, force: true });
  }
});
