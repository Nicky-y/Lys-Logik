# Kundesamtaler i appen

## Adresser

`kontakt@lysoglogik.dk` er fortsat en Simply-postkasse. Kopivideresendelsen til `niclas.z.bundgaard@proton.me` er gemt og aflæst i Simply. Den godkendte videresendelsestest den 11. september 2026 er leveret til kontaktadressens mailserver; brugeren har bekræftet modtagelsen i Proton.

Appen bruger `Lys & Logik <sager@mail.lysoglogik.dk>` via Resend, region `eu-west-1`. Hver sag får en tilfældig svaradresse under dette subdomæne. Hoveddomænets MX peger fortsat på Simply. Resends fem DNS-records findes i `operations/resend-mail.dns`. Klik- og åbningssporing er slået fra.

Generel kontaktpost ses i Simply/Proton og opretter ikke automatisk nye sager. SMS og hjemmesidechat er fortsat fravalgt.

## Funktion og afgrænsning

Aktive medarbejdere kan skrive tekst, bruge en redigerbar billedanmodning og læse kundesvar på sagen. Kunden sender billeder ved at svare fra sin mailapp. Appen kan hente JPG, PNG, WebP og PDF op til 10 MB efter kontrol af medarbejderadgang og beskedens fil-ID. Billeder får automatisk forhåndsvisning, når de kommer nær det synlige område i samtalen. Et tryk åbner en større visning med forstørrelse. PDF hentes fortsat som fil.

Billedvisningen bruger samme beskyttede filfunktion. Filen hentes én gang, mens komponenten er åben, og dens midlertidige blob-URL genbruges til stor visning og download. URL'en frigives, når sagen lukkes eller brugeren logger ud; intet billede gemmes i Cache Storage eller lokal lagring. Første visning henter stadig originalfilen; der er ingen servergenererede miniaturer endnu.

Vedhæftninger hentes fra Resend ved behov; der er endnu ikke et selvstændigt filarkiv. Udgående vedhæftninger er ikke med i denne første mailversion. Beskedtekst vises som tekst, aldrig som eksekverbar HTML. Intet kundeindhold lægges i PWA'ens offlinecache. Kladden bevares ved afsendelsesfejl, men ligger kun i hukommelsen og forsvinder ved genindlæsning/lukning.

Beskeder ændrer ikke den oprindelige henvendelse eller dens workflowversion. Indholdet og leveringshændelserne bevares. Gamle `lead_received.customer`-rækker sendes ikke automatisk; kundekvitteringer er et separat, endnu ikke aktiveret spor.

`queued`/`sending` betyder ikke sendt. `accepted` betyder accepteret af Resend, og `delivered` betyder leveret til modtagerens mailserver. Ingen af dem beviser, at mailen er læst. `review` kræver kontrol hos Resend før eventuel ny afsendelse.

## Udgivelse og aktivering

- Migration `20260911021402_customer_mail.sql` er anvendt i Supabase-projekt `elydnshkxcwlmbdmtpys`.
- `dispatch-mail`, `mail-webhook` og `customer-attachment` er udgivet. `verify_jwt=false` er tilsigtet: dispatcheren kontrollerer cronhemmeligheden, webhooken Svix-signaturen, og filfunktionen kontrollerer brugerens JWT via den medarbejderbeskyttede RPC.
- Resend-domæne: `1ba0d2c1-963c-4401-9194-3edf76b8a456`.
- Webhook: `dd3533f1-dd2a-4dd5-8244-0a722e88ccee`, endpoint `https://elydnshkxcwlmbdmtpys.supabase.co/functions/v1/mail-webhook`. Events: `email.received`, `email.delivered`, `email.bounced`, `email.failed`, `email.complained`.
- `RESEND_API_KEY` og `RESEND_WEBHOOK_SECRET` er uploadet som Supabase-secrets fra den ignorerede `.env.mail.local`. Ingen nøgler må indgå i frontendvariabler eller commits.
- Alle fem DNS-records er verificeret. `operations/enable-mail-cron.sql` er kørt: mailfunktionen er aktiveret, og `lys-logik-customer-mail` kører hvert minut. Den eksisterende `PUSH_CRON_SECRET`/Vault-hemmelighed genbruges. Aktivering skete med tom afsendelseskø.
- Appen er udgivet på `https://app.lysoglogik.dk` med Cloudflare-version `0a5d5564-500b-4412-9ff5-4c48d044c4c4`. Offentlig JavaScript og CSS matcher den lokale produktionsbygning.
- Billedfunktionen er genudgivet efter en rettelse til Resends faktiske downloadvært `cdn.resend.app`. Denne præcise vært er tilladt; andre vilkårlige værter og omdirigeringer afvises fortsat.

## Drift

Transportindhold fastlåses i køen, og besked-ID bruges i Resends idempotensnøgle. Op til otte forsøg med backoff og to minutters lease. Genforsøg stopper inden udbyderens 24-timers idempotensvindue. Opret ikke en ny nøgle blot for at få en usikker afsendelse igennem.

Webhooks verificeres over den uændrede request-body med tidskontrol. Indgående mail-ID og webhook-ID deduplikeres i databasen. Leveringshændelser kan komme før dispatcherens kvittering. Et indgående svar opretter én `message_received.staff`-hændelse til den eksisterende pushdispatcher.

Routing identificerer sagen, ikke afsenderens identitet. Appen advarer, når afsenderadressen afviger fra kundens adresse. Ukendte eller tvetydige svaradresser bevares i `lys_private.mail_inbound` med `message_id is null` til manuel undersøgelse. Disse mails har endnu ingen særskilt indbakke i appen.

Stop nye afsendelser med `update lys_private.mail_settings set enabled=false where singleton;`. Bevar webhooken, så svar på allerede sendte mails fortsat opsamles. Slet ikke historik for at nulstille en fejl.

## Kontrol

PostgreSQL-tests dækker adgang, uforanderligt indhold, dubletter, leases, udløb, omvendt webhookrækkefølge og svarrouting. Unit-tests dækker signatur, udbyderfejl, HTML-til-tekst og filadgang. Browserprøver på desktop og Android dækker afsendelse og mistet kvittering uden dobbeltbesked.

Livekontrol den 11. september 2026:

- Testsagen `e961d8e9-a95e-45f9-8e0c-8eaabc113a8f` blev oprettet gennem produktionsformularen med reference `8a659be9-32f3-4e35-9d02-925f47a6426b` og tydelig teknisk testtekst.
- To beskeder sendt fra appen står som leveret. Et svar fra Proton på billedanmodningen vises på samme sag med én PNG på 1.127.745 bytes.
- Klik på vedhæftningen fejlede før rettelsen af downloadværten; efter genudgivelse afslutter appen hentningen uden fejl. Åbning på brugerens Android-telefon er endnu ikke bekræftet.
- Push for både den nye sag og kundesvaret er accepteret af pushudbyderen efter ét forsøg. Brugeren har efterfølgende bekræftet mobilnotifikation ved billedsvar, men rapporteret fejl ved tryk på notifikationen.
- Videresendelsestesten har Resend-ID `92dd792b-912b-4ba1-87b2-59874074ea3a` og status `delivered`. Den opretter ikke en ekstra sag.
- Samlet lokal unit-/integrationstest: 98 bestået, 0 fejlet. Typekontrol og produktionsbygning bestået. Desktop-/Android-browserprøver viste 20 beståede testcases; Windows-processen afsluttede ikke med samlet rapport i den oprindelige kørsel.

Efterfølgende udgivelse samme dag: Cloudflare-version `1563482e-94aa-4332-9cf4-51c630a8e862` indeholder billedvisning og ændret notifikationsklik. Service workeren kalder nu `clients.openWindow` direkte i klikhændelsen og fokuserer den returnerede klient; den afventer ikke navigation i en muligvis suspenderet gammel klient. Chrome på Android kan dermed genåbne den installerede app. Selve klikket kræver en ny fysisk Android-prøve; lokal test beviser ikke OS-adfærd.

Verifikation: 5 relevante worker-tests og 6 browserprøver bestået (desktop og Android-format). Browserprøverne bruger produktionsbygning og CSP og dækker billedafkodning, stor visning, forstørrelse, download uden ekstra filrequest, frigivelse ved lukning, genforsøg og sagslink efter login. Offentlig JavaScript, CSS og service worker matcher produktionsbygningen; CSP tillader de interne blob-billeder. Brugerens rigtige testbillede er efter udgivelsen hentet og visuelt kontrolleret i appens store billedvisning.

Ved opdatering på telefonen: Åbn appen for at hente den nye service worker, luk derefter alle vinduer/faner med appen helt, og åbn igen. En ventende worker aktiveres ikke ved blot at minimere appen. Test notifikationsklikket med en ny svarmail efter opdateringen.
