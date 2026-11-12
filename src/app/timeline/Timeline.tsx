/**
 * Timeline for the shown network: a ruler you scrub, one row per layer node (frontmost on top)
 * with its in/out bar, and twirl-down rows for keyed params (diamonds) and the Phase nodes acting
 * on the layer (per-part ranges). Bars and keys drag in whole frames; every drag is one undo step.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { CATALOG, chainAfter, isNodeType, layerOrder, phaseRanges, type Network, type Node, type PhaseRange, type SceneDoc } from "@core/scene";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { docStore, sameKey, shownNetwork, useDocStore, useUi, viewComp, type KeyRef } from "@/store";
import { openSubnet } from "@/store/navigation";
import { dragLayer, moveKeys, type BarDrag } from "./edits";

const NAME_W = 232;
const ROW_H = 24;
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
      className="relative h-7 cursor-ew-resize select-none border-b border-border"
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
            <div className={cn("w-px bg-wire", isMajor ? "h-2.5" : "h-1.5")} />
            {isMajor && (
              <span className="absolute bottom-3 -translate-x-1/2 font-mono text-[10px] tabular-nums text-muted-foreground">
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

function Diamond({ k, selected, onPointerDown, hold }: { k: KeyRef; selected: boolean; hold: boolean; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      type="button"
      aria-label={`Key ${k.param} at ${k.t.toFixed(2)}s`}
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      className="group absolute top-1/2 grid size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "size-[9px] border",
          hold ? "rounded-none" : "rotate-45",
          selected ? "border-primary bg-primary" : "border-foreground/70 bg-elevated group-hover:bg-foreground",
        )}
      />
    </button>
  );
}

function KeyTrack({ net, node, param, scale }: { net: Network; node: Node; param: string; scale: Scale }) {
  const keys = node.params[param]?.keys ?? [];
  const selectedKeys = useUi((s) => s.selectedKeys);

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
            <Diamond k={ref} hold={k.ease === "hold"} selected={selectedKeys.some((s) => sameKey(s, ref))} onPointerDown={(e) => down(e, ref)} />
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
        "absolute inset-y-1 cursor-grab border bg-elevated active:cursor-grabbing",
        selected ? "border-primary" : "border-wire",
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
    <div className="absolute inset-y-[7px]" style={{ left: scale.x(start), width: Math.max(2, span) }} title={`${mode}: ${start.toFixed(2)}s to ${end.toFixed(2)}s`}>
      <div className="absolute inset-0 bg-iris-cyan/25" />
      {ranges.slice(0, 200).map((r) => (
        <div
          key={r.part}
          className="absolute top-0 h-full bg-iris-cyan/60"
          style={{ left: scale.x(r.start) - scale.x(start), width: Math.max(1, scale.x(r.end) - scale.x(r.start)) }}
        />
      ))}
    </div>
  );
}

function LayerRows({ doc, net, node, scale, width, phases, unwired }: { doc: SceneDoc; net: Network; node: Node; scale: Scale; width: number; phases: Map<string, PhaseRange[]>; unwired?: boolean }) {
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

  return (
    <>
      <div className={cn("flex", unwired && "opacity-50")} style={{ height: ROW_H }}>
        <div
          className={cn(
            "z-10 flex shrink-0 items-center gap-1 border-b border-r border-border bg-surface pr-2 text-sm",
            selected && "bg-accent",
          )}
          style={{ width: NAME_W }}
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
            className="grid size-5 place-items-center text-muted-foreground hover:text-foreground disabled:invisible"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {node.subnet && <Layers className="size-3.5 shrink-0 text-iris-violet" aria-hidden />}
          <span className="truncate">{node.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-muted-foreground">{unwired ? "not wired" : label}</span>
        </div>
        <div className="relative border-b border-border" style={{ width }}>
          <LayerBar net={net} node={node} scale={scale} />
        </div>
      </div>
      {open &&
        sub.map((r) => (
          <div key={r.kind === "param" ? `p:${r.param}` : `ph:${r.phase.id}`} className="flex" style={{ height: ROW_H }}>
            <div
              className={cn(
                "z-10 flex shrink-0 items-center gap-2 border-b border-r border-border bg-surface pl-9 pr-2",
                r.kind === "phase" && "cursor-pointer hover:bg-accent",
                r.kind === "phase" && selectedIds.includes(r.phase.id) && "bg-accent",
              )}
              style={{ width: NAME_W }}
              onClick={r.kind === "phase" ? () => selectNodes([r.phase.id]) : undefined}
            >
              {r.kind === "param" ? (
                <span className="truncate font-mono text-xs text-muted-foreground">{r.label}</span>
              ) : (
                <>
                  <span className="size-2 shrink-0 bg-iris-cyan" aria-hidden />
                  <span className="truncate text-xs">{r.phase.name}</span>
                  <span className="ml-auto font-mono text-[10px] uppercase text-muted-foreground">
                    {String(r.phase.params.mode?.value ?? "in")}
                  </span>
                </>
              )}
            </div>
            <div className="relative border-b border-border bg-background/40" style={{ width }}>
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
  const phases = useMemo(() => {
    const m = new Map<string, PhaseRange[]>();
    for (const n of net.nodes) if (n.type === "Phase") m.set(n.id, phaseRanges(doc, net.id, n.id));
    return m;
  }, [doc, net]);

  const clearSelection = () => useUi.getState().selectNodes([]);

  return (
    <div className="relative h-full">
    <div ref={track} className="h-full overflow-y-auto overflow-x-hidden" onPointerDown={(e) => e.target === e.currentTarget && clearSelection()}>
      <div className="sticky top-0 z-20 flex bg-surface">
        <div className="z-10 flex h-7 shrink-0 items-center border-b border-r border-border bg-surface px-3" style={{ width: NAME_W }}>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{net.name}</span>
        </div>
        {width > 0 && <Ruler scale={scale} width={width} />}
      </div>

      {width > 0 && (
        <div className="relative">
          {[...wired].reverse().map((n) => (
            <LayerRows key={n.id} doc={doc} net={net} node={n} scale={scale} width={width} phases={phases} />
          ))}
          {unwired.map((n) => (
            <LayerRows key={n.id} doc={doc} net={net} node={n} scale={scale} width={width} phases={phases} unwired />
          ))}
          {!wired.length && !unwired.length && (
            <p className="p-6 text-center font-mono text-xs text-muted-foreground">No layers in this network</p>
          )}
        </div>
      )}

    </div>
      {width > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 z-30 w-px bg-primary"
          style={{ left: NAME_W + scale.x(frame / comp.fps) }}
          aria-hidden
        >
          <div className="absolute -left-[5px] top-0 size-[11px] bg-primary [clip-path:polygon(0_0,100%_0,50%_100%)]" />
        </div>
      )}
    </div>
  );
}
