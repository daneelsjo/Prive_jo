import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot
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
const auth = getAuth();

const loginBtn = document.getElementById("login-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");

const categorySelectors = document.getElementById("categorySelectors");
const saveSettingsBtn = document.getElementById("saveSettings");

let currentUser = null;
let postitSettings = {};
let allTodos = [];

loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    await loadSettings();
    listenToTodos();
  } else {
    authDiv.style.display = "block";
    appDiv.style.display = "none";
  }
});

async function loadSettings() {
  const ref = doc(db, "settings", auth.currentUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    postitSettings = snap.data().postits || {};
  } else {
    postitSettings = {};
  }
}

function listenToTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    allTodos = [];
    snapshot.forEach((doc) => allTodos.push({ id: doc.id, ...doc.data() }));
    renderCategorySelectors();
  });
}

function renderCategorySelectors() {
  categorySelectors.innerHTML = "";
  const uniqueCats = [...new Set(allTodos.map(t => t.category).filter(Boolean))];
  for (let i = 0; i < 4; i++) {
    const select = document.createElement("select");
    select.innerHTML = `<option value="">(leeg)</option>` + uniqueCats.map(c => {
      return `<option value="${c}" ${postitSettings[i] === c ? "selected" : ""}>${c}</option>`;
    }).join("");
    select.dataset.index = i;
    categorySelectors.appendChild(select);
  }
}

saveSettingsBtn.onclick = async () => {
  const selects = categorySelectors.querySelectorAll("select");
  selects.forEach(sel => {
    postitSettings[sel.dataset.index] = sel.value;
  });
  await setDoc(doc(db, "settings", currentUser.uid), { postits: postitSettings });
  alert("Instellingen opgeslagen!");
};