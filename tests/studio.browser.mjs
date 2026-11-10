import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pdf, readZip, word } from './fixtures.mjs';

test('complete assessment workflow survives reload and keeps teacher content out of student exports', async ({ page }) => {
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByText('Demo mode', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Create document' }).click();
  await page.getByLabel('What should Studio create?').fill('A biology exam on ecosystems, food chains, fungi and pollination.');
  await page.getByRole('radio', { name: /Basic/ }).check();
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.getByText('Last attempt failed')).toBeVisible();
  await page.getByRole('button', { name: 'View audit' }).click();
  await page.getByRole('button', { name: /Draft generation.*failed/ }).click();
  await expect(page.getByText('No useful content excerpts', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Brief & sources' }).click();

  const materials = await readFile('fixtures/teaching-notes.txt');
  const exam = await readFile('fixtures/sample-exam.txt', 'utf8');
  await page.getByLabel('Upload source files').setInputFiles([
    { name: 'Teaching materials.txt', mimeType: 'text/plain', buffer: materials },
    { name: 'Format example.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await word(exam) },
    { name: 'Scanned handout.pdf', mimeType: 'application/pdf', buffer: pdf() },
  ]);
  await expect(page.getByText('Indexed', { exact: true })).toHaveCount(2);
  await expect(page.getByText('No selectable text found.', { exact: false })).toBeVisible();
  await page.getByLabel('Role for Format example.docx').selectOption('format');
  await page.getByRole('button', { name: 'Preview extracted text' }).first().click();
  await expect(page.getByText('arrows show the direction of energy transfer', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Paste notes' }).click();
  await page.getByLabel('Teaching notes', { exact: true }).fill('Mention energy transfer, producers, and the role of fungi.');
  await page.getByRole('button', { name: 'Add notes' }).click();
  await expect(page.getByText('Pasted notes', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /Graph/ }).check();
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.getByText('Progress is saved.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Progress is saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open editor' }).click();
  await expect(page.getByRole('heading', { name: 'Assessment editor' })).toBeVisible();
  await expect(page.locator('.teacher-fields .evidence').first()).toBeVisible();
  await page.locator('.teacher-fields .evidence summary').first().click();
  await expect(page.locator('.teacher-fields blockquote').first()).toBeVisible();

  await page.getByLabel('Student instructions').fill('Answer every question in your own words.');
  await page.getByLabel('Question text').first().fill('Write an example of a food chain and name its producer.');
  await page.getByLabel('Points', { exact: true }).first().fill('6');
  await page.getByLabel('Teacher answer', { exact: true }).first().fill('PRIVATE_ANSWER_BROWSER');
  await page.getByLabel('Scoring guidance').first().fill('PRIVATE_RUBRIC_BROWSER');
  await page.getByLabel('Private teacher notes').fill('PRIVATE_NOTES_BROWSER');
  await page.getByRole('button', { name: 'Move question down' }).first().click();
  await expect(page.getByText('Saved locally', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Compare with previous' }).click();
  await expect(page.getByText('Reordered', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Question · Points · Answer · Scoring', { exact: false })).toBeVisible();
  await expect(page.getByText('Answer every question in your own words.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.getByText('Version 2 saved.')).toBeVisible();
  await page.getByLabel('I reviewed the notes').check();
  await page.getByRole('button', { name: 'Mark as ready' }).click();
  await expect(page.getByText('Version 3 is ready.')).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  for (const copy of ['Student', 'Teacher']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: copy + ' Word', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('classroom-studio-' + copy.toLowerCase() + '.docx');
    const zip = await readZip(await readFile(await file.path()));
    const allXml = Object.values(zip).join('\n');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: copy + ' print view', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('button', { name: 'Print / save as PDF' })).toBeVisible();
    const html = await popup.content();
    if (copy === 'Teacher') {
      for (const marker of ['PRIVATE_ANSWER_BROWSER', 'PRIVATE_RUBRIC_BROWSER', 'PRIVATE_NOTES_BROWSER', 'Teaching materials.txt']) {
        expect(allXml).toContain(marker);
        expect(html).toContain(marker);
      }
    } else {
      expect(allXml).not.toMatch(/PRIVATE_.*_BROWSER|Teaching materials\.txt|Teacher copy/);
      expect(html).not.toMatch(/PRIVATE_.*_BROWSER|Teaching materials\.txt|Teacher copy/);
      const printed = await popup.pdf({ preferCSSPageSize: true });
      const mediaBox = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(printed.toString('latin1'));
      expect(mediaBox?.slice(1).map(Number).map(Math.round)).toEqual([595, 842]);
    }
    await popup.close();
  }

  await page.getByRole('button', { name: 'Generation audit', exact: true }).click();
  await page.getByRole('button', { name: /Draft generation.*Graph.*succeeded/ }).click();
  await expect(page.getByText('assessment-v1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open resulting version 1' })).toBeVisible();
  await page.locator('.audit-detail .evidence summary').all().then(async links => {
    for (const link of links) await link.click();
  });
  await expect(page.locator('.graph-path').first()).toBeVisible();
  await page.getByRole('button', { name: 'Open resulting version 1' }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore as working draft' }).click();
  await expect(page.getByText('Version 1 restored as a new working revision.')).toBeVisible();
  await expect(page.getByLabel('Student instructions')).not.toHaveValue('Answer every question in your own words.');
  const oldPrompt = await page.getByLabel('Question text').first().inputValue();
  await page.getByRole('button', { name: 'Regenerate question' }).first().click();
  await page.getByRole('button', { name: 'Preview regenerated question' }).first().click();
  await expect(page.getByRole('heading', { name: 'Proposed replacement' })).toBeVisible();
  await expect(page.getByLabel('Question text').first()).toHaveValue(oldPrompt);
  await page.getByRole('button', { name: 'Replace question' }).click();
  await expect(page.getByLabel('Question text').first()).not.toHaveValue(oldPrompt);
  expect(faults).toEqual([]);
});

test('mobile library and example workspace fit the viewport and automatically select Basic', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath('mobile-library.png'), fullPage: true });
  await page.getByRole('button', { name: 'Try a sample exam' }).click();
  await expect(page.getByText('Indexed', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Basic/ })).toBeChecked();
  await expect(page.getByLabel('Role for Sample exam.txt')).toHaveValue('format');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: info.outputPath('desktop-brief.png'), fullPage: true });
  await page.getByRole('button', { name: 'Classroom Studio home' }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-library.png'), fullPage: true });
});
