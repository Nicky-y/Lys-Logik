# BUG-015 — Virksomhedsoplysninger mangler en fysisk adresse

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-16 |
| Område | Hjemmeside / virksomhedsoplysninger |
| Berørt version og miljø | Lokal HEAD `7cec589` og offentlig sidefod |
| Påvirkning | Besøgende kan finde arbejdsområde, navn, CVR og kontakt, men ikke virksomhedens fysiske adresse |
| Rettelse | Commit `Add QR form links and publish business address` (2026-09-17) |
| Udgivelse | 2026-09-17, website Worker `1e51fe32-07ca-4fd6-971b-90cd10f41b1c` |

## Symptom

**Forventet:** En kommerciel hjemmesides virksomhedsoplysninger omfatter den fysiske virksomhedsadresse.

**Observeret:** Sidefoden viser `Storkøbenhavn` som område sammen med navn, CVR, telefon og e-mail. Der er ingen fysisk adresse i den gennemgåede hjemmesidekode eller privatlivsdialog.

## Reproduktion og evidens

- Åbn sidefoden på `https://lysoglogik.dk/`.
- `src/data/site.ts:11` definerer arbejdsområdet, og `src/components/SiteFooter.astro:41` viser det.
- [Forbrugerombudsmanden: E-handelsloven](https://forbrugerombudsmanden.dk/alle-emner/anden-lovgivning/e-handelsloven) beskriver oplysningskravet om fysisk adresse for hjemmesider med kommercielt sigte.

## Årsag

Adressen blev tidligere fjernet efter brugerens ønske om kun at vise arbejdsområdet. Den blev ikke bevaret som let tilgængelig virksomhedsoplysning et andet sted på hjemmesiden.

## Løsning

Brugeren oplyste 2026-09-17 adressen Tybjergparken 5, 2660 Brøndby Strand og bad om at få den tilføjet. Adressen er nu defineret særskilt fra arbejdsområdet i `src/data/site.ts` og vises i et `address`-element under virksomhedsnavnet i den fælles sidefod (`src/components/SiteFooter.astro`). Arbejdsområdet bevares til de øvrige tekster. Der vises intet c/o-navn.

## Verifikation

2026-09-16: Offentlig sidefod og privatlivsdialog samt kildekode kontrolleret. CVR-registerets aktuelle adresse og virksomhedsstatus er ikke kontrolleret; rapporten angiver derfor ingen erstatningsadresse.

2026-09-17: Otte målrettede Playwright-tests bestod på desktop og mobil. `footer provides real business details and working contact destinations` kontrollerer adresse og kontaktlinks. Testen for specialiseringsbadget kontrollerer også adressen på bygningsautomatik-siden. Testen af sidefodens flugtning ved mellemstor bredde består. Lokal prøvevisning på port 4341 viser begge adresselinjer. Kontrollen validerer den brugeroplyste tekst og visning, ikke CVR-registeret. Ingen deployment foretaget.

## Forebyggelse

Udgivelse verificeret 2026-09-17: Den brugeroplyste adresse er kontrolleret i
offentlig HTML på både forsiden og `/services/bygningsautomatik/` efter QR-udgivelsen.
Ændringen er fortsat ikke committet.

Arbejdsområde og fysisk adresse er nu adskilte data. Den eksisterende E2E-test er opdateret fra et forbud mod at vise adressen til en kontrol af den korrekte adresse og fravær af c/o-navn.

## Historik

- 2026-09-16: Fundet under gennemgang af brugerens hjemmeside-tjekliste.
- 2026-09-17: Brugeroplyst adresse tilføjet; lokalt verificeret på forside og serviceside. Afventer commit og deployment.
- 2026-09-17: Udgivet sammen med de nye QR-indgange og verificeret offentligt.
