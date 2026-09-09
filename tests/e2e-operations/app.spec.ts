import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
});
async function login(page: Page, email = 'staff@example.com') {
  // Local HTTP on a phone exposes getRandomValues, but not randomUUID.
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  );
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
}
async function openLead(page: Page) {
  await page
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', { name: 'Anna Jensen', exact: true }),
    })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test('backoffice logs in, calls from the customer card and saves a status, waiting marker and note', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Jeres opgaver. Ét overblik.' }),
  ).toBeVisible();
  await openLead(page);
  await expect(
    page.getByRole('link', { name: 'Ring til kunden' }),
  ).toHaveAttribute('href', 'tel:+4512345678');
  await expect(
    page.getByRole('button', { name: 'Gem faglig vurdering' }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('clarifying');
  await page.getByRole('button', { name: 'Gem status' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  await page.getByLabel('Hvem afventer vi?').selectOption('customer');
  await page.getByRole('button', { name: 'Gem afventer' }).click();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
  await page
    .getByLabel('Intern note', { exact: true })
    .fill('Kunden sender billeder af loftudtaget.');
  await page.getByRole('button', { name: 'Gem note' }).click();
  await expect(
    page.getByText('Kunden sender billeder af loftudtaget.', { exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 4 });
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await page.getByRole('button', { name: 'Log ud', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Velkommen tilbage' }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});
test('technical review must be saved before the lead can be qualified', async ({
  page,
}) => {
  await login(page, 'technical@example.com');
  await openLead(page);
  await expect(
    page
      .getByRole('combobox', { name: 'Status', exact: true })
      .locator('option[value="qualified"]'),
  ).toHaveCount(0);
  await page
    .getByLabel('Faglig begrundelse')
    .fill('Installationen er gennemgået og opgaven er egnet.');
  await page.getByRole('button', { name: 'Gem faglig vurdering' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('qualified');
  await page.getByRole('button', { name: 'Gem status' }).click();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Faglig vurdering: godkendt', { exact: true }),
  ).toBeVisible();
});
test('a lost save response preserves the note and retry does not append it twice', async ({
  page,
  request,
}) => {
  await login(page);
  await openLead(page);
  let dropped = false;
  await page.route('**/rest/v1/rpc/add_lead_note', async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByLabel('Intern note', { exact: true })
    .fill('Denne note må kun gemmes én gang.');
  await page.getByRole('button', { name: 'Gem note' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Intern note', { exact: true })).toHaveValue(
    'Denne note må kun gemmes én gang.',
  );
  await page.getByRole('button', { name: 'Gem note' }).click();
  await expect(
    page.getByText('Denne note må kun gemmes én gang.', { exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 2 });
});
test('a stale edit requires the employee to review the current version', async ({
  page,
  request,
}) => {
  await login(page);
  await openLead(page);
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('clarifying');
  await request.post('http://127.0.0.1:54327/_test/advance');
  await page.getByRole('button', { name: 'Gem status' }).click();
  await expect(
    page.getByText('Der er nyt på sagen.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gem status' })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Arbejd videre med den viste version' })
    .click();
  await page.getByRole('button', { name: 'Gem status' }).click();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
});
test('a login without staff membership shows no customer data', async ({
  page,
}) => {
  await login(page, 'outsider@example.com');
  await expect(
    page.getByRole('heading', { name: 'Din konto afventer adgang' }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});
test('pipeline and case view have no automated accessibility violations or page overflow', async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Jeres opgaver. Ét overblik.' }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await openLead(page);
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await page
    .getByRole('searchbox', { name: 'Søg i sager' })
    .fill('Intet match');
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});
