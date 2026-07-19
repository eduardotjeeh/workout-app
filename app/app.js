// Workout-logger: lokaal loggen, daarna veilig synchroniseren met workout-data.
// Het datacontract staat in ../ARCHITECTUUR.md en blijft leidend.

const OPSLAG = {
  instellingen: "workout-instellingen-v1",
  planCache: "workout-plan-cache-v1",
  concept: "workout-actieve-sessie-v1",
  wachtrij: "workout-sync-wachtrij-v1",
};

const REPO = "workout-data";
const API_VERSIE = "2022-11-28";

let plan = null;
let gestart = null;
let planBron = "";
let timerInterval = null;
let timerEinde = null;
let synchronisatieBezig = false;
let bezigMetAfronden = false;
let conceptGewijzigd = false;
let basisSyncStatus = { tekst: "Sync controleren…", soort: "" };

const elementen = {
  planNaam: document.getElementById("plan-naam"),
  planNotitie: document.getElementById("plan-notitie"),
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
  resultaatStatus: document.getElementById("resultaat-status"),
  sessieJson: document.getElementById("sessie-json"),
  githubOwner: document.getElementById("github-owner"),
  githubToken: document.getElementById("github-token"),
  instellingenMelding: document.getElementById("instellingen-melding"),
  appVersie: document.getElementById("app-versie"),
};

async function init() {
  elementen.appVersie.textContent = `versie ${APP_VERSIE}`;
  registreerServiceWorker();
  stelGebeurtenissenIn();
  vraagWakeLock();
  vulInstellingenformulier();
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
  document.getElementById("instellingen-opslaan").addEventListener("click", slaInstellingenOp);
  document.getElementById("verbinding-testen").addEventListener("click", testVerbinding);
  document.getElementById("resultaat-sync").addEventListener("click", synchroniseerWachtrij);
  document.getElementById("nieuwe-sessie").addEventListener("click", startNieuweSessie);
  elementen.syncStatus.addEventListener("click", () => {
    if (leesInstellingen()) synchroniseerWachtrij();
    else openInstellingen();
  });
  elementen.sessieNotitie.addEventListener("input", () => bewaarConcept(true));
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
    planBron = "herstelde sessie";
    elementen.sessieNotitie.value = concept.sessieNotitie ?? "";
  } else {
    if (!bronplan) {
      const antwoord = await fetch("./voorbeeld-plan.json");
      if (!antwoord.ok) throw new Error("Voorbeeldplan kon niet worden geladen.");
      bronplan = await antwoord.json();
      bron = "voorbeeld";
    }
    controleerPlan(bronplan);
    plan = maakWerkplan(bronplan);
    gestart = formatLokaleDatumtijd();
    conceptGewijzigd = false;
    planBron = bron;
    elementen.sessieNotitie.value = "";
    bewaarConcept(false);
  }

  toonPlan();
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
    oefeningen: ruwPlan.oefeningen.map((oefening) => ({
      naam: oefening.naam,
      rust_sec: Number.isFinite(oefening.rust_sec) ? oefening.rust_sec : 0,
      stap_kg: Number.isFinite(oefening.stap_kg) && oefening.stap_kg > 0 ? oefening.stap_kg : 2.5,
      notitie: oefening.notitie ?? "",
      extra: false,
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

function isGeldigConcept(concept) {
  return Boolean(concept && typeof concept.gestart === "string" && concept.plan &&
    Array.isArray(concept.plan.oefeningen));
}

function toonPlan() {
  elementen.planNaam.textContent = plan.naam;
  elementen.planNotitie.textContent = plan.notitie || `Plan van ${plan.gepland_op}`;
  renderOefeningen();
}

function renderOefeningen() {
  elementen.oefeningen.replaceChildren();
  plan.oefeningen.forEach((oefening, oefeningIndex) => {
    const kaart = document.createElement("section");
    kaart.className = "oefening";

    const kop = document.createElement("div");
    kop.className = "oefening-kop";
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
      kop.appendChild(naam);
    } else {
      const titel = document.createElement("h2");
      titel.textContent = oefening.naam;
      kop.appendChild(titel);
    }
    const menuKnop = maakKnop("⋯", "icoonknop", "Oefeningmenu: verplaatsen of vervangen");
    menuKnop.addEventListener("click", () => {
      oefening.menuOpen = !oefening.menuOpen;
      bewaarEnRender();
    });
    kop.appendChild(menuKnop);
    kaart.appendChild(kop);

    if (oefening.vervangen_van) {
      const vervangenTekst = document.createElement("p");
      vervangenTekst.className = "notitie";
      vervangenTekst.textContent = `Vervangt: ${oefening.vervangen_van}`;
      kaart.appendChild(vervangenTekst);
    }

    if (oefening.menuOpen) kaart.appendChild(maakOefeningMenu(oefening, oefeningIndex));

    if (oefening.notitie) {
      const notitie = document.createElement("p");
      notitie.className = "notitie";
      notitie.textContent = oefening.notitie;
      kaart.appendChild(notitie);
    }

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
      kaart.appendChild(rustLabel);
    }

    oefening.sets.forEach((set, setIndex) => {
      kaart.appendChild(maakSetRegel(oefening, set, oefeningIndex, setIndex));
    });

    if (oefening.sets.some((set) => set.status === "gedaan")) {
      kaart.appendChild(maakRpeRij(oefening));
    }

    const extraSet = maakKnop("+ Extra set", "secundair breed set-toevoegen");
    extraSet.addEventListener("click", () => voegSetToe(oefening));
    kaart.appendChild(extraSet);
    elementen.oefeningen.appendChild(kaart);
  });
}

function maakOefeningMenu(oefening, oefeningIndex) {
  const rij = document.createElement("div");
  rij.className = "oefening-menu";

  const omhoog = maakKnop("↑ Omhoog", "secundair compact");
  omhoog.disabled = oefeningIndex === 0;
  omhoog.addEventListener("click", () => verplaatsOefening(oefeningIndex, -1));

  const omlaag = maakKnop("↓ Omlaag", "secundair compact");
  omlaag.disabled = oefeningIndex === plan.oefeningen.length - 1;
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
      const invoer = elementen.oefeningen.querySelectorAll(".oefening")[oefeningIndex]?.querySelector(".oefening-naam");
      if (invoer) { invoer.focus(); invoer.select(); }
    });
    rij.appendChild(vervang);
  }
  return rij;
}

function verplaatsOefening(index, richting) {
  const doel = index + richting;
  if (doel < 0 || doel >= plan.oefeningen.length) return;
  const [oefening] = plan.oefeningen.splice(index, 1);
  plan.oefeningen.splice(doel, 0, oefening);
  bewaarEnRender();
}

function maakRpeRij(oefening) {
  const rij = document.createElement("div");
  rij.className = "rpe-rij";

  const label = document.createElement("span");
  label.className = "eenheid";
  label.textContent = "RPE";
  rij.appendChild(label);

  const knoppen = document.createElement("div");
  knoppen.className = "rpe-knoppen";
  for (let waarde = 6; waarde <= 10; waarde += 0.5) {
    const knop = maakKnop(String(waarde).replace(".", ","), "rpe-knop" + (oefening.rpe === waarde ? " actief" : ""), `RPE ${waarde}`);
    knop.addEventListener("click", () => {
      oefening.rpe = oefening.rpe === waarde ? null : waarde;
      bewaarEnRender();
    });
    knoppen.appendChild(knop);
  }
  rij.appendChild(knoppen);
  return rij;
}

function maakSetRegel(oefening, set, oefeningIndex, setIndex) {
  const regel = document.createElement("div");
  regel.className = `set${set.status === "gedaan" ? " gedaan" : ""}${set.status === "overgeslagen" ? " overgeslagen" : ""}`;

  const nummer = document.createElement("span");
  nummer.className = "setnummer";
  nummer.textContent = String(setIndex + 1);

  const vink = maakKnop("✓", "vink", set.status === "gedaan" ? "Set weer openzetten" : "Set afvinken");
  vink.addEventListener("click", () => {
    const wordtGedaan = set.status !== "gedaan";
    set.status = wordtGedaan ? "gedaan" : "open";
    bewaarEnRender();
    if (wordtGedaan && oefening.rust_sec > 0) startTimer(oefening.rust_sec);
  });

  const waarden = document.createElement("div");
  waarden.className = "waarden";
  const keer = document.createElement("span");
  keer.className = "eenheid";
  keer.textContent = "×";
  waarden.append(maakKgStepper(oefening, set), keer, maakInvoer(set, "reps", "reps"));

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
      bewaarEnRender();
    });
  }

  regel.append(nummer, vink, waarden, actie);
  return regel;
}

function maakKgStepper(oefening, set) {
  const groep = document.createElement("div");
  groep.className = "kg-stepper";
  const stap = Number.isFinite(oefening.stap_kg) && oefening.stap_kg > 0 ? oefening.stap_kg : 2.5;

  const pasAan = (richting) => {
    const basis = Number.isFinite(set.kg) ? set.kg : (set.gepland_kg ?? 0);
    set.kg = Math.max(0, Math.round((basis + richting * stap) * 100) / 100);
    bewaarEnRender();
  };

  const minKnop = maakKnop("−", "stap", `${stap} kg minder`);
  minKnop.addEventListener("click", () => pasAan(-1));
  const plusKnop = maakKnop("+", "stap", `${stap} kg meer`);
  plusKnop.addEventListener("click", () => pasAan(1));
  const uitgeschakeld = set.status === "overgeslagen";
  minKnop.disabled = uitgeschakeld;
  plusKnop.disabled = uitgeschakeld;

  groep.append(minKnop, maakInvoer(set, "kg", "kg"), plusKnop);
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
  });
  if (!opgeslagen) {
    toonLogMelding("Het concept kan niet lokaal worden bewaard. Maak opslagruimte vrij voordat je verdergaat.");
  }
}

function startTimer(seconden) {
  stopTimer();
  timerEinde = Date.now() + seconden * 1000;
  elementen.timer.classList.remove("verborgen");
  elementen.timer.querySelector(".timer-label").textContent = "Rust";
  werkTimerBij();
  timerInterval = window.setInterval(werkTimerBij, 250);
}

function werkTimerBij() {
  const resterend = Math.max(0, Math.ceil((timerEinde - Date.now()) / 1000));
  elementen.timerTijd.textContent = `${Math.floor(resterend / 60)}:${String(resterend % 60).padStart(2, "0")}`;
  if (resterend === 0) {
    window.clearInterval(timerInterval);
    timerInterval = null;
    elementen.timer.querySelector(".timer-label").textContent = "Rust voorbij";
    piep();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  }
}

function verlengTimer(seconden) {
  if (!timerEinde) return;
  timerEinde = Math.max(Date.now(), timerEinde) + seconden * 1000;
  elementen.timer.querySelector(".timer-label").textContent = "Rust";
  if (!timerInterval) timerInterval = window.setInterval(werkTimerBij, 250);
  werkTimerBij();
}

function stopTimer() {
  window.clearInterval(timerInterval);
  timerInterval = null;
  timerEinde = null;
  elementen.timer.classList.add("verborgen");
}

// iOS ondersteunt navigator.vibrate niet; een korte dubbele piep is daar het signaal.
let audioContext = null;
function initAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!audioContext && Context) audioContext = new Context();
  if (audioContext?.state === "suspended") audioContext.resume();
}

function piep() {
  if (!audioContext || audioContext.state !== "running") return;
  try {
    const nu = audioContext.currentTime;
    [0, 0.35].forEach((offset) => {
      const toon = audioContext.createOscillator();
      const volume = audioContext.createGain();
      toon.frequency.value = 880;
      volume.gain.setValueAtTime(0.0001, nu + offset);
      volume.gain.exponentialRampToValueAtTime(0.4, nu + offset + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, nu + offset + 0.28);
      toon.connect(volume).connect(audioContext.destination);
      toon.start(nu + offset);
      toon.stop(nu + offset + 0.3);
    });
  } catch {
    // Geluid is best effort; de timer toont "Rust voorbij" hoe dan ook.
  }
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
  elementen.resultaatStatus.textContent = "Veilig lokaal opgeslagen; synchronisatie wordt geprobeerd.";
  elementen.logscherm.classList.add("verborgen");
  elementen.resultaat.classList.remove("verborgen");
  elementen.logActies.classList.add("verborgen");
  werkSyncStatusBij();
  await synchroniseerWachtrij();
  bezigMetAfronden = false;
}

async function startNieuweSessie() {
  elementen.sessieJson.textContent = "";
  elementen.resultaatStatus.textContent = "";
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
  return {
    versie: 1,
    datum: gestart.slice(0, 10),
    gestart,
    afgerond,
    plan_van: plan.gepland_op,
    naam: plan.naam,
    notitie: elementen.sessieNotitie.value.trim(),
    oefeningen: plan.oefeningen.map((oefening) => {
      const resultaat = {
        naam: oefening.naam.trim(),
        sets: oefening.sets.map(maakContractSet),
      };
      if (oefening.vervangen_van) resultaat.vervangen_van = oefening.vervangen_van;
      const laatsteGedaan = [...resultaat.sets].reverse().find((set) => set.gedaan);
      if (Number.isFinite(oefening.rpe) && laatsteGedaan) laatsteGedaan.rpe = oefening.rpe;
      return resultaat;
    }),
  };
}

function maakContractSet(set) {
  const resultaat = {};
  if (Object.hasOwn(set, "gepland_kg")) resultaat.gepland_kg = set.gepland_kg;
  if (Object.hasOwn(set, "gepland_reps")) resultaat.gepland_reps = set.gepland_reps;
  if (set.status === "gedaan") {
    resultaat.kg = set.kg;
    resultaat.reps = set.reps;
    resultaat.gedaan = true;
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
  werkSyncStatusBij();
  try {
    let wachtrij = leesWachtrij();
    while (wachtrij.length > 0) {
      const item = wachtrij[0];
      await uploadSessie(item, instellingen);
      wachtrij = leesWachtrij().filter((huidig) => huidig.id !== item.id);
      schrijfJsonOfGooi(OPSLAG.wachtrij, wachtrij);
    }
    zetBasisSyncStatus("Alles gesynchroniseerd", "goed");
    elementen.resultaatStatus.textContent = "Gesynchroniseerd met workout-data.";
  } catch (fout) {
    zetBasisSyncStatus(navigator.onLine ? "Sync mislukt · later opnieuw" : "Offline · later opnieuw", "fout");
    if (!elementen.resultaat.classList.contains("verborgen")) {
      elementen.resultaatStatus.textContent = "Lokaal veilig; synchronisatie volgt automatisch zodra het lukt.";
    }
    console.warn("Synchronisatie mislukt:", veiligeFoutmelding(fout));
  } finally {
    synchronisatieBezig = false;
    werkSyncStatusBij();
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

function openInstellingen() {
  elementen.logscherm.classList.add("verborgen");
  elementen.resultaat.classList.add("verborgen");
  elementen.logActies.classList.add("verborgen");
  elementen.instellingen.classList.remove("verborgen");
  elementen.githubOwner.focus();
}

function sluitInstellingen() {
  elementen.instellingen.classList.add("verborgen");
  if (elementen.sessieJson.textContent) {
    elementen.resultaat.classList.remove("verborgen");
  } else {
    elementen.logscherm.classList.remove("verborgen");
    elementen.logActies.classList.remove("verborgen");
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

async function leesContentsAntwoord(antwoord) {
  const gegevens = await antwoord.json();
  if (typeof gegevens.content !== "string" || gegevens.encoding !== "base64") {
    throw new Error("GitHub gaf geen leesbare bestandsinhoud terug.");
  }
  return JSON.parse(base64NaarTekst(gegevens.content));
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
    elementen.syncStatus.textContent = `${aantal} sessie${aantal === 1 ? "" : "s"} wacht${aantal === 1 ? "" : "en"} op sync`;
    elementen.syncStatus.dataset.soort = "wacht";
  } else {
    elementen.syncStatus.textContent = basisSyncStatus.tekst;
    elementen.syncStatus.dataset.soort = basisSyncStatus.soort;
  }
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
