# BACKLOG

Volgorde = prioriteit; W-nummers zijn vaste ID's. Uitvoering per taak: Fable orchestreert en reviewt, bouwwerk gaat waar zinvol naar Codex. Datacontract: `ARCHITECTUUR.md`.

## W1 — Logscherm compleet ✅ (skelet 2026-07-19, uitbouwen)

Het skelet in `app/` toont `voorbeeld-plan.json`. Uitbouwen tot volledig logscherm:
- Set afvinken (tik), kg/reps aanpassen (tik op waarde → numeriek toetsenbord), set overslaan.
- Extra set / extra oefening toevoegen.
- Rusttimer die start na afvinken van een set (duur uit `rust_sec`), met melding/trilsignaal.
- Sessienotitie-veld; "Sessie afronden" bouwt het sessie-JSON conform contract en toont het (sync komt in W2).
- Groot en tikbaar: gebruik in de sportschool met zweterige handen.

## W2 — GitHub-sync

- Instellingenscherm: owner, PAT invoeren, verbinding testen. Token in localStorage.
- Bij start: `plan/next.json` ophalen (Contents API), cachen in localStorage, cache gebruiken bij offline.
- Bij afronden: sessie-JSON naar `sessies/JJJJ-MM-DD.json` PUT'en; wachtrij + retry conform ARCHITECTUUR §Offline-gedrag; zichtbare sync-status.

## W3 — PWA & hosting

- `manifest.webmanifest` afmaken (icoon, naam, standalone), service worker die appbestanden cachet, versienummer zichtbaar in de app.
- GitHub-repo's `workout-app` (public) en `workout-data` (privé) aanmaken; Pages activeren op `app/`; eerste plan handmatig in `workout-data` zetten; end-to-end test op de iPhone.

## W4 — Integratie Gezondheid-hub

In `../Gezondheid`: `prompts/workout-coach.md` leert `plan/next.json` schrijven en pushen; nieuwe prompt of uitbreiding van sessie-import leert `sessies/*.json` ophalen en als daglog verwerken (zelfde reconciliatie als Strong-import). Strong-import blijft bestaan voor de historie.

## W5 — Strong-historie afsluiten

Laatste Strong-export importeren, datum van overstap vastleggen in de hub, Strong-app mag met pensioen.

## W6 — Later / ideeën

- Plate calculator (welke schijven op de stang).
- Meerdere geplande sessies vooruit (`plan/` als lijstje) voor een heel weekblok.
- Supersets in het contract.
- Donkere modus / thema.
