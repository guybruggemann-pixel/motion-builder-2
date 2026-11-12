/**
 * Test content for the 3D scene layer (roadmap 3D-a): an extruded title that turns, in a plaster
 * material under a studio light, with a flat 2D label on top. Not a template for any format.
 */
import type { SceneDoc } from "../schema";

const node = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, enabled: true, params, ui: { x, y }, ...extra }) as SceneDoc["networks"][number]["nodes"][number];

export const title3d: SceneDoc = {
  version: 3,
  name: "3D title (test)",
  root: "main",
  assets: [],
  batches: [],
  brand: {
    name: "Brand placeholder",
    colors: [
      { token: "stone", value: "#ECE8E1" },
      { token: "night", value: "#0B0C0F" },
    ],
    fonts: [{ family: "Inter Tight", weights: [400, 800], role: "all" }],
    assets: [],
  },
  networks: [
    {
      id: "main",
      name: "Main_v01",
      comp: { width: 1920, height: 1080, fps: 25, duration: 6, background: "brand:night" },
      output: "out",
      wires: [
        { from: { node: "scene", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "label", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "merge", port: "out" }, to: { node: "out", port: "in" } },
      ],
      nodes: [
        node("scene", "Scene3D", "Title scene", { size: { value: [1920, 1080] }, ambientOcclusion: { value: 0.6 } }, 0, 0, { subnet: "title-3d" }),
        node(
          "label",
          "Text",
          "Label",
          { text: { value: "OBSESSIVE\nCOMPULSIVE\nDISORDER" }, font: { value: "Inter Tight" }, weight: { value: 400 }, size: { value: 28 }, leading: { value: 1.05 }, fill: { value: "#FFFFFF" }, position: { value: [96, 120] } },
          0,
          140,
        ),
        node("merge", "Merge", "Merge", {}, 260, 60),
        node("out", "Output", "Output", {}, 480, 60),
      ],
    },
    {
      id: "title-3d",
      name: "Title scene",
      output: "merge",
      wires: [
        { from: { node: "word", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "plaster", port: "out" }, to: { node: "word", port: "material" } },
        { from: { node: "camera", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "key", port: "out" }, to: { node: "merge", port: "in" } },
      ],
      nodes: [
        node(
          "word",
          "Text3D",
          "Title",
          {
            text: { value: "MOTION" },
            font: { value: "Inter Tight" },
            weight: { value: 800 },
            size: { value: 300 },
            depth: { value: 90 },
            bevel: { value: 4 },
            rotation: {
              value: [0, 0, 0],
              keys: [
                { t: 0, v: [8, -35, 0], ease: "inOutSine" },
                { t: 6, v: [-8, 35, 0], ease: "linear" },
              ],
            },
          },
          0,
          0,
        ),
        node("plaster", "Material", "Plaster", { kind: { value: "plaster" }, color: { value: "brand:stone" }, roughness: { value: 0.9 }, grain: { value: 0.35 } }, -240, 0),
        node("camera", "Camera", "Camera", { position: { value: [0, 0, 2666.67] }, lens: { value: 50 } }, 0, 140),
        node("key", "Light", "Key light", { position: { value: [-900, 1200, 1600] }, intensity: { value: 2.2 }, softness: { value: 0.6 } }, 0, 280),
        node("merge", "Merge", "Merge", {}, 260, 120),
      ],
    },
  ],
};
