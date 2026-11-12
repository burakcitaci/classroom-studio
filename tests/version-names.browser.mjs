import { expect, test } from '@playwright/test';

test('saved versions can be named, renamed and reset without changing their content', async ({ page }) => {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  const draft = { title: 'Volcano practice', instructions: 'Answer every question.', teacherNotes: '', evidence: [], warnings: [], sections: [{
    id: crypto.randomUUID(), title: 'AFB III: AFB III: Transfer und Bewertung', instructions: '', questions: [{
      id: crypto.randomUUID(), prompt: 'Beurteilen Sie eine Evakuierungsstrategie.', points: 5, lines: 3, answer: 'A supported judgment.', rubric: 'Five points for evidence and judgment.', citations: [],
    }],
  }] };
  const working = await (await page.request.patch('/api/documents/' + doc.id, { data: { edit: doc.edit, settings: doc.settings, draft } })).json();
  const version = await (await page.request.post('/api/documents/' + doc.id + '/versions', { data: { edit: working.edit, kind: 'Teacher' } })).json();
  await page.goto('/?document=' + doc.id + '&view=history&lang=en');
  await page.getByRole('button', { name: 'Rename version 1', exact: true }).click();
  await page.getByLabel('Version name', { exact: true }).fill('Reviewed for 9B – Überarbeitung');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.version-custom-name')).toHaveText('Reviewed for 9B – Überarbeitung');
  await page.reload();
  await expect(page.locator('.version-custom-name')).toHaveText('Reviewed for 9B – Überarbeitung');
  await page.getByRole('button', { name: 'Preview version 1', exact: true }).click();
  await expect(page.locator('.snapshot h2')).toHaveText('Reviewed for 9B – Überarbeitung');
  await expect(page.locator('.snapshot h3').first()).toHaveText('AFB III: Transfer und Bewertung');
  const print = await (await page.request.get('/api/documents/' + doc.id + '/export?copy=student&format=print&version=' + version.id)).text();
  expect(print).toContain('AFB III: Transfer und Bewertung');
  expect(print).not.toContain('AFB III: AFB III:');
  await page.getByRole('button', { name: 'Compare with current', exact: true }).click();
  await expect(page.getByLabel('Earlier version').locator('option:checked')).toContainText('Reviewed for 9B');
  const renamed = (await (await page.request.get('/api/documents/' + doc.id + '/versions')).json())[0];
  expect(renamed.draft).toEqual(version.draft);
  expect(renamed.settings).toEqual(version.settings);
  expect(renamed.number).toBe(1);
  expect((await (await page.request.get('/api/documents/' + doc.id)).json()).edit).toBe(working.edit);
  expect((await page.request.patch('/api/documents/' + doc.id + '/versions/' + version.id, { data: { name: 'Stale name', nameEdit: 0 } })).status()).toBe(409);
  const outside = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  expect((await page.request.patch('/api/documents/' + outside.id + '/versions/' + version.id, { data: { name: 'Wrong document', nameEdit: renamed.nameEdit } })).status()).toBe(404);
  expect((await page.request.patch('/api/documents/' + doc.id + '/versions/' + version.id, { data: { name: 'x'.repeat(121), nameEdit: renamed.nameEdit } })).status()).toBe(400);
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Rename version 1', exact: true }).click();
  await page.getByLabel('Version name', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.version-custom-name')).toHaveCount(0);
  await expect(page.locator('.history-row')).toContainText('Version 1');
});
