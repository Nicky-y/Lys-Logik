# Lys & Logik — arbejdsrum og kalender

Mobilvenlig intern app med Supabase-login, pipeline, søgning, sagsvisning, faglig vurdering, afventer-markering, interne noter, historik, ring-knap og fælles kalender. Astro-hjemmesiden ligger fortsat separat i `src/`.

## Åbn appen

**Installerbar app:** [lys-og-logik-app.mnbrom.workers.dev](https://lys-og-logik-app.mnbrom.workers.dev/). Åbn adressen i Chrome på Android, vælg **Installér app**, og følg vejledningen. Brug din eksisterende medarbejderkonto. Appen ligger hos Cloudflare og kræver ikke, at udviklingscomputeren er tændt.

Kør fra `website/`, eller dobbeltklik den tilsvarende startfil:

| Kommando                                      | Adresse                | Indhold                                     |
| --------------------------------------------- | ---------------------- | ------------------------------------------- |
| `npm.cmd run app:dev` / `START-APP.cmd`       | http://127.0.0.1:5173/ | Rigtige Supabase-data efter login           |
| `npm.cmd run app:demo` / `START-APP-DEMO.cmd` | http://127.0.0.1:5174/ | Fiktive sager uden login eller databasekald |

Prøvevisningen nulstilles ved genindlæsning. Den viser en fiktiv faglig medarbejder. Udviklingsserveren er sat til `0.0.0.0`, så telefoner på samme netværk kan åbne computerens lokale IP og port. Brug HTTPS-adressen ovenfor til installation på telefonen; den lokale HTTP-netværksadresse kan kun bruges til browserafprøvning.

`operations/.env.local` indeholder kun `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY`; se `.env.local.example`. Administrations-, server- og Turnstile-secrets må aldrig sættes som `VITE_*`. Buildkonfigurationen accepterer kun Supabases offentlige publishable-key-format. Miljøfilerne er ignoreret af Git.

## Adgang og workflow

Alle tre lokale migrationer er registreret i det hostede projekt: `20260908093333_lead_intake.sql`, `20260908160000_operations.sql` og `20260909034350_calendar.sql`. Kalendermigrationen blev lagt på 9. september 2026. Brugeren har selv gennemført den første appmigration og loginopsætning. Den 8. september 2026 er Niclas verificeret som aktiv `backoffice`. Ingen yderligere invitation er sendt fra denne implementering.

Login alene giver ingen kundeadgang: brugeren skal være aktiv i `staff_members`. `backoffice` kan følge og behandle sager samt tilføje noter. `technical` kan derudover registrere faglig vurdering. Rollen kontrolleres i databasen og kan ikke ændres af medarbejderen selv. Faglig godkendelse er påkrævet før status »Klar til aftale«.

Alle ændringer går gennem syv RPC-kommandoer: `change_lead_status`, `record_lead_review`, `set_lead_waiting`, `add_lead_note`, `create_lead_appointment`, `reschedule_lead_appointment` og `cancel_lead_appointment`. De bruger samme private kommandohåndtering og gemmer ændring, aktør, versionsnummer og historikhændelse i én transaktion. Noter føjes til historikken; kundens oprindelige indsendelse bevares. Arkivering/genåbning kræver en begrundelse.

Samme uafklarede genforsøg bruger samme kommando-id, så et tabt netværkssvar ikke gemmer en note to gange. Ved versionskonflikt skal medarbejderen gennemgå og acceptere den opdaterede version. Formularudkast bevares, mens sagen er åben; de gemmes ikke over en genindlæsning. Der er ingen automatisk sammenlægning af kunder eller henvendelser.

## Kalender

Menupunktet **Kalender** viser en fælles månedskalender og aftalerne for den valgte dag. En aftale åbner den tilknyttede sag. Opret aftalen fra en fagligt godkendt sag med status **Klar til aftale**; både backoffice og den faglige kan herefter oprette og håndtere aftalen.

En sag har højst én aktiv aftale. Oprettelse flytter sagen til **Aftaler**. Flytning bevarer aftalens id og gemmer før/efter samt begrundelse. Aflysning bevarer aftalen i historikken og sender sagen tilbage til afklaring, **Afventer os**. Arkivering af en sag med en aktiv aftale aflyser også aftalen atomisk. Databasen håndhæver sammenhængen mellem status og aktiv aftale.

Tidspunkter indtastes og vises i `Europe/Copenhagen`, uanset enhedens tidszone. Varighed er 1 minut til 24 timer, og aftaledatoer er begrænset til 2020–2100. Ikke-eksisterende eller tvetydige klokkeslæt ved skift mellem sommer- og vintertid afvises med forklaring. Kalenderen indlæser 100 aftaler ad gangen med mulighed for at hente flere.

Kalenderen sender endnu ingen kundemail og synkroniserer ikke med Google Calendar. I demoen er der både en eksisterende aftale og en godkendt sag, som kan bruges til at afprøve hele kalenderflowet.

## Kodeansvar

| Fil                                                     | Ansvar                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/main.tsx`                                          | Login, invitationslink, medarbejderkontrol og sammensætning         |
| `src/workspace.tsx`                                     | Pipeline og sagsvisning, formularer, fejl og genindlæsning          |
| `src/calendar.tsx`                                      | Månedskalender, dagsoversigt og aftaleformularer                    |
| `src/calendar-time.ts`                                  | Dansk tidszone, kalenderdage og validering af lokale klokkeslæt     |
| `src/gateway.ts`                                        | Validerede databasekald og genbrug af kommando-id ved genforsøg     |
| `src/random-id.ts`                                      | Kryptografiske UUID'er, også ved lokal HTTP-afprøvning              |
| `src/demo.ts`                                           | Isolerede fiktive data i hukommelsen                                |
| `../supabase/functions/_shared/contracts/operations.ts` | Zod-kontrakter, validerede identiteter og statusetiketter           |
| `../supabase/migrations/20260908160000_operations.sql`  | Autoritative rettigheder, workflowregler, transaktioner og historik |
| `../supabase/migrations/20260909034350_calendar.sql`    | Aftaler, kalenderkommandoer og atomisk sammenhæng med sagsstatus    |

React Query holder hentede kundedata i hukommelsen, som ryddes ved logout. Supabase gemmer login-sessionen lokalt til næste besøg. Service workeren gemmer kun en offentlig offlinebesked og et logo; ingen sager, API-svar eller offlinekø. Listen indlæses i portioner på 100; søgning og tal gælder de indlæste sager. Sagsvisningen viser op til 500 seneste historikhændelser med besked ved grænsen.

## Installation på Android og hosting

PWA'en har manifest med stabil appidentitet, standalone-visning, logo_v11 i 192/512 px og et maskable-ikon. **Installér app** vises ved login og i arbejdsrummet; demoen tilbyder ikke installation. Knappen bruger browserens installationsdialog, når den er tilgængelig, og viser ellers vejledning til Chrome på Android: menu → Føj til startskærm → Installér. Knappen skjules i standalone-visning.

Service workeren registreres kun i produktionsbuildet og på en sikker origin. Navigation og alle database-/loginkald bruger netværket. Åbning uden net viser en særskilt offlinebesked uden kundedata. Allerede åbne sager har fortsat netværksindikator og blokerede gem-handlinger offline. Der er ingen baggrundssynkronisering eller push i dette trin. Opdatering bruger hverken `skipWaiting` eller automatisk reload, så en åben indtastning ikke afbrydes; luk appens vinduer/faner og åbn den igen for at aktivere en ventende service worker.

**Udgivet 9. september 2026:** [https://lys-og-logik-app.mnbrom.workers.dev](https://lys-og-logik-app.mnbrom.workers.dev/). Cloudflare Workers Static Assets kører som `lys-og-logik-app` på konto `af5e7237c7fd2ab66d71c3ce2c02b70a`, under kontoens eksisterende `mnbrom.workers.dev`. Konfigurationen ligger i `wrangler.jsonc`. Verificeret deploymentversion: `58cc83b7-4f21-4190-9927-0873ff8d299b`.

OAuth er godkendt med **Workers Scripts Write** (`workers_scripts:write`), `account:read` og `user:read`. Scope `workers:write` alene er utilstrækkeligt. Brug det projektspecifikke login-script ved behov for ny adgang; `--device` giver fem minutter til godkendelse uden en lokal callbackserver. De tidligere API-nøgler i website-miljøfilen anvendes ikke til appudgivelse.

Kør fra `website/` ved fremtidige udgivelser (login er kun nødvendigt, hvis adgang mangler):

```powershell
npm.cmd run app:cloudflare:login -- --device
npm.cmd run app:deploy
```

`cloudflare.mjs` kører Wrangler fra `operations/` med appens miljøfil, så website-miljøfilens serverhemmeligheder ikke indlæses. OAuth-oplysninger og logs ligger under den Git-ignorerede `.npm-cache/`. Et eventuelt eksplicit `CLOUDFLARE_API_TOKEN` i shellmiljøet tager forrang over OAuth; fjern det fra denne shell, hvis OAuth skal bruges. Upload omfatter kun `operations/dist/`. De eneste Supabase-oplysninger i browserbuildet er den offentlige URL og publishable key. Kundeadgang kræver stadig aktiv medarbejderrolle gennem Supabase RLS.

Den offentlige adresse er verificeret med HTTP 200 for app, manifest, service worker, offlinevisning og ikoner, korrekte sikkerheds-/cacheheaders og ingen installationsfejl fra browserens kontrol i en separat profil. Offlineåbning og efterfølgende onlineåbning består uden JavaScript-fejl. Offlinefallbacken returnerer en ny response fra det gemte indhold, så Cloudflares kanoniske `.html`-viderestilling ikke blokerer offline-navigation; den samme viderestilling indgår nu i browsertestserveren.

Supabase Auth `site_url` er ændret fra `http://localhost:3000` til den offentlige appadresse; øvrige redirectindstillinger er bevaret. Anonym læsning af `leads`, `appointments` og `staff_members` er verificeret afvist på den hostede database. Rigtige loginoplysninger er ikke brugt til automatiske tests. Login og selve installationen på brugerens fysiske Android-telefon afprøves af brugeren. Der kræves ingen ny databasemigration for PWA-delen.

Referencer: [MDN: installation af PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/) og [rettighed til Workers-subdomæne](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/update/).

## Kontrol

```powershell
npm.cmd test
npm.cmd run app:build
npm.cmd run test:e2e:app
npm.cmd run test:e2e:pwa
```

Integrationstests kører de rigtige migrationer i PGlite og kontrollerer roller/RLS, versionskonflikter, genforsøg, originaldata og atomisk rollback. Browsertests bruger Supabase-klienten mod en lokal Auth/PostgREST-testadapter med den samme PostgreSQL-database. Testene sender ingen invitationer og bruger ingen rigtige loginoplysninger. De dækker desktop og emuleret Android, tabte svar, konfliktvisning, logout, faglig adgang samt automatiske WCAG-kontroller. Fysisk Android og det samlede driftsflow skal stadig afprøves.

Efter PWA-delen består 67 unit-/integrationstests, 16 app-browsertests og 8 PWA-browsertests. PWA-testene bruger et produktionsbuild med de samme headers som hostingkonfigurationen, en lokal Supabase-testadapter og både desktop og emuleret Android. De kontrollerer manifest/installérbarhed i en separat browserprofil uden inkognito, tilgængelig installationsdialog, afvist installation, login efter genåbning, offlinevisning uden kundedata, logout og en ventende opdatering uden tab af åbent udkast. Der er ikke oprettet rigtige kundeaftaler som led i testen.

`app:build` bygger til `operations/dist/`, og `app:deploy` udgiver appen via Cloudflare. Den eksisterende GitHub Pages-workflow bygger fortsat kun den offentlige Astro-hjemmeside.

## Resterende V0

P2 mangler kundemail frem og tilbage, billedskabelon/vedhæftninger, push og fysisk afprøvning af PWA'en. Kalenderdelen af P3 er implementeret; markering af udført, faktureret og betalt samt samlet afprøvning på begge Android-telefoner mangler. De resterende pipelinekolonner er synlige, men overgangene åbnes først med de nødvendige funktioner. Outbox fra lead-modtagelsen sender endnu ikke mail eller push.
