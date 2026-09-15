# BUG-003 — Parameter-property blokerede Node-testkørsel

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-15 |
| Område | Tests / delt TypeScript-kontrakt |
| Berørt version og miljø | Lokalt, ukommitteret invitationskode oven på `2d42598` |
| Påvirkning | Den nye integrationstest kunne ikke indlæse kontrakten |
| Rettelse | `fcfd7cd` |
| Udgivelse | 2026-09-15; se [udgivelsesrapport](../docs/staff-invitations-release.md) |

## Symptom og årsag

`node --test tests/staff-invitation.integration.test.ts` stoppede med `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `StaffInvitationError` brugte `constructor(readonly code: string)`, som kræver TypeScript-transformation. Node 24's strip-only testkørsel understøtter ikke denne konstruktion.

## Løsning

Feltet er deklareret på klassen og tildelt eksplicit i constructoren i [staff-invitation.ts](../supabase/functions/_shared/contracts/staff-invitation.ts). Kontraktens adfærd er bevaret.

## Verifikation

Efter rettelsen bestod alle ni databaseintegrationstests samt fem kontrakt-/HTTP-tests. Fejlen blev fundet før commit eller deploy.

## Forebyggelse og historik

- 2026-09-15: Fundet, rettet og testet lokalt. Fælles TypeScript skal kunne afvikles af repositoryets faktiske test-runtime; et Vite-build alene er ikke tilstrækkelig kontrol.
