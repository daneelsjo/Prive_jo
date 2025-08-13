// Script/Javascript/firebase-config.js
// Centrale plek voor Firebase-config + versiebeheer van SDK modules.

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";

// 🔐 Publieke webconfig (mag client-side staan; wél beperken op domeinen in Google Cloud!)
export const firebaseConfig = {
    apiKey: "AIzaSyBkVwWdSNwlPWjeNT_BRb7pFzkeVB2VT3Q",
    authDomain: "prive-jo.firebaseapp.com",
    projectId: "prive-jo",
    storageBucket: "prive-jo.firebasestorage.app",
    messagingSenderId: "849510732758",
    appId: "1:849510732758:web:6c506a7f7adcc5c1310a77",
    measurementId: "G-HN213KC33L"
};

// Singleton: voorkom dubbele initialisatie als meerdere modules importeren.
export function getFirebaseApp() {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/* Re-exporteer de SDK-modules vanuit één versie-anker */
export {
    // Auth
    getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

export {
    // Firestore
    getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, updateDoc,
    deleteDoc, serverTimestamp, deleteField, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
