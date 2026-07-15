import { useCallback, useMemo, useReducer, useState } from "react";

/* ── Types ────────────────────────────────────────────────── */

export type FieldValue = string | number | boolean | undefined;

export interface FieldConfig<TOutput = unknown> {
  initial: TOutput;
  // validate intentionally takes `unknown` (decoupled from TOutput) so the field's value
  // type is inferred solely from `initial`; coupling them makes heterogeneous maps collapse
  // to `unknown`. Validators that need a specific type cast inside (see required/minLength/pattern).
  validate?(value: unknown, allValues: Record<string, unknown>): string | null;
}

export interface FormFields {
  [key: string]: FieldConfig<unknown>;
}

export type FormValues<T extends FormFields> = {
  [K in keyof T]: T[K] extends FieldConfig<infer V> ? V : never;
};

export type FormErrors<T extends FormFields> = Partial<Record<keyof T, string>>;

export interface FormState<T extends FormFields> {
  values: FormValues<T>;
  errors: FormErrors<T>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isDirty: boolean;
  submitCount: number;
}

/* ── Actions ──────────────────────────────────────────────── */

type FormAction<T extends FormFields> =
  | { type: "SET_FIELD"; field: keyof T; value: unknown }
  | { type: "TOUCH_FIELD"; field: keyof T }
  | { type: "TOUCH_ALL"; touched: Partial<Record<keyof T, boolean>> }
  | { type: "SET_ERRORS"; errors: FormErrors<T> }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_END" }
  | { type: "RESET"; values: FormValues<T> };

/* ── Reducer ──────────────────────────────────────────────── */

function formReducer<T extends FormFields>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
        isDirty: true,
      };
    case "TOUCH_FIELD":
      return { ...state, touched: { ...state.touched, [action.field]: true } };
    case "TOUCH_ALL":
      return { ...state, touched: action.touched };
    case "SET_ERRORS":
      return { ...state, errors: action.errors, isSubmitting: false };
    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitCount: state.submitCount + 1 };
    case "SUBMIT_END":
      return { ...state, isSubmitting: false };
    case "RESET":
      return { ...initialFormState(action.values), isSubmitting: false };
  }
}

/* ── Hook ─────────────────────────────────────────────────── */

function initialFormState<T extends FormFields>(values: FormValues<T>): FormState<T> {
  return {
    values,
    errors: {},
    touched: {},
    isSubmitting: false,
    isDirty: false,
    submitCount: 0,
  };
}

export function useForm<T extends { [K in keyof T]: FieldConfig<unknown> }>(fields: T) {
  const initialValues = useMemo(() => {
    const fieldsRecord = fields as Record<string, FieldConfig>;
    const vals: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      vals[key] = fieldsRecord[key].initial;
    }
    return vals as FormValues<T>;
  }, [fields]);

  const [state, dispatch] = useReducer(
    formReducer<T>,
    initialFormState(initialValues)
  );

  const setValue = useCallback(
    <K extends keyof T>(field: K, value: FormValues<T>[K]) => {
      dispatch({ type: "SET_FIELD", field, value });
    },
    []
  );

  const touchField = useCallback(<K extends keyof T>(field: K) => {
    dispatch({ type: "TOUCH_FIELD", field });
  }, []);

  /** Run all field validators, returns true if valid. */
  const validateAll = useCallback((): boolean => {
    const fieldsRecord = fields as Record<string, FieldConfig>;
    const valuesRecord = state.values as Record<string, unknown>;
    const errors: FormErrors<T> = {};
    let valid = true;
    for (const key of Object.keys(fields)) {
      const config = fieldsRecord[key];
      if (config.validate) {
        const error = config.validate(valuesRecord[key], valuesRecord);
        if (error) {
          errors[key as keyof T] = error;
          valid = false;
        }
      }
    }
    dispatch({ type: "SET_ERRORS", errors });
    return valid;
  }, [fields, state.values]);

  const handleSubmit = useCallback(
    (onSubmit: (values: FormValues<T>) => void | Promise<void>) =>
      async (e?: React.FormEvent) => {
        e?.preventDefault();
        dispatch({ type: "SUBMIT_START" });

        // Mark all fields touched
        const allTouched: Partial<Record<keyof T, boolean>> = {};
        for (const key of Object.keys(fields)) {
          allTouched[key as keyof T] = true;
        }
        dispatch({ type: "TOUCH_ALL", touched: allTouched });

        if (!validateAll()) {
          dispatch({ type: "SUBMIT_END" });
          return;
        }

        try {
          await onSubmit(state.values);
        } finally {
          dispatch({ type: "SUBMIT_END" });
        }
      },
    [fields, state.values, validateAll]
  );

  const reset = useCallback(
    (newValues?: Partial<FormValues<T>>) => {
      dispatch({ type: "RESET", values: { ...initialValues, ...newValues } });
    },
    [initialValues]
  );

  return {
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    isSubmitting: state.isSubmitting,
    isDirty: state.isDirty,
    submitCount: state.submitCount,
    setValue,
    touchField,
    validateAll,
    handleSubmit,
    reset,
  };
}

/* ── Validation Helpers ───────────────────────────────────── */

export function required(msg = "This field is required.") {
  return (value: unknown) => {
    if (value === undefined || value === null || value === "") return msg;
    if (typeof value === "string" && !value.trim()) return msg;
    return null;
  };
}

export function minLength(min: number, msg?: string) {
  return (value: unknown) => {
    if (typeof value !== "string") return null;
    return value.trim().length < min
      ? msg ?? `Must be at least ${min} characters.`
      : null;
  };
}

export function pattern(regex: RegExp, msg: string) {
  return (value: unknown) => {
    if (typeof value !== "string" || value === "") return null;
    return regex.test(value) ? null : msg;
  };
}
