import { expect, test } from '@playwright/test';

const summary = job => ({ id: job.id, stage: 'generating', model: job.model, created: job.created,
  settings: { rag: job.settings.rag, questionId: job.settings.questionId }, hasPreview: false });

test('a poll started before generation cannot clear and replay its notification', async ({ page }) => {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  expect((await page.request.patch('/api/documents/' + doc.id, { data: {
    edit: doc.edit, settings: { ...doc.settings, brief: { ...doc.settings.brief, brief: 'Create a geography quiz.' } }, draft: null,
  } })).ok()).toBe(true);
  let job;
  let holdPoll = false;
  let held = false;
  let polls = 0;
  let release;
  const pollGate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/documents/' + doc.id + '/jobs', async route => {
    const response = await route.fetch();
    job = { ...await response.json(), stage: 'generating' };
    return route.fulfill({ response, json: job });
  });
  await page.route('**/api/documents/' + doc.id + '/activity', async route => {
    const response = await route.fetch();
    const activity = await response.json();
    if (holdPoll && !held) {
      held = true;
      await pollGate;
      return route.fulfill({ response, json: { ...activity, jobs: [] } });
    }
    if (job) polls++;
    return route.fulfill({ response, json: { ...activity, jobs: job ? [summary(job)] : [] } });
  });
  await page.goto('/?document=' + doc.id + '&view=brief&lang=de');
  await expect(page.getByRole('button', { name: 'Entwurf erstellen', exact: true })).toBeEnabled();
  holdPoll = true;
  await expect.poll(() => held).toBe(true);
  await page.getByRole('button', { name: 'Entwurf erstellen', exact: true }).click();
  const writing = page.locator('[data-sonner-toast]').filter({ hasText: 'Dein Entwurf wird geschrieben' });
  await expect(writing).toHaveCount(1);
  const originalNode = await writing.elementHandle();
  release();
  await expect.poll(() => polls).toBeGreaterThan(1);
  await expect(writing).toHaveCount(1);
  expect(await originalNode.evaluate(element => element.isConnected)).toBe(true);
});

test('a delayed generation response does not repeat the writing notification', async ({ page }) => {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  expect((await page.request.patch('/api/documents/' + doc.id, { data: {
    edit: doc.edit, settings: { ...doc.settings, brief: { ...doc.settings.brief, brief: 'Create a geography quiz.' } }, draft: null,
  } })).ok()).toBe(true);
  let job;
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  let polls = 0;
  await page.route('**/api/documents/' + doc.id + '/jobs', async route => {
    const response = await route.fetch();
    job = await response.json();
    await responseGate;
    return route.fulfill({ response, json: job });
  });
  await page.route('**/api/documents/' + doc.id + '/activity', async route => {
    const response = await route.fetch();
    const activity = await response.json();
    if (job) { polls++; return route.fulfill({ response, json: { ...activity, jobs: [summary(job)] } }); }
    return route.fulfill({ response, json: { ...activity, jobs: [] } });
  });
  await page.goto('/?document=' + doc.id + '&view=brief&lang=de');
  await page.getByRole('button', { name: 'Entwurf erstellen', exact: true }).click();
  const writing = page.locator('[data-sonner-toast]').filter({ hasText: 'Dein Entwurf wird geschrieben' });
  await expect(writing).toHaveCount(1);
  const originalNode = await writing.elementHandle();
  release();
  const priorPolls = polls;
  await expect.poll(() => polls).toBeGreaterThan(priorPolls + 1);
  await expect(writing).toHaveCount(1);
  expect(await originalNode.evaluate(element => element.isConnected)).toBe(true);
});
