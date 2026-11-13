/**
 * Kinetic type sequences and grunge lower thirds, as plain docs.
 *
 * A sequence is one comp holding a Subnet instance per scene, laid end to end with `timing`;
 * transitions are ordinary position keys on the instances (parent time), so the AE export
 * gets one precomp per scene with normal keys. Each scene is an editable network.
 * A grunge lower third is one Subnet: brush strokes (SVG paths), splatter, speed lines, a tag
 * box and a two-part name; it glitches in (random letters, stepped eases), jitters while it
 * holds (seeded noise) and glitches out. Pure and deterministic.
 */
import type { Network, Node, Param, SceneDoc, Wire } from "../schema";

const P = (value: unknown, extra: Partial<Param> = {}): Param => ({ value: value as Param["value"], ...extra });
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ---------- small network builder ---------- */

export class Net {
  nodes: Node[] = [];
  wires: Wire[] = [];
  private row = 0;
  constructor(readonly id: string, readonly name: string) {}
  /** A layer plus its chain (Split / Phase ...), wired into the merge. Returns the layer node. */
  layer(type: string, name: string, params: Record<string, Param>, chain: { type: string; name: string; params: Record<string, Param> }[] = [], o: { role?: Node["role"]; timing?: Node["timing"]; subnet?: string } = {}): Node {
    const id = `${this.id}-n${this.nodes.length + 1}`;
    const y = this.row++ * 120;
    const node: Node = { id, type, name, params, enabled: true, ui: { x: 0, y }, ...(o.role ? { role: o.role } : {}), ...(o.timing ? { timing: o.timing } : {}), ...(o.subnet ? { subnet: o.subnet } : {}) };
    this.nodes.push(node);
    let prev = id;
    chain.forEach((c, i) => {
      const cid = `${id}-${i + 1}`;
      this.nodes.push({ id: cid, type: c.type, name: c.name, params: c.params, enabled: true, ui: { x: 220 * (i + 1), y } });
      this.wires.push({ from: { node: prev, port: "out" }, to: { node: cid, port: "in" } });
      prev = cid;
    });
    this.wires.push({ from: { node: prev, port: "out" }, to: { node: `${this.id}-merge`, port: "in" } });
    return node;
  }
  network(comp?: Network["comp"]): Network {
    const nodes = [...this.nodes, { id: `${this.id}-merge`, type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 880, y: 0 } } as Node];
    const wires = [...this.wires];
    let output = `${this.id}-merge`;
    if (comp) {
      nodes.push({ id: `${this.id}-out`, type: "Output", name: "Output", enabled: true, params: {}, ui: { x: 1100, y: 0 } });
      wires.push({ from: { node: output, port: "out" }, to: { node: `${this.id}-out`, port: "in" } });
      output = `${this.id}-out`;
    }
    return { id: this.id, name: this.name, ...(comp ? { comp } : {}), output, wires, nodes } as Network;
  }
}

export const phase = (name: string, p: Record<string, unknown>) => ({ type: "Phase", name, params: Object.fromEntries(Object.entries({ mode: "in", start: 0, duration: 0.5, ease: "outExpo", stagger: 0, from: "first", offsetPosition: [0, 0], offsetScale: 100, offsetRotation: 0, offsetOpacity: 0, offsetBlur: 0, reveal: "none", ...p }).map(([k, v]) => [k, P(v)])) });
const split = (by: "characters" | "words" | "lines") => ({ type: "Split", name: `Split ${by}`, params: { by: P(by) } });
export const rect = (w: number, h: number, x: number, y: number, fill: string, radius = 0): Record<string, Param> => ({ shape: P("rect"), size: P([w, h]), fill: P(fill), radius: P(radius), position: P([x, y]) });
export const text = (t: string, o: { font?: string; size: number; x: number; y: number; fill: string; align?: string; leading?: number; tracking?: number; weight?: number }): Record<string, Param> => ({
  text: P(t), font: P(o.font ?? "Anton"), weight: P(o.weight ?? 400), size: P(o.size), fill: P(o.fill), align: P(o.align ?? "center"),
  leading: P(o.leading ?? 1.2), tracking: P(o.tracking ?? 0), position: P([o.x, o.y]),
});

/* ---------- sequence scenes ---------- */

export const SCENE_KINDS = ["countdown", "repeat", "caption", "lines", "ticker", "info", "stack", "jumble", "versus"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
export const TRANSITIONS = ["cut", "push-left", "push-up", "slide-left", "slide-up"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface SequenceScene {
  kind: SceneKind;
  /** Words. countdown: one item per line; lines/ticker/repeat: newline-separated; info: one row per line;
   *  stack/jumble: one word; versus: top word, middle word, bottom word (one per line). */
  text: string;
  color: string;
  background: string;
  /** Seconds on screen, transition included. */
  duration: number;
  /** How this scene comes in over the previous one. */
  transition: Transition;
}

export interface SequenceOptions {
  name: string;
  width: number;
  height: number;
  scenes: SequenceScene[];
  /** Seconds a push / slide takes. */
  transitionTime: number;
}

/** Condensed caps fill the frame: Anton caps are ~0.73 em tall and a glyph ~0.42 em wide. */
export const CAP = 0.73, ADV = 0.44;
/** Font size that makes the widest of these lines fill `w` and all lines (at `leading`) fit `h`. */
export const fitSize = (lines: string[], w: number, h: number, leading: number) => {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const byW = w / (longest * ADV);
  const byH = h / (CAP + (lines.length - 1) * leading);
  return Math.floor(Math.min(byW, byH));
};

/** Rough Outfit heavy cap advances (em), for laying out one layer per letter without measuring. */
const outfitAdv = (c: string) => (c === " " ? 0.3 : "IJ1".includes(c) ? 0.32 : "MW".includes(c) ? 0.86 : "ABCDGHKNOQRUVXY0".includes(c) ? 0.7 : 0.6);
const OUT_CAP = 0.7;

function sceneNet(id: string, s: SequenceScene, W: number, H: number): Network {
  const n = new Net(id, `${s.kind[0]!.toUpperCase()}${s.kind.slice(1)}`);
  const D = s.duration;
  n.layer("Shape", "Background", rect(W, H, 0, 0, s.background), [], { role: "background" });
  const lines = s.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pad = Math.round(Math.min(W, H) * 0.05);
  if (s.kind === "countdown") {
    // one huge item after another, each pushing the last off to the left
    const each = D / Math.max(1, lines.length);
    lines.forEach((l, i) => {
      const size = fitSize([l], W * 0.92, H * 0.95, 1);
      const base = Math.round(H / 2 + (size * CAP) / 2);
      const t0 = r2(i * each), t1 = r2(Math.min(D, (i + 1) * each + 0.2));
      const enter = Math.min(0.2, each * 0.3), exit = Math.min(0.2, each * 0.3);
      const p = text(l, { size, x: W / 2, y: base, fill: s.color, leading: 1 });
      p.position = { value: [W / 2, base], keys: [
        { t: t0, v: [i ? W * 1.5 : W / 2, base], ease: "outCubic" },
        { t: r2(t0 + enter), v: [W / 2, base], ease: "hold" },
        { t: r2((i + 1) * each), v: [W / 2, base], ease: "inCubic" },
        { t: r2(Math.min(D, (i + 1) * each + exit)), v: [i === lines.length - 1 ? W / 2 : -W * 0.5, base], ease: "linear" },
      ] };
      n.layer("Text", `Count ${l}`, p, [], { role: "title", timing: { in: t0, out: t1 } });
    });
  } else if (s.kind === "repeat") {
    // the words big in the middle, then repeated side by side and scrolling
    const lead = 0.86;
    const size = fitSize(lines, W * 0.9, H * 0.92, lead);
    const block = (CAP + (lines.length - 1) * lead) * size;
    const base = Math.round((H - block) / 2 + CAP * size);
    const half = r2(D * 0.4);
    n.layer("Text", "Words", text(lines.join("\n"), { size, x: W / 2, y: base, fill: s.color, leading: lead }), [split("lines"), phase("Words in", { duration: 0.35, ease: "outExpo", stagger: 0.08, reveal: "up", offsetPosition: [0, size * 0.4] })], { role: "title", timing: { in: 0, out: half } });
    const row = lines.map((l) => Array(6).fill(l).join(" ")).join("\n");
    const unit = (lines[0]!.length + 1) * ADV * size;
    n.layer("Text", "Words repeated", { ...text(row, { size, x: W / 2, y: base, fill: s.color, leading: lead, tracking: 0 }), position: { value: [W / 2, base], keys: [{ t: half, v: [W / 2 + unit / 2, base], ease: "linear" }, { t: D, v: [W / 2 - unit * 1.5, base], ease: "linear" }] } as never }, [], { role: "title", timing: { in: half, out: D } });
  } else if (s.kind === "caption") {
    const size = Math.round(Math.min(W, H) * 0.028);
    n.layer("Text", "Caption", { ...text(lines.join("\n").toUpperCase(), { font: "Inter", weight: 600, size, x: W / 2, y: H / 2, fill: s.color, tracking: size * 0.08 }), position: { value: [W / 2, H / 2], keys: [{ t: 0, v: [W / 2, H / 2 + 6], ease: "linear" }, { t: D, v: [W / 2, H / 2 - 6], ease: "linear" }] } as never }, [phase("Caption in", { start: 0.15, duration: 0.6, ease: "outQuart", offsetPosition: [0, 10] })], { role: "body" });
  } else if (s.kind === "lines") {
    // line by line, filling the frame, the whole block easing up as it builds
    const lead = 0.9;
    const size = fitSize(lines, W - pad * 2, H * 1.0, lead);
    const block = (CAP + (lines.length - 1) * lead) * size;
    const top = Math.round((H - block) / 2 + CAP * size);
    n.layer("Text", "Lines", { ...text(lines.join("\n"), { size, x: pad, y: top, fill: s.color, align: "left", leading: lead }), position: { value: [pad, top], keys: [{ t: 0, v: [pad, top + size * 0.9], ease: "outQuart" }, { t: r2(Math.min(D, 0.2 + lines.length * 0.22)), v: [pad, top], ease: "linear" }] } as never }, [split("lines"), phase("Lines in", { duration: 0.12, ease: "steps(1)", stagger: 0.22 })], { role: "title" });
  } else if (s.kind === "ticker") {
    // one word in a column that scrolls up for ever (seamless: it moves whole line pitches)
    const word = lines[0] ?? "TONIGHT";
    const lead = 0.88;
    const size = fitSize([word], W * 0.94, H, lead);
    const pitch = size * lead;
    const count = Math.ceil(H / pitch) + 3;
    const startY = Math.round(CAP * size);
    const travel = Math.max(1, Math.round(D * 1.2)) * pitch;
    n.layer("Text", "Ticker", { ...text(Array(count + Math.ceil(travel / pitch)).fill(word).join("\n"), { size, x: W / 2, y: startY, fill: s.color, leading: lead }), position: { value: [W / 2, startY], keys: [{ t: 0, v: [W / 2, startY], ease: "linear" }, { t: D, v: [W / 2, r2(startY - travel)], ease: "linear" }] } as never }, [], { role: "title" });
  } else if (s.kind === "stack") {
    // five rows of the word, solid and outlined in turn: they zoom out of the centre, wobble, settle, then collapse
    const word = lines[0] ?? "WORD";
    const len = word.split("").reduce((a, c) => a + outfitAdv(c), 0);
    const size = Math.floor(Math.min((W * 0.9) / len, H / 5.6));
    const pitch = size * 0.98, mid = 2, cy = H / 2 + (size * OUT_CAP) / 2;
    for (let i = 0; i < 5; i++) {
      const y = r2(cy + (i - mid) * pitch), d = Math.abs(i - mid), sign = i % 2 ? 1 : -1;
      const p = text(word, { font: "Outfit", weight: 800, size, x: W / 2, y, fill: i % 2 ? `${s.color}00` : s.color, leading: 1 });
      if (i % 2) Object.assign(p, { stroke: P(s.color), strokeWidth: P(Math.max(1, r2(size * 0.012))) });
      p.rotation = { value: 0, keys: [{ t: 0, v: sign * 7, ease: "spring(0.5,700)" }, { t: 0.6, v: 0, ease: "linear" }] } as never;
      p.position = { value: [W / 2, y], keys: [{ t: r2(Math.max(0.65, D - 0.3)), v: [W / 2, y], ease: "inExpo" }, { t: r2(D - 0.05), v: [W / 2, r2(cy)], ease: "linear" }] } as never;
      n.layer("Text", i === mid ? "Word" : `Echo ${i + 1}`, p, [phase("Zoom in", { start: r2(d * 0.05), duration: 0.45, ease: "outExpo", offsetScale: 260, offsetPosition: [0, r2((mid - i) * pitch)] })], { role: i === mid ? "title" : "decoration" });
    }
  } else if (s.kind === "jumble") {
    // one layer per letter: the word lands straight, then the letters hop up and down and tip, more and more
    const word = lines[0] ?? "WORD";
    const advs = word.split("").map(outfitAdv), len = advs.reduce((a, b) => a + b, 0);
    const size = Math.floor(Math.min((W * 0.84) / len, H * 0.3));
    const r = rng(word.length * 7 + 3), base = H / 2 + (size * OUT_CAP) / 2;
    let x = W / 2 - (len * size) / 2;
    word.split("").forEach((c, i) => {
      const cx = r2(x + (advs[i]! * size) / 2);
      x += advs[i]! * size;
      if (c === " ") return;
      const up = (i % 2 ? 1 : -1) * size * (0.18 + r() * 0.22), tip = (r() - 0.5) * 26;
      const p = text(c, { font: "Outfit", weight: 800, size, x: cx, y: r2(base), fill: s.color, leading: 1 });
      p.position = { value: [cx, base], keys: [{ t: 0.05, v: [cx, r2(base)], ease: "outBack" }, { t: 0.35, v: [cx, r2(base + up * 0.45)], ease: "inOutSine" }, { t: r2(D), v: [cx, r2(base + up)], ease: "linear" }] } as never;
      p.rotation = { value: 0, keys: [{ t: 0.05, v: 0, ease: "outBack" }, { t: 0.35, v: r2(tip * 0.5), ease: "inOutSine" }, { t: r2(D), v: r2(tip), ease: "linear" }] } as never;
      n.layer("Text", `Letter ${i + 1} ${c}`, p, [], { role: "title" });
    });
  } else if (s.kind === "versus") {
    // split screen: top word on the background colour, bottom word inverted, the middle word's halves slide in to meet
    const [a = "THIS", m = "VS", b = "THAT"] = lines;
    n.layer("Shape", "Bottom half", rect(W, H / 2, 0, H / 2, s.color), [], { role: "panel" });
    const fitW = (w: string, maxH: number) => Math.floor(Math.min((W * 0.84) / w.split("").reduce((t, c) => t + outfitAdv(c), 0), maxH));
    const sa = fitW(a, H * 0.17), sb = fitW(b, H * 0.17), sm = Math.round(Math.min(sa, sb) * 0.62);
    n.layer("Text", "Top word", text(a, { font: "Outfit", weight: 800, size: sa, x: W / 2, y: r2(H * 0.3 + sa * 0.35), fill: s.color, leading: 1 }), [phase("Top in", { duration: 0.35, ease: "outExpo", offsetScale: 112 })], { role: "title" });
    n.layer("Text", "Bottom word", text(b, { font: "Outfit", weight: 800, size: sb, x: W / 2, y: r2(H * 0.73 + sb * 0.35), fill: s.background, leading: 1 }), [phase("Bottom in", { duration: 0.35, ease: "outExpo", offsetScale: 112 })], { role: "subtitle" });
    const cut = Math.ceil(m.length / 2), halves = [m.slice(0, cut), m.slice(cut)].filter(Boolean);
    halves.forEach((h, i) => {
      const w = h.split("").reduce((t, c) => t + outfitAdv(c), 0) * sm, side = i === 0 ? -1 : 1;
      const xEnd = r2(W / 2 + side * (w / 2 + sm * 0.02)), xStart = r2(W / 2 + side * W * 0.38), y = r2(H / 2 + sm * 0.35);
      const p: Record<string, Param> = { ...text(h, { font: "Outfit", weight: 800, size: sm, x: xEnd, y, fill: s.background, leading: 1 }), stroke: P(s.color), strokeWidth: P(Math.max(1, r2(sm * 0.03))) };
      p.position = { value: [xEnd, y], keys: [{ t: 0, v: [xStart, y], ease: "outExpo" }, { t: 0.55, v: [xEnd, y], ease: "linear" }] } as never;
      n.layer("Text", `Middle ${i + 1}`, p, [], { role: "accent" });
    });
  } else {
    // info rows: an icon tile and a line of text each, coming in one after another
    const size = Math.round(Math.min(W, H) * 0.024);
    const gap = Math.round(size * 3);
    const tile = Math.round(size * 2);
    const x0 = Math.round(W * 0.3), y0 = Math.round(H / 2 - ((lines.length - 1) * gap) / 2);
    lines.forEach((l, i) => {
      const y = y0 + i * gap;
      const row = phase(`Row ${i + 1} in`, { start: r2(0.1 + i * 0.12), duration: 0.5, ease: "outQuart", offsetPosition: [0, 14] });
      n.layer("Shape", `Icon ${i + 1}`, rect(tile, tile, x0, y - tile / 2, "#FFFFFF1F", tile * 0.22), [row], { role: "icon" });
      n.layer("Shape", `Icon ${i + 1} mark`, { ...rect(tile * 0.4, tile * 0.4, x0 + tile * 0.3, y - tile * 0.2, "#FFFFFF00", tile * 0.2), shape: P("ellipse"), stroke: P(s.color), strokeWidth: P(Math.max(1.5, size * 0.12)) }, [row], { role: "icon" });
      n.layer("Text", `Row ${i + 1}`, text(l, { font: "Inter", weight: 500, size, x: x0 + tile + size, y: y + size * 0.36, fill: s.color, align: "left" }), [row], { role: "body" });
    });
  }
  return n.network();
}

/** One comp with the scenes end to end; a push moves the old scene out as the new one comes in. */
export function buildSequence(o: SequenceOptions): SceneDoc {
  const { width: W, height: H } = o;
  const main = new Net("main", "Main_v01");
  const nets: Network[] = [];
  let t = 0;
  const transitionAt = (i: number) => Math.max(0, Math.min(o.transitionTime, o.scenes[i]?.duration ?? 0, o.scenes[i - 1]?.duration ?? 0));
  o.scenes.forEach((s, i) => {
    const id = `scene-${i + 1}`;
    nets.push(sceneNet(id, s, W, H));
    const next = o.scenes[i + 1];
    const T = transitionAt(i);
    const tail = next && next.transition !== "cut" ? transitionAt(i + 1) : 0; // stays on while the next one comes over it
    const t0 = r2(t), t1 = r2(t + s.duration + tail);
    const keys: { t: number; v: [number, number]; ease: string }[] = [];
    const from = s.transition.endsWith("left") ? [W, 0] : s.transition.endsWith("up") ? [0, H] : undefined;
    if (i > 0 && from) keys.push({ t: t0, v: from as [number, number], ease: "inOutCubic" }, { t: r2(t0 + T), v: [0, 0], ease: "linear" });
    if (next && next.transition.startsWith("push")) {
      const to: [number, number] = next.transition.endsWith("left") ? [-W, 0] : [0, -H];
      keys.push({ t: r2(t0 + s.duration), v: [0, 0], ease: "inOutCubic" }, { t: t1, v: to, ease: "linear" });
    }
    main.layer("Subnet", `${i + 1} ${nets[i]!.name}`, { position: keys.length ? ({ value: [0, 0], keys } as never) : P([0, 0]) }, [], { timing: { in: t0, out: t1 }, subnet: id });

    t += s.duration;
  });
  const doc: SceneDoc = {
    version: 3,
    name: o.name,
    root: "main",
    source: { kind: "blank" },
    assets: [],
    batches: [],
    networks: [main.network({ width: W, height: H, fps: 25, duration: r2(t), background: o.scenes[0]?.background ?? "#000000" } as Network["comp"]), ...nets],
  } as SceneDoc;
  return doc;
}

/** The "Live now" style promo: countdown, repeat, caption, line build, ticker, info, sign-off. */
/** The black-and-white "A vs B" sequence: a zooming stack, a jumble of letters, then a split screen. */
export const versusScenes = (a = "FEATURES", b = "BENEFITS", mid = "VS"): SequenceScene[] => [
  { kind: "stack", text: a, color: "#FFFFFF", background: "#000000", duration: 1.1, transition: "cut" },
  { kind: "jumble", text: b, color: "#000000", background: "#FFFFFF", duration: 1, transition: "cut" },
  { kind: "versus", text: `${a}\n${mid}\n${b}`, color: "#FFFFFF", background: "#000000", duration: 1.9, transition: "cut" },
];

export const PROMO_SCENES: SequenceScene[] = [
  { kind: "countdown", text: "3\n2\n1", color: "#A6A7B0", background: "#E3E5EA", duration: 1.5, transition: "cut" },
  { kind: "repeat", text: "LIVE\nNOW", color: "#E8002D", background: "#5C0000", duration: 1.6, transition: "cut" },
  { kind: "caption", text: "Watch your favorite artists", color: "#FFFFFF", background: "#000000", duration: 1, transition: "cut" },
  { kind: "lines", text: "FRONT\nROW IS\nWHERE\nYOU ARE", color: "#5C0000", background: "#E8002D", duration: 1.5, transition: "push-left" },
  { kind: "ticker", text: "TONIGHT", color: "#E8002D", background: "#5C0000", duration: 1.4, transition: "push-up" },
  { kind: "info", text: "Thursday, Jun 22 · 8:00 PM\nRewatch for 24 hours\nDolby Atmos · Global\n5h 30m", color: "#FFFFFF", background: "#000000", duration: 1.6, transition: "cut" },
  { kind: "caption", text: "Only on your channel", color: "#FFFFFF", background: "#000000", duration: 1, transition: "cut" },
];

/* ---------- grunge lower thirds ---------- */

export const GRUNGE_LOOKS = ["brush", "tag", "splash"] as const;
export type GrungeLook = (typeof GRUNGE_LOOKS)[number];

export interface GrungeOptions {
  first: string;
  last: string;
  role: string;
  look: GrungeLook;
  /** Main paint / name colour, second colour, and the background. */
  colorA: string;
  colorB: string;
  background: string;
  width: number;
  height: number;
  duration: number;
  /** Timing multiplier for every build/exit (1 = default, below 1 = snappier). */
  tempo?: number;
}

export const GRUNGE_DEFAULTS: GrungeOptions = { first: "CALEB", last: "STONE", role: "DIRECTOR", look: "brush", colorA: "#FF3FD0", colorB: "#B6F23A", background: "#0A0612", width: 1920, height: 1080, duration: 6 };

/** Park-Miller, so the strokes are the same every time for the same seed. */
export const rng = (seed: number) => { let s = (seed * 16807) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

/** A rough dry-brush stroke: a long blob with ragged edges and a tapered end, as an SVG path. */
export function brushPath(w: number, h: number, seed: number): string {
  const r = rng(seed), n = 18, top: string[] = [], bot: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w, taper = Math.sin((i / n) * Math.PI) ** 0.4;
    top.push(`${r2(x + (r() - 0.5) * w * 0.02)} ${r2(h / 2 - (h / 2) * taper * (0.7 + r() * 0.3))}`);
    bot.push(`${r2(x + (r() - 0.5) * w * 0.02)} ${r2(h / 2 + (h / 2) * taper * (0.7 + r() * 0.3))}`);
  }
  return `M${top.join(" L")} L${bot.reverse().join(" L")} Z`;
}

const basePhase = (n: string, p: Record<string, unknown>) => phase(n, p);
const jitter = (amount: number, seed: number) => ({ id: `jit-${seed}`, type: "noise" as const, enabled: true, blend: "add" as const, params: { amplitude: amount, frequency: 6, seed } });

/** A lower third that glitches in, jitters while it holds and glitches out. */
export function grungeLowerThird(opts: Partial<GrungeOptions> = {}, name = "Grunge lower third"): SceneDoc {
  const o = { ...GRUNGE_DEFAULTS, ...opts };
  const { width: W, height: H } = o;
  const s = H / 1080;
  const lt = new Net("grunge", "Lower third");
  const k = o.tempo ?? 1;
  const t = (p: Record<string, unknown>) => k === 1 ? p : { ...p, ...Object.fromEntries((["start", "duration", "stagger"] as const).filter((f) => typeof p[f] === "number").map((f) => [f, r2((p[f] as number) * k)])) };
  const phase = (n: string, p: Record<string, unknown>) => basePhase(n, t(p));
  const glitchIn = (start: number, p: Record<string, unknown> = {}) => phase("Glitch in", { start, duration: 0.14, ease: "steps(2)", stagger: 0.035, from: "random", offsetPosition: [-40 * s, 0], ...p });
  const glitchOut = (start: number, p: Record<string, unknown> = {}) => phase("Glitch out", { mode: "out", start, duration: 0.12, ease: "steps(2)", stagger: 0.03, from: "random", offsetPosition: [30 * s, 0], ...p });
  const nameSize = Math.round(150 * s);
  const firstW = o.first.length * nameSize * 0.62;
  // paint behind
  const strokes = o.look === "tag" ? 1 : 3;
  for (let i = 0; i < strokes; i++) {
    const w = (firstW + o.last.length * nameSize * 0.5) * (1.1 - i * 0.15), h = nameSize * (0.9 - i * 0.2);
    lt.layer("Shape", `Brush stroke ${i + 1}`, { shape: P("path"), path: P(brushPath(r2(w), r2(h), 11 + i * 7)), size: P([r2(w), r2(h)]), fill: P(i % 2 ? o.colorB : o.colorA), position: { value: [r2(-20 * s + i * 30 * s), r2(-h * 0.2 + i * nameSize * 0.45)], modifiers: [jitter(3 * s, 3 + i)] } as never, opacity: P(o.look === "splash" ? 80 : 55) }, [phase("Stroke in", { start: 0.05 * i, duration: 0.25, ease: "outExpo", reveal: "right" }), phase("Stroke out", { mode: "out", start: 0, duration: 0.2, ease: "inExpo", reveal: "left" })], { role: "decoration" });
  }
  if (o.look !== "tag") {
    const r = rng(42);
    for (let i = 0; i < 9; i++) {
      const d = r2((6 + r() * 18) * s);
      lt.layer("Shape", `Splatter ${i + 1}`, { shape: P("ellipse"), size: P([d, d]), fill: P(i % 3 ? o.colorA : o.colorB), position: P([r2((r() * 1.2 - 0.1) * (firstW * 2)), r2((r() - 0.3) * nameSize * 1.6)]) }, [glitchIn(0.15 + i * 0.02, { offsetPosition: [0, 0], offsetScale: 0 }), glitchOut(0.05)], { role: "decoration" });
    }
  }
  // speed lines
  for (let i = 0; i < 3; i++) lt.layer("Shape", `Speed line ${i + 1}`, { ...rect(r2((180 + i * 90) * s), Math.max(2, r2(3 * s)), r2((firstW * 0.6 + i * 60 * s)), r2((-30 + i * 18) * s), i ? o.colorB : "#FFFFFF"), position: { value: [r2(firstW * 0.6 + i * 60 * s), r2((-30 + i * 18) * s)], modifiers: [jitter(6 * s, 20 + i)] } as never }, [phase("Line in", { start: 0.2 + i * 0.05, duration: 0.3, ease: "outExpo", reveal: "right", offsetPosition: [-120 * s, 0] }), phase("Line out", { mode: "out", start: 0.1, duration: 0.2, ease: "inExpo", reveal: "left" })], { role: "accent" });
  // name: brush first name, block last name
  const lastX = r2(o.look === "tag" ? firstW + 20 * s : firstW * 0.55), lastY = r2(nameSize * (o.look === "tag" ? 0.86 : 1.1));
  if (o.look === "tag") lt.layer("Shape", "Name box", rect(r2(firstW + 10 * s), r2(nameSize * 1.05), r2(-10 * s), r2(-nameSize * 0.12), "#FFFFFF"), [glitchIn(0.08, { stagger: 0, reveal: "right" }), glitchOut(0.2, { stagger: 0, reveal: "left" })], { role: "panel" });
  lt.layer("Text", "First name", text(o.first, { font: o.look === "tag" ? "Anton" : "Permanent Marker", size: nameSize, x: 0, y: r2(nameSize * 0.78), fill: o.look === "tag" ? "#0A0612" : "#F4F1F6", align: "left" }), [split("characters"), glitchIn(0.12), glitchOut(0.15)], { role: "title" });
  lt.layer("Text", "Last name", text(o.last, { font: o.look === "tag" ? "Anton" : "Permanent Marker", size: nameSize, x: lastX, y: lastY, fill: o.look === "tag" ? o.colorA : o.colorB, align: "left" }), [split("characters"), glitchIn(0.22), glitchOut(0.05)], { role: "title" });
  // role tag
  const roleSize = Math.round(30 * s), tagW = r2(o.role.length * roleSize * 0.62 + 24 * s), tagY = r2(lastY + roleSize * 0.6);
  lt.layer("Shape", "Role tag", rect(tagW, r2(roleSize * 1.4), 0, tagY, "#FFFFFF"), [glitchIn(0.3, { stagger: 0, reveal: "right" }), glitchOut(0.1, { stagger: 0, reveal: "left" })], { role: "panel" });
  lt.layer("Text", "Role", text(o.role, { font: "Anton", size: roleSize, x: r2(12 * s), y: r2(tagY + roleSize * 1.07), fill: "#0A0612", align: "left", tracking: 1 }), [split("characters"), glitchIn(0.36, { stagger: 0.02 }), glitchOut(0.08, { stagger: 0.015 })], { role: "subtitle" });

  const main = new Net("main", "Main_v01");
  main.layer("Shape", "Background", rect(W, H, 0, 0, o.background), [], { role: "background" });
  main.layer("Subnet", "Lower third", { position: P([r2(160 * s), r2(H - 360 * s)]) }, [], { timing: { in: 0.3, out: r2(o.duration - 0.3) }, subnet: "grunge" });
  const net = lt.network();
  net.promoted = [
    { id: "first", label: "First name", target: { node: lt.nodes.find((n) => n.name === "First name")!.id, param: "text" }, control: "text" },
    { id: "last", label: "Last name", target: { node: lt.nodes.find((n) => n.name === "Last name")!.id, param: "text" }, control: "text" },
    { id: "role", label: "Role", target: { node: lt.nodes.find((n) => n.name === "Role")!.id, param: "text" }, control: "text" },
  ] as never;
  return {
    version: 3, name, root: "main", source: { kind: "blank" }, assets: [], batches: [],
    networks: [main.network({ width: W, height: H, fps: 25, duration: o.duration } as Network["comp"]), net],
  } as SceneDoc;
}

/* ---------- checking AI recipes ---------- */

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);
const words = (v: unknown, max: number, d: string) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} &!?.,:·'\n-]/gu, "").trim().slice(0, max) : "") || d;
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

/** A sequence the AI read off a reference, cleaned; undefined when it isn't one. */
export function checkSequenceRecipe(raw: unknown): { scenes: SequenceScene[]; transitionTime: number } | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind !== "sequence" || !Array.isArray(r.scenes)) return undefined;
  const scenes = (r.scenes as Record<string, unknown>[]).slice(0, 12).map((x, i) => ({
    kind: pick(x?.kind, SCENE_KINDS, "caption"),
    text: words(x?.text, 160, "TEXT"),
    color: hex(x?.color, "#FFFFFF"),
    background: hex(x?.background, "#000000"),
    duration: r2(num(x?.duration, 0.4, 6, 1.5)),
    transition: i === 0 ? "cut" : pick(x?.transition, TRANSITIONS, "cut"),
  })) as SequenceScene[];
  return scenes.length ? { scenes, transitionTime: r2(num(r.transitionTime, 0.1, 1.5, 0.4)) } : undefined;
}

/** A grunge / glitch lower third the AI read off a reference, cleaned; undefined when it isn't one. */
export function checkLowerThirdRecipe(raw: unknown): Partial<GrungeOptions> | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind !== "lower-third") return undefined;
  const D = GRUNGE_DEFAULTS;
  return {
    first: words(r.first, 20, D.first).toUpperCase(),
    last: words(r.last, 20, D.last).toUpperCase(),
    role: words(r.role, 30, D.role).toUpperCase(),
    look: pick(r.look, GRUNGE_LOOKS, D.look),
    colorA: hex(r.colorA, D.colorA),
    colorB: hex(r.colorB, D.colorB),
    background: hex(r.background, D.background),
  };
}
