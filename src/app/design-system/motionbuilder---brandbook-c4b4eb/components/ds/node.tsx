import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export const nodeCardVariants = cva(
  "relative w-56 rounded-sm border bg-surface text-foreground shadow-panel transition-shadow focus-within:shadow-glow",
  {
    variants: {
      category: {
        generator: "[--node:var(--color-node-generator)]",
        cloner: "[--node:var(--color-node-cloner)]",
        effector: "[--node:var(--color-node-effector)]",
        field: "[--node:var(--color-node-field)]",
        math: "[--node:var(--color-node-math)]",
      },
      state: {
        idle: "border-border",
        selected: "border-[var(--node)]",
        error: "border-destructive",
        bypassed: "border-dashed border-wire opacity-50",
      },
    },
    defaultVariants: { category: "generator", state: "idle" },
  },
);

export interface NodeCardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof nodeCardVariants> {
  /** Node type name shown in the header, e.g. "GridCloner". */
  title: string;
  /** Node id shown in mono, e.g. "cln_1". */
  nodeId?: string;
  icon?: React.ReactNode;
}

/** A node in the procedural graph. Category sets the accent stripe; state reflects selection/errors. */
export const NodeCard = React.forwardRef<HTMLDivElement, NodeCardProps>(
  ({ title, nodeId, icon, category, state, className, children, ...props }, ref) => (
    <div ref={ref} className={cn(nodeCardVariants({ category, state }), className)} {...props}>
      <div className="flex h-8 items-center gap-2 border-b border-border px-2.5">
        <span aria-hidden className="h-3 w-1 bg-[var(--node)]" />
        {icon && <span className="text-[var(--node)] [&_svg]:size-3.5">{icon}</span>}
        <span className="font-display text-xs font-semibold tracking-tight">{title}</span>
        {nodeId && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{nodeId}</span>}
      </div>
      <div className="grid gap-2 py-2">{children}</div>
    </div>
  ),
);
NodeCard.displayName = "NodeCard";

export interface NodePortProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  direction?: "in" | "out";
  connected?: boolean;
  /** Mono value preview, e.g. "[1, 3, 1]". */
  value?: string;
}

/** An input or output row on a NodeCard, with its connection socket on the edge. */
export const NodePort = React.forwardRef<HTMLDivElement, NodePortProps>(
  ({ label, direction = "in", connected = false, value, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center gap-2 px-2.5 text-xs",
        direction === "out" && "flex-row-reverse text-right",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-2 -translate-y-1/2 rotate-45 border border-[var(--node,var(--color-wire))]",
          direction === "in" ? "-left-1" : "-right-1",
          connected ? "bg-[var(--node,var(--color-wire))]" : "bg-background",
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      {value && <span className="ml-auto font-mono text-[11px] text-foreground [.flex-row-reverse>&]:ml-0 [.flex-row-reverse>&]:mr-auto">{value}</span>}
    </div>
  ),
);
NodePort.displayName = "NodePort";

export interface WireProps extends Omit<React.SVGAttributes<SVGSVGElement>, "from" | "to"> {
  from: { x: number; y: number };
  to: { x: number; y: number };
  variant?: "idle" | "active" | "invalid";
}

/** Bezier connection between two ports. `active` animates a dashed signal along the path. */
export const Wire = React.forwardRef<SVGSVGElement, WireProps>(
  ({ from, to, variant = "idle", className, ...props }, ref) => {
    const dx = Math.max(40, Math.abs(to.x - from.x) / 2);
    const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
    return (
      <svg ref={ref} className={cn("pointer-events-none absolute inset-0 overflow-visible", className)} aria-hidden {...props}>
        <path
          d={d}
          fill="none"
          strokeWidth={1.5}
          className={cn(
            variant === "idle" && "stroke-wire",
            variant === "active" && "stroke-primary [stroke-dasharray:6_4] animate-[wire-flow_0.6s_linear_infinite]",
            variant === "invalid" && "stroke-destructive [stroke-dasharray:2_3]",
          )}
        />
        <style>{"@keyframes wire-flow{to{stroke-dashoffset:-10}}"}</style>
      </svg>
    );
  },
);
Wire.displayName = "Wire";
