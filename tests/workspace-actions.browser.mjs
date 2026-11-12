import { expect, test } from '@playwright/test';

test('direct preview saves the latest draft and toast actions resolve a save conflict', async ({ page }) => {
  const created = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  const draft = {
    title: 'Geography practice', instructions: '', teacherNotes: 'PRIVATE_TEACHER_NOTE', warnings: [], evidence: [],
    sections: [{ id: crypto.randomUUID(), title: 'Maps', instructions: '', questions: [{
      id: crypto.randomUUID(), prompt: 'Name a cardinal direction.', points: 5, lines: 3,
      answer: 'PRIVATE_TEACHER_ANSWER', rubric: 'PRIVATE_TEACHER_RUBRIC', citations: [],
    }] }],
  };
  const saved = await page.request.patch('/api/documents/' + created.id, { data: { edit: created.edit, settings: created.settings, draft } });
  expect(saved.ok()).toBe(true);
  await page.goto('/?document=' + created.id + '&view=editor&lang=en');
  const navigation = page.getByRole('navigation', { name: 'Document workspace' });
  await expect(navigation).toBeVisible();
  expect((await navigation.getByRole('button').allTextContents()).map(text => text.trim().replace(/\s+/g, ' '))).toEqual([
    'Brief & sources', 'Editor', 'History', 'Compare', 'Generation audit', 'Organize', 'Export',
  ]);
  await page.getByLabel('Student instructions').fill('LATEST_PREVIEW_INSTRUCTIONS');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = await popup;
  await expect(preview.getByText('LATEST_PREVIEW_INSTRUCTIONS', { exact: false })).toBeVisible();
  expect(await preview.content()).not.toContain('PRIVATE_TEACHER');
  await preview.close();
  expect(await (await page.request.get('/api/documents/' + created.id + '/versions')).json()).toEqual([]);

  let conflict = true;
  await page.route('**/api/documents/' + created.id, route => {
    if (route.request().method() === 'PATCH' && conflict) {
      conflict = false;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'A newer draft exists. Reload it before saving.' }) });
    }
    return route.continue();
  });
  await page.getByLabel('Document title').fill('My retained geography draft');
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(errorToast).toContainText('A newer draft exists.');
  await expect(errorToast.getByRole('button', { name: 'Load latest draft' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await errorToast.getByRole('button', { name: 'Keep my edits' }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(errorToast).toHaveCount(0);
  const latest = await (await page.request.get('/api/documents/' + created.id)).json();
  expect(latest.draft.title).toBe('My retained geography draft');
});


test('review notes stay visible, draft saving is allowed and readiness points to acknowledgment', async ({ page }) => {
  const created = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  const warnings = ['Check the atlas page references before printing.', 'Review the scale calculation for this class.'];
  const draft = { title: 'Atlas exam', instructions: '', teacherNotes: '', evidence: [], warnings,
    sections: [{ id: crypto.randomUUID(), title: 'Maps', instructions: '', questions: [{
      id: crypto.randomUUID(), prompt: 'Name a cardinal direction.', points: 5, lines: 2, answer: 'North.', rubric: 'One correct direction.', citations: [],
    }] }] };
  expect((await page.request.patch('/api/documents/' + created.id, { data: { edit: created.edit, settings: created.settings, draft } })).ok()).toBe(true);
  await page.goto('/?document=' + created.id + '&view=editor&lang=en');
  const notes = page.locator('#draft-review-notes');
  for (const warning of warnings) await expect(notes.getByText(warning, { exact: true })).toBeVisible();
  await expect(notes.getByLabel('I reviewed the notes')).not.toBeChecked();
  await page.getByRole('button', { name: 'Mark as ready', exact: true }).click();
  await expect(notes).toBeFocused();
  const guidance = page.locator('[data-sonner-toast]').filter({ hasText: 'Review the notes above' });
  await expect(guidance).toBeVisible();
  await guidance.getByRole('button', { name: 'Show review notes' }).click();
  await expect(notes).toBeFocused();
  expect(await (await page.request.get('/api/documents/' + created.id + '/versions')).json()).toEqual([]);
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByText('Version 1 saved.', { exact: true })).toBeVisible();
  await notes.getByLabel('I reviewed the notes').check();
  await page.getByRole('button', { name: 'Mark as ready', exact: true }).click();
  await expect(page.getByText('Version 2 is ready.', { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/documents/' + created.id)).json()).ready).toBe(true);
});
