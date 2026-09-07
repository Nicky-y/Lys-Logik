# Lys & Logik — lokal websiteprototype

En lille Astro-hjemmeside med TypeScript og almindelig CSS. Formålet er at vise designet og pilotforløbet, før virksomheden lanceres.

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
- `src/lib/lead.ts`: ren formularvalidering, som ikke sender eller gemmer data.
- `public/images/`: alle billeder, så sitet ikke afhænger af eksterne billedtjenester.

## Bevidste prototypegrænser

- Kontaktoplysninger og dækningsområde er placeholders. `.example`-mailadressen kan ikke modtage ansøgninger.
- Formularen kører kun i browseren. Ingen API, mailafsendelse, database eller lagring. Den viser tydeligt en demobekræftelse, og formularen nulstilles bagefter.
- Ved deaktiveret JavaScript er formularen deaktiveret, så personoplysninger ikke utilsigtet sendes til serveren.
- Ingen tracking, cookies eller eksterne skrifttyper. Manrope hostes sammen med siden.
- `noindex, nofollow` forhindrer normal søgeindeksering, men er ikke adgangskontrol. Prototypen er kun startet lokalt.
- Ingen offentlig deployment er oprettet.

Før en rigtig lancering skal firmaets oplysninger, aktuelle ydelser og pilotvilkår bekræftes. Formularen skal forbindes til en rigtig modtager, og privatlivsinformationen skal beskrive den valgte løsning.

## Billeder

Logoet er en uændret kopi af `../assets/logo/logo_v11.png`, efter brugerens valg. Tidligere logoversioner bruges ikke.

`hero.webp`, `lighting.webp` og `smart-home.webp` er AI-genererede inspirationsbilleder skabt med den indbyggede image_gen. De viser ikke udførte kundeprojekter. De har mindre 960px-varianter, og det fulde promptsæt er gemt i `image-prompts.json`. Originalfotos kan erstatte dem, når pilotprojekterne er gennemført.

## Kontrol

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Unit tests dækker formulargrænser og validering. Playwright tester desktop og mobil, formularintegration, ingen afsendelse/lagring, links, billeder, tastatur, menu og automatisk tilgængelighedskontrol. E2E bruger den installerede Microsoft Edge; i andre miljøer kan `channel: 'msedge'` erstattes af en installeret Playwright-browser i konfigurationen.

Den statiske produktionsversion bygges til `dist/`.
