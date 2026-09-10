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

async function fillEnquiry(page: Page) {
  await page.getByLabel('Dit navn').fill('Anna Jensen');
  await page.getByLabel('Din e-mail').fill('anna@example.com');
  await page.getByLabel('Telefon (valgfrit)').fill('12 34 56 78');
  await page.getByLabel('Postnummer').fill('2800');
  await page.getByLabel('Hvad drejer det sig om?').selectOption('belysning');
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Vi vil gerne have bedre lys over vores spisebord.');
  await page.getByLabel('Jeg har læst om pilotprojektet').check();
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
