// Script/Javascript/settings.js
window.DEBUG = true;
const log = (...a) => window.DEBUG && console.log(...a);

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

/** Vaste kleuren (enige toegelaten keuzes) */
const fixedColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"];
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
  Modal.alert({ title: "Weergave", html: "Opgeslagen." });
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

/* Categorie toevoegen (max 6 per modus) — met default kleur uit vaste lijst */
addCatBtn && (addCatBtn.onclick = async () => {
  const name = (catName.value || "").trim();
  const type = (catType.value || "werk").toLowerCase();

  if (!name) { showSettingsMessage("Categorie niet aangemaakt", "Vul een categorienaam in."); return; }

  const listInMode = (categories || []).filter(c => c && c.type === type && c.active !== false);
  if (listInMode.length >= MAX_CATEGORIES_PER_MODE) {
    showSettingsMessage("Categorie niet aangemaakt", `⚠️ Er zijn al <strong>${MAX_CATEGORIES_PER_MODE}</strong> categorieën in modus <strong>${type}</strong>.`);
    return;
  }

  const color = defaultColorFor(type, listInMode.length);
  await addDoc(collection(db, "categories"), { name, type, active: true, color });
  catName.value = "";
});

/* === Categorie-lijst: links swatch, midden kleurkeuze (palet zonder hexcodes), rechts acties === */
function renderCatList() {
  if (!catList) return;
  catList.innerHTML = "";
  const grouped = { werk: [], prive: [] };
  categories.forEach(c => grouped[c.type]?.push(c));

  ["werk", "prive"].forEach(type => {
    const block = document.createElement("div");
    block.style.marginBottom = ".75rem";
    block.innerHTML = `<h3 style="margin:.25rem 0; text-align:center;">${type.toUpperCase()}</h3>`;

    grouped[type].forEach((c, idx) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "32px 1fr 40px auto"; // swatch | naam | kleurknop | acties
      row.style.alignItems = "center";
      row.style.gap = ".5rem";
      row.style.padding = ".25rem 0";
      row.style.position = "relative";

      // 1) Kleurvakje vóór de naam
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = normalizeHex(c.color || defaultColorFor(c.type, idx));

      // 2) Naam
      const nameSpan = document.createElement("span");
      nameSpan.textContent = c.name;

      // 3) Kleurkeuze (palet)
      const picker = makeColorPicker(normalizeHex(c.color || defaultColorFor(c.type, idx)), async (val) => {
        sw.style.background = val;
        await updateDoc(doc(db, "categories", c.id), { color: val });
        renderModeSlots(); // update de previews onderaan
      });

      // 4) Acties
      const actions = document.createElement("div");
      actions.style.display = "flex"; actions.style.alignItems = "center";

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

      row.append(sw, nameSpan, picker, actions);
      block.appendChild(row);
    });

    catList.appendChild(block);
  });
}

/* Custom kleurpicker (zonder tekst) */
function makeColorPicker(initialColor, onPick) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";

  const btn = document.createElement("button");
  btn.className = "color-btn";
  btn.title = "Kleur kiezen";
  btn.style.background = initialColor;
  wrap.appendChild(btn);

  const pop = document.createElement("div");
  pop.className = "color-pop";
  fixedColors.forEach(col => {
    const o = document.createElement("button");
    o.className = "color-option";
    o.style.background = col;
    o.onclick = (e) => {
      e.preventDefault();
      btn.style.background = col;
      onPick(col.toUpperCase());
      close();
    };
    pop.appendChild(o);
  });

  function open() {
    if (wrap.querySelector(".color-pop")) return;
    wrap.appendChild(pop);
    requestAnimationFrame(() => pop.classList.add("open"));
    document.addEventListener("click", onDocClick, true);
  }
  function close() {
    pop.classList.remove("open");
    pop.remove();
    document.removeEventListener("click", onDocClick, true);
  }
  function onDocClick(e) {
    if (!wrap.contains(e.target)) close();
  }
  btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); wrap.querySelector(".color-pop") ? close() : open(); });

  return wrap;
}

function normalizeHex(v) {
  if (!v) return "#FFFFFF";
  if (v.length === 4 && v.startsWith("#")) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return v.toUpperCase();
}

window.archiveCategory = async function (id) {
  await updateDoc(doc(db, "categories", id), { active: false });
};

/* Hernoemen categorie (via Modal) */
function showSettingsMessage(title, html) {
  Modal.alert({ title, html });
}
window.editCategory = function (id) {
  const cat = categories.find(x => x.id === id);
  if (!cat) return;

  document.getElementById('modal-rename-title').textContent = "Categorie hernoemen";
  const input = document.getElementById('rename-input');
  input.value = cat.name;

  const save = document.getElementById('rename-save');
  const cancel = document.getElementById('rename-cancel');

  save.onclick = async () => {
    const newName = (input.value || "").trim();
    if (!newName) { Modal.alert({ title: "Ongeldige naam", html: "Geef een naam op." }); return; }
    const dup = categories.some(x =>
      x.id !== cat.id &&
      x.type === cat.type &&
      x.active !== false &&
      (x.name || "").toLowerCase() === newName.toLowerCase()
    );
    if (dup) { Modal.alert({ title: "Naam bestaat al", html: `Er bestaat al een categorie “${newName}” in modus ${cat.type}.` }); return; }

    await updateDoc(doc(db, "categories", id), { name: newName });
    Modal.close();
  };
  cancel.onclick = () => Modal.close();

  Modal.open('modal-rename');
};

/* === Post-its per modus: neutrale rijen, enkel preview-swatch rechts === */
function renderModeSlots() {
  if (!modeSlotsDiv) return;
  modeSlotsDiv.innerHTML = "";

  const slots = (settings.modeSlots?.[currentMode] || Array(6).fill({})).slice(0, 6);

  for (let i = 0; i < 6; i++) {
    const slot = slots[i] || {};
    const row = document.createElement("div");
    row.className = "mode-slot-row";

    const label = document.createElement("span");
    label.textContent = `Post-it ${i + 1}:`;
    label.style.fontWeight = "500";

    const catSelect = document.createElement("select");
    catSelect.innerHTML = `<option value="">-- Geen --</option>`;
    categories.filter(c => c.type === currentMode).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.name;
      if (c.id === slot.categoryId) opt.selected = true;
      catSelect.appendChild(opt);
    });

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    const catDoc = categories.find(c => c.id === slot.categoryId && c.type === currentMode);
    const col = normalizeHex(catDoc?.color || defaultColorFor(currentMode, i));
    swatch.style.background = col;

    catSelect.addEventListener("change", () => {
      const chosen = categories.find(x => x.id === catSelect.value && x.type === currentMode);
      const newCol = normalizeHex(chosen?.color || defaultColorFor(currentMode, i));
      swatch.style.background = newCol;
      slots[i] = { categoryId: catSelect.value || null }; // kleur niet opslaan
    });

    row.append(label, catSelect, swatch);
    row.dataset.slotIndex = i;
    modeSlotsDiv.appendChild(row);
  }

  settings.modeSlots = settings.modeSlots || {};
  settings.modeSlots[currentMode] = slots;
}

/* Opslaan: alleen categoryId */
saveModeSlotsBtn && (saveModeSlotsBtn.onclick = async () => {
  const rows = Array.from(modeSlotsDiv.children);
  const newSlots = rows.map(row => {
    const select = row.querySelector("select");
    return { categoryId: select.value || null };
  });
  settings.modeSlots = settings.modeSlots || {};
  settings.modeSlots[currentMode] = newSlots;
  await setDoc(doc(db, "settings", currentUser.uid), settings, { merge: true });
  Modal.alert({ title: "Post-its", html: "Opgeslagen!" });
});
