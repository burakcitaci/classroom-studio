import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { apiClient, pdf, readZip, until, word } from './fixtures.mjs';
import { postgresFixture } from './postgres-fixture.mjs';

const port = 4371;
const client = apiClient('http://127.0.0.1:' + port);
let folder;
let database;
let server;
let output = '';

async function start() {
  server = spawn(process.execPath, ['dist/api/apps/api/src/main.js'], {
    env: { ...process.env, ...database.env, STUDIO_PROVIDER: 'demo', STUDIO_PORT: String(port), STUDIO_DATA: folder, NODE_ENV: 'test', STUDIO_TEST_DELAY: '500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  await until(async () => {
    if (server.exitCode !== null) throw new Error(output);
    return client.json('/status').catch(() => null);
  });
}

async function stop() {
  if (!server || server.exitCode !== null || server.signalCode) return;
  const exited = once(server, 'exit');
  server.kill();
  await exited;
}

before(async () => { database = await postgresFixture(); folder = await mkdtemp(join(tmpdir(), 'classroom-api-')); await start(); });
after(async () => {
  await stop();
  await database?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

test('extracts real TXT, PDF and DOCX; reports missing text and denies invalid uploads and origins', async () => {
  assert.equal((await client.send('/documents/invalid-id')).status, 404);
  const doc = await client.create();
  const text = await client.upload(doc.id, 'Sample.txt', 'Carbon enters plants from the air.');
  const validPdf = await client.upload(doc.id, 'Notes.pdf', pdf('Carbon moves through living organisms.'));
  const validWord = await client.upload(doc.id, 'Sample.docx', await word('Vitamin C is an essential nutrient.'));
  const scan = await client.upload(doc.id, 'Scan.pdf', pdf());
  const ready = await client.sourcesReady(doc.id, [text, validPdf, validWord, scan], 20_000);
  assert.match(ready.sources.find(source => source.id === text.id).preview, /Carbon enters/);
  assert.match(ready.sources.find(source => source.id === validPdf.id).preview, /Carbon moves/);
  assert.match(ready.sources.find(source => source.id === validWord.id).preview, /Vitamin C/);
  assert.match(ready.sources.find(source => source.id === scan.id).error, /OCR/);
  const invalid = new FormData();
  invalid.set('file', new Blob(['x']), 'source.exe');
  assert.equal((await client.send('/documents/' + doc.id + '/files', { method: 'POST', body: invalid })).status, 400);
  const oversized = new FormData();
  oversized.set('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), 'large.txt');
  assert.equal((await client.send('/documents/' + doc.id + '/files', { method: 'POST', body: oversized })).status, 413);
  assert.equal((await client.send('/documents/' + doc.id + '/sources/' + scan.id, { method: 'DELETE' })).status, 200);
  assert.equal((await client.doc(doc.id)).sources.length, 3);
  const foreign = await client.send('/documents', { method: 'POST', body: { kind: 'Exam' }, headers: { origin: 'https://example.invalid' } });
  assert.equal(foreign.status, 403);
});

test('all modes are repeatable, respect source scope and save excerpts and graph paths', async () => {
  let doc = await client.create();
  const foreign = await client.create();
  const [exam, materials] = await Promise.all([readFile('fixtures/sample-exam.txt'), readFile('fixtures/teaching-notes.txt')]);
  const reference = await client.upload(doc.id, 'Teaching materials.txt', materials);
  const ignored = await client.upload(doc.id, 'Ignore this.txt', 'Ecosystems, food chains and SECRET_EXCLUDED.');
  const example = await client.upload(doc.id, 'Format sample.txt', exam);
  const note = await client.json('/documents/' + doc.id + '/notes', { method: 'POST', body: {
    name: 'Pasted notes', text: 'Food chains include producers and consumers. TEST_NOTE_ONLY.' } });
  const outside = await client.upload(foreign.id, 'Other document.txt', 'Ecosystems and SECRET_FOREIGN.');
  doc = await client.sourcesReady(doc.id, [reference, ignored, example, note]);
  assert.ok(doc.sources.every(source => source.status === 'ready'));
  const selections = [{ id: reference.id, role: 'both' }, { id: example.id, role: 'format' }, { id: note.id, role: 'content' }];
  const settings = { ...doc.settings, brief: { ...doc.settings.brief, brief: 'A Year 7 exam on ecosystems, food chains, decomposers and pollination.',
    subject: 'Biology', totalPoints: 24 }, sources: selections };
  const rejected = await client.send('/documents/' + doc.id + '/jobs', { method: 'POST', key: randomUUID(), body: {
    edit: doc.edit, settings: { ...settings, sources: [{ id: outside.id, role: 'content' }] } } });
  assert.equal(rejected.status, 400);
  for (const rag of ['Off', 'Basic', 'Advanced', 'Graph']) {
    const runs = [];
    for (let run = 0; run < 2; run++) {
      const key = randomUUID();
      const job = await client.attempt(doc, { ...settings, rag }, key);
      assert.equal((await client.attempt(doc, { ...settings, rag }, key)).id, job.id);
      const done = await client.terminal(doc.id, job);
      assert.equal(done.stage, 'succeeded', done.error);
      assert.ok(done.versionId);
      assert.equal(done.settings.rag, rag);
      assert.ok(done.evidence.some(source => source.use === 'format' && source.sourceId === reference.id));
      assert.ok(done.evidence.some(source => source.use === 'notes'));
      assert.ok(done.evidence.every(source => source.sourceId !== ignored.id && source.sourceId !== outside.id));
      assert.equal(done.evidence.some(source => source.use === 'content'), rag !== 'Off');
      if (rag === 'Graph') assert.ok(done.evidence.some(source => source.path?.length > 1));
      doc = await client.doc(doc.id);
      const questions = doc.draft.sections.flatMap(section => section.questions);
      assert.equal(questions.reduce((sum, question) => sum + question.points, 0), 24);
      assert.ok(questions.every(question => question.citations.every(id => done.evidence.some(source => source.id === id && source.use !== 'format'))));
      runs.push(done.evidence);
    }
    assert.deepEqual(runs[0], runs[1], rag);
  }
  const failed = await client.terminal(doc.id, await client.attempt(doc, { ...settings, rag: 'Basic', sources: [] }));
  assert.equal(failed.stage, 'failed');
  assert.match(failed.error, /No useful content excerpts/);
  assert.equal((await client.jobList(doc.id)).length, 9);
  assert.doesNotMatch(output, /TEST_NOTE_ONLY|SECRET_EXCLUDED|SECRET_FOREIGN/);
});

test('an exam marked as content supplies format hints instead of question evidence', async () => {
  let doc = await client.create();
  const exam = await client.upload(doc.id, 'Geographie_Klausur_Klasse_5.txt',
    'Klassenarbeit Geographie\nAufgabe 1: Welcher Kontinent ist der flächenmäßig größte der Erde?\n' +
    'Aufgabe 2: Berechne die Entfernung aus dem Kartenmaßstab.\nLösungsblatt\nAsien ist der größte Kontinent.');
  doc = await client.sourcesReady(doc.id, [exam]);
  const settings = { ...doc.settings, rag: 'Advanced', sources: [{ id: exam.id, role: 'content' }],
    brief: { ...doc.settings.brief, brief: 'Create a geography assessment. Gesamtpunktzahl: 30 Punkte. Zeitansatz: 45 Minuten.', subject: 'Geography' } };
  const done = await client.terminal(doc.id, await client.attempt(doc, settings));
  assert.equal(done.stage, 'succeeded', done.error);
  assert.ok(done.evidence.some(item => item.sourceId === exam.id && item.use === 'format'));
  assert.ok(done.evidence.every(item => item.sourceId !== exam.id || item.use === 'format'));
  assert.match(done.warnings.join(' '), /used for format only/);
  assert.equal(done.settings.brief.totalPoints, 30);
  assert.equal(done.settings.brief.duration, 45);
});

test('preserves concurrent edits, restores immutable revisions, previews replacements and isolates exports', async () => {
  let doc = await client.create();
  const settings = { ...doc.settings, brief: { ...doc.settings.brief, brief: 'Ökosysteme und Nahrungsketten',
    language: 'de', totalPoints: 20 } };
  const done = await client.terminal(doc.id, await client.attempt(doc, settings));
  assert.equal(done.stage, 'succeeded', done.error);
  doc = await client.doc(doc.id);
  assert.match(doc.draft.title, /Ökosysteme/);
  const old = doc.draft.sections[0].questions[0];
  const candidate = await client.terminal(doc.id, await client.attempt(doc, { ...settings, questionId: old.id }));
  assert.equal(candidate.stage, 'succeeded', candidate.error);
  assert.notEqual(candidate.preview.id, old.id);
  assert.equal(candidate.preview.points, old.points);
  assert.equal((await client.doc(doc.id)).draft.sections[0].questions[0].id, old.id);
  const active = await client.attempt(doc, settings);
  const edited = structuredClone(doc.draft);
  edited.teacherNotes = 'TEACHER_PRIVATE_MARKER';
  edited.sections[0].questions[0].answer = 'TEACHER_ANSWER_MARKER';
  edited.sections[0].questions[0].rubric = 'TEACHER_RUBRIC_MARKER';
  doc = await client.update(doc, { draft: edited });
  const race = await client.terminal(doc.id, active);
  assert.ok(race.versionId);
  assert.match(race.warnings.join(' '), /Teacher edits were kept/);
  assert.equal((await client.doc(doc.id)).draft.teacherNotes, 'TEACHER_PRIVATE_MARKER');
  const url = '/documents/' + doc.id;
  for (const format of ['docx', 'print']) {
    const exported = {};
    for (const copy of ['student', 'teacher']) {
      const response = await client.send(url + '/export?copy=' + copy + '&format=' + format);
      assert.equal(response.status, 200);
      exported[copy] = format === 'print' ? await response.text() : Object.values(await readZip(Buffer.from(await response.arrayBuffer()))).join('\n');
    }
    assert.match(exported.student, /Schülerfassung/);
    assert.doesNotMatch(exported.student, /TEACHER_(PRIVATE|ANSWER|RUBRIC)_MARKER|Lehrkraftfassung/);
    assert.match(exported.teacher, /TEACHER_PRIVATE_MARKER/);
    assert.match(exported.teacher, /TEACHER_ANSWER_MARKER/);
    assert.match(exported.teacher, /TEACHER_RUBRIC_MARKER/);
  }
  const ready = await client.json(url + '/versions', { method: 'POST', body: { edit: doc.edit, kind: 'Ready', acceptWarnings: true } });
  assert.equal(ready.kind, 'Ready');
  doc = await client.doc(doc.id);
  const restored = await client.json(url + '/versions/' + done.versionId + '/restore', { method: 'POST', body: { edit: doc.edit } });
  assert.equal(restored.ready, false);
  assert.notEqual(restored.draft.teacherNotes, 'TEACHER_PRIVATE_MARKER');
  const versions = await client.json(url + '/versions');
  assert.deepEqual(versions.map(version => version.kind), ['Restored', 'Ready', 'AI', 'AI']);
  assert.equal(versions[1].draft.teacherNotes, 'TEACHER_PRIVATE_MARKER');
});

test('persists the active job across API restart without replaying an interrupted model call', async () => {
  const doc = await client.create();
  const job = await client.attempt(doc, { ...doc.settings, brief: { ...doc.settings.brief, brief: 'A plants exam.' } });
  await until(async () => (await client.jobList(doc.id)).some(row => row.id === job.id && row.stage === 'generating'));
  await stop();
  await start();
  const recovered = await client.terminal(doc.id, job);
  assert.equal(recovered.stage, 'failed');
  assert.match(recovered.error, /interrupted/);
  assert.equal((await client.doc(doc.id)).draft, null);
});

test('classroom planning scopes lessons, prefills documents and preserves drafts when filing', async () => {
  const makeClass = (title, grade) => client.json('/classes', { method: 'POST', body: {
    title, subject: 'Biology', grade, description: 'Class plan.', schoolYear: '2026–27', language: 'de',
  } });
  const [year5, year8] = await Promise.all([makeClass('Biology 5A', 'Grade 5'), makeClass('Biology 8B', 'Grade 8')]);
  const path = '/classes/' + year5.id;
  const lesson = await client.json(path + '/lessons', { method: 'POST', body: {
    title: 'Plant cells', description: 'Compare the two diagrams.', goals: 'Identify the cell wall.', date: '2026-11-18',
  } });
  const oldDocument = await client.create();
  assert.equal(oldDocument.context, null);
  const invalid = await client.send('/documents', { method: 'POST', body: {
    kind: 'Quiz', context: { classId: year8.id, lessonId: lesson.id },
  } });
  assert.equal(invalid.status, 404);
  const created = await client.json('/documents', { method: 'POST', body: {
    kind: 'Quiz', context: { classId: year5.id, lessonId: lesson.id },
  } });
  assert.equal(created.context.lessonTitle, 'Plant cells');
  assert.equal(created.settings.brief.grade, 'Grade 5');
  assert.equal(created.settings.brief.subject, 'Biology');
  assert.equal(created.settings.brief.language, 'de');
  assert.match(created.settings.brief.brief, /Identify the cell wall/);
  const edit = await client.update(created, { settings: { ...created.settings,
    brief: { ...created.settings.brief, brief: 'Keep this custom brief.' } } });
  const file = '/documents/' + created.id + '/location';
  const stale = await client.send(file, { method: 'PATCH', body: {
    edit: created.edit, context: { classId: null, lessonId: null },
  } });
  assert.equal(stale.status, 409);
  const moved = await client.json(file, { method: 'PATCH', body: {
    edit: edit.edit, context: { classId: year8.id, lessonId: null },
  } });
  assert.equal(moved.context.classId, year8.id);
  assert.equal(moved.settings.brief.brief, 'Keep this custom brief.');
  assert.equal((await client.json(path)).documents.length, 0);
  assert.equal((await client.json('/classes/' + year8.id)).documents[0].id, moved.id);
  await client.json(path + '/status', { method: 'PATCH', body: { archived: true } });
  const archived = await client.send(path + '/lessons', { method: 'POST', body: { title: 'Next lesson' } });
  assert.equal(archived.status, 400);
  assert.equal((await client.json(path)).lessons[0].id, lesson.id);
  await client.json(path + '/status', { method: 'PATCH', body: { archived: false } });
  assert.equal((await client.json(path)).classroom.archived, false);
});

test('reusable document types persist and existing documents retain their guidance snapshot', async () => {
  const input = { title: 'Erwartungshorizont', guidance: 'Give exact solutions and points for each task.', audience: 'teacher' };
  const type = await client.json('/document-types', { method: 'POST', body: input });
  assert.equal((await client.send('/document-types', { method: 'POST', body: input })).status, 409);
  const { id, edit, title, guidance, audience } = type;
  let doc = await client.create();
  doc = await client.update(doc, { settings: { ...doc.settings, brief: { ...doc.settings.brief,
    kind: 'Custom', documentType: { id, edit, title, guidance, audience }, brief: 'Geography, grade 5.' } } });
  const updated = await client.json('/document-types/' + id, { method: 'PATCH', body: { ...input, guidance: 'Updated reusable guidance.', edit } });
  assert.equal(updated.edit, edit + 1);
  assert.equal((await client.send('/document-types/' + id, { method: 'PATCH', body: { ...input, edit } })).status, 409);
  assert.equal((await client.doc(doc.id)).settings.brief.documentType.guidance, guidance);
  await stop();
  await start();
  assert.equal((await client.json('/document-types')).find(row => row.id === id).guidance, updated.guidance);
  await client.json('/document-types/' + id, { method: 'PATCH', body: { ...input, edit: updated.edit, archived: true } });
  assert.equal((await client.json('/document-types')).some(row => row.id === id), false);
  assert.equal((await client.doc(doc.id)).settings.brief.documentType.title, title);
});
