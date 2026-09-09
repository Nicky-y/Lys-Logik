# Lys & Logik — arbejdsrum og kalender

Mobilvenlig intern app med Supabase-login, pipeline, søgning, sagsvisning, faglig vurdering, afventer-markering, interne noter, historik, ring-knap og fælles kalender. Astro-hjemmesiden ligger fortsat separat i `src/`.

## Åbn appen

Kør fra `website/`, eller dobbeltklik den tilsvarende startfil:

| Kommando                                      | Adresse                | Indhold                                     |
| --------------------------------------------- | ---------------------- | ------------------------------------------- |
| `npm.cmd run app:dev` / `START-APP.cmd`       | http://127.0.0.1:5173/ | Rigtige Supabase-data efter login           |
| `npm.cmd run app:demo` / `START-APP-DEMO.cmd` | http://127.0.0.1:5174/ | Fiktive sager uden login eller databasekald |

Prøvevisningen nulstilles ved genindlæsning. Den viser en fiktiv faglig medarbejder. Udviklingsserveren er sat til `0.0.0.0`, så telefoner på samme netværk kan åbne computerens lokale IP og port. Dette er lokal afprøvning; offentlig drift skal bruge HTTPS og en særskilt app-adresse. En installerbar Android-PWA følger i P2.

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

React Query holder hentede kundedata i hukommelsen, som ryddes ved logout. Supabase gemmer login-sessionen lokalt til næste besøg. Der er ingen offlinecache af sager, service worker eller offlinekø. Listen indlæses i portioner på 100; søgning og tal gælder de indlæste sager. Sagsvisningen viser op til 500 seneste historikhændelser med besked ved grænsen.

## Kontrol

```powershell
npm.cmd test
npm.cmd run app:build
npm.cmd run test:e2e:app
```

Integrationstests kører de rigtige migrationer i PGlite og kontrollerer roller/RLS, versionskonflikter, genforsøg, originaldata og atomisk rollback. Browsertests bruger Supabase-klienten mod en lokal Auth/PostgREST-testadapter med den samme PostgreSQL-database. Testene sender ingen invitationer og bruger ingen rigtige loginoplysninger. De dækker desktop og emuleret Android, tabte svar, konfliktvisning, logout, faglig adgang samt automatiske WCAG-kontroller. Fysisk Android og det samlede driftsflow skal stadig afprøves.

Efter kalenderdelen består 63 unit-/integrationstests og 16 app-browsertests. Kalenderkontrollen omfatter oprettelse, flytning, aflysning, tabt svar, sommertid, historik og adgangsregler. Der er ikke oprettet rigtige kundeaftaler som led i testen.

`app:build` bygger til `operations/dist/`. Den eksisterende GitHub Pages-workflow bygger kun hjemmesiden til offentliggørelse; appen er endnu ikke offentliggjort.

## Resterende V0

P2 omfatter kundemail frem og tilbage, billedskabelon/vedhæftninger, PWA og push. Kalenderdelen af P3 er implementeret; markering af udført, faktureret og betalt samt samlet afprøvning på begge Android-telefoner mangler. De resterende pipelinekolonner er synlige, men overgangene åbnes først med de nødvendige funktioner. Outbox fra lead-modtagelsen sender endnu ikke mail eller push.
