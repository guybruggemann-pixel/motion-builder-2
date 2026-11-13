/**
 * The 3D pass's geometry (roadmap 3D-a, step 3), headless: glyph outlines become three.js shapes
 * with their holes, extrusions keep the requested depth centred on z = 0 and the silhouette
 * inside the outline, shapes are centred like the core says. (Pixels are checked in the browser.)
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { approxMeasure, evaluateFrame, title3d, type Scene3DDrawable, type Text3D } from "@core/scene";
import { OutlineFonts } from "@/app/render/outlines";
import { extrude, shapeShapes, textShapes } from "@/app/render/three/pass";

const require = createRequire(import.meta.url);
const decompress = require("wawoff2/decompress") as (b: Uint8Array) => Promise<Uint8Array>;
let fonts: OutlineFonts;
beforeAll(async () => {
  const f = (n: string) => new Uint8Array(readFileSync(require.resolve(`@fontsource-variable/inter-tight/files/${n}`)));
  fonts = await OutlineFonts.fromWoff2({ "Inter Tight": [f("inter-tight-latin-wght-normal.woff2"), f("inter-tight-latin-ext-wght-normal.woff2")] }, decompress);
}, 30_000);

const box = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!);
const word = (text: string): Text3D => {
  const d = structuredClone(title3d);
  d.networks.find((n) => n.id === "title-3d")!.nodes.find((n) => n.id === "word")!.params.text = { value: text };
  return (evaluateFrame(d, "main", 1, { measure: (t, f) => fonts.width(t, f) }).find((x) => x.kind === "scene3d") as Scene3DDrawable).scene.objects[0] as Text3D;
};

describe("3D pass geometry", () => {
  it("keeps holes: an O is one shape with one hole", () => {
    const shapes = textShapes(fonts, word("O"));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.holes).toHaveLength(1);
  });

  it("centres the text on its origin (centre aligned) and extrudes to the requested depth", () => {
    const o = word("MOTION");
    const g = extrude(textShapes(fonts, o), o.depth, o.bevel);
    const b = box(g);
    expect(b.max.z - b.min.z).toBeCloseTo(o.depth, 3);
    expect(b.max.z + b.min.z).toBeCloseTo(0, 3);
    expect(Math.abs(b.max.x + b.min.x)).toBeLessThan(o.font.size * 0.05); // side bearings make it not exact
    expect(Math.abs(b.max.y + b.min.y)).toBeLessThan(o.font.size * 0.2); // box centre vs cap height
    // the ink is the advance width minus the outer side bearings
    const adv = fonts.width("MOTION", o.font);
    expect(b.max.x - b.min.x).toBeGreaterThan(adv * 0.95);
    expect(b.max.x - b.min.x).toBeLessThan(adv);
  });

  it("keeps the bevel inside the outline (the silhouette is the glyph)", () => {
    const [s] = shapeShapes({ kind: "shape", shape: "rect", size: [400, 200], radius: 0, path: "", depth: 40, bevel: 8 } as never);
    const b = box(extrude([s!], 40, 8));
    expect([b.min.x, b.max.x, b.min.y, b.max.y]).toEqual([-200, 200, -100, 100].map((v) => expect.closeTo(v, 6)));
    expect(b.max.z - b.min.z).toBeCloseTo(40, 6);
  });

  // SVGLoader parses with DOMParser, which Node lacks; this runs in a browser test environment only.
  it.skipIf(typeof DOMParser === "undefined")("centres SVG paths drawn from [0, 0] to size, y flipped", () => {
    const shapes = shapeShapes({ kind: "shape", shape: "path", size: [100, 100], radius: 0, path: "M0 0 L100 0 L100 50 Z", depth: 10, bevel: 0 } as never);
    const b = box(extrude(shapes, 10, 0));
    expect([b.min.x, b.max.x]).toEqual([expect.closeTo(-50, 6), expect.closeTo(50, 6)]);
    expect([b.min.y, b.max.y]).toEqual([expect.closeTo(0, 6), expect.closeTo(50, 6)]); // the top half (y up)
  });
});
