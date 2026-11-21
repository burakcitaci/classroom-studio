import { expect, test } from '@playwright/test';

for (const width of [1280, 390, 320]) {
  test('German failure toast keeps readable text and actions at width ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const document = await (await page.request.post('/api/documents', { data: { kind: 'Exam' } })).json();
    await page.goto('/?document=' + document.id + '&lang=de');
    await page.getByLabel('Was soll Studio erstellen?').fill('Eine Geographieprüfung über Karten und Orientierung.');
    await page.getByText('Erweiterte Einstellungen', { exact: true }).click();
    await page.getByRole('radio', { name: /^Einfach/ }).check();
    await page.getByRole('button', { name: 'Plan speichern und Entwurf erstellen', exact: true }).click();
    const failure = page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: 'Letzter Versuch fehlgeschlagen' });
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('Es wurden keine geeigneten Textauszüge gefunden.');
    const layout = await failure.evaluate(element => {
      const rectangle = node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
      return { box: rectangle(element), text: rectangle(element.querySelector('[data-content]')),
        buttons: [...element.querySelectorAll('.toast-action, .toast-cancel')].map(rectangle),
        fits: element.scrollWidth <= element.clientWidth };
    });
    expect(layout.text.width).toBeGreaterThan(layout.box.width * 0.65);
    expect(layout.box.height).toBeLessThan(360);
    const audit = failure.getByRole('button', { name: 'Protokoll ansehen', exact: true });
    await expect(failure.getByRole('button', { name: 'Erneut versuchen', exact: true })).toBeVisible();
    await expect(audit).toBeVisible();
    for (const bounds of layout.buttons) {
      expect(bounds.y).toBeGreaterThanOrEqual(layout.text.y + layout.text.height - 1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(layout.box.x + layout.box.width + 1);
    }
    expect(layout.fits).toBe(true);
    await page.screenshot({ path: info.outputPath('german-toast-' + width + '.png'), animations: 'disabled' });
    await failure.getByRole('button', { name: 'Close toast', exact: true }).click();
    await expect(failure).toHaveCount(0);
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await expect(failure).toHaveCount(0);
    await page.getByRole('tab', { name: 'Bearbeiten', exact: true }).click();
    await page.getByRole('button', { name: 'Warum diese Fragen?', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Erstellungsprotokoll', exact: true })).toBeVisible();
  });
}
