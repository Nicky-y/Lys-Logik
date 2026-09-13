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
