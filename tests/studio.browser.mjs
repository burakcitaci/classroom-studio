import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pdf, readZip, word } from './fixtures.mjs';

test('complete assessment workflow survives reload and keeps teacher content out of student exports', async ({ page }) => {
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/?view=documents');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByText('Demo mode', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Create document' }).click();
  await page.getByLabel('What should Studio create?').fill('A biology exam on ecosystems, food chains, fungi and pollination.');
  await page.getByRole('radio', { name: /Basic/ }).check();
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.getByText('Last attempt failed')).toBeVisible();
  await page.getByRole('button', { name: 'View audit' }).click();
  await page.getByRole('button', { name: /Draft generation.*failed/ }).click();
  await expect(page.getByText('No useful content excerpts', { exact: false }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();

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
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByLabel('Teaching notes', { exact: true })).toHaveValue('Mention energy transfer, producers, and the role of fungi.');
  await page.getByRole('button', { name: 'Add notes' }).click();
  await expect(page.getByText('Pasted notes', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /Graph/ }).check();
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.locator('[data-sonner-toast]').getByText('Progress is saved.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-sonner-toast]').getByText('Progress is saved.', { exact: false })).toBeVisible();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Open editor' }).click();
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
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Compare with current', exact: true }).first().click();
  await expect(page.getByText('Reordered', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Question · Points · Answer · Scoring', { exact: false })).toBeVisible();
  await expect(page.getByText('Answer every question in your own words.', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.getByText('Version 2 saved.')).toBeVisible();
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: 'Version 2 saved.' })).toBeVisible();
  await expect(page.locator('main > .message.good')).toHaveCount(0);
  const headerActions = page.locator('.document-header');
  await expect(headerActions.getByRole('button', { name: 'Organize', exact: true })).toBeVisible();
  await expect(headerActions.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
  const studentPreview = page.waitForEvent('popup');
  await previewButton.click();
  const preview = await studentPreview;
  await expect(preview.getByRole('button', { name: 'Print / save as PDF' })).toBeVisible();
  expect(await preview.content()).not.toMatch(/PRIVATE_.*_BROWSER/);
  await preview.close();
  await page.getByLabel('I reviewed the notes').check();
  await page.getByRole('button', { name: 'Mark as ready' }).click();
  await expect(page.getByText('Version 3 is ready.')).toBeVisible();
  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  await exportButton.click();
  const exportDialog = page.getByRole('dialog', { name: 'Export document' });
  await expect(exportDialog).toBeVisible();
  for (const copy of ['Student', 'Teacher']) {
    const options = exportDialog.getByRole('region', { name: copy + ' copy' });
    const download = page.waitForEvent('download');
    await options.getByRole('button', { name: 'Download Word', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('classroom-studio-' + copy.toLowerCase() + '.docx');
    const zip = await readZip(await readFile(await file.path()));
    const allXml = Object.values(zip).join('\n');
    const popupPromise = page.waitForEvent('popup');
    await options.getByRole('button', { name: 'Print preview', exact: true }).click();
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
  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();
  await expect(exportButton).toBeFocused();

  await page.getByRole('button', { name: 'Why these questions?', exact: true }).click();
  await page.getByRole('button', { name: /Draft generation.*Graph.*succeeded/ }).click();
  await expect(page.getByText('assessment-v8')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open resulting version 1' })).toBeVisible();
  await page.locator('.audit-detail .evidence summary').all().then(async links => {
    for (const link of links) await link.click();
  });
  await expect(page.locator('.graph-path').first()).toBeVisible();
  await page.getByRole('button', { name: 'Open resulting version 1' }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await page.locator('.snapshot').getByRole('button', { name: 'Restore as working draft' }).click();
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
  await page.goto('/?view=documents');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath('mobile-library.png'), fullPage: true });
  await page.getByLabel('More options', { exact: true }).click();
  await page.getByRole('button', { name: 'Try a sample exam' }).filter({ visible: true }).click();
  await expect(page.getByText('Indexed', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Basic/ })).toBeChecked();
  await expect(page.getByLabel('Role for Sample exam.txt')).toHaveValue('format');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: info.outputPath('desktop-brief.png'), fullPage: true });
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-library.png'), fullPage: true });
});

test('long exam title leaves room for Ollama and draft actions', async ({ page }, info) => {
  const title = 'Orientierung auf der Erde, Atlasarbeit und die Großlandschaften Deutschlands';
  const response = await page.request.post('/api/documents', { data: { kind: 'Exam' } });
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  const saved = await page.request.patch('/api/documents/' + doc.id, { data: {
    edit: doc.edit,
    settings: { ...doc.settings, generationModel: 'llama3.1:8b',
      brief: { ...doc.settings.brief, subject: 'Geography', grade: 'Grade 5', language: 'de' } },
    draft: { title, instructions: '', evidence: [], warnings: [], teacherNotes: '',
      sections: [{ id: crypto.randomUUID(), title: 'Orientierung', instructions: '', questions: [
        { id: crypto.randomUUID(), prompt: 'Welche Himmelsrichtung liegt gegenüber von Norden?',
          answer: 'Süden.', rubric: 'Richtige Himmelsrichtung.', points: 30, lines: 2, citations: [] },
      ] }] },
  } });
  expect(saved.ok()).toBe(true);
  await page.route('**/api/status', route => route.fulfill({ json: { provider: 'ollama' } }));
  await page.route('**/api/models', route => route.fulfill({ json: ['llama3.1:8b', 'qwen3:8b'] }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?document=' + doc.id);
  const heading = page.getByRole('heading', { name: title, exact: true });
  const model = page.getByRole('combobox', { name: 'Ollama model', exact: true });
  const generate = page.getByRole('button', { name: 'Generate new draft', exact: true });
  await expect(heading).toBeVisible();
  await page.locator('.model-menu summary').click();
  await expect(model).toHaveValue('llama3.1:8b');
  await expect(generate).toBeEnabled();
  await expect(generate).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-workspace.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(model).toBeVisible();
  await expect(generate).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-workspace.png') });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export document' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-export.png'), animations: 'disabled' });
});
