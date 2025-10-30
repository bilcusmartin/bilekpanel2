import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTH7L5eSmpIsMJTyyOFVotsWPuWX2dGCk",
  authDomain: "martin-panel.firebaseapp.com",
  projectId: "martin-panel",
  storageBucket: "martin-panel.firebasestorage.app",
  messagingSenderId: "372334501493",
  appId: "1:372334501493:web:b6f3cf370b00b9feed623c",
  measurementId: "G-KQR1E0DP04"
};

// 🔗 nastav po deploy funkcí (viz functions níže)
const FUNCTIONS_BASE_URL = "/__functions"; // po deploy na Firebase Hosting + Rewrites → /__functions
// nebo přímo URL https triggeru, např.: https://us-central1-martin-panel.cloudfunctions.net

let app = initializeApp(firebaseConfig);
let auth = getAuth(app);
let db = getFirestore(app);

/* --------------------------------
   AUTH + BOOT
---------------------------------*/
const appRoot = document.getElementById('appRoot');
const loadingMessage = document.getElementById('loadingMessage');

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (appRoot) appRoot.style.display = "block";
  if (loadingMessage) loadingMessage.style.display = "none";
  bindNav(); bindActions();
  await refreshAll();

  // 🔁 automatická kontrola po přihlášení
  try { await runScanNow(true); } catch(e){ console.warn('Auto scan po přihlášení selhal:', e); }
});

/* --------------------------------
   NAV
---------------------------------*/
function bindNav(){
  const map = {
    navDashboard: 'viewDashboard',
    navCompanies: 'viewCompanies',
    navClients: 'viewClients',
    navPosts: 'viewPosts',
    navSettings: 'viewSettings'
  };
  Object.entries(map).forEach(([btnId, viewId])=>{
    const b = document.getElementById(btnId);
    if (b) b.onclick = ()=> showView(viewId);
  });
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async ()=>{ await signOut(auth); window.location.href='index.html'; };
  showView('viewDashboard');
}
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.style.display='none');
  const el = document.getElementById(id); if (el) el.style.display='block';
}

/* --------------------------------
   DOM refs
---------------------------------*/
const statCompanies = document.getElementById('statCompanies');
const statClients   = document.getElementById('statClients');
const statPostsPending = document.getElementById('statPostsPending');

const coName = document.getElementById('coName');
const coFb   = document.getElementById('coFb');
const coLi   = document.getElementById('coLi');
const coWeb  = document.getElementById('coWeb');
const addCompanyBtn = document.getElementById('addCompanyBtn');
const companiesTable = document.getElementById('companiesTable')?.querySelector('tbody');

const clName = document.getElementById('clName');
const clEmail= document.getElementById('clEmail');
const clPhone= document.getElementById('clPhone');
const clNote = document.getElementById('clNote');
const addClientBtn = document.getElementById('addClientBtn');
const clientsTable = document.getElementById('clientsTable')?.querySelector('tbody');

const importCompaniesBtn = document.getElementById('importCompaniesBtn');
const importCompaniesInput = document.getElementById('importCompaniesInput');
const exportCompaniesBtn = document.getElementById('exportCompaniesBtn');
const importClientsBtn = document.getElementById('importClientsBtn');
const importClientsInput = document.getElementById('importClientsInput');
const exportClientsBtn = document.getElementById('exportClientsBtn');

const postCompany = document.getElementById('postCompany');
const postTitle   = document.getElementById('postTitle');
const postContent = document.ge
