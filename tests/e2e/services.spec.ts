import { expect, test } from '@playwright/test';

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
    if (page.viewportSize()!.width <= 600) {
      expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(headingBox!.y);
    } else {
      expect(imageBox!.x + imageBox!.width).toBeLessThan(headingBox!.x);
    }
    await expect(
      catalogue.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await catalogue
      .getByRole('link', { name: `Beskriv din opgave: ${name}`, exact: true })
      .click();
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
