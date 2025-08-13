import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";


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
const MAX_CATEGORIES_PER_MODE = 6;

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
  if (authDiv) authDiv.style.display = "none";
  if (appDiv) appDiv.style.display = "block";

  await loadSettings();
  applyTheme(settings.theme || "system");

  // Icon toggle voor modus
  if (modeSwitchSettings) {
    modeSwitchSettings.checked = (currentMode === "prive");
    modeSwitchSettings.onchange = async () => {
      currentMode = modeSwitchSettings.checked ? "prive" : "werk";
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
  if (mode === "system") final = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

/* Categorie toevoegen (max 6 per modus) */
addCatBtn && (addCatBtn.onclick = async () => {
  const name = (catName.value || "").trim();
  const type = (catType.value || "werk").toLowerCase();

  if (!name) {
    showSettingsMessage("Categorie niet aangemaakt", "Vul een categorienaam in.");
    return;
  }

  const countInMode = (categories || []).filter(c => c && c.type === type && c.active !== false).length;
  if (countInMode >= MAX_CATEGORIES_PER_MODE) {
    showSettingsMessage(
      "Categorie niet aangemaakt",
      `⚠️ Opgelet!<br>Er zijn al <strong>${MAX_CATEGORIES_PER_MODE}</strong> categorieën in modus <strong>${type}</strong>.<br>
       Gelieve eerst één te verwijderen.`
    );
    return;
  }

  await addDoc(collection(db, "categories"), { name, type, active: true });
  catName.value = "";
  renderModeSlots();
});

/* Cat-lijst render + archiveren */
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

/* ModeSlots (6 slots per modus) */
function renderModeSlots() {
  if (!modeSlotsDiv) return;
  modeSlotsDiv.innerHTML = "";

  const slots = (settings.modeSlots?.[currentMode] || Array(6).fill({})).slice(0, 6);

  for (let i = 0; i < 6; i++) {
    const slot = slots[i] || {};
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "110px 1fr 160px 40px";
    row.style.alignItems = "center";
    row.style.gap = ".6rem";
    row.style.borderRadius = "10px";
    row.style.padding = ".5rem .6rem";
    row.style.marginBottom = ".6rem";

    const initialColor = slot.color || fixedColors[i % fixedColors.length];
    row.style.background = initialColor;
    row.style.color = getContrast(initialColor);

    const label = document.createElement("span");
    label.textContent = `Post-it ${i + 1}:`;
    label.style.fontWeight = "500";

    const catSelect = document.createElement("select");
    catSelect.innerHTML = `<option value="">-- Geen --</option>`;
    categories.filter(c => c.type === currentMode).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === slot.categoryId) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catSelect.dataset.slotIndex = i;

    const colorSelect = document.createElement("select");
    fixedColors.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col; opt.textContent = col;
      opt.style.backgroundColor = col; opt.style.color = getContrast(col);
      if (initialColor === col) opt.selected = true;
      colorSelect.appendChild(opt);
    });
    colorSelect.dataset.slotIndex = i;

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.width = "28px"; swatch.style.height = "28px";
    swatch.style.borderRadius = "8px";
    swatch.style.border = "1px solid rgba(0,0,0,.15)";
    swatch.style.background = initialColor;

    colorSelect.addEventListener("change", () => {
      const col = colorSelect.value;
      row.style.background = col;
      row.style.color = getContrast(col);
      swatch.style.background = col;
      slots[i] = { ...(slots[i] || {}), categoryId: catSelect.value || null, color: col };
    });
    catSelect.addEventListener("change", () => {
      slots[i] = { ...(slots[i] || {}), categoryId: catSelect.value || null, color: colorSelect.value };
    });

    row.appendChild(label);
    row.appendChild(catSelect);
    row.appendChild(colorSelect);
    row.appendChild(swatch);

    row.dataset.slotIndex = i;
    modeSlotsDiv.appendChild(row);
  }

  settings.modeSlots = settings.modeSlots || {};
  settings.modeSlots[currentMode] = slots;
}

/* Opslaan van slots */
saveModeSlotsBtn && (saveModeSlotsBtn.onclick = async () => {
  const rows = Array.from(modeSlotsDiv.children);
  const newSlots = rows.map(row => {
    const selects = row.querySelectorAll("select");
    return { categoryId: selects[0].value || null, color: selects[1].value };
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

/* Kleine modale melding (witte modal) */
let _setModalBackdrop = null;
let _setModalCard = null;

function ensureSettingsModal() {
  if (!_setModalBackdrop) {
    _setModalBackdrop = document.createElement("div");
    _setModalBackdrop.className = "modal-backdrop";
    document.body.appendChild(_setModalBackdrop);
  }
  if (!_setModalCard) {
    _setModalCard = document.createElement("div");
    _setModalCard.className = "modal-card";
    _setModalCard.innerHTML = `
      <div class="modal-header">
        <h3 id="setModalTitle"></h3>
        <button class="modal-close" title="Sluiten" onclick="closeSettingsModal()">✕</button>
      </div>
      <div class="modal-body" id="setModalBody"></div>
      <div class="modal-footer" id="setModalFooter"></div>
    `;
    document.body.appendChild(_setModalCard);
  }
}
function openSettingsModal() {
  ensureSettingsModal();
  _setModalBackdrop.classList.add("open");
  _setModalBackdrop.style.display = "block";
  _setModalCard.style.display = "flex";
  _setModalBackdrop.onclick = (e) => { if (e.target === _setModalBackdrop) closeSettingsModal(); };
}
window.closeSettingsModal = function () {
  if (_setModalBackdrop) { _setModalBackdrop.classList.remove("open"); _setModalBackdrop.style.display = "none"; }
  if (_setModalCard) { _setModalCard.style.display = "none"; }
}
function showSettingsMessage(title, html) {
  openSettingsModal();
  _setModalCard.querySelector("#setModalTitle").textContent = title;
  _setModalCard.querySelector("#setModalBody").innerHTML = `<div style="text-align:center">${html}</div>`;
  const foot = _setModalCard.querySelector("#setModalFooter");
  foot.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.className = "primary";
  okBtn.textContent = "OK";
  okBtn.onclick = closeSettingsModal;
  foot.appendChild(okBtn);
}
