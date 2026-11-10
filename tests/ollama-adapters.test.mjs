import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OllamaGenerator, validateAssessment } from '../dist/api/apps/api/src/assessment.js';
import { QdrantIndex } from '../dist/api/apps/api/src/ollama.js';
import { initialSettings } from '../dist/api/libs/contracts/src/index.js';

test('Ollama sends structured output and validates citation scope, totals and fresh questions', async t => {
  const settings = initialSettings();
  settings.brief.brief = 'Write an exam about pollination.';
  settings.brief.totalPoints = 5;
  const evidence = [{ id: randomUUID(), sourceId: randomUUID(), ordinal: 0,
    name: 'Teaching notes', text: 'Bees transfer pollen between flowers.', use: 'content' }];
  const context = { settings, evidence, format: [] };
  const question = { prompt: 'Explain how pollen moves between flowers.', points: 5, lines: 3,
    answer: 'Bees carry pollen on their bodies.', rubric: 'Give points for the mechanism.', citations: [1] };
  const output = { title: 'Pollination', instructions: 'Answer in sentences.', teacherNotes: '', warnings: [],
    sections: [{ title: 'Explain', instructions: '', questions: [question] }] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url.pathname, '/api/chat');
    assert.equal(body.format.type, 'object');
    assert.equal(body.stream, false);
    assert.match(body.messages[1].content, /Bees transfer pollen/);
    return Response.json({ message: { content: JSON.stringify(output) }, prompt_eval_count: 140, eval_count: 70 });
  });
  const model = new OllamaGenerator('http://localhost:11434', 'test-model');
  const response = await model.generate(context);
  assert.deepEqual(response.usage, { input: 140, output: 70 });
  assert.deepEqual(validateAssessment(response.output, context).sections[0].questions[0].citations, [evidence[0].id]);
  question.citations = [2];
  assert.throws(() => validateAssessment(output, context), /outside the supplied excerpts/);
  question.citations = [];
  question.points = 4;
  assert.throws(() => validateAssessment(output, context), /add up to 5/);
  question.points = 5;
  assert.throws(() => validateAssessment(output, { ...context, format: [{ ...evidence[0], text: question.prompt }] }), /copied/);
});

test('Qdrant rebuilds its projection from chunks and scopes query by both document and source', async t => {
  const docId = randomUUID();
  const sourceId = randomUUID();
  const id = randomUUID();
  let count = 0;
  let available = false;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path: url.pathname, method: options.method, body });
    if (url.pathname === '/api/embed') return Response.json({ embeddings: [[0.5, 0.25]] });
    if (url.pathname.endsWith('/points/count')) return available ? Response.json({ result: { count } }) : new Response(null, { status: 404 });
    if (url.pathname.endsWith('/points/query')) return Response.json({ result: { points: [{ id, score: 0.8 }] } });
    if (url.pathname.endsWith('/points')) { count = body.points.length; return Response.json({ result: true }); }
    if (options.method === 'GET') return new Response(null, { status: 404 });
    available = true;
    return Response.json({ result: true });
  });
  const index = new QdrantIndex({ ollamaUrl: 'http://localhost:11434', qdrantUrl: 'http://localhost:6333', embedding: 'nomic-embed-text' });
  const chunks = [{ id, source_id: sourceId, ordinal: 0, text: 'A trusted source excerpt.' }];
  await index.prepare(docId, sourceId, chunks);
  await index.prepare(docId, sourceId, chunks);
  assert.deepEqual(await index.search(docId, [sourceId], 'Trusted source', 4), [{ id, score: 0.8 }]);
  assert.equal(requests.filter(item => item.method === 'PUT' && item.path.endsWith('/points')).length, 1);
  const query = requests.find(item => item.path.endsWith('/points/query')).body;
  assert.deepEqual(query.filter.must, [{ key: 'docId', match: { value: docId } }, { key: 'sourceId', match: { any: [sourceId] } }]);
  assert.ok(requests.some(item => item.body?.input?.[0].startsWith('search_document: ')));
  assert.ok(requests.some(item => item.body?.input?.[0].startsWith('search_query: ')));
});
