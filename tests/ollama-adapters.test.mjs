import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assessmentMarkPlan, plannedOutput } from '../dist/api/apps/api/src/generation/assessment/mark-plan.js';
import { examQuestionCheck } from '../dist/api/apps/api/src/generation/assessment/exam-reference.js';
import { validateAssessment } from '../dist/api/apps/api/src/generation/assessment/assessment-schema.js';
import { OllamaGenerator } from '../dist/api/apps/api/src/providers/ollama-generator.js';
import { QdrantIndex } from '../dist/api/apps/api/src/providers/qdrant-index.js';
import { initialSettings } from '../dist/api/libs/contracts/src/index.js';

test('Ollama sends structured output and validates citation scope, totals and fresh questions', async t => {
  const settings = initialSettings();
  settings.brief.brief = 'Write an exam about pollination.';
  settings.brief.totalPoints = 5;
  const evidence = [{ id: randomUUID(), sourceId: randomUUID(), ordinal: 0,
    name: 'Teaching notes', text: 'Bees transfer pollen between flowers.', use: 'content' }];
  const format = [{ ...evidence[0], id: randomUUID(), text: 'Section A\nQuestion 1: FORMAT_SAMPLE_SENTINEL (5 points)\na) A sample subpart.', use: 'format' }];
  const context = { settings, evidence, format };
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
    assert.doesNotMatch(body.messages[1].content, /FORMAT_SAMPLE_SENTINEL|A sample subpart/);
    assert.deepEqual(JSON.parse(body.messages[1].content).formatHints, [
      'Group related questions under section headings.',
      'Use clear task numbers.',
      'Use lettered subparts where appropriate.',
      'Assign marks to individual tasks and subparts.',
    ]);
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

test('retries a Qwen repetition abort once with the same model and adjusted sampling', async t => {
  const settings = { ...initialSettings(), generationModel: 'qwen3:8b' };
  const context = { settings, evidence: [], format: [] };
  const repeat = () => Response.json({ error: 'prediction aborted, token repeat limit reached' }, { status: 500 });
  const requests = [];
  let replies = [repeat(), Response.json({ message: { content: '{}' }, prompt_eval_count: 12, eval_count: 8 })];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.pathname === '/api/show') return Response.json({ capabilities: ['completion'] });
    assert.equal(url.pathname, '/api/chat');
    requests.push(JSON.parse(options.body));
    return replies.shift();
  });
  const generator = new OllamaGenerator('http://localhost:11434', 'configured-default:8b');
  const result = await generator.generate(context);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].model, 'qwen3:8b');
  assert.deepEqual(requests[1].messages, requests[0].messages);
  assert.deepEqual(requests[1].format, requests[0].format);
  assert.equal(requests[1].options.seed, requests[0].options.seed + 1);
  assert.ok(requests[1].options.temperature > requests[0].options.temperature);
  assert.ok(requests[1].options.repeat_penalty > 1);
  assert.match(result.warnings.join(' '), /recovered.*repeated tokens/);

  requests.length = 0;
  replies = [repeat(), repeat()];
  await assert.rejects(generator.generate(context), /qwen3:8b kept repeating tokens, including after a retry/);
  assert.equal(requests.length, 2);

  requests.length = 0;
  replies = [Response.json({ error: 'Unrelated provider error detail' }, { status: 500 })];
  await assert.rejects(generator.generate(context), /rejected the request \(HTTP 500\)/);
  assert.equal(requests.length, 1);
});

test('retries a draft with missing answers and scoring guidance before returning it', async t => {
  const settings = initialSettings();
  const context = { settings, evidence: [], format: [] };
  const question = { prompt: 'Name a cardinal direction.', answer: '', rubric: ' ', points: 5, lines: 1, citations: [] };
  const output = { title: 'Geography', instructions: '', teacherNotes: '', warnings: [],
    sections: [{ title: 'Directions', instructions: '', questions: [question] }] };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    if (calls === 2) {
      const payload = JSON.parse(options.body);
      assert.match(JSON.parse(payload.messages[1].content).feedback, /complete scoring guidance for question\(s\) 1/);
      question.answer = 'North.';
      question.rubric = 'Award five points for a valid direction.';
    }
    return Response.json({ message: { content: JSON.stringify(output) } });
  });
  const generator = new OllamaGenerator('http://localhost:11434', 'qwen3:8b');
  const response = await generator.generate(context);
  assert.equal(calls, 2);
  assert.equal(validateAssessment(response.output, context).sections[0].questions[0].answer, 'North.');
});

test('uses a fixed point budget for explicit AFB percentages', () => {
  const brief = { ...initialSettings().brief, totalPoints: 30,
    brief: 'AFB I (Reproduktion): ca. 40%\nAFB II (Anwendung): ca. 40%\nAFB III (Transfer): ca. 20%' };
  const plan = assessmentMarkPlan(brief);
  assert.deepEqual(plan.map(group => group.tasks.map(task => task.marks)), [[6, 6], [6, 6], [6]]);
  const { project } = plannedOutput(plan);
  const item = { prompt: 'Describe a concrete example.', answer: 'A sample answer.', rubric: 'Six points.', lines: 2, citations: [] };
  const sections = Object.fromEntries(plan.map(group => [group.key, { title: group.area, instructions: '',
    questions: Object.fromEntries(group.tasks.map(task => [task.key, item])) }]));
  const projected = project({ title: 'Geography', instructions: '', warnings: [], teacherNotes: '', sections });
  assert.deepEqual(projected.sections.map(section => section.questions.reduce((sum, question) => sum + question.points, 0)), [12, 12, 6]);
  assert.equal(assessmentMarkPlan({ ...brief, mix: 'Exactly 10 short questions.' }), undefined);
});

test('drafting receives verified facts without the exam wording or source quotes', async t => {
  const settings = initialSettings();
  const sourceId = randomUUID();
  const passages = [{ sourceId, name: 'Geography exam', ordinal: 3,
    text: 'Aufgabe 4: SAMPLE_TASK_SENTINEL. Lösung: Ein Zentimeter entspricht in diesem Beispiel zehn Kilometern.' }];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/api/chat');
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.messages[1].content);
    calls++;
    if (calls === 1) {
      assert.match(input.passages[0].text, /SAMPLE_TASK_SENTINEL/);
      return Response.json({ message: { content: JSON.stringify({ facts: [
        { passage: 1, text: 'A 1:1,000,000 scale maps one centimeter to ten kilometers.',
          quote: 'Ein Zentimeter entspricht in diesem Beispiel zehn Kilometern.' },
        { passage: 1, text: 'This invented fact has no supporting quote.', quote: 'Completely invented sentence.' },
      ] }) } });
    }
    assert.equal(input.evidence.length, 1);
    assert.match(input.evidence[0].excerpt, /ten kilometers/);
    assert.doesNotMatch(body.messages[1].content, /SAMPLE_TASK_SENTINEL|Ein Zentimeter/);
    return Response.json({ message: { content: '{}' } });
  });
  const model = new OllamaGenerator('http://localhost:11434', 'test-model');
  const { evidence } = await model.extractFacts(settings, passages);
  assert.equal(evidence[0].sourceId, sourceId);
  assert.match(evidence[0].sourceQuote, /Ein Zentimeter/);
  await model.generate({ settings, evidence, format: [] });
  assert.equal(calls, 2);
});

test('recognizes copied subparts and close variants from any page without banning topic vocabulary', () => {
  const check = examQuestionCheck([
    'Teil A: Orientierung auf der Erde\nAufgabe 1: Unser Globus\nNenne den Nordpol und den Südpol.',
    'Aufgabe 5: Arbeiten mit der Karte\na) Welcher Kontinent ist der flächenmäßig größte der Erde?\nb) Nenne die drei großen Ozeane (Weltmeere) unserer Erde.',
    'Aufgabe 6: Eine Strecke auf der Karte ist sechs Zentimeter lang. Berechne die tatsächliche Entfernung zwischen den Städten.',
  ]);
  assert.ok(check('Kontinente und Ozeane:\na) Welcher Kontinent ist der flächenmäßig größte der Erde?\nb) Nenne die drei großen Ozeane unserer Erde.'));
  assert.ok(check('Beschreibe zuerst den Maßstab. Berechne dann die tatsächliche Entfernung zwischen den Städten.'));
  assert.ok(!check('Plane eine Schiffsroute von Europa nach Australien. Über welche Ozeane könnte dein Schiff fahren?'));
  assert.ok(!check('Dein Schulweg ist auf der Karte vier Zentimeter lang. Welcher Kartenmaßstab passt zu einer Strecke von zwei Kilometern?'));
});

test('blocks reused map-scale inputs and shortened recall prompts', () => {
  const check = examQuestionCheck([
    'Aufgabe 2: Kontinente und Ozeane\nb) Nenne die drei großen Ozeane (Weltmeere) unserer Erde.\n' +
    'Aufgabe 4: Auf einer Karte mit dem Maßstab 1 : 1.000.000 misst du eine Entfernung von 6 Zentimetern.',
  ]);
  assert.ok(check('Nenne die drei Ozeane:'));
  assert.ok(check('Welche Strecke entspricht 6 cm auf einer Karte mit dem Maßstab 1:1000000?'));
  assert.ok(check('Auf der Karte beträgt die Entfernung 6 cm. Nutze den Atlas auf S. ___ und berechne die wirkliche Strecke.'));
  assert.ok(!check('Welche Strecke entspricht 4 cm auf einer Karte mit dem Maßstab 1:50000?'));
});

test('requires the atlas page placeholder when the brief specifies it', () => {
  const settings = initialSettings();
  settings.brief.brief = 'Nutze den Atlas auf S. ___.';
  const question = { prompt: 'Finde die Stadt im Atlas.', answer: 'Die Stadt liegt am Fluss.',
    rubric: 'Punkte für die richtige Lage.', points: 5, lines: 2, citations: [] };
  const output = { title: 'Geographie', instructions: '', teacherNotes: '', warnings: [],
    sections: [{ title: 'Atlasarbeit', instructions: '', questions: [question] }] };
  const context = { settings, evidence: [], format: [] };
  assert.throws(() => validateAssessment(output, context), /page placeholder/);
  question.prompt = 'Nutze den Atlas auf S. ___. Finde die Stadt am Fluss.';
  assert.equal(validateAssessment(output, context).sections.length, 1);
});

test('lists local completion models and sends the selected model to Ollama', async t => {
  const settings = { ...initialSettings(), generationModel: 'chosen:8b' };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push([url.pathname, body?.model]);
    if (url.pathname === '/api/tags') return Response.json({ models: [
      { name: 'chosen:8b' }, { name: 'embedding:latest' }, { name: 'cloud:latest' },
    ] });
    if (url.pathname === '/api/show') {
      if (body.model === 'embedding:latest') return Response.json({ capabilities: ['embedding'] });
      if (body.model === 'cloud:latest') return Response.json({ capabilities: ['completion'], remote_host: 'https://example.org' });
      if (body.model === 'chosen:8b') return Response.json({ capabilities: ['completion'] });
      return new Response(null, { status: 404 });
    }
    return Response.json({ message: { content: '{}' } });
  });
  const model = new OllamaGenerator('http://localhost:11434', 'configured-default:8b');
  assert.deepEqual(await model.listModels(), ['chosen:8b']);
  await model.generate({ settings, evidence: [], format: [] });
  assert.deepEqual(requests.filter(([path]) => path === '/api/chat'), [['/api/chat', 'chosen:8b']]);
  await assert.rejects(model.generate({ settings: { ...settings, generationModel: 'removed:8b' }, evidence: [], format: [] }),
    /unavailable for local text generation/);
  assert.equal(requests.filter(([path]) => path === '/api/chat').length, 1);
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

test('teacher document types send reusable guidance and reference tasks without student copy restrictions', async t => {
  const settings = initialSettings();
  settings.brief.totalPoints = 5;
  settings.brief.documentType = { id: randomUUID(), edit: 0, title: 'Erwartungshorizont', audience: 'teacher', guidance: 'GUIDANCE_SENTINEL: exact solutions and points.' };
  const prompt = 'Explain how pollen moves between flowers.';
  const context = { settings, evidence: [], format: [], referenceText: [prompt] };
  const output = { title: 'Solutions', instructions: '', teacherNotes: '', warnings: [], sections: [{ title: 'Task 1', instructions: '', questions: [{ prompt, points: 5, lines: 3, answer: 'Bees carry pollen.', rubric: 'Award five points for the mechanism.', citations: [] }] }] };
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.equal(request.brief.documentType.guidance, settings.brief.documentType.guidance);
    assert.equal(request.referenceTasks, prompt);
    return Response.json({ message: { content: JSON.stringify(output) } });
  });
  const result = await new OllamaGenerator('http://localhost:11434', 'test-model').generate(context);
  assert.equal(validateAssessment(result.output, context).sections[0].questions[0].prompt, prompt);
  const student = { ...context, settings: { ...settings, brief: { ...settings.brief, documentType: { ...settings.brief.documentType, audience: 'student' } } } };
  assert.throws(() => validateAssessment(output, student), /copied/);
});
