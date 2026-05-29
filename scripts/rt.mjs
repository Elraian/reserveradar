// Riigi Teataja: resolve a protected-area name → its kaitse-eeskiri akt,
// then fetch + parse the paragraphs.
import { GoogleGenAI } from "@google/genai";
import { parseParagraphs } from "./parse-eeskiri-core.mjs";

// Fast-path cache: area name → current kaitse-eeskiri RT akt id.
// Seeded with known demo areas; grows as the grounded resolver finds more.
const EESKIRI_AKT = {
  "Vahtrepa maastikukaitseala": "105072023204",
  "Tilga looduskaitseala": "118012022015",
  // Verified akt ids (title-checked). Seeded so common areas resolve instantly
  // and reliably — the Gemini+search fallback is non-deterministic and slow,
  // and was failing on some of these despite the document existing.
  "Kõrvemaa maastikukaitseala": "122032023009",
  "Mukri looduskaitseala": "118012022010",
};

/** Synchronous cache lookup (no network). */
export function resolveEeskiriAkt(areaName) {
  return EESKIRI_AKT[areaName] ?? null;
}

/**
 * Verify a candidate akt id IS the current kaitse-eeskiri for `areaName`.
 * Gemini grounding constructs RT URLs from memory and often hallucinates the
 * id (e.g. a 404), so we never trust it blind: fetch the akt and confirm the
 * area's name + "eeskiri" appear in the title, and it's not repealed.
 */
async function verifyAkt(id, areaName) {
  try {
    // Range keeps it cheap — the title lives in the first KBs (akt XML is huge).
    const r = await fetch(`https://www.riigiteataja.ee/akt/${id}.xml`, {
      headers: { Range: "bytes=0-40000", "User-Agent": "ReserveRadar/0.1" },
    });
    if (r.status !== 200 && r.status !== 206) return false; // 404 = hallucinated id
    const xml = await r.text();
    const title = (xml.match(/<pealkiri>([^<]+)/)?.[1] ?? "").toLowerCase();
    const repealed = /<kehtivuseLopp>/.test(xml);
    const key = areaName.toLowerCase().split(/\s+/)[0]; // e.g. "kõrvemaa"
    return !repealed && title.includes(key) && title.includes("eeskiri");
  } catch {
    return false;
  }
}

/**
 * Resolve ANY protected area → its current kaitse-eeskiri akt id.
 * Gemini + Google Search proposes a candidate; we VERIFY it against the real
 * RT akt and retry with feedback (excluding wrong guesses) so a hallucinated
 * or repealed id is never accepted. Cached after a verified hit.
 */
export async function resolveEeskiriAktSearch(areaName) {
  if (EESKIRI_AKT[areaName]) return EESKIRI_AKT[areaName];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const tried = [];
  const RES_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"]; // newer first, fall back

  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = `Otsi veebist (riigiteataja.ee) "${areaName}" praegu KEHTIVA kaitse-eeskirja Riigi Teataja akt.
Vasta AINULT täpse URL-iga kujul https://www.riigiteataja.ee/akt/<ID> (ID on numbrid).${
      tried.length ? ` Need numbrid olid VALED või ei avanenud — ÄRA korda: ${tried.join(", ")}.` : ""
    }`;
    let text = "";
    try {
      const res = await ai.models.generateContent({
        model: RES_MODELS[Math.min(attempt, RES_MODELS.length - 1)],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
      });
      text = res.text ?? "";
    } catch (e) {
      const overloaded = /50[03]|high demand|overload|429|UNAVAILABLE/i.test(e.message ?? "");
      if (overloaded) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      console.log(`  eeskiri search err: ${(e.message ?? "").slice(0, 80)}`);
      return null;
    }

    const id = text.match(/akt\/(\d{6,})/)?.[1] ?? text.match(/\b(\d{9,12})\b/)?.[1] ?? null;
    if (!id || tried.includes(id)) continue;
    if (await verifyAkt(id, areaName)) {
      EESKIRI_AKT[areaName] = id; // cache the VERIFIED hit
      return id;
    }
    tried.push(id); // wrong/404 → tell the model next round
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
