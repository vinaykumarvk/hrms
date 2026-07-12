import { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Alert({ variant = "info", title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: "info" | "success" | "error"; title?: ReactNode }) {
  return (
    <div
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn("rounded-md border p-3 text-sm", variant === "error" ? "border-destructive bg-[var(--color-danger-surface)] text-destructive" : variant === "success" ? "border-primary bg-[var(--color-success-surface)] text-[var(--color-success)]" : "border-border bg-muted text-foreground", className)}
      role={variant === "error" ? "alert" : "status"}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

