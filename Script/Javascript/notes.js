// Script/Javascript/notes.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* Elements */
const loginBtn = document.getElementById("login-btn");
const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");
const newNoteBtn = document.getElementById("newNoteBtn");
const notesBody = document.getElementById("notesBody");

/* Modal */
let _modalBackdrop = null;
let _modalCard = null;
function ensureModal() {
    if (!_modalBackdrop) {
        _modalBackdrop = document.createElement("div");
        _modalBackdrop.className = "modal-backdrop";
        document.body.appendChild(_modalBackdrop);
    }
    if (!_modalCard) {
        _modalCard = document.createElement("div");
        _modalCard.className = "modal-card";
        _modalCard.innerHTML = `
      <div class="modal-header">
        <h3 id="modalTitle"></h3>
        <button class="modal-close" title="Sluiten" onclick="closeNoteModal()">✕</button>
      </div>
      <div class="modal-body" id="modalBody"></div>
      <div class="modal-footer" id="modalFooter"></div>
    `;
        document.body.appendChild(_modalCard);
    }
}
function openModal() {
    ensureModal();
    _modalBackdrop.classList.add("open");
    _modalBackdrop.style.display = "block";
    _modalCard.style.display = "flex";
    _modalBackdrop.onclick = (e) => { if (e.target === _modalBackdrop) closeNoteModal(); };
}
window.closeNoteModal = function () {
    if (_modalBackdrop) { _modalBackdrop.classList.remove("open"); _modalBackdrop.style.display = "none"; }
    if (_modalCard) { _modalCard.style.display = "none"; }
};
function btn(cls, label, onClick) {
    const b = document.createElement("button");
    b.className = cls; b.textContent = label; b.onclick = onClick; return b;
}

/* AUTH */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));
onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    authDiv.style.display = "none";
    appDiv.style.display = "block";
    subscribeNotes();
});

/* DATA */
let notes = []; // {id, title, time ISO, body, createdAt, updatedAt}

function subscribeNotes() {
    const q = query(collection(db, "notes"), orderBy("time", "asc"));
    onSnapshot(q, (snap) => {
        notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotes();
    });
}

function renderNotes() {
    notesBody.innerHTML = "";
    notes.forEach(n => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${formatLocal(n.time)}</td>
      <td>${escapeHtml(n.title || "(geen titel)")}</td>
    `;
        tr.addEventListener("click", () => openNoteEditor(n));
        notesBody.appendChild(tr);
    });
}

/* UI: nieuw / edit */
newNoteBtn?.addEventListener("click", () => openNoteEditor());

function openNoteEditor(note = null) {
    openModal();
    const titleEl = _modalCard.querySelector("#modalTitle");
    const bodyEl = _modalCard.querySelector("#modalBody");
    const footEl = _modalCard.querySelector("#modalFooter");

    const isNew = !note;
    titleEl.textContent = isNew ? "Nieuwe notitie" : "Notitie bewerken";
    const dt = toInputDatetime(note?.time || new Date().toISOString());

    bodyEl.innerHTML = `
    <label>Titel</label>
    <input id="noteTitle" placeholder="Titel" value="${escapeHtml(note?.title || "")}">
    <label>Tijdstip</label>
    <input id="noteTime" type="datetime-local" value="${dt}">
    <label>Notitie</label>
    <textarea id="noteBody" placeholder="Schrijf hier je punten...">${escapeHtml(note?.body || "")}</textarea>
  `;

    footEl.innerHTML = "";
    footEl.append(
        btn("primary", "💾 Opslaan", async () => {
            const title = (document.getElementById("noteTitle").value || "").trim();
            const timeLocal = document.getElementById("noteTime").value;
            const body = document.getElementById("noteBody").value || "";
            const iso = fromInputDatetime(timeLocal);

            if (isNew) {
                await addDoc(collection(db, "notes"), {
                    title, time: iso, body,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            } else {
                await setDoc(doc(db, "notes", note.id), {
                    title, time: iso, body,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
            closeNoteModal();
        }),
        !isNew ? btn("primary danger", "🗑️ Verwijderen", async () => {
            const ok = confirm("Deze notitie verwijderen?");
            if (!ok) return;
            await deleteDoc(doc(db, "notes", note.id));
            closeNoteModal();
        }) : null
    );
}

/* Helpers */
function escapeHtml(str) {
    return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function fromInputDatetime(v) { if (!v) return new Date().toISOString(); return new Date(v).toISOString(); }
function toInputDatetime(iso) {
    try {
        const d = new Date(iso); const pad = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ""; }
}
function formatLocal(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch { return iso || ""; }
}
