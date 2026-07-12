import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Dialog({ open, onOpenChange, returnFocusRef, title, description, trigger, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; returnFocusRef?: RefObject<HTMLElement | null>; title: ReactNode; description?: ReactNode; trigger?: ReactNode; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <DialogPrimitive.Content onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }} className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-[var(--shadow-md)]">
          <DialogPrimitive.Title className="pr-10 text-lg font-bold">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : null}
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close asChild>
            <Button aria-label="Close dialog" className="absolute right-3 top-3 p-2" type="button" variant="ghost"><X aria-hidden="true" className="size-5" /></Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
