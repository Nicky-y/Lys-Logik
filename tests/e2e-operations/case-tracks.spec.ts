import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = 'http://127.0.0.1:54327/_test';
const navigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Sagsoversigter' });
const columns = (page: Page) => page.locator('.case-board > .column h3');
const planning = ['Afklaring', 'Klar til aftale', 'Aftaler'];
const settlement = ['Udført', 'Faktureret', 'Betalt'];

async function login(page: Page, path = '/#/sager') {
  await page.goto(path);
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(navigation(page)).toBeVisible();
  await expect(page.locator('.lead-card').first()).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture}/reset`)).ok()).toBe(true);
  expect((await request.post(`${fixture}/case-tracks`)).ok()).toBe(true);
});

test('switching tracks shows three stages, resets local filters and preserves all saved case state', async ({
  page,
  request,
}) => {
  const before = await (await request.get(`${fixture}/case-tracks`)).json();
  const historyBefore = await (await request.get(`${fixture}/state`)).json();
  await login(page);
  await expect(columns(page)).toHaveText(planning);
  await expect(page.locator('.lead-card h4')).toHaveText([
    'Afklaring test',
    'Klar test',
    'Aftale test',
  ]);
  await expect(
    navigation(page).getByRole('link', { name: 'Afklaring og aftaler' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: /^Klar til aftale/ }).click();
  await expect(columns(page)).toHaveText(['Klar til aftale']);
  await page
    .getByRole('searchbox', { name: 'Søg i sager' })
    .fill('intet match');
  await expect(page.locator('.lead-card')).toHaveCount(0);

  const followup = navigation(page).getByRole('link', {
    name: 'Udført og betaling',
  });
  await followup.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/sager\/opfoelgning$/);
  await expect(followup).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(columns(page)).toHaveText(settlement);
  await expect(page.locator('.lead-card h4')).toHaveText([
    'Udført test',
    'Faktureret test',
    'Betalt test',
  ]);
  await page.getByRole('button', { name: /^Faktureret/ }).click();
  await expect(columns(page)).toHaveText(['Faktureret']);
  await expect(page.locator('.lead-card h4')).toHaveText(['Faktureret test']);

  await navigation(page)
    .getByRole('link', { name: 'Arkiv', exact: true })
    .click();
  await expect(page.locator('.lead-card h4')).toHaveText(['Arkiv test']);
  await page.goBack();
  await expect(columns(page)).toHaveText(settlement);
  await page.reload();
  await expect(followup).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.lead-card')).toHaveCount(3);
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 1 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
  expect(await (await request.get(`${fixture}/case-tracks`)).json()).toEqual(
    before,
  );
  expect(await (await request.get(`${fixture}/state`)).json()).toEqual(
    historyBefore,
  );

  expect(
    (await new AxeBuilder({ page }).include('.case-tabs').analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('follow-up queries are paginated independently of more than 100 planning cases', async ({
  page,
  request,
}) => {
  expect((await request.post(`${fixture}/inbox-pages`)).ok()).toBe(true);
  await login(page);
  await expect(page.locator('.lead-card')).toHaveCount(100);
  await expect(
    page.getByRole('button', { name: 'Indlæs flere sager' }),
  ).toBeVisible();
  await navigation(page)
    .getByRole('link', { name: 'Udført og betaling' })
    .click();
  await expect(page.locator('.lead-card h4')).toHaveText([
    'Udført test',
    'Faktureret test',
    'Betalt test',
  ]);
  await expect(
    page.getByRole('button', { name: 'Indlæs flere sager' }),
  ).toHaveCount(0);
  await page
    .locator('.lead-card')
    .filter({ hasText: 'Faktureret test' })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Faktureret test');
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(page).toHaveURL(/#\/sager\/opfoelgning$/);
  await expect(columns(page)).toHaveText(settlement);
  await navigation(page)
    .getByRole('link', { name: 'Afklaring og aftaler' })
    .click();
  await expect(page.locator('.lead-card')).toHaveCount(100);
  await page.getByRole('button', { name: 'Indlæs flere sager' }).click();
  await expect(page.locator('.lead-card')).toHaveCount(104);
});

test('older notification links to a completed case resolve to follow-up and close in that track', async ({
  page,
  request,
}) => {
  const rows: { id: string; status: string }[] = await (
    await request.get(`${fixture}/case-tracks`)
  ).json();
  const completed = rows.find((row) => row.status === 'completed')!;
  await login(page);
  for (const prefix of ['#/leads/', '#/sager/leads/', '#/indbakke/leads/']) {
    await page.goto(`/${prefix}${completed.id}`);
    await expect(page).toHaveURL(
      new RegExp(`#/sager/opfoelgning/leads/${completed.id}$`),
    );
    await expect(page.getByRole('dialog')).toContainText('Udført test');
    await page.getByRole('button', { name: 'Luk sag' }).click();
    await expect(page).toHaveURL(/#\/sager\/opfoelgning$/);
    await expect(columns(page)).toHaveText(settlement);
  }
});
