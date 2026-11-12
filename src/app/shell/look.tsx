/**
 * Small shared bits of the soft UI: friendly role names, colour resolving for previews, the
 * material sphere and the mini ease curve. Previews only; output always comes from the evaluator.
 */
import { evaluateParam, type Node, type Role, type SceneDoc } from "@core/scene";
import { ease } from "@core/motion";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

/** Generic names for roles in the UI (the schema enum stays as it is). */
export const ROLE_LABEL: Partial<Record<Role, string>> = {
  title: "headline",
  subtitle: "subline",
  body: "body",
  panel: "shape",
  logo: "logo",
  image: "image",
  background: "background",
  "caption-word": "caption word",
  "caption-line": "caption line",
  none: "no role",
};
export const roleLabel = (r: Role | null | undefined) => (r ? ROLE_LABEL[r] ?? r : undefined);

/** A colour param value as CSS: brand tokens resolved, anything else passed through. */
export function cssColor(doc: SceneDoc, v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (v.startsWith("brand:")) return doc.brand?.colors.find((c) => c.token === v.slice(6))?.value;
  return v;
}

/** The colour a layer shows as its material for now: its fill at time t (a Solid material). */
export function layerFill(doc: SceneDoc, node: Node, t = 0): string | undefined {
  const p = node.params.fill;
  if (p) return cssColor(doc, p.keys?.length ? evaluateParam({ value: p.value, keys: p.keys }, t) : p.value);
  if (node.type === "Text") return "#ffffff";
  if (node.type === "Shape") return "#888888";
  return undefined;
}

/** CSS material preview: a lit sphere in the material's colour (12/14/24/30/44 px). */
export function Sphere({ color, size = 14, className }: { color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "var(--line2)",
        backgroundImage: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), rgba(255,255,255,0) 42%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.28), rgba(0,0,0,0) 60%)",
        boxShadow: "inset 0 0 0 1px rgba(16,17,20,0.12)",
      }}
    />
  );
}

/** SVG path of an ease from 0..1, drawn in a 40×28 box (y up), sampled from the core ease. */
export function easePath(name: string, samples = 32): string {
  let f: (t: number) => number;
  try {
    f = ease(name);
  } catch {
    f = (t) => t;
  }
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const y = 24 - f(t) * 20;
    pts.push(`${(2 + t * 36).toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(" L")}`;
}

/** A small ease curve (from the real core ease), for cards, toolbars and preset tiles. */
export function MiniCurve({ ease: name, width = 22, height = 14, strokeWidth = 2 }: { ease: string; width?: number | string; height?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden width={width} height={height} viewBox="0 -6 40 34" preserveAspectRatio="none" className="shrink-0 overflow-visible">
      <path d={easePath(name)} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
