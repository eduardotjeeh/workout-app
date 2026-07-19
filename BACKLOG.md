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

## W4 — Integratie Gezondheid-hub ✅ (2026-07-19, Fable)

In `../Gezondheid`: `prompts/app-plan.md` (plan klaarzetten + weekplanning + verzetten/cancelen) en `prompts/app-import.md` (sessies → daglogs met reconciliatie); schema-adviescyclus en workout-coach omgezet naar de app-flow; beide prompts bevatten een Codex-aanwijzing (sessie starten in de bovenliggende `Projects`-map wegens sandboxrechten). Eerste echte plan (Full Body A herstart, 2026-07-21) staat in `workout-data`. Strong-import blijft bestaan voor de historie.

## W5 — Strong-historie afsluiten ✅ (2026-07-19)

Gecontroleerd: de laatste export (`2026-07-15-strong_workouts.csv`, 51 sessies van 2025-11-11 t/m 2026-06-16) is volledig gereconcilieerd met de daglogs in de Gezondheid-hub; er is daarna niet meer getraind. Overstapdatum 2026-07-21 vastgelegd in `schema.md`; `prompts/strong-import.md` is als historisch gemarkeerd. Strong mag met pensioen.

## W7 — Sportschool-iteratie v0.2.0 ✅ (2026-07-19, Fable)

Op verzoek van Eduard plus eigen review-punten:
- Plus/min-stappers op het gewicht; stapgrootte per oefening via `stap_kg` in het plancontract (standaard 2,5).
- RPE-knoppen (6–10, halve stappen) per oefening zodra een set is afgevinkt; komt als `rpe` op de laatste gedane werkset in het sessie-JSON.
- Oefeningmenu (⋯): omhoog/omlaag verplaatsen, vervangen bij bezette machine (`vervangen_van` in het contract, met ↺-herstelknop), extra oefening verwijderen.
- Rusttimer: "+30 s"-knop en dubbele piep bij afloop (iOS ondersteunt `navigator.vibrate` niet — piep is daar hét signaal).
- Wake lock houdt het scherm aan tijdens de sessie.
- Hub-prompts (`app-plan.md`, `app-import.md`) en ARCHITECTUUR-contract bijgewerkt voor `stap_kg`, `rpe` en `vervangen_van`.

## W8 — Dashboard in de app ✅ (2026-07-19, Fable, v0.3.0)

📊-knop naast de instellingen: haalt `dashboard.html` uit `workout-data` op via de Contents API (zelfde PAT), toont hem in een sandboxed iframe en cachet hem in localStorage voor offline. De hub publiceert het dashboard via `scripts/dashboard.py` + push van Workout-Data (onderdeel van de wekelijkse checkup).

## W6 — Later / ideeën

- Plate calculator (welke schijven op de stang).
- Meerdere geplande sessies vooruit (`plan/` als lijstje) voor een heel weekblok.
- Supersets in het contract.
- Lichte modus / thema.
- Per-machine `stap_kg` verfijnen zodra Eduard de echte stapgroottes meldt.
