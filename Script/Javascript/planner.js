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
const SYMBOL_BY_TYPE = { taak: "📝", toets: "🧪" };
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

  // UI zichtbaar houden (ook zonder login)
  if (authDiv) authDiv.style.display = "block";
  if (appDiv)  appDiv.style.display  = "block";

  /* ── UI wiring ── */
  bind("#login-btn", "click", () => signInWithPopup(auth, provider));
  bind("#prevWeek", "click", () => { weekStart = addDays(weekStart,-7); renderWeek(); if(currentUser) refreshPlans(); });
  bind("#nextWeek", "click", () => { weekStart = addDays(weekStart, 7); renderWeek(); if(currentUser) refreshPlans(); });

  bind("#newBacklogBtn", "click", () => {
    if(!currentUser){ alert("Log eerst in om items te bewaren."); return; }
    // reset waarden on the fly
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
    if (window.Modal?.open) Modal.open("modal-backlog");
    else document.getElementById("modal-backlog")?.removeAttribute("hidden");
  });

// Open "Vakken beheren" en render tabel
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("#manageSubjectsBtn");
  if (!btn) return;
  if (!currentUser) { alert("Log eerst in."); return; }
  renderSubjectsManager();               // bouw de tabel op uit 'subjects'
  if (window.Modal?.open) Modal.open("modal-subjects");
  else document.getElementById("modal-subjects")?.removeAttribute("hidden");
});

// Toevoegen of bijwerken (boven het tabelletje)
document.addEventListener("click", async (ev) => {
  const save = ev.target.closest("#sub-save");
  if (!save) return;
  if (!currentUser){ alert("Log eerst in."); return; }

  const nameEl  = document.getElementById("sub-name");
  const colorEl = document.getElementById("sub-color");
  const name  = (nameEl?.value || "").trim();
  const color = colorEl?.value || "#2196F3";
  if (!name){ alert("Geef een vaknaam."); return; }

  // Bestaat dit vak al? (case-insensitive)
  let subj = subjects.find(s => (s.name||"").toLowerCase() === name.toLowerCase());
  if (!subj){
    await addDoc(collection(db, "subjects"), { name, color, uid: currentUser.uid });
  } else if (subj.color !== color){
    await updateDoc(doc(db, "subjects", subj.id), { color });
  }
  // formulier resetten
  if (nameEl)  nameEl.value = "";
  if (colorEl) colorEl.value = "#2196F3";
  // stream van subjects triggert autorefresh van tabel & datalist
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
  const color = tr.querySelector(".s-color")?.value || "#2196F3";
  if (!name){ alert("Naam mag niet leeg zijn."); return; }
  await updateDoc(doc(db, "subjects", id), { name, color });
});

// Verwijderen
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".subj-del");
  if (!btn) return;
  if (!currentUser){ alert("Log eerst in."); return; }
  const tr = btn.closest("tr[data-id]");
  if (!tr) return;
  const id = tr.dataset.id;
  if (!confirm("Dit vak verwijderen? (Let op: bestaande backlog-items behouden hun oude vaknaam)")) return;
  await deleteDoc(doc(db, "subjects", id));
});



  // 🔧 Event delegation voor Save-knop (#bl-save), werkt ook als partials later laden



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
    return;
  }
  tbody.innerHTML = subjects.map(s => `
    <tr data-id="${s.id}">
      <td><input class="s-name" value="${esc(s.name||'')}" /></td>
      <td><input class="s-color" type="color" value="${esc(s.color||'#2196F3')}" /></td>
      <td style="display:flex; gap:.4rem;">
        <button class="subj-update">Opslaan</button>
        <button class="subj-del danger">Verwijder</button>
      </td>
    </tr>
  `).join("");
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
    row.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({kind:'backlog', id: it.id}));
    });
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

    const tc = div('time-col');
    for(let h=hStart; h<hEnd; h++){
      const slot = div('time-slot'); slot.textContent = `${pad(h)}:00`; tc.appendChild(slot);
    }
    calRoot.appendChild(tc);

    for(let d=0; d<7; d++){
      const col = div('day-col');
      col.dataset.day = String(d);

      for(let h=hStart; h<hEnd; h++){
        const z = div('dropzone');
        z.dataset.hour = String(h);
        z.ondragover = (e)=>{ e.preventDefault(); z.setAttribute('aria-dropeffect','move'); };
        z.ondragleave = ()=> z.removeAttribute('aria-dropeffect');
        z.ondrop = async (e)=>{
          e.preventDefault(); z.removeAttribute('aria-dropeffect');
          if(!currentUser){ alert('Log in om te plannen.'); return; }
          const data = safeParse(e.dataTransfer.getData('text/plain'));
          if(!data || data.kind!=='backlog') return;
          const item = backlog.find(x=>x.id===data.id);
          if(!item) return;

          const start = addDays(weekStart, d);
          start.setHours(hStart,0,0,0);
          start.setHours(parseInt(z.dataset.hour,10),0,0,0);

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
