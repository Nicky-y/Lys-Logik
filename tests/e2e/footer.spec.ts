import { expect, test } from '@playwright/test';

test('header contact opens footer contact details on home and service pages', async ({
  page,
}, testInfo) => {
  for (const path of ['/', '/services/hvidevarer/']) {
    await page.goto(path);
    const menu = page.getByRole('navigation', { name: 'Hovedmenu' });
    await expect(
      menu.getByRole('link', { name: 'Pilotprojektet', exact: true }),
    ).toHaveCount(0);
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Åbn menu' }).click();
    await menu.getByRole('link', { name: 'Kontakt', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}#footer-kontakt$`));
    const contact = page.locator('#footer-kontakt');
    await expect(
      contact.getByRole('link', { name: '71 41 84 81', exact: true }),
    ).toBeInViewport();
    await expect(
      contact.getByRole('link', { name: 'kontakt@lysoglogik.dk', exact: true }),
    ).toBeInViewport();
    if (testInfo.project.name === 'mobile')
      await expect(page.locator('.menu-toggle')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
  }
});

test('footer provides real business details and working contact destinations', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Lys & Logik I/S');
  await expect(footer).toContainText('CVR 45 82 71 27');
  await expect(footer).toContainText('Storkøbenhavn');
  await expect(footer).toContainText(
    'Vi bygger Lys & Logik med godt elhåndværk som fundament',
  );
  await expect(footer).not.toContainText(
    /Niclas Bundgaard|Tybjergparken|2660|Brøndby Strand/,
  );
  await expect(footer).not.toContainText(/placeholder|Under etablering/i);
  await expect(
    footer.getByRole('link', { name: '71 41 84 81', exact: true }),
  ).toHaveAttribute('href', 'tel:+4571418481');
  await expect(
    footer.getByRole('link', { name: 'kontakt@lysoglogik.dk', exact: true }),
  ).toHaveAttribute('href', 'mailto:kontakt@lysoglogik.dk');

  await footer
    .getByRole('link', { name: 'Beskriv din opgave', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#kontakt$/);
  await expect(page.getByLabel('Dit navn')).toBeVisible();
});

test('footer links to the supplied profiles without loading social embeds', async ({
  page,
}) => {
  const thirdPartyRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /instagram\.com|facebook\.com|tiktok\.com|youtube\.com|trustpilot\.com/.test(
        request.url(),
      )
    ) {
      thirdPartyRequests.push(request.url());
    }
  });
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  const destinations = [
    ['Instagram', 'https://www.instagram.com/lysoglogik/'],
    ['Facebook', 'https://www.facebook.com/profile.php?id=61594299360677'],
    ['TikTok', 'https://www.tiktok.com/@lys_og_logik'],
    ['YouTube', 'https://www.youtube.com/@LysogLogik'],
    [
      'Find os på Trustpilot',
      'https://www.trustpilot.com/review/lysoglogik.dk',
    ],
  ];
  for (const [name, url] of destinations) {
    const link = footer.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', url);
    await expect(link.locator('svg')).toBeVisible();
    await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(link.locator('svg')).toHaveAttribute('focusable', 'false');
  }
  expect(thirdPartyRequests).toEqual([]);
});

test('footer stays usable on mobile, with zoom, and by keyboard', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  const privacy = footer.getByRole('button', { name: /Privatliv/ });
  await privacy.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(privacy).toBeFocused();

  await footer.screenshot({ path: testInfo.outputPath('footer.png') });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await footer.evaluate(
        (element) => element.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 720, height: 900 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(
    await footer.evaluate(
      (element) => element.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('footer preserves deliberate alignment at the compact desktop breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');

  const footer = page.getByRole('contentinfo');
  const headings = await Promise.all(
    ['Kontakt', 'Genveje', 'Følg med'].map((name) =>
      footer.getByRole('heading', { name, exact: true }).boundingBox(),
    ),
  );

  expect(headings.every((box) => box !== null)).toBe(true);
  const headingTops = headings.map((box) => box!.y);
  expect(Math.max(...headingTops) - Math.min(...headingTops)).toBeLessThan(2);

  const company = await footer.locator('.footer-company').boundingBox();
  expect(company).not.toBeNull();
  expect(company!.width).toBeGreaterThan(800);
  expect(company!.y + company!.height).toBeLessThanOrEqual(
    Math.min(...headingTops),
  );
});
