// Script/Javascript/main.js
import {
  getFirebaseApp,
  // Auth
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  // Firestore
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc,
  query, orderBy
} from "./firebase-config.js";

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// DOM
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");
const postitsEl = document.getElementById("postits");
const modeSwitch = document.getElementById("modeSwitch"); // index-pagina schuiver

// Data
let settings = { modeSlots: { werk: Array(6).fill({}), prive: Array(6).fill({}) }, preferredMode: "werk" };
let currentMode = "werk";
let categories = []; // {id,name,type,color,active}
let todos = [];      // {id,title,done,categoryId,...}

/** Vaste kleuren (fallbacks) */
const fixedColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"];

// ---- AUTH ----
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv && (authDiv.style.display = "none");
  appDiv && (appDiv.style.display = "block");

  // settings
  const sref = doc(db, "settings", currentUser.uid);
  onSnapshot(sref, (snap) => {
    settings = snap.exists() ? (snap.data() || {}) : {};
    if (!settings.modeSlots) settings.modeSlots = { werk: Array(6).fill({}), prive: Array(6).fill({}) };
    currentMode = settings.preferredMode || "werk";
    if (modeSwitch) modeSwitch.checked = (currentMode === "prive");
    renderAll();
  });

  // categories
  onSnapshot(collection(db, "categories"), (snap) => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false);
    renderAll();
  });

  // todos
  const q = query(collection(db, "todos"), orderBy("createdAt", "asc"));
  onSnapshot(q, (snap) => {
    todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
});

// mode switch
if (modeSwitch) {
  modeSwitch.onchange = async () => {
    currentMode = modeSwitch.checked ? "prive" : "werk";
    if (currentUser) {
      await setDoc(doc(db, "settings", currentUser.uid), { preferredMode: currentMode }, { merge: true });
    }
    renderAll();
  };
}

// ---- RENDER ----
function renderAll() {
  renderPostits();
}

function renderPostits() {
  if (!postitsEl || !settings) return;
  postitsEl.innerHTML = "";

  const slots = (settings.modeSlots?.[currentMode] || Array(6).fill({})).slice(0, 6);

  // groepeer todos per categorie
  const byCat = {};
  todos.forEach(t => {
    if (!t.categoryId) return;
    (byCat[t.categoryId] ||= []).push(t);
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

    // optioneel: klik opent modal met volledige inhoud
    box.addEventListener('click', () => showPostit(cat, byCat[slot.categoryId] || []));
    postitsEl.appendChild(box);
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

// ---- POST-IT MODAL ----
window.showPostit = function (category, items) {
  document.getElementById('modal-postit-title').textContent = category.name || "Post-it";
  const body = document.getElementById('modal-postit-body');
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
  Modal.open('modal-postit');
};

// ---- UTIL ----
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
