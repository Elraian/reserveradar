"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ParcelReport } from "@/lib/sampleReport";

const EELIS_WFS = "https://gsavalik.envir.ee/geoserver/eelis/ows";

// Colour per kitsendus category (catKey from /api/report) — matches the chips.
const CAT_COLOR: Record<string, string> = {
  looduskaitse: "#b42318", liik: "#92740b", elektri: "#7c3aed", gaas: "#7c3aed",
  side: "#7c3aed", tee: "#57534e", vesi: "#0e7490", muu: "#5b6b61",
};
const CAT_ET: Record<string, string> = {
  looduskaitse: "Looduskaitse", liik: "Kaitsealune liik", elektri: "Elektriliin",
  gaas: "Gaasitoru", side: "Sidevõrk", tee: "Tee", vesi: "Vesi", muu: "Muu",
};
// MapLibre "match" colour expression keyed on the feature's `cat` property.
const COLOR_EXPR = [
  "match", ["get", "cat"],
  ...Object.entries(CAT_COLOR).flatMap(([k, v]) => [k, v]),
  "#5b6b61",
] as unknown as maplibregl.ExpressionSpecification;

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
  const cat = String(f.properties?.cat ?? "");
  const label = String(f.properties?.label ?? "");
  new maplibregl.Popup({ closeButton: false })
    .setLngLat(e.lngLat)
    .setHTML(
      `<div style="font:12px system-ui"><b>${CAT_ET[cat] ?? cat}</b><br/>${label}</div>`,
    )
    .addTo(map);
}

function bboxOf(coords: number[][]): string {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  const padLon = (maxLon - minLon) * 0.6 + 0.002;
  const padLat = (maxLat - minLat) * 0.6 + 0.002;
  return `${minLon - padLon},${minLat - padLat},${maxLon + padLon},${maxLat + padLat},EPSG:4326`;
}

export default function ParcelMap({ report }: { report: ParcelReport }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [kaitsealad, setKaitsealad] = useState<string[]>([]);
  const [kaDone, setKaDone] = useState(false); // EELIS kaitseala fetch finished?
  const [cats, setCats] = useState<string[]>([]);

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
      // Protected areas (kaitseala) overlapping the parcel's area — live from EELIS.
      const bbox = bboxOf(report.geometry.coordinates[0]);
      const url =
        `${EELIS_WFS}?service=WFS&version=1.0.0&request=GetFeature` +
        `&typeName=eelis:kr_kaitseala&srsName=EPSG:4326&outputFormat=application/json` +
        `&maxFeatures=50&bbox=${encodeURIComponent(bbox)}`;

      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((fc: GeoJSON.FeatureCollection) => {
          setKaDone(true);
          if (!fc.features?.length || !mapRef.current) return;
          map.addSource("kaitseala", { type: "geojson", data: fc });
          map.addLayer(
            {
              id: "kaitseala-fill",
              type: "fill",
              source: "kaitseala",
              paint: { "fill-color": "#16a34a", "fill-opacity": 0.22 },
            },
            "parcel-fill"
          );
          map.addLayer(
            {
              id: "kaitseala-line",
              type: "line",
              source: "kaitseala",
              paint: { "line-color": "#15803d", "line-width": 1.5, "line-dasharray": [2, 1] },
            },
            "parcel-fill"
          );
          const names = Array.from(
            new Set(
              fc.features
                .map((f) => (f.properties?.nimi as string) ?? "")
                .filter(Boolean)
            )
          );
          setKaitsealad(names);
        })
        .catch(() => {
          /* overlay is optional — leave the map informational without it */
          setKaDone(true);
        });

      // All kitsendused (poles, power lines, water/road zones, species) — one
      // source, three type-filtered layers (polygon fill / line / point), each
      // coloured by category. Drawn under the parcel outline.
      const fc = kitsendusedFC(report);
      if (fc.features.length) {
        map.addSource("kitsendused", { type: "geojson", data: fc });
        map.addLayer({
          id: "kits-fill", type: "fill", source: "kitsendused",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": COLOR_EXPR, "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "kits-line", type: "line", source: "kitsendused",
          filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
          paint: { "line-color": COLOR_EXPR, "line-width": 3, "line-opacity": 0.85 },
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

      // Parcel boundary on top.
      map.addSource("parcel", {
        type: "geojson",
        data: { type: "Feature", geometry: report.geometry, properties: {} },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcel",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcel",
        paint: { "line-color": "#1d4ed8", "line-width": 3 },
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
          <span className="h-3 w-3 border-2 border-[#1d4ed8] bg-[#2563eb]/20" />
          Kinnistu
        </div>
        {/* Show the green kaitseala row only while checking, or once one is
            actually found. If the fetch finished and the parcel has no kaitseala
            nearby, drop the row entirely (no permanent "kontrollin…"). */}
        {(!kaDone || kaitsealad.length > 0) && (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 border border-[#15803d] bg-[#16a34a]/30" />
            {kaitsealad.length ? "Kaitseala" : "Kaitseala (kontrollin…)"}
          </div>
        )}
        {kaitsealad.map((n) => (
          <p key={n} className="mt-1 max-w-[14rem] text-[11px] leading-tight text-[#14130f]/60">
            {n}
          </p>
        ))}
        {cats.length > 0 && (
          <div className="mt-2 border-t border-black/10 pt-1.5">
            {cats.map((c) => (
              <div key={c} className="mt-1 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CAT_COLOR[c] ?? "#5b6b61" }}
                />
                {CAT_ET[c] ?? c}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
