# Medarbejderdeaktivering — produktionsudgivelse 16. september 2026

**Indstillinger → Medarbejdere og rettigheder** har nu **Deaktivér medarbejder** for andre aktive medarbejdere. Kun aktive ejere kan oprette og deaktivere medarbejdere. Egen konto har ingen deaktiveringsknap, og serveren afviser selv-deaktivering, også med flere ejere. Identitet, sager, beskeder og historik bevares.

## Udgivne dele

- Supabase-projekt: `elydnshkxcwlmbdmtpys`.
- Migration: `20260915000600_staff_deactivation.sql`. Den blev anvendt atomisk sammen med registrering af de præcise SQL-statements i migrationshistorikken. Kontrolleret 2026-09-16 kl. 07:54:18 UTC.
- Migrationens SHA-256: `06221bc4207b2808f36f24be72b580e602dad92efdd31e8466e9b1340954109a`.
- Cloudflare Worker: `lys-og-logik-app`, version `44212126-67f2-4baa-af22-ef7f71ac724c`.
- Deployment: `3a7231be-c3ba-435c-8f93-dda1dd2d867d`, 100 % trafik fra 2026-09-16 kl. 07:54:45 UTC.
- Adresse: <https://app.lysoglogik.dk/#/indstillinger>.
- Kilde: testet lokalt arbejde oven på `7cec589`. Denne bestilling omfattede deploy; ændringerne er endnu ikke committet eller pushet.

| Artefakt | SHA-256 |
| --- | --- |
| `assets/index-DOZb2ueN.js` | `232b21d887280ed5cae47bd8e326d4c8781f781c535fb615e0d3d24dffdcb1ba` |
| `assets/index-DiQvqTZo.css` | `3c6e15fd1cdaa49146fdf3fc3fc99a81f8ecc9303d21c28c98d6ef86a8a45023` |

## Kontrol

- Før deploy: 36 fokuserede unit-/integrationstests og 34 browsertests på desktop og Android-emulering bestod. De dækker ejeradgang, invitationer, selv-deaktivering med én/flere ejere, direkte API-forsøg fra begge arbejdsroller uden ejerflag, bevaret historik, genforsøg og versionskonflikter.
- Typekontrol: 129 filer, 0 fejl, 0 advarsler og 0 hints. Appens produktionsbuild blev gentaget ved deploy og bestod. Den eksisterende advarsel om en JS-chunk over 500 kB består.
- Cloudflare dry-run bestod med 22 statiske filer og ingen bindings.
- Produktionens migrationshistorik og funktionens SQL-body matcher den testede migrationsfil. Funktionen er security-definer med tom search path.
- Anonym funktionseksekvering samt direkte opdatering og sletning af medarbejderrækker fra browserrollen er afvist. Medarbejdertabellens RLS og den eksisterende adgangstrigger er aktive.
- Et offentligt kald til `deactivate_staff_member` uden login blev afvist med HTTP 401 / PostgreSQL-kode `42501`.
- Offentlig HTML, JavaScript, CSS, manifest, service worker, offlinevisning og de kontrollerede ikoner/logo returnerede HTTP 200 og matchede buildets filer byte for byte. Sikkerhedsheaders er til stede.
- Cloudflares deploymentoversigt bekræftede den nye version med 100 % trafik.

Migrationen tilføjer en funktion; den ændrer ingen medarbejderrækker. Ingen produktionsmedarbejdere blev oprettet eller deaktiveret under kontrollen. Auth/SMTP og eksisterende Edge-funktioner blev ikke ændret. Den fulde ændring af en rigtig medarbejders adgang er dækket af lokale integrationer/browserforløb, ikke en faktisk deaktivering i produktion.

Migrationen blev anvendt via [Supabases Management API til SQL](https://supabase.com/docs/reference/api/v1-run-a-query), med projektkontrol, forventet migrationsversion, transaktion og readback. Hemmeligheder blev læst fra den ignorerede miljøfil og er ikke med i rapporten eller appbuildet.

## På telefonen

Luk og genåbn appen for at hente den nye kode. Genindlæs om nødvendigt <https://app.lysoglogik.dk/#/indstillinger> i browseren. Allerede viste oplysninger og notifikationer, der er overdraget til push-leverandøren, kan ikke trækkes tilbage. Nye arbejds- og administrationskald kræver fortsat en aktiv medarbejderprofil.
