# BUG-008 — Vedhæftning godkendes ud fra oplyst filtype

| Felt | Værdi |
| --- | --- |
| Status | Åben |
| Fundet | 2026-09-15 |
| Område | Kundemail / vedhæftninger |
| Berørt version og miljø | Sikkerhedsrapport for `2d42598`, genkontrolleret i rapporten mod lokale invitationsændringer |
| Påvirkning | En vildledende vedhæftning kan fremstå som et tilladt billede ved download |
| Rettelse | Ikke rettet |
| Udgivelse | Ingen; produktions-/udbyderforløbet ikke verificeret |

## Symptom og evidens

Sikkerhedsrapportens lokale handler-reproduktion accepterede `fixture.cmd` med `image/png` og harmløse tekstbytes. Svaret var 200 med den oprindelige filendelse. Intet blev kørt. Reproduktionen er rapportens evidens; den er ikke gentaget under logout-rettelsen.

Der er ikke påvist automatisk kodekørsel eller XSS. Den fulde risiko afhænger af Resends videreførelse af metadata og af, at en medarbejder henter og åbner filen. Udbyderens behandling er ikke efterprøvet med rigtige mails.

## Rapporteret årsag

[mail.ts](../supabase/functions/_shared/contracts/mail.ts) kontrollerer oplyst MIME-type og størrelse. [customer-attachment.ts](../supabase/functions/_shared/http/customer-attachment.ts) kontrollerer ikke det faktiske format og bevarer filnavnet; [message-attachment.tsx](../operations/src/message-attachment.tsx) bruger også det oprindelige navn til download.

## Løsning og planlagt verifikation

Ikke rettet endnu. Kontrollér format fra bytes på serveren, afvis uoverensstemmelser og brug sikre navne ud fra verificeret format på server og klient. Adgangskontrol, download som vedhæftning og `nosniff` skal bevares.

Test: Forkert filendelse/MIME, ugyldige billedbytes og gyldige understøttede filer. Afklar separat, hvilke metadata Resend faktisk viderefører. Disse kontroller er ikke udført i logout-slicet.

## Historik

- 2026-09-15: Registreret fra brugerens sikkerhedsrapport; afventer særskilt rettelse.
