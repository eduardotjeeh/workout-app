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
      "toelichting": "Vorige keer werd de laatste set ondiep; liever een rep minder dan ondieper.",
      "sets": [
        { "kg": 60, "reps": 5 },
        { "kg": 60, "reps": 5 },
        { "kg": 60, "reps": 5 }
      ]
    }
  ]
}
```

`notitie` (plan-niveau en per oefening) is een **cue-regel voor in de sportschool**: wat Eduard moet dóén of instellen — penstand of schijven, afstelling, één vormcue, wat te schrappen bij uitloop. Richtlijn: per oefening hooguit ~90 tekens, plan-niveau hooguit ~120; nooit uitleg, geschiedenis of onderbouwing. Die horen in het optionele veld `toelichting` (zelfde niveaus, vrije lengte): de app toont dat ingeklapt achter "Waarom" en Eduard leest het alleen als hij wil. Als vangnet knipt de app een notitie langer dan 120 tekens zelf af en zet de volledige tekst bij de toelichting — maar dat is een noodrem, geen werkwijze. `toelichting` komt niet terug in het sessie-JSON.

`stap_kg` (optioneel, standaard 2,5) is de kleinste gewichtsstap van de machine/oefening; de plus/min-knoppen in de app stappen hiermee. Afspraken: schijfoefeningen 2,5; machines en kabels krijgen de werkelijke stap van hun stapel (in Eduards sportschool 2,3 voor de 15 lbs-stapel en 1,1 voor de 10 lbs-stapel — zie `Gezondheid/data/training/schema.md` §Gewichtsstappen). Speciale waarde: de tekst `"dumbbell"` — de app stapt dan 1 kg t/m 10 kg en daarboven 2 kg (het dumbbellrek).

Warming-up (optioneel, berekend volgens `Gezondheid/data/training/schema.md` §Warming-up):
- plan-niveau `"warming_up": [{ "tekst": "3–4 min hometrainer, rustig tempo" }]` — algemene checklist, afvinkbaar in de app;
- per oefening `"opwarm_sets": [{ "kg": 15, "reps": 6 }]` — getoond boven de werksets, afvinkbaar, zonder rusttimer.

In het sessie-JSON komen beide terug met een `gedaan`-vlag: `warming_up: [{tekst, gedaan}]` en `opwarm_sets: [{kg, reps, gedaan}]`. Opwarmsets tellen nooit mee als werksets.

Superset (optioneel, sinds v0.13, W16): opeenvolgende oefeningen met dezelfde `superset`-tekst vormen één blok. Gebruik per superset één hoofdletter (`"A"`, `"B"`, …); de app nummert de leden in plan-volgorde als A1, A2.

```json
{ "naam": "Bicep Curl (Cable)",       "superset": "A", "rust_sec": 0,  "stap_kg": 4.5, "sets": [ … ] },
{ "naam": "Triceps Pushdown (Cable)", "superset": "A", "rust_sec": 90, "stap_kg": 2.3, "sets": [ … ] }
```

- **Ronde** = set *n* van elk lid. De app toont het blok als één kaart met de sets afwisselend per ronde (A1, A2, A1, A2, …); kg, reps, Skip, extra sets en RPE blijven per oefening.
- **Rust in een superset:** tussen de leden geen rust — de app start geen timer en stopt een rust die nog liep (ook een geplande melding). Na de ronde volgt de grootste `rust_sec` van het blok. Zet die op het laatste lid en `0` op de andere; dezelfde waarde op alle leden werkt ook. De app kijkt per afgevinkte set of een ander lid in dezelfde ronde nog open staat: zo ja, direct door; zo nee, rondrust. Daardoor klopt het ook bij een andere volgorde in de sportschool, na wisselen in de app en bij een ongelijk aantal sets. Een korte pauze tussen de leden kent het contract niet; wie die wil, plant twee losse oefeningen.
- Alleen opeenvolgende leden tellen. Een losse oefening met een `superset`-waarde zonder buurman met dezelfde waarde gedraagt zich als een gewone oefening (eigen `rust_sec`). Verplaatsen in de app houdt een blok bij elkaar: een lid schuift binnen het blok, aan de rand verhuist het hele blok.
- Plannen zonder `superset` werken ongewijzigd.

In het sessie-JSON komt `superset` ongewijzigd terug op elke oefening die het in het plan had. De sets blijven per oefening staan (ronde *n* = set *n*), dus de hub ziet dat de oefening in superset is gedaan — RPE's daaruit zijn niet vergelijkbaar met losse sets.

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
- `superset` (optioneel) komt ongewijzigd uit het plan terug; zie de superset-alinea bij het plan. Een vervangen lid houdt zijn `superset`.
- Bestandsnaam = trainingsdatum (lokale tijd). Tweede sessie op één dag: `-2` suffix.
- Kg met decimale punt, JSON in UTF-8.

## Offline-gedrag

- `next.json` wordt bij elke online start gecachet in localStorage; de app werkt daarna volledig zonder netwerk.
- Een lopende sessie (concept) heeft voorrang boven een nieuw opgehaald plan, zodat gelogde sets nooit verdwijnen. Het concept bewaart een `bronJson`-vingerafdruk van het plan waaruit het is opgebouwd; wijkt het opgehaalde plan daarvan af, dan meldt de app dat en kan de gebruiker het nieuwe plan expliciet laden.
- Een afgeronde sessie gaat eerst naar een localStorage-wachtrij en pas daaruit weg na een geslaagde `PUT` (201/200). De app toont zichtbaar of er nog niet-gesynchroniseerde sessies staan.
- Service worker cachet de app-bestanden zelf (app werkt in de gym ook bij nul bereik).

## Rustbel en audiosessie

- De rustperiode wordt per set gerenderd als één WAV van `rust_sec` stilte gevolgd door de bel, en gestart via een `<audio>`-element binnen de tik waarmee de set wordt afgevinkt. Alleen zo blijft de bel hoorbaar met het scherm uit; Web Audio wordt op iOS geschorst zodra de PWA naar de achtergrond gaat.
- Omdat die WAV de hele rust duurt, houdt de app de audiosessie ook de hele rust bezet. Dat is zichtbaar voor andere audio: onder `playback` pauzeert iOS een lopende podcast tot de rust voorbij is.
- Onder Instellingen → Geluid staan sinds v0.12 nog twee standen (`workout-geluid-v1` in localStorage als `{ modus }`, standaard `playback`): `playback` → bel altijd hoorbaar plus een Now Playing-kaart, podcast pauzeert de hele rust; `push` → de meldingsstand hieronder, waarbij de app zelf niets afspeelt. Bij `push` blijft de Now Playing-kaart bij de podcast-app.
- **Wat er uit is en waarom.** W12 en W13 probeerden `ambient`, `transient` en `transient-solo` om de podcast te sparen, plus een keten die na de bel een stille WAV startte. Geen ervan leverde de bel af met het scherm op slot, en de keten-diagnose meldde bij elke poging "handler niet gedraaid": de `ended`-handler van een media-element draait in de achtergrond niet. In v0.12 zijn die drie standen, het keten-vinkje en `workout-keten-diag-v1` verwijderd. Een bewaarde keuze voor een geschrapte stand (ook de oude `{ mengen: true }`) valt terug op `playback`.
- `navigator.audioSession` bestaat vanaf Safari 16.4; ontbreekt de API, dan is alleen `playback` uitgeschakeld — de meldingsstand blijft bruikbaar.

## Melding op slot (v0.11)

- Tweede stand onder Instellingen → Geluid: **`push`**. De app speelt dan zelf geen audio, dus de podcast wordt met rust gelaten; in plaats daarvan plant hij bij het afvinken van de set een Web Push-melding die op het einde van de rust binnenkomt. Dat is de enige route waarop de bel op slot doorkomt zonder de audiosessie te bezetten. Bevestigd in de sportschool op 2026-09-21.
- De wekker staat in een eigen Cloudflare Worker (`push-worker/`, eigen README): één Durable Object per telefoon, met een alarm op het moment dat de rust voorbij is. Een Worker alleen kan dat niet — die leeft enkel tijdens een verzoek.
- Rolverdeling: `POST /plan` bij het afvinken en bij "+30 s", `POST /annuleer` bij "Stop rust" en bij het afronden van de sessie. `startTimer` roept eerst `stopTimer`; de vlag `pushHerplannen` voorkomt dat dat annuleer-verzoek het nieuwe plan inhaalt.
- Instellingen in `workout-push-v1` als `{ url, sleutel, id, endpoint }`. De app haalt de publieke VAPID-sleutel zelf op bij `GET /sleutel`, dus alleen de Worker-URL en het gedeelde geheim worden ingetypt. Bij elke start controleert de app of het abonnement-endpoint nog klopt en abonneert zo nodig opnieuw (iOS vernieuwt abonnementen).
- Grenzen, expliciet in de UI benoemd: het is het standaard meldingsgeluid van iOS (een eigen boksbel kan niet), het volgt de belschakelaar van de telefoon (op stil hoor je alleen een trilling) en er moet bereik zijn op het moment van afvinken — lukt plannen niet, dan meldt de timerbalk "melding niet gepland".

## Token & veiligheid

- Fine-grained PAT, alleen repo `workout-data`, alleen permission "Contents: read and write", verloopdatum max 1 jaar.
- Eduard maakt het token zelf aan (github.com → Settings → Developer settings → Fine-grained tokens) en voert het éénmalig in op het instellingenscherm van de app; opslag in localStorage van de telefoon.
- Het token gaat nooit door Claude/Codex-handen en staat nergens in git.
