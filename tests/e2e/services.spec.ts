import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// URL slugs and persisted enquiry choices are deliberately separate.
const serviceRoutes: Record<string, string> = {
  bygningsautomatik: 'bygningsautomatik',
  lampeopsaetning: 'lampeopsaetning',
  stikkontakter: 'stikkontakter',
  'smart-home': 'smart-home',
  'lysstyring-sensorer': 'lysstyring',
  hvidevarer: 'hvidevarer',
};

test('speciality outline labels only building automation without blocking its image link', async ({ page }) => {
  await page.goto('/#ydelser');
  const badge = page.locator('.catalogue-speciality');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText('Vores specialisering');
  const card = page.getByRole('article', { name: 'Bygningsautomatik', exact: true });
  const link = card.locator('.catalogue-image-link');
  await expect(link).toHaveAccessibleDescription('Vores specialisering');
  await expect(card.locator('.catalogue-tag')).toHaveText('Automatik');
  const appearance = await badge.evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, border: style.borderTopColor, text: style.color };
  });
  expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
  expect(appearance.border).toBe(appearance.text);
  const badgeBox = (await badge.boundingBox())!;
  const imageBox = (await link.boundingBox())!;
  expect(badgeBox.x).toBeGreaterThanOrEqual(imageBox.x);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(imageBox.x + imageBox.width);
  expect(badgeBox.y - imageBox.y).toBeCloseTo(16, 0);
  await link.click({ position: { x: badgeBox.x - imageBox.x + 10, y: badgeBox.y - imageBox.y + 10 } });
  await expect(page).toHaveURL(/\/services\/bygningsautomatik\/$/);
});

test('building automation leads the six-card catalogue and opens its service page', async ({
  page,
}, testInfo) => {
  await page.goto('/#ydelser');
  const catalogue = page.getByRole('region', { name: 'Serviceydelser' });
  const cards = catalogue.getByRole('article');
  await expect(cards.locator('.catalogue-number')).toHaveText([
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
  ]);
  await expect(cards.getByRole('heading')).toHaveText([
    'Bygningsautomatik',
    'Udskiftning af stikkontakter',
    'Smart-home opsætning og konfigurering',
    'Lysstyring og sensorer',
    'Tilslutning af hvidevarer med stikprop',
    'Lampeopsætning',
  ]);
  const automation = cards.first();
  const photo = automation.getByRole('img');
  await expect(photo).toHaveAttribute(
    'src',
    '/images/service-bygningsautomatik-v2.webp',
  );
  await photo.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      photo.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(automation.locator('.catalogue-tag')).toHaveText('Automatik');
  await expect(automation.locator('.catalogue-description')).toContainText(
    'lys, varme og ventilation',
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = (await photo.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(1.5, 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(testInfo.project.use.viewport!);
  for (const className of ['.catalogue-image-link', '.catalogue-link']) {
    await page.goto('/#ydelser');
    const link = automation.locator(className);
    await expect(link).toHaveAttribute('href', '/services/bygningsautomatik/');
    await expect(link).toHaveAccessibleName(/Læs (om|mere:) Bygningsautomatik/);
    if (className === '.catalogue-image-link') {
      await link.focus();
      await page.keyboard.press('Enter');
    } else {
      await link.click();
    }
    await expect(page).toHaveURL(/\/services\/bygningsautomatik\/$/);
    const heroImage = page.locator('.service-hero img');
    await expect(heroImage).toHaveAttribute(
      'src',
      '/images/service-bygningsautomatik-v2.webp',
    );
    await expect
      .poll(() =>
        heroImage.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Få bygningens teknik til at arbejde sammen.',
    );
  }
  await page.goto('/#ydelser');
  await catalogue.screenshot({
    path: testInfo.outputPath('six-service-catalogue.png'),
  });
});

test('catalogue image arrows stay fixed during hover zoom and remain clickable', async ({
  page,
}, testInfo) => {
  await page.goto('/#ydelser');
  await expect(
    page.getByRole('heading', { name: 'Serviceydelser', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.catalogue-image-arrow')).toHaveCount(6);
  const link = page.getByRole('link', {
    name: 'Læs om Lampeopsætning',
    exact: true,
  });
  const photo = link.locator('img');
  const arrow = link.locator('.catalogue-image-arrow');
  const arrowPosition = () =>
    arrow.evaluate((element: HTMLElement) => ({
      x: element.offsetLeft,
      y: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
  await link.scrollIntoViewIfNeeded();
  if (testInfo.project.name === 'desktop') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const before = await arrowPosition();
    await link.hover();
    await expect(photo).toHaveCSS(
      'transform',
      'matrix(1.04, 0, 0, 1.04, 0, 0)',
    );
    await expect(link).toHaveCSS('outline-style', 'none');
    await expect(link).toHaveCSS('overflow', 'hidden');
    expect(await arrowPosition()).toEqual(before);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(photo).toHaveCSS('transform', 'none');
    await link.focus();
    await expect(link).toHaveCSS('outline-style', 'solid');
  }
  const box = await arrowPosition();
  await link.click({
    position: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  });
  await expect(page).toHaveURL(/\/services\/lampeopsaetning\/$/);
});

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
    const tags: Record<string, string> = {
      lampeopsaetning: 'Lamper',
      stikkontakter: 'Stikkontakter',
      'smart-home': 'Smart-home',
      'lysstyring-sensorer': 'Lysstyring',
      hvidevarer: 'Hvidevarer',
    };
    const tag = imageLink.locator('.catalogue-tag');
    await expect(tag).toHaveText(tags[service]);
    await tag.scrollIntoViewIfNeeded();
    const tagBox = (await tag.boundingBox())!;
    const linkBox = (await imageLink.boundingBox())!;
    expect(tagBox.x).toBeGreaterThan(linkBox.x);
    expect(tagBox.y).toBeGreaterThan(linkBox.y);
    expect(tagBox.x + tagBox.width).toBeLessThan(linkBox.x + linkBox.width);
    expect(tagBox.y + tagBox.height).toBeLessThan(linkBox.y + linkBox.height);
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

test('all six service descriptions select the matching enquiry type', async ({
  page,
}, testInfo) => {
  await page.goto('/#ydelser');
  const catalogue = page.getByRole('region', {
    name: 'Serviceydelser',
  });
  await expect(catalogue.getByRole('article')).toHaveCount(6);
  const choices = [
    ['bygningsautomatik', 'Bygningsautomatik'],
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
      await article.getByRole('link', { name: `Læs mere: ${name}` }).click();
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
  await expect(page.locator('#service option')).toHaveCount(8);
  await expect(page.locator('#service option').nth(1)).toHaveAttribute('value', 'bygningsautomatik');
  const imageSources = await catalogue
    .getByRole('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  expect(new Set(imageSources).size).toBe(6);
  await expect(catalogue).toContainText(
    'Vi udfører kun arbejde, der ikke kræver autorisation.',
  );
  await catalogue.screenshot({ path: testInfo.outputPath('catalogue.png') });
});

for (const serviceCase of [
  {
    slug: 'bygningsautomatik',
    title: 'Bygningsautomatik i Storkøbenhavn | Lys & Logik',
    description: /styring, energioverblik og drift/,
    question: 'Kan I udføre hele elinstallationen?',
    answer: 'Vi udfører kun arbejde, der ikke kræver autorisation.',
  },
  {
    slug: 'hvidevarer',
    title:
      'Tilslutning af hvidevarer med stikprop i Storkøbenhavn | Lys & Logik',
    description: /elektrisk tilslutning af kompatible hvidevarer/,
    question: 'Tilslutter I også vand og afløb?',
    answer: 'Her tilbyder vi alene den elektriske tilslutning.',
  },
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
    await page.locator('[data-consent-reject]').click();
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

test('building automation enquiry uses its native category and requires a customer description', async ({
  page,
}) => {
  await page.goto('/services/bygningsautomatik/');
  await page
    .locator('main')
    .getByRole('link', { name: 'Beskriv din opgave', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\?service=bygningsautomatik#kontakt$/);
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
    'bygningsautomatik',
  );
  await expect(page.getByLabel('Fortæl lidt om din idé')).toHaveValue('');
  await page.getByLabel('Dit navn').fill('Teknisk test');
  await page.getByLabel('Postnummer').fill('2600');
  await page.getByLabel('Din e-mail', { exact: true }).fill('test@example.com');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Prøv formularen' }).click();
  await expect(page.locator('#description-error')).toContainText(
    'Beskriv din opgave med 10–1.500 tegn.',
  );
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Ventilationen kører om natten.');
  await page.getByRole('button', { name: 'Prøv formularen' }).click();
  await expect(page.locator('#form-success')).toBeVisible();
  await page.goto('/?service=andet&topic=bygningsautomatik#kontakt');
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue(
    'bygningsautomatik',
  );
  await expect(page.getByLabel('Fortæl lidt om din idé')).toHaveValue('');
  await page.goto(
    '/?service=andet&topic=%3Cscript%3Eunknown%3C%2Fscript%3E#kontakt',
  );
  await expect(page.getByLabel('Fortæl lidt om din idé')).toHaveValue('');
  await expect(page.getByLabel('Hvad drejer det sig om?')).toHaveValue('andet');
});
