// Reserve Radar — adapter that maps OUR backend (kitsendused + eeskiri + WFS
// geometry) to Lennart's `ParcelReport` shape (lentzUI branch). This is the
// bridge his page.tsx swaps the mock `sampleReport` import for:
//   const report = await fetch(`${BACKEND}/api/report/${tunnus}`).then(r => r.json())
// Deterministic + fast (no LLM call here; the conversational answer is /api/chat).
import "server-only";
import proj4 from "proj4";
import { getKitsendused } from "@scripts/kitsendused.mjs";
import { resolveEeskiriAktSearch, fetchEeskiriParagraphs } from "@scripts/rt.mjs";
import { resolveParcel } from "./parcel";

// L-EST97 (Estonian national grid) → WGS84, so restriction geometries (poles,
// power lines, areas) can be drawn on the MapLibre map alongside the parcel.
proj4.defs(
  "EPSG:3301",
  "+proj=lcc +lat_0=57.5175539305556 +lon_0=24 +lat_1=59.3333333333333 +lat_2=58 +x_0=500000 +y_0=6375000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);
function reproject3301to4326(geom: { type: string; coordinates: unknown } | null): unknown {
  if (!geom) return null;
  const map = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === "number"
      ? proj4("EPSG:3301", "EPSG:4326", c as number[])
      : Array.isArray(c)
        ? c.map(map)
        : c;
  return { type: geom.type, coordinates: map(geom.coordinates) };
}

type Severity = "red" | "amber" | "green";

type KitsRestriction = {
  name?: string | null; kind?: string | null; category: string;
  area_m2?: number | null; length_m?: number | null; kkr?: string | null;
  geom?: { type: string; coordinates: unknown } | null; // EPSG:3301
};

const CAT_LABEL: Record<string, string> = {
  looduskaitse: "Looduskaitse", liik: "Kaitsealune liik", elektri: "Elektriliin",
  gaas: "Gaasitoru", side: "Sidevõrk", tee: "Tee", vesi: "Vesi", muu: "Muu",
};

function severityOf(category: string, coveragePct: number): Severity {
  if (category === "looduskaitse") return coveragePct > 50 ? "red" : "amber";
  if (category === "liik" || ["elektri", "gaas", "side", "tee", "vesi"].includes(category)) return "amber";
  return "green";
}

// Shoelace area (m²) of a polygon ring in EPSG:3301 (metres).
function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
function polygonArea3301(geom: { type: string; coordinates: number[][][] | number[][][][] } | null): number {
  if (!geom) return 0;
  if (geom.type === "Polygon") return ringArea((geom.coordinates as number[][][])[0] ?? []);
  if (geom.type === "MultiPolygon")
    return (geom.coordinates as number[][][][]).reduce((s, poly) => s + ringArea(poly[0] ?? []), 0);
  return 0;
}

function speciesGroup(name: string): "animal" | "plant" | "fungi" {
  const n = name.toLowerCase();
  if (/silmik|liblik|kärbes|mardikas|konn|nahkhiir|lind/.test(n)) return "animal";
  if (/seen|samblik|sammal/.test(n)) return "fungi";
  return "plant";
}

function splitLatinEt(name: string): { latin: string; et: string } {
  const m = name.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { latin: m[1].trim(), et: m[2].trim() };
  return { latin: name, et: name };
}

/** Build Lennart's ParcelReport from the live backend. */
export async function buildReport(tunnus: string) {
  const [kits, panel] = await Promise.all([
    getKitsendused(tunnus),
    resolveParcel(tunnus).catch(() => null),
  ]);
  if (!kits.found) return { found: false, tunnus };

  const parcelM2 = polygonArea3301(kits.geometry as never) || panel?.areas ? polygonArea3301(kits.geometry as never) : 0;
  const totalM2 = parcelM2 || 1;

  // Resolve eeskiri for the main protected area (for rule links).
  const nature = (kits.restrictions as KitsRestriction[])
    .filter((r) => r.category === "looduskaitse")
    .sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
  let eeskiriUrl: string | null = null;
  let ruleDocs: { title: string; url: string; issuer: string; date: string }[] = [];
  if (nature[0]?.name) {
    const akt = await resolveEeskiriAktSearch(nature[0].name).catch(() => null);
    if (akt) {
      const e = await fetchEeskiriParagraphs(akt).catch(() => null);
      if (e) {
        eeskiriUrl = e.url;
        ruleDocs = [{ title: `${nature[0].name} kaitse-eeskiri`, url: e.url, issuer: "Vabariigi Valitsus", date: "" }];
      }
    }
  }

  // Restrictions (dedup species-style repeats by name).
  const seen = new Set<string>();
  const restrictions = [] as Array<Record<string, unknown>>;
  const speciesItems: KitsRestriction[] = [];
  for (const r of kits.restrictions as KitsRestriction[]) {
    if (r.category === "liik") { speciesItems.push(r); continue; }
    const key = `${r.category}:${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const areaM2 = r.area_m2 ?? 0;
    const coveragePct = Math.min(100, Math.round((areaM2 / totalM2) * 1000) / 10);
    restrictions.push({
      category: CAT_LABEL[r.category] ?? "Muu",
      catKey: r.category, // raw key → drives map colour
      title: r.kind ?? r.name ?? "Kitsendus",
      area: r.name ?? r.kind ?? "",
      areaM2,
      coveragePct,
      severity: severityOf(r.category, coveragePct),
      rule: r.category === "looduskaitse" ? "Kaitse-eeskiri" : undefined,
      ruleUrl: r.category === "looduskaitse" ? eeskiriUrl ?? undefined : undefined,
      geometry: reproject3301to4326(r.geom ?? null), // 4326 for the map
    });
  }

  // Species (unique by latin name).
  const sSeen = new Set<string>();
  const species = [] as Array<Record<string, unknown>>;
  for (const s of speciesItems) {
    const { latin, et } = splitLatinEt(s.name ?? "");
    if (sSeen.has(latin)) continue;
    sSeen.add(latin);
    species.push({
      group: speciesGroup(s.name ?? ""), latin, et,
      kind: s.kind ?? "III kaitsekategooria",
      geometry: reproject3301to4326(s.geom ?? null),
    });
  }

  const overall: Severity = restrictions.some((r) => r.severity === "red")
    ? "red" : restrictions.length || species.length ? "amber" : "green";

  // Centre (lon,lat) from the 4326 panel geometry, if available.
  let center: [number, number] = [0, 0];
  const g = panel?.geometry;
  if (g) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (a: unknown): void => {
      if (Array.isArray(a) && typeof a[0] === "number") {
        const [x, y] = a as number[];
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (Array.isArray(a)) a.forEach(walk);
    };
    walk((g as { coordinates: unknown }).coordinates);
    center = [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  const addr: string[] = String(kits.address ?? "").split(",").map((s) => s.trim());

  return {
    found: true,
    tunnus,
    address: addr[0] ?? "",
    municipality: addr.slice(1, 3).join(", "),
    county: addr[addr.length - 1] ?? "",
    useType: "Maatulundusmaa",
    areaM2: Math.round(parcelM2),
    forestM2: 0, grassM2: 0, otherM2: 0,
    owner: "—",
    taxValue: 0,
    registry: "",
    overall,
    center,
    geometry: g ?? null,
    zone: panel?.zone ?? null,
    restrictions,
    species,
    speciesTotal: speciesItems.length,
    forestStands: 0,
    fellingNotices: 0,
    ruleDocs,
    summary: {
      allowed: overall === "green" ? ["Metsamajandus üldiste reeglite järgi (metsateatis)"] : [],
      forbidden: restrictions.filter((r) => r.severity === "red").map((r) => String(r.title)),
      consider: restrictions.filter((r) => r.severity === "amber").map((r) => String(r.title)),
    },
  };
}
