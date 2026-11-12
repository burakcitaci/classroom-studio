import { expect, test } from '@playwright/test';

for (const locale of ['en', 'de']) {
  test('document details keep library, class and lesson navigation in ' + locale, async ({ page }) => {
    if (locale === 'de') await page.setViewportSize({ width: 390, height: 844 });
    const classroom = await (await page.request.post('/api/classes', { data: {
      title: 'Navigation class ' + locale, subject: 'Geography', grade: 'Grade 5', language: locale,
    } })).json();
    const lesson = await (await page.request.post('/api/classes/' + classroom.id + '/lessons', { data: { title: 'Atlas lesson ' + locale } })).json();
    const document = await (await page.request.post('/api/documents', { data: { kind: 'Exam', context: { classId: classroom.id, lessonId: lesson.id } } })).json();
    const labels = locale === 'de'
      ? { library: 'Dokumente', navigation: 'Dokumentnavigation', back: 'Zurück zu den Dokumenten', brief: 'Was soll Studio erstellen?' }
      : { library: 'Documents', navigation: 'Document navigation', back: 'Back to documents', brief: 'What should Studio create?' };
    await page.goto('/?view=documents&lang=' + locale);
    await page.locator('.document-title').filter({ hasText: lesson.title }).click();
    if (locale === 'de') {
      await expect(page.locator('.current-crumb')).toContainText('Atlas lesson');
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const breadcrumb = page.getByRole('navigation', { name: labels.navigation, exact: true });
    await expect(breadcrumb.getByRole('button', { name: labels.back, exact: true })).toBeVisible();
    await expect(breadcrumb.getByRole('button', { name: classroom.title, exact: true })).toBeVisible();
    await expect(breadcrumb.getByRole('button', { name: lesson.title, exact: true })).toBeVisible();
    await expect(breadcrumb.locator('[aria-current="page"]')).toContainText('Atlas lesson');
    const edited = 'Preserve my document edits while navigating ' + locale;
    await page.getByRole('button', { name: locale === 'de' ? 'Plan bearbeiten' : 'Edit plan', exact: true }).click();
    await page.getByLabel(labels.brief).fill(edited);
    await page.getByRole('button', { name: locale === 'de' ? 'Plan speichern' : 'Save plan', exact: true }).click();
    await breadcrumb.getByRole('button', { name: labels.back, exact: true }).click();
    await expect(page.getByRole('heading', { name: labels.library, exact: true })).toBeVisible();
    expect((await (await page.request.get('/api/documents/' + document.id)).json()).settings.brief.brief).toBe(edited);
    await page.goBack();
    await expect(page.getByLabel(labels.brief)).toHaveValue(edited);
    await breadcrumb.getByRole('button', { name: classroom.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: classroom.title, exact: true })).toBeVisible();
    await page.goBack();
    await breadcrumb.getByRole('button', { name: lesson.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible();
    await page.goBack();
    await page.reload();
    await expect(breadcrumb).toBeVisible();
    if (locale === 'de') await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
