import { Children, cloneElement, isValidElement, ReactElement, ReactNode } from "react";

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }> }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = Children.only(children);
  if (!isValidElement(control)) throw new Error("Field requires one form control child");
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-semibold text-foreground" htmlFor={id}>{label}</label>
      {cloneElement(control, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error ? <p className="text-sm text-muted-foreground" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
