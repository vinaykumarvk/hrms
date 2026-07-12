# UIR-00 Route and Workspace Contract

Status: **APPROVED BY USER — 2026-07-11**  
Date: 2026-07-11

## Invariants

1. Each visible primary-navigation entry has one stable route, heading, active state, permission, and focus destination.
2. A route is presentation state only. API authorization, P02 permission checks, tenancy/entity scoping, and RLS remain authoritative.
3. Direct links, browser history, stale UI state, and workspace switches must fail closed when the session lacks the route permission.
4. Switching workspace never broadens a token or query scope. It only selects among surfaces already authorized by the session.
5. The legacy hash destinations remain available until route parity tests pass, then may redirect to the canonical route.

## Canonical routes

| Destination | Route | Permission | Primary workspace |
|---|---|---|---|
| Inbox | `/me/inbox` | `p01.workflow.read` | Me |
| Employees | `/me/employees` | `g01.employee.read` | Me |
| Personal Details | `/me/personal-details` | `g02.change.read` | Me |
| Attendance & Leave | `/me/attendance-leave` | `g03.leave.read` | Me |
| Leave-SR Relay | `/admin/leave-sr-relay` | `g04.relay.read` | Admin |
| Transfers | `/team/transfers` | `g05.transfer.read` | My Team |
| Promotions | `/team/promotions` | `g06.promotion.read` | My Team |
| Training | `/team/training` | `g07.training.read` | My Team |
| APAR | `/team/apar` | `g08.apar.read` | My Team |
| Disciplinary | `/team/disciplinary` | `g09.case.read` | My Team |
| Payroll | `/admin/payroll` | `g10.payroll.read` | Admin |
| Pension & Retirement | `/admin/pension-retirement` | `g11.pension.read` | Admin |
| Service Register | `/me/service-register` | `g12.sr.read` | Me |
| Documents | `/me/documents` | `g13.document.read` | Me |
| Analytics | `/admin/analytics` | `g14.analytics.read` | Admin |
| Workflow Config | `/admin/workflow-config` | `p01.workflow.config.review` | Admin |

“Primary workspace” is information architecture, not data authority. A user may see a destination only when both the workspace grant and destination permission exist. Unauthorized routes render the existing no-permission state without mounting or retaining protected content.

## Acceptance

- Click and keyboard activation reach the route heading and update `aria-current`.
- Employee, Manager, Admin, and denied personas test every allowed and denied route.
- Switching workspace clears selected task/record UI state and refetches through existing server-scoped APIs.
- Back/forward restores only permitted presentation state.
