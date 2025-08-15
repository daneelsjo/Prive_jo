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
    if (!host || document.getElementById("workTimerBtn")) return;

    const btn = document.createElement("button");
    btn.id = "workTimerBtn";
    btn.className = "primary";
    btn.textContent = "Start werktijd";
    btn.style.whiteSpace = "nowrap";
    btn.title = "Tijdsregistratie";

    btn.addEventListener("click", onWorkButtonClick);
    host.prepend(btn);
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

async function onWorkButtonClick() {
    if (!currentUser) { Modal?.alert?.({ title: "Login nodig", html: "Log in om je werktijd te registreren." }); return; }
    const today = new Date();
    const dateISO = fmtDateISO(today);
    const id = `${currentUser.uid}_${dateISO}`;
    const ref = doc(db, "timelogs", id);

    // herlaad laatste snapshot uit memory
    const e = todayLog || { uid: currentUser.uid, date: dateISO, type: "standard" };

    if (!e.start) {
        await setDoc(ref, { uid: currentUser.uid, date: dateISO, type: "standard", start: nowHM(), minutes: 0 }, { merge: true });
        return;
    }
    if (e.start && !e.beginbreak && !e.end) {
        await updateDoc(ref, { beginbreak: nowHM() });
        return;
    }
    if (e.beginbreak && !e.endbreak && !e.end) {
        await updateDoc(ref, { endbreak: nowHM() });
        return;
    }
    if (!e.end) {
        const payload = { end: nowHM() };
        // bereken minutes
        const sim = { ...e, ...payload };
        const mins = computeMinutes(sim);
        await updateDoc(ref, { ...payload, minutes: mins });
        return;
    }
    // Eindsituatie: dag afgerond → niets doen; label wordt toch "Start werktijd"
}

/* ──────────────────────────────────────────────────────────────
   Auth
   ────────────────────────────────────────────────────────────── */
loginBtn && (loginBtn.onclick = () => signInWithPopup(auth, provider));

onAuthStateChanged(auth, (user) => {
    if (!user) {
        currentUser = null;
        authDiv && (authDiv.style.display = "block");
        appDiv && (appDiv.style.display = "none");
        setWorkButtonLabel(null);
        return;
    }
    currentUser = user;
    authDiv && (authDiv.style.display = "none");
    appDiv && (appDiv.style.display = "block");

    // Topbar-knop volgen (alleen "vandaag")
    const todayISO = fmtDateISO(new Date());
    const todayRefId = `${currentUser.uid}_${todayISO}`;
    onSnapshot(doc(db, "timelogs", todayRefId), (snap) => {
        todayLog = snap.exists() ? (snap.data() || {}) : null;
        if (todayLog) todayLog.__stillToday = true;
        setWorkButtonLabel(todayLog);
    });

    // Indien op tijdspagina: data stream voor zichtbare maand
    if (root) {
        initTimePage();
    }
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

    while (timeTable.firstChild) timeTable.removeChild(timeTable.firstChild);

    const first = new Date(Y, M - 1, 1);
    const last = monthEnd(first);

    // snelle lookup per datum
    const byDate = new Map();
    monthLogs.forEach(e => { byDate.set(e.date, e); });

    let runningWeek = null, weekSum = 0;
    for (let day = 1; day <= last.getDate(); day++) {
        const d = new Date(Y, M - 1, day);
        const dateISO = fmtDateISO(d);
        const entry = byDate.get(dateISO) || null;
        const minutes = computeMinutes(entry || {});
        const w = isoWeek(d);

        // week-onderbreking → toon totale rij
        if (runningWeek !== null && w !== runningWeek) {
            addWeekRow(runningWeek, weekSum);
            weekSum = 0;
        }
        runningWeek = (runningWeek === null ? w : (w));

        if (entry) weekSum += minutes;

        const tr = document.createElement("tr");
        const cls = rowClassByType(entry?.type);
        if (cls) tr.classList.add(cls);

        tr.dataset.date = dateISO;

        tr.innerHTML = `
      <td>${weekdayShort(d)} ${day}</td>
      <td>${entry?.start || ""}</td>
      <td>${entry?.beginbreak || ""}</td>
      <td>${entry?.endbreak || ""}</td>
      <td>${entry?.end || ""}</td>
      <td>${minutes ? minToHM(minutes) : ""}</td>
      <td>${entry?.remark ? escapeHtml(entry.remark) : ""}</td>
    `;

        tr.addEventListener("click", () => openTimeModal({ date: dateISO }));

        timeTable.appendChild(tr);
    }
    // eind-week
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
    const d = opts.date ? fromISO(opts.date) : new Date();
    const dateISO = fmtDateISO(d);
    const id = `${currentUser?.uid || "x"}_${dateISO}`;
    const entry = monthLogs.find(x => x.id === id) || null;

    const elDate = document.getElementById("tr-date");
    const elType = document.getElementById("tr-type");
    const elStart = document.getElementById("tr-start");
    const elBB = document.getElementById("tr-beginbreak");
    const elBE = document.getElementById("tr-endbreak");
    const elEnd = document.getElementById("tr-end");
    const elRemark = document.getElementById("tr-remark");
    const del = document.getElementById("tr-delete");
    const save = document.getElementById("tr-save");

    elDate.value = dateISO;
    elType.value = opts.type || entry?.type || "standard";
    elStart.value = entry?.start || "";
    elBB.value = entry?.beginbreak || "";
    elBE.value = entry?.endbreak || "";
    elEnd.value = entry?.end || "";
    elRemark.value = entry?.remark || "";

    del.style.display = entry ? "" : "none";
    editingId = entry ? entry.id : null;

    // type-specifieke defaults
    function applyTypeDefaults() {
        const t = elType.value;
        const timeDisabled = (t === "sport"); // sport = enkel opmerking
        elStart.disabled = elBB.disabled = elBE.disabled = elEnd.disabled = timeDisabled;

        if (t === "feestdag" && !entry) {
            elStart.value = "07:00";
            elEnd.value = "15:36";
            elBB.value = ""; elBE.value = "";
            elRemark.placeholder = "Feestdag (optioneel detail)…";
        } else if (t === "sport") {
            elStart.value = ""; elBB.value = ""; elBE.value = ""; elEnd.value = "";
            if (!elRemark.value) elRemark.placeholder = "Sport 15u - 17u";
        } else if (!entry && (t === "recup" || t === "verlof" || t === "oefening" || t === "andere")) {
            elRemark.placeholder = t.charAt(0).toUpperCase() + t.slice(1);
        }
    }
    applyTypeDefaults();
    elType.onchange = applyTypeDefaults;

    // handlers
    save.onclick = async () => {
        if (!currentUser) return;
        const payload = {
            uid: currentUser.uid,
            date: elDate.value,
            type: elType.value || "standard",
            start: elStart.value || null,
            beginbreak: elBB.value || null,
            endbreak: elBE.value || null,
            end: elEnd.value || null,
            remark: (elRemark.value || "").trim() || null
        };
        // bereken minutes
        const mins = computeMinutes(payload);
        payload.minutes = mins;

        const ref = doc(db, "timelogs", `${currentUser.uid}_${payload.date}`);
        await setDoc(ref, payload, { merge: true });
        Modal.close("modal-time");
    };

    del.onclick = async () => {
        if (!editingId) return;
        if (!confirm("Deze tijdsregistratie verwijderen?")) return;
        await deleteDoc(doc(db, "timelogs", editingId));
        Modal.close("modal-time");
    };

    Modal.open("modal-time");
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


