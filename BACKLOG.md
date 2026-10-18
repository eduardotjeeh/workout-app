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

In `../../Gezondheid`: `prompts/app-plan.md` (plan klaarzetten + weekplanning + verzetten/cancelen) en `prompts/app-import.md` (sessies → daglogs met reconciliatie); schema-adviescyclus en workout-coach omgezet naar de app-flow; beide prompts bevatten een Codex-aanwijzing (sessie starten in de bovenliggende `Projects`-map wegens sandboxrechten). Eerste echte plan (Full Body A herstart, 2026-07-21) staat in `workout-data`. Strong-import blijft bestaan voor de historie.

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

📊-knop naast de instellingen: haalt `dashboard.html` uit `workout-data` op via de Contents API (zelfde PAT), toont hem in een sandboxed iframe en cachet hem in localStorage voor offline. Codex publiceert het dashboard dagelijks via `scripts/dashboard.py` + commit/push van Workout-Data.

## W9 — Bijgewerkt plan niet meer verborgen door lopende sessie ✅ (2026-07-20, Fable, v0.4.0)

Bug uit de praktijk: na correctie van `stap_kg` in het plan bleef de app 2,5 kg stappen. Oorzaak: een actieve sessie (`concept`) wordt uit het plan van dát moment opgebouwd en krijgt voorrang boven een nieuw opgehaald plan — terecht om logs niet te verliezen, maar er was geen weg terug. Nu bewaart het concept een `bronJson`-vingerafdruk van het bronplan; wijkt het opgehaalde plan daarvan af, dan verschijnt een banner "Er staat een bijgewerkt plan klaar" met Laden (met bevestiging bij voortgang) en ×. Concepten van vóór v0.4.0 hebben geen `bronJson` en tonen de banner dus altijd één keer.

## W10 — Warming-up in plan en app ✅ (2026-07-20, Fable, v0.5.0)

Evidence-based warming-upframework vastgelegd in `Gezondheid/data/training/schema.md` §Warming-up (kort algemeen + ramp-sets alleen bij de eerste oefening per patroon, geen statisch rekken). Contract: plan-niveau `warming_up`-checklist en per oefening `opwarm_sets`; beide afvinkbaar in de app (aparte compacte stijl, geen rusttimer, tellen nooit mee als werksets) en komen met `gedaan`-vlag terug in het sessie-JSON. Plan- en importprompts bijgewerkt.

## W11 — Rustbel hoorbaar op iOS ✅ (2026-08-07, Fable, v0.7.0)

Eduard hoorde de bel nooit, ook niet met de app open. Diagnose: de synthese was in orde (offline gerenderd: piek 0,68, drie slagen), maar Web Audio valt op iOS onder de "ambient"-categorie en wordt dus gedempt door de stilteschakelaar; daarnaast bevriest `setInterval` zodra de PWA naar de achtergrond gaat, waarna `speelBoksbel()` een geschorste context vindt en `resume()` buiten een user gesture weigert. `navigator.vibrate` bestaat niet op iOS, dus er was ook geen tweede signaal.

Oplossing: de rustperiode wordt per set als één WAV gerenderd — `rust_sec` stilte gevolgd door dezelfde bel — en afgespeeld via een `<audio>`-element, gestart binnen de tik waarmee de set wordt afgevinkt. Media-afspelen negeert de stilteschakelaar en loopt door met het scherm uit. `bouwBelGeluid()` is losgetrokken zodat live (Web Audio) en vooraf gerenderd (OfflineAudioContext) dezelfde klank delen; Web Audio blijft de fallback voor desktop. MediaSession zet een Now Playing-kaart op het vergrendelscherm waarvan de voortgangsbalk de rusttimer ís; pauze/stop daar breekt de rust af.

Gemeten: WAV van 180 s = 7,7 MB, bouwtijd 10,8 ms (ruim binnen de tik); bel exact op de grens (piek 0 in seconden 0–4, 0,67 in seconde 5 bij een test van 5 s); "+30 s" hergenereert; "Stop rust" ruimt blob-URL en MediaSession op.

Niet haalbaar gebleken: een echte aftellende timer in het meldingencentrum. iOS-PWA's kunnen geen lokale notificatie inplannen, Web Push (iOS 16.4+) vereist een server die op het juiste moment pusht — de backend die deze architectuur bewust niet heeft — en Live Activities vragen een native app.

## W12 — Rustbel naast een podcast ✅ (2026-08-12, Fable, v0.8.0)

Vervolg op W11. De bel werkt nu, maar Eduard luistert tijdens de rust podcasts en muziek: iOS pauzeert die zodra de rusttimer start. Dat is geen bug maar de prijs van de W11-oplossing — de app speelt de hele rustperiode één WAV (stilte + bel) af, en media-afspelen onderbreekt andere audio zolang die sessie loopt. De bel zelf duurt 2,4 s; de onderbreking duurt de volle rust.

Oplossing: instelling **Bel mengen met podcast of muziek** (standaard uit, dus bestaand gedrag blijft). Uit → `navigator.audioSession.type = "playback"` + Now Playing-kaart, zoals in W11. Aan → `"ambient"`: iOS mixt de bel met andere audio in plaats van die te onderbreken, en de app laat de Now Playing-kaart bij de podcast-app. Omschakelen tijdens een lopende rust gaat direct in — de `change` op de schakelaar is zelf een user gesture, dus de WAV mag met de resterende tijd opnieuw starten.

Afruil, expliciet in de UI benoemd: `ambient` wordt door iOS gedempt zodra de zijschakelaar op stil staat, en biedt minder garantie met het scherm uit. Daarom een keuze en geen nieuwe standaard. Ontbreekt `navigator.audioSession` (< Safari 16.4, en Chromium), dan staat de schakelaar uit met uitleg.

Getest op Chromium (API afwezig → schakelaar uitgeschakeld met melding) en met een gestubde `navigator.audioSession`: uit → `playback` + kaart "Rust 0:05", aan → `ambient` en geen kaart, omschakelen tijdens een rust van 60 s behield de resterende tijd en liet het element doorspelen, "Stop rust" ruimde blob-URL en timer op. Tikvlak 44 px, geen horizontale scroll op 375 px. **Bevestigd in de sportschool op 2026-09-02: dat doet hij niet.** In ambient-modus met het scherm op slot hoort Eduard de bel niet. Opvolging in W13.

## W13 — Bel hoorbaar met het scherm op slot én de podcast door ✅ afgesloten (opgelost in W15)

> Uitkomst: geen enkele audiosessie-soort levert de bel af op slot behalve `playback`. Het antwoord kwam uiteindelijk van buiten de audiosessie, via Web Push — zie W15. De rest van dit hoofdstuk is het onderzoeksspoor dat daarheen leidde.

**Uitkomst (Eduard, tests op 2026-09-15 en 2026-09-17):** met het scherm op slot komt de bel alleen door onder `playback` — de stand die de podcast de hele rust pauzeert. `transient`, `transient-solo` en `ambient` leveren de bel op slot niet af, en de keten lost dat niet op (die start pas ná een bel die niet komt). Conclusie uit het protocol hieronder ("werkt geen van beide op slot"): een iOS-PWA kan via `navigator.audioSession` niet tegelijk de podcast laten spelen én de bel op slot afleveren. `playback` blijft de aanbevolen stand; de drie andere standen en de keten kunnen uit de UI (terugsnoeien — gedaan in v0.12.0, zie W15).

**Diagnose bevestigt het:** de keten-diagnose meldde bij elke poging op de telefoon "handler niet gedraaid". De `ended`-handler van een media-element draait met het scherm op slot dus niet, en de keten kon nooit werken — los van de sessiesoort.

**Kanttekening, zonder gevolg sinds W15:** op de schermafdruk van de testavond staat de belschakelaar van de telefoon op **stil**. Media-afspelen (`playback`) negeert die schakelaar, de andere drie categorieën niet. Het kan dus zijn dat `transient` en `transient-solo` op de stilteschakelaar stukliepen en niet op het slotscherm. Een hertest met de schakelaar áán is nooit gedaan; die is alleen nog zinvol als die standen ooit terugkomen.

Niet opnieuw onderzoeken: lokale notificaties, Web Push zonder server en Live Activities vielen in W11 al af.

### Onderzoeksspoor

**2026-09-02: de openstaande vraag uit W12 is beantwoord, en het antwoord is nee.** Eduard trainde op 02-09 met *Bel mengen met podcast of muziek* aan, luisterde een podcast en vergrendelde zijn telefoon: *"Ik hoor de bel niet als de app dicht is."* De `ambient`-categorie houdt de podcast dus wel intact, maar levert de bel niet af zodra de PWA naar de achtergrond gaat. Daarmee is de instelling in de praktijk geen keuze tussen twee werkende opties maar tussen twee halve: `playback` = bel wél, podcast niet; `ambient` = podcast wél, bel niet.

Wat Eduard wil is allebei tegelijk: podcast door, telefoon op slot, bel hoorbaar.

**Kandidaat: de andere `navigator.audioSession`-types.** De app kende er toen twee (`app.js`, `startRustAudio` → `zetAudioSessie(mengMetAndereAudio ? "ambient" : "playback")`), maar WebKit ondersteunt er meer, en twee daarvan zijn semantisch precies bedoeld voor een korte onderbreking bovenop lopende audio:

- `"transient"` — **dempt** andere audio tijdelijk (ducking) en herstelt die daarna. Best case: de podcast loopt de hele rust zachtjes door en de bel komt er hoorbaar overheen, ook met het scherm uit.
- `"transient-solo"` — **pauzeert** andere audio, die daarna automatisch hervat. Slechter dan ducking, maar nog altijd beter dan `playback`, waar niet is vastgelegd of de podcast uit zichzelf terugkomt.

**Bekende beperking van de huidige opzet.** De WAV beslaat de héle rustperiode (W11: dat is precies waarom de bel met het scherm uit werkt — `setInterval` bevriest in de achtergrond, dus er is niets dat later een geluid kan starten). Een `transient`-sessie duurt daardoor ook de hele rust: de podcast zou 1,5–3 minuten gedempt blijven in plaats van alleen de 2,4 s van de bel. Of dat acceptabel is, moet Eduard horen. De sessiesoort halverwege omschakelen kan niet, om dezelfde reden dat er geen timer kan aftellen.

**Eerste testprotocol** (op de telefoon, want een gestubde `audioSession` zegt hier niets — het gaat om echt iOS-gedrag):

1. Podcast starten, app openen, set afvinken met `type = "transient"`, telefoon vergrendelen. Klinkt de bel? Speelt de podcast door, en zo ja: gedempt of op volume?
2. Idem met `"transient-solo"`.
3. Beide ook met de zijschakelaar op stil (`ambient` faalt daar; de vraag is of transient dat ook doet).
4. Controleren of de podcast na de bel op eigen kracht terugkomt.

**Uitkomst → vorm.** Werkt `transient`, dan vervangt dat `ambient` als de "mengen"-stand en verdwijnt de afruil grotendeels. Werkt alleen `transient-solo`, dan wordt de instelling een keuze uit drie in plaats van twee. Werkt geen van beide, dan is de conclusie dat een iOS-PWA dit niet kan en blijft `playback` de aanbevolen stand — dat was toen ook het advies aan Eduard: schakelaar **uit**, bel gaat vóór podcast.

**Stand 2026-09-14 (Fable, v0.9.0):** de schakelaar *Bel mengen met podcast of muziek* is vervangen door een keuze uit vier audiosessie-soorten onder Instellingen → Geluid: `playback` (standaard, "Bel gaat vóór"), `transient`, `transient-solo` en `ambient`. De keuze wordt bewaard als `{ modus }` in `workout-geluid-v1`; een oude `{ mengen: true }` wordt als `ambient` gelezen, alles anders als `playback`. De Now Playing-kaart verschijnt alleen bij `playback`; in de andere standen blijft de kaart van de podcast-app staan. Omschakelen tijdens een lopende rust herstart de WAV met de resterende tijd, zoals in W12. Op Chromium (geen `navigator.audioSession`) staan alle vier uitgeschakeld met uitleg. Getest met een gestubde `audioSession`: elke stand zet het juiste type, migratie klopt, omschakelen tijdens een rust van 60 s behield de tijd, "Stop rust" ruimt op; tikvlak 44 px, geen horizontale scroll op 375 px. **Wat nog moet: het testprotocol hieronder op de telefoon**, dan de uitkomst hier noteren en de keuze terugsnoeien tot wat werkt.

**Gewenst eindgedrag (Eduard, 2026-09-14):** podcast speelt tijdens de rust; de bel pauzeert de podcast; tijdens de set blijft hij stil (focus op mind-muscle connection), ook met de app dicht en het scherm op slot; bij het afvinken van de set start de rust en hervat de podcast. Let op: dat is het spiegelbeeld van wat alle vier de standen in v0.9.0 doen. De WAV beslaat de rust, dus de app "speelt" tijdens de rust en zwijgt tijdens de set — de podcast wordt dus juist tijdens de rust gepauzeerd of gedempt en tijdens de set vrijgelaten. Geen van de vier standen kan het gewenste gedrag leveren; de test hieronder levert wél de bouwstenen: welke sessiesoort de bel op slot aflevert, en of iOS de podcast uit zichzelf hervat. Opvolgkandidaat: ketenen — rust-WAV onder `transient` (podcast gedempt maar hoorbaar), en in de `ended`-handler omschakelen naar `playback` met een stille WAV die loopt tot de set is afgevinkt (houdt de podcast gepauzeerd tijdens de set). Of die handler op slot nog draait is de kernvraag; dat vergt een v0.10-testbuild.

**Testprotocol v0.9.0 (2026-09-14).** Vooraf: app openen en onderaan Instellingen controleren dat er versie 0.9.0 staat; zo niet, app volledig sluiten en opnieuw openen. Een plan met korte rust is handig — of gewoon "Stop rust" en opnieuw afvinken. Per stand: podcast starten, app openen, Instellingen → Geluid → stand kiezen, set afvinken, meteen scherm op slot, wachten tot de bel. Noteer per stand vier dingen: (a) bel gehoord ja/nee, (b) podcast tijdens de rust: door op volume / zachter / gepauzeerd, (c) podcast na de bel: speelt / komt vanzelf terug / blijft stil, (d) Now Playing-kaart op het slotscherm: app / podcast.

| # | Stand | Zijschakelaar | Verwachting |
|---|---|---|---|
| 1 | Bel gaat vóór (`playback`) | normaal | bel ja; podcast gepauzeerd; na de bel: onbekend — dit is de referentie |
| 2 | Podcast zachter (`transient`) | normaal | bel ja?; podcast zachter; komt terug op volume |
| 3 | Podcast pauzeert en hervat (`transient-solo`) | normaal | bel ja?; podcast gepauzeerd; hervat vanzelf |
| 4 | Podcast door op volume (`ambient`) | normaal | bel nee (bevestiging W12) |
| 5 | de beste van 2 en 3 | **stil** | bel ja? — `ambient` faalt hier, de vraag is of transient ook |
| 6 | de beste van 2 en 3 | normaal | scherm niet vergrendelen maar naar de podcast-app wisselen: bel nog hoorbaar? |

Uitkomst → vorm: werkt 2 op slot én op stil, dan wordt `transient` de basis van de keten. Werkt alleen 3, dan `transient-solo`. Werkt geen van beide op slot, dan kan een iOS-PWA dit niet en blijft `playback` de aanbevolen stand.

**Stand 2026-09-14 avond (Fable, v0.10.0):** de keten is gebouwd als extra vinkje onder Instellingen → Geluid, *Keten: na de bel podcast gepauzeerd houden tot de set is afgevinkt*, te combineren met een van de vier standen (bedoeld: transient). Werking: de rust-WAV krijgt een `ended`-handler; die zet de audiosessie op `transient-solo` en start een stille WAV van 2 s (8 kHz, 8-bit, 16 KB) met `loop = true`, zodat de media-engine hem zonder JavaScript herhaalt tot de volgende set is afgevinkt of "Stop rust" wordt getikt. De Now Playing-kaart toont dan "Set bezig — afvinken hervat de podcast"; de timerbalk "Set bezig · podcast gepauzeerd". Omdat het gedrag op slot onzichtbaar is, schrijft de app per keten een diagnose naar `workout-keten-diag-v1` (rust gestart, bel afgelopen + of de app in de achtergrond was, stilte gestart of geweigerd met foutmelding, gestopt) en toont die met de vijf vorige ketens onder het vinkje. Omschakelen van de instelling ná de bel start de bel niet opnieuw maar stopt alleen de lopende audio. Getest in Chromium met gestubde `audioSession`: rust 1 s → na 3,4 s handler gedraaid, sessie `transient-solo`, stilte loopt en herhaalt, volgende afvinken stopt de stilte en start de nieuwe rust onder `transient`; geschiedenis en guard werken. **Kernvraag voor de telefoon:** draait de `ended`-handler met het scherm op slot, en staat WebKit `play()` daar toe zonder tik? De diagnoseregel beantwoordt dat na de test.

Test 7 (keten): stand 2 + keten aan, podcast aan, set afvinken, scherm op slot. Verwacht: podcast zachter tijdens de rust, bel, daarna stilte (podcast gepauzeerd) tot je de volgende set afvinkt, dan podcast terug (zachter). Noteer: (a) bel gehoord, (b) podcast na de bel gepauzeerd of gewoon door, (c) na afvinken hervat, (d) wat de diagnoseregel onder het vinkje meldt. Faalt de stilte op slot maar werkt hij met de app in beeld, dan is de handler het probleem en niet de sessiesoort.

## W14 — Notities in de app zijn cue-regels, uitleg gaat achter "Waarom" ✅ (2026-09-15, Fable, v0.10.1)

Eduard over het plan van 2026-09-15: de bijschriften in de app zijn veel te uitbundig; tijdens de training leest hij die nooit, juist omdat hij zijn tijd optimaliseert. Meting: per oefening 376–761 tekens `notitie`, plan-niveau ruim 1000 — de hub schreef zijn hele onderbouwing (geschiedenis, RPE-verloop, overload-regels) in het veld dat de app altijd toont. Drie ingrepen:
- **Contract:** `notitie` is een cue-regel (per oefening ~90 tekens, plan ~120): penstand/schijven, afstelling, één vormcue, schrapvolgorde. Nieuw optioneel veld `toelichting` voor de onderbouwing; komt niet terug in het sessie-JSON.
- **App:** toont `toelichting` ingeklapt achter "▸ Waarom" (`<details>`, tikvlak 2 rem). Vangnet: een `notitie` langer dan 120 tekens wordt op een woordgrens afgeknipt met "…" en de volledige tekst schuift bij de toelichting — een te lange notitie kan de kaart dus nooit meer volzetten.
- **Hub:** `Gezondheid/prompts/app-plan.md` krijgt de lengtegrens als harde regel plus de verdeling notitie/toelichting/daglog. Het plan van 2026-09-15 is direct herschreven naar het nieuwe patroon zodat de avondtraining er al van profiteert.

## W15 — Melding op slot via een eigen Worker ✅ (2026-09-17, Opus, v0.11.0; teruggesnoeid in v0.12.0)

_In de commits `b92b330` en `b0d5d71` heet dit nog W14; dat nummer was al vergeven aan de notities._

Gekozen route uit de drie opvolgkandidaten: **Web Push met een eigen Cloudflare Worker**. De andere twee blijven liggen — Klok-timer via Opdrachten (app-wissel per set) en een Capacitor-wrapper (breekt beslissing 1, PWA zonder Apple-account).

**Vorm.** Vijfde stand onder Instellingen → Geluid, *Melding op het slotscherm, podcast speelt door*. In die stand raakt de app het media-element niet aan — dat is precies wat de podcast zou pauzeren — en plant hij binnen de tik waarmee de set wordt afgevinkt een melding bij de Worker. Web Audio blijft via de keep-alive draaien, zodat de boksbel alsnog klinkt zolang de app in beeld is.

**Worker** (`push-worker/`, eigen README): één Durable Object per telefoon, met een alarm op het moment dat de rust afloopt. Routes: `GET /sleutel` (publieke VAPID-sleutel, zodat er niets overgetypt hoeft), `POST /abonneer`, `/plan`, `/annuleer`, `/test`. Auth via een gedeeld geheim in de kop `X-Workout-Sleutel`, vergeleken in vaste tijd. De id is de SHA-256 van het push-endpoint, dus dezelfde telefoon landt altijd in hetzelfde object. Web Push (VAPID + aes128gcm) is met de hand op WebCrypto geschreven: geen npm-pakket, geen build-stap, één bestand.

**Getest.** `npm test` in `push-worker/`: de versleuteling komt byte voor byte uit op de testvector van RFC 8291 §5, en een nagebootste Workers-runtime draait de echte `worker.js` langs routering, sleutelcontrole, alarm, herplannen, annuleren en opruimen na een 410 — de verstuurde melding wordt daarna met `node:crypto` ontcijferd zoals de telefoon dat zou doen (24 controles). In de browser: afvinken stuurt één `/plan` met de juiste rusttijd en laat het media-element ongemoeid, "+30 s" herplant, "Stop rust" annuleert, twee sets achter elkaar geven twee `/plan` en geen inhalende `/annuleer`, en midden in de rust van stand wisselen werkt beide kanten op. Zonder netwerk meldt de timerbalk "melding niet gepland". 375 px zonder horizontale scroll, tikvlak 44 px.

**Uitkomst (Eduard, 2026-09-21): hij werkt.** Podcast speelt door, telefoon op slot, melding komt aan het eind van de rust binnen. Daarmee is de vraag uit W12 en W13 eindelijk beantwoord.

**Teruggesnoeid in v0.12.0.** Nu de uitkomst bekend is, zijn de standen `transient`, `transient-solo` en `ambient` weg, plus het keten-vinkje, `ketenNaBel`, `maakStilteWavBlob`, de diagnose-functies en de sleutel `workout-keten-diag-v1` (de app ruimt die bij het openen op). Er blijven twee standen over, met een duidelijke afruil tussen de twee:

| Stand | Bel op slot | Podcast | Zwakke plek |
| --- | --- | --- | --- |
| Bel gaat vóór (`playback`) | altijd, ook op stil | pauzeert de hele rust | geen podcast tijdens de rust |
| Melding op slot (`push`) | ja | speelt door | volgt de belschakelaar; bereik nodig bij het afvinken |

Een bewaarde keuze voor een geschrapte stand valt terug op `playback`; getest met `{"modus":"transient-solo","keten":true}` in localStorage. Beide resterende standen zijn daarna opnieuw nagelopen: `playback` start het media-element en stuurt niets, `push` laat het media-element met rust en stuurt één `/plan`, "+30 s" herplant en "Stop rust" annuleert.

**Bekende grenzen van deze route:** het standaard meldingsgeluid van iOS in plaats van de boksbel, bereik nodig op het moment van afvinken, en een Focus-stand die meldingen onderdrukt onderdrukt ook deze. De melding komt via het alarm plus de pushdienst een tel of twee later dan de seconde zelf.

## W6 — Later / ideeën

- Plate calculator (welke schijven op de stang).
- Meerdere geplande sessies vooruit (`plan/` als lijstje) voor een heel weekblok.
- Supersets in het contract.
- Lichte modus / thema.
- Per-machine `stap_kg` verfijnen zodra Eduard de echte stapgroottes meldt.
