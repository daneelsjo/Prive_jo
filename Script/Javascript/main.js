// Script/Javascript/main.js
import {
  getFirebaseApp,
  // Auth
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  // Firestore
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, updateDoc, deleteDoc,
  query, where
} from "./firebase-config.js";

// ───────────────────────────────────────────────────────────────────────────────
// Firebase init
// ───────────────────────────────────────────────────────────────────────────────
const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ───────────────────────────────────────────────────────────────────────────────
// DOM refs
// ───────────────────────────────────────────────────────────────────────────────
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");
const postitsEl = document.getElementById("postits");
const modeSwitch = document.getElementById("modeSwitch");

const newTaskBtn = document.getElementById("newTaskBtn");
const formContainer = document.getElementById("formContainer");
const addTodoBtn = document.getElementById("addTodo");

const toggleAllTasks = document.getElementById("toggleAllTasks");
const allTasksPanel = document.getElementById("allTasksPanel");
const allTasksSearch = document.getElementById("allTasksSearch");
const allTasksTable = document.getElementById("allTasksTable");

const datalist = document.getElementById("categoryList");
const categoryInput = document.getElementById("category");
// ───────────────────────────────────────────────────────────────────────────────
// thema modus
// ───────────────────────────────────────────────────────────────────────────────

function applyTheme(mode) {
  let final = mode;
  if (!final || final === "system") {
    final = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", final);
}
// zet alvast iets vóór login
applyTheme("system");



function openTaskModal() {
  // reset velden
  document.getElementById("task-title").value = "";
  document.getElementById("task-start").value = "";
  document.getElementById("task-end").value = "";
  document.getElementById("task-priority").value = "0";
  document.getElementById("task-category-input").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-link").value = "";

  Modal.open("modal-task");
}

function fillBothCategoryLists() {
  const fill = (el) => {
    if (!el) return;
    el.innerHTML = "";
    categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = `${c.name} (${c.type})`;
      el.appendChild(opt);
    });
  };
  fill(document.getElementById("categoryList"));        // (oude formulier; mag ontbreken)
  fill(document.getElementById("task-category-list"));  // modal datalist
}


// ───────────────────────────────────────────────────────────────────────────────
// Data
// ───────────────────────────────────────────────────────────────────────────────
let currentUser = null;

let settings = {
  modeSlots: { werk: Array(6).fill({}), prive: Array(6).fill({}) },
  preferredMode: "werk",
};
let currentMode = "werk";

let categories = []; // {id,name,type,color,active}
let todos = [];      // {id,title,done,categoryId,uid,createdAt,...}

const fixedColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63",
  "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688",
  "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"
];

// ───────────────────────────────────────────────────────────────────────────────
// Auth
// ───────────────────────────────────────────────────────────────────────────────
if (loginBtn) {
  loginBtn.onclick = () => signInWithPopup(auth, provider);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  currentUser = user;
  if (authDiv) authDiv.style.display = "none";
  if (appDiv) appDiv.style.display = "block";

  // settings
  onSnapshot(doc(db, "settings", currentUser.uid), (snap) => {
    settings = snap.exists() ? (snap.data() || {}) : {};
    if (!settings.modeSlots) {
      settings.modeSlots = { werk: Array(6).fill({}), prive: Array(6).fill({}) };
    }
    currentMode = settings.preferredMode || "werk";
    if (modeSwitch) modeSwitch.checked = (currentMode === "prive");
    renderAll();
  });

  // categories
  onSnapshot(collection(db, "categories"), (snap) => {
    categories = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false);
    fillBothCategoryLists();

    renderAll();
  });

  // todos (alleen eigen items lezen)
  const qTodos = query(
    collection(db, "todos"),
    where("uid", "==", currentUser.uid)
  );
  onSnapshot(qTodos, (snap) => {
    todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // client-side sort op createdAt
    todos.sort((a, b) => {
      const ta = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : +new Date(a.createdAt)) : 0;
      const tb = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : +new Date(b.createdAt)) : 0;
      return ta - tb;
    });
    renderAll();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// UI handlers
// ───────────────────────────────────────────────────────────────────────────────
if (modeSwitch) {
  modeSwitch.onchange = async () => {
    currentMode = modeSwitch.checked ? "prive" : "werk";
    if (currentUser) {
      await setDoc(doc(db, "settings", currentUser.uid), { preferredMode: currentMode }, { merge: true });
    }
    renderAll();
  };
}



// NIEUW knop → open modal
newTaskBtn && (newTaskBtn.onclick = () => openTaskModal());

// Opslaan in modal
const taskSaveBtn = document.getElementById("task-save");
taskSaveBtn && (taskSaveBtn.onclick = async () => {
  const title = (document.getElementById("task-title").value || "").trim();
  const start = document.getElementById("task-start").value;
  const end = document.getElementById("task-end").value;
  const prio = parseInt(document.getElementById("task-priority").value || "0", 10);
  const catTxt = (document.getElementById("task-category-input").value || "").trim();
  const desc = (document.getElementById("task-desc").value || "").trim();
  const link = (document.getElementById("task-link").value || "").trim();

  if (!title) { Modal.alert({ title: "Taak", html: "Geef een taaknaam op." }); return; }

  const catMatch = parseCategory(catTxt);
  const catDoc = catMatch
    ? categories.find(c => c.name.toLowerCase() === catMatch.name && c.type === catMatch.type)
    : null;

  await addDoc(collection(db, "todos"), {
    title,
    description: desc,
    link,
    startDate: start ? new Date(start) : null,
    endDate: end ? new Date(end) : null,
    priority: prio,
    categoryId: catDoc?.id || null,
    uid: currentUser?.uid || null,          // belangrijk voor security rules
    createdAt: new Date(),
    done: false
  });

  Modal.close('modal-task'); // klaar
});


if (toggleAllTasks) {
  toggleAllTasks.onclick = () => {
    const open = allTasksPanel.style.display !== "block";
    allTasksPanel.style.display = open ? "block" : "none";
    allTasksSearch.style.display = open ? "inline-block" : "none";
    if (open) buildAllTasksTable();
  };
}

if (allTasksSearch) {
  allTasksSearch.oninput = () => buildAllTasksTable(allTasksSearch.value);
}

if (addTodoBtn) {
  addTodoBtn.onclick = async () => {
    const title = (document.getElementById("name").value || "").trim();
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;
    const prio = parseInt(document.getElementById("priority").value || "0", 10);
    const catTxt = (categoryInput?.value || "").trim();
    const desc = (document.getElementById("description").value || "").trim();
    const link = (document.getElementById("link").value || "").trim();

    if (!title) { Modal.alert({ title: "Taak", html: "Geef een taaknaam op." }); return; }

    const catMatch = parseCategory(catTxt);
    const catDoc = catMatch
      ? categories.find(c => c.name.toLowerCase() === catMatch.name && c.type === catMatch.type)
      : null;

    await addDoc(collection(db, "todos"), {
      title,
      description: desc,
      link,
      startDate: start ? new Date(start) : null,
      endDate: end ? new Date(end) : null,
      priority: prio,
      categoryId: catDoc?.id || null,
      uid: currentUser?.uid || null, // ← belangrijk voor security rules
      createdAt: new Date(),
      done: false
    });

    // reset form
    document.getElementById("name").value = "";
    document.getElementById("start").value = "";
    document.getElementById("end").value = "";
    document.getElementById("priority").value = "0";
    if (categoryInput) categoryInput.value = "";
    document.getElementById("description").value = "";
    document.getElementById("link").value = "";
    if (formContainer) formContainer.style.display = "none";
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Rendering
// ───────────────────────────────────────────────────────────────────────────────
function parseCategory(txt) {
  // verwacht "Naam (werk)" of "Naam (prive)"
  const m = txt.match(/^\s*(.+?)\s*\((werk|prive)\)\s*$/i);
  if (!m) return null;
  return { name: m[1].toLowerCase(), type: m[2].toLowerCase() };
}

function renderAll() {
  renderPostits();
  if (allTasksPanel && allTasksPanel.style.display === "block") {
    buildAllTasksTable(allTasksSearch.value);
  }
}

function renderPostits() {
  if (!postitsEl) return;
  postitsEl.innerHTML = "";

  const slots = (settings.modeSlots?.[currentMode] || Array(6).fill({})).slice(0, 6);

  // groepeer todos per categorie
  const byCat = {};
  todos.forEach(t => {
    const cid = t.categoryId || "_none";
    (byCat[cid] ||= []).push(t);
  });

  for (let i = 0; i < 6; i++) {
    const slot = slots[i] || {};
    if (!slot.categoryId) continue;

    const cat = categories.find(c => c.id === slot.categoryId && c.type === currentMode);
    if (!cat) continue;

    const color = String((cat.color || fixedColors[i % fixedColors.length])).toUpperCase();
    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = color;
    box.style.color = getContrast(color);
    box.innerHTML = `<div class="postit-head"><strong>${escapeHtml(cat.name)}</strong></div>`;

    (byCat[slot.categoryId] || []).forEach(todo => {
      box.appendChild(buildTaskRow(todo));
    });

    box.addEventListener("click", () => showPostit(cat, byCat[slot.categoryId] || []));
    postitsEl.appendChild(box);
  }

  // overige taken
  const unc = document.getElementById("uncategorized-list");
  if (unc) {
    unc.innerHTML = "";
    (byCat["_none"] || []).forEach(todo => {
      unc.appendChild(buildTaskRow(todo));
    });
  }
}

function buildTaskRow(todo) {
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <label class="task-check">
      <input type="checkbox" ${todo.done ? "checked" : ""}>
      <span>${escapeHtml(todo.title || "(zonder titel)")}</span>
    </label>
    <button class="btn-icon sm danger" title="Verwijderen">🗑️</button>
  `;
  const cb = row.querySelector("input");
  cb.onchange = () => updateDoc(doc(db, "todos", todo.id), { done: cb.checked, updatedAt: new Date() });
  row.querySelector("button").onclick = async (e) => {
    e.stopPropagation();
    await deleteDoc(doc(db, "todos", todo.id));
  };
  return row;
}

function buildAllTasksTable(filterText = "") {
  if (!allTasksTable) return;
  const ft = (filterText || "").toLowerCase();

  const rows = todos
    .filter(t => {
      const blob = [
        t.title, t.description, t.link, t.priority, t.startDate, t.endDate
      ].map(x => String(x || "")).join(" ").toLowerCase();
      return !ft || blob.includes(ft);
    })
    .map(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      return `
        <tr>
          <td>${escapeHtml(t.title || "")}</td>
          <td>${cat ? escapeHtml(cat.name) : "-"}</td>
          <td>${t.priority ?? "-"}</td>
          <td>${t.startDate ? formatDate(t.startDate) : "-"}</td>
          <td>${t.endDate ? formatDate(t.endDate) : "-"}</td>
          <td>${t.done ? "✔️" : ""}</td>
        </tr>
      `;
    })
    .join("");

  allTasksTable.innerHTML = `
    <table class="alltasks-table unified">
      <thead><tr><th>Taak</th><th>Categorie</th><th>Prio</th><th>Start</th><th>Eind</th><th>Klaar</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='6'><em>Geen taken</em></td></tr>"}</tbody>
    </table>
  `;
}

window.showPostit = function (category, items) {
  document.getElementById("modal-postit-title").textContent = category.name || "Post-it";
  const body = document.getElementById("modal-postit-body");
  const color = String((category.color || "#FFEB3B")).toUpperCase();
  body.innerHTML = `
    <div style="background:${color};color:${getContrast(color)};padding:1rem;border-radius:10px;">
      <strong>${escapeHtml(category.name)}</strong>
    </div>
    <div style="margin-top:.6rem;display:grid;gap:.4rem;">
      ${items && items.length
      ? items.map(t => `<div class="task-row"><span>${escapeHtml(t.title || "")}</span></div>`).join("")
      : "<em>Geen items</em>"
    }
    </div>
  `;
  Modal.open("modal-postit");
};

// ───────────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────────
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function formatDate(v) {
  const d = new Date(v.seconds ? v.seconds * 1000 : v);
  return d.toLocaleDateString();
}

// — Nieuw-taak modal robuust binden —
function bindNewTaskButton() {
  const btn = document.getElementById("newTaskBtn");
  if (!btn) return;

  btn.onclick = (e) => {
    e.preventDefault();
    const modalEl = document.getElementById("modal-task");

    // Als de partial nog niet klaar is, wacht één keer op 'partials:loaded'
    if (!modalEl) {
      console.warn("[task] modal-task nog niet in DOM; wachten op partials…");
      document.addEventListener("partials:loaded", () => {
        openTaskModal();                    // probeert opnieuw, nu bestaat hij
      }, { once: true });
      return;
    }
    openTaskModal();                        // normaal pad
  };
}

// koppel zowel op DOMContentLoaded als wanneer partials klaar zijn
document.addEventListener("DOMContentLoaded", bindNewTaskButton);
document.addEventListener("partials:loaded", bindNewTaskButton);

function bindTaskDocOpen() {
  const btn = document.getElementById('task-link-open');
  if (!btn) return;
  btn.onclick = () => {
    const raw = (document.getElementById('task-link').value || '').trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    window.open(url, '_blank', 'noopener');
  };
}
document.addEventListener('DOMContentLoaded', bindTaskDocOpen);
document.addEventListener('partials:loaded', bindTaskDocOpen);
