# 🌲 Reserve Radar

**Mida tohib sellel maal teha — selge vastus, ilma juristita.**

Enter an Estonian cadastral number (katastritunnus) and get a clear, plain-language answer
about what you can and can't do on that land — every restriction (*kitsendus*) that applies,
explained and **cited to the law**, not just listed as cryptic codes like the official tools.

## What it does

```
katastritunnus → kitsendused (Maa-amet) → kaitse-eeskiri (Riigi Teataja) → AI → "mida saab"
```

For any parcel it resolves, live:

- **All kitsendused** from the official Maa-amet API — nature protection, Natura 2000,
  protected species, **plus** power lines, road zones, water/nitrate areas (every parcel has some).
- The parcel's **kaitse-eeskiri** (protection rules) from Riigi Teataja, parsed to paragraphs.
- A **cited, plain-Estonian answer** (ASUKOHT · KOKKUVÕTE · Lubatud · Keelatud/vajab luba),
  every claim referencing a § — generated with Gemini.

Better than the official `kitsendused.kataster.ee`: same data, but it **reads the regulation and
explains it**, with the answer streamed token-by-token and the agent's steps shown live.

## Data sources (all live, no stale copies)

- **Maa-amet** — cadastre (`kataster:ky_kehtiv`) + kitsendused API
- **EELIS / Keskkonnaportaal** — protected areas, Natura, species (WFS)
- **Riigi Teataja** — kaitse-eeskirjad (machine-readable XML)

## Tech

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · MapLibre GL · Gemini (`@google/genai`).
Backend retrieval is deterministic (`scripts/`); the LLM only writes the answer.

## Run locally

```bash
npm install
echo "GEMINI_API_KEY=your_key_here" > .env.local
npm run dev          # http://localhost:3000
```

CLI (no UI): `npm run answer "63902:001:0751"`

## Try these parcels

- `63902:001:0751` — rich protected case: Vahtrepa MKA piiranguvöönd, Natura 2000, 12 protected species
- `66001:003:0760` — plain commercial forest: power lines, road zone, nitrate area

## API

- `GET /api/parcel/{tunnus}` — panel payload (geometry + overlays + zone)
- `POST /api/chat` `{ "tunnus": "..." }` — SSE stream (tool activity + cited answer)

---

*Built for the **Metsikult andmetes 2026** hackathon. Informatiivne — ei asenda Keskkonnaameti ametlikku otsust.*
