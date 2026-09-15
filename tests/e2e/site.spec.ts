import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('loads local images and navigation without browser errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Godt lys.',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'da');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  expect(await page.locator('.brand img').first().getAttribute('src')).toBe(
    '/images/logo-v32.png',
  );
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('page.png'),
    fullPage: true,
  });
  await page.screenshot({ path: testInfo.outputPath('first-screen.png') });
});

test('all in-page links resolve to a real section', async ({ page }) => {
  await page.goto('/');
  const missing = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href')!)
        .filter(
          (href) => href.length > 1 && !document.getElementById(href.slice(1)),
        ),
    );
  expect(missing).toEqual([]);
});

test('contact background stays behind readable text and interactive form fields', async ({ page }, testInfo) => {
  await page.goto('/#kontakt');
  const section = page.locator('#kontakt');
  const image = section.locator('.contact-background img');
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const backgroundBounds = await image.boundingBox();
  const sectionBounds = await section.boundingBox();
  expect(backgroundBounds!.width).toBeGreaterThanOrEqual(sectionBounds!.width - 1);
  expect(backgroundBounds!.height).toBeGreaterThanOrEqual(sectionBounds!.height - 1);
  await expect(section.locator('.form-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(section.locator('.contact-intro')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByLabel('Dit navn').click();
  await page.getByLabel('Dit navn').fill('Anna Jensen');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Postnummer')).toBeFocused();
  expect((await new AxeBuilder({ page }).include('#kontakt').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({ path: testInfo.outputPath('contact-background.png') });
});

test('contact photo fades into the footer without a visible seam', async ({ page }, testInfo) => {
  await page.goto('/#sidefod');
  await page.getByRole('button', { name: 'Afvis statistik', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.contact-background img').evaluate((image: HTMLImageElement) => image.decode());
  const seam = await page.locator('#sidefod').evaluate((footer) => {
    window.scrollTo({
      top: window.scrollY + footer.getBoundingClientRect().top - innerHeight / 2,
      behavior: 'instant',
    });
    return {
      y: footer.getBoundingClientRect().top,
      color: getComputedStyle(footer).backgroundColor.match(/\d+/g)!.map(Number),
      gap: footer.getBoundingClientRect().top - document.querySelector('#kontakt')!.getBoundingClientRect().bottom,
    };
  });
  expect(Math.abs(seam.gap)).toBeLessThanOrEqual(1);
  const screenshot = await page.screenshot({
    path: testInfo.outputPath('contact-footer-transition.png'),
    scale: 'css',
  });
  const pixels = await page.evaluate(async ({ png, y }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [0.1, 0.5, 0.9].flatMap((fraction) => [-2, 2].map((offset) =>
      [...context.getImageData(Math.floor(image.width * fraction), Math.floor(y + offset), 1, 1).data].slice(0, 3),
    ));
  }, { png: screenshot.toString('base64'), y: seam.y });
  for (const pixel of pixels) {
    pixel.forEach((channel, index) => expect(Math.abs(channel - seam.color[index])).toBeLessThanOrEqual(1));
  }
});

test('shows accessible form errors and focuses the first invalid field', async ({
  page,
}) => {
  await page.goto('/#kontakt');
  await page.getByRole('button', { name: 'Prøv formularen' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Tjek de markerede felter',
  );
  await expect(page.getByLabel('Dit navn')).toBeFocused();
  await expect(page.locator('[aria-invalid=true]')).toHaveCount(6);
});

test('service cards preselect the enquiry category', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', {
      name: 'Læs mere: Tilslutning af hvidevarer med stikprop',
    })
    .click();
  await expect(page).toHaveURL(/\/services\/hvidevarer\/$/);
  await page
    .locator('main')
    .getByRole('link', { name: 'Beskriv din opgave', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
    'hvidevarer',
  );
});

test('complete demo submits locally and can be reset without storing personal data', async ({
  page,
}) => {
  await page.goto('/#kontakt');
  const submissions: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') submissions.push(request.url());
  });
  await page.getByLabel('Dit navn').fill('Anna Jensen');
  await page.getByLabel('Postnummer').fill('2800');
  await page.getByLabel('Din e-mail').fill('anna@example.com');
  await page
    .getByLabel('Hvad drejer det sig om?')
    .selectOption('lampeopsaetning');
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Vi vil gerne have bedre lys over vores spisebord.');
  await page.getByLabel('Jeg er indforstået med, at henvendelsen er uforpligtende').check();
  await page.getByRole('button', { name: 'Prøv formularen' }).click();
  await expect(page.locator('#form-success')).toBeFocused();
  await expect(page.getByRole('status')).toContainText(
    'Intet er sendt eller gemt.',
  );
  expect(submissions).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: '' });
  await page.getByRole('button', { name: 'Prøv igen', exact: true }).click();
  await expect(page.getByLabel('Dit navn')).toHaveValue('');
  await expect(page.getByLabel('Dit navn')).toBeFocused();
});

test('FAQ and privacy dialog work with keyboard', async ({ page }) => {
  await page.goto('/');
  const question = page.locator('summary').first();
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Privatliv & prototype' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Privatliv & prototype' }),
  ).toBeFocused();
});

test('no horizontal overflow at narrow and enlarged layouts', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 720, height: 500 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('mobile menu opens, closes on navigation, and responds to Escape', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  const menu = page.locator('.menu-toggle');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('navigation', { name: 'Hovedmenu' })
    .getByRole('link', { name: 'Om os', exact: true })
    .click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.scrollTo(0, 0));
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('no automated WCAG A or AA accessibility violations', async ({ page }) => {
  await page.goto('/');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
