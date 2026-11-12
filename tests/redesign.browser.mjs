import { expect, test } from '@playwright/test';
import { ensureDocumentTypes } from './type-fixtures.mjs';
test.beforeEach(async ({ request }) => { await ensureDocumentTypes(request); });

async function draftDocument(page, title = 'Ecosystems quiz') {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Quiz' } })).json();
  const draft = { title, instructions: 'Answer each question.', teacherNotes: '', warnings: [], evidence: [], sections: [{
    id: crypto.randomUUID(), title: 'Food chains', instructions: '', questions: [
      { id: crypto.randomUUID(), prompt: 'Name a producer.', points: 2, lines: 2, answer: 'Grass.', rubric: 'One plant.', citations: [] },
      { id: crypto.randomUUID(), prompt: 'Name a decomposer.', points: 3, lines: 2, answer: 'Fungi.', rubric: 'One decomposer.', citations: [] },
    ],
  }] };
  expect((await page.request.patch('/api/documents/' + doc.id, { data: {
    edit: doc.edit, settings: { ...doc.settings, brief: { ...doc.settings.brief, brief: 'A quiz about ecosystems.' } }, draft,
  } })).ok()).toBe(true);
  return doc.id;
}

test('workspace tabs support arrow keys and audit drawer restores focus', async ({ page }, info) => {
  const id = await draftDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?document=' + id + '&view=editor&lang=en');
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  const editor = tabs.getByRole('tab', { name: 'Editor', exact: true });
  await editor.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'History' })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-history');
  await page.keyboard.press('Home');
  await expect(tabs.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  const audit = page.getByRole('button', { name: 'Why these questions?', exact: true });
  await audit.click();
  await expect(page.getByRole('dialog', { name: 'Why these questions?', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Generation audit', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(audit).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('redesigned-editor-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Move question down', exact: true }).first().click();
  await expect(page.getByLabel('Question text', { exact: true }).first()).toHaveValue('Name a decomposer.');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByText('Version 1 saved.', { exact: true })).toBeVisible();
  await tabs.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Compare with current', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare versions', exact: true })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('navigation', { name: 'Document progress' }).getByRole('button', { name: /Sources$/ }).click();
  await expect(page.getByRole('navigation', { name: 'Document progress' }).getByRole('button', { name: /Sources$/ })).toHaveAttribute('aria-current', 'step');
});

test('mobile sheet and status filters remain usable at narrow widths', async ({ page }, info) => {
  const id = await draftDocument(page, 'Mobile ecology quiz');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=documents&lang=en');
  await page.getByLabel('Filter by status', { exact: true }).selectOption('Draft');
  await expect(page.locator('.document-title').filter({ hasText: 'Mobile ecology quiz' })).toBeVisible();
  const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
  await clear.click();
  await expect(clear).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('redesigned-documents-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Workspace', exact: true });
  await expect(sheet.getByRole('button', { name: 'Document types', exact: true })).toBeVisible();
  await expect(sheet.getByRole('combobox', { name: 'Interface language', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('redesigned-navigation-mobile.png'), animations: 'disabled' });
  await sheet.getByRole('button', { name: 'Classes', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Classes', exact: true })).toBeVisible();
  await page.goto('/?document=' + id + '&view=editor&lang=en');
  for (const width of [390, 320, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('generation explains the locked plan and model errors provide retry', async ({ page }) => {
  const id = await draftDocument(page);
  let calls = 0;
  await page.route('**/api/status', route => route.fulfill({ json: { provider: 'ollama' } }));
  await page.route('**/api/models', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, json: { message: 'Ollama is offline' } }) : route.fulfill({ json: ['llama3.1:8b'] });
  });
  await page.goto('/?document=' + id + '&view=brief&lang=en');
  await expect(page.getByRole('alert').filter({ hasText: 'Ollama is offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ollama is offline' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  const generate = page.getByRole('button', { name: 'Generate new draft', exact: true });
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAccessibleDescription('Save your plan to generate.');
});

test('class cards show the next lesson and timeline actions keep lesson context', async ({ page }, info) => {
  const classroom = await (await page.request.post('/api/classes', { data: {
    title: '9B Biology', subject: 'Biology', grade: 'Year 9', schoolYear: '2026–27', language: 'en',
  } })).json();
  const dateAfter = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  for (const [title, date] of [['Lab ideas', null], ['Field study', dateAfter(4)], ['Ecosystems', dateAfter(2)]]) {
    expect((await page.request.post('/api/classes/' + classroom.id + '/lessons', { data: { title, date } })).ok()).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?lang=en');
  const card = page.locator('.class-row').filter({ hasText: '9B Biology' });
  await expect(card.locator('.next-lesson')).toContainText('Ecosystems');
  await page.screenshot({ path: info.outputPath('redesigned-classes-desktop.png'), animations: 'disabled' });
  await card.click();
  await expect(page.locator('.lesson-label strong')).toHaveText(['Ecosystems', 'Field study', 'Lab ideas']);
  await page.getByRole('button', { name: 'Create document: Ecosystems', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.locator('.current-crumb')).toContainText('Ecosystems');
  const id = new URL(page.url()).searchParams.get('document');
  const doc = await (await page.request.get('/api/documents/' + id)).json();
  expect(doc.context.classId).toBe(classroom.id);
  expect(doc.context.lessonTitle).toBe('Ecosystems');
});
