import { intersecting, wktPoint } from "./wfs.mjs";
const X0=380000,X1=720000,Y0=6385000,Y1=6625000; const rnd=(a,b)=>a+Math.random()*(b-a);
const REQ=["tunnus","address","overall","center","geometry","restrictions","species","ruleDocs","summary","kitsendusedUrl","sources"];
const fixed=["63902:001:0751","66001:003:0760"]; const found=[];
for (let i=0;i<20 && found.length<4;i++){ const x=rnd(X0,X1),y=rnd(Y0,Y1);
  try{ const p=await intersecting("kataster:ky_kehtiv",wktPoint(x,y),1); const t=p.features?.[0]?.properties?.tunnus; if(t)found.push(t);}catch{} }
const all=[...fixed,...found];
console.log("testing",all.length,"parcels via /api/report (model 3.5→2.5):\n");
for (const t of all){ const t0=Date.now();
  try{ const r=await fetch(`http://localhost:3000/api/report/${t}`,{signal:AbortSignal.timeout(75000)}); const j=await r.json();
    const miss=j.found?REQ.filter(k=>j[k]===undefined):[];
    console.log(`${t}: HTTP ${r.status} found=${j.found} | restr=${j.restrictions?.length??"-"} | overall=${j.overall??"-"} | src=${j.sources?.length??"-"} | geom=${j.geometry?.type??"none"} | ${Date.now()-t0}ms ${miss.length?"| MISSING:"+miss.join(","):""}`);
  }catch(e){console.log(`${t}: ERROR ${(e.message||"").slice(0,60)}`);} }
