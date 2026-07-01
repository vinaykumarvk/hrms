/goal
  objective: Produce the HRMS SEED-DATA PLAN & authority FIXTURES that let G03 (leave) and G05 (transfer)
    resolve authority end-to-end without test-only bypasses — a sample tenant/entity/org/position hierarchy
    plus the hard resolver cases: vacant manager, delegated manager, acting-charge, conflict-of-interest,
    cross-entity authority, and historical-correction (past result must not be rewritten).
  context:
    - docs/spec/hrms-authority-model.yaml , docs/spec/authority-resolution-contract.yaml   # PH-02A
    - docs/data-model/*.sql                   # PH-02B substrate tables the seed populates
    - docs/spec/phased-plan.yaml              # PH-02 fixture requirements
  constraints:
    - Seed additions must be revertible independently of schema. No destructive data changes without approval.
    - Fixtures must exercise every resolver type and the historical-correction snapshot rule.
  work_loops:
    - name: Seed plan + hierarchy
      max_iterations: 4
      repeat_until: hrms-seed-data-plan.yaml enumerates a coherent tenant/entity/org/position/reporting hierarchy
        sufficient for G03 and G05, with fixtures.statutory_authority.table = g01_authority_assignments.
      steps: [define the seed hierarchy, map to the PH-02B tables, state load order]
    - name: Hard-case fixtures
      max_iterations: 4
      repeat_until: Fixture cases exist for VACANT_MANAGER, DELEGATED_MANAGER, ACTING_CHARGE, CONFLICT_OF_INTEREST,
        CROSS_ENTITY_AUTHORITY, and HISTORICAL_CORRECTION (as-of resolution unchanged after later correction).
      steps: [author each fixture case with inputs + expected resolver output, incl. the as-of/correction pair]
  evidence_required:
    - docs/spec/hrms-seed-data-plan.yaml
    - fixture definitions (in the seed plan or docs/tests/) covering the 6 hard cases above
    - docs/spec/manifest.json                 # record PH-02C verdict
  escalate_when:
    - A resolver case cannot be seeded without a schema gap (route back to PH-02B).
