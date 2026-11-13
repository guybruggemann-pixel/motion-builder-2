/**
 * The Import preset library: 50 ready-made starts (2D motion, kinetic type, 3D type, lower thirds,
 * shapes). Each is a plain doc: 2D presets are imported-style layers with a DraftSpec on top, 3D
 * presets are the 3D title with other text, materials and keys. Pure and deterministic.
 */
import { buildDesignDoc, applyDraftSpec, type DraftSpec, type ImportLayer, type RoleMotion } from "../importDraft";
import { title3d } from "../examples/title3d";
import { waveWall } from "../examples/waveWall";
import { typeCube } from "./cube";
import { colorWall } from "./colorWall";
import { groeneClubBumper } from "./bumper";
import type { SceneDoc, Node, Network, Param, Value } from "../schema";
import { cloneRandom } from "../clone";
import { boxPoster, cardTrail, counterPill, cursorClick, floatingCards, glowBackground, saasPromo, saasSuperpowers, squashStretch, squiggleOverlay, wordFollow } from "./showcase";
import { blockReveal, blurBloom, echoStack, editorialSplit, gradientSweep, luxTitle, marqueeBands, scrambleDecode, statCounter, waveLetters } from "./premium";
import { buildSequence, grungeLowerThird, PROMO_SCENES, versusScenes, type SequenceScene } from "./kinetic";

export type PresetCategory = "premium" | "2d" | "type" | "3d" | "lower" | "shape";
export const PRESET_CATEGORIES: { id: PresetCategory; name: string }[] = [
  { id: "premium", name: "Premium type" },
  { id: "2d", name: "2D motion" },
  { id: "type", name: "Kinetic type" },
  { id: "3d", name: "3D type" },
  { id: "lower", name: "Lower thirds" },
  { id: "shape", name: "Shapes" },
];

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  desc: string;
  build(): SceneDoc;
}

const M = (m: Partial<RoleMotion>): RoleMotion => ({ ease: "outQuart", duration: 0.8, stagger: 0.05, offset: [0, 30], scale: 100, rotation: 0, opacity: 0, blur: 0, reveal: "none", split: "none", from: "first", ...m });
const spec = (name: string, desc: string, gap: number, motion: Partial<RoleMotion>, byRole?: DraftSpec["byRole"]): DraftSpec => ({ name, desc, gap, motion: M(motion), byRole });
const still: Partial<RoleMotion> = { enabled: false, offset: [0, 0], scale: 100, reveal: "none", split: "none", duration: 0.5, ease: "outQuart" };

const T = (name: string, text: string, size: number, x: number, y: number, o: Partial<{ weight: number; fill: string; role: ImportLayer["role"] }> = {}): ImportLayer => ({ kind: "text", name, text, size, weight: o.weight ?? 700, fill: o.fill ?? "#FFFFFF", position: [x, y], role: o.role });
const R = (name: string, w: number, h: number, x: number, y: number, fill: string, o: Partial<{ radius: number; role: ImportLayer["role"] }> = {}): ImportLayer => ({ kind: "rect", name, size: [w, h], fill, position: [x, y], radius: o.radius, role: o.role });
const E = (name: string, d: number, x: number, y: number, fill: string, role: ImportLayer["role"] = "accent"): ImportLayer => ({ kind: "ellipse", name, size: [d, d], fill, position: [x, y], role });
const BG = (fill: string) => R("Background", 1920, 1080, 0, 0, fill, { role: "background" });

const flat = (name: string, layers: ImportLayer[], s: DraftSpec, duration = 5): SceneDoc => {
  const base = buildDesignDoc({ name, width: 1920, height: 1080, duration, layers, source: "blank" });
  const ordered = base.networks[0]?.nodes.filter((n) => n.type === "Text" || n.type === "Shape") ?? [];
  const priority: Record<string, number> = { background: 0, panel: 1, decoration: 1, accent: 2, logo: 3, title: 4, subtitle: 5, body: 6, label: 6 };
  ordered.sort((a, b) => (priority[a.role ?? "title"] ?? 4) - (priority[b.role ?? "title"] ?? 4));
  let titleReady = 0;
  const lower = ["Classic bar", "Pill tag", "Minimal line", "News strap"].includes(name);
  const byLayer = ordered.map((n, i) => {
    const m = { ...s.motion, ...s.byRole?.[n.role ?? "none"] };
    let start = m.start ?? i * s.gap;
    if (n.role === "subtitle" || n.role === "body") start = Math.max(start, titleReady + 0.12);
    if (n.role === "title") {
      const content = String(n.params.text?.value ?? "");
      const parts = m.split === "characters" ? content.length : m.split === "words" ? content.split(/\s+/).length : m.split === "lines" ? content.split("\n").length : 1;
      titleReady = Math.max(titleReady, start + m.duration + Math.max(0, parts - 1) * m.stagger);
    }
    return { node: n.id, motion: { start }, ...(lower ? { out: { start: n.role === "title" || n.role === "subtitle" ? 0.18 : 0, duration: 0.32, ease: "inQuart", offset: [0, 0] as [number, number], split: "none" as const, stagger: 0, reveal: n.type === "Shape" ? "left" as const : "none" as const } } : {}) };
  });
  const doc = applyDraftSpec(base, { ...s, byLayer });
  if (name === "Dot burst") {
    for (const layer of doc.networks[0]?.nodes ?? []) {
      if (!layer.name.startsWith("Dot ")) continue;
      const end = layer.params.position?.value;
      if (!Array.isArray(end) || end.length !== 2) continue;
      const delay = Math.max(0, Number(layer.name.slice(4)) - 1) * 0.025;
      layer.params.position = { value: end, keys: [
        { t: delay, v: [925, 505], ease: "outCubic" },
        { t: delay + 0.65, v: end, ease: "hold" },
      ] };
    }
  }
  return doc;
};

/** The 3D title with other text, material and turn. */
const three = (name: string, text: string, mat: { kind: string; color: string; roughness?: number; metalness?: number }, rot: [number, number, number][], o: Partial<{ bg: string; size: number; depth: number; label: string }> = {}): SceneDoc => {
  const d: SceneDoc = structuredClone(title3d);
  d.name = name;
  const main = d.networks.find((n) => n.id === d.root);
  const scene = d.networks.find((n) => n.id === "title-3d");
  const word = scene?.nodes.find((n) => n.id === "word");
  const m = scene?.nodes.find((n) => n.type === "Material");
  if (!main?.comp || !scene || !word || !m || !rot[0]) throw new Error("The title3d pipeline is incomplete.");
  main.name = "Main_v01";
  if (o.bg) main.comp = { ...main.comp, background: o.bg };
  for (const n of main.nodes) if (n.type === "Text") n.params.text = { value: o.label ?? "" };
  word.params.text = { value: text };
  if (o.size) word.params.size = { value: o.size };
  if (o.depth) word.params.depth = { value: o.depth };
  const loop = name === "Chrome spin" || name === "Glass drift";
  const poses = loop ? [...rot, rot[0]] : name === "Gold flip" ? [...rot.slice(0, 3), rot[2] ?? rot[0]] : rot;
  const times = name === "Gold flip" ? [0, 0.65, 1.05, 6] : name === "Plaster tilt" ? [0, 1.2, 6] : poses.map((_, i) => i * 6 / Math.max(1, poses.length - 1));
  word.params.rotation = { value: rot[0], keys: poses.map((v, i) => ({ t: times[i] ?? 6, v, ease: name === "Gold flip" ? i === 0 ? "outCubic" : i === 1 ? "inOutSine" : "hold" : "inOutSine" })) };
  m.name = mat.kind;
  m.params = { kind: { value: mat.kind }, color: { value: mat.color }, roughness: { value: mat.roughness ?? 0.3 }, ...(mat.kind === "glass" ? { transmission: { value: 0.95 }, ior: { value: 1.5 }, thickness: { value: 0.5 } } : {}), ...(mat.metalness !== undefined ? { metalness: { value: mat.metalness } } : {}) };
  return d;
};

const SQ = 1080;
const seq = (name: string, scenes: SequenceScene[]): SceneDoc => buildSequence({ name, width: SQ, height: SQ, scenes, transitionTime: 0.4 });
const RED = "#E8002D", OXBLOOD = "#5C0000";

const NAVY = "#0E1630", INK = "#0B0C0F", CREAM = "#F2EDE4", ORANGE = "#FF6A2B", LIME = "#C8F04A", PINK = "#FF4F8B", BLUE = "#3B6CFF";

export type ProceduralAsset = "gooey-paint-splash" | "sparkle-burst" | "glass-ui-pill" | "kinetic-grid";

/** Editable procedural artwork; seeded randomness and ordinary nodes only. */
export const assetFactory = (kind: ProceduralAsset): SceneDoc => {
  const names: Record<ProceduralAsset, string> = { "gooey-paint-splash": "Gooey Paint Splash", "sparkle-burst": "Sparkle Burst", "glass-ui-pill": "Glass UI Pill", "kinetic-grid": "Kinetic Grid" };
  const name = names[kind];
  const param = (value: Value): Param => ({ value });
  const node = (id: string, type: string, params: Record<string, Param>, index: number, label = id): Node => ({ id, type, name: label, enabled: true, params, ui: { x: 0, y: index * 120 } });
  if (kind === "glass-ui-pill") {
    const doc = structuredClone(title3d);
    doc.name = name;
    const main = doc.networks.find((n) => n.id === doc.root);
    const scene = doc.networks.find((n) => n.id === "title-3d");
    const word = scene?.nodes.find((n) => n.id === "word");
    const material = scene?.nodes.find((n) => n.type === "Material");
    if (!main || !scene || !word || !material) throw new Error("The title3d pipeline is incomplete.");
    main.nodes = main.nodes.filter((n) => n.id !== "label");
    main.wires = main.wires.filter((w) => w.from.node !== "label");
    word.type = "Shape3D"; word.name = "Glass capsule";
    word.params = { shape: param("capsule"), size: param([760, 240]), depth: param(240), bevel: param(0),
      position: { value: [0, -50, 0], keys: [{ t: 0, v: [0, -50, 0], ease: "inOutSine" }, { t: 3, v: [0, 50, 0], ease: "inOutSine" }, { t: 6, v: [0, -50, 0], ease: "linear" }] },
      rotation: { value: [-15, 0, 0], keys: [{ t: 0, v: [-15, 0, 0], ease: "inOutSine" }, { t: 3, v: [15, 0, 0], ease: "inOutSine" }, { t: 6, v: [-15, 0, 0], ease: "linear" }] },
    };
    material.name = "Glass";
    material.params = { kind: param("glass"), color: param("#FFFFFF"), roughness: param(0.1), transmission: param(0.95), ior: param(1.5), thickness: param(0.5), clearcoat: param(1) };
    return doc;
  }
  const count = kind === "gooey-paint-splash" ? 8 : kind === "sparkle-burst" ? 12 : 9;
  const nodes: Node[] = Array.from({ length: count }, (_, i) => {
    if (kind === "gooey-paint-splash") {
      const angle = cloneRandom(73, i, 0) * Math.PI * 2;
      const distance = cloneRandom(73, i, 1) * 170;
      const size = 160 + cloneRandom(73, i, 2) * 140;
      const x = 960 + Math.cos(angle) * distance, y = 540 + Math.sin(angle) * distance;
      return node(`ellipse-${i + 1}`, "Shape", { shape: param("ellipse"), size: param([size, size]), anchor: param([size / 2, size / 2]), fill: param(PINK),
        position: { value: [x, y], modifiers: [{ id: "flow", type: "wave", enabled: true, blend: "add", params: { amplitude: 24, frequency: 0.25, phase: i * 45, axis: i % 2 ? "x" : "y" } }] },
      }, i, `Paint ${i + 1}`);
    }
    if (kind === "sparkle-burst") {
      const angle = i * Math.PI * 2 / count;
      const delay = i * 0.018;
      return node(`ray-${i + 1}`, "Shape", { shape: param("rect"), size: param([140, 12]), anchor: param([0, 6]), fill: param(LIME), rotation: param(i * 360 / count),
        position: { value: [960, 540], keys: [{ t: delay, v: [960, 540], ease: "outQuart" }, { t: delay + 0.5, v: [960 + Math.cos(angle) * 260, 540 + Math.sin(angle) * 260], ease: "linear" }] },
        scale: { value: [0, 0], keys: [{ t: delay, v: [0, 0], ease: "outExpo" }, { t: delay + 0.15, v: [100, 100], ease: "inQuad" }, { t: delay + 0.55, v: [50, 50], ease: "linear" }] },
        opacity: { value: 100, keys: [{ t: delay + 0.2, v: 100, ease: "inQuad" }, { t: delay + 0.55, v: 0, ease: "linear" }] },
      }, i, `Ray ${i + 1}`);
    }
    return node(`tile-${i + 1}`, "Shape", { shape: param("rect"), size: param([150, 150]), anchor: param([75, 75]), position: param([770 + i % 3 * 190, 350 + Math.floor(i / 3) * 190]), fill: param([BLUE, PINK, LIME][i % 3] ?? BLUE),
      scale: { value: [0, 0], keys: [{ t: 0, v: [0, 0], ease: "outQuart" }, { t: 0.35, v: [100, 100], ease: "linear" }], modifiers: [{ id: "sequence", type: "stagger", enabled: true, blend: "add", params: { each: 0.08, from: "first", index: i, parts: 9 } }] },
    }, i, `Tile ${i + 1}`);
  });
  nodes.push(node("merge", "Merge", {}, count));
  nodes.push(node("out", "Output", {}, count + 2));
  const duration = kind === "sparkle-burst" ? 1.2 : 4;
  const inner: Network = { id: "asset", name, comp: { width: 1920, height: 1080, fps: 25, duration }, output: "out", nodes,
    wires: [...nodes.slice(0, count).map((n) => ({ from: { node: n.id, port: "out" }, to: { node: "merge", port: "in" } })),
      { from: { node: "merge", port: "out" }, to: { node: "out", port: "in" } }],
  };
  const instance = node("artwork", "Subnet", kind === "gooey-paint-splash" ? { blur: param(26), alphaThreshold: param(0.42) } : {}, 0, name);
  instance.subnet = inner.id;
  return { version: 3, name, root: "main", assets: [], batches: [], networks: [{ id: "main", name: "Main_v01", comp: { width: 1920, height: 1080, fps: 25, duration }, output: "out", nodes: [instance, node("out", "Output", {}, 1)], wires: [{ from: { node: "artwork", port: "out" }, to: { node: "out", port: "in" } }] }, inner] };
};

export const PRESETS: Preset[] = [
  // Premium type
  { id: "lux-title", name: "Lux title", category: "premium", desc: "Thin gold caps breathe open, hairlines draw out.", build: () => luxTitle() },
  { id: "editorial-split", name: "Editorial split", category: "premium", desc: "Heavy and light lines rise from masks, a rule draws.", build: () => editorialSplit() },
  { id: "scramble-decode", name: "Scramble decode", category: "premium", desc: "Letters cycle random glyphs, then lock in.", build: () => scrambleDecode() },
  { id: "blur-bloom", name: "Blur bloom", category: "premium", desc: "Letters bloom out of a deep blur, warm glow behind.", build: () => blurBloom() },
  { id: "gradient-sweep", name: "Gradient sweep", category: "premium", desc: "Bold words rise while their gradient turns.", build: () => gradientSweep() },
  { id: "marquee-bands", name: "Marquee bands", category: "premium", desc: "Two angled bands of type scroll opposite ways.", build: () => marqueeBands() },
  { id: "echo-stack", name: "Echo stack", category: "premium", desc: "A word with fading echoes sliding in around it.", build: () => echoStack() },
  { id: "stat-counter", name: "Stat counter", category: "premium", desc: "A gradient percentage counts up, a bar fills.", build: () => statCounter() },
  { id: "block-reveal", name: "Block reveal", category: "premium", desc: "A colour block wipes on and off, revealing the word.", build: () => blockReveal() },
  { id: "wave-letters", name: "Wave letters", category: "premium", desc: "Letters spring in on a wave and keep floating.", build: () => waveLetters() },

  // 2D motion
  { id: "brand-reveal", name: "Brand reveal", category: "2d", desc: "Panel wipes open, logo mark pops, tagline rises.", build: () => flat("Brand reveal", [BG(INK), R("Panel", 900, 260, 510, 410, ORANGE, { role: "panel", radius: 12 }), E("Mark", 120, 560, 480, CREAM, "logo"), T("Brand", "NORTHWIND", 96, 720, 470, { role: "title" }), T("Tagline", "Built for the long run", 36, 720, 590, { role: "subtitle", weight: 400 })], spec("Brand reveal", "Wipe, pop, rise.", 0.15, { ease: "outExpo", duration: 0.6, reveal: "right", offset: [0, 0] }, { background: still, logo: { reveal: "none", scale: 0, ease: "spring(0.6,700)" }, title: { reveal: "up", split: "characters", stagger: 0.03 }, subtitle: { reveal: "none", offset: [0, 24] } })) },
  { id: "card-stack", name: "Card stack", category: "2d", desc: "Three cards slide up one after another, then the headline.", build: () => flat("Card stack", [BG(CREAM), R("Card 1", 420, 520, 260, 300, BLUE, { role: "panel", radius: 24 }), R("Card 2", 420, 520, 750, 280, PINK, { role: "panel", radius: 24 }), R("Card 3", 420, 520, 1240, 260, LIME, { role: "panel", radius: 24 }), T("Headline", "Three ways in", 84, 260, 140, { fill: INK, role: "title" })], spec("Card stack", "Staggered card slide.", 0.12, { ease: "spring(0.5,800)", duration: 0.8, offset: [0, 200], scale: 90 }, { background: still, title: { offset: [0, 40], ease: "outQuart" } })) },
  { id: "stat-pop", name: "Stat pop", category: "2d", desc: "A big number pops with a spring, label fades up.", build: () => flat("Stat pop", [BG(BLUE), E("Halo", 520, 700, 280, "#FFFFFF22", "decoration"), T("Number", "87%", 220, 760, 440, { role: "title", weight: 800 }), T("Label", "of viewers watch to the end", 40, 700, 700, { role: "subtitle", weight: 400 })], spec("Stat pop", "Spring pop.", 0.15, { ease: "spring(0.7,800)", duration: 0.9, scale: 40, offset: [0, 0] }, { background: still, subtitle: { scale: 100, offset: [0, 30], ease: "outQuart" } })) },

  { id: "floating-cards", name: "Floating cards", category: "2d", desc: "Tilted cards drift on smooth looping orbits.", build: () => floatingCards() },
  { id: "card-trail", name: "Card trail", category: "2d", desc: "A diagonal line of tiles flowing corner to corner.", build: () => cardTrail() },
  { id: "cursor-click", name: "Cursor click", category: "2d", desc: "A cursor flies in and clicks a button.", build: () => cursorClick() },

  // Kinetic type
  { id: "word-slam", name: "Word slam", category: "type", desc: "Words slam in one by one, huge and fast.", build: () => flat("Word slam", [BG(INK), T("Headline", "MAKE IT LOUD", 220, 160, 400, { role: "title", weight: 900 })], spec("Word slam", "Word by word, from 180%.", 0.1, { ease: "outExpo", duration: 0.35, split: "words", stagger: 0.18, scale: 180, offset: [0, 0] }, { background: still })) },
  { id: "typewriter", name: "Typewriter", category: "type", desc: "Letters type on, the line underneath follows.", build: () => flat("Typewriter", [BG(CREAM), T("Line", "Once upon a deadline…", 110, 200, 440, { role: "title", fill: INK, weight: 500 }), T("Sub", "a story about shipping", 40, 204, 590, { role: "subtitle", fill: "#55514A", weight: 400 })], spec("Typewriter", "Stepped letters.", 0.6, { ease: "steps(1)", duration: 0.05, split: "characters", stagger: 0.06, offset: [0, 0] }, { background: still, subtitle: { split: "none", duration: 0.6, ease: "outQuart", offset: [0, 20] } })) },
  { id: "letter-cascade", name: "Letter cascade", category: "type", desc: "Letters fan out from the centre on a gentle spring.", build: () => flat("Letter cascade", [BG(NAVY), T("Word", "CASCADE", 240, 420, 420, { role: "title", weight: 800 })], spec("Letter cascade", "From the centre.", 0.1, { ease: "spring(0.4,1000)", duration: 0.9, split: "characters", stagger: 0.05, from: "center", offset: [0, 120], rotation: -12 }, { background: still })) },
  { id: "line-reveal", name: "Line reveal", category: "type", desc: "Lines rise out of a mask, editorial and calm.", build: () => flat("Line reveal", [BG(INK), T("Lines", "Design is\nhow it works", 150, 200, 300, { role: "title", weight: 600 }), T("Credit", "— S. Jobs", 40, 206, 760, { role: "subtitle", weight: 400 })], spec("Line reveal", "Masked lines.", 0.4, { ease: "outQuart", duration: 1, split: "lines", stagger: 0.15, reveal: "up", offset: [0, 80] }, { background: still, subtitle: { split: "none", reveal: "none" } })) },
  { id: "blur-in", name: "Focus pull", category: "type", desc: "Text sharpens from a soft blur, cinematic.", build: () => flat("Focus pull", [BG("#101418"), T("Title", "AFTER DARK", 200, 440, 420, { role: "title", weight: 300 }), T("Sub", "a film by nobody", 40, 760, 660, { role: "subtitle", weight: 400 })], spec("Focus pull", "Blur to sharp.", 0.5, { ease: "inOutSine", duration: 1.6, blur: 30, offset: [0, 0], scale: 110, split: "characters", stagger: 0.04, from: "random" }, { background: still, subtitle: { split: "none", scale: 100 } }), 6) },

  { id: "countdown-push", name: "Countdown push", category: "type", desc: "Huge numbers push each other off the frame.", build: () => seq("Countdown push", [{ kind: "countdown", text: "3\n2\n1", color: "#A6A7B0", background: "#E3E5EA", duration: 2.4, transition: "cut" }]) },
  { id: "repeat-scroll", name: "Repeat & scroll", category: "type", desc: "Giant words land, then repeat and slide sideways.", build: () => seq("Repeat & scroll", [{ kind: "repeat", text: "LIVE\nNOW", color: RED, background: OXBLOOD, duration: 3, transition: "cut" }]) },
  { id: "line-build", name: "Line build", category: "type", desc: "Lines snap on one by one, filling the frame.", build: () => seq("Line build", [{ kind: "lines", text: "FRONT\nROW IS\nWHERE\nYOU ARE", color: OXBLOOD, background: RED, duration: 3, transition: "cut" }]) },
  { id: "vertical-ticker", name: "Vertical ticker", category: "type", desc: "One word stacked and scrolling up for ever.", build: () => seq("Vertical ticker", [{ kind: "ticker", text: "TONIGHT", color: RED, background: OXBLOOD, duration: 3, transition: "cut" }]) },
  { id: "info-card", name: "Info card", category: "type", desc: "Icon rows of event details come in one by one.", build: () => seq("Info card", [{ kind: "info", text: "Thursday, Jun 22 · 8:00 PM\nRewatch for 24 hours\nDolby Atmos · Global\n5h 30m", color: "#FFFFFF", background: "#000000", duration: 3, transition: "cut" }]) },
  { id: "promo-sequence", name: "Promo sequence", category: "type", desc: "A full promo: countdown, big type, ticker, details.", build: () => seq("Promo sequence", PROMO_SCENES) },

  { id: "word-follow", name: "Word follow", category: "type", desc: "Words slide in, the camera follows, gradient type.", build: () => wordFollow() },
  { id: "counter-pill", name: "Counter pill", category: "type", desc: "A number counts up in a pill, rings pulse out.", build: () => counterPill() },
  { id: "saas-promo", name: "SaaS promo", category: "type", desc: "Sentence, glow, counter and a button click.", build: () => saasPromo() },
  { id: "saas-superpowers", name: "SaaS rebuild: Superpowers", category: "type", desc: "Rebuilt from your superpowers clip: words, huge line, 7x→10x, click.", build: () => saasSuperpowers() },
  { id: "versus-title", name: "Versus title", category: "type", desc: "Stacked word zooms, letters jumble, then a split screen.", build: () => buildSequence({ name: "Versus title", width: 1080, height: 1080, scenes: versusScenes(), transitionTime: 0.3 }) },
  { id: "box-poster", name: "Box poster", category: "type", desc: "Coloured boxes of squashed words with squiggles.", build: () => boxPoster() },
  { id: "squash-stretch", name: "Squash & stretch", category: "type", desc: "One word squashing to fill its box, doubling up.", build: () => squashStretch() },

  // 3D type
  { id: "chrome-spin", name: "Chrome spin", category: "3d", desc: "Chrome letters turn under a studio light.", build: () => three("Chrome spin", "CHROME", { kind: "metal", color: "#D3D8DA", roughness: 0.04, metalness: 1 }, [[10, -40, 0], [-10, 40, 0]]) },
  { id: "gold-flip", name: "Gold flip", category: "3d", desc: "Heavy gold word flips forward and settles.", build: () => three("Gold flip", "GOLD", { kind: "metal", color: "#FFE496", roughness: 0.15, metalness: 1 }, [[-80, 0, 0], [8, 0, 0], [0, 0, 0], [0, 10, 0]], { size: 360, depth: 120 }) },
  { id: "glass-drift", name: "Glass drift", category: "3d", desc: "Glass title drifts slowly, catching reflections.", build: () => three("Glass drift", "CLEAR", { kind: "glass", color: "#FFFFFF", roughness: 0.05 }, [[5, -20, -3], [-5, 20, 3]], { bg: "#1A2238" }) },
  { id: "wave-wall", name: "Wave wall", category: "3d", desc: "A wall of extruded type, rows waving and rocking in a loop.", build: () => waveWall({}, "Wave wall") },
  { id: "type-cube", name: "Type cube", category: "3d", desc: "Words wrapped round a box, each row turning on its own, one after another.", build: () => typeCube({}, "Type cube") },
  { id: "color-wall", name: "Colour wall", category: "3d", desc: "Chunky 3D words in blues, purples and pink, rows sliding; the camera swings from a tilted view to the front.", build: () => colorWall({}, "Colour wall") },
  { id: "plaster-tilt", name: "Plaster tilt", category: "3d", desc: "Matte stone type tilts in with a quiet label.", build: () => three("Plaster tilt", "QUIET", { kind: "plaster", color: "#ECE8E1", roughness: 0.9 }, [[30, 0, 0], [0, -10, 0], [0, 10, 0]], { label: "VOLUME ONE" }) },

  // Lower thirds
  { id: "lt-classic", name: "Classic bar", category: "lower", desc: "Bar wipes in, name and role rise out of it.", build: () => flat("Classic bar", [R("Bar", 760, 150, 120, 820, NAVY, { role: "panel", radius: 6 }), R("Accent", 12, 150, 120, 820, ORANGE, { role: "accent" }), T("Name", "Ada Lovelace", 64, 170, 880, { role: "title" }), T("Role", "Engineer, Analytical Engines", 30, 172, 916, { role: "subtitle", weight: 400 })], spec("Classic bar", "Wipe then rise.", 0.12, { ease: "outExpo", duration: 0.5, reveal: "right", offset: [0, 0] }, { title: { reveal: "up", offset: [0, 30] }, subtitle: { reveal: "up", offset: [0, 20] } })) },
  { id: "lt-pill", name: "Pill tag", category: "lower", desc: "Rounded pill springs in with a live dot.", build: () => flat("Pill tag", [R("Pill", 620, 110, 120, 860, "#FFFFFF", { role: "panel", radius: 55 }), E("Dot", 34, 160, 898, "#FF3B30"), T("Name", "LIVE · Studio 4", 46, 214, 888, { role: "title", fill: INK })], spec("Pill tag", "Bouncy pill.", 0.12, { ease: "spring(0.6,700)", duration: 0.7, scale: 60, offset: [0, 40] }, { accent: { scale: 0 }, title: { scale: 100, offset: [-20, 0], ease: "outQuart" } })) },
  { id: "lt-minimal", name: "Minimal line", category: "lower", desc: "A thin line draws, then the type fades in beside it.", build: () => flat("Minimal line", [R("Line", 4, 140, 120, 820, "#FFFFFF", { role: "accent" }), T("Name", "Grace Hopper", 58, 150, 830, { role: "title", weight: 500 }), T("Role", "Rear Admiral, US Navy", 30, 152, 902, { role: "subtitle", weight: 300 })], spec("Minimal line", "Line, then type.", 0.25, { ease: "outQuart", duration: 0.8, offset: [-30, 0] }, { accent: { reveal: "down", offset: [0, 0], duration: 0.5 } })) },
  { id: "lt-news", name: "News strap", category: "lower", desc: "Two-tone news strap, punchy and fast.", build: () => flat("News strap", [R("Label", 260, 80, 0, 860, "#D7262E", { role: "accent" }), R("Strap", 1920, 80, 260, 860, "#FFFFFF", { role: "panel" }), T("Tag", "BREAKING", 40, 30, 876, { role: "label" }), T("Headline", "Markets close at record high", 44, 300, 874, { role: "title", fill: INK, weight: 600 })], spec("News strap", "Fast wipes.", 0.08, { ease: "outExpo", duration: 0.35, reveal: "right", offset: [0, 0] }, { title: { reveal: "up", split: "words", stagger: 0.04 } })) },

  { id: "lt-grunge-brush", name: "Grunge brush", category: "lower", desc: "Brush name glitches in over paint strokes.", build: () => grungeLowerThird({ look: "brush" }, "Grunge brush") },
  { id: "lt-grunge-tag", name: "Grunge tag", category: "lower", desc: "Name in a white box, glitchy letters, role tag.", build: () => grungeLowerThird({ look: "tag", first: "KENNY", last: "CLARK", role: "SCREENWRITER" }, "Grunge tag") },
  { id: "lt-grunge-guy", name: "Grunge title: Guy", category: "lower", desc: "Built from the grunge reference: snappy brush title, tight glitch in and out.", build: () => grungeLowerThird({ look: "brush", first: "GUY IS THE", last: "MOST AWESOME", role: "PERSON IN THE UNIVERSE", tempo: 0.65, duration: 4.5 }, "Grunge title: Guy") },
  { id: "lt-grunge-splash", name: "Paint splash", category: "lower", desc: "Paint splats and speed lines, name jitters.", build: () => grungeLowerThird({ look: "splash", first: "JAKE", last: "PARKER", role: "PRODUCER", colorA: "#B6F23A", colorB: "#FF3FD0" }, "Paint splash") },

  // Shapes
  { id: "groene-club-bumper", name: "De Groene Club bumper", category: "2d", desc: "1 s logo bumper: recycling arrows spin together and shrink into the wordmark.", build: () => groeneClubBumper() },
  { id: "gooey-paint-splash", name: "Gooey Paint Splash", category: "shape", desc: "Eight paint droplets fuse into a flowing liquid silhouette.", build: () => assetFactory("gooey-paint-splash") },
  { id: "sparkle-burst", name: "Sparkle Burst", category: "shape", desc: "Twelve radial rays expand and fade in a fast staggered burst.", build: () => assetFactory("sparkle-burst") },
  { id: "glass-ui-pill", name: "Glass UI Pill", category: "shape", desc: "A glass capsule floats vertically and rocks around its X axis.", build: () => assetFactory("glass-ui-pill") },
  { id: "kinetic-grid", name: "Kinetic Grid", category: "shape", desc: "Nine tiles scale up sequentially across a three-by-three grid.", build: () => assetFactory("kinetic-grid") },
  { id: "glow-background", name: "Glow background", category: "shape", desc: "Soft blurred colour blobs drifting slowly.", build: () => glowBackground() },
  { id: "squiggles", name: "Squiggle overlay", category: "shape", desc: "White squiggles drawing on and fading.", build: () => squiggleOverlay() },
  { id: "dot-burst", name: "Dot burst", category: "shape", desc: "A ring of dots pops out from the middle.", build: () => flat("Dot burst", [BG(INK), ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return E(`Dot ${i + 1}`, 70, Math.round(925 + Math.cos(a) * 300), Math.round(505 + Math.sin(a) * 300), [ORANGE, PINK, LIME, BLUE][i % 4]!); }), E("Core", 160, 880, 460, CREAM, "panel")], spec("Dot burst", "Spring pops, edges first.", 0.06, { ease: "spring(0.7,600)", duration: 0.8, scale: 0, offset: [0, 0] }, { background: still })) },
  { id: "bars-grow", name: "Bar chart", category: "shape", desc: "Bars grow up from the baseline, one after another.", build: () => flat("Bar chart", [BG(CREAM), ...[260, 420, 340, 600, 480].map((h, i) => R(`Bar ${i + 1}`, 160, h, 420 + i * 220, 900 - h, i === 3 ? ORANGE : NAVY, { role: "panel", radius: 8 })), T("Title", "Growth, 2022–26", 64, 420, 120, { role: "title", fill: INK })], spec("Bar chart", "Bars reveal upward.", 0.1, { ease: "outQuart", duration: 0.8, reveal: "up", offset: [0, 0] }, { background: still, title: { reveal: "none", offset: [0, 30] } })) },
  { id: "shape-shuffle", name: "Shape shuffle", category: "shape", desc: "Circles, squares and pills drop in at random.", build: () => flat("Shape shuffle", [BG(BLUE), E("Circle", 300, 300, 260, LIME), R("Square", 260, 260, 800, 520, PINK, { role: "decoration", radius: 30 }), R("Pill", 480, 160, 1200, 240, CREAM, { role: "decoration", radius: 80 }), E("Small", 140, 1420, 700, ORANGE)], spec("Shape shuffle", "Random drops.", 0.05, { ease: "spring(0.6,800)", duration: 0.9, offset: [0, -500], rotation: 25, from: "random" }, { background: still })) },
  { id: "wipe-transition", name: "Colour wipe", category: "shape", desc: "Three colour bands wipe across, a transition.", build: () => flat("Colour wipe", [R("Band 1", 1920, 1080, 0, 0, ORANGE, { role: "panel" }), R("Band 2", 1920, 1080, 0, 0, PINK, { role: "panel" }), R("Band 3", 1920, 1080, 0, 0, NAVY, { role: "panel" }), T("Next", "NEXT UP", 160, 600, 450, { role: "title", weight: 900 })], spec("Colour wipe", "Stacked wipes.", 0.12, { ease: "inOutExpo", duration: 0.6, reveal: "right", offset: [0, 0] }, { title: { reveal: "up", split: "characters", stagger: 0.03 } }), 3) },
];
