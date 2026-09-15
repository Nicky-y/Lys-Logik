# BUG-007 — Ugyldige kald forbruger kontaktformularens fælles kvote

| Felt | Værdi |
| --- | --- |
| Status | Åben |
| Fundet | 2026-09-15 |
| Område | Backend / offentlig formular |
| Berørt version og miljø | Sikkerhedsrapport for `2d42598`, genkontrolleret i rapporten mod lokale invitationsændringer |
| Påvirkning | Anonym ugyldig trafik kan midlertidigt blokere rigtige kundehenvendelser |
| Rettelse | Ikke rettet |
| Udgivelse | Ingen; produktionens tilstand ikke kontrolleret |

## Symptom og evidens

Den indleverede sikkerhedsrapport beskriver en lokal reproduktion: 20 forespørgsler uden indsendelsesnøgle fik HTTP 400 og forbrugte minutkvoten. Derefter fik en gyldig fiktiv henvendelse HTTP 429, før botkontrollen blev kaldt. Reproduktionen er rapportens evidens; den er ikke gentaget i logout-rettelsen.

## Rapporteret årsag

[lead-handler.ts](../supabase/functions/_shared/http/lead-handler.ts) kalder `consumeRequest` før indsendelsesnøgle, payload og Turnstile kontrolleres. Den delte kvote i [lead_intake.sql](../supabase/migrations/20260908093333_lead_intake.sql) er 20/minut og 200/time.

## Løsning og planlagt verifikation

Ikke rettet endnu. Næste selvstændige slice skal afvise billigt kontrollerbare fejl før fælles indsendelseskapacitet forbruges og adskille afsendermisbrug fra den samlede nødgrænse. Botkontrol og ressourcegrænser skal bevares.

Test: Ugyldig trafik fra A må ikke blokere en gyldig henvendelse fra B. Verificér også botafvisning og samlet ressourcebegrænsning. Ingen sådan ny kontrol er udført i logout-slicet.

## Historik

- 2026-09-15: Registreret fra brugerens sikkerhedsrapport; afventer særskilt rettelse.
