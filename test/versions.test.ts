import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { lowerThird, validateDoc, type SceneDoc } from "@core/scene";
import { nextVersionName, saveAsNewVersion, switchComp, switchVersion, versionsOf } from "@/app/file/versions";

const start = () => {
  const r = validateDoc(lowerThird);
  if (!r.ok) throw new Error(r.errors.join());
  return r.doc;
};
const rootName = (d: SceneDoc) => d.networks.find((n) => n.id === d.root)!.name;

describe("comp versions", () => {
  it("creates valid ids for numeric and very long composition names", () => {
    for (const name of ["3D Title_v01", "!", "x".repeat(200)]) {
      const doc = produce(start(), (d) => { const n = d.networks.find((n) => n.id === d.root); if (n) n.name = name; });
      const next = produce(doc, saveAsNewVersion);
      expect(next.root).toMatch(/^[a-z][a-z0-9_-]{0,63}$/);
      expect(validateDoc(next).ok).toBe(true);
    }
  });
  it("editing a version's nested contents leaves the previous version intact", () => {
    const d0 = start();
    const d1 = produce(d0, saveAsNewVersion);
    const current = d1.networks.find((n) => n.id === d1.root);
    const nestedId = current?.nodes.find((n) => n.subnet)?.subnet;
    expect(nestedId).toBeDefined();
    expect(nestedId).not.toBe("lower-third");
    const edited = produce(d1, (d) => {
      const child = d.networks.find((n) => n.id === nestedId);
      const text = child?.nodes.find((n) => n.type === "Text");
      if (!text) throw new Error("missing nested text");
      text.params.text = { value: "Techonomy" };
    });
    expect(edited.networks.find((n) => n.id === "lower-third")).toEqual(d0.networks.find((n) => n.id === "lower-third"));
    expect(validateDoc(edited).ok).toBe(true);
  });
  it("unrelated comps with matching names are not versions", () => {
    const doc = produce(start(), (d) => {
      const net = d.networks.find((n) => n.id === d.root);
      if (!net) throw new Error("missing root");
      d.networks.push({ ...net, id: "unrelated", name: "Main_v08" });
    });
    expect(versionsOf(doc, doc.root).map((n) => n.id)).toEqual([doc.root]);
  });
  it("composition switching rejects non-comp networks", () => {
    expect(produce(start(), (d) => switchComp(d, "lower-third")).root).toBe(start().root);
  });
  it("Main_v01 saves as Main_v02, which becomes the root and records where it came from", () => {
    const d0 = start();
    expect(rootName(d0)).toBe("Main_v01");
    const d1 = produce(d0, saveAsNewVersion);
    expect(rootName(d1)).toBe("Main_v02");
    expect(d1.networks.find((n) => n.id === d1.root)!.versionOf).toBe(d0.root);
    expect(validateDoc(d1).ok).toBe(true);
  });
  it("numbers continue from the highest version, and old versions stay", () => {
    const d = produce(produce(start(), saveAsNewVersion), saveAsNewVersion);
    expect(rootName(d)).toBe("Main_v03");
    expect(versionsOf(d, d.root).map((n) => n.name)).toEqual(["Main_v01", "Main_v02", "Main_v03"]);
    expect(nextVersionName(d, d.root)).toBe("Main_v04");
  });
  it("switching back opens the older version unchanged", () => {
    const d0 = start();
    const d2 = produce(produce(d0, saveAsNewVersion), (x) => switchVersion(x, d0.root));
    expect(d2.root).toBe(d0.root);
  });
});
