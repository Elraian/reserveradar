// Reserve Radar — adapter that maps OUR backend (kitsendused + eeskiri + WFS
// geometry) to Lennart's `ParcelReport` shape (lentzUI branch). This is the
// bridge his page.tsx swaps the mock `sampleReport` import for:
//   const report = await fetch(`${BACKEND}/api/report/${tunnus}`).then(r => r.json())
// Deterministic + fast (no LLM call here; the conversational answer is /api/chat).
import "server-only";
import proj4 from "proj4";
import { getKitsendused } from "@scripts/kitsendused.mjs";
import { getParcel } from "@scripts/wfs.mjs";
import { resolveEeskiriAktSearch } from "@scripts/rt.mjs";
import { resolveParcel } from "./parcel";

// Title-case an UPPERCASE cadaster enum like "MAATULUNDUSMAA" → "Maatulundusmaa".
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

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

// Deterministic ecological score (0–100) + terse good/concerning bullets,
// derived purely from the overlap data we already fetched — no extra request,
// no LLM. Higher = ecologically richer / lower disturbance.
function deriveEco(
  areas: { category?: string; natura?: boolean; label?: string; nimi?: string | null; layer?: string }[],
  restrictions: Array<Record<string, unknown>>,
  species: Array<{ latin?: string; et?: string }>,
): { score: number; good: string[]; concerning: string[] } {
  const good: string[] = [];
  const concerning: string[] = [];
  let score = 40; // neutral land baseline

  const has = (cat: string) => areas.some((a) => a.category === cat);
  const text = (a: { label?: string; nimi?: string | null; layer?: string }) =>
    `${a.label ?? ""} ${a.nimi ?? ""} ${a.layer ?? ""}`.toLowerCase();
  const natura = has("natura") || areas.some((a) => a.natura);
  const uniq = species.length; // already de-duplicated by latin name

  // Wetland: an explicit water/mire overlay, OR wetland-indicator species
  // (soo-* / *palustris orchids = marsh habitat).
  const wetArea = has("water") || areas.some((a) => /märg|\bsoo\b|raba|luht/.test(text(a)));
  const wetSpecies = species.some((s) => /soo-|palustris|märg/i.test(`${s.et ?? ""} ${s.latin ?? ""}`));
  const wetland = wetArea || wetSpecies;

  const drainage =
    areas.some((a) => /maaparand|kuivend|kraav/.test(text(a))) ||
    restrictions.some((r) => /maaparand|kuivend|kraav/.test(String(r.title ?? r.area ?? "").toLowerCase()));
  const hazard = has("hazard") || areas.some((a) => /reostus|saaste/.test(text(a)));

  if (has("protection")) { score += 14; good.push("Asub kaitsealal — elurikkus tavaliselt paremas seisus."); }
  if (natura) { score += 18; good.push("Natura 2000 — üleeuroopalise tähtsusega elupaik."); }
  if (wetland) { score += 10; good.push("Märgala-/sooelupaik — kõrge loodusväärtus."); }
  if (uniq > 0) { score += Math.min(12, uniq * 2); good.push(`${uniq} kaitsealust liiki kinnistul.`); }

  if (drainage && wetland) { score -= 22; concerning.push("Kuivenduskraavid mõjutavad märgala veerežiimi."); }
  else if (drainage) { score -= 8; concerning.push("Kinnistul on maaparandussüsteem."); }
  if (hazard) { score -= 12; concerning.push("Läheduses on registreeritud reostusoht."); }
  if (!good.length) good.push("Olulisi looduskaitselisi väärtusi ei tuvastatud.");

  return { score: Math.max(0, Math.min(100, score)), good: good.slice(0, 4), concerning: concerning.slice(0, 3) };
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
  const [kits, panel, parcelFeat] = await Promise.all([
    getKitsendused(tunnus),
    resolveParcel(tunnus).catch(() => null),
    getParcel(tunnus).catch(() => null), // ky_kehtiv feature → cadaster attributes
  ]);
  if (!kits.found) return { found: false, tunnus };

  // Cadaster attributes (sihtotstarve, land-cover areas, owner type, tax value)
  // come from the same ky_kehtiv fetch — no extra source needed.
  const p = (parcelFeat?.properties ?? {}) as Record<string, unknown>;

  // Canonical "see the source" link: the official Maa-amet kitsenduste page
  // for this exact parcel (every restriction here is visible there).
  const kitsendusedUrl = `https://kitsendused.kataster.ee/public?code=${tunnus}`;

  const parcelM2 = polygonArea3301(kits.geometry as never) || panel?.areas ? polygonArea3301(kits.geometry as never) : 0;
  const totalM2 = parcelM2 || 1;

  // Resolve eeskiri for the main protected area (for rule links).
  const nature = (kits.restrictions as KitsRestriction[])
    .filter((r) => r.category === "looduskaitse")
    .sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
  let eeskiriUrl: string | null = null;
  let ruleDocs: { title: string; url: string; issuer: string; date: string }[] = [];
  if (nature[0]?.name) {
    // Resolve only the akt ID → build the link. The panel needs the URL, not the
    // 9–19 MB paragraph text (that's fetched lazily in the /api/chat answer).
    const akt = await resolveEeskiriAktSearch(nature[0].name).catch(() => null);
    if (akt) {
      eeskiriUrl = `https://www.riigiteataja.ee/akt/${akt}`;
      ruleDocs = [{ title: `${nature[0].name} kaitse-eeskiri`, url: eeskiriUrl, issuer: "Vabariigi Valitsus", date: "" }];
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
      // "Open the source" — the official Maa-amet kitsenduste page for this parcel.
      cardUrl: kitsendusedUrl,
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
    useType: p.siht1 ? titleCase(String(p.siht1)) : "Maatulundusmaa",
    areaM2: num(p.pindala) || Math.round(parcelM2),
    forestM2: num(p.mets), grassM2: num(p.rohumaa), otherM2: num(p.muumaa),
    owner: p.omvorm ? String(p.omvorm) : "—",
    taxValue: num(p.maks_hind),
    registry: p.kinnistu != null ? String(p.kinnistu) : "",
    overall,
    center,
    geometry: g ?? null,
    zone: panel?.zone ?? null,
    // Source links — where every data point can be opened/verified.
    kitsendusedUrl,
    sources: [
      { title: "Maa-amet — kitsendused", url: kitsendusedUrl, issuer: "Maa- ja Ruumiamet" },
      ...ruleDocs,
    ],
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
    eco: deriveEco(
      panel?.areas ?? [],
      restrictions,
      species as Array<{ latin?: string; et?: string }>,
    ),
  };
}
