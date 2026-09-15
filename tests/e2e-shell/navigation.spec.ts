import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('all empty pages, history and inbox example work without customer-data requests', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1')
      externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/ui.html#/sager');
  for (const label of [
    'Sager',
    'Kunder',
    'Kalender',
    'Tilbud',
    'Fakturaer',
    'Indstillinger',
  ]) {
    const link = page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true });
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { level: 1, name: label, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Indholdet kommer i næste trin.'),
    ).toBeVisible();
  }
  const inbox = page.getByRole('link', {
    name: 'Indbakke – eksempel på nye henvendelser',
    exact: true,
  });
  await inbox.click();
  await expect(inbox).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Indbakke' }),
  ).toBeFocused();
  await expect(inbox.locator('.ws-inbox-dot')).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Indstillinger' }),
  ).toBeVisible();
  await page.goForward();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Indbakke' }),
  ).toBeVisible();
  await page.goto('/ui.html#/ukendt');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sager' }),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('collapsed navigation and skip link are operable with the keyboard', async ({
  page,
}) => {
  await page.goto('/ui.html#/sager');
  await page.getByRole('button', { name: 'Fold menu sammen' }).click();
  const expand = page.getByRole('button', { name: 'Fold menu ud' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.ws-sidebar')).toHaveCSS('width', '80px');
  const calendar = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Kalender', exact: true });
  await calendar.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kalender' }),
  ).toBeFocused();
  await expand.click();
  await expect(
    page.getByRole('button', { name: 'Fold menu sammen' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.ws-sidebar')).toHaveCSS('width', '248px');
  await page.getByRole('link', { name: 'Gå til indhold' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/kalender$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kalender' }),
  ).toBeFocused();
});

test('mobile drawer contains keyboard focus and restores scrolling and focus on close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui.html#/sager');
  const open = page.getByRole('button', { name: 'Åbn menu' });
  const drawer = page.getByRole('dialog', { name: 'Hovedmenu' });
  await open.click();
  await expect(drawer).toBeVisible();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await drawer
    .getByRole('link', { name: 'Lys & Logik – Sager', exact: true })
    .focus();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Luk menu' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    drawer.getByRole('link', { name: 'Lys & Logik – Sager', exact: true }),
  ).toBeFocused();
  // Native dialogs can yield focus to browser chrome, but never to the page behind them.
  for (let step = 0; step < 18; step++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          Boolean(document.activeElement?.closest('dialog[open]')),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(open).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await open.click();
  await drawer.getByRole('link', { name: 'Kunder', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kunder' }),
  ).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await open.click();
  await page.mouse.click(370, 400);
  await expect(drawer).not.toBeVisible();
  await expect(open).toBeFocused();
});

test('resizing to desktop closes an open modal and exposes desktop navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui.html#/tilbud');
  await page.getByRole('button', { name: 'Åbn menu' }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(
    page
      .getByRole('navigation')
      .getByRole('link', { name: 'Tilbud', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Åbn menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('small phones and tablets have no horizontal overflow and controls remain touch-sized', async ({
  page,
}) => {
  await page.goto('/ui.html#/indstillinger');
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const control of await page
      .locator('.ws-topbar :is(a,button)')
      .all()) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    if (width <= 800) {
      await page.getByRole('button', { name: 'Åbn menu' }).click();
      const drawer = page.getByRole('dialog');
      expect((await drawer.boundingBox())!.width).toBeLessThan(width);
      for (const link of await drawer
        .getByRole('navigation')
        .getByRole('link')
        .all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await drawer.getByRole('button', { name: 'Luk menu' }).click();
    }
  }
});

test('desktop, compact rail and mobile drawer pass the accessibility scan', async ({
  page,
}) => {
  await page.goto('/ui.html#/sager');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sager' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Fold menu sammen' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Åbn menu' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
