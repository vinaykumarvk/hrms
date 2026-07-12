import { forwardRef, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select className={cn("min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50", className)} ref={ref} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

