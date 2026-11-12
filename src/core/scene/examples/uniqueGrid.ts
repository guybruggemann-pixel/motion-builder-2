/**
 * Test content for cloners (roadmap 3D-b, reference `docs/references/3d-cloner-grid.jpg`): one
 * extruded word cloned in a grid, rows sliding past each other, colours picked at random from a
 * palette, a camera that tilts over the field. Not a template for any format.
 */
import type { SceneDoc } from "../schema";

const node = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, enabled: true, params, ui: { x, y }, ...extra }) as SceneDoc["networks"][number]["nodes"][number];

export const uniqueGrid: SceneDoc = {
  version: 3,
  name: "Cloner grid (test)",
  root: "main",
  assets: [],
  batches: [],
  brand: {
    name: "Brand placeholder",
    colors: [
      { token: "blue", value: "#3F6BF2" },
      { token: "violet", value: "#7357EE" },
      { token: "pink", value: "#E37AEF" },
      { token: "cream", value: "#F1EDE4" },
    ],
    fonts: [{ family: "Inter Tight", weights: [900], role: "all" }],
    assets: [],
  },
  networks: [
    {
      id: "main",
      name: "Main_v01",
      comp: { width: 1080, height: 1350, fps: 25, duration: 6, background: "#1B2A8F" },
      output: "out",
      wires: [{ from: { node: "scene", port: "out" }, to: { node: "out", port: "in" } }],
      nodes: [node("scene", "Scene3D", "Word grid", { size: { value: [1080, 1350] }, ambientOcclusion: { value: 0.6 } }, 0, 0, { subnet: "grid-3d" }), node("out", "Output", "Output", {}, 260, 0)],
    },
    {
      id: "grid-3d",
      name: "Word grid",
      output: "merge",
      wires: [
        { from: { node: "word", port: "out" }, to: { node: "cloner", port: "in" } },
        { from: { node: "cloner", port: "out" }, to: { node: "random", port: "in" } },
        { from: { node: "random", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "matte", port: "out" }, to: { node: "word", port: "material" } },
        { from: { node: "camera", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "key", port: "out" }, to: { node: "merge", port: "in" } },
      ],
      nodes: [
        node("word", "Text3D", "Word", { text: { value: "UNIQUE" }, font: { value: "Inter Tight" }, weight: { value: 900 }, size: { value: 150 }, depth: { value: 70 }, bevel: { value: 6 } }, 0, 0),
        node("matte", "Material", "Matte plastic", { kind: { value: "plastic" }, color: { value: "#FFFFFF" }, roughness: { value: 0.6 }, clearcoat: { value: 0 }, grain: { value: 0.12 } }, -260, 0),
        node(
          "cloner",
          "Cloner",
          "Grid",
          {
            mode: { value: "grid" },
            count: { value: [4, 11, 1] },
            spacing: { value: [650, 160, 0] },
            // one spacing over the shot: the rows run past each other and the loop is seamless
            rowSlide: { value: 0, keys: [{ t: 0, v: 0, ease: "linear" }, { t: 6, v: 650, ease: "linear" }] },
            rotation: { value: [0, 0, -12] },
          },
          240,
          0,
        ),
        node("random", "Random", "Colours", { palette: { value: "brand:blue, brand:violet, #2B47CF, brand:pink, brand:cream, #5A86FF" }, seed: { value: 7 } }, 480, 0),
        node(
          "camera",
          "Camera",
          "Camera",
          { position: { value: [0, 0, 0], keys: [{ t: 0, v: [380, -980, 1750], ease: "inOutSine" }, { t: 6, v: [-260, -620, 1850], ease: "linear" }] }, target: { value: [0, 60, 0] }, lens: { value: 40 } },
          240,
          160,
        ),
        node("key", "Light", "Key light", { position: { value: [-900, 1100, 1500] }, intensity: { value: 2.6 }, softness: { value: 0.7 } }, 240, 300),
        node("merge", "Merge", "Merge", {}, 720, 120),
      ],
    },
  ],
};
