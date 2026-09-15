# BUG-009 — Auth-test matchede værtsnavn som logout-endpoint

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret |
| Fundet | 2026-09-15 |
| Område | Testfixture |
| Berørt version og miljø | Ny lokal `auth-session.test.ts`; ikke udgivet |
| Påvirkning | Legitim login-kontrol fejlede med `Unexpected end of JSON input` |
| Rettelse | Ikke committet |
| Udgivelse | Ikke relevant |

## Årsag og løsning

Testens syntetiske fetch brugte `String(input).includes('/logout')` til at identificere logout. Det matchede også værtsnavnet `https://logout-fixture.example.com`, så password-login fik et tomt 204-svar i stedet for en JSON-session.

Match nu den parsede URL's `pathname.endsWith('/logout')`. Fejlen var i testtransporten, ikke den faktiske loginfunktion. Testen bevarer kontrollen af serverens lokale logout-scope og et efterfølgende eksplicit password-login.

## Verifikation og historik

- 2026-09-15: Første `node --test tests/auth-session.test.ts` gav 7 beståede og 1 fejl. Efter rettelsen bestod alle 8 tests.
