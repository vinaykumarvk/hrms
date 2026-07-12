export type UiCanonicalState = "ready" | "loading" | "empty" | "error" | "no_permission" | "partial_data" | "session_expired";

export interface UiStateControl {
  state: UiCanonicalState;
  latencyMs: number;
  errorCode?: "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "SESSION_EXPIRED";
}

export const UI_STATE_CONTROLS: Readonly<Record<UiCanonicalState, UiStateControl>> = {
  ready: { state: "ready", latencyMs: 0 },
  loading: { state: "loading", latencyMs: 750 },
  empty: { state: "empty", latencyMs: 0, errorCode: "NOT_FOUND" },
  error: { state: "error", latencyMs: 0, errorCode: "LOAD_FAILED" },
  no_permission: { state: "no_permission", latencyMs: 0, errorCode: "FORBIDDEN" },
  partial_data: { state: "partial_data", latencyMs: 100 },
  session_expired: { state: "session_expired", latencyMs: 0, errorCode: "SESSION_EXPIRED" },
};

export function isUiTestRuntime(environment: Record<string, string | undefined>): boolean {
  return environment.NODE_ENV === "test" && environment.UI_TEST_FIXTURES === "enabled";
}

