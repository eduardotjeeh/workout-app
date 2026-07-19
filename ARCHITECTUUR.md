# ARCHITECTUUR

## Beslissingen (2026-07-19)

1. **PWA, geen native app.** Geen Apple-developeraccount of App Store nodig; installeren via "Zet op beginscherm" in Safari.
2. **GitHub-repo als backend.** Geen eigen server. De app leest/schrijft `workout-data` (privé repo) via de GitHub Contents API. Gratis, en de data staat direct waar de Gezondheid-hub erbij kan.
3. **Twee repo's.** App-code public (vereist voor gratis GitHub Pages); data privé. Het fine-grained PAT op de telefoon kan alléén bij `workout-data` — lekt het token, dan blijft de Gezondheid-repo buiten schot.
4. **Dom loggen.** De app bevat geen progressielogica. De hub schrijft `plan/next.json`; de app toont, Eduard vinkt af of past aan, de app schrijft `sessies/JJJJ-MM-DD.json`.
5. **Direct overstappen van Strong.** Daarom is offline-betrouwbaarheid onderdeel van de MVP, niet een nice-to-have.
6. **Geen build-stap.** Vanilla JS/HTML/CSS uit `app/`, door GitHub Pages ongewijzigd geserveerd.

## Dataflow

```
Gezondheid-hub (Claude)                workout-data (privé)              iPhone-PWA
  workout-coach bepaalt volgende  →    plan/next.json               →    toont plan, vooringevuld
  sessie-import verwerkt logs     ←    sessies/JJJJ-MM-DD.json      ←    afvinken / aanpassen / loggen
```

De hub pusht en pullt via git; de app via de Contents API (`GET/PUT /repos/{owner}/workout-data/contents/...`).

Naast plan en sessies publiceert de hub ook `dashboard.html` (zelfstandig HTML-bestand, gegenereerd door `Gezondheid/scripts/dashboard.py`) in de root van `workout-data`; de app toont dat via de 📊-knop in een sandboxed iframe, met localStorage-cache voor offline.

## Datacontract

### `plan/next.json` — geschreven door de hub

```json
{
  "versie": 1,
  "gepland_op": "2026-07-19",
  "naam": "Herstart blok 1 — Full body A",
  "notitie": "Rustig opbouwen, stoppen bij vorm-verlies.",
  "oefeningen": [
    {
      "naam": "Back squat",
      "rust_sec": 150,
      "stap_kg": 2.5,
      "notitie": "Diepte boven alles",
      "sets": [
        { "kg": 60, "reps": 5 },
        { "kg": 60, "reps": 5 },
        { "kg": 60, "reps": 5 }
      ]
    }
  ]
}
```

`stap_kg` (optioneel, standaard 2,5) is de kleinste gewichtsstap van de machine/oefening; de plus/min-knoppen in de app stappen hiermee.

### `sessies/JJJJ-MM-DD.json` — geschreven door de app

Zelfde structuur als het plan, aangevuld met wat er werkelijk gebeurde:

```json
{
  "versie": 1,
  "datum": "2026-07-21",
  "gestart": "2026-07-21T18:05:00+02:00",
  "afgerond": "2026-07-21T19:02:00+02:00",
  "plan_van": "2026-07-19",
  "naam": "Herstart blok 1 — Full body A",
  "notitie": "Squat voelde zwaar, laatste set ingekort.",
  "oefeningen": [
    {
      "naam": "Back squat",
      "sets": [
        { "gepland_kg": 60, "gepland_reps": 5, "kg": 60, "reps": 5, "gedaan": true },
        { "gepland_kg": 60, "gepland_reps": 5, "kg": 60, "reps": 5, "gedaan": true },
        { "gepland_kg": 60, "gepland_reps": 5, "kg": 55, "reps": 4, "gedaan": true, "rpe": 8 }
      ]
    }
  ]
}
```

Regels:
- `kg`/`reps` zijn de werkelijke waarden; `gepland_*` blijft staan zodat de hub afwijkingen ziet.
- Overgeslagen set: `"gedaan": false`, zonder `kg`/`reps`. Extra set of oefening: gewoon toevoegen, zonder `gepland_*`.
- `rpe` (optioneel, 6–10 in stappen van 0,5) staat op de laatste gedane werkset van een oefening.
- Vervangt Eduard een oefening in de sportschool (machine bezet), dan krijgt de oefening `"vervangen_van": "<oorspronkelijke naam>"`; de `gepland_*`-waarden van het origineel blijven staan als referentie.
- Bestandsnaam = trainingsdatum (lokale tijd). Tweede sessie op één dag: `-2` suffix.
- Kg met decimale punt, JSON in UTF-8.

## Offline-gedrag

- `next.json` wordt bij elke online start gecachet in localStorage; de app werkt daarna volledig zonder netwerk.
- Een afgeronde sessie gaat eerst naar een localStorage-wachtrij en pas daaruit weg na een geslaagde `PUT` (201/200). De app toont zichtbaar of er nog niet-gesynchroniseerde sessies staan.
- Service worker cachet de app-bestanden zelf (app werkt in de gym ook bij nul bereik).

## Token & veiligheid

- Fine-grained PAT, alleen repo `workout-data`, alleen permission "Contents: read and write", verloopdatum max 1 jaar.
- Eduard maakt het token zelf aan (github.com → Settings → Developer settings → Fine-grained tokens) en voert het éénmalig in op het instellingenscherm van de app; opslag in localStorage van de telefoon.
- Het token gaat nooit door Claude/Codex-handen en staat nergens in git.
