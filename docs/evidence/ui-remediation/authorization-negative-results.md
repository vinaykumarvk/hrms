# UI Remediation Authorization-Negative Results

Date: 2026-07-11

The route/workspace contract keeps presentation state subordinate to existing protected API scope. Browser evidence proves an Employee session can authenticate and navigate Me routes, but direct navigation to `/admin/payroll` renders “No permission” and does not mount Payroll Run Console content even though the demo token separately carries `g10.payroll.read`; the missing `workspace.admin` grant fails closed.

Expired-token evidence proves an expired stored credential is removed, protected payroll content is absent, and the login surface shows only the generic “Your session ended” recovery message. Static service/API tests verify workflow routes remain `protected: true`, declare permissions, pass `context.scope`, retain idempotency/correlation headers, and do not introduce password-reset or server-export routes.

Commands:

- `node --test apps/api/test/ui-remediation-service.test.cjs`
- `node --test apps/api/test/ui-remediation-api.test.cjs`
- `npm run web:test:e2e -- --project=chromium --grep @critical`

