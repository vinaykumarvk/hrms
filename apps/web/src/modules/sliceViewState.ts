import { HrmsApiError } from "../api/hrmsClient";

/**
 * Canonical PH-05E module view state: every module workspace resolves its summary
 * through the injected API client and renders exactly one of these branches via
 * the shared OperationalState component.
 */
export type SliceViewState<TSlice> =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; slice: TSlice };

/**
 * Resolves a module summary onto the canonical state union. A NOT_FOUND envelope
 * from the API means "no records in scope" and is surfaced as the empty state,
 * not an error; every other failure carries its canonical error code.
 */
export async function loadSliceView<TSlice>(
  fetchSlice: () => Promise<TSlice>,
  isEmpty: (slice: TSlice) => boolean = () => false
): Promise<SliceViewState<TSlice>> {
  try {
    const slice = await fetchSlice();
    return isEmpty(slice) ? { kind: "empty" } : { kind: "ready", slice };
  } catch (error) {
    if (error instanceof HrmsApiError && error.code === "NOT_FOUND") {
      return { kind: "empty" };
    }
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}
