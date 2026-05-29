// Reserve Radar — the "mida saab" answer step.
// Deterministic retrieval (no tool-calls) → one Gemini call → cited answer.
//   tunnus → ALL kitsendused (Maa-amet) → kaitse-eeskiri paragraphs → Gemini synthesis.
import { GoogleGenAI } from "@google/genai";
import { getKitsendused } from "./kitsendused.mjs";
import { resolveEeskiriAktSearch, fetchEeskiriParagraphs } from "./rt.mjs";

const MODEL = "gemini-2.5-flash"; // same as Viltrum

const CAT_LABEL = {
  looduskaitse: "Looduskaitse (kaitseala/hoiuala)",
  liik: "Kaitsealused liigid",
  elektri: "Elektriliinid",
  gaas: "Gaasitorud",
  side: "Sidevõrk",
  tee: "Teed",
  vesi: "Vesi / põhjavesi / nitraadialad",
  muu: "Muu",
};

// Group restrictions by category; aggregate species (many records → unique names).
function summarizeKitsendused(restrictions) {
  const byCat = {};
  for (const r of restrictions) (byCat[r.category] ??= []).push(r);
  const lines = [];
  for (const [cat, items] of Object.entries(byCat)) {
    const uniq = [...new Set(items.map((i) => i.name || i.kind))];
    const detail = uniq.slice(0, 12).map((n) => {
      const it = items.find((i) => (i.name || i.kind) === n);
      const m = it.area_m2 != null ? ` ${it.area_m2} m²` : it.length_m != null ? ` ${it.length_m} m` : "";
      return `${n}${m}`;
    });
    lines.push(`${CAT_LABEL[cat] ?? cat} (${items.length}): ${detail.join("; ")}`);
  }
  return lines.join("\n");
}

function buildContext({ tunnus, address, restrictions, eeskiri }) {
  const paraLines = (eeskiri?.paragraphs ?? [])
    .map((p) => `§${p.nr} ${p.title}\n${p.text}`)
    .join("\n\n");

  return `KATASTRITUNNUS: ${tunnus}${address ? ` (${address})` : ""}

KÕIK KITSENDUSED (Maa-ameti kitsenduste andmekogu, kattuvuse pindala/pikkusega):
${summarizeKitsendused(restrictions) || "(kitsendusi ei tuvastatud)"}

NB: väga väikese kattuvusega (nt < 100 m²) objektid puudutavad kinnistut vaid servast — maini neid tagasihoidlikult.

KAITSE-EESKIRI (${eeskiri?.aktId ?? "puudub"}${eeskiri?.url ? ", " + eeskiri.url : ""}):
${paraLines || "(kaitse-eeskirja ei kohaldu või ei leitud)"}`;
}

const SYSTEM = `Sa oled Eesti maa- ja looduskaitseõiguse assistent. Sulle antakse ühe katastriüksuse
KÕIK kitsendused (looduskaitse, liigid, elektriliinid, teed, vesi jms) koos kattuvuse pindalaga,
ning kohalduva kaitse-eeskirja paragrahvid.
Vasta EESTI KEELES, lühidalt ja selgelt, maaomanikule kes pole jurist.
Struktuur:
1. ASUKOHT (1-2 lauset): nimeta peamised kitsendused — kaitseala+vöönd, Natura, kaitsealused liigid,
   ja taristu (elektriliin, tee, nitraadiala). Väga väikesed servapuuted maini "puudutab vaid servast".
2. KOKKUVÕTE (üks lause): mida sellel maal üldiselt tohib ja mida mitte (eriti raie/ehitus).
3. "Lubatud:" loend.
4. "Keelatud / vajab luba:" loend (sh elektriliini kaitsevöönd, tee kaitsevöönd kui asjakohane).
5. Iga looduskaitse-väide VIITA paragrahvile (nt "(§10)"). ÄRA leiuta — kui eeskirjas pole, ütle et
   täpsustamiseks pöördu Keskkonnaameti või vastava võrguettevõtja/omavalitsuse poole.
Kui on kaitsealused liigid, maini et nende elupaiku tuleb arvestada (Looduskaitseseadus).
Ära anna lõplikku juriidilist nõu; lõppu lühike märkus et see on info, mitte ametlik otsus.`;

export async function answer(tunnus) {
  const { found, address, restrictions } = await getKitsendused(tunnus);
  if (!found) return { tunnus, found: false, text: `Katastritunnust ${tunnus} ei leitud.` };

  // Pick the main protected area (looduskaitse, largest overlap) to resolve its eeskiri.
  const nature = restrictions
    .filter((r) => r.category === "looduskaitse")
    .sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
  const mainArea = nature[0];
  let eeskiri = null;
  if (mainArea?.name) {
    const akt = await resolveEeskiriAktSearch(mainArea.name);
    if (akt) eeskiri = await fetchEeskiriParagraphs(akt);
  }

  const context = buildContext({ tunnus, address, restrictions, eeskiri });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { tunnus, found: true, restrictions, context, text: "[GEMINI_API_KEY puudub — kontekst koostatud]" };

  const ai = new GoogleGenAI({ apiKey });
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: context }] }],
        config: { systemInstruction: SYSTEM, maxOutputTokens: 1400, thinkingConfig: { thinkingBudget: 0 } },
      });
      break;
    } catch (e) {
      const overloaded = /50[03]|high demand|overload|429|UNAVAILABLE/i.test(e.message);
      if (overloaded && attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
      throw e;
    }
  }

  return { tunnus, found: true, address, restrictions, eeskiriAkt: eeskiri?.aktId ?? null, context, text: res.text };
}

// CLI
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("answer.mjs");
if (invokedDirectly) {
  const t = process.argv[2] || "63902:001:0751";
  const r = await answer(t);
  console.log("\n===== VASTUS =====\n");
  console.log(r.text);
}
