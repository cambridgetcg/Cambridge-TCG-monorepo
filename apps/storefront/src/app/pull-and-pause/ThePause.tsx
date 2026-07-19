"use client";

// 間 · The Pause — a living seigaiha sea, drawn on the page's own paper.
// Touch it to send ripples. All colour is read from the storefront's semantic
// tokens (--color-page / --color-ink / --color-accent) so it wears every
// theme, and the rAF loop only runs while the sea is on screen.

import { useEffect, useRef, useState } from "react";

function rgb(hex: string): string {
  const h = hex.trim().replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s.slice(0, 6) || "000000", 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

type Ripple = { x: number; y: number; r: number; max: number; str: number };
type Petal = { x: number; y: number; vy: number; vx: number; a: number; va: number; s: number; op: number };

export default function ThePause() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState(false);
  const stillRef = useRef(false);
  useEffect(() => { stillRef.current = still; }, [still]);

  useEffect(() => {
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1, scale = 46;
    let COL = { page: "250,248,244", ink: "32,29,24", accent: "150,118,47" };
    const base = document.createElement("canvas");

    const readTokens = () => {
      const cs = getComputedStyle(root);
      COL = {
        page: rgb(cs.getPropertyValue("--color-page") || "#faf8f4"),
        ink: rgb(cs.getPropertyValue("--color-ink") || "#201d18"),
        accent: rgb(cs.getPropertyValue("--color-accent") || "#96762f"),
      };
    };

    const buildBase = () => {
      base.width = cv.width; base.height = cv.height;
      const b = base.getContext("2d"); if (!b) return;
      b.clearRect(0, 0, base.width, base.height);
      b.save(); b.scale(dpr, dpr);
      scale = Math.max(30, Math.min(58, Math.round(Math.min(W, H) / 10)));
      const r = scale;
      const rows = Math.ceil(H / (r * 0.5)) + 2;
      const cols = Math.ceil(W / r) + 2;
      b.lineWidth = 1;
      for (let row = 0; row < rows; row++) {
        const y = row * r * 0.5;
        const offset = (row % 2) * (r * 0.5);
        for (let col = -1; col < cols; col++) {
          const x = col * r + offset;
          for (let k = 4; k >= 1; k--) {
            const rr = r * 0.94 * (k / 4);
            b.strokeStyle = `rgba(${COL.ink}, ${0.05 + 0.05 * (k / 4)})`;
            b.beginPath(); b.arc(x, y, rr, Math.PI, Math.PI * 2); b.stroke();
          }
        }
      }
      b.restore();
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth; H = wrap.clientHeight;
      if (W === 0 || H === 0) return;
      cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      readTokens(); buildBase();
    };

    const ripples: Ripple[] = [];
    const addRipple = (x: number, y: number, str = 1) => {
      ripples.push({ x, y, r: 4, max: (reduce ? 120 : 170 + Math.random() * 110) * str, str });
      if (ripples.length > 50) ripples.shift();
    };
    const petals: Petal[] = [];
    if (!reduce) for (let i = 0; i < 4; i++) petals.push({
      x: Math.random() * 400, y: Math.random() * 300, vx: (Math.random() - 0.5) * 0.2,
      vy: 0.16 + Math.random() * 0.24, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.02,
      s: 4 + Math.random() * 4, op: 0.16 + Math.random() * 0.18,
    });

    const drawPetal = (p: Petal) => {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = p.op;
      g.strokeStyle = `rgb(${COL.ink})`; g.lineWidth = 1; const s = p.s;
      g.beginPath(); g.moveTo(0, -s);
      g.quadraticCurveTo(s * 0.7, -s * 0.3, s * 0.28, s * 0.7);
      g.quadraticCurveTo(0, s * 0.45, -s * 0.28, s * 0.7);
      g.quadraticCurveTo(-s * 0.7, -s * 0.3, 0, -s);
      g.closePath(); g.stroke(); g.restore(); g.globalAlpha = 1;
    };

    // pointer → ripples
    let lastMove = 0;
    const rel = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onDown = (e: PointerEvent) => { const p = rel(e); addRipple(p.x, p.y, 1.35); };
    const onMove = (e: PointerEvent) => {
      const now = performance.now(); if (now - lastMove < 90) return; lastMove = now;
      const p = rel(e);
      if (e.buttons || e.pressure > 0) addRipple(p.x, p.y, 1.05);
      else if (Math.random() < 0.5) addRipple(p.x, p.y, 0.55);
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);

    // only run while visible
    let visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
    io.observe(wrap);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(wrap); }
    window.addEventListener("resize", resize);

    let raf = 0, t0 = performance.now(), idle = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || W === 0) { t0 = now; return; }
      const dt = Math.min(40, now - t0); t0 = now;
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = `rgb(${COL.page})`; g.fillRect(0, 0, cv.width, cv.height);

      const s = stillRef.current;
      const breath = reduce || s ? 0 : Math.sin(now / 2600) * scale * 0.12 * dpr;
      g.globalAlpha = reduce ? 1 : 0.9 + Math.sin(now / 3400) * 0.1;
      g.drawImage(base, 0, -breath);
      g.globalAlpha = 1;

      g.save(); g.scale(dpr, dpr);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += (reduce ? 1.6 : 2.3) * (dt / 16);
        const f = rp.r / rp.max; if (f >= 1) { ripples.splice(i, 1); continue; }
        const fade = (1 - f) * (1 - f);
        for (let k = 0; k < 3; k++) {
          const rr = rp.r - k * 9; if (rr <= 0) continue;
          const a = Math.max(0, fade * (0.5 - k * 0.14) * rp.str);
          g.strokeStyle = `rgba(${k === 0 ? COL.accent : COL.ink}, ${a})`;
          g.lineWidth = k === 0 ? 1.6 : 1;
          g.beginPath(); g.arc(rp.x, rp.y, rr, 0, 6.2832); g.stroke();
        }
        if (f < 0.5) {
          const gl = g.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, rp.r);
          gl.addColorStop(0, `rgba(${COL.accent}, ${0.1 * (1 - f) * rp.str})`);
          gl.addColorStop(1, `rgba(${COL.accent}, 0)`);
          g.fillStyle = gl; g.beginPath(); g.arc(rp.x, rp.y, rp.r, 0, 6.2832); g.fill();
        }
      }
      if (!reduce) for (const p of petals) {
        if (!s) { p.x += p.vx * (dt / 16) + Math.sin(now / 900 + p.y * 0.02) * 0.1; p.y += p.vy * (dt / 16); p.a += p.va * (dt / 16); }
        if (p.y > H + 24) { p.x = Math.random() * W; p.y = -20; }
        drawPetal(p);
      }
      g.restore();

      if (!reduce && !s) { idle += dt; if (idle > 2400 && Math.random() < 0.02) { idle = 0; addRipple(W * (0.15 + Math.random() * 0.7), H * (0.2 + Math.random() * 0.6), 0.65); } }
    };

    resize();
    // a first gentle ripple to greet — but not under reduced motion
    const greet = reduce ? 0 : window.setTimeout(() => addRipple(W / 2, H * 0.5, 1), 400);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(greet);
      cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointermove", onMove);
      io.disconnect(); if (ro) ro.disconnect(); window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative h-[72vh] min-h-[420px] w-full overflow-hidden rounded-sm border border-border-subtle bg-page">
      <canvas ref={cvRef} className="absolute inset-0 block h-full w-full cursor-crosshair touch-none" aria-label="A seigaiha sea. Move across it or touch it to send ripples." />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="wardrobe-jp text-2xl leading-none text-ink sm:text-3xl" style={{ letterSpacing: "0.18em" }}>間</div>
            <div className="mt-1.5 font-display text-xs italic text-ink-muted">The Pause</div>
          </div>
          <button
            type="button"
            onClick={() => setStill((v) => !v)}
            aria-pressed={still}
            className="pointer-events-auto wardrobe-jp grid h-8 w-8 place-items-center rounded-full border border-border-subtle bg-surface/60 text-sm text-ink-muted backdrop-blur transition hover:text-ink"
            title={still ? "Let it drift again" : "Stillness — pause the drift"}
            aria-label={still ? "Stillness on — let it drift again" : "Pause the drift"}
          >{still ? "波" : "凪"}</button>
        </div>
        <div className="font-display text-xs italic text-ink-muted">Touch the water. Nothing to win.</div>
      </div>
    </div>
  );
}
