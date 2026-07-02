# Council Evaluation: HRMS Development Approach After PH-00A

*2026-07-01 · Framed question: Should the HRMS program proceed using the proposed approach: reuse PUDA workflow as the platform spine, execute the roadmap phase-by-phase through `/goal` prompts, `run.sh`, independent checks, and gates, with PH-00B as the next build step?*

## Chairman's Verdict

### Recommendation

The architectural direction is right: **reuse PUDA workflow through a P01 facade, do not copy it, and do not rebuild it**. The execution method is also directionally right: **small phase goals, fresh sessions, external checks, resumable gates**.

But the current method is **not yet safe for a driven end-to-end run**. Run PH-00B as a tightly supervised single phase after fixing the gate/check weaknesses below. Do not run `./run.sh --execute` as a multi-phase chain beyond PH-00B until the pipeline manifest covers PH-01 through PH-10 with real checks or explicit human gates.

The biggest correction: **PH-00B must be human-gated unless the conformance proof is an actual executable test command.** A markdown assertion file is acceptable evidence for human review; it should not be enough for `gate:auto`.

### Where the Council Agrees

1. **The product architecture is sound.** PH-00A supports the decision: PUDA has reusable workflow mechanics, but HRMS needs hierarchy/statutory authority resolution that PUDA lacks. Therefore facade-first reuse is the right move.
2. **The phase model is the right unit of work.** A 14-module HRMS cannot be built safely in one long goal. Phase-by-phase work with independent checks is the right operating model.
3. **PH-00 -> PH-06 is the true critical path.** The later module waves should not start until G03 leave and G05 transfer prove the workflow platform, hierarchy resolver, audit, documents, notifications, and SR integration together.
4. **The harness is useful, but only if checks are real.** `run.sh` has the right idea: fresh session, branch guard, exit command, gate, stop on red. The weak points are stale manifest coverage and checks that can pass on text claims.
5. **PH-00B is the right next phase, but it should be treated as architecture hardening, not feature development.** Its output is a stable boundary and conformance proof, not HRMS business functionality.

### Where the Council Clashes

The main disagreement is automation aggressiveness.

The Proponent says the runner can start PH-00B now because the check is red until the contract/OpenAPI/conformance files exist. The Contrarian says auto-gating is dangerous because the check lets a `ph-00b-conformance.md` assertion substitute for a real test command. The Executor says both can be reconciled: run PH-00B manually or with `gate:human`, then promote it to `gate:auto` only after `PH00B_TEST_CMD` exists and passes from a clean checkout.

The Chairman sides with the Executor/Contrarian: **do not use `gate:auto` for PH-00B yet**.

### Blind Spots Caught

1. **The 11-phase roadmap is not encoded in the runner.** `docs/spec/phased-plan.yaml` describes PH-00 through PH-10, but `docs/spec/pipeline/phases.yaml` currently contains only PH-00A through PH-00E.
2. **The pipeline README is stale.** It says only PH-00A has a real check and PH-00B-E are human stubs, while `phases.yaml` now has PH-00B as `gate:auto` with `checks/ph-00b.sh`.
3. **The PH-00B check has a self-certification fallback.** If `PH00B_TEST_CMD` is not set, `ph-00b.sh` can accept `docs/spec/ph-00b-conformance.md` saying the four shapes passed and PUDA golden is green. That is not an independent oracle.
4. **The PH-00A check is weaker than the PH-00A artifact.** It prints "counts not present, skipped" because it looks for `count_in` / `count_classified`, while the inventory uses `expanded_candidate_paths` / `count_classified_candidate_paths`.
5. **The manifest check for PH-00B is too weak.** `ph-00b.sh` checks whether the string `PH-00B` appears anywhere in `manifest.json`; it passed because PH-00B appears in a caveat, not because there is a real PH-00B phase record.
6. **The runner is Claude-specific.** `run.sh` defaults to `CLAUDE_CMD=claude` and `CLAUDE_FLAGS`. That may be intentional, but if the operating environment is Codex, the driver needs a neutral `AGENT_CMD` abstraction or a Codex variant.
7. **The PUDA checkout is still dirty.** PH-00A recorded this. PH-00B says PUDA is read-only except a thin shim, but there are already unrelated PUDA changes. That makes provenance and behavior-diff claims weaker unless a clean branch/tag is established.

### Risk Register

| Risk | Severity | Source Advisor | Mitigation |
|---|---:|---|---|
| PH-00B auto-advances on a markdown assertion instead of executable conformance | High | Contrarian / Executor | Set PH-00B `gate: human` until `PH00B_TEST_CMD` is mandatory and green |
| 11-phase roadmap and executable manifest diverge | High | Outsider / Executor | Generate/complete `docs/spec/pipeline/phases.yaml` through PH-10 or label it PH-00-only |
| README, prompts, checks, and manifest drift | Medium | Outsider | Add a pipeline self-check that verifies docs and manifest agree |
| PH-00A caveats are treated as resolved because check is green | High | Contrarian | Carry caveats as hard gates: license/provenance, clean PUDA checkout, isolated DB, full golden suite |
| Dirty PUDA worktree invalidates behavior/provenance baseline | High | Executor | Create a clean PH-00B branch/tag in PUDA and rerun focused checks before coding |
| `manifest.json` check is string-based, not structural | Medium | Executor | Require `.phases["PH-00B"].status` or equivalent exact JSON key |
| PH-00B prompt permits PUDA shim but says do not change behavior | Medium | First Principles | Define exactly which files may be touched and how behavior parity is proven |
| Workflow-platform extraction starts before legal/provenance gate | High | Contrarian | PH-00C/PH-00D must be blocked by provenance approval |
| Runner rollback advice can destroy unrelated local work if followed blindly | Medium | Outsider | Require clean worktree or create worktree/branch per phase; document non-destructive rollback first |
| Full golden suite remains flaky/partial | High | Executor | Make isolated DB + deterministic test command a PH-00B/PH-00E gate |

### Idea Evolution

The initial framing implied the "method" was already built. The repo check shows it is partly built: the runner and PH-00A/B checks exist, but the method currently covers only the PH-00 extraction series, not the full 11-phase HRMS roadmap. That changes the recommendation from "start the pipeline" to "start PH-00B under supervision after guardrail fixes."

The council also shifted from "PH-00B as first build phase" to "PH-00B as first platform boundary test." That distinction matters: PH-00B should not produce HRMS features. It should prove that PUDA can execute through the P01 facade without behavior drift and that the facade contract can express both PUDA semantics and HRMS-required extensions.

### The One Thing To Do First

Before starting development, patch the PH-00B gate policy:

1. Change PH-00B in `docs/spec/pipeline/phases.yaml` from `gate: auto` to `gate: human`.
2. Tighten `checks/ph-00b.sh` so executable conformance is required for auto-green; markdown conformance may support human review but must not be an auto pass.
3. Strengthen `manifest.json` validation to require a real PH-00B phase object, not a string match.
4. Freeze a clean PUDA branch/tag for PH-00B.

Then run PH-00B as a single controlled goal, not as the first step of an unattended full chain.

## Advisor Responses

### Proponent

The proposed approach captures the most important architectural learning from PH-00A: the PUDA workflow engine is not a throwaway asset. It already has transition execution, task routing, waits, fork/join, version pinning, validation, publish governance, simulation, and officer UI concepts. Reusing it behind a P01 facade gives HRMS a platform spine and avoids spending months rebuilding a generic workflow engine before delivering any government HRMS value. The split between platform work and HRMS-specific computation is also clean: workflow orchestration goes through PUDA/P01; leave balance, attendance, payroll, pension, SR ledger, and hierarchy resolution remain HRMS-owned.

The phase structure is also healthy. PH-00 -> PH-06 concentrates risk before broad module build: first platform boundary, then contracts/schema, then hierarchy data, then systems of record, then resolver/API, then workflow console, then G03/G05 proof. That sequence is much safer than building fourteen modules in parallel and discovering at the end that approvals, audit, SR, documents, and hierarchy do not line up. The runner/check approach makes the process repeatable and auditable.

The biggest improvement is not to abandon the plan, but to make it stricter. PH-00B should be the next action because it directly tests the biggest architectural bet. If the facade cannot route simple, wait, fork/join, and reference workflows without changing PUDA behavior, the program learns that early. The proposed approach should proceed, with human review at PH-00B because the first facade boundary is too consequential for auto-advance.

### Contrarian

The plan risks confusing a strong architecture decision with a ready execution system. The architecture says "facade-first PUDA reuse"; the method says "run.sh chains phases with checks." Those are not equivalent. The current pipeline only includes PH-00A through PH-00E, while the narrative claims an 11-phase roadmap. If the team believes the whole method is built, they may run a partial orchestrator and mistake PH-00 extraction success for HRMS program readiness.

The sharper flaw is PH-00B's gate. `checks/ph-00b.sh` can accept a markdown conformance file if no `PH00B_TEST_CMD` is configured. That recreates the self-certification problem the whole runner was designed to avoid: the model can produce a document saying four shapes pass and the golden suite is green. Unless the command actually runs the conformance suite from a clean checkout and isolated DB, it is not an independent oracle. Setting PH-00B to `gate:auto` makes that loophole operationally dangerous.

There is also a provenance trap. PH-00A explicitly says PUDA license/provenance is unclear and the PUDA worktree is dirty. The next phase wants to add a thin facade shim inside PUDA. Without a clean branch/tag and precise touched-file allowance, the team will be unable to distinguish "facade-only additive shim" from accidental behavior changes layered onto existing local modifications. The plan should not start in driven mode until these hard gates are made explicit.

### First Principles Thinker

The core problem is not "how do we build 14 modules?" The actual problem is "how do we build a government HRMS without losing control of workflow, audit, authority, and statutory evidence?" That framing validates the approach: workflow is the load-bearing platform capability, not one module among fourteen. Reusing PUDA is rational because it converts an unknown platform build into a boundary-and-adaptation problem.

However, the method currently mixes three different objects: a product roadmap, a platform extraction plan, and an agent orchestration harness. Each needs a different definition of done. The product roadmap ends at a working HRMS. The platform extraction plan ends when PUDA and HRMS can both consume the workflow platform through adapters. The harness ends when each phase has a prompt, an executable check, dependency metadata, and a gate. The confusion in the user's summary comes from saying the "method is built" while only the PH-00 harness appears built.

The cleanest correction is to define stage boundaries explicitly. PH-00B should freeze the facade contract and prove pass-through. PH-00E should be the PH-00 gate. Only after PH-00E should PH-01 start. And only after PH-06 should broad module waves start. This is not bureaucracy; it prevents the hardest business invariants from being discovered after module code exists.

### Outsider

From outside the project, the explanation is still too compressed. It says "the layer is built" but the table is garbled and does not clearly name the product layer versus the method layer. It says "11 phases," but the visible runner has five PH-00 subphases. It says "single next action" but gives two modes: manual and driven. A non-insider would ask: which one is the approved operating mode for tomorrow morning?

The jargon also hides risk. "Thin strangler boundary" sounds safe, but it means code will be inserted into or around an existing production-grade workflow engine. "Golden suite stays green" sounds objective, but PH-00A says the aggregate golden suite is partial and the default test config fails. "Auto gate" sounds efficient, but if the gate accepts a written assertion, it is not auto-verification; it is a signed note.

The plan becomes understandable if stated more plainly: "We will not build HRMS modules yet. First, we will create a wrapper around PUDA workflow and prove old PUDA workflows behave the same through the wrapper. A human must review that proof. Only after that do we extract reusable code." That should be the operational message before development starts.

### Executor

The next actionable step is not "run the whole pipeline"; it is "make PH-00B safe to run once." PH-00A check is green now. PH-00B check is red for expected reasons: missing contract YAML, missing OpenAPI, missing verdict, missing conformance proof. That is fine. What is not fine is that the check design would allow model-written conformance evidence to substitute for a real command.

Execution plan: commit or at least checkpoint the current HRMS docs; create a clean PUDA PH-00B branch from the pinned commit or record exactly which dirty files are unrelated; update PH-00B to human gate; require a deterministic conformance command for any future auto gate; then run the PH-00B prompt in one session. When it returns, run `bash docs/spec/pipeline/checks/ph-00b.sh` yourself. If it fails, fix the check or implementation. If it passes only because of markdown evidence, keep it parked for human review.

Do not expand into PH-01 through PH-10 yet. The harness does not currently encode those phases. After PH-00B, either continue PH-00C-E manually/human-gated, or invest a short setup pass to generate real prompt/check/gate entries for PH-01 through PH-10. The fastest safe path is one green PH-00B, not an ambitious full-chain automation run.

## Peer Reviews

Anonymisation mapping used for review: A=First Principles, B=Proponent, C=Executor, D=Contrarian, E=Outsider.

### Reviewer 1

Strongest response: D, because it identifies the operational failure mode, not just abstract risk. The markdown fallback in `ph-00b.sh` undermines the independent-check principle. Biggest blind spot: B, because it trusts the runner without distinguishing between a real executable check and self-authored evidence. What all five initially underweighted: the Codex/Claude mismatch in `run.sh`; the runner may not execute the same agent environment this session uses.

### Reviewer 2

Strongest response: C, because it produces a Monday-morning sequence: checkpoint HRMS, clean PUDA, change PH-00B to human gate, run one phase. Biggest blind spot: E, because it improves communication but does not fully address how to enforce it. What all responses missed: PH-00A itself is marked green even though its check skips the strongest count reconciliation. That does not invalidate PH-00A, but it shows the checks need to evolve after artifacts evolve.

### Reviewer 3

Strongest response: A, because it separates roadmap, extraction plan, and harness. That distinction explains the confusion better than arguing over scripts. Biggest blind spot: D, because it could over-freeze progress; not every caveat has to block PH-00B, but each must be represented as a gate. What all responses missed: `docs/spec/pipeline/README.md` drift. If the operator follows README instead of manifest, they may operate on stale assumptions.

### Reviewer 4

Strongest response: E, because it catches the language problem that will matter when multiple people join. "Method is built" is not true unless the full method is encoded and current. Biggest blind spot: C, because it assumes a clean PUDA branch is straightforward; the existing dirty worktree may include user work that cannot be reset. What all responses missed: the rollback line in `run.sh` suggests `git reset --hard`, which is dangerous in a dirty shared workspace unless all changes are intentionally isolated first.

### Reviewer 5

Strongest response: the combination of D and C. D protects the gate; C gives the execution path. Biggest blind spot: B, because it focuses on architectural upside and not enough on evidence quality. What all responses missed: PH-00B's scope guard for premature extraction uses shell globbing over `/Users/n15318/workflow-platform`; it may not reliably detect nested TypeScript files unless globstar behavior is known. The check should use `find`, not `ls **/*.ts`.

## Second Pass

Fundamental contested point: should PH-00B run now under `gate:auto`, or should the gate be changed first?

### Proponent Second Pass

The strongest opposing argument is that a markdown conformance fallback can self-certify the boundary. That is valid. The proponent position should be modified: keep PH-00B as next, but do not keep it auto-gated until the conformance proof is executable. The value is in running PH-00B soon, not in pretending the current check is stronger than it is.

### Contrarian Second Pass

The strongest opposing argument is that over-hardening before PH-00B delays the very experiment that will reveal whether the facade is viable. That is also valid. The contrarian position should not block all PH-00B work. It should block unattended auto-advance and extraction. A supervised PH-00B with human review is acceptable.

### Chairman Resolution

PH-00B should start after a small guardrail patch, not after a large process redesign. The patch is: `gate: human`, structural manifest check, no markdown-only auto pass, clean PUDA branch/tag. Then run PH-00B once and inspect the result.
