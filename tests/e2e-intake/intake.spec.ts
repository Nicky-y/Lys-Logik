import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:54325/_test/reset');
  // Only the third-party widget is replaced; POST, application and SQL are real local code.
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js*',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {
      render(element, options) { this.options = options; options.callback('local-test-proof'); return 'test-widget'; },
      reset() { this.options.callback('local-test-proof'); }
    };`,
      }),
  );
  await page.goto('/#kontakt');
});

async function fillEnquiry(
  page: Page,
  service: string | null = 'lampeopsaetning',
) {
  await page.getByLabel('Dit navn').fill('Anna Jensen');
  await page.getByLabel('Din e-mail').fill('anna@example.com');
  await page.getByLabel('Telefon (valgfrit)').fill('12 34 56 78');
  await page.getByLabel('Postnummer').fill('2800');
  if (service)
    await page.getByLabel('Hvad drejer det sig om?').selectOption(service);
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Vi vil gerne have bedre lys over vores spisebord.');
  await page
    .getByLabel('Jeg er indforstået med, at henvendelsen er uforpligtende')
    .check();
}

test('sends form through the real local endpoint and stores one enquiry with its history', async ({
  page,
  request,
}) => {
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Vi har modtaget din henvendelse.',
  );
  await expect(page.locator('#lead-reference')).toHaveText(/[0-9a-f-]{36}/);
  expect(
    await (await request.get('http://127.0.0.1:54325/_test/state')).json(),
  ).toEqual({ leads: 1, newLeads: 1, events: 1, deliveries: 2 });
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});

test('ordinary form does not infer pilot interest from the offer link or a later enquiry', async ({
  page,
  request,
}) => {
  await expect(page.locator('[name="pilotRequested"]')).toHaveCount(0);
  await fillEnquiry(page);
  const description = await page.locator('#description').inputValue();
  await page.locator('#pilot .pilot-action').click();
  await expect(page).toHaveURL(/#formular$/);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  await page.getByRole('button', { name: 'Ny henvendelse' }).click();
  await expect(page.locator('[name="pilotRequested"]')).toHaveCount(0);
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  const rows = await (
    await request.get('http://127.0.0.1:54325/_test/enquiries')
  ).json();
  expect(rows).toHaveLength(2);
  expect(
    rows.map((row: { pilot_requested: boolean | null }) => row.pilot_requested),
  ).toEqual([null, null]);
  for (const row of rows) {
    expect(row.description).toBe(description);
    expect(row.original_submission).toMatchObject({
      description,
    });
    expect(row.original_submission).not.toHaveProperty('pilotRequested');
  }
});

test('building automation service page submits its own category to the real endpoint and database', async ({
  page,
  request,
}) => {
  await page.goto('/services/bygningsautomatik/');
  await page
    .locator('main')
    .getByRole('link', { name: 'Beskriv din opgave', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
    'bygningsautomatik',
  );
  await fillEnquiry(page, null);
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Ventilationen kører om natten.');
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  const reference = await page.locator('#lead-reference').textContent();
  const enquiries = await (
    await request.get('http://127.0.0.1:54325/_test/enquiries')
  ).json();
  expect(enquiries).toHaveLength(1);
  expect(enquiries[0]).toMatchObject({
    reference,
    service: 'bygningsautomatik',
    original_submission: {
      service: 'bygningsautomatik',
      description: 'Ventilationen kører om natten.',
    },
  });
  expect(
    await (await request.get('http://127.0.0.1:54325/_test/state')).json(),
  ).toEqual({ leads: 1, newLeads: 1, events: 1, deliveries: 2 });
});

test('lost response preserves fields and retry confirms the same database enquiry', async ({
  page,
  request,
}) => {
  let first = true;
  const keys: string[] = [];
  await page.route('http://127.0.0.1:54325/create-lead', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'kunne ikke bekræfte modtagelsen',
  );
  await expect(page.getByLabel('Din e-mail')).toHaveValue('anna@example.com');
  await expect(page.locator('#form-success')).toBeHidden();
  await expect(page.getByLabel('Fortæl lidt om din idé')).toHaveValue(
    'Vi vil gerne have bedre lys over vores spisebord.',
  );
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(
    await (await request.get('http://127.0.0.1:54325/_test/state')).json(),
  ).toEqual({ leads: 1, newLeads: 1, events: 1, deliveries: 2 });
});

test('two confirmed enquiries from the same customer are separate cases', async ({
  page,
  request,
}) => {
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  await page.getByRole('button', { name: 'Ny henvendelse' }).click();
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  expect(
    await (await request.get('http://127.0.0.1:54325/_test/state')).json(),
  ).toEqual({ leads: 2, newLeads: 2, events: 2, deliveries: 4 });
});

test('live form remains accessible and displays field errors', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.getByLabel('Dit navn')).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});

test('a blocked security script preserves the form and cannot report success', async ({
  page,
  request,
}) => {
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js*',
    (route) => route.abort(),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'Sikkerhedskontrollen kunne ikke indlæses',
  );
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Send din henvendelse' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Vent på sikkerhedskontrollen',
  );
  await expect(page.getByLabel('Din e-mail')).toHaveValue('anna@example.com');
  await expect(page.locator('#form-success')).toBeHidden();
  expect(
    await (await request.get('http://127.0.0.1:54325/_test/state')).json(),
  ).toEqual({ leads: 0, newLeads: 0, events: 0, deliveries: 0 });
});

test('live privacy information names the actual contact and explains submitted data', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Privatliv', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Supabase');
  await expect(dialog).toContainText('Turnstile');
  await expect(
    dialog.getByRole('link', { name: 'kontakt@lysoglogik.dk' }),
  ).toHaveAttribute('href', 'mailto:kontakt@lysoglogik.dk');
  await expect(dialog).not.toContainText('lokal prøvevisning');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
