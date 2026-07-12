import { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full overflow-x-auto rounded-md border border-border", className)} tabIndex={0} {...props} />;
}
export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-max border-collapse text-left text-sm", className)} {...props} />;
}

