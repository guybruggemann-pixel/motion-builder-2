/**
 * Premium type presets: editorial, luxury and tech title treatments built from plain Text / Shape
 * layers, Split + Phase, gradients, blur, text keys and seeded randomness. Pure and deterministic.
 */
import type { Network, Param, SceneDoc } from "../schema";
import { Net, phase, rect, rng, text } from "./kinetic";

const P = (value: unknown): Param => ({ value: value as Param["value"] });
const r2 = (v: number) => Math.round(v * 100) / 100;
type K = { t: number; v: unknown; ease: string };
const keyed = (value: unknown, keys: K[]): Param => ({ value: value as never, keys: keys.map((k) => ({ ...k, t: r2(k.t), v: k.v as never })) });
const split = (by: "characters" | "words" | "lines") => ({ type: "Split", name: `Split ${by}`, params: { by: P(by) } });
const W = 1920, H = 1080;
const doc = (name: string, n: Net, duration: number, background: string): SceneDoc =>
  ({ version: 3, name, root: "main", source: { kind: "blank" }, assets: [], batches: [], networks: [n.network({ width: W, height: H, fps: 25, duration, background } as Network["comp"])] }) as SceneDoc;
const bg = (n: Net, fill: string, fill2?: string) => n.layer("Shape", "Background", { ...rect(W, H, 0, 0, fill), ...(fill2 ? { gradient: P("radial"), fill2: P(fill2) } : {}) }, [], { role: "background" });

/** Luxury: wide-tracked thin caps that breathe open, hairlines drawing out from the centre. */
export function luxTitle(name = "Lux title"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#1A1712", "#0B0A08");
  const size = 120, y = H / 2 + size * 0.36;
  n.layer("Text", "Title", { ...text("MAISON NOIR", { font: "Inter Tight", weight: 200, size, x: W / 2, y, fill: "#E9D9B6" }), gradient: P("linear"), fill2: P("#B08A4E"), gradientAngle: P(90), tracking: keyed(10, [{ t: 0, v: 10, ease: "outQuart" }, { t: 3.5, v: 46, ease: "linear" }]) }, [split("characters"), phase("Title in", { duration: 1.4, ease: "outQuart", stagger: 0.05, from: "center", offsetBlur: 18 })], { role: "title" });
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const w = 360, x = side < 0 ? W / 2 - 40 - w : W / 2 + 40;
    n.layer("Shape", `Hairline ${i + 1}`, { ...rect(w, 1.5, x, H / 2 + 110, "#B08A4E") }, [phase("Line in", { start: 0.6, duration: 1.2, ease: "inOutQuart", reveal: side < 0 ? "left" : "right" })], { role: "accent" });
  }
  n.layer("Text", "Sub", text("PARIS · EST. 1924", { font: "Inter Tight", weight: 400, size: 28, x: W / 2, y: H / 2 + 175, fill: "#8C7B5C", tracking: 12 }), [phase("Sub in", { start: 1.2, duration: 1, ease: "outQuart", offsetPosition: [0, 12] })], { role: "subtitle" });
  return doc(name, n, 5, "#1A1712");
}

/** Editorial: heavy and light weights mixed, lines rising out of masks, a rule drawing across. */
export function editorialSplit(name = "Editorial split"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#F1EEE8");
  const x = 160;
  n.layer("Text", "Kicker", text("ISSUE 07 — THE QUIET ISSUE", { font: "Inter Tight", weight: 600, size: 26, x, y: 230, fill: "#C2410C", align: "left", tracking: 6 }), [phase("Kicker in", { duration: 0.7, ease: "outQuart", offsetPosition: [0, 14] })], { role: "label" });
  n.layer("Shape", "Rule", rect(W - x * 2, 2, x, 262, "#141414"), [phase("Rule in", { start: 0.15, duration: 1.1, ease: "inOutQuart", reveal: "right" })], { role: "accent" });
  n.layer("Text", "Heavy", text("Less noise,", { font: "Inter Tight", weight: 800, size: 230, x: x - 8, y: 520, fill: "#141414", align: "left", tracking: -9 }), [split("words"), phase("Heavy in", { start: 0.3, duration: 1, ease: "outExpo", stagger: 0.12, reveal: "up", offsetPosition: [0, 200] })], { role: "title" });
  n.layer("Text", "Light", text("more signal.", { font: "Inter Tight", weight: 200, size: 230, x: x - 8, y: 760, fill: "#141414", align: "left", tracking: -7 }), [split("words"), phase("Light in", { start: 0.6, duration: 1, ease: "outExpo", stagger: 0.12, reveal: "up", offsetPosition: [0, 200] })], { role: "subtitle" });
  n.layer("Text", "Byline", text("Words by A. Writer", { font: "Inter Tight", weight: 400, size: 30, x, y: 900, fill: "#55514A", align: "left" }), [phase("Byline in", { start: 1.2, duration: 0.8, ease: "outQuart", offsetPosition: [0, 12] })], { role: "body" });
  return doc(name, n, 5, "#F1EEE8");
}

/** Tech: each letter cycles through random glyphs and locks in, left to right. */
export function scrambleDecode(word = "DECODE", name = "Scramble decode"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#05070A", "#000000");
  const r = rng(13), glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>/";
  const fps = 25, lockEvery = 4, settle = 0.4;
  const keys: K[] = [];
  const total = word.length * lockEvery + 8;
  for (let f = 0; f <= total; f++) {
    const locked = Math.max(0, Math.floor((f - 8) / lockEvery));
    const s = word.split("").map((c, i) => (i < locked || c === " " ? c : glyphs[Math.floor(r() * glyphs.length)]!)).join("");
    keys.push({ t: settle + f / fps, v: s, ease: "hold" });
  }
  keys.push({ t: settle + (total + 1) / fps, v: word, ease: "hold" });
  const size = 200;
  n.layer("Text", "Word", { ...text(word, { font: "JetBrains Mono", weight: 700, size, x: W / 2, y: H / 2 + size * 0.36, fill: "#7CFFB2" }), gradient: P("linear"), fill2: P("#3BC9FF"), text: keyed(keys[0]!.v, keys) }, [phase("Word in", { duration: 0.3, ease: "outQuart" })], { role: "title" });
  n.layer("Text", "Status", { ...text("ACCESS GRANTED", { font: "JetBrains Mono", weight: 400, size: 30, x: W / 2, y: H / 2 + 200, fill: "#3BC9FF", tracking: 8 }), opacity: keyed(0, [{ t: settle + total / fps + 0.2, v: 0, ease: "steps(3)" }, { t: settle + total / fps + 0.5, v: 100, ease: "linear" }]) }, [], { role: "subtitle" });
  return doc(name, n, 5, "#05070A");
}

/** Cinematic: letters bloom out of a deep blur in random order, a warm glow behind. */
export function blurBloom(name = "Blur bloom"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#0C0A14");
  n.layer("Shape", "Glow", { shape: P("ellipse"), size: P([1300, 520]), fill: P("#FF7A3D"), gradient: P("radial"), fill2: P("#FF7A3D00"), blur: P(90), position: P([310, 280]), opacity: keyed(0, [{ t: 0, v: 0, ease: "inOutSine" }, { t: 2, v: 70, ease: "linear" }]) }, [], { role: "decoration" });
  const size = 260;
  n.layer("Text", "Title", { ...text("AFTERGLOW", { font: "Inter Tight", weight: 700, size, x: W / 2, y: H / 2 + size * 0.36, fill: "#FFF4E6", tracking: -6 }), gradient: P("linear"), fill2: P("#FFB27A"), gradientAngle: P(90) }, [split("characters"), phase("Bloom", { duration: 1.6, ease: "outQuart", stagger: 0.07, from: "random", offsetBlur: 60, offsetScale: 140 })], { role: "title" });
  n.layer("Text", "Sub", text("a short film", { font: "Inter Tight", weight: 300, size: 40, x: W / 2, y: H / 2 + 230, fill: "#C9B8A6", tracking: 4 }), [phase("Sub in", { start: 1.6, duration: 1.2, ease: "outQuart", offsetBlur: 12 })], { role: "subtitle" });
  return doc(name, n, 6, "#0C0A14");
}

/** Gradient sweep: a bold word whose gradient turns around while it rises in word by word. */
export function gradientSweep(name = "Gradient sweep"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#0A0A12");
  const size = 210;
  n.layer("Text", "Title", { ...text("Built different", { font: "Inter Tight", weight: 800, size, x: W / 2, y: H / 2 + size * 0.36, fill: "#7C5CFF", tracking: -8 }), gradient: P("linear"), fill2: P("#00E0C6"), gradientAngle: keyed(0, [{ t: 0, v: 0, ease: "linear" }, { t: 5, v: 360, ease: "linear" }]) }, [split("words"), phase("Rise", { duration: 1, ease: "outExpo", stagger: 0.18, reveal: "up", offsetPosition: [0, 180] })], { role: "title" });
  return doc(name, n, 5, "#0A0A12");
}

/** Marquee: two bands of repeated type cross the frame at an angle, scrolling opposite ways. */
export function marqueeBands(name = "Marquee bands"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#F4F1EA");
  const bands = [
    { y: 380, rot: -8, fill: "#111111", ink: "#F4F1EA", dir: -1, word: "NEW SEASON" },
    { y: 700, rot: 6, fill: "#FF4D2E", ink: "#111111", dir: 1, word: "OUT NOW" },
  ];
  bands.forEach((b, i) => {
    const bh = 170, size = 120, row = Array(8).fill(b.word).join("  ✦  ");
    const unit = (b.word.length + 5) * size * 0.62;
    n.layer("Shape", `Band ${i + 1}`, { ...rect(W * 1.6, bh, -W * 0.3, b.y - bh / 2, b.fill), anchor: P([W * 0.8, bh / 2]), position: P([W / 2, b.y]), rotation: P(b.rot) }, [phase("Band in", { start: i * 0.15, duration: 0.8, ease: "outExpo", reveal: b.dir < 0 ? "right" : "left" })], { role: "panel" });
    const x0 = W / 2 + (b.dir < 0 ? 0 : -unit);
    n.layer("Text", `Band ${i + 1} text`, { ...text(row, { font: "Anton", size, x: x0, y: b.y + size * 0.36, fill: b.ink, tracking: 2 }), rotation: P(b.rot), position: keyed([x0, b.y + size * 0.36], [{ t: 0, v: [x0, b.y + size * 0.36], ease: "linear" }, { t: 6, v: [r2(x0 + b.dir * unit * 2), b.y + size * 0.36], ease: "linear" }]) }, [phase("Text in", { start: 0.3 + i * 0.15, duration: 0.6, ease: "outQuart" })], { role: "title" });
  });
  return doc(name, n, 6, "#F4F1EA");
}

/** Stacked echo: one word repeated down the frame, fading echoes slide in behind the solid one. */
export function echoStack(name = "Echo stack"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#101010");
  const size = 200, lead = 0.82, rows = 5, top = H / 2 - ((rows - 1) * size * lead) / 2 + size * 0.36;
  for (let i = 0; i < rows; i++) {
    const mid = Math.floor(rows / 2), dist = Math.abs(i - mid);
    const layer = n.layer("Text", i === mid ? "Word" : `Echo ${i + 1}`, text("MOMENTUM", { font: "Anton", size, x: W / 2, y: r2(top + i * size * lead), fill: i === mid ? "#F5F5F0" : "#F5F5F0", tracking: 4 }), [phase("In", { start: r2(dist * 0.12), duration: 0.65, ease: "outQuart", offsetPosition: [i % 2 ? -240 : 240, 0], offsetOpacity: 0 })], { role: i === mid ? "title" : "decoration" });
    if (i !== mid) layer.params.opacity = P(r2(100 - dist * 38));
  }
  return doc(name, n, 4, "#101010");
}

/** Big stat: a percentage counts up in gradient type, a bar fills beside the label. */
export function statCounter(name = "Stat counter"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#0B1020", "#05070F");
  const size = 340;
  n.layer("Text", "Number", { ...text("{n}%", { font: "Inter Tight", weight: 800, size, x: W / 2, y: 600, fill: "#7DD3FC", tracking: -14 }), gradient: P("linear"), fill2: P("#A78BFA"), gradientAngle: P(90), count: keyed(0, [{ t: 0.2, v: 0, ease: "outExpo" }, { t: 2.4, v: 98, ease: "linear" }]) }, [phase("Number in", { duration: 0.6, ease: "outQuart", offsetPosition: [0, 40], offsetBlur: 16 })], { role: "title" });
  n.layer("Shape", "Track", rect(900, 10, W / 2 - 450, 720, "#FFFFFF1A", 5), [phase("Track in", { start: 0.2, duration: 0.6, ease: "outQuart" })], { role: "panel" });
  n.layer("Shape", "Bar", { ...rect(900, 10, W / 2 - 450, 720, "#7DD3FC", 5), gradient: P("linear"), fill2: P("#A78BFA"), size: keyed([0, 10], [{ t: 0.2, v: [0, 10], ease: "outExpo" }, { t: 2.4, v: [882, 10], ease: "linear" }]) }, [], { role: "accent" });
  n.layer("Text", "Label", text("of teams ship faster", { font: "Inter Tight", weight: 400, size: 44, x: W / 2, y: 810, fill: "#C7D2FE" }), [phase("Label in", { start: 0.6, duration: 0.8, ease: "outQuart", offsetPosition: [0, 16] })], { role: "subtitle" });
  return doc(name, n, 5, "#0B1020");
}

/** Spotlight wipe: a colour block slides across revealing the word, then slides off. */
export function blockReveal(name = "Block reveal"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#0E0E0E");
  const size = 230, y = H / 2 + size * 0.36, bw = 1400, bx = W / 2 - bw / 2, by = H / 2 - size * 0.45;
  n.layer("Text", "Word", { ...text("REVEALED", { font: "Inter Tight", weight: 900, size, x: W / 2, y, fill: "#FFFFFF", tracking: -6 }), opacity: keyed(0, [{ t: 0.55, v: 0, ease: "hold" }, { t: 0.56, v: 100, ease: "linear" }]) }, [], { role: "title" });
  n.layer("Shape", "Block", { ...rect(bw, size * 0.9, bx, by, "#FFD400"), anchor: P([0, 0]), size: keyed([0, size * 0.9], [{ t: 0, v: [0, size * 0.9], ease: "inOutExpo" }, { t: 0.55, v: [bw, size * 0.9], ease: "inOutExpo" }, { t: 1.1, v: [0, size * 0.9], ease: "linear" }]), position: keyed([bx, by], [{ t: 0.55, v: [bx, by], ease: "inOutExpo" }, { t: 1.1, v: [bx + bw, by], ease: "linear" }]) }, [], { role: "accent" });
  n.layer("Text", "Sub", text("then the details, calmly", { font: "Inter Tight", weight: 400, size: 40, x: W / 2, y: y + 110, fill: "#9A9A9A" }), [phase("Sub in", { start: 1.2, duration: 0.8, ease: "outQuart", offsetPosition: [0, 14] })], { role: "subtitle" });
  return doc(name, n, 4, "#0E0E0E");
}

/** Wave type: letters ride a sine wave in on a spring and keep floating gently. */
export function waveLetters(name = "Wave letters"): SceneDoc {
  const n = new Net("main", "Main_v01");
  bg(n, "#FFE8D6");
  const word = "FLOAT", size = 300, adv = size * 0.66, x0 = W / 2 - ((word.length - 1) * adv) / 2;
  word.split("").forEach((c, i) => {
    const x = r2(x0 + i * adv), y = r2(H / 2 + size * 0.36);
    n.layer("Text", `Letter ${c}`, { ...text(c, { font: "Inter Tight", weight: 800, size, x, y, fill: "#FF5A36" }), gradient: P("linear"), fill2: P("#FF2E88"), gradientAngle: P(90), position: { value: [x, y], modifiers: [{ id: `w${i}`, type: "wave", enabled: true, blend: "add", params: { amplitude: 26, frequency: 0.5, phase: i * 50, axis: "y" } }] } as never }, [phase("In", { start: r2(i * 0.08), duration: 1, ease: "spring(0.5,900)", offsetPosition: [0, 300], offsetRotation: -20 })], { role: "title" });
  });
  return doc(name, n, 6, "#FFE8D6");
}
