import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

/** Firebase config (jouw gegevens) */
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
const taskDetailPanel = document.getElementById("taskDetailPanel");

let currentUser = null;
let allTodos = [];
let categories = []; // {id, name, type, active}
let settings = {};   // { modeSlots: { werk:[...4], prive:[...4] }, preferredMode }
let currentMode = "werk";

const fixedColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"];

/* Auth */
loginBtn.onclick = () => signInWithPopup(auth, provider);
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv.style.display = "none";
  appDiv.style.display = "block";

  // Modus switch
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.onchange = () => setMode(r.value);
  });

  await loadSettings();
  setMode(settings.preferredMode || "werk");

  listenCategories();
  listenTodos();
});

/* Mode helpers */
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('input[name="mode"]').forEach(r => (r.checked = r.value === mode));
  if (currentUser) setDoc(doc(db, "settings", currentUser.uid), { preferredMode: mode }, { merge: true });
  renderTodos();
}

/* CATEGORIES listener – FIX: geen where(...in,[true,undefined]) */
function listenCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    // client-side filter: toon alles behalve active === false
    categories = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false);

    updateCategoryDatalist();
    renderTodos();
  });
}

/* TODOS listener */
function listenTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    allTodos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTodos();
  });
}

/* Form toggling + add */
newTaskBtn.onclick = () => {
  formContainer.style.display = formContainer.style.display === "none" ? "block" : "none";
};

addTodoBtn.onclick = async () => {
  const name = (nameInput.value || "").trim();
  const start = startInput.value || "";
  const end = endInput.value || "";
  const category = (categoryInput.value || "").trim();
  const description = (descInput.value || "").trim();
  const link = (linkInput.value || "").trim();
  if (!name) return alert("Vul een taaknaam in.");

  await addDoc(collection(db, "todos"), {
    name, start, end, category, description, link, done: false
  });

  // reset
  nameInput.value = ""; startInput.value = ""; endInput.value = "";
  categoryInput.value = ""; descInput.value = ""; linkInput.value = "";
  formContainer.style.display = "none";
};

/* Settings */
async function loadSettings() {
  const s = await getDoc(doc(db, "settings", currentUser.uid));
  settings = s.exists() ? (s.data() || {}) : {};
}

/* Render */
function renderTodos() {
  if (!settings.modeSlots) settings.modeSlots = {};
  const slots = settings.modeSlots[currentMode] || []; // [{categoryId, color}]

  // groepeer todos op basis van NAAM (legacy)
  const grouped = allTodos.reduce((acc, t) => {
    const key = t.category || "UNCAT";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  postits.innerHTML = "";
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
    box.innerHTML = `<strong>${catDoc.name}</strong>`;

    (grouped[catDoc.name] || []).forEach(todo => {
      const row = document.createElement("div");
      row.style.cursor = "pointer";
      row.innerHTML = `• ${todo.name} (${todo.start || "?"} - ${todo.end || "?"})
        <button style="float:right" onclick="markDone('${todo.id}', ${!todo.done});event.stopPropagation();">
          ${todo.done ? "✅" : "☐"}
        </button>`;
      if (todo.done) { row.style.textDecoration = "line-through"; row.style.opacity = "0.6"; }
      row.onclick = () => showTaskDetail(todo);
      box.appendChild(row);
    });

    postits.appendChild(box);
  }

  // overige taken niet in slots of zonder categorie
  const slotCatNames = new Set(
    (settings.modeSlots[currentMode] || [])
      .map(s => s?.categoryId)
      .map(id => categories.find(c => c.id === id)?.name)
      .filter(Boolean)
  );
  const rest = [];
  Object.entries(grouped).forEach(([catName, list]) => {
    if (catName === "UNCAT" || !slotCatNames.has(catName)) rest.push(...list);
  });

  const restList = document.getElementById("uncategorized-list");
  restList.innerHTML = "";
  rest.forEach(todo => {
    const item = document.createElement("div");
    item.innerHTML = `${todo.name} (${todo.category || "geen"}) 
      <button style="float:right" onclick="markDone('${todo.id}', ${!todo.done});event.stopPropagation();">
        ${todo.done ? "✅" : "☐"}
      </button>`;
    if (todo.done) { item.style.textDecoration = "line-through"; item.style.opacity = "0.6"; }
    item.onclick = () => showTaskDetail(todo);
    restList.appendChild(item);
  });
}

/* Datalist uit categories */
function updateCategoryDatalist() {
  categoryList.innerHTML = "";
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    categoryList.appendChild(opt);
  });
}

/* Detailpaneel */
window.showTaskDetail = function (todo) {
  taskDetailPanel.style.display = "block";
  taskDetailPanel.innerHTML = `
    <h3 style="margin-top:0">${todo.name}</h3>
    <div style="display:grid;gap:.5rem;">
      <label>Start</label>
      <input id="editStart" type="date" value="${todo.start || ""}">
      <label>Einde</label>
      <input id="editEnd" type="date" value="${todo.end || ""}">
      <label>Categorie (tekst)</label>
      <input id="editCategory" value="${todo.category || ""}">
      <label>Omschrijving</label>
      <textarea id="editDesc">${todo.description || ""}</textarea>
      <label>Link</label>
      <input id="editLink" value="${todo.link || ""}">
    </div>
    <div style="display:flex;gap:.5rem;margin-top:1rem;">
      <button onclick="saveTask('${todo.id}')">💾 Opslaan</button>
      <button onclick="closeTaskDetail()">❌ Sluiten</button>
    </div>
  `;
};

window.saveTask = async function (id) {
  const payload = {
    start: document.getElementById("editStart").value,
    end: document.getElementById("editEnd").value,
    category: document.getElementById("editCategory").value.trim(),
    description: document.getElementById("editDesc").value.trim(),
    link: document.getElementById("editLink").value.trim()
  };
  await setDoc(doc(db, "todos", id), payload, { merge: true });
  closeTaskDetail();
};

window.closeTaskDetail = function () {
  taskDetailPanel.style.display = "none";
  taskDetailPanel.innerHTML = "";
};

/* Done-toggle knop (naast taak) */
window.markDone = async function (id, status) {
  await setDoc(doc(db, "todos", id), { done: status }, { merge: true });
};

/* Helpers */
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
