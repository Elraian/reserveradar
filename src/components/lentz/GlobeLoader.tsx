"use client";

import { useEffect, useRef } from "react";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import { merge, mesh } from "topojson-client";

// Ported from the Claude Design "Globe Loader" handoff. A monochrome wireframe
// globe (real country borders from world-atlas) spins on a tilted axis, with
// three comet-trail "whirls" spiralling behind it. Tuned to the design's final
// values: spin 24°/s, line weight 0.75×, whirl 0.35, whirl spin 100°/s.

const CFG = {
  ink: "#1b1b18",
  spin: 24, // globe rotation, deg/sec
  weight: 0.75, // line-weight multiplier
  whirl: 0.35, // whirl intensity (0 = off)
  whirlSpin: 100, // whirl rotation, deg/sec
};

const ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function GlobeLoader({ size = 200 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = size;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const R = SIZE * 0.32; // sphere radius (64 at 200px)

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const projection = geoOrthographic()
      .scale(R)
      .translate([cx, cy])
      .clipAngle(90);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();
    const sphere = { type: "Sphere" } as const;

    let land: ReturnType<typeof merge> | null = null;
    let borders: ReturnType<typeof mesh> | null = null;

    let lambda = 30; // globe longitude
    let whirlA = 0; // whirl lead angle (radians)
    let last = performance.now();
    let raf = 0;
    let alive = true;

    function drawWhirl() {
      const k = CFG.whirl;
      if (k <= 0) return;
      const comets = 3;
      const segs = 44;
      const sweep = Math.PI * 1.05; // trail length
      const baseR = SIZE * 0.4;
      ctx!.lineCap = "round";
      for (let c = 0; c < comets; c++) {
        const head = whirlA + c * ((Math.PI * 2) / comets);
        for (let i = 0; i < segs; i++) {
          const f = i / (segs - 1); // 0 tail .. 1 head
          const a = head - sweep * (1 - f);
          const da = (sweep / segs) * 1.25;
          const r = baseR + (1 - f) * 7; // spirals outward toward tail
          const alpha = Math.pow(f, 1.7) * 0.42 * k;
          const lw = (0.4 + f * 2.6) * CFG.weight;
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, a, a + da);
          ctx!.strokeStyle = hexA(CFG.ink, alpha);
          ctx!.lineWidth = lw;
          ctx!.stroke();
        }
      }
      ctx!.lineCap = "butt";
    }

    function frame(now: number) {
      if (!alive) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      lambda += CFG.spin * dt;
      whirlA += ((CFG.whirlSpin * Math.PI) / 180) * dt;
      projection.rotate([lambda, -16, 0]);

      ctx!.clearRect(0, 0, SIZE, SIZE);

      // whirl behind the globe
      drawWhirl();

      const ink = CFG.ink;
      const w = CFG.weight;

      // sphere edge
      ctx!.beginPath();
      path(sphere);
      ctx!.strokeStyle = hexA(ink, 0.55);
      ctx!.lineWidth = 1.1 * w;
      ctx!.stroke();

      // graticule
      ctx!.beginPath();
      path(graticule);
      ctx!.strokeStyle = hexA(ink, 0.16);
      ctx!.lineWidth = 0.6 * w;
      ctx!.stroke();

      // land fill (very subtle) + country borders
      if (land) {
        ctx!.beginPath();
        path(land);
        ctx!.fillStyle = hexA(ink, 0.08);
        ctx!.fill();
      }
      if (borders) {
        ctx!.beginPath();
        path(borders);
        ctx!.strokeStyle = hexA(ink, 0.9);
        ctx!.lineWidth = 0.85 * w;
        ctx!.stroke();
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    fetch(ATLAS_URL)
      .then((r) => r.json())
      .then((world) => {
        if (!alive) return;
        const countries = world.objects.countries;
        land = merge(world, countries.geometries);
        borders = mesh(world, countries);
      })
      .catch((e) => console.warn("atlas load failed", e));

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Laadimine"
      role="img"
      style={{ width: size, height: size, display: "block" }}
    />
  );
}
