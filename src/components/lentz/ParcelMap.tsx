"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ParcelReport } from "@/lib/sampleReport";

// Colour per kitsendus category (catKey from /api/report) — matches the chips.
const CAT_COLOR: Record<string, string> = {
  looduskaitse: "#b42318", liik: "#92740b", elektri: "#7c3aed", gaas: "#7c3aed",
  side: "#7c3aed", tee: "#57534e", vesi: "#0e7490", vooras: "#ea580c", muu: "#5b6b61",
};
const CAT_ET: Record<string, string> = {
  looduskaitse: "Looduskaitse", liik: "Kaitsealune liik", elektri: "Elektriliin",
  gaas: "Gaasitoru", side: "Sidevõrk", tee: "Tee", vesi: "Vesi",
  vooras: "Karuputk (võõrliik)", muu: "Muu",
};
// MapLibre "match" colour expression keyed on the feature's `cat` property.
const COLOR_EXPR = [
  "match", ["get", "cat"],
  ...Object.entries(CAT_COLOR).flatMap(([k, v]) => [k, v]),
  "#5b6b61",
] as unknown as maplibregl.ExpressionSpecification;

// EELIS nature zones — colour + label per `kind` (from report.overlays).
const ZONE_STYLE: Record<string, { color: string; label: string }> = {
  kaitseala: { color: "#15803d", label: "Kaitseala / hoiuala" },
  natura: { color: "#0891b2", label: "Natura 2000" },
  piiranguvoond: { color: "#ca8a04", label: "Piiranguvöönd" },
  sihtkaitsevoond: { color: "#dc2626", label: "Sihtkaitsevöönd" },
  reservaat: { color: "#7f1d1d", label: "Reservaat" },
};
const ZONE_COLOR_EXPR = [
  "match", ["get", "kind"],
  ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.color]),
  "#15803d",
] as unknown as maplibregl.ExpressionSpecification;

type Overlay = { kind: string; label: string; geometry?: GeoJSON.Geometry | null };

function zonesFC(report: ParcelReport): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = [];
  for (const o of ((report as unknown as { overlays?: Overlay[] }).overlays ?? [])) {
    if (!o.geometry) continue;
    feats.push({ type: "Feature", geometry: o.geometry, properties: { kind: o.kind, label: o.label } });
  }
  return { type: "FeatureCollection", features: feats };
}

// Highlight one layer from the legend: the focused category/zone keeps full
// opacity, everything else dims. `focus` is a kits `cat` OR a zone `kind`;
// null = show all normally. Applied via paint expressions so it's instant.
function setPaint(map: maplibregl.Map, layer: string, prop: string, value: unknown) {
  if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value as never);
}
function applyFocus(map: maplibregl.Map, focus: string | null) {
  const f = focus;
  const dim = (key: string, hi: number, lo: number) =>
    f ? (["case", ["==", ["get", key], f], hi, lo] as unknown) : hi;
  setPaint(map, "kits-fill", "fill-opacity", dim("cat", 0.45, 0.05));
  setPaint(map, "kits-line", "line-opacity", dim("cat", 0.9, 0.1));
  setPaint(map, "kits-point", "circle-opacity", dim("cat", 1, 0.12));
  setPaint(map, "kits-point", "circle-stroke-opacity", dim("cat", 1, 0.12));
  setPaint(map, "zones-fill", "fill-opacity", dim("kind", 0.32, 0.05));
  setPaint(map, "zones-line", "line-opacity", dim("kind", 1, 0.1));
}

type ReportFeature = {
  geometry?: GeoJSON.Geometry | null;
  catKey?: string;
  group?: string;
  title?: string;
  area?: string;
  latin?: string;
  et?: string;
};

// Build one FeatureCollection from all report restrictions + species that
// carry geometry, tagged with `cat` (category) + `label` for colouring/popups.
function kitsendusedFC(report: ParcelReport): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = [];
  const push = (f: ReportFeature, cat: string, label: string) => {
    if (!f.geometry) return;
    feats.push({ type: "Feature", geometry: f.geometry, properties: { cat, label } });
  };
  for (const r of ((report as unknown as { restrictions: ReportFeature[] }).restrictions ?? []))
    push(r, r.catKey ?? "muu", r.title ?? r.area ?? "Kitsendus");
  // Protected species often share one habitat polygon (e.g. 5 orchids in the
  // same meadow). Group by geometry so each area is drawn ONCE and its popup
  // lists every species in it — instead of 5 identical polygons stacked, with
  // a popup that reveals only one name.
  const byGeom = new Map<string, { geom: GeoJSON.Geometry; names: string[] }>();
  for (const s of ((report as unknown as { species: ReportFeature[] }).species ?? [])) {
    if (!s.geometry) continue;
    const key = JSON.stringify(s.geometry);
    const e = byGeom.get(key) ?? { geom: s.geometry, names: [] };
    e.names.push(s.et ?? s.latin ?? "Liik");
    byGeom.set(key, e);
  }
  for (const { geom, names } of byGeom.values()) {
    const label = names.length > 1 ? `${names.length} liiki: ${names.join(", ")}` : names[0];
    feats.push({ type: "Feature", geometry: geom, properties: { cat: "liik", label } });
  }
  return { type: "FeatureCollection", features: feats };
}

function popup(map: maplibregl.Map, e: maplibregl.MapLayerMouseEvent) {
  const f = e.features?.[0];
  if (!f) return;
  const label = String(f.properties?.label ?? "");
  // Zone features carry `kind`; kitsendused features carry `cat`.
  const kind = f.properties?.kind ? String(f.properties.kind) : "";
  const cat = String(f.properties?.cat ?? "");
  const title = kind ? ZONE_STYLE[kind]?.label ?? kind : CAT_ET[cat] ?? cat;
  new maplibregl.Popup({ closeButton: false })
    .setLngLat(e.lngLat)
    .setHTML(`<div style="font:12px system-ui"><b>${title}</b><br/>${label}</div>`)
    .addTo(map);
}

export default function ParcelMap({ report }: { report: ParcelReport }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null); // highlighted legend item
  // Nature zones to draw + legend, straight from the precise EELIS overlays.
  const overlays = (report as unknown as { overlays?: Overlay[] }).overlays ?? [];
  const zoneKinds = [...new Set(overlays.map((o) => o.kind))];

  // Re-apply the highlight whenever the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyFocus(map, focus);
    else map.once("idle", () => applyFocus(map, focus));
  }, [focus]);

  // New parcel → clear any highlight (the old category may not exist here).
  useEffect(() => setFocus(null), [report]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            // OSM's tile server only serves up to z19. Cap here so MapLibre
            // overzooms the z19 tiles instead of fetching z20+ (which 404 and
            // spam the console with "Failed to fetch" AJAX errors).
            maxzoom: 19,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: report.center,
      zoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // Layer order matters: parcel FILL at the bottom (faint, so it never
      // washes out the coloured overlays) → nature zones → kitsendused →
      // parcel OUTLINE on top. Previously the blue parcel fill sat on top of
      // everything and hid the category colours.

      // 1. Parcel fill — faint wash so overlay colours read clearly on top.
      map.addSource("parcel", {
        type: "geojson",
        data: { type: "Feature", geometry: report.geometry, properties: {} },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcel",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.04 },
      });

      // 2. EELIS nature zones (kaitseala, sihtkaitsevöönd, reservaat,
      // piiranguvöönd, Natura) — precise geometry from the report, each in its
      // own colour with a dashed outline.
      const zfc = zonesFC(report);
      if (zfc.features.length) {
        map.addSource("zones", { type: "geojson", data: zfc });
        map.addLayer({
          id: "zones-fill", type: "fill", source: "zones",
          paint: { "fill-color": ZONE_COLOR_EXPR, "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "zones-line", type: "line", source: "zones",
          paint: { "line-color": ZONE_COLOR_EXPR, "line-width": 1.5, "line-dasharray": [2, 1] },
        });
        map.on("click", "zones-fill", (e) => popup(map, e));
      }

      // 3. All kitsendused (poles, power lines, water/road zones, species,
      // karuputk) — one source, three type-filtered layers, coloured by
      // category. Stronger opacity + outline so each colour reads on the map.
      const fc = kitsendusedFC(report);
      if (fc.features.length) {
        map.addSource("kitsendused", { type: "geojson", data: fc });
        map.addLayer({
          id: "kits-fill", type: "fill", source: "kitsendused",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": COLOR_EXPR, "fill-opacity": 0.4, "fill-outline-color": COLOR_EXPR },
        });
        map.addLayer({
          id: "kits-line", type: "line", source: "kitsendused",
          filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
          paint: { "line-color": COLOR_EXPR, "line-width": 3, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "kits-point", type: "circle", source: "kitsendused",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5, "circle-color": COLOR_EXPR,
            "circle-stroke-width": 1.5, "circle-stroke-color": "#fff",
          },
        });
        // Click a feature → popup with its label.
        map.on("click", "kits-line", (e) => popup(map, e));
        map.on("click", "kits-point", (e) => popup(map, e));
        map.on("click", "kits-fill", (e) => popup(map, e));
      }
      setCats([...new Set(fc.features.map((f) => String(f.properties?.cat)))]);

      // 4. Parcel outline on TOP — bold so the parcel stays the focus.
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcel",
        paint: { "line-color": "#1d4ed8", "line-width": 3.5 },
      });

      const coords = report.geometry.coordinates[0];
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new maplibregl.LngLatBounds(
          coords[0] as [number, number],
          coords[0] as [number, number]
        )
      );
      map.fitBounds(bounds, { padding: 60, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [report]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* legend */}
      <div className="absolute left-3 top-3 z-10 border border-black/10 bg-white/95 px-3 py-2.5 text-xs text-[#14130f] shadow-sm backdrop-blur">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-3 w-3 border-2 border-[#1d4ed8] bg-[#2563eb]/10" />
          Kinnistu
        </div>
        {/* Click a row to highlight that layer (others dim). Click again to reset. */}
        {(zoneKinds.length > 0 || cats.length > 0) && (
          <p className="mb-1 text-[10px] text-[#14130f]/40">Vajuta esiletõstmiseks</p>
        )}
        {/* Nature zones present on the parcel (precise EELIS overlays). */}
        {zoneKinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFocus(focus === k ? null : k)}
            className={`mt-1 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition ${
              focus === k ? "bg-black/10 font-semibold" : focus ? "opacity-40 hover:opacity-100" : "hover:bg-black/5"
            }`}
          >
            <span
              className="h-3 w-3 shrink-0 border"
              style={{ background: `${ZONE_STYLE[k]?.color ?? "#15803d"}55`, borderColor: ZONE_STYLE[k]?.color ?? "#15803d" }}
            />
            {ZONE_STYLE[k]?.label ?? k}
          </button>
        ))}
        {cats.length > 0 && (
          <div className="mt-2 border-t border-black/10 pt-1.5">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFocus(focus === c ? null : c)}
                className={`mt-1 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition ${
                  focus === c ? "bg-black/10 font-semibold" : focus ? "opacity-40 hover:opacity-100" : "hover:bg-black/5"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CAT_COLOR[c] ?? "#5b6b61" }}
                />
                {CAT_ET[c] ?? c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
