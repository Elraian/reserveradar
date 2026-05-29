// Reserve Radar — shared contract types (client + server safe).
// Mirrors the shapes produced by the backend scripts in /scripts and the
// /api/parcel contract in FRONTEND_PROMPT.md. Kept deliberately tolerant:
// the backend is owned by another agent, so optional fields stay optional.

/** Overlay category → drives chip colour + map fill. */
export type Category =
  | "protection"
  | "zone"
  | "natura"
  | "species"
  | "benefit"
  | "water"
  | "hazard"
  | "forest"
  | "heritage"
  | "utility"
  | "road"
  | "info";

/** One layer that intersects the parcel (a kitsendus / overlay). */
export type AreaOverlay = {
  layer: string; // e.g. "eelis:kr_kaitseala"
  category: Category;
  label: string; // human label, e.g. "Kaitseala"
  natura?: boolean;
  nimi?: string | null; // proper name, e.g. "Vahtrepa maastikukaitseala"
  kr_kood?: string | null; // Keskkonnaregistri kood, e.g. "KLO1000238"
  tyyp?: string | null;
  /** Optional geometry (EPSG:4326) for translucent map fills. */
  geometry?: GeoJSON.Geometry | null;
};

/** GeoJSON geometry in EPSG:4326 (lon, lat) — ready for MapLibre. */
export type ParcelGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | null;

/** Full panel payload: GET /api/parcel/{tunnus}. */
export type ParcelResult = {
  tunnus: string;
  found: boolean;
  address?: string | null;
  zone?: string | null; // e.g. "piiranguvöönd"
  geometry?: ParcelGeometry;
  areas?: AreaOverlay[];
  eeskiriAkt?: string | null; // Riigi Teataja akt id
  eeskiriUrl?: string | null;
  /** The cited markdown answer (when the chat/answer step has run). */
  answer?: string | null;
  error?: string;
};

/** SSE event shape streamed from /api/chat. */
export type ChatStreamEvent =
  | { type: "parcel"; parcel: ParcelResult } // resolved panel data
  | { type: "tool_call"; id: string; name: string; detail?: string }
  | { type: "tool_result"; id: string; ok: boolean; detail?: string }
  | { type: "reasoning"; content: string } // model thinking (Gemini thoughts)
  | { type: "text"; content: string } // streamed answer chunk
  | { type: "error"; message: string }
  | { type: "done"; eeskiriAkt?: string | null };

export const CATEGORY_LABELS: Record<Category, string> = {
  protection: "Kaitse",
  zone: "Vöönd",
  natura: "Natura 2000",
  species: "Liik",
  benefit: "Toetus",
  water: "Vesi",
  hazard: "Oht",
  forest: "Mets",
  heritage: "Pärand",
  utility: "Taristu",
  road: "Tee",
  info: "Info",
};

/** CSS variable pair per category (foreground / tinted background). */
export const CATEGORY_VARS: Record<Category, { fg: string; bg: string }> = {
  protection: { fg: "var(--cat-protection)", bg: "var(--cat-protection-bg)" },
  zone: { fg: "var(--cat-zone)", bg: "var(--cat-zone-bg)" },
  natura: { fg: "var(--cat-natura)", bg: "var(--cat-natura-bg)" },
  species: { fg: "var(--cat-species)", bg: "var(--cat-species-bg)" },
  benefit: { fg: "var(--cat-benefit)", bg: "var(--cat-benefit-bg)" },
  water: { fg: "var(--cat-water)", bg: "var(--cat-water-bg)" },
  hazard: { fg: "var(--cat-hazard)", bg: "var(--cat-hazard-bg)" },
  forest: { fg: "var(--cat-benefit)", bg: "var(--cat-benefit-bg)" },
  heritage: { fg: "var(--cat-info)", bg: "var(--cat-info-bg)" },
  utility: { fg: "var(--cat-utility)", bg: "var(--cat-utility-bg)" },
  road: { fg: "var(--cat-road)", bg: "var(--cat-road-bg)" },
  info: { fg: "var(--cat-info)", bg: "var(--cat-info-bg)" },
};

/** `NNNNN:NNN:NNNN` cadastral-number shape. */
export const TUNNUS_RE = /^\d{5}:\d{3}:\d{4}$/;

export function isValidTunnus(t: string): boolean {
  return TUNNUS_RE.test(t.trim());
}
