import { getFeatures } from "./wfs.mjs";

const sample = ["24003:007:0170","57802:001:0110","62508:029:9480","16101:001:0261","27302:001:0500","43301:001:1242","66001:005:0439","51301:001:0213","90701:003:0169","78406:610:0296","78701:003:0072","15904:003:1198","14001:001:0667","19002:004:0250","89001:010:0337","18101:002:1410","77601:002:0047","19809:060:0130","63901:001:1390","50201:001:0172","80901:001:0474","20301:002:0182","90002:004:0061","12201:003:0002","89009:003:0350"];

let live = 0, gone = 0;
const missing = [];
for (const t of sample) {
  try {
    const fc = await getFeatures("kataster:ky_kehtiv", { cql: `tunnus='${t}'`, count: 1 });
    if (fc.features?.length) live++;
    else { gone++; missing.push(t); }
  } catch (e) {
    console.log("err", t, e.message.slice(0, 60));
  }
}
console.log(`\nLive (still valid): ${live}/${sample.length}`);
console.log(`Gone (superseded/missing): ${gone}/${sample.length}`);
if (missing.length) console.log("Missing tunnused:", missing.join(", "));
console.log(`\nSnapshot freshness ≈ ${Math.round(live/sample.length*100)}% still valid in live cadastre`);
