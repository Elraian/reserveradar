"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ParcelReport } from "@/app/_data/sampleReport";

const EELIS_WFS = "https://gsavalik.envir.ee/geoserver/eelis/ows";

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
        });

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
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 border border-[#15803d] bg-[#16a34a]/30" />
          {kaitsealad.length ? "Kaitseala" : "Kaitseala (kontrollin…)"}
        </div>
        {kaitsealad.map((n) => (
          <p key={n} className="mt-1 max-w-[14rem] text-[11px] leading-tight text-[#14130f]/60">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}
