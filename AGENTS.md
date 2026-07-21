# AGENTS.md — besturing van deze repo

## 1. Wat is dit

Eigen workout-logger als PWA voor Eduards iPhone, ter vervanging van Strong.
Kernidee: **de app is dom, de hub is slim.** De Gezondheid-repo (`../../Gezondheid`) zet de volgende workout klaar (oefeningen, sets, kg); de app toont die, Eduard vinkt af of wijkt af, en het resultaat gaat terug. Coaching, progressie en analyse blijven in de Gezondheid-hub.

Ontwerp en datacontract: `ARCHITECTUUR.md`. Bouwopdrachten: `BACKLOG.md`.

## 2. Drie plekken

| Wat | Waar | Zichtbaarheid |
|---|---|---|
| App-code (deze repo) | GitHub `workout-app`, gehost via GitHub Pages | public |
| Trainingsdata | GitHub `workout-data`: `plan/next.json` + `sessies/` | **privé** |
| Intelligentie | Gezondheid-repo, schrijft plan / leest sessies | privé |

De app praat met `workout-data` via de GitHub Contents API met een fine-grained PAT die **uitsluitend** toegang heeft tot `workout-data` (contents read/write). Het token staat alleen in de app op Eduards telefoon — nooit in code, nooit in deze repo, nooit in een chat.

## 3. Rollen

- **Eduard**: opdrachtgever, tester, beheert het token.
- **Claude (Fable)**: orchestrator — architectuur, taakverdeling, review, integratie met de Gezondheid-hub.
- **Codex (o.a. Sol)**: uitvoerend bouwer — krijgt afgebakende taken uit `BACKLOG.md` met verwijzing naar het datacontract.

## 4. Regels

- Geen build-stap, geen frameworks, geen dependencies: vanilla HTML/CSS/JS, direct te serveren door GitHub Pages vanuit `app/`. Elke afwijking eerst in `BACKLOG.md` motiveren.
- Het datacontract in `ARCHITECTUUR.md` is leidend; wijzigingen daaraan altijd in dezelfde commit doorvoeren in `ARCHITECTUUR.md` én in code, en melden — de Gezondheid-hub leest hetzelfde contract.
- Werkt offline-first: een sessie mag nooit verloren gaan doordat er geen netwerk is (buffer in localStorage, sync zodra het kan).
- Meetdata nooit verzinnen; zie ook de regels in `../../Gezondheid/AGENTS.md`.
- Stijl: Nederlands, beknopt, ISO-datums, kg.
