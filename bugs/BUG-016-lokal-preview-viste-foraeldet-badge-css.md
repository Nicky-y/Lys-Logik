# BUG-016 — Lokal prøvevisning viste gammel badge-styling efter ændring

| Felt | Værdi |
| --- | --- |
| Status | Under undersøgelse; genstart løste det observerede symptom |
| Fundet | 2026-09-17 |
| Område | Lokal Astro-prøvevisning |
| Berørt version og miljø | Arbejdskopi efter `7cec589`, programmatisk Astro dev på port 4341 |
| Påvirkning | Designreview kunne vise gammel CSS sammen med nyt indhold |
| Rettelse | Ingen permanent rettelse |
| Udgivelse | Ikke observeret i produktion |

## Symptom

**Forventet:** Ændringer i ServiceCatalogue.astro vises samlet i den lokale prøvevisning.

**Observeret:** Det nye dekorative symbol blev vist, men badget var stadig rektangulært med den tidligere grønne farve. Koden havde allerede rund form, guldkant og mørkere grøn baggrund.

## Reproduktion og evidens

2026-09-17: Visuel kontrol i Codex-browseren efter ændring af `src/components/ServiceCatalogue.astro`. Ny navigation til samme forside med ændret preview-parameter viste fortsat gammel styling. Den separate, nyopstartede Playwright-testserver bestod samtidig begge badge-tests, herunder forventet baggrundsfarve, kontrast, position og klik.

## Årsag

Ukendt. Forældet stil-cache eller manglende invalidering i den eksisterende dev-server er en hypotese. Browserens og serverens cachetilstande blev ikke isoleret.

## Løsning

Den eksisterende lokale preview-proces blev stoppet og startet igen med samme port og cachemappe. Derefter blev siden åbnet med en ny preview-parameter. Der blev ikke ændret applikationskode for at omgå problemet.

## Verifikation

Efter genstart viste skærmbilledet mørkegrønt, afrundet badge med guldkant, guldsymbol og skygge. Det er en verificeret genopretning af prøvevisningen, ikke bevis for en permanent rettelse eller en bestemt årsag.

## Forebyggelse

Ved uoverensstemmelse mellem kode/test og synlig prøvevisning: kontrollér styling og genstart den berørte preview-proces før designgodkendelse. Ved gentagelse bør CSS-responser og HMR-invalidering undersøges.

## Historik

- 2026-09-17: Observeret under justering af specialiseringsbadge. Lokal prøvevisning genoprettet; permanent årsag uafklaret.
- 2026-09-18: Gentaget på port 4341 efter `7be5b32`. Den nye tekst blev vist under billedet uden den nye positionering og kant. En separat Astro-prøvevisning på port 4342 med egen Vite-cache viste korrekt transparent badge med lysegrøn kant øverst til højre. Visuelt kontrolleret i browseren; de to fokuserede desktop-/mobiltests bestod mod den friske server. Dette er en verificeret omgåelse; årsagen er fortsat ikke isoleret.
