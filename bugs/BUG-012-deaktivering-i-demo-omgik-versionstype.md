# BUG-012 — Deaktivering i demo omgik den validerede versionstype

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret lokalt |
| Fundet | 2026-09-15 |
| Område | App-demo / TypeScript / build |
| Berørt version og miljø | Lokalt arbejde oven på `7cec589` |
| Påvirkning | Appens typekontrol og produktionsbuild blev blokeret |
| Rettelse | Endnu ikke committet |
| Udgivelse | Appversion `44212126-67f2-4baa-af22-ef7f71ac724c`, verificeret 2026-09-16 |

## Symptom

**Forventet:** Demoen skal følge den samme validerede adgangskontrakt som den rigtige app.

**Observeret:** `npm.cmd run app:build` fejlede med `TS2322` i `staff-access-demo.ts`: et almindeligt `number` kunne ikke tildeles en `StaffVersion`.

## Reproduktion og evidens

Den første lokale implementering udførte `member.access_version += 1`. Runtime-testen af demoen bestod, mens TypeScript afviste resultatets manglende brand.

## Årsag

Aritmetik returnerer et almindeligt tal. Direkte tildeling omgik derfor kontraktens validerede identitet/version. Node-testkørslen fjerner typer og er ikke i sig selv en typekontrol.

## Løsning

[Demo-gatewayen](../operations/src/staff-access-demo.ts) validerer nu hele den ændrede medarbejder gennem `StaffSchema.parse(...)`, før den opdaterer demoens tilstand. Ingen typeassertion eller svækkelse af kontrakten er indført.

## Verifikation

- `npm.cmd run app:build` bestod efter rettelsen den 15. september 2026.
- [Demoens kontrakttest](../tests/staff-deactivation.test.ts) kontrollerer bevaret medarbejder/rolle, ændret aktiv-status, versionsstigning og beskyttelse af sidste ejer. Den bestod i `npm.cmd test`: 188 tests, 0 fejl.
- Repositoryets samlede typekontrol gennem `npm.cmd run build` bestod: 129 filer, 0 fejl/advarsler/hints og 11 artefakttests.

## Forebyggelse

Bevar schema-validering ved ændring af brandede værdier, og kør både runtime-tests og typekontrol/build.

## Historik

- 2026-09-15: Fundet ved app-build under implementeringen; rettet og build verificeret før udgivelse.
- 2026-09-16: Rettelsen indgik i den verificerede [produktionsudgivelse](../docs/staff-deactivation-release.md). Kildeændringerne er endnu ikke committet.
