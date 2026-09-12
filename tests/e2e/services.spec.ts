import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// URL slugs and persisted enquiry choices are deliberately separate.
const serviceRoutes: Record<string, string> = {
  lampeopsaetning: 'lampeopsaetning',
  stikkontakter: 'stikkontakter',
  'smart-home': 'smart-home',
  'lysstyring-sensorer': 'lysstyring',
};

test('catalogue images follow their card destination with keyboard and pointer', async ({
  page,
}) => {
  for (const service of [
    'lampeopsaetning',
    'stikkontakter',
    'smart-home',
    'lysstyring-sensorer',
    'hvidevarer',
  ]) {
    await page.goto('/#ydelser');
    const card = page
      .locator('article')
      .filter({ has: page.locator(`#service-${service}`) });
    const imageLink = card.locator('.catalogue-image-link');
    await expect(imageLink).toHaveAccessibleName(/Læs om|Kontakt os om/);
    await expect(imageLink).toHaveAttribute(
      'href',
      (await card.locator('.catalogue-link').getAttribute('href'))!,
    );
    if (service === 'lampeopsaetning') {
      await imageLink.focus();
      await page.keyboard.press('Enter');
    } else {
      await imageLink.getByRole('img').click();
    }
    if (serviceRoutes[service]) {
      await expect(page).toHaveURL(
        new RegExp(`/services/${serviceRoutes[service]}/?$`),
      );
      await expect(page.locator('main h1')).toBeVisible();
    } else {
      await expect(page).toHaveURL(/#kontakt$/);
      await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
        service,
      );
    }
  }
});

test('all five service descriptions select the matching enquiry type', async ({
  page,
}, testInfo) => {
  await page.goto('/#ydelser');
  const catalogue = page.getByRole('region', {
    name: 'Små opgaver. Godt håndværk.',
  });
  await expect(catalogue.getByRole('article')).toHaveCount(5);
  const choices = [
    ['lampeopsaetning', 'Lampeopsætning'],
    ['stikkontakter', 'Udskiftning af stikkontakter'],
    ['smart-home', 'Smart-home opsætning og konfigurering'],
    ['lysstyring-sensorer', 'Lysstyring og sensorer'],
    ['hvidevarer', 'Tilslutning af hvidevarer med stikprop'],
  ];
  for (const [value, name] of choices) {
    const article = catalogue.getByRole('article', { name, exact: true });
    const image = article.getByRole('img');
    await expect(image).toHaveCount(1);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('alt', /.+/);
    await expect
      .poll(() =>
        image.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const imageBox = await image.boundingBox();
    const headingBox = await article.getByRole('heading').boundingBox();
    expect(imageBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(headingBox!.y);
    await expect(
      catalogue.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    if (serviceRoutes[value]) {
      await article
        .getByRole('link', { name: `Udforsk service: ${name}` })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/services/${serviceRoutes[value]}/?$`),
      );
      await page
        .locator('main')
        .getByRole('link', { name: 'Beskriv din opgave', exact: true })
        .first()
        .click();
    } else {
      await article
        .getByRole('link', { name: `Beskriv din opgave: ${name}`, exact: true })
        .click();
    }
    await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(value);
  }
  await expect(page.locator('#service option')).toHaveCount(7);
  const imageSources = await catalogue
    .getByRole('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  expect(new Set(imageSources).size).toBe(5);
  await expect(catalogue).toContainText(
    'Vi udfører kun arbejde, der ikke kræver autorisation.',
  );
  await catalogue.screenshot({ path: testInfo.outputPath('catalogue.png') });
});

for (const serviceCase of [
  {
    slug: 'lysstyring',
    title: 'Lysstyring og sensorer i Storkøbenhavn | Lys & Logik',
    description: /lysstyring, sensorer og tidsplaner/,
    question: 'Skal der trækkes nye ledninger?',
    answer:
      'Nye ledninger i den faste installation er ikke en del af denne ydelse.',
  },
  {
    slug: 'smart-home',
    title: 'Smart-home opsætning i Storkøbenhavn | Lys & Logik',
    description: /kompatible smart-home-enheder/,
    question: 'Virker mine enheder sammen?',
    answer: 'Vi afklarer kompatibiliteten',
  },
  {
    slug: 'lampeopsaetning',
    title: 'Lampeopsætning i Storkøbenhavn | Lys & Logik',
    description: /ophængning/,
    question: 'Kan I lave et nyt lampeudtag?',
    answer: 'Nye udtag',
  },
  {
    slug: 'stikkontakter',
    title: 'Udskiftning af stikkontakter i Storkøbenhavn | Lys & Logik',
    description: /eksisterende indendørs/,
    question: 'Kan I etablere eller flytte en stikkontakt?',
    answer: 'Nye stikkontakter, flytning og udvidelse',
  },
]) {
  test(`${serviceCase.slug} page has metadata, working navigation, FAQ and accessible responsive layout`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/services/${serviceCase.slug}/`);
    await expect(page).toHaveTitle(serviceCase.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      serviceCase.description,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('main')).not.toContainText('425');
    await expect(page.locator('main')).toContainText(
      'Op til 4 timers gratis arbejde',
    );
    const faq = page.getByText(serviceCase.question, { exact: true });
    await faq.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details[open]')).toContainText(
      serviceCase.answer,
    );
    if (serviceCase.slug === 'stikkontakter') {
      await expect(page.locator('main')).not.toContainText(
        /lampen|lamperne|lampeudtag/i,
      );
      await expect(page.locator('main')).toContainText('30 mA');
      await expect(page.locator('main')).toContainText('IP20');
    }
    await page
      .getByRole('button', { name: 'Privatliv & prototype', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    if (testInfo.project.name === 'mobile') {
      await page.locator('.menu-toggle').click();
      await expect(page.locator('#navigation')).toHaveClass(/is-open/);
      await page.keyboard.press('Escape');
      await expect(page.locator('.menu-toggle')).toBeFocused();
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 720, height: 900 });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await page.setViewportSize(testInfo.project.use.viewport!);
    await page.screenshot({
      path: testInfo.outputPath(`${serviceCase.slug}-page.png`),
      fullPage: true,
    });
    await page
      .locator('.footer-navigation')
      .getByRole('link', { name: 'Det hjælper vi med' })
      .click();
    await expect(page).toHaveURL(/\/#ydelser$/);
    expect(errors).toEqual([]);
  });
}

test('service query accepts a visible choice and ignores unknown input', async ({
  page,
}) => {
  await page.goto('/?service=lampeopsaetning#kontakt');
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
    'lampeopsaetning',
  );
  await page.goto('/?service=not-a-service#kontakt');
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue('');
});
