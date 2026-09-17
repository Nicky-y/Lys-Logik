# Website statistics and consent

Measurement ID: `G-PK63ZEEQM9`. The earlier IDs are not used by this implementation.

## Boundary

Only the public Astro Layout initializes analytics. The operations app, lead
contracts, Supabase functions and database do not depend on analytics. A visitor
can submit an enquiry without accepting statistics. Form values and retry keys
remain in memory and are not copied to browser storage to support analytics.

`analytics-consent.ts` owns decision validation and URL sanitization;
`analytics.ts` owns browser consent state and the Google adapter. The components
explain the decision and expose buttons. No additional analytics framework is used.

## Consent lifecycle

- Basic Consent Mode: Google is not loaded before a valid, persisted grant.
- Advertising consent (`ad_storage`, `ad_user_data`, `ad_personalization`) stays denied.
- The v2 localStorage key asks again after the provider/cookie disclosure changed.
- Choices expire after 180 days. Storage, page restoration and visibility events
  revalidate the decision; unavailable storage fails closed for the document.
- Withdrawal sets Google's `ga-disable-G-PK63ZEEQM9` before updating consent and
  deleting the site's GA cookies. It never reloads or persists the enquiry form.
- The loaded Google runtime remains in memory. Removing a script cannot unload
  listeners. Reacceptance updates consent without injecting another script/config
  or counting the same page again. Already transmitted data cannot be recalled.
- Failed writes stop analytics and attempt to remove the previous stored grant.
  If all browser storage operations are blocked, persistence across future visits
  cannot be guaranteed; the banner reports the failure rather than claiming success.
- Local previews do not contact Google. The production allowlist is HTTPS
  `lysoglogik.dk` and the legacy `/Lys-Logik/` site on `nicky-y.github.io`.

The explicit page view includes only a known public route, no query string,
fragment or referrer. There are no explicit form, phone or email tracking events.

## Printed form links

- Permanent print URL: `https://lysoglogik.dk/visitkort/formular`.
- General QR URL: `https://lysoglogik.dk/qr/formular`.
- Both forms, with or without a trailing slash, use HTTP 302 redirects on
  Cloudflare. `public/_redirects` defines the rules; artifact checks keep them
  aligned with the portable destinations in `form-entry.ts`.
  Astro also builds meta-refresh fallback pages for portable static hosting.
- Destinations are `/?via=visitkort#formular` and `/?via=qr#formular`.
  The anchor targets the form card itself, including on mobile. Request query
  parameters cannot choose a destination or override the source.
- On a consented landing page, the Google config receives `campaign_source`
  (`visitkort` or `qr`), `campaign_medium` (`qr`) and `campaign_name`
  (`kontaktformular`). Only these constants are accepted. Unknown, repeated or
  off-route `via` values produce no campaign data. Arbitrary UTM data and form
  values are not forwarded. Page location still excludes all query/hash data.
- No extra browser storage, scan counter, tracking endpoint, per-card identity
  or lead/database attribution is added. A source is read from the current
  landing URL when analytics starts. Navigating away before consenting loses
  this landing source; declining consent never blocks the form.
- GA4 Traffic acquisition can be broken down by Session source/medium and
  Session campaign. The custom `qr` medium need not fit a default channel group;
  use those source/medium dimensions. Counts are consented visits via the link,
  not proof of physical scans or distinct people. Forwarded links count too.
- Change the destination in `form-entry.ts` if the form moves, while retaining
  both printed paths. Publish and run `scripts/verify-website.mjs` before print.

References:
- https://support.google.com/analytics/answer/11259997?hl=en
- https://developers.cloudflare.com/workers/static-assets/redirects/

### QR release verified, 2026-09-17

- Six focused unit tests and twelve production artifact checks passed; Astro
  checked 132 files with no errors or warnings.
- Eight QR/campaign browser cases passed on desktop/mobile after correcting the
  mock-redirect isolation issue documented in BUG-017. The sixteen existing
  consent cases passed in the preceding run.
- Deployed website Worker version `1e51fe32-07ca-4fd6-971b-90cd10f41b1c`.
  `scripts/verify-website.mjs` passed on `https://lysoglogik.dk`, including exact
  302 destinations, slash variants, query stripping and deployed asset matching.
- Real public pages were opened with a mobile viewport for both entry links.
  The form heading appeared without manually scrolling. No Google tag loaded
  before consent. After consent, the real Google library produced `page_view`
  requests with the correct `cs`, `cm`, `cn` and sanitized `dl` fields.
- Those collection requests were intercepted and aborted, so test visits were
  not inserted into GA4. The reporting dashboard itself was not verified.
- No enquiries were submitted, no QR artwork changed, and no Git commit/push
  was performed. The previously approved footer address shipped in this build.

## Google configuration and release check

Disable **Enhanced Measurement** for this exact stream in GA4. Server-configured
automatic form/outbound/history events are not controlled by the explicit page-view
code. Do not enable ad consent to silence the 0% `ad_user_data` warning: that warning
is consistent with statistics-only use.

Tests mock Google's network boundary, so they verify our integration contract,
not Google's service or current dashboard configuration. Before claiming production
verification, inspect the correct stream and check Tag Assistant / Realtime after
consent. Verify no collection before consent and after withdrawal. Do not submit
customer enquiries just to test analytics.

## Verification

```sh
node --test tests/analytics-consent.test.ts
npm run build
npm run test:e2e:analytics
```

The browser tests serve built public assets under a simulated production origin,
block external traffic, and cover rejection, grant, withdrawal, regrant, cookie
removal, preserved input, cross-tab withdrawal, expiry, malformed/old consent,
storage failures and mobile disclosure. Edge is used consistently with the existing
website test setup.

### Verified locally, 2026-09-13

- Astro check: 91 files, no errors or warnings; six-page production build and
  nine artifact checks passed.
- `node --test tests/analytics-consent.test.ts tests/lead.test.ts`: 13 passed.
- `npm run test:e2e:analytics`: 16 browser cases passed on desktop and mobile.
- Existing website tests selected by `complete demo|FAQ and privacy|accessible
  form errors|WCAG`: eight passed. The initial mobile footer obstruction was
  reproduced, fixed with responsive space below the fixed banner, and retested.
- Original grant → fill form → withdraw reproduction now preserves both the
  input and document; regrant does not duplicate the page-view/config commands.
- No deployment or GA dashboard changes were performed as part of this fix.

References:
- https://developers.google.com/tag-platform/security/guides/privacy
- https://developers.google.com/tag-platform/security/guides/consent
- https://support.google.com/tagmanager/answer/14681508
