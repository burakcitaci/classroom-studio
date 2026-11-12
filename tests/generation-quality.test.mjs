import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialSettings, normalizeSectionHeading } from '../dist/api/libs/contracts/src/index.js';
import { retrieve } from '../dist/api/apps/api/src/sources/retrieval.js';
import { assessmentRequirements, isReferenceBoilerplate, isTaskOnlyPassage } from '../dist/api/apps/api/src/generation/assessment/assessment-quality.js';
import { draftIssue, validateAssessment, generationParameters } from '../dist/api/apps/api/src/generation/assessment/assessment-schema.js';
import { qualityOutput } from '../dist/api/apps/api/src/generation/assessment/quality-output.js';
import { OllamaGenerator } from '../dist/api/apps/api/src/providers/ollama-generator.js';

function context() {
  const settings = initialSettings('Custom');
  settings.brief.language = 'de';
  settings.brief.brief = 'Erstelle eine abiturorientierte Übungsklausur für die gymnasiale Oberstufe auf Grundlage der angehängten PDF. Berücksichtige die Anforderungsbereiche I bis III.';
  settings.rag = 'Graph';
  return { settings, format: [], evidence: [{ id: randomUUID(), sourceId: randomUUID(), name: 'Geography.pdf', ordinal: 6,
    text: 'Basaltic magma has low viscosity; gas content and viscosity influence eruption style.', use: 'content' }] };
}

function completeDraft() {
  const question = prompt => ({ prompt, answer: 'A substantive supported answer.', rubric: 'Five points for the explanation and evidence.', points: 5, lines: 5, citations: [1] });
  return { title: 'Geographie – Vulkanismus', instructions: 'Bearbeiten Sie alle Aufgaben. Begründen Sie Ihre Aussagen anhand der Materialien.', teacherNotes: 'Practice scope selected because no duration or point total was supplied.', warnings: [],
    sections: [
      { title: 'AFB I: Reproduktion', instructions: '', questions: [question('Beschreiben Sie die Entstehung von Magma.'), question('Nennen Sie Eigenschaften basaltischer Lava.')] },
      { title: 'AFB II: Analyse', instructions: '', questions: [question('Analysieren Sie den Zusammenhang zwischen Viskosität und Eruptionsstil.'), question('Vergleichen Sie die Folgen zweier Eruptionsszenarien.')] },
      { title: 'AFB III: Bewertung', instructions: '', questions: [question('Beurteilen Sie eine Evakuierungsstrategie anhand der gegebenen Risiken.'), question('Entwickeln Sie eine begründete Empfehlung für die Risikovorsorge.')] },
    ] };
}

test('rejects the reported short Abitur draft and leaked teacher instructions', () => {
  const ctx = context();
  const weak = { ...completeDraft(), instructions: ctx.settings.brief.brief, sections: [{ title: 'Reproduktion', instructions: '', questions:
    ['Was ist Geomorphologie?', 'Was ist Klimageographie?', 'Was ist Bevölkerungsgeographie?'].map(prompt => ({ prompt, points: 2, lines: 2, answer: 'A definition.', rubric: 'Two points.', citations: [] })) }] };
  const issue = draftIssue(weak, ctx);
  assert.match(issue, /copy the teacher brief/);
  assert.match(issue, /at least 6/);
  assert.match(issue, /AFB II/);
  assert.match(issue, /AFB III/);
  assert.throws(() => validateAssessment(weak, ctx), /teacher brief/);
  assert.equal(draftIssue(completeDraft(), ctx), undefined);
  assert.equal(validateAssessment(completeDraft(), ctx).sections.length, 3);
});

test('respects explicit smaller scope and keeps ordinary quizzes and teacher guides unaffected', () => {
  const { settings } = context();
  assert.equal(assessmentRequirements({ ...settings.brief, brief: 'Abitur practice: exactly 2 questions.' }).minimumQuestions, 2);
  assert.deepEqual(assessmentRequirements({ ...settings.brief, brief: 'Abitur practice: exactly 2 questions.' }).cognitiveAreas, []);
  assert.equal(assessmentRequirements({ ...settings.brief, brief: 'A short geography quiz.' }), undefined);
  assert.equal(assessmentRequirements({ ...settings.brief, documentType: { title: 'Abitur', audience: 'teacher' } }), undefined);
  const unsupported = completeDraft();
  unsupported.sections[1].questions.forEach(question => { question.citations = []; });
  assert.match(draftIssue(unsupported, context()), /Ground AFB II/);
});

test('repairs a weak Abitur draft with quality feedback before accepting it', async t => {
  const ctx = context();
  const weak = completeDraft();
  weak.instructions = ctx.settings.brief.brief;
  weak.sections = weak.sections.slice(0, 1);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    const request = JSON.parse(body.messages[1].content);
    assert.equal(request.assessmentRequirements.minimumSections, 3);
    assert.match(body.messages[0].content, /Never copy the teacher brief/);
    assert.equal(body.options.num_predict, 10000);
    if (++calls === 2) assert.match(request.feedback, /JSON schema/);
    const output = calls === 1 ? weak : { ...completeDraft(), sections: Object.fromEntries(completeDraft().sections.map((section, i) => ['area' + (i + 1), { ...section, questions: Object.fromEntries(section.questions.map((question, j) => ['task' + (j + 1), question])) }])) };
    return Response.json({ message: { content: JSON.stringify(output) } });
  });
  const response = await new OllamaGenerator('http://localhost:11434', 'test-model').generate(ctx);
  assert.equal(calls, 2);
  assert.equal(validateAssessment(response.output, ctx).sections.flatMap(section => section.questions).length, 6);
  assert.equal(response.output.sections[0].title, 'AFB I: Reproduktion');
});

test('Abitur task slots and output budget are explicit, without changing ordinary generation limits', () => {
  const { settings } = context();
  const schema = qualityOutput(settings.brief).schema;
  assert.deepEqual(Object.keys(schema.shape.sections.shape), ['area1', 'area2', 'area3']);
  assert.deepEqual(Object.keys(schema.shape.sections.shape.area1.shape.questions.shape), ['task1', 'task2']);
  assert.equal(generationParameters(settings).numPredict, 10000);
  assert.equal(generationParameters({ ...settings, questionId: randomUUID() }).numPredict, 5500);
  assert.equal(generationParameters(initialSettings()).numPredict, 5500);
});

test('AFB prefixes are normalized once even when the model repeats them', () => {
  const title = 'AFB III: AFB III: Transfer und Bewertung – Bewertung von Vulkanlandschaften';
  assert.equal(normalizeSectionHeading(title), 'AFB III: Transfer und Bewertung – Bewertung von Vulkanlandschaften');
  assert.equal(normalizeSectionHeading('AFB II: AFB II: AFB II: Analyse'), 'AFB II: Analyse');
  assert.equal(normalizeSectionHeading('Grundwissen'), 'Grundwissen');
  const draft = completeDraft();
  const raw = { ...draft, sections: Object.fromEntries(draft.sections.map((section, i) => ['area' + (i + 1), {
    ...section, title: section.title.split(':')[0] + ': ' + section.title,
    questions: Object.fromEntries(section.questions.map((question, j) => ['task' + (j + 1), question])),
  }])) };
  assert.equal(qualityOutput(context().settings.brief).project(raw).sections[2].title, 'AFB III: Bewertung');
});

for (const rag of ['Basic', 'Advanced', 'Graph']) {
  test(rag + ' excludes publishing material even when vector search ranks it highest', async () => {
    const ctx = context();
    ctx.settings.rag = rag;
    ctx.settings.brief.topics = 'Vulkanismus';
    const source = { id: randomUUID(), name: 'Geography.pdf', type: 'file', role: 'content' };
    const texts = ['Vorwort\nLiebe Schülerinnen und Schüler, mit diesem Buch halten Sie eine Zusammenfassung des Abiturstoffs.',
      'Inhalt\nVulkanismus .......... 1\nKlima .......... 20\nBevölkerung .......... 40',
      'Über den Online-Code auf der Umschlaginnenseite erhalten Sie Zugang zum Training.',
      'Vulkanismus: Basaltisches Magma ist dünnflüssig. Gase können leichter entweichen.'];
    const chunks = texts.map((text, ordinal) => ({ id: randomUUID(), sourceId: source.id, ordinal, text }));
    const index = { prepare: async () => {}, search: async (_doc, _sources, query) => {
      assert.match(query, /^Vulkanismus/);
      return chunks.map((chunk, i) => ({ id: chunk.id, score: 1 - i / 10 }));
    } };
    const evidence = await retrieve(index, randomUUID(), ctx.settings, [source], () => chunks);
    assert.deepEqual(evidence.map(item => item.text), [texts[3]]);
  });
}

test('broad PDF requests cover substantive chapters without requiring embeddings; Off still excludes file content', async () => {
  const ctx = context();
  const source = { id: randomUUID(), name: 'Geography.pdf', type: 'file', role: 'both' };
  const chunks = ['Vorwort\nLiebe Schülerinnen und Schüler', ...Array.from({ length: 12 }, (_, i) => 'Kapitel ' + i + ': Fachlicher Inhalt über Landschaften und natürliche Prozesse.')]
    .map((text, ordinal) => ({ id: randomUUID(), sourceId: source.id, ordinal, text }));
  const index = { prepare: async () => { throw new Error('No embeddings needed for broad source coverage.'); }, search: async () => [] };
  const evidence = await retrieve(index, randomUUID(), ctx.settings, [source], () => chunks);
  const content = evidence.filter(item => item.use === 'content');
  assert.equal(content.length, 4);
  assert.ok(content.at(-1).ordinal > 6);
  assert.ok(evidence.every(item => !isReferenceBoilerplate(item.text)));
  ctx.settings.rag = 'Off';
  assert.ok((await retrieve(index, randomUUID(), ctx.settings, [source], () => chunks)).every(item => item.use === 'format'));
});

test('recognizes split contents fragments and keeps reference tasks available for teacher guides', async () => {
  assert.equal(isReferenceBoilerplate('. . . . . . . . . . . . 68\n4.3 Regionale Windsysteme . . . . . . . . . . . . 69'), true);
  const text = 'Vulkanlandschaft\nAufgaben\n1 Vergleichen Sie effusiven mit explosivem Vulkanismus.\n2 Erklären Sie die Entstehung eines Hotspot-Vulkans.';
  assert.equal(isTaskOnlyPassage(text), true);
  const ctx = context();
  const source = { id: randomUUID(), name: 'Workbook.pdf', type: 'file', role: 'content' };
  const chunk = { id: randomUUID(), source_id: source.id, ordinal: 3, text };
  const index = { prepare: async () => {}, search: async () => [{ id: chunk.id, score: 1 }] };
  assert.deepEqual(await retrieve(index, randomUUID(), ctx.settings, [source], () => [chunk]), []);
  ctx.settings.brief.documentType = { title: 'Marking guide', audience: 'teacher' };
  assert.equal((await retrieve(index, randomUUID(), ctx.settings, [source], () => [chunk]))[0].text, text);
});
