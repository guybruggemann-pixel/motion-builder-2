/**
 * Browser side of Import: reads an SVG or a PNG/JPG into ImportLayers for `buildDesignDoc`.
 * SVG: rects, circles/ellipses, text and embedded images, with translate() on groups. Paths,
 * gradients and other transforms are skipped and reported, so nothing is silently wrong.
 */
import type { ImportLayer } from "@core/scene";

export interface Parsed {
  width: number;
  height: number;
  layers: ImportLayer[];
  skipped: string[];
}

const num = (v: string | null | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

function colour(el: Element, fallback: string): string {
  const style = el.getAttribute("style") ?? "";
  const m = /fill\s*:\s*([^;]+)/.exec(style);
  let c = (m?.[1] ?? el.getAttribute("fill") ?? "").trim();
  if (!c && el.parentElement && el.parentElement.tagName !== "svg") return colour(el.parentElement, fallback);
  if (!c || c === "none" || c.startsWith("url(")) return fallback;
  if (/^#[0-9a-f]{3}$/i.test(c)) c = "#" + [...c.slice(1)].map((x) => x + x).join("");
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) return c.toUpperCase();
  // named or rgb(): let the browser resolve it
  const cv = new OffscreenCanvas(1, 1).getContext("2d")!;
  cv.fillStyle = c;
  const r = String(cv.fillStyle);
  return /^#[0-9a-f]{6}$/i.test(r) ? r.toUpperCase() : fallback;
}

function offset(el: Element): [number, number] {
  let x = 0, y = 0;
  for (let e: Element | null = el; e && e.tagName !== "svg"; e = e.parentElement) {
    const m = /translate\(\s*([-\d.]+)[ ,]*([-\d.]+)?\s*\)/.exec(e.getAttribute("transform") ?? "");
    if (m) {
      x += num(m[1]);
      y += num(m[2]);
    }
  }
  return [x, y];
}

const attr = (el: Element, name: string) => {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(el.getAttribute("style") ?? "");
  return m?.[1]?.trim() ?? el.getAttribute(name);
};

export function parseSvg(text: string): Parsed {
  const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  if (svg.tagName !== "svg") throw new Error("This file isn't a readable SVG.");
  const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Math.round(vb.length === 4 ? vb[2]! : num(svg.getAttribute("width"), 1920));
  const height = Math.round(vb.length === 4 ? vb[3]! : num(svg.getAttribute("height"), 1080));
  const layers: ImportLayer[] = [];
  const skipped = new Set<string>();
  svg.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (el.closest("defs, clipPath, mask, symbol")) return;
    const [tx, ty] = offset(el);
    const name = el.getAttribute("id") ?? el.getAttribute("inkscape:label") ?? "";
    const t = el.getAttribute("transform") ?? "";
    if (t && !/^\s*translate\([^)]*\)\s*$/.test(t)) skipped.add("rotated or scaled items (placed unrotated)");
    if (el.hasAttribute("clip-path") || el.hasAttribute("mask")) skipped.add("clipping and masks");
    if (attr(el, "stroke") && attr(el, "stroke") !== "none") skipped.add("strokes");
    if ((attr(el, "fill") ?? "").startsWith("url(")) skipped.add("gradient or pattern fills");
    if (el.hasAttribute("opacity") || el.hasAttribute("fill-opacity") || el.hasAttribute("filter")) skipped.add("opacity or filters");
    if (tag === "rect")
      layers.push({ kind: "rect", name: name || "Shape", size: [num(el.getAttribute("width")), num(el.getAttribute("height"))], fill: colour(el, "#000000"), radius: num(el.getAttribute("rx")), position: [tx + num(el.getAttribute("x")), ty + num(el.getAttribute("y"))] });
    else if (tag === "circle" || tag === "ellipse") {
      const rx = num(el.getAttribute(tag === "circle" ? "r" : "rx")), ry = num(el.getAttribute(tag === "circle" ? "r" : "ry"));
      layers.push({ kind: "ellipse", name: name || "Ellipse", size: [rx * 2, ry * 2], fill: colour(el, "#000000"), position: [tx + num(el.getAttribute("cx")) - rx, ty + num(el.getAttribute("cy")) - ry] });
    } else if (tag === "text") {
      const span = el.querySelector("tspan");
      const str = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!str) return;
      const x = num(span?.getAttribute("x") ?? el.getAttribute("x")), y = num(span?.getAttribute("y") ?? el.getAttribute("y"));
      const w = attr(el, "font-weight") ?? "400";
      layers.push({
        kind: "text",
        name: name || str.slice(0, 24),
        text: str,
        size: num(attr(el, "font-size"), 32),
        weight: w === "bold" ? 700 : w === "normal" ? 400 : num(w, 400),
        fill: colour(el, "#000000"),
        font: (attr(el, "font-family") ?? "Inter").split(",")[0]!.replace(/['"]/g, "").trim(),
        align: attr(el, "text-anchor") === "middle" ? "center" : attr(el, "text-anchor") === "end" ? "right" : "left",
        position: [tx + x, ty + y],
      });
    } else if (tag === "image") {
      const href = el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "";
      if (!href.startsWith("data:")) return void skipped.add("linked images (embed them in the SVG)");
      const w = num(el.getAttribute("width")), h = num(el.getAttribute("height"));
      layers.push({ kind: "image", name: name || "Image", src: href, scale: 1, size: [w, h], position: [tx + num(el.getAttribute("x")), ty + num(el.getAttribute("y"))] });
    } else if (["path", "polygon", "polyline", "line"].includes(tag)) skipped.add("paths and lines");
    else if (tag.endsWith("gradient")) skipped.add("gradients (flat colour used)");
  });
  if (vb.length === 4 && (vb[0] !== 0 || vb[1] !== 0)) skipped.add("offset viewBox");
  if (svg.querySelector("style, use, foreignObject")) skipped.add("styles or reused elements");
  return { width, height, layers, skipped: [...skipped] };
}

/** Raster fallback preserves unsupported SVG artwork rather than dropping its shapes. */
export async function svgArtwork(text: string, name: string, width: number, height: number): Promise<ImportLayer> {
  const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  // SVG is decoded as an image (no active document/scripts or navigation).
  svg.querySelectorAll("script, foreignObject").forEach((el) => el.remove());
  svg.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });
  const img = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't preserve this SVG.");
    ctx.drawImage(img, 0, 0, width, height);
    return { kind: "image", name, src: canvas.toDataURL("image/png"), scale: 1, size: [width, height], position: [0, 0], role: "image" };
  } finally { URL.revokeObjectURL(url); }
}

/** A PNG/JPG as one image layer, fitted into the frame. */
export async function readImage(file: File, frame: [number, number]): Promise<ImportLayer> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = src;
  await img.decode();
  const s = Math.min(1, frame[0] / img.naturalWidth, frame[1] / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  // Asset dimensions are native pixels; the layer transform applies fitting exactly once.
  return { kind: "image", name: file.name.replace(/\.\w+$/, ""), src, scale: s, size: [img.naturalWidth, img.naturalHeight], position: [(frame[0] - w) / 2, (frame[1] - h) / 2] };
}
