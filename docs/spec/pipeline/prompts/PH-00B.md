/goal
  objective: Put a thin P01 workflow FACADE in front of PUDA so existing PUDA workflows execute THROUGH the
    boundary — without moving any code into a shared package yet. Freeze the HRMS workflow-platform contract.
  context:
    - /Users/n15318/hrms/docs/spec/phased-plan.yaml                # PH-00B increment
    - /Users/n15318/hrms/docs/spec/puda-vs-hrms-capability-gap.md  # facade must cover A/C/D/E rows; B1/B2 via SPI
    - /Users/n15318/hrms/docs/platform-grounding/extracts/platform_spec.txt   # §P01 contract
    - /Users/n15318/hrms/docs/contracts/state-machines.yaml
    - /Users/n15318/PUDA_workflow_engine                           # READ-ONLY except the new thin facade shim; pinned cadf3973
  constraints:
    - Do NOT move code into a shared package (that is PH-00C). Do NOT change PUDA behavior — golden suite stays green.
    - The facade is a pass-through delegating to current PUDA workflow.ts/tasks.ts; no logic reimplemented.
  work_loops:
    - name: Contract definition
      max_iterations: 3
      repeat_until: The P01 facade contract is fully specified — startInstance/advance/approve/reject/sendBack/
        delegate/cancel/query + approver-resolver/guard/action/form SPIs — with idempotency, version-pinning, SLA,
        SoD semantics, written to docs/spec/workflow-platform-contract.yaml and docs/contracts/openapi/P01-workflow.yaml.
      steps: [derive each verb/SPI from §P01 + state-machines, specify request/response + errors, validate OpenAPI parses]
    - name: Facade wiring
      max_iterations: 5
      repeat_until: >=1 PUDA workflow of each shape (simple, wait, fork/join, reference) executes through the facade
        and the PUDA golden suite is still green; the facade adds no behavior, only delegation + P01 envelope.
      steps: [add facade shim in PUDA, route one workflow through it, run golden suite, confirm parity, repeat per shape]
    - name: Review-repair
      max_iterations: 3
      repeat_until: A boundary conformance test proves through-the-facade == direct-PUDA for the four shapes.
      steps: [diff facade vs direct outputs, fix envelope/mapping gaps, re-run]
  evidence_required:
    - docs/spec/workflow-platform-contract.yaml
    - docs/contracts/openapi/P01-workflow.yaml
    - a thin facade module inside PUDA (documented, non-invasive) + boundary conformance tests
    - docs/spec/ph-00b-verdict.md + docs/spec/manifest.json update
  escalate_when:
    - A PUDA workflow shape cannot pass through the facade without changing PUDA behavior.
    - The P01 contract cannot express a PUDA semantic (record as a contract gap, do not force it).
