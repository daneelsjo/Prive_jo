import {
// time col
const tc = div('time-col');
for(let h=hStart; h<hEnd; h++){
const slot = div('time-slot'); slot.textContent = `${pad(h)}:00`; tc.appendChild(slot);
}
calRoot.appendChild(tc);


// day cols
for(let d=0; d<7; d++){
const col = div('day-col');
col.dataset.day = String(d);
// build droppable rows (hour start)
for(let h=hStart; h<hEnd; h++){
const z = div('dropzone');
z.dataset.hour = String(h);
z.ondragover = (e)=>{ e.preventDefault(); z.setAttribute('aria-dropeffect','move'); };
z.ondragleave = ()=> z.removeAttribute('aria-dropeffect');
z.ondrop = async (e)=>{
e.preventDefault(); z.removeAttribute('aria-dropeffect');
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


// render events for current week
plans.forEach(p=> placeEvent(p));
}


function placeEvent(p){
// compute column and top/height
const d = clamp(Math.floor((p.start - weekStart)/86400000), 0, 6);
const hStart = 7; // must match rendering
const hour = p.start.getHours();
const topRows = clamp(hour - hStart, 0, 24);
const height = Math.max(1, Math.round((p.durationHours||1)));


// find day col
const cols = calRoot.querySelectorAll('.day-col');
const col = cols[d]; if(!col) return;


const block = div('event');
const bg = p.color || '#2196F3';
block.style.background = bg; block.style.color = getContrast(bg);
block.style.top = `${topRows*40 + 2}px`; // 40px per uur
block.style.height = `${height*40 - 4}px`;
block.innerHTML = `
<div class="title">${p.symbol||sym(p.type)} ${escapeHtml(p.title||'')}</div>
<div class="meta">${(p.subjectName||'')} • ${pad(p.start.getHours())}:${pad(p.start.getMinutes())} • ${p.durationHours}u</div>
`;


// context: klik = verwijderen
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