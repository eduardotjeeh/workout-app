// Skelet (W1): toont het plan, sets afvinken en kg/reps aanpassen, simpele rusttimer.
// GitHub-sync en offline-wachtrij volgen in W2; zie ARCHITECTUUR.md voor het contract.

let plan = null;
let timerInterval = null;

async function init() {
  const res = await fetch("voorbeeld-plan.json");
  plan = await res.json();
  document.getElementById("plan-naam").textContent = plan.naam;
  document.getElementById("plan-notitie").textContent = plan.notitie ?? "";
  render();
}

function render() {
  const main = document.getElementById("oefeningen");
  main.innerHTML = "";
  plan.oefeningen.forEach((oef, oi) => {
    const kaart = document.createElement("section");
    kaart.className = "oefening";
    kaart.innerHTML = `<h2>${oef.naam}</h2>` +
      (oef.notitie ? `<p class="notitie">${oef.notitie}</p>` : "");
    oef.sets.forEach((set, si) => {
      kaart.appendChild(maakSetRegel(oef, set, oi, si));
    });
    main.appendChild(kaart);
  });
}

function maakSetRegel(oef, set, oi, si) {
  const regel = document.createElement("div");
  regel.className = "set" + (set.gedaan ? " gedaan" : "");

  const vink = document.createElement("button");
  vink.className = "vink";
  vink.textContent = "✓";
  vink.addEventListener("click", () => {
    set.gedaan = !set.gedaan;
    regel.classList.toggle("gedaan", set.gedaan);
    if (set.gedaan && oef.rust_sec) startTimer(oef.rust_sec);
  });

  const waarden = document.createElement("div");
  waarden.className = "waarden";
  waarden.append(
    maakInvoer(set, "kg", "kg"),
    maakInvoer(set, "reps", "×"),
  );

  regel.append(vink, waarden);
  return regel;
}

function maakInvoer(set, veld, eenheid) {
  const wrap = document.createElement("span");
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "decimal";
  input.value = set[veld];
  input.addEventListener("change", () => { set[veld] = Number(input.value); });
  const label = document.createElement("span");
  label.className = "eenheid";
  label.textContent = eenheid;
  wrap.append(input, label);
  return wrap;
}

function startTimer(seconden) {
  clearInterval(timerInterval);
  const el = document.getElementById("timer");
  const tijd = document.getElementById("timer-tijd");
  el.classList.remove("verborgen");
  let rest = seconden;
  const tik = () => {
    tijd.textContent = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}`;
    if (rest <= 0) { stopTimer(); if (navigator.vibrate) navigator.vibrate(300); }
    rest--;
  };
  tik();
  timerInterval = setInterval(tik, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  document.getElementById("timer").classList.add("verborgen");
}

document.getElementById("timer-stop").addEventListener("click", stopTimer);
document.getElementById("afronden").addEventListener("click", () => {
  // W1/W2: sessie-JSON bouwen conform contract en syncen. Voor nu: toon de stand.
  alert("Sessie-opslag komt in W2. Huidige stand:\n" + JSON.stringify(plan, null, 2).slice(0, 500));
});

init();
