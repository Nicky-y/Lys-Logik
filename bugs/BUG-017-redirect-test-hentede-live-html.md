# BUG-017 — Mocked redirect-test hentede live HTML

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-17 |
| Område | Browser-tests / hjemmeside |
| Berørt version og miljø | Lokalt QR-link-slice, ikke committet; Playwright og Edge |
| Påvirkning | Testen blandede gammel live HTML med nye lokale assets og gav misvisende fejl |
| Rettelse | Commit `Add QR form links and publish business address` (2026-09-17) |
| Udgivelse | Testrettelse; ingen produktionsrettelse nødvendig |

## Symptom

Forventet: QR-testen bruger kun det lokale produktionsbuild og blokerer eksterne tjenester.
Observeret: Formularens overskrift var uden for skærmen; mobiltesten kunne ikke trykke på samtykkeknappen.

## Reproduktion og evidens

`tests/e2e-analytics/consent.spec.ts` opfyldte en interceptet forespørgsel til
`/visitkort/formular` med HTTP 302 og `Location: /?via=visitkort#formular`.
En isoleret reproduktion viste kun interception af den første adresse. Slutresponsen
havde en `cf-ray`-header og gammel HTML uden `id="formular"`. Stilarter fra den
gamle live-side fandtes ikke i det lokale build og fik 404 fra testens filserver.
Fem af de otte nye cases fejlede; de eksisterende samtykkecases bestod.

## Årsag

Browserens næste forespørgsel efter den opfyldte HTTP-redirect gik uden om
Playwright-interceptionen. Det var en testisolationsfejl, ikke dokumentation for
en fejl i formularens layout. Der blev ikke sendt kundehenvendelser.

## Løsning

Testen serverer nu de faktisk byggede meta-refresh-sider for de to indgange.
Den efterfølgende navigation bliver interceptet og serveret fra samme build.
Cloudflares HTTP 302-regler kontrolleres særskilt af `scripts/verify-website.mjs`,
inklusive slutdestination og kassering af uvedkommende query-parametre.

## Verifikation

2026-09-17: Alle otte nye QR-/kampagnecases bestod efter rettelsen på desktop og
mobil. De 16 eksisterende samtykkecases bestod i den oprindelige kørsel.
Efter udgivelse blev Cloudflares 302-regler, begge slash-varianter og kassering
af fremmede query-parametre kontrolleret offentligt. En særskilt mobilkontrol
af den rigtige side bekræftede formularplacering og Googles faktiske payload
med `cs=visitkort`/`cs=qr`, `cm=qr`, `cn=kontaktformular` og renset `dl`.
Målekaldene blev opfanget og blokeret; ingen testbesøg blev tilføjet GA4.

## Forebyggelse

Brug ikke `route.fulfill({ status: 302 })` til at simulere isolerede navigationskæder.
Kontrollér både den genererede fallback og den faktiske hosts HTTP-adfærd.
