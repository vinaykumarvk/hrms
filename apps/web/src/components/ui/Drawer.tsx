import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Drawer({ open, onOpenChange, returnFocusRef, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocusRef?: RefObject<HTMLElement | null>; title: ReactNode; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 md:hidden" />
        <DialogPrimitive.Content onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }} className="fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] overflow-auto border-r border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-foreground shadow-[var(--shadow-md)] md:hidden">
          <DialogPrimitive.Title className="pr-10 text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Choose an authorized workspace destination.</DialogPrimitive.Description>
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close asChild>
            <Button aria-label="Close menu" className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))] p-2" type="button" variant="ghost"><X aria-hidden="true" className="size-5" /></Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
