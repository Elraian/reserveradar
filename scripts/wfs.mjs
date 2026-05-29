// Reserve Radar — WFS helper for Estonian environmental open data.
// All layers live on one GeoServer; no auth needed. GeoJSON out, EPSG:3301/4326.

const HOSTS = {
  kataster: "https://gsavalik.envir.ee/geoserver/kataster/wfs",
  eelis: "https://gsavalik.envir.ee/geoserver/eelis/wfs",
  metsaregister: "https://gsavalik.envir.ee/geoserver/metsaregister/wfs",
};

function workspaceOf(layer) {
  const ws = layer.split(":")[0];
  if (!HOSTS[ws]) throw new Error(`Unknown workspace for layer ${layer}`);
  return ws;
}

/**
 * Generic WFS GetFeature → GeoJSON.
 * @param {string} layer   e.g. "kataster:ky_kehtiv"
 * @param {object} opts    { cql, bbox, count, srs }
 */
export async function getFeatures(layer, opts = {}) {
  const { cql, bbox, count = 50, srs = "EPSG:3301" } = opts;
  const url = new URL(HOSTS[workspaceOf(layer)]);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", layer);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", srs);
  url.searchParams.set("count", String(count));
  if (cql) url.searchParams.set("CQL_FILTER", cql);
  if (bbox) url.searchParams.set("bbox", bbox);

  const res = await fetch(url, { headers: { "User-Agent": "ReserveRadar/0.1 (hackathon)" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WFS ${layer} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Cadastral parcel polygon by tunnus. */
export async function getParcel(tunnus) {
  // ky_kehtiv carries geometry; the tunnus attribute is "tunnus".
  const fc = await getFeatures("kataster:ky_kehtiv", {
    cql: `tunnus='${tunnus}'`,
    count: 1,
  });
  return fc.features?.[0] ?? null;
}

// Geometry attribute name differs per workspace.
const GEOM_ATTR = { kataster: "geom", eelis: "shape", metsaregister: "shape" };

// EPSG:3301 (L-EST97) is defined northing-first. GeoJSON emits (easting, northing),
// but CQL WKT expects (northing, easting) — so swap when building WKT literals.
export function wktPoint(x, y) {
  return `POINT(${y} ${x})`;
}

/** Build a CQL INTERSECTS-ready WKT POLYGON from a GeoJSON outer ring [[x,y],...], axis-swapped. */
export function wktPolygon(ring) {
  const coords = ring.map(([x, y]) => `${y} ${x}`).join(", ");
  return `POLYGON((${coords}))`;
}

/** GeoJSON Polygon/MultiPolygon → axis-swapped WKT for EPSG:3301 CQL filters. */
export function geojsonToWkt(geom) {
  const ring = (r) => "(" + r.map(([x, y]) => `${y} ${x}`).join(", ") + ")";
  const poly = (p) => "(" + p.map(ring).join(", ") + ")";
  if (geom.type === "Polygon") return `POLYGON${poly(geom.coordinates)}`;
  if (geom.type === "MultiPolygon")
    return `MULTIPOLYGON(${geom.coordinates.map(poly).join(", ")})`;
  throw new Error(`Unsupported geometry type ${geom.type}`);
}

/** Features from `layer` that intersect a WKT geometry (already axis-correct), via CQL INTERSECTS. */
export async function intersecting(layer, geometryWkt, count = 50) {
  const ws = layer.split(":")[0];
  const geomAttr = GEOM_ATTR[ws] ?? "shape";
  return getFeatures(layer, {
    cql: `INTERSECTS(${geomAttr}, ${geometryWkt})`,
    count,
  });
}

export { HOSTS };
