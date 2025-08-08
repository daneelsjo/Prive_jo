import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc
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

// Init
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Elements
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
const uncategorizedList = document.getElementById("uncategorized-list");const description = document.getElementById("description").value.trim();
const link = document.getElementById("link").value.trim();



let currentUser = null;
let allTodos = [];
let postitSettings = {};
const defaultColors = ["#FFEB3B", "#F44336", "#4CAF50", "#2196F3"];

// Login
loginBtn.onclick = () => signInWithPopup(auth, provider);

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    listenToTodos();
    await loadSettings();
  }
});

// Luister naar todos
function listenToTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    allTodos = [];
    snapshot.forEach((doc) => {
      allTodos.push({ id: doc.id, ...doc.data() });
    });
    renderTodos();
    updateCategorySuggestions();
  });
}

// Formulier toggle
newTaskBtn.onclick = () => {
  formContainer.style.display = formContainer.style.display === "none" ? "block" : "none";
};

// Nieuwe todo toevoegen
addTodoBtn.onclick = async () => {
  const name = nameInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;
  const category = categoryInput.value.trim();
  const description = document.getElementById("description").value.trim();
const link = document.getElementById("link").value.trim();


  if (!name) return alert("Vul een naam in");

  await addDoc(collection(db, "todos"), {
    name, start, end, category, description, link, done: false
  });

  nameInput.value = "";
  startInput.value = "";
  endInput.value = "";
  categoryInput.value = "";
};

// Post-its tonen
function renderTodos() {
  postits.innerHTML = "";
  uncategorizedList.innerHTML = "";

  const grouped = {};
  allTodos.forEach(todo => {
    const cat = todo.category || "UNCAT";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(todo);
  });

  for (let i = 0; i < 4; i++) {
    const setting = postitSettings[i];
    if (!setting || !setting.category || !grouped[setting.category]) continue;

    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = setting.color || defaultColors[i];
    box.style.color = getContrast(setting.color || defaultColors[i]);
    box.innerHTML = `<strong>${setting.category}</strong><br/>`;

    grouped[setting.category].forEach(todo => {
      const div = document.createElement("div");
      div.innerHTML = `• ${todo.name} (${todo.start || "?"} - ${todo.end || "?"}) 
  <button style="float:right;" onclick="markDone('${todo.id}', ${!todo.done})">
    ${todo.done ? "✅" : "☐"}
  </button>`;

      if (todo.done) {
        div.style.textDecoration = "line-through";
        div.style.opacity = "0.6";
      }
      div.onclick = () => showTaskDetail(todo);
      box.appendChild(div);
    });

    postits.appendChild(box);
  }

  // Overige taken zonder geldige categorie
  const activeCategories = new Set(Object.values(postitSettings).map(p => p?.category));
  grouped["UNCAT"]?.forEach(todo => appendToUncategorized(todo));
  Object.entries(grouped).forEach(([cat, todos]) => {
    if (!activeCategories.has(cat) && cat !== "UNCAT") {
      todos.forEach(todo => appendToUncategorized(todo));
    }
  });
}

function appendToUncategorized(todo) {
  const div = document.createElement("div");
  div.textContent = `${todo.name} (${todo.category || "geen categorie"})`;
  div.onclick = () => toggleDone(todo.id, !todo.done);
  uncategorizedList.appendChild(div);
}

// Toggle done
async function toggleDone(id, status) {
  await setDoc(doc(db, "todos", id), { done: status }, { merge: true });
}

// Categorie suggesties
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

// Contrastkleur
function getContrast(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

// Instellingen laden
async function loadSettings() {
  const settingsDoc = await getDoc(doc(db, "settings", currentUser.uid));
  if (settingsDoc.exists()) {
    postitSettings = settingsDoc.data().postits || {};
    renderTodos();
  }
}
function showTaskDetail(todo) {
  const panel = document.getElementById("taskDetailPanel");
  panel.style.display = "block";

  panel.innerHTML = `
    <h3>${todo.name}</h3>
    <label>Omschrijving:</label>
    <textarea id="editDesc">${todo.description || ""}</textarea>
    <label>Link:</label>
    <input id="editLink" value="${todo.link || ""}" />
    <br/>
    <button onclick="saveTask('${todo.id}')">💾 Opslaan</button>
    <button onclick="closeTaskDetail()">❌ Sluiten</button>
  `;
}

window.saveTask = async function(id) {
  const newDesc = document.getElementById("editDesc").value;
  const newLink = document.getElementById("editLink").value;
  await setDoc(doc(db, "todos", id), {
    description: newDesc,
    link: newLink
  }, { merge: true });
  alert("Wijzigingen opgeslagen!");
}

window.closeTaskDetail = function() {
  const panel = document.getElementById("taskDetailPanel");
  panel.style.display = "none";
  panel.innerHTML = "";
}
window.markDone = async function(id, status) {
  await setDoc(doc(db, "todos", id), { done: status }, { merge: true });
}
