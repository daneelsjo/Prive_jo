import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

// 🔧 Vul hieronder je eigen Firebase-config in
// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDo_zVn_4H1uM7EU-LhQV5XOYBcJmZ0Y3o",
  authDomain: "prive-jo.firebaseapp.com",
  projectId: "prive-jo",
  storageBucket: "prive-jo.firebasestorage.app",
  messagingSenderId: "849510732758",
  appId: "1:849510732758:web:6c506a7f7adcc5c1310a77",
  measurementId: "G-HN213KC33L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const db = getFirestore(app);
const auth = getAuth();

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");
const postits = document.getElementById("postits");
const uncategorized = document.getElementById("uncategorized");

loginBtn.onclick = () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).then((result) => {
    const allowedEmails = [
      "jonathan.daneels@brandweer.zonerand.be",
      "daneelsjo88@gmail.com"
    ];
    const userEmail = result.user.email;

    if (!allowedEmails.includes(userEmail)) {
      alert("Je hebt geen toegang tot deze toepassing.");
      signOut(auth);
    }
  }).catch((error) => {
    console.error("Login mislukt:", error);
  });
};

logoutBtn.onclick = () => {
  signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    listenToTodos();
  } else {
    authDiv.style.display = "block";
    appDiv.style.display = "none";
  }
});

const baseColors = [
  "#FFEB3B", "#F44336", "#4CAF50", "#2196F3",
  "#9C27B0", "#FF9800", "#00BCD4", "#8BC34A",
  "#E91E63", "#3F51B5", "#CDDC39", "#607D8B",
  "#795548", "#009688", "#673AB7"
];

function getContrast(hex) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? "#000" : "#fff";
}

let categories = {};

function listenToTodos() {
  onSnapshot(collection(db, "todos"), (snapshot) => {
    const todos = [];
    snapshot.forEach((doc) => todos.push({ id: doc.id, ...doc.data() }));
    renderTodos(todos);
  });
}

function renderTodos(todos) {
  postits.innerHTML = "";
  uncategorized.innerHTML = "";

  const grouped = todos.reduce((acc, todo) => {
    const cat = todo.category || null;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(todo);
    return acc;
  }, {});

  const usedCats = Object.keys(grouped).filter(c => c);

  usedCats.slice(0, 4).forEach((cat) => {
    const color = categories[cat] || baseColors[Math.floor(Math.random() * baseColors.length)];
    categories[cat] = color;
    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = color;
    box.style.color = getContrast(color);
    box.innerHTML = `<strong>${cat}</strong>`;
    grouped[cat].forEach(todo => {
      const el = createTodoElement(todo);
      box.appendChild(el);
    });
    postits.appendChild(box);
  });

  (grouped[null] || []).forEach(todo => {
    const el = createTodoElement(todo);
    const box = document.createElement("div");
    box.className = "postit";
    box.style.background = "#ddd";
    box.style.color = "#000";
    box.appendChild(el);
    uncategorized.appendChild(box);
  });
}

function createTodoElement(todo) {
  const el = document.createElement("div");
  el.className = "todo" + (todo.done ? " done" : "");
  el.innerHTML = `
    <span>${todo.name}</span>
    <button onclick="toggleDone('${todo.id}', ${todo.done})">✔️</button>
  `;
  return el;
}

window.toggleDone = async (id, done) => {
  const ref = doc(db, "todos", id);
  await updateDoc(ref, { done: !done });
};

document.getElementById("toggleForm").onclick = () => {
  const form = document.getElementById("formContainer");
  form.style.display = form.style.display === "none" ? "block" : "none";
};

document.getElementById("addTodo").onclick = async () => {
  const name = document.getElementById("name").value;
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const category = document.getElementById("category").value;
  const color = categories[category] || baseColors[Math.floor(Math.random() * baseColors.length)];
  await addDoc(collection(db, "todos"), {
    name,
    start,
    end,
    category,
    color,
    done: false
  });
  document.getElementById("name").value = "";
  document.getElementById("start").value = "";
  document.getElementById("end").value = "";
  document.getElementById("category").value = "";
  document.getElementById("formContainer").style.display = "none";
};
