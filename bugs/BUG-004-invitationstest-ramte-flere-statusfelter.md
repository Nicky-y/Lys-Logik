# BUG-004 — Invitationstest ramte også notifikationernes statusfelt

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-15 |
| Område | E2E-tests / Indstillinger |
| Berørt version og miljø | Lokale invitationsændringer oven på `2d42598`; desktop og emuleret Android |
| Påvirkning | Fire nye testscenarier stoppede før kontrol af de tilsigtede resultater |
| Rettelse | `fcfd7cd` |
| Udgivelse | Testrettelse; versioneret sammen med `fcfd7cd` |

## Symptom og årsag

Testene søgte efter `page.getByRole('status')`. Indstillinger har både invitationskvitteringen og pushindstillingernes status. Playwright afviste den tvetydige locator med en strict-mode-fejl. Det var en testfejl, ikke evidens for fejlet mailafsendelse.

## Løsning

I [staff-invitations.spec.ts](../tests/e2e-operations/staff-invitations.spec.ts) er statuskontrollen afgrænset til invitationssektionen. Kontrollen af kvitteringens indhold, databaseadgang, antal mailforsøg og aktivering er bevaret.

## Verifikation og historik

- 2026-09-15: Fire fejl blandt 22 scenarier i første kørsel; eksisterende rettighedsscenarier bestod.
- 2026-09-15: Efter rettelsen bestod alle otte invitationsscenarier på desktop og emuleret Android. Maillevering og linkverifikation er lokale fixtures.

## Forebyggelse

Afgræns brugerorienterede locators til den funktion, der testes, når samme skærm indeholder flere live-regioner. Fjern ikke assertions for at omgå strict-mode-fejl.
