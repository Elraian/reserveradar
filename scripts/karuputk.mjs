// Reserve Radar — karuputk (Sosnowsky/Heracleum hogweed) colonies.
// Maa-amet's invasive-species dataset, served from the same envir GeoServer
// (workspace "maaamet"). Hogweed control is a legal obligation; managing land
// with a colony is allowed only if spread is being actively controlled — so a
// colony on the parcel is a real signal for the owner.
import { intersecting } from "./wfs.mjs";

/**
 * Colonies intersecting the parcel. `geom3301` is the parcel polygon in
 * EPSG:3301 (as returned by the kitsendused API). Best-effort: [] on any error
 * so it never blocks the rest of the answer.
 */
export async function getKaruputk(geom3301) {
  if (!geom3301) return [];
  let wkt;
  try {
    // geojsonToWkt lives in wfs.mjs; reuse intersecting() which builds the CQL.
    const { geojsonToWkt } = await import("./wfs.mjs");
    wkt = geojsonToWkt(geom3301);
  } catch {
    return [];
  }
  let fc;
  try {
    fc = await intersecting("maaamet:karuputk", wkt, 50);
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    const id = p.koloonia_id ?? `${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      koloonia_id: p.koloonia_id ?? null,
      seisund: p.seisund ?? null, // "tõrjutav" (under control) / "hävinud"
      torjemeetod: p.torjemeetod ?? null, // e.g. "käsitsi mürgitamine"
      raskusaste: p.raskusaste ?? null, // e.g. "4 (hääbuv)"
      pindala_ha: typeof p.pindala === "number" ? p.pindala : null,
      geom: f.geometry ?? null, // EPSG:3301
    });
  }
  return out;
}
