import { getParcel, intersecting, geojsonToWkt } from "./wfs.mjs";

// Each layer: how to label it for a human, its category, and whether it's Natura 2000.
// Mirrors what the official kitsendused.kataster.ee app surfaces (same EELIS source).
const LAYERS = [
  { layer: "eelis:kr_kaitseala",          category: "protection", label: "Kaitseala" },
  { layer: "eelis:kr_hoiuala",            category: "protection", label: "Hoiuala" },
  { layer: "eelis:kr_loodusala",          category: "natura",     label: "Natura 2000 loodusala", natura: true },
  { layer: "eelis:kr_linnuala",           category: "natura",     label: "Natura 2000 linnuala", natura: true },
  { layer: "eelis:kr_looduslik_skv",      category: "zone",       label: "Sihtkaitsevöönd (looduslik)" },
  { layer: "eelis:kr_hooldatav_skv",      category: "zone",       label: "Sihtkaitsevöönd (hooldatav)" },
  { layer: "eelis:kr_piirang",            category: "zone",       label: "Piiranguvöönd" },
  { layer: "eelis:kr_vep",                category: "species",    label: "Vääriselupaik (VEP)" },
  // III kaitsekategooria — the records the official app shows a dozen of.
  { layer: "eelis:kr_taimed_iii",         category: "species",    label: "III kaitsekategooria taim" },
  { layer: "eelis:kr_loomad_iii",         category: "species",    label: "III kaitsekategooria loom" },
  { layer: "eelis:kr_seened_samblikud_iii", category: "species",  label: "III kaitsekategooria seen/samblik" },
];

export async function getProtectionAreas(tunnus) {
  const parcel = await getParcel(tunnus);
  if (!parcel) return { tunnus, found: false, areas: [] };
  const wkt = geojsonToWkt(parcel.geometry);
  const areas = [];
  for (const { layer, category, label, natura } of LAYERS) {
    try {
      const fc = await intersecting(layer, wkt, 30);
      for (const f of fc.features ?? []) {
        areas.push({
          layer, category, label, natura: !!natura,
          nimi: f.properties.nimi ?? f.properties.liik ?? f.properties.nimetus ?? null,
          kr_kood: f.properties.kr_kood ?? null,
          tyyp: f.properties.tyyp ?? null,
        });
      }
    } catch (e) { console.log(`  ${layer} err: ${e.message.slice(0, 70)}`); }
  }
  return {
    tunnus,
    found: true,
    address: parcel.properties.l_aadress ?? parcel.properties.aadress ?? null,
    areas,
  };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("overlays.mjs");
if (invokedDirectly) {
  const t = process.argv[2] || "63902:001:0751";
  const r = await getProtectionAreas(t);
  // Compact summary: counts per category + named areas.
  const byCat = {};
  for (const a of r.areas) (byCat[a.category] ??= []).push(a);
  console.log(`tunnus ${r.tunnus} (${r.address}) — ${r.areas.length} overlays`);
  for (const [cat, items] of Object.entries(byCat)) {
    const names = [...new Set(items.map((i) => i.nimi || i.label))];
    console.log(`  ${cat}: ${items.length} — ${names.slice(0, 5).join("; ")}${names.length > 5 ? " …" : ""}`);
  }
}
