import {
    getFirebaseApp,
    getAuth, onAuthStateChanged,
    getFirestore, doc, setDoc
} from "./firebase-config.js";

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

// ─── UI refs ────────────────────────────────────────────────────────────────
const csvFile = document.getElementById("csvFile");
const csvText = document.getElementById("csvText");
const hasHeader = document.getElementById("hasHeader");
const btnParse = document.getElementById("btnParse");
const btnImport = document.getElementById("btnImport");
const previewBody = document.getElementById("previewBody");
const statTotal = document.getElementById("statTotal");
const statOk = document.getElementById("statOk");
const statErr = document.getElementById("statErr");
const importProgress = document.getElementById("importProgress");

// ─── Helpers ────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseDate(s) {
    if (!s) return null;
    s = s.trim();
    // yyyy-mm-dd
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m1) return new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
    // dd/mm/yyyy of dd-mm-yyyy
    const m2 = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(s);
    if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    return null;
}

function normTimeString(s) {
    if (!s) return null;
    s = String(s).trim();
    if (!s) return null;
    // "15u36" or "15u" -> "15:36" / "15:00"
    if (/^\d{1,2}u\d{0,2}$/i.test(s)) {
        const [h, mm] = s.toLowerCase().split("u");
        return `${pad2(Number(h))}:${pad2(mm ? Number(mm) : 0)}`;
    }
    if (/^\d{1,2}:\d{2}$/.test(s)) return s;
    if (/^\d{1,2}$/.test(s)) return `${pad2(Number(s))}:00`;
    return null;
}

function hmToMin(hm) { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

function computeMinutes({ type, start, beginbreak, endbreak, end }) {
    // sport telt niet mee; rest wel (feestdag krijgt default tijden elders)
    if (String(type).toLowerCase() === "sport") return 0;
    const s = hmToMin(start), e = hmToMin(end);
    if (s == null || e == null) return 0;
    let total = e - s;
    const bs = hmToMin(beginbreak), be = hmToMin(endbreak);
    if (bs != null && be != null) total -= Math.max(0, be - bs);
    return Math.max(0, total);
}

function normalizeType(t) {
    t = (t || "standaard").toString().trim().toLowerCase();
    const map = {
        standaard: "standard", standaardt: "standard", standard: "standard",
        sport: "sport", feestdag: "feestdag", recup: "recup",
        verlof: "verlof", oefening: "oefening", andere: "andere"
    };
    return map[t] || "standard";
}

function splitCSV(raw) {
    // detecteer delimiter ; of ,
    const firstLine = raw.split(/\r?\n/).find(l => l.trim().length);
    const delim = (firstLine && firstLine.includes(";")) ? ";" : ",";
    // eenvoudige split (geen quotes met delimiters binnenin) — voor gewone CSV/Excel export prima
    return raw
        .split(/\r?\n/)
        .map(line => line.split(delim).map(c => c.trim()))
        .filter(cols => cols.some(c => c.length));
}

function headerIndexMap(headerRow) {
    const map = {};
    headerRow.forEach((h, i) => {
        const k = h.toLowerCase().replace(/\s+|_/g, "");
        if (["datum", "date"].includes(k)) map.date = i;
        if (["type", "soort"].includes(k)) map.type = i;
        if (["start", "begin"].includes(k)) map.start = i;
        if (["startpauze", "startpauze", "pauzestart", "startbreak"].includes(k)) map.beginbreak = i;
        if (["eindepauze", "einde pauze", "pauzeeinde", "endbreak", "eindepauze"].includes(k)) map.endbreak = i;
        if (["einde", "stop"].includes(k)) map.end = i;
        if (["opmerking", "notes", "remark"].includes(k)) map.remark = i;
    });
    return map;
}

// ─── Parsing + validatie ────────────────────────────────────────────────────
let parsedRows = []; // {raw, doc, error}

function parseAndValidate(raw) {
    parsedRows = [];
    previewBody.innerHTML = "";
    statTotal.textContent = "0"; statOk.textContent = "0"; statErr.textContent = "0";

    const rows = splitCSV(raw);
    if (!rows.length) return;

    let startIdx = 0;
    let map = {};
    if (hasHeader.checked) {
        map = headerIndexMap(rows[0]);
        startIdx = 1;
    } else {
        // vaste posities: 0:datum 1:type 2:start 3:start pauze 4:einde pauze 5:einde 6:opmerking
        map = { date: 0, type: 1, start: 2, beginbreak: 3, endbreak: 4, end: 5, remark: 6 };
    }

    let ok = 0, err = 0;
    for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i];
        const get = k => (map[k] != null ? r[map[k]] : "");
        let error = "";

        const d = parseDate(get("date"));
        if (!d) error = "Ongeldige datum";

        const type = normalizeType(get("type"));
        let start = normTimeString(get("start"));
        let beginbreak = normTimeString(get("beginbreak"));
        let endbreak = normTimeString(get("endbreak"));
        let end = normTimeString(get("end"));
        const remark = (get("remark") || "");

        // Defaults/regels
        if (type === "feestdag" && !start && !end) { start = "07:00"; end = "15:36"; }
        if (type !== "sport") {
            if (!start || !end) error = error || "Start/Einde verplicht";
            if (start && end && hmToMin(end) <= hmToMin(start)) error = error || "Einde vóór/== Start";
            const onePause = (!!beginbreak) ^ (!!endbreak);
            if (onePause) error = error || "Pauze onvolledig";
            if (beginbreak && endbreak) {
                const s = hmToMin(start), bs = hmToMin(beginbreak), be = hmToMin(endbreak), e = hmToMin(end);
                if (!(s <= bs && bs < be && be <= e)) error = error || "Pauze buiten werktijd";
            }
        } else {
            if (!remark.trim()) error = error || "Opmerking verplicht bij Sport";
            if (start && end && hmToMin(end) <= hmToMin(start)) error = error || "Einde vóór/== Start";
        }

        const dateISO = d ? toISO(d) : null;
        const minutes = (!error) ? computeMinutes({ type, start, beginbreak, end }) : 0;

        const docObj = {
            date: dateISO, type, start: start || null,
            beginbreak: beginbreak || null, endbreak: endbreak || null,
            end: end || null, remark: remark || null,
            minutes
        };

        parsedRows.push({ idx: i + 1, raw: r, doc: docObj, error });
        // render preview row
        const tr = document.createElement("tr");
        tr.className = error ? "error" : "ok";
        tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${docObj.date || ""}</td>
      <td>${docObj.type}</td>
      <td>${docObj.start || ""}</td>
      <td>${docObj.beginbreak || ""}</td>
      <td>${docObj.endbreak || ""}</td>
      <td>${docObj.end || ""}</td>
      <td>${docObj.remark || ""}</td>
      <td class="status">${error ? "❌ " + error : "✅ Ok"}</td>
    `;
        previewBody.appendChild(tr);
        if (error) err++; else ok++;
    }

    statTotal.textContent = String(parsedRows.length);
    statOk.textContent = String(ok);
    statErr.textContent = String(err);
    btnImport.disabled = ok === 0 || !currentUser;
    if (!currentUser) importProgress.textContent = "Log eerst in om te importeren.";
}

// ─── Events ────────────────────────────────────────────────────────────────
csvFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const txt = await file.text();
    csvText.value = txt;
});

btnParse?.addEventListener("click", () => {
    parseAndValidate(csvText.value || "");
});

btnImport?.addEventListener("click", async () => {
    if (!currentUser) { importProgress.textContent = "Login vereist."; return; }
    const total = parsedRows.filter(r => !r.error).length;
    if (!total) return;

    btnImport.disabled = true;
    importProgress.textContent = `Start import van ${total} rijen…`;

    let done = 0, failed = 0;
    // Sequential to stay simple & safe
    for (const row of parsedRows) {
        if (row.error) continue;
        try {
            const id = `${currentUser.uid}_${row.doc.date}`;
            await setDoc(doc(db, "timelogs", id), { uid: currentUser.uid, ...row.doc }, { merge: true });
            done++;
        } catch (e) {
            failed++;
        }
        importProgress.textContent = `Geïmporteerd: ${done}/${total}${failed ? `, fouten: ${failed}` : ""}`;
    }
    importProgress.textContent = `Klaar. Geïmporteerd: ${done}/${total}${failed ? `, fouten: ${failed}` : ""}`;
    btnImport.disabled = false;
});

// ─── Auth ──────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    currentUser = user || null;
    // als je niet ingelogd bent, kan je wel valideren maar niet importeren
    if (!user) importProgress.textContent = "Niet ingelogd: importeren is uitgeschakeld.";
});
