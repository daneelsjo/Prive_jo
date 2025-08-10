// Script/Javascript/main.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

/** Firebase config */
const firebaseConfig = {
  apiKey: "AIzaSyDo_zVn_4H1uM7EU-LhQV5XOYBcJmZ0Y3o",
  authDomain: "prive-jo.firebaseapp.com",
  projectId: "prive-jo",
  storageBucket: "prive-jo.firebasestorage.app",
  messagingSenderId: "849510732758",
  appId: "1:849510732758:web:6c506a7f7adcc5c1310a77",
  measurementId: "G-HN213KC33L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* Elements */
const loginBtn = document.getElementById("login-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");

const newTaskBtn = document.getElementById("newTaskBtn");
const formContainer = document.getElementById("formContainer");
const addTodoBtn = document.getElementById("addTodo");

const nameInput = document.getElementById("name");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const categoryInput = document.getElementById("category");
const categoryList = document.getElementById("categoryList");
const descInput = document.getElementById("description");
const linkInput = document.getElementById("link");

const postits = document.getElementById("postits");
const uncategorizedList = document.getElementById("uncategorized-list");

const modeSwitchEl = document.getElementById("modeSwitch");

/* Modal (dynamisch aangemaakt) */
let _modalBackdrop = null;
let _modalCard = null;

let currentUser = null;
let allTodos = [];
let categories = []; // {id,name,type('werk'|'prive'),active}
let settings = {};   // { modeSlots:{werk[],prive[]}, preferredMode, theme }
let currentMode = "werk";

const fixedColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3",
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#00BCD4", "#009688", "#8BC34A", "#CDDC39",
  "#FFC107", "#FF9800", "#795548"
];

/* ---------- AUTH ---------- */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv && (authDiv.style.display = "none");
  appDiv && (appDiv.style.display = "block");

  await loadSettings();
  applyTheme(settings.theme || "system");

  if (modeSwitchEl) {
    modeSwitchEl.checked = (settings.preferredMode || "werk") === "prive";
    modeSwitchEl.onchange = () => setMode(modeSwitchEl.checked ? "prive" : "werk");
  }
  setMode(settings.preferredMode || "werk");

  listenCategories();
  listenTodos();
});

/* ---------- THEME ---------- */
function applyTheme(mode) {
  let final = mode;
  if (mode === "system") {
    final = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", final);
}

/* ---------- MODE ---------- */
function setMode(mode) {
  currentMode = mode;
  if (currentUser) {
    setDoc(doc(db, "settings", currentUser.uid), { preferredMode: mode }, { merge: true });
  }
  renderTodos();
}

/* ---------- LISTENERS ---------- */
function listenCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false);
    updateCategoryDatalist();
    renderTodos();
  });
}

function listenTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    allTodos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTodos();
  });
}

/* ---------- FORM ---------- */
newTaskBtn && (newTaskBtn.onclick = () => {
  formContainer.style.display = formContainer.style.display === "none" ? "block" : "none";
});

addTodoBtn && (addTodoBtn.onclick = async () => {
  const name = (nameInput.value || "").trim();
  const start = startInput.value || "";
  const end = endInput.value || "";
  const categoryRaw = (categoryInput.value || "").trim();
  const description = (descInput.value || "").trim();
  const link = (linkInput.value || "").trim();
  if (!name) return alert("Vul een taaknaam in.");

  const { categoryId, categoryName } = parseCategoryInput(categoryRaw);

  await addDoc(collection(db, "todos"), {
    name, start, end,
    categoryId,               // id als 'Naam (type)' gekozen werd
    category: categoryName,   // naam (ook voor vrije tekst)
    description, link,
    done: false
  });

  nameInput.value = ""; startInput.value = ""; endInput.value = "";
  categoryInput.value = ""; descInput.value = ""; linkInput.value = "";
  formContainer.style.display = "none";
});

/* "Naam (type)" → id + naam */
function parseCategoryInput(value) {
  if (!value) return { categoryId: null, categoryName: "" };
  const m = value.match(/^(.*)\s+\((werk|prive)\)$/i);
  if (m) {
    const name = m[1].trim(), type = m[2].toLowerCase();
    const cat = categories.find(c => c.name === name && c.type === type);
    if (cat) return { categoryId: cat.id, categoryName: cat.name };
  }
  return { categoryId: null, categoryName: value.trim() };
}

/* ---------- SETTINGS LADEN ---------- */
async function loadSettings() {
  const s = await getDoc(doc(db, "settings", currentUser.uid));
  settings = s.exists() ? (s.data() || {}) : {};
}

/* ---------- RENDER ---------- */
function renderTodos() {
  if (!settings.modeSlots) settings.modeSlots = {};
  const slots = settings.modeSlots[currentMode] || [];

  if (!postits) return;
  postits.innerHTML = "";

  // Filter op modus (of geen categorie → altijd tonen)
  const visibleTodos = allTodos.filter(t => {
    if (!t.categoryId) return true;
    const c = categories.find(x => x.id === t.categoryId);
    return !!c && c.type === currentMode;
  });

  // groepeer per categoryId
  const byCatId = visibleTodos.reduce((acc, t) => {
    const key = t.categoryId || "UNCAT";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  // 4 post‑its volgens slots
  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    if (!slot?.categoryId) continue;
    const catDoc = categories.find(c => c.id === slot.categoryId && c.type === currentMode);
    if (!catDoc) continue;

    const color = slot.color || fixedColors[i % fixedColors.length];
    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = color;
    box.style.color = getContrast(color);
    box.innerHTML = `<strong>${escapeHtml(catDoc.name)}</strong>`;

    (byCatId[slot.categoryId] || []).forEach(todo => {
      box.appendChild(buildTaskRow(todo));
    });

    postits.appendChild(box);
  }

  // Overige taken
  const slotCatIds = new Set(slots.map(s => s?.categoryId).filter(Boolean));
  const rest = [];
  Object.entries(byCatId).forEach(([key, list]) => {
    if (key === "UNCAT") { rest.push(...list); return; }
    if (!slotCatIds.has(key)) { rest.push(...list); }
  });

  if (uncategorizedList) {
    uncategorizedList.innerHTML = "";
    rest.forEach(todo => uncategorizedList.appendChild(buildTaskRow(todo, true)));
  }
}


/* ---- 1 taak-rij: checkbox links, compacte spacing ---- */
function buildTaskRow(todo, inRest = false) {
  const row = document.createElement("div");
  row.className = "task-row" + (todo.done ? " done" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!todo.done;

  cb.addEventListener("click", (e) => {
    e.stopPropagation();
    markDone(todo.id, !todo.done);
  });

  const text = document.createElement("span");
  text.className = "task-text";
  const dates = `(${todo.start || "?"} - ${todo.end || "?"})`;

  if (inRest) {
    const c = categories.find(x => x.id === todo.categoryId);
    const catName = c ? c.name : "geen";
    text.innerHTML = `${escapeHtml(todo.name)} ${dates} <small style="opacity:.7">(${escapeHtml(catName)})</small>`;
  } else {
    text.textContent = `${todo.name} ${dates}`;
  }

  row.appendChild(cb);
  row.appendChild(text);

  // Klik op de rij (maar niet op de checkbox) opent detail
  row.addEventListener("click", () => showTaskDetail(todo));

  return row;
}


/* ---------- MODAL helpers ---------- */
function ensureModal() {
  if (!_modalBackdrop) {
    _modalBackdrop = document.createElement("div");
    _modalBackdrop.className = "modal-backdrop";
    document.body.appendChild(_modalBackdrop);
  }
  if (!_modalCard) {
    _modalCard = document.createElement("div");
    _modalCard.className = "modal-card";
    _modalCard.innerHTML = `
      <div class="modal-header">
        <h3 id="modalTitle"></h3>
        <button class="modal-close" title="Sluiten" onclick="closeTaskDetail()">✕</button>
      </div>
      <div class="modal-body" id="modalBody"></div>
      <div class="modal-footer" id="modalFooter"></div>
    `;
    document.body.appendChild(_modalCard);
  }
}
function openModal() {
  ensureModal();
  _modalBackdrop.classList.add("open");
  _modalBackdrop.style.display = "block";
  _modalCard.style.display = "flex";
  _modalBackdrop.onclick = (e) => { if (e.target === _modalBackdrop) closeTaskDetail(); };
}
function closeModal() {
  if (_modalBackdrop) { _modalBackdrop.classList.remove("open"); _modalBackdrop.style.display = "none"; }
  if (_modalCard) { _modalCard.style.display = "none"; }
}

/* ---------- MODAL: open/close + acties ---------- */
window.showTaskDetail = function (todo) {
  openModal();

  const titleEl = _modalCard.querySelector("#modalTitle");
  const bodyEl = _modalCard.querySelector("#modalBody");
  // Datalist: toon ALLE opties bij focus
  const editCat = _modalCard.querySelector('#editCategory');
  if (editCat) {
    editCat.setAttribute('autocomplete', 'off');   // voorkomt autofill-storing
    editCat.placeholder = "Kies of typ...";

    editCat.addEventListener('focus', () => {
      // onthoud huidige waarde en leeg het veld → datalist toont alles
      editCat.dataset.prev = editCat.value;
      editCat.value = "";
      // trigger 'input' zodat sommige browsers meteen refreshen
      editCat.dispatchEvent(new Event('input', { bubbles: true }));
    });

    editCat.addEventListener('blur', () => {
      // als niets gekozen/ingetikt → zet oude waarde terug
      if (!editCat.value && editCat.dataset.prev) {
        editCat.value = editCat.dataset.prev;
      }
    });

    // Tip: pijl-omlaag opent de lijst expliciet
    editCat.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && editCat.showPicker) {
        // sommige browsers ondersteunen showPicker()
        editCat.showPicker();
      }
    });
  }

  const footEl = _modalCard.querySelector("#modalFooter");

  // Title
  titleEl.textContent = todo.name || "Taak";

  // Categorie-weergave "Naam (type)"
  let catDisplay = todo.category || "";
  if (todo.categoryId) {
    const cat = categories.find(c => c.id === todo.categoryId);
    if (cat) catDisplay = `${cat.name} (${cat.type})`;
  }

  // Body
  bodyEl.innerHTML = `
    <label>Start</label>
    <input id="editStart" type="date" value="${todo.start || ""}">
    <label>Einde</label>
    <input id="editEnd" type="date" value="${todo.end || ""}">
    <label>Categorie</label>
    <input id="editCategory" list="categoryList" value="${escapeHtml(catDisplay)}">
    <label>Omschrijving</label>
    <textarea id="editDesc">${todo.description ? escapeHtml(todo.description) : ""}</textarea>
    <label>Link</label>
    <input id="editLink" value="${todo.link ? escapeHtml(todo.link) : ""}">
  `;

  // Footer knoppen
  footEl.innerHTML = "";
  footEl.append(
    mkBtn("primary", "💾 Opslaan", () => saveTask(todo.id)),
    mkBtn("primary success", "✔️ Voltooid", () => completeTask(todo.id)),
    mkBtn("primary danger", "🗑️ Verwijderen", () => confirmDeleteTask(todo.id, todo.name))
  );
};

window.closeTaskDetail = function () { closeModal(); };

function mkBtn(cls, text, onClick) {
  const b = document.createElement("button");
  b.className = cls; b.textContent = text; b.onclick = onClick;
  return b;
}

/* Voltooien via knop */
async function completeTask(id) {
  await setDoc(doc(db, "todos", id), { done: true }, { merge: true });
  closeModal();
}

/* Opslaan uit modal */
window.saveTask = async function (id) {
  const raw = (document.getElementById("editCategory")?.value || "").trim();
  const { categoryId, categoryName } = parseCategoryInput(raw);
  const payload = {
    start: document.getElementById("editStart")?.value || "",
    end: document.getElementById("editEnd")?.value || "",
    categoryId,
    category: categoryName,
    description: (document.getElementById("editDesc")?.value || "").trim(),
    link: (document.getElementById("editLink")?.value || "").trim()
  };
  await setDoc(doc(db, "todos", id), payload, { merge: true });
  closeModal();
}

/* Mooie confirm in dezelfde modal-stijl */
async function confirmDeleteTask(id, name = "deze taak") {
  const ok = await askConfirm(
    "Taak verwijderen",
    `⚠️ OPGELET!<br>Ben je zeker dat je volgende taak wenst te verwijderen:<br><strong>“${escapeHtml(name)}”</strong>`
  );
  if (!ok) return;
  await deleteDoc(doc(db, "todos", id));
  closeModal();
}

/* Reusable confirm (Promise<boolean>) */
function askConfirm(title, html) {
  return new Promise((resolve) => {
    openModal();
    const titleEl = _modalCard.querySelector("#modalTitle");
    const bodyEl = _modalCard.querySelector("#modalBody");
    const footEl = _modalCard.querySelector("#modalFooter");

    titleEl.textContent = title;
    bodyEl.innerHTML = `<div style="padding-top:.3rem; text-align:center">${html}</div>`;
    footEl.innerHTML = "";

    const yes = mkBtn("primary danger", "✅ Ja, verwijderen", () => finish(true));
    const no = mkBtn("primary", "❌ Annuleren", () => finish(false));
    footEl.append(yes, no);

    function finish(val) { resolve(val); closeModal(); }
  });
}

/* ---------- DONE TOGGLE ---------- */
window.markDone = async function (id, status) {
  await setDoc(doc(db, "todos", id), { done: status }, { merge: true });
};

/* ---------- HELPERS ---------- */
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Vul de datalist met alle categorieën: "Naam (werk|prive)" */
function updateCategoryDatalist() {
  if (!categoryList) return;

  // leegmaken
  categoryList.innerHTML = "";

  // alle actieve categorieën tonen, ongeacht modus
  categories
    .filter(c => c && c.name && c.type && c.active !== false)
    .forEach(c => {
      const opt = document.createElement("option");
      opt.value = `${c.name} (${c.type})`;  // bv. "Algemeen (werk)"
      categoryList.appendChild(opt);
    });
}
