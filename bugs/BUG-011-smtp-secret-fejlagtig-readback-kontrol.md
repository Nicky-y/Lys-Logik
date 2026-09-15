# BUG-011 — Deploykontrol krævede oprindelig SMTP-secret ved readback

| Felt | Værdi |
| --- | --- |
| Status | Løst og verificeret med særskilt readback |
| Fundet | 2026-09-15 |
| Område | Lokalt deployværktøj / Auth-konfiguration |
| Berørt version og miljø | Engangsscript `.npm-cache/release-staff-invitations.mjs`, Supabase Management API |
| Påvirkning | Et vellykket SMTP-konfigurationskald blev efterfulgt af en lokal fejl, så resultatet fremstod fejlet |
| Rettelse | Lokal kontrol korrigeret; ingen runtimeændring i appen |
| Udgivelse | Ikke relevant for scriptet; konfiguration og begrænset verifikation dokumenteret i udgivelsesrapporten |

## Symptom og årsag

Efter et accepteret PATCH af de godkendte Auth-indstillinger stoppede scriptet med `Auth readback mismatch: smtp_pass`. Det sammenlignede alle returnerede felter direkte med de indsendte værdier, også SMTP-secret.

En separat GET viste, at samtlige ikke-hemmelige felter matchede, og secret-feltet var udfyldt, men ikke identisk med det indsendte plaintext. Den præcise providerrepræsentation er ikke undersøgt eller gemt. Readback-kontrollen måtte derfor ikke kræve plaintext-lighed. Fejlen var i vores kontrol, ikke evidens for at PATCH var rullet tilbage.

## Løsning og verifikation

Scriptet sammenligner nu kun ikke-hemmelige felter og kontrollerer separat, at en SMTP-secret er konfigureret. Det returnerede secret-indhold logges aldrig. Ingen gentagelse af PATCH var nødvendig.

En separat readback den 15. september kontrollerede host, port, bruger, afsender, redirect, rate limit, deaktiveret signup og bevaret e-mailbekræftelse. Disse bestod. Offentlig Auth-konfiguration bekræftede også deaktiveret signup. Denne kontrol beviser konfigurationens tilstedeværelse, ikke ekstern maillevering; første rigtige invitation er fortsat den praktiske leveringstest.

## Historik

- 2026-09-15: Fejl observeret efter PATCH; indstillinger læst separat tilbage og kontrol korrigeret. Der blev ikke gemt credentials i fejlhistorikken.
