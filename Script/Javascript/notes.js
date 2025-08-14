// Script/Javascript/notes.js
import {
    getFirebaseApp,
    // Auth
    getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    // Firestore
    getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc,
    query, orderBy
} from "./firebase-config.js";

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let notes = [];

const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");

const addNoteBtn = document.getElementById("addNoteBtn");
const notesList = document.getElementById("notesList");

// ---- AUTH ----
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    if (authDiv) authDiv.style.display = "none";
    if (appDiv) appDiv.style.display = "block";
    subscribeNotes();
});

function subscribeNotes() {
    const q = query(collection(db, "notes"), orderBy("when", "desc"));
    onSnapshot(q, (snap) => {
        notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotes();
    });
}

// ---- RENDER ----
function renderNotes() {
    if (!notesList) return;
    notesList.innerHTML = "";
    notes.forEach(n => {
        const li = document.createElement("div");
        li.className = "note-row";
        const when = n.when ? formatLocalDatetime(n.when) : "";
        li.innerHTML = `
      <div class="note-head">
        <strong>${escapeHtml(n.title || "(zonder titel)")}</strong>
        <span class="note-when">${when}</span>
      </div>
      <div class="note-body">${escapeHtml(n.body || "")}</div>
      <div class="note-actions">
        <button class="btn" data-edit="${n.id}">✏️ Bewerken</button>
        <button class="btn danger" data-del="${n.id}">🗑️ Verwijderen</button>
      </div>
    `;

        const editBtn = li.querySelector('[data-edit]');
        if (editBtn) editBtn.onclick = () => openNoteModal(n);

        const delBtn = li.querySelector('[data-del]');
        if (delBtn) delBtn.onclick = () => deleteNote(n.id);

        notesList.appendChild(li);
    });
}

addNoteBtn && (addNoteBtn.onclick = () => openNoteModal(null));

// ---- MODAL HOOKS ----
window.openNoteModal = function (note = null) {
    const titleEl = document.getElementById('modal-note-title');
    const t = document.getElementById('note-title');
    const w = document.getElementById('note-when');
    const b = document.getElementById('note-body');
    const save = document.getElementById('note-save');
    const del = document.getElementById('note-delete');

    if (note) {
        titleEl.textContent = "Notitie bewerken";
        t.value = note.title || "";
        b.value = note.body || "";
        if (note.when) {
            const d = new Date(note.when.seconds ? note.when.seconds * 1000 : note.when);
            w.value = toInputLocal(d);
        } else { w.value = ""; }
        del.style.display = "";
    } else {
        titleEl.textContent = "Nieuwe notitie";
        t.value = ""; w.value = ""; b.value = "";
        del.style.display = "none";
    }

    save.onclick = async () => {
        const payload = {
            title: (t.value || "").trim(),
            body: (b.value || "").trim(),
            when: w.value ? new Date(w.value) : null
        };
        if (!payload.title) { Modal.alert({ title: "Titel vereist", html: "Vul een titel in." }); return; }
        if (note) await updateExistingNote(note.id, payload);
        else await createNewNote(payload);
        Modal.close();
    };
    del.onclick = async () => { if (note) { await deleteNote(note.id); Modal.close(); } };

    Modal.open('modal-note');
};

// ---- CRUD ----
async function createNewNote(data) {
    await addDoc(collection(db, "notes"), {
        ...data,
        uid: currentUser?.uid || null,
        createdAt: new Date()
    });
}
async function updateExistingNote(id, data) {
    await updateDoc(doc(db, "notes", id), { ...data, updatedAt: new Date() });
}
async function deleteNote(id) {
    await deleteDoc(doc(db, "notes", id));
}

// ---- UTIL ----
function toInputLocal(d) {
    // maakt yyyy-MM-ddTHH:mm (zonder TZ) in lokale tijd
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
}
function formatLocalDatetime(ts) {
    const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleString();
}
function escapeHtml(s = "") {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
