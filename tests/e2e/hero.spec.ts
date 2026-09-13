import { test, expect } from '@playwright/test';
import { site } from '../../src/data/site';

test('hero separates ordinary enquiries from the bounded pilot offer', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('[data-consent-reject]').click();
  const hero = page.locator('.hero');
  const primary = hero.getByRole('link', { name: 'Beskriv din opgave', exact: true });
  await expect(primary).toHaveAttribute('href', '#kontakt');
  await expect(hero.getByRole('link', { name: 'Se vores serviceydelser' })).toHaveAttribute('href', '#ydelser');
  const pilot = hero.locator('.hero-note');
  await expect(pilot).toBeVisible();
  await expect(pilot).toHaveAttribute('href', '#pilot');
  await expect(pilot).toContainText(`${site.pilotPlaces} PILOTPROJEKTER`);
  await expect(pilot).toContainText(`Op til ${site.pilotHours} timers`);
  await expect(pilot).toContainText('materialer og evt. lejeudstyr');
  await expect(hero).toContainText(site.area);
  await expect(hero.locator('.hero-reassurance')).toContainText('pris og omfang');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('hero.png'), fullPage: false });
  await primary.click();
  await expect(page).toHaveURL(/#kontakt$/);
  await expect(page.locator('#enquiry-form')).toBeVisible();
});

test('hero content remains inside the viewport at narrow and tablet widths', async ({ page }) => {
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    if (await page.locator('[data-consent-reject]').isVisible()) {
      await page.locator('[data-consent-reject]').click();
    }
    const boxes = await page.locator('.hero-copy, .hero-note').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right };
    }));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
