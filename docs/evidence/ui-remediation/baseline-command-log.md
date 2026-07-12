# UIR-01 Baseline Command Log

Date: 2026-07-11  
Branch: `feature/dev`

The prior failure mechanism was a broken `node_modules/typescript` symlink produced by `file:../workflow-platform/node_modules/typescript`; that sibling path did not exist. The user-approved dependency envelope replaced it with the deterministic registry package `typescript@5.7.3` and refreshed `package-lock.json`. `npm install` reported 0 vulnerabilities.

| Command | Result |
|---|---|
| `npm run web:typecheck` | PASS |
| `npm run web:build` | PASS; 71 modules, JS 337.64 kB / 91.41 kB gzip, CSS 9.98 kB / 2.74 kB gzip |
| `npm run web:test` | PASS; 137/137 tests |
| `bash docs/spec/pipeline/checks/ph-05e.sh` | PASS; PH-05E GREEN including root typecheck/test and web typecheck/test |

Design-neutral implementation evidence: global `ErrorBoundary`, false operational-state gallery removal, dynamic viewport units, password-toggle accessible state, direct `aria-invalid` semantics, and reduced-motion override. No API, RBAC, error taxonomy, database, or state-machine contract changed.
