import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:54327';
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/_test/reset`);
});
async function login(
  page: Page,
  email = 'owner@example.com',
  path = '/#/indstillinger',
) {
  await page.goto(path);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Medarbejdere og rettigheder' }),
  ).toBeVisible();
}
const office = (page: Page) =>
  page.getByRole('article', { name: 'Backoffice', exact: true });
const self = (page: Page) =>
  page.getByRole('article', { name: 'Ejer uden arbejdsrolle', exact: true });

test('owner without a work role changes the fixed dropdown independently of ownership and persists it', async ({
  page,
  request,
}) => {
  await login(page);
  await office(page)
    .getByRole('button', { name: 'Redigér rettigheder' })
    .click();
  const role = office(page).getByRole('combobox', { name: 'Arbejdsrolle' });
  await expect(role.locator('option')).toHaveText([
    'Ingen arbejdsrolle',
    'Backoffice',
    'Faglig',
  ]);
  await role.selectOption('technical');
  await expect(
    office(page).getByRole('checkbox', { name: /Ejerrettigheder/ }),
  ).not.toBeChecked();
  await office(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(office(page).getByRole('status')).toHaveText(
    'Rettighederne er gemt.',
  );
  const events = await (await request.get(`${api}/_test/staff-access`)).json();
  expect(events).toHaveLength(1);
  expect(events[0].after_access).toEqual({
    role: 'technical',
    isOwner: false,
    active: true,
  });
  await page.reload();
  await office(page)
    .getByRole('button', { name: 'Redigér rettigheder' })
    .click();
  await expect(
    office(page).getByRole('combobox', { name: 'Arbejdsrolle' }),
  ).toHaveValue('technical');
  await office(page)
    .getByRole('combobox', { name: 'Arbejdsrolle' })
    .selectOption('');
  await office(page)
    .getByRole('checkbox', { name: /Ejerrettigheder/ })
    .check();
  await office(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(
    office(page).getByText('Ejer · Ingen arbejdsrolle', { exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.staff-settings').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('ordinary backoffice sees its own access but cannot edit or list other employees', async ({
  page,
}) => {
  await login(page, 'staff@example.com');
  await expect(
    page.getByText(
      'Kontakt en ejer, hvis din arbejdsrolle eller dine rettigheder skal ændres.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Redigér rettigheder' }),
  ).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
});
test('owner-only accounts do not load customer data even through old notification links', async ({
  page,
}) => {
  const customerRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/rest\/v1\/(leads|lead_events|appointments|lead_messages)/.test(
        request.url(),
      )
    )
      customerRequests.push(request.url());
  });
  await login(page);
  await page.evaluate(() => {
    location.hash = '#/leads/2230f009-1f39-4ab0-bfa8-bb03baf36bdc';
  });
  await expect(
    page.getByRole('heading', { name: 'Ingen arbejdsrolle', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ws-inbox-dot')).toHaveCount(0);
  expect(customerRequests).toEqual([]);
});
test('last owner protection preserves the form choices and shows a useful error', async ({
  page,
  request,
}) => {
  await login(page);
  await self(page).getByRole('button', { name: 'Redigér rettigheder' }).click();
  await self(page)
    .getByRole('checkbox', { name: /Ejerrettigheder/ })
    .uncheck();
  await self(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(self(page).getByRole('alert')).toContainText(
    'Der skal være mindst én aktiv ejer',
  );
  await expect(
    self(page).getByRole('checkbox', { name: /Ejerrettigheder/ }),
  ).not.toBeChecked();
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(0);
});
test('lost response retries once with the same command and one audit event', async ({
  page,
  request,
}) => {
  await login(page);
  const commands: unknown[] = [];
  await page.route('**/rest/v1/rpc/set_staff_access', async (route) => {
    commands.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (commands.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  });
  await office(page)
    .getByRole('button', { name: 'Redigér rettigheder' })
    .click();
  await office(page)
    .getByRole('checkbox', { name: /Ejerrettigheder/ })
    .check();
  await office(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(office(page).getByRole('alert')).toBeVisible();
  await office(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(office(page).getByRole('status')).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(1);
});
test('concurrent edits require reviewing fresh rights and cannot overwrite another owner', async ({
  page,
  request,
}) => {
  await login(page);
  await office(page)
    .getByRole('button', { name: 'Redigér rettigheder' })
    .click();
  await office(page)
    .getByRole('checkbox', { name: /Ejerrettigheder/ })
    .check();
  await request.post(`${api}/_test/staff-access-conflict`);
  await office(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(office(page).getByRole('alert')).toContainText(
    'ændret af en anden',
  );
  await office(page)
    .getByRole('button', { name: 'Hent seneste rettigheder' })
    .click();
  await office(page)
    .getByRole('button', { name: 'Redigér rettigheder' })
    .click();
  await expect(
    office(page).getByRole('combobox', { name: 'Arbejdsrolle' }),
  ).toHaveValue('technical');
  await expect(
    office(page).getByRole('checkbox', { name: /Ejerrettigheder/ }),
  ).not.toBeChecked();
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(1);
});
test('removing own work role clears previously loaded customer data immediately', async ({
  page,
}) => {
  await login(page);
  await self(page).getByRole('button', { name: 'Redigér rettigheder' }).click();
  await self(page)
    .getByRole('combobox', { name: 'Arbejdsrolle' })
    .selectOption('backoffice');
  await self(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 1 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/indbakke';
  });
  await expect(
    page.getByRole('heading', { name: 'Anna Jensen', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/indstillinger';
  });
  await self(page).getByRole('button', { name: 'Redigér rettigheder' }).click();
  await self(page)
    .getByRole('combobox', { name: 'Arbejdsrolle' })
    .selectOption('');
  await self(page).getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – kræver en arbejdsrolle',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/indbakke';
  });
  await expect(
    page.getByRole('heading', { name: 'Ingen arbejdsrolle', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});
