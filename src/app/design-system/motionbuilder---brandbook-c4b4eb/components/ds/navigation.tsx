import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

type TabsCtx = { value: string; setValue: (v: string) => void; baseId: string };
const TabsContext = React.createContext<TabsCtx | null>(null);
const useTabs = () => {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs parts must be used inside <Tabs>");
  return ctx;
};

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, defaultValue, onValueChange, className, ...props }, ref) => {
    const [inner, setInner] = React.useState(defaultValue);
    const baseId = React.useId();
    const current = value ?? inner;
    const setValue = (v: string) => {
      if (value === undefined) setInner(v);
      onValueChange?.(v);
    };
    return (
      <TabsContext.Provider value={{ value: current, setValue, baseId }}>
        <div ref={ref} className={cn("grid gap-3", className)} {...props} />
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn("inline-flex h-[34px] items-center gap-0.5 rounded-md bg-field p-[3px]", className)}
      {...props}
    />
  ),
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, ...props }, ref) => {
    const ctx = useTabs();
    const active = ctx.value === value;
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`${ctx.baseId}-t-${value}`}
        aria-controls={`${ctx.baseId}-p-${value}`}
        aria-selected={active}
        data-state={active ? "active" : "inactive"}
        onClick={() => ctx.setValue(value)}
        className={cn(
          "h-full rounded-seg px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 data-[state=active]:bg-raised data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-card",
          className,
        )}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ value, className, ...props }, ref) => {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${ctx.baseId}-p-${value}`}
      aria-labelledby={`${ctx.baseId}-t-${value}`}
      className={cn("focus-visible:outline-none", className)}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

export interface PhaseStepperProps extends React.HTMLAttributes<HTMLElement> {
  /** Ordered phase names, e.g. Intent, Setup, Build, Animate, Look, Export. */
  phases: string[];
  /** Index of the current phase. */
  current: number;
  /** Which steps can be opened (default: all, when onPhaseSelect is set). */
  enabled?: boolean[];
  onPhaseSelect?: (index: number) => void;
}

/** The flow stepper (Import, Draft, Refine, Deliver). Done steps get a check; the current one is the black pill. */
export const PhaseStepper = React.forwardRef<HTMLElement, PhaseStepperProps>(
  ({ phases, current, onPhaseSelect, enabled, className, ...props }, ref) => (
    <nav ref={ref} aria-label="Workflow" className={cn("flex", className)} {...props}>
      <ol className="flex gap-0.5 rounded-full bg-card p-1 shadow-card">
        {phases.map((phase, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={phase}>
              <button
                type="button"
                aria-current={state === "current" ? "step" : undefined}
                disabled={!onPhaseSelect || (enabled && !enabled[i])}
                onClick={() => onPhaseSelect?.(i)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] transition-colors disabled:cursor-default",
                  state === "current" ? "bg-ink font-semibold text-ink-foreground" : "text-muted-foreground enabled:hover:bg-field enabled:hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-[18px] place-items-center rounded-full text-[10px]",
                    state === "done" && "bg-field",
                    state === "current" && "bg-[rgba(127,127,127,0.3)]",
                    state === "todo" && "border border-line2",
                  )}
                >
                  {state === "done" ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
                </span>
                {phase}
                {state === "done" && <span className="sr-only">(done)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  ),
);
PhaseStepper.displayName = "PhaseStepper";
