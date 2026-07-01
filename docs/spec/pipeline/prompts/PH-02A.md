/goal
  objective: Define the authority RESOLVER MODEL & contract for HRMS workflow resolution — map every
    state-machine trigger to a resolver type, define resolver types (reporting-chain, positional/statutory
    authority, org-unit-head, committee, delegation/acting-charge), the historical-correction snapshot rule,
    and the G03/G05 vertical-slice bindings. Contract + model only (no schema, no seed, no tests yet).
  context:
    - docs/spec/phased-plan.yaml            # PH-02 goal/requirements/implementation_steps
    - docs/contracts/state-machines.yaml    # the triggers that must all map to a resolver type
    - docs/contracts/auth-matrix.yaml        # existing roles/authorities
    - docs/spec/puda-vs-hrms-capability-gap.md   # B1/B2/D1 = the hierarchy/authority resolver gap
    - docs/spec/hrms-authority-model.yaml , docs/spec/authority-resolution-contract.yaml   # if present, refine in place
  constraints:
    - Model/contract artefacts only. Do NOT modify schema/seed/tests in this sub-phase (that is PH-02B/C/D).
    - Ambiguous authority must be BLOCKED, never guessed. Every resolver output must be explainable/auditable.
    - Effective-dated lookup must be deterministic; a later correction must NOT rewrite a past resolver result (snapshot rule).
  work_loops:
    - name: Trigger→resolver mapping
      max_iterations: 4
      repeat_until: Every workflow-driving trigger in state-machines.yaml maps to exactly one resolver type in
        hrms-authority-model.yaml `state_machine_trigger_map` (0 unmapped), and resolver_types covers
        REPORTING_CHAIN, STATUTORY_AUTHORITY, ORG_UNIT_HEAD, COMMITTEE, DELEGATION.
      steps: [enumerate triggers, assign resolver type + resolution rule, record vacancy/fallback + as-of semantics]
    - name: Contract + bindings
      max_iterations: 3
      repeat_until: authority-resolution-contract.yaml defines each resolver's input/output/error (ambiguous→blocked),
        vertical_slice_bindings covers G03_leave and G05_transfer, and snapshot_rule is stated.
      steps: [write the resolver SPI contract, bind G03/G05, define the historical-correction snapshot rule]
    - name: Review-repair
      max_iterations: 2
      repeat_until: A completeness critic finds no trigger unmapped and no resolver whose ambiguity handling is unspecified.
      steps: [review, run critic, fix]
  evidence_required:
    - docs/spec/hrms-authority-model.yaml    # resolver_types, state_machine_trigger_map (0 unmapped), vertical_slice_bindings, snapshot_rule
    - docs/spec/authority-resolution-contract.yaml
    - docs/spec/manifest.json                 # record PH-02A verdict
  escalate_when:
    - A trigger has no defensible resolver type without new product decisions.
    - Ambiguous authority cannot be made deterministically blockable.
