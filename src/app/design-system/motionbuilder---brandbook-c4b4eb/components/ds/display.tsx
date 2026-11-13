import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[11px] font-semibold",
  {
    variants: {
      variant: {
        default: "bg-field text-muted-foreground",
        /* live state only */
        primary: "bg-volt text-volt-ink",
        outline: "border border-line2 text-foreground",
        ok: "bg-ok-bg text-ok-ink",
        warn: "bg-warn-bg text-warn-ink",
        success: "bg-ok-bg text-ok-ink",
        warning: "bg-warn-bg text-warn-ink",
        destructive: "border border-destructive/40 text-destructive",
        /* a chip: rounded pill */
        chip: "rounded-full bg-field px-2.5 text-foreground font-medium",
        iridescent: "bg-iridescent text-volt-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** Small status or mode tag, e.g. AE-STRICT or WEB-NATIVE. */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

/** Keyboard shortcut hint. */
export const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-field px-1 font-mono text-[10px] text-muted-foreground",
      className,
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export const cardVariants = cva("text-card-foreground", {
  variants: {
    variant: {
      /* a floating card on the canvas */
      default: "rounded-xl bg-card shadow-card",
      /* a grouped section inside a card */
      section: "rounded-lg bg-field",
      wireframe: "rounded-xl border border-dashed border-line2 bg-transparent",
      glass: "glass rounded-xl shadow-card",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

/** Panel container. `wireframe` matches Build mode, `glass` sits over the Look-mode canvas. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("grid gap-1 p-4 pb-2", className)} {...props} />,
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-display text-sm font-semibold tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />,
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />,
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2 p-3", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
