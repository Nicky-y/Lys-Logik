# Backend — lead-modtagelse og intern sagsbehandling

Lead-modtagelse er implementeret: formular → servervalidering → atomisk lagring af sag, oprettelseshistorik og ventende notifikationer. P1 tilføjer medarbejderadgang, statuskommandoer, faglig vurdering, afventer-markering og noter gennem [React-arbejdsrummet](../operations/README.md). Websitet er fortsat statisk Astro.

## Status 9. september 2026

- Den interne PWA er udgivet på [lys-og-logik-app.mnbrom.workers.dev](https://lys-og-logik-app.mnbrom.workers.dev/). Supabase Auth `site_url` peger nu på denne adresse; øvrige redirectindstillinger er bevaret. Anonym læsning af sager, aftaler og medarbejdere er verificeret afvist. Se [installation og udgivelsesstatus](../operations/README.md#installation-på-android-og-hosting).
- Migration `20260908093333_lead_intake.sql` er lagt på projektet `elydnshkxcwlmbdmtpys`. Den lokale version matcher Supabases migrationshistorik.
- Migration `20260908160000_operations.sql` er også registreret på projektet. Brugeren har selv gennemført migrationen og loginopsætningen. Niclas er verificeret som aktiv `backoffice`; der er ikke sendt endnu en invitation.
- Migration `20260909034350_calendar.sql` er lagt på projektet og verificeret i migrationshistorikken. Den tilføjer private medarbejderdata i `appointments` samt kommandoerne `create_lead_appointment`, `reschedule_lead_appointment` og `cancel_lead_appointment`. Aftale, sagsstatus, kvittering og historik gemmes atomisk. Se [kalenderens regler og brugerflow](../operations/README.md#kalender).
- Edge Function `create-lead` version 4 er deployet med rigtig Turnstile-konfiguration og den navngivne Supabase-servernøgle `default_v1`.
- Turnstile-widget `Lys og Logik - henvendelser` er oprettet i managed mode. Site key: `0x4AAAAAAEslNMfqqO2vHaTk`. Widgetten accepterer `nicky-y.github.io`, `localhost` og `127.0.0.1`; den deployede backend accepterer kun produktionsværtsnavnet.
- På den deployede funktion er produktions-preflight verificeret som HTTP 204, en ugyldig Turnstile-token som HTTP 422 og lokal origin som HTTP 403. Widgetmetadata og secret er også valideret direkte hos Cloudflare.
- Anonyme læseforsøg på `leads` og direkte kald til oprettelsesfunktionen er verificeret afvist på det rigtige projekt.
- En tydeligt markeret teknisk testhenvendelse er oprettet i det rigtige Supabase-projekt; der er ikke brugt rigtige kundeoplysninger. Websiteændringerne er ikke pushet til GitHub.
- En rigtig browserindsendelse er gennemført via lokal Astro-preview og den fælles HTTP-handler med rigtig Cloudflare Siteverify og den hostede Supabase-database. Resultat: HTTP 200 og synlig kvittering; genforsøg med samme indsendelsesnøgle gav HTTP 200; genbrug af den brugte token med en ny nøgle gav HTTP 422. Reference: `86b76738-be9d-43b8-9b72-ddf71e8eb8c3`.
- Den normale hjemmeside står fortsat i tydelig demotilstand. Det sidste tjek på den offentlige adresse udføres ved frontend-publicering; den lokale prøve ændrede ikke produktionsbackendens tilladte værtsnavne. De automatiske browsertests bruger fortsat en testudgave af Turnstile.

## Ansvar og mapper

| Placering                                      | Ansvar                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `functions/_shared/contracts/lead.ts`          | Fælles Zod-validering, indsendelsesnøgle og kvitteringsreference    |
| `functions/_shared/application/create-lead.ts` | Genforsøg, botkontrol og oprettelse gennem en persistence-kontrakt  |
| `functions/_shared/http/lead-handler.ts`       | HTTP, CORS, størrelses- og requestgrænser samt fejlbeskeder         |
| `functions/_shared/infrastructure/`            | Supabase RPC-adapter og Cloudflare Siteverify                       |
| `functions/create-lead/index.ts`               | Edge-runtime, serverkonfiguration og sammensætning af afhængigheder |
| `migrations/`                                  | PostgreSQL-tabeller, rettigheder, RLS og atomiske funktioner        |
| `../src/lib/lead-form.ts`                      | Formularvisning og Turnstile-widget                                 |
| `../src/lib/submit-lead.ts`                    | Afsendelse, kvittering og genbrug af nøgle ved netværksfejl         |

## Data og adgang

`leads.original_submission` bevarer den validerede indsendelse. Telefon normaliseres separat til dansk internationalt format. Nye indsendelser med samme kontaktoplysninger bliver separate sager; der sker ingen automatisk kundesammenlægning.

`create_lead_submission` gemmer sag, oprettelseshændelse, indsendelsesnøgle og to notifikationsopgaver i én transaktion. Samme nøgle og indhold returnerer den oprindelige kvittering. Samme nøgle med ændret indhold afvises. En transaktionslås beskytter mod samtidige genforsøg med samme nøgle.

Det private schema `lys_private` indeholder indsendelsesnøgler, outbox, requesttæller og kvitteringer for medarbejderkommandoer. Offentlige og almindeligt indloggede brugere kan ikke kalde de private funktioner. Kun aktive medarbejdere i `staff_members` kan læse sager, aftaler og historik; selvregistrering giver ingen medarbejderadgang. Direkte tabelændringer er afvist. De syv offentlige medarbejder-RPC'er kontrollerer aktiv adgang, versionsnummer, overgang og idempotens. Faglig vurdering kræver rollen `technical`; backoffice kan følge vurderingen, behandle sager og håndtere aftaler, når den nødvendige faglige godkendelse er registreret.

Requestgrænsen er fælles for endpointet: 20 requestforsøg pr. minut og 200 pr. time. Grænserne konfigureres administrativt i `lys_private.lead_request_limit`. Der stoles ikke på klientoplyste IP-adresser. HTTP-body begrænses til 16 KiB via både angivet længde og faktisk læste bytes.

**Outbox lagrer foreløbig kun leveringsopgaver.** Der er endnu ingen worker, som sender mail eller push. `pending` betyder derfor ikke, at kunden eller medarbejderen har fået en notifikation.

## Aktivering af rigtig formular

1. Widgetten ovenfor er oprettet og valideret. Dens offentlige nøgle er gemt som `TURNSTILE_SITE_KEY` i den ignorerede `.env.local`; det aktiverer ikke formularen i sig selv.
2. `TURNSTILE_SECRET_KEY`, `LEAD_ALLOWED_ORIGINS`, `TURNSTILE_HOSTNAMES` og `LEAD_SERVER_KEY_NAME` er sat i Supabase-projektets Edge Function secrets. Ved senere ændringer uploades kun de nødvendige værdier; upload aldrig hele `.env.local` med administrationsnøgler.
3. Origins indeholder scheme og hostname, fx `https://nicky-y.github.io`, uden path eller afsluttende skråstreg. `TURNSTILE_HOSTNAMES` indeholder præcise, kommaseparerede værtsnavne fra Siteverify. Produktionsopsætningen accepterer kun produktionsværtsnavne; lokal afprøvning bruger sin egen konfiguration.
4. Edge-funktionen læser en privilegeret nøgle fra Supabases runtime-variabel `SUPABASE_SECRET_KEYS`. `LEAD_SERVER_KEY_NAME=default_v1` vælger dette projekts eksisterende servernøgle. Uden denne indstilling forventer koden navnet `default`; der vælges aldrig automatisk en anden nøgle. Den offentlige publishable key er ikke en servernøgle.
5. Sæt `PUBLIC_LEAD_ENDPOINT=https://elydnshkxcwlmbdmtpys.supabase.co/functions/v1/create-lead` og den offentlige `PUBLIC_TURNSTILE_SITE_KEY` i website-buildets miljø. Begge skal være sat sammen; begge tomme giver demotilstand.
6. Den lokale integration er afprøvet med en frisk, rigtig Turnstile-token og tekniske testoplysninger. Gentag kontrollen på den offentlige frontend-adresse ved publicering. Kun en bekræftet, varigt gemt henvendelse må give succesvisningen.

Browseren bruger ikke localStorage/sessionStorage til formularoplysninger. Indsendelsesnøglen bevares kun i hukommelsen, mens siden er åben. En genindlæsning starter derfor en ny indsendelse. En allerede gemt indsendelse kan bekræftes igen med samme nøgle og indhold; samme Turnstile-token med en ny indsendelsesnøgle må ikke skabe endnu en sag.

## Verifikation

Kør fra `website/`:

```powershell
$env:ASTRO_TELEMETRY_DISABLED = '1'
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:intake
npm.cmd run app:build
npm.cmd run test:e2e:app
```

Integrationstests bruger PGlite med små Supabase Auth-fixtures. De tester PostgreSQL-regler, rollback, rettigheder og deduplikering uden at kontakte det eksterne projekt. PGlite bruger én forbindelse; testene er ikke en måling af samtidighed på den hostede database.

Browsertestene anvender rigtig lokal HTTP-handler og database. Kun Cloudflares widget og botkontrol erstattes i det automatiske testmiljø. Produktionskoden indeholder ingen testnøgle eller genvej uden om botkontrollen. Testene omfatter desktop og emuleret Android; rigtige Android-enheder er endnu ikke afprøvet. Derudover er rigtig Turnstile afprøvet gennem Codex-browseren som beskrevet i status ovenfor.

## Næste del

Turnstile-opsætning, lokal browserafprøvning med rigtig Supabase, første interne appdel (P1) og den interne kalender er afsluttet. Offentlig aktivering kræver stadig frontend-publicering og kontrol på den offentlige adresse. Maildialog, billeder, PWA og push følger i P2; udført/faktureret/betalt og samlet afprøvning på begge Android-telefoner mangler i P3. Disse er fortsat del af den aftalte V0.

Cloudflares 14 officielle skills er installeret i `C:/Users/mnbro/.codex/skills/`. De fem MCP-servere er registreret i Codex, og værktøjerne er indlæst efter genstart. MCP-forbindelsen kan læse Turnstile, men oprettelse blev afvist med Cloudflare-fejl 10000. Den tidligere oplyste alternative API-nøgle blev brugt til at oprette widgetten; nøglen blev ikke gemt på disk. Den nye widget-secret ligger i den ignorerede `.env.local` og i Supabases secret-lager.

Efter kalenderdelen består 63 unit-/integrationstests og 16 app-browsertests på desktop og emuleret Android. Website- og appbuild består. Appens JavaScript-bundle er ca. 164 kB gzip. Den tidligere kørte website-/intake-browserkontrol omfattede 25 beståede tests og én mobiltest, der blev sprunget over på desktop.

Referencer: [Supabase API-nøgler](https://supabase.com/docs/guides/getting-started/api-keys), [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) og [Cloudflare Agent Setup](https://developers.cloudflare.com/agent-setup/prompt.md).
