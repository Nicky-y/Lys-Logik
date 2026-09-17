import { expect, test } from '@playwright/test';

test('header call action follows About and stays usable on home and service pages', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  for (const path of ['/', '/services/hvidevarer/']) {
    await page.goto(path);
    if (mobile) await page.getByRole('button', { name: 'Åbn menu' }).click();
    const menu = page.getByRole('navigation', { name: 'Hovedmenu' });
    const call = menu.getByRole('link', {
      name: 'Ring +45 71 41 84 81',
      exact: true,
    });
    await expect(call).toHaveAttribute('href', 'tel:+4571418481');
    await expect(menu.getByRole('link').last()).toHaveText(
      'Ring +45 71 41 84 81',
    );
    expect(
      await call.evaluate(
        (element) => element.previousElementSibling?.textContent,
      ),
    ).toBe('Om os');
    await expect(call).toBeVisible();
    const primary = page.locator('main .button').first();
    await expect(call).toHaveCSS(
      'background-color',
      await primary.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
    await call.focus();
    await expect(call).toBeFocused();
    for (const width of mobile ? [320, 390, 768] : [861, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const box = (await call.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (!mobile) {
        const about = (await menu
          .getByRole('link', { name: 'Om os', exact: true })
          .boundingBox())!;
        expect(box.x).toBeGreaterThan(about.x + about.width);
      }
    }
    if (mobile) await page.getByRole('button', { name: 'Luk menu' }).click();
  }
  await page.setViewportSize(testInfo.project.use.viewport!);
  await page.goto('/');
  await page.locator('[data-consent-reject]').click();
  if (mobile) await page.getByRole('button', { name: 'Åbn menu' }).click();
  await page.screenshot({
    path: testInfo.outputPath('header-call-action.png'),
  });
});

test('header contact opens footer contact details on home and service pages', async ({
  page,
}, testInfo) => {
  for (const path of ['/', '/services/hvidevarer/']) {
    await page.goto(path);
    const menu = page.getByRole('navigation', { name: 'Hovedmenu' });
    await expect(
      menu.getByRole('link', { name: 'Beskriv din opgave', exact: true }),
    ).toHaveCount(0);
    await expect(
      menu.getByRole('link', { name: 'Pilotprojektet', exact: true }),
    ).toHaveCount(0);
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Åbn menu' }).click();
    await menu.getByRole('link', { name: 'Kontakt', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}#footer-kontakt$`));
    const contact = page.locator('#footer-kontakt');
    await expect(
      contact.getByRole('link', { name: '+45 71 41 84 81', exact: true }),
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
  await expect(footer).not.toContainText('Har du en opgave i tankerne?');
  await expect(
    footer.locator('.footer-contact-link svg[aria-hidden="true"]'),
  ).toHaveCount(2);
  await expect(footer).toContainText('Lys & Logik I/S');
  await expect(footer).toContainText('CVR 45 82 71 27');
  await expect(footer.locator('address')).toContainText('Tybjergparken 5');
  await expect(footer.locator('address')).toContainText('2660 Brøndby Strand');
  await expect(footer).toContainText(
    'Vi bygger Lys & Logik med godt elhåndværk som fundament',
  );
  await expect(footer).not.toContainText(/c\/o|Niclas Bundgaard/);
  await expect(footer).not.toContainText(/placeholder|Under etablering/i);
  await expect(
    footer.getByRole('link', { name: '+45 71 41 84 81', exact: true }),
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
