import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const messageId = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const attachmentId = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const picture = readFileSync('operations/public/icons/app-v12-192.png');

async function openCase(page: Page) {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await page
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', { name: 'Anna Jensen', exact: true }),
    })
    .click();
}

test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    (window as any).revokedImageUrls = [];
    URL.revokeObjectURL = (url) => {
      (window as any).revokedImageUrls.push(url);
      original(url);
    };
  });
  await page.route('**/rest/v1/lead_messages?*', async (route) => {
    const leadId = new URL(route.request().url()).searchParams
      .get('lead_id')!
      .slice(3);
    await route.fulfill({
      json: [
        {
          id: messageId,
          lead_id: leadId,
          direction: 'inbound',
          sender: 'anna@example.com',
          recipient: 'sager@mail.example.com',
          subject: 'Billede af opgaven',
          body: 'Her er billedet.',
          attachments: [
            {
              id: attachmentId,
              filename: 'installation.png',
              size: picture.length,
              content_type: 'image/png',
            },
          ],
          sender_matches_customer: true,
          state: 'received',
          created_at: '2026-09-11T10:00:00Z',
          updated_at: '2026-09-11T10:00:00Z',
          created_by: null,
        },
      ],
    });
  });
});

test('private photo preview works under production CSP, zooms, downloads without a second request and releases its URL on close', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/functions/v1/customer-attachment', async (route) => {
    requests++;
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().postDataJSON()).toEqual({ messageId, attachmentId });
    await route.fulfill({
      contentType: 'application/octet-stream',
      body: picture,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
  await openCase(page);
  const preview = page.getByRole('button', {
    name: 'Vis billede: installation.png',
  });
  await page.locator('.attachment-card').scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(192);
  const url = await preview.locator('img').getAttribute('src');
  await preview.click();
  const viewer = page.getByRole('dialog', {
    name: 'Billede: installation.png',
    exact: true,
  });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Forstør', exact: true }).click();
  await expect(viewer.locator('.image-viewport')).toHaveClass(/zoomed/);
  await viewer
    .getByRole('button', { name: 'Luk billede', exact: true })
    .click();
  await expect(viewer).not.toBeVisible();
  await expect(preview).toBeFocused();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Hent fil: installation.png' })
    .click();
  expect((await download).suggestedFilename()).toBe('installation.png');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Luk sag', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).revokedImageUrls))
    .toContain(url);
});

test('a failed private preview can be retried without losing the case', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/functions/v1/customer-attachment', async (route) => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, body: '' });
    else
      await route.fulfill({
        contentType: 'application/octet-stream',
        body: picture,
      });
  });
  await openCase(page);
  await page.locator('.attachment-card').scrollIntoViewIfNeeded();
  await expect(page.getByRole('alert')).toContainText(
    'Billedet kunne ikke hentes',
  );
  await page.getByRole('button', { name: 'Prøv igen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Vis billede: installation.png' }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test('a case deep link survives sign-in', async ({ page }) => {
  await openCase(page);
  const target = page.url();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Log ind', exact: true }),
  ).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Anna Jensen', exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(target);
});
