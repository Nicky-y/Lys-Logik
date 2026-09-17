# BUG-013 — Den offentlige hjemmeside beder om ikke at blive indekseret

| Felt | Værdi |
| --- | --- |
| Status | Åben |
| Fundet | 2026-09-16 |
| Område | Hjemmeside / metadata |
| Berørt version og miljø | Lokal HEAD `7cec589` og offentlig hjemmeside, kontrolleret 2026-09-16 |
| Påvirkning | Søgemaskiner instrueres om at undlade indeksering af siderne |
| Rettelse | Ikke rettet |
| Udgivelse | Ingen ændring udgivet |

## Symptom

**Forventet:** Indekseringspolitikken skelner mellem en offentlig markedsføringsside, der skal kunne findes, og en lokal prøvevisning.

**Observeret:** Både forsiden og `/services/bygningsautomatik/` på `https://lysoglogik.dk` returnerer HTTP 200 med `<meta name="robots" content="noindex, nofollow">`.

## Reproduktion og evidens

- `src/layouts/Layout.astro:25` indeholder tagget uden miljøbetingelse.
- Læst med Playwright/Edge på den offentlige forside ved 1440 og 390 px samt bygningsautomatik-siden ved 1440 px.
- Det er en kontrol af det udsendte signal. Søgemaskinernes faktiske indeks og Search Console er ikke kontrolleret.

## Årsag

Fælleslayoutet sender den samme indekseringsinstruks i både prøvevisning og produktion.

## Løsning

Ikke rettet endnu. Afklar den ønskede offentlige synlighed, især hvis virksomheden skifter retning, og adskil derefter metadata for produktion og prøvevisninger.

## Verifikation

2026-09-16: Kildekode og tre offentlige browserindlæsninger viste samme tag. Ingen runtimefiler eller produktionsindstillinger ændret.

## Forebyggelse

Forslag: Kontroller produktionsartefaktets robots-metadata ved build og offentlig udgivelse. Kontrollér preview-politikken separat.

## Historik

- 2026-09-16: Fundet under gennemgang af brugerens hjemmeside-tjekliste.
