// ============================================================
// BioTracker — firebase-init.js
// Inizializzazione Firebase SDK e Cloud Firestore
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyAgXwld5mD-",
    authDomain: "biotracker-app-7bc00.firebaseapp.com",
    projectId: "biotracker-app-7bc00",
    storageBucket: "biotracker-app-7bc00.firebasestorage.app",
    messagingSenderId: "813661827645",
    appId: "1:813661827645:web:489dd49df5967a04fc7054",
    measurementId: "G-RTN0FDDR4H"
};

// Inizializza l'app Firebase
firebase.initializeApp(firebaseConfig);

// Inizializza Cloud Firestore e ottieni un riferimento al servizio
const db = firebase.firestore();

// Opzionale: disabilita i warning di deprecazione su date
db.settings({ ignoreUndefinedProperties: true });
