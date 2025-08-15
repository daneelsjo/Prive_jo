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
   DOM refs (pagina) + header knop
   ────────────────────────────────────────────────────────────── */
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");

// Pagina-elementen (alleen op tijdspagina aanwezig)
const root = document.getElementById("timeRoot");
const monthPicker = document.getElementById("monthPicker");
const timeTable = document.getElementById("timeTable")?.querySelector("tbody");

/* ──────────────────────────────────────────────────────────────
   State
   ────────────────────────────────────────────────────────────── */
let currentUser = null;
let monthLogs = []; // [{id,date,type,start,beginbreak,endbreak,end,minutes,remark,uid}]
let todayLog = null;
let monthSegments = []; // i.p.v. monthLogs
let unsubSeg = null;

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



// stream alle segmenten van deze user
//const qSeg = query(collection(db, SEG_COL), where("uid", "==", currentUser.uid));
//onSnapshot(qSeg, (snap) => {
//    monthSegments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//   setWorkButtonLabelFromSegments();
//    if (root) renderTable(); // tijdspagina
//});


/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
const pad2 = (n) => String(n).padStart(2, "0");
function fmtDateISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fromISO(s) { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); }
function nowHM() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function hmToMin(hm) { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function minToHM(min) { const sign = min < 0 ? "-" : ""; const v = Math.abs(min); const h = Math.floor(v / 60), m = v % 60; return `${sign}${pad2(h)}:${pad2(m)}`; }
function weekdayShort(d) { return new Intl.DateTimeFormat("nl-BE", { weekday: "short" }).format(d).replace(".", ""); }
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function isoWeek(d) {
    // ISO weeknummer
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() || 7);
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

function computeMinutes(entry) {
    // sport en overuren tellen NIET mee; rest wel
    const t = (entry?.type || "standard");
    if (t === "sport" || t === "overuren") return 0;

    let s = hmToMin(entry?.start);
    let e = hmToMin(entry?.end);
    if (t === "feestdag" && (!s || !e)) { s = hmToMin("07:00"); e = hmToMin("15:36"); }
    if (s == null || e == null) return 0;
    let total = e - s;
    const bs = hmToMin(entry?.beginbreak);
    const be = hmToMin(entry?.endbreak);
    if (bs != null && be != null) total -= Math.max(0, be - bs);
    return Math.max(0, total);
}

function rowClassByType(t) {
    const v = (t || "").toString().toLowerCase();
    const map = {
        feestdag: "type-feestdag",
        sport: "type-sport",
        recup: "type-recup",
        verlof: "type-verlof",
        oefening: "type-oefening",
        andere: "type-andere"
    };
    return map[v] || "";
}


/* ──────────────────────────────────────────────────────────────
   Header-knop injecteren (globaal op elke pagina)
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
        host.prepend(btn); // toon links van de iconen
    }
    // altijd (her)koppelen
    btn.onclick = onWorkButtonClick;
}

function setWorkButtonLabel(entry) {
    const btn = document.getElementById("workTimerBtn");
    if (!btn) return;

    if (!entry || !entry.start) { btn.textContent = "Start werktijd"; return; }
    if (entry.start && !entry.beginbreak && !entry.end) { btn.textContent = "Neem pauze"; return; }
    if (entry.beginbreak && !entry.endbreak && !entry.end) { btn.textContent = "Einde pauze"; return; }
    if (entry.start && entry.end && !entry.__stillToday) { btn.textContent = "Start werktijd"; return; }
    if (entry.start && !entry.end) { btn.textContent = "Einde werkdag"; return; }
    btn.textContent = "Start werktijd";
}



async function getOpenSegmentToday() {
    // simpele client-filter op de snapshotlijst (we nemen 'laatste' open)
    const todayISO = fmtDateISO(new Date());
    const open = monthSegments
        .filter(s => s.date === todayISO && !s.end && s.type === "standard" && s.uid === currentUser?.uid)
        .sort((a, b) => (hmToMin(b.start || "00:00") || 0) - (hmToMin(a.start || "00:00") || 0));
    return open[0] || null;
}

async function onWorkButtonClick() {
    if (!currentUser) {
        try { await signInWithPopup(auth, provider); } catch { return; }
    }
    const todayISO = fmtDateISO(new Date());
    let seg = await getOpenSegmentToday();

    if (!seg) {
        // nieuw segment starten
        const ref = doc(collection(db, SEG_COL));
        await setDoc(ref, {
            uid: currentUser.uid, date: todayISO, type: "standard",
            start: nowHM(), beginbreak: null, endbreak: null, end: null,
            remark: null, minutes: 0, createdAt: Date.now(), updatedAt: Date.now()
        });
        return;
    }
    // toggle binnen bestaand segment
    if (!seg.beginbreak && !seg.end) {
        await updateDoc(doc(db, SEG_COL, seg.id), { beginbreak: nowHM(), updatedAt: Date.now() });
        return;
    }
    if (seg.beginbreak && !seg.endbreak && !seg.end) {
        await updateDoc(doc(db, SEG_COL, seg.id), { endbreak: nowHM(), updatedAt: Date.now() });
        return;
    }
    if (!seg.end) {
        const end = nowHM();
        const mins = computeMinutes({ ...seg, end });
        await updateDoc(doc(db, SEG_COL, seg.id), { end, minutes: mins, updatedAt: Date.now() });
    }
}

function setWorkButtonLabelFromSegments() {
    const btn = document.getElementById("workTimerBtn");
    if (!btn) return;
    const seg = monthSegments.find(s => s.date === fmtDateISO(new Date()) && s.type === "standard" && !s.end);
    if (!seg) { btn.textContent = "Start werktijd"; return; }
    if (seg.start && !seg.beginbreak) { btn.textContent = "Neem pauze"; return; }
    if (seg.beginbreak && !seg.endbreak) { btn.textContent = "Einde pauze"; return; }
    btn.textContent = "Einde werkdag";
}


/* ──────────────────────────────────────────────────────────────
   Auth
   ────────────────────────────────────────────────────────────── */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, (user) => {
    if (!user) {
        // logout
        if (unsubSeg) { unsubSeg(); unsubSeg = null; }
        currentUser = null;
        monthSegments = [];
        authDiv && (authDiv.style.display = "block");
        appDiv && (appDiv.style.display = "none");
        setWorkButtonLabelFromSegments(); // zet label terug op "Start werktijd"
        return;
    }

    // login
    currentUser = user;
    authDiv && (authDiv.style.display = "none");
    appDiv && (appDiv.style.display = "block");

    // start stream nu pas
    startSegmentsStream();

    // tijdspagina init (monthPicker etc.)
    if (root) initTimePage();
});


/* ──────────────────────────────────────────────────────────────
   Tijdspagina
   ────────────────────────────────────────────────────────────── */
function initTimePage() {
    // default = huidige maand
    const d = new Date();
    monthPicker.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

    // stream alle logs van user; filter client-side op maand (regels beperken toegang)
    const qLogs = query(collection(db, "timelogs"), where("uid", "==", currentUser.uid));
    onSnapshot(qLogs, (snap) => {
        monthLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTable();
    });

    monthPicker.onchange = renderTable;

    // quick actions → open modal
    document.querySelectorAll(".qa[data-type]").forEach(btn => {
        btn.addEventListener("click", () => {
            openTimeModal({ type: btn.getAttribute("data-type") });
        });
    });

    // rij-klik handled in render
}

/* renders de hele maand + weektotalen */
function renderTable() {
    if (!timeTable) return;
    const [Y, M] = (monthPicker.value || "").split("-").map(Number);
    if (!Y || !M) return;

    timeTable.innerHTML = "";

    const first = new Date(Y, M - 1, 1);
    const last = new Date(Y, M, 0);

    // groepeer op datum
    const byDate = new Map();
    monthSegments.forEach(s => {
        const d = s.date;
        if (!d) return;
        const dt = new Date(d);
        if (dt.getFullYear() !== Y || (dt.getMonth() + 1) !== M) return; // filter maand
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d).push(s);
    });

    let runningWeek = null, weekSum = 0;

    for (let day = 1; day <= last.getDate(); day++) {
        const d = new Date(Y, M - 1, day);
        const dateISO = fmtDateISO(d);
        const segs = (byDate.get(dateISO) || []).sort((a, b) => (hmToMin(a.start || "00:00") || 0) - (hmToMin(b.start || "00:00") || 0));

        const w = isoWeek(d);
        if (runningWeek !== null && w !== runningWeek) {
            addWeekRow(runningWeek, weekSum);
            weekSum = 0;
        }
        runningWeek = (runningWeek === null ? w : w);

        // Dagtotaal
        const dayMinutes = segs.reduce((sum, s) => {
            const m = computeMinutes(s);
            return sum + (s.type === "sport" ? 0 : m);
        }, 0);
        weekSum += dayMinutes;

        // 1) datumkop
        const hdr = document.createElement("tr");
        hdr.className = "date-header";
        hdr.innerHTML = `
      <td>${weekdayShort(d)} ${day}</td>
      <td></td><td></td><td></td><td></td>
      <td>${dayMinutes ? minToHM(dayMinutes) : ""}</td>
      <td class="muted">Klik om nieuw segment toe te voegen</td>
    `;
        hdr.addEventListener("click", () => openTimeModal({ date: dateISO })); // nieuwe
        timeTable.appendChild(hdr);

        // 2) segment-rijen
        segs.forEach(seg => {
            const tr = document.createElement("tr");
            const cls = rowClassByType(seg.type);
            if (cls) tr.classList.add(cls);
            tr.classList.add("seg-row");
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

    function addWeekRow(weekNo, totalMin) {
        const tr = document.createElement("tr");
        tr.className = "week-total";
        tr.innerHTML = `<td colspan="7">Week ${weekNo} totaal: ${minToHM(totalMin)}</td>`;
        timeTable.appendChild(tr);
    }
}


function escapeHtml(s = "") { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ──────────────────────────────────────────────────────────────
   Modal: openen + vullen + opslaan
   ────────────────────────────────────────────────────────────── */
let editingId = null;

function openTimeModal(opts = {}) {
    const get = id => document.getElementById(id);
    let seg = null;
    if (opts.id) seg = monthSegments.find(s => s.id === opts.id) || null;

    const dISO = seg?.date || opts.date || fmtDateISO(new Date());
    get("tr-date").value = dISO;
    get("tr-type").value = seg?.type || "standard";
    get("tr-start").value = seg?.start || "";
    get("tr-beginbreak").value = seg?.beginbreak || "";
    get("tr-endbreak").value = seg?.endbreak || "";
    get("tr-end").value = seg?.end || "";
    get("tr-remark").value = seg?.remark || "";

    // delete/edit id doorgeven
    const saveBtn = get("tr-save");
    const delBtn = get("tr-delete");
    saveBtn.dataset.editingId = seg?.id || "";
    delBtn.dataset.editingId = seg?.id || "";
    delBtn.style.display = seg ? "" : "none";

    Modal.open("modal-time");
}

document.getElementById("tr-save")?.addEventListener("click", saveSegmentFromModal);
document.getElementById("tr-delete")?.addEventListener("click", deleteSegmentFromModal);


async function saveSegmentFromModal() {
    const get = id => document.getElementById(id);
    const id = get("tr-save")?.dataset?.editingId || null; // we steken id tijdelijk in data-attr
    const date = get("tr-date").value;
    const type = (get("tr-type").value || "standard").toLowerCase();
    const payload = {
        uid: currentUser.uid, date, type,
        start: get("tr-start").value || null,
        beginbreak: get("tr-beginbreak").value || null,
        endbreak: get("tr-endbreak").value || null,
        end: get("tr-end").value || null,
        remark: (get("tr-remark").value || "").trim() || null
    };
    if (type === "feestdag" && !payload.start && !payload.end) { payload.start = "07:00"; payload.end = "15:36"; }
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


// --- Helpers ---
function tval(id) { const v = (document.getElementById(id).value || "").trim(); return v || null; }
function parseTime(v) { if (!v) return null; const [h, m] = v.split(":").map(Number); return h * 60 + m; }
function fmt(d) { return d.toISOString().slice(0, 10); } // yyyy-mm-dd

// geldigheidscontrole + payload bouwen
function buildTimePayload() {
    const type = (tval("time-type") || "standaard").toLowerCase();
    const dateStr = tval("time-date") || fmt(new Date());
    let s = parseTime(tval("time-start"));
    let bs = parseTime(tval("time-break-start"));
    let be = parseTime(tval("time-break-end"));
    let e = parseTime(tval("time-end"));
    const note = tval("time-note") || "";

    // Feestdag: standaardtijden invullen als leeg
    if (type === "feestdag") {
        if (s == null && e == null) { s = 7 * 60; e = 15 * 60 + 36; } // 07:00 - 15:36
    }

    // Sport: tijden optioneel, maar opmerking vereist
    if (type === "sport" && !note) {
        Modal.alert({ title: "Opmerking vereist", html: "Voor <b>Sport</b> is een opmerking verplicht (bv. 'Sport 15:00 – 17:00')." });
        throw new Error("invalid");
    }

    // Voor alle andere types (incl. standaard): start & einde zijn vereist
    const requiresTimes = (type !== "sport");
    if (requiresTimes) {
        if (s == null || e == null) {
            Modal.alert({ title: "Tijden onvolledig", html: "Vul <b>Start</b> en <b>Einde</b> in." });
            throw new Error("invalid");
        }
        if (e <= s) {
            Modal.alert({ title: "Volgorde fout", html: "<b>Einde</b> moet na <b>Start</b> liggen." });
            throw new Error("invalid");
        }
        // Pauze: ofwel beide gevuld, ofwel beide leeg; en binnen het werkvenster
        const onePause = (bs != null) ^ (be != null);
        if (onePause) {
            Modal.alert({ title: "Pauze onvolledig", html: "Vul <b>Start pauze</b> en <b>Einde pauze</b> allebei in, of laat beide leeg." });
            throw new Error("invalid");
        }
        if (bs != null && be != null) {
            if (!(s <= bs && bs < be && be <= e)) {
                Modal.alert({ title: "Pauze buiten bereik", html: "Pauze moet binnen de werktijd vallen en een geldige volgorde hebben." });
                throw new Error("invalid");
            }
        }
    } else {
        // sport: als tijden toch zijn ingevuld, check basisvolgorde
        if (s != null && e != null && e <= s) {
            Modal.alert({ title: "Volgorde fout", html: "<b>Einde</b> moet na <b>Start</b> liggen." });
            throw new Error("invalid");
        }
    }

    // netto minuten
    let minutes = 0;
    if (s != null && e != null) {
        minutes = e - s - ((bs != null && be != null) ? (be - bs) : 0);
        if (minutes < 0) minutes = 0;
    }

    // telt mee in dagsommen? (alles behalve sport)
    const counts = type !== "sport";

    return {
        date: dateStr, type, startMin: s, breakStartMin: bs, breakEndMin: be, endMin: e,
        note, minutes, counts
    };
}

// --- Modal openen (nieuw/bewerken) ---
let editingTimeId = null; // Firestore id of lokaal id

window.openTimeModal = function (entry = null) {
    editingTimeId = entry?.id || null;
    document.getElementById("modal-time-title").textContent = entry ? "Tijdsregistratie bewerken" : "Nieuwe tijdsregistratie";

    // velden vullen
    document.getElementById("time-date").value = entry?.date || fmt(new Date());
    document.getElementById("time-type").value = entry?.type || "standaard";
    document.getElementById("time-start").value = entry?.startMin != null ? minsToHHMM(entry.startMin) : "";
    document.getElementById("time-break-start").value = entry?.breakStartMin != null ? minsToHHMM(entry.breakStartMin) : "";
    document.getElementById("time-break-end").value = entry?.breakEndMin != null ? minsToHHMM(entry.breakEndMin) : "";
    document.getElementById("time-end").value = entry?.endMin != null ? minsToHHMM(entry.endMin) : "";
    document.getElementById("time-note").value = entry?.note || "";

    // verwijderknop tonen/verbergen
    document.getElementById("time-delete").style.display = editingTimeId ? "" : "none";

    Modal.open("modal-time");
};

function minsToHHMM(m) { const h = Math.floor(m / 60), n = m % 60; return `${String(h).padStart(2, "0")}:${String(n).padStart(2, "0")}`; }

// --- Events (eenmalig binden nadat partials geladen zijn) ---
document.addEventListener("partials:loaded", () => {
    // Opslaan
    const save = document.getElementById("time-save");
    if (save && !save.__wired) {
        save.__wired = true;
        save.onclick = async () => {
            try {
                const payload = buildTimePayload();
                // TODO: vervang door je eigen persist-logica (Firestore set/add)
                // bv:
                // if (editingTimeId) await updateDoc(doc(db,"times",editingTimeId), { ...payload, updatedAt:new Date() });
                // else await addDoc(collection(db,"times"), { ...payload, uid: currentUser?.uid || null, createdAt:new Date() });
                await saveTimeEntry(payload, editingTimeId); // ← jouw helper
                Modal.close("modal-time");
            } catch (e) { /* validatiefouten tonen al via Modal.alert */ }
        };
    }

    // Verwijderen
    const del = document.getElementById("time-delete");
    if (del && !del.__wired) {
        del.__wired = true;
        del.onclick = async () => {
            if (!editingTimeId) return;
            if (!confirm("Deze registratie verwijderen?")) return;
            await deleteTimeEntry(editingTimeId); // ← jouw helper
            Modal.close("modal-time");
        };
    }

    // Type-keuze: opmerking verplicht bij sport; presets bij feestdag
    const typeSel = document.getElementById("time-type");
    if (typeSel && !typeSel.__wired) {
        typeSel.__wired = true;
        typeSel.onchange = () => {
            const t = typeSel.value;
            if (t === "feestdag") {
                if (!tval("time-start") && !tval("time-end")) {
                    document.getElementById("time-start").value = "07:00";
                    document.getElementById("time-end").value = "15:36";
                    document.getElementById("time-break-start").value = "";
                    document.getElementById("time-break-end").value = "";
                }
            }
        };
    }

    // Snelle presets
    document.querySelectorAll('#modal-time [data-preset]').forEach(btn => {
        if (btn.__wired) return;
        btn.__wired = true;
        btn.addEventListener("click", () => {
            const p = btn.getAttribute("data-preset");
            document.getElementById("time-type").value = p;
            if (p === "feestdag") {
                document.getElementById("time-start").value = "07:00";
                document.getElementById("time-end").value = "15:36";
                document.getElementById("time-break-start").value = "";
                document.getElementById("time-break-end").value = "";
                document.getElementById("time-note").value = "";
            } else if (p === "sport") {
                document.getElementById("time-start").value = "";
                document.getElementById("time-end").value = "";
                document.getElementById("time-break-start").value = "";
                document.getElementById("time-break-end").value = "";
                if (!document.getElementById("time-note").value) {
                    document.getElementById("time-note").value = "Sport ";
                }
            } else {
                // recup/verlof/oefening/andere -> gebruiker vult zelf tijden in
                if (!document.getElementById("time-note").value) {
                    const label = p[0].toUpperCase() + p.slice(1);
                    document.getElementById("time-note").value = label;
                }
            }
        });
    });
});


/* ──────────────────────────────────────────────────────────────
   Bootstrapping
   ────────────────────────────────────────────────────────────── */
document.addEventListener("partials:loaded", ensureHeaderButton);
document.addEventListener("DOMContentLoaded", ensureHeaderButton);


