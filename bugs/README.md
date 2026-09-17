# Fejlhistorik

Her samler vi fejl i Lys & Logiks hjemmeside, app og backend samt projektets tests og buildværktøjer. Hver registrering forklarer symptomet, årsagen, løsningen og hvordan rettelsen blev kontrolleret. Løste fejl bliver stående, så beslutninger og erfaringer kan findes igen.

Oversigten er startet 15. september 2026 med to dokumenterede fejl fra den seneste udgivelse. Den er ikke en fuldstændig gennemgang af alle tidligere fejl.

## Oversigt

| ID | Fejl | Område | Status | Fundet | Rettelse |
| --- | --- | --- | --- | --- | --- |
| [BUG-001](BUG-001-adgangstest-uden-arbejdsrolle.md) | Adgangstest forventede kundedata uden arbejdsrolle | Integrationstest / rettigheder | Løst og verificeret | 2026-09-15 | `4c70ea0` |
| [BUG-002](BUG-002-workflowtests-fejlede-typekontrol.md) | Workflowtests bestod ved kørsel, men fejlede typekontrollen | Tests / build | Løst og verificeret | 2026-09-15 | `91abc31` |
| [BUG-003](BUG-003-typescript-parameter-property-i-node-tests.md) | TypeScript parameter-property kunne ikke køres af Node-tests | Tests / delt kontrakt | Løst og verificeret | 2026-09-15 | `fcfd7cd` |
| [BUG-004](BUG-004-invitationstest-ramte-flere-statusfelter.md) | Invitationstest fandt flere statusfelter | E2E-tests | Løst og verificeret | 2026-09-15 | `fcfd7cd` |
| [BUG-005](BUG-005-invitation-ignorerede-navngivet-servernoegle.md) | Invitation ignorerede navngivet servernøgle | Backend / konfiguration | Løst og verificeret | 2026-09-15 | `fcfd7cd` |
| [BUG-006](BUG-006-logout-kunne-bevare-session.md) | Logout kunne bevare en brugbar session | App / autentifikation | Løst og verificeret; udgivet | 2026-09-15 | `5a4c373` |
| [BUG-007](BUG-007-ugyldige-kald-forbruger-faelles-formularkvote.md) | Ugyldige kald forbruger fælles formularkvote | Backend / formular | Åben | 2026-09-15 | Ikke rettet |
| [BUG-008](BUG-008-vedhaeftning-stoler-paa-oplyst-filtype.md) | Vedhæftninger stoler på oplyst filtype | Kundemail / filer | Åben | 2026-09-15 | Ikke rettet |
| [BUG-009](BUG-009-auth-test-matchede-vaertsnavn-som-logout.md) | Auth-test matchede værtsnavn som logout-endpoint | Testfixture | Løst og verificeret | 2026-09-15 | `5a4c373` |
| [BUG-010](BUG-010-intermitterende-timeout-i-logout-browsertest.md) | Intermitterende timeout ved genåbning i logout-test | E2E / testmiljø | Åben – ikke gentaget | 2026-09-15 | Ingen ændring |
| [BUG-011](BUG-011-smtp-secret-fejlagtig-readback-kontrol.md) | SMTP-kontrol krævede plaintext-secret ved readback | Deployværktøj | Løst; separat readback bestået | 2026-09-15 | Lokal kontrol |
| [BUG-012](BUG-012-deaktivering-i-demo-omgik-versionstype.md) | Demoens deaktivering tildelte uvalideret version | App-demo / build | Løst og verificeret; udgivet | 2026-09-15 | `3340906` |
| [BUG-013](BUG-013-offentlig-hjemmeside-har-noindex.md) | Offentlig hjemmeside sender noindex | Hjemmeside / metadata | Åben | 2026-09-16 | Ikke rettet |
| [BUG-014](BUG-014-privatlivstekst-mangler-oplysninger-om-henvendelser.md) | Privatlivsteksten mangler oplysninger om henvendelser | Hjemmeside / privatliv | Åben | 2026-09-16 | Ikke rettet |
| [BUG-015](BUG-015-virksomhedsoplysninger-mangler-fysisk-adresse.md) | Virksomhedsoplysninger mangler fysisk adresse | Hjemmeside / virksomhedsoplysninger | Løst og verificeret offentligt | 2026-09-16 | Se commitreference i registreringen |
| [BUG-016](BUG-016-lokal-preview-viste-foraeldet-badge-css.md) | Lokal prøvevisning viste gammel badge-styling | Lokal preview / Astro | Under undersøgelse; symptom løst ved genstart | 2026-09-17 | Ingen permanent rettelse |
| [BUG-017](BUG-017-redirect-test-hentede-live-html.md) | Mocked redirect-test hentede live HTML | Browser-tests | Løst og verificeret | 2026-09-17 | Se commitreference i registreringen |

Oversigten er ikke en fuldstændig sikkerhedsgennemgang. BUG-007 og BUG-008 er registreret fra den indleverede rapport og behandles som separate rettelser.

## Sådan bruges mappen

1. Søg i oversigten, før du opretter en ny registrering. Flere symptomer med samme årsag hører normalt til samme fejl.
2. Kopiér [skabelonen](TEMPLATE.md) til `BUG-NNN-kort-beskrivelse.md` med næste ledige nummer. Numre genbruges ikke.
3. Beskriv forventet og faktisk adfærd, påvirkning og en reproduktion eller anden konkret evidens. En fejl kan registreres, selv om årsagen endnu er ukendt.
4. Opdatér samme fil under undersøgelse og rettelse. Notér den faktiske kontrol, hvad den dækkede, og hvad der eventuelt stadig mangler. En planlagt test er ikke et gennemført resultat.
5. Tilføj commitreference, når rettelsen er committet. Notér deployment særskilt, når det er relevant og verificeret; et lokalt fix er ikke nødvendigvis online.
6. Hold rækken i oversigten ajour. Bevar både registrering og væsentlig historik efter lukning.

## Status

- **Åben:** Observeret eller indberettet fejl; endnu ikke rettet. Angiv, hvis den ikke er reproduceret.
- **Under undersøgelse:** Årsag eller løsning undersøges.
- **Rettet – afventer verifikation:** Rettelsen findes, men relevant kontrol mangler.
- **Løst og verificeret:** Rettelsen er kontrolleret med dokumenteret resultat og afgrænsning.
- **Afkræftet:** Undersøgelsen viste, at forholdet ikke var en fejl. Begrundelsen bevares.

Ønsker, nye funktioner og planlagte forbedringer hører til backloggen. Midlertidige miljø- eller adgangsproblemer registreres her, hvis de viser en konkret fejl i vores kode eller opsætning. Brug fiktive data i eksempler og kun nødvendige, rensede loguddrag.
