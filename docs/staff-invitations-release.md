# Medarbejderinvitationer — produktionsudgivelse 15. september 2026

Den foregående udgivelse `5a4c373` indeholdt kun logout-rettelsen. Derfor manglede telefonappen fortsat **Indstillinger → Opret medarbejder**. Invitationsfunktionen er nu udgivet som `fcfd7cd`.

## Udgivne dele

- Projekt: `elydnshkxcwlmbdmtpys`.
- Migration: `20260915000500_staff_invitations.sql`, atomisk anvendt og registreret med de udførte SQL-statements i migrationshistorikken. SHA-256 af den anvendte fil: `67e67e6c4ad966d0df73f0a096223df51917b0e80ebffbaa61e36a6927005bd4`.
- Edge-funktion: `invite-staff`, version 1, `ACTIVE`. Kun denne funktion blev deployet; eksisterende kundemail- og formularfunktioner blev ikke genudgivet.
- App: Cloudflare Worker `lys-og-logik-app`, version `b3847928-aed7-4be4-9f63-ddb95b2901d9`, 100 % trafik fra 2026-09-15 kl. 17:05:52 UTC. Deploy-besked: `fcfd7cd - Employee invitations and account activation`.
- Adresse: <https://app.lysoglogik.dk/>. Kodecommitten er lokal; GitHub-push indgik ikke i denne arbejdsgang.

## Godkendt mailopsætning

Brugeren godkendte eksplicit følgende ændring efter automatisk godkendelseskontrol havde krævet konkret accept:

| Indstilling | Værdi |
| --- | --- |
| SMTP | `smtp.resend.com`, TLS-port 465, bruger `resend` |
| Afsender | `Lys & Logik <adgang@mail.lysoglogik.dk>` |
| Loginmails pr. time | 30 |
| Offentlig selvoprettelse | Deaktiveret |
| Invitationsredirect | `https://app.lysoglogik.dk/` |

Der anvendes en eksisterende Resend-nøgle fra den ignorerede miljøfil. Den ligger kun i Supabases Auth-konfiguration og aldrig i appbuildet eller denne rapport. `mail.lysoglogik.dk` blev verificeret som godkendt Resend-afsender i EU-regionen. Site URL, e-mailbekræftelse og eksisterende medarbejderrettigheder blev bevaret. SMTP-konfigurationen omfatter Auth-mails; kundesamtalerne bruger fortsat deres eksisterende mailfunktioner.

Referencer: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) og [Resends Supabase SMTP-opsætning](https://resend.com/docs/send-with-supabase-smtp).

## Faktisk kontrol

- 36 fokuserede unit-/integrationstests for invitationer, medarbejderadgang og logout bestod.
- TypeScript-/Vite-produktionsbuild bestod. Den eksisterende advarsel om en JS-chunk over 500 kB består.
- 22 browsertests for invitationer og logout bestod på desktop og Android-emulering. De omfatter aktivering efter verificeret link og valgt adgangskode, afvisning af almindelig backoffice, bevaret rolle/ejeradgang ved fejl og genforsøg efter tabt svar.
- Produktionsdatabasen har RLS på invitationer. Anonyme må ikke reservere invitationer, browseren må ikke afslutte dem eller indsætte dem direkte, og serverrollen må afslutte. Den eksisterende aktive backoffice-ejer er bevaret.
- Funktionens produktions-preflight returnerede 204 for appens origin. Kald uden login gav 401, og fremmed origin gav 403.
- Auth-indstillingerne blev læst tilbage. Offentlig `/auth/v1/settings` bekræftede deaktiveret selvoprettelse. Secret-feltet blev kun kontrolleret for tilstedeværelse; se [BUG-011](../bugs/BUG-011-smtp-secret-fejlagtig-readback-kontrol.md).
- Cloudflare dry-run bestod. Offentlig HTML, JavaScript, CSS, manifest og service worker gav 200 og matchede det byggede artefakt byte for byte. Cloudflare API bekræftede versionen med 100 % trafik.

## Resterende praktisk prøve

Der er ikke sendt en rigtig invitation, oprettet en produktionsmedarbejder eller valgt adgangskode på nogens vegne under udrulningen. Første rigtige prøve skal bekræfte levering til modtagerens indbakke, åbning af linket og aktivering på telefonen. Den lokale mailfixture beviser ikke ekstern levering. Brugeren kan nu udføre prøven fra **Indstillinger → Opret medarbejder**.

Luk og genåbn en allerede åben telefonapp for at hente den nye kode. Hvis den stadig viser en gammel side, genindlæs <https://app.lysoglogik.dk/#/indstillinger> i browseren.
