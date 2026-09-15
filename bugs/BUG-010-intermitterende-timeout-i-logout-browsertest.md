# BUG-010 — Intermitterende timeout ved genåbning i logout-test

| Felt | Værdi |
| --- | --- |
| Status | Åben — ikke gentaget i de efterfølgende kørsler |
| Fundet | 2026-09-15 |
| Område | E2E-test / lokalt testmiljø |
| Berørt version og miljø | Lokal logout-rettelse, Edge desktop, standardgrænse 30 sekunder |
| Påvirkning | Én testkørsel blev rød; ingen dokumenteret produktionsfejl |
| Rettelse | Ingen ændring af timeout eller testkrav |
| Udgivelse | Ikke relevant |

## Observation og evidens

`logout.spec.ts`-scenariet med en tokenfornyelse i en anden fane ramte samlet 30 sekunders timeout under samtidig kørsel af den fulde Node-testpakke og build. Tracen viste, at logout-skærm og fravær af kundedata var kontrolleret i begge faner; kørslen stoppede under den efterfølgende `page.reload()`.

Den præcise årsag er ikke bevist. Ressourcekonkurrence er en hypotese: enkelte browserkommandoer tog flere sekunder, og den samme test bestod senere på omtrent fem sekunder. Der er ikke blot hævet timeout for at skjule fejlen.

## Verifikation og opfølgning

To efterfølgende samlede browserkørsler bestod (henholdsvis 14 og 16 scenarier på desktop/Android); den berørte test var med i begge. Den endelige kørsel tog 1,6 minut. Hvis symptomet vender tilbage, sammenlignes trace og samtidige processer, før test- eller produktkode ændres. Dette dokument er ikke en konklusion om årsagen.

## Historik

- 2026-09-15: Timeout observeret én gang og registreret med ukendt årsag. Efterfølgende relevante kontroller bestod.
