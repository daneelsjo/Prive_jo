import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

// Firebase config
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
const newTaskBtn = document.getElementById("newTaskBtn");
const formContainer = document.getElementById("formContainer");
const addTodoBtn = document.getElementById("addTodo");
const nameInput = document.getElementById("name");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const categoryInput = document.getElementById("category");
const categoryList = document.getElementById("categoryList");
const postits = document.getElementById("postits");

let currentUser = null;
let allTodos = [];
let postitSettings = {};
const baseColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3"];

// Auth
loginBtn.onclick = () => signInWithPopup(auth, provider);
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    listenToTodos();
    loadSettings();
  }
});

// Luister naar Firestore
function listenToTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    allTodos = [];
    snapshot.forEach((doc) => allTodos.push({ id: doc.id, ...doc.data() }));
    renderTodos();
    updateCategorySuggestions();
  });
}

// Formulier tonen/verbergen
newTaskBtn.onclick = () => {
  formContainer.style.display = formContainer.style.display === "none" ? "block" : "none";
};

// Todo toevoegen
addTodoBtn.onclick = async () => {
  const name = nameInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;
  const category = categoryInput.value.trim();

  if (!name) return alert("Vul een naam in");
  await addDoc(collection(db, "todos"), {
    name, start, end, category, done: false
  });

  nameInput.value = "";
  startInput.value = "";
  endInput.value = "";
  categoryInput.value = "";
};

// Post-its tonen
function renderTodos() {
  postits.innerHTML = "";
  const grouped = {};
  allTodos.forEach(todo => {
    if (!grouped[todo.category]) grouped[todo.category] = [];
    grouped[todo.category].push(todo);
  });

  for (let i = 0; i < 4; i++) {
    const setting = postitSettings[i];
    if (!setting || !setting.category || !grouped[setting.category]) continue;

    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = setting.color || baseColors[i];
    box.style.color = getContrast(setting.color || baseColors[i]);
    box.innerHTML = `<strong>${setting.category}</strong>`;

    grouped[setting.category].forEach(todo => {
      const div = document.createElement("div");
      div.textContent = `• ${todo.name}`;
      if (todo.done) {
        div.style.textDecoration = "line-through";
        div.style.opacity = "0.6";
      }
      div.onclick = () => toggleDone(todo.id, !todo.done);
      box.appendChild(div);
    });

    postits.appendChild(box);
  }
}

// Done toggle
async function toggleDone(id, status) {
  await setDoc(doc(db, "todos", id), { done: status }, { merge: true });
}

// Contrastkleur berekenen
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

// Suggesties voor categorie
function updateCategorySuggestions() {
  categoryList.innerHTML = "";
  const unique = new Set();
  allTodos.forEach(todo => {
    if (todo.category) unique.add(todo.category);
  });
  unique.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    categoryList.appendChild(opt);
  });
}

// Instellingen ophalen
async function loadSettings() {
  const settingsDoc = await doc(db, "settings", currentUser.uid);
  const snap = await getDoc(settingsDoc);
  if (snap.exists()) {
    postitSettings = snap.data().postits || {};
    renderTodos();
  }
}
