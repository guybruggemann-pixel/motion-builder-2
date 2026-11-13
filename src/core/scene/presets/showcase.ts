/**
 * Builders for the second reference set: floating cards, a diagonal card trail, a SaaS-style
 * sentence (word by word with a camera follow, gradient words, glow blobs, a cursor click and a
 * counter pill with pulse rings), a box poster of squashed words, and squiggle overlays.
 * All plain Text / Shape layers with keys, Phases and seeded noise; pure and deterministic.
 */
import type { Network, Node, Param, SceneDoc } from "../schema";
import { ADV, CAP, Net, phase, rect, rng, text } from "./kinetic";

const P = (value: unknown, extra: Partial<Param> = {}): Param => ({ value: value as Param["value"], ...extra });
const r2 = (v: number) => Math.round(v * 100) / 100;
type K = { t: number; v: unknown; ease: string };
const keyed = (value: unknown, keys: K[]): Param => ({ value: value as never, keys: keys.map((k) => ({ ...k, t: r2(k.t), v: k.v as never })) });
const noise = (amplitude: number, frequency: number, seed: number) => ({ id: `n${seed}`, type: "noise" as const, enabled: true, blend: "add" as const, params: { amplitude, frequency, seed } });

const docOf = (name: string, main: Network, extra: Network[] = []): SceneDoc => ({ version: 3, name, root: "main", source: { kind: "blank" }, assets: [], batches: [], networks: [main, ...extra] }) as SceneDoc;
const comp = (width: number, height: number, duration: number, background = "#000000") => ({ width, height, fps: 25, duration, background }) as Network["comp"];

/* ---------- A: floating cards ---------- */

export interface CardsOptions { width: number; height: number; duration: number; count: number; tilt: number; drift: number; background: string; colors: string[]; labels: string[] }
export const CARDS_DEFAULTS: CardsOptions = {
  width: 1440, height: 1080, duration: 9, count: 14, tilt: 25, drift: 0.6, background: "#000000",
  colors: ["#0B0B0B", "#E8E2D4", "#B9BBBE", "#2F3A1E", "#C9D6E8", "#3A3A3A", "#1C1C1C"],
  labels: ["100th", "MatterJS", "Osmo *", "Stop Motion", "Smooth Scroll", "", ""],
};

/** Rounded cards share periodic position/rotation with their labels; one full orbit per span. */
export function floatingCards(opts: Partial<CardsOptions> = {}, name = "Floating cards"): SceneDoc {
  const o = { ...CARDS_DEFAULTS, ...opts };
  const { width: W, height: H } = o;
  const n = new Net("main", "Main_v01");
  const r = rng(7);
  const travelY = H * o.drift, travelX = W * o.drift * 0.35;
  for (let i = 0; i < o.count; i++) {
    const depth = 0.75 + r() * 0.5; // closer cards are bigger
    const w = r2(W * 0.24 * depth), h = r2(w * 0.62);
    const x = r2((i % 4) * (W / 3.4) + (r() - 0.3) * W * 0.12 - w * 0.2);
    const y = r2(Math.floor(i / 4) * (H + travelY) / Math.ceil(o.count / 4) + (r() - 0.5) * H * 0.1);
    const fill = o.colors[i % o.colors.length]!;
    const phaseAngle = i * 47;
    const drift = (axis: string, amplitude: number, phase: number) => ({ id: `drift-${axis}`, type: "wave" as const, enabled: true, blend: "add" as const, params: { amplitude, frequency: 1 / o.duration, phase, axis } });
    const pos: Param = { value: [x - travelX * 0.3 * Math.sin(phaseAngle * Math.PI / 180), y - travelY * 0.3 * Math.sin((phaseAngle + 90) * Math.PI / 180)],
      modifiers: [drift("x", travelX * 0.3, phaseAngle), drift("y", travelY * 0.3, phaseAngle + 90)] };
    const rot: Param = { value: r2((r() - 0.5) * 2 * o.tilt), modifiers: [{ id: "rock", type: "wave", enabled: true, blend: "add", params: { amplitude: 3, frequency: 1 / o.duration, phase: phaseAngle } }] };
    n.layer("Shape", `Card ${i + 1}`, { ...rect(w, h, x, y, fill, w * 0.05), position: pos, rotation: rot, anchor: P([w / 2, h / 2]), blur: P(depth < 0.85 ? 2 : 0) }, [], { role: "panel" });
    const label = o.labels[i % o.labels.length];
    if (label) {
      const light = /^#(?:[0-7])/.test(fill) ? "#FFFFFF" : "#111111";
      const size = r2(label.length > 6 ? h * 0.22 : h * 0.42);
      n.layer("Text", `Card ${i + 1} label`, { ...text(label, { font: "Inter", weight: 600, size, x, y, fill: light, align: "left", tracking: -size * 0.03 }), position: pos, rotation: rot, anchor: P([-w * 0.1 + w / 2, -h * 0.6 + h / 2]) }, [], { role: "body" });
    }
  }
  return docOf(name, n.network(comp(W, H, o.duration, o.background)));
}

/* ---------- B: diagonal card trail ---------- */

export interface TrailOptions { width: number; height: number; duration: number; tiles: number; angle: number; speed: number; background: string; colors: string[] }
export const TRAIL_DEFAULTS: TrailOptions = { width: 1440, height: 960, duration: 15, tiles: 8, angle: 35, speed: 1, background: "#E3E3E3", colors: ["#9E9E9E", "#E8C9B8", "#111111", "#D7202B", "#F2C230", "#17A34A", "#2E54E8", "#F4F4F4"] };

/** Square tiles in a diagonal line, overlapping, flowing corner to corner; seamless every `tiles`. */
export function cardTrail(opts: Partial<TrailOptions> = {}, name = "Card trail"): SceneDoc {
  const o = { ...TRAIL_DEFAULTS, ...opts };
  const { width: W, height: H } = o;
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(W, H, 0, 0, o.background), [], { role: "background" });
  const size = r2(H * 0.22), a = (o.angle * Math.PI) / 180;
  const step: [number, number] = [r2(size * 0.62 * Math.cos(a) / Math.cos(Math.PI / 4)), r2(size * 0.62 * Math.sin(a) / Math.sin(Math.PI / 4))];
  const loops = Math.max(1, Math.round(o.speed * o.duration / 5));
  const total = Math.ceil(Math.hypot(W, H) / Math.hypot(...step)) + o.tiles * (loops + 1);
  const start: [number, number] = [-step[0] * o.tiles * loops - size, -step[1] * o.tiles * loops - size];
  for (let i = 0; i < total; i++) {
    const x = r2(start[0] + i * step[0]), y = r2(start[1] + i * step[1]);
    const shift = o.tiles * loops;
    const fill = o.colors[i % o.tiles % o.colors.length]!;
    n.layer("Shape", `Tile ${i + 1}`, { ...rect(size, size, x, y, fill, size * 0.03), position: keyed([x, y], [{ t: 0, v: [x, y], ease: "linear" }, { t: o.duration, v: [r2(x + step[0] * shift), r2(y + step[1] * shift)], ease: "linear" }]) }, [], { role: "panel" });
  }
  return docOf(name, n.network(comp(W, H, o.duration, o.background)));
}

/* ---------- C: SaaS sentence ---------- */

/** Soft blurred colour blobs drifting on seeded paths. */
function blobs(n: Net, W: number, H: number, colors: string[], seed = 1) {
  const r = rng(seed);
  colors.forEach((c, i) => {
    const d = r2(Math.max(W, H) * (0.45 + r() * 0.25));
    const x = r2(r() * W - d / 2), y = r2(r() * H * 0.6 - d / 3);
    n.layer("Shape", `Glow ${i + 1}`, { shape: P("ellipse"), size: P([d, d * 0.6]), fill: P(c), gradient: P("radial"), fill2: P(`${c.slice(0, 7)}00`), blur: P(r2(d * 0.12)), position: { value: [x, y], modifiers: [noise(W * 0.08, 0.12, 50 + i * 3)] } as never, rotation: { value: r2(r() * 40 - 20), modifiers: [noise(10, 0.1, 70 + i)] } as never }, [], { role: "decoration" });
  });
}

export interface SentenceOptions { width: number; height: number; words: string[]; colorA: string; colorB: string; background: string; glow: string[]; perWord: number; sizeScale?: number; tail?: number }
export const SENTENCE_DEFAULTS: SentenceOptions = { width: 1920, height: 1080, words: ["Give", "your", "team", "superpowers"], colorA: "#F0407A", colorB: "#9B2CF0", background: "#F6F6F6", glow: ["#F59AC0", "#C58BFF", "#8FA8FF"], perWord: 0.55 };

/** Word by word, each sliding in from the right while the camera keeps the newest word centred. */
export function wordFollow(opts: Partial<SentenceOptions> = {}, name = "Word follow"): SceneDoc {
  const o = { ...SENTENCE_DEFAULTS, ...opts };
  const { width: W, height: H } = o;
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(W, H, 0, 0, o.background), [], { role: "background" });
  blobs(n, W, H, o.glow);
  const size = r2(H * 0.13 * (o.sizeScale ?? 1)), wOf = (s: string) => s.length * size * 0.55, space = size * 0.3;
  const xs: number[] = [];
  let x = 0;
  for (const w of o.words) { xs.push(x); x += wOf(w) + space; }
  // camera: the newest word's centre goes to the frame centre, eased between words
  const cam = o.words.map((w, i) => ({ t: i * o.perWord, v: r2(W / 2 - (xs[i]! + wOf(w) / 2)) }));
  const D = r2(o.words.length * o.perWord + (o.tail ?? 1.5));
  const base = r2(H / 2 + size * 0.36);
  o.words.forEach((w, i) => {
    const keys: K[] = cam.flatMap((c, j) => {
      const next = cam[j + 1];
      const v = [r2((xs[i] ?? 0) + c.v), base];
      return [{ t: c.t, v, ease: "hold" }, ...(next ? [{ t: next.t - o.perWord * 0.65, v, ease: "inOutCubic" }] : [])];
    });
    n.layer("Text", w, { ...text(w, { font: "Inter Tight", weight: 700, size, x: xs[i]!, y: base, fill: o.colorA, align: "left", tracking: -size * 0.02 }), gradient: P("linear"), fill2: P(i % 2 ? o.colorA : o.colorB), position: keyed([xs[i]! + cam[0]!.v, base], keys) }, [phase(`${w} in`, { start: r2(i * o.perWord), duration: 0.5, ease: "outQuart", offsetPosition: [size * 1.2, 0], offsetBlur: 8 })], { role: "title" });
  });
  return docOf(name, n.network(comp(W, H, D, o.background)));
}

export interface CounterOptions { width: number; height: number; from: number; to: number; suffix: string; lead: string; ring: string; background: string; duration: number }
export const COUNTER_DEFAULTS: CounterOptions = { width: 1920, height: 1080, from: 2, to: 10, suffix: "x better", lead: "potential with", ring: "#D58BF5", background: "#F3E6FB", duration: 4 };

/** A number counts up in a pill, rounded rings pulse out behind it. */
export function counterPill(opts: Partial<CounterOptions> = {}, name = "Counter pill"): SceneDoc {
  const o = { ...COUNTER_DEFAULTS, ...opts };
  const { width: W, height: H } = o;
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(W, H, 0, 0, o.background), [], { role: "background" });
  const pw = r2(W * 0.2), ph = r2(H * 0.11), cx = W / 2 + W * 0.05, cy = H / 2;
  for (let i = 4; i >= 1; i--) {
    const w = pw * (1 + i * 0.55), h = ph * (1 + i * 1.1);
    n.layer("Shape", `Ring ${i}`, { ...rect(r2(w), r2(h), r2(cx - w / 2), r2(cy - h / 2), o.ring, r2(h / 2)), anchor: P([r2(w / 2), r2(h / 2)]), position: P([cx, cy]), opacity: P(r2(20 + (4 - i) * 12)), scale: { value: [100, 100], modifiers: [{ id: `pulse${i}`, type: "wave", enabled: true, blend: "add", params: { amplitude: 4, frequency: 0.8, phase: i * 60 } }] } as never }, [phase(`Ring ${i} in`, { start: r2(0.1 + i * 0.08), duration: 0.8, ease: "outQuart", offsetScale: 60 })], { role: "decoration" });
  }
  n.layer("Shape", "Pill", { ...rect(pw, ph, r2(cx - pw / 2), r2(cy - ph / 2), "#FFFFFF", r2(ph / 2)), gradient: P("linear"), fill2: P("#E6DDF8"), gradientAngle: P(90) }, [phase("Pill in", { duration: 0.6, ease: "spring(0.5,700)", offsetScale: 40 })], { role: "panel" });
  const size = r2(ph * 0.4);
  n.layer("Text", "Counter", { ...text("{n}" + o.suffix, { font: "Inter Tight", weight: 700, size, x: cx, y: r2(cy + size * 0.36), fill: "#16121F" }), count: keyed(o.from, [{ t: 0.65, v: o.from, ease: "outCubic" }, { t: Math.min(o.duration - 0.4, 2.3), v: o.to, ease: "linear" }]) }, [phase("Counter in", { start: 0.2, duration: 0.4, ease: "outQuart", offsetPosition: [0, 20] })], { role: "title" });
  n.layer("Text", "Lead", text(o.lead, { font: "Inter Tight", weight: 600, size: r2(size * 0.8), x: r2(cx - pw / 2 - size * 0.6), y: r2(cy + size * 0.3), fill: "#FFFFFF", align: "right" }), [phase("Lead in", { duration: 0.5, ease: "outQuart", offsetPosition: [-30, 0] })], { role: "subtitle" });
  return docOf(name, n.network(comp(W, H, o.duration, o.background)));
}

/** A hand cursor path (pointing hand, simplified), drawn from [0, 0]. */
export const CURSOR_PATH = "M18 0 L26 0 L26 30 L34 30 L36 22 L44 22 L46 30 L54 30 L56 24 L64 24 L66 34 L66 62 L58 84 L24 84 L4 54 L10 46 L18 54 Z";

/** A cursor flies in on an eased path, presses a button, a ring pulses out. */
export function cursorClick(opts: Partial<{ width: number; height: number; label: string; color: string; background: string }> = {}, name = "Cursor click"): SceneDoc {
  const o = { width: 1920, height: 1080, label: "Feedback", color: "#E2367F", background: "#E9D2F7", ...opts };
  const { width: W, height: H } = o;
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(W, H, 0, 0, o.background), [], { role: "background" });
  const bw = r2(W * 0.24), bh = r2(H * 0.13), bx = r2(W / 2 - bw / 2), by = r2(H / 2 - bh / 2);
  n.layer("Shape", "Click ring", { ...rect(bw, bh, bx, by, "#FFFFFF00", bh / 2), stroke: P("#FFFFFF"), strokeWidth: P(4), anchor: P([bw / 2, bh / 2]), position: P([W / 2, H / 2]), scale: keyed([100, 100], [{ t: 1.6, v: [100, 100], ease: "outQuart" }, { t: 2.3, v: [140, 160], ease: "linear" }]), opacity: keyed(0, [{ t: 1.59, v: 0, ease: "hold" }, { t: 1.6, v: 90, ease: "outQuart" }, { t: 2.3, v: 0, ease: "linear" }]) }, [], { role: "decoration" });
  n.layer("Shape", "Button", { ...rect(bw, bh, bx, by, "#FFFFFF", bh / 2), gradient: P("linear"), fill2: P("#DCD3FA"), gradientAngle: P(90), anchor: P([bw / 2, bh / 2]), position: P([W / 2, H / 2]), scale: keyed([100, 100], [{ t: 1.5, v: [100, 100], ease: "outQuad" }, { t: 1.6, v: [94, 94], ease: "spring(0.5,600)" }, { t: 2.2, v: [100, 100], ease: "linear" }]) }, [phase("Button in", { duration: 0.6, ease: "spring(0.5,700)", offsetScale: 60 })], { role: "panel" });
  const size = r2(bh * 0.42);
  n.layer("Text", "Label", { ...text(o.label, { font: "Inter Tight", weight: 700, size, x: W / 2, y: r2(H / 2 + size * 0.36), fill: o.color }), gradient: P("linear"), fill2: P("#8E2CF0"),
    anchor: P([0, r2(-size * 0.36)]), position: P([W / 2, H / 2]),
    scale: keyed([100, 100], [{ t: 1.5, v: [100, 100], ease: "outQuad" }, { t: 1.6, v: [94, 94], ease: "spring(0.5,600)" }, { t: 2.2, v: [100, 100], ease: "linear" }]),
  }, [phase("Label in", { duration: 0.6, ease: "spring(0.5,700)", offsetScale: 60 })], { role: "title" });
  const tip: [number, number] = [r2(W / 2 + bw * 0.25), r2(H / 2)];
  n.layer("Shape", "Cursor", { shape: P("path"), path: P(CURSOR_PATH), size: P([66, 84]), fill: P("#FFFFFF"), stroke: P("#7A2BD0"), strokeWidth: P(4), anchor: P([22, 0]), position: keyed([W * 1.05, H * 1.1], [{ t: 0.4, v: [W * 1.05, H * 1.1], ease: "inOutCubic" }, { t: 1.5, v: tip, ease: "linear" }, { t: 2.6, v: tip, ease: "inCubic" }, { t: 3.4, v: [W * 1.1, H * 0.9], ease: "linear" }]), scale: keyed([100, 100], [{ t: 1.5, v: [100, 100], ease: "outQuad" }, { t: 1.6, v: [85, 85], ease: "outQuad" }, { t: 1.8, v: [100, 100], ease: "linear" }]) }, [], { role: "icon" });
  return docOf(name, n.network(comp(W, H, 4, o.background)));
}

/** Just the drifting glow blobs. */
export function glowBackground(opts: Partial<{ width: number; height: number; colors: string[]; background: string; duration: number }> = {}, name = "Glow background"): SceneDoc {
  const o = { width: 1920, height: 1080, colors: ["#F59AC0", "#C58BFF", "#8FA8FF", "#FFB3D9"], background: "#FBFAFD", duration: 8, ...opts };
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(o.width, o.height, 0, 0, o.background), [], { role: "background" });
  blobs(n, o.width, o.height, o.colors, 3);
  return docOf(name, n.network(comp(o.width, o.height, o.duration, o.background)));
}

/** Several docs one after another as precomps (cuts), in one comp. */
export function chainDocs(docs: SceneDoc[], name: string, width: number, height: number): SceneDoc {
  const main = new Net("main", "Main_v01");
  const nets: Network[] = [];
  let t = 0;
  docs.forEach((d, i) => {
    const pre = `p${i + 1}-`;
    const map = (id: string) => pre + id;
    for (const net of d.networks) {
      const nodes = net.nodes.map((x) => ({ ...x, id: map(x.id), ...(x.subnet ? { subnet: map(x.subnet) } : {}) })) as Node[];
      const wires = net.wires.map((w) => ({ from: { ...w.from, node: map(w.from.node) }, to: { ...w.to, node: map(w.to.node) } }));
      const isRoot = net.id === d.root;
      const { comp: c, ...rest } = net;
      nets.push({ ...rest, id: map(net.id), name: isRoot ? d.name : net.name, nodes, wires, output: map(net.output), ...(isRoot || !c ? {} : { comp: c }) } as Network);
    }
    const dur = d.networks.find((x) => x.id === d.root)!.comp!.duration;
    main.layer("Subnet", `${i + 1} ${d.name}`, { position: P([0, 0]) }, [], { timing: { in: r2(t), out: r2(t + dur) }, subnet: map(d.root) });
    t += dur;
  });
  return docOf(name, main.network(comp(width, height, r2(t))), nets);
}

/** The whole SaaS-style promo: sentence, second sentence on glow, counter pill, button click. */
export const saasPromo = (name = "SaaS promo") =>
  chainDocs([
    wordFollow({}, "Give your team"),
    wordFollow({ words: ["Help", "them", "unlock", "their"], colorA: "#FFFFFF", colorB: "#FFFFFF", background: "#FFFFFF", glow: ["#B04BFF", "#7E8BFF", "#F07BC0"], perWord: 0.45 }, "Help them"),
    counterPill({}, "Counter"),
    cursorClick({}, "Click"),
  ], name, 1920, 1080);

/** Rebuild of the uploaded "superpowers" reference: tighter pacing (about 8 s), huge second line, 7x to 10x counter. */
export const saasSuperpowers = (name = "SaaS rebuild: Superpowers") =>
  chainDocs([
    wordFollow({ perWord: 0.5, tail: 1 }, "Give your team"),
    wordFollow({ words: ["Help", "them", "unlock", "their"], colorA: "#FFFFFF", colorB: "#FFFFFF", background: "#FFFFFF", glow: ["#B04BFF", "#7E8BFF", "#F07BC0"], perWord: 0.4, sizeScale: 2, tail: 0.6 }, "Help them"),
    counterPill({ from: 7, to: 10, duration: 2.2 }, "Counter"),
    cursorClick({}, "Click"),
  ], name, 1920, 1080);

/* ---------- D: box poster ---------- */

export interface PosterCell { x: number; y: number; w: number; h: number; fill: string; word?: string; color: string; vertical?: boolean; circle?: boolean }
export interface PosterOptions { width: number; height: number; duration: number; cells: PosterCell[]; squiggles: number }

/** Run By The Sun: a 3x3-ish grid in fractions of the frame. */
export const POSTER_DEFAULTS: PosterOptions = {
  width: 1080, height: 1350, duration: 8, squiggles: 6,
  cells: [
    { x: 0, y: 0, w: 0.72, h: 0.3, fill: "#FF4A10", word: "RUN", color: "#FFE12E" },
    { x: 0.72, y: 0, w: 0.28, h: 0.6, fill: "#52C8FF", word: "BY", color: "#12B046", vertical: true },
    { x: 0, y: 0.3, w: 0.3, h: 0.7, fill: "#A14DFF", word: "THE", color: "#FF8A00", vertical: true },
    { x: 0.3, y: 0.3, w: 0.42, h: 0.3, fill: "#1430B0", color: "#FFE12E", circle: true },
    { x: 0.3, y: 0.6, w: 0.7, h: 0.4, fill: "#FFE12E", word: "SUN", color: "#FF72CC" },
  ],
};

/** A squiggle as a polyline path from [0, 0], so it can draw on with trim. */
export function squigglePath(len: number, amp: number, seed: number): string {
  const r = rng(seed), pts: string[] = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(`${r2(t * len)} ${r2(Math.sin(t * Math.PI * (2 + r())) * amp + (r() - 0.5) * amp * 0.3)}`); }
  return `M${pts.join(" L")}`;
}

/** Hand-drawn white lines that draw on and fade at seeded places and times. */
function squiggles(n: Net, W: number, H: number, count: number, duration: number) {
  const r = rng(99);
  for (let i = 0; i < count; i++) {
    const len = r2(W * (0.12 + r() * 0.15)), t0 = r2(r() * (duration - 1.2)), x = r2(r() * W * 0.8), y = r2(r() * H);
    n.layer("Shape", `Squiggle ${i + 1}`, { shape: P("path"), path: P(squigglePath(len, len * 0.12, 5 + i)), size: P([len, len * 0.2]), fill: P("#FFFFFF00"), stroke: P("#FFFFFF"), strokeWidth: P(r2(W * 0.004)), position: P([x, y]), rotation: P(r2(r() * 60 - 30)), trimEnd: keyed(0, [{ t: t0, v: 0, ease: "outQuart" }, { t: t0 + 0.5, v: 100, ease: "linear" }]), opacity: keyed(100, [{ t: t0 + 0.6, v: 100, ease: "inQuad" }, { t: t0 + 1, v: 0, ease: "linear" }]) }, [], { role: "decoration" });
  }
}

/** One word squashed to fill a box exactly, breathing wide/tall and doubling up (RUN → RUN RUN). */
function squashWord(n: Net, c: PosterCell, W: number, H: number, duration: number, seed: number) {
  const bx = c.x * W, by = c.y * H, bw = c.w * W, bh = c.h * H;
  n.layer("Shape", `${c.word ?? "Sun"} box`, rect(r2(bw), r2(bh), r2(bx), r2(by), c.fill), [], { role: "panel" });
  if (c.circle) {
    const d = r2(Math.min(bw, bh) * 0.7);
    n.layer("Shape", "Sun", { shape: P("ellipse"), size: P([d, d]), fill: P(c.color), anchor: P([d / 2, d / 2]), position: P([r2(bx + bw / 2), r2(by + bh / 2)]), scale: { value: [100, 100], modifiers: [{ id: "sun", type: "wave", enabled: true, blend: "add", params: { amplitude: 4, frequency: 0.5 } }] } as never }, [], { role: "accent" });
    return;
  }
  const word = c.word!;
  // vertical words run one letter per line; the type is sized so caps fill the box height
  const lines = c.vertical ? word.split("") : [word];
  const lead = 0.86;
  const size = r2(c.vertical ? bh / (CAP + (lines.length - 1) * lead) : bh / CAP);
  const natW = Math.max(...lines.map((l) => l.length)) * ADV * size;
  const sx = r2((bw / natW) * 100), sx2 = r2(sx / 2);
  const base = r2(by + CAP * size);
  const r = rng(seed), t1 = r2(1 + r() * 2);
  const doubled = c.vertical ? lines.join("\n") : `${word}${word}`;
  n.layer("Text", word, {
    ...text(lines.join("\n"), { size, x: r2(bx), y: base, fill: c.color, align: "left", leading: lead }),
    // squash breathes, then the word doubles up at half width and back, stepped like a cut
    scale: keyed([sx, 100], [{ t: 0, v: [sx, 100], ease: "inOutExpo" }, { t: t1, v: [r2(sx * 0.6), 100], ease: "inOutExpo" }, { t: t1 + 0.6, v: [sx, 100], ease: "hold" }, { t: t1 + 1.6, v: c.vertical ? [sx, 100] : [sx2, 100], ease: "hold" }, { t: Math.min(duration, t1 + 3), v: [sx, 100], ease: "linear" }]),
    text: keyed(lines.join("\n"), [{ t: 0, v: lines.join("\n"), ease: "hold" }, { t: t1 + 1.6, v: doubled, ease: "hold" }, { t: Math.min(duration, t1 + 3), v: lines.join("\n"), ease: "hold" }]),
  }, [], { role: "title" });
}

export function boxPoster(opts: Partial<PosterOptions> = {}, name = "Box poster"): SceneDoc {
  const o = { ...POSTER_DEFAULTS, ...opts };
  const n = new Net("main", "Main_v01");
  o.cells.forEach((c, i) => squashWord(n, c, o.width, o.height, o.duration, 11 + i * 5));
  squiggles(n, o.width, o.height, o.squiggles, o.duration);
  return docOf(name, n.network(comp(o.width, o.height, o.duration, o.cells[0]?.fill ?? "#000000")));
}

export const squashStretch = (name = "Squash & stretch") => boxPoster({ width: 1920, height: 1080, squiggles: 0, cells: [{ x: 0.06, y: 0.15, w: 0.88, h: 0.7, fill: "#FFE12E", word: "STRETCH", color: "#FF4A10" }] }, name);

export function squiggleOverlay(name = "Squiggle overlay"): SceneDoc {
  const n = new Net("main", "Main_v01");
  n.layer("Shape", "Background", rect(1920, 1080, 0, 0, "#1430B0"), [], { role: "background" });
  squiggles(n, 1920, 1080, 14, 6);
  return docOf(name, n.network(comp(1920, 1080, 6, "#1430B0")));
}

/* ---------- checking AI recipes ---------- */

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);
const hexes = (v: unknown, d: string[]) => (Array.isArray(v) ? v.map((x) => hex(x, "")).filter(Boolean).slice(0, 8) : []).length ? (v as unknown[]).map((x) => hex(x, "")).filter(Boolean).slice(0, 8) : d;
const word = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} &!?.,'-]/gu, "").trim().slice(0, max) : "");

/** An AI answer for one of the four new kinds, cleaned and built; undefined when it isn't one. */
export function checkShowcaseRecipe(raw: unknown, size: { width: number; height: number; duration: number }, name: string): SceneDoc | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const dur = num(size.duration, 3, 20, 8);
  if (r.kind === "cards") return floatingCards({ ...size, duration: dur, count: Math.round(num(r.count, 4, 30, 14)), tilt: num(r.tilt, 0, 60, 25), drift: num(r.drift, 0, 2, 0.6), background: hex(r.background, "#000000"), colors: hexes(r.colors, CARDS_DEFAULTS.colors), labels: Array.isArray(r.labels) ? r.labels.map((x) => word(x, 16)).slice(0, 12) : CARDS_DEFAULTS.labels }, name);
  if (r.kind === "trail") return cardTrail({ ...size, duration: dur, tiles: Math.round(num(r.tiles, 3, 16, 8)), angle: num(r.angle, 10, 80, 35), speed: num(r.speed, 0.2, 4, 1), background: hex(r.background, TRAIL_DEFAULTS.background), colors: hexes(r.colors, TRAIL_DEFAULTS.colors) }, name);
  if (r.kind === "sentence") {
    const words = Array.isArray(r.words) ? r.words.map((x) => word(x, 24)).filter(Boolean).slice(0, 12) : [];
    return wordFollow({ ...size, words: words.length ? words : SENTENCE_DEFAULTS.words, colorA: hex(r.colorA, SENTENCE_DEFAULTS.colorA), colorB: hex(r.colorB, SENTENCE_DEFAULTS.colorB), background: hex(r.background, SENTENCE_DEFAULTS.background), glow: hexes(r.glow, SENTENCE_DEFAULTS.glow), perWord: num(r.perWord, 0.2, 2, 0.55) }, name);
  }
  if (r.kind === "box-poster" && Array.isArray(r.cells)) {
    const cells = (r.cells as Record<string, unknown>[]).slice(0, 16).map((c) => ({ x: num(c?.x, 0, 1, 0), y: num(c?.y, 0, 1, 0), w: num(c?.w, 0.05, 1, 0.5), h: num(c?.h, 0.05, 1, 0.5), fill: hex(c?.fill, "#FFE12E"), color: hex(c?.color, "#FF4A10"), ...(word(c?.word, 12) ? { word: word(c?.word, 12).toUpperCase() } : { circle: true }), vertical: c?.vertical === true }));
    return cells.length ? boxPoster({ ...size, duration: dur, cells, squiggles: Math.round(num(r.squiggles, 0, 20, 6)) }, name) : undefined;
  }
  return undefined;
}
