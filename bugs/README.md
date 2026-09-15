# Fejlhistorik

Her samler vi fejl i Lys & Logiks hjemmeside, app og backend samt projektets tests og buildværktøjer. Hver registrering forklarer symptomet, årsagen, løsningen og hvordan rettelsen blev kontrolleret. Løste fejl bliver stående, så beslutninger og erfaringer kan findes igen.

Oversigten er startet 15. september 2026 med to dokumenterede fejl fra den seneste udgivelse. Den er ikke en fuldstændig gennemgang af alle tidligere fejl.

## Oversigt

| ID | Fejl | Område | Status | Fundet | Rettelse |
| --- | --- | --- | --- | --- | --- |
| [BUG-001](BUG-001-adgangstest-uden-arbejdsrolle.md) | Adgangstest forventede kundedata uden arbejdsrolle | Integrationstest / rettigheder | Løst og verificeret | 2026-09-15 | `4c70ea0` |
| [BUG-002](BUG-002-workflowtests-fejlede-typekontrol.md) | Workflowtests bestod ved kørsel, men fejlede typekontrollen | Tests / build | Løst og verificeret | 2026-09-15 | `91abc31` |

Der er ingen åbne fejl **registreret i denne oversigt** endnu. Det er ikke en garanti for, at systemet er fejlfrit.

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
