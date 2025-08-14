// Script/Javascript/notes.js
import {
    getFirebaseApp,
    // Auth
    getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    // Firestore
    getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
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

const newNoteBtn = document.getElementById("newNoteBtn");
const notesList = document.getElementById("notesList");

// AUTH
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
        const eb = li.querySelector('[data-edit]'); if (eb) eb.onclick = () => openNoteModal(n);
        const db = li.querySelector('[data-del]'); if (db) db.onclick = () => deleteNote(n.id);
        notesList.appendChild(li);
    });
}

newNoteBtn && (newNoteBtn.onclick = () => openNoteModal(null));

// MODAL HOOKS
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
        const payload = { title: (t.value || "").trim(), body: (b.value || "").trim(), when: w.value ? new Date(w.value) : null };
        if (!payload.title) { Modal.alert({ title: "Titel vereist", html: "Vul een titel in." }); return; }
        if (note) await updateDoc(doc(db, "notes", note.id), { ...payload, updatedAt: new Date() });
        else await addDoc(collection(db, "notes"), { ...payload, uid: currentUser?.uid || null, createdAt: new Date() });
        Modal.close();
    };
    del.onclick = async () => { if (note) { await deleteDoc(doc(db, "notes", note.id)); Modal.close(); } };

    Modal.open('modal-note');
};

// UTIL
function toInputLocal(d) { const off = d.getTimezoneOffset(); const local = new Date(d.getTime() - off * 60000); return local.toISOString().slice(0, 16); }
function formatLocalDatetime(ts) { const d = new Date(ts.seconds ? ts.seconds * 1000 : ts); return d.toLocaleString(); }
function escapeHtml(s = "") { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
