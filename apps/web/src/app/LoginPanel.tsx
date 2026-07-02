import { FormEvent, useState } from "react";

export interface LoginPanelProps {
  /** Attempts sign-in with the supplied token; returns true when a session started. */
  onSignIn: (token: string) => boolean;
}

/**
 * Sign-in state for the HRMS shell. Rendered whenever no session exists; the
 * user submits the access token issued by the identity provider and the shell
 * derives identity and permissions from it (see app/session.ts).
 */
export function LoginPanel({ onSignIn }: LoginPanelProps) {
  const [token, setToken] = useState("");
  const [rejected, setRejected] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accepted = onSignIn(token.trim());
    setRejected(!accepted);
    if (accepted) {
      setToken("");
    }
  }

  return (
    <section className="login-panel" aria-label="Sign in">
      <h2>Sign in to HRMS</h2>
      <p>
        Paste the access token issued by your identity provider. Your workspace
        permissions come from the session token — nothing is granted by default.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="hrms-access-token">Access token</label>
        <input
          autoComplete="off"
          id="hrms-access-token"
          name="accessToken"
          onChange={(event) => setToken(event.target.value)}
          required
          type="password"
          value={token}
        />
        <button type="submit">Sign in</button>
      </form>
      {rejected ? (
        <p role="alert">
          The access token could not be validated, so no session was started. Request a fresh token and try again.
        </p>
      ) : null}
    </section>
  );
}
