import { test, expect } from '@playwright/test';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
});
test('staff can compose a photo request and see its queued delivery state on the case', async ({
  page,
}) => {
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
  await expect(
    page.getByRole('heading', { name: 'Samtale med kunden' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Bed om billeder', exact: true })
    .click();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue(
    /Du skal ikke åbne eller skille installationer ad/,
  );
  await page.getByRole('button', { name: 'Send e-mail', exact: true }).click();
  await expect(
    page.getByText('Afventer afsendelse', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Besked til kunden')).toHaveValue('');
  await page.reload();
  await expect(
    page.getByText('Afventer afsendelse', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.message')).toHaveCount(1);
});
test('a failed send preserves the draft and a retry reuses the same message id', async ({
  page,
}) => {
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
  await page
    .getByLabel('Besked til kunden')
    .fill('Tak for billederne. Vi vender tilbage i morgen.');
  const ids: string[] = [];
  let first = true;
  await page.route('**/rest/v1/rpc/queue_customer_message', async (route) => {
    ids.push(route.request().postDataJSON().p_id);
    if (first) {
      first = false;
      await route.fetch();
      await route.fulfill({
        status: 503,
        json: { message: 'lost acknowledgement' },
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Send e-mail', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Teksten er bevaret');
  await expect(page.getByLabel('Besked til kunden')).toHaveValue(
    'Tak for billederne. Vi vender tilbage i morgen.',
  );
  await page.getByRole('button', { name: 'Send e-mail', exact: true }).click();
  await expect(
    page.getByText('Afventer afsendelse', { exact: true }),
  ).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.locator('.message')).toHaveCount(1);
});
