import { ReactNode } from "react";
import { cn } from "../lib/cn";

/* ── FormField ─────────────────────────────────────────────── */

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden="true"> *</span>}
      </label>
      <div aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
        {children}
      </div>
      {hint && !error && (
        <p className="text-xs text-gray-500" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── FormSection ───────────────────────────────────────────── */

export interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <fieldset className={cn("rounded-lg border bg-white p-5", className)}>
      <legend className="text-base font-semibold text-gray-800 px-1">{title}</legend>
      {description && (
        <p className="mb-4 text-sm text-gray-500">{description}</p>
      )}
      <div className="grid gap-4">{children}</div>
    </fieldset>
  );
}

/* ── FormStep / MultiStepForm ──────────────────────────────── */

export interface FormStep {
  id: string;
  title: string;
  description?: string;
}

export interface MultiStepFormProps {
  steps: FormStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  children: ReactNode[];
  className?: string;
}

export function MultiStepForm({
  steps,
  currentStep,
  onStepChange,
  children,
  className,
}: MultiStepFormProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Step progress bar */}
      <nav aria-label="Form progress" className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          const isClickable = isCompleted;

          return (
            <div key={step.id} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-8",
                    i <= currentStep ? "bg-blue-500" : "bg-gray-200"
                  )}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  isCompleted && "bg-blue-600 text-white cursor-pointer hover:bg-blue-700",
                  isActive && "bg-blue-600 text-white ring-2 ring-blue-200 cursor-default",
                  !isActive && !isCompleted && "bg-gray-100 text-gray-400 cursor-default"
                )}
                onClick={isClickable ? () => onStepChange(i) : undefined}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${step.title}${isCompleted ? " (completed)" : isActive ? " (current)" : ""}`}
                disabled={!isClickable}
              >
                {isCompleted ? "✓" : i + 1}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Current step title */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800">
          {steps[currentStep]?.title}
        </h3>
        {steps[currentStep]?.description && (
          <p className="mt-1 text-sm text-gray-500">
            {steps[currentStep]?.description}
          </p>
        )}
      </div>

      {/* Current step content */}
      {children[currentStep] ?? null}
    </div>
  );
}

/* ── FormActions ──────────────────────────────────────────── */

export interface FormActionsProps {
  onCancel?: () => void;
  onSubmitLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  className?: string;
}

export function FormActions({
  onCancel,
  onSubmitLabel = "Submit",
  isSubmitting = false,
  submitDisabled = false,
  className,
}: FormActionsProps) {
  return (
    <div className={cn("flex items-center gap-3 pt-4", className)}>
      <button
        type="submit"
        disabled={submitDisabled || isSubmitting}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting && (
          <svg
            className="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
          </svg>
        )}
        {isSubmitting ? "Saving…" : onSubmitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/* ── MultiStepFormActions ──────────────────────────────────── */

export interface MultiStepFormActionsProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSubmitLabel?: string;
  isSubmitting?: boolean;
  nextDisabled?: boolean;
  submitDisabled?: boolean;
  className?: string;
}

export function MultiStepFormActions({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmitLabel = "Submit",
  isSubmitting = false,
  nextDisabled = false,
  submitDisabled = false,
  className,
}: MultiStepFormActionsProps) {
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className={cn("flex items-center justify-between pt-4 border-t", className)}>
      <button
        type="button"
        onClick={onBack}
        disabled={currentStep === 0 || isSubmitting}
        className="rounded-md border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-0 transition-colors"
      >
        Back
      </button>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 tabular-nums">
          Step {currentStep + 1} of {totalSteps}
        </span>

        {isLast ? (
          <button
            type="submit"
            disabled={submitDisabled || isSubmitting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting && (
              <svg
                className="size-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
              </svg>
            )}
            {isSubmitting ? "Submitting…" : onSubmitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSubmitting}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
