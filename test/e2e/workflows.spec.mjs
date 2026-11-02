import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

const terminal = status => ['completed', 'failed', 'cancelled'].includes(status);
const downloadID = download => download.download_id || download.id;
const status = async (request, id) => (await request.get(`/api/download/${id}/status`)).json();
const card = (page, id) => page.getByTestId(`download-${id}`);
const jsonResponse = (page, path) => page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '') === path.replace(/\/$/, '') && response.request().method() === 'POST');

async function inspect(page, source = 'https://example.com/video') {
  await page.getByRole('textbox', { name: 'Video or playlist URL' }).fill(source);
  await page.getByRole('button', { name: 'Fetch video info' }).click();
}
async function download(page) {
  const response = jsonResponse(page, '/api/download/');
  await page.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(202);
  return (await result.json()).id;
}
async function complete(page, id) {
  await expect(card(page, id).locator('.dl-status')).toHaveText('completed', { timeout: 15000 });
}
async function accessible(page, include) {
  // This app has no cross-origin frames. Run in the inspected page so an axe
  // analysis does not open another tab and change focus/visibility mid-flow.
  let scan = new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) scan = scan.include(include);
  const results = await scan.analyze();
  expect(results.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
}
async function fitsViewport(page) {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({ page, request }) => {
  // Every record belongs to the disposable server fixture, which has its own
  // download and history directories. No user history or files are touched.
  const data = await (await request.get('/api/downloads/?limit=200')).json();
  await Promise.all(data.downloads.filter(download => !terminal(download.status)).map(download => request.post(`/api/download/${downloadID(download)}/cancel`, { data: {} })));
  await expect.poll(async () => (await (await request.get('/api/downloads/?limit=200')).json()).downloads.every(download => terminal(download.status))).toBe(true);
  for (const download of data.downloads) expect((await request.delete(`/api/download/${downloadID(download)}/`)).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'YT-DL Studio', exact: true })).toBeVisible();
});
test.afterEach(async ({ request }) => {
  const data = await (await request.get('/api/downloads/?limit=200')).json();
  await Promise.all(data.downloads.filter(download => !terminal(download.status)).map(download => request.post(`/api/download/${downloadID(download)}/cancel`, { data: {} })));
});

test('inspection, runtime diagnostics, accessible themes, and keyboard dialog navigation', async ({ page }) => {
  await accessible(page);
  await fitsViewport(page);
  await page.getByRole('button', { name: /System Health/ }).click();
  const diagnostics = page.getByRole('region', { name: 'System diagnostics' });
  await expect(diagnostics).toContainText('browser-fixture-1');
  await expect(diagnostics).toContainText('Writable');
  await expect(diagnostics).toContainText('2 downloads');
  await diagnostics.getByText('Server capabilities', { exact: true }).focus();
  await diagnostics.getByText('Server capabilities', { exact: true }).press('Enter');
  await expect(diagnostics).toContainText('result files');
  await accessible(page);
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(237, 243, 255)');
  await expect(diagnostics).toHaveCSS('color', 'rgb(237, 243, 255)');
  await accessible(page);
  await inspect(page);
  const dialog = page.getByRole('dialog', { name: 'Download Configuration' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1,234 views');
  await dialog.getByText('Source details', { exact: true }).click();
  await expect(dialog).toContainText('Uploaded 2026-10-03');
  await expect(dialog).toContainText('deterministic fixture');
  await expect(dialog).toContainText('Intro');
  await accessible(page, '#config-section');
  await fitsViewport(page);
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Video or playlist URL' })).toBeFocused();
});

test('advanced settings honor capabilities, save custom impersonation, and pass session credentials to inspection', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Advanced Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Use .netrc', exact: true })).toBeDisabled();
  await page.getByLabel('Impersonate Client', { exact: true }).fill('chrome-110');
  await page.getByLabel('Socket Timeout', { exact: true }).fill('30');
  await page.getByRole('checkbox', { name: 'Force IPv4', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Force IPv6', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Force IPv4', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Force IPv6', exact: true }).uncheck();
  await page.getByLabel('Password', { exact: true }).fill('browser-fixture-password');
  await page.getByRole('button', { name: 'Save All Settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved');
  expect((await page.evaluate(() => localStorage.getItem('yt-dls-advanced-settings')))).toContain('chrome-110');
  await accessible(page);
  await fitsViewport(page);
  await page.reload();
  await expect(page.getByLabel('Impersonate Client', { exact: true })).toHaveValue('chrome-110');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('browser-fixture-password');
  const persistentValues = await page.evaluate(() => Object.values(localStorage));
  expect(persistentValues.join('')).not.toContain('browser-fixture-password');
  await page.getByRole('link', { name: 'YT-DL Studio', exact: true }).click();
  const inspection = jsonResponse(page, '/api/info');
  await inspect(page);
  const response = await inspection;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().advancedSettings).toMatchObject({ impersonate: 'chrome-110', 'socket-timeout': 30, password: 'browser-fixture-password' });
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('shared options, saved presets, validated commands, live streams, and downloadable results', async ({ page, request }, testInfo) => {
  await inspect(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Custom format selector' }).fill('bestaudio/best');
  await dialog.getByRole('button', { name: 'Audio Only', exact: true }).click();
  await dialog.getByRole('button', { name: 'Post-processing', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Audio format', exact: true }).selectOption('aac');
  await dialog.getByRole('textbox', { name: 'Audio quality', exact: true }).fill('2');
  await dialog.getByText('Overwrite postprocessed files', { exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Overwrite postprocessed files', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Overwrite Files', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Subtitles', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Custom subtitle languages', exact: true }).fill('en.*,ja,-live_chat');
  await dialog.getByRole('combobox', { name: 'Subtitle format', exact: true }).selectOption('lrc');
  await dialog.getByText('Saved output presets', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Podcast AAC');
  await dialog.getByRole('button', { name: 'Save preset', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Audio quality', exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Apply saved preset', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Audio quality', exact: true })).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Refresh command preview', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Generated command' })).toHaveValue(/--audio-format.*aac/);
  await expect(dialog.getByRole('textbox', { name: 'Generated command' })).toHaveValue(/--post-overwrites/);
  await expect(dialog.getByRole('textbox', { name: 'Generated command' })).toHaveValue(/--sub-format.*lrc/);
  await accessible(page, '#config-section');
  let batchPolls = 0;
  page.on('request', incoming => { if (incoming.url().includes('/downloads/status/batch')) batchPolls++; });
  const streamResponse = page.waitForResponse(response => response.url().endsWith('/api/downloads/events'));
  const id = await download(page);
  expect((await streamResponse).status()).toBe(200);
  await expect(page.getByText(/Live progress connected/)).toBeVisible();
  await complete(page, id);
  expect(batchPolls).toBe(0);
  await card(page, id).getByText('Stream details', { exact: true }).click();
  await expect(card(page, id)).toContainText('100%');
  await accessible(page);
  const file = card(page, id).getByRole('link', { name: /\.aac/ });
  await expect(file).toBeVisible();
  const result = await request.get(await file.getAttribute('href'));
  expect(result.status()).toBe(200);
  expect(result.headers()['content-disposition']).toContain('attachment');
  expect(await result.text()).toBe('fixture media!!!');
  await fitsViewport(page);
  await card(page, id).locator('.dl-details').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  if (testInfo.project.name === 'mobile') {
    await page.mouse.wheel(0, 260);
    await expect.poll(async () => {
      const details = await card(page, id).locator('.dl-details').boundingBox();
      const navigation = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
      return Boolean(details && navigation && details.y + details.height < navigation.y);
    }).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('completed-download.jpg'), type: 'jpeg', quality: 85 });
  if (!process.env.CI && ['chromium', 'mobile'].includes(testInfo.project.name)) {
    mkdirSync('.cache', { recursive: true });
    await page.screenshot({ path: `.cache/verification-features-${testInfo.project.name === 'mobile' ? 'mobile' : 'desktop'}.jpg`, type: 'jpeg', quality: 85 });
  }
});

test('retained files require explicit confirmation and remove only the previewed job outputs', async ({ page, request }) => {
  await inspect(page);
  const id = await download(page);
  await complete(page, id);
  await card(page, id).getByRole('button', { name: 'Manage files', exact: true }).click();
  const files = card(page, id).getByRole('region', { name: 'Retained job files' });
  await expect(files).toContainText('fixture.info.json');
  await expect(files.getByRole('button', { name: 'Delete previewed files' })).toBeDisabled();
  await files.getByRole('checkbox', { name: 'Delete these files permanently' }).check();
  const cleaned = jsonResponse(page, `/api/download/${id}/files/cleanup`);
  await files.getByRole('button', { name: 'Delete previewed files' }).click();
  expect((await cleaned).status()).toBe(200);
  await expect(files).toContainText('0 files');
  await expect(card(page, id).getByRole('link', { name: /\.mp4/ })).toHaveCount(0);
  expect((await request.get(`/api/download/${id}/file/0`)).status()).toBe(404);
  await card(page, id).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(card(page, id)).toHaveCount(0);
});

test('cancelling a subprocess and retrying with a replacement URL creates an isolated new job', async ({ page, request }) => {
  await inspect(page, 'https://example.com/slow');
  const id = await download(page);
  await expect(card(page, id).getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await card(page, id).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card(page, id).locator('.dl-status')).toHaveText('cancelled');
  await card(page, id).getByRole('button', { name: 'Retry', exact: true }).click();
  await card(page, id).getByRole('textbox', { name: 'Replacement source URL' }).fill('https://example.com/replacement');
  const retried = jsonResponse(page, `/api/download/${id}/retry`);
  await card(page, id).getByRole('button', { name: 'Start retry', exact: true }).click();
  const response = await retried;
  expect(response.status()).toBe(202);
  const replacement = (await response.json()).id;
  expect(replacement).not.toBe(id);
  await complete(page, replacement);
  expect((await status(request, replacement)).url).toBe('https://example.com/replacement');
  await expect(card(page, id).locator('.dl-status')).toHaveText('cancelled');
});

test('live progress falls back to polling during a broken stream and reconnects', async ({ page }) => {
  await inspect(page, 'https://example.com/slow');
  await page.route('**/api/downloads/events', route => route.abort('failed'));
  const fallback = page.waitForRequest(incoming => incoming.url().includes('/api/downloads/status/batch'));
  const id = await download(page);
  await expect(page.getByText(/Updating with polling/)).toBeVisible();
  await fallback;
  await expect(card(page, id).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  await page.unroute('**/api/downloads/events');
  await expect(page.getByText(/Live progress connected/)).toBeVisible({ timeout: 15000 });
  await card(page, id).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card(page, id).locator('.dl-status')).toHaveText('cancelled');
});

test('playlist selection preserves shared options and per-item filename templates in a server batch', async ({ page, request }) => {
  await inspect(page, 'https://example.com/playlist');
  await page.getByRole('checkbox', { name: 'Select item 2: Playlist item 2' }).uncheck();
  await page.getByRole('button', { name: 'Download 2 selected', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configure 2 playlist items' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Filename', exact: true }).fill('Shared_%(title)s');
  await dialog.getByRole('combobox', { name: 'Container', exact: true }).selectOption('mkv');
  await dialog.getByRole('textbox', { name: 'Custom format selector', exact: true }).fill('bestvideo[height<=720]+bestaudio/best');
  await dialog.getByText('Per-item filename templates (2)', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Filename for item 1', exact: true }).fill('Intro_%(id)s');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Download 2 selected', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Container', exact: true })).toHaveValue('mkv');
  await expect(dialog.getByRole('textbox', { name: 'Custom format selector', exact: true })).toHaveValue('bestvideo[height<=720]+bestaudio/best');
  await dialog.getByText('Per-item filename templates (2)', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Filename for item 1', exact: true })).toHaveValue('Intro_%(id)s');
  const batch = jsonResponse(page, '/api/download/batch');
  await dialog.getByRole('button', { name: 'Start batch', exact: true }).click();
  const response = await batch;
  expect(response.status()).toBe(202);
  const submitted = response.request().postDataJSON();
  expect(submitted.options.outputFormat).toBe('mkv');
  expect(submitted.options.formatCode).toBe('bestvideo[height<=720]+bestaudio/best');
  expect(submitted.entries.map(entry => entry.filename)).toEqual(['Intro_%(id)s', 'Shared_%(title)s']);
  expect(submitted.entries.map(entry => entry.url)).toEqual(['https://example.com/item1', 'https://example.com/item3']);
  const id = (await response.json()).id;
  await complete(page, id);
  const parent = await status(request, id);
  expect(parent.children).toHaveLength(2);
  for (const child of parent.children) await complete(page, child);
  await expect(card(page, id)).toContainText('2/2 completed');
  await expect(page.getByRole('link', { name: /Intro_fixture\.mkv/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Shared_Fixture video\.mkv/ })).toBeVisible();
  await fitsViewport(page);
});

test('concatenation submits the original playlist once with the selected indexes', async ({ page, request }) => {
  await inspect(page, 'https://example.com/playlist');
  await page.getByRole('checkbox', { name: 'Select item 2: Playlist item 2' }).uncheck();
  await page.getByRole('button', { name: 'Download 2 selected', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Playlist workflow', exact: true }).selectOption('always');
  await dialog.getByRole('button', { name: 'Refresh command preview', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Generated command' })).toHaveValue(/--playlist-items.*1,3/);
  await expect(dialog.getByRole('textbox', { name: 'Generated command' })).toHaveValue(/--concat-playlist.*always/);
  const admission = jsonResponse(page, '/api/download/');
  await dialog.getByRole('button', { name: 'Concatenate selected items', exact: true }).click();
  const response = await admission;
  expect(response.status()).toBe(202);
  const submitted = response.request().postDataJSON();
  expect(submitted.url).toBe('https://example.com/playlist');
  expect(submitted.playlistItems).toEqual([1, 3]);
  expect(submitted.concatPlaylist).toBe('always');
  const id = (await response.json()).id;
  await complete(page, id);
  await expect(card(page, id).getByRole('link', { name: /joined-playlist\.mp4/ })).toBeVisible();
  const log = await (await request.get(`/api/download/${id}/log`)).json();
  expect(log.log.join('\n')).toContain('--playlist-items');
  expect(log.log.join('\n')).toContain('1,3');
  const records = await (await request.get('/api/downloads/')).json();
  expect(records.downloads).toHaveLength(1);
});
