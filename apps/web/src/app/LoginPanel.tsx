import { FormEvent, useEffect, useState } from "react";

const REMEMBERED_EMPLOYEE_KEY = "hrms.remembered.employeeId";

export interface LoginPanelProps {
  onSignIn: (employeeId: string, password: string) => boolean | Promise<boolean>;
  message?: string | null;
}

export function LoginPanel({ message, onSignIn }: LoginPanelProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [serviceFailed, setServiceFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_EMPLOYEE_KEY);
    if (remembered) {
      setEmployeeId(remembered);
      setRememberMe(true);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setServiceFailed(false);
    try {
      const accepted = await onSignIn(employeeId.trim(), password);
      setRejected(!accepted);
      if (accepted) {
        if (rememberMe) window.localStorage.setItem(REMEMBERED_EMPLOYEE_KEY, employeeId.trim());
        else window.localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY);
        setPassword("");
      }
    } catch {
      setServiceFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="employee-login" aria-label="Employee sign in">
      <section className="employee-login__hero" aria-label="Government HRMS employee portal">
        <div className="employee-login__brand">
          <span className="employee-login__emblem" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M24 4 7 11v11c0 10.4 6.8 18.6 17 22 10.2-3.4 17-11.6 17-22V11L24 4Z"/><path d="M16 22h16M24 14v17"/></svg>
          </span>
          <span><strong>Government HRMS</strong><small>Employee Self-Service Portal</small></span>
        </div>

        <div className="employee-login__message">
          <p className="employee-login__eyebrow">One workplace. One secure identity.</p>
          <h1>Your service journey,<br /><span>all in one place.</span></h1>
          <p>Access your profile, leave, payroll, training and service records through one secure employee workspace.</p>
        </div>

        <div className="employee-login__features" aria-label="Portal features">
          <span><b>01</b> Personal records</span>
          <span><b>02</b> Leave & attendance</span>
          <span><b>03</b> Payroll & service book</span>
        </div>

        <p className="employee-login__security">Protected by role-based access and auditable government workflows</p>
      </section>

      <section className="employee-login__panel" id="login-form-section">
        <div className="employee-login__card">
          <div className="employee-login__mobile-brand">Government HRMS</div>
          <p className="employee-login__eyebrow">Employee access</p>
          <h2>Welcome back</h2>
          <p className="employee-login__intro">Sign in with your employee credentials to continue.</p>
          {message ? <p className="employee-login__notice" role="status">{message}</p> : null}

          <form className="employee-login__form" onSubmit={handleSubmit}>
            <label htmlFor="employee-id">Employee ID</label>
            <div className="employee-login__input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              <input aria-describedby={rejected ? "login-error" : serviceFailed ? "login-service-error" : undefined} aria-invalid={rejected || serviceFailed} autoComplete="username" autoFocus id="employee-id" name="employeeId" onChange={(event) => { setEmployeeId(event.target.value); setRejected(false); setServiceFailed(false); }} placeholder="e.g. GOV-100246" required value={employeeId} />
            </div>

            <div className="employee-login__label-row"><label htmlFor="employee-password">Password</label></div>
            <div className="employee-login__input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <input aria-describedby={rejected ? "login-error" : serviceFailed ? "login-service-error" : undefined} aria-invalid={rejected || serviceFailed} autoComplete="current-password" id="employee-password" name="password" onChange={(event) => { setPassword(event.target.value); setRejected(false); setServiceFailed(false); }} placeholder="Enter your password" required type={showPassword ? "text" : "password"} value={password} />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="employee-login__show"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <label className="employee-login__remember">
              <input checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
              <span>Remember my employee ID on this device</span>
            </label>

            {rejected ? <p className="employee-login__error" id="login-error" role="alert">The employee ID or password is incorrect. Please try again.</p> : null}
            {serviceFailed ? <p className="employee-login__error" id="login-service-error" role="alert">Sign in is temporarily unavailable. Please try again.</p> : null}

            <button aria-busy={submitting || undefined} className="employee-login__submit" disabled={submitting} type="submit">{submitting ? "Signing in…" : "Sign in securely"} <span aria-hidden="true">→</span></button>
          </form>

          <div className="employee-login__help"><span>Need help signing in?</span><strong>Contact your HR administrator</strong></div>
          <p className="employee-login__legal">Authorised personnel only. Activity on this system may be monitored and audited.</p>
        </div>
      </section>
    </main>
  );
}
