import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
  await request.post('http://127.0.0.1:54327/_test/qualify');
});
async function openCase(page: Page) {
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
}
async function fillBooking(page: Page) {
  await page.getByLabel('Aftaletitel', { exact: true }).fill('Køkkenlamper');
  await page.getByLabel('Sted', { exact: true }).fill('Eksempelvej 12');
  await page
    .getByLabel('Start – dansk tid', { exact: true })
    .fill('2026-09-15T09:00');
  await page
    .getByLabel('Slut – dansk tid', { exact: true })
    .fill('2026-09-15T11:00');
}
test('backoffice books, sees, moves and cancels the same appointment with history and a usable calendar', async ({
  page,
  request,
}) => {
  await openCase(page);
  await fillBooking(page);
  await page.getByRole('button', { name: 'Opret aftale', exact: true }).click();
  await expect(page.getByText('Version 4', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Se i kalenderen' }).click();
  await expect(
    page.getByRole('heading', { name: 'En aftale ad gangen.' }),
  ).toBeVisible();
  const card = page.getByRole('link').filter({
    has: page.getByRole('heading', { name: 'Køkkenlamper', exact: true }),
  });
  await expect(card).toContainText('09.00');
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
  await card.click();
  await page.getByText('Flyt eller ret aftale', { exact: true }).click();
  await page
    .getByLabel('Start – dansk tid', { exact: true })
    .fill('2026-09-16T10:00');
  await page
    .getByLabel('Slut – dansk tid', { exact: true })
    .fill('2026-09-16T12:00');
  await page
    .getByLabel('Begrundelse for ændringen')
    .fill('Kunden ønsker en anden dag');
  await page.getByRole('button', { name: 'Gem aftaleændring' }).click();
  await expect(page.getByText('Version 5', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aftale ændret' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Se i kalenderen' }).click();
  await expect(page).toHaveURL(/calendar\/2026-09-16$/);
  await expect(card).toContainText('10.00');
  await card.click();
  await page.getByText('Aflys aftale', { exact: true }).click();
  await page
    .getByLabel('Begrundelse for aflysning')
    .fill('Vi skal afklare adgang til boligen');
  await page.getByRole('button', { name: 'Bekræft aflysning' }).click();
  await expect(page.getByText('Version 6', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aftale aflyst' }),
  ).toBeVisible();
  await expect(page.getByLabel('Hvem afventer vi?')).toHaveValue('staff');
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(
    page.getByRole('heading', { name: 'Plads i kalenderen' }),
  ).toBeVisible();
  expect(
    await (
      await request.get('http://127.0.0.1:54327/_test/calendar-state')
    ).json(),
  ).toEqual({ appointments: 1, booked: 0 });
});
test('a lost booking response retries once and daylight-saving gaps are rejected before sending', async ({
  page,
  request,
}) => {
  await openCase(page);
  await fillBooking(page);
  await page
    .getByLabel('Start – dansk tid', { exact: true })
    .fill('2026-03-29T02:30');
  await page.getByRole('button', { name: 'Opret aftale', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('findes ikke');
  expect(
    await (
      await request.get('http://127.0.0.1:54327/_test/calendar-state')
    ).json(),
  ).toEqual({ appointments: 0, booked: 0 });
  await fillBooking(page);
  let dropped = false;
  await page.route('**/rest/v1/rpc/create_lead_appointment', async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Opret aftale', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('kunne ikke bekræftes');
  await expect(page.getByLabel('Aftaletitel', { exact: true })).toHaveValue(
    'Køkkenlamper',
  );
  await page.getByRole('button', { name: 'Opret aftale', exact: true }).click();
  await expect(page.getByText('Version 4', { exact: true })).toBeVisible();
  expect(
    await (
      await request.get('http://127.0.0.1:54327/_test/calendar-state')
    ).json(),
  ).toEqual({ appointments: 1, booked: 1 });
});
