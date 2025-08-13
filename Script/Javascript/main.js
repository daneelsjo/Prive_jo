// Script/Javascript/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

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
const priorityInput = document.getElementById("priority");

const toggleAllBtn = document.getElementById("toggleAllTasks");
const allTasksPanel = document.getElementById("allTasksPanel");
const allTasksTableDiv = document.getElementById("allTasksTable");
const jumpBtn = document.getElementById("jumpAllTasks");
const allTasksSearchEl = document.getElementById("allTasksSearch");

const ONE_DAY = 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * ONE_DAY;

/* Helpers */
const PRIO_COLORS = { 0: "#ffffff", 1: "#ef4444", 2: "#f59e0b", 3: "#10b981" };
function prioColor(p) { return PRIO_COLORS[p ?? 0] || "#ffffff"; }
function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toISO(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString(); }
function formatCompletedNL(todo) {
  let d = null;
  if (todo?.completedAt?.toDate) d = todo.completedAt.toDate();
  else if (todo?.completedAtStr) d = new Date(todo.completedAtStr);
  if (!d || isNaN(d)) return null;
  return d.toLocaleString("nl-BE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function normalize(s) { return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

/* State */
let currentUser = null;
let allTodos = [];
let categories = []; // {id,name,type('werk'|'prive'),active}
let settings = {};   // { modeSlots:{werk[],prive[]}, preferredMode, theme }
let currentMode = "werk";
const fixedColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"];

/* AUTH */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  if (authDiv) authDiv.style.display = "none";
  if (appDiv) appDiv.style.display = "block";

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

/* THEME */
function applyTheme(mode) {
  let final = mode;
  if (mode === "system") final = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", final);
}

/* MODE */
function setMode(mode) {
  currentMode = mode;
  if (currentUser) setDoc(doc(db, "settings", currentUser.uid), { preferredMode: mode }, { merge: true });
  renderTodos();
}

/* LISTENERS */
function listenTodos() {
  onSnapshot(collection(db, "todos"), async (snapshot) => {
    allTodos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTodos();
    cleanupOldCompleted().catch(console.error);
  });
}
function listenCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false);
    updateCategoryDatalist();
    renderTodos();
  });
}

/* FORM */
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
  const prio = parseInt(priorityInput?.value || "0", 10);
  if (!name) return alert("Vul een taaknaam in.");

  const { categoryId, categoryName } = parseCategoryInput(categoryRaw);

  await addDoc(collection(db, "todos"), {
    name, start, end,
    categoryId, category: categoryName,
    description, link, prio, done: false
  });

  nameInput.value = ""; startInput.value = ""; endInput.value = "";
  categoryInput.value = ""; descInput.value = ""; linkInput.value = "";
  formContainer.style.display = "none";
});

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

/* SETTINGS LADEN */
async function loadSettings() {
  const s = await getDoc(doc(db, "settings", currentUser.uid));
  settings = s.exists() ? (s.data() || {}) : {};
}

/* RENDER */
function sortTodosForDisplay(list) {
  const order = { 1: 0, 2: 1, 3: 2, 0: 3 };
  list.sort((a, b) => {
    const pa = order[(a.prio ?? 0)] ?? 3;
    const pb = order[(b.prio ?? 0)] ?? 3;
    if (pa !== pb) return pa - pb;
    return (a.name || "").localeCompare(b.name || "");
  });
  return list;
}

function buildTaskRow(todo, inRest = false) {
  const row = document.createElement("div");
  row.className = "task-row" + (todo.done ? " done" : "");

  const dot = document.createElement("span");
  dot.className = "prio-dot";
  dot.style.backgroundColor = prioColor(todo.prio || 0);

  const wrap = document.createElement("div");
  wrap.className = "task-text-wrap";

  const title = document.createElement("div");
  title.className = "task-title";
  if (inRest) {
    const c = categories.find(x => x.id === todo.categoryId);
    const catName = c ? c.name : "geen";
    title.innerHTML = `${escapeHtml(todo.name)} <small style="opacity:.7">(${escapeHtml(catName)})</small>`;
  } else {
    title.textContent = todo.name;
  }

  const dateLine = document.createElement("div");
  dateLine.className = "task-date";
  const s = todo.start || "—";
  const e = todo.end || "—";
  dateLine.textContent = `${s} - ${e}`;

  wrap.appendChild(title);
  wrap.appendChild(dateLine);

  row.appendChild(dot);
  row.appendChild(wrap);

  row.addEventListener("click", () => showTaskDetail(todo));
  return row;
}

function renderTodos() {
  if (!settings.modeSlots) settings.modeSlots = {};
  const slots = settings.modeSlots[currentMode] || [];

  if (!postits) return;
  postits.innerHTML = "";

  const visibleTodos = allTodos.filter(t => {
    const cat = t.categoryId ? categories.find(x => x.id === t.categoryId) : null;
    const inMode = !t.categoryId || (cat && cat.type === currentMode);
    return inMode && !t.done;
  });

  const byCatId = visibleTodos.reduce((acc, t) => {
    const key = t.categoryId || "UNCAT";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  // 6 post-its volgens slots
  for (let i = 0; i < 6; i++) {
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

    sortTodosForDisplay(byCatId[slot.categoryId] || []).forEach(todo => {
      box.appendChild(buildTaskRow(todo));
    });
    postits.appendChild(box);
  }

  // Overige taken (niet in slots of helemaal zonder categorie)
  const slotCatIds = new Set(slots.map(s => s?.categoryId).filter(Boolean));
  const rest = [];
  Object.entries(byCatId).forEach(([key, list]) => {
    if (key === "UNCAT") { rest.push(...list); return; }
    if (!slotCatIds.has(key)) { rest.push(...list); }
  });

  if (uncategorizedList) {
    uncategorizedList.innerHTML = "";
    sortTodosForDisplay(rest).forEach(todo => uncategorizedList.appendChild(buildTaskRow(todo, true)));
  }

  // indien open, tabel hertekenen
  if (allTasksPanel && allTasksPanel.style.display !== "none") {
    renderAllTasks(allTasksSearchEl?.value || "");
  }
}

/* MODAL helpers */
let _modalBackdrop = null;
let _modalCard = null;

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

/* MODAL: open + acties */
window.showTaskDetail = function (todo) {
  openModal();

  const titleEl = _modalCard.querySelector("#modalTitle");
  const bodyEl = _modalCard.querySelector("#modalBody");
  const footEl = _modalCard.querySelector("#modalFooter");
  titleEl.textContent = todo.name || "Taak";

  // Categorie-weergave "Naam (type)"
  let catDisplay = todo.category || "";
  if (todo.categoryId) {
    const cat = categories.find(c => c.id === todo.categoryId);
    if (cat) catDisplay = `${cat.name} (${cat.type})`;
  }

  bodyEl.innerHTML = `
    <label>Start</label>
    <input id="editStart" type="date" value="${todo.start || ""}">
    <label>Einde</label>
    <input id="editEnd" type="date" value="${todo.end || ""}">
    <label>Prio</label>
    <select id="editPrio">
      <option value="0">PRIO 0</option>
      <option value="1">PRIO 1</option>
      <option value="2">PRIO 2</option>
      <option value="3">PRIO 3</option>
    </select>
    <label>Categorie</label>
    <input id="editCategory" list="categoryList" value="${escapeHtml(catDisplay)}">
    <label>Omschrijving</label>
    <textarea id="editDesc">${todo.description ? escapeHtml(todo.description) : ""}</textarea>
    <label>Link</label>
    <input id="editLink" value="${todo.link ? escapeHtml(todo.link) : ""}">
  `;
  const prioSel = _modalCard.querySelector("#editPrio");
  if (prioSel) prioSel.value = String(todo.prio ?? 0);

  // Datalist UX
  const editCat = _modalCard.querySelector("#editCategory");
  if (editCat) {
    editCat.setAttribute("autocomplete", "off");
    editCat.placeholder = "Kies of typ...";
    editCat.addEventListener("focus", () => {
      editCat.dataset.prev = editCat.value;
      editCat.value = "";
      editCat.dispatchEvent(new Event("input", { bubbles: true }));
    });
    editCat.addEventListener("blur", () => {
      if (!editCat.value && editCat.dataset.prev) editCat.value = editCat.dataset.prev;
    });
    editCat.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && editCat.showPicker) editCat.showPicker(); });
  }

  buildModalFooterButtons(todo, footEl);
};
window.closeTaskDetail = function () { closeModal(); };

function mkBtn(cls, text, onClick) { const b = document.createElement("button"); b.className = cls; b.textContent = text; b.onclick = onClick; return b; }
function buildModalFooterButtons(todo, footEl) {
  footEl.innerHTML = "";
  footEl.append(
    mkBtn("primary", "💾 Opslaan", () => saveTask(todo.id)),
    todo.done ? mkBtn("primary warning", "↩️ Onvoltooid", () => uncompleteTask(todo.id))
      : mkBtn("primary success", "✔️ Voltooid", () => completeTask(todo.id)),
    mkBtn("primary danger", "🗑️ Verwijderen", () => confirmDeleteTask(todo.id, todo.name))
  );
}

/* Acties op taak */
async function completeTask(id) {
  const now = new Date();
  const ttlDate = new Date(now.getTime() + 90 * ONE_DAY);
  await setDoc(doc(db, "todos", id), {
    done: true,
    completedAt: serverTimestamp(),
    completedAtStr: toISO(now),
    ttlAt: ttlDate
  }, { merge: true });
  closeModal();
}
async function uncompleteTask(id) {
  await setDoc(doc(db, "todos", id), {
    done: false, completedAt: deleteField(), completedAtStr: deleteField(), ttlAt: deleteField()
  }, { merge: true });
  closeModal();
}
window.saveTask = async function (id) {
  const raw = (document.getElementById("editCategory")?.value || "").trim();
  const { categoryId, categoryName } = parseCategoryInput(raw);
  const payload = {
    start: document.getElementById("editStart")?.value || "",
    end: document.getElementById("editEnd")?.value || "",
    categoryId, category: categoryName,
    description: (document.getElementById("editDesc")?.value || "").trim(),
    link: (document.getElementById("editLink")?.value || "").trim(),
    prio: parseInt(document.getElementById("editPrio")?.value || "0", 10)
  };
  await setDoc(doc(db, "todos", id), payload, { merge: true });
  closeModal();
};
async function confirmDeleteTask(id, name = "deze taak") {
  const ok = await askConfirm("Taak verwijderen",
    `⚠️ OPGELET!<br>Ben je zeker dat je volgende taak wenst te verwijderen:<br><strong>“${escapeHtml(name)}”</strong>`);
  if (!ok) return;
  await deleteDoc(doc(db, "todos", id));
  closeModal();
}
function askConfirm(title, html) {
  openModal();
  const titleEl = _modalCard.querySelector("#modalTitle");
  const bodyEl = _modalCard.querySelector("#modalBody");
  const footEl = _modalCard.querySelector("#modalFooter");
  titleEl.textContent = title;
  bodyEl.innerHTML = `<div style="padding-top:.3rem; text-align:center">${html}</div>`;
  footEl.innerHTML = "";
  return new Promise((resolve) => {
    const yes = mkBtn("primary danger", "✅ Ja, verwijderen", () => finish(true));
    const no = mkBtn("primary", "❌ Annuleren", () => finish(false));
    footEl.append(yes, no);
    function finish(val) { resolve(val); closeModal(); }
  });
}

/* Cleanup */
async function cleanupOldCompleted() {
  const now = Date.now();
  const toDelete = allTodos.filter(t => {
    if (!t.done || !t.completedAt) return false;
    const ts = typeof t.completedAt === "string"
      ? Date.parse(t.completedAt)
      : (t.completedAt?.toDate ? t.completedAt.toDate().getTime() : NaN);
    if (Number.isNaN(ts)) return false;
    return (now - ts) > NINETY_DAYS;
  });
  for (const t of toDelete) {
    await deleteDoc(doc(db, "todos", t.id));
  }
}

/* Datalist met ALLE categorieën */
function updateCategoryDatalist() {
  if (!categoryList) return;
  categoryList.innerHTML = "";
  categories
    .filter(c => c && c.name && c.type && c.active !== false)
    .forEach(c => {
      const opt = document.createElement("option");
      opt.value = `${c.name} (${c.type})`;
      categoryList.appendChild(opt);
    });
}

/* “Alle taken” + zoeken */
function matchesQuery(t, q) {
  if (!q) return true;
  const nq = normalize(q);
  const cat = t.categoryId ? categories.find(c => c.id === t.categoryId) : null;
  const catLabel = cat ? `${cat.name} (${cat.type})` : "overig";
  const hay = [
    t.name, t.description, t.link, t.start, t.end, t.completedAtStr,
    catLabel, `prio ${t.prio ?? 0}`, String(t.prio ?? 0)
  ].map(normalize).join(" ");
  return hay.includes(nq);
}

function renderAllTasks(query = "") {
  if (!allTasksTableDiv) return;
  const inCurrentMode = (t) => {
    const c = t.categoryId ? categories.find(x => x.id === t.categoryId) : null;
    return !t.categoryId || (c && c.type === currentMode);
  };
  const base = allTodos.filter(inCurrentMode);
  const filtered = base.filter(t => matchesQuery(t, query));

  const groups = new Map();
  const labelOf = (t) => {
    const c = t.categoryId ? categories.find(x => x.id === t.categoryId) : null;
    return c ? `${c.name} (${c.type})` : "Overig";
  };
  filtered.forEach(t => {
    const lbl = labelOf(t);
    if (!groups.has(lbl)) groups.set(lbl, []);
    groups.get(lbl).push(t);
  });

  const order = { 1: 0, 2: 1, 3: 2, 0: 3 };
  const prioRank = p => order[p ?? 0] ?? 3;

  const wrapper = document.createElement("div");
  const table = document.createElement("table");
  table.className = "alltasks-table unified";
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-prio">Prio</th>
        <th class="col-task">Taak</th>
        <th class="col-date">Start</th>
        <th class="col-date">Eind</th>
        <th class="col-done">Voltooid</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([label, list]) => {
    const sep = document.createElement("tr");
    sep.className = "group-row";
    sep.innerHTML = `<td colspan="5">${label}</td>`;
    tbody.appendChild(sep);

    list.slice().sort((a, b) => {
      const pa = prioRank(a.prio), pb = prioRank(b.prio);
      if (pa !== pb) return pa - pb;
      return (a.name || "").localeCompare(b.name || "");
    }).forEach(t => {
      const tr = document.createElement("tr");
      tr.onclick = () => showTaskDetail(t);

      const tdPrio = document.createElement("td");
      tdPrio.className = "td-prio";
      const dot = document.createElement("span");
      dot.className = "prio-dot";
      dot.style.backgroundColor = prioColor(t.prio);
      tdPrio.appendChild(dot);

      const tdName = document.createElement("td"); tdName.textContent = t.name || "";
      const tdStart = document.createElement("td"); tdStart.textContent = t.start || "—";
      const tdEnd = document.createElement("td"); tdEnd.textContent = t.end || "—";

      const tdDone = document.createElement("td");
      tdDone.textContent = t.done ? (formatCompletedNL(t) || "✓") : "—";

      tr.append(tdPrio, tdName, tdStart, tdEnd, tdDone);
      tbody.appendChild(tr);
    });
  });

  allTasksTableDiv.innerHTML = "";
  wrapper.appendChild(table);
  allTasksTableDiv.appendChild(wrapper);
}

/* Scroll/zoek gedrag */
jumpBtn && (jumpBtn.onclick = () => {
  if (allTasksPanel) {
    allTasksPanel.style.display = "block";
    renderAllTasks();
    document.querySelector(".alltasks-container")?.scrollIntoView({ behavior: "smooth" });
  }
});
toggleAllBtn && (toggleAllBtn.onclick = () => {
  const goingOpen = allTasksPanel.style.display === "none";
  allTasksPanel.style.display = goingOpen ? "block" : "none";
  if (allTasksSearchEl) {
    allTasksSearchEl.style.display = goingOpen ? "block" : "none";
    if (goingOpen) {
      allTasksSearchEl.value = "";
      allTasksSearchEl.focus();
    }
  }
  if (goingOpen) renderAllTasks();
});
allTasksSearchEl && allTasksSearchEl.addEventListener("input", debounce(() => {
  renderAllTasks(allTasksSearchEl.value || "");
}, 150));
