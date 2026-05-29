// Reserve Radar — precomputed forest-use restriction zones (Maa-amet
// "kitsendused" workspace). These are the shore/flood/fertiliser zones the
// official kitsenduste kaardirakendus shows but the v2 cadastre-unit API omits:
//   - Ranna või kalda veekaitsevöönd / piiranguvöönd (water-body buffers)
//   - Korduv üleujutusala (recurring flood area)
//   - Väetiste ja taimekaitsevahendite keeld (fertiliser/pesticide ban)
import { intersecting, geojsonToWkt } from "./wfs.mjs";

const LAYERS = [
  { layer: "kitsendused:metsakas_kpois_RANNA_VOI_KALDA_VEEKAITSEVOOND", kind: "vesi" },
  { layer: "kitsendused:metsakas_kpois_RANNA_VOI_KALDA_PIIRANGUVOOND", kind: "vesi" },
  { layer: "kitsendused:metsakas_kpois_KORDUV_ULEUJUTUSALA", kind: "uleujutus" },
  { layer: "kitsendused:metsakas_kpois_VAETISTE_JA_TAIMEKAITSEV_KEELD", kind: "vesi" },
];

/**
 * Forest-use restriction zones intersecting the parcel. `geom3301` is the
 * parcel polygon in EPSG:3301 (from the kitsendused API). All layers queried in
 * parallel; best-effort ([] on error). Deduped by zone name + water body.
 */
export async function getForestZones(geom3301) {
  if (!geom3301) return [];
  let wkt;
  try {
    wkt = geojsonToWkt(geom3301);
  } catch {
    return [];
  }
  const perLayer = await Promise.all(
    LAYERS.map(async ({ layer, kind }) => {
      try {
        const fc = await intersecting(layer, wkt, 20);
        return (fc.features ?? []).map((f) => ({
          layer,
          kind,
          name: f.properties?.voondi_nimetus ?? null, // e.g. "Ranna või kalda veekaitsevöönd"
          objekt: f.properties?.objekti_nimetus ?? null, // the water body
          ulatus_m: f.properties?.ulatus_m ?? null, // buffer width
          geom: f.geometry ?? null, // EPSG:3301
        }));
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set();
  const out = [];
  for (const z of perLayer.flat()) {
    const key = `${z.name}|${z.objekt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(z);
  }
  return out;
}
