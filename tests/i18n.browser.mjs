import { expect, test } from '@playwright/test';

test.use({ locale: 'de-DE' });

test('German interface follows browser language and safely switches to English', async ({ page }) => {
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { name: 'Klassen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Klasse erstellen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Klasse erstellen', exact: true }).click();
  await expect(page.getByLabel('Klassenbezeichnung')).toBeVisible();
  await page.getByLabel('Klassenbezeichnung').fill('Biologie 5b');
  await page.locator('#interface-language').selectOption('en');
  await expect(page.getByLabel('Klassenbezeichnung')).toHaveValue('Biologie 5b');
  await expect(page.locator('[data-sonner-toast]').last()).toContainText('Schließe das aktuelle Formular');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  // The language guard checks for open forms. Wait for the dialog's exit
  // lifecycle to remove its form before attempting the next language change.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#interface-language').selectOption('en');
  await page.getByRole('dialog').getByRole('button', { name: /^(Sprache der Oberfläche|Interface language):/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Classes', exact: true })).toBeVisible();
  await page.goto('/?view=documents');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#interface-language')).toHaveValue('en');
  expect(faults).toEqual([]);
});

test('language switching saves document edits and preserves exam language and enum values', async ({ page }) => {
  await page.goto('/?view=documents&lang=en');
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.getByLabel('What should Studio create?')).toBeVisible();
  const documentId = new URL(page.url()).searchParams.get('document');
  const brief = 'An English geography exam with original questions about maps.';
  await page.getByLabel('What should Studio create?').fill(brief);
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await page.locator('#interface-language').selectOption('de');
  await page.getByRole('dialog').getByRole('button', { name: /^(Sprache der Oberfläche|Interface language):/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByLabel('Was soll Studio erstellen?')).toHaveValue(brief);
  await expect(page.locator('studio-assessment-brief').getByLabel('Dokumenttyp')).toHaveValue('Exam');
  await expect(page.locator('studio-assessment-brief').getByLabel('Dokumenttyp').locator('option:checked')).toHaveText('Klassenarbeit');
  await page.getByText('Weitere Optionen', { exact: true }).first().click();
  await expect(page.getByLabel('Ausgabesprache')).toHaveValue('en');
  await page.getByRole('button', { name: 'Plan bearbeiten', exact: true }).click();
  await page.getByLabel('Schwierigkeitsgrad').selectOption('Challenging');
  await page.getByRole('button', { name: 'Plan speichern', exact: true }).click();
  await page.locator('#interface-language').selectOption('en');
  await page.getByRole('dialog').getByRole('button', { name: /^(Sprache der Oberfläche|Interface language):/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const saved = await (await page.request.get('/api/documents/' + documentId)).json();
  expect(saved.settings.brief).toMatchObject({ brief, kind: 'Exam', language: 'en', difficulty: 'Challenging' });
  await expect(page.getByLabel('What should Studio create?')).toHaveValue(brief);
});

test('German document creation sends stable schema values and fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=documents');
  await page.getByRole('button', { name: 'Dokument erstellen', exact: true }).click();
  await page.getByRole('radio', { name: 'Arbeitsblatt', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Dokument erstellen', exact: true }).click();
  await expect(page.locator('studio-assessment-brief').getByLabel('Dokumenttyp')).toHaveValue('Worksheet');
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entwurf erstellen', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
  await page.locator('#mobile-interface-language').selectOption('en');
  await page.getByRole('dialog').getByRole('button', { name: /^(Sprache der Oberfläche|Interface language):/ }).click();
  await expect(page.getByRole('button', { name: 'Generate draft', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
