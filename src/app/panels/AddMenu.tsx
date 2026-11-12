/** "+ Add" in the timeline card: the node catalog, grouped. Adds to the open network and selects it. */
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { CATALOG, portsOf, sceneOwner, type NodeType } from "@core/scene";
import { Button } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useDocStore, useUi } from "@/store";
import { addNode, insertAfter, wireToOutput } from "@/network/edits";

/**
 * Add a node to the open network, right of everything already there, and select it. Layers and 3D
 * objects are wired into what the network draws (on top), so they show straight away; a Material
 * goes into the selected object's material input when that's free. One undo step.
 */
export function addToNetwork(type: NodeType) {
  const ui = useUi.getState();
  const net = shownNetwork(docStore.getState().doc, ui.path);
  const x = net.nodes.length ? Math.max(...net.nodes.map((n) => n.ui.x)) + 240 : 0;
  const y = net.nodes.length ? Math.min(...net.nodes.map((n) => n.ui.y)) : 0;
  const cat = CATALOG[type].category;
  const selected = net.nodes.find((n) => n.id === ui.selectedNodes[0]);
  let id = "";
  const ok = docStore.getState().edit(`Add ${CATALOG[type].label}`, (d) => {
    id = addNode(d, net.id, type, { x, y });
    const dn = d.networks.find((n) => n.id === net.id)!;
    const chainable = selected && (CHAIN_AFTER[type] ?? []).includes(selected.type);
    if (chainable) {
      // a Cloner after the selected object, an effector after the selected Cloner or effector
      insertAfter(d, net.id, selected.id, id);
      const placed = dn.nodes.find((n) => n.id === id)!;
      placed.ui = { x: selected.ui.x + 240, y: selected.ui.y };
    } else if (cat === "layer" || cat === "3d") wireToOutput(d, net.id, id);
    if (cat === "field" && selected && portsOf(selected.type).includes("field"))
      dn.wires = [...dn.wires.filter((w) => !(w.to.node === selected.id && w.to.port === "field")), { from: { node: id, port: "out" }, to: { node: selected.id, port: "field" } }];
    if (type === "Material" && selected && portsOf(selected.type).includes("material") && !dn.wires.some((w) => w.to.node === selected.id && w.to.port === "material"))
      dn.wires.push({ from: { node: id, port: "out" }, to: { node: selected.id, port: "material" } });
  });
  if (ok) ui.selectNodes([id]);
}

/** Menu groups for a 2D network and for the inside of a 3D scene. */
const GROUPS_2D: [string, (t: NodeType) => boolean][] = [
  ["Layers", (t) => CATALOG[t].category === "layer" && t !== "Scene3D"],
  ["3D", (t) => t === "Scene3D"],
  ["Split", (t) => CATALOG[t].category === "split" && t !== "Cloner"],
  ["Animate", (t) => CATALOG[t].category === "animate" && !["Random", "Plain", "Step", "Reveal"].includes(t)],
  ["Cloners and effectors", (t) => ["Cloner", "Random", "Plain", "Step"].includes(t)],
  ["Fields", (t) => CATALOG[t].category === "field"],
  ["Utility", (t) => CATALOG[t].category === "utility"],
];
const CLONING = ["Cloner", "Random", "Plain", "Step", "Reveal"];
const GROUPS_3D: [string, (t: NodeType) => boolean][] = [
  ["3D objects", (t) => CATALOG[t].category === "3d"],
  ["Cloners and effectors", (t) => CLONING.includes(t)],
  ["Fields", (t) => CATALOG[t].category === "field"],
  ["Materials", (t) => CATALOG[t].category === "material"],
  ["Utility", (t) => CATALOG[t].category === "utility"],
];

/** What a new node chains after when that's what's selected. */
const CHAIN_AFTER: Partial<Record<NodeType, string[]>> = {
  Cloner: ["Text3D", "Shape3D", "Text", "Shape", "Image", "Group", "Subnet", "Split"],
  Random: ["Cloner", "Random", "Plain", "Step", "Reveal"],
  Plain: ["Cloner", "Random", "Plain", "Step", "Reveal"],
  Step: ["Cloner", "Random", "Plain", "Step", "Reveal"],
  Reveal: ["Cloner", "Random", "Plain", "Step", "Reveal"],
};
const HINT: Partial<Record<NodeType, string>> = {
  Scene3D: "Extruded title, camera and light, ready to edit",
  Cloner: "Select an object first: it gets cloned",
  Random: "After the selected cloner",
  Plain: "After the selected cloner",
  Step: "After the selected cloner",
  Reveal: "Clones arrive one by one, after the selected cloner",
  LinearField: "Into the selected effector",
  SphericalField: "Into the selected effector",
  NoiseField: "Into the selected effector",
};

export function AddMenu() {
  const [at, setAt] = useState<{ top: number; right: number }>();
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const net = shownNetwork(doc, path);
  const in3D = !!sceneOwner(doc, net.id);
  const open = !!at;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setAt(undefined);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setAt(undefined);
    const r = btn.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 6, right: window.innerWidth - r.right });
  };

  return (
    <div ref={box} className="ml-auto">
      <Button ref={btn} variant="soft" size="sm" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
        <Plus /> Add
      </Button>
      {at && (
        // fixed, so the card's rounded clipping can't cut it off
        <div
          role="menu"
          aria-label={in3D ? "Add to the 3D scene" : "Add a node"}
          className="fixed z-50 grid w-[480px] max-w-[calc(100vw-24px)] grid-cols-2 gap-x-2 overflow-y-auto rounded-lg bg-card p-2 shadow-float"
          style={{ top: at.top, right: at.right, maxHeight: `calc(100vh - ${at.top + 12}px)` }}
        >
          {(in3D ? GROUPS_3D : GROUPS_2D).map(([label, fits]) => (
            <div key={label} role="group" aria-label={label} className="py-1">
              <p className="px-2 pb-1 text-[11px] text-muted-foreground">{label}</p>
              {(Object.keys(CATALOG) as NodeType[])
                .filter((t) => fits(t) && t !== "Output")
                .map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      addToNetwork(type);
                      setAt(undefined);
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-field"
                  >
                    {CATALOG[type].label}
                    {HINT[type] && <span className="block text-[11px] text-muted-foreground">{HINT[type]}</span>}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
