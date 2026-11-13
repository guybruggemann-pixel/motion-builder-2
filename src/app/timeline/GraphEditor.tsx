/**
 * Graph editor: one keyed param's value or speed over time. Click a segment to select it; a
 * cubic-bezier ease shows two handles you drag to shape it (stored as `cubicBezier(x1,y1,x2,y2)`,
 * the segment's ease in the doc). A menu ease (outExpo...) can be turned into its closest bezier.
 *
 * The param shown: the one of the selected key, else the first keyed param of the selected node.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ease as easeFn, easeChoice } from "@core/motion";
import { BEZIER_OF } from "@core/motion";
import { sampleKeys, type Key, type Network, type Node, type Value } from "@core/scene";
import { Button, Tabs, TabsList, TabsTrigger } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { setKeyEase } from "@/app/inspector/edits";
import { EasePresets } from "./EasePresets";
import { docStore, shownNetwork, useDocStore, useUi, viewComp } from "@/app/store";

export { BEZIER_OF };

export const bezierOf = (ease: string): [number, number, number, number] | undefined => {
  const c = easeChoice(ease);
  if (c?.ease === "custom") return c.bezier;
  return c ? BEZIER_OF[c.ease] : undefined;
};

const comps = (v: Value): number[] => (typeof v === "number" ? [v] : Array.isArray(v) ? v : []);
const COLORS = ["var(--iris-cyan)", "var(--iris-magenta)", "var(--iris-amber)"];
const PAD = { l: 48, r: 16, t: 16, b: 22 };

function useTarget(): { net: Network; node: Node; param: string; keys: Key[] } | undefined {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const selKeys = useUi((s) => s.selectedKeys);
  const selNodes = useUi((s) => s.selectedNodes);
  const net = shownNetwork(doc, path);
  const fromKey = selKeys[0];
  const node = net.nodes.find((n) => n.id === (fromKey?.node ?? selNodes[0]));
  if (!node) return undefined;
  const param = fromKey?.param ?? Object.entries(node.params).find(([, p]) => p.keys && p.keys.length > 1 && comps(p.value).length)?.[0];
  const keys = param ? node.params[param]?.keys : undefined;
  return param && keys && keys.length > 1 && comps(keys[0]!.v).length ? { net, node, param, keys: [...keys].sort((a, b) => a.t - b.t) } : undefined;
}

export function GraphEditor() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const frame = useUi((s) => s.frame);
  const comp = viewComp(doc, path);
  const target = useTarget();
  const [mode, setMode] = useState<"value" | "speed">("value");
  const [segment, setSegment] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setSegment(0), [target?.node.id, target?.param]);

  const keys = target?.keys ?? [];
  const seg = Math.min(segment, Math.max(0, keys.length - 2));
  const t0 = keys[0]?.t ?? 0, t1 = keys.at(-1)?.t ?? 1;
  const tPad = Math.max(0.1, (t1 - t0) * 0.08);
  const span: [number, number] = [Math.max(0, t0 - tPad), t1 + tPad];

  // Sample the curve (value or speed per component) across the keyed range.
  const samples = useMemo(() => {
    if (!target) return [];
    const n = 400, out: { t: number; v: number[] }[] = [];
    const dt = (span[1] - span[0]) / n;
    for (let i = 0; i <= n; i++) {
      const t = span[0] + i * dt;
      const v = comps(sampleKeys(keys, t));
      if (mode === "value") out.push({ t, v });
      else {
        const a = comps(sampleKeys(keys, t - dt / 2)), b = comps(sampleKeys(keys, t + dt / 2));
        out.push({ t, v: v.map((_, c) => Math.abs((b[c]! - a[c]!) / dt)) });
      }
    }
    return out;
  }, [target, keys, mode, span[0], span[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const nComp = samples[0]?.v.length ?? 0;
  let lo = Infinity, hi = -Infinity;
  for (const s of samples) for (const x of s.v) (lo = Math.min(lo, x)), (hi = Math.max(hi, x));
  if (mode === "speed") lo = 0;
  if (!(hi > lo)) (hi = lo + 1), (lo = lo - 1);
  const vPad = (hi - lo) * 0.12;
  lo -= vPad;
  hi += vPad;

  const W = Math.max(1, size.w - PAD.l - PAD.r), H = Math.max(1, size.h - PAD.t - PAD.b);
  const X = (t: number) => PAD.l + ((t - span[0]) / (span[1] - span[0])) * W;
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * H;

  const a = keys[seg], b = keys[seg + 1];
  const bez = a ? bezierOf(a.ease) : undefined;
  const isCustom = a ? easeChoice(a.ease)?.ease === "custom" : false;
  const fps = comp.fps, tol = 0.5 / fps;

  // Handle geometry for the selected segment, drawn on the first component's value curve.
  const handles = useMemo(() => {
    if (!a || !b || !bez || !isCustom || mode !== "value") return undefined;
    const va = comps(a.v)[0]!, vb = comps(b.v)[0]!;
    const P = (x: number, y: number) => ({ x: X(a.t + x * (b.t - a.t)), y: Y(va + y * (vb - va)) });
    return { A: P(0, 0), B: P(1, 1), h1: P(bez[0], bez[1]), h2: P(bez[2], bez[3]), va, vb };
  }, [a, b, bez, isCustom, mode, size, lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragHandle = (which: 1 | 2) => (e: React.PointerEvent) => {
    if (!target || !a || !b || !bez || !handles) return;
    e.preventDefault();
    const rect = box.current!.getBoundingClientRect();
    const key = `bez-${target.node.id}-${target.param}-${a.t}-${Date.now()}`;
    const start = [...bez] as [number, number, number, number];
    const onMove = (ev: PointerEvent) => {
      const t = span[0] + ((ev.clientX - rect.left - PAD.l) / W) * (span[1] - span[0]);
      const v = lo + (1 - (ev.clientY - rect.top - PAD.t) / H) * (hi - lo);
      const x = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      const dv = handles.vb - handles.va;
      const y = dv === 0 ? 0 : Math.min(2, Math.max(-1, (v - handles.va) / dv));
      const nb = [...start] as [number, number, number, number];
      nb[which === 1 ? 0 : 2] = +x.toFixed(3);
      nb[which === 1 ? 1 : 3] = +y.toFixed(3);
      start.splice(0, 4, ...nb);
      docStore.getState().edit("Shape curve", (d) => setKeyEase(d, target.net.id, target.node.id, target.param, a.t, tol, `cubicBezier(${nb.join(",")})`), { coalesce: key });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      docStore.getState().commit();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const makeEditable = () => {
    if (!target || !a || !bez) return;
    docStore.getState().edit("Make curve editable", (d) => setKeyEase(d, target.net.id, target.node.id, target.param, a.t, tol, `cubicBezier(${bez.join(",")})`));
  };

  const applyPreset = (e: string) => {
    if (!target || !a) return;
    docStore.getState().edit("Ease preset", (d) => setKeyEase(d, target.net.id, target.node.id, target.param, a.t, tol, e));
  };

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = box.current!.getBoundingClientRect();
    const t = span[0] + ((e.clientX - rect.left - PAD.l) / W) * (span[1] - span[0]);
    const i = keys.findIndex((k, j) => j < keys.length - 1 && t >= k.t && t <= keys[j + 1]!.t);
    if (i >= 0) setSegment(i);
  };

  const yTicks = 4;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <Tabs value={mode} defaultValue="value" onValueChange={(v) => setMode(v as "value" | "speed")} className="gap-0">
          <TabsList className="h-7">
            <TabsTrigger value="value">Value</TabsTrigger>
            <TabsTrigger value="speed">Speed</TabsTrigger>
          </TabsList>
        </Tabs>
        {target ? (
          <>
            <span className="truncate font-mono text-xs">
              {target.node.name} · {target.param}
            </span>
            {a && b && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {a.t.toFixed(2)}s → {b.t.toFixed(2)}s · {a.ease}
              </span>
            )}
            {a && b && !isCustom && bez && (
              <Button variant="secondary" size="sm" className="ml-auto" onClick={makeEditable} title="Replace this segment's ease with its closest bezier, so you can drag the handles">
                Make curve editable
              </Button>
            )}
          </>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">Select a key or a layer with keys</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
      <div ref={box} className="relative min-w-0 flex-1 bg-background">
        {target && size.w > 0 && (
          <svg width={size.w} height={size.h} className="absolute inset-0" onPointerDown={pick} role="img" aria-label={`${mode} graph of ${target.param}`}>
            {Array.from({ length: yTicks + 1 }, (_, i) => {
              const v = lo + ((hi - lo) * i) / yTicks;
              return (
                <g key={i}>
                  <line x1={PAD.l} x2={PAD.l + W} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
                  <text x={PAD.l - 6} y={Y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                    {+v.toFixed(Math.abs(hi - lo) < 10 ? 2 : 0)}
                  </text>
                </g>
              );
            })}
            {a && b && <rect x={X(a.t)} y={PAD.t} width={X(b.t) - X(a.t)} height={H} fill="var(--field)" opacity={0.35} />}
            {Array.from({ length: nComp }, (_, c) => (
              <polyline
                key={c}
                fill="none"
                stroke={COLORS[c % COLORS.length]}
                strokeWidth={1.5}
                points={samples.map((s) => `${X(s.t)},${Y(s.v[c]!)}`).join(" ")}
              />
            ))}
            {mode === "value" &&
              keys.map((k, i) =>
                comps(k.v).map((v, c) => (
                  <rect key={`${i}-${c}`} x={X(k.t) - 3.5} y={Y(v) - 3.5} width={7} height={7} transform={`rotate(45 ${X(k.t)} ${Y(v)})`} className={cn(i === seg || i === seg + 1 ? "fill-ink" : "fill-muted-foreground")} />
                )),
              )}
            {handles && (
              <g>
                <line x1={handles.A.x} y1={handles.A.y} x2={handles.h1.x} y2={handles.h1.y} stroke="var(--ink)" />
                <line x1={handles.B.x} y1={handles.B.y} x2={handles.h2.x} y2={handles.h2.y} stroke="var(--ink)" />
                {([1, 2] as const).map((w) => {
                  const p = w === 1 ? handles.h1 : handles.h2;
                  return <circle key={w} cx={p.x} cy={p.y} r={5} className="cursor-grab fill-card stroke-ink" strokeWidth={1.5} onPointerDown={dragHandle(w)} aria-label={`Bezier handle ${w}`} />;
                })}
              </g>
            )}
            <line x1={X(frame / fps)} x2={X(frame / fps)} y1={PAD.t} y2={PAD.t + H} stroke="var(--ink)" />
          </svg>
        )}
      </div>
      <EasePresets current={a && b ? a.ease : undefined} onPick={target && a && b ? applyPreset : undefined} />
      </div>
    </div>
  );
}

/** Exposed for tests: the ease function a bezier handle edit produces. */
export const curveOf = (b: [number, number, number, number]) => easeFn(`cubicBezier(${b.join(",")})`);
