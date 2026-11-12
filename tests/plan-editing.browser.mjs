import { expect, test } from '@playwright/test';

async function createPlan(page) {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  const settings = { ...doc.settings, brief: { ...doc.settings.brief, brief: 'Original geography plan', duration: 30, totalPoints: 20 } };
  expect((await page.request.patch('/api/documents/' + doc.id, { data: { edit: doc.edit, settings, draft: null } })).ok()).toBe(true);
  return doc.id;
}

for (const locale of ['en', 'de']) {
  test('Plan supports explicit edit, cancel and save in ' + locale, async ({ page }) => {
    const id = await createPlan(page);
    await page.clock.install();
    await page.goto('/?document=' + id + '&view=brief&lang=' + locale);
    const words = locale === 'de'
      ? { edit: 'Plan bearbeiten', save: 'Plan speichern', cancel: 'Abbrechen', brief: 'Was soll Studio erstellen?', duration: 'Dauer (Minuten)', more: 'Weitere Optionen', back: 'Zurück zu den Dokumenten', blocked: 'Speichere deine Planänderungen', saved: 'Plan gespeichert.' }
      : { edit: 'Edit plan', save: 'Save plan', cancel: 'Cancel', brief: 'What should Studio create?', duration: 'Duration (minutes)', more: 'More options', back: 'Back to documents', blocked: 'Save or cancel your plan changes', saved: 'Plan saved.' };
    const brief = page.getByLabel(words.brief);
    await expect(brief).toBeDisabled();
    await page.getByRole('button', { name: words.edit, exact: true }).click();
    await expect(brief).toBeEditable();
    await brief.fill('Keep these edits local until I save.');
    await page.clock.runFor(1500);
    expect((await (await page.request.get('/api/documents/' + id)).json()).settings.brief.brief).toBe('Original geography plan');
    await page.getByRole('button', { name: words.back, exact: true }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: words.blocked })).toBeVisible();
    await expect(brief).toHaveValue('Keep these edits local until I save.');
    await page.getByRole('button', { name: words.cancel, exact: true }).click();
    await expect(brief).toHaveValue('Original geography plan');
    await expect(brief).toBeDisabled();
    await page.getByRole('button', { name: words.edit, exact: true }).click();
    await brief.fill('Updated and explicitly saved geography plan');
    await page.getByText(words.more, { exact: true }).first().click();
    await page.getByLabel(words.duration).fill('45');
    await page.getByRole('button', { name: words.save, exact: true }).click();
    await expect(page.getByText(words.saved, { exact: true })).toBeVisible();
    await expect(brief).toBeDisabled();
    await page.reload();
    await expect(brief).toHaveValue('Updated and explicitly saved geography plan');
    const persisted = await (await page.request.get('/api/documents/' + id)).json();
    expect(persisted.settings.brief.duration).toBe(45);
  });
}

test('a failed Plan save keeps edits available for retry', async ({ page }) => {
  const id = await createPlan(page);
  await page.goto('/?document=' + id + '&view=brief&lang=en');
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  const brief = page.getByLabel('What should Studio create?');
  await brief.fill('My plan survives a failed save');
  let fail = true;
  await page.route('**/api/documents/' + id, route => {
    if (route.request().method() === 'PATCH' && fail) {
      fail = false;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary save failure' }) });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByText('Temporary save failure', { exact: true })).toBeVisible();
  await expect(brief).toBeEditable();
  await expect(brief).toHaveValue('My plan survives a failed save');
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByText('Plan saved.', { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/documents/' + id)).json()).settings.brief.brief).toBe('My plan survives a failed save');
});


test('Plan save conflicts preserve edits and can be resolved from the toast', async ({ page }) => {
  const id = await createPlan(page);
  await page.goto('/?document=' + id + '&view=brief&lang=en');
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  const brief = page.getByLabel('What should Studio create?');
  await brief.fill('My explicitly retained plan');
  const remote = await (await page.request.get('/api/documents/' + id)).json();
  expect((await page.request.patch('/api/documents/' + id, { data: { edit: remote.edit,
    settings: { ...remote.settings, brief: { ...remote.settings.brief, brief: 'Changed in another window' } }, draft: remote.draft } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  const conflict = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(conflict.getByRole('button', { name: 'Keep my edits', exact: true })).toBeVisible();
  await expect(brief).toHaveValue('My explicitly retained plan');
  await conflict.getByRole('button', { name: 'Keep my edits', exact: true }).click();
  await expect(page.getByText('Plan saved.', { exact: true })).toBeVisible();
  await expect(brief).toBeDisabled();
  expect((await (await page.request.get('/api/documents/' + id)).json()).settings.brief.brief).toBe('My explicitly retained plan');
});
