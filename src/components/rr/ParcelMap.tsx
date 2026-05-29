"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AreaOverlay, Category, ParcelResult } from "@/lib/types";

// Category fill colours (hex — MapLibre paint can't read CSS vars). Mirror the
// light-theme --cat-* tokens so the map and the chips agree.
const CAT_HEX: Record<Category, string> = {
  protection: "#b42318",
  zone: "#b45309",
  natura: "#1d4ed8",
  species: "#92740b",
  benefit: "#15803d",
  water: "#0e7490",
  hazard: "#475467",
  forest: "#15803d",
  heritage: "#5b6b61",
  utility: "#7c3aed",
  road: "#57534e",
  info: "#5b6b61",
};

const FOREST = "#1b7a43";

// Calm light basemap — CARTO Positron raster (free, keyless, OSM-derived).
// A neutral canvas so the green parcel + tinted overlays carry the meaning.
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap · © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

type Bounds = [[number, number], [number, number]];

function extendBounds(b: Bounds | null, coords: number[][][]): Bounds | null {
  let out = b;
  for (const ring of coords) {
    for (const [lng, lat] of ring) {
      if (!out) out = [[lng, lat], [lng, lat]];
      else {
        out[0][0] = Math.min(out[0][0], lng);
        out[0][1] = Math.min(out[0][1], lat);
        out[1][0] = Math.max(out[1][0], lng);
        out[1][1] = Math.max(out[1][1], lat);
      }
    }
  }
  return out;
}

function geomBounds(geom: ParcelResult["geometry"]): Bounds | null {
  if (!geom) return null;
  if (geom.type === "Polygon") return extendBounds(null, geom.coordinates);
  let b: Bounds | null = null;
  for (const poly of geom.coordinates) b = extendBounds(b, poly);
  return b;
}

function overlayFeatureCollection(areas: AreaOverlay[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of areas) {
    if (!a.geometry) continue;
    features.push({
      type: "Feature",
      geometry: a.geometry,
      properties: { color: CAT_HEX[a.category] ?? CAT_HEX.info },
    });
  }
  return { type: "FeatureCollection", features };
}

export function ParcelMap({ parcel }: { parcel: ParcelResult }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<ParcelResult | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [25.5, 58.7], // Estonia
      zoom: 6.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // Overlay fills (under the parcel outline).
      map.addSource("overlays", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "overlay-fill",
        type: "fill",
        source: "overlays",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "overlay-line",
        type: "line",
        source: "overlays",
        paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.5 },
      });

      // Parcel polygon (on top, bold forest outline).
      map.addSource("parcel", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcel",
        paint: { "fill-color": FOREST, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcel",
        paint: { "line-color": FOREST, "line-width": 2.5 },
      });

      readyRef.current = true;
      if (pendingRef.current) {
        applyData(map, pendingRef.current);
        pendingRef.current = null;
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Push parcel data whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) {
      pendingRef.current = parcel;
      return;
    }
    applyData(map, parcel);
  }, [parcel]);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
    </div>
  );
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function applyData(map: MlMap, parcel: ParcelResult) {
  const overlays = map.getSource("overlays") as maplibregl.GeoJSONSource | undefined;
  const parcelSrc = map.getSource("parcel") as maplibregl.GeoJSONSource | undefined;
  if (!overlays || !parcelSrc) return;

  overlays.setData(overlayFeatureCollection(parcel.areas ?? []));

  if (parcel.geometry) {
    parcelSrc.setData({
      type: "Feature",
      geometry: parcel.geometry,
      properties: {},
    });
    const b = geomBounds(parcel.geometry);
    if (b) {
      map.fitBounds(b, { padding: 56, maxZoom: 16, duration: 700 });
    }
  } else {
    parcelSrc.setData(emptyFC());
  }
}
