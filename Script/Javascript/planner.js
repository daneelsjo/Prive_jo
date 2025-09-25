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
const loginBtn = document.getElementById("login-btn");
const authDiv = document.getElementById("auth");
const appDiv = document.getElementById("app");


const weekTitle = document.getElementById("weekTitle");
const prevWeekBtn = document.getElementById("prevWeek");
const nextWeekBtn = document.getElementById("nextWeek");
const calRoot = document.getElementById("calendar");


const backlogGroups = document.getElementById("backlogGroups");
const newBacklogBtn = document.getElementById("newBacklogBtn");


const printStart = document.getElementById("printStart");
const printEnd = document.getElementById("printEnd");
const printListBtn = document.getElementById("printList");


// Modal velden
const blSubjects = document.getElementById("bl-subjects");
const blSubject = document.getElementById("bl-subject");
const blType = document.getElementById("bl-type");
const blTitle = document.getElementById("bl-title");
const blDuration = document.getElementById("bl-duration");
const blDue = document.getElementById("bl-due");
const blColor = document.getElementById("bl-color");
const blSave = document.getElementById("bl-save");


// ───────── State ─────────
let currentUser = null;
let subjects = []; // {id,name,color,uid}
let backlog = []; // {id,subjectId,subjectName,type,title,durationHours,dueDate,color,symbol,uid,done}
let plans = []; // {id,itemId,start,durationHours,uid}


// Week state
let weekStart = startOfWeek(new Date()); // maandag


// ───────── Helpers ─────────
const SYMBOL_BY_TYPE = { taak: "📝", toets: "🧪" };
function sym(type){ return SYMBOL_BY_TYPE[type] || "📌"; }
function pad(n){ return String(n).padStart(2,'0'); }
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
function hoursBetween(a,b){ return (b-a)/3600000; }
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }


// contrast text op kleur
function getContrast(hex){
if(!/^#?[0-9a-f]{6}$/i.test(hex)) return '#000';
}