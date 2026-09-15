import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:54327';
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/_test/reset`);
});
async function login(page: Page, email = 'owner@example.com') {
  await page.goto('/#/indstillinger');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Medarbejdere og rettigheder' }),
  ).toBeVisible();
}
async function form(page: Page) {
  await page
    .getByRole('button', { name: 'Opret medarbejder', exact: true })
    .click();
  await page.getByLabel('Navn', { exact: true }).fill('Ny kollega');
  await page
    .getByLabel('E-mail', { exact: true })
    .fill('colleague@example.com');
  const role = page.getByRole('combobox', { name: 'Arbejdsrolle' });
  await expect(role.locator('option')).toHaveText([
    'Ingen arbejdsrolle',
    'Backoffice',
    'Faglig',
  ]);
  await role.selectOption('technical');
}

test('owner invites a technical colleague; access starts after emailed-link verification and chosen password', async ({
  page,
  request,
  browser,
}) => {
  await login(page);
  await form(page);
  await expect(
    page.getByRole('checkbox', { name: /Ejerrettigheder/ }),
  ).not.toBeChecked();
  expect(
    (await new AxeBuilder({ page }).include('.staff-settings').analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole('button', { name: 'Send invitation', exact: true })
    .click();
  await expect(
    page.locator('.staff-invitations').getByRole('status'),
  ).toContainText('Invitationen er sendt til colleague@example.com');
  const pending = page.getByRole('article', {
    name: 'Invitation til Ny kollega',
    exact: true,
  });
  await expect(pending).toContainText('Faglig');
  let state = await (
    await request.get(`${api}/_test/staff-invitations`)
  ).json();
  expect(state.emails).toBe(1);
  expect(state.members).toHaveLength(3);
  expect(state.invitations[0].state).toBe('sent');
  await page.reload();
  await expect(pending).toBeVisible();
  const { hash } = await (
    await request.post(
      `${api}/_test/accept-invitation?email=colleague@example.com`,
    )
  ).json();
  const recipientContext = await browser.newContext();
  const recipient = await recipientContext.newPage();
  try {
    await recipient.goto(`http://127.0.0.1:5175/${hash}`);
    await expect(
      recipient.getByRole('heading', { name: 'Vælg din adgangskode' }),
    ).toBeVisible();
    await recipient.reload();
    await expect(
      recipient.getByRole('heading', { name: 'Vælg din adgangskode' }),
    ).toBeVisible();
    await recipient
      .getByLabel('Adgangskode', { exact: true })
      .fill('new-fixture-password');
    await recipient
      .getByRole('button', { name: 'Gem og åbn arbejdsrummet' })
      .click();
    await expect(
      recipient.getByRole('heading', { name: 'Anna Jensen', exact: true }),
    ).toBeVisible();
    await recipient.goto('http://127.0.0.1:5175/#/indstillinger');
    await expect(recipient.getByText('Din adgang:')).toContainText('Faglig');
    await expect(
      recipient.getByRole('button', { name: 'Opret medarbejder' }),
    ).toHaveCount(0);
    state = await (await request.get(`${api}/_test/staff-invitations`)).json();
    expect(state.invitations[0].state).toBe('activated');
    expect(state.members).toHaveLength(4);
    expect(
      state.members.find((m: any) => m.display_name === 'Ny kollega'),
    ).toMatchObject({ role: 'technical', is_owner: false, active: true });
  } finally {
    await recipientContext.close();
  }
  await page.reload();
  await expect(pending).toHaveCount(0);
  await expect(
    page.getByRole('article', { name: 'Ny kollega', exact: true }),
  ).toBeVisible();
});

test('ordinary backoffice cannot see creation UI or invite directly through the endpoint', async ({
  page,
  request,
}) => {
  await login(page, 'staff@example.com');
  await expect(
    page.getByRole('button', { name: 'Opret medarbejder' }),
  ).toHaveCount(0);
  const response = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((key) =>
      key.endsWith('-auth-token'),
    )!;
    const session = JSON.parse(localStorage.getItem(key)!);
    const reply = await fetch(
      'http://127.0.0.1:54327/functions/v1/invite-staff',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          invitationId: crypto.randomUUID(),
          displayName: 'Attacker',
          email: 'attacker@example.com',
          role: 'technical',
          isOwner: true,
        }),
      },
    );
    return { status: reply.status, body: await reply.json() };
  });
  expect(response).toEqual({ status: 403, body: { code: 'owner_required' } });
  const state = await (
    await request.get(`${api}/_test/staff-invitations`)
  ).json();
  expect(state.emails).toBe(0);
  expect(state.invitations).toHaveLength(0);
});

test('lost response retries same command without sending two confirmed invitations', async ({
  page,
  request,
}) => {
  await login(page);
  await form(page);
  const commands: unknown[] = [];
  await page.route('**/functions/v1/invite-staff', async (route) => {
    commands.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (commands.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'Send invitation', exact: true })
    .click();
  await expect(
    page.locator('.staff-invitations').getByRole('alert'),
  ).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(
    'colleague@example.com',
  );
  await page
    .getByRole('button', { name: 'Send invitation', exact: true })
    .click();
  await expect(
    page.locator('.staff-invitations').getByRole('status'),
  ).toContainText('Invitationen er sendt');
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  const state = await (
    await request.get(`${api}/_test/staff-invitations`)
  ).json();
  expect(state.emails).toBe(1);
  expect(state.invitations).toHaveLength(1);
  expect(state.members).toHaveLength(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('email collision is visible and preserves chosen independent rights', async ({
  page,
  request,
}) => {
  await login(page);
  await form(page);
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page.getByRole('combobox', { name: 'Arbejdsrolle' }).selectOption('');
  await page.getByRole('checkbox', { name: /Ejerrettigheder/ }).check();
  await page
    .getByRole('button', { name: 'Send invitation', exact: true })
    .click();
  await expect(
    page.locator('.staff-invitations').getByRole('alert'),
  ).toContainText('allerede oprettet');
  await expect(
    page.getByRole('combobox', { name: 'Arbejdsrolle' }),
  ).toHaveValue('');
  await expect(
    page.getByRole('checkbox', { name: /Ejerrettigheder/ }),
  ).toBeChecked();
  const state = await (
    await request.get(`${api}/_test/staff-invitations`)
  ).json();
  expect(state.emails).toBe(0);
  expect(state.members).toHaveLength(3);
});
