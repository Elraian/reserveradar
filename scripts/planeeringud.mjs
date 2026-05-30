// Reserve Radar — rohevõrgustik (green-network corridor) from spatial planning.
// Defined in üldplaneeringud/maakonnaplaneeringud (PLANIS/PLANK); Maa-amet
// mirrors it onto the envir GeoServer as GeoJSON (planeeringud:yld_plan_rohev).
// A parcel in the rohevõrgustik isn't nature-protected, but the local ÜP limits
// development and fragmentation to keep the corridor connected.
import { intersecting, geojsonToWkt } from "./wfs.mjs";

/** Rohevõrgustik polygons intersecting the parcel (3301 geom in). Best-effort. */
export async function getRohevorgustik(geom3301) {
  if (!geom3301) return [];
  let wkt;
  try {
    wkt = geojsonToWkt(geom3301);
  } catch {
    return [];
  }
  let fc;
  try {
    fc = await intersecting("planeeringud:yld_plan_rohev", wkt, 20);
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    const name = p.kihi_nimi ?? "Rohevõrgustik";
    const key = `${name}|${p.omavalitsus ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name, // e.g. "Rohevõrgustiku koridor" / "tugiala"
      omavalitsus: p.omavalitsus ?? null,
      geom: f.geometry ?? null, // EPSG:3301
    });
  }
  return out;
}
