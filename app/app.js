// Workout-logger: lokaal loggen, daarna veilig synchroniseren met workout-data.
// Het datacontract staat in ../ARCHITECTUUR.md en blijft leidend.

const OPSLAG = {
  instellingen: "workout-instellingen-v1",
  geluid: "workout-geluid-v1",
  push: "workout-push-v1",
  planCache: "workout-plan-cache-v1",
  concept: "workout-actieve-sessie-v1",
  wachtrij: "workout-sync-wachtrij-v1",
  dashboard: "workout-dashboard-v1",
};

const REPO = "workout-data";
const API_VERSIE = "2022-11-28";

let plan = null;
let gestart = null;
let planBron = "";
let timerInterval = null;
let timerEinde = null;
let keepAliveInterval = null;
let synchronisatieBezig = false;
let bezigMetAfronden = false;
let conceptGewijzigd = false;
let conceptBronJson = "";
let nieuwPlanKlaar = null;
let basisSyncStatus = { tekst: "Sync controleren…", soort: "" };
let laatsteSyncFout = "";
let laatsteSyncPoging = null;

const elementen = {
  planNaam: document.getElementById("plan-naam"),
  planNotitie: document.getElementById("plan-notitie"),
  planToelichting: document.getElementById("plan-toelichting"),
  oefeningen: document.getElementById("oefeningen"),
  logscherm: document.getElementById("logscherm"),
  resultaat: document.getElementById("resultaat"),
  instellingen: document.getElementById("instellingen"),
  logActies: document.getElementById("log-acties"),
  sessieNotitie: document.getElementById("sessie-notitie"),
  logMelding: document.getElementById("log-melding"),
  syncStatus: document.getElementById("sync-status"),
  afronden: document.getElementById("afronden"),
  timer: document.getElementById("timer"),
  timerTijd: document.getElementById("timer-tijd"),
  rustAudio: document.getElementById("rust-audio"),
  resultaatStatus: document.getElementById("resultaat-status"),
  resultaatSync: document.getElementById("resultaat-sync"),
  sessieJson: document.getElementById("sessie-json"),
  githubOwner: document.getElementById("github-owner"),
  githubToken: document.getElementById("github-token"),
  instellingenMelding: document.getElementById("instellingen-melding"),
  audioModus: document.getElementById("audio-modus"),
  audioModusMelding: document.getElementById("audio-modus-melding"),
  pushUrl: document.getElementById("push-url"),
  pushSleutel: document.getElementById("push-sleutel"),
  pushMelding: document.getElementById("push-melding"),
  appVersie: document.getElementById("app-versie"),
  nieuwPlan: document.getElementById("nieuw-plan"),
  dashboard: document.getElementById("dashboard"),
  dashboardStatus: document.getElementById("dashboard-status"),
  dashboardFrame: document.getElementById("dashboard-frame"),
};

async function init() {
  elementen.appVersie.textContent = `versie ${APP_VERSIE}`;
  registreerServiceWorker();
  stelGebeurtenissenIn();
  bereidBelVoor();
  vraagWakeLock();
  vulInstellingenformulier();
  vulGeluidsformulier();
  vulPushFormulier();
  controleerPushAbonnement();
  werkSyncStatusBij();
  await laadStartplan();
  await synchroniseerWachtrij();
  window.setInterval(() => {
    if (navigator.onLine && leesWachtrij().length > 0) synchroniseerWachtrij();
  }, 60_000);
}

async function registreerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
      updateViaCache: "none",
    });
  } catch (fout) {
    console.warn("Service worker registreren mislukt:", veiligeFoutmelding(fout));
  }
}

function stelGebeurtenissenIn() {
  document.addEventListener("pointerdown", initAudio);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") vraagWakeLock();
  });
  document.getElementById("timer-stop").addEventListener("click", stopTimer);
  document.getElementById("timer-plus").addEventListener("click", () => verlengTimer(30));
  document.getElementById("oefening-toevoegen").addEventListener("click", voegOefeningToe);
  document.getElementById("afronden").addEventListener("click", rondSessieAf);
  document.getElementById("instellingen-open").addEventListener("click", openInstellingen);
  document.getElementById("instellingen-sluit").addEventListener("click", sluitInstellingen);
  document.getElementById("dashboard-open").addEventListener("click", openDashboard);
  document.getElementById("dashboard-sluit").addEventListener("click", () => {
    elementen.dashboard.classList.add("verborgen");
    toonHoofdscherm();
  });
  document.getElementById("instellingen-opslaan").addEventListener("click", slaInstellingenOp);
  elementen.audioModus.addEventListener("change", slaGeluidsinstellingOp);
  document.getElementById("push-opslaan").addEventListener("click", slaPushInstellingenOp);
  document.getElementById("push-aanzetten").addEventListener("click", zetMeldingenAan);
  document.getElementById("push-test").addEventListener("click", stuurTestmelding);
  document.getElementById("verbinding-testen").addEventListener("click", testVerbinding);
  elementen.resultaatSync.addEventListener("click", () => {
    if (leesInstellingen()) synchroniseerWachtrij();
    else openInstellingen();
  });
  document.getElementById("nieuwe-sessie").addEventListener("click", startNieuweSessie);
  document.getElementById("nieuw-plan-laden").addEventListener("click", laadNieuwPlan);
  document.getElementById("nieuw-plan-sluit").addEventListener("click", verbergNieuwPlanBanner);
  elementen.syncStatus.addEventListener("click", () => {
    if (leesInstellingen()) synchroniseerWachtrij();
    else openInstellingen();
  });
  elementen.sessieNotitie.addEventListener("input", () => bewaarConcept(true));
  elementen.sessieNotitie.addEventListener("focus", () => {
    setTimeout(() => elementen.sessieNotitie.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  });
  window.addEventListener("online", () => {
    zetBasisSyncStatus("Online · sync controleren…", "");
    synchroniseerWachtrij();
  });
  window.addEventListener("offline", () => zetBasisSyncStatus("Offline · lokaal opgeslagen", "wacht"));
}

async function laadStartplan() {
  const instellingen = leesInstellingen();
  let bronplan = leesJson(OPSLAG.planCache);
  let bron = bronplan ? "cache" : "";

  if (instellingen) {
    zetBasisSyncStatus("Plan ophalen…", "");
    try {
      bronplan = await haalPlanOp(instellingen);
      schrijfJson(OPSLAG.planCache, bronplan);
      bron = "GitHub";
      zetBasisSyncStatus("Plan bijgewerkt", "goed");
    } catch (fout) {
      if (bronplan) {
        zetBasisSyncStatus("Offline · plan uit cache", "wacht");
      } else {
        zetBasisSyncStatus("Plan ophalen mislukt", "fout");
      }
      console.warn("Plan niet opgehaald:", veiligeFoutmelding(fout));
    }
  } else if (bronplan) {
    zetBasisSyncStatus("Niet ingesteld · plan uit cache", "wacht");
  } else {
    zetBasisSyncStatus("GitHub nog niet ingesteld", "wacht");
  }

  const concept = leesJson(OPSLAG.concept);
  if (isGeldigConcept(concept) && (concept.gewijzigd || !bronplan)) {
    plan = concept.plan;
    gestart = concept.gestart;
    conceptGewijzigd = Boolean(concept.gewijzigd);
    conceptBronJson = concept.bronJson ?? "";
    planBron = "herstelde sessie";
    elementen.sessieNotitie.value = concept.sessieNotitie ?? "";
    // Wijkt het opgehaalde plan af van waar deze sessie op gebouwd is (bijv. gecorrigeerde
    // gewichtsstappen)? Bied het nieuwe plan aan in plaats van het stilletjes te negeren.
    if (bronplan && JSON.stringify(bronplan) !== conceptBronJson) {
      nieuwPlanKlaar = bronplan;
      elementen.nieuwPlan.classList.remove("verborgen");
    }
  } else {
    if (!bronplan) {
      const antwoord = await fetch("./voorbeeld-plan.json");
      if (!antwoord.ok) throw new Error("Voorbeeldplan kon niet worden geladen.");
      bronplan = await antwoord.json();
      bron = "voorbeeld";
    }
    controleerPlan(bronplan);
    plan = maakWerkplan(bronplan);
    conceptBronJson = JSON.stringify(bronplan);
    gestart = formatLokaleDatumtijd();
    conceptGewijzigd = false;
    planBron = bron;
    elementen.sessieNotitie.value = "";
    bewaarConcept(false);
  }

  toonPlan();
}

function laadNieuwPlan() {
  if (!nieuwPlanKlaar) return;
  const heeftVoortgang = plan.oefeningen.some((oefening) =>
    oefening.sets.some((set) => set.status !== "open"));
  if (heeftVoortgang &&
      !window.confirm("Het bijgewerkte plan laden? Wat je in deze sessie hebt afgevinkt gaat verloren.")) {
    return;
  }
  controleerPlan(nieuwPlanKlaar);
  plan = maakWerkplan(nieuwPlanKlaar);
  conceptBronJson = JSON.stringify(nieuwPlanKlaar);
  gestart = formatLokaleDatumtijd();
  conceptGewijzigd = false;
  planBron = "GitHub";
  elementen.sessieNotitie.value = "";
  verbergNieuwPlanBanner();
  stopTimer();
  bewaarConcept(false);
  toonPlan();
}

function verbergNieuwPlanBanner() {
  nieuwPlanKlaar = null;
  elementen.nieuwPlan.classList.add("verborgen");
}

function controleerPlan(ruwPlan) {
  if (!ruwPlan || ruwPlan.versie !== 1 || typeof ruwPlan.gepland_op !== "string" ||
      typeof ruwPlan.naam !== "string" || !Array.isArray(ruwPlan.oefeningen)) {
    throw new Error("plan/next.json voldoet niet aan contractversie 1.");
  }
  ruwPlan.oefeningen.forEach((oefening) => {
    if (typeof oefening.naam !== "string" || !Array.isArray(oefening.sets)) {
      throw new Error("Een oefening in het plan is ongeldig.");
    }
    oefening.sets.forEach((set) => {
      if (!Number.isFinite(set.kg) || !Number.isFinite(set.reps)) {
        throw new Error(`Ongeldige set bij ${oefening.naam}.`);
      }
    });
  });
}

function maakWerkplan(ruwPlan) {
  return {
    versie: ruwPlan.versie,
    gepland_op: ruwPlan.gepland_op,
    naam: ruwPlan.naam,
    notitie: ruwPlan.notitie ?? "",
    toelichting: typeof ruwPlan.toelichting === "string" ? ruwPlan.toelichting : "",
    warming_up: Array.isArray(ruwPlan.warming_up)
      ? ruwPlan.warming_up
          .filter((item) => typeof item?.tekst === "string" && item.tekst.trim())
          .map((item) => ({ tekst: item.tekst, gedaan: false }))
      : [],
    oefeningen: ruwPlan.oefeningen.map((oefening) => ({
      naam: oefening.naam,
      ...(supersetId(oefening) ? { superset: supersetId(oefening) } : {}),
      rust_sec: Number.isFinite(oefening.rust_sec) ? oefening.rust_sec : 0,
      stap_kg: oefening.stap_kg === "dumbbell" ? "dumbbell"
        : (Number.isFinite(oefening.stap_kg) && oefening.stap_kg > 0 ? oefening.stap_kg : 2.5),
      notitie: oefening.notitie ?? "",
      toelichting: typeof oefening.toelichting === "string" ? oefening.toelichting : "",
      extra: false,
      opwarm_sets: Array.isArray(oefening.opwarm_sets)
        ? oefening.opwarm_sets
            .filter((set) => Number.isFinite(set?.kg) && Number.isFinite(set?.reps))
            .map((set) => ({ kg: set.kg, reps: set.reps, gedaan: false }))
        : [],
      sets: oefening.sets.map((set) => ({
        gepland_kg: set.kg,
        gepland_reps: set.reps,
        kg: set.kg,
        reps: set.reps,
        status: "open",
        extra: false,
      })),
    })),
  };
}

// Supersets (W16): opeenvolgende oefeningen met dezelfde `superset`-tekst
// vormen één blok. Een losse oefening is een blok van één; zo hoeven tekenen,
// verplaatsen en rust maar één soort blok te kennen.
function supersetId(oefening) {
  return typeof oefening?.superset === "string" ? oefening.superset.trim() : "";
}

function bepaalBlokken(oefeningen) {
  const blokken = [];
  oefeningen.forEach((oefening, index) => {
    const id = supersetId(oefening);
    const vorige = blokken.at(-1);
    if (id && vorige?.id === id) vorige.leden.push(index);
    else blokken.push({ id, leden: [index] });
  });
  return blokken;
}

function blokVan(oefening) {
  const index = plan.oefeningen.indexOf(oefening);
  const blok = bepaalBlokken(plan.oefeningen).find((kandidaat) => kandidaat.leden.includes(index));
  return blok ? blok.leden.map((i) => plan.oefeningen[i]) : [oefening];
}

// A1, A2 … zolang de hub zich aan één letter per superset houdt; anders 1, 2 ….
function supersetLabel(id, positie) {
  return `${id.length <= 2 ? id.toUpperCase() : ""}${positie + 1}`;
}

// Rust na een afgevinkte set. In een superset ga je direct door naar het
// volgende lid; pas als de ronde rond is volgt de rust, en dat is de grootste
// `rust_sec` van het blok. Of de ronde rond is hangt af van wat er nog open
// staat, niet van de volgorde: zo klopt het ook als Eduard de pushdown eerst
// doet of de leden in de app van plek wisselt.
function rustNaSet(oefening, setIndex) {
  const blok = blokVan(oefening);
  if (blok.length < 2) return { seconden: oefening.rust_sec, overgang: false };
  const rondeLoopt = blok.some((lid) => lid !== oefening && lid.sets[setIndex]?.status === "open");
  if (rondeLoopt) return { seconden: 0, overgang: true };
  return { seconden: rondeRust(blok), overgang: false };
}

function rondeRust(blok) {
  return Math.max(0, ...blok.map((lid) => (Number.isFinite(lid.rust_sec) ? lid.rust_sec : 0)));
}

function startRustNaSet(oefening, setIndex) {
  const { seconden, overgang } = rustNaSet(oefening, setIndex);
  if (seconden > 0) startTimer(seconden);
  // Direct door naar het volgende lid: een rust die nog liep is voorbij, en een
  // geplande melding zou midden in de volgende set binnenkomen.
  else if (overgang && timerEinde) stopTimer();
}

function isGeldigConcept(concept) {
  return Boolean(concept && typeof concept.gestart === "string" && concept.plan &&
    Array.isArray(concept.plan.oefeningen));
}

function toonPlan() {
  elementen.planNaam.textContent = plan.naam;
  const { kort, lang } = splitsNotitie(plan.notitie, plan.toelichting);
  elementen.planNotitie.textContent = kort || `Plan van ${plan.gepland_op}`;
  elementen.planToelichting.replaceChildren();
  if (lang) elementen.planToelichting.appendChild(maakToelichting(lang));
  renderOefeningen();
}

// Notities in de app zijn cue-regels voor in de sportschool; de uitleg
// ("waarom") hoort in `toelichting` en blijft ingeklapt. Als vangnet knipt de
// app een te lange notitie zelf af en schuift de rest bij de toelichting.
const NOTITIE_MAX = 120;

function splitsNotitie(notitie, toelichting) {
  const tekst = (notitie || "").trim();
  const uitleg = (toelichting || "").trim();
  if (tekst.length <= NOTITIE_MAX) return { kort: tekst, lang: uitleg };
  let knip = tekst.lastIndexOf(" ", NOTITIE_MAX);
  if (knip < NOTITIE_MAX * 0.6) knip = NOTITIE_MAX;
  const kort = `${tekst.slice(0, knip).replace(/[\s,;:—-]+$/, "")}…`;
  return { kort, lang: uitleg ? `${tekst}\n\n${uitleg}` : tekst };
}

function maakToelichting(tekst) {
  const details = document.createElement("details");
  details.className = "toelichting";
  const summary = document.createElement("summary");
  summary.textContent = "Waarom";
  details.appendChild(summary);
  const p = document.createElement("p");
  p.textContent = tekst;
  details.appendChild(p);
  return details;
}

function renderOefeningen() {
  elementen.oefeningen.replaceChildren();

  if (plan.warming_up?.length) {
    const kaart = document.createElement("section");
    kaart.className = "oefening warmup-kaart";
    const titel = document.createElement("h2");
    titel.textContent = "Warming-up";
    kaart.appendChild(titel);
    plan.warming_up.forEach((item) => {
      const regel = document.createElement("div");
      regel.className = "set opwarm" + (item.gedaan ? " gedaan" : "");
      const vink = maakKnop("✓", "vink", item.gedaan ? "Weer openzetten" : "Afvinken");
      vink.addEventListener("click", () => {
        item.gedaan = !item.gedaan;
        zetAfvinktijd(item, item.gedaan);
        bewaarEnRender();
      });
      const tekst = document.createElement("span");
      tekst.className = "opwarm-tekst";
      tekst.textContent = item.tekst;
      regel.append(vink, tekst);
      kaart.appendChild(regel);
    });
    elementen.oefeningen.appendChild(kaart);
  }

  bepaalBlokken(plan.oefeningen).forEach((blok) => {
    elementen.oefeningen.appendChild(blok.leden.length > 1
      ? maakSupersetKaart(blok)
      : maakOefeningKaart(plan.oefeningen[blok.leden[0]], blok.leden[0]));
  });
}

function maakOefeningKaart(oefening, oefeningIndex) {
  const kaart = document.createElement("section");
  kaart.className = "oefening";
  kaart.appendChild(maakOefeningKop(oefening, oefeningIndex));

  oefening.sets.forEach((set, setIndex) => {
    kaart.appendChild(maakSetRegel(oefening, set, oefeningIndex, setIndex));
  });

  if (oefening.sets.some((set) => set.status === "gedaan")) {
    kaart.appendChild(maakRpeRij(oefening));
  }

  const extraSet = maakKnop("+ Extra set", "secundair breed set-toevoegen");
  extraSet.addEventListener("click", () => voegSetToe(oefening));
  kaart.appendChild(extraSet);
  return kaart;
}

// Eén kaart voor het hele blok: eerst per lid de kop met notitie, dan de sets
// per ronde afwisselend (A1, A2, A1, A2 …), zodat Eduard niet tussen twee
// kaarten heen en weer hoeft te scrollen. RPE en extra sets blijven per lid.
function maakSupersetKaart(blok) {
  const leden = blok.leden.map((index) => plan.oefeningen[index]);
  const labels = leden.map((_, positie) => supersetLabel(blok.id, positie));
  const rondes = Math.max(...leden.map((lid) => lid.sets.length));

  const kaart = document.createElement("section");
  kaart.className = "oefening superset";
  const kop = document.createElement("p");
  kop.className = "superset-kop";
  kop.textContent = supersetOmschrijving(leden, rondes);
  kaart.appendChild(kop);

  leden.forEach((lid, positie) => {
    kaart.appendChild(maakOefeningKop(lid, blok.leden[positie], labels[positie]));
  });

  for (let ronde = 0; ronde < rondes; ronde += 1) {
    kaart.appendChild(maakRondeKop(leden, labels, ronde));
    leden.forEach((lid, positie) => {
      if (!lid.sets[ronde]) return;
      kaart.appendChild(maakSetRegel(lid, lid.sets[ronde], blok.leden[positie], ronde, labels[positie]));
    });
  }

  leden.forEach((lid, positie) => {
    if (lid.sets.some((set) => set.status === "gedaan")) kaart.appendChild(maakRpeRij(lid, labels[positie]));
  });

  const extra = document.createElement("div");
  extra.className = "superset-extra";
  leden.forEach((lid, positie) => {
    const knop = maakKnop(`+ Set ${labels[positie]}`, "secundair compact set-toevoegen", `Extra set ${lid.naam}`);
    knop.addEventListener("click", () => voegSetToe(lid));
    extra.appendChild(knop);
  });
  kaart.appendChild(extra);
  return kaart;
}

// Ronde in één tik (W19): Eduard doet de leden direct na elkaar en vinkt ze
// daarna samen af. De knop vinkt wat in de ronde nog open staat en laat Skip
// met rust; een al afgevinkt lid houdt zijn eigen tijd. Daarna volgt de
// rondrust, via dezelfde regel als bij de laatste losse vink. Staat alles in
// de ronde al op gedaan, dan zet dezelfde knop de ronde weer open — net als de
// losse vink, die ook heen en terug gaat.
function maakRondeKop(leden, labels, ronde) {
  const kop = document.createElement("div");
  kop.className = "ronde-kop";
  const titel = document.createElement("span");
  titel.textContent = `Ronde ${ronde + 1}`;
  kop.appendChild(titel);

  const inRonde = leden.filter((lid) => lid.sets[ronde]);
  const sets = inRonde.map((lid) => lid.sets[ronde]);
  const open = sets.filter((set) => set.status === "open");
  const gedaan = sets.filter((set) => set.status === "gedaan");
  // Met één set in de ronde is de losse vink al één tik; zonder open of
  // gedane sets (alles Skip) valt er niets af te vinken.
  if (sets.length < 2 || open.length + gedaan.length === 0) return kop;

  const klaar = open.length === 0;
  if (klaar) kop.classList.add("klaar");
  const namen = inRonde.map((lid) => labels[leden.indexOf(lid)]).join(" en ");
  const knop = maakKnop(klaar ? "✓ Ronde gedaan" : "✓ Ronde afvinken", "ronde-vink",
    klaar ? `Ronde ${ronde + 1} weer openzetten` : `Ronde ${ronde + 1} afvinken: ${namen}`);
  knop.addEventListener("click", () => {
    if (klaar) {
      gedaan.forEach((set) => { set.status = "open"; zetAfvinktijd(set, false); });
      bewaarEnRender();
      return;
    }
    open.forEach((set) => { set.status = "gedaan"; zetAfvinktijd(set, true); });
    bewaarEnRender();
    // Nog binnen de tik, zodat iOS de rustbel mag starten.
    startRustNaSet(inRonde.at(-1), ronde);
  });
  kop.appendChild(knop);
  return kop;
}

function supersetOmschrijving(leden, rondes) {
  const rust = rondeRust(leden);
  const naRonde = rust > 0 ? `${formatteerTijd(rust)} rust na de ronde` : "geen rust na de ronde";
  return `Superset · ${rondes} ronde${rondes === 1 ? "" : "s"} · direct door, ${naRonde}`;
}

// Kop, notitie, toelichting en opwarmsets van één oefening; in een superset
// met het label (A1, A2) ervoor.
function maakOefeningKop(oefening, oefeningIndex, label = "") {
  const lid = document.createElement("div");
  lid.className = "oefening-lid";
  lid.dataset.oefeningIndex = String(oefeningIndex);

  const kop = document.createElement("div");
  kop.className = "oefening-kop";
  const titelvak = document.createElement("div");
  titelvak.className = "oefening-titel";
  if (label) {
    const badge = document.createElement("span");
    badge.className = "superset-badge";
    badge.textContent = label;
    titelvak.appendChild(badge);
  }
  if (oefening.extra || oefening.vervangen_van) {
    const naam = document.createElement("input");
    naam.className = "oefening-naam";
    naam.type = "text";
    naam.placeholder = oefening.vervangen_van ? "Vervangende oefening" : "Naam extra oefening";
    naam.value = oefening.naam;
    naam.addEventListener("input", () => {
      oefening.naam = naam.value;
      bewaarConcept(true);
    });
    titelvak.appendChild(naam);
  } else {
    const titel = document.createElement("h2");
    titel.textContent = oefening.naam;
    titelvak.appendChild(titel);
  }
  kop.appendChild(titelvak);
  const menuKnop = maakKnop("⋯", "icoonknop", "Oefeningmenu: verplaatsen of vervangen");
  menuKnop.addEventListener("click", () => {
    oefening.menuOpen = !oefening.menuOpen;
    bewaarEnRender();
  });
  kop.appendChild(menuKnop);
  lid.appendChild(kop);

  if (oefening.vervangen_van) {
    const vervangenTekst = document.createElement("p");
    vervangenTekst.className = "notitie";
    vervangenTekst.textContent = `Vervangt: ${oefening.vervangen_van}`;
    lid.appendChild(vervangenTekst);
  }

  if (oefening.menuOpen) lid.appendChild(maakOefeningMenu(oefening, oefeningIndex));

  const { kort: notitieKort, lang: notitieLang } = splitsNotitie(oefening.notitie, oefening.toelichting);
  if (notitieKort) {
    const notitie = document.createElement("p");
    notitie.className = "notitie";
    notitie.textContent = notitieKort;
    lid.appendChild(notitie);
  }
  if (notitieLang) lid.appendChild(maakToelichting(notitieLang));

  if (oefening.extra) {
    const rustLabel = document.createElement("label");
    rustLabel.className = "notitie rust-invoer";
    rustLabel.textContent = "Rust ";
    const rust = document.createElement("input");
    rust.type = "number";
    rust.inputMode = "numeric";
    rust.min = "0";
    rust.step = "5";
    rust.value = oefening.rust_sec;
    rust.addEventListener("input", () => {
      oefening.rust_sec = getalUitInvoer(rust);
      bewaarConcept(true);
    });
    rustLabel.append(rust, document.createTextNode(" sec"));
    lid.appendChild(rustLabel);
  }

  (oefening.opwarm_sets ?? []).forEach((set) => {
    const regel = document.createElement("div");
    regel.className = "set opwarm" + (set.gedaan ? " gedaan" : "");
    const vink = maakKnop("✓", "vink", set.gedaan ? "Opwarmset weer openzetten" : "Opwarmset afvinken");
    vink.addEventListener("click", () => {
      set.gedaan = !set.gedaan;
      zetAfvinktijd(set, set.gedaan);
      bewaarEnRender();
    });
    const tekst = document.createElement("span");
    tekst.className = "opwarm-tekst";
    tekst.textContent = `${label ? `${label} · ` : ""}opwarmen · ${_toonKg(set.kg)} kg × ${set.reps}`;
    regel.append(vink, tekst);
    lid.appendChild(regel);
  });
  return lid;
}

function maakOefeningMenu(oefening, oefeningIndex) {
  const rij = document.createElement("div");
  rij.className = "oefening-menu";

  const omhoog = maakKnop("↑ Omhoog", "secundair compact");
  omhoog.disabled = !verplaatsDoel(oefeningIndex, -1);
  omhoog.addEventListener("click", () => verplaatsOefening(oefeningIndex, -1));

  const omlaag = maakKnop("↓ Omlaag", "secundair compact");
  omlaag.disabled = !verplaatsDoel(oefeningIndex, 1);
  omlaag.addEventListener("click", () => verplaatsOefening(oefeningIndex, 1));

  rij.append(omhoog, omlaag);

  if (oefening.extra) {
    const verwijder = maakKnop("× Weg", "secundair compact gevaar", "Extra oefening verwijderen");
    verwijder.addEventListener("click", () => {
      plan.oefeningen.splice(oefeningIndex, 1);
      bewaarEnRender();
    });
    rij.appendChild(verwijder);
  } else if (oefening.vervangen_van) {
    const herstel = maakKnop("↺ Origineel", "secundair compact", "Vervanging ongedaan maken");
    herstel.addEventListener("click", () => {
      oefening.naam = oefening.vervangen_van;
      delete oefening.vervangen_van;
      oefening.menuOpen = false;
      bewaarEnRender();
    });
    rij.appendChild(herstel);
  } else {
    const vervang = maakKnop("⇄ Vervangen", "secundair compact", "Oefening vervangen (machine bezet)");
    vervang.addEventListener("click", () => {
      oefening.vervangen_van = oefening.naam;
      oefening.menuOpen = false;
      bewaarEnRender();
      const invoer = elementen.oefeningen.querySelector(`[data-oefening-index="${oefeningIndex}"] .oefening-naam`);
      if (invoer) { invoer.focus(); invoer.select(); }
    });
    rij.appendChild(vervang);
  }
  return rij;
}

// Een superset blijft bij elkaar: een lid schuift binnen zijn blok, en aan de
// rand van het blok verhuist het hele blok voorbij het buurblok. Een losse
// oefening springt zo ook in één keer over een superset heen.
function verplaatsDoel(index, richting) {
  const blokken = bepaalBlokken(plan.oefeningen);
  const b = blokken.findIndex((blok) => blok.leden.includes(index));
  const blok = blokken[b];
  const binnen = blok.leden[blok.leden.indexOf(index) + richting];
  if (binnen !== undefined) return { soort: "binnen", doel: binnen };
  const buur = blokken[b + richting];
  return buur ? { soort: "blok", blok, buur } : null;
}

function verplaatsOefening(index, richting) {
  const doel = verplaatsDoel(index, richting);
  if (!doel) return;
  if (doel.soort === "binnen") {
    [plan.oefeningen[index], plan.oefeningen[doel.doel]] = [plan.oefeningen[doel.doel], plan.oefeningen[index]];
  } else {
    const start = doel.blok.leden[0];
    const groep = plan.oefeningen.splice(start, doel.blok.leden.length);
    const nieuweStart = richting < 0 ? doel.buur.leden[0] : start + doel.buur.leden.length;
    plan.oefeningen.splice(nieuweStart, 0, ...groep);
  }
  bewaarEnRender();
}

function maakRpeRij(oefening, lidLabel = "") {
  const rij = document.createElement("div");
  rij.className = "rpe-rij";

  const label = document.createElement("span");
  label.className = "eenheid";
  label.textContent = lidLabel ? `RPE ${lidLabel}` : "RPE";
  rij.appendChild(label);

  const knoppen = document.createElement("div");
  knoppen.className = "rpe-knoppen";
  for (let waarde = 6; waarde <= 10; waarde += 0.5) {
    const knop = maakKnop(String(waarde).replace(".", ","), "rpe-knop" + (oefening.rpe === waarde ? " actief" : ""),
      lidLabel ? `RPE ${waarde} voor ${oefening.naam}` : `RPE ${waarde}`);
    knop.addEventListener("click", () => {
      oefening.rpe = oefening.rpe === waarde ? null : waarde;
      bewaarEnRender();
    });
    knoppen.appendChild(knop);
  }
  rij.appendChild(knoppen);
  return rij;
}

function maakSetRegel(oefening, set, oefeningIndex, setIndex, label = "") {
  const regel = document.createElement("div");
  regel.className = `set${set.status === "gedaan" ? " gedaan" : ""}${set.status === "overgeslagen" ? " overgeslagen" : ""}`;

  // In een superset staat het label (A1, A2) in het lege vinkvak: zo is te zien
  // welke oefening de regel is zonder dat er breedte bij moet op 375 px.
  const vinkActie = set.status === "gedaan" ? "Set weer openzetten" : "Set afvinken";
  const vink = maakKnop(label && set.status !== "gedaan" ? label : "✓", label ? "vink met-label" : "vink",
    label ? `${vinkActie}: ${oefening.naam}` : vinkActie);
  vink.addEventListener("click", () => {
    const wordtGedaan = set.status !== "gedaan";
    set.status = wordtGedaan ? "gedaan" : "open";
    zetAfvinktijd(set, wordtGedaan);
    bewaarEnRender();
    if (wordtGedaan) startRustNaSet(oefening, setIndex);
  });

  const waarden = document.createElement("div");
  waarden.className = "waarden";
  waarden.append(maakStepper(oefening, set, "kg"), maakStepper(oefening, set, "reps"));

  const actie = set.extra
    ? maakKnop("×", "verwijder", "Extra set verwijderen")
    : maakKnop("Skip", "overslaan", set.status === "overgeslagen" ? "Set weer openzetten" : "Set overslaan");
  if (set.extra) {
    actie.addEventListener("click", () => {
      oefening.sets.splice(setIndex, 1);
      if (oefening.extra && oefening.sets.length === 0) plan.oefeningen.splice(oefeningIndex, 1);
      bewaarEnRender();
    });
  } else {
    actie.addEventListener("click", () => {
      set.status = set.status === "overgeslagen" ? "open" : "overgeslagen";
      zetAfvinktijd(set, false);
      bewaarEnRender();
    });
  }

  regel.append(vink, waarden, actie);
  return regel;
}

// Afvinktijd (W17): het moment van de tik op ✓. `gestart` en `afgerond` meten
// wanneer het concept is gebouwd en wanneer "Sessie afronden" is getikt, niet de
// training; de hub rekent de duur van de eerste tot de laatste afvinktijd. De
// tijd zit in het plan-object, dus het concept bewaart hem en herladen houdt hem.
function zetAfvinktijd(item, gedaan) {
  if (gedaan) item.tijd = formatLokaleDatumtijd();
  else delete item.tijd;
}

function afvinktijden() {
  const afgevinkt = [
    ...(plan.warming_up ?? []).filter((item) => item.gedaan),
    ...plan.oefeningen.flatMap((oefening) => [
      ...(oefening.opwarm_sets ?? []).filter((set) => set.gedaan),
      ...oefening.sets.filter((set) => set.status === "gedaan"),
    ]),
  ];
  return afgevinkt
    .map((item) => item.tijd)
    .filter((tijd) => typeof tijd === "string" && Number.isFinite(Date.parse(tijd)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

function metTijd(item, gedaan) {
  return gedaan && typeof item.tijd === "string" ? { tijd: item.tijd } : {};
}

function stapVoor(oefening, veld, basis, richting) {
  if (veld !== "kg") return 1;
  if (oefening.stap_kg === "dumbbell") {
    // Dumbbellrek: 1 kg-stappen t/m 10 kg, daarboven 2 kg-stappen.
    return (richting > 0 ? basis >= 10 : basis > 10) ? 2 : 1;
  }
  return Number.isFinite(oefening.stap_kg) && oefening.stap_kg > 0 ? oefening.stap_kg : 2.5;
}

function maakStepper(oefening, set, veld) {
  const groep = document.createElement("div");
  groep.className = `stepper stepper-${veld}`;
  const eenheid = veld === "kg" ? "kg" : "reps";

  const pasAan = (richting) => {
    const basis = Number.isFinite(set[veld]) ? set[veld] : (set[`gepland_${veld}`] ?? 0);
    const stap = stapVoor(oefening, veld, basis, richting);
    set[veld] = Math.max(0, Math.round((basis + richting * stap) * 100) / 100);
    bewaarEnRender();
  };

  const minKnop = maakKnop("−", "stap", `${eenheid} verlagen`);
  minKnop.addEventListener("click", () => pasAan(-1));
  const plusKnop = maakKnop("+", "stap", `${eenheid} verhogen`);
  plusKnop.addEventListener("click", () => pasAan(1));
  const uitgeschakeld = set.status === "overgeslagen";
  minKnop.disabled = uitgeschakeld;
  plusKnop.disabled = uitgeschakeld;

  groep.append(minKnop, maakInvoer(set, veld, eenheid), plusKnop);
  return groep;
}

function maakInvoer(set, veld, eenheid) {
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = veld === "kg" ? "decimal" : "numeric";
  input.min = "0";
  input.step = veld === "kg" ? "0.1" : "1";
  input.value = set[veld] ?? "";
  input.setAttribute("aria-label", eenheid);
  input.disabled = set.status === "overgeslagen";
  input.addEventListener("input", () => {
    set[veld] = getalUitInvoer(input);
    bewaarConcept(true);
  });
  return input;
}

function _toonKg(kg) {
  return String(kg).replace(".", ",");
}

function maakKnop(tekst, className, ariaLabel = "") {
  const knop = document.createElement("button");
  knop.type = "button";
  knop.className = className;
  knop.textContent = tekst;
  if (ariaLabel) knop.setAttribute("aria-label", ariaLabel);
  return knop;
}

function getalUitInvoer(input) {
  return input.value === "" || !Number.isFinite(input.valueAsNumber) ? null : input.valueAsNumber;
}

function voegSetToe(oefening) {
  const laatste = oefening.sets.at(-1);
  oefening.sets.push({
    kg: laatste?.kg ?? null,
    reps: laatste?.reps ?? null,
    status: "open",
    extra: true,
  });
  bewaarEnRender();
}

function voegOefeningToe() {
  plan.oefeningen.push({
    naam: "",
    rust_sec: 90,
    stap_kg: 2.5,
    notitie: "",
    extra: true,
    sets: [{ kg: null, reps: null, status: "open", extra: true }],
  });
  bewaarEnRender();
  const namen = elementen.oefeningen.querySelectorAll(".oefening-naam");
  namen[namen.length - 1]?.focus();
}

function bewaarEnRender() {
  bewaarConcept(true);
  renderOefeningen();
}

function bewaarConcept(gewijzigd = conceptGewijzigd) {
  if (!plan || !gestart) return;
  conceptGewijzigd = gewijzigd;
  const opgeslagen = schrijfJson(OPSLAG.concept, {
    gestart,
    plan,
    sessieNotitie: elementen.sessieNotitie.value,
    gewijzigd: conceptGewijzigd,
    bronJson: conceptBronJson,
  });
  if (!opgeslagen) {
    toonLogMelding("Het concept kan niet lokaal worden bewaard. Maak opslagruimte vrij voordat je verdergaat.");
  }
}

function formatteerTijd(seconden) {
  return `${Math.floor(seconden / 60)}:${String(seconden % 60).padStart(2, "0")}`;
}

// Bij een volgende set loopt startTimer eerst stopTimer; zonder deze vlag zou
// het annuleer-verzoek het nieuwe plan-verzoek kunnen inhalen en de bel wissen.
let pushHerplannen = false;

function startTimer(seconden) {
  pushHerplannen = true;
  stopTimer();
  pushHerplannen = false;
  timerEinde = Date.now() + seconden * 1000;
  elementen.timer.classList.remove("verborgen");
  document.querySelector("main").classList.add("timer-actief");
  elementen.timer.querySelector(".timer-label").textContent = "Rust";
  werkTimerBij();
  timerInterval = window.setInterval(werkTimerBij, 250);
  if (audioModus === "push") {
    // Geen media-element: dat is precies wat de podcast zou pauzeren. De
    // keep-alive houdt Web Audio wakker zodat de boksbel alsnog klinkt zolang
    // de app in beeld blijft; op slot doet de melding het werk.
    startAudioKeepAlive();
    planPushBel(seconden);
  } else if (!startRustAudio(seconden)) {
    // Deze aanroep zit nog in de tik waarmee de set is afgevinkt; iOS staat
    // afspelen alleen binnen zo'n gebaar toe. Lukt het niet, dan valt de bel
    // terug op Web Audio en is de keep-alive weer nodig.
    startAudioKeepAlive();
  }
}

function werkTimerBij() {
  const resterend = Math.max(0, Math.ceil((timerEinde - Date.now()) / 1000));
  elementen.timerTijd.textContent = formatteerTijd(resterend);
  if (resterend === 0) {
    window.clearInterval(timerInterval);
    timerInterval = null;
    elementen.timer.querySelector(".timer-label").textContent = "Rust voorbij";
    // Speelt het media-element, dan zit de bel daar al in; anders alsnog
    // via Web Audio, zodat de desktop en oudere browsers niet stil blijven.
    if (!rustAudioLoopt()) speelBoksbel();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  }
}

function verlengTimer(seconden) {
  if (!timerEinde) return;
  timerEinde = Math.max(Date.now(), timerEinde) + seconden * 1000;
  elementen.timer.querySelector(".timer-label").textContent = "Rust";
  if (!timerInterval) timerInterval = window.setInterval(werkTimerBij, 250);
  werkTimerBij();
  // Ook dit is een knoptik, dus opnieuw starten mag.
  if (audioModus === "push") planPushBel((timerEinde - Date.now()) / 1000);
  else if (!startRustAudio((timerEinde - Date.now()) / 1000)) stopRustAudio();
}

function stopTimer() {
  window.clearInterval(timerInterval);
  timerInterval = null;
  timerEinde = null;
  elementen.timer.classList.add("verborgen");
  document.querySelector("main").classList.remove("timer-actief");
  stopAudioKeepAlive();
  stopRustAudio();
  if (!pushHerplannen) annuleerPushBel();
}

function startAudioKeepAlive() {
  stopAudioKeepAlive();
  keepAliveInterval = window.setInterval(speelStilte, 4000);
}

function stopAudioKeepAlive() {
  if (keepAliveInterval) {
    window.clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function speelStilte() {
  if (!audioContext || audioContext.state !== "running") return;
  try {
    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
  } catch { }
}

// iOS Safari schorst de AudioContext als er geen audio-activiteit is. Drie maatregelen:
// 1. Ontgrendel iOS-audio door een stil sample te spelen bij de eerste tap.
// 2. Houd de context levend tijdens de rusttimer (speelStilte elke 4 s).
// 3. Resume de context vlak voor de bel voor het geval hij toch geschorst is.
let audioContext = null;
function initAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!audioContext && Context) {
    audioContext = new Context();
    try {
      const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    } catch { }
  }
  if (audioContext?.state === "suspended") audioContext.resume();
}

function speelBoksbel() {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume().then(() => { if (audioContext.state === "running") speelBoksbelGeluid(); });
    return;
  }
  if (audioContext.state === "running") speelBoksbelGeluid();
}

function speelBoksbelGeluid() {
  try {
    bouwBelGeluid(audioContext, audioContext.destination, audioContext.currentTime);
  } catch {
    // Geluid is best effort; de timer toont "Rust voorbij" hoe dan ook.
  }
}

// Bouwt de bel in een willekeurige context, zodat dezelfde klank zowel live
// (Web Audio) als vooraf gerenderd (OfflineAudioContext) gebruikt kan worden.
function bouwBelGeluid(context, bestemming, startTijd) {
  const begrenzer = context.createDynamicsCompressor();
  begrenzer.threshold.value = -12;
  begrenzer.knee.value = 8;
  begrenzer.ratio.value = 6;
  begrenzer.attack.value = 0.003;
  begrenzer.release.value = 0.25;
  begrenzer.connect(bestemming);

  // Drie metalen slagen, opgebouwd uit onharmonische boventonen. Dat geeft de
  // herkenbare "ding-ding-ding" van de startbel van een boksronde.
  [0, 0.32, 0.64].forEach((offset, slagNummer) => {
    const start = startTijd + offset;
    const slag = context.createGain();
    slag.gain.setValueAtTime(slagNummer === 2 ? 0.48 : 0.43, start);
    slag.gain.exponentialRampToValueAtTime(0.0001, start + 1.65);
    slag.connect(begrenzer);

    [
      [420, 0.3],
      [635, 0.26],
      [905, 0.2],
      [1280, 0.13],
      [1810, 0.075],
      [2470, 0.035],
    ].forEach(([frequentie, sterkte]) => {
      const toon = context.createOscillator();
      const volume = context.createGain();
      toon.type = "sine";
      toon.frequency.setValueAtTime(frequentie * 1.018, start);
      toon.frequency.exponentialRampToValueAtTime(frequentie, start + 0.045);
      volume.gain.value = sterkte;
      toon.connect(volume).connect(slag);
      toon.start(start);
      toon.stop(start + 1.7);
    });

    // Een heel korte ruispuls simuleert de hamer die de bel raakt.
    const aanslagDuur = 0.035;
    const ruisBuffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * aanslagDuur),
      context.sampleRate,
    );
    const samples = ruisBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    }
    const aanslag = context.createBufferSource();
    const aanslagFilter = context.createBiquadFilter();
    const aanslagVolume = context.createGain();
    aanslag.buffer = ruisBuffer;
    aanslagFilter.type = "bandpass";
    aanslagFilter.frequency.value = 1700;
    aanslagFilter.Q.value = 0.8;
    aanslagVolume.gain.value = 0.18;
    aanslag.connect(aanslagFilter).connect(aanslagVolume).connect(begrenzer);
    aanslag.start(start);
  });
}

// De rustbel als media-element
// ----------------------------
// Web Audio valt op iOS onder de "ambient"-categorie: het zwijgt zodra de
// stilteschakelaar om staat, en de AudioContext wordt geschorst zodra de PWA
// naar de achtergrond gaat — precies wanneer je de bel nodig hebt. Een
// <audio>-element valt onder media-afspelen: dat blijft hoorbaar op stil en
// speelt door met het scherm uit. Daarom rendert de app per set één WAV van
// [rustduur stilte + bel] en start die op het moment van afvinken.
//
// Keerzijde: media-afspelen onderbreekt andere audio, en omdat de WAV de hele
// rust duurt blijft een podcast de hele rustpauze gepauzeerd. W12 en W13
// hebben de drie zachtere audiosessie-soorten ("ambient", "transient",
// "transient-solo") in de sportschool geprobeerd om daaronderuit te komen:
// geen ervan leverde de bel af met het scherm op slot. Die zijn daarom weg.
// Wat overblijft is "playback" — altijd hoorbaar, ook op stil, tegen de prijs
// van een podcast die de hele rust pauzeert — plus de meldingsstand hieronder,
// die het omgekeerde doet.

const BEL_DUUR_SEC = 2.4;
const BEL_RENDER_RATE = 44100; // Safari is het meest voorspelbaar op 44,1 kHz
const BEL_DECIMATIE = 2; // → 22,05 kHz; ruim boven de hoogste boventoon (2470 Hz)
const RUST_SAMPLERATE = BEL_RENDER_RATE / BEL_DECIMATIE;

let belSamples = null;
let rustAudioUrl = null;
let rustAudioActief = false;
// "playback" is een navigator.audioSession-type: die speelt zelf een WAV af.
// "push" is het tegendeel — de app speelt niets en laat de Worker op het juiste
// moment een melding sturen (zie push-worker/README.md).
const AUDIO_SESSIE_MODI = ["playback"];
const AUDIO_MODI = [...AUDIO_SESSIE_MODI, "push"];
let audioModus = "playback";

// navigator.audioSession bestaat op Safari 16.4+; elders is er niets te kiezen
// en houdt de browser zijn eigen gedrag aan.
function audioSessieBeschikbaar() {
  return typeof navigator !== "undefined" && "audioSession" in navigator;
}

function zetAudioSessie(soort) {
  if (!audioSessieBeschikbaar()) return false;
  try {
    navigator.audioSession.type = soort;
    return true;
  } catch (fout) {
    console.warn("Audiosessie zetten mislukt:", veiligeFoutmelding(fout));
    return false;
  }
}

// Een bewaarde keuze voor een geschrapte stand (ambient, transient,
// transient-solo, of de oude schakelaar { mengen: true }) valt terug op
// playback: die werkte altijd al en is hier de veilige uitkomst.
function leesAudioModus() {
  const bewaard = leesJson(OPSLAG.geluid);
  return AUDIO_MODI.includes(bewaard?.modus) ? bewaard.modus : "playback";
}

function audioModusKnoppen() {
  return Array.from(elementen.audioModus.querySelectorAll('input[name="audio-modus"]'));
}

function vulGeluidsformulier() {
  audioModus = leesAudioModus();
  audioModusKnoppen().forEach((knop) => { knop.checked = knop.value === audioModus; });
  // Restant van de keten-test uit v0.10; die diagnose heeft niemand meer nodig.
  try { localStorage.removeItem("workout-keten-diag-v1"); } catch { }
  // "push" gebruikt geen audiosessie en blijft dus ook bruikbaar waar
  // navigator.audioSession ontbreekt (desktop, Chromium).
  if (!audioSessieBeschikbaar()) {
    audioModusKnoppen().forEach((knop) => { knop.disabled = AUDIO_SESSIE_MODI.includes(knop.value); });
    elementen.audioModusMelding.className = "melding";
    elementen.audioModusMelding.textContent =
      "Deze browser kan de audiosessie niet instellen; alleen de meldingsstand is hier te kiezen.";
  }
}

const AUDIO_MODUS_UITLEG = {
  playback: "Bel onderbreekt andere audio en is altijd hoorbaar, ook op stil.",
  push: "De app speelt zelf niets; de Worker stuurt een melding. Podcast blijft lopen — zet de belschakelaar niet op stil.",
};

function slaGeluidsinstellingOp() {
  const gekozen = audioModusKnoppen().find((knop) => knop.checked)?.value;
  audioModus = AUDIO_MODI.includes(gekozen) ? gekozen : "playback";
  const bewaard = schrijfJson(OPSLAG.geluid, { modus: audioModus });
  elementen.audioModusMelding.className = bewaard ? "melding goed" : "melding fout";
  elementen.audioModusMelding.textContent = bewaard
    ? AUDIO_MODUS_UITLEG[audioModus]
    : "Instelling lokaal opslaan is mislukt.";
  // Een lopende rust draait nog op de oude stand. Deze change komt uit een tik
  // op de schakelaar, dus opnieuw starten mag: zo gaat de keuze direct in en
  // hoeft er niet eerst een set afgevinkt te worden.
  if (audioModus === "push" && !pushKlaar()) {
    elementen.audioModusMelding.className = "melding fout";
    elementen.audioModusMelding.textContent =
      "Zet meldingen eerst op onder \"Melding op slot\" hieronder, anders blijft de rust stil.";
  }
  if (timerEinde) {
    const resterend = Math.max(0, (timerEinde - Date.now()) / 1000);
    if (audioModus === "push") {
      // Het media-element loslaten geeft de podcast meteen weer vrij.
      stopRustAudio();
      if (resterend > 0) planPushBel(resterend);
    } else {
      annuleerPushBel();
      // Na de bel (resterend 0) zou opnieuw starten de bel nog eens laten
      // klinken; dan alleen de lopende audio stoppen.
      if (resterend <= 0 || !startRustAudio(resterend)) stopRustAudio();
    }
  }
}

async function bereidBelVoor() {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (belSamples || !Offline) return;
  try {
    const bron = new Offline(1, Math.ceil(BEL_RENDER_RATE * BEL_DUUR_SEC), BEL_RENDER_RATE);
    bouwBelGeluid(bron, bron.destination, 0);
    const gerenderd = await bron.startRendering();
    belSamples = verkleinSamples(gerenderd.getChannelData(0), BEL_DECIMATIE);
  } catch (fout) {
    // Zonder gerenderde bel valt de app terug op Web Audio.
    console.warn("Bel voorrenderen mislukt:", veiligeFoutmelding(fout));
    belSamples = null;
  }
}

function verkleinSamples(bron, factor) {
  const uit = new Float32Array(Math.floor(bron.length / factor));
  for (let i = 0; i < uit.length; i += 1) {
    let som = 0;
    for (let j = 0; j < factor; j += 1) som += bron[i * factor + j];
    uit[i] = som / factor;
  }
  return uit;
}

// Stilte kost geen rekenwerk: een ArrayBuffer begint op nul, dus alleen de
// bel aan het eind hoeft weggeschreven te worden.
function maakRustWavBlob(stilteSeconden) {
  const stilteSamples = Math.max(0, Math.round(stilteSeconden * RUST_SAMPLERATE));
  const totaal = stilteSamples + belSamples.length;
  const buffer = new ArrayBuffer(44 + totaal * 2);
  const dv = new DataView(buffer);
  const tekst = (positie, waarde) => {
    for (let i = 0; i < waarde.length; i += 1) dv.setUint8(positie + i, waarde.charCodeAt(i));
  };

  tekst(0, "RIFF");
  dv.setUint32(4, 36 + totaal * 2, true);
  tekst(8, "WAVE");
  tekst(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, RUST_SAMPLERATE, true);
  dv.setUint32(28, RUST_SAMPLERATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  tekst(36, "data");
  dv.setUint32(40, totaal * 2, true);

  let positie = 44 + stilteSamples * 2;
  for (let i = 0; i < belSamples.length; i += 1) {
    const waarde = Math.max(-1, Math.min(1, belSamples[i]));
    dv.setInt16(positie, waarde < 0 ? waarde * 0x8000 : waarde * 0x7fff, true);
    positie += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function startRustAudio(seconden) {
  const audio = elementen.rustAudio;
  if (!audio || !belSamples || !(seconden >= 0)) return false;
  stopRustAudio();
  try {
    zetAudioSessie(audioModus);
    rustAudioUrl = URL.createObjectURL(maakRustWavBlob(seconden));
    audio.loop = false;
    audio.onended = null;
    audio.src = rustAudioUrl;
    const belofte = audio.play();
    if (belofte && belofte.catch) belofte.catch(() => { rustAudioActief = false; });
    rustAudioActief = true;
    // Alleen bij "playback" is de app de enige speler; in de andere standen
    // blijft de Now Playing-kaart van de podcast staan — die overnemen voor
    // een tijdbalk van een stille WAV kost meer dan het oplevert.
    if (audioModus === "playback") zetMediaSessie(Math.round(seconden));
    return true;
  } catch (fout) {
    console.warn("Rustaudio starten mislukt:", veiligeFoutmelding(fout));
    stopRustAudio();
    return false;
  }
}

function rustAudioLoopt() {
  const audio = elementen.rustAudio;
  return Boolean(rustAudioActief && audio && !audio.paused && !audio.ended && !audio.error);
}

function stopRustAudio() {
  rustAudioActief = false;
  const audio = elementen.rustAudio;
  if (audio) {
    try {
      audio.onended = null;
      audio.loop = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch { }
  }
  if (rustAudioUrl) {
    URL.revokeObjectURL(rustAudioUrl);
    rustAudioUrl = null;
  }
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    } catch { }
  }
}

// Zet de Now Playing-kaart op het vergrendelscherm. Een aftellende teller kan
// een PWA daar niet tonen, maar de voortgangsbalk van dit fragment ís de
// rusttimer, en pauzeren komt neer op de rust afbreken.
function zetMediaSessie(seconden, titel) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titel || `Rust ${formatteerTijd(seconden)}`,
      artist: plan?.naam || "Workout",
      album: "Workout",
      artwork: [
        { src: "./icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "./icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setActionHandler("pause", () => stopTimer());
    navigator.mediaSession.setActionHandler("stop", () => stopTimer());
  } catch { }
}

// ---------------------------------------------------------------------------
// De rustbel als pushmelding (v0.11)
//
// Waarom dit bestaat: op iOS mag een PWA met het scherm op slot geen nieuw
// geluid starten, en het enige dat wél werkt — één WAV die de hele rust beslaat
// — bezet de audiosessie en pauzeert dus de podcast (W11 t/m W13 in
// BACKLOG.md). Een melding komt van buiten, heeft geen audiosessie nodig en
// laat andere audio met rust. De app plant hem binnen de tik waarmee de set
// wordt afgevinkt; een eigen Cloudflare Worker (push-worker/) houdt de wekker
// vast en stuurt hem op tijd.
//
// De prijs ervan: het is het standaard meldingsgeluid van iOS, het volgt de
// belschakelaar van de telefoon (op stil hoor je hem niet) en er moet bereik
// zijn op het moment van afvinken.

let pushGepland = false;

function leesPushInstellingen() {
  const bewaard = leesJson(OPSLAG.push);
  return bewaard && typeof bewaard === "object" ? bewaard : {};
}

function pushKlaar() {
  const p = leesPushInstellingen();
  return Boolean(p.url && p.sleutel && p.id);
}

function meldingenMogelijk() {
  return "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
}

function toonPushMelding(tekst, soort = "") {
  elementen.pushMelding.className = `melding${soort ? ` ${soort}` : ""}`;
  elementen.pushMelding.textContent = tekst;
}

function vulPushFormulier() {
  const p = leesPushInstellingen();
  elementen.pushUrl.value = p.url ?? "";
  elementen.pushSleutel.value = p.sleutel ?? "";
  if (!meldingenMogelijk()) {
    toonPushMelding(
      "Deze browser kan geen meldingen ontvangen. Op de iPhone moet de app via Deel → Zet op beginscherm geïnstalleerd zijn en vanaf het beginscherm geopend worden.",
      "fout",
    );
  } else if (p.id) {
    toonPushMelding("Meldingen staan aan op dit toestel.", "goed");
  }
}

function slaPushInstellingenOp() {
  const url = elementen.pushUrl.value.trim().replace(/\/+$/, "");
  const sleutel = elementen.pushSleutel.value.trim();
  if (!url || !sleutel) {
    toonPushMelding("Vul zowel de Worker-URL als de app-sleutel in.", "fout");
    return false;
  }
  let ontleed = null;
  try { ontleed = new URL(url); } catch { ontleed = null; }
  if (!ontleed || ontleed.protocol !== "https:") {
    toonPushMelding("De Worker-URL moet met https:// beginnen.", "fout");
    return false;
  }
  // Wijst de URL naar een andere Worker, dan hoort het oude abonnement-id daar
  // niet bij en moet er opnieuw geabonneerd worden.
  const vorige = leesPushInstellingen();
  const verhuisd = Boolean(vorige.url && vorige.url !== url);
  const bewaard = schrijfJson(OPSLAG.push, {
    ...vorige,
    url,
    sleutel,
    ...(verhuisd ? { id: null, endpoint: null } : {}),
  });
  toonPushMelding(
    bewaard ? "Opgeslagen. Tik nu op “Meldingen aanzetten”." : "Lokaal opslaan is mislukt.",
    bewaard ? "goed" : "fout",
  );
  return bewaard;
}

async function zetMeldingenAan() {
  if (!meldingenMogelijk()) {
    toonPushMelding(
      "Deze browser kan geen meldingen ontvangen. Op de iPhone: Deel → Zet op beginscherm, en open de app daarna vanaf het beginscherm.",
      "fout",
    );
    return;
  }
  // Opslaan staat bewust vóór het vragen: requestPermission moet in dezelfde
  // taak als de tik gebeuren, dus er mag geen await aan voorafgaan.
  if (!slaPushInstellingenOp()) return;
  let toestemming;
  try {
    toestemming = await Notification.requestPermission();
  } catch (fout) {
    toonPushMelding(veiligeFoutmelding(fout), "fout");
    return;
  }
  if (toestemming !== "granted") {
    toonPushMelding("Meldingen zijn geweigerd. Zet ze aan bij Instellingen → Meldingen → Workout.", "fout");
    return;
  }
  toonPushMelding("Abonneren bij de Worker…");
  await registreerPushAbonnement(true);
}

async function registreerPushAbonnement(luid = false) {
  const instellingen = leesPushInstellingen();
  try {
    const registratie = await navigator.serviceWorker.ready;
    const sleutelAntwoord = await fetch(`${instellingen.url}/sleutel`);
    if (!sleutelAntwoord.ok) throw new Error(`De Worker antwoordde ${sleutelAntwoord.status} op /sleutel.`);
    const publiek = (await sleutelAntwoord.json())?.publiek;
    if (!publiek) throw new Error("De Worker gaf geen VAPID-sleutel terug.");

    let abonnement = await registratie.pushManager.getSubscription();
    // Een abonnement op een oudere VAPID-sleutel kan de Worker niet meer
    // beleveren; opzeggen en opnieuw beginnen.
    if (abonnement && !zelfdeVapidSleutel(abonnement, publiek)) {
      await abonnement.unsubscribe();
      abonnement = null;
    }
    if (!abonnement) {
      abonnement = await registratie.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlNaarBytes(publiek),
      });
    }
    const uit = await pushVerzoek("/abonneer", { abonnement: abonnement.toJSON() });
    if (!uit?.id) throw new Error("De Worker gaf geen id terug.");
    schrijfJson(OPSLAG.push, { ...leesPushInstellingen(), id: uit.id, endpoint: abonnement.endpoint });
    if (luid) toonPushMelding("Meldingen staan aan. Stuur een testmelding om te horen of hij aankomt.", "goed");
    return true;
  } catch (fout) {
    if (luid) toonPushMelding(veiligeFoutmelding(fout), "fout");
    else console.warn("Pushabonnement vernieuwen mislukt:", veiligeFoutmelding(fout));
    return false;
  }
}

// iOS kan een pushabonnement vernieuwen terwijl de app dicht is; dan wijst het
// bewaarde id bij de Worker naar een endpoint dat niet meer bestaat.
async function controleerPushAbonnement() {
  const instellingen = leesPushInstellingen();
  if (!instellingen.url || !instellingen.sleutel) return;
  if (!meldingenMogelijk() || Notification.permission !== "granted") return;
  try {
    const registratie = await navigator.serviceWorker.ready;
    const abonnement = await registratie.pushManager.getSubscription();
    if (!abonnement || abonnement.endpoint !== instellingen.endpoint) await registreerPushAbonnement(false);
  } catch (fout) {
    console.warn("Pushabonnement controleren mislukt:", veiligeFoutmelding(fout));
  }
}

function zelfdeVapidSleutel(abonnement, publiek) {
  const huidig = abonnement.options?.applicationServerKey;
  if (!huidig) return true; // niet te controleren; laat het abonnement staan
  const a = new Uint8Array(huidig);
  const b = base64urlNaarBytes(publiek);
  return a.length === b.length && a.every((waarde, i) => waarde === b[i]);
}

async function pushVerzoek(pad, lichaam) {
  const { url, sleutel } = leesPushInstellingen();
  if (!url || !sleutel) throw new Error("Worker-URL of app-sleutel ontbreekt.");
  const antwoord = await fetch(`${url}${pad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Workout-Sleutel": sleutel },
    body: JSON.stringify(lichaam),
    // Het verzoek moet afgemaakt worden ook als de telefoon meteen na de tik op
    // slot gaat en de pagina bevriest.
    keepalive: true,
  });
  const uit = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) throw new Error(uit.fout || `De Worker antwoordde ${antwoord.status}.`);
  return uit;
}

async function planPushBel(seconden) {
  if (!pushKlaar()) {
    meldPushInTimer("meldingen nog niet ingesteld");
    return;
  }
  try {
    await pushVerzoek("/plan", {
      id: leesPushInstellingen().id,
      seconden: Math.max(0, Math.round(seconden)),
      titel: "Rust voorbij",
      tekst: plan?.naam ? `Volgende set — ${plan.naam}` : "Volgende set.",
    });
    pushGepland = true;
    meldPushInTimer("");
  } catch (fout) {
    pushGepland = false;
    console.warn("Bel plannen mislukt:", veiligeFoutmelding(fout));
    meldPushInTimer("melding niet gepland");
  }
}

function annuleerPushBel() {
  if (!pushGepland || !pushKlaar()) return;
  pushGepland = false;
  pushVerzoek("/annuleer", { id: leesPushInstellingen().id })
    .catch((fout) => console.warn("Bel annuleren mislukt:", veiligeFoutmelding(fout)));
}

// Mislukt het plannen (geen bereik in de gym), dan moet dat te zien zijn zonder
// dat het de rust onderbreekt: één regel achter het label van de timer.
function meldPushInTimer(tekst) {
  const label = elementen.timer.querySelector(".timer-label");
  if (!label || !timerEinde || timerEinde - Date.now() <= 0) return;
  label.textContent = tekst ? `Rust · ${tekst}` : "Rust";
}

async function stuurTestmelding() {
  const knop = document.getElementById("push-test");
  knop.disabled = true;
  toonPushMelding("Testmelding versturen…");
  try {
    if (!pushKlaar() && !(await registreerPushAbonnement(true))) return;
    const uit = await pushVerzoek("/test", { id: leesPushInstellingen().id });
    const gelukt = Number(uit.status) < 300;
    toonPushMelding(
      gelukt
        ? "Verstuurd. Hij komt binnen enkele seconden aan. Op het slotscherm hoor je hem alleen als de belschakelaar niet op stil staat."
        : `De pushdienst weigerde hem: ${uit.status} ${uit.tekst || ""}`.trim(),
      gelukt ? "goed" : "fout",
    );
  } catch (fout) {
    toonPushMelding(veiligeFoutmelding(fout), "fout");
  } finally {
    knop.disabled = false;
  }
}

function base64urlNaarBytes(tekst) {
  const plat = tekst.replace(/-/g, "+").replace(/_/g, "/");
  const ruw = atob(plat + "=".repeat((4 - (plat.length % 4)) % 4));
  const uit = new Uint8Array(ruw.length);
  for (let i = 0; i < ruw.length; i += 1) uit[i] = ruw.charCodeAt(i);
  return uit;
}

// Scherm aan houden tijdens de sessie, zodat de rusttimer blijft lopen.
let wakeLock = null;
async function vraagWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function rondSessieAf() {
  if (bezigMetAfronden || !plan) return;
  bezigMetAfronden = true;
  verbergLogMelding();

  const openSets = plan.oefeningen.flatMap((oefening) => oefening.sets).filter((set) => set.status === "open");
  if (openSets.length > 0) {
    const akkoord = window.confirm(`${openSets.length} set${openSets.length === 1 ? " staat" : "s staan"} nog open. Als overgeslagen opslaan?`);
    if (!akkoord) {
      bezigMetAfronden = false;
      return;
    }
    openSets.forEach((set) => { set.status = "overgeslagen"; });
  }

  const fout = valideerSessie();
  if (fout) {
    toonLogMelding(fout);
    renderOefeningen();
    bezigMetAfronden = false;
    return;
  }

  const sessie = bouwSessieJson();
  try {
    voegToeAanWachtrij(sessie);
  } catch (foutBijOpslaan) {
    toonLogMelding("Lokaal opslaan is mislukt. De sessie is niet afgerond; maak opslagruimte vrij en probeer opnieuw.");
    bezigMetAfronden = false;
    return;
  }

  localStorage.removeItem(OPSLAG.concept);
  stopTimer();
  elementen.sessieJson.textContent = JSON.stringify(sessie, null, 2);
  elementen.logscherm.classList.add("verborgen");
  elementen.resultaat.classList.remove("verborgen");
  elementen.logActies.classList.add("verborgen");
  werkSyncStatusBij();
  await synchroniseerWachtrij();
  bezigMetAfronden = false;
}

async function startNieuweSessie() {
  verbergNieuwPlanBanner();
  elementen.sessieJson.textContent = "";
  elementen.resultaat.classList.add("verborgen");
  elementen.logscherm.classList.remove("verborgen");
  elementen.logActies.classList.remove("verborgen");
  await laadStartplan();
}

function valideerSessie() {
  for (const oefening of plan.oefeningen) {
    if (!oefening.naam.trim()) return "Vul de naam in van elke extra of vervangende oefening.";
    for (const set of oefening.sets) {
      if (set.status === "gedaan") {
        if (!Number.isFinite(set.kg) || set.kg < 0) return `Vul geldige kg in bij ${oefening.naam}.`;
        if (!Number.isFinite(set.reps) || set.reps < 0 || !Number.isInteger(set.reps)) {
          return `Vul een heel aantal reps in bij ${oefening.naam}.`;
        }
      }
    }
  }
  return "";
}

function bouwSessieJson() {
  const afgerond = formatLokaleDatumtijd();
  const tijden = afvinktijden();
  const sessie = {
    versie: 1,
    // De trainingsdag is de dag van de eerste afvinktik; `gestart` kan van een
    // eerder geopende app zijn.
    datum: (tijden[0] ?? gestart).slice(0, 10),
    gestart,
    afgerond,
    ...(tijden.length ? { eerste_set: tijden[0], laatste_set: tijden.at(-1) } : {}),
    plan_van: plan.gepland_op,
    naam: plan.naam,
    notitie: elementen.sessieNotitie.value.trim(),
  };
  if (plan.warming_up?.length) {
    sessie.warming_up = plan.warming_up.map((item) => ({
      tekst: item.tekst, gedaan: Boolean(item.gedaan), ...metTijd(item, item.gedaan),
    }));
  }
  sessie.oefeningen = plan.oefeningen.map((oefening) => {
      const resultaat = { naam: oefening.naam.trim() };
      if (supersetId(oefening)) resultaat.superset = supersetId(oefening);
      resultaat.sets = oefening.sets.map(maakContractSet);
      if (oefening.opwarm_sets?.length) {
        resultaat.opwarm_sets = oefening.opwarm_sets.map((set) => ({
          kg: set.kg, reps: set.reps, gedaan: Boolean(set.gedaan), ...metTijd(set, set.gedaan),
        }));
      }
      if (oefening.vervangen_van) resultaat.vervangen_van = oefening.vervangen_van;
      const laatsteGedaan = [...resultaat.sets].reverse().find((set) => set.gedaan);
      if (Number.isFinite(oefening.rpe) && laatsteGedaan) laatsteGedaan.rpe = oefening.rpe;
      return resultaat;
  });
  return sessie;
}

function maakContractSet(set) {
  const resultaat = {};
  if (Object.hasOwn(set, "gepland_kg")) resultaat.gepland_kg = set.gepland_kg;
  if (Object.hasOwn(set, "gepland_reps")) resultaat.gepland_reps = set.gepland_reps;
  if (set.status === "gedaan") {
    resultaat.kg = set.kg;
    resultaat.reps = set.reps;
    resultaat.gedaan = true;
    Object.assign(resultaat, metTijd(set, true));
  } else {
    resultaat.gedaan = false;
  }
  return resultaat;
}

function voegToeAanWachtrij(sessie) {
  const wachtrij = leesWachtrij();
  const pad = bepaalLokaalPad(sessie.datum, wachtrij);
  wachtrij.push({
    id: `${sessie.gestart}-${Math.random().toString(36).slice(2)}`,
    pad,
    sessie,
  });
  schrijfJsonOfGooi(OPSLAG.wachtrij, wachtrij);
}

function bepaalLokaalPad(datum, wachtrij) {
  let nummer = 1;
  let pad;
  do {
    pad = `sessies/${datum}${nummer === 1 ? "" : `-${nummer}`}.json`;
    nummer += 1;
  } while (wachtrij.some((item) => item.pad === pad));
  return pad;
}

async function synchroniseerWachtrij() {
  if (synchronisatieBezig) return;
  if (leesWachtrij().length === 0) return;
  const instellingen = leesInstellingen();
  if (!instellingen) {
    werkSyncStatusBij();
    return;
  }

  synchronisatieBezig = true;
  laatsteSyncFout = "";
  werkSyncStatusBij();
  try {
    let wachtrij = leesWachtrij();
    while (wachtrij.length > 0) {
      const item = wachtrij[0];
      await uploadSessie(item, instellingen);
      wachtrij = leesWachtrij().filter((huidig) => huidig.id !== item.id);
      schrijfJsonOfGooi(OPSLAG.wachtrij, wachtrij);
    }
    laatsteSyncFout = "";
    zetBasisSyncStatus("Alles gesynchroniseerd", "goed");
  } catch (fout) {
    laatsteSyncFout = navigator.onLine ? veiligeFoutmelding(fout) : "Offline · later opnieuw";
    zetBasisSyncStatus(laatsteSyncFout, "fout");
    console.warn("Synchronisatie mislukt:", veiligeFoutmelding(fout));
  } finally {
    synchronisatieBezig = false;
    laatsteSyncPoging = new Date();
    werkSyncStatusBij();
    flitsResultaatStatus();
  }
}

async function uploadSessie(item, instellingen) {
  const beschikbaar = await zoekBeschikbaarPad(item, instellingen);
  if (beschikbaar.bestaatAl) return;

  werkWachtrijItemBij(item.id, { pad: beschikbaar.pad });
  const antwoord = await githubFetch(instellingen, beschikbaar.pad, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Log workout ${item.sessie.datum}`,
      content: tekstNaarBase64(`${JSON.stringify(item.sessie, null, 2)}\n`),
    }),
  });
  if (antwoord.status !== 200 && antwoord.status !== 201) throw await githubFout(antwoord, "Sessie uploaden mislukt");
}

async function zoekBeschikbaarPad(item, instellingen) {
  for (let nummer = 1; nummer <= 100; nummer += 1) {
    const pad = `sessies/${item.sessie.datum}${nummer === 1 ? "" : `-${nummer}`}.json`;
    const antwoord = await githubFetch(instellingen, pad);
    if (antwoord.status === 404) return { pad, bestaatAl: false };
    if (!antwoord.ok) throw await githubFout(antwoord, "Bestandsnaam controleren mislukt");

    const bestaand = await leesContentsAntwoord(antwoord);
    if (bestaand?.gestart === item.sessie.gestart) return { pad, bestaatAl: true };
  }
  throw new Error("Geen vrije bestandsnaam voor deze trainingsdatum gevonden.");
}

function werkWachtrijItemBij(id, wijzigingen) {
  const wachtrij = leesWachtrij();
  const item = wachtrij.find((huidig) => huidig.id === id);
  if (item) Object.assign(item, wijzigingen);
  schrijfJsonOfGooi(OPSLAG.wachtrij, wachtrij);
}

async function haalPlanOp(instellingen) {
  const antwoord = await githubFetch(instellingen, "plan/next.json");
  if (!antwoord.ok) throw await githubFout(antwoord, "Plan ophalen mislukt");
  const opgehaaldPlan = await leesContentsAntwoord(antwoord);
  controleerPlan(opgehaaldPlan);
  return opgehaaldPlan;
}

async function testVerbinding() {
  const instellingen = instellingenUitFormulier();
  if (!instellingen) return;
  if (!schrijfJson(OPSLAG.instellingen, instellingen)) {
    elementen.instellingenMelding.className = "melding fout";
    elementen.instellingenMelding.textContent = "Instellingen lokaal opslaan is mislukt.";
    return;
  }
  elementen.instellingenMelding.className = "melding";
  elementen.instellingenMelding.textContent = "Verbinding testen…";
  document.getElementById("verbinding-testen").disabled = true;
  try {
    const opgehaaldPlan = await haalPlanOp(instellingen);
    schrijfJson(OPSLAG.planCache, opgehaaldPlan);
    elementen.instellingenMelding.className = "melding goed";
    elementen.instellingenMelding.textContent = "Verbinding werkt; plan/next.json is gelezen en gecachet.";
    zetBasisSyncStatus("Verbinding werkt", "goed");
    if (planBron === "voorbeeld" && !conceptGewijzigd) {
      plan = maakWerkplan(opgehaaldPlan);
      gestart = formatLokaleDatumtijd();
      conceptGewijzigd = false;
      planBron = "GitHub";
      elementen.sessieNotitie.value = "";
      bewaarConcept(false);
      toonPlan();
    }
    await synchroniseerWachtrij();
  } catch (fout) {
    elementen.instellingenMelding.className = "melding fout";
    elementen.instellingenMelding.textContent = veiligeFoutmelding(fout);
    zetBasisSyncStatus("Verbinding mislukt", "fout");
  } finally {
    document.getElementById("verbinding-testen").disabled = false;
  }
}

function slaInstellingenOp() {
  const instellingen = instellingenUitFormulier();
  if (!instellingen) return;
  if (!schrijfJson(OPSLAG.instellingen, instellingen)) {
    elementen.instellingenMelding.className = "melding fout";
    elementen.instellingenMelding.textContent = "Instellingen lokaal opslaan is mislukt.";
    return;
  }
  elementen.instellingenMelding.className = "melding goed";
  elementen.instellingenMelding.textContent = "Instellingen lokaal opgeslagen.";
  zetBasisSyncStatus("Instellingen opgeslagen", "goed");
  synchroniseerWachtrij();
}

function instellingenUitFormulier() {
  const owner = elementen.githubOwner.value.trim();
  const token = elementen.githubToken.value.trim();
  if (!owner || !token) {
    elementen.instellingenMelding.className = "melding fout";
    elementen.instellingenMelding.textContent = "Vul zowel de GitHub-owner als de PAT in.";
    return null;
  }
  return { owner, token };
}

function vulInstellingenformulier() {
  const instellingen = leesInstellingen();
  elementen.githubOwner.value = instellingen?.owner ?? "";
  elementen.githubToken.value = instellingen?.token ?? "";
}

function verbergAlleSchermen() {
  for (const scherm of [elementen.logscherm, elementen.resultaat, elementen.instellingen,
                        elementen.dashboard, elementen.logActies]) {
    scherm.classList.add("verborgen");
  }
}

function toonHoofdscherm() {
  if (elementen.sessieJson.textContent) {
    elementen.resultaat.classList.remove("verborgen");
  } else {
    elementen.logscherm.classList.remove("verborgen");
    elementen.logActies.classList.remove("verborgen");
  }
}

function openInstellingen() {
  verbergAlleSchermen();
  elementen.instellingen.classList.remove("verborgen");
  elementen.githubOwner.focus();
}

function sluitInstellingen() {
  elementen.instellingen.classList.add("verborgen");
  toonHoofdscherm();
}

async function openDashboard() {
  verbergAlleSchermen();
  elementen.dashboard.classList.remove("verborgen");

  const cache = leesJson(OPSLAG.dashboard);
  if (cache?.html) {
    elementen.dashboardFrame.srcdoc = cache.html;
    elementen.dashboardStatus.textContent = `Versie van ${cache.opgehaald}`;
  }

  const instellingen = leesInstellingen();
  if (!instellingen) {
    if (!cache) elementen.dashboardStatus.textContent = "Stel eerst GitHub in (⚙) om het dashboard op te halen.";
    return;
  }
  elementen.dashboardStatus.textContent = cache ? `Versie van ${cache.opgehaald} · bijwerken…` : "Dashboard ophalen…";
  try {
    const antwoord = await githubFetch(instellingen, "dashboard.html");
    if (!antwoord.ok) throw await githubFout(antwoord, "Dashboard ophalen mislukt");
    const inhoud = await leesContentsTekst(antwoord);
    const opgehaald = formatLokaleDatumtijd().slice(0, 16).replace("T", " ");
    schrijfJson(OPSLAG.dashboard, { html: inhoud, opgehaald });
    elementen.dashboardFrame.srcdoc = inhoud;
    elementen.dashboardStatus.textContent = `Bijgewerkt ${opgehaald}`;
  } catch (fout) {
    if (cache?.html) {
      elementen.dashboardStatus.textContent = `Offline · versie van ${cache.opgehaald}`;
    } else {
      elementen.dashboardStatus.textContent = veiligeFoutmelding(fout);
    }
  }
}

function leesInstellingen() {
  const instellingen = leesJson(OPSLAG.instellingen);
  return instellingen?.owner && instellingen?.token ? instellingen : null;
}

function leesWachtrij() {
  const wachtrij = leesJson(OPSLAG.wachtrij);
  return Array.isArray(wachtrij) ? wachtrij : [];
}

async function githubFetch(instellingen, pad, opties = {}) {
  const veiligPad = pad.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${encodeURIComponent(instellingen.owner)}/${REPO}/contents/${veiligPad}`;
  return fetch(url, {
    ...opties,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${instellingen.token}`,
      "X-GitHub-Api-Version": API_VERSIE,
      ...(opties.headers ?? {}),
    },
  });
}

async function leesContentsTekst(antwoord) {
  const gegevens = await antwoord.json();
  if (typeof gegevens.content !== "string" || gegevens.encoding !== "base64") {
    throw new Error("GitHub gaf geen leesbare bestandsinhoud terug.");
  }
  return base64NaarTekst(gegevens.content);
}

async function leesContentsAntwoord(antwoord) {
  return JSON.parse(await leesContentsTekst(antwoord));
}

async function githubFout(antwoord, voorvoegsel) {
  let detail = antwoord.statusText;
  try {
    const gegevens = await antwoord.json();
    if (gegevens.message) detail = gegevens.message;
  } catch {
    // Een niet-JSON-foutantwoord heeft genoeg informatie in de HTTP-status.
  }
  return new Error(`${voorvoegsel} (${antwoord.status}): ${detail}`);
}

function tekstNaarBase64(tekst) {
  const bytes = new TextEncoder().encode(tekst);
  let binair = "";
  bytes.forEach((byte) => { binair += String.fromCharCode(byte); });
  return btoa(binair);
}

function base64NaarTekst(base64) {
  const binair = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binair, (teken) => teken.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function formatLokaleDatumtijd(datum = new Date()) {
  const twee = (getal) => String(getal).padStart(2, "0");
  const verschil = -datum.getTimezoneOffset();
  const teken = verschil >= 0 ? "+" : "-";
  const uren = twee(Math.floor(Math.abs(verschil) / 60));
  const minuten = twee(Math.abs(verschil) % 60);
  return `${datum.getFullYear()}-${twee(datum.getMonth() + 1)}-${twee(datum.getDate())}` +
    `T${twee(datum.getHours())}:${twee(datum.getMinutes())}:${twee(datum.getSeconds())}${teken}${uren}:${minuten}`;
}

function zetBasisSyncStatus(tekst, soort) {
  basisSyncStatus = { tekst, soort };
  werkSyncStatusBij();
}

function werkSyncStatusBij() {
  const aantal = leesWachtrij().length;
  if (synchronisatieBezig) {
    elementen.syncStatus.textContent = `Synchroniseren… ${aantal || ""}`.trim();
    elementen.syncStatus.dataset.soort = "";
  } else if (aantal > 0) {
    const wachttekst = `${aantal} sessie${aantal === 1 ? "" : "s"} wacht${aantal === 1 ? "" : "en"} op sync`;
    // De wachtrij blijft staan als de upload mislukt; toon dan de reden erbij,
    // anders lijkt een druk op de knop niets te doen.
    elementen.syncStatus.textContent = laatsteSyncFout ? `${wachttekst} · ${laatsteSyncFout}` : wachttekst;
    elementen.syncStatus.dataset.soort = laatsteSyncFout ? "fout" : "wacht";
  } else {
    elementen.syncStatus.textContent = basisSyncStatus.tekst;
    elementen.syncStatus.dataset.soort = basisSyncStatus.soort;
  }
  werkResultaatSyncBij(aantal);
}

// Resultaatscherm: het statusvak en de knop zeggen samen waar de sessie staat,
// zodat een druk op de knop altijd iets zichtbaars oplevert. Een lege wachtrij
// betekent hier "geüpload": de sessie verlaat de wachtrij pas na de upload.
function werkResultaatSyncBij(aantal) {
  const tijd = (opties) => laatsteSyncPoging?.toLocaleTimeString("nl-NL", opties) ?? "";
  let tekst;
  let soort = "wacht";
  let knop = "Nu synchroniseren";
  let knopUit = false;
  if (synchronisatieBezig) {
    tekst = "Synchroniseren…";
    soort = "";
    knop = "Synchroniseren…";
    knopUit = true;
  } else if (aantal === 0) {
    const om = tijd({ hour: "2-digit", minute: "2-digit" });
    tekst = `✓ Gesynchroniseerd met workout-data${om ? ` om ${om}` : ""}.`;
    soort = "goed";
    knop = "✓ Gesynchroniseerd";
    knopUit = true;
  } else if (!leesInstellingen()) {
    tekst = "Alleen lokaal opgeslagen: GitHub is nog niet ingesteld.";
    knop = "GitHub instellen";
  } else if (laatsteSyncFout) {
    tekst = `Synchroniseren mislukt om ${tijd()}\n${laatsteSyncFout}\n` +
      "De sessie staat veilig op dit toestel; de app probeert het vanzelf opnieuw.";
    soort = "fout";
    knop = "Opnieuw synchroniseren";
  } else {
    tekst = "Veilig lokaal opgeslagen, nog niet gesynchroniseerd.";
  }
  elementen.resultaatStatus.textContent = tekst;
  elementen.resultaatStatus.dataset.soort = soort;
  elementen.resultaatSync.textContent = knop;
  elementen.resultaatSync.disabled = knopUit;
}

function flitsResultaatStatus() {
  const vak = elementen.resultaatStatus;
  vak.classList.remove("flits");
  void vak.offsetWidth; // herstart de animatie
  vak.classList.add("flits");
}

function toonLogMelding(tekst) {
  elementen.logMelding.textContent = tekst;
  elementen.logMelding.className = "melding fout";
}

function verbergLogMelding() {
  elementen.logMelding.textContent = "";
  elementen.logMelding.className = "melding verborgen";
}

function leesJson(sleutel) {
  try {
    const waarde = localStorage.getItem(sleutel);
    return waarde ? JSON.parse(waarde) : null;
  } catch {
    return null;
  }
}

function schrijfJson(sleutel, waarde) {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
    return true;
  } catch {
    return false;
  }
}

function schrijfJsonOfGooi(sleutel, waarde) {
  if (!schrijfJson(sleutel, waarde)) throw new Error("Lokale opslag is niet beschikbaar.");
}

function veiligeFoutmelding(fout) {
  return fout instanceof Error ? fout.message : "Onbekende fout.";
}

init().catch((fout) => {
  console.error(fout);
  zetBasisSyncStatus("App starten mislukt", "fout");
  toonLogMelding(veiligeFoutmelding(fout));
});
