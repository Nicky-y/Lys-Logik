# BUG-014 — Privatlivsteksten beskriver ikke hele behandlingen af henvendelser

| Felt | Værdi |
| --- | --- |
| Status | Åben |
| Fundet | 2026-09-16 |
| Område | Hjemmeside / information om personoplysninger |
| Berørt version og miljø | Lokal HEAD `7cec589` og offentlig privatlivsdialog |
| Påvirkning | Besøgende får ufuldstændige oplysninger om behandlingen af deres henvendelse |
| Rettelse | Ikke rettet |
| Udgivelse | Ingen ændring udgivet |

## Symptom

**Forventet:** Oplysninger om henvendelser dækker bl.a. behandlingsgrundlag, opbevaringstid eller kriterier, relevante modtagere og rettigheder/klagemulighed.

**Observeret:** Dialogen beskriver formål, formularfelter, Supabase, Cloudflare, statistik og kontakt om rettelse/sletning. Den angiver ikke behandlingsgrundlaget for henvendelser, deres opbevaringsperiode eller kriterier, eller klagemuligheden hos Datatilsynet. De nævnte 180 dage gælder cookies/statistikvalg, ikke kundesager. Mailbehandlingen gennem Resend er heller ikke forklaret.

## Reproduktion og evidens

- Åbn Privatliv i sidefoden på den offentlige hjemmeside.
- Sammenhold indholdet med `src/components/PrivacyDialog.astro`.
- [Datatilsynets beskrivelse af retten til oplysning og øvrige rettigheder](https://www.datatilsynet.dk/borger/hvad-er-dine-rettigheder).
- [Vejledning om den registreredes rettigheder, artikel 13 og 14](https://www.datatilsynet.dk/Media/C/0/Registreredes%20rettigheder.pdf).

## Årsag

Den nuværende dialog giver en kort beskrivelse af formular og statistik. Den indeholder ikke en samlet beskrivelse af hele kundedialogens databehandling.

## Løsning

Ikke rettet endnu. Afklar faktiske opbevarings- og sletteprocedurer, behandlingsgrundlag og leverandørforhold, før teksten udvides. En separat, permanent privatlivsside vil gøre oplysningerne lettere at linke til; en selvstændig URL er ikke i sig selv løsningen på manglende indhold.

## Verifikation

2026-09-16: Dialogens tekst læst i koden og på produktion. Dokumentet konstaterer manglende oplysninger; det er ikke en fuldstændig juridisk audit eller kontrol af leverandøraftaler og backendens slettepraksis.

## Forebyggelse

Forslag: Gennemgå privatlivsinformation, når nye datatyper, formål eller leverandører tilføjes. Opbevaringsløfter skal svare til den faktisk implementerede praksis.

## Historik

- 2026-09-16: Fundet under gennemgang af brugerens hjemmeside-tjekliste.
