// Reserve Radar — universal kitsendused source.
// Maa-amet's official aggregator: ONE call returns every restriction on a parcel
// (nature, utility, road, water…), with overlap area/length, geometry, and KKR codes.
// This is the same data the official kitsendused.kataster.ee app shows.

const API = "https://kitsendused.kataster.ee/api/v2/cadastre-unit/restrictions";

// Map a restriction to a coarse category for color-coding / grouping.
function categorize(feature, type) {
  const f = (feature?.code || "") + " " + (feature?.name || "");
  const t = type?.code || "";
  if (t.includes("KAITSEALA") || t.includes("HOIUALA") || t.includes("LOODUSPARK") || /kaitseala|hoiuala/i.test(f)) return "looduskaitse";
  if (/ELEKTRI|LIIN|ALAJAAM|KAABEL/i.test(f)) return "elektri";
  if (/GAAS/i.test(f)) return "gaas";
  if (/SIDE|TELEKO/i.test(f)) return "side";
  // Drainage systems (maaparandus) — water management, NOT roads. MUST come
  // before the /TEE/ check: "maaparandussüs-TEE-mi" contains the substring
  // "tee" and was being miscategorised as a road.
  if (/MAAPARAND|KUIVEND|EESVOOL|DRENAA|\bKRAAV/i.test(f)) return "vesi";
  if (/kaitsealused liigid|kivistis|III kategooria|püsielupaik/i.test(f)) return "liik";
  if (/TEE|MAANTEE|RAUDTEE/i.test(f)) return "tee";
  if (/VESI|VEEKOGU|KALDA|RANNA|NITRAAD|PUURKAEV|REOVEE|PÕHJAVE|POHJAVE/i.test(f)) return "vesi";
  // Mineral deposits & geological survey areas — the most common "Muu" before.
  if (/MAARDLA|MAAVARA|UURING|TURVAS|KAEVANDA|PÕLEVKIVI|POLEVKIVI|LIIV|KRUUS|PUISTANG/i.test(f)) return "maavara";
  if (/PÄRAND|PARAND|MUINSUS|ARHEOLOOG|KULTUURIMÄLESTIS/i.test(f)) return "parand";
  return "muu";
}

/** Fetch all kitsendused for a tunnus from the official Maa-amet API. */
export async function getKitsendused(tunnus) {
  const url = `${API}?cadastreUnit=${encodeURIComponent(tunnus)}`;
  const res = await fetch(url, { headers: { "User-Agent": "ReserveRadar/0.1 (hackathon)" } });
  if (!res.ok) throw new Error(`kitsendused ${tunnus} HTTP ${res.status}`);
  const data = await res.json();
  const block = data?.[0];
  if (!block) return { tunnus, found: false, restrictions: [] };

  const restrictions = (block.restrictionObjects ?? []).map((r) => {
    const o = r.restrictionObject;
    return {
      name: o.name ?? null,
      kind: o.feature?.name ?? o.type?.name ?? null,   // human kind
      featureCode: o.feature?.code ?? null,
      typeCode: o.type?.code ?? null,
      objectType: o.objectType ?? null,                 // JOON (line) | PIND (area)
      category: categorize(o.feature, o.type),
      kkr: o.externalReference ?? null,                 // KKR code → links to eeskiri
      area_m2: r.intersectionArea != null ? Math.round(r.intersectionArea) : null,
      length_m: r.intersectionLength != null ? Math.round(r.intersectionLength) : null,
      geom: r.intersectingGeometry ?? null,             // GeoJSON in EPSG:3301 (reproject for maps)
      validFrom: o.validFrom ?? null,
    };
  });

  return {
    tunnus,
    found: true,
    address: block.cadastreUnit?.fullAddress ?? null,
    geometry: block.cadastreUnit?.geometry ?? null,    // EPSG:3301
    restrictions,
  };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("kitsendused.mjs");
if (invokedDirectly) {
  const t = process.argv[2] || "63902:001:0751";
  const r = await getKitsendused(t);
  const byCat = {};
  for (const x of r.restrictions) (byCat[x.category] ??= []).push(x);
  console.log(`${t} (${r.address}) — ${r.restrictions.length} kitsendust`);
  for (const [cat, items] of Object.entries(byCat)) {
    console.log(`\n[${cat}] ${items.length}`);
    for (const i of items) {
      const m = i.area_m2 ? `${i.area_m2} m²` : i.length_m ? `${i.length_m} m` : "";
      console.log(`  - ${i.name || i.kind} ${i.kind && i.name ? `(${i.kind})` : ""} ${m}${i.kkr ? " [" + i.kkr + "]" : ""}`);
    }
  }
}
