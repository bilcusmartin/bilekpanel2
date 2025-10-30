import 'dotenv/config';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import crypto from 'node:crypto';
import OpenAI from 'openai';

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Pomocná: stáhne HTML a vrátí krátký text (title + meta og:description)
 */
async function fetchPageSummary(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerioLoad(html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const desc =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const text = `${title}\n${desc}`.trim();
    return text || (html.slice(0, 600).replace(/\s+/g, ' ').trim());
  } catch (e) {
    console.warn('fetchPageSummary failed for', url, e.message);
    return '';
  }
}

/**
 * Vytvoří stabilní hash textu — abychom neposílali duplicitní shrnutí.
 */
function hashOf(str) {
  return crypto.createHash('sha256').update(String(str || '')).digest('hex');
}

/**
 * Požádá OpenAI o formální shrnutí (vykání, množné číslo, 1 podpis).
 */
async function summarizeWithAI({ companyName, sourceTitle, sourceText }) {
  const systemPrompt = `Jste asistent, který vytváří profesionální e-maily pro skupinu klientů investujících ve vybraných společnostech.
Pište VÝHRADNĚ česky, formálně, věcně a stručně.

PRAVIDLA:
1) Oslovení i jazyk vždy ve 2. osobě množného čísla (Vy, Vám, Vaše).
2) Nepoužívejte 1. osobu ("já", "my", "náš"). Popisujte neutrálně: „Společnost oznámila…“.
3) Nepřidávejte žádná nevyslovená fakta. Použijte POUZE předaný text.
4) Pokud data chybí, neuvádějte je.
5) Na konci MUSÍ být přesně jeden podpis:

S pozdravem,
Martin Bílek

FORMÁT:
1) Předmět: <krátký formální předmět do 50 znaků>
2) E-mail:
<Oslovení ve 2. osobě množného čísla>
<Text shrnutí z poskytnutého textu (5–7 vět), bez spekulací.>
S pozdravem,
Martin Bílek`;

  const userPrompt = `Společnost: ${companyName}
Nadpis zdroje: ${sourceTitle || companyName}
Text (použijte pouze tento text, nic nevymýšlejte):
"""${sourceText}"""`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  });

  const out = resp.choices?.[0]?.message?.content || '';
  // hrubé rozdělení na Předmět / E-mail
  const subjMatch = out.match(/Předmět\s*:\s*([^\n]+)\n/i);
  const subject = (subjMatch?.[1] || (companyName + ' – aktualita')).trim().slice(0, 50);

  const bodyStart = out.indexOf('2)');
  let body = bodyStart >= 0 ? out.slice(bodyStart).replace(/^2\)\s*E-?mail\s*:\s*/i, '') : out;
  // odstranit duplicitní podpis, nechat jediný
  body = body.replace(/S\s*pozdravem[\s\S]*Martin\s*Bílek/gi, '').trim() + `

S pozdravem,
Martin Bílek`;

  return { subject, body };
}

/**
 * Core: projde firmy, zkusí si zjistit „poslední“ info z LinkedIn/Web (OG tagy),
 * pokud je to nové (podle hash), vygeneruje shrnutí a uloží do kolekce posts.
 */
export const cronCheckCompanies = functions.pubsub
  .schedule('every 60 minutes') // upravte dle potřeby
  .timeZone('Europe/Prague')
  .onRun(async () => {
    const companiesSnap = await db.collection('companies').get();
    const now = admin.firestore.Timestamp.now();

    for (const doc of companiesSnap.docs) {
      const c = doc.data();
      const name = c.name || 'Neznámá společnost';

      // Přednostně LinkedIn, pak Web, pak Facebook
      const sources = [c.url_linkedin, c.url_web, c.url_facebook].filter(Boolean);

      let foundText = '';
      let usedUrl = '';

      for (const url of sources) {
        const t = await fetchPageSummary(url);
        if (t && t.length > 10) { foundText = t; usedUrl = url; break; }
      }

      if (!foundText) {
        // nic čitelného – přeskočit
        continue;
      }

      const h = hashOf(foundText);
      if (c.lastHash === h) {
        // beze změny
        continue;
      }

      // AI shrnutí
      const { subject, body } = await summarizeWithAI({
        companyName: name,
        sourceTitle: name,
        sourceText: foundText
      });

      // ulož post
      await db.collection('posts').add({
        companyId: doc.id,
        url: usedUrl || null,
        title: subject,
        content: foundText.slice(0, 1000),
        aiSubject: subject,
        aiBody: body,
        status: 'Neposláno',
        createdAt: now
      });

      // aktualizuj firmu (hash, lastFetched)
      await doc.ref.update({ lastHash: h, lastFetched: now });
    }
    return null;
  });

/**
 * Volitelně: manuální HTTP trigger, abyste mohli ručně spustit kontrolu (např. z prohlížeče).
 * Nasadíte a zavoláte GET /checkNow?key=... (doplňte si vlastní jednoduchý klíč).
 */
export const checkNow = functions.https.onRequest(async (req, res) => {
  const key = req.query.key;
  if (key !== process.env.CRON_KEY) {
    return res.status(401).send('Unauthorized');
  }
  await cronCheckCompanies.run({});
  return res.send('OK');
});
