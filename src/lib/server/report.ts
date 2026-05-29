// Reserve Radar — adapter that maps OUR backend (kitsendused + eeskiri + WFS
// geometry) to Lennart's `ParcelReport` shape (lentzUI branch). This is the
// bridge his page.tsx swaps the mock `sampleReport` import for:
//   const report = await fetch(`${BACKEND}/api/report/${tunnus}`).then(r => r.json())
// Deterministic + fast (no LLM call here; the conversational answer is /api/chat).
import "server-only";
import { getKitsendused } from "@scripts/kitsendused.mjs";
import { getParcel, geojsonToWkt, intersecting } from "@scripts/wfs.mjs";
import { resolveEeskiriAktSearch } from "@scripts/rt.mjs";
import { resolveParcel } from "./parcel";
import { reproject3301to4326 } from "./geo";

// Title-case an UPPERCASE cadaster enum like "MAATULUNDUSMAA" → "Maatulundusmaa".
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

type Severity = "red" | "amber" | "green";

type KitsRestriction = {
  name?: string | null; kind?: string | null; category: string;
  area_m2?: number | null; length_m?: number | null; kkr?: string | null;
  geom?: { type: string; coordinates: unknown } | null; // EPSG:3301
};

const CAT_LABEL: Record<string, string> = {
  looduskaitse: "Looduskaitse", liik: "Kaitsealune liik", elektri: "Elektriliin",
  gaas: "Gaasitoru", side: "Sidevõrk", tee: "Tee", vesi: "Vesi",
  maavara: "Maavara / uuring", parand: "Pärandkultuur", muu: "Muu",
};

function severityOf(category: string, coveragePct: number): Severity {
  if (category === "looduskaitse") return coveragePct > 50 ? "red" : "amber";
  if (category === "liik" || ["elektri", "gaas", "side", "tee", "vesi"].includes(category)) return "amber";
  return "green";
}

// Shoelace area (m²) of a polygon ring in EPSG:3301 (metres).
function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
function polygonArea3301(geom: { type: string; coordinates: number[][][] | number[][][][] } | null): number {
  if (!geom) return 0;
  if (geom.type === "Polygon") return ringArea((geom.coordinates as number[][][])[0] ?? []);
  if (geom.type === "MultiPolygon")
    return (geom.coordinates as number[][][][]).reduce((s, poly) => s + ringArea(poly[0] ?? []), 0);
  return 0;
}

// Deterministic ecological score (0–100) + terse good/concerning bullets,
// derived purely from the overlap data we already fetched — no extra request,
// no LLM. Higher = ecologically richer / lower disturbance.
// Parcel-level proxy of the UTartu "rohemeeter" landscape index. We can't match
// its 500 m / 70-layer model, so this is deliberately conservative: a low
// baseline, capped positive contributions (designation ≠ guaranteed condition),
// and several condition/disturbance penalties. Designation alone tops out in the
// ~70s; only diverse, undisturbed land approaches the high end.
function deriveEco(
  areas: { category?: string; natura?: boolean; label?: string; nimi?: string | null; layer?: string }[],
  restrictions: Array<Record<string, unknown>>,
  species: Array<{ latin?: string; et?: string }>,
  cover: { forestM2: number; grassM2: number; otherM2: number; areaM2: number },
): { score: number; good: string[]; concerning: string[] } {
  const good: string[] = [];
  const concerning: string[] = [];
  let score = 30; // ordinary, unremarkable land

  const has = (cat: string) => areas.some((a) => a.category === cat);
  const text = (a: { label?: string; nimi?: string | null; layer?: string }) =>
    `${a.label ?? ""} ${a.nimi ?? ""} ${a.layer ?? ""}`.toLowerCase();
  const natura = has("natura") || areas.some((a) => a.natura);
  const uniq = species.length; // de-duplicated by latin name

  const wetArea = has("water") || areas.some((a) => /märg|\bsoo\b|raba|luht/.test(text(a)));
  const wetSpecies = species.some((s) => /soo-|palustris|märg/i.test(`${s.et ?? ""} ${s.latin ?? ""}`));
  const wetland = wetArea || wetSpecies;

  const drainage =
    areas.some((a) => /maaparand|kuivend|kraav/.test(text(a))) ||
    restrictions.some((r) => /maaparand|kuivend|kraav/.test(String(r.title ?? r.area ?? "").toLowerCase()));
  const hazard = has("hazard") || areas.some((a) => /reostus|saaste/.test(text(a)));
  const infra = areas.filter((a) => a.category === "utility" || a.category === "road").length;

  // Land-cover mix (homogenisation is a key rohemeeter negative).
  const total = cover.areaM2 || cover.forestM2 + cover.grassM2 + cover.otherM2 || 1;
  const fF = cover.forestM2 / total, fG = cover.grassM2 / total, fO = cover.otherM2 / total;
  const coverTypes = [fF, fG, fO].filter((x) => x > 0.05).length;
  const dominant = Math.max(fF, fG, fO);

  // ── Positives (capped, diminishing) ──
  if (has("protection")) { score += 10; good.push("Asub kaitsealal — elurikkus tavaliselt paremas seisus."); }
  if (natura) { score += 12; good.push("Natura 2000 — üleeuroopalise tähtsusega elupaik."); }
  if (wetland) { score += 7; good.push("Märgala-/sooelupaik — kõrge loodusväärtus."); }
  if (uniq > 0) { score += Math.min(10, Math.round(uniq * 1.3)); good.push(`${uniq} kaitsealust liiki kinnistul.`); }
  if (coverTypes >= 3) { score += 6; good.push("Mitmekesine maakate (mets, niit, muu) toetab elurikkust."); }
  else if (coverTypes === 2) { score += 2; }

  // ── Negatives (harsher, more of them) ──
  if (drainage && wetland) { score -= 22; concerning.push("Kuivenduskraavid mõjutavad märgala veerežiimi."); }
  else if (drainage) { score -= 10; concerning.push("Kinnistul on maaparandussüsteem."); }
  if (hazard) { score -= 14; concerning.push("Läheduses on registreeritud reostusoht."); }
  if (dominant > 0.85 && fF > 0.85) { score -= 8; concerning.push("Ühetaoline metsamaa — vähem elupaiku kui mosaiikmaastikul."); }
  if (fO > 0.4) { score -= 8; concerning.push("Suur osa kinnistust on hoonestatud/muu maa."); }
  if (infra > 0) { score -= Math.min(8, infra * 4); concerning.push("Tehnovõrgud/teed killustavad elupaika."); }
  if (areas.some((a) => a.layer === "maaamet:karuputk")) { score -= 6; concerning.push("Karuputke koloonia — invasiivne võõrliik, tõrje kohustuslik."); }
  if (!natura && !has("protection") && uniq === 0) { score -= 6; concerning.push("Teadaolevad loodusväärtused puuduvad — intensiivse kasutuse risk."); }

  if (!good.length) good.push("Olulisi looduskaitselisi väärtusi ei tuvastatud.");

  return { score: Math.max(0, Math.min(100, score)), good: good.slice(0, 4), concerning: concerning.slice(0, 3) };
}

function speciesGroup(name: string): "animal" | "plant" | "fungi" {
  const n = name.toLowerCase();
  if (/silmik|liblik|kärbes|mardikas|konn|nahkhiir|lind/.test(n)) return "animal";
  if (/seen|samblik|sammal/.test(n)) return "fungi";
  return "plant";
}

function splitLatinEt(name: string): { latin: string; et: string } {
  const m = name.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { latin: m[1].trim(), et: m[2].trim() };
  return { latin: name, et: name };
}

// Plain-language "Lihtsalt öeldes" — what you can / can't / must consider,
// derived from the categories + protection zone present. Deterministic and
// concrete (not an echo of restriction titles); the chat gives the richer,
// §-cited version. Empty buckets are simply omitted by the UI.
function buildSummary(
  restrictions: Array<{ catKey?: unknown }>,
  speciesCount: number,
  zone: string | null | undefined,
): { allowed: string[]; forbidden: string[]; consider: string[] } {
  const cats = new Set(restrictions.map((r) => String(r.catKey)));
  const allowed: string[] = [];
  const forbidden: string[] = [];
  const consider: string[] = [];

  const strictZone = zone === "reservaat" || zone === "sihtkaitsevöönd";
  const heavyNature = cats.has("looduskaitse") || strictZone;

  // What you CAN do
  if (!heavyNature) allowed.push("Metsamajandus üldiste reeglite järgi (metsateatis)");
  if (!cats.size && !speciesCount) allowed.push("Tavapärane maakasutus — teadaolevaid piiranguid pole");

  // Protection zone drives the strongest forest-management line
  if (zone === "reservaat") forbidden.push("Reservaadis on majandustegevus ja metsaraie keelatud");
  else if (zone === "sihtkaitsevöönd") forbidden.push("Sihtkaitsevööndis on metsaraie üldjuhul keelatud (täpsusta Keskkonnaametiga)");
  else if (zone === "piiranguvöönd") consider.push("Piiranguvööndis on raie piiratud — vajab Keskkonnaameti kooskõlastust");

  // Category-driven guidance (human consequence, not the raw kitsendus name)
  if (cats.has("looduskaitse") && !strictZone)
    consider.push("Kaitsealal võivad raie ja ehitus olla loakohustuslikud — täpsusta Keskkonnaametiga");
  if (cats.has("elektri") || cats.has("gaas") || cats.has("side"))
    consider.push("Tehnovõrgu kaitsevööndis vajavad kaeve- ja ehitustööd võrguettevõtja (nt Elektrilevi) nõusolekut");
  if (cats.has("tee"))
    consider.push("Tee kaitsevööndis vajavad tegevus ja uued mahasõidud Transpordiameti kooskõlastust");
  if (cats.has("vesi"))
    consider.push("Vee-/põhjaveekaitse alal on väetiste ja taimekaitsevahendite kasutamine piiratud");
  if (cats.has("vooras"))
    consider.push("Karuputke koloonia: tõrje on kohustuslik; majandamine lubatud vaid leviku tõrjumisel");
  if (speciesCount > 0)
    consider.push("Kinnistul on kaitsealuseid liike — nende elupaiku ei tohi kahjustada");

  return {
    allowed: [...new Set(allowed)],
    forbidden: [...new Set(forbidden)],
    consider: [...new Set(consider)],
  };
}

/** Build Lennart's ParcelReport from the live backend. */
export async function buildReport(tunnus: string) {
  const [kits, panel, parcelFeat] = await Promise.all([
    getKitsendused(tunnus),
    resolveParcel(tunnus).catch(() => null),
    getParcel(tunnus).catch(() => null), // ky_kehtiv feature → cadaster attributes
  ]);
  if (!kits.found) return { found: false, tunnus };

  // Cadaster attributes (sihtotstarve, land-cover areas, owner type, tax value)
  // come from the same ky_kehtiv fetch — no extra source needed.
  const p = (parcelFeat?.properties ?? {}) as Record<string, unknown>;

  // Forest register: count stands (metsaeraldis) + active felling notices
  // (metsateatis) intersecting the parcel. Same GeoServer, two cheap WFS hits
  // in parallel; failures degrade to 0 rather than breaking the report.
  let forestStands = 0;
  let fellingNotices = 0;
  const parcelGeom = (parcelFeat as { geometry?: { type: string; coordinates: unknown } } | null)?.geometry;
  if (parcelGeom) {
    const wkt = geojsonToWkt(parcelGeom);
    const [stands, teatis] = await Promise.all([
      intersecting("metsaregister:eraldis", wkt, 500).catch(() => null),
      intersecting("metsaregister:teatis", wkt, 500).catch(() => null),
    ]);
    forestStands = stands?.features?.length ?? 0;
    fellingNotices = teatis?.features?.length ?? 0;
  }

  // Canonical "see the source" link: the official Maa-amet kitsenduste page
  // for this exact parcel (every restriction here is visible there).
  const kitsendusedUrl = `https://kitsendused.kataster.ee/public?code=${tunnus}`;

  const parcelM2 = polygonArea3301(kits.geometry as never) || panel?.areas ? polygonArea3301(kits.geometry as never) : 0;
  const totalM2 = parcelM2 || 1;

  // Resolve eeskiri for the main protected area (for rule links).
  const nature = (kits.restrictions as KitsRestriction[])
    .filter((r) => r.category === "looduskaitse")
    .sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
  let eeskiriUrl: string | null = null;
  let ruleDocs: { title: string; url: string; issuer: string; date: string }[] = [];
  if (nature[0]?.name) {
    // Resolve only the akt ID → build the link. The panel needs the URL, not the
    // 9–19 MB paragraph text (that's fetched lazily in the /api/chat answer).
    const akt = await resolveEeskiriAktSearch(nature[0].name).catch(() => null);
    if (akt) {
      eeskiriUrl = `https://www.riigiteataja.ee/akt/${akt}`;
      ruleDocs = [{ title: `${nature[0].name} kaitse-eeskiri`, url: eeskiriUrl, issuer: "Vabariigi Valitsus", date: "" }];
    }
  }

  // Restrictions (dedup species-style repeats by name).
  const seen = new Set<string>();
  const restrictions = [] as Array<Record<string, unknown>>;
  const speciesItems: KitsRestriction[] = [];
  for (const r of kits.restrictions as KitsRestriction[]) {
    if (r.category === "liik") { speciesItems.push(r); continue; }
    const key = `${r.category}:${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const areaM2 = r.area_m2 ?? 0;
    const coveragePct = Math.min(100, Math.round((areaM2 / totalM2) * 1000) / 10);
    restrictions.push({
      category: CAT_LABEL[r.category] ?? "Muu",
      catKey: r.category, // raw key → drives map colour
      title: r.kind ?? r.name ?? "Kitsendus",
      area: r.name ?? r.kind ?? "",
      areaM2,
      coveragePct,
      severity: severityOf(r.category, coveragePct),
      rule: r.category === "looduskaitse" ? "Kaitse-eeskiri" : undefined,
      ruleUrl: r.category === "looduskaitse" ? eeskiriUrl ?? undefined : undefined,
      // "Open the source" — the official Maa-amet kitsenduste page for this parcel.
      cardUrl: kitsendusedUrl,
      geometry: reproject3301to4326(r.geom ?? null), // 4326 for the map
    });
  }

  // Karuputke (hogweed) colonies — from the EELIS sweep (maaamet:karuputk),
  // attached by resolveOverlays. Aggregate into one card + combined geometry so
  // the map draws every colony in one invasive-species colour.
  const karuputkAreas = (panel?.areas ?? []).filter((a) => a.layer === "maaamet:karuputk");
  if (karuputkAreas.length) {
    const polys: number[][][][] = [];
    for (const a of karuputkAreas) {
      const g = a.geometry as { type: string; coordinates: unknown } | null;
      if (g?.type === "Polygon") polys.push(g.coordinates as number[][][]);
      else if (g?.type === "MultiPolygon") polys.push(...(g.coordinates as number[][][][]));
    }
    const seisundid = [...new Set(karuputkAreas.map((a) => a.nimi).filter(Boolean))];
    restrictions.push({
      category: "Võõrliik",
      catKey: "vooras", // drives map colour
      title: karuputkAreas.length > 1 ? `Karuputke kolooniad (${karuputkAreas.length})` : "Karuputke koloonia",
      area: `Invasiivne võõrliik${seisundid.length ? " · " + seisundid.join("; ") : ""}`,
      areaM2: 0,
      coveragePct: 0,
      severity: "amber",
      rule: "Karuputke tõrje on kohustuslik (Looduskaitseseadus)",
      ruleUrl: "https://www.riigiteataja.ee/akt/LKS",
      cardUrl: "https://xgis.maaamet.ee/xgis2/page/app/karuputk",
      geometry: polys.length ? { type: "MultiPolygon", coordinates: polys } : null,
    });
  }

  // Species (unique by latin name).
  const sSeen = new Set<string>();
  const species = [] as Array<Record<string, unknown>>;
  for (const s of speciesItems) {
    const { latin, et } = splitLatinEt(s.name ?? "");
    if (sSeen.has(latin)) continue;
    sSeen.add(latin);
    species.push({
      group: speciesGroup(s.name ?? ""), latin, et,
      kind: s.kind ?? "III kaitsekategooria",
      geometry: reproject3301to4326(s.geom ?? null),
    });
  }

  const overall: Severity = restrictions.some((r) => r.severity === "red")
    ? "red" : restrictions.length || species.length ? "amber" : "green";

  // Centre (lon,lat) from the 4326 panel geometry, if available.
  let center: [number, number] = [0, 0];
  const g = panel?.geometry;
  if (g) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (a: unknown): void => {
      if (Array.isArray(a) && typeof a[0] === "number") {
        const [x, y] = a as number[];
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (Array.isArray(a)) a.forEach(walk);
    };
    walk((g as { coordinates: unknown }).coordinates);
    center = [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  const addr: string[] = String(kits.address ?? "").split(",").map((s) => s.trim());

  return {
    found: true,
    tunnus,
    address: addr[0] ?? "",
    municipality: addr.slice(1, 3).join(", "),
    county: addr[addr.length - 1] ?? "",
    useType: p.siht1 ? titleCase(String(p.siht1)) : "Maatulundusmaa",
    areaM2: num(p.pindala) || Math.round(parcelM2),
    forestM2: num(p.mets), grassM2: num(p.rohumaa), otherM2: num(p.muumaa),
    owner: p.omvorm ? String(p.omvorm) : "—",
    taxValue: num(p.maks_hind),
    registry: p.kinnistu != null ? String(p.kinnistu) : "",
    overall,
    center,
    geometry: g ?? null,
    zone: panel?.zone ?? null,
    // EELIS nature overlays (with geometry) for distinct map fills. `kind`
    // distinguishes kaitseala / sihtkaitsevöönd / reservaat / piiranguvöönd /
    // Natura so each draws in its own colour, under the parcel outline.
    overlays: (panel?.areas ?? [])
      .filter(
        (a) =>
          (a.category === "protection" || a.category === "zone" || a.category === "natura") &&
          a.geometry,
      )
      .map((a) => {
        const l = a.layer;
        const kind = l.includes("reservaat")
          ? "reservaat"
          : l.includes("skv")
            ? "sihtkaitsevoond"
            : l === "eelis:kr_piirang"
              ? "piiranguvoond"
              : a.category === "natura"
                ? "natura"
                : "kaitseala";
        return { kind, label: a.nimi || a.label, geometry: a.geometry };
      }),
    // Source links — where every data point can be opened/verified.
    kitsendusedUrl,
    sources: [
      { title: "Maa-amet — kitsendused", url: kitsendusedUrl, issuer: "Maa- ja Ruumiamet" },
      ...ruleDocs,
    ],
    restrictions,
    species,
    speciesTotal: speciesItems.length,
    forestStands,
    fellingNotices,
    ruleDocs,
    summary: buildSummary(restrictions, speciesItems.length, panel?.zone),
    eco: deriveEco(
      panel?.areas ?? [],
      restrictions,
      species as Array<{ latin?: string; et?: string }>,
      {
        forestM2: num(p.mets),
        grassM2: num(p.rohumaa),
        otherM2: num(p.muumaa),
        areaM2: num(p.pindala) || Math.round(parcelM2),
      },
    ),
  };
}
