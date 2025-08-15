// Script/Javascript/time.js
window.DEBUG = true;
const log = (...a) => window.DEBUG && console.log("[time]", ...a);

import {
    getFirebaseApp,
    getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, where
} from "./firebase-config.js";

/* ──────────────────────────────────────────────────────────────
   Firebase
   ────────────────────────────────────────────────────────────── */
const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const SEG_COL = "timelogSegments";

/* ──────────────────────────────────────────────────────────────
   DOM refs
   ────────────────────────────────────────────────────────────── */
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");
const root = document.getElementById("timeRoot");
const monthPicker = document.getElementById("monthPicker");
const timeTable = document.getElementById("timeTable")?.querySelector("tbody");

/* ──────────────────────────────────────────────────────────────
   State
   ────────────────────────────────────────────────────────────── */
let currentUser = null;
let monthSegments = [];
let unsubSeg = null;

const EXCLUDED_TYPES_FOR_TOTALS = new Set(["sport", "oefening", "andere"]); // niet meetellen

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDateISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function nowHM() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function hmToMin(hm) { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function minToHM(min) { const sign = min < 0 ? "-" : ""; const v = Math.abs(min); const h = Math.floor(v / 60), m = v % 60; return `${sign}${pad2(h)}:${pad2(m)}`; }
function weekdayShort(d) { return new Intl.DateTimeFormat("nl-BE", { weekday: "short" }).format(d).replace(".", ""); }
function isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() || 7);
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function escapeHtml(s = "") { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function rowClassByType(t) {
    const v = (t || "").toLowerCase();
    const map = {
        feestdag: "type-feestdag", sport: "type-sport", recup: "type-recup",
        verlof: "type-verlof", oefening: "type-oefening", andere: "type-andere"
    };
    return map[v] || "";
}
function computeMinutes(entry) {
    // netto minuten binnen segment (pauze aftrekken indien beide waarden)
    let s = hmToMin(entry?.start), e = hmToMin(entry?.end);
    if (entry?.type === "feestdag" && (!s || !e)) { s = hmToMin("07:00"); e = hmToMin("15:36"); }
    if (s == null || e == null) return 0;
    let total = e - s;
    const bs = hmToMin(entry?.beginbreak), be = hmToMin(entry?.endbreak);
    if (bs != null && be != null) total -= Math.max(0, be - bs);
    return Math.max(0, total);
}

/* ──────────────────────────────────────────────────────────────
   Header-knop (site-breed)
   ────────────────────────────────────────────────────────────── */
function ensureHeaderButton() {
    const host = document.getElementById("quickLinks");
    if (!host) return;
    let btn = document.getElementById("workTimerBtn");
    if (!btn) {
        btn = document.createElement("button");
        btn.id = "workTimerBtn";
        btn.className = "primary";
        btn.textContent = "Start werktijd";
        btn.style.whiteSpace = "nowrap";
        host.prepend(btn);
    }
    btn.onclick = onWorkButtonClick; // altijd opnieuw koppelen
}

function setWorkButtonLabelFromSegments() {
    const btn = document.getElementById("workTimerBtn");
    if (!btn) return;
    const todayISO = fmtDateISO(new Date());
    const seg = monthSegments.find(s => s.uid === currentUser?.uid && s.date === todayISO && s.type === "standard" && !s.end);
    if (!seg) { btn.textContent = "Start werktijd"; return; }
    if (seg.start && !seg.beginbreak) { btn.textContent = "Neem pauze"; return; }
    if (seg.beginbreak && !seg.endbreak) { btn.textContent = "Einde pauze"; return; }
    btn.textContent = "Einde werkdag";
}

async function getOpenSegmentToday() {
    const todayISO = fmtDateISO(new Date());
    const open = monthSegments
        .filter(s => s.uid === currentUser?.uid && s.date === todayISO && s.type === "standard" && !s.end)
        .sort((a, b) => (hmToMin(b.start || "00:00") || 0) - (hmToMin(a.start || "00:00") || 0));
    return open[0] || null;
}

async function onWorkButtonClick() {
    if (!currentUser) { try { await signInWithPopup(auth, provider); } catch { return; } }

    const todayISO = fmtDateISO(new Date());
    let seg = await getOpenSegmentToday();

    if (!seg) {
        const ref = doc(collection(db, SEG_COL));
        await setDoc(ref, {
            uid: currentUser.uid, date: todayISO, type: "standard",
            start: nowHM(), beginbreak: null, endbreak: null, end: null,
            remark: null, minutes: 0, createdAt: Date.now(), updatedAt: Date.now()
        });
        return;
    }
    if (!seg.beginbreak && !seg.end) {
        await updateDoc(doc(db, SEG_COL, seg.id), { beginbreak: nowHM(), updatedAt: Date.now() }); return;
    }
    if (seg.beginbreak && !seg.endbreak && !seg.end) {
        await updateDoc(doc(db, SEG_COL, seg.id), { endbreak: nowHM(), updatedAt: Date.now() }); return;
    }
    if (!seg.end) {
        const end = nowHM();
        const mins = computeMinutes({ ...seg, end });
        await updateDoc(doc(db, SEG_COL, seg.id), { end, minutes: mins, updatedAt: Date.now() });
    }
}

/* ──────────────────────────────────────────────────────────────
   Auth + streams
   ────────────────────────────────────────────────────────────── */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

function startSegmentsStream() {
    if (!currentUser) return;
    if (unsubSeg) { unsubSeg(); unsubSeg = null; }
    const qSeg = query(collection(db, SEG_COL), where("uid", "==", currentUser.uid));
    unsubSeg = onSnapshot(qSeg, (snap) => {
        monthSegments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWorkButtonLabelFromSegments();
        if (root) renderTable();
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (unsubSeg) { unsubSeg(); unsubSeg = null; }
        currentUser = null;
        monthSegments = [];
        authDiv && (authDiv.style.display = "block");
        appDiv && (appDiv.style.display = "none");
        setWorkButtonLabelFromSegments();
        return;
    }
    currentUser = user;
    authDiv && (authDiv.style.display = "none");
    appDiv && (appDiv.style.display = "block");
    startSegmentsStream();
    if (root) initTimePage();
});

/* ──────────────────────────────────────────────────────────────
   Tijdspagina (maandoverzicht + modal)
   ────────────────────────────────────────────────────────────── */
function initTimePage() {
    const d = new Date();
    if (monthPicker) monthPicker.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    monthPicker && (monthPicker.onchange = renderTable);

    // snelknoppen bovenaan (feestdag/sport/...)
    document.querySelectorAll(".qa[data-type]").forEach(btn => {
        btn.addEventListener("click", () => {
            openTimeModal({ date: fmtDateISO(new Date()), type: btn.getAttribute("data-type") });
        });
    });

    renderTable();
}

function renderTable() {
    if (!timeTable) return;
    const [Y, M] = (monthPicker.value || "").split("-").map(Number);
    if (!Y || !M) return;

    timeTable.innerHTML = "";
    const last = new Date(Y, M, 0);

    // groepeer per datum in deze maand
    const byDate = new Map();
    monthSegments.forEach(s => {
        if (!s.date) return;
        const dt = new Date(s.date);
        if (dt.getFullYear() !== Y || (dt.getMonth() + 1) !== M) return;
        if (!byDate.has(s.date)) byDate.set(s.date, []);
        byDate.get(s.date).push(s);
    });

    let runningWeek = null, weekSum = 0;

    for (let day = 1; day <= last.getDate(); day++) {
        const d = new Date(Y, M - 1, day);
        const dateISO = fmtDateISO(d);
        const segs = (byDate.get(dateISO) || [])
            .sort((a, b) => (hmToMin(a.start || "00:00") || 0) - (hmToMin(b.start || "00:00") || 0));

        const w = isoWeek(d);
        if (runningWeek !== null && w !== runningWeek) {
            addWeekRow(runningWeek, weekSum);
            weekSum = 0;
        }
        runningWeek = w;

        // dagtotaal (excl. sport, oefening, andere)
        const dayMinutes = segs.reduce((sum, s) => {
            const m = computeMinutes(s);
            return sum + (EXCLUDED_TYPES_FOR_TOTALS.has((s.type || "").toLowerCase()) ? 0 : m);
        }, 0);
        weekSum += dayMinutes;

        // datumkop (colspan 7) met ▼/▶ en +
        const hdr = document.createElement("tr");
        hdr.className = "date-header";
        hdr.innerHTML = `
      <td colspan="7">
        <div class="datebar">
          <div class="left">${weekdayShort(d)} ${day}</div>
          <div class="right">
            <span class="muted">${dayMinutes ? minToHM(dayMinutes) : ""}</span>
            <button class="icon-xs toggle" data-date="${dateISO}" aria-expanded="true" title="In-/uitklappen">▼</button>
            <button class="icon-xs add" data-date="${dateISO}" title="Nieuw segment">+</button>
          </div>
        </div>
      </td>`;
        timeTable.appendChild(hdr);

        const toggleBtn = hdr.querySelector(".toggle");
        const addBtn = hdr.querySelector(".add");

        let collapsed = segs.length > 1; // als meerdere, initieel dicht
        setToggleUI(toggleBtn, collapsed);

        toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            collapsed = !collapsed;
            setToggleUI(toggleBtn, collapsed);
            timeTable.querySelectorAll(`tr.seg-row[data-date="${dateISO}"]`).forEach(tr => {
                tr.style.display = collapsed ? "none" : "";
            });
        });

        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openTimeModal({ date: dateISO });
        });

        // segment-rijen
        segs.forEach(seg => {
            const tr = document.createElement("tr");
            tr.dataset.date = dateISO;
            tr.classList.add("seg-row");
            const cls = rowClassByType(seg.type);
            if (cls) tr.classList.add(cls);
            tr.style.display = collapsed ? "none" : "";

            tr.innerHTML = `
        <td></td>
        <td>${seg.start || ""}</td>
        <td>${seg.beginbreak || ""}</td>
        <td>${seg.endbreak || ""}</td>
        <td>${seg.end || ""}</td>
        <td>${computeMinutes(seg) ? minToHM(computeMinutes(seg)) : ""}</td>
        <td><span class="badge">${(seg.type || "standard")[0].toUpperCase() + (seg.type || "standard").slice(1)}</span> ${seg.remark ? escapeHtml(seg.remark) : ""}</td>
      `;
            tr.addEventListener("click", (ev) => { ev.stopPropagation(); openTimeModal({ id: seg.id }); });
            timeTable.appendChild(tr);
        });
    }

    if (runningWeek !== null) addWeekRow(runningWeek, weekSum);

    function setToggleUI(btn, collapsed) {
        btn.textContent = collapsed ? "▶" : "▼";
        btn.setAttribute("aria-expanded", String(!collapsed));
    }

    function addWeekRow(weekNo, totalMin) {
        const tr = document.createElement("tr");
        tr.className = "week-total";
        tr.innerHTML = `<td colspan="7">Week ${weekNo} totaal: ${minToHM(totalMin)}</td>`;
        timeTable.appendChild(tr);
    }
}

/* ──────────────────────────────────────────────────────────────
   Modal (gebruikt inputs met id: tr-date, tr-type, tr-start, tr-beginbreak, tr-endbreak, tr-end, tr-remark)
   ────────────────────────────────────────────────────────────── */
function isStandardType(v) {
    const t = (v || "").toLowerCase();
    return t === "standard" || t === "standaard";
}

function applyTypeEffects() {
    const typeSel = document.getElementById("tr-type");
    const showPause = isStandardType(typeSel.value);
    const elBB = document.getElementById("tr-beginbreak")?.closest("label");
    const elBE = document.getElementById("tr-endbreak")?.closest("label");
    if (elBB) elBB.style.display = showPause ? "" : "none";
    if (elBE) elBE.style.display = showPause ? "" : "none";
    if (!showPause) {
        const bb = document.getElementById("tr-beginbreak");
        const be = document.getElementById("tr-endbreak");
        if (bb) bb.value = "";
        if (be) be.value = "";
    }
}

function openTimeModal(opts = {}) {
    const get = id => document.getElementById(id);
    let seg = null;
    if (opts.id) seg = monthSegments.find(s => s.id === opts.id) || null;

    const dISO = seg?.date || opts.date || fmtDateISO(new Date());
    get("tr-date").value = dISO;
    get("tr-type").value = (opts.type || seg?.type || "standard");
    get("tr-start").value = seg?.start || "";
    get("tr-beginbreak").value = seg?.beginbreak || "";
    get("tr-endbreak").value = seg?.endbreak || "";
    get("tr-end").value = seg?.end || "";
    get("tr-remark").value = seg?.remark || "";

    // knoppen (id doorgeven via dataset)
    const saveBtn = get("tr-save");
    const delBtn = get("tr-delete");
    saveBtn.dataset.editingId = seg?.id || "";
    delBtn.dataset.editingId = seg?.id || "";
    delBtn.style.display = seg ? "" : "none";

    applyTypeEffects();
    get("tr-type").onchange = applyTypeEffects;

    Modal.open("modal-time");
}

async function saveSegmentFromModal() {
    if (!currentUser) { try { await signInWithPopup(auth, provider); } catch { return; } }

    const get = id => document.getElementById(id);
    const id = get("tr-save")?.dataset?.editingId || null;

    const payload = {
        uid: currentUser.uid,
        date: get("tr-date").value,
        type: (get("tr-type").value || "standard").toLowerCase(),
        start: get("tr-start").value || null,
        beginbreak: get("tr-beginbreak").value || null,
        endbreak: get("tr-endbreak").value || null,
        end: get("tr-end").value || null,
        remark: (get("tr-remark").value || "").trim() || null
    };
    if (payload.type === "feestdag" && !payload.start && !payload.end) { payload.start = "07:00"; payload.end = "15:36"; }
    payload.minutes = computeMinutes(payload);

    if (id) await updateDoc(doc(db, SEG_COL, id), { ...payload, updatedAt: Date.now() });
    else await setDoc(doc(collection(db, SEG_COL)), { ...payload, createdAt: Date.now(), updatedAt: Date.now() });

    Modal.close("modal-time");
}

async function deleteSegmentFromModal() {
    const btn = document.getElementById("tr-delete");
    const id = btn?.dataset?.editingId;
    if (!id) return;
    if (!confirm("Dit segment verwijderen?")) return;
    await deleteDoc(doc(db, SEG_COL, id));
    Modal.close("modal-time");
}

/* ──────────────────────────────────────────────────────────────
   Bootstrapping
   ────────────────────────────────────────────────────────────── */
document.addEventListener("partials:loaded", ensureHeaderButton);
document.addEventListener("DOMContentLoaded", ensureHeaderButton);

// modal knoppen (1x koppelen)
document.getElementById("tr-save")?.addEventListener("click", saveSegmentFromModal);
document.getElementById("tr-delete")?.addEventListener("click", deleteSegmentFromModal);

// Exporteer voor rij-clicks / plus-knop
window.openTimeModal = openTimeModal;
