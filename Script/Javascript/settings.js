import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

// --- Firebase configuratie ---
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

// --- HTML elementen ---
const loginBtn = document.getElementById("login-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");

const catName = document.getElementById("catName");
const catType = document.getElementById("catType");
const addCatBtn = document.getElementById("addCat");
const catList = document.getElementById("catList");

const saveModeSlotsBtn = document.getElementById("saveModeSlots");
const modeSlotsDiv = document.getElementById("modeSlots");

let currentUser = null;
let categories = []; // {id,name,type,active}
let settings = {};
let currentMode = "werk";
const fixedColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"
];

// --- Inloggen ---
loginBtn.onclick = () => signInWithPopup(auth, provider);
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv.style.display = "none";
  appDiv.style.display = "block";

  // Modus switch
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.onchange = () => { currentMode = r.value; renderModeSlots(); };
  });

  await loadSettings();
  listenCategories();
});

// --- Settings laden ---
async function loadSettings() {
  const s = await getDoc(doc(db, "settings", currentUser.uid));
  settings = s.exists() ? (s.data() || {}) : {};
  currentMode = settings.preferredMode || "werk";
  document.querySelectorAll('input[name="mode"]').forEach(r => (r.checked = r.value === currentMode));
}

// --- Categorieën live volgen (FIX: geen 'where(..., in, [true, undefined])') ---
function listenCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    // Filter client-side: toon alles behalve active === false
    categories = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false);

    renderCatList();
    renderModeSlots();
  });
}

// --- Nieuwe categorie toevoegen ---
addCatBtn.onclick = async () => {
  const name = (catName.value || "").trim();
  const type = catType.value || "werk";
  if (!name) return alert("Vul een categorienaam in.");
  await addDoc(collection(db, "categories"), { name, type, active: true });
  catName.value = "";
};

// --- Categorie-lijst renderen ---
function renderCatList() {
  catList.innerHTML = "";
  const grouped = { werk: [], prive: [] };
  categories.forEach(c => grouped[c.type]?.push(c));

  ["werk", "prive"].forEach(type => {
    const block = document.createElement("div");
    block.style.marginBottom = ".75rem";
    block.innerHTML = `<h3 style="margin:.25rem 0;">${type.toUpperCase()}</h3>`;
    grouped[type].forEach(c => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = ".5rem";
      row.innerHTML = `
        <span>${c.name}</span>
        <button onclick="archiveCategory('${c.id}')">🗑️</button>
      `;
      block.appendChild(row);
    });
    catList.appendChild(block);
  });
}

// --- Categorie archiveren ---
window.archiveCategory = async function (id) {
  await updateDoc(doc(db, "categories", id), { active: false });
};

// --- ModeSlots renderen ---
function renderModeSlots() {
  modeSlotsDiv.innerHTML = "";
  const slots = (settings.modeSlots?.[currentMode] || Array(4).fill({})).slice(0, 4);

  for (let i = 0; i < 4; i++) {
    const slot = slots[i] || {};
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = ".5rem";
    row.style.marginBottom = ".5rem";

    const label = document.createElement("span");
    label.textContent = `Post-it ${i + 1}:`;

    const catSelect = document.createElement("select");
    catSelect.innerHTML = `<option value="">-- Geen --</option>`;
    categories
      .filter(c => c.type === currentMode)
      .forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === slot.categoryId) opt.selected = true;
        catSelect.appendChild(opt);
      });

    // vaste kleuren (select) – als je liever color-picker wil: vervang door <input type="color">
    const colorSelect = document.createElement("select");
    fixedColors.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      opt.style.backgroundColor = col;
      opt.style.color = getContrast(col);
      if ((slot.color || fixedColors[i % fixedColors.length]) === col) opt.selected = true;
      colorSelect.appendChild(opt);
    });

    row.appendChild(label);
    row.appendChild(catSelect);
    row.appendChild(colorSelect);
    modeSlotsDiv.appendChild(row);
  }
}

// --- Opslaan van slots ---
saveModeSlotsBtn.onclick = async () => {
  const rows = Array.from(modeSlotsDiv.children);
  const newSlots = rows.map(row => {
    const selects = row.querySelectorAll("select");
    return {
      categoryId: selects[0].value || null,
      color: selects[1].value
    };
  });

  if (!settings.modeSlots) settings.modeSlots = {};
  settings.modeSlots[currentMode] = newSlots;

  await setDoc(doc(db, "settings", currentUser.uid), settings, { merge: true });
  alert("Opgeslagen!");
};

// --- Contrast helper ---
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
