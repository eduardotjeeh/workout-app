# BACKLOG

Volgorde = prioriteit; W-nummers zijn vaste ID's. Uitvoering per taak: Fable orchestreert en reviewt, bouwwerk gaat waar zinvol naar Codex. Datacontract: `ARCHITECTUUR.md`.

## W1 — Logscherm compleet ✅ (2026-07-19, Codex; review Fable)

Afvinken, overslaan, kg/reps aanpassen, extra sets/oefeningen, rusttimer (absolute eindtijd, dus achtergrondbestendig) met trilsignaal, sessienotitie, sessieherstel na herladen, "Sessie afronden" bouwt contract-JSON. Review-toevoeging: knop "Nieuwe sessie starten" op het resultaatscherm (een geïnstalleerde PWA heeft geen ververs-knop). Getest: volledige logsessie, herstel na herladen, contract-JSON exact conform.

## W2 — GitHub-sync ✅ (2026-07-19, Codex; review Fable)

Instellingenscherm met verbindingstest, plan ophalen + localStorage-cache voor offline, sessies PUT'en met persistente wachtrij en idempotente retry (herkent al geüploade sessie aan `gestart`), conflictveilige `-2`/`-3`-suffixen, zichtbare sync-status. Getest: foutpad met echte 401 van de GitHub API; happy path met mocks (Codex) — live upload volgt in W3 met Eduards PAT.

## W3 — PWA & hosting ✅ (2026-07-19, Codex; review Fable)

- ✅ Service worker (netwerk-eerst, offline-fallback, cache-opruiming, API-verkeer uitgesloten), iconen + manifest, `APP_VERSIE` in `app/versie.js` stuurt cache én zichtbaar versienummer.
- ✅ Pages-workflow publiceert `app/` bij push naar `main`; Pages geactiveerd (bron: GitHub Actions).
- ✅ Placeholder-plan in `workout-data`; wordt in W4 vervangen door het echte plan uit de hub.
- ✅ End-to-end test op Eduards iPhone geslaagd (2026-07-19): app geïnstalleerd via beginscherm, PAT ingevoerd, testsessie gelogd met afwijkingen/extra sets/extra oefening en correct geüpload naar `workout-data`. Testsessie daarna verwijderd.

## W4 — Integratie Gezondheid-hub

In `../Gezondheid`: `prompts/workout-coach.md` leert `plan/next.json` schrijven en pushen; nieuwe prompt of uitbreiding van sessie-import leert `sessies/*.json` ophalen en als daglog verwerken (zelfde reconciliatie als Strong-import). Strong-import blijft bestaan voor de historie.

## W5 — Strong-historie afsluiten

Laatste Strong-export importeren, datum van overstap vastleggen in de hub, Strong-app mag met pensioen.

## W6 — Later / ideeën

- Plate calculator (welke schijven op de stang).
- Meerdere geplande sessies vooruit (`plan/` als lijstje) voor een heel weekblok.
- Supersets in het contract.
- Donkere modus / thema.
