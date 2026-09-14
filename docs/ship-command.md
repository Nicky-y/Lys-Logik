# Commit, push og udgivelse

Kør fra website-mappen i Windows med Git, Node.js og npm installeret:

| Kommando | Handling |
| --- | --- |
| npm run ship -- -Commit | Kontrollerer ændringer og laver en lokal commit. |
| npm run ship -- -Push | Kører unit-/integrationstests, laver commit og pusher til origin/main. |
| npm run ship -- -Deploy | Kører tests og produktionsbuild, committer inklusive det versionerede build, pusher og deployer den officielle hjemmeside til Cloudflare. |

Vælg præcis ét hovedflag. Udelad -Message for at få en tekstboks, eller angiv eksempelvis:

    npm run ship -- -Deploy -Message "Opdater hero og kontakttekst"

Alle lokale ændringer i website-repositoryet kommer med, inklusive allerede staged filer. Se derfor git status og git diff først. Ignorerede filer bliver ikke tilføjet automatisk. Scriptet afviser staged miljøfiler og lokale værktøjsdata, men tillader .env.example og .env.local.example. Filnavnekontrollen er ikke en scanning af indhold for hemmeligheder.

En tom besked eller annulleret tekstboks stopper før staging og build, når der allerede er lokale ændringer. En ren arbejdsmappe giver ingen tom commit; push/deploy kan stadig køres igen efter en tidligere fejl. Hvis build alene skaber ændringer, bliver der også bedt om en besked.

Push kræver, at den aktuelle branch matcher -Branch (standard main), og at -Remote (standard origin) findes. Deploy tillades kun fra main. Git bruger den konfigurerede remote og almindelig adgangskontrol; scriptet foretager aldrig force-push.

-Push starter også repositoryets eksisterende GitHub Pages-workflow via push til main, men venter ikke på det. **GitHub Pages er ikke lysoglogik.dk.** -Deploy kalder scripts/deploy-website.mjs, samme indgangspunkt som npm run website:deploy. Det genbruger Cloudflare-login, bygger og kontrollerer hjemmesiden, kører Wrangler dry-run og deploy og verificerer derefter de offentlige filer samt formularens konfiguration/CORS. Det udgiver ikke medarbejderappen.

Scriptet stopper ved fejlede tests, build, commit, push, deploy eller produktionskontrol og returnerer en fejlkode. En allerede udført commit/push rulles ikke tilbage, hvis et senere trin fejler. Fejl efter staging kan efterlade filer staged; se git status før næste forsøg. En fejlet produktionskontrol kan ske efter selve udgivelsen, så læs fejlteksten før et nyt forsøg.

## Test

    node --test tests/ship-script.test.ts

Testene bruger rigtige midlertidige Git-repositories og en lokal bare remote. Build/deploy er erstatninger i testmapperne, så der sker ingen netværksudgivelse. Windows-jobbet i .github/workflows/test-ship.yml kører de samme tests. På andre platforme springes Windows-adfærdstestene eksplicit over.

Tekstboksen kræver et interaktivt Windows-skrivebord. De automatiske tests bruger -Message; de klikker ikke på dialogen og verificerer ikke Cloudflare-login eller en virkelig udgivelse.
