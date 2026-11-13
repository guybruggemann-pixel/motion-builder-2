import { describe, expect, it } from "vitest";
import { evaluateFrame, lowerThird } from "@core/scene";
import { createDocStore } from "@/app/store/docStore";
import { addNode, connect, deleteNodes, disconnect, insertAfter, moveNodes, reconnect, wireToOutput } from "@/app/network/edits";
import { approxMeasure, title3d, validateDoc } from "@core/scene";

const NET = "lower-third";
const store = () => createDocStore(lowerThird);
const net = (s: ReturnType<typeof store>, i = 1) => s.getState().doc.networks[i]!;
const wires = (s: ReturnType<typeof store>) => net(s).wires.map((w) => `${w.from.node}>${w.to.node}`);

describe("network edits", () => {
  it("detaches a wire without deleting nodes and undo restores it", () => {
    const s = store();
    const before = s.getState().doc;
    expect(s.getState().edit("Detach wire", (d) => disconnect(d, NET, [{ from: "panel", to: "merge", port: "in" }]))).toBe(true);
    expect(wires(s)).not.toContain("panel>merge");
    expect(net(s).nodes).toEqual(before.networks[1]?.nodes);
    s.getState().undo();
    expect(s.getState().doc).toEqual(before);
  });
  it("reconnects in one undo step and retains the original on invalid loops", () => {
    const s = store();
    const before = s.getState().doc;
    expect(s.getState().edit("Reconnect wire", (d) => reconnect(d, NET, { from: "name", to: "split", port: "in" }, { from: "name-in", to: "split", port: "in" }))).toBe(false);
    expect(s.getState().doc).toEqual(before);
    expect(s.getState().edit("Reconnect wire", (d) => reconnect(d, NET, { from: "name", to: "split", port: "in" }, { from: "title", to: "split", port: "in" }))).toBe(true);
    expect(wires(s)).toContain("title>split");
    expect(wires(s)).not.toContain("name>split");
    s.getState().undo();
    expect(s.getState().doc).toEqual(before);
  });
  it("adds nodes with free ids, and a Subnet with its own network", () => {
    const s = store();
    let a = "", b = "", sub = "";
    s.getState().edit("Add", (d) => {
      a = addNode(d, NET, "Text", { x: 10, y: 20 });
      b = addNode(d, NET, "Text", { x: 10, y: 20 });
      sub = addNode(d, NET, "Subnet", { x: 0, y: 0 });
    });
    expect([a, b, sub]).toEqual(["text", "text-2", "subnet"]);
    expect(net(s).nodes.find((n) => n.id === "text-2")!.name).toBe("Text 4"); // Name and Title are Text nodes already
    const subnetNode = net(s).nodes.find((n) => n.id === "subnet")!;
    expect(s.getState().doc.networks.some((n) => n.id === subnetNode.subnet)).toBe(true);
  });

  it("connects, replacing the wire into a single-input node", () => {
    const s = store();
    expect(s.getState().edit("Connect", (d) => connect(d, NET, "title", "split"))).toBe(true);
    expect(wires(s)).toContain("title>split");
    expect(wires(s)).not.toContain("name>split");
    // Merge takes many inputs: adding keeps the others
    s.getState().edit("Connect", (d) => connect(d, NET, "name", "merge"));
    expect(wires(s).filter((w) => w.endsWith(">merge"))).toHaveLength(4);
  });

  it("refuses a wire that makes a loop", () => {
    const s = store();
    expect(s.getState().edit("Connect", (d) => connect(d, NET, "name-in", "split"))).toBe(false);
    expect(s.getState().errors.join()).toMatch(/loop/);
  });

  it("disconnects and deletes, keeping the output and dropping promoted controls on deleted nodes", () => {
    const s = store();
    s.getState().edit("Disconnect", (d) => disconnect(d, NET, [{ from: "panel", to: "merge" }]));
    expect(wires(s)).not.toContain("panel>merge");
    let gone: string[] = [];
    expect(s.getState().edit("Delete", (d) => void (gone = deleteNodes(d, NET, ["title", "merge"])))).toBe(true);
    expect(gone).toEqual(["title"]);
    expect(net(s).promoted!.map((p) => p.id)).toEqual(["name", "accent"]);
    expect(wires(s).some((w) => w.includes("title>"))).toBe(false);
    // still renders: the title is simply gone
    expect(evaluateFrame(s.getState().doc, "main", 3).some((d) => d.node === "title")).toBe(false);
  });

  it("moves nodes on whole pixels", () => {
    const s = store();
    s.getState().edit("Move", (d) => moveNodes(d, NET, [{ id: "panel", x: 12.6, y: -3.2 }]));
    expect(net(s).nodes.find((n) => n.id === "panel")!.ui).toEqual({ x: 13, y: -3 });
  });
});

describe("new layers show straight away", () => {
  it("wires a new layer into the output's Merge, on top", () => {
    const s = store();
    let id = "";
    s.getState().edit("Add", (d) => {
      id = addNode(d, NET, "Shape", { x: 0, y: 0 });
      wireToOutput(d, NET, id);
    });
    expect(wires(s).filter((w) => w.endsWith(">merge")).at(-1)).toBe(`${id}>merge`);
    const ds = evaluateFrame(s.getState().doc, NET, 1, { measure: approxMeasure });
    expect(ds.at(-1)!.node).toBe(id);
  });

  it("puts a Merge in front of a single-input Output, keeping what was there below", () => {
    const s = store();
    let id = "";
    expect(
      s.getState().edit("Add 3D", (d) => {
        id = addNode(d, "main", "Scene3D", { x: 0, y: 0 });
        wireToOutput(d, "main", id);
      }),
    ).toBe(true);
    const main = s.getState().doc.networks[0]!;
    const w = main.wires.map((x) => `${x.from.node}>${x.to.node}`);
    expect(w).toEqual(expect.arrayContaining(["lt>merge", `${id}>merge`, "merge>out"]));
    expect(w.indexOf("lt>merge")).toBeLessThan(w.indexOf(`${id}>merge`)); // the lower third stays below
    const ds = evaluateFrame(s.getState().doc, "main", 1, { measure: approxMeasure });
    expect(ds.at(-1)!.kind).toBe("scene3d");
    expect(ds.some((d) => d.node === "name")).toBe(true);
  });

  it("leaves an already wired node alone", () => {
    const s = store();
    const before = wires(s);
    s.getState().edit("Rewire", (d) => wireToOutput(d, NET, "panel"));
    expect(wires(s)).toEqual(before);
  });
});

describe("material inputs in the network", () => {
  it("wires a Material into an object's material input, replacing the one there", () => {
    const s = createDocStore(title3d);
    expect(
      s.getState().edit("Wire material", (d) => {
        d.networks[1]!.nodes.push({ id: "gold", type: "Material", name: "Gold", enabled: true, params: {}, ui: { x: 0, y: 0 } });
        connect(d, "title-3d", "gold", "word", "material");
      }),
    ).toBe(true);
    const into = s.getState().doc.networks[1]!.wires.filter((w) => w.to.node === "word" && w.to.port === "material");
    expect(into.map((w) => w.from.node)).toEqual(["gold"]);
    expect(validateDoc(s.getState().doc).ok).toBe(true);
  });

  it("refuses a non-material in a material input", () => {
    const s = createDocStore(title3d);
    expect(s.getState().edit("Wire", (d) => connect(d, "title-3d", "camera", "word", "material"))).toBe(false);
  });
});

describe("chaining cloners and effectors", () => {
  it("puts a Cloner right after an object and keeps the chain going to the output", () => {
    const s = createDocStore(title3d);
    let id = "";
    expect(
      s.getState().edit("Add Cloner", (d) => {
        id = addNode(d, "title-3d", "Cloner", { x: 0, y: 0 });
        insertAfter(d, "title-3d", "word", id);
      }),
    ).toBe(true);
    const w = s.getState().doc.networks[1]!.wires.map((x) => `${x.from.node}>${x.to.node}.${x.to.port}`);
    expect(w).toEqual(expect.arrayContaining([`word>${id}.in`, `${id}>merge.in`, "plaster>word.material"]));
    expect(w).not.toContain("word>merge.in");
    const scene = evaluateFrame(s.getState().doc, "main", 1, { measure: approxMeasure }).find((x) => x.kind === "scene3d");
    expect(scene?.kind === "scene3d" && scene.scene.objects[0]!.clones).toHaveLength(9); // the default 3 × 3 grid
  });
});
