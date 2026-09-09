import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54327/_test/reset');
});
async function ready(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}
async function login(page: Page) {
  await page.getByLabel('E-mail', { exact: true }).fill('staff@example.com');
  await page
    .getByLabel('Adgangskode', { exact: true })
    .fill('fixture-password');
  await page.getByRole('button', { name: 'Log ind', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Kalender', exact: true }),
  ).toBeVisible();
}

test('production app is installable and installation guidance is accessible on Android and desktop', async ({
  page,
  context,
}) => {
  await ready(page);
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send('Page.getAppManifest');
  expect(result.errors).toEqual([]);
  expect(JSON.parse(result.data!).display).toBe('standalone');
  // Playwright's ordinary contexts are incognito, where browser installation is
  // intentionally disabled. Check actual installability in a separate profile.
  const profile = await mkdtemp(resolve('.npm-cache/pwa-profile-'));
  const normal = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
  });
  try {
    const tab = normal.pages()[0];
    await tab.goto('http://127.0.0.1:5176/');
    await tab.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const normalCdp = await normal.newCDPSession(tab);
    await expect
      .poll(
        async () =>
          (await normalCdp.send('Page.getInstallabilityErrors'))
            .installabilityErrors,
      )
      .toEqual([]);
  } finally {
    await normal.close();
  }
  await page
    .getByRole('button', { name: 'Installér app', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Luk installationsvejledning' })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('login survives reopening, offline launch reveals no customer data and logout remains effective', async ({
  page,
  context,
}) => {
  await ready(page);
  await login(page);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Anna Jensen', exact: true }),
  ).toBeVisible();
  const paths = await page.evaluate(async () => {
    const paths = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        paths.push(new URL(request.url).pathname);
    return paths.sort();
  });
  expect(paths).toEqual(['/icons/app-192.png', '/offline.html']);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Vi mangler forbindelsen.' }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Prøv igen' }).click();
  await page.getByRole('button', { name: 'Log ud', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Log ind', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Anna Jensen')).toHaveCount(0);
});

test('a service worker update waits while a form draft is open and activates after closing the app', async ({
  page,
  context,
  request,
}) => {
  await ready(page);
  await page.getByLabel('E-mail', { exact: true }).fill('draft@example.com');
  await request.post('/_test/release');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.update();
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(
    'draft@example.com',
  );
  await page.close();
  const reopened = await context.newPage();
  await ready(reopened);
  await expect
    .poll(() =>
      reopened.evaluate(
        async () => !(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  expect(
    await reopened.evaluate(
      async () =>
        (await caches.keys()).filter((key) =>
          key.startsWith('lys-logik-offline-'),
        ).length,
    ),
  ).toBe(1);
});

test('install prompt can be dismissed without pretending installation succeeded', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await page
    .getByRole('button', { name: 'Installér app', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Installér Lys & Logik', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Installationen blev lukket',
  );
  await expect(
    page.getByRole('button', { name: 'Installér Lys & Logik', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(
    page.getByRole('button', { name: 'Installér app', exact: true }),
  ).toHaveCount(0);
});
