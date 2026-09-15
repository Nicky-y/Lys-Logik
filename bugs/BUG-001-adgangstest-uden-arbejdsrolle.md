# BUG-001 — Adgangstest forventede kundedata uden arbejdsrolle

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet og verificeret | 2026-09-15 |
| Område | Integrationstest / medarbejderrettigheder |
| Berørt version og miljø | `f360e9f`, lokal testkørsel og GitHub Actions |
| Påvirkning | Fejlagtig testforventning blokerede CI og hjemmesidens udgivelse |
| Rettelse | [`4c70ea0`](https://github.com/Nicky-y/Lys-Logik/commit/4c70ea0bb0f8cc9558621b7234c815c6b5112af8) |
| Udgivelse | Rettelse i tests; ingen ændring af produktionsadfærd |

## Symptom

Testen forventede, at en aktiv medarbejder uden arbejdsrolle kunne læse én henvendelse. Databasen returnerede korrekt nul rækker, og assertionen fejlede med `0 !== 1`.

Den gældende rettighedsmodel kræver en aktiv arbejdsrolle (`backoffice` eller `technical`) for adgang til kundedata. Login, medlemskab eller ejerrettigheder alene giver ikke denne adgang. Fejlen lå i testens forældede forventning.

## Reproduktion og evidens

På den berørte version kunne fejlen reproduceres med `npm.cmd test`: 154 af 155 tests bestod.

I [adgangstesten](../tests/intake.integration.test.ts) blev en medarbejder oprettet med `user_id` og `display_name`, men uden `role`. Testen skiftede derefter til medarbejderens adgang og forventede at kunne læse henvendelsen.

Fejlen blev også observeret i [GitHub-kørsel 34972315942](https://github.com/Nicky-y/Lys-Logik/actions/runs/34972315942), under »Test intake and operations rules«.

## Årsag

[Migrationen for medarbejderadgang](../supabase/migrations/20260915000400_staff_access.sql) fjernede den implicitte arbejdsrolle og gjorde adgang afhængig af en eksplicit rolle. Den eksisterende testfixture og forventningen om adgang var ikke blevet tilpasset denne ændring.

## Løsning

Testen verificerer nu først, at en medarbejder uden arbejdsrolle hverken kan læse henvendelser eller historik og heller ikke kan give sig selv `backoffice`-rollen.

Derefter tildeler testens privilegerede opsætning eksplicit rollen `backoffice`, og testen kontrollerer adgangen. De eksisterende kontroller af forbudte direkte ændringer og tab af adgang ved deaktivering er bevaret. Produktionsadgangen blev ikke lempet for at få testen til at bestå.

## Verifikation

Den 15. september 2026:

- `node --test tests/intake.integration.test.ts`: 13 tests bestod efter rettelsen.
- [Næste CI-kørsel](https://github.com/Nicky-y/Lys-Logik/actions/runs/34973076428) bestod testtrinnet. Den fejlede senere ved en separat typekontrolfejl, registreret som [BUG-002](BUG-002-workflowtests-fejlede-typekontrol.md).
- [Den efterfølgende samlede CI-kørsel](https://github.com/Nicky-y/Lys-Logik/actions/runs/34973717232) bestod efter begge rettelser.

Kontrollen vedrører databaseadgang i integrationstesten; den er ikke i sig selv en komplet sikkerhedsgennemgang af alle rettigheder.

## Forebyggelse

Den rettede test dækker nu eksplicit medlemskab uden arbejdsrolle og afviser selvpromovering. Nye testfixtures skal vælge arbejdsrolle bevidst og holde ejerskab adskilt fra adgang til kundearbejde.

## Historik

- 2026-09-15: Fundet i CI og reproduceret lokalt. Rettet og verificeret i `4c70ea0`.
- 2026-09-15: Registreret i fejlhistorikken efter udgivelsen.
