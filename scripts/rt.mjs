// Riigi Teataja: resolve a protected-area name → its kaitse-eeskiri akt,
// then fetch + parse the paragraphs.
import { GoogleGenAI } from "@google/genai";
import { parseParagraphs } from "./parse-eeskiri.mjs";

// Fast-path cache: area name → current kaitse-eeskiri RT akt id.
// Seeded with known demo areas; grows as the grounded resolver finds more.
const EESKIRI_AKT = {
  "Vahtrepa maastikukaitseala": "105072023204",
  "Tilga looduskaitseala": "118012022015",
};

/** Synchronous cache lookup (no network). */
export function resolveEeskiriAkt(areaName) {
  return EESKIRI_AKT[areaName] ?? null;
}

/**
 * Resolve ANY protected area → its kaitse-eeskiri akt id, using Gemini with
 * Google Search grounding (same capability Viltrum uses). Cached after first hit.
 * Returns akt id string or null.
 */
export async function resolveEeskiriAktSearch(areaName) {
  if (EESKIRI_AKT[areaName]) return EESKIRI_AKT[areaName];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Leia Riigi Teatajast praegu KEHTIV "${areaName}" kaitse-eeskiri (Vabariigi Valitsuse määrus).
Vasta AINULT akti ID-ga, mis on riigiteataja.ee/akt/<ID> URL-i lõpus (ainult numbrid, nt 105072023204).
Kui ei leia, vasta "NONE".`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
      });
      const id = (res.text ?? "").match(/\b(\d{6,})\b/)?.[1] ?? null;
      if (id) EESKIRI_AKT[areaName] = id; // cache
      return id;
    } catch (e) {
      const overloaded = /50[03]|high demand|overload|429/i.test(e.message);
      if (overloaded && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      console.log(`  eeskiri search err: ${e.message.slice(0, 80)}`);
      return null;
    }
  }
  return null;
}

/** Download an RT akt as XML and parse its paragraphs. */
export async function fetchEeskiriParagraphs(aktId) {
  const url = `https://www.riigiteataja.ee/akt/${aktId}.xml`;
  const res = await fetch(url, { headers: { "User-Agent": "ReserveRadar/0.1 (hackathon)" } });
  if (!res.ok) throw new Error(`RT akt ${aktId} HTTP ${res.status}`);
  const xml = await res.text();
  return { aktId, url, paragraphs: parseParagraphs(xml) };
}
