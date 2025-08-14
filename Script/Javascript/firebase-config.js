// Script/Javascript/firebase-config.js
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";

// 🔐 Publieke webconfig (voor web hoort deze client-side; beperk 'm op domeinen!)
export const firebaseConfig = {
    apiKey: "AIzaSyDo_zVn_4H1uM7EU-LhQV5XOYBcJmZ0Y3o",
    authDomain: "prive-jo.firebaseapp.com",
    projectId: "prive-jo",
    storageBucket: "prive-jo.firebasestorage.app",
    messagingSenderId: "849510732758",
    appId: "1:849510732758:web:6c506a7f7adcc5c1310a77",
    measurementId: "G-HN213KC33L"
};

export function getFirebaseApp() {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// ---- Re-exports uit één versie-anker ----

// Auth
export {
    getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

// Firestore
export {
    getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc,
    serverTimestamp, deleteField, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
