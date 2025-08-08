import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

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

const loginBtn = document.getElementById("login-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");
const categorySelectors = document.getElementById("categorySelectors");
const saveSettingsBtn = document.getElementById("saveSettings");

let currentUser = null;
let allTodos = [];
let postitSettings = {};
const colors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FFC107", "#FF9800", "#795548"];

loginBtn.onclick = () => signInWithPopup(auth, provider);
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    await loadTodos();
    await loadSettings();
    renderCategorySelectors();
  }
});

async function loadTodos() {
  const snap = await getDoc(doc(db, "todos", "dummy")); // om de structuur te activeren
  const q = await getDoc(doc(db, "settings", "dummy"));
  // dit stuk wordt normaal vervangen door snapshotlistener
  const coll = collection(db, "todos");
  const snapshot = await getDocs(coll);
  allTodos = [];
  snapshot.forEach((doc) => allTodos.push(doc.data()));
}

async function loadSettings() {
  const ref = doc(db, "settings", currentUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    postitSettings = snap.data().postits || {};
  }
}

function renderCategorySelectors() {
  categorySelectors.innerHTML = "";
  const uniqueCats = [...new Set(allTodos.map(t => t.category).filter(Boolean))];

  for (let i = 0; i < 4; i++) {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "1em";

    const label = document.createElement("label");
    label.textContent = `Post-it ${i + 1}`;
    wrapper.appendChild(label);
    wrapper.appendChild(document.createElement("br"));

    const select = document.createElement("select");
    select.dataset.index = i;
    select.innerHTML = `<option value="">(leeg)</option>` + uniqueCats.map(cat => {
      return `<option value="${cat}" ${postitSettings[i]?.category === cat ? "selected" : ""}>${cat}</option>`;
    }).join("");

    const colorSelect = document.createElement("select");
    colorSelect.dataset.index = i;
    colors.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.style.backgroundColor = c;
      opt.style.color = getContrast(c);
      opt.textContent = c;
      if (postitSettings[i]?.color === c) opt.selected = true;
      colorSelect.appendChild(opt);
    });

    wrapper.appendChild(select);
    wrapper.appendChild(colorSelect);
    categorySelectors.appendChild(wrapper);
  }
}

saveSettingsBtn.onclick = async () => {
  const selects = categorySelectors.querySelectorAll("select");
  const newSettings = {};
  for (let i = 0; i < selects.length; i += 2) {
    const category = selects[i].value;
    const color = selects[i + 1].value;
    newSettings[i / 2] = { category, color };
  }

  await setDoc(doc(db, "settings", currentUser.uid), { postits: newSettings });
  alert("Instellingen opgeslagen!");
};

function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}
