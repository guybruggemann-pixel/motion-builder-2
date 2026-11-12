import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export const inputVariants = cva(
  "flex w-full rounded-sm border border-transparent bg-field text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:border-destructive",
  {
    variants: {
      variant: {
        default: "font-sans",
        mono: "font-mono tabular-nums",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        md: "h-[34px] px-2.5 text-[13px]",
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

/** Field label in sentence case, wired to its control with `htmlFor`. */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
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
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line2 transition-colors disabled:opacity-40 data-[state=on]:bg-ink",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "block size-4 rounded-full bg-card shadow-card transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5",
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
          className="h-1 w-full cursor-pointer appearance-none rounded-sm rounded-full bg-[linear-gradient(to_right,var(--ink)_var(--pct),var(--line2)_var(--pct))] disabled:opacity-40 [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink"
          {...props}
        />
      </div>
    );
  },
);
ParamSlider.displayName = "ParamSlider";
