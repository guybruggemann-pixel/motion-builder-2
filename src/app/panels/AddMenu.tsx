/** "+ Add" in the timeline card: the node catalog, grouped. Adds to the open network and selects it. */
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { CATALOG, type Category, type NodeType } from "@core/scene";
import { Button } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useUi } from "@/store";
import { addNode } from "@/network/edits";

/** Add a node to the open network, right of everything already there, and select it. */
export function addToNetwork(type: NodeType) {
  const ui = useUi.getState();
  const net = shownNetwork(docStore.getState().doc, ui.path);
  const x = net.nodes.length ? Math.max(...net.nodes.map((n) => n.ui.x)) + 240 : 0;
  const y = net.nodes.length ? Math.min(...net.nodes.map((n) => n.ui.y)) : 0;
  let id = "";
  if (docStore.getState().edit(`Add ${CATALOG[type].label}`, (d) => void (id = addNode(d, net.id, type, { x, y })))) ui.selectNodes([id]);
}

const GROUPS: [Category, string][] = [
  ["layer", "Layers"],
  ["split", "Split"],
  ["animate", "Animate"],
  ["utility", "Utility"],
];

export function AddMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative ml-auto">
      <Button variant="soft" size="sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Plus /> Add
      </Button>
      {open && (
        <div role="menu" aria-label="Add a node" className="absolute bottom-9 right-0 z-50 grid w-[420px] grid-cols-2 gap-x-2 rounded-lg bg-card p-2 shadow-float">
          {GROUPS.map(([cat, label]) => (
            <div key={cat} role="group" aria-label={label} className="py-1">
              <p className="px-2 pb-1 text-[11px] text-muted-foreground">{label}</p>
              {Object.entries(CATALOG)
                .filter(([t, s]) => s.category === cat && t !== "Output")
                .map(([type, s]) => (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      addToNetwork(type as NodeType);
                      setOpen(false);
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-field"
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
