import { test, expect, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:54327';
const baseKey = 'sb-127-auth-token';
async function login(page: Page, email = 'staff@example.com') {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Indbakke', level: 1 }),
  ).toBeVisible();
}
async function logout(page: Page) {
  if (await page.getByRole('button', { name: 'Åbn menu' }).isVisible())
    await page.getByRole('button', { name: 'Åbn menu' }).click();
  await page.getByRole('button', { name: 'Log ud', exact: true }).click();
}
async function loggedOut(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Velkommen tilbage' }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
}
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/_test/reset`);
});

test('logout also clears a login that is awaiting staff access', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('outsider@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Din konto afventer adgang' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log ud', exact: true }).click();
  await loggedOut(page);
  await page.reload();
  await loggedOut(page);
});

test('blocked persistent storage allows temporary login but cannot falsely confirm logout', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('fixture storage blocked', 'SecurityError');
      },
    });
    window.addEventListener('restore-fixture-storage', () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: storage,
      });
    });
  });
  await login(page);
  await logout(page);
  await expect(
    page.getByRole('heading', { name: 'Logout kunne ikke gennemføres' }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event('restore-fixture-storage')),
  );
  await page.getByRole('button', { name: 'Prøv logout igen' }).click();
  await loggedOut(page);
  await page.reload();
  await loggedOut(page);
});

test('temporary write failure cannot hide a previously saved login when logging out', async ({
  page,
  context,
}) => {
  await login(page);
  const old = await page.evaluate((key) => localStorage.getItem(key), baseKey);
  expect(old).not.toBeNull();
  const restricted = await context.newPage();
  await restricted.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('fixture full', 'QuotaExceededError');
    };
    window.addEventListener('restore-fixture-storage', () => {
      Storage.prototype.setItem = original;
    });
  });
  // Browser denied persistence; the app offers a separate temporary login.
  await login(restricted);
  await logout(restricted);
  await expect(
    restricted.getByRole('heading', { name: 'Logout kunne ikke gennemføres' }),
  ).toBeVisible();
  expect(
    await restricted.evaluate((key) => localStorage.getItem(key), baseKey),
  ).toBe(old);
  await restricted.evaluate(() =>
    window.dispatchEvent(new Event('restore-fixture-storage')),
  );
  await restricted.getByRole('button', { name: 'Prøv logout igen' }).click();
  await loggedOut(restricted);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await loggedOut(reopened);
  expect(
    await reopened.evaluate((key) => localStorage.getItem(key), baseKey),
  ).toBeNull();
});

test('logout in another tab also ends a temporary in-memory login', async ({
  page,
  context,
}) => {
  await login(page);
  await logout(page);
  await loggedOut(page);
  await login(page);
  const restricted = await context.newPage();
  await restricted.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('fixture full', 'QuotaExceededError');
    };
  });
  await login(restricted);
  await logout(page);
  await loggedOut(page);
  await loggedOut(restricted);
});

test('expired-token logout survives refresh outage, restored network and reopening, across two tabs', async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(
    other.getByRole('heading', { name: 'Indbakke', level: 1 }),
  ).toBeVisible();
  const valid = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    baseKey,
  );
  let failedRefreshes = 0;
  let healthy = false;
  await context.route(
    `${api}/auth/v1/token?grant_type=refresh_token`,
    async (route) => {
      if (healthy) {
        await route.fulfill({ json: valid });
        return;
      }
      failedRefreshes++;
      // Expire the real SDK retry window, without slowing the browser test down.
      await route
        .request()
        .frame()
        .page()
        .evaluate(() => {
          const later = Date.now() + 60_000;
          Date.now = () => later;
        });
      await route.fulfill({
        status: 503,
        json: { message: 'fixture refresh outage' },
      });
    },
  );
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(saved));
  }, baseKey);
  await logout(page);
  await loggedOut(page);
  await loggedOut(other);
  expect(failedRefreshes).toBeGreaterThan(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), baseKey),
  ).toBeNull();
  healthy = true;
  await page.reload();
  await loggedOut(page);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await loggedOut(reopened);
  // A fresh explicit login still works, including a second logout from the new namespace.
  await login(page);
  await expect(page.getByText('Anna Jensen', { exact: true })).toBeVisible();
  await expect(
    other.getByRole('heading', { name: 'Indbakke', level: 1 }),
  ).toBeVisible();
  await logout(page);
  await loggedOut(page);
  await loggedOut(other);
});

test('logout finishes while another tab has a refresh in flight; its late response cannot restore login', async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(
    other.getByRole('heading', { name: 'Indbakke', level: 1 }),
  ).toBeVisible();
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const valid = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    baseKey,
  );
  await other.route(
    `${api}/auth/v1/token?grant_type=refresh_token`,
    async (route) => {
      started();
      await held;
      await route.fulfill({ json: valid }).catch(() => {}); // Logout may have already navigated this tab.
    },
  );
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(saved));
  }, baseKey);
  await other.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waiting;
  // Restore valid storage so tab one's logout takes the normal revocation path.
  await page.evaluate(
    ({ key, valid }) => localStorage.setItem(key, JSON.stringify(valid)),
    { key: baseKey, valid },
  );
  await logout(page);
  await loggedOut(page);
  release();
  await loggedOut(other);
  await other.reload();
  await loggedOut(other);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), baseKey),
  ).toBeNull();
});

test('browser storage failure keeps a visible logout failure instead of claiming success', async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => {
      throw new Error('fixture storage failure');
    };
  });
  await logout(page);
  await expect(
    page.getByRole('heading', { name: 'Logout kunne ikke gennemføres' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Browseren kunne ikke rydde din session',
  );
  await expect(
    page.getByRole('heading', { name: 'Velkommen tilbage' }),
  ).toHaveCount(0);
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});
