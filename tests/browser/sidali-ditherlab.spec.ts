import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const sampleImage = 'assets/sample-art.png';

async function setRangeValue(page: Page, selector: string, value: number | string) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value;
  }, value);
}

async function loadSample(page: Page) {
  await page.locator('#file').setInputFiles(sampleImage);
  await expect(page.locator('#status')).toContainText('Preview ready');
}

test('loads the sample image and renders the preview', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Select an image to begin.');
  await expect(pageErrors).toEqual([]);
  await expect(consoleErrors).toEqual([]);
  await loadSample(page);

  await expect(page.locator('#canvasStage')).toBeVisible();
  await expect(page.locator('#canvasStage')).toHaveAttribute('data-view', 'processed');
  await expect(page.locator('#dimensions')).not.toHaveText('—');
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#redo')).toBeDisabled();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('adjustments, undo/redo, geometry, and reset', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  await setRangeValue(page, '#brightness', 40);
  await setRangeValue(page, '#adjustContrast', -10);
  await page.locator('#grayscale').check();

  await expect(page.locator('#brightnessValue')).toHaveText('40');
  await expect(page.locator('#grayscale')).toBeChecked();

  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  await expect(page.locator('#brightnessValue')).toHaveText('40');
  await expect(page.locator('#grayscale')).not.toBeChecked();
  await page.locator('#redo').click();
  await expect(page.locator('#brightnessValue')).toHaveText('40');
  await expect(page.locator('#grayscale')).toBeChecked();

  await page.locator('#resetAdjustments').click();
  await expect(page.locator('#status')).toContainText('Preview ready');
  await expect(page.locator('#brightnessValue')).toHaveText('0');
  await expect(page.locator('#grayscale')).not.toBeChecked();

  await page.locator('[data-geometry="rotate-cw"]').click();
  await expect(page.locator('#geometryLabel')).toHaveText('90° clockwise');
  await page.locator('#undo').click();
  await expect(page.locator('#geometryLabel')).toHaveText('Original orientation');
  await page.locator('#redo').click();
  await expect(page.locator('#geometryLabel')).toHaveText('90° clockwise');

  await page.locator('#reset').click();
  await expect(page.locator('#geometryLabel')).toHaveText('Original orientation');
  await expect(page.locator('#brightnessValue')).toHaveText('0');
});

test('built-in editor preset applies and renders', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  await page.locator('#editorPreset').selectOption('classic-monochrome');
  await expect(page.locator('#editorPresetMessage')).toHaveText(/Applied built-in preset/);
  await expect(page.locator('#mode')).toHaveValue('monochrome');
  await expect(page.locator('#grayscale')).toBeChecked();
  await expect(page.locator('#brightnessValue')).toHaveText('0');
  await expect(page.locator('#algorithmValue')).toHaveText('Floyd–Steinberg');
  await expect(page.locator('#status')).toContainText('Preview ready');
});

test('saved session restores settings and geometry', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  await page.locator('[data-geometry="rotate-cw"]').click();
  await setRangeValue(page, '#brightness', 33);
  await page.waitForTimeout(600);
  await page.reload();

  await expect(page.locator('#geometryLabel')).toHaveText('90° clockwise');
  await expect(page.locator('#brightness')).toHaveValue('33');
});

test('keyboard shortcuts undo, redo, and help', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  await setRangeValue(page, '#brightness', 25);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#brightnessValue')).toHaveText('0');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#brightnessValue')).toHaveText('25');

  await page.keyboard.press('?');
  const shortcutsDialog = page.locator('#shortcutsDialog');
  await expect(shortcutsDialog).toBeVisible();
  await page.locator('#shortcutsClose').click();
  await expect(shortcutsDialog).toBeHidden();
});

test('comparison, hold original, zoom, and pan', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  await page.locator('button.view-tab[data-view="compare"]').click();
  await expect(page.locator('#compareControl')).toBeVisible();
  await expect(page.locator('#compareLine')).toBeVisible();
  await setRangeValue(page, '#compare', 70);
  await expect(page.locator('#compareValue')).toHaveText('70%');
  await expect(page.locator('#compareLine')).toHaveAttribute('style', /left:\s*70%/);

  await page.locator('button.view-tab[data-view="side-by-side"]').click();
  await expect(page.locator('#canvasStage')).toHaveAttribute('data-view', 'side-by-side');
  await expect(page.locator('#compareControl')).toBeHidden();

  const holdOriginal = page.locator('#holdOriginal');
  const holdBox = await holdOriginal.boundingBox();
  await page.mouse.move((holdBox?.x ?? 0) + 2, (holdBox?.y ?? 0) + 2);
  await page.mouse.down();
  await expect(holdOriginal).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await expect(holdOriginal).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#zoomIn').click();
  await expect(page.locator('#zoomValue')).not.toHaveText('Fit');
  await page.locator('#zoomActual').click();
  await expect(page.locator('#zoomValue')).toHaveText('100%');
  await page.locator('#zoomIn').click();
  await expect(page.locator('#zoomValue')).toHaveText('125%');

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('+');
  }
  const wrap = page.locator('#canvasWrap');
  const wrapBox = await wrap.boundingBox();
  if (wrapBox) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.down(' ');
    await page.mouse.move(wrapBox.x + wrapBox.width / 2 + 40, wrapBox.y + 120);
    await page.mouse.down();
    await page.mouse.move(wrapBox.x + wrapBox.width / 2 - 40, wrapBox.y + 150, { steps: 2 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    const scrollLeft = await wrap.evaluate(element => element.scrollLeft);
    expect(scrollLeft).toBeGreaterThan(0);
  }
});

test('mobile layouts avoid horizontal overflow and expose key controls', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await loadSample(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('#brightness')).toBeVisible();
    await expect(page.locator('#zoomIn')).toBeVisible();
    await expect(page.locator('#download')).toBeVisible();
  }
});

test('export creates a valid encoded image', async ({ page }) => {
  await page.goto('/');
  await loadSample(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export image' }).click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();
  expect(download.suggestedFilename()).toMatch(/\.webp$/);

  const bytes = readFileSync(exportPath as string);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
});

test('batch processes multiple images and creates a valid zip', async ({ page }) => {
  await page.goto('/');
  await page.locator('#openBatch').click();
  await page.locator('#batchFiles').setInputFiles([sampleImage, sampleImage]);
  await expect(page.locator('#batchStatus')).toContainText('Queued 2 images');
  await page.locator('#batchStart').click();
  await expect(page.locator('#batchStatus')).toContainText('Batch finished');
  await expect(page.locator('#batchDownloadZip')).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#batchDownloadZip').click();
  const download = await downloadPromise;
  const batchPath = await download.path();
  expect(batchPath).toBeTruthy();
  expect(download.suggestedFilename()).toBe('sidali-ditherlab-batch.zip');

  const zipBytes = readFileSync(batchPath as string);
  expect(zipBytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');
});
