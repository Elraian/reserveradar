// Reserve Radar — the conversational answer, as a stream of SSE events.
// Mirrors scripts/answer.mjs (deterministic retrieval → one Gemini call) but
// surfaces each backend step as a tool_call/tool_result the UI can render, and
// streams the cited answer token-by-token. The right panel is fed from the same
// stream via a `parcel` event, so map + overlays + answer stay in lockstep.
import "server-only";
import { GoogleGenAI } from "@google/genai";
import { resolveEeskiriAktSearch, fetchEeskiriParagraphs } from "@scripts/rt.mjs";
import {
  detectZone,
  enrichGeometry,
  resolveOverlays,
  toAreaOverlays,
  type RawArea,
} from "./parcel";
import type { ChatStreamEvent } from "@/lib/types";

// Model + fallback chain: try the newer/smarter 3.5-flash first, fall back to
// 2.5-flash automatically if 3.5 is overloaded (503). Native function-calling
// works on both (verified) — Viltrum's tool bug was the OpenAI-compat path.
const MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];

// Stable Riigi Teataja consolidated-text URLs for the general acts we cite.
// (Verified to resolve — RT uses these short codes for the terviktekst.)
const LAW_URLS: Record<string, string> = {
  Looduskaitseseadus: "https://www.riigiteataja.ee/akt/LKS",
  Metsaseadus: "https://www.riigiteataja.ee/akt/MS",
  Veeseadus: "https://www.riigiteataja.ee/akt/VeeS",
  Ehitusseadustik: "https://www.riigiteataja.ee/akt/EhS",
  Maapõueseadus: "https://www.riigiteataja.ee/akt/MaaPS",
};

const SYSTEM = `Sa oled abivalmis ja VESTLUSLIK Eesti maa- ja metsanduskitsenduste assistent. Sulle antakse ühe
katastriüksuse KÕIK kitsendused (kaitsealad, vöönd, Natura, kaitsealused liigid, elektriliinid, teed,
vee-/nitraadialad, võõrliigid) ja kohalduva kaitse-eeskirja TÄIELIKUD paragrahvid.

STIIL:
- Vasta EESTI KEELES, vestluslikult ja loomulikult — nagu selgitaksid asja metsaomanikule, mitte vormi täites.
- Vasta TÄPSELT kasutaja küsimusele. Konkreetsele küsimusele (nt "kas tohin raiuda?") vasta otse ja sisuliselt.
  ÄRA kasuta iga kord sama jäika malli — kohanda vastus küsimuse ja konkreetse kinnistuga.
- Ole PÕHJALIK ja KONKREETNE kaitse-eeskirja osas: käi läbi KÕIK asjakohased § (mitte ainult üks) ja too välja,
  mida tohib, mida tohib loaga ja mida ei tohi. Tsiteeri eeskirja täpselt.
- ERISTA tegevusi — need on ERI reeglid: metsaraie (ja raieliigid: lageraie/turberaie/sanitaarraie),
  turba/maavara kaevandamine, ehitus, teede rajamine, liikumine, niitmine/hooldus. Nt: turberaie võib olla lubatud,
  aga lageraie või turba kaevandamine keelatud — ÜTLE see vahe välja, kui eeskiri seda eristab.
- Maini ka seda, mida TOHIB teha, mitte ainult keelde — metsaomanik tahab teada oma võimalusi.
- Pikkus: nii pikk kui vaja, et olla täpne ja kasulik, aga ilma korduste ja täiteta.

REEGLID:
- TUGINE AINULT ANDMETELE. Ära leiuta. Kui KAITSEALAD = (puuduvad), siis kinnistu EI OLE kaitsealal — ära maini
  kaitseala/vööndit. Kui mingit punkti eeskirjas pole, ütle "täpsusta Keskkonnaametiga".
- LOETLE kõik kontekstis olevad kitsendused (taristu, teed, vesi, võõrliik, maavara jne) ja mida iga tähendab.
- Iga väide kaitse-eeskirja või seaduse kohta viita §-le.
- VIITED KLIKITAVAKS: vorminda need Markdown-lingina, nt [Kaitse-eeskiri §12](URL) või [Looduskaitseseadus §55](URL).
  Kasuta AINULT alloleva "VIITED" ploki URL-e — ära leiuta ega muuda URL-e. Kui sobivat URL-i pole, kirjuta nimi lingita.
- Lõpeta reaga: _Info, mitte ametlik otsus._`;

type Eeskiri = {
  aktId: string;
  url: string;
  paragraphs: { nr: string; title: string; text: string }[];
};

function buildContext(
  tunnus: string,
  address: string | null | undefined,
  areas: RawArea[],
  zone: string,
  eeskiri: Eeskiri | null,
): string {
  const byCat: Record<string, RawArea[]> = {};
  for (const a of areas) (byCat[a.category] ??= []).push(a);
  const names = (cat: string) =>
    [...new Set((byCat[cat] ?? []).map((a) => a.nimi || a.label))];

  const protection = names("protection");
  const natura = names("natura");
  const species = names("species");

  const speciesLine = species.length
    ? `III KAITSEKATEGOORIA LIIGID/OBJEKTID (${(byCat.species ?? []).length} kirjet): ${species.join("; ")}`
    : "III kaitsekategooria liike ei tuvastatud.";

  // Non-nature kitsendused (from the Maa-amet kitsenduste API): power lines,
  // roads, water/nitrate areas. These apply to EVERY parcel, protected or not.
  const infoOther = [
    ...new Set(
      (byCat.info ?? [])
        .filter((a) => a.layer !== "maaamet:karuputk")
        .map((a) => a.nimi || a.label),
    ),
  ];
  const muud = [
    ...names("utility").map((n) => `Taristu: ${n}`),
    ...names("road").map((n) => `Tee: ${n}`),
    ...names("water").map((n) => `Vesi/põhjavesi: ${n}`),
    ...infoOther.map((n) => `Muu: ${n}`),
  ];
  const muudLine = muud.length
    ? `MUUD KITSENDUSED (taristu, teed, vesi): ${muud.join("; ")}`
    : "Muid kitsendusi (taristu, teed, vesi) ei tuvastatud.";

  // Karuputk (invasive hogweed) — its own line; control is a legal obligation.
  const karuputk = (byCat.info ?? []).filter((a) => a.layer === "maaamet:karuputk");
  const karuputkLine = karuputk.length
    ? `KARUPUTK (invasiivne võõrliik): ${karuputk.length} koloonia(t) kinnistul (${[...new Set(karuputk.map((a) => a.nimi).filter(Boolean))].join("; ")}). Karuputke tõrje on kohustuslik; maa majandamine on lubatud vaid kui leviku vastu rakendatakse meetmeid.`
    : null;

  const paraLines = (eeskiri?.paragraphs ?? [])
    .map((p) => `§${p.nr} ${p.title}\n${p.text}`)
    .join("\n\n");

  // Reference links the model may cite (general acts + this area's eeskiri).
  // Use the readable HTML page (strip the .xml we fetch from) so cited links
  // open the law for a human, not raw XML.
  const eeskiriLink = eeskiri?.url ? eeskiri.url.replace(/\.xml$/, "") : null;
  const refs = Object.entries(LAW_URLS).map(([n, u]) => `${n}: ${u}`);
  if (eeskiri && eeskiriLink) refs.push(`Kaitse-eeskiri (akt ${eeskiri.aktId}): ${eeskiriLink}`);

  return `KATASTRITUNNUS: ${tunnus}${address ? ` (${address})` : ""}
VÖÖND: ${zone}
KAITSEALAD: ${protection.join("; ") || "(puuduvad)"}
NATURA 2000: ${natura.join("; ") || "(ei kuulu)"}
${speciesLine}
${muudLine}${karuputkLine ? `\n${karuputkLine}` : ""}

KAITSE-EESKIRI (${eeskiri?.aktId ?? "?"}, ${eeskiri?.url ?? ""}):
${paraLines || "(kaitse-eeskirja ei kohaldu või ei leitud)"}

VIITED (kasuta neid linke; ära leiuta URL-e):
${refs.join("\n")}`;
}

let _id = 0;
const nextId = () => `tc_${++_id}`;

/**
 * Stream the full lookup for `tunnus` as SSE events. The route handler turns
 * each yielded event into a `data: {...}\n\n` frame.
 */
export async function* streamAnswer(tunnus: string, question = ""): AsyncGenerator<ChatStreamEvent> {
  // 1) Overlay sweep — Kataster (parcel) + EELIS (intersecting layers).
  const sweepId = nextId();
  yield { type: "tool_call", id: sweepId, name: "Kataster + EELIS", detail: `Otsin katastriüksust ${tunnus} ja kattuvaid kaitsealasid…` };

  let sweep;
  try {
    sweep = await resolveOverlays(tunnus);
  } catch (e) {
    yield { type: "tool_result", id: sweepId, ok: false, detail: "WFS päring ebaõnnestus" };
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  if (!sweep.found) {
    yield { type: "tool_result", id: sweepId, ok: false, detail: "Ei leitud kehtivast katastrist" };
    yield { type: "parcel", parcel: { tunnus, found: false } };
    yield {
      type: "text",
      content: `**Katastritunnust \`${tunnus}\` ei leitud kehtivast katastrist.**\n\nKontrolli numbrit (kuju \`NNNNN:NNN:NNNN\`) — võib olla aegunud, ühendatud või jagatud üksus.`,
    };
    yield { type: "done" };
    return;
  }

  const areas = sweep.areas;
  const zone = detectZone(areas);
  yield {
    type: "tool_result",
    id: sweepId,
    ok: true,
    detail: `${areas.length} kattuvat ala · vöönd: ${zone}`,
  };

  // Fast first paint of the panel (chips + zone, no geometry yet).
  yield {
    type: "parcel",
    parcel: {
      tunnus,
      found: true,
      address: sweep.address ?? null,
      zone,
      areas: toAreaOverlays(areas),
      geometry: null,
    },
  };

  // Kick off map-geometry enrichment concurrently — never blocks the answer.
  const geomPromise = enrichGeometry(tunnus, areas).catch(() => null);

  // 2) Resolve the kaitse-eeskiri for the main protected area (Riigi Teataja).
  let eeskiri: Eeskiri | null = null;
  const mainArea = areas.find((a) => a.layer === "eelis:kr_kaitseala");
  if (mainArea?.nimi) {
    const rtId = nextId();
    yield { type: "tool_call", id: rtId, name: "Riigi Teataja", detail: `Otsin kaitse-eeskirja: ${mainArea.nimi}` };
    try {
      const akt = await resolveEeskiriAktSearch(mainArea.nimi);
      if (akt) {
        eeskiri = (await fetchEeskiriParagraphs(akt)) as Eeskiri;
        yield {
          type: "tool_result",
          id: rtId,
          ok: true,
          detail: `Akt ${eeskiri.aktId} · ${eeskiri.paragraphs.length} paragrahvi`,
        };
      } else {
        yield { type: "tool_result", id: rtId, ok: false, detail: "Eeskirja ei leitud" };
      }
    } catch {
      yield { type: "tool_result", id: rtId, ok: false, detail: "Eeskirja laadimine ebaõnnestus" };
    }
  }

  // 3) Synthesis — one Gemini call, streamed. If the user asked a specific
  // question (chat), put it first so the model answers THAT (still grounded in
  // the kitsendused + eeskiri below); otherwise it gives the standard overview.
  const baseContext = buildContext(tunnus, sweep.address, areas, zone, eeskiri);
  const context = question
    ? `KASUTAJA KÜSIMUS: "${question}"\nVasta EELKÕIGE sellele küsimusele, tuginedes allolevatele andmetele. Kui küsimus on üldine, anna tavapärane ülevaade.\n\n${baseContext}`
    : baseContext;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    yield {
      type: "text",
      content:
        "_(GEMINI_API_KEY puudub serveris — kontekst on koostatud, kuid AI-vastust ei genereeritud.)_\n\n" +
        "Tuvastatud: **" +
        (mainArea?.nimi ?? "kaitseala puudub") +
        "**, vöönd: **" +
        zone +
        "**.",
    };
    const geom = await geomPromise;
    if (geom) {
      yield {
        type: "parcel",
        parcel: { tunnus, found: true, address: sweep.address ?? null, zone, ...geom },
      };
    }
    yield { type: "done", eeskiriAkt: eeskiri?.aktId ?? null };
    return;
  }

  const synthId = nextId();
  yield { type: "tool_call", id: synthId, name: "AI süntees", detail: "Loen eeskirja ja koostan viidatud vastust…" };

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Try each model with backoff; fall through to the next on persistent
    // overload (503 "high demand"). The model name is an implementation detail —
    // never surfaced to the user.
    let stream;
    let lastErr: unknown;
    for (let m = 0; m < MODELS.length && !stream; m++) {
      const model = MODELS[m];
      // One quick retry per model, then fail fast to the next in the chain.
      // A 503 on the primary should hand off to the stable fallback in ~0.8s,
      // not burn ~4.5s of backoff first (that was the perceived slowness).
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          stream = await ai.models.generateContentStream({
            model,
            contents: [{ role: "user", parts: [{ text: context }] }],
            config: {
              systemInstruction: SYSTEM,
              // Thinking tokens count against this budget in Gemini, so a low
              // cap (2500) let reasoning eat the budget and the ANSWER got cut
              // off mid-sentence. Give ample room for thinking + the full answer.
              maxOutputTokens: 8000,
              // Bounded thinking budget so reasoning can't run away with latency
              // or the token budget, while still leaving the answer plenty.
              thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
            },
          });
          break;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          const overloaded = /50[03]|high demand|overload|429|UNAVAILABLE/i.test(msg);
          if (overloaded && attempt < 1) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          break; // give up on this model → try next in chain
        }
      }
    }
    if (!stream) throw lastErr ?? new Error("mudel ei vastanud");
    // Keep the synth step SPINNING (no tool_result yet) through the model's
    // think-time + token stream, so the UI shows live progress instead of a
    // frozen step that suddenly dumps the whole answer.
    let sawThinking = false;
    let sawText = false;
    for await (const chunk of stream) {
      // Separate thought parts (reasoning) from answer text. Gemini marks
      // thinking parts with `thought: true` when includeThoughts is on.
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p.text !== "string" || !p.text) continue;
        if ((p as { thought?: boolean }).thought) {
          if (!sawThinking) {
            sawThinking = true;
            yield { type: "tool_call", id: synthId, name: "AI süntees", detail: "Mõtlen läbi kitsendused ja eeskirja…" };
          }
          yield { type: "reasoning", content: p.text };
        } else {
          sawText = true;
          yield { type: "text", content: p.text };
        }
      }
    }
    // Answer fully streamed → now mark the step done.
    yield { type: "tool_result", id: synthId, ok: sawText, detail: "Vastus koostatud" };
  } catch (e) {
    yield { type: "tool_result", id: synthId, ok: false, detail: "Süntees ebaõnnestus" };
    yield {
      type: "text",
      content: `\n\n_(AI-vastust ei õnnestunud genereerida: ${e instanceof Error ? e.message : String(e)})_`,
    };
  }

  // Map geometry, once ready (does not gate the answer text).
  const geom = await geomPromise;
  if (geom) {
    yield {
      type: "parcel",
      parcel: { tunnus, found: true, address: sweep.address ?? null, zone, ...geom },
    };
  }

  yield {
    type: "done",
    eeskiriAkt: eeskiri?.aktId ?? null,
  };
}
