import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { site } from '../../src/data/site';

test('pilot offer presents readable terms and a contrasting action in every interaction state', async ({
  page,
}) => {
  await page.goto('/#pilot');
  const pilot = page.getByRole('region', {
    name: 'Få hjælp til dit hjem. Hjælp os godt fra start.',
  });
  await expect(pilot).toBeVisible();
  await expect(pilot).toContainText(`${site.pilotPlaces} udvalgte projekter`);
  await expect(pilot.locator('.pilot-hours')).toContainText(
    `${site.pilotHours} timers arbejde`,
  );
  await expect(pilot.locator('.pilot-hours')).toContainText(
    '0 kr. i arbejdsløn',
  );
  await expect(pilot).toContainText('Materialer og evt. lejeudstyr.');
  await expect(pilot).toContainText(
    `Arbejde ud over de ${site.pilotHours} timer kræver en særskilt aftale.`,
  );
  await expect(pilot).toContainText('efter aftale med dig');
  await expect(pilot).toContainText('referencecase');
  await expect(pilot.locator('a.button')).toHaveCount(1);
  const action = pilot.locator('a.button');
  for (const state of ['default', 'hover', 'focus']) {
    if (state === 'hover') await action.hover();
    if (state === 'focus') {
      await page.mouse.move(0, 0);
      await action.focus();
      await expect(action).toBeFocused();
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('#pilot')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
      state,
    ).toEqual([]);
  }
});

test('pilot action reaches the ordinary form without changing an existing draft', async ({
  page,
}) => {
  await page.goto('/#kontakt');
  const choice = page.getByRole('checkbox', {
    name: /Jeg vil gerne komme i betragtning/,
  });
  await expect(choice).not.toBeChecked();
  await expect(choice).not.toHaveAttribute('required');
  await expect(page.locator('#enquiry-form input').first()).toHaveAttribute(
    'id',
    'pilotRequested',
  );
  await page.getByLabel('Dit navn').fill('Anna Jensen');
  await page
    .getByLabel('Fortæl lidt om din idé')
    .fill('Vi vil gerne have hjælp til vores lamper.');
  await page.locator('#pilot').scrollIntoViewIfNeeded();
  const action = page.getByRole('link', { name: 'Foreslå et pilotprojekt' });
  await expect(action).toHaveAccessibleDescription(
    'Pilotønsket markeres i formularen. Henvendelsen er uforpligtende.',
  );
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#kontakt$/);
  await expect(page.getByLabel('Dit navn')).toHaveValue('Anna Jensen');
  await expect(page.getByLabel('Fortæl lidt om din idé')).toHaveValue(
    'Vi vil gerne have hjælp til vores lamper.',
  );
  await expect(choice).toBeChecked();
  await choice.focus();
  await page.keyboard.press('Space');
  await expect(choice).not.toBeChecked();
});

test('pilot terms and action fit narrow screens and enlarged text', async ({
  page,
}, testInfo) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#pilot');
    await page.evaluate(() => document.fonts.ready);
    const bounds = await page
      .locator('#pilot .pilot-copy, #pilot .pilot-offer, #pilot .pilot-action')
      .evaluateAll((elements) =>
        elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: el.clientWidth,
            contentWidth: el.scrollWidth,
          };
        }),
      );
    for (const box of bounds) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.contentWidth).toBeLessThanOrEqual(box.width);
    }
  }
  await page.setViewportSize({ width: 720, height: 1000 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const overflowing = await page
    .locator('#pilot')
    .evaluate((el) =>
      [...el.querySelectorAll('*')]
        .filter(
          (item) =>
            item.scrollWidth > item.clientWidth + 1 &&
            getComputedStyle(item).display !== 'inline',
        )
        .map((item) => item.className),
    );
  expect(overflowing).toEqual([]);
  await page.setViewportSize(testInfo.project.use.viewport!);
});
