// Reserve Radar — Gemini tool-calling agent (conversational layer).
// Unlike scripts/answer.mjs (one deterministic shot), this lets the model
// DECIDE which data tools to call across a multi-turn chat: look up a parcel's
// kitsendused, pull a kaitse-eeskiri, answer follow-ups ("kas siia tohib sauna
// ehitada?"). Native @google/genai function-calling path (reliable on 2.5-flash).
import { GoogleGenAI } from "@google/genai";
import { getKitsendused } from "./kitsendused.mjs";
import { resolveEeskiriAktSearch, fetchEeskiriParagraphs } from "./rt.mjs";

const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

const SYSTEM = `Sa oled Reserve Radar — Eesti maa- ja metsanduskitsenduste assistent.
Kasutaja annab katastritunnuse ja küsib mida maal tohib teha (raie, ehitus jne).
TÖÖRIISTAD: kasuta get_kitsendused(tunnus) kohe kui näed katastritunnust; kui kinnistu on kaitsealal,
kutsu get_eeskiri(ala_nimi) et saada täpsed § reeglid. ÄRA leiuta — toetu tööriistade andmetele.
Vasta EESTI KEELES, LÜHIDALT ja skannitavalt (mitte pikk kiri, ~120 sõna):
**Raie:** üks lause verdikt. **✅ Lubatud:** kuni 3 punkti. **⛔ Vajab luba/keelatud:** kuni 4 punkti (§ või asutus).
Looduskaitse-väited viita §-le. Lõppu: "_Info, mitte ametlik otsus._"`;

// Tool schemas the model can call.
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_kitsendused",
        description:
          "Tagastab katastriüksuse KÕIK kitsendused (kaitsealad, Natura, kaitsealused liigid, " +
          "elektriliinid, teed, vee-/nitraadialad) koos kattuvuse pindalaga (m²) ja KKR-koodiga. " +
          "Kasuta ALATI esimesena kui kasutaja mainib katastritunnust.",
        parameters: {
          type: "object",
          properties: { tunnus: { type: "string", description: "Katastritunnus kujul NNNNN:NNN:NNNN" } },
          required: ["tunnus"],
        },
      },
      {
        name: "get_eeskiri",
        description:
          "Tagastab kaitseala kaitse-eeskirja paragrahvid Riigi Teatajast. Kasuta kui kinnistu on " +
          "kaitsealal ja on vaja täpseid lubatud/keelatud reegleid (nt raie, ehitus).",
        parameters: {
          type: "object",
          properties: { ala_nimi: { type: "string", description: "Kaitseala nimi, nt 'Vahtrepa maastikukaitseala'" } },
          required: ["ala_nimi"],
        },
      },
    ],
  },
];

// Execute a tool the model asked for; return a plain JSON-able object.
async function execTool(name, args) {
  if (name === "get_kitsendused") {
    const r = await getKitsendused(args.tunnus);
    if (!r.found) return { found: false };
    return {
      found: true,
      address: r.address,
      restrictions: r.restrictions.map((x) => ({
        name: x.name, kind: x.kind, category: x.category,
        area_m2: x.area_m2, length_m: x.length_m, kkr: x.kkr,
      })),
    };
  }
  if (name === "get_eeskiri") {
    const akt = await resolveEeskiriAktSearch(args.ala_nimi);
    if (!akt) return { found: false };
    const e = await fetchEeskiriParagraphs(akt);
    return {
      found: true, aktId: e.aktId, url: e.url,
      paragraphs: e.paragraphs.map((p) => ({ nr: p.nr, title: p.title, text: (p.text ?? "").slice(0, 800) })),
    };
  }
  return { error: `unknown tool ${name}` };
}

async function generate(ai, contents) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction: SYSTEM, tools: TOOLS, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: -1, includeThoughts: true } },
        });
      } catch (e) {
        lastErr = e;
        const overloaded = /50[03]|high demand|overload|429|UNAVAILABLE/i.test(e.message ?? "");
        if (overloaded && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
        break;
      }
    }
  }
  throw lastErr ?? new Error("mudel ei vastanud");
}

/**
 * Run the tool-calling loop over a chat history.
 * @param {{role:"user"|"model", text:string}[]} messages
 * @returns {Promise<{text:string, toolCalls:{name:string,args:any}[]}>}
 */
export async function ask(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY puudub");
  const ai = new GoogleGenAI({ apiKey });

  const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const toolCalls = [];
  const thoughts = [];

  for (let step = 0; step < 6; step++) {
    const res = await generate(ai, contents);
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) if (p.text && p.thought) thoughts.push(p.text);
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("") || res.text || "";
      return { text, reasoning: thoughts.join("\n"), toolCalls };
    }

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const c of calls) {
      toolCalls.push({ name: c.functionCall.name, args: c.functionCall.args ?? {} });
      const out = await execTool(c.functionCall.name, c.functionCall.args ?? {});
      responseParts.push({ functionResponse: { name: c.functionCall.name, response: out } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return { text: "(liiga palju tööriistakutseid — katkestasin)", toolCalls };
}

// CLI: node --env-file=.env.local scripts/agent.mjs "küsimus"
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("agent.mjs");
if (invokedDirectly) {
  const q = process.argv[2] || "Kas katastriüksusel 63902:001:0751 tohib lageraiet teha?";
  const r = await ask([{ role: "user", text: q }]);
  console.log("KÜSIMUS:", q);
  console.log("TÖÖRIISTAD:", r.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(" → ") || "(ükski)");
  if (r.reasoning) console.log("\nMÕTTEKÄIK:\n" + r.reasoning.slice(0, 600));
  console.log("\nVASTUS:\n" + r.text);
}
