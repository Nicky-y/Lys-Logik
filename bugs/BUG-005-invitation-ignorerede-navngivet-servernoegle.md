# BUG-005 — Invitationsfunktionen ignorerede navngivet servernøgle

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-15 |
| Område | Backend / runtime-konfiguration |
| Berørt version og miljø | Lokal invitationsimplementering oven på `2d42598` |
| Påvirkning | Afsendelse og afslutning ville fejle i et projekt med en konfigureret nøgle under et andet navn end `default` |
| Rettelse | Ikke committet |
| Udgivelse | Ikke udgivet; ingen observeret produktionsfejl |

## Symptom, evidens og årsag

Kodegennemgangen viste, at det første udkast kaldte `readSupabaseServerKey` uden nøglens konfigurerede navn. De eksisterende backendfunktioner bruger `LEAD_SERVER_KEY_NAME`; projektets dokumenterede opsætning har historisk brugt `default_v1`. Uden argumentet leder hjælperen kun efter `default` og afviser derfor en dictionary med alene den navngivne nøgle.

## Løsning

Den testbare [runtimeadapter](../supabase/functions/_shared/infrastructure/staff-invitation-runtime.ts) læser samme navneindstilling som resten af backend. Manglende nøgle afvises stadig; en vilkårlig anden nøgle vælges aldrig. Ejerkontrollen bruger fortsat callerens token, mens servernøglen alene anvendes ved Auth-admin og afslutning.

## Verifikation

[Adaptertesten](../tests/staff-invitation.test.ts) kører den rigtige Supabase-klient mod en lokal fetch-fixture. Den kontrollerer navngivet nøgle, callerens Authorization-header, fast redirect, korrekt modtagermail og afslutning med forsøgs-ID. Et manglende nøglenavn afvises uden ekstra HTTP-kald. Adapter-/kontrakttestene og de eksisterende servernøgletests består (ni tests).

## Forebyggelse og historik

- 2026-09-15: Fundet ved sammenligning med eksisterende runtimekonfiguration; rettet og testet før deploy. HTTP-/DB-fakes alene afprøver ikke Edge-funktionens konfigurationsbinding; adapteren testes derfor også med projektets navngivningsmønster.
