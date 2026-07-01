/goal
  objective: Finish and verify PH-00A — the capability gap matrix and candidate-set reconciliation are already
    done at PUDA commit cadf3973; complete the remaining PH-00A outputs (inventory yaml, provenance map, GOLDEN
    behavior baseline, risk register) and the PH-00A verdict + manifest update.
  context:
    - /Users/n15318/hrms/docs/spec/phased-plan.yaml            # PH-00A increment + golden_test_corpus + candidate categories
    - /Users/n15318/hrms/docs/spec/puda-vs-hrms-capability-gap.md   # DONE — source of truth for classifications
    - /Users/n15318/hrms/docs/spec/ph-00-candidate-set-reconciliation.md
    - /Users/n15318/PUDA_workflow_engine                        # READ-ONLY, pinned cadf3973
  constraints:
    - Do not extract/move/refactor/fix PUDA code. Characterization only. Run tests in a sandbox/read-only checkout.
    - Every inventory row and golden result cites path:line or command output. count_in == count_classified.
  work_loops:
    - name: Inventory completion
      max_iterations: 4
      repeat_until: Every path in phased-plan.yaml extraction_candidates (all categories) + golden_test_corpus has
        a row in docs/spec/puda-workflow-inventory.yaml with classification, provenance (commit/license/3rd-party?),
        deps, coupling evidence, disposition; every adapter_only_or_excluded pattern confirmed with a reason.
      steps: [load candidate set as a finite work-list, classify with evidence, resolve unclear or log risk]
    - name: Golden capture
      max_iterations: 5
      repeat_until: Every test in golden_test_corpus has been RUN against pinned PUDA with stored fixture outputs
        and pass/fail recorded in docs/spec/puda-golden-behavior-baseline.md (run, do NOT re-author).
      steps: [run one corpus test in sandbox, store actual output as fixture, record result + any gap]
    - name: Review-repair
      max_iterations: 3
      repeat_until: A completeness critic finds nothing unverified/assumed/missing; PH-00A verdict is decision-grade.
      steps: [review inventory/provenance/golden/risks, run completeness critic, fix gaps]
  evidence_required:
    - docs/spec/puda-workflow-inventory.yaml
    - docs/spec/puda-workflow-provenance-map.md
    - docs/spec/puda-golden-behavior-baseline.md              # must record pinned commit cadf3973 + fixtures
    - docs/spec/workflow-extraction-risk-register.md
    - docs/spec/ph-00a-verdict.md                             # reuse-with-enhancements + confidence + ordered backlog
    - docs/spec/manifest.json                                 # set gates.PH-00A.verdict
  escalate_when:
    - A golden behavior cannot be reproduced against the pinned commit.
    - Licensing/provenance unclear on any reusable-core file.
    - Tier-0 hierarchy resolver (B1/B2) confirmed unaddable via the resolver SPI without a rewrite.
