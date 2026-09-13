import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {
  CONSENT_KEY,
  CONSENT_LIFETIME,
  MEASUREMENT_ID,
} from '../../src/lib/analytics-consent';

const origin = 'https://lysoglogik.dk';
const optOut = `ga-disable-${MEASUREMENT_ID}`;
const dist = resolve('dist');
let googleRequests: string[];

test.beforeEach(async ({ context }) => {
  googleRequests = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.googletagmanager.com') {
      googleRequests.push(url.href);
      return route.fulfill({
        contentType: 'application/javascript',
        body: '/* External provider mocked: no measurements are sent. */',
      });
    }
    if (url.origin !== origin) return route.abort();
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(
      dist,
      `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`,
    );
    if (!file.startsWith(dist + sep)) return route.abort();
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    try {
      return route.fulfill({
        body: await readFile(file),
        contentType: types[extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
});

const disabled = (page: Page) =>
  page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key],
    optOut,
  );
const queue = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((args) =>
      Array.from(args),
    ),
  );
async function grant(page: Page) {
  await page.locator('[data-consent-accept]').click();
}
async function settings(page: Page) {
  await page.locator('[data-statistics-settings]').click();
}

test('nothing loads before consent or after rejection; only a sanitized page view after accept', async ({
  page,
}) => {
  await page.goto(`${origin}/?email=do-not-send#secret`);
  await expect(page.locator('#statistics-banner')).toBeVisible();
  expect(googleRequests).toHaveLength(0);
  await page.locator('[data-consent-reject]').click();
  await page.reload();
  await expect(page.locator('#statistics-banner')).toBeHidden();
  expect(googleRequests).toHaveLength(0);
  await settings(page);
  await grant(page);
  await expect.poll(() => googleRequests.length).toBe(1);
  const events = await queue(page);
  expect(events.filter((e) => e[0] === 'event')).toEqual([
    [
      'event',
      'page_view',
      {
        send_to: MEASUREMENT_ID,
        page_location: `${origin}/`,
        page_referrer: '',
        page_title: await page.title(),
      },
    ],
  ]);
  expect(
    events.find((e) => e[0] === 'consent' && e[1] === 'update')?.[2],
  ).toEqual({
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
});

test('withdrawal preserves the form, deletes GA cookies and regrant does not duplicate initialization', async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await grant(page);
  await expect.poll(() => googleRequests.length).toBe(1);
  await page.locator('input[name="name"]').fill('Kunde undervejs');
  await page.evaluate(() => {
    (window as unknown as { sentinel: boolean }).sentinel = true;
  });
  await context.addCookies(
    ['_ga', `_ga_${MEASUREMENT_ID.slice(2)}`, 'unrelated'].map((name) => ({
      name,
      value: 'test',
      url: origin,
    })),
  );
  await settings(page);
  await page.locator('[data-consent-reject]').click();
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Kunde undervejs',
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { sentinel: boolean }).sentinel,
    ),
  ).toBe(true);
  expect(await disabled(page)).toBe(true);
  expect((await context.cookies()).map((c) => c.name)).toEqual(['unrelated']);
  await expect(page.locator('[data-statistics-settings]')).toBeFocused();
  await settings(page);
  await grant(page);
  expect(await disabled(page)).toBe(false);
  expect(googleRequests).toHaveLength(1);
  expect((await queue(page)).filter((e) => e[0] === 'event')).toHaveLength(1);
  expect((await queue(page)).filter((e) => e[0] === 'config')).toHaveLength(1);
});

test('cross-tab withdrawal and consent expiry preserve a partially completed form', async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.goto(origin);
  await grant(page);
  await page.locator('input[name="name"]').fill('Bevar mig');
  const other = await context.newPage();
  await other.goto(origin);
  await settings(other);
  await other.locator('[data-consent-reject]').click();
  await expect.poll(() => disabled(page)).toBe(true);
  await expect(page.locator('input[name="name"]')).toHaveValue('Bevar mig');
  await settings(page);
  await grant(page);
  // A restored page must revalidate expired consent before resuming analytics.
  await page.clock.setSystemTime(Date.now() + CONSENT_LIFETIME + 1000);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  expect(await disabled(page)).toBe(true);
  await expect(page.locator('#statistics-banner')).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue('Bevar mig');
});

test('storage failures fail closed and never erase form input', async ({
  page,
}) => {
  await page.goto(origin);
  await grant(page);
  await page.locator('input[name="name"]').fill('Stadig her');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked');
    };
  });
  await settings(page);
  await page.locator('[data-consent-reject]').click();
  expect(await disabled(page)).toBe(true);
  await expect(page.locator('[data-consent-status]')).toContainText(
    'kunne ikke gemmes',
  );
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent('storage', { key: null })),
  );
  expect(await disabled(page)).toBe(true);
  await grant(page);
  expect(await disabled(page)).toBe(true);
  expect(googleRequests).toHaveLength(1);
  await expect(page.locator('input[name="name"]')).toHaveValue('Stadig her');
});

test('expired, malformed and old-disclosure decisions do not activate tracking', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, lifetime }) => {
      localStorage.setItem(
        'lys-logik-statistics-v1',
        JSON.stringify({ version: 1, choice: 'granted', at: Date.now() }),
      );
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          choice: 'granted',
          at: Date.now() - lifetime,
        }),
      );
    },
    { key: CONSENT_KEY, lifetime: CONSENT_LIFETIME },
  );
  await page.goto(origin);
  await expect(page.locator('#statistics-banner')).toBeVisible();
  expect(googleRequests).toHaveLength(0);
  await page.evaluate((key) => {
    localStorage.setItem(key, '{invalid');
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, CONSENT_KEY);
  expect(await disabled(page)).toBe(true);
});

test('unreadable storage never loads Google and the form remains editable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked');
    };
  });
  await page.goto(origin);
  await expect(page.locator('#statistics-banner')).toBeVisible();
  await grant(page);
  expect(await disabled(page)).toBe(true);
  expect(googleRequests).toHaveLength(0);
  await page.locator('input[name="name"]').fill('Uden statistik');
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Uden statistik',
  );
});

test('a storage read failure stops active measurement until a new explicit choice', async ({ page }) => {
  await page.goto(origin);
  await grant(page);
  await page.locator('input[name="name"]').fill('Bevar indhold');
  await page.evaluate(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new DOMException('blocked'); };
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    Storage.prototype.getItem = getItem;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect(await disabled(page)).toBe(true);
  await expect(page.locator('input[name="name"]')).toHaveValue('Bevar indhold');
  await grant(page);
  expect(await disabled(page)).toBe(false);
  expect((await queue(page)).filter(e => e[0] === 'event')).toHaveLength(1);
});

test('banner details fit narrow screens and privacy information names the provider', async ({
  page,
}, testInfo) => {
  await page.goto(origin);
  const initialBox = await page.locator('#statistics-banner').boundingBox();
  expect(initialBox).not.toBeNull();
  if (testInfo.project.name === 'desktop') {
    expect(initialBox!.width).toBeGreaterThan(1000);
    expect(initialBox!.height).toBeLessThan(220);
  }
  await expect(page.locator('[data-consent-accept]')).toHaveCSS('background-color', 'rgb(232, 184, 74)');
  await page.screenshot({ path: testInfo.outputPath('statistics-banner.png') });
  await page.getByText('Om statistik og cookies', { exact: true }).click();
  const banner = page.locator('#statistics-banner');
  await expect(banner).toContainText('Google Analytics');
  await expect(banner).toContainText('180 dage');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('#privacy-open').click();
  await expect(page.locator('#privacy-dialog')).toContainText(
    'Google Analytics',
  );
  await page.keyboard.press('Escape');
  await page.locator('[data-consent-reject]').click();
});
