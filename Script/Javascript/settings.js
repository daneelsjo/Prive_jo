import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc
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

const catName = document.getElementById("catName");
const catType = document.getElementById("catType");
const addCatBtn = document.getElementById("addCat");
const catList = document.getElementById("catList");

const saveModeSlotsBtn = document.getElementById("saveModeSlots");
const modeSlotsDiv = document.getElementById("modeSlots");
const modeSwitchSettings = document.getElementById("modeSwitchSettings");

const themeSaveBtn = document.getElementById("saveTheme");

let currentUser = null;
let categories = []; // {id,name,type,active}
let settings = {};
let currentMode = "werk";

const fixedColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3",
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#00BCD4", "#009688", "#8BC34A", "#CDDC39",
  "#FFC107", "#FF9800", "#795548"
];

/* Auth */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv && (authDiv.style.display = "none");
  appDiv && (appDiv.style.display = "block");

  await loadSettings();
  applyTheme(settings.theme || "system");

  // Icon toggle voor modus (zoals index)
  if (modeSwitchSettings) {
    modeSwitchSettings.checked = (currentMode === "prive");
    modeSwitchSettings.onchange = async () => {
      currentMode = modeSwitchSettings.checked ? "prive" : "werk";
      // sla voorkeur op zodat index dezelfde gebruikt
      await setDoc(doc(db, "settings", currentUser.uid), { preferredMode: currentMode }, { merge: true });
      renderModeSlots();
    };
  }

  listenCategories();
  themeSaveBtn && themeSaveBtn.addEventListener("click", saveTheme);
});

/* Theme helpers */
function applyTheme(mode) {
  let final = mode;
  if (mode === "system") {
    final = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", final);
}
async function saveTheme() {
  const picked = [...document.querySelectorAll('input[name="theme"]')].find(r => r.checked)?.value || "system";
  await setDoc(doc(db, "settings", currentUser.uid), { theme: picked }, { merge: true });
  applyTheme(picked);
  alert("Weergave opgeslagen");
}

/* Settings laden */
async function loadSettings() {
  const s = await getDoc(doc(db, "settings", currentUser.uid));
  settings = s.exists() ? (s.data() || {}) : {};
  currentMode = settings.preferredMode || "werk";
  const theme = settings.theme || "system";
  document.querySelectorAll('input[name="theme"]').forEach(r => r.checked = (r.value === theme));
}

/* Categorieën volgen */
function listenCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false);
    renderCatList();
    renderModeSlots();
  });
}

/* Categorie toevoegen */
addCatBtn && (addCatBtn.onclick = async () => {
  const name = (catName.value || "").trim();
  const type = catType.value || "werk";
  if (!name) return alert("Vul een categorienaam in.");
  await addDoc(collection(db, "categories"), { name, type, active: true });
  catName.value = "";
});

/* Categorie-lijst renderen + archiveerknop */
function renderCatList() {
  if (!catList) return;
  catList.innerHTML = "";
  const grouped = { werk: [], prive: [] };
  categories.forEach(c => grouped[c.type]?.push(c));

  ["werk", "prive"].forEach(type => {
    const block = document.createElement("div");
    block.style.marginBottom = ".75rem";
    block.innerHTML = `<h3 style="margin:.25rem 0; text-align:center;">${type.toUpperCase()}</h3>`;
    grouped[type].forEach(c => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = ".5rem";
      row.innerHTML = `
        <span>${c.name}</span>
        <button class="primary" style="background:#ef4444" onclick="archiveCategory('${c.id}')">🗑️</button>
      `;
      block.appendChild(row);
    });
    catList.appendChild(block);
  });
}
window.archiveCategory = async function (id) {
  await updateDoc(doc(db, "categories", id), { active: false });
};

/* ModeSlots (4 slots per modus) */
function renderModeSlots() {
  if (!modeSlotsDiv) return;
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
    categories.filter(c => c.type === currentMode).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.name;
      if (c.id === slot.categoryId) opt.selected = true;
      catSelect.appendChild(opt);
    });

    const colorSelect = document.createElement("select");
    fixedColors.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col; opt.textContent = col;
      opt.style.backgroundColor = col; opt.style.color = getContrast(col);
      if ((slot.color || fixedColors[i % fixedColors.length]) === col) opt.selected = true;
      colorSelect.appendChild(opt);
    });

    row.appendChild(label);
    row.appendChild(catSelect);
    row.appendChild(colorSelect);
    modeSlotsDiv.appendChild(row);
  }
}

/* Opslaan van slots */
saveModeSlotsBtn && (saveModeSlotsBtn.onclick = async () => {
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
});

/* Helpers */
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
