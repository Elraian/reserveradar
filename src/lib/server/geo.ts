// Shared coordinate reprojection: Estonian L-EST97 (EPSG:3301) → WGS84, so
// restriction geometries (poles, power lines, areas) draw on MapLibre maps.
import "server-only";
import proj4 from "proj4";

proj4.defs(
  "EPSG:3301",
  "+proj=lcc +lat_0=57.5175539305556 +lon_0=24 +lat_1=59.3333333333333 +lat_2=58 +x_0=500000 +y_0=6375000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export function reproject3301to4326(
  geom: { type: string; coordinates?: unknown; geometries?: unknown } | null | undefined,
): GeoJSON.Geometry | null {
  if (!geom) return null;
  // GeometryCollection has `geometries`, not `coordinates` — recurse into each
  // member (otherwise it produced a broken {coordinates: undefined} that drew
  // nowhere, e.g. some "üle 10 ha veekogu" water features).
  if (geom.type === "GeometryCollection") {
    const members = Array.isArray(geom.geometries) ? geom.geometries : [];
    return {
      type: "GeometryCollection",
      geometries: members
        .map((g) => reproject3301to4326(g as { type: string; coordinates?: unknown }))
        .filter(Boolean),
    } as GeoJSON.Geometry;
  }
  const map = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === "number"
      ? proj4("EPSG:3301", "EPSG:4326", c as number[])
      : Array.isArray(c)
        ? c.map(map)
        : c;
  return { type: geom.type, coordinates: map(geom.coordinates) } as GeoJSON.Geometry;
}
