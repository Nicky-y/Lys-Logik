import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
});
async function login(page: Page, path = '/#/indbakke') {
  await page.goto(path);
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 1 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
}
async function navigateCases(page: Page) {
  const menu = page.getByRole('button', { name: 'Åbn menu' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Appens hovedmenu' })
    .getByRole('link', { name: 'Sager', exact: true })
    .click();
}
const customer = (page: Page) =>
  page
    .locator('.lead-card')
    .filter({
      has: page.getByRole('heading', { name: 'Anna Jensen', exact: true }),
    });

test('first-contact handoff is explicit, persists, preserves history and removes the inbox indicator', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.locator('.ws-inbox-dot')).toBeVisible();
  await navigateCases(page);
  await expect(customer(page)).toHaveCount(0);
  await page.getByRole('link', { name: /^Indbakke –/ }).click();
  await customer(page).click();
  await expect(page).toHaveURL(/#\/indbakke\/leads\//);
  await expect(
    page.getByRole('link', { name: 'Ring til kunden' }),
  ).toHaveAttribute('href', 'tel:+4512345678');
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 1 });
  await page
    .getByLabel('Intern note', { exact: true })
    .fill('Ringet første gang. Kunden sender billeder.');
  await page.getByRole('button', { name: 'Gem note' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(customer(page)).toBeVisible();
  await expect(page.locator('.ws-inbox-dot')).toBeVisible();
  await customer(page).click();
  await page
    .getByRole('button', { name: 'Flyt til Sager', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/sager\/leads\//);
  await expect(
    page.getByText('Flyttet fra Indbakke til Sager', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Ringet første gang. Kunden sender billeder.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Flyt til Sager', exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('combobox', { name: 'Status', exact: true })
      .locator('option[value="new"]'),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(customer(page)).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 0 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.ws-inbox-dot')).toHaveCount(0);
  await page.getByRole('link', { name: /^Indbakke –/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Indbakken er tom', exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 3 });
});

test('notification links resolve both new and already-transferred enquiries from saved state', async ({
  page,
}) => {
  await login(page);
  const id = (await customer(page).getAttribute('href'))!.split('/').at(-1);
  await page.goto(`/#/leads/${id}`);
  await expect(page).toHaveURL(new RegExp(`#/indbakke/leads/${id}$`));
  await page
    .getByRole('button', { name: 'Flyt til Sager', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/sager/leads/${id}$`));
  for (const path of [`/#/leads/${id}`, `/#/indbakke/leads/${id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`#/sager/leads/${id}$`));
    await expect(page.getByRole('dialog')).toContainText('Anna Jensen');
    await page.getByRole('button', { name: 'Luk sag' }).click();
    await expect(page).toHaveURL(/#\/sager$/);
  }
});

test('a lost handoff response can be retried with the same command and only one history event', async ({
  page,
  request,
}) => {
  await login(page);
  await customer(page).click();
  const commands: string[] = [];
  await page.route('**/rest/v1/rpc/change_lead_status', async (route) => {
    commands.push(route.request().postDataJSON().p_command_id);
    if (commands.length === 1) {
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Flyt til Sager', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Handlingen kunne ikke bekræftes',
  );
  await page
    .getByRole('button', { name: 'Flyt til Sager', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/sager\/leads\//);
  expect(commands).toHaveLength(2);
  expect(commands[0]).toBe(commands[1]);
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 2 });
});

test('another employee can move a case first without creating a second handoff', async ({
  page,
  request,
}) => {
  await login(page);
  await customer(page).click();
  await request.post('http://127.0.0.1:54327/_test/qualify');
  await page
    .getByRole('button', { name: 'Flyt til Sager', exact: true })
    .click();
  await expect(
    page.getByText('Der er nyt på sagen.', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/sager\/leads\//);
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 0 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await (await request.get('http://127.0.0.1:54327/_test/state')).json(),
  ).toEqual({ leads: 1, events: 3 });
});

test('inbox filtering and indicator remain correct when the enquiry is older than 100 ongoing cases', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:54327/_test/inbox-pages');
  await login(page, '/#/sager');
  await expect(page.locator('.lead-card')).toHaveCount(100);
  await expect(customer(page)).toHaveCount(0);
  await expect(page.locator('.ws-inbox-dot')).toBeVisible();
  await page.getByRole('link', { name: /^Indbakke –/ }).click();
  await expect(customer(page)).toBeVisible();
  await expect(page.locator('.lead-card')).toHaveCount(1);
});

test('a newly received enquiry updates the open inbox and count through refresh', async ({
  page,
  request,
}) => {
  await login(page);
  await request.post('http://127.0.0.1:54327/_test/pilot');
  await page.getByRole('button', { name: 'Opdater', exact: true }).click();
  await expect(
    page.getByRole('link', {
      name: 'Indbakke – 2 nye henvendelser',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pilotkunden', exact: true }),
  ).toBeVisible();
});
