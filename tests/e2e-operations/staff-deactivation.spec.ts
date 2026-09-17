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
async function open(page: Page, name = 'Backoffice') {
  await page
    .getByRole('article', { name, exact: true })
    .getByRole('button', { name: 'Deaktivér medarbejder', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: `Deaktivér ${name}?`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('named confirmation is cancellable and accessible; confirmed deactivation removes existing-session access while preserving history', async ({
  page,
  request,
  browser,
}) => {
  await login(page);
  let dialog = await open(page);
  await expect(
    dialog.getByRole('button', { name: 'Annuller', exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.staff-deactivation-dialog')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole('article', { name: 'Backoffice', exact: true })
      .getByRole('button', { name: 'Deaktivér medarbejder' }),
  ).toBeFocused();
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(0);

  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5175',
  });
  const worker = await context.newPage();
  try {
    await worker.goto('http://127.0.0.1:5175/');
    await login(worker, 'staff@example.com');
    await expect(
      worker.getByRole('button', { name: 'Deaktivér medarbejder' }),
    ).toHaveCount(0);
    await worker.goto('http://127.0.0.1:5175/#/indbakke');
    await expect(
      worker.getByRole('heading', { name: 'Anna Jensen', exact: true }),
    ).toBeVisible();
    dialog = await open(page);
    await dialog
      .getByRole('button', { name: 'Ja, deaktivér medarbejder', exact: true })
      .click();
    await expect(
      page.locator('.staff-settings').getByRole('status'),
    ).toContainText('Backoffice er deaktiveret');
    await page
      .getByText('Deaktiverede medarbejdere (1)', { exact: true })
      .click();
    const inactive = page.getByRole('article', {
      name: 'Backoffice',
      exact: true,
    });
    await expect(inactive).toContainText('Historikken er bevaret');
    await expect(inactive.getByRole('button')).toHaveCount(0);
    const events = await (
      await request.get(`${api}/_test/staff-access`)
    ).json();
    expect(events).toHaveLength(1);
    expect(events[0].after_access).toEqual({
      role: 'backoffice',
      isOwner: false,
      active: false,
    });
    await worker.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      worker.getByRole('heading', { name: 'Din konto har ikke adgang' }),
    ).toBeVisible();
    await expect(worker.getByText('Anna Jensen')).toHaveCount(0);
    await worker.reload();
    await expect(
      worker.getByRole('heading', { name: 'Din konto har ikke adgang' }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByText('Deaktiverede medarbejdere (1)', { exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'Backoffice', exact: true }),
    ).toContainText('Deaktiveret');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test('own deactivation is hidden with one or multiple owners and a direct self-call is rejected', async ({
  page,
  request,
}) => {
  await login(page);
  const own = page.getByRole('article', {
    name: 'Ejer uden arbejdsrolle',
    exact: true,
  });
  await expect(
    own.getByRole('button', { name: 'Deaktivér medarbejder' }),
  ).toHaveCount(0);
  const other = page.getByRole('article', { name: 'Backoffice', exact: true });
  await other.getByRole('button', { name: 'Redigér rettigheder' }).click();
  await other.getByRole('checkbox').check();
  await other.getByRole('button', { name: 'Gem rettigheder' }).click();
  await expect(other).toContainText('Ejer · Backoffice');
  await expect(
    own.getByRole('button', { name: 'Deaktivér medarbejder' }),
  ).toHaveCount(0);
  await expect(
    other.getByRole('button', { name: 'Deaktivér medarbejder' }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((key) =>
      key.endsWith('-auth-token'),
    )!;
    const session = JSON.parse(localStorage.getItem(key)!);
    const response = await fetch(
      'http://127.0.0.1:54327/rest/v1/rpc/deactivate_staff_member',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_command_id: crypto.randomUUID(),
          p_user_id: session.user.id,
          p_expected_version: 1,
        }),
      },
    );
    return { ok: response.ok, body: await response.json() };
  });
  expect(result.ok).toBe(false);
  expect(result.body.message).toBe('self_deactivation_forbidden');
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(1);
  await expect(
    page.getByRole('button', { name: 'Opret medarbejder' }),
  ).toBeVisible();
});

for (const email of ['staff@example.com', 'technical@example.com']) {
  test(`${email} cannot create or deactivate colleagues through UI or direct API calls`, async ({
    page,
    request,
  }) => {
    await login(page, email);
    await expect(
      page.getByRole('button', { name: 'Opret medarbejder' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Deaktivér medarbejder' }),
    ).toHaveCount(0);
    const results = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((key) =>
        key.endsWith('-auth-token'),
      )!;
      const session = JSON.parse(localStorage.getItem(key)!);
      const commands = [
        {
          path: 'rest/v1/rpc/deactivate_staff_member',
          body: {
            p_command_id: crypto.randomUUID(),
            p_user_id: 'dbfd477b-bdf1-4897-9896-a42e2a36c3e6',
            p_expected_version: 1,
          },
        },
        {
          path: 'functions/v1/invite-staff',
          body: {
            invitationId: crypto.randomUUID(),
            displayName: 'Unauthorized colleague',
            email: 'unauthorized@example.com',
            role: 'technical',
            isOwner: true,
          },
        },
      ];
      return Promise.all(
        commands.map(async (command) => {
          const response = await fetch(
            `http://127.0.0.1:54327/${command.path}`,
            {
              method: 'POST',
              headers: {
                authorization: `Bearer ${session.access_token}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify(command.body),
            },
          );
          const body = await response.json();
          return { ok: response.ok, error: body.message ?? body.code };
        }),
      );
    });
    expect(results).toEqual([
      { ok: false, error: 'owner_required' },
      { ok: false, error: 'owner_required' },
    ]);
    expect(
      await (await request.get(`${api}/_test/staff-access`)).json(),
    ).toHaveLength(0);
    const state = await (
      await request.get(`${api}/_test/staff-invitations`)
    ).json();
    expect(state.emails).toBe(0);
    expect(state.invitations).toHaveLength(0);
    expect(
      state.members.every((member: { active: boolean }) => member.active),
    ).toBe(true);
  });
}

test('lost deactivation response retries one command and one evidence event', async ({
  page,
  request,
}) => {
  await login(page);
  const calls: unknown[] = [];
  await page.route('**/rest/v1/rpc/deactivate_staff_member', async (route) => {
    calls.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (calls.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  const dialog = await open(page);
  await dialog
    .getByRole('button', { name: 'Ja, deaktivér medarbejder' })
    .click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Ja, deaktivér medarbejder' })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(
    await (await request.get(`${api}/_test/staff-access`)).json(),
  ).toHaveLength(1);
});

test('rights changed during confirmation require a fresh review before deactivation', async ({
  page,
  request,
}) => {
  await login(page);
  let dialog = await open(page);
  await request.post(`${api}/_test/staff-access-conflict`);
  await dialog
    .getByRole('button', { name: 'Ja, deaktivér medarbejder' })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('ændret af en anden');
  await expect(
    dialog.getByRole('button', { name: 'Ja, deaktivér medarbejder' }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Hent seneste rettigheder' })
    .click();
  dialog = await open(page);
  await expect(dialog).toContainText('Nuværende adgang: Faglig');
  await dialog
    .getByRole('button', { name: 'Ja, deaktivér medarbejder' })
    .click();
  await expect(dialog).not.toBeVisible();
  const events = await (await request.get(`${api}/_test/staff-access`)).json();
  expect(events).toHaveLength(2);
  expect(events[1].after_access).toEqual({
    role: 'technical',
    isOwner: false,
    active: false,
  });
});
