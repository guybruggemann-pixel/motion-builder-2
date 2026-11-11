import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export const inputVariants = cva(
  "flex w-full rounded-sm border bg-muted text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive",
  {
    variants: {
      variant: {
        default: "border-border font-sans",
        mono: "border-border font-mono tabular-nums",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        md: "h-8 px-2.5 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

/** Text and numeric entry. Use `variant="mono"` for node parameter values. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, ...props }, ref) => (
    <input ref={ref} className={cn(inputVariants({ variant, size }), className)} {...props} />
  ),
);
Input.displayName = "Input";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

/** Uppercase utility label, wired to its control with `htmlFor`. */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("font-mono text-[11px] uppercase tracking-wider text-muted-foreground", className)}
    {...props}
  />
));
Label.displayName = "Label";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** Binary toggle built on a native button with role="switch". */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, defaultChecked = false, onCheckedChange, onClick, ...props }, ref) => {
    const [inner, setInner] = React.useState(defaultChecked);
    const on = checked ?? inner;
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={on}
        data-state={on ? "on" : "off"}
        onClick={(e) => {
          onClick?.(e);
          if (checked === undefined) setInner(!on);
          onCheckedChange?.(!on);
        }}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-sm border border-wire bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 data-[state=on]:border-primary data-[state=on]:bg-primary",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "block size-2.5 rounded-xs bg-muted-foreground transition-transform",
            on ? "translate-x-3.5 bg-primary-foreground" : "translate-x-0.5",
          )}
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";

export interface ParamSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Unit suffix rendered after the readout, e.g. "°" or "px". */
  unit?: string;
}

/** Labeled range control with a mono value readout — the node inspector's core control. */
export const ParamSlider = React.forwardRef<HTMLInputElement, ParamSliderProps>(
  ({ className, label, value, onValueChange, min = 0, max = 1, step = 0.01, unit, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <div className={cn("grid gap-1.5", className)}>
        <div className="flex items-center justify-between">
          <Label htmlFor={inputId}>{label}</Label>
          <span className="font-mono text-xs tabular-nums text-foreground">
            {value}
            {unit}
          </span>
        </div>
        <input
          ref={ref}
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onValueChange(Number(e.target.value))}
          style={{ ["--pct" as string]: `${pct}%` }}
          className="h-1 w-full cursor-pointer appearance-none rounded-sm bg-[linear-gradient(to_right,var(--primary)_var(--pct),var(--border)_var(--pct))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-xs [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-xs [&::-webkit-slider-thumb]:bg-foreground"
          {...props}
        />
      </div>
    );
  },
);
ParamSlider.displayName = "ParamSlider";
