// Script/Javascript/payments.js
import {
  getFirebaseApp,
  // Auth
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  // Firestore
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc, serverTimestamp, query, where, orderBy
} from "./firebase-config.js";

import { getDocs } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";


const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* ──────────────────────────────────────────────────────────────
   State & DOM
   ────────────────────────────────────────────────────────────── */
let currentUser = null;

let bills = [];        // {id, beneficiary, amountTotal, paidAmount, inParts, partsCount, partAmount, lastPartAmount, ...}
let incomes = [];      // (filtered by selected month)
let fixedCosts = [];   // all fixed costs; filtered client-side by month

let selectedBillId = null;
let selectedPartIndex = null; // for parts (legacy single)
let selectedMonth = (new Date()).toISOString().slice(0, 7); // YYYY-MM

// Multi-select basket
let selected = new Map(); // key=billId, value={billId, instalmentId|null, amount, label}
let partChoice = new Map(); // billId -> instalment object (id,index,amount)


// DOM
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");

const billsBody = document.getElementById("billsBody");
const newBillBtn = document.getElementById("newBillBtn");
const addIncomeBtn = document.getElementById("addIncomeBtn");
const fixedCostsBtn = document.getElementById("fixedCostsBtn");

const monthPicker = document.getElementById("monthPicker");
const incomeList = document.getElementById("incomeList");
const fixedList = document.getElementById("fixedList");
const incomeTotal = document.getElementById("incomeTotal");
const fixedTotal = document.getElementById("fixedTotal");
const selectedPaymentBox = document.getElementById("selectedPaymentBox"); // legacy
const selectedList = document.getElementById("selectedList");
const selTotal = document.getElementById("selTotal");
const payReviewBtn = document.getElementById("payReviewBtn");
const clearSelectedBtn = document.getElementById("clearSelectedBtn");

const sumIncome = document.getElementById("sumIncome");
const sumFixed = document.getElementById("sumFixed");
const sumToPay = document.getElementById("sumToPay");
const sumDiff = document.getElementById("sumDiff");

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
const fmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
function euro(n) { return fmt.format(Number(n || 0)); }
function clamp2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function monthKey(d) {
  if (typeof d === "string" && /^\d{4}-\d{2}$/.test(d)) return d;
  const dt = (d instanceof Date) ? d : new Date();
  return dt.toISOString().slice(0, 7);
}

function renderAll() {
  renderBills();
  renderSidebar();
}

/* ──────────────────────────────────────────────────────────────
   Auth
   ────────────────────────────────────────────────────────────── */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    appDiv && (appDiv.style.display = "none");
    authDiv && (authDiv.style.display = "block");
    return;
  }
  currentUser = user;
  authDiv && (authDiv.style.display = "none");
  appDiv && (appDiv.style.display = "block");

  // Streams
  onSnapshot(query(collection(db, "bills"), orderBy("createdAt", "desc")), snap => {
    bills = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBills();
  });

  onSnapshot(query(collection(db, "incomes")), snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    incomes = all.filter(x => x.month === selectedMonth);
    renderSidebar();
  });

  onSnapshot(query(collection(db, "fixedCosts")), snap => {
    fixedCosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSidebar();
  });

  monthPicker.value = selectedMonth;
});

/* ──────────────────────────────────────────────────────────────
   Bills table
   ────────────────────────────────────────────────────────────── */


function renderBills() {
  if (!billsBody) return;
  billsBody.innerHTML = "";
  const open = bills.filter(b => (Number(b.amountTotal || 0) - Number(b.paidAmount || 0)) > 0);

  if (!open.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Geen openstaande betalingen.";
    tr.appendChild(td);
    billsBody.appendChild(tr);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const b of open) {
    const tr = document.createElement("tr");
    tr.dataset.id = b.id;

    const tdName = document.createElement("td");
    tdName.textContent = b.beneficiary || "(zonder naam)";

    const remaining = clamp2(Number(b.amountTotal || 0) - Number(b.paidAmount || 0));
    const tdToPay = document.createElement("td");
    tdToPay.textContent = euro(remaining);

    const tdPaid = document.createElement("td");
    tdPaid.textContent = euro(Number(b.paidAmount || 0));

    const tdDue = document.createElement("td");
    if (b.dueDate) {
      const overdue = b.dueDate < today && remaining > 0;
      tdDue.textContent = b.dueDate;
      if (overdue) tdDue.classList.add("date-overdue");
    } else {
      tdDue.textContent = "—";
    }

    const tdAct = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "Reeds betaald";
    btn.onclick = (e) => { e.stopPropagation(); settleAsFull(b.id); };
    tdAct.appendChild(btn);

    const tdSel = document.createElement("td");
    tdSel.style.textAlign = "center";
    if (b.inParts) {
      // expander caret
      const caret = document.createElement("button");
      caret.className = "caret-btn";
      caret.title = "Toon delen";
      caret.textContent = "▸";
      caret.onclick = (e) => { e.stopPropagation(); toggleExpander(b.id); caret.textContent = (caret.textContent === "▸" ? "▾" : "▸"); };
      tdSel.appendChild(caret);
    } else {
      // single: checkbox to select full remaining
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const key = `${b.id}::FULL`;
      cb.checked = selected.has(key);
      cb.onchange = (e) => {
        if (cb.checked) {
          selected.set(key, { type: "full", billId: b.id, instalmentId: null, amount: remaining, label: `${b.beneficiary}`, iban: b.iban || "", note: "" });
        } else {
          selected.delete(key);
        }
        renderSelectedList();
        sumToPay.textContent = euro(totalSelected());
        recalcDiff();
      };
      tdSel.appendChild(cb);
    }

    tr.append(tdName, tdToPay, tdPaid, tdDue, tdAct, tdSel);
    billsBody.appendChild(tr);

    // Expander row for inParts
    if (b.inParts) {
      const expTr = document.createElement("tr");
      expTr.className = "expander-row";
      const td = document.createElement("td");
      td.colSpan = 6;
      const exp = document.createElement("div");
      exp.className = "expander";
      exp.id = `exp-${b.id}`;
      exp.innerHTML = `<div class="muted">Laden…</div>`;
      td.appendChild(exp);
      expTr.appendChild(td);
      billsBody.appendChild(expTr);

      // Clicking on name toggles expander
      tdName.style.cursor = "pointer";
      tdName.onclick = (e) => { e.stopPropagation(); toggleExpander(b.id); };
    }
  }
}

/* ──────────────────────────────────────────────────────────────
   Right side summary
   ────────────────────────────────────────────────────────────── */
function renderSidebar() {
  // month lists
  const month = selectedMonth;
  const incomeRows = incomes
    .filter(x => x.month === month)
    .map(x => row(x.source === "Andere" ? (x.note || "Andere") : x.source, x.amount));
  incomeList.innerHTML = incomeRows.join("") || `<div class="muted">Geen inkomsten voor deze maand.</div>`;

  const fixedRows = fixedCosts
    .filter(x => x.startMonth <= month && (!x.endMonth || x.endMonth >= month))
    .map(x => row(x.name, x.amount));
  fixedList.innerHTML = fixedRows.join("") || `<div class="muted">Geen vaste kosten voor deze maand.</div>`;

  const incSum = clamp2(incomes.filter(x => x.month === month).reduce((s, x) => s + Number(x.amount || 0), 0));
  const fixSum = clamp2(fixedCosts.filter(x => x.startMonth <= month && (!x.endMonth || x.endMonth >= month))
    .reduce((s, x) => s + Number(x.amount || 0), 0));

  incomeTotal.textContent = euro(incSum);
  fixedTotal.textContent = euro(fixSum);
  sumIncome.textContent = euro(incSum);
  sumFixed.textContent = euro(fixSum);

  // selected payment
  renderSelectedBox();
}

function row(label, amount) {
  return `<div class="row"><span>${escapeHtml(String(label || ""))}</span><strong>${euro(amount)}</strong></div>`;
}

function renderSelectedBox() {
  if (!selectedPaymentBox) return;
  if (!selectedBillId) { selectedPaymentBox.innerHTML = `<p class="muted">Selecteer een rekening in de tabel.</p>`; sumToPay.textContent = euro(0); recalcDiff(); return; }
  const b = bills.find(x => x.id === selectedBillId);
  if (!b) { selectedPaymentBox.innerHTML = `<p class="muted">Rekening niet gevonden.</p>`; sumToPay.textContent = euro(0); recalcDiff(); return; }

  const remaining = clamp2(Number(b.amountTotal || 0) - Number(b.paidAmount || 0));
  const next = b.inParts ? clamp2(b.partAmount || 0) : remaining;
  const lastPart = b.inParts ? clamp2(b.lastPartAmount || 0) : null;
  const hint = (b.inParts && lastPart && remaining <= lastPart) ? ` (laatste deel: ${euro(lastPart)})` : "";

  selectedPartIndex = null; // reset
  selectedPaymentBox.innerHTML = `
    <div><strong>${escapeHtml(b.beneficiary || "(zonder naam)")}</strong></div>
    <div class="hint">Openstaand: ${euro(remaining)}</div>
    <div style="margin-top:.4rem;display:grid;gap:.35rem;">
      <button class="primary" id="selectedPayBtn">Betalen…</button>
      <div class="muted">Standaard wordt ${b.inParts ? "één deel" : "het restbedrag"} voorgesteld.${hint}</div>
    </div>
  `;
  document.getElementById("selectedPayBtn").onclick = () => openPayModal(b.id);
  sumToPay.textContent = euro(b.inParts ? Math.min(remaining, next) : remaining);
  recalcDiff();
}

function recalcDiff() {
  const inc = parseEuro(sumIncome.textContent);
  const fix = parseEuro(sumFixed.textContent);
  const pay = parseEuro(sumToPay.textContent);
  const diff = clamp2(inc - fix - pay);
  sumDiff.textContent = euro(diff);
}
function parseEuro(s) {
  // very naive; relies on euro() output
  const n = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(n || 0);
}


/* ──────────────────────────────────────────────────────────────
   Multi-select helpers
   ────────────────────────────────────────────────────────────── */
function totalSelected() {
  let s = 0;
  for (const it of selected.values()) s += Number(it.amount || 0);
  return clamp2(s);
}




function renderSelectedList() {
  if (!selectedList) return;
  if (selected.size === 0) {
    selectedList.innerHTML = `<div class="selectedList-empty">Nog geen geselecteerde betalingen. Vink items aan in de tabel of vink delen aan in de expander.</div>`;
  } else {
    selectedList.innerHTML = "";
    for (const [key, it] of selected.entries()) {
      const row = document.createElement("div");
      row.className = "row";
      const left = document.createElement("div");
      left.textContent = it.label;
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = ".4rem";
      const amt = document.createElement("strong");
      amt.textContent = euro(it.amount);
      const x = document.createElement("button");
      x.className = "ghost";
      x.textContent = "✕";
      x.title = "Verwijder uit selectie";
      x.onclick = () => {
        selected.delete(key);
        if (it.type === "full") {
          const cb = billsBody.querySelector(`tr[data-id="${it.billId}"] input[type="checkbox"]`);
          if (cb) cb.checked = false;
        }
        renderSelectedList();
        sumToPay.textContent = euro(totalSelected());
        recalcDiff();
      };
      right.append(amt, x);
      row.append(left, right);
      selectedList.appendChild(row);
    }
  }
  selTotal && (selTotal.textContent = euro(totalSelected()));
}



async function toggleExpander(billId, forceOpen) {
  const exp = document.getElementById(`exp-${billId}`);
  if (!exp) return;
  const open = exp.classList.contains("open");
  if (forceOpen === true && open) { /*no-op*/ }
  else if (forceOpen === false && !open) { /*no-op*/ }
  else { exp.classList.toggle("open"); }
  if (!exp.classList.contains("open")) return;

  const items = await fetchOpenInstalments(billId);
  if (!items.length) { exp.innerHTML = `<div class="muted">Geen openstaande delen.</div>`; return; }

  const list = document.createElement("div");
  list.className = "list";
  items.forEach(it => {
    const key = `${billId}::${it.id}`;
    const row = document.createElement("label");
    row.className = "row";
    row.innerHTML = `<div><input type="checkbox" value="${it.id}" ${selected.has(key) ? 'checked' : ''} style="margin-right:.5rem;">Deel ${it.index}</div><strong>${euro(it.amount)}</strong>`;
    list.appendChild(row);
  });

  list.addEventListener("change", (e) => {
    const input = e.target.closest('input[type="checkbox"]');
    if (!input) return;
    const partId = input.value;
    const it = items.find(x => x.id === partId);
    const b = bills.find(x => x.id === billId);
    const key = `${billId}::${partId}`;
    if (input.checked) {
      selected.set(key, { type: "part", billId, instalmentId: partId, amount: clamp2(it.amount), label: `${b?.beneficiary || ""} – deel ${it.index}`, iban: b?.iban || "", note: "" });
    } else {
      selected.delete(key);
    }
    renderSelectedList();
    sumToPay.textContent = euro(totalSelected());
    recalcDiff();
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  const tip = document.createElement("div");
  tip.className = "muted";
  tip.textContent = "Vink één of meerdere delen aan om toe te voegen aan de selectie.";
  actions.appendChild(tip);

  exp.innerHTML = "";
  exp.appendChild(list);
  exp.appendChild(actions);
}


async function fetchOpenInstalments(billId) {
  const snap = await getDocs(query(collection(db, `bills/${billId}/instalments`), where("status", "==", "open"), orderBy("index", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}


if (!exp.classList.contains("open")) return;

const items = await fetchOpenInstalments(billId);
if (!items.length) {
  exp.innerHTML = `<div class="muted">Geen openstaande delen.</div>`;
  return;
}
const chosen = partChoice.get(billId)?.id || items[0].id;
const list = document.createElement("div");
list.className = "list";
items.forEach(it => {
  const lab = document.createElement("label");
  lab.className = "row";
  lab.innerHTML = `<div><input type="radio" name="part-${billId}" value="${it.id}" ${it.id === chosen ? 'checked' : ''} style="margin-right:.5rem;">Deel ${it.index}</div><strong>${euro(it.amount)}</strong>`;
  list.appendChild(lab);
});
list.addEventListener("change", (e) => {
  const r = exp.querySelector('input[type="radio"]:checked');
  if (!r) return;
  const it = items.find(x => x.id === r.value);
  if (it) {
    partChoice.set(billId, it);
    if (selected.has(billId)) {
      const b = bills.find(x => x.id === billId);
      selected.set(billId, { billId, instalmentId: it.id, amount: clamp2(it.amount), label: `${b?.beneficiary || ""} – deel ${it.index}` });
      renderSelectedList();
      sumToPay.textContent = euro(totalSelected());
      recalcDiff();
    }
  }
});

const actions = document.createElement("div");
actions.className = "actions";
const addBtn = document.createElement("button");
addBtn.className = "primary";
addBtn.textContent = selected.has(billId) ? "Bijgewerkt" : "Voeg toe aan selectie";
/* ──────────────────────────────────────────────────────────────
 Month picker
 ────────────────────────────────────────────────────────────── */
monthPicker && (monthPicker.onchange = () => {
  selectedMonth = monthKey(monthPicker.value);
  // incomes stream already loaded; filter client-side
  onMonthChanged();
});
function onMonthChanged() {
  // recompute filtered incomes + fixed
  renderSidebar();
}

/* ──────────────────────────────────────────────────────────────
   Modals: Nieuwe rekening
   ────────────────────────────────────────────────────────────── */
newBillBtn && (newBillBtn.onclick = () => {
  openBillModal();
});

function openBillModal() {
  // reset inputs
  const iban = document.getElementById("bill-iban");
  const ben = document.getElementById("bill-beneficiary");
  const comm = document.getElementById("bill-comm");
  const desc = document.getElementById("bill-desc");
  const amount = document.getElementById("bill-amount");
  const due = document.getElementById("bill-due");
  const inparts = document.getElementById("bill-inparts");
  const parts = document.getElementById("bill-parts");
  const partsWrap = document.getElementById("partsCountWrap");
  const info = document.getElementById("partsInfo");
  const perPart = document.getElementById("perPart");
  const lastHint = document.getElementById("lastPartHint");

  [iban, ben, comm, desc, amount, due].forEach(el => el && (el.value = ""));
  inparts.checked = false;
  parts.value = 2;
  partsWrap.hidden = true;
  info.style.display = "none";
  perPart.textContent = euro(0);
  lastHint.textContent = "";

  function recalc() {
    const tot = clamp2(amount.value);
    if (!inparts.checked || !tot || !Number(parts.value)) { info.style.display = "none"; return; }
    const n = Math.max(2, parseInt(parts.value, 10) || 2);
    const raw = clamp2(tot / n);
    const last = clamp2(tot - raw * (n - 1));
    perPart.textContent = euro(raw);
    lastHint.textContent = last !== raw ? ` (laatste betaling: ${euro(last)})` : "";
    info.style.display = "block";
  }

  inparts.onchange = () => { partsWrap.hidden = !inparts.checked; recalc(); };
  amount.oninput = recalc;
  parts.oninput = recalc;

  document.getElementById("bill-save").onclick = async () => {
    const payload = {
      uid: currentUser?.uid || null,
      iban: (iban.value || "").trim(),
      beneficiary: (ben.value || "").trim(),
      communication: (comm.value || "").trim(),
      description: (desc.value || "").trim(),
      amountTotal: clamp2(amount.value),
      dueDate: (due.value || null),
      inParts: !!inparts.checked,
      partsCount: inparts.checked ? Math.max(2, parseInt(parts.value, 10) || 2) : 1,
      createdAt: serverTimestamp(),
      paidAmount: 0
    };
    if (!payload.beneficiary || !payload.amountTotal) {
      Modal.alert({ title: "Ontbrekende velden", html: "Vul minstens begunstigde en bedrag in." });
      return;
    }

    // compute part amounts for preview + persistence
    if (payload.inParts) {
      const per = clamp2(payload.amountTotal / payload.partsCount);
      const last = clamp2(payload.amountTotal - per * (payload.partsCount - 1));
      payload.partAmount = per;
      payload.lastPartAmount = last;
    }

    try {
      const ref = await addDoc(collection(db, "bills"), payload);
      // create instalments
      const count = payload.partsCount || 1;
      const per = payload.inParts ? (payload.partAmount || 0) : payload.amountTotal;
      for (let i = 1; i <= count; i++) {
        const amt = payload.inParts ? (i === count ? payload.lastPartAmount : per) : per;
        await addDoc(collection(db, `bills/${ref.id}/instalments`), {
          index: i, amount: amt, status: "open", paidAt: null, createdAt: serverTimestamp()
        });
      }
      Modal.close("modal-bill");
    } catch (e) {
      console.error(e);
      Modal.alert({ title: "Opslaan mislukt", html: "Kon de rekening niet opslaan." });
    }
  };

  Modal.open("modal-bill");
}

/* ──────────────────────────────────────────────────────────────
   Modals: Inkomsten
   ────────────────────────────────────────────────────────────── */
addIncomeBtn && (addIncomeBtn.onclick = () => {
  const src = document.getElementById("income-source");
  const noteWrap = document.getElementById("income-note-wrap");
  const note = document.getElementById("income-note");
  const amt = document.getElementById("income-amount");
  const mon = document.getElementById("income-month");

  src.value = "Jo"; note.value = ""; amt.value = ""; mon.value = selectedMonth;
  noteWrap.hidden = true;

  src.onchange = () => { noteWrap.hidden = (src.value !== "Andere"); };

  document.getElementById("income-save").onclick = async () => {
    const payload = {
      uid: currentUser?.uid || null,
      source: src.value,
      note: (note.value || "").trim(),
      amount: clamp2(amt.value),
      month: monthKey(mon.value),
      createdAt: serverTimestamp()
    };
    if (!payload.amount || !payload.month) {
      Modal.alert({ title: "Ontbrekende velden", html: "Vul minstens bedrag en maand in." });
      return;
    }
    await addDoc(collection(db, "incomes"), payload);
    Modal.close("modal-income");
  };

  Modal.open("modal-income");
});

/* ──────────────────────────────────────────────────────────────
   Modals: Vaste kosten
   ────────────────────────────────────────────────────────────── */
fixedCostsBtn && (fixedCostsBtn.onclick = () => openFixedModal());

async function openFixedModal() {
  // render list
  const list = document.getElementById("fixedListModal");
  list.innerHTML = (fixedCosts.length ? "" : `<div class="muted">Nog geen vaste kosten.</div>`);
  for (const f of fixedCosts) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${escapeHtml(f.name || "")}</span><strong>${euro(f.amount)}</strong>`;
    list.appendChild(row);
  }

  document.getElementById("fixed-name").value = "";
  document.getElementById("fixed-amount").value = "";
  document.getElementById("fixed-start").value = selectedMonth;
  document.getElementById("fixed-end").value = "";

  document.getElementById("fixed-save").onclick = async () => {
    const name = (document.getElementById("fixed-name").value || "").trim();
    const amount = clamp2(document.getElementById("fixed-amount").value);
    const start = monthKey(document.getElementById("fixed-start").value);
    const endRaw = document.getElementById("fixed-end").value;
    const end = endRaw ? monthKey(endRaw) : null;
    if (!name || !amount || !start) { Modal.alert({ title: "Ontbrekende velden", html: "Vul naam, bedrag en startmaand in." }); return; }
    await addDoc(collection(db, "fixedCosts"), { uid: currentUser?.uid || null, name, amount, startMonth: start, endMonth: end, createdAt: serverTimestamp() });
    Modal.close("modal-fixed");
  };

  Modal.open("modal-fixed");
}

/* ──────────────────────────────────────────────────────────────
   Betalen
   ────────────────────────────────────────────────────────────── */
async function openPayModal(billId) {
  const b = bills.find(x => x.id === billId);
  if (!b) return;
  selectedBillId = billId;
  selectedPartIndex = null;

  const ctx = document.getElementById("payContext");
  ctx.innerHTML = `<div><strong>${escapeHtml(b.beneficiary || "")}</strong></div>
    <div>Openstaand: ${euro(clamp2(Number(b.amountTotal) - Number(b.paidAmount || 0)))}</div>`;

  const wrap = document.getElementById("payPartsWrap");
  wrap.innerHTML = "";

  if (b.inParts) {
    // fetch open parts
    const snap = await getDocs(query(collection(db, `bills/${billId}/instalments`), where("status", "==", "open"), orderBy("index", "asc")));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!items.length) {
      wrap.innerHTML = `<div class="muted">Geen openstaande delen.</div>`;
    } else {
      const list = document.createElement("div");
      list.className = "list";
      items.forEach(it => {
        const row = document.createElement("label");
        row.className = "row";
        row.innerHTML = `<div><input type="radio" name="part" value="${it.id}" style="margin-right:.5rem;">Deel ${it.index}</div><strong>${euro(it.amount)}</strong>`;
        list.appendChild(row);
      });
      wrap.appendChild(list);
      // default select first
      const firstRadio = list.querySelector('input[type="radio"]');
      if (firstRadio) { firstRadio.checked = true; selectedPartIndex = firstRadio.value; }
      list.addEventListener("change", (e) => {
        const r = e.target.closest('input[type="radio"]');
        if (r) selectedPartIndex = r.value;
      });
    }
  } else {
    wrap.innerHTML = `<div class="muted">Enkelvoudige betaling. Dit zal het volledige resterende bedrag markeren als betaald.</div>`;
  }

  // confirm handler
  document.getElementById("pay-confirm").onclick = async () => {
    try {
      if (b.inParts) {
        if (!selectedPartIndex) { Modal.alert({ title: "Kies een deel", html: "Selecteer het deel dat je wil markeren als betaald." }); return; }
        // find selected instalment
        const partRef = doc(db, `bills/${billId}/instalments/${selectedPartIndex}`);
        const partSnap = await getDoc(partRef);
        if (!partSnap.exists()) { Modal.alert({ title: "Niet gevonden", html: "Het gekozen deel bestaat niet meer." }); return; }
        const part = partSnap.data();
        // mark paid + update bill totals
        await updateDoc(partRef, { status: "paid", paidAt: serverTimestamp() });
        await updateDoc(doc(db, "bills", billId), {
          paidAmount: clamp2(Number(b.paidAmount || 0) + Number(part.amount || 0))
        });
        await addDoc(collection(db, "transactions"), {
          uid: currentUser?.uid || null,
          billId, instalmentId: selectedPartIndex, amount: part.amount, at: serverTimestamp()
        });
      } else {
        const remaining = clamp2(Number(b.amountTotal || 0) - Number(b.paidAmount || 0));
        if (remaining <= 0) { Modal.close("modal-pay"); return; }
        await updateDoc(doc(db, "bills", billId), { paidAmount: clamp2(Number(b.paidAmount || 0) + remaining) });
        // ensure single instalment is marked as paid as well
        const partsSnap = await getDocs(collection(db, `bills/${billId}/instalments`));
        const open = partsSnap.docs.find(d => (d.data().status === "open"));
        if (open) await updateDoc(doc(db, `bills/${billId}/instalments/${open.id}`), { status: "paid", paidAt: serverTimestamp() });
        await addDoc(collection(db, "transactions"), {
          uid: currentUser?.uid || null,
          billId, instalmentId: open ? open.id : null, amount: remaining, at: serverTimestamp()
        });
      }
      Modal.close("modal-pay");
    } catch (e) {
      console.error(e);
      Modal.alert({ title: "Mislukt", html: "Markeren als betaald is niet gelukt." });
    }
  };

  Modal.open("modal-pay");
}

/* ──────────────────────────────────────────────────────────────
   Utils
   ────────────────────────────────────────────────────────────── */
function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}


/* ──────────────────────────────────────────────────────────────
   Historiek
   ────────────────────────────────────────────────────────────── */
const historyBtn = document.getElementById("historyBtn");
historyBtn && (historyBtn.onclick = async () => {
  const body = document.getElementById("historyBody");
  body.innerHTML = "";
  const snap = await getDocs(query(collection(db, "transactions"), orderBy("at", "desc")));
  const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  for (const tx of txs.slice(0, 200)) {
    // look up bill + instalment index (optional)
    let name = "";
    let idx = "";
    try {
      const b = await getDoc(doc(db, "bills", tx.billId));
      name = b.exists() ? (b.data().beneficiary || "") : "(onbekend)";
      if (tx.instalmentId) {
        const p = await getDoc(doc(db, `bills/${tx.billId}/instalments/${tx.instalmentId}`));
        idx = p.exists() ? String(p.data().index || "") : "";
      }
    } catch { }
    const tr = document.createElement("tr");
    const dt = tx.at?.seconds ? new Date(tx.at.seconds * 1000) : new Date();
    const dateStr = dt.toLocaleString("nl-BE");
    tr.innerHTML = `<td>${escapeHtml(dateStr)}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(idx)}</td><td>${euro(tx.amount)}</td>`;
    body.appendChild(tr);
  }
  Modal.open("modal-history");
});


/* ──────────────────────────────────────────────────────────────
   Betaal geselecteerde + leegmaken
   ────────────────────────────────────────────────────────────── */
clearSelectedBtn && (clearSelectedBtn.onclick = () => {
  selected.clear();
  // untick all checkboxes
  billsBody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  renderSelectedList();
  sumToPay.textContent = euro(0);
  recalcDiff();
});

/* ──────────────────────────────────────────────────────────────
   Betaaloverzicht (review modal)
   ────────────────────────────────────────────────────────────── */
payReviewBtn && (payReviewBtn.onclick = () => {
  const body = document.getElementById("reviewBody");
  body.innerHTML = "";
  for (const [key, it] of selected.entries()) {
    const tr = document.createElement("tr");
    const ben = document.createElement("td"); ben.textContent = it.label.split(" – ")[0] || "";
    const iban = document.createElement("td"); iban.textContent = it.iban || "";
    const amt = document.createElement("td"); amt.textContent = euro(it.amount);
    const note = document.createElement("td");
    const noteInput = document.createElement("input"); noteInput.type = "text"; noteInput.placeholder = "Opmerking…"; noteInput.value = it.note || "";
    note.appendChild(noteInput);
    const paidTd = document.createElement("td");
    const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = true;
    paidTd.appendChild(chk);

    tr.dataset.key = key;
    tr.append(ben, iban, amt, note, paidTd);
    body.appendChild(tr);
  }
  Modal.open("modal-review");
});

document.getElementById("review-confirm") && (document.getElementById("review-confirm").onclick = async () => {
  const rows = Array.from(document.querySelectorAll("#reviewBody tr"));
  if (!rows.length) { Modal.alert({ title: "Geen selectie", html: "Er staan geen items in het overzicht." }); return; }

  try {
    for (const tr of rows) {
      const key = tr.dataset.key;
      const paid = tr.querySelector('input[type="checkbox"]').checked;
      const note = tr.querySelector('input[type="text"]').value || "";
      if (!paid) continue;

      const it = selected.get(key);
      if (!it) continue;
      const b = bills.find(x => x.id === it.billId);
      if (!b) continue;

      if (it.type === "part") {
        const partRef = doc(db, `bills/${it.billId}/instalments/${it.instalmentId}`);
        await updateDoc(partRef, { status: "paid", paidAt: serverTimestamp() });
        await updateDoc(doc(db, "bills", it.billId), { paidAmount: clamp2(Number(b.paidAmount || 0) + Number(it.amount || 0)) });
        await addDoc(collection(db, "transactions"), { uid: currentUser?.uid || null, billId: it.billId, instalmentId: it.instalmentId, amount: it.amount, note, at: serverTimestamp() });
      } else {
        // full
        const remaining = clamp2(Number(b.amountTotal || 0) - Number(b.paidAmount || 0));
        if (remaining > 0) {
          await updateDoc(doc(db, "bills", it.billId), { paidAmount: clamp2(Number(b.paidAmount || 0) + remaining) });
          // mark all open instalments as paid
          const partsSnap = await getDocs(collection(db, `bills/${it.billId}/instalments`));
          for (const d of partsSnap.docs) {
            if (d.data().status === "open") {
              await updateDoc(doc(db, `bills/${it.billId}/instalments/${d.id}`), { status: "paid", paidAt: serverTimestamp() });
            }
          }
          await addDoc(collection(db, "transactions"), { uid: currentUser?.uid || null, billId: it.billId, instalmentId: null, amount: remaining, note, at: serverTimestamp() });
        }
      }
    }
    Modal.close("modal-review");
    // NIET leegmaken: selectie blijft staan zodat balans het effect toont
    Modal.toast && Modal.toast({ html: "Aangevinkte betalingen zijn gemarkeerd als betaald." });
  } catch (e) {
    console.error(e);
    Modal.alert({ title: "Mislukt", html: "Niet alle betalingen konden gemarkeerd worden." });
  }
});


async function settleAsFull(billId) {
  const b = bills.find(x => x.id === billId);
  if (!b) return;
  const remaining = clamp2(Number(b.amountTotal || 0) - Number(b.paidAmount || 0));
  if (remaining <= 0) return;
  // Reuse pay modal to confirm
  const ctx = document.getElementById("payContext");
  const wrap = document.getElementById("payPartsWrap");
  if (ctx && wrap) {
    ctx.innerHTML = `<div><strong>${escapeHtml(b.beneficiary || "")}</strong></div>
      <div>Openstaand: ${euro(remaining)}</div>`;
    wrap.innerHTML = `<div class="muted">Dit markeert het volledige resterende bedrag als betaald.</div>`;
    document.getElementById("pay-confirm").onclick = async () => {
      try {
        await updateDoc(doc(db, "bills", billId), { paidAmount: clamp2(Number(b.paidAmount || 0) + remaining) });
        // mark all open parts as paid
        const partsSnap = await getDocs(collection(db, `bills/${billId}/instalments`));
        for (const d of partsSnap.docs) {
          if (d.data().status === "open") {
            await updateDoc(doc(db, `bills/${billId}/instalments/${d.id}`), { status: "paid", paidAt: serverTimestamp() });
          }
        }
        await addDoc(collection(db, "transactions"), { uid: currentUser?.uid || null, billId, instalmentId: null, amount: remaining, at: serverTimestamp() });
        Modal.close("modal-pay");
      } catch (e) {
        console.error(e);
        Modal.alert({ title: "Mislukt", html: "Markeren als betaald is niet gelukt." });
      }
    };
    Modal.open("modal-pay");
  }
}
