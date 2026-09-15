# BUG-006 — Logout kunne efterlade en brugbar session

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret; udgivet |
| Fundet | 2026-09-15 |
| Område | App / autentifikation |
| Berørt version og miljø | `2d42598` samt lokale invitationsændringer; Supabase JS/Auth 2.116.0 |
| Påvirkning | En anden bruger af samme browserprofil kunne genåbne medarbejderens session efter tilsyneladende logout |
| Rettelse | `5a4c373` — Fix persisted logout sessions and cross-tab cleanup |
| Udgivelse | 2026-09-15 kl. 16:32 UTC på `app.lysoglogik.dk`; Cloudflare-version `c5eee770-3722-4d44-bd89-c1d80f795277` |

## Symptom og bekræftet årsag

Appens `main.tsx` afventede `auth.signOut({ scope: 'local' })`, ignorerede resultatets fejl og ryddede derefter alene React-sessionen og forespørgselscachen.

Den installerede Supabase-klient læser sessionen som led i logout. Er tokenet udløbet, forsøger klienten at forny det. En midlertidig fejl her bevarer den gemte session og returneres før SDK'ets lokale oprydning. Appen viste derfor login, selv om browseren stadig indeholdt brugbare loginoplysninger.

Afgrænsning: En netværksfejl fra selve `/logout` rydder allerede den lokale session i SDK 2.116.0. Det bekræftede hul ligger i den tidligere tokenfornyelse. `getSession()` med både `session: null` og en fejl er ikke bevis for, at lageret er ryddet.

## Reproduktion

Med den rigtige installerede SDK, fiktive tokens, hukommelseslager og simuleret HTTP: gem en udløbet session, returnér 503 på tokenfornyelse, og kald logout. SDK'et returnerer en fejl; den gemte session overlever. En ny klient kan genåbne sessionen, når tokenfornyelsen igen lykkes. Ingen produktionskald eller rigtige loginoplysninger blev brugt.

## Løsning

- [auth-session.ts](../operations/src/auth-session.ts) ejer appens auth-lager. Første indlæsning genbruger Supabases hidtidige nøgle, så eksisterende login og invitationslinks virker.
- Normal server-logout og deaktivering af push forsøges fortsat. Derefter udføres lokal oprydning uafhængigt af returnerede eller kastede auth-fejl.
- Logout skifter lagergeneration og rydder projektets session-, bruger- og PKCE-nøgler. Gamle klienter må ikke gemme til den nye generation. Et sent refresh-svar kan således ikke genskabe sessionen eller overskrive et efterfølgende login. SDK'ets BroadcastChannel bruger også den aktuelle generations nøgle.
- `main.tsx` skjuler kundearbejdsrummet under logout, invaliderer igangværende profilopslag og rydder cache. Først efter verificeret oprydning genindlæses appen med en ny klient. Andre faner reagerer på logout-markøren. Invitations-/recovery-data fjernes fra URL'en ved genindlæsning.
- Kan lageret ikke ryddes, bliver en tydelig fejl og mulighed for at prøve igen stående. Et midlertidigt login i hukommelsen beholder ansvaret for også at rydde eventuelle ældre disk-sessioner; utilgængeligt lager tæller aldrig som bekræftet logout.
- Andre projekters login og øvrige browserindstillinger slettes ikke.

## Verifikation

Kontrolleret 2026-09-15 med fiktive data. De fokuserede tests findes i [auth-session.test.ts](../tests/auth-session.test.ts) og [logout.spec.ts](../tests/e2e-operations/logout.spec.ts).

1. Diffkontrol og `tsc -p operations/tsconfig.json --noEmit`: bestået. `ASTRO_TELEMETRY_DISABLED=1` + `astro check`: 126 filer, ingen fejl, advarsler eller hints.
2. `node --test tests/auth-session.test.ts`: alle 8 bestået. Den oprindelige fejl demonstreres først gennem SDK'et alene; efter appens oprydning kræver en ny klient login og foretager ingen tokenfornyelse. Sen tokenfornyelse og et nyt legitimt login afprøves gennem den faktiske SDK.
3. `npm test`: alle 180 unit-/integrationstests bestået. `npm run test:e2e:app -- tests/e2e-operations/logout.spec.ts tests/e2e-operations/app.spec.ts --grep 'logout|backoffice logs in'`: alle 16 bestået på desktop og Android-emulering. Den første kørsel af logout- og invitationstests bestod også alle 14 scenarier; heraf 8 eksisterende kontroller af invitationsflowet.
4. `npm run test:e2e:pwa -- tests/e2e-pwa/install.spec.ts --grep 'login survives reopening'`: begge bestået mod bygget app med service worker, herunder offline-start uden kundedata og logout efter genåbning. Testen venter nu på færdigt logout, før den genindlæser.
5. `npm run app:build`: bestået. Den eksisterende advarsel om JS-chunks over 500 kB er fortsat til stede; ingen bundle-optimering indgår i denne rettelse.

En tidligere browserkørsel ramte en tidsgrænse; efterfølgende kontroller bestod uden at hæve grænsen. Observationen og den uafklarede årsag står i [BUG-010](BUG-010-intermitterende-timeout-i-logout-browsertest.md).

De dækker den oprindelige SDK-fejl, normal lokal server-logout, nyt login, samtidige faner, igangværende tokenfornyelse, skrivning over en generationsændring, push-/auth-fejl og lagerfejl. Browserkontrol bruger lokalt API, syntetiske data og desktop/Android-emulering.

En separat reviewer fandt under arbejdet, at en simpel memory-fallback ved skrivefejl kunne overse en ældre disk-session. Rettelsen kræver derfor også disk-oprydning fra fallback-forløbet. En dedikeret browserregression bevarer en ældre session, simulerer kvotefejl, kræver synlig logout-fejl og afprøver nyt forsøg, når lageradgangen vender tilbage.

En supplerende regression afslørede, at en midlertidig fane også skal reagere direkte på browserens logout-markør: dens eget hukommelseslager ændrer sig ikke, når en anden fane logger ud. Reproduktionen starter fra et tidligere gennemført logout, så fanerne har forskellige SDK-kanaler. Testen fejlede før rettelsen af storage-event-håndteringen; kontrollen dækker således mere end SDK'ets normale BroadcastChannel-besked.

## Begrænsninger

Lokal logout lover ikke tilbagekaldelse af tokens på Supabases server under netværksfejl. Allerede afsendte API-kald kan ikke trækkes tilbage. Andre enheder logges ikke ud (`scope: local` bevares). Gamle appversioner i allerede åbne faner skal genindlæses ved udrulning for at få den nye oprydningsadfærd. Selve logout-forløbet er afprøvet med syntetiske data lokalt, ikke med en fysisk telefon eller en produktionskonto.

## Udgivelseskontrol

Udgivelsen blev bygget fra en afgrænset kopi af `5a4c373`, uden de separate lokale invitationsændringer. Alle 258 tracked filer blev sammenlignet med committen; eneste forskel var Windows-linjeskift i 205 filer. På denne kopi bestod de 8 auth-tests, appens TypeScript-/Vite-build og alle 16 fokuserede app-browsertests igen. Den midlertidige testkopis delte `node_modules` gav Vite-advarsler om fontadgang i udviklingsserveren; de berørte ikke logout-kontrollerne eller produktionsbuildet.

Cloudflare dry-run bestod. Efter deploy viste API'et version `c5eee770-3722-4d44-bd89-c1d80f795277` med 100 % trafik og beskeden `5a4c373 - Fix persisted logout sessions and cross-tab cleanup`. Det eksisterende custom domain var fortsat aktivt. Offentlige HTTP-kald gav 200, og HTML, hoved-JavaScript, CSS, service worker, manifest, offline-side og 192 px-ikon matchede buildets bytes. Kontrollen ændrede ingen kundedata. Committen blev ikke pushet i denne arbejdsgang.

## Historik

- 2026-09-15: Rapporteret i sikkerhedsgennemgang, uafhængigt reproduceret og rettet lokalt som første særskilte sikkerhedsrettelse.
- 2026-09-15: Committet som `5a4c373`, bygget separat og udgivet. Netværkssandboxen gav først `EACCES`/`fetch failed` ved Wrangler-login; eksisterende login og deploy virkede med godkendt netværksadgang. Ingen ændring af appens credentials eller deploykonfiguration var nødvendig.
