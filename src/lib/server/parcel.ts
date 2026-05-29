// Reserve Radar — server-side assembly of the parcel panel payload.
// Thin wrapper over the backend scripts in /scripts (owned by another agent).
// Adds the one thing the map needs that the scripts don't return: parcel +
// overlay geometry reprojected to EPSG:4326 (lon, lat) for MapLibre.
import "server-only";
// The /scripts modules are plain ESM JS (allowJs); types are inferred loosely.
import { getFeatures, getParcel, geojsonToWkt } from "@scripts/wfs.mjs";
import { getProtectionAreas } from "@scripts/overlays.mjs";
import { getKitsendused } from "@scripts/kitsendused.mjs";
import type { AreaOverlay, Category, ParcelGeometry, ParcelResult } from "@/lib/types";

// kitsendused.mjs categories → UI Category. Nature ('looduskaitse') and species
// ('liik') are intentionally omitted: the EELIS sweep already covers those with
// proper layer names, map fills, and zone detection. We only ADD the kinds the
// nature sweep misses (utility, road, water…) so every parcel shows its full
// kitsendused picture.
const KITS_CAT_MAP: Record<string, Category> = {
  elektri: "utility",
  gaas: "utility",
  side: "utility",
  tee: "road",
  vesi: "water",
  muu: "info",
};

type RawArea = {
  layer: string;
  category: Category;
  label: string;
  natura?: boolean;
  nimi?: string | null;
  kr_kood?: string | null;
  tyyp?: string | null;
};

/**
 * GeoServer WFS 2.0 with srsName=EPSG:4326 can emit coordinates in either
 * (lon, lat) or (lat, lat) axis order depending on config. In Estonia
 * longitude is ~21–28 and latitude is ~57–60, so latitude is always the
 * larger value — use that to force [lon, lat] for MapLibre. Idempotent.
 */
function toLonLat(coord: number[]): [number, number] {
  const [a, b] = coord;
  // If the first value looks like an Estonian latitude (bigger), swap it.
  return a > b ? [b, a] : [a, b];
}

function normalizeRing(ring: number[][]): number[][] {
  return ring.map(toLonLat);
}

function normalizeGeometry(geom: GeoJSON.Geometry | null | undefined): ParcelGeometry {
  if (!geom) return null;
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map(normalizeRing) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map(normalizeRing)),
    };
  }
  return null;
}

/** Parcel polygon in EPSG:4326 for the map (separate from the 3301 fetch the
 * overlay sweep uses internally). Best-effort: null if the layer doesn't
 * cooperate, in which case the panel still renders without a map. */
async function parcelGeometry4326(tunnus: string): Promise<ParcelGeometry> {
  try {
    const fc = await getFeatures("kataster:ky_kehtiv", {
      cql: `tunnus='${tunnus}'`,
      count: 1,
      srs: "EPSG:4326",
    });
    return normalizeGeometry(fc?.features?.[0]?.geometry ?? null);
  } catch {
    return null;
  }
}

/** Fetch a single overlay's geometry in 4326 by its KKR code, for map fills.
 * Best-effort and bounded — only called for the big polygon layers. */
async function overlayGeometry4326(
  layer: string,
  krKood: string,
): Promise<ParcelGeometry> {
  try {
    const fc = await getFeatures(layer, {
      cql: `kr_kood='${krKood}'`,
      count: 1,
      srs: "EPSG:4326",
    });
    return normalizeGeometry(fc?.features?.[0]?.geometry ?? null);
  } catch {
    return null;
  }
}

// Which categories are worth painting as translucent fills (polygons, not the
// dozens of point-like species records).
const FILL_CATEGORIES = new Set<Category>(["protection", "zone", "natura"]);

/** Mirror of detectZone() in scripts/answer.mjs (not exported there). */
export function detectZone(areas: RawArea[]): string {
  const piirang = areas.find((a) => a.layer === "eelis:kr_piirang");
  const skv = areas.find((a) => a.layer.includes("skv"));
  if (skv) return "sihtkaitsevöönd";
  if (piirang?.tyyp?.includes("P") || piirang?.nimi?.toLowerCase().includes(" pv"))
    return "piiranguvöönd";
  return "teadmata vöönd";
}

/** Raw overlay sweep — overlays + address, no geometry (fast). */
export type OverlaySweep = {
  found: boolean;
  address?: string | null;
  areas: RawArea[];
};

export async function resolveOverlays(tunnus: string): Promise<OverlaySweep> {
  // EELIS sweep: nature areas (with zone detection + map-fill layer names).
  // kitsendused API: the universal restriction set — adds power lines, roads,
  // water/nitrate etc. that the nature sweep can't see. Run concurrently.
  const [eelis, kits] = await Promise.all([
    getProtectionAreas(tunnus) as Promise<OverlaySweep>,
    getKitsendused(tunnus).catch(() => null),
  ]);

  const extra: RawArea[] = [];
  if (kits?.found) {
    const seen = new Set<string>();
    for (const r of kits.restrictions as Array<{
      category: string;
      kind?: string | null;
      name?: string | null;
      featureCode?: string | null;
      kkr?: string | null;
      area_m2?: number | null;
    }>) {
      const category = KITS_CAT_MAP[r.category];
      if (!category) continue; // nature/species → owned by the EELIS sweep
      const label = r.kind ?? r.name ?? "Kitsendus";
      const key = `${category}:${label}:${r.name ?? ""}`;
      if (seen.has(key)) continue; // collapse duplicate species-style rows
      seen.add(key);
      extra.push({
        layer: r.featureCode ?? `kitsendus:${r.category}`,
        category,
        label,
        nimi: r.name ?? null,
        kr_kood: r.kkr ?? null,
        tyyp: null,
      });
    }
  }

  return {
    found: eelis.found || extra.length > 0,
    address: eelis.address ?? kits?.address ?? null,
    areas: [...eelis.areas, ...extra],
  };
}

/**
 * Attach map geometry to a sweep result: parcel polygon (4326) + fill geometry
 * for the major protection/zone/natura overlays. Bounded + best-effort, so the
 * answer never waits on the map. Runs the parcel + overlay fetches concurrently.
 */
export async function enrichGeometry(
  tunnus: string,
  areas: RawArea[],
): Promise<{ geometry: ParcelGeometry; areas: AreaOverlay[] }> {
  const seenCodes = new Set<string>();
  const [geometry, enriched] = await Promise.all([
    parcelGeometry4326(tunnus),
    Promise.all(
      areas.map(async (a): Promise<AreaOverlay> => {
        const base: AreaOverlay = {
          layer: a.layer,
          category: a.category,
          label: a.label,
          natura: !!a.natura,
          nimi: a.nimi ?? null,
          kr_kood: a.kr_kood ?? null,
          tyyp: a.tyyp ?? null,
          geometry: null,
        };
        if (FILL_CATEGORIES.has(a.category) && a.kr_kood && !seenCodes.has(a.kr_kood)) {
          seenCodes.add(a.kr_kood);
          base.geometry = await overlayGeometry4326(a.layer, a.kr_kood);
        }
        return base;
      }),
    ),
  ]);
  return { geometry, areas: enriched };
}

/** Plain (no geometry) AreaOverlay projection — for the fast first paint. */
export function toAreaOverlays(areas: RawArea[]): AreaOverlay[] {
  return areas.map((a) => ({
    layer: a.layer,
    category: a.category,
    label: a.label,
    natura: !!a.natura,
    nimi: a.nimi ?? null,
    kr_kood: a.kr_kood ?? null,
    tyyp: a.tyyp ?? null,
    geometry: null,
  }));
}

/**
 * Full panel payload for GET /api/parcel/{tunnus}: overlays + zone + parcel
 * geometry + fill geometry. Does NOT run the AI answer (that streams via /api/chat).
 */
export async function resolveParcel(tunnus: string): Promise<ParcelResult> {
  const sweep = await resolveOverlays(tunnus);
  if (!sweep.found) return { tunnus, found: false };

  const zone = detectZone(sweep.areas);
  const { geometry, areas } = await enrichGeometry(tunnus, sweep.areas);

  return {
    tunnus,
    found: true,
    address: sweep.address ?? null,
    zone,
    geometry,
    areas,
  };
}

export { geojsonToWkt, getParcel };
export type { RawArea };
