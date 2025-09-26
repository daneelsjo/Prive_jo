// Script/Javascript/planner.js
// Weekplanner met backlog (vakken + taken/toetsen) en Firestore-opslag.
// - Backlog: gegroepeerd per vak (kleur per vak, symbool per type)
// - Drag & drop: backlog → weekrooster (zelfde item mag meermaals gepland worden)
// - Afdruk als lijst (van–tot)
// - UI toont grid ook zonder login; Firestore-acties vragen login

import {
  getFirebaseApp,
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query, where, orderBy
} from "./firebase-config.js";

/* ───────────────────────── Helpers ───────────────────────── */
const SYMBOL_BY_TYPE = { taak: "📝", toets: "🧪", andere: "📚" };
const sym  = (t)=> SYMBOL_BY_TYPE[t] || "📌";
const pad  = (n)=> String(n).padStart(2,"0");
const div  = (cls)=>{ const el=document.createElement("div"); if(cls) el.className=cls; return el; };
const esc  = (s="")=> s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const safeParse = (s)=> { try{ return JSON.parse(s); } catch{ return null; } };

function toDate(maybeTs){
  if (maybeTs instanceof Date) return maybeTs;
  if (maybeTs && typeof maybeTs.seconds === "number") return new Date(maybeTs.seconds*1000);
  if (typeof maybeTs === "string") return new Date(maybeTs);
  return new Date(maybeTs || Date.now());
}
function startOfWeek(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay()+6)%7; // ma=0
  x.setDate(x.getDate()-day);
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return d.toLocaleDateString('nl-BE',{weekday:'short', day:'2-digit', month:'2-digit'}); }
function toISODate(d){ return d.toISOString().slice(0,10); }
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
function getContrast(hex){
  if(!/^#?[0-9a-f]{6}$/i.test(hex||"")) return "#000";
  const h = hex.startsWith('#')?hex.slice(1):hex;
  const r=parseInt(h.substr(0,2),16), g=parseInt(h.substr(2,2),16), b=parseInt(h.substr(4,2),16);
  const yiq=(r*299+g*587+b*114)/1000;
  return yiq>=128?'#000':'#fff';
}

function setSubjectChip(name, color){
  const chip = document.getElementById("bl-subject-chip");
  if(!chip) return;
  if(!name){ chip.hidden = true; return; }
  const dot = chip.querySelector(".dot");
  const txt = chip.querySelector(".txt");
  if(dot) dot.style.background = color || "#ccc";
  if(txt) txt.textContent = name;
  chip.hidden = false;
}

function renderSubjectMenu(filterText=""){
  const menu = document.getElementById("bl-subject-menu");
  if(!menu) return;
  const f = (filterText||"").trim().toLowerCase();

  const list = subjects
    .slice()
    .filter(s => !f || (s.name||"").toLowerCase().includes(f));

  if(list.length === 0){
    menu.innerHTML = `<div class="subj-opt" style="justify-content:center;opacity:.7">Geen resultaten</div>`;
    return;
  }

  menu.innerHTML = list.map(s=>{
    const fg = getContrast(s.color||"#ccc");
    return `
      <div class="subj-opt" data-id="${s.id}" style="background:${s.color||"#ccc"};color:${fg};">
        <span class="name">${esc(s.name||"")}</span>
        <span class="hex">${esc(s.color||"")}</span>
      </div>
    `;
  }).join("");
}

function openSubjectMenu(){
  const menu = document.getElementById("bl-subject-menu");
  if(!menu) return;
  renderSubjectMenu(""); // altijd de volledige lijst tonen bij openen
  menu.hidden = false;
}

function closeSubjectMenu(){
  const menu = document.getElementById("bl-subject-menu");
  if(!menu) return;
  menu.hidden = true;
}


// Veilige event-binding (logt waarschuwing i.p.v. crash)
function bind(selectorOrEl, event, handler){
  const el = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
  if(!el){ console.warn("[planner] element not found for", selectorOrEl); return; }
  el.addEventListener(event, handler);
}

/* ───────────────────────── Firebase init ───────────────────────── */
const app  = getFirebaseApp();
const db   = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* ───────────────────────── State ───────────────────────── */
let currentUser = null;
let subjects = []; // {id,name,color,uid}
let backlog  = []; // {id,subjectId,subjectName,type,title,durationHours,dueDate,color,symbol,uid,done}
let plans    = []; // {id,itemId,start,durationHours,uid}
let weekStart = startOfWeek(new Date());

/* ───────────────────────── DOM na load ───────────────────────── */
window.addEventListener("DOMContentLoaded", () => {
  const authDiv   = document.getElementById("auth");
  const appDiv    = document.getElementById("app");
  const weekTitle = document.getElementById("weekTitle");
  const calRoot   = document.getElementById("calendar");
  const blSubjects= document.getElementById("bl-subjects");
  // Subject input: altijd volledige lijst tonen bij focus/klik
document.addEventListener("focusin", (ev)=>{
  const input = ev.target.closest("#bl-subject");
  if(!input) return;
  openSubjectMenu();
});

// Typen = filteren; lege input = volledige lijst
document.addEventListener("input", (ev)=>{
  const input = ev.target.closest("#bl-subject");
  if(!input) return;
  const val = input.value || "";
  renderSubjectMenu(val);              // filter
  if(val === "") openSubjectMenu();    // leeg => toon alles
});

// Optie aanklikken
document.addEventListener("click", (ev)=>{
  const opt = ev.target.closest(".subj-opt");
  if(!opt) return;
  const id = opt.dataset.id;
  const s = subjects.find(x=>x.id===id);
  const input = document.getElementById("bl-subject");
  if(s && input){
    input.value = s.name || "";
    setSubjectChip(s.name, s.color);
  }
  closeSubjectMenu();
});

// Type-knoppen: zet actieve knop + schrijf waarde naar hidden input #bl-type
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".type-btn");
  if (!btn) return;
  const group = btn.closest(".type-group");
  group?.querySelectorAll(".type-btn").forEach(b=> b.classList.remove("is-active"));
  btn.classList.add("is-active");
  const hidden = document.getElementById("bl-type");
  if (hidden) hidden.value = btn.dataset.type || "taak";
});

// Buiten klikken => sluiten
document.addEventListener("click", (ev)=>{
  const wrap = ev.target.closest(".subj-wrap");
  if(wrap) return;
  closeSubjectMenu();
});

// Escape sluit menu
document.addEventListener("keydown", (ev)=>{
  if(ev.key === "Escape") closeSubjectMenu();
});

// Bij openen van de backlog-modal chip initialiseren (op basis van ingevoerde tekst)
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest("#newBacklogBtn,[data-modal-open='modal-backlog']");
  if(!btn) return;
  // wacht een tikje tot modal zichtbaar is
  setTimeout(()=>{
    const input = document.getElementById("bl-subject");
    if(!input) return;
    const s = subjects.find(x=> (x.name||"").toLowerCase() === (input.value||"").toLowerCase());
    setSubjectChip(s?.name || "", s?.color || "");
    // bij openen meteen volledige lijst
    openSubjectMenu();
  }, 0);
});



  // 15 vaste kleuren
const PALETTE = [
  "#2196F3","#3F51B5","#00BCD4","#4CAF50","#8BC34A",
  "#FFC107","#FF9800","#FF5722","#E91E63","#9C27B0",
  "#795548","#607D8B","#009688","#673AB7","#F44336"
];


  // UI zichtbaar houden (ook zonder login)
  if (authDiv) authDiv.style.display = "block";
  if (appDiv)  appDiv.style.display  = "block";

  /* ── UI wiring ── */
  bind("#login-btn", "click", () => signInWithPopup(auth, provider));
  bind("#prevWeek", "click", () => { weekStart = addDays(weekStart,-7); renderWeek(); if(currentUser) refreshPlans(); });
  bind("#nextWeek", "click", () => { weekStart = addDays(weekStart, 7); renderWeek(); if(currentUser) refreshPlans(); });


// Open "Vakken beheren" en render tabel
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("#manageSubjectsBtn");
  if (!btn) return;
  if (!currentUser) { alert("Log eerst in."); return; }
  renderSubjectsManager();
  if (window.Modal?.open) Modal.open("modal-subjects");
  else document.getElementById("modal-subjects")?.removeAttribute("hidden");
});


// Toevoegen of bijwerken (boven het tabelletje)
document.addEventListener("click", async (ev) => {
  const save = ev.target.closest("#sub-save");
  if (!save) return;
  if (!currentUser){ alert("Log eerst in."); return; }

  const nameEl = document.getElementById("sub-name");
  const colorText = document.getElementById("sub-color-text");
  const name  = (nameEl?.value || "").trim();
  const color = colorText?.textContent || "#2196F3";
  if (!name){ alert("Geef een vaknaam."); return; }

  let subj = subjects.find(s => (s.name||"").toLowerCase() === name.toLowerCase());
  if (!subj){
    await addDoc(collection(db, "subjects"), { name, color, uid: currentUser.uid });
  } else {
    // update naam/kleur indien gewijzigd
    const updates = {};
    if (subj.name !== name)  updates.name  = name;
    if (subj.color !== color) updates.color = color;
    if (Object.keys(updates).length) await updateDoc(doc(db, "subjects", subj.id), updates);
  }
  // reset naamveld, preview laat ik staan op laatst gekozen kleur
  if (nameEl) nameEl.value = "";

  // Direct hertekenen (naast de live stream)
  renderSubjectsManager();
});


// Rij opslaan (update)
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".subj-update");
  if (!btn) return;
  if (!currentUser){ alert("Log eerst in."); return; }
  const tr = btn.closest("tr[data-id]");
  if (!tr) return;
  const id = tr.dataset.id;
  const name  = tr.querySelector(".s-name")?.value?.trim() || "";
  if (!name){ alert("Naam mag niet leeg zijn."); return; }
  await updateDoc(doc(db, "subjects", id), { name }); // kleur wijzig je via het palet bovenaan
  renderSubjectsManager();
});

// Verwijderen
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".subj-del");
  if (!btn) return;
  if (!currentUser){ alert("Log eerst in."); return; }
  const tr = btn.closest("tr[data-id]");
  if (!tr) return;
  const id = tr.dataset.id;
  if (!confirm("Dit vak verwijderen? (Backlog-items behouden hun oude vaknaam/kleur)")) return;
  await deleteDoc(doc(db, "subjects", id));
  renderSubjectsManager();
});




  // 🔧 Event delegation voor Save-knop (#bl-save), werkt ook als partials later laden

  // ▼▼ Backlog item opslaan (modal) – volledige functie ▼▼
document.addEventListener("click", async (ev) => {
  const saveBtn = ev.target.closest("#bl-save");
  if (!saveBtn) return;

  if (!currentUser) { alert("Log eerst in."); return; }

  // pak velden op het moment van klikken (modal kan later geladen zijn)
  const blSubject  = document.getElementById("bl-subject");
  const blType     = document.getElementById("bl-type");
  const blTitle    = document.getElementById("bl-title");
  const blDuration = document.getElementById("bl-duration");
  const blDue      = document.getElementById("bl-due");

  const subjName = (blSubject?.value || "").trim();
  if (!subjName) {
    window.Modal?.alert
      ? Modal.alert({ title: "Vak vereist", html: "Geef een vaknaam op." })
      : alert("Vak vereist");
    return;
  }

  // Zoek/maak vak + kleur
  let subj = subjects.find(s => (s.name||"").toLowerCase() === subjName.toLowerCase());

  // >>> HIER staat jouw gevraagde stuk (kleur uit vak, anders default uit PALETTE[0])
  const defaultColor = PALETTE[0]; // bv. "#2196F3"
  if (!subj) {
    const ref = await addDoc(collection(db, "subjects"), {
      name: subjName,
      color: defaultColor,
      uid: currentUser.uid
    });
    subj = { id: ref.id, name: subjName, color: defaultColor };
  }
  // <<< einde kleur- en vak-creatie

  // Payload gebruikt altijd de kleur van het vak
  const payload = {
    subjectId: subj.id,
    subjectName: subj.name,
    type: blType?.value || "taak",
    title: (blTitle?.value || "").trim(),
    durationHours: parseFloat(blDuration?.value) || 1,
    dueDate: blDue?.value ? new Date(blDue.value) : null,
    color: subj.color,                                // <— hier
symbol: sym(blType?.value || "taak"),
    uid: currentUser.uid,
    done: false,
    createdAt: new Date()
  };

  await addDoc(collection(db, "backlog"), payload);

  // update chip naar huidige (of reset)
const chosen = subjects.find(s => (s.name||"").toLowerCase() === (document.getElementById("bl-subject")?.value||"").toLowerCase());
setSubjectChip(chosen?.name || "", chosen?.color || "");


  // modal sluiten (of laat open als je dat wil)
  if (window.Modal?.close) Modal.close("modal-backlog");
  else document.getElementById("modal-backlog")?.setAttribute("hidden", "");

  // (optioneel) formulier resetten
  if (blSubject)  blSubject.value  = "";
  if (blTitle)    blTitle.value    = "";
  if (blType)     blType.value     = "taak";
  if (blDuration) blDuration.value = "1";
  if (blDue)      blDue.value      = "";
});



document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("#newBacklogBtn,[data-modal-open='modal-backlog']");
  if (!btn) return;

  if (!currentUser) { alert("Log eerst in om items te bewaren."); return; }

  // reset velden per klik (modal kan later geladen zijn)
  const blSubject  = document.getElementById("bl-subject");
  const blTitle    = document.getElementById("bl-title");
  const blType     = document.getElementById("bl-type");
  const blDuration = document.getElementById("bl-duration");
  const blDue      = document.getElementById("bl-due");
  const blColor    = document.getElementById("bl-color");

  if (blSubject)  blSubject.value  = "";
  if (blTitle)    blTitle.value    = "";
  if (blType)     blType.value     = "taak";
  if (blDuration) blDuration.value = "1";
  if (blDue)      blDue.value      = "";
  if (blColor)    blColor.value    = "#2196F3";

  // open modal – gebruik Modal util als die geladen is, anders fallback
  if (window.Modal?.open) Modal.open("modal-backlog");
  else document.getElementById("modal-backlog")?.removeAttribute("hidden");
});


  bind("#printList", "click", () => {
    const sEl = document.getElementById("printStart");
    const eEl = document.getElementById("printEnd");
    const s = sEl?.value ? new Date(sEl.value) : addDays(new Date(), -7);
    const e = eEl?.value ? new Date(eEl.value) : addDays(new Date(), 7);

    const list = plans
      .filter(p=> p.start>=s && p.start< addDays(e,1))
      .slice()
      .sort((a,b)=> a.start - b.start);

    const tpl = document.getElementById('print-template');
    const win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><title>Afdruk – Lijst</title></head><body></body></html>');

    const frag = tpl.content.cloneNode(true);
    const root = frag.getElementById('print-root');

    let curDayKey = '';
    list.forEach(p=>{
      const d = toDate(p.start);
      const key = toISODate(d);
      if(key!==curDayKey){
        curDayKey = key;
        const h = win.document.createElement('div'); h.className='day';
        h.innerHTML = `<strong>${d.toLocaleDateString('nl-BE',{weekday:'long', day:'2-digit', month:'2-digit'})}</strong>`;
        root.appendChild(h);
      }
      const li = win.document.createElement('div'); li.className='item';
      li.textContent = `${d.toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})} • ${p.title} (${p.type}) – ${p.subjectName} [${p.durationHours}u]`;
      root.appendChild(li);
    });

    win.document.body.appendChild(frag);
    win.document.close();
    win.focus();
  });

  /* ── Eerste render: grid altijd zichtbaar ── */
  renderWeek();

  /* ── Auth stream ── */
  onAuthStateChanged(auth, (user)=>{
    if(!user){
      currentUser = null;
      authDiv && (authDiv.style.display='block');
      appDiv  && (appDiv.style.display='block'); // UI zichtbaar
      renderWeek();
      return;
    }
    currentUser = user;
    authDiv && (authDiv.style.display='none');
    appDiv  && (appDiv.style.display='block');
    bindStreams();
    renderWeek();
  });

  /* ───────────────────── Renderers & Data ───────────────────── */
  function renderWeek(){
    const end = addDays(weekStart,6);
    weekTitle && (weekTitle.textContent = `Week ${fmtDate(weekStart)} – ${fmtDate(end)}`);
    renderCalendar();
  }

  function renderSubjectsDatalist(){
    if(!blSubjects) return;
    blSubjects.innerHTML = subjects.map(s=>`<option value="${esc(s.name)}"></option>`).join('');
  }

function renderSubjectsManager(){
  const tbody = document.getElementById("subjectsTable");
  if (!tbody) return;

  if (!Array.isArray(subjects) || subjects.length === 0){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Nog geen vakken…</td></tr>`;
  } else {
    tbody.innerHTML = subjects.map(s => `
      <tr data-id="${s.id}">
        <td><input class="s-name" value="${esc(s.name||'')}" /></td>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem;">
            <span class="dot" style="width:16px;height:16px;border-radius:50%;display:inline-block;background:${esc(s.color||'#2196F3')};border:1px solid #0001"></span>
            <code>${esc(s.color||'#2196F3')}</code>
          </div>
        </td>
        <td style="display:flex; gap:.4rem;">
          <button class="subj-update">Opslaan</button>
          <button class="subj-del danger">Verwijder</button>
        </td>
      </tr>
    `).join("");
  }

  // (Re)render palette + preview elke keer dat modal open of subjects wijzigen
  const palRoot = document.getElementById("sub-palette");
  const previewDot  = document.querySelector("#sub-color-preview .dot");
  const previewText = document.getElementById("sub-color-text");

  if (palRoot && previewDot && previewText){
    palRoot.innerHTML = "";
    const current = previewText.textContent || "#2196F3";
    PALETTE.forEach(hex=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.style.cssText = `width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #0002;background:${hex};cursor:pointer;`;
      if (hex.toLowerCase() === current.toLowerCase()){
        b.style.outline = "2px solid #0005";
      }
      b.addEventListener("click", ()=>{
        previewDot.style.background = hex;
        previewText.textContent = hex;
        // mark active
        palRoot.querySelectorAll(".swatch").forEach(s=> s.style.outline="");
        b.style.outline = "2px solid #0005";
      });
      palRoot.appendChild(b);
    });
  }
}


  function renderBacklog(){
    const container = document.getElementById("backlogGroups");
    if(!container) return;

    const groups = new Map();
    backlog.filter(x=>!x.done).forEach(item=>{
      const key = item.subjectId||'_none';
      if(!groups.has(key)) groups.set(key, { subjectName:item.subjectName||'—', color:item.color||'#ccc', items:[] });
      groups.get(key).items.push(item);
    });

    container.innerHTML = '';
    for(const [,grp] of groups){
      const wrap = document.createElement('div');
      wrap.className = 'bl-group';
      const fg = getContrast(grp.color);
      wrap.innerHTML = `
        <div class="bl-title" style="background:${grp.color};color:${fg};">
          <span>${esc(grp.subjectName)}</span>
        </div>
        <div class="bl-list"></div>
      `;
      const list = wrap.querySelector('.bl-list');
      grp.items.forEach(it=> list.appendChild(renderBacklogItem(it)) );
      container.appendChild(wrap);
    }
  }

 function renderBacklogItem(it){
  const row = document.createElement('div');
  row.className = 'bl-item';
  row.draggable = true;
  row.dataset.id = it.id;
  row.innerHTML = `
    <div class="bl-sym">${it.symbol||sym(it.type)}</div>
    <div class="bl-main">
      <div class="t">${esc(it.title||'(zonder titel)')}</div>
      <div class="sub">${it.type} • ${it.durationHours||1}u${it.dueDate?` • tegen ${toDate(it.dueDate).toLocaleDateString('nl-BE')}`:''}</div>
    </div>
    <div class="bl-actions">
      <button class="btn-icon sm neutral" title="Markeer klaar" aria-label="Markeer klaar">✓</button>
      <button class="btn-icon sm danger"  title="Verwijderen"    aria-label="Verwijderen">🗑️</button>
    </div>
  `;

  // DRAG START/END (krachtiger + highlighting)
  row.addEventListener('dragstart', (e)=>{
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({kind:'backlog', id: it.id}));
    e.dataTransfer.setData('text/plain', JSON.stringify({kind:'backlog', id: it.id})); // fallback
    document.body.classList.add('dragging-backlog');
  });
  row.addEventListener('dragend', ()=>{
    document.body.classList.remove('dragging-backlog');
  });

  // done / delete
  row.querySelector('.neutral').onclick = async ()=>{
    if(!currentUser){ alert('Log eerst in.'); return; }
    await updateDoc(doc(db,'backlog', it.id), { done: true, doneAt: new Date() });
  };
  row.querySelector('.danger').onclick = async ()=>{
    if(!currentUser){ alert('Log eerst in.'); return; }
    if(!confirm('Item verwijderen?')) return;
    await deleteDoc(doc(db,'backlog', it.id));
  };
  return row;
}


 function renderCalendar(){
  if(!calRoot) return;

  calRoot.innerHTML = '';
  const headTime = div('col-head'); headTime.textContent = '';
  calRoot.appendChild(headTime);
  for(let d=0; d<7; d++){
    const day = addDays(weekStart, d);
    const h = div('col-head');
    h.textContent = day.toLocaleDateString('nl-BE',{weekday:'long', day:'2-digit', month:'2-digit'});
    calRoot.appendChild(h);
  }

  const hStart = 7, hEnd = 22;

  // tijdkolom
  const tc = div('time-col');
  for(let h=hStart; h<hEnd; h++){
    const slot = div('time-slot'); slot.textContent = `${pad(h)}:00`; tc.appendChild(slot);
  }
  calRoot.appendChild(tc);

  // dagkolommen met **twee** dropniveaus:
  // - kleine "dropzones" per uur
  // - fallback: de hele dagkolom (als je tussen de rijen dropt)
  for(let d=0; d<7; d++){
    const col = div('day-col');
    col.dataset.day = String(d);

    // FALLBACK drop op volledige kolom (zet uur op hStart)
    col.ondragover = (e)=>{ e.preventDefault(); };
    col.ondrop = async (e)=>{
      e.preventDefault();
      if(!currentUser){ alert('Log in om te plannen.'); return; }
      let data = safeParse(e.dataTransfer.getData('application/json')) || safeParse(e.dataTransfer.getData('text/plain'));
      if(!data || data.kind!=='backlog') return;

      const item = backlog.find(x=>x.id===data.id);
      if(!item) return;

      const start = addDays(weekStart, d);
      start.setHours(hStart,0,0,0);
      try{
        await addDoc(collection(db,'plans'),{
          itemId: item.id,
          title: item.title,
          type: item.type,
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          color: item.color,
          symbol: item.symbol,
          start,
          durationHours: item.durationHours||1,
          uid: currentUser.uid,
          createdAt: new Date()
        });
      }catch(err){
        console.error('plan add error (col drop):', err);
        alert('Kon niet plannen: ' + (err?.message||err));
      }
    };

    // Dropzones per uur (precies plannen)
    for(let h=hStart; h<hEnd; h++){
      const z = div('dropzone');
      z.dataset.hour = String(h);
      z.ondragover = (e)=>{ e.preventDefault(); z.setAttribute('aria-dropeffect','move'); };
      z.ondragleave = ()=> z.removeAttribute('aria-dropeffect');
      z.ondrop = async (e)=>{
        e.preventDefault(); z.removeAttribute('aria-dropeffect');
        if(!currentUser){ alert('Log in om te plannen.'); return; }
        let data = safeParse(e.dataTransfer.getData('application/json')) || safeParse(e.dataTransfer.getData('text/plain'));
        if(!data || data.kind!=='backlog') return;
        const item = backlog.find(x=>x.id===data.id);
        if(!item) return;

        const start = addDays(weekStart, d);
        start.setHours(parseInt(z.dataset.hour,10),0,0,0);

        try{
          await addDoc(collection(db,'plans'),{
            itemId: item.id,
            title: item.title,
            type: item.type,
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            color: item.color,
            symbol: item.symbol,
            start,
            durationHours: item.durationHours||1,
            uid: currentUser.uid,
            createdAt: new Date()
          });
        }catch(err){
          console.error('plan add error (slot drop):', err);
          alert('Kon niet plannen: ' + (err?.message||err));
        }
      };
      col.appendChild(z);
    }
    calRoot.appendChild(col);
  }

  if (Array.isArray(plans) && plans.length){
    plans.forEach(p=> placeEvent(p));
  }
}


  function placeEvent(p){
    const d = clamp(Math.floor((toDate(p.start) - weekStart)/86400000), 0, 6);
    const hStart = 7;
    const hour = toDate(p.start).getHours();
    const topRows = clamp(hour - hStart, 0, 24);
    const height = Math.max(1, Math.round((p.durationHours||1)));

    const cols = calRoot.querySelectorAll('.day-col');
    const col = cols[d]; if(!col) return;

    const block = div('event');
    const bg = p.color || '#2196F3';
    block.style.background = bg; block.style.color = getContrast(bg);
    block.style.top = `${topRows*40 + 2}px`;
    block.style.height = `${height*40 - 4}px`;
    block.innerHTML = `
      <div class="title">${p.symbol||sym(p.type)} ${esc(p.title||'')}</div>
      <div class="meta">${(p.subjectName||'')} • ${pad(toDate(p.start).getHours())}:${pad(toDate(p.start).getMinutes())} • ${p.durationHours}u</div>
    `;

    block.addEventListener('click', async ()=>{
      if(!currentUser){ alert('Log eerst in.'); return; }
      if(!confirm('Deze planning verwijderen?')) return;
      await deleteDoc(doc(db,'plans', p.id));
    });

    col.appendChild(block);
  }

  /* ───────────────────── Firestore streams ───────────────────── */
  function bindStreams(){
    
    onSnapshot(
      query(collection(db,'subjects'), where('uid','==', currentUser.uid), orderBy('name','asc')),
      (snap)=>{
        subjects = snap.docs.map(d=>({id:d.id, ...d.data()}));
renderSubjectsDatalist();
renderBacklog();
renderCalendar();

// ▼ Extra UI: herteken manager / subject-menu als modals open zijn
const subjModalOpen = !document.getElementById("modal-subjects")?.hasAttribute("hidden");
if (subjModalOpen) renderSubjectsManager();

const subjInputVisible = !!document.getElementById("bl-subject") && !document.getElementById("modal-backlog")?.hasAttribute("hidden");
if (subjInputVisible){
  const input = document.getElementById("bl-subject");
  renderSubjectMenu(input?.value || "");
}

      },
      (err)=> console.error("subjects stream error", err)
    );

    onSnapshot(
      query(collection(db,'backlog'), where('uid','==', currentUser.uid), orderBy('subjectName','asc')),
      (snap)=>{
        backlog = snap.docs.map(d=>({id:d.id, ...d.data()}));
        renderBacklog();
      },
      (err)=> console.error("backlog stream error", err)
    );

  
    refreshPlans();



  }

  function refreshPlans(){
    const end = addDays(weekStart, 7);
    onSnapshot(
      query(
        collection(db,'plans'),
        where('uid','==', currentUser.uid),
        where('start','>=', weekStart),
        where('start','<',  end)
      ),
      (snap)=>{
plans = snap.docs.map(d=>({id:d.id, ...d.data(), start: toDate(d.data().start)}));
        renderCalendar();
      },
      (err)=> console.error("plans stream error", err)
    );
  }
});
