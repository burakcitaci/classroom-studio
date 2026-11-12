import { expect, test } from '@playwright/test';

test('plans a class and a lesson, reuses lesson context and finds the document again', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Classes', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true });
  await expect(navigation.getByRole('button', { name: 'Documents', exact: true })).toBeVisible();

  await page.screenshot({ path: info.outputPath('classes-mobile.png') });
  const example = page.getByRole('button', { name: 'Use the Biology example' });
  await example.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(example).toBeFocused();
  await example.click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Class title')).toHaveValue('Biology · Grade 5');
  await dialog.getByLabel('School year').fill('2026–27');
  await dialog.getByRole('button', { name: 'Create class', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Biology · Grade 5', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('button', { name: 'Add lesson', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lesson title').fill('Cells and living things');
  await dialog.getByLabel('Lesson date').fill('2026-11-18');
  await dialog.getByLabel('Description').fill('Compare two microscope images.');
  await dialog.getByLabel('Learning goals').fill('Identify the cell wall and nucleus.');
  await dialog.getByRole('button', { name: 'Add lesson', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cells and living things', exact: true })).toBeVisible();
  await expect(page.getByText('Identify the cell wall and nucleus.', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath('lesson-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Edit lesson' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lesson title').fill('Plant and animal cells');
  await dialog.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByRole('heading', { name: 'Plant and animal cells', exact: true })).toBeVisible();
  const lessonId = new URL(page.url()).searchParams.get('lesson');
  expect(lessonId).toBeTruthy();
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Document type').selectOption('Quiz');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plant and animal cells · Quiz', exact: true })).toBeVisible();
  await expect(page.getByLabel('What should Studio create?')).toHaveValue(/Identify the cell wall and nucleus/);
  await page.getByText('More options', { exact: true }).click();
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Biology');
  await expect(page.getByLabel('Grade / year', { exact: true })).toHaveValue('Grade 5');

  await navigation.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByLabel('Filter by class').selectOption({ label: 'Biology · Grade 5' });
  await expect(page.getByRole('button', { name: /^Plant and animal cells · Quiz/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Plant and animal cells · Quiz/ }).first().click();
  await page.getByRole('button', { name: 'Organize', exact: true }).click();
  dialog = page.getByRole('dialog');
  const lessonPicker = dialog.getByRole('combobox', { name: 'Lesson', exact: true });
  await expect(lessonPicker).toHaveValue(lessonId);
  await lessonPicker.selectOption({ label: 'Class only' });
  await dialog.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByText('Document filed under Biology · Grade 5.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Biology · Grade 5', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Biology · Grade 5', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Class documents', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Plant and animal cells.*0 documents/ })).toBeVisible();

  await page.getByRole('button', { name: 'Archive class' }).click();
  await expect(page.getByText(/This class is archived/)).toBeVisible();
  await page.getByRole('button', { name: 'Reopen class' }).click();
  await expect(page.getByRole('button', { name: 'Add lesson', exact: true })).toBeVisible();
});
