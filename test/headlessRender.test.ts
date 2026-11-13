import { describe, expect, it } from "vitest";
import { prepareDoc } from "../src/app/headless/prepare";
import { lowerThird } from "../src/core/scene/examples/lowerThird";
import { parseArgs } from "../tools/render/args";
import { decodePng, encodePng } from "../tools/render/png";

describe("render command arguments", () => {
  it("defaults to an MP4 of the whole comp from the local app", () => {
    expect(parseArgs(["a.json"])).toEqual({ doc: "a.json", format: "mp4", url: "http://localhost:8080", headed: false, options: {} });
  });
  it("--frame means one PNG of that frame", () => {
    const a = parseArgs(["a.json", "--frame", "12", "--width", "960", "--height", "540", "--no-motion-blur"]);
    expect(a.format).toBe("png");
    expect(a.options).toEqual({ from: 12, to: 13, width: 960, height: 540, motionBlur: false });
  });
  it("collects --set values for one instance", () => {
    const a = parseArgs(["a.json", "--instance", "main/lt", "--set", "name=Ada Lovelace", "--set", "title=a=b"]);
    expect(a.options.overrides).toEqual({ network: "main", instance: "lt", values: { name: "Ada Lovelace", title: "a=b" } });
  });
  it("explains what's wrong", () => {
    expect(() => parseArgs([])).toThrow(/which doc/);
    expect(() => parseArgs(["a.json", "--format", "gif"])).toThrow(/mp4, prores or png/);
    expect(() => parseArgs(["a.json", "--set", "name=x"])).toThrow(/--instance/);
    expect(() => parseArgs(["a.json", "--frame", "2", "--format", "mp4"])).toThrow(/PNG/);
    expect(() => parseArgs(["a.json", "--from", "5"])).toThrow(/png/);
    expect(() => parseArgs(["a.json", "--width", "big"])).toThrow(/whole number/);
    expect(() => parseArgs(["a.json", "--nope"])).toThrow(/unknown option/);
  });
});

describe("png", () => {
  it("writes straight RGBA losslessly, alpha included", () => {
    const w = 5, h = 3, rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) % 256);
    const png = encodePng(rgba, w, h);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(decodePng(png)).toEqual({ width: w, height: h, rgba });
  });
  it("rejects a buffer of the wrong size", () => {
    expect(() => encodePng(new Uint8Array(10), 2, 2)).toThrow(/expected 16 bytes/);
  });
});

describe("headless doc preparation", () => {
  it("returns a valid doc untouched when there are no overrides", () => {
    expect(prepareDoc(structuredClone(lowerThird), {}).root).toBe(lowerThird.root);
  });
  it("rejects an invalid doc with the reasons", () => {
    expect(() => prepareDoc({ nope: true }, {})).toThrow(/isn't valid/);
  });
  it("puts override values on the instance without touching the input", () => {
    const sub = { network: "main", instance: "lt" }, control = "name";
    const input = structuredClone(lowerThird);
    const d = prepareDoc(input, { overrides: { ...sub, values: { [control]: "Ada Lovelace" } } });
    expect(d.networks.find((n) => n.id === sub.network)!.nodes.find((x) => x.id === sub.instance)!.params[control]).toEqual({ value: "Ada Lovelace" });
    expect(input).toEqual(lowerThird);
    expect(() => prepareDoc(input, { overrides: { network: "x", instance: "y", values: { a: "b" } } })).toThrow(/not found/);
  });
});
