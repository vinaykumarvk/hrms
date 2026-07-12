import { ReactNode } from "react";

export function Notifications({ children }: { children?: ReactNode }) {
  return <div aria-atomic="true" aria-live="polite" className="fixed bottom-4 right-4 z-[60] grid max-w-sm gap-2" role="status">{children}</div>;
}

