// Script/Javascript/planner.js
// Weekplanner met backlog (vakken/taak/toets) + Firestore opslag

import {
  getFirebaseApp,
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy
} from "./firebase-config.js";

// ───────── Firebase init ─────────
const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ───────── DOM ─────────
const loginBtn   = document.getElementById("login-btn");
const authDiv    = document.getElementById("auth");
const appDiv     = document.getElementById("app");

const weekTitle  = document.getElementById("weekTitle");
const prevWeekBtn= document.getElementById("prevWeek");
const nextWeekBtn= document.getElementById("nextWeek");
const calRoot    = document.getElementById("calendar");

const backlogGroups = document.getElementById("backlogGroups");
const newBacklogBtn = document.getElementById("newBacklogBtn");

const printStart = document.getElementById("printStart");
const printEnd   = document.getElementById("printEnd");
const printListBtn = document.getElementById("printList");

// Modal velden
const blSubjects = document.getElementById("bl-subjects");
const blSubject  = document.getElementById("bl-subject");
const blType     = document.getElementById("bl-type");
const blTitle    = document.getElementById("bl-title");
const blDuration = document.getElementById("bl-duration");
const blDue      = document.getElementById("bl-due");
const blColor    = document.getElementById("bl-color");
const blSave     = document.getElementById("bl-save");

// Fallback: toon UI zodat er nooit “niets zichtbaar” is
if (authDiv) authDiv.style.display = 'block';
if (appDiv)  appDiv.style.display  = 'block';

// ───────── State ─────────
let currentUser = null;
let subjects = [];  // {id,name,color,uid}
let backlog  = [];  // {id,subjectId,subjectName,type,title,durationHours,dueDate,color,symbol,uid,done}
let plans    = [];  // {id,itemId,start,durationHours,uid}

let weekStart = startOfWeek(new Date()); // maandag

// ───────── Helpers ─────────
const SYMBOL_BY_TYPE = { taak: "📝", toets: "🧪" };
const sym = (type) => SYMBOL_BY_TYPE[type] || "📌";
const pad = (n) => String(n).padStart(2,'0');

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

// contrast text op kleur
function getContrast(hex){
  if(!/^#?[0-9a-f]{6}$/i.test(hex)) return '#000';
  const h = hex.startsWith('#')?hex.slice(1):hex;
  const r=parseInt(h.substr(0,2),16), g=parseInt(h.substr(2,2),16), b=parseInt(h.substr(4,2),16);
  const yiq=(r*299+g*587+b*114)/1000; return yiq>=128?'#000':'#fff';
}

// ───────── Auth ─────────
if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, provider);

onAuthStateChanged(auth, (user)=>{
  if(!user){
    currentUser = null;
    if (authDiv) authDiv.style.display='block';
    if (appDiv)  appDiv.style.display='block'; // UI blijft zichtbaar
    renderWeek(); // toon grid
    return;
  }
  currentUser = user;
  if (authDiv) authDiv.style.display='none';
  if (appDiv)  appDiv.style.display='block';
  bindStreams();
  renderWeek();
});

// ───────── Firestore streams ─────────
function bindStreams(){
  onSnapshot(
    query(collection(db,'subjects'), where('uid','==', currentUser.uid), orderBy('name','asc')),
    (snap)=>{
      subjects = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderSubjectsDatalist();
      renderBacklog();
      renderCalendar();
    }
  );

  onSnapshot(
    query(collection(db,'backlog'), where('uid','==', currentUser.uid), orderBy('subjectName','asc')),
    (snap)=>{
      backlog = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderBacklog();
    }
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
      where('start','<', end)
    ),
    (snap)=>{
      plans = snap.docs.map(d=>{
        const data = d.data();
        // start kan Timestamp zijn → naar Date
        let s = data.start;
        if (s && typeof s.toDate === 'function') s = s.toDate();
        return {id:d.id, ...data, start: s};
      });
      renderCalendar();
    }
  );
}

// ───────── UI wiring ─────────
prevWeekBtn.onclick = ()=>{ weekStart = addDays(weekStart,-7); renderWeek(); if(currentUser) refreshPlans(); };
nextWeekBtn.onclick = ()=>{ weekStart = addDays(weekStart, 7); renderWeek(); if(currentUser) refreshPlans(); };

newBacklogBtn.onclick = ()=>{
  if(!currentUser){ alert('Log eerst in om items te kunnen bewaren.'); return; }
  blSubject.value = '';
  blTitle.value = '';
  blType.value = 'taak';
  blDuration.value = '1';
  blDue.value = '';
  blColor.value = '#2196F3';
  Modal.open('modal-backlog');
};

blSave.onclick = async ()=>{
  if(!currentUser){ alert('Log eerst in.'); return; }
  const subjName = (blSubject.value||'').trim();
  if(!subjName){ Modal.alert({title:'Vak vereist', html:'Geef een vaknaam op.'}); return; }

  // Vak aanmaken of updaten
  let subj = subjects.find(s=> s.name.toLowerCase()===subjName.toLowerCase());
  if(!subj){
    const docRef = await addDoc(collection(db,'subjects'),{ name: subjName, color: blColor.value, uid: currentUser.uid });
    subj = { id: docRef.id, name: subjName, color: blColor.value };
  }else if (subj.color !== blColor.value){
    await updateDoc(doc(db,'subjects',subj.id), { color: blColor.value });
  }

  const payload = {
    subjectId: subj.id,
    subjectName: subj.name,
    type: blType.value, // taak|toets
    title: (blTitle.value||'').trim(),
    durationHours: parseFloat(blDuration.value)||1,
    dueDate: blDue.value? new Date(blDue.value): null,
    color: subj.color,
    symbol: sym(blType.value),
    uid: currentUser.uid,
    done: false,
    createdAt: new Date()
  };
  await addDoc(collection(db,'backlog'), payload);
  Modal.close('modal-backlog');
};

printListBtn.onclick = ()=>{
  const s = printStart.value? new Date(printStart.value): addDays(new Date(), -7);
  const e = printEnd.value?   new Date(printEnd.value)  : addDays(new Date(), 7);

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
    const d = p.start instanceof Date ? p.start : new Date(p.start);
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
};

// ───────── Renderers ─────────
function renderWeek(){
  const end = addDays(weekStart,6);
  weekTitle.textContent = `Week ${fmtDate(weekStart)} – ${fmtDate(end)}`;
  renderCalendar();
}

function renderSubjectsDatalist(){
  if(!blSubjects) return;
  blSubjects.innerHTML = subjects.map(s=>`<option value="${escapeHtml(s.name)}"></option>`).join('');
}

function renderBacklog(){
  if(!backlogGroups) return;
  // groepeer per vak
  const groups = new Map();
  backlog.filter(x=>!x.done).forEach(item=>{
    const key = item.subjectId||'_none';
    if(!groups.has(key)) groups.set(key, { subjectName:item.subjectName||'—', color:item.color||'#ccc', items:[] });
    groups.get(key).items.push(item);
  });
  backlogGroups.innerHTML = '';
  for(const [,grp] of groups){
    const wrap = document.createElement('div');
    wrap.className = 'bl-group';
    const fg = getContrast(grp.color);
    wrap.innerHTML = `
      <div class="bl-title" style="background:${grp.color};color:${fg};">
        <span>${escapeHtml(grp.subjectName)}</span>
      </div>
      <div class="bl-list"></div>
    `;
    const list = wrap.querySelector('.bl-list');
    grp.items.forEach(it=> list.appendChild(renderBacklogItem(it)) );
    backlogGroups.appendChild(wrap);
  }
}

function renderBacklogItem(it){
  const row = document.createElement('div');
  row.className = 'bl-item';
  row.draggable = true;
  row.dataset.id = it.id;
  const dueTxt = it.dueDate
    ? ` • tegen ${new Date(it.dueDate.seconds?it.dueDate.seconds*1000:it.dueDate).toLocaleDateString('nl-BE')}`
    : '';
  row.innerHTML = `
    <div class="bl-sym">${it.symbol||sym(it.type)}</div>
    <div class="bl-main">
      <div class="t">${escapeHtml(it.title||'(zonder titel)')}</div>
      <div class="sub">${it.type} • ${it.durationHours||1}u${dueTxt}</div>
    </div>
    <div class="bl-actions">
      <button class="btn-icon sm neutral" title="Markeer klaar" aria-label="Markeer klaar">✓</button>
      <button class="btn-icon sm danger" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
    </div>
  `;
  // drag
  row.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/plain', JSON.stringify({kind:'backlog', id: it.id}));
  });
  // klaar
  row.querySelector('.neutral').onclick = async ()=>{
    await updateDoc(doc(db,'backlog', it.id), { done: true, doneAt: new Date() });
  };
  // delete
  row.querySelector('.danger').onclick = async ()=>{
    if(!confirm('Item verwijderen?')) return; await deleteDoc(doc(db,'backlog', it.id));
  };
  return row;
}

function renderCalendar(){
  if(!calRoot) return;

  // headers
  calRoot.innerHTML = '';
  const headTime = div('col-head'); headTime.textContent = '';
  calRoot.appendChild(headTime);
  for(let d=0; d<7; d++){
    const day = addDays(weekStart, d);
    const h = div('col-head');
    h.textContent = day.toLocaleDateString('nl-BE',{weekday:'long', day:'2-digit', month:'2-digit'});
    calRoot.appendChild(h);
  }

  // tijdkolom + dagen
  const hStart = 7, hEnd = 22; // 7–22u

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

  // events voor de week
  if (plans && plans.length){ plans.forEach(p=> placeEvent(p)); }
}

function placeEvent(p){
  const d = clamp(Math.floor((p.start - weekStart)/86400000), 0, 6);
  const hStart = 7;
  const hour = p.start.getHours();
  const topRows = clamp(hour - hStart, 0, 24);
  const height = Math.max(1, Math.round((p.durationHours||1)));

  const cols = calRoot.querySelectorAll('.day-col');
  const col = cols[d]; if(!col) return;

  const block = div('event');
  const bg = p.color || '#2196F3';
  block.style.background = bg; block.style.color = getContrast(bg);
  block.style.top = `${topRows*40 + 2}px`;  // 40px per uur
  block.style.height = `${height*40 - 4}px`;
  block.innerHTML = `
    <div class="title">${p.symbol||sym(p.type)} ${escapeHtml(p.title||'')}</div>
    <div class="meta">${(p.subjectName||'')} • ${pad(p.start.getHours())}:${pad(p.start.getMinutes())} • ${p.durationHours}u</div>
  `;

  block.addEventListener('click', async ()=>{
    if(!confirm('Deze planning verwijderen?')) return;
    await deleteDoc(doc(db,'plans', p.id));
  });

  col.appendChild(block);
}

// ───────── Utils ─────────
function div(cls){ const el = document.createElement('div'); if(cls) el.className=cls; return el; }
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function safeParse(s){ try{ return JSON.parse(s); }catch{ return null; } }

// Eerste render zodat de grid zichtbaar is, ook zonder login
renderWeek();
