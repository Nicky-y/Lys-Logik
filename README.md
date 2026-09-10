# Lys & Logik — hjemmeside og arbejdsrum

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

## Produktion og lokal udvikling

- Kontaktadressen er `kontakt@lysoglogik.dk`. Virksomheden står fortsat som under etablering; arbejdsområde og pilotvilkår er de hidtil aftalte foreløbige oplysninger.
- `npm run build` bygger altid en rigtig formular med de offentlige værdier i `config/website.production.json`. Manglende eller ugyldig opsætning stopper buildet. `npm run dev` uden formularvariable er en isoleret lokal demo. E-mail er påkrævet; telefon er valgfrit.
- Ved deaktiveret JavaScript er formularen deaktiveret, så personoplysninger ikke utilsigtet sendes til serveren.
- Ingen tracking eller eksterne skrifttyper. Manrope hostes sammen med siden. Turnstile indlæses kun ved aktiveret, rigtig formularmodtagelse.
- `noindex, nofollow` forhindrer normal søgeindeksering, men er ikke adgangskontrol.
- GitHub Pages-workflowen bygger med den offentlige Supabase-endpoint og Turnstile site key. Den kontrollerer den færdige HTML og filer under `/Lys-Logik/` før upload, så en demoversion ikke udgives ved en fejl. Almindelig lokal udvikling er stadig demo uden de to formularvariable. Backend deployes særskilt til Supabase.

Teknisk aktivering af formularen er ikke en godkendelse af virksomhedens faglige rammer eller en fuldstændig juridisk gennemgang. Virksomhedsoplysninger og pilotvilkår skal fortsat afspejle den faktiske virksomhed.

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

## Produktionsformular og udgivelse

Hjemmesiden udgives på `https://lysoglogik.dk` via Worker `lys-og-logik-website`. Arbejdsrummet er separat på `https://app.lysoglogik.dk`. Produktionens formular peger på Supabase `create-lead`; backend kontrollerer Turnstile-handling og værtsnavn, validerer input og opretter sag, historik og outbox atomisk. En bekræftet kvittering indeholder sagens offentlige reference. Tabte svar kan genforsøges uden at oprette samme indsendelse igen; en ny bekræftet indsendelse er en separat sag.

```powershell
npm.cmd run build
npm.cmd run website:deploy -- --dry-run
npm.cmd run website:deploy
```

Buildet kører Astro check, bygger og verificerer den færdige formular samt JS/CSS for det korrekte basepath. Udgivelsesscriptet bygger til domænets rod, kontrollerer Wrangler-pakken og udgiver. Derefter kontrolleres den offentlige formular, filer og backendens CORS-svar. Wrangler indlæser en separat tom miljøfil, så serverhemmeligheder fra `.env.local` ikke bliver deployvariabler. Eksisterende OAuth-profil fra appudgivelsen bruges.

Kun offentlige værdier gemmes i `config/website.production.json`. Supabase-administration, Turnstile-secret og push-privatnøgle forbliver lokale/hos backend. Produktionsbackend tillader `https://lysoglogik.dk` og den tidligere `https://nicky-y.github.io`; localhost må ikke være i produktionsbackendens allowlist. Widgetten har disse domæner samt localhost til lokal afprøvning, mens backend kontrollerer præcist værtsnavn.

Den tidligere GitHub Pages-workflow er bevaret og bruger samme buildkonfiguration, men med `/Lys-Logik/` som basepath. Push til GitHub udgiver ikke automatisk den nye Cloudflare-hjemmeside.

Der sendes ikke automatisk kundemail; notifikationer kræver tilmelding på medarbejderens enhed. Se den gennemførte prøve nedenfor.


### Verificeret produktionsflow — 10. september 2026

Website-Worker er udgivet som version `1549abc1-d049-4de3-85ed-6631ac222629`. Den offentlige HTML er aktiv, JS/CSS matcher buildet, CORS fra det nye domæne giver 204, og uvedkommende origin giver 403. Turnstile er stadig Managed med no pre-clearance og samme site key/secret.

En rigtig browserindsendelse fra `https://lysoglogik.dk/#kontakt` med rigtig Turnstile gav reference `3b3a9124-aa35-4190-83a0-07285e8255d3`. Sagen `ba5177f3-4cbe-418c-83f5-55387508d1db` hedder **Teknisk test – produktionsformular**, har status `new`, kilde `website` og præcis én oprettelseshændelse. Det er en markeret teknisk prøve, ikke en kundeopgave.

Medarbejder-outbox blev `sent`, og brugeren bekræftede modtagelse på sin fysiske Android-telefon. Ved kontrollen var der én aktiv push-enhed. Kunde-outbox er fortsat `pending`; der er ikke sendt automatisk kundemail. Kvitteringen på hjemmesiden betyder, at sagen er gemt.

Kontrol: 82 unit-/integrationstests, 12 intake-browsertests (desktop/Android) og 2 produktionsartefakttests består. Astro check har 0 fejl, advarsler og hints. En første parallel browserkørsel fejlede ved opstartstimeout; den fulde kørsel alene bestod. Den nye guard forbyder manglende produktionsopsætning og testnøgler. De automatiske tests erstatter widgettjenesten; den særskilte offentlige prøve bruger rigtig Turnstile.
