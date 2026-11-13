/**
 * Glyph outlines for extruded (3D) text, from the same bundled variable fonts the canvas uses.
 * The WOFF2 files are unpacked to TTF with Google's reference decoder (wawoff2), then fontkit
 * applies the weight (variable `wght` axis), shapes the text (kerning) and gives each glyph's path.
 *
 * Outlines come out in the core's text layout space (x right, y down, baseline at the run's y),
 * positioned like the canvas draws the run: from the run's x, `tracking` px after every glyph.
 * No three.js here: `scene3d` turns these into extruded meshes.
 */
import * as fontkit from "fontkit";
import type { FontSpec, Run } from "@core/scene";

/** One path command in layout space. M/L: x y; Q: cx cy x y; C: c1x c1y c2x c2y x y; Z closes. */
export type PathCmd = { op: "M" | "L"; p: [number, number] } | { op: "Q"; p: [number, number, number, number] } | { op: "C"; p: [number, number, number, number, number, number] } | { op: "Z" };

export interface GlyphOutline {
  /** The characters this glyph draws (usually one). */
  text: string;
  /** Pen position (left of the glyph) in layout space, and its advance in px (tracking excluded). */
  x: number;
  advance: number;
  cmds: PathCmd[];
}

type Font = fontkit.Font;

export class OutlineFonts {
  private varied = new Map<string, Font>();

  /** `families`: family name → TTF fonts per unicode subset (latin first). */
  constructor(private families: Map<string, Font[]>) {}

  /** Unpack WOFF2 files to TTF and open them. `decompress` is wawoff2's (injected so tests and the app load it their own way). */
  static async fromWoff2(files: Record<string, Uint8Array[]>, decompress: (woff2: Uint8Array) => Promise<Uint8Array>): Promise<OutlineFonts> {
    const families = new Map<string, Font[]>();
    for (const [family, list] of Object.entries(files)) {
      const fonts: Font[] = [];
      for (const woff2 of list) {
        const ttf = await decompress(woff2);
        fonts.push(fontkit.create(toBuffer(ttf)) as Font);
      }
      families.set(family, fonts);
    }
    return new OutlineFonts(families);
  }

  has(family: string) {
    return this.families.has(family);
  }

  /** Raw TTF/OTF/WOFF or decoded WOFF2 supplied by the designer. */
  register(family: string, bytes: Uint8Array[]) {
    this.families.set(family, bytes.map((data) => fontkit.create(toBuffer(data)) as Font));
    for (const key of this.varied.keys()) if (key.startsWith(`${family}|`)) this.varied.delete(key);
  }

  /** The subset font at this weight (variation applied once and cached). */
  private at(family: string, subset: number, weight: number): Font | undefined {
    const base = this.families.get(family)?.[subset];
    if (!base) return undefined;
    const key = `${family}|${subset}|${weight}`;
    let f = this.varied.get(key);
    if (!f) {
      f = (Object.keys(base.variationAxes).includes("wght") ? base.getVariation({ wght: weight }) : base) as Font;
      this.varied.set(key, f);
    }
    return f;
  }

  /** Which subset draws a code point (the first that has it), or -1. */
  private subsetFor(family: string, cp: number): number {
    const fonts = this.families.get(family) ?? [];
    return fonts.findIndex((f) => f.hasGlyphForCodePoint(cp));
  }

  /** Glyph outlines of a run, positioned in layout space. Characters no subset covers are left out (see `missing`). */
  runOutlines(run: Pick<Run, "text" | "x" | "y">, font: FontSpec, tracking = 0): GlyphOutline[] {
    const out: GlyphOutline[] = [];
    let pen = run.x;
    for (const seg of this.segments(font.family, run.text)) {
      const f = seg.subset < 0 ? undefined : this.at(font.family, seg.subset, font.weight);
      if (!f) {
        pen += [...seg.text].length * tracking; // nothing to draw; keep the spacing the canvas would add
        continue;
      }
      const k = font.size / f.unitsPerEm;
      const laid = f.layout(seg.text);
      laid.glyphs.forEach((g, i) => {
        const pos = laid.positions[i]!;
        const gx = pen + pos.xOffset * k;
        const gy = run.y - pos.yOffset * k;
        const P = (x: number, y: number): [number, number] => [gx + x * k, gy - y * k];
        const cmds: PathCmd[] = [];
        for (const c of g.path.commands) {
          const a = c.args;
          if (c.command === "moveTo") cmds.push({ op: "M", p: P(a[0]!, a[1]!) });
          else if (c.command === "lineTo") cmds.push({ op: "L", p: P(a[0]!, a[1]!) });
          else if (c.command === "quadraticCurveTo") cmds.push({ op: "Q", p: [...P(a[0]!, a[1]!), ...P(a[2]!, a[3]!)] });
          else if (c.command === "bezierCurveTo") cmds.push({ op: "C", p: [...P(a[0]!, a[1]!), ...P(a[2]!, a[3]!), ...P(a[4]!, a[5]!)] });
          else if (c.command === "closePath") cmds.push({ op: "Z" });
        }
        out.push({ text: String.fromCodePoint(...(g.codePoints ?? [])), x: pen, advance: pos.xAdvance * k, cmds });
        pen += pos.xAdvance * k + tracking;
      });
    }
    return out;
  }

  /** Advance width of `text` in px without tracking (what the canvas `measureText` reports). */
  width(text: string, font: FontSpec): number {
    const gs = this.runOutlines({ text, x: 0, y: 0 }, font, 0);
    const last = gs.at(-1);
    return last ? last.x + last.advance : 0;
  }

  /** Characters of `text` no bundled subset of the family covers. */
  missing(text: string, family: string): string[] {
    return [...new Set([...text].filter((ch) => !/\s/.test(ch) && this.subsetFor(family, ch.codePointAt(0)!) < 0))];
  }

  /** Split text into runs that one subset font draws. */
  private segments(family: string, text: string): { subset: number; text: string }[] {
    const segs: { subset: number; text: string }[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      // spaces and the like belong with whatever came before
      const sub = /\s/.test(ch) && segs.length ? segs.at(-1)!.subset : this.subsetFor(family, cp);
      const last = segs.at(-1);
      if (last && last.subset === sub) last.text += ch;
      else segs.push({ subset: sub, text: ch });
    }
    return segs;
  }
}

/** fontkit wants a Buffer-like; in the browser a Uint8Array with Buffer's read helpers is enough via its DecodeStream. */
function toBuffer(bytes: Uint8Array): Buffer {
  const B = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  return (B ? B.from(bytes) : bytes) as Buffer;
}

/* ---------- loading in the app ---------- */

let loading: Promise<OutlineFonts> | undefined;
const loadedSources = new Map<string, string>();

/**
 * wawoff2's WebAssembly decoder, in the page or a worker. Its own wrapper only exports under Node,
 * so the compiled binding is loaded as text and run with our own `Module` (like the ProRes encoder).
 */
async function webDecompress(): Promise<(woff2: Uint8Array) => Promise<Uint8Array>> {
  const { default: src } = await import("wawoff2/build/decompress_binding.js?raw");
  return new Promise((resolve) => {
    const Module: { onRuntimeInitialized?: () => void; decompress?: (b: Uint8Array) => Uint8Array | false } = {};
    Module.onRuntimeInitialized = () =>
      resolve(async (woff2) => {
        const out = Module.decompress!(woff2);
        if (out === false) throw new Error("WOFF2 to TTF failed");
        return out.slice(); // a view into wasm memory that the next call reuses: copy it out
      });
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("Module", "require", "process", "__dirname", src)(Module, undefined, undefined, undefined);
  });
}

/** Outline fonts for every bundled family (unpacked once, on first use). */
export function loadOutlineFonts(): Promise<OutlineFonts> {
  const previous = loading ?? Promise.resolve(new OutlineFonts(new Map()));
  loading = previous.then(async (fonts) => {
    const [{ fontFiles, knownFamilies }, decompress] = await Promise.all([import("./fonts"), webDecompress()]);
    for (const family of knownFamilies()) {
      const urls = fontFiles(family);
      const signature = urls.join("|");
      if (loadedSources.get(family) === signature) continue;
      const bytes = await Promise.all(urls.map(async (url) => {
        const raw = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const isWoff2 = raw[0] === 0x77 && raw[1] === 0x4f && raw[2] === 0x46 && raw[3] === 0x32;
        return isWoff2 ? decompress(raw) : raw;
      }));
      fonts.register(family, bytes);
      loadedSources.set(family, signature);
    }
    return fonts;
  });
  return loading;
}
