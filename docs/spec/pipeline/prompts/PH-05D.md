/goal
  objective: Rebuild the G01/G12/G13 FOUNDATION RECORD VIEWS as API-backed screens. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found the views render fixture props with zero API
    calls (DocumentVaultView has no fetch/useEffect at all). Deliver: views that load through the PH-05A
    client on mount, render the BRD field lists, show masked PII for G01 via fieldGrants, cursor-paged
    G12 timeline, legal-hold/retention/version display for G13 — each with loading/error branches. The
    re-baselined oracle asserts this and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - apps/web/src/modules/g01/** , apps/web/src/modules/g12/** , apps/web/src/modules/g13/**
    - apps/web/src/api/hrmsClient.ts                   # extend with the reads these views need
    - docs/brd/v3/G01-employee-profile-management.md   # field list + Aadhaar masking (XXXX-XXXX-1234)
    - docs/brd/v3/G12-digital-service-register.md , docs/brd/v3/G13-document-management-secure-storage.md
    - docs/contracts/openapi/G01.yaml , G12.yaml , G13.yaml
    - apps/web/test/ph05-records.test.cjs
    - docs/spec/pipeline/checks/ph-05d.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - EmployeeProfile, ServiceRegisterTimeline, and DocumentVaultView receive fixture props from App —
      none imports the API client or has a data-loading effect. Each view must fetch its own data via the
      injected client (useEffect or equivalent) with loading and error branches.
    - G01 renders four summary fields; the BRD profile view needs the identity field list (serviceNo,
      displayName, designation/org placement, employment status, date of joining) plus governed PII shown
      MASKED per P02 fieldGrants — Aadhaar in XXXX-XXXX-1234 display form, never raw.
    - G12 timeline maps a fixed array: no cursor paging. It must request pages through the API
      (limit + next_cursor from PH-04C) with a load-more affordance, keeping hash-chain evidence
      (entryHash/previousHash) and append-only semantics visible.
    - G13 DocumentVaultView renders three fixture rows: it must list documents from GET /api/v1/documents,
      show legal-hold, retention, and version information from the API.
  constraints:
    - All data flows through the injected PH-05A client; no direct fetch in components, no fixture client
      imports in apps/web/src/modules (fixtures live in tests only). No hardcoded localhost.
    - Masking is display-of-server-truth: render the masked values/grants the API returns per P02
      fieldGrants; never reconstruct or unmask PII client-side, never log PII.
    - Every view implements loading and error branches with the canonical OperationalState kinds; error
      surfaces the sanitized envelope code, never a stack.
    - No console.log, no TypeScript any in apps/web/src.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: modules/g01+g12+g13 views, the client read methods they need, and their tests.
      Other module workspaces are later waves (PH-06+).
  work_loops:
    - name: G01 profile view (fields + masked PII)
      max_iterations: 5
      repeat_until: the G01 view loads the employee/profile via the client on mount, renders serviceNo,
        displayName, designation/org, status and joining fields, and shows Aadhaar/PII in masked display
        driven by fieldGrants, with loading and error branches.
      steps: [add client read, effect + state machine, field list markup, masked-PII rendering]
    - name: G12 timeline paging + G13 vault from API
      max_iterations: 6
      repeat_until: the G12 timeline fetches pages via limit/next_cursor with a working load-more that
        appends the next window and keeps hash-chain fields visible; the G13 view lists documents from the
        API with legal-hold, retention, and versions rendered — both with loading/error branches.
      steps: [client timeline+documents reads, cursor state + load-more, vault list + hold/retention/
        version display, state branches]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph05-records.test.cjs asserts API-backed rendering (stubbed client), masked-PII
        display, and cursor load-more behaviour; `npm run -s typecheck`, `npm test`,
        `npm run -s web:typecheck`, and `npm run -s web:test` all pass;
        `bash docs/spec/pipeline/checks/ph-05d.sh` prints GREEN.
      steps: [write records tests with a stubbed client, run all four toolchain commands, run the oracle,
        fix, repeat]
  evidence_required:
    - apps/web/src/modules/g01+g12+g13 diffs and the client read-method additions
    - apps/web/test/ph05-records.test.cjs with passing web:test output
    - GREEN output of `bash docs/spec/pipeline/checks/ph-05d.sh` captured in the phase log
  escalate_when:
    - The API does not yet return masked PII/fieldGrants or timeline cursors as contracted (API gap —
      report against PH-04B/PH-04C, do not fake data client-side).
    - A BRD field for the profile view has no source route in G01.yaml after one resolution attempt.
    - The oracle stays RED after the loop budget for reasons outside the three module view scopes.
