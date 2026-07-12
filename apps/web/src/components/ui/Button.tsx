import { ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-[var(--color-brand-strong)]",
        secondary: "border border-border bg-surface text-foreground hover:bg-muted",
        destructive: "bg-destructive text-white hover:brightness-90",
        ghost: "bg-transparent text-foreground hover:bg-muted",
      },
    },
    defaultVariants: { variant: "primary" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, children, disabled, loading = false, variant, ...props }, ref) => (
  <button
    aria-busy={loading || undefined}
    className={cn(buttonVariants({ variant }), className)}
    disabled={disabled || loading}
    ref={ref}
    {...props}
  >
    {loading ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
    {children}
  </button>
));
Button.displayName = "Button";

