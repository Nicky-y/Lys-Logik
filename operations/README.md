# Lys & Logik — arbejdsrum og kalender

Mobilvenlig intern app med Supabase-login, pipeline, søgning, sagsvisning, faglig vurdering, afventer-markering, interne noter, historik, ring-knap og fælles kalender. Astro-hjemmesiden ligger fortsat separat i `src/`.

## Åbn appen

**Installerbar app:** [app.lysoglogik.dk](https://app.lysoglogik.dk/). Åbn adressen i Chrome på Android, vælg **Installér app**, og følg vejledningen. Brug din eksisterende medarbejderkonto. Appen ligger hos Cloudflare og kræver ikke, at udviklingscomputeren er tændt.

Kør fra `website/`, eller dobbeltklik den tilsvarende startfil:

| Kommando                                      | Adresse                | Indhold                                     |
| --------------------------------------------- | ---------------------- | ------------------------------------------- |
| `npm.cmd run app:dev` / `START-APP.cmd`       | http://127.0.0.1:5173/ | Rigtige Supabase-data efter login           |
| `npm.cmd run app:demo` / `START-APP-DEMO.cmd` | http://127.0.0.1:5174/ | Fiktive sager uden login eller databasekald |

Prøvevisningen nulstilles ved genindlæsning. Den viser en fiktiv ejer med faglig arbejdsrolle. Udviklingsserveren er sat til `0.0.0.0`, så telefoner på samme netværk kan åbne computerens lokale IP og port. Brug HTTPS-adressen ovenfor til installation på telefonen; den lokale HTTP-netværksadresse kan kun bruges til browserafprøvning.

### Nyt menudesign til lokal gennemgang

Start `npm.cmd run app:demo`, og åbn [menuforhåndsvisningen](http://127.0.0.1:5174/ui.html#/sager). Den har tomme sider, venstremenu og mobilmenu. Den røde prik i indbakken og profilen er visuelle eksempler; visningen indlæser ingen kundedata og foretager ingen API-kald.

`src/shell/app-shell.tsx` er selve præsentationsrammen, som senere kan modtage indhold gennem `children`. `src/shell/preview.tsx` vælger foreløbige sider gennem URL-hashen. Den separate udviklingsindgang `ui.html` indgår ikke i produktionsbuildet. Den eksisterende app starter fortsat i `index.html`.

Kontrollér navigation, mobilmenu og tilgængelighed med `npx playwright test --config playwright.shell.config.ts`. Testene starter en isoleret lokal server på port 5178.

`operations/.env.local` indeholder kun `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY`; se `.env.local.example`. Administrations-, server- og Turnstile-secrets må aldrig sættes som `VITE_*`. Buildkonfigurationen accepterer kun Supabases offentlige publishable-key-format. Miljøfilerne er ignoreret af Git.

## Adgang og workflow

### Lokal logout

`src/auth-session.ts` ejer Supabase-sessionens browserlager. Et gennemført logout rydder projektets auth-nøgler og skifter lagergeneration, så gamle faner og sene tokenfornyelser ikke kan genskabe et login. Fanerne genindlæses med en ny auth-klient; eksisterende sessioner fra før ændringen læses fortsat ved første indlæsning. Andre browserdata røres ikke.

Normal server-logout med `scope: local` og push-deaktivering forsøges, men netværksfejl må ikke forhindre lokal oprydning. Servertilbagekaldelse under offlineforhold kan ikke garanteres. Hvis browseren ikke tillader oprydning, vises en logout-fejl i stedet for en succesfuld login-skærm. Det gælder også midlertidige logins i hukommelsen, hvor ældre sessioner på disk stadig skal ryddes. Se [BUG-006](../bugs/BUG-006-logout-kunne-bevare-session.md) for evidens og afgrænsning.

### Kundesamtale på den enkelte sag

**Kundesamtale** nederst til højre åbner en chatboks med den eksisterende kundemail. Kunden modtager en mail og svarer på sagens Reply-To; afsendelse, rettigheder, routing og leveringsstatus bruger fortsat de eksisterende servergrænser. Det gælder både Indbakke og Sager. At åbne eller skrive i chatten flytter ikke sagen.

**Billeder** ved *Kundens opgave* åbner direkte billedoversigten i chatten. Den viser kundens tilladte JPG-, PNG- og WebP-filer fra de hentede beskeder, inklusive en advarsel ved afvigende afsender. Samtalen viser også øvrige vedhæftninger med de eksisterende type- og størrelsesgrænser. Billeder nær det synlige område hentes automatisk gennem `customer-attachment`; stor visning og download genbruger den hentede fil. Knappen til ældre beskeder gør billeder længere tilbage i historikken tilgængelige uden at hente hele arkivet på én gang.

Chatten henter først beskeder, når den åbnes, og opdaterer hvert 15. sekund, mens den er åben og online. Minimering bevarer kladde og idempotensnøgle ved usikker afsendelse, men stopper polling og frigiver billedvisningernes blob-URL'er. Kladder gemmes kun i hukommelsen, mens sagen er åben; lukning af sagen, genindlæsning og logout kasserer dem. En anden sag får sin egen samtale og kladde. Besked- og billeddata skrives ikke til en ny browser- eller PWA-cache.

Prøvevisningen har fiktive beskeder og et eksempelbillede. Afsendelse her ændrer kun data i hukommelsen og sender ingen rigtig mail. UI-ændringen kræver ingen ny migration eller mailkonfiguration; de eksisterende adgangs- og mailmigrationer skal være installeret i et live-miljø.

Kontroller: `node --test tests/conversation-model.test.ts tests/mail.test.ts tests/mail-attachment.test.ts tests/mail.integration.test.ts`, `npm run test:e2e:app -- chat.spec.ts mail.spec.ts` og `npm run test:e2e:pwa -- mail-preview.spec.ts`. Browsertestene bruger syntetiske data og et lokalt API med de faktiske migrationsfiler. Mailtransport og billedsvar simuleres; de beviser ikke en ny ekstern maillevering.

### Ejerrettigheder og arbejdsrolle

Adgangen har to uafhængige felter: `is_owner` giver medarbejderadministration; `role` giver arbejdsfunktioner. Arbejdsrollen vælges fra den fælles kontrakt i `supabase/functions/_shared/contracts/staff.ts`: **Backoffice** (`backoffice`), **Faglig** (`technical`) eller **Ingen arbejdsrolle** (`null`). Ejerrettigheder tilføjer aldrig en arbejdsrolle. Databasen afviser andre rolleværdier; nye roller kræver en bevidst kontrakt-, rettigheds- og migrationsændring.

En aktiv ejer kan under **Indstillinger → Medarbejdere og rettigheder** ændre eksisterende medarbejderes arbejdsrolle og ejerrettigheder. Almindelige medarbejdere ser kun deres egen adgang. En ejer uden arbejdsrolle kan administrere medarbejdere, men kan ikke læse kundesager, kalender eller kundemail, skrive noter, godkende fagligt eller modtage kundenotifikationer. Faglig godkendelse kræver fortsat `technical`. En konto med hverken ejerrettigheder eller arbejdsrolle får ingen af disse funktioner.

`set_staff_access` kontrollerer aktiv ejeradgang i databasen. Ændringer bruger versionskontrol og et stabilt kommando-id ved tabte svar. Før/efter, aktør og tidspunkt registreres atomisk i `staff_access_events`. Konflikter kræver ny gennemgang, og den sidste aktive ejer kan ikke fratages ejeradgangen eller deaktiveres. Rettighedsændringer serialiseres før låsning af medarbejderrækker. Profilen kontrolleres ved login, ved tilbagevenden til appen og hvert 30. sekund i forgrunden; ændrede rettigheder rydder tidligere indlæste forespørgsler. Serverkontrollen gælder ved hvert nyt kald.

**Udrulning:** Anvend først `20260915000400_staff_access.sql` (efter indbakkemigrationen), og kør derefter `supabase/operations/bootstrap-owner.sql` fra det betroede SQL-kontrolpanel. Scriptet udpeger alene den eksisterende aktive konto `mnbrom@gmail.com` som første ejer og bevarer arbejdsrollen. Ingen konto bliver ejer automatisk gennem login, e-mail eller brugermetadata. Funktionen til første ejer er utilgængelig for almindelige brugere. Udgiv appen efter migration og ejeropsætning. Disse ændringer er forberedt lokalt; denne sektion er ikke dokumentation for udført produktionsdeploy.

Prøvevisningen viser en fiktiv ejer med faglig arbejdsrolle og en ekstra fiktiv backoffice-medarbejder. Ændringer kan afprøves på `http://127.0.0.1:5174/#/indstillinger` og nulstilles ved genindlæsning. Oprettelse af nye konti og afsendelse af invitationer (**Opret medarbejder**) kommer i næste slice; denne ændring administrerer eksisterende konti.

### Indbakke og manuel overførsel

Appen åbner i **Indbakke** (`#/indbakke`), som kun viser status `new`. Læsning, noter, e-mails og billeder flytter ikke henvendelsen. **Flyt til Sager** bruger den eksisterende `change_lead_status`-kommando til `clarifying`: samme sag, original henvendelse og samtale bevares, og medarbejder, tidspunkt og overgangen registreres atomisk i historikken. Genforsøg genbruger kommando-id'et, og en gammel version kræver gennemgang før en ny handling.

**Sager** (`#/sager`) viser de øvrige aktive trin. Arkiv findes i Sagers egen underfane. Afviste henvendelser kan arkiveres direkte fra indbakken; genåbning fører til Afklaring under Sager. Migration `20260915000300_inbox_boundary.sql` forhindrer, at behandlede/arkiverede sager får status `new` igen. Den bevarer eksisterende statusovergange ud af `new`, så tidligere appversioners manuelle behandling stadig virker. Nye kundesvar giver fortsat notifikation og bliver på den eksisterende sag.

Sagsoversigten er opdelt i to spor: **Afklaring og aftaler** (`#/sager`) viser Afklaring, Klar til aftale og Aftaler. **Udført og betaling** (`#/sager/opfoelgning`) viser Udført, Faktureret og Betalt. Arkiv er fortsat separat. Sporene er visninger af de eksisterende statusser; et skift mellem dem ændrer ingen sagsdata. Statusfiltrering sker i databaseforespørgslen før paginering, og hvert spor har sin egen query-cache. Søgning og trinfilter nulstilles ved navigation; links og genindlæsning bevarer sporet. Ældre sags-/notifikationslinks åbner det aktuelle spor ud fra den hentede status.

Denne opdeling tilføjer ikke tilbudsaccept eller kommandoer til udførelse, fakturering og betaling. De tre sidste statusser vises, hvis de findes, men databasen afviser fortsat disse manuelle overgange med `workflow_not_ready`. Prøvevisningen indeholder fiktive eksempler i alle seks trin.

Indbakkens røde prik bygger på et separat, adgangskontrolleret databaseantal for alle `new`-henvendelser, uafhængigt af paginering og søgning. Lister filtreres i databasen før paginering. Antal og den åbne oversigt opdateres hvert 30. sekund, ved tilbagevenden til appen og efter gemte ændringer. Fejl vises særskilt; et tidligere kendt antal bevares ved midlertidige forbindelsesfejl.

Notifikationernes eksisterende `#/leads/<id>`-links findes fortsat. Efter indlæsning afgør den gemte status, om sagen åbnes under Indbakke, Sager eller Arkiv. Det gælder også et gammelt link til en henvendelse, der siden er flyttet. Gamle `#/pipeline`, `#/archive` og `#/calendar`-links fungerer fortsat. Installation og enhedens pushindstillinger findes under **Indstillinger**; medarbejderadministration findes samme sted for aktive ejere.

Alle tre lokale migrationer er registreret i det hostede projekt: `20260908093333_lead_intake.sql`, `20260908160000_operations.sql` og `20260909034350_calendar.sql`. Kalendermigrationen blev lagt på 9. september 2026. Brugeren har selv gennemført den første appmigration og loginopsætning. Den 8. september 2026 er Niclas verificeret som aktiv `backoffice`. Ingen yderligere invitation er sendt fra denne implementering.

Login alene giver ingen kundeadgang: brugeren skal være aktiv i `staff_members` og have en arbejdsrolle. `backoffice` kan følge og behandle sager samt tilføje noter. `technical` kan derudover registrere faglig vurdering. Rollen kontrolleres i databasen og kan ikke ændres af medarbejderen selv. Faglig godkendelse er påkrævet før status »Klar til aftale«.

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
| `src/workspace.tsx`                                     | Indbakke, sagsoversigter, paginering og sammensætning i den nye ramme |
| `src/lead-detail.tsx`                                   | Sagsvisning, manuel overførsel, eksisterende handlinger og historik |
| `src/lead-navigation.ts`                                | Grænsen mellem Indbakke/Sager/Arkiv og gamle/nye links |
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

PWA'en har manifest med stabil appidentitet, standalone-visning og ikoner i 192/512 px samt et maskable-ikon. **Indstillinger → App og notifikationer** samler enhedens betjening. **Installér app** har et downloadikon og åbner browserens installation direkte, når den er tilgængelig. Ellers vises vejledning til Chrome på Android: menu → Føj til startskærm → Installér. Først efter `appinstalled` eller ved åbning i standalone-visning erstattes knappen med **Appen er installeret**. Accept af browserens dialog er alene en afventende tilstand; afvisning og fejl giver vejledning uden at foregive installation.

Notifikationer styres af en til/fra-kontakt i samme panel. Tilstanden bekræftes gennem den eksisterende browserabonnement-/RPC-controller; ukendt status låser kontakten og tilbyder genforsøg. En igangværende ændring låser også kontakten. Ved fokus, genforbindelse og tilbagevenden fra browserens indstillinger genlæses status uden at anmode om tilladelse. En ejer uden arbejdsrolle kan installere appen, men kan ikke tilmelde kundenotifikationer. I demoen er kontakten en tydeligt markeret prøvevisning i hukommelsen; den hverken anmoder om tilladelser, tilmelder push eller registrerer en service worker.

Service workeren registreres kun i produktionsbuildet og på en sikker origin. Navigation og alle database-/loginkald bruger netværket. Åbning uden net viser en særskilt offlinebesked uden kundedata. Allerede åbne sager har fortsat netværksindikator og blokerede gem-handlinger offline. Der er ingen offlinekø. Web Push leveres nu af det separate baggrundsjob beskrevet nedenfor. Opdatering bruger hverken `skipWaiting` eller automatisk reload, så en åben indtastning ikke afbrydes; luk appens vinduer/faner og åbn den igen for at aktivere en ventende service worker.

**Udgivet 10. september 2026:** [app.lysoglogik.dk](https://app.lysoglogik.dk/). Cloudflare Workers Static Assets kører som `lys-og-logik-app` på konto `af5e7237c7fd2ab66d71c3ce2c02b70a`. Custom domain administreres hos Cloudflare; `workers_dev` er slået fra i `wrangler.jsonc`. Seneste appversion med notifikationer: `8d4a44e0-6ede-4e24-a199-90656b9c3d17`. Hoveddomænet er tilknyttet den separate website-Worker.

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

P2 mangler kundemail frem og tilbage, billedskabelon/vedhæftninger og fysisk afprøvning af PWA'en. Kalenderdelen af P3 er implementeret; markering af udført, faktureret og betalt samt samlet afprøvning på begge Android-telefoner mangler. De resterende pipelinekolonner er synlige, men overgangene åbnes først med de nødvendige funktioner. Outbox sender nu medarbejder-push. Kundemail er fortsat afventende.

## Mobilnotifikationer — 10. september 2026

Efter login vælges **Indstillinger → Notifikationer**, og kontakten slås til på hver enhed. Browserens tilladelse gives kun ved eget tryk. Slå fra afmelder den aktuelle enhed; logout afmelder også lokalt, selv hvis backend ikke kan kontaktes. Ved en gammel service worker beder appen om at lukke alle appvinduer/faner og åbne igen, før tilmelding kan gennemføres. Ingen kundeoplysninger vises på låseskærmen. Tryk åbner `#/leads/<id>`, som finder sagen i Indbakke eller Sager; login og medarbejderadgang gælder stadig.

Migration `20260910063714_web_push.sql` er lagt på Supabase. Private tilmeldinger ejes af den aktive medarbejder, maksimalt 10 aktive enheder. Endpoints er begrænset til kendte Web Push-udbydere; ukendte værter, custom ports og redirects afvises. Ingen ny tilmelding modtager historiske henvendelser.

`dispatch-push` er udgivet med særskilt adgangskode. `lys-logik-web-push` kører hvert minut via pg_cron/pg_net; adgangskoden hentes fra Vault. Kun de tre push-værdier fra den ignorerede `.env.push.local` er uploadet til Edge secrets. Kun `VITE_WEB_PUSH_PUBLIC_KEY` tilføjes appens build. Aktivering af cron kan gentages med `supabase/operations/enable-push-cron.sql`, efter Vault-secret og Edge-funktion er klar.

Hver medarbejder-outboxpost fordeles til kvalificerede enheder og får selvstændige leveringsrækker. Ingen modtagere giver `skipped`. Der reserveres højst 20 leveringer med to minutters lånetid og højst fire samtidige kald. Fejl genforsøges højst fem gange med stigende ventetid; 404/410 deaktiverer udløbne tilmeldinger. Fuldførelse kræver det aktuelle forsøgs lease-id. En allerede leveret søskende sendes ikke igen. Ved tabt svar efter leverandøraccept kan leveringen gentages; samme notification-tag samler gentagelsen, men der loves ikke præcis én visning. `sent` betyder accept hos push-leverandøren, ikke at medarbejderen har set beskeden. Kundemail-outbox behandles ikke.

Verificeret 10. september 2026: 79 unit-/integrationstests og 14 PWA-browsertests består. Både `npm run build` (inklusive Astro check: 0 fejl) og `npm run app:build` består. Hosted dispatch afviser anonymt kald med 401 og accepterer korrekt adgang med 200. Cron er aktiv; de seneste tre automatiske HTTP-kald returnerede 200 uden timeout. Den nye appadresse er verificeret med matchende manifest/SW/ikonfiler, browserens installationskontrol, offlinevisning og genåbning uden JavaScript-fejl. Rigtig levering på en fysisk Android afventer tilmelding; der var 0 aktive produktionsenheder ved kontrollen.

### Domæneflytning og resterende forbindelse til formularen

Brug og installér appen fra `https://app.lysoglogik.dk`. Tilmeld notifikationer på denne adresse; en installation og tilladelse fra den tidligere workers.dev-adresse dækker ikke det nye domæne. Supabase Auth `site_url` er opdateret og læst tilbage som den nye appadresse; øvrige redirectindstillinger er bevaret. VAPID-kontaktadressen bruger også det nye appdomæne.

Ved kontrol 10. september 2026 var `https://lysoglogik.dk` stadig bygget i demoformulartilstand. Backend returnerede 403 på CORS-preflight fra det nye domæne. Før den nye hjemmeside kan skabe leads og dermed pushbeskeder, skal formularens offentlige buildværdier, Turnstile-domæner og backendens tilladte origins/hostnames afstemmes og udgives. Den tidligere GitHub Pages-formular er et separat deployment; dens tidligere gennemførte prøve beviser ikke den nye hjemmesides formular. Simply-mail og Resend er separate fra Web Push.


### Formularforbindelsen er aktiveret — 10. september 2026

Den tidligere blokering på det nye hoveddomæne er løst. `https://lysoglogik.dk` har en aktiv formular; Turnstile og backendens origins/hostnames er opdateret. Den rigtige prøve oprettede sag `ba5177f3-4cbe-418c-83f5-55387508d1db`, **Teknisk test – produktionsformular**, under Nye leads. Backend viste medarbejder-push som `sent`, og brugeren bekræftede modtagelsen på sin Android. Kundemail er fortsat ikke implementeret. Se website-README for reference og testresultater.
