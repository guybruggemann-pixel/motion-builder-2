import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* the one main action: black pill (white in dark) */
        primary: "bg-ink text-ink-foreground font-semibold hover:bg-ink/85 active:bg-ink/75",
        secondary: "bg-card text-foreground shadow-card hover:bg-field",
        /* a quiet filled pill, e.g. "+ Layer" */
        soft: "bg-field text-foreground hover:bg-line2/60",
        outline: "border border-line2 bg-transparent text-foreground hover:bg-field",
        ghost: "bg-transparent text-muted-foreground hover:bg-field hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
      },
      size: {
        sm: "h-7 px-3 text-xs",
        md: "h-8 px-3.5 text-[13px]",
        lg: "h-[38px] px-4 text-[13px]",
        icon: "size-8",
        "icon-lg": "size-10 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
  /** Show a spinner and disable the button. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
