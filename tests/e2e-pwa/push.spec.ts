import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
  // Replace only the device push service. Login, RPCs, SQL and SW handshake are real.
  await page.addInitScript(() => {
    let subscription: PushSubscription | null = null;
    Object.defineProperty(Notification, 'permission', {
      get: () => 'granted',
      configurable: true,
    });
    Notification.requestPermission = async () => 'granted';
    PushManager.prototype.getSubscription = async () => subscription;
    PushManager.prototype.subscribe = async () => {
      subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/browser-fixture',
        expirationTime: null,
        options: { userVisibleOnly: true, applicationServerKey: null },
        getKey: () => null,
        toJSON() {
          return {
            endpoint: this.endpoint,
            keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
          };
        },
        async unsubscribe() {
          subscription = null;
          return true;
        },
      } satisfies PushSubscription;
      return subscription;
    };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await page
    .getByRole('button', { name: 'Notifikationer', exact: true })
    .click();
});
test('employee enables and disables the current device through the actual database', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Slå notifikationer til', exact: true })
    .click();
  await expect(
    page.getByText('Notifikationer er slået til på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Slå notifikationer fra', exact: true })
    .click();
  await expect(
    page.getByText('Notifikationer er slået fra på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('denying permission leaves the employee unsubscribed and shows an explanation', async ({
  page,
}) => {
  await page.evaluate(() => {
    Notification.requestPermission = async () => 'denied';
  });
  await page
    .getByRole('button', { name: 'Slå notifikationer til', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Notifikationer er ikke tilladt',
  );
  await expect(
    page.getByText('Notifikationer er slået fra på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('lost status response is shown as unconfirmed rather than disabled', async ({
  page,
}) => {
  await page.route('**/rest/v1/rpc/push_subscription_active', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"offline"}',
    }),
  );
  await page
    .getByRole('button', { name: 'Slå notifikationer til', exact: true })
    .click();
  await expect(
    page.getByText('Status for notifikationer er ikke bekræftet endnu.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute('**/rest/v1/rpc/push_subscription_active');
  await page
    .getByRole('button', { name: 'Kontrollér status', exact: true })
    .click();
  await expect(
    page.getByText('Notifikationer er slået til på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
});
