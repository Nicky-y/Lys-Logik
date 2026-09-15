import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1280, 390]) {
  test(`device settings preview is usable at ${width}px without contacting real services`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const external: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== '127.0.0.1')
        external.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      (window as any).permissionCalls = 0;
      Notification.requestPermission = async () => {
        (window as any).permissionCalls++;
        return 'denied';
      };
    });
    await page.goto('/#/indstillinger');
    await expect(
      page.getByText(/Prøvevisning · Kontakten kan afprøves her/),
    ).toBeVisible();
    const toggle = page.getByRole('switch', { name: 'Notifikationer' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.evaluate(() => {
      location.hash = '#/sager';
    });
    await expect(
      page.getByRole('heading', { name: 'Sager', exact: true, level: 1 }),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#/indstillinger';
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(
      (await new AxeBuilder({ page }).include('.device-settings').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator('.device-settings')
      .screenshot({
        path: testInfo.outputPath(`device-settings-${width}.png`),
      });
    await page
      .getByRole('button', { name: 'Installér app', exact: true })
      .click();
    const guide = page.getByRole('dialog');
    await expect(
      guide.getByText(/Dette er en lokal prøvevisning/),
    ).toBeVisible();
    await expect(
      guide.getByRole('link', { name: 'app.lysoglogik.dk' }),
    ).toHaveAttribute('href', 'https://app.lysoglogik.dk/');
    await expect(
      guide.getByRole('button', { name: 'Installér Lys & Logik', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Luk installationsvejledning' })
      .click();
    await expect(guide).not.toBeVisible();
    expect(await page.evaluate(() => (window as any).permissionCalls)).toBe(0);
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    ).toBe(0);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
