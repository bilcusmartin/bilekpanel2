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
const postContent = document.getElementById('postContent');
const genAiBtn    = document.getElementById('genAiBtn');
const aiOutput    = document.getElementById('aiOutput');
const aiSubject   = document.getElementById('aiSubject');
const aiGroup     = document.getElementById('aiGroup');
const aiBody      = document.getElementById('aiBody');
const aiLinksList = document.getElementById('aiLinksList');

const openaiKeyInput = document.getElementById('openaiKeyInput');
const saveOpenAiBtn  = document.getElementById('saveOpenAiBtn');
const clearOpenAiBtn = document.getElementById('clearOpenAiBtn');

const runScanNowBtn = document.getElementById('runScanNowBtn');

/* --------------------------------
   STATE
---------------------------------*/
let companiesCache = [], clientsCache = [], postsCache = [];

/* --------------------------------
   BIND ACTIONS
---------------------------------*/
function bindActions(){
  if (addCompanyBtn) addCompanyBtn.onclick = addCompany;
  if (addClientBtn)  addClientBtn.onclick  = addClient;

  if (importCompaniesBtn) importCompaniesBtn.onclick = ()=> importCompaniesInput.click();
  if (importCompaniesInput) importCompaniesInput.onchange = handleImportCompanies;
  if (exportCompaniesBtn) exportCompaniesBtn.onclick = exportCompanies;

  if (importClientsBtn) importClientsBtn.onclick = ()=> importClientsInput.click();
  if (importClientsInput) importClientsInput.onchange = handleImportClients;
  if (exportClientsBtn) exportClientsBtn.onclick = exportClients;

  if (genAiBtn) genAiBtn.onclick = generateAi;

  if (saveOpenAiBtn) saveOpenAiBtn.onclick = ()=> { localStorage.setItem('openai_key', (openaiKeyInput.value||'').trim()); alert('OpenAI klíč uložen.'); };
  if (clearOpenAiBtn) clearOpenAiBtn.onclick = ()=> { localStorage.removeItem('openai_key'); alert('OpenAI klíč smazán.'); };

  if (runScanNowBtn) runScanNowBtn.onclick = ()=> runScanNow(false);
}

/* --------------------------------
   COMPANIES
---------------------------------*/
async function addCompany(){
  const name = (coName?.value||'').trim();
  if (!name) return alert('Zadejte název firmy.');
  await addDoc(collection(db,'companies'), {
    name,
    url_facebook: (coFb?.value||'').trim() || null,
    url_linkedin: (coLi?.value||'').trim() || null,
    url_web:      (coWeb?.value||'').trim() || null,
    createdAt: serverTimestamp()
  });
  coName.value = coFb.value = coLi.value = coWeb.value = '';
  await refreshCompanies();
}
async function refreshCompanies(){
  companiesCache = [];
  const snap = await getDocs(query(collection(db,'companies'), orderBy('name')));
  companiesTable.innerHTML = '';
  snap.forEach(d=>{
    const v = d.data();
    const row = {
      id: d.id,
      name: v.name || '',
      fb:   v.url_facebook || '',
      li:   v.url_linkedin || '',
      web:  v.url_web || ''
    };
    companiesCache.push(row);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${row.fb  ? `<a href="${row.fb}" target="_blank" rel="noopener">Facebook</a>` : '—'}</td>
      <td>${row.li  ? `<a href="${row.li}" target="_blank" rel="noopener">LinkedIn</a>` : '—'}</td>
      <td>${row.web ? `<a href="${row.web}" target="_blank" rel="noopener">Web</a>` : '—'}</td>
    `;
    companiesTable.appendChild(tr);
  });
  if (postCompany) postCompany.innerHTML = companiesCache.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

/* --------------------------------
   CLIENTS
---------------------------------*/
async function addClient(){
  const name = (clName?.value||'').trim();
  const email= (clEmail?.value||'').trim();
  const phone= (clPhone?.value||'').trim();
  const note = (clNote?.value||'').trim();
  if (!name || !email) return alert('Zadejte jméno i e-mail.');
  await addDoc(collection(db,'clients'), {
    name,email,phone,note, createdAt: serverTimestamp()
  });
  clName.value = clEmail.value = clPhone.value = clNote.value = '';
  await refreshClients();
}
async function refreshClients(){
  clientsCache = [];
  const snap = await getDocs(query(collection(db,'clients'), orderBy('name')));
  clientsTable.innerHTML='';
  snap.forEach(d=>{
    const v = d.data();
    const row = { id:d.id, name:v.name||'', email:v.email||'', phone:v.phone||'', note:v.note||'' };
    clientsCache.push(row);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(row.name)}</td><td><a href="mailto:${encodeURIComponent(row.email)}">${escapeHtml(row.email)}</a></td><td>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.note)}</td>`;
    clientsTable.appendChild(tr);
  });
}

/* --------------------------------
   POSTS (load list)
---------------------------------*/
async function refreshPosts(){
  // zjednodušeno: ukazujeme jen statistiku -> kolik je „Neposláno“
  const postsTable = document.getElementById('postsTable')?.querySelector('tbody');
  if (!postsTable){ return; }
  postsTable.innerHTML = '';
  const snap = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc')));
  postsCache = [];
  let pending = 0;
  snap.forEach(d=>{
    const v = d.data();
    const p = {
      id: d.id,
      companyId: v.companyId,
      title: v.title || '(bez názvu)',
      createdAt: v.createdAt?.toDate?.() || null,
      status: v.status || 'Neposláno'
    };
    postsCache.push(p);
    if (p.status === 'Neposláno') pending++;
    const co = companiesCache.find(c=>c.id===p.companyId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(co?.name||'—')}</td><td>${escapeHtml(p.title)}</td><td>${p.createdAt? p.createdAt.toLocaleString():'—'}</td><td>${escapeHtml(p.status)}</td>`;
    postsTable.appendChild(tr);
  });
  statPostsPending.textContent = String(pending);
}

/* --------------------------------
   IMPORT / EXPORT XLSX
---------------------------------*/
function exportCompanies(){
  if (!companiesCache.length) return alert('Žádné firmy k exportu.');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(companiesCache);
  XLSX.utils.book_append_sheet(wb, ws, 'Firmy');
  XLSX.writeFile(wb, 'firmy.xlsx');
}
function exportClients(){
  if (!clientsCache.length) return alert('Žádní klienti k exportu.');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(clientsCache);
  XLSX.utils.book_append_sheet(wb, ws, 'Klienti');
  XLSX.writeFile(wb, 'klienti.xlsx');
}
async function handleImportCompanies(e){
  const file = e.target.files[0]; if(!file) return;
  const rows = await readXlsx(file);
  for (const r of rows){
    await addDoc(collection(db,'companies'), {
      name: r.name || r.Název || 'Neznámá firma',
      url_facebook: r.fb || r.Facebook || '',
      url_linkedin: r.li || r.LinkedIn || '',
      url_web: r.web || r.Web || '',
      createdAt: serverTimestamp()
    });
  }
  await refreshCompanies();
}
async function handleImportClients(e){
  const file = e.target.files[0]; if(!file) return;
  const rows = await readXlsx(file);
  for (const r of rows){
    await addDoc(collection(db,'clients'), {
      name: r.name || r.Jméno || 'Neznámý klient',
      email: r.email || r.Email || '',
      phone: r.phone || r.Telefon || '',
      note: r.note || r.Poznámka || '',
      createdAt: serverTimestamp()
    });
  }
  await refreshClients();
}
function readXlsx(file){
  return new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = (ev)=>{
      const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws));
    };
    fr.readAsArrayBuffer(file);
  });
}

/* --------------------------------
   AI GENERATOR (klientský)
---------------------------------*/
async function generateAi(){
  const key = localStorage.getItem('openai_key');
  if (!key) return alert('Uložte OpenAI klíč v Settings.');
  const company = companiesCache.find(c=>c.id === postCompany.value);
  const title = (postTitle?.value||'').trim();
  const content = (postContent?.value||'').trim();
  if (!company || !content) return alert('Vyplňte společnost i text.');

  const systemPrompt = `Jste asistent, který vytváří profesionální e-maily pro skupinu klientů investujících ve vybraných společnostech.
Pište výhradně česky, s formálním tónem.

PRAVIDLA:
- Vždy oslovujte ve 2. osobě množného čísla (Vy, Vám, Vaše).
- Nikdy nepoužívejte 1. osobu („já“, „my“, „náš“). Popisujte neutrálně („Společnost oznámila…“).
- Nepřidávejte žádná vymyšlená data. Použijte jen informace z poskytnutého textu.
- Pokud data chybí, neuvádějte je.
- Na konci musí být přesně jeden podpis:

S pozdravem,
Martin Bílek

Výstup:
1) Předmět: <krátký formální předmět do 50 znaků>
2) E-mail:
<Oslovení a text ve 2. osobě množného čísla>
S pozdravem,
Martin Bílek`;

  const userPrompt = `Nadpis: ${title}\nText:\n${content}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+key },
    body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.2, messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}] })
  });
  const data = await resp.json();
  const out = data?.choices?.[0]?.message?.content || '';
  let body = out.replace(/(S\s*pozdravem[\s\S]*)/i,'').trim() + '\n\nS pozdravem,\nMartin Bílek';

  aiOutput.style.display = 'block';
  aiSubject.value = (title||company?.name||'Aktualita').slice(0,50);
  aiGroup.value = `Klienti investující v ${company?.name||''}`;
  aiBody.value = body;

  const links = [];
  if (company?.li) links.push(`<a href="${company.li}" target="_blank" rel="noopener">LinkedIn</a>`);
  if (company?.fb) links.push(`<a href="${company.fb}" target="_blank" rel="noopener">Facebook</a>`);
  if (company?.web) links.push(`<a href="${company.web}" target="_blank" rel="noopener">Web</a>`);
  aiLinksList.innerHTML = links.length ? links.map(l=>`<li>${l}</li>`).join('') : '<li>Žádné odkazy</li>';
}

/* --------------------------------
   SERVER SCAN (HTTP funkce)
---------------------------------*/
async function runScanNow(silent){
  // zavolá Cloud Function, která projde firmy, načte poslední příspěvek a uloží shrnutí do Firestore (posts)
  try{
    const url = `${FUNCTIONS_BASE_URL}/scanNow`; // po rewrites → /__functions/scanNow
    const resp = await fetch(url, { method:'POST' });
    if (!resp.ok) throw new Error(await resp.text());
    const j = await resp.json();
    if (!silent) alert(`Hotovo: ${j.processed} firem zkontrolováno, ${j.created} nových shrnutí.`);
    await refreshAll();
  }catch(e){
    if (!silent) alert('Sken selhal: ' + (e?.message||e));
  }
}

/* --------------------------------
   HELPERS + REFRESH
---------------------------------*/
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function refreshAll(){ await refreshCompanies(); await refreshClients(); await refreshPosts(); }
