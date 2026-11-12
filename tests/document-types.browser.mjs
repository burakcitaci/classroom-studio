import { expect, test } from '@playwright/test';

test('teachers can save and reuse their own document guidance from Brief & Sources', async ({ page }) => {
  const doc = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
  await page.goto('/?document=' + doc.id + '&view=brief&lang=en');
  await page.getByRole('button', { name: 'Manage document types', exact: true }).click();
  await page.getByRole('button', { name: 'Start with Erwartungshorizont', exact: true }).click();
  await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Erwartungshorizont');
  await page.getByLabel('Type name', { exact: true }).fill('Marking guide browser test');
  await page.getByLabel('Reusable guidance', { exact: true }).fill('Give exact model answers and award points for each step.');
  await page.getByRole('button', { name: 'Save and use type', exact: true }).click();
  await page.getByLabel('What should Studio create?').fill('Geography, grade 5: continents.');
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByText('Plan saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('What should Studio create?')).toHaveValue('Geography, grade 5: continents.');
  const saved = await (await page.request.get('/api/documents/' + doc.id)).json();
  expect(saved.settings.brief.documentType.title).toBe('Marking guide browser test');
  expect(saved.settings.brief.documentType.audience).toBe('teacher');
  expect(saved.settings.brief.documentType.guidance).toContain('exact model answers');
  await page.getByRole('button', { name: 'Manage document types', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Marking guide browser test', exact: true })).toBeVisible();
});
