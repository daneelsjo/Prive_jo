import {
  getFirebaseApp,
  // Firestore
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc,
  // Auth
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "./firebase-config.js";

/** Firebase init */
const app = getFirebaseApp();
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
let categories = []; // {id,name,type,active,color?}
let settings = {};
let currentMode = "werk";

/** Kleuren */
const fixedColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3",
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#00BCD4", "#009688", "#8BC34A", "#CDDC39",
  "#FFC107", "#FF9800", "#795548"
];
const defaultColorFor = (type, idx) => fixedColors[idx % fixedColors.length];

/* Auth */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  authDiv && (authDiv.style.display = "none");
  appDiv && (appDiv.style.display = "block");

  await loadSettings();
  applyTheme(settings.theme || "system");

  // Icon toggle voor modus
  if (modeSwitchSettings) {
    currentMode = settings.preferredMode || "werk";
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

/* Categorie toevoegen (max 6 per modus) — met default kleur per modus */
addCatBtn && (addCatBtn.onclick = async () => {
  const name = (catName.value || "").trim();
  const type = (catType.value || "werk").toLowerCase();

  if (!name) {
    showSettingsMessage("Categorie niet aangemaakt", "Vul een categorienaam in.");
    return;
  }

  const listInMode = (categories || []).filter(c => c && c.type === type && c.active !== false);
  if (listInMode.length >= MAX_CATEGORIES_PER_MODE) {
    showSettingsMessage(
      "Categorie niet aangemaakt",
      `⚠️ Er zijn al <strong>${MAX_CATEGORIES_PER_MODE}</strong> categorieën in modus <strong>${type}</strong>.`
    );
    return;
  }

  const color = defaultColorFor(type, listInMode.length);
  await addDoc(collection(db, "categories"), { name, type, active: true, color });
  catName.value = "";
});

/* Categorie-lijst met kleurkeuze + bewerken + archiveren */
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
      row.style.display = "grid";
      row.style.gridTemplateColumns = "48px 1fr auto";
      row.style.alignItems = "center";
      row.style.gap = ".5rem";
      row.style.padding = ".25rem 0";

      // Kleurkiezer (type=color)
      const colorWrap = document.createElement("div");
      colorWrap.style.display = "flex";
      colorWrap.style.alignItems = "center";
      colorWrap.style.justifyContent = "center";

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = normalizeHex(c.color || defaultColorFor(c.type, 0));
      colorInput.title = "Kleur van deze categorie";
      colorInput.style.width = "32px";
      colorInput.style.height = "28px";
      colorInput.style.border = "1px solid var(--border)";
      colorInput.style.borderRadius = "6px";
      colorInput.onchange = async () => {
        const val = normalizeHex(colorInput.value);
        await updateDoc(doc(db, "categories", c.id), { color: val });
      };
      colorWrap.appendChild(colorInput);

      const nameSpan = document.createElement("span");
      nameSpan.textContent = c.name;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.alignItems = "center";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-icon sm neutral";
      editBtn.title = "Categorie hernoemen";
      editBtn.textContent = "✏️";
      editBtn.onclick = () => editCategory(c.id);

      const delBtn = document.createElement("button");
      delBtn.className = "btn-icon sm danger";
      delBtn.title = "Categorie verwijderen";
      delBtn.textContent = "🗑️";
      delBtn.onclick = () => archiveCategory(c.id);

      actions.append(editBtn, delBtn);
      row.append(colorWrap, nameSpan, actions);
      block.appendChild(row);
    });

    catList.appendChild(block);
  });
}

function normalizeHex(v) {
  // Browser kan #fff geven; we willen altijd 7 chars.
  if (!v) return "#ffffff";
  if (v.length === 4 && v.startsWith("#")) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return v.toUpperCase();
}

window.archiveCategory = async function (id) {
  await updateDoc(doc(db, "categories", id), { active: false });
};

/* Hernoemen categorie */
window.editCategory = function (id) {
  const cat = categories.find(x => x.id === id);
  if (!cat) return;

  openSettingsModal();
  const titleEl = _setModalCard.querySelector("#setModalTitle");
  const bodyEl = _setModalCard.querySelector("#setModalBody");
  const footEl = _setModalCard.querySelector("#setModalFooter");

  titleEl.textContent = "Categorie hernoemen";
  bodyEl.innerHTML = ""; footEl.innerHTML = "";

  const label = document.createElement("label");
  label.textContent = `Nieuwe naam voor “${cat.name}”`;
  const input = document.createElement("input");
  input.id = "editCatName";
  input.value = cat.name;
  input.style.width = "100%";

  bodyEl.append(label, input);

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.textContent = "💾 Opslaan";
  saveBtn.onclick = async () => {
    const newName = (input.value || "").trim();
    if (!newName) { alert("Geef een naam op."); return; }

    const dup = categories.some(x =>
      x.id !== cat.id &&
      x.type === cat.type &&
      x.active !== false &&
      (x.name || "").toLowerCase() === newName.toLowerCase()
    );
    if (dup) { showSettingsMessage("Naam bestaat al", `Er bestaat al een categorie “${newName}” in modus ${cat.type}.`); return; }

    await updateDoc(doc(db, "categories", id), { name: newName });
    closeSettingsModal();
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "primary";
  cancelBtn.style.background = "#6b7280";
  cancelBtn.textContent = "Annuleren";
  cancelBtn.onclick = closeSettingsModal;

  footEl.append(saveBtn, cancelBtn);
};

/* ModeSlots (6 slots per modus) — GEEN kleurkeuze meer hier */
function renderModeSlots() {
  if (!modeSlotsDiv) return;
  modeSlotsDiv.innerHTML = "";

  // Slots uit settings (oude struct met {categoryId,color} wordt ondersteund; kleur wordt genegeerd)
  const slots = (settings.modeSlots?.[currentMode] || Array(6).fill({})).slice(0, 6);

  for (let i = 0; i < 6; i++) {
    const slot = slots[i] || {};
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "110px 1fr 40px";
    row.style.alignItems = "center";
    row.style.gap = ".6rem";
    row.style.borderRadius = "10px";
    row.style.padding = ".5rem .6rem";
    row.style.marginBottom = ".6rem";

    // Bepaal kleur op basis van gekozen categorie (of fallback)
    const catDoc = categories.find(c => c.id === slot.categoryId && c.type === currentMode);
    const chosenColor = normalizeHex(catDoc?.color || defaultColorFor(currentMode, i));
    row.style.background = chosenColor;
    row.style.color = getContrast(chosenColor);

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

    const swatch = document.createElement("div");
    swatch.style.width = "28px";
    swatch.style.height = "28px";
    swatch.style.borderRadius = "8px";
    swatch.style.border = "1px solid rgba(0,0,0,.15)";
    swatch.style.background = chosenColor;

    catSelect.addEventListener("change", () => {
      const c = categories.find(x => x.id === catSelect.value);
      const col = normalizeHex(c?.color || defaultColorFor(currentMode, i));
      row.style.background = col;
      row.style.color = getContrast(col);
      swatch.style.background = col;
      slots[i] = { categoryId: catSelect.value || null }; // kleur NIET meer bewaren
    });

    row.append(label, catSelect, swatch);
    row.dataset.slotIndex = i;
    modeSlotsDiv.appendChild(row);
  }

  settings.modeSlots = settings.modeSlots || {};
  settings.modeSlots[currentMode] = slots;
}

/* Opslaan van slots (alleen categoryId) */
saveModeSlotsBtn && (saveModeSlotsBtn.onclick = async () => {
  const rows = Array.from(modeSlotsDiv.children);
  const newSlots = rows.map(row => {
    const select = row.querySelector("select");
    return { categoryId: select.value || null }; // kleur niet meer opslaan
  });
  settings.modeSlots = settings.modeSlots || {};
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
