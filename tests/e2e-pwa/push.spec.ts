import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
  // Replace only the device push service. Login, RPCs, SQL and SW handshake are real.
  await page.addInitScript(() => {
    let subscription: PushSubscription | null = null;
    Object.defineProperty(Notification, 'permission', {
      get: () => 'granted',
      configurable: true,
    });
    (window as any).permissionCalls = 0;
    Notification.requestPermission = async () => {
      (window as any).permissionCalls++;
      return 'granted';
    };
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
  const menu = page.getByRole('button', { name: 'Åbn menu' });
  await expect(
    page.getByRole('heading', { name: 'Indbakke', level: 1 }),
  ).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Appens hovedmenu' })
    .getByRole('link', { name: 'Indstillinger', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Notifikationer' }),
  ).toBeEnabled();
});
test('employee enables and disables the current device through the actual database', async ({
  page,
}) => {
  await page.getByRole('switch', { name: 'Notifikationer' }).click();
  await expect(
    page.getByText('Notifikationer er slået til på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('switch', { name: 'Notifikationer' }).click();
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
  await page.getByRole('switch', { name: 'Notifikationer' }).click();
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
  await page.getByRole('switch', { name: 'Notifikationer' }).click();
  await expect(
    page.getByText('Status for notifikationer er ikke bekræftet endnu.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Notifikationer' }),
  ).toBeDisabled();
  await page.unroute('**/rest/v1/rpc/push_subscription_active');
  await page
    .getByRole('button', { name: 'Kontrollér status', exact: true })
    .click();
  await expect(
    page.getByText('Notifikationer er slået til på denne enhed.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Notifikationer' }),
  ).toBeChecked();
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(1);
});

test('settings never asks permission on its own and the switch works by keyboard with accessible labels', async ({
  page,
}) => {
  const toggle = page.getByRole('switch', { name: 'Notifikationer' });
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(toggle).toBeEnabled();
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(0);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.device-settings')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(1);
  const size = await toggle.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
});

test('the switch stays off and locked while registration is pending and rolls back after server failure', async ({
  page,
}) => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let registrations = 0;
  await page.route(
    '**/rest/v1/rpc/register_push_subscription',
    async (route) => {
      registrations++;
      await gate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"offline"}',
      });
    },
  );
  const toggle = page.getByRole('switch', { name: 'Notifikationer' });
  try {
    await toggle.click();
    await expect.poll(() => registrations).toBe(1);
    await expect(toggle).toBeDisabled();
    await expect(toggle).not.toBeChecked();
    // Even a second native click dispatched while disabled must not register twice.
    await toggle.evaluate((node) => (node as HTMLButtonElement).click());
    expect(registrations).toBe(1);
  } finally {
    finish();
  }
  await expect(page.getByRole('alert')).toContainText(
    'Notifikationer kunne ikke slås til',
  );
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(async () =>
      (await navigator.serviceWorker.ready).pushManager.getSubscription(),
    ),
  ).toBeNull();
  await page.unroute('**/rest/v1/rpc/register_push_subscription');
  await toggle.click();
  await expect(toggle).toBeChecked();
});

test('turning off removes the device subscription even when server cleanup fails', async ({
  page,
}) => {
  const toggle = page.getByRole('switch', { name: 'Notifikationer' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.route('**/rest/v1/rpc/disable_push_subscription', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"offline"}',
    }),
  );
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText(
    'Forbindelsen til notifikationer fejlede',
  );
  expect(
    await page.evaluate(async () =>
      (await navigator.serviceWorker.ready).pushManager.getSubscription(),
    ),
  ).toBeNull();
});

test('returning from browser settings detects revoked permission without requesting it again', async ({
  page,
}) => {
  const toggle = page.getByRole('switch', { name: 'Notifikationer' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.evaluate(() => {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'denied',
      configurable: true,
    });
    window.dispatchEvent(new Event('focus'));
  });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(1);
});

test('unsupported devices show a disabled switch with guidance', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as any).PushManager;
  });
  await page.reload();
  await expect(
    page.getByRole('switch', { name: 'Notifikationer' }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'Åbn appen i Chrome på Android for at bruge mobilnotifikationer.',
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(0);
});

test('owner-only accounts can install but do not query or register customer notifications', async ({
  page,
}) => {
  const menu = page.getByRole('button', { name: 'Åbn menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Log ud', exact: true }).click();
  const pushRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/rpc\/(push_subscription_active|register_push_subscription)/.test(
        request.url(),
      )
    )
      pushRequests.push(request.url());
  });
  await page.getByLabel('E-mail', { exact: true }).fill('owner@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Installér app', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Notifikationer' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Kundenotifikationer kræver en arbejdsrolle.'),
  ).toBeVisible();
  expect(pushRequests).toEqual([]);
  expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(0);
});
