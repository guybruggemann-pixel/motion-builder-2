/**
 * Timeline for the shown network, and the app's one layer list: a tree of layers (frontmost on
 * top, AE style) with connector lines, material dot and role, next to the tracks: a ruler you
 * scrub, each layer's in/out bar, and twirl-down rows for keyed params (diamonds) and the Phase
 * nodes acting on the layer (per-part ranges). Bars and keys drag in whole frames; every drag is
 * one undo step. Selecting a row selects the node everywhere (uiStore.selectedNodes).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { CATALOG, chainAfter, isNodeType, layerOrder, phaseRanges, type Network, type Node, type PhaseRange, type SceneDoc } from "@core/scene";
import { layerFill, roleLabel, Sphere } from "@/shell/look";
import { applySolid, SOLID_MIME, takesMaterial } from "@/panels/materials";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { docStore, sameKey, shownNetwork, useDocStore, useUi, viewComp, type KeyRef } from "@/store";
import { openSubnet } from "@/store/navigation";
import { dragLayer, moveKeys, type BarDrag } from "./edits";

const NAME_W = 236;
const ROW_H = 30;
const SUB_H = 26;
const PAD = 10; // px inside the track at both ends, so keys at 0 and at the end stay grabbable

interface Scale {
  /** Seconds -> px within the track column. */
  x(t: number): number;
  /** px delta -> seconds delta. */
  dt(px: number): number;
  fps: number;
  duration: number;
}

function useScale(width: number, duration: number, fps: number): Scale {
  return useMemo(() => {
    const w = Math.max(1, width - 2 * PAD);
    return { x: (t) => PAD + (t / duration) * w, dt: (px) => (px / w) * duration, fps, duration };
  }, [width, duration, fps]);
}

const snap = (t: number, fps: number) => Math.round(t * fps) / fps;

/**
 * Pointer drag helper: calls move with the px offset since pointerdown, end on release.
 * Listens on window, not the pressed element: a drag re-renders the timeline (a moved key gets a
 * new time, a row can re-mount), and the gesture must survive its element going away.
 */
function startDrag(e: React.PointerEvent, move: (dx: number, ev: PointerEvent) => void, end?: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX, id = e.pointerId;
  const onMove = (ev: PointerEvent) => ev.pointerId === id && move(ev.clientX - x0, ev);
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    end?.();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

let gesture = 0;

/* ---------- ruler ---------- */

function tickStep(fps: number, pxPerSec: number): { minor: number; major: number } {
  const minPx = 8;
  const frames = [1, 2, 5, 10].filter((f) => f < fps).concat([fps, fps * 2, fps * 5, fps * 10, fps * 30, fps * 60]);
  const minor = frames.find((f) => (f / fps) * pxPerSec >= minPx) ?? frames.at(-1)!;
  const major = frames.find((f) => f >= minor && f % fps === 0 && (f / fps) * pxPerSec >= 56) ?? fps * 60;
  return { minor, major };
}

function Ruler({ scale, width }: { scale: Scale; width: number }) {
  const setFrame = useUi((s) => s.setFrame);
  const setPlaying = useUi((s) => s.setPlaying);
  const now = useUi((s) => s.frame);
  const frames = Math.round(scale.duration * scale.fps);
  const { minor, major } = tickStep(scale.fps, scale.x(1) - scale.x(0));
  const ticks: number[] = [];
  for (let f = 0; f <= frames; f += minor) ticks.push(f);

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    const at = (clientX: number) => setFrame(Math.min(frames - 1, Math.max(0, Math.round((scale.dt(clientX - left - PAD)) * scale.fps))));
    setPlaying(false);
    at(e.clientX);
    startDrag(e, (_, ev) => at(ev.clientX));
  };

  return (
    <div
      className="relative h-[22px] cursor-ew-resize select-none"
      style={{ width }}
      onPointerDown={scrub}
      role="slider"
      aria-label="Time ruler"
      aria-valuemin={0}
      aria-valuemax={frames - 1}
      aria-valuenow={now}
    >
      {ticks.map((f) => {
        const isMajor = f % major === 0;
        return (
          <div key={f} className="absolute bottom-0" style={{ left: scale.x(f / scale.fps) }}>
            <div className={cn("w-px bg-line2", isMajor ? "h-2" : "h-1")} />
            {isMajor && (
              <span className="absolute bottom-2 -translate-x-1/2 font-mono text-[10px] tabular-nums text-faint">
                {f / scale.fps}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- rows ---------- */

interface ParamRow {
  kind: "param";
  param: string;
  label: string;
}
interface PhaseRow {
  kind: "phase";
  phase: Node;
  ranges: PhaseRange[];
}

function rowsFor(doc: SceneDoc, net: Network, node: Node, phases: Map<string, PhaseRange[]>): (ParamRow | PhaseRow)[] {
  const rows: (ParamRow | PhaseRow)[] = [];
  // On a Subnet instance, params named after promoted controls show the control's label.
  const promoted = node.subnet ? doc.networks.find((n) => n.id === node.subnet)?.promoted ?? [] : [];
  for (const [param, p] of Object.entries(node.params))
    if (p.keys?.length) rows.push({ kind: "param", param, label: promoted.find((c) => c.id === param)?.label ?? param });
  for (const n of chainAfter(net, node.id))
    if (n.type === "Phase") rows.push({ kind: "phase", phase: n, ranges: (phases.get(n.id) ?? []).filter((r) => r.node === node.id) });
  return rows;
}

function Diamond({ k, selected, onPointerDown, hold, live }: { k: KeyRef; selected: boolean; hold: boolean; live: boolean; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      type="button"
      aria-label={`Key ${k.param} at ${k.t.toFixed(2)}s`}
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      className="group absolute top-1/2 grid size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-xs"
    >
      <span
        className={cn(
          "rounded-[2px] border-[1.5px]",
          hold ? "rounded-none" : "rotate-45",
          live ? "size-[11px] border-ink bg-volt" : "size-[9px]",
          !live && (selected ? "border-ink bg-ink ring-2 ring-ink/25" : "border-ink bg-ink/80 group-hover:bg-ink"),
        )}
      />
    </button>
  );
}

function KeyTrack({ net, node, param, scale }: { net: Network; node: Node; param: string; scale: Scale }) {
  const keys = node.params[param]?.keys ?? [];
  const selectedKeys = useUi((s) => s.selectedKeys);
  const frame = useUi((s) => s.frame);

  const down = (e: React.PointerEvent, k: KeyRef) => {
    const ui = useUi.getState();
    const isSel = ui.selectedKeys.some((s) => sameKey(s, k));
    let moving = isSel ? ui.selectedKeys : [k];
    if (e.shiftKey) moving = isSel ? ui.selectedKeys.filter((s) => !sameKey(s, k)) : [...ui.selectedKeys, k];
    ui.selectKeys(moving);
    if (e.shiftKey) return;
    const coalesce = `keys-${++gesture}`;
    let applied = 0;
    startDrag(
      e,
      (dx) => {
        const want = snap(scale.dt(dx), scale.fps);
        if (want === applied) return;
        let next: KeyRef[] | null = null;
        docStore.getState().edit("Move keys", (d) => void (next = moveKeys(d, net.id, moving, want - applied)), { coalesce });
        if (next) {
          moving = next;
          applied = want;
          useUi.getState().selectKeys(next);
        }
      },
      () => docStore.getState().commit(),
    );
  };

  return (
    <>
      {keys.map((k, i) => {
        const ref = { node: node.id, param, t: k.t };
        return (
          <div key={i} className="absolute inset-y-0" style={{ left: scale.x(k.t) }}>
            <Diamond k={ref} hold={k.ease === "hold"} live={Math.abs(k.t * scale.fps - frame) < 0.5} selected={selectedKeys.some((s) => sameKey(s, ref))} onPointerDown={(e) => down(e, ref)} />
          </div>
        );
      })}
    </>
  );
}

function LayerBar({ net, node, scale }: { net: Network; node: Node; scale: Scale }) {
  const selected = useUi((s) => s.selectedNodes.includes(node.id));
  const tin = node.timing?.in ?? 0, tout = node.timing?.out ?? scale.duration;
  const left = scale.x(tin), right = scale.x(Math.min(tout, scale.duration));

  const down = (e: React.PointerEvent, mode: BarDrag) => {
    useUi.getState().selectNodes([node.id]);
    const coalesce = `bar-${++gesture}`;
    let applied = 0;
    const label = mode === "move" ? "Move layer" : "Trim layer";
    startDrag(
      e,
      (dx) => {
        const want = snap(scale.dt(dx), scale.fps);
        if (want === applied) return;
        if (docStore.getState().edit(label, (d) => dragLayer(d, net.id, node.id, mode, want - applied, scale.duration, 1 / scale.fps), { coalesce }))
          applied = want;
      },
      () => docStore.getState().commit(),
    );
  };

  return (
    <div
      className={cn(
        "absolute inset-y-[7px] cursor-grab rounded-full border-[1.5px] bg-bar active:cursor-grabbing",
        selected ? "border-ink" : "border-transparent",
        !node.enabled && "opacity-40",
      )}
      style={{ left, width: Math.max(2, right - left) }}
      onPointerDown={(e) => down(e, "move")}
      aria-label={`${node.name}: ${tin.toFixed(2)}s to ${tout.toFixed(2)}s`}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => down(e, "in")} aria-hidden />
      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => down(e, "out")} aria-hidden />
    </div>
  );
}

function PhaseBar({ ranges, scale, mode }: { ranges: PhaseRange[]; scale: Scale; mode: string }) {
  if (!ranges.length) return null;
  const start = Math.min(...ranges.map((r) => r.start)), end = Math.max(...ranges.map((r) => r.end));
  const span = scale.x(end) - scale.x(start);
  return (
    <div className="absolute inset-y-[7px] overflow-hidden rounded-full" style={{ left: scale.x(start), width: Math.max(2, span) }} title={`${mode}: ${start.toFixed(2)}s to ${end.toFixed(2)}s`}>
      <div className="absolute inset-0 bg-bar" />
      {ranges.slice(0, 200).map((r) => (
        <div
          key={r.part}
          className="absolute top-0 h-full bg-ink/15"
          style={{ left: scale.x(r.start) - scale.x(start), width: Math.max(1, scale.x(r.end) - scale.x(r.start)) }}
        />
      ))}
    </div>
  );
}

function LayerRows({ doc, net, node, scale, width, phases, unwired, last }: { doc: SceneDoc; net: Network; node: Node; scale: Scale; width: number; phases: Map<string, PhaseRange[]>; unwired?: boolean; last: boolean }) {
  const sub = rowsFor(doc, net, node, phases);
  const { open, selected, selectedIds, setExpanded, selectNodes } = useUi(
    useShallow((s) => ({
      open: s.expanded[node.id] ?? sub.length > 0,
      selected: s.selectedNodes.includes(node.id),
      selectedIds: s.selectedNodes,
      setExpanded: s.setExpanded,
      selectNodes: s.selectNodes,
    })),
  );
  const label = isNodeType(node.type) ? CATALOG[node.type].label : node.type;
  const fill = layerFill(doc, node);
  const role = roleLabel(node.role);

  return (
    <>
      <div
        className={cn("flex", unwired && "opacity-50")}
        style={{ height: ROW_H }}
        onDragOver={(e) => e.dataTransfer.types.includes(SOLID_MIME) && takesMaterial(node.type) && e.preventDefault()}
        onDrop={(e) => {
          const m = JSON.parse(e.dataTransfer.getData(SOLID_MIME) || "null") as { value: string; name: string } | null;
          if (m && applySolid(node.id, m.value, m.name)) selectNodes([node.id]);
        }}
      >
        <div role="treeitem" aria-selected={selected} aria-expanded={sub.length ? open : undefined} className="relative z-10 shrink-0 bg-card pr-2.5" style={{ width: NAME_W }}>
          <Elbow last={last} />
          <div
            className={cn(
              "ml-[30px] flex h-full cursor-default items-center gap-1.5 rounded-md pl-1 pr-2 transition-colors",
              selected ? "bg-raised font-semibold shadow-card" : "hover:bg-field",
            )}
            onClick={() => selectNodes([node.id])}
            onDoubleClick={() => node.subnet && openSubnet(node)}
            title={node.subnet ? "Double-click to open" : undefined}
          >
            <button
              type="button"
              aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
              aria-expanded={open}
              disabled={!sub.length}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(node.id, !open);
              }}
              className="grid size-4 shrink-0 place-items-center rounded-xs text-muted-foreground hover:text-foreground disabled:invisible"
            >
              {open ? <ChevronDown className="size-3" strokeWidth={2.5} /> : <ChevronRight className="size-3" strokeWidth={2.5} />}
            </button>
            {node.subnet && <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {fill && <Sphere color={fill} size={12} />}
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{unwired ? "not wired" : role ?? label.toLowerCase()}</span>
          </div>
        </div>
        <div className="relative" style={{ width }}>
          <LayerBar net={net} node={node} scale={scale} />
        </div>
      </div>
      {open &&
        sub.map((r) => (
          <div key={r.kind === "param" ? `p:${r.param}` : `ph:${r.phase.id}`} className="flex" style={{ height: SUB_H }}>
            <div className="relative z-10 shrink-0 bg-card pr-2.5" style={{ width: NAME_W }}>
              {!last && <span aria-hidden className="absolute bottom-0 left-[14px] top-0 border-l-[1.5px] border-line2" />}
              <span aria-hidden className="absolute bottom-0 left-[38px] top-0 border-l-[1.5px] border-line2" />
              <div
                className={cn(
                  "ml-[50px] flex h-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground",
                  r.kind === "phase" && "cursor-pointer hover:bg-field hover:text-foreground",
                  r.kind === "phase" && selectedIds.includes(r.phase.id) && "bg-raised text-foreground shadow-card",
                )}
                onClick={r.kind === "phase" ? () => selectNodes([r.phase.id]) : undefined}
              >
                {r.kind === "param" ? (
                  <span className="truncate">{r.label.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
                ) : (
                  <>
                    <span className="truncate">{r.phase.name}</span>
                    <span className="ml-auto text-[11px]">{String(r.phase.params.mode?.value ?? "in")}</span>
                  </>
                )}
              </div>
            </div>
            <div className="relative" style={{ width }}>
              {r.kind === "param" ? (
                <KeyTrack net={net} node={node} param={r.param} scale={scale} />
              ) : (
                <PhaseBar ranges={r.ranges} scale={scale} mode={String(r.phase.params.mode?.value ?? "in")} />
              )}
            </div>
          </div>
        ))}
    </>
  );
}

/** Tree connector from the network row down to a layer: a vertical line with a rounded elbow. */
function Elbow({ last }: { last: boolean }) {
  return (
    <>
      <span aria-hidden className="absolute left-[14px] top-[-4px] h-[19px] w-[10px] rounded-bl-[7px] border-b-[1.5px] border-l-[1.5px] border-line2" />
      {!last && <span aria-hidden className="absolute bottom-0 left-[14px] top-[14px] border-l-[1.5px] border-line2" />}
    </>
  )
}

/* ---------- timeline ---------- */

export function Timeline() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const frame = useUi((s) => s.frame);
  const net = shownNetwork(doc, path);
  const comp = viewComp(doc, path);

  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = track.current!;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(0, e!.contentRect.width - NAME_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = useScale(width, comp.duration, comp.fps);

  const { wired, unwired } = useMemo(() => layerOrder(net), [net]);
  const ordered = [...[...wired].reverse().map((n) => ({ n, unwired: false })), ...unwired.map((n) => ({ n, unwired: true }))];
  const phases = useMemo(() => {
    const m = new Map<string, PhaseRange[]>();
    for (const n of net.nodes) if (n.type === "Phase") m.set(n.id, phaseRanges(doc, net.id, n.id));
    return m;
  }, [doc, net]);

  const clearSelection = () => useUi.getState().selectNodes([]);

  return (
    <div className="relative h-full px-3 pb-2.5">
    <div ref={track} className="h-full overflow-y-auto overflow-x-hidden" onPointerDown={(e) => e.target === e.currentTarget && clearSelection()}>
      <div className="sticky top-0 z-20 flex bg-card">
        <div className="z-10 h-[22px] shrink-0 bg-card" style={{ width: NAME_W }} />
        {width > 0 && <Ruler scale={scale} width={width} />}
      </div>

      {width > 0 && (
        <div role="tree" aria-label="Layers" className="relative">
          <div className="flex" style={{ height: ROW_H }}>
            <div role="treeitem" aria-expanded className="flex shrink-0 items-center gap-2 bg-card px-2 font-semibold" style={{ width: NAME_W }}>
              <ChevronDown className="size-3" strokeWidth={2.5} aria-hidden />
              <span className="truncate">{net.name}</span>
              <span className="font-normal text-faint">({ordered.length})</span>
            </div>
            <div className="relative" style={{ width }}>
              <div className="absolute inset-y-[7px] rounded-full bg-bar opacity-60" style={{ left: scale.x(0), width: scale.x(comp.duration) - scale.x(0) }} />
            </div>
          </div>
          {ordered.map(({ n, unwired: u }, i) => (
            <LayerRows key={n.id} doc={doc} net={net} node={n} scale={scale} width={width} phases={phases} unwired={u} last={i === ordered.length - 1} />
          ))}
          {!ordered.length && <p className="p-6 text-center text-xs text-muted-foreground">No layers here yet. Add one with + Add.</p>}
        </div>
      )}

    </div>
      {width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-30 w-[1.5px] bg-ink"
          style={{ left: 12 + NAME_W + scale.x(frame / comp.fps), bottom: 10 }}
          aria-hidden
        >
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-volt px-[7px] py-px font-mono text-[10px] font-medium text-volt-ink">
            {Math.floor(frame / comp.fps)}:{String(frame % Math.round(comp.fps)).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  );
}
