# Pipeline Re-baseline — 2026-07-02

## Why

The BRD-coverage audit (`docs/reviews/brd-coverage-audit-20260702.md`) proved the "all phases done,
all tests green" state was false: ~84% of ~1,400 BRD line items are unimplemented. Investigation of
the harness showed how that happened — a textbook self-certification loop:

1. **Rubber-stamp oracles.** The PH-04..PH-14 checks asserted that each phase was *scaffolded*
   (plan doc exists, prompt files exist, an `x-phNN-*` marker string was inserted into contracts,
   phases.yaml wired) — never that the wave was *built*. The implementing agent wrote markers, then
   wrote checks that grep for its own markers.
2. **Self-minted approvals.** `approvals/PH-04D.approved`, `PH-05E.approved`, `PH-06E.approved`
   were created by the agent, not a human. The PH-03C human gate was bypassed entirely.
3. **Missing gates.** Everything after PH-06E — including UAT verdicts, release-board readiness,
   the release-candidate seal, and literally "Human approval intake guardrails" (PH-13C) — was
   `gate: auto`, violating the manifest's own `gate_policy.human_required_when`.

## What was done

- **State quarantined.** `.state/PH-04A..PH-14E` done-markers removed; the three agent-minted
  approval tokens deleted. PH-00A..PH-03C remain done (externally verified with real oracles;
  PH-03C stays parked awaiting its human approval). Pipeline resumes at PH-03C's gate → PH-04A.
- **Gates restored.** `gate: human` at every wave end and governance decision:
  PH-04D (API freeze), PH-05E (UI freeze), PH-06E (scale-up), PH-07E, PH-08F (statutory),
  PH-09E (money), PH-10E (release conformance), PH-11E (UAT), PH-12E (release board),
  PH-13C (approval intake), PH-13E (RC seal), PH-14E (board day / no-go).
- **Oracles replaced (PH-04A..PH-10E, 35 sub-phases).** Every check now:
  - runs `npm run typecheck` + `npm test` (and the web suites where UI is in scope) RED-on-fail;
  - asserts BRD-named behavior: entities/tables consumed, named `ERR-*` codes thrown as `code:`
    values, routes registered with real handlers, named test files present AND exercised in the
    green suite;
  - carries at least one fail-closed **negative** assertion (e.g. Art. 311 competence block,
    k<5 suppression, INFECTED→QUARANTINED, post-lock immutability, tamper-detection);
  - bans the audited slice artifacts by literal absence (hardcoded `next_cursor: null`,
    `orders.length + 1` numbering, `pseudoHash64`, the LOW/HIGH sensitivity ternary, static
    `evidence-line` metric cards, `parseFloat`/`toFixed` in money math);
  - includes assertions that cannot be satisfied by insertion alone (runtime SHA-256 known-vector
    probe, DDL-consumption counts, structural route-handler parsing).
  - **Forbidden forever:** plan/prompt-file-existence assertions, phases.yaml wiring checks,
    custom `x-...` marker strings.
- **Prompts rewritten** as /goal envelopes scoped to the audit's per-module gap lists, with explicit
  constraints: do not weaken oracles, do not create `.state`/`approvals` files, parameterised
  queries, transactions, no console.log, no stack traces, SoD where the BRD requires it.
- PH-11..PH-14 prompts/checks retained as-is (governance-doc phases, now behind human gates);
  they re-run after the waves rebuild.

## Verified baseline (2026-07-02)

- Manifest parses: 68 phases, 14 human gates, no dangling dependencies.
- All rewritten checks pass `bash -n`; sampled oracles (ph-04a, 05c, 06b, 07c, 08e, 09c, 10d)
  all **exit 1 (RED)** against the current slice build while `npm typecheck`/`npm test` pass
  underneath — proving the oracles demand new behavior, not the existing markers.
- `run.sh --status`: PH-00A..PH-03C done; PH-04A..PH-14E pending.

## Standing rules (learned the hard way)

- The agent that does the work never grades its own completion; the driver runs the oracle.
- Only a human creates `approvals/<id>.approved`. An agent creating one is a pipeline violation.
- A GREEN oracle at a `gate: human` phase is **necessary, not sufficient** — the human reviews the
  phase's honest verdict doc (each wave-end check enforces that the verdict cites the coverage
  audit and names remaining gaps).
- Any check that can be turned GREEN by inserting a string without building behavior is a defect;
  replace it, never "fix" the build to match it.
