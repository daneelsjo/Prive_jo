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

/* Modal elements */
const modal = document.getElementById("taskModal");
const backdrop = document.getElementById("taskBackdrop");
const modalTitle = document.getElementById("taskModalTitle");
const modalBody = document.getElementById("taskModalBody");
const modalFooter = document.getElementById("taskModalFooter");

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
  const row = document.createElement("label");
  row.className = "task-row" + (todo.done ? " done" : "");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.cursor = "pointer";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!todo.done;
  cb.addEventListener("click", (e) => {
    e.stopPropagation();
    markDone(todo.id, !todo.done);
  });

  const text = document.createElement("span");
  text.className = "task-text";
  text.style.whiteSpace = "nowrap";
  text.style.overflow = "hidden";
  text.style.textOverflow = "ellipsis";
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

  row.addEventListener("click", (e) => {
    if (e.target !== cb) openTaskDetail(todo);
  });

  return row;
}

/* ---------- MODAL: open/close + acties ---------- */
function openTaskDetail(todo) {
  // Titel
  modalTitle.textContent = todo.name;

  // Categorie-weergave
  let catDisplay = todo.category || "";
  if (todo.categoryId) {
    const cat = categories.find(c => c.id === todo.categoryId);
    if (cat) catDisplay = `${cat.name} (${cat.type})`;
  }

  // Body
  modalBody.innerHTML = `
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
  modalFooter.innerHTML = "";
  const btnSave = mkBtn("primary", "💾 Opslaan", () => saveTask(todo.id));
  const btnDone = mkBtn("primary success", "✔️ Voltooid", () => completeTask(todo.id));
  const btnDel = mkBtn("primary danger", "🗑️ Verwijderen", () => deleteTask(todo.id, todo.name));
  modalFooter.append(btnSave, btnDone, btnDel);

  // tonen
  modal.style.display = "block";
  backdrop.style.display = "block";

  // klik buiten modal → sluiten
  const closeOnBackdrop = (e) => {
    if (e.target === backdrop) closeTaskDetail();
  };
  backdrop.addEventListener("click", closeOnBackdrop, { once: true });
}

window.closeTaskDetail = function () {
  modal.style.display = "none";
  backdrop.style.display = "none";
};

/* helpers voor knoppen in footer */
function mkBtn(cls, text, onClick) {
  const b = document.createElement("button");
  b.className = cls; b.textContent = text;
  b.onclick = onClick; return b;
}

/* Voltooien via knop */
async function completeTask(id) {
  await setDoc(doc(db, "todos", id), { done: true }, { merge: true });
  closeTaskDetail();
}

/* Verwijderen met nette confirm in modal-stijl (eenvoudig) */
async function deleteTask(id, name = "deze taak") {
  const ok = confirm(`⚠️ OPGELET!\n\nBen je zeker dat je volgende taak wenst te verwijderen:\n"${name}"`);
  if (!ok) return;
  await deleteDoc(doc(db, "todos", id));
  closeTaskDetail();
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
  closeTaskDetail();
};

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
