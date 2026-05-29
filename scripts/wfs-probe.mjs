// Proof-of-pipeline: protected area → real parcel inside it → all overlapping layers.
import { getFeatures, intersecting, wktPoint } from "./wfs.mjs";

function firstVertex(geom) {
  let c = geom.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return c; // [x=easting, y=northing]
}

const LAYERS = [
  ["protection", "eelis:kr_kaitseala"],
  ["protection", "eelis:kr_loodusala"],
  ["protection", "eelis:kr_looduslik_skv"],
  ["benefit", "eelis:toetus_mets"],
  ["benefit", "eelis:pk_objekt_metsas"],
  ["species", "eelis:kr_vep"],
  ["forest", "metsaregister:eraldis"],
];

// Centroid of a polygon's outer ring (good interior estimate for small/convex stands).
function ringCentroid(geom) {
  let c = geom.coordinates;
  while (Array.isArray(c[0][0][0])) c = c[0]; // descend MultiPolygon → Polygon
  const ring = c[0]; // outer ring [[x,y],...]
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

async function main() {
  console.log("1) Protected area: Tilga looduskaitseala");
  const areaFc = await getFeatures("eelis:kr_kaitseala", { cql: "nimi LIKE 'Tilga%'", count: 1 });
  const area = areaFc.features[0];
  console.log("   →", area.properties.nimi, "| kr_kood:", area.properties.kr_kood);

  // Step toward a real interior point: vertex of area → a forest stand there → that stand's centroid.
  const [vx, vy] = firstVertex(area.geometry);
  console.log("\n2) Forest stand at area boundary, then its interior:");
  const standEdge = await intersecting("metsaregister:eraldis", wktPoint(vx, vy), 1);
  let probe, parcelTunnus = "(none)";
  if (standEdge.features?.[0]) {
    const [sx, sy] = ringCentroid(standEdge.features[0].geometry);
    probe = wktPoint(sx, sy);
    console.log("   → stand found; using its centroid as probe");
    const parcelFc = await intersecting("kataster:ky_kehtiv", probe, 1);
    parcelTunnus = parcelFc.features?.[0]?.properties.tunnus ?? "(none)";
    console.log("   → parcel at centroid:", parcelTunnus);
  } else {
    probe = wktPoint(vx, vy);
    console.log("   → no stand at edge; probing at area vertex");
  }

  console.log("\n3) All overlapping layers at this location (store-it-all):");
  for (const [cat, layer] of LAYERS) {
    try {
      const fc = await intersecting(layer, probe, 5);
      const n = fc.features?.length ?? 0;
      const names = fc.features?.map(f => f.properties.nimi || f.properties.eluk || f.properties.kr_kood || "?").slice(0, 3).join("; ");
      console.log(`   [${cat.padEnd(10)}] ${layer.padEnd(28)} ${n} hit(s) ${n ? "→ " + names : ""}`);
    } catch (e) {
      console.log(`   [${cat.padEnd(10)}] ${layer.padEnd(28)} ERROR ${e.message.slice(0, 80)}`);
    }
  }

  console.log("\n✅ Full overlay sweep complete.");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
