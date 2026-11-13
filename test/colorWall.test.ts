import { describe, expect, it } from "vitest";
import { colorWall, validateDoc, evaluateParam } from "@core/scene";
describe("colour wall", () => {
  const doc = colorWall();
  const scene = doc.networks.find((n) => n.id === "wall-3d")!;
  const param = (id: string, k: string) => scene.nodes.find((n) => n.id === id)!.params[k] as never;
  it("is valid", () => expect((validateDoc(doc) as { ok: boolean }).ok).toBe(true));
  it("holds the tilted view until the swing, then ends straight on", () => {
    expect(evaluateParam(param("cloner", "rotation"), 5)).toEqual([0, 0, 28]);
    expect(evaluateParam(param("cloner", "rotation"), 7)).toEqual([0, 0, 0]);
  });
  it("rows slide at an even speed for the whole clip", () => {
    const v = (t: number) => evaluateParam(param("cloner", "rowSlide"), t) as number;
    expect(v(5) - v(0)).toBeCloseTo(v(10) - v(5));
  });
  it("every copy gets a colour from the palette", () => expect((scene.nodes.find((n) => n.id === "colors")!.params.palette as { value: string }).value.split(",")).toHaveLength(7));
});
describe("colour wall depth", () => {
  it("words push in and out in z on a looping wave", () => {
    const s = colorWall().networks.find((n) => n.id === "wall-3d")!;
    expect((s.nodes.find((n) => n.id === "depth")!.params.position as { value: number[] }).value[2]).toBe(170);
    expect(s.wires.some((w) => w.from.node === "field" && w.to.node === "depth" && w.to.port === "field")).toBe(true);
  });
});
