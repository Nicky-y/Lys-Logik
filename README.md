# Lys & Logik — lokal websiteprototype

Astro-hjemmeside med TypeScript og almindelig CSS samt et separat React-arbejdsrum i `operations/`. Lead-modtagelse og første del af intern sagsbehandling bruger Supabase. Se [backendens status og opsætning](supabase/README.md) og [appens vejledning](operations/README.md).

## Åbn arbejdsrummet

Dobbeltklik `START-APP.cmd` og åbn http://127.0.0.1:5173/ for rigtige data efter medarbejderlogin. `START-APP-DEMO.cmd` åbner en særskilt prøvevisning med fiktive sager på http://127.0.0.1:5174/. Hold terminalen åben. Begge startfiler ligger i denne mappe.

## Åbn hjemmesiden

Dobbeltklik `START-WEBSITE.cmd`, og åbn http://127.0.0.1:4321. Lad terminalvinduet være åbent, mens du bruger siden.

Alternativt fra denne mappe:

```powershell
npm.cmd install
npm.cmd run dev -- --port 4321
```

Kræver Node.js i en version, som den installerede Astro-version understøtter. Projektet er valideret med Node 24.14.1. `npm.cmd` bruges på Windows for at undgå en lokalt defekt `npm.ps1`-genvej.

## Opdateringer

- `src/data/site.ts`: virksomhedsoplysninger, opgavekategorier og FAQ.
- `src/pages/index.astro`: sidens indhold og små interaktioner.
- `src/styles/global.css`: layout, farver og mobilvisning.
- `src/lib/lead.ts`: fælles formularvalidering fra backendens Zod-kontrakt.
- `src/lib/lead-form.ts` og `src/lib/submit-lead.ts`: demo eller rigtig indsendelse med fejl- og genforsøgshåndtering.
- `supabase/`: database, Edge Function, adgangskontrol og opsætningsvejledning.
- `public/images/`: alle billeder, så sitet ikke afhænger af eksterne billedtjenester.

## Bevidste prototypegrænser

- Kontaktoplysninger og dækningsområde er placeholders. `.example`-mailadressen kan ikke modtage ansøgninger.
- Formularen er som standard i demotilstand og sender eller gemmer da intet. Rigtig modtagelse aktiveres med både `PUBLIC_LEAD_ENDPOINT` og `PUBLIC_TURNSTILE_SITE_KEY`. E-mail er påkrævet; telefon er valgfrit.
- Ved deaktiveret JavaScript er formularen deaktiveret, så personoplysninger ikke utilsigtet sendes til serveren.
- Ingen tracking eller eksterne skrifttyper. Manrope hostes sammen med siden. Turnstile indlæses kun ved aktiveret, rigtig formularmodtagelse.
- `noindex, nofollow` forhindrer normal søgeindeksering, men er ikke adgangskontrol.
- GitHub Pages-workflowen bygger med den offentlige Supabase-endpoint og Turnstile site key. Den kontrollerer den færdige HTML og filer under `/Lys-Logik/` før upload, så en demoversion ikke udgives ved en fejl. Almindelig lokal udvikling er stadig demo uden de to formularvariable. Backend deployes særskilt til Supabase.

Før en rigtig lancering skal firmaets oplysninger, aktuelle ydelser og pilotvilkår bekræftes. Formularmodtagelse og Turnstile skal afprøves samlet, og privatlivsinformationen skal beskrive den valgte løsning.

## Billeder

Logoet er en uændret kopi af `../assets/logo/logo_v11.png`, efter brugerens valg. Tidligere logoversioner bruges ikke.

`hero.webp`, `lighting.webp` og `smart-home.webp` er AI-genererede inspirationsbilleder skabt med den indbyggede image_gen. De viser ikke udførte kundeprojekter. De har mindre 960px-varianter, og det fulde promptsæt er gemt i `image-prompts.json`. Originalfotos kan erstatte dem, når pilotprojekterne er gennemført.

## Kontrol

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:intake
npm.cmd run app:build
npm.cmd run test:e2e:app
```

Unit- og integrationstests dækker formulargrænser, HTTP, botkontrol, genforsøg, transaktioner og databaseadgang. Playwright tester både den eksisterende demo og rigtig lokal indsendelse, herunder tabt netværkssvar og separate henvendelser fra samme kunde. Browseren er den installerede Microsoft Edge; Android emuleres i det nye intake-testsæt. Den rigtige Cloudflare-tjeneste er ikke en del af de automatiske tests.

Den statiske produktionsversion bygges til `dist/`.

## Formularaktivering — 10. september 2026

Aktiveringen er forberedt i `.github/workflows/deploy-pages.yml`. Den offentlige side er ved kontrollen stadig i demotilstand; ændringen skal først committes, pushes og gennemføre Pages-workflowen. Produktionsbackend accepterer allerede origin `https://nicky-y.github.io` (preflight 204) og afviser uvedkommende origin (403).

Den nye `npm.cmd run test:build:pages` køres efter et Pages-build med begge produktionsvariable. Den verificerer rigtig formularopsætning, kvittering, information om datalagring, deaktiveret formular uden JavaScript og at JS/CSS findes under det rigtige repository-basepath. Den normale `npm.cmd run build` uden formularvariable må fortsat bygge en lokal demo.

Efter udgivelse skal én tydeligt markeret testhenvendelse sendes fra den offentlige side med rigtig Turnstile. Kontrollér kvitteringen og den tilsvarende sag under **Nye leads** i appen. Mail og push sendes endnu ikke; følg foreløbig nye sager ved at åbne appen.
