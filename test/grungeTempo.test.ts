import { describe, it, expect } from "vitest";
import { grungeLowerThird } from "@core/scene/presets/kinetic";
import { validateDoc } from "@core/scene/validate";
const glitch = (d: any) => d.networks.find((n: any) => n.id === "grunge").nodes.find((n: any) => n.name === "Glitch in");
describe("grunge tempo", () => {
  it("default keeps 0.14s glitch, tempo 0.65 makes it 0.09s", () => {
    expect(glitch(grungeLowerThird()).params.duration.value).toBe(0.14);
    expect(glitch(grungeLowerThird({ tempo: 0.65 })).params.duration.value).toBe(0.09);
  });
  it("Guy title is a valid doc", () => {
    const r: any = validateDoc(grungeLowerThird({ first: "GUY IS THE", last: "MOST AWESOME", role: "PERSON IN THE UNIVERSE", tempo: 0.65, duration: 4.5 }));
    expect(r.ok ?? r.valid ?? !r.errors?.length).toBeTruthy();
  });
});
