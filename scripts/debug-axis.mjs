import { getFeatures } from "./wfs.mjs";

// Grab Tilga, take a real vertex, test INTERSECTS both axis orders.
const fc = await getFeatures("eelis:kr_kaitseala", { cql: "nimi LIKE 'Tilga%'", count: 1 });
const g = fc.features[0].geometry;
let c = g.coordinates; while (Array.isArray(c[0])) c = c[0];
const [x, y] = c;
console.log("vertex from GeoJSON:", x, y, "(type", g.type + ")");

for (const [label, wkt] of [["as-is x y", `POINT(${x} ${y})`], ["swapped y x", `POINT(${y} ${x})`]]) {
  try {
    const r = await getFeatures("eelis:kr_kaitseala", { cql: `INTERSECTS(shape, ${wkt})`, count: 1 });
    console.log(`  ${label}: ${r.features?.length ?? 0} hit(s)`);
  } catch (e) { console.log(`  ${label}: ERROR ${e.message.slice(0,120)}`); }
}

// Also test without srsName forcing, and with EPSG:4326 lon/lat of same point converted? Just test srs variations.
try {
  const r = await getFeatures("eelis:kr_kaitseala", { cql: `INTERSECTS(shape, POINT(${x} ${y}))`, count: 1, srs: "EPSG:3301" });
  console.log("  explicit 3301:", r.features?.length ?? 0, "hit(s)");
} catch(e){ console.log("  explicit 3301 ERROR", e.message.slice(0,120)); }
