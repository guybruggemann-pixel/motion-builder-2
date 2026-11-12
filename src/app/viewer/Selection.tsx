/**
 * Over the viewer: the selection outline (volt, with ink around it) and the contextual toolbar
 * floating 14px above the selected layer: name, material, in-ease (opens the Graph tab) and
 * "key position at the playhead". Positions come from the evaluated drawables. Hidden while playing.
 */
import { CATALOG, chainAfter, evaluateParam, isNodeType, type Drawable, type Mat, type MeasureText, type Network, type Node, type ParamSpec } from "@core/scene";
import { boxOf, ownerIn, type Box } from "@/render/bounds";
import { box3D } from "@/render/three/install";
import { mul } from "@core/scene";
import { Move, Rotate3d } from "lucide-react";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

/** Move / Turn: what dragging the selection and the gizmo does (E / R). */
function ToolSwitch() {
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  const item = (t: "move" | "turn", label: string, key: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={tool === t}
      title={`${label} (${key})`}
      onClick={() => setTool(t)}
      className={cn("flex h-[26px] items-center gap-1 rounded-full px-2 text-xs [&_svg]:size-3.5", tool === t ? "bg-raised font-semibold shadow-card" : "text-muted-foreground hover:text-foreground")}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <span role="group" aria-label="Drag tool" className="flex gap-0.5 rounded-full bg-field p-0.5">
      {item("move", "Move", "E", <Move aria-hidden />)}
      {item("turn", "Turn", "R", <Rotate3d aria-hidden />)}
    </span>
  );
}

/** On-screen box of a 3D object inside the shown 3D network (its scene drawable fills the view). */
function objectBox(drawables: readonly Drawable[], netId: string, node: string, view: Mat): Box | undefined {
  const d = drawables.find((x) => x.kind === "scene3d" && x.subnet === netId);
  if (!d || d.kind !== "scene3d") return undefined;
  const uv = box3D(d.scene, node);
  if (!uv) return undefined;
  const m = mul(view, d.matrix);
  const [w, h] = d.size;
  const pt = (u: number, v: number) => [m[0] * u * w + m[2] * v * h + m[4], m[1] * u * w + m[3] * v * h + m[5]] as const;
  const [x0, y0] = pt(uv[0], uv[1]), [x1, y1] = pt(uv[2], uv[3]);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
import { takesMaterial } from "@/panels/materials";
import { layerFill, MiniCurve, Sphere } from "@/shell/look";
import { docStore, useDocStore, useUi, viewComp } from "@/store";
import { keyAt, toggleKey } from "@/inspector/edits";

/** The layer's animate-in (first Phase "in" acting on it), if any. */
export function phaseOf(net: Network, nodeId: string, mode: "in" | "out"): Node | undefined {
  return chainAfter(net, nodeId).find((n) => n.type === "Phase" && (n.params.mode?.value ?? "in") === mode);
}

export function SelectionOverlay({ net, drawables, view, measure, bounds }: { net: Network; drawables: readonly Drawable[]; view: Mat; measure: MeasureText; bounds: { w: number; h: number } }) {
  const doc = useDocStore((s) => s.doc);
  const selected = useUi((s) => s.selectedNodes);
  const playing = useUi((s) => s.playing);
  const frame = useUi((s) => s.frame);
  const path = useUi((s) => s.path);
  const node = net.nodes.find((n) => n.id === selected[0]);
  if (!node) return null;
  const box = boxOf(drawables.filter((d) => ownerIn(net.id, d) === node.id), view, measure) ?? objectBox(drawables, net.id, node.id, view);
  if (!box) return null;
  const movable = node.type === "Text3D" || node.type === "Shape3D" || node.type === "Scene3D" || (isNodeType(node.type) && "position" in CATALOG[node.type].params);

  const fps = viewComp(doc, path).fps;
  const t = frame / fps, tol = 0.5 / fps;
  const inPhase = phaseOf(net, node.id, "in");
  const inEase = inPhase ? String(inPhase.params.ease?.value ?? "outExpo") : undefined;
  const fill = takesMaterial(node.type) ? layerFill(doc, node, t) : undefined;
  const canKey = isNodeType(node.type) && "position" in CATALOG[node.type].params;
  const pos = node.params.position;
  const keyed = !!(pos?.keys && keyAt(pos.keys, t, tol));

  const keyPosition = () => {
    const spec = isNodeType(node.type) ? (CATALOG[node.type].params as Record<string, ParamSpec>).position : undefined;
    const current = pos ? (pos.keys?.length ? evaluateParam({ value: pos.value, keys: pos.keys }, t) : pos.value) : spec?.default ?? [0, 0];
    docStore.getState().edit(keyed ? "Remove key" : "Add key", (d) => toggleKey(d, net.id, node.id, "position", t, tol, current));
  };

  // above the layer, or below it when there's no room on top; kept inside the viewer
  const above = box.y - 14 - 40 > 8;
  const top = above ? box.y - 14 : box.y + box.h + 14;
  const left = Math.min(Math.max(8, box.x), Math.max(8, bounds.w - 360));
  const btn = "flex h-[30px] items-center gap-1.5 rounded-full px-2 text-xs hover:bg-field";

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-volt shadow-[0_0_0_1px_var(--ink)]"
        style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }}
      />
      {!playing && (
        <div
          role="toolbar"
          aria-label={`${node.name} tools`}
          className="absolute z-10 flex items-center gap-0.5 rounded-full bg-card p-1 shadow-float"
          style={{ left, top, transform: above ? "translateY(-100%)" : undefined }}
        >
          <span className="max-w-40 truncate pl-2.5 pr-1.5 text-xs font-semibold">{node.name}</span>
          <span aria-hidden className="h-[18px] w-px bg-line" />
          {fill && (
            <button type="button" className={btn} aria-label="Material: solid. Open the library" title="Material: open the library" onClick={() => useUi.getState().setLibraryOpen(true)}>
              <Sphere color={fill} size={14} />
              Solid
            </button>
          )}
          {inEase && (
            <button type="button" className={btn} aria-label={`Animation in: ${inEase}. Open in graph`} title="Open in the Graph tab" onClick={() => useUi.getState().setBottomTab("graph")}>
              <MiniCurve ease={inEase} />
              <span className="font-mono text-[11px]">{inEase}</span>
            </button>
          )}
          {movable && <ToolSwitch />}
          {canKey && (
            <button
              type="button"
              aria-label={keyed ? "Remove position key at playhead" : "Key position at playhead"}
              aria-pressed={keyed}
              title={keyed ? "Remove position key at playhead" : "Key position at playhead"}
              onClick={keyPosition}
              className="grid size-[30px] place-items-center rounded-full hover:bg-field"
            >
              <span aria-hidden className={`size-[9px] rotate-45 rounded-[2px] border-[1.5px] border-ink ${keyed ? "bg-volt" : ""}`} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
