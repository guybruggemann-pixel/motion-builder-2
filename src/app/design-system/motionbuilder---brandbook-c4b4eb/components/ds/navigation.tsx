import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

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
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-sm border border-border bg-muted p-0.5", className)}
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
          "h-full rounded-xs px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=active]:bg-elevated data-[state=active]:text-foreground",
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
  onPhaseSelect?: (index: number) => void;
}

/** The workspace's phase navigation. Completed phases show a check; the current one is highlighted. */
export const PhaseStepper = React.forwardRef<HTMLElement, PhaseStepperProps>(
  ({ phases, current, onPhaseSelect, className, ...props }, ref) => (
    <nav ref={ref} aria-label="Workflow phases" className={cn("flex items-stretch", className)} {...props}>
      <ol className="flex w-full items-stretch border border-border">
        {phases.map((phase, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={phase} className="flex-1 border-r border-border last:border-r-0">
              <button
                type="button"
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => onPhaseSelect?.(i)}
                className={cn(
                  "flex h-10 w-full items-center gap-2 px-3 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "done" && "text-foreground hover:bg-accent",
                  state === "todo" && "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="font-mono text-[10px] tabular-nums opacity-70">
                  {state === "done" ? <Check className="size-3" aria-label="done" /> : String(i).padStart(2, "0")}
                </span>
                <span className="font-medium">{phase}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  ),
);
PhaseStepper.displayName = "PhaseStepper";
