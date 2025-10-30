import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// 🔹 Firebase konfigurace
const firebaseConfig = {
  apiKey: "AIzaSyCTH7L5eSmpIsMJTyyOFVotsWPuWX2dGCk",
  authDomain: "martin-panel.firebaseapp.com",
  projectId: "martin-panel",
  storageBucket: "martin-panel.firebasestorage.app",
  messagingSenderId: "372334501493",
  appId: "1:372334501493:web:b6f3cf370b00b9feed623c",
  measurementId: "G-KQR1E0DP04"
};

let app = initializeApp(firebaseConfig);
let auth = getAuth(app);
let db = getFirestore(app);

/* --- Přihlášení kontrola --- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("appRoot").style.display = "block";
    refreshAll();
    bindActions();
  }
});

/* --- Elementy --- */
const addCompanyBtn = document.getElementById("addCompanyBtn");
const companiesTable = document.getElementById("companiesTable")?.querySelector("tbody");
const importCompaniesBtn = document.getElementById("importCompaniesBtn");
const exportCompaniesBtn = document.getElementById("exportCompaniesBtn");
const importCompaniesInput = document.getElementById("importCompaniesInput");

const addClientBtn = document.getElementById("addClientBtn");
const clientsTable = document.getElementById("clientsTable")?.querySelector("tbody");
const importClientsBtn = document.getElementById("importClientsBtn");
const exportClientsBtn = document.getElementById("exportClientsBtn");
const importClientsInput = document.getElementById("importClientsInput");

const genAiBtn = document.getElementById("genAiBtn");
const aiOutput = document.getElementById("aiOutput");
const aiSubject = document.getElementById("aiSubject");
const aiGroup = document.getElementById("aiGroup");
const aiBody = document.getElementById("aiBody");
const aiLinksList = document.getElementById("aiLinksList");

/* --- Cache --- */
let companiesCache = [];
let clientsCache = [];

/* --- Nav --- */
document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

/* --- Akce --- */
function bindActions() {
  if (addCompanyBtn) addCompanyBtn.onclick = addCompany;
  if (addClientBtn) addClientBtn.onclick = addClient;

  // Import/Export firmy
  importCompaniesBtn.onclick = () => importCompaniesInput.click();
  importCompaniesInput.onchange = handleImportCompanies;
  exportCompaniesBtn.onclick = exportCompanies;

  // Import/Export klienti
  importClientsBtn.onclick = () => importClientsInput.click();
  importClientsInput.onchange = handleImportClients;
  exportClientsBtn.onclick = exportClients;

  // AI
  if (genAiBtn) genAiBtn.onclick = generateAi;
}

/* ------------------------------
   🔹 CRUD – Firmy
------------------------------ */
async function addCompany() {
  const coName = document.getElementById("coName").value.trim();
  const coFb = document.getElementById("coFb").value.trim();
  const coLi = document.getElementById("coLi").value.trim();
  const coWeb = document.getElementById("coWeb").value.trim();

  if (!coName) return alert("Zadej název firmy.");

  await addDoc(collection(db, "companies"), {
    name: coName,
    url_facebook: coFb || null,
    url_linkedin: coLi || null,
    url_web: coWeb || null,
    createdAt: serverTimestamp(),
  });
  refreshCompanies();
}

async function refreshCompanies() {
  companiesCache = [];
  const q = query(collection(db, "companies"), orderBy("name"));
  const snap = await getDocs(q);
  companiesTable.innerHTML = "";

  snap.forEach((docSnap) => {
    const v = docSnap.data();
    companiesCache.push({
      id: docSnap.id,
      name: v.name,
      fb: v.url_facebook || "",
      li: v.url_linkedin || "",
      web: v.url_web || "",
    });
  });

  companiesCache.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.fb ? `<a href="${c.fb}" target="_blank">Facebook</a>` : "—"}</td>
      <td>${c.li ? `<a href="${c.li}" target="_blank">LinkedIn</a>` : "—"}</td>
      <td>${c.web ? `<a href="${c.web}" target="_blank">Web</a>` : "—"}</td>
    `;
    companiesTable.appendChild(tr);
  });

  // update select pro AI
  const postCompany = document.getElementById("postCompany");
  if (postCompany) {
    postCompany.innerHTML = companiesCache
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
  }
}

/* ------------------------------
   🔹 CRUD – Klienti
------------------------------ */
async function addClient() {
  const name = document.getElementById("clName").value.trim();
  const email = document.getElementById("clEmail").value.trim();
  const phone = document.getElementById("clPhone").value.trim();
  const note = document.getElementById("clNote").value.trim();

  if (!name || !email) return alert("Zadej jméno a e-mail.");

  await addDoc(collection(db, "clients"), {
    name,
    email,
    phone,
    note,
    createdAt: serverTimestamp(),
  });

  refreshClients();
}

async function refreshClients() {
  clientsCache = [];
  const q = query(collection(db, "clients"), orderBy("name"));
  const snap = await getDocs(q);
  clientsTable.innerHTML = "";

  snap.forEach((docSnap) => {
    const v = docSnap.data();
    clientsCache.push({ id: docSnap.id, ...v });
  });

  clientsCache.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.email}</td>
      <td>${c.phone || "—"}</td>
      <td>${c.note || "—"}</td>
    `;
    clientsTable.appendChild(tr);
  });
}

/* ------------------------------
   🔹 IMPORT / EXPORT – XLSX
------------------------------ */

// 📤 Export firem
function exportCompanies() {
  if (!companiesCache.length) return alert("Žádné firmy k exportu.");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(companiesCache);
  XLSX.utils.book_append_sheet(wb, ws, "Firmy");
  XLSX.writeFile(wb, "firmy.xlsx");
}

// 📥 Import firem
async function handleImportCompanies(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const data = new Uint8Array(ev.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    for (const r of rows) {
      await addDoc(collection(db, "companies"), {
        name: r.name || r.Název || "Neznámá firma",
        url_facebook: r.fb || r.Facebook || "",
        url_linkedin: r.li || r.LinkedIn || "",
        url_web: r.web || r.Web || "",
        createdAt: serverTimestamp(),
      });
    }
    refreshCompanies();
  };
  reader.readAsArrayBuffer(file);
}

// 📤 Export klientů
function exportClients() {
  if (!clientsCache.length) return alert("Žádní klienti k exportu.");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(clientsCache);
  XLSX.utils.book_append_sheet(wb, ws, "Klienti");
  XLSX.writeFile(wb, "klienti.xlsx");
}

// 📥 Import klientů
async function handleImportClients(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const data = new Uint8Array(ev.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    for (const r of rows) {
      await addDoc(collection(db, "clients"), {
        name: r.name || r.Jméno || "Neznámý klient",
        email: r.email || r.Email || "",
        phone: r.phone || r.Telefon || "",
        note: r.note || r.Poznámka || "",
        createdAt: serverTimestamp(),
      });
    }
    refreshClients();
  };
  reader.readAsArrayBuffer(file);
}

/* ------------------------------
   🔹 AI E-maily – s odkazy a podpisem
------------------------------ */
async function generateAi() {
  const key = localStorage.getItem("openai_key");
  if (!key) return alert("Nejdřív ulož OpenAI klíč v Nastavení.");

  const postCompany = document.getElementById("postCompany").value;
  const postTitle = document.getElementById("postTitle").value;
  const postContent = document.getElementById("postContent").value;

  if (!postCompany || !postContent) return alert("Vyplň společnost i text.");

  const company = companiesCache.find((c) => c.id === postCompany);

const systemPrompt = `Jsi asistent, který vytváří profesionální e-maily pro skupinu klientů investujících ve vybraných společnostech.
Piš výhradně česky, s důrazem na formální tón a profesionalitu.

DŮLEŽITÁ PRAVIDLA:
1️⃣ Vždy oslovuj ve 2. osobě množného čísla — používej VY, VÁM, VAŠE, apod.
2️⃣ Nikdy nepoužívej 1. osobu ("já", "my", "náš") – mluv neutrálně nebo popisně, např. „Společnost oznámila…“, „Byla zveřejněna informace…“.
3️⃣ Piš profesionálně, srozumitelně a věcně, bez přehnaných emocí či reklamních frází.
4️⃣ Nikdy si NEVYMÝŠLEJ žádné údaje, čísla, jména, důvody ani spekulace. Používej pouze informace, které jsou uvedeny v poskytnutém textu.
5️⃣ Pokud některá data chybí, prostě je neuváděj.
6️⃣ E-mail musí být napsán pro více adresátů – tedy formát ve množném čísle („Vážení klienti,“ apod.).
7️⃣ Text musí být maximálně 5–7 vět, srozumitelný a strukturovaný.
8️⃣ Na konci e-mailu musí být přesně jeden podpis (bez variant, bez opakování):

S pozdravem,
Martin Bílek

📄 Výstup vrať pouze jako:
1) Předmět: <krátký formální předmět do 50 znaků>
2) E-mail:
<Oslovení ve 2. osobě množného čísla>
<Text e-mailu podle výše uvedených pravidel>
S pozdravem,
Martin Bílek`;


  const userPrompt = `Nadpis: ${postTitle}\nText:\n${postContent}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  // odstranění vícenásobných podpisů
  let cleanText = text.replace(/(S\\s*pozdravem[\\s\\S]*)/gi, "").trim();
  cleanText += "\n\nS pozdravem,\nMartin Bílek";

  aiOutput.style.display = "block";
  aiSubject.value = postTitle.slice(0, 50);
  aiBody.value = cleanText;
  aiGroup.value = `Klienti investující v ${company?.name || "neznámé firmě"}`;

  // automatické doplnění odkazů na sítě
  const links = [];
  if (company?.li) links.push(`<a href="${company.li}" target="_blank">LinkedIn</a>`);
  if (company?.fb) links.push(`<a href="${company.fb}" target="_blank">Facebook</a>`);
  if (company?.web) links.push(`<a href="${company.web}" target="_blank">Web</a>`);

  aiLinksList.innerHTML = links.length ? links.map(l => `<li>${l}</li>`).join("") : "<li>Žádné odkazy nenalezeny.</li>";
}

/* ------------------------------
   🔹 Refresh všech dat
------------------------------ */
async function refreshAll() {
  await refreshCompanies();
  await refreshClients();
}
