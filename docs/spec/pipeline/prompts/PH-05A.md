/goal
  objective: Rebuild the WEB SCAFFOLD AND API CLIENT FOUNDATION so the app talks to the real PH-04 API.
    The audit (docs/reviews/brd-coverage-audit-20260702.md) found createHrmsClient (the real fetch client)
    is never imported anywhere — App.tsx instantiates createFixtureHrmsClient and every view renders
    fixture props. Deliver a fetch-based client with error handling and auth header injection, wire it
    into the app, confine fixtures to tests, and keep both toolchains green. The re-baselined oracle
    asserts this and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - apps/web/src/api/hrmsClient.ts , apps/web/src/api/fixtureHrmsClient.ts
    - apps/web/src/App.tsx , apps/web/src/main.tsx
    - docs/contracts/openapi/*.yaml                    # route + envelope shapes the client must honour
    - apps/web/test/ph05-api-client.test.cjs
    - docs/spec/pipeline/checks/ph-05a.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - createHrmsClient exists but has zero consumers; App.tsx line 39 hardcodes the fixture client, so no
      view has ever issued a real HTTP request.
    - The client injects no Authorization header — there is no token plumbing at all (only a hardcoded
      correlation id), so protected PH-04 routes would reject every call.
    - Errors: HrmsApiError exists, but no consumer handles it; the app has no failure path.
  constraints:
    - The client must: use fetch, throw a typed error on non-2xx (surfacing the sanitized envelope's code,
      never raw stacks), inject `Authorization: Bearer <token>` from an injected session/token provider
      (never a hardcoded secret or literal token), propagate X-Correlation-Id, and send Idempotency-Key on
      unsafe calls.
    - Base URL comes from configuration (Vite env or injected option). NO hardcoded localhost anywhere in
      apps/web/src production paths — dev origins belong in vite config/env files only.
    - App.tsx consumes createHrmsClient; createFixtureHrmsClient may survive only inside src/api and test
      files as a test double.
    - Secrets via env only; no console.log in production src; no TypeScript `any`/`as any` in the client.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: src/api, App wiring, client tests. Shell/nav/guards are PH-05B; view refactors are
      PH-05C/PH-05D — do not rebuild views here beyond what the client swap requires to compile.
  work_loops:
    - name: real client with auth + errors
      max_iterations: 5
      repeat_until: hrmsClient.ts injects Authorization (bearer token via provider), throws its typed
        error on non-2xx carrying the envelope code, carries X-Correlation-Id and Idempotency-Key, and
        reads its base URL from configuration.
      steps: [add token/session provider option, inject headers, harden error path, config-driven baseUrl]
    - name: wire the app to the real client
      max_iterations: 4
      repeat_until: App.tsx (or its composition root) constructs createHrmsClient and passes it down;
        `grep -rn createHrmsClient apps/web/src | grep -v src/api/` matches; no import of the fixture
        client remains outside src/api and apps/web/test; web app still renders under web:test.
      steps: [swap the composition root, keep fixture for tests only, adjust props/types to compile]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph05-api-client.test.cjs exercises fetch stubbing (success), the non-2xx error path,
        and Authorization header injection; `npm run -s typecheck`, `npm test`, `npm run -s web:typecheck`,
        and `npm run -s web:test` all pass; `bash docs/spec/pipeline/checks/ph-05a.sh` prints GREEN.
      steps: [write client behaviour tests, run all four toolchain commands, run the oracle, fix, repeat]
  evidence_required:
    - apps/web/src/api/hrmsClient.ts diff , App composition diff showing real-client wiring
    - apps/web/test/ph05-api-client.test.cjs with passing web:test output
    - GREEN output of `bash docs/spec/pipeline/checks/ph-05a.sh` captured in the phase log
  escalate_when:
    - No session/token source exists yet and inventing one would conflict with the PH-05B login design —
      define the provider interface, stub it at the composition root, and record the caveat.
    - Swapping the client breaks module views beyond mechanical prop/type fixes (that refactor belongs to
      PH-05C/PH-05D; quarantine and report rather than rewriting views here).
    - The oracle stays RED after the loop budget for reasons outside src/api and the composition root.
