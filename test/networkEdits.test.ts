import { describe, expect, it } from "vitest";
import { evaluateFrame, lowerThird } from "@core/scene";
import { createDocStore } from "@/store/docStore";
import { addNode, connect, deleteNodes, disconnect, moveNodes } from "@/network/edits";

const NET = "lower-third";
const store = () => createDocStore(lowerThird);
const net = (s: ReturnType<typeof store>, i = 1) => s.getState().doc.networks[i]!;
const wires = (s: ReturnType<typeof store>) => net(s).wires.map((w) => `${w.from.node}>${w.to.node}`);

describe("network edits", () => {
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
