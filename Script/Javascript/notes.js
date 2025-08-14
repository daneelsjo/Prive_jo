// Script/Javascript/notes.js

window.DEBUG = true;
const log = (...a) => window.DEBUG && console.log(...a);
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
// LET OP: tabel-body
const notesBody = document.getElementById("notesBody");

// AUTH
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    authDiv && (authDiv.style.display = "none");
    appDiv && (appDiv.style.display = "block");
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
    if (!notesBody) return;
    notesBody.innerHTML = notes.map(n => {
        const when = n.when ? formatLocalDatetime(n.when) : "";
        return `
      <tr data-id="${n.id}">
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(n.title || "(zonder titel)")}</td>
      </tr>`;
    }).join("");

    // rij-klik = bewerken
    notesBody.querySelectorAll("tr").forEach(tr => {
        tr.onclick = () => {
            const id = tr.getAttribute("data-id");
            const note = notes.find(x => x.id === id);
            if (note) openNoteModal(note);
        };
    });
}

newNoteBtn && (newNoteBtn.onclick = () => openNoteModal(null));

// MODAL
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
        t.value = ""; b.value = ""; w.value = "";
        del.style.display = "none";
    }

    save.onclick = async () => {
        const payload = {
            title: (t.value || "").trim(),
            body: (b.value || "").trim(),
            when: w.value ? new Date(w.value) : null
        };
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
