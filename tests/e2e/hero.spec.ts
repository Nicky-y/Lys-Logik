import { test, expect } from '@playwright/test';
import { site } from '../../src/data/site';

test('video hero starts behind the larger white-logo navigation and covers the viewport', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('.site-header');
  await expect(header).toHaveClass(/site-header-overlay/);
  await expect(header.locator('.brand img')).toHaveAttribute('src', '/images/logo-v34.png');
  await expect.poll(() => header.locator('.brand img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1254);
  expect(await header.locator('.brand img').evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(1254);
  const layout = await page.evaluate(() => {
    const hero = document.querySelector('.hero')!.getBoundingClientRect();
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    const brand = document.querySelector('.brand')!.getBoundingClientRect();
    const copy = document.querySelector('.hero-copy')!.getBoundingClientRect();
    return { top: hero.top, height: hero.height, viewport: innerHeight, headerBottom: header.bottom, copyTop: copy.top, brandWidth: brand.width };
  });
  expect(layout.top).toBe(0);
  expect(layout.height).toBeGreaterThanOrEqual(layout.viewport - 1);
  expect(layout.copyTop).toBeGreaterThan(layout.headerBottom);
  expect(layout.brandWidth).toBeGreaterThan(174);
});

test('reduced motion shows the poster without downloading video until requested', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => { if (r.url().endsWith('.mp4')) requests.push(r.url()); });
  await page.goto('/');
  const video = page.locator('#hero-video');
  await expect(page.getByRole('button', { name: 'Afspil baggrundsvideo' })).toBeVisible();
  await expect(video).not.toHaveAttribute('src');
  await expect(video).toHaveAttribute('poster', '/images/hero-video-poster.webp');
  expect(requests).toEqual([]);
});

test('video plays silently, can be paused, and suspends when the hero leaves view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('[data-consent-reject]').click();
  const video = page.locator('#hero-video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0), { timeout: 15_000 }).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted && v.loop && v.playsInline)).toBe(true);
  await page.getByRole('button', { name: 'Sæt baggrundsvideo på pause' }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Afspil baggrundsvideo' }).click();
  await page.locator('#sidefod').scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('service pages retain their light navigation and original logo', async ({ page }) => {
  await page.goto('/services/lampeopsaetning/');
  await expect(page.locator('.site-header')).not.toHaveClass(/site-header-overlay/);
  await expect(page.locator('.brand img')).toHaveAttribute('src', '/images/logo-v11.png');
});

test('hero separates ordinary enquiries from the bounded pilot offer', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('[data-consent-reject]').click();
  const hero = page.locator('.hero');
  await expect(hero.locator('.hero-description')).toHaveText(
    /^Bygningsautomatik, smart-home og belysning\./,
  );
  const primary = hero.getByRole('link', { name: 'Beskriv din opgave', exact: true });
  await expect(primary).toHaveAttribute('href', '#kontakt');
  await expect(hero.getByRole('link', { name: 'Se vores serviceydelser' })).toHaveAttribute('href', '#ydelser');
  const pilot = hero.locator('.hero-note');
  await expect(pilot).toBeVisible();
  await expect(pilot).toHaveAttribute('href', '#pilot');
  await expect(pilot).toContainText(`${site.pilotPlaces} PILOTPROJEKTER`);
  await expect(pilot).toContainText(`Op til ${site.pilotHours} timers`);
  await expect(pilot).toContainText('materialer og evt. lejeudstyr');
  await expect(hero.locator('.eyebrow')).toHaveCount(0);
  await expect(hero).not.toContainText('HJÆLP TIL HJEMMET');
  await expect(hero).not.toContainText(site.area);
  await page.evaluate(() => document.fonts.ready);
  expect(await hero.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Outfit Variable');
  expect(await page.evaluate(() => document.fonts.check('550 48px \"Outfit Variable\"', 'Godt lys. En smartere hverdag.'))).toBe(true);
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
