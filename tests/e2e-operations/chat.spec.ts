import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const api = 'http://127.0.0.1:54327';
const picture = readFileSync('operations/public/icons/app-v12-192.png');
const messageId = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const fileId = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const chat = (page: Page) =>
  page.getByRole('dialog', { name: 'Samtale med kunden', exact: true });
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await page.locator('.lead-card').filter({ hasText: 'Anna Jensen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Anna Jensen', exact: true, level: 2 }),
  ).toBeVisible();
}
function incoming(leadId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: messageId,
    lead_id: leadId,
    direction: 'inbound',
    sender: 'anna@example.com',
    recipient: 'sager@example.com',
    subject: 'Billeder af opgaven',
    body: 'Her er billederne af lampen.',
    sender_matches_customer: true,
    state: 'received',
    created_at: '2026-09-15T09:00:00Z',
    updated_at: '2026-09-15T09:00:00Z',
    created_by: null,
    attachments: [
      {
        id: fileId,
        filename: 'installation.png',
        content_type: 'image/png',
        size: picture.length,
      },
    ],
    ...overrides,
  };
}
test.beforeEach(async ({ request }) => {
  await request.post(api + '/_test/reset');
});

test('chat opens on demand, preserves the draft across tabs and minimizing, and Escape restores focus without closing the case', async ({
  page,
}) => {
  let queries = 0;
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/lead_messages?')) queries++;
  });
  await login(page);
  expect(queries).toBe(0);
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  await expect(chat(page)).toBeVisible();
  await expect(
    chat(page).getByText('Her samler vi jeres beskeder om opgaven.'),
  ).toBeVisible();
  expect(queries).toBe(1);
  await page.getByLabel('Besked til kunden').fill('En kladde kun til Anna.');
  await chat(page)
    .getByRole('button', { name: 'Billeder', exact: true })
    .click();
  await expect(
    chat(page).getByText('Ingen billeder i de hentede beskeder endnu.'),
  ).toBeVisible();
  await chat(page)
    .getByRole('button', { name: 'Samtale', exact: true })
    .click();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue(
    'En kladde kun til Anna.',
  );
  expect(
    (await new AxeBuilder({ page }).include('#customer-chat').analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(chat(page)).not.toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Anna Jensen', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Åbn kundesamtale' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue(
    'En kladde kun til Anna.',
  );
  await page.clock.install();
  await page.getByRole('button', { name: 'Minimer kundesamtale' }).click();
  const before = queries;
  await page.clock.fastForward(45000);
  expect(queries).toBe(before);
});

test('photo shortcut loads protected previews without a file click, retains sender warnings, and closes nested viewers in order', async ({
  page,
}) => {
  let downloads = 0;
  await page.route('**/rest/v1/lead_messages?*', async (route) => {
    const leadId = new URL(route.request().url()).searchParams
      .get('lead_id')!
      .slice(3);
    await route.fulfill({
      json: [incoming(leadId, { sender_matches_customer: false })],
    });
  });
  await page.route('**/functions/v1/customer-attachment', async (route) => {
    downloads++;
    expect(route.request().postDataJSON()).toEqual({
      messageId,
      attachmentId: fileId,
    });
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({
      contentType: 'application/octet-stream',
      body: picture,
    });
  });
  await login(page);
  expect(downloads).toBe(0);
  await page.getByRole('button', { name: 'Se kundens billeder' }).click();
  await expect(
    chat(page).getByRole('button', { name: 'Billeder', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const preview = page.getByRole('button', {
    name: 'Vis billede: installation.png',
  });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(192);
  expect(downloads).toBe(1);
  await expect(chat(page).getByText(/Afsenderadressen afviger/)).toBeVisible();
  await preview.click();
  await page.keyboard.press('Escape');
  await expect(chat(page)).toBeVisible();
  await expect(preview).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Se kundens billeder' }),
  ).toBeFocused();
});

test('case navigation never carries another customers draft or late image response into the new case', async ({
  page,
  request,
}) => {
  await request.post(api + '/_test/building-automation');
  let attachmentStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    attachmentStarted = resolve;
  });
  let finishAttachment!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    finishAttachment = resolve;
  });
  await page.addInitScript(() => {
    const original = URL.createObjectURL;
    (window as any).chatCreatedUrls = [];
    URL.createObjectURL = (blob) => {
      const url = original(blob);
      (window as any).chatCreatedUrls.push(url);
      return url;
    };
  });
  let annaId = '';
  await page.route('**/rest/v1/lead_messages?*', async (route) => {
    const leadId = new URL(route.request().url()).searchParams
      .get('lead_id')!
      .slice(3);
    await route.fulfill({ json: leadId === annaId ? [incoming(leadId)] : [] });
  });
  await page.route('**/functions/v1/customer-attachment', async (route) => {
    attachmentStarted();
    await waitForRelease;
    await route.fulfill({
      contentType: 'application/octet-stream',
      body: picture,
    });
  });
  await login(page);
  annaId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  await page.getByLabel('Besked til kunden').fill('Privat kladde til Anna.');
  await started;
  await page.getByRole('button', { name: 'Minimer kundesamtale' }).click();
  await page.getByRole('button', { name: 'Luk sag', exact: true }).click();
  const other = page
    .locator('.lead-card')
    .filter({ hasNotText: 'Anna Jensen' })
    .first();
  await other.click();
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue('');
  await expect(
    chat(page).getByText('Her er billederne af lampen.'),
  ).toHaveCount(0);
  const completed = page.waitForResponse('**/functions/v1/customer-attachment');
  finishAttachment();
  await completed;
  await expect(chat(page).locator('.attachment-preview')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).chatCreatedUrls)).toEqual(
    [],
  );
});

test('offline drafting cannot send and works again after reconnection', async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  await page.getByLabel('Besked til kunden').fill('Vi ringer i morgen.');
  await expect(
    page.getByRole('button', { name: 'Send e-mail', exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await expect(chat(page).getByText(/Du er offline/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send e-mail', exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(
    page.getByRole('button', { name: 'Send e-mail', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue(
    'Vi ringer i morgen.',
  );
});

test('gallery can reach photos in older messages and overlapping pages do not duplicate them', async ({
  page,
}) => {
  const offsets: number[] = [];
  await page.route('**/rest/v1/lead_messages?*', async (route) => {
    const url = new URL(route.request().url());
    const leadId = url.searchParams.get('lead_id')!.slice(3);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    offsets.push(offset);
    const recent = Array.from({ length: 50 }, (_, index) =>
      incoming(leadId, {
        id: `c6d771c8-1242-4c22-8ab5-${String(index + 1).padStart(12, '0')}`,
        attachments: [],
      }),
    );
    await route.fulfill({
      json:
        offset === 0
          ? recent
          : [
              recent[49],
              incoming(leadId, { created_at: '2026-09-10T10:00:00Z' }),
            ],
    });
  });
  await page.route('**/functions/v1/customer-attachment', (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: picture }),
  );
  await login(page);
  await page.getByRole('button', { name: 'Se kundens billeder' }).click();
  await expect(
    chat(page).getByText('Ingen billeder i de hentede beskeder endnu.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Find billeder i ældre beskeder' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Vis billede: installation.png' }),
  ).toBeVisible();
  expect(offsets).toEqual([0, 50]);
  await expect(chat(page).locator('.attachment-preview')).toHaveCount(1);
  await chat(page)
    .getByRole('button', { name: 'Samtale', exact: true })
    .click();
  await expect(chat(page).locator('.message')).toHaveCount(51);
});

test('small portrait and landscape layouts keep the chat and send action within the viewport', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Åbn kundesamtale' }).click();
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    const box = await chat(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    await page.getByLabel('Besked til kunden').fill('Kort besked.');
    const send = page.getByRole('button', { name: 'Send e-mail', exact: true });
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport();
    expect(
      await chat(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
});
