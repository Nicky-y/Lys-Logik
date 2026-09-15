# Bygningsautomatik i henvendelsesflowet

Kategorien har den stabile værdi `bygningsautomatik` og vises som **Bygningsautomatik**. `supabase/functions/_shared/contracts/service.ts` er fælles kontrakt for formularvalidering, HTTP-modtagelse og medarbejderappens læsemodel.

Servicesidens kontaktlinks vælger kategorien direkte. Formularen viser de seks ydelser i samme rækkefølge som kataloget og tilbyder fortsat “Noget andet”. Tidligere delte links med `service=andet&topic=bygningsautomatik` vælger nu den nye kategori uden at indsætte tekst i kundens beskrivelse.

## Lagring og behandling

Migrationen `20260915000100_building_automation_service.sql` udvider alene databasens tilladte kategorier. Ingen gemte sager, beskrivelser, oprindelige snapshots eller kvitteringer omskrives. Historiske kategorier som `belysning`, `forbedringer` og `andet` understøttes fortsat.

Den eksisterende transaktion gemmer sag, indsendelsessnapshot, historik og notifikationsopgaver sammen. Gentagelser med samme indsendelsesnøgle og indhold giver samme kvittering. Kategorien vises på appens pipelinekort og i sagsvisningen. Faglig vurdering, statusændringer, kalender, kundesamtaler og push knytter sig fortsat til sagens id. Der indføres ingen parallel pipeline eller ændring af adgangsreglerne. Push indeholder fortsat ingen kundeoplysninger; en outboxrække dokumenterer en leveringsopgave, ikke en modtaget notifikation.

## Udgivelse

Kode og lokal test aktiverer ikke ændringen i produktion. Udgiv i denne rækkefølge:

1. Anvend databasemigrationen.
2. Udgiv `create-lead` med den udvidede fælles kontrakt.
3. Byg og udgiv medarbejderappen. Luk gamle appvinduer og åbn appen igen, så den nye version kan aktiveres, før nye kategorier modtages.
4. Byg og udgiv hjemmesiden, som derefter kan sende den nye kategori.

Ved fejl før trin 4 kan hjemmesiden fortsat bruge den eksisterende formular. Rul ikke databasekontrakten eller appens kategoristøtte tilbage efter modtagelse af nye sager; behold læsestøtten for `bygningsautomatik`.

## Verifikation

- Kontrakttest: alle publicerede valg accepteres og har en dansk etiket.
- PostgreSQL-integration: alle nye og historiske kategorier, snapshots, kvitteringsgenforsøg og leveringsopgaver. Opgradering med en eksisterende `andet`-sag bevarer alle dens felter.
- Browser: serviceside → forudvalgt formular → lokal HTTP-handler → migreret database, på desktop og Android.
- Browser: ny kategori i appens pipeline og sagsvisning, statusændring med historik og uændret originalt snapshot, på desktop og Android.

Testene bruger lokale data og sender ingen mails eller pushbeskeder til rigtige modtagere. Fysisk levering i produktion skal kontrolleres særskilt efter udgivelse.
