/goal
  objective: Amend the HRMS SCHEMA & auth-matrix to carry the resolver data substrate — positions,
    position_history, employee_job_assignments, reporting/reports_to_position hierarchy, statutory
    authority-assignment matrix, delegation & acting-charge windows, and committee/panel membership —
    so the resolvers defined in PH-02A have real facts to read.
  context:
    - docs/spec/hrms-authority-model.yaml    # PH-02A output — the tables must satisfy these resolver types
    - docs/data-model/00-platform-core.sql , 01-G01-employee-profile.sql , 06-G06-promotion-posting-progression.sql , 09-G09-disciplinary-punishment.sql
    - docs/data-model/CONVENTIONS.md
    - docs/contracts/auth-matrix.yaml
  constraints:
    - Additive DDL only; no destructive/irreversible data changes. Follow CONVENTIONS (tenant_id/entity_id, audit, RLS, indexes).
    - Reuse existing module tables where they already cover an authority matrix; add only what is genuinely missing.
    - The full 00->14 schema must still load clean end-to-end after the amendments.
  work_loops:
    - name: Substrate tables
      max_iterations: 5
      repeat_until: The schema contains (or explicitly reuses) tables for positions, position_history,
        employee_job_assignments, reporting/reports_to_position, g01_authority_assignments (statutory matrix),
        delegation/acting-charge (effective-dated), and committee/panel membership — each per CONVENTIONS.
      steps: [add/confirm each table with tenant/entity/effective-dates + no-overlap constraints, index FKs, RLS]
    - name: Auth-matrix + full-load
      max_iterations: 4
      repeat_until: auth-matrix.yaml covers appointing/transfer/disciplinary/appellate/reviewing/accepting/pension/
        payroll/SR-custodian roles, AND loading 00->14 into a throwaway PostgreSQL DB (ON_ERROR_STOP=1) succeeds.
      steps: [amend auth-matrix.yaml, run the full-load validation, fix any collision/constraint break]
  evidence_required:
    - amended docs/data-model/01-G01/06-G06/09-G09*.sql (+ 00-core if needed)
    - amended docs/contracts/auth-matrix.yaml
    - a full-load validation transcript (00->14 clean)
    - docs/spec/manifest.json                 # record PH-02B verdict
  escalate_when:
    - An amendment breaks the validated schema graph and cannot be made to load clean without a destructive change.
