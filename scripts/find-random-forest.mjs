import { intersecting, getFeatures, wktPoint } from "./wfs.mjs";

// Mainland Estonia bbox in EPSG:3301 (easting X, northing Y).
const X0 = 380000, X1 = 720000, Y0 = 6385000, Y1 = 6625000;
const rnd = (a, b) => a + Math.random() * (b - a);

for (let i = 0; i < 25; i++) {
  const x = rnd(X0, X1), y = rnd(Y0, Y1);
  try {
    const stand = await intersecting("metsaregister:eraldis", wktPoint(x, y), 1);
    if (!stand.features?.length) continue;
    const parcel = await intersecting("kataster:ky_kehtiv", wktPoint(x, y), 1);
    const t = parcel.features?.[0]?.properties?.tunnus;
    if (!t) continue;
    const p = stand.features[0].properties;
    console.log(`FOUND forest parcel: ${t}`);
    console.log(`  point: ${x.toFixed(0)}, ${y.toFixed(0)}  (attempt ${i + 1})`);
    console.log(`  stand props: ${JSON.stringify(p).slice(0, 300)}`);
    console.log(`\nTUNNUS=${t}`);
    break;
  } catch (e) { /* skip sea/errors */ }
}
