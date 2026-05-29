"use client";

import { useEffect, useRef } from "react";

// Ported from Claude Design "Reserve Radar / 02 Painterly Canopy".
// Domain-warped fbm canopy in cream + green; reveals painterly detail around
// the cursor and ripples outward on click.

const FRAG = `
precision highp float;
uniform vec2 u_res, u_mouse, u_click;
uniform float u_time, u_pres, u_radius, u_green, u_speed, u_clickT;

float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return s; }

void main(){
  vec2 q  = (gl_FragCoord.xy - 0.5*u_res)/u_res.y;
  vec2 m  = (u_mouse - 0.5*u_res)/u_res.y;
  vec2 cl = (u_click - 0.5*u_res)/u_res.y;
  float T = u_time*u_speed;

  float md = length(q-m);
  float infl = smoothstep(u_radius,0.0,md)*u_pres;
  float cd = length(q-cl);
  float front = u_clickT*0.85;
  float ringEnv = exp(-pow((cd-front)*4.5,2.0))*exp(-u_clickT*0.5);
  float ripple = ringEnv*(0.6+0.4*sin(cd*22.0-u_clickT*6.5));
  float wake = clamp(infl + ripple*1.1, 0.0, 1.4);

  vec3 cream=vec3(0.945,0.941,0.917);
  vec3 g1   =vec3(0.247,0.616,0.353);
  vec3 gD   =vec3(0.122,0.318,0.208);
  vec3 gL   =vec3(0.482,0.863,0.627);

  vec2 p = q*2.6;
  vec2 warp = vec2(fbm(p + vec2(0.0, T*0.07)), fbm(p + vec2(5.2, -T*0.05)));
  vec2 rdir = normalize(q - cl + 1e-4);
  warp += rdir*ringEnv*0.35;
  float canopy = fbm(p + warp*1.6 + vec2(T*0.025, 0.0));
  float fine   = fbm(p*3.4 + warp*2.2 - vec2(T*0.04, T*0.02));

  float edge = smoothstep(0.12, 0.72, length(q));

  vec3 col = cream;
  float mass   = smoothstep(0.34, 0.92, canopy);
  float detail = smoothstep(0.40, 0.74, fine);

  col = mix(col, mix(cream, g1, 0.55), mass*0.15*mix(0.55,1.0,clamp(u_green,0.0,1.0))*mix(0.5,1.0,edge));
  col = mix(col, gD, mass*wake*0.55*u_green);
  col = mix(col, gL, detail*wake*0.40*u_green*mix(0.7,1.0,edge));
  col = mix(col, gL, infl*0.10);

  float veil = smoothstep(0.52,0.0,length(q*vec2(0.72,1.0)));
  col = mix(col, cream, veil*0.40);

  float gr = (hash21(gl_FragCoord.xy*0.7)-0.5)*0.012;
  col += gr;
  gl_FragColor = vec4(col,1.0);
}
`;

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";

export default function PainterlyCanopy({
  radius = 0.35,
  green = 1.0,
  speed = 1.0,
}: {
  radius?: number;
  green?: number;
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return;

    let u: Record<string, WebGLUniformLocation | null> = {};

    // Build (or rebuild, after a context-loss) the GL program + geometry.
    const buildGL = () => {
      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          console.error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(pl);
      gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);

      const U = (n: string) => gl.getUniformLocation(prog, n);
      u = {
        res: U("u_res"), time: U("u_time"), mouse: U("u_mouse"), pres: U("u_pres"),
        radius: U("u_radius"), green: U("u_green"), speed: U("u_speed"),
        click: U("u_click"), clickT: U("u_clickT"),
      };
    };
    buildGL();

    let DPR = 1, W = 1, H = 1;
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 1.75);
      W = Math.max(1, Math.floor(cv.clientWidth * DPR));
      H = Math.max(1, Math.floor(cv.clientHeight * DPR));
      cv.width = W; cv.height = H;
      gl.viewport(0, 0, W, H);
    };
    window.addEventListener("resize", resize);

    let tcur = 0, last = performance.now();
    let mx = 0, my = 0, tmx = 0, tmy = 0, lastMove = -10, pres = 0;
    let clX = 0, clY = 0, clT = -100;

    // Listen on the window so the canopy reacts even when the cursor is over
    // the hero content layered above the canvas.
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      tmx = (e.clientX - r.left) * DPR;
      tmy = (r.height - (e.clientY - r.top)) * DPR;
      lastMove = tcur;
    };
    window.addEventListener("pointermove", onMove);

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rfac = reduce ? 0.18 : 1.0;

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; tcur += dt;
      mx += (tmx - mx) * 0.12; my += (tmy - my) * 0.12;
      const pt = tcur - lastMove < 1.8 ? 1 : 0;
      pres += (pt - pres) * (pt > pres ? 0.07 : 0.02);
      gl.uniform2f(u.res, W, H);
      gl.uniform1f(u.time, tcur);
      gl.uniform2f(u.mouse, mx, my);
      gl.uniform1f(u.pres, pres);
      gl.uniform1f(u.radius, radius);
      gl.uniform1f(u.green, green);
      gl.uniform1f(u.speed, speed * rfac);
      gl.uniform2f(u.click, clX, clY);
      gl.uniform1f(u.clickT, tcur - clT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    resize();
    tmx = mx = W / 2; tmy = my = H / 2;
    raf = requestAnimationFrame(frame);

    // Auto-recover if the GPU drops the context (instead of the browser's
    // "WebGL hit a snag" placeholder).
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); };
    const onRestored = () => { buildGL(); resize(); last = performance.now(); raf = requestAnimationFrame(frame); };
    cv.addEventListener("webglcontextlost", onLost);
    cv.addEventListener("webglcontextrestored", onRestored);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      cv.removeEventListener("webglcontextlost", onLost);
      cv.removeEventListener("webglcontextrestored", onRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [radius, green, speed]);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 block h-full w-full" />;
}
