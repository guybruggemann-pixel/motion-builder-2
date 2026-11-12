/**
 * Over the viewer: the selection outline (volt, with ink around it) and the contextual toolbar
 * floating 14px above the selected layer: name, material, in-ease (opens the Graph tab) and
 * "key position at the playhead". Positions come from the evaluated drawables. Hidden while playing.
 */
import { CATALOG, chainAfter, evaluateParam, isNodeType, type Drawable, type Mat, type MeasureText, type Network, type Node, type ParamSpec } from "@core/scene";
import { boxOf, ownerIn } from "@/render/bounds";
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
  const box = boxOf(drawables.filter((d) => ownerIn(net.id, d) === node.id), view, measure);
  if (!box) return null;

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
