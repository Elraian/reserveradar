# Reserve Radar — Frontend Build Prompt

> Paste this into a fresh Claude Code session (the design skills are already installed:
> `frontend-design`, `web-design-guidelines`, `next-best-practices`, `shadcn`, `design-taste-frontend`).
> Invoke those skills as you build.

---

## Product

**Reserve Radar** 🌲 — a tool that takes an Estonian cadastral number (katastritunnus) and instantly
shows, in plain Estonian, **what you can and cannot do on that land** — every restriction (kitsendus)
that applies, explained and cited, not just listed as cryptic names like the official Maa-amet app.

Tagline: *"Mida tohib sellel maal teha — selge vastus, ilma juristita."*

## Look & feel

- **Theme: forest green.** Primary `#1B7A43` (deep forest green), accent `#2FA866`, dark text on
  near-white `#F7FAF8`, cards white with soft shadows. A nature/cartographic feel, clean and trustworthy
  (this is quasi-legal info — it must feel credible, not playful).
- Rounded-2xl cards, generous spacing, one clear focal action (the search).
- Estonian-language UI throughout.
- Subtle pine/topographic motif allowed in the hero, but keep it restrained.

## Tech

- Next.js (App Router) + TypeScript + Tailwind + **shadcn/ui** components.
- **MapLibre GL** for the map (free, open). Estonian basemap: Maa-amet WMTS/XYZ tiles
  (`https://tiles.maaamet.ee/...`) or a neutral OSM-style as fallback.
- Server calls one backend endpoint (below). No client-side secrets.

## The flow (single page)

1. **Hero + search**: big centered input "Sisesta katastritunnus (nt 63902:001:0751)" with a green
   "Vaata piiranguid" button. Validate the `NNNNN:NNN:NNNN` shape before calling.
2. On submit → call `GET /api/parcel/{tunnus}`, show a loading skeleton.
3. **Result view (two columns on desktop, stacked on mobile):**
   - **Left — Map**: render the parcel polygon (GeoJSON from the API) highlighted, with overlapping
     protection zones as translucent fills. Fit-bounds to the parcel.
   - **Right — Answer panel**: the structured answer (below).
4. **Empty/error states**: "Katastritunnust ei leitud" (404), generic retry on 5xx.

## Answer panel structure

Render the API's `answer` markdown, but also show structured chrome around it:

- **Header**: tunnus + address, and a one-line zone badge (e.g. "Piiranguvöönd").
- **Overlay chips** (color-coded by `category`):
  - `protection` → red, `zone` → orange, `natura` → blue, `species` → amber,
    `benefit` → green, `water` → cyan, `hazard` → gray. Each chip shows the label + name.
- **The cited answer** (markdown) with sections the backend already produces:
  - **ASUKOHT** (one-line location summary)
  - **KOKKUVÕTE** (one-line can/can't)
  - **Lubatud:** list
  - **Keelatud / vajab luba:** list
  - Paragraph citations like `(§10)` — render these as small monospace badges.
- **Sources footer**: "Allikad: Maa-amet kataster, EELIS, Riigi Teataja ({aktId})" with links.
- **Disclaimer**: small muted text — "Informatiivne, ei asenda Keskkonnaameti ametlikku seisukohta."

## API contract (backend already returns this shape)

```
GET /api/parcel/{tunnus}  →  200
{
  "tunnus": "63902:001:0751",
  "found": true,
  "address": "Uue-Tooma",
  "zone": "piiranguvöönd",
  "geometry": { "type": "MultiPolygon", "coordinates": [...] },   // EPSG:4326 for the map
  "areas": [
    { "layer": "eelis:kr_kaitseala", "category": "protection",
      "label": "Kaitseala", "natura": false,
      "nimi": "Vahtrepa maastikukaitseala", "kr_kood": "KLO1000238" }
    // ...natura, species (III kaitsekategooria), zone, etc.
  ],
  "eeskiriAkt": "105072023204",
  "answer": "**ASUKOHT** ... markdown with §-citations ..."
}

GET /api/parcel/{tunnus}  →  404  { "found": false, "tunnus": "..." }
```

(If `found:false` → "see katastritunnus pole kehtivas katastris" + suggestion to check the number.)

## Components to build

- `SearchHero` — input + validation + submit
- `ParcelMap` — MapLibre, parcel polygon + overlay fills, fit-bounds
- `AnswerPanel` — header, zone badge, markdown answer, citation badges, disclaimer
- `OverlayChips` — color-coded category chips
- `SourcesFooter` — data provenance with links
- Loading skeletons + error states

## Test parcels

- `63902:001:0751` — rich: Vahtrepa MKA, piiranguvöönd, Natura 2000, 12 III-category species
- `66001:003:0760` — plain commercial forest (no nature protection) → "free, file a metsateatis"

## Build order

1. Scaffold Next.js + Tailwind + shadcn, set green theme tokens.
2. SearchHero + the result layout shell with mock data.
3. AnswerPanel + OverlayChips against the mock JSON above.
4. ParcelMap with MapLibre.
5. Wire to the real `/api/parcel/{tunnus}` endpoint.

Make it feel like a polished, trustworthy public-service tool — clean typography, calm green palette,
fast. Use the `web-design-guidelines` and `design-taste-frontend` skills for spacing/hierarchy.
