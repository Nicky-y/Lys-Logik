# BUG-018 — Intake-tests afslutter ikke efter de gennemførte scenarier

| Felt | Værdi |
| --- | --- |
| Status | Under undersøgelse |
| Fundet | 2026-09-18 |
| Område | Browser-tests / lokalt Windows-testmiljø |
| Berørt version og miljø | Arbejdskopi oven på `e7ec5f4`, Playwright med Edge og lokal PGlite-fixture |
| Påvirkning | Testkommandoen returnerer ikke en samlet afslutningsstatus |
| Rettelse | Ikke rettet |
| Udgivelse | Ingen observeret produktionsfejl |

## Symptom

**Forventet:** Efter scenarierne lukker de lokale testservere, og testkommandoen returnerer.

**Observeret:** Alle fire valgte scenarier skrev `ok`, men processen blev stående uden afsluttende opsummering. Den blev afbrudt manuelt og returnerede derefter exitkode 1 uden ny fejltekst.

## Reproduktion og evidens

Kørt 2026-09-18:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.intake.config.ts --grep "ordinary form does not infer|lost response preserves fields" --reporter=list
```

Scenarierne i [intake.spec.ts](../tests/e2e-intake/intake.spec.ts) gennemførte på desktop og emuleret Android. De kontrollerede almindelig indsendelse uden et udledt pilotønske, ny henvendelse og genforsøg efter tabt svar mod det rigtige lokale endpoint og databasen. Ingen produktionshenvendelser blev sendt.

## Årsag

Ukendt. Placeringen efter alle scenarier peger på afslutningsfasen, men det er ikke fastslået, hvilken proces eller ressource der holder kørslen åben.

## Løsning

Ikke rettet. Manuel afbrydelse afsluttede den pågældende kørsel; dette er ingen permanent rettelse.

## Verifikation

De fire scenarier rapporterede hver `ok`. Hele testkommandoen har **ikke** en grøn exitkode og må ikke beskrives sådan. Seks separate pilot-layouttests afsluttede normalt. Produktionsbuild, typekontrol og tolv artefakttests bestod.

## Forebyggelse

Forslag: Undersøg testservernes nedlukning på Windows og registrér processernes afslutning. Ingen ændring i servernes livscyklus er gennemført i dette UI-slice.

## Historik

- 2026-09-18: Observeret under den målrettede kontrol efter fjernelse af pilotafkrydsningen.
