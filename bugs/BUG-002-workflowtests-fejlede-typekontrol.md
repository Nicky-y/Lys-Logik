# BUG-002 — Workflowtests bestod ved kørsel, men fejlede typekontrollen

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet og verificeret | 2026-09-15 |
| Område | Tests / TypeScript / build |
| Observeret version og miljø | `4c70ea0`, lokal produktionsbuild og GitHub Actions |
| Påvirkning | Typefejl i tests blokerede hjemmesidens build og udgivelse |
| Rettelse | [`91abc31`](https://github.com/Nicky-y/Lys-Logik/commit/91abc31a0249bc950ad34e0a441ed9c9bc73d9cc) |
| Udgivelse | Rettelse i tests; ingen ændring af produktionsadfærd |

## Symptom

Testkørslen og appens build bestod, men `npm.cmd run build` fejlede i `astro check` med 13 TypeScript-fejl. Det samlede build var derfor ikke grønt, selv om runtime-testene bestod.

## Reproduktion og evidens

På den berørte version kunne fejlen reproduceres med `npm.cmd run build`. [GitHub-kørsel 34973076428](https://github.com/Nicky-y/Lys-Logik/actions/runs/34973076428) fejlede under »Build and verify live enquiry form« efter de gennemførte test- og app-buildtrin.

Fejlene fordelte sig på:

- [conversation-model.test.ts](../tests/conversation-model.test.ts): Seks typefejl, fordi billedfixtures brugte almindelige strenge, hvor kontrakten kræver `AttachmentId`.
- [mail.integration.test.ts](../tests/mail.integration.test.ts): Fem typefejl ved adgang til felter på SQL-resultater af typen `unknown`.
- [operations.integration.test.ts](../tests/operations.integration.test.ts): To typefejl ved læsning af `count` fra SQL-resultater af typen `unknown`.

## Årsag

Node-testkørslen fjernede TypeScript-annoteringer og udførte testene uden en fuld typekontrol. Appens særskilte TypeScript-konfiguration dækkede heller ikke disse testfiler.

Hjemmesidens build kører `astro check`, som også kontrollerer testene under repositoryets overordnede TypeScript-konfiguration. Her blev to mangler synlige: Fixtures overholdt ikke den validerede identitetskontrakt, og flere databaseforespørgsler manglede typer eller validering af deres resultater.

## Løsning

- Billedidentiteter oprettes nu med `AttachmentIdSchema.parse(...)`.
- SQL-resultater for simple status- og tællefelter har eksplicitte resultattyper, der matcher forespørgslerne.
- Beskedens `lead_id` og `attachments` valideres med `MessageSchema.pick(...).parse(...)`, før testen bruger dem. Den tidligere typekonvertering af vedhæftninger er fjernet.

Rettelsen ændrer kun de tre testfiler. Typekontrollen og produktionskontrakterne er bevaret.

## Verifikation

Den 15. september 2026 på den rettede kode:

```powershell
node --test tests/conversation-model.test.ts tests/mail.integration.test.ts tests/operations.integration.test.ts
npm.cmd run build
```

- De 22 berørte tests bestod.
- `astro check` kontrollerede 114 filer med 0 fejl, 0 advarsler og 0 hints.
- Produktionsbuildet genererede 7 sider, og de 11 tests af buildets filer bestod.
- [GitHub-kørsel 34973717232](https://github.com/Nicky-y/Lys-Logik/actions/runs/34973717232) på `91abc31` gennemførte med succes.

Kontrollen dokumenterer rettelsen af test- og buildfejlene; den erstatter ikke browserkontrol af appens kundeworkflows.

## Forebyggelse

Ved ændringer i fælles kontrakter eller tests skal både runtime-tests og den relevante typekontrol/build køres. Appens build alene dækker ikke repositoryets samlede testkode. Brug kontrakternes schemas til validerede identiteter i fixtures og tydelige typer eller schemas ved SQL-resultater.

## Historik

- 2026-09-15: Blev synlig i CI efter rettelsen af [BUG-001](BUG-001-adgangstest-uden-arbejdsrolle.md); reproduceret lokalt.
- 2026-09-15: Rettet og verificeret i `91abc31`, derefter registreret i fejlhistorikken.
- 2026-09-15: Genåbnet under de lokale invitationsændringer: ni DB-tests bestod, men `astro check` fandt fem fejl i testhjælperen `reserve`. Standardparameteren `randomUUID()` blev infereret som Nodes UUID-template-type, som ikke accepterede kontraktens brandede `StaffInvitationId` som argument. Hjælperens rå SQL-input er nu eksplicit `string`; resultater valideres fortsat med invitationsschemaet. Efter rettelsen bestod `npm.cmd run build`: 123 filer, ingen fejl/advarsler/hints, syv sider og elleve artefakttests. Genlukket lokalt; denne opfølgning er endnu ikke committet.
