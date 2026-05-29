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

const SYSTEM = `Sa oled Eesti maa- ja metsanduskitsenduste assistent. Sulle antakse ühe katastriüksuse
KÕIK kitsendused (kaitsealad, vöönd, Natura, kaitsealused liigid, elektriliinid, teed, vee-/nitraadialad),
kohalduva kaitse-eeskirja paragrahvid ja KASUTAJA KÜSIMUS.

Vasta EESTI KEELES ja VASTA TÄPSELT KASUTAJA KÜSIMUSELE — mitte üldist kokkuvõtet. Ole VÄGA lühike.
RANGED reeglid:
- ÄRA tervita ega juhata sisse. Alusta kohe vastusega.
- KOKKU maksimaalselt 2–3 lauset. Eelista täppe (bullet) pikkadele lõikudele.
- Lisa vajadusel kuni 3 lühikest täppi, igaüks ÜKS rida, alustab "- ".
- Iga looduskaitse-väide viita §-le (nt §15) või asutusele (Keskkonnaamet / Elektrilevi / Transpordiamet).
  ÄRA leiuta; kui eeskirjas vastust pole, ütle ühe lausega "täpsusta Keskkonnaametiga".
- Kui küsimusele andmetes vastust pole, ütle see ühe lausega.
- Lõppu üks rida: "_Info, mitte ametlik otsus._"`;

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
  const muud = [
    ...names("utility").map((n) => `Taristu: ${n}`),
    ...names("road").map((n) => `Tee: ${n}`),
    ...names("water").map((n) => `Vesi/põhjavesi: ${n}`),
    ...names("info").map((n) => `Muu: ${n}`),
  ];
  const muudLine = muud.length
    ? `MUUD KITSENDUSED (taristu, teed, vesi): ${muud.join("; ")}`
    : "Muid kitsendusi (taristu, teed, vesi) ei tuvastatud.";

  const paraLines = (eeskiri?.paragraphs ?? [])
    .map((p) => `§${p.nr} ${p.title}\n${p.text}`)
    .join("\n\n");

  return `KATASTRITUNNUS: ${tunnus}${address ? ` (${address})` : ""}
VÖÖND: ${zone}
KAITSEALAD: ${protection.join("; ") || "(puuduvad)"}
NATURA 2000: ${natura.join("; ") || "(ei kuulu)"}
${speciesLine}
${muudLine}

KAITSE-EESKIRI (${eeskiri?.aktId ?? "?"}, ${eeskiri?.url ?? ""}):
${paraLines || "(kaitse-eeskirja ei kohaldu või ei leitud)"}`;
}

let _id = 0;
const nextId = () => `tc_${++_id}`;

/**
 * Stream the full lookup for `tunnus` as SSE events. The route handler turns
 * each yielded event into a `data: {...}\n\n` frame.
 */
export async function* streamAnswer(
  tunnus: string,
  question?: string,
): AsyncGenerator<ChatStreamEvent> {
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

  // 3) Synthesis — one Gemini call, streamed.
  const context = buildContext(tunnus, sweep.address, areas, zone, eeskiri);
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
    // overload (503 "high demand"). 2.5-flash first (stable, ample capacity).
    let stream;
    let usedModel = MODELS[0];
    let lastErr: unknown;
    for (let m = 0; m < MODELS.length && !stream; m++) {
      const model = MODELS[m];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          stream = await ai.models.generateContentStream({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { text: context },
                  {
                    text: `KASUTAJA KÜSIMUS: ${
                      question?.trim() ||
                      "Anna lühike ülevaade: mida tohib ja mida ei tohi sellel kinnistul teha?"
                    }`,
                  },
                ],
              },
            ],
            config: {
              systemInstruction: SYSTEM,
              // Thinking tokens count toward this cap (Gemini 2.5), so 700 left
              // the answer truncated after the reasoning. Raise it so the model
              // has room for visible reasoning AND the full cited answer.
              maxOutputTokens: 3000,
              // Visible thinking: auto budget + return thought parts so the UI
              // can show the model's reasoning (streamed as `reasoning` events).
              // Cap thinking so it doesn't consume the whole output budget and
              // truncate the answer (-1 = dynamic/unbounded ate ~2700 tokens).
              thinkingConfig: { thinkingBudget: 512, includeThoughts: true },
            },
          });
          usedModel = model;
          break;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          const overloaded = /50[03]|high demand|overload|429|UNAVAILABLE/i.test(msg);
          if (overloaded && attempt < 2) {
            yield { type: "tool_result", id: synthId, ok: true, detail: `${model} hõivatud, proovin uuesti (${attempt + 1}/3)…` };
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          break; // give up on this model → try next in chain
        }
      }
      if (!stream && m < MODELS.length - 1) {
        yield { type: "tool_result", id: synthId, ok: true, detail: `vahetan mudelit: ${MODELS[m + 1]}…` };
      }
    }
    if (!stream) throw lastErr ?? new Error("mudel ei vastanud");
    yield { type: "tool_result", id: synthId, ok: true, detail: `mudel: ${usedModel}` };
    for await (const chunk of stream) {
      // Separate thought parts (reasoning) from answer text. Gemini marks
      // thinking parts with `thought: true` when includeThoughts is on.
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p.text !== "string" || !p.text) continue;
        if ((p as { thought?: boolean }).thought) {
          yield { type: "reasoning", content: p.text };
        } else {
          yield { type: "text", content: p.text };
        }
      }
    }
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
