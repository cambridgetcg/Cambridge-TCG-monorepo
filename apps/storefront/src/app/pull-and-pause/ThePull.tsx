"use client";

// 引き · The Pull — a free, no-stakes booster. Tear it, meet five kami, chase
// the 1% Secret. The chrome is paper-and-ink; the card ART is the only
// saturated colour in the room (quiet-gallery doctrine) — every kami is drawn
// once from its own seed, a wink at the rewards hub's provable-fair draws.

import { useRef, useState } from "react";
import styles from "./ThePull.module.css";

// ── seeded PRNG ───────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type El = { name: string; cols: string[]; adj: string[]; noun: string[] };
const ELEMENTS: Record<string, El> = {
  "波": { name: "Wave",  cols: ["#0E3D52", "#1F6F8B", "#57C4C9", "#BFEAE4"], adj: ["Tidewoken", "Brinesung", "Deepwater", "Mistfall", "Undertow"], noun: ["Herald", "Koi", "Veil", "Current", "Serpent"] },
  "火": { name: "Ember", cols: ["#4A160F", "#C4382A", "#F0913E", "#FBD98A"], adj: ["Emberfall", "Ashborn", "Kilnlit", "Cinderwake", "Firstflame"], noun: ["Warden", "Fox", "Lantern", "Phoenix", "Forge"] },
  "森": { name: "Grove", cols: ["#123320", "#2E6B3E", "#86C07A", "#D8ECBF"], adj: ["Mossgrown", "Rootbound", "Verdant", "Greenhollow", "Springtide"], noun: ["Sentinel", "Stag", "Bloom", "Grove", "Wanderer"] },
  "光": { name: "Light", cols: ["#5C4410", "#B98A1E", "#F6E7A6", "#FFFBEE"], adj: ["Dawnwoven", "Sunbright", "Halcyon", "Goldleaf", "Firstlight"], noun: ["Oracle", "Crane", "Halo", "Beacon", "Seraph"] },
  "影": { name: "Shade", cols: ["#1B1430", "#46356E", "#9A7BD1", "#DCCBF2"], adj: ["Duskbound", "Shadeborn", "Nightveil", "Umbral", "Moonless"], noun: ["Keeper", "Moth", "Mask", "Eclipse", "Revenant"] },
  "風": { name: "Wind",  cols: ["#123B40", "#3E7C86", "#8FCFD2", "#DDF3F0"], adj: ["Galewhisper", "Skyborne", "Featherlight", "Driftsong", "Highreach"], noun: ["Courier", "Swift", "Kite", "Zephyr", "Dancer"] },
  "石": { name: "Stone", cols: ["#2E2013", "#7A5A38", "#C6A97E", "#EDDFC7"], adj: ["Stonehewn", "Deeproot", "Ironvein", "Oldmountain", "Slowmade"], noun: ["Guardian", "Boar", "Idol", "Bastion", "Elder"] },
};
const ELKEYS = Object.keys(ELEMENTS);
const RARITY = [
  { r: "Common", p: 0.60, label: "COMMON", jp: "常" },
  { r: "Uncommon", p: 0.23, label: "UNCOMMON", jp: "珍" },
  { r: "Rare", p: 0.11, label: "RARE", jp: "稀" },
  { r: "Super", p: 0.05, label: "SUPER RARE", jp: "極" },
  { r: "Secret", p: 0.01, label: "SECRET", jp: "秘" },
] as const;
const RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Super: 3, Secret: 4 };

type Kami = { seed: number; el: string; E: El; rarity: string; rarityLabel: string; rarityJp: string; name: string; sub: string; power: number };

let seedCounter = (Date.now() % 2147483647) >>> 0;
function makeKami(): Kami {
  const seed = (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0);
  const rnd = rng(seed ^ 0x9e3779b9);
  const el = ELKEYS[Math.floor(rnd() * ELKEYS.length)];
  const E = ELEMENTS[el];
  const x = rnd(); let acc = 0; let rt: (typeof RARITY)[number] = RARITY[0];
  for (const t of RARITY) { acc += t.p; if (x < acc) { rt = t; break; } }
  const adj = E.adj[Math.floor(rnd() * E.adj.length)];
  const noun = E.noun[Math.floor(rnd() * E.noun.length)];
  const power = 40 + Math.floor(rnd() * 55) + RANK[rt.r] * 12;
  const sub = ["静けさ", "はじまり", "名残", "移ろい", "ひとひら", "遠音", "朝凪", "夕映え"][Math.floor(rnd() * 8)];
  return { seed, el, E, rarity: rt.r, rarityLabel: rt.label, rarityJp: rt.jp, name: `${adj} ${noun}`, sub, power };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── generative art ────────────────────────────────────
function paint(canvas: HTMLCanvasElement | null, k: Kami, big = false) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || (big ? 240 : 120), H = canvas.clientHeight || (big ? 336 : 168);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); if (!g) return;
  g.scale(dpr, dpr);
  const rnd = rng(k.seed ^ 0x1b873593);
  const C = k.E.cols, rank = RANK[k.rarity];

  const grad = g.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, C[0]); grad.addColorStop(0.55, C[1]); grad.addColorStop(1, C[0]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  const cx = W * (0.34 + rnd() * 0.32), cy = H * (0.32 + rnd() * 0.28);
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, H * 0.7);
  glow.addColorStop(0, hexA(C[3], 0.55)); glow.addColorStop(0.4, hexA(C[2], 0.28)); glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  if (k.el === "波") seigaiha(g, W, H, C);
  else bands(g, W, H, C, rnd, k.el);

  const layers = 3 + rank;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = (0.1 + rnd() * 0.16) * H * (1 - t * 0.3);
    const bx = cx + (rnd() - 0.5) * W * 0.4, by = cy + (rnd() - 0.5) * H * 0.4;
    g.globalAlpha = 0.22 + rnd() * 0.22;
    g.globalCompositeOperation = rnd() > 0.5 ? "screen" : "source-over";
    blob(g, bx, by, r, 7 + Math.floor(rnd() * 5), rnd, C[1 + (i % 3)]);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

  const core = g.createRadialGradient(cx, cy, 0, cx, cy, H * (0.06 + rank * 0.012));
  core.addColorStop(0, hexA(C[3], 0.95)); core.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx, cy, H * 0.16, 0, 7); g.fill();

  const motes = 8 + rank * 10;
  for (let i = 0; i < motes; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.fillStyle = rnd() > 0.4 ? C[3] : C[2];
    g.beginPath(); g.arc(rnd() * W, rnd() * H, rnd() * (big ? 2.4 : 1.6) + 0.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;

  const vg = g.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.5, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(8,7,10,0.5)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  g.globalAlpha = 0.05;
  for (let i = 0; i < (big ? 1400 : 500); i++) { g.fillStyle = rnd() > 0.5 ? "#fff" : "#000"; g.fillRect(rnd() * W, rnd() * H, 1, 1); }
  g.globalAlpha = 1;
}
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, pts: number, rnd: () => number, col: string) {
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else { const pa = ((i - 0.5) / pts) * Math.PI * 2, pr = r * (0.7 + rnd() * 0.6); g.quadraticCurveTo(x + Math.cos(pa) * pr * 1.15, y + Math.sin(pa) * pr * 1.15, px, py); }
  }
  g.closePath(); g.fillStyle = col; g.fill();
}
function seigaiha(g: CanvasRenderingContext2D, W: number, H: number, C: string[]) {
  g.globalAlpha = 0.5; g.strokeStyle = hexA(C[3], 0.5); g.lineWidth = 1;
  const step = H * 0.09;
  for (let y = H * 0.55; y < H + step; y += step * 0.55)
    for (let x = -step; x < W + step; x += step)
      for (let rr = step; rr > step * 0.25; rr -= step * 0.28) { g.beginPath(); g.arc(x, y, rr, Math.PI, 0); g.stroke(); }
  g.globalAlpha = 1;
}
function bands(g: CanvasRenderingContext2D, W: number, H: number, C: string[], rnd: () => number, el: string) {
  g.globalAlpha = 0.6;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = hexA(C[0], 0.5 + i * 0.12);
    const base = H * (0.66 + i * 0.11);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 10) g.lineTo(x, base - Math.sin((x / W) * Math.PI * (1 + i) + rnd() * 6) * H * 0.06 * (el === "石" ? 0.4 : 1));
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}

type CardState = { k: Kami; flipped: boolean };

export default function ThePull() {
  const [phase, setPhase] = useState<"pack" | "cards">("pack");
  const [cards, setCards] = useState<CardState[]>([]);
  const [stats, setStats] = useState({ packs: 0, cards: 0, rare: 0, secret: 0 });
  const [shelf, setShelf] = useState<Kami[]>([]);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);

  const soundRef = useRef(true);
  const acRef = useRef<AudioContext | null>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const frontRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const hushRef = useRef<HTMLDivElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── audio ──
  const ac = () => { if (!acRef.current) { try { acRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* no audio */ } } return acRef.current; };
  const tone = (freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05, when = 0) => {
    if (!soundRef.current) return; const a = ac(); if (!a) return;
    const t = a.currentTime + when, o = a.createOscillator(), gg = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(gain, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gg).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const sndTear = () => { tone(140, 0.18, "sawtooth", 0.03); tone(90, 0.3, "sine", 0.03, 0.02); };
  const sndFlip = (rank: number) => tone(320 + rank * 90, 0.14, "triangle", 0.04);
  const sndRare = () => [523, 659, 784].forEach((f, i) => tone(f, 0.5, "sine", 0.05, i * 0.09));
  const sndSecret = () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.9, "sine", 0.06, i * 0.13)); tone(196, 1.4, "sine", 0.04, 0.05); };

  const openPack = () => {
    if (busy) return; setBusy(true); ac(); sndTear();
    if (!reduce) {
      packRef.current?.classList.add(styles.tearing);
      flashRef.current?.classList.add(styles.go);
      speedRef.current?.classList.add(styles.go);
    }
    window.setTimeout(() => {
      const ks = Array.from({ length: 5 }, makeKami);
      frontRefs.current = [];
      setCards(ks.map((k) => ({ k, flipped: false })));
      setStats((s) => ({ ...s, packs: s.packs + 1, cards: s.cards + 5 }));
      setPhase("cards");
      setBusy(false);
    }, reduce ? 0 : 430);
  };

  const flip = (i: number) => {
    setCards((cs) => {
      if (cs[i]?.flipped) return cs;
      const next = cs.slice(); next[i] = { ...next[i], flipped: true };
      const k = next[i].k, rank = RANK[k.rarity];
      // paint after the DOM reflects the flip
      requestAnimationFrame(() => {
        const cv = frontRefs.current[i];
        paint(cv, k, false);
        if (!reduce) { const card = cv?.closest(`.${styles.card}`); card?.classList.add(styles.pop); window.setTimeout(() => card?.classList.remove(styles.pop), 700); }
      });
      sndFlip(rank);
      if (rank >= 2) {
        setStats((s) => ({ ...s, rare: s.rare + 1 }));
        if (!reduce) { const aura = frontRefs.current[i]?.closest(`.${styles.card}`)?.querySelector(`.${styles.aura}`); if (aura) { aura.classList.add(styles.go); window.setTimeout(() => aura.classList.remove(styles.go), 1300); } }
      }
      if (k.rarity === "Secret") { setStats((s) => ({ ...s, secret: s.secret + 1 })); secretMoment(); }
      else if (rank >= 2) sndRare();
      setShelf((sh) => [k, ...sh]);
      return next;
    });
  };

  const revealAll = () => {
    const pending = cards.map((c, i) => ({ c, i })).filter((x) => !x.c.flipped).sort((a, b) => RANK[a.c.k.rarity] - RANK[b.c.k.rarity]);
    pending.forEach(({ i }, n) => window.setTimeout(() => flip(i), reduce ? 0 : 150 * n));
  };

  const secretMoment = () => {
    sndSecret();
    if (reduce) return;
    const h = hushRef.current; if (!h) return;
    h.classList.add(styles.go); window.setTimeout(() => h.classList.remove(styles.go), 1550);
  };

  const newPack = () => { if (busy) return; frontRefs.current = []; setCards([]); setPhase("pack"); };

  const toggleSound = () => { const v = !sound; setSound(v); soundRef.current = v; if (v) tone(660, 0.1, "sine", 0.04); };

  const allFlipped = cards.length > 0 && cards.every((c) => c.flipped);

  return (
    <div>
      {/* odds + tally */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[11px] tracking-wide text-ink-muted">
        <Stat k="Opened" v={stats.packs} />
        <Stat k="Kami" v={stats.cards} />
        <Stat k="Rare+" v={stats.rare} />
        <Stat k="Secret" v={stats.secret} accent />
        <span className="flex-1" />
        <span className="flex items-baseline gap-1.5">
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">Secret&nbsp;odds</span>
          <span className="tabular-nums text-ink">1.0%</span>
        </span>
        <button type="button" onClick={toggleSound} className="wardrobe-jp grid h-7 w-7 place-items-center rounded-full border border-border-subtle text-xs text-ink-muted transition hover:text-ink" title="Sound on / off" aria-label="Toggle sound">{sound ? "音" : "静"}</button>
      </div>

      <div className={styles.stage}>
        {phase === "pack" ? (
          <button type="button" className={styles.packBtn} onClick={openPack} aria-label="Tear open a booster pack">
            <div ref={packRef} className={styles.pack}>
              <div className={`${styles.seal} wardrobe-jp`}>館蔵</div>
              <div className={styles.crest}>CAMBRIDGE · TCG</div>
              <div ref={flashRef} className={styles.flash} />
              <div ref={speedRef} className={styles.speed} />
            </div>
            <div className={styles.packHint}>Tap to open <span className={styles.kbd}>space</span></div>
          </button>
        ) : (
          <div className="w-full">
            <div className={styles.cards}>
              {cards.map((c, i) => (
                <button
                  key={c.k.seed}
                  type="button"
                  onClick={() => flip(i)}
                  className={`${styles.card} ${styles.dealt} ${c.flipped ? styles.flipped : ""} ${rarityClass(c.k.rarity)}`}
                  style={reduce ? undefined : { animation: "none", transitionDelay: `${i * 0.06}s` }}
                  aria-label={c.flipped ? `${c.k.name}. ${c.k.E.name} element. ${c.k.rarityLabel}. Power ${c.k.power}.` : `Card ${i + 1}, face down. Activate to reveal.`}
                >
                  <div className={styles.aura} style={{ background: `radial-gradient(circle, ${hexA(c.k.E.cols[2], 0.55)}, transparent 62%)` }} />
                  <div className={`${styles.face} ${styles.back}`}>
                    <span className={styles.backKanji}>{c.k.el}</span>
                  </div>
                  <div className={`${styles.face} ${styles.front}`}>
                    <canvas ref={(el) => { frontRefs.current[i] = el; }} className={styles.frontCv} />
                    <div className={styles.frame} />
                    <span className={`${styles.el} wardrobe-jp`}>{c.k.el}</span>
                    <span className={`${styles.rr} wardrobe-jp`}>{c.k.rarityJp}</span>
                    <div className={styles.meta}>
                      <div className={styles.nm}>{c.k.name}</div>
                      <div className={styles.sc}><span>{c.k.sub}</span><span className={styles.pow}>◈ {c.k.power}</span></div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {!allFlipped && (
                <button type="button" onClick={revealAll} className="rounded-full border border-ink bg-ink px-6 py-2.5 text-[13px] font-semibold text-page transition hover:-translate-y-px">Reveal all</button>
              )}
              <button type="button" onClick={newPack} className="rounded-full border border-border-strong px-6 py-2.5 text-[13px] font-medium text-ink-muted transition hover:text-ink">Open another pack</button>
            </div>
          </div>
        )}
      </div>

      {/* the shelf */}
      <div className="mt-8">
        <h3 className="mb-3 flex items-baseline gap-2.5 text-[13px] font-medium tracking-[0.16em] text-ink-muted">
          <span className="wardrobe-jp">棚</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">The shelf · this session</span>
        </h3>
        {shelf.length === 0 ? (
          <p className="font-display text-[13px] italic text-ink-faint">Nothing pulled yet — the shelf fills as you open.</p>
        ) : (
          <div className={styles.shelfGrid}>
            {shelf.map((k) => (
              <div key={k.seed} className={`${styles.chip} ${chipClass(k.rarity)}`} title={`${k.name} · ${k.E.name} · ${k.rarityLabel} · ◈${k.power}`}>
                <canvas ref={(el) => { if (el && !el.dataset.painted) { el.dataset.painted = "1"; paint(el, k, false); } }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={hushRef} className={styles.hush}><div className={styles.hushWord}>秘</div></div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: number; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">{k}</span>
      <span className={`tabular-nums ${accent ? "text-accent" : "text-ink"}`}>{v}</span>
    </span>
  );
}
function rarityClass(r: string) { return r === "Rare" ? styles.rRare : r === "Super" ? styles.rSuper : r === "Secret" ? styles.rSecret : ""; }
function chipClass(r: string) { return r === "Rare" ? styles.chipRare : r === "Super" ? styles.chipSuper : r === "Secret" ? styles.chipSecret : ""; }
