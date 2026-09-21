# Belplanner (Cloudflare Worker)

Plant één Web Push-melding per rustpauze, zodat de rustbel op het slotscherm
doorkomt terwijl de podcast gewoon doorspeelt.

**Waarom niet in de app zelf:** op iOS mag een PWA met het scherm op slot geen
nieuw geluid starten. De enige truc die wél werkt — één WAV die de hele rust
beslaat — bezet de audiosessie en pauzeert dus de podcast (W11–W13 in
`../BACKLOG.md`). Een melding komt van buiten, heeft geen audiosessie nodig en
laat andere audio met rust.

**Rolverdeling:** de app meldt bij het afvinken van een set *"bel over N
seconden"*; deze Worker zet een Durable-Object-alarm op dat moment en stuurt
dán de melding. Een Worker zonder Durable Object kan dat niet — die leeft
alleen zolang een verzoek duurt en heeft geen wekker.

## Eenmalig opzetten

Windows PowerShell 5.1 kent `&&` niet, dus elk commando apart. Alles gebeurt
vanuit deze map.

```
cd Workout-App\push-worker
npm install
npx wrangler login
node tools/vapid-sleutels.mjs
npx wrangler secret bulk geheimen.json
npx wrangler deploy
```

De generator schrijft `geheimen.json` en drukt de app-sleutel af. Die JSON gaat
er via `secret bulk` in één keer in; de privésleutel met de hand in een prompt
plakken loopt op Windows mis, omdat cmd en PowerShell aan de aanhalingstekens
knabbelen. Verwijder `geheimen.json` zodra de upload gelukt is — hij staat in
`.gitignore`, maar bevat de privésleutel.

Wrangler drukt na `deploy` de URL af, bijvoorbeeld
`https://workout-bel.<jouw-subdomein>.workers.dev`. Die URL en de app-sleutel
vul je in de app in onder Instellingen → Melding op slot.

Controleren of het staat:

```
curl https://workout-bel.<jouw-subdomein>.workers.dev/sleutel
```

Daar hoort `{"publiek":"B…"}` uit te komen. Komt er een `fout` uit, dan zegt die
precies wat er aan het secret mankeert.

Wil je alleen je eigen app toelaten, zet dan `TOEGESTANE_ORIGIN` in
`wrangler.toml` op je GitHub Pages-origin en deploy opnieuw.

## Kosten

Gratis tier: 100.000 verzoeken per dag en SQLite-Durable Objects inbegrepen. Een
training van 25 sets kost ongeveer 75 verzoeken.

## Endpoints

| Route | Auth | Doel |
| --- | --- | --- |
| `GET /sleutel` | nee | publieke VAPID-sleutel, zodat de app niets hoeft over te typen |
| `POST /abonneer` | ja | pushabonnement bewaren, geeft een `id` terug |
| `POST /plan` | ja | `{ id, seconden, titel, tekst }` — zet het alarm |
| `POST /annuleer` | ja | alarm weghalen ("Stop rust", volgende set) |
| `POST /test` | ja | stuurt meteen een testmelding |

Auth is de kop `X-Workout-Sleutel: <APP_SLEUTEL>`, vergeleken in vaste tijd. De
`id` is de SHA-256 van het push-endpoint, dus dezelfde telefoon landt altijd in
hetzelfde Durable Object.

## Testen

```bash
node tools/test-webpush.mjs
```

Controleert de versleuteling tegen de testvector uit RFC 8291 §5 (byte voor
byte) en de VAPID-handtekening. Geen npm-pakketten: alles loopt op WebCrypto,
dezelfde afspraak als de app (geen build-stap).

## Wat de Worker niet oplost

- **Zet de belschakelaar van de iPhone níet op stil.** Meldingsgeluiden volgen
  die schakelaar; op stil krijg je alleen een trilling. Media-afspelen (de oude
  `playback`-stand) negeert hem juist — dat is precies waarom die stand wél
  hoorbaar was.
- Een Focus-stand die meldingen onderdrukt, onderdrukt ook deze.
- Zonder bereik in de sportschool kan de app niets plannen. De app zegt dat dan
  in de timerbalk; de bel valt terug op de gewone audio zodra je de app opent.
- Het geluid is het standaard meldingsgeluid van iOS. Een eigen boksbel kan een
  webmelding op iOS niet meegeven.
