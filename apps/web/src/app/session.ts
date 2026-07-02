// Session boundary for the HRMS web shell (PH-05B).
//
// PH-04 exposes no login/auth endpoint, so this boundary is implemented
// against the PH-05A client token-provider contract instead of an invented
// server route (recorded caveat): the bearer credential stored under
// `hrms.session.token` is a JWT-style token whose payload claims carry the
// identity and permission grants issued out-of-band by the identity provider.
// The shell decodes those claims fail-closed — an absent or undecodable token
// yields no session, which sends the user to the sign-in state with zero
// permissions granted.

export const SESSION_TOKEN_STORAGE_KEY = "hrms.session.token";

export interface HrmsSession {
  userId: string;
  displayName: string;
  permissions: readonly string[];
}

interface SessionClaims {
  sub?: unknown;
  name?: unknown;
  permissions?: unknown;
}

function decodeBase64UrlSegment(segment: string): string | null {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return window.atob(padded);
  } catch {
    // Fail closed: a malformed credential produces no session.
    return null;
  }
}

/**
 * Parses a stored bearer token into a session. Returns null (deny) unless the
 * token is a three-segment JWT-style credential whose payload declares a
 * subject and an explicit permissions array.
 */
export function parseSessionToken(token: string): HrmsSession | null {
  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }
  const payload = decodeBase64UrlSegment(segments[1]);
  if (payload === null) {
    return null;
  }
  let claims: SessionClaims;
  try {
    claims = JSON.parse(payload) as SessionClaims;
  } catch {
    // Fail closed: an unparseable payload produces no session.
    return null;
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return null;
  }
  if (!Array.isArray(claims.permissions)) {
    return null;
  }
  const permissions = claims.permissions.filter(
    (grant): grant is string => typeof grant === "string" && grant.length > 0
  );
  return {
    userId: claims.sub,
    displayName: typeof claims.name === "string" && claims.name.length > 0 ? claims.name : claims.sub,
    permissions,
  };
}

/** Reads the current session from storage; null means login is required. */
export function readStoredSession(storage: Storage): HrmsSession | null {
  const token = storage.getItem(SESSION_TOKEN_STORAGE_KEY);
  return token ? parseSessionToken(token) : null;
}

/**
 * Validates a sign-in token and, when valid, persists it under the PH-05A
 * storage key so the API client's tokenProvider sends it as the bearer token.
 */
export function startSession(storage: Storage, token: string): HrmsSession | null {
  const session = parseSessionToken(token);
  if (session !== null) {
    storage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
  }
  return session;
}

/** Ends the session: clears the stored token so the shell returns to sign-in. */
export function endSession(storage: Storage): void {
  storage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}
