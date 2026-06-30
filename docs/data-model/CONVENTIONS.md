# Data-Model Conventions — Government HRMS

**Authoritative for:** every module schema author (`01-G01.sql` … `14-G14.sql`).
**Inherited from:** `00-platform-core.sql` (the shared platform core) and
`docs/brd/PLATFORM_FOUNDATION.md`. These rules are **mandatory** — a module schema that
violates them is rejected at review. The shared core (`00-platform-core.sql`) is the single
source of truth for the canonical tables; module schemas **reference, never redefine** them.

---

## 1. Primary keys & business keys

- Every table has `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- Human/business keys (`service_no`, `doc_no`, `order_no`, `case_no`, `workflow_code`, …)
  are **separate columns** with their own `UNIQUE` constraint, scoped by `tenant_id` where
  the value is only unique within a tenant (e.g. `UNIQUE (tenant_id, service_no)`).
- Append-only ledgers may keep a domain-named PK (`sr_event_id`, `log_id`) but it is still
  `uuid DEFAULT gen_random_uuid()`.
- `gen_random_uuid()` requires `CREATE EXTENSION pgcrypto` (already done in the core).

## 2. Multi-tenancy (Platform §0.1)

- **Every business table carries `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT`.**
- Entity-scoped tables also carry `entity_id uuid REFERENCES entities(id) ON DELETE RESTRICT`.
- Scoping is enforced at the **data layer** (RLS, §6), never only in application code.
- A query without a resolvable tenant scope is **rejected, not defaulted to "all"**.
- Cross-entity reach (Org Admin) and cross-tenant reach (Platform Super Admin) are **widened
  scope filters, never bypasses**.
- Exempt: platform-global **reference/catalog** tables (`pii_tiers`, `permissions`) carry no
  `tenant_id` and no RLS. Do not add new global tables without explicit sign-off.

## 3. Standard columns

Every business table (except append-only ledgers):

| Column | Type | Rule |
|---|---|---|
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | bump on every update |
| `created_by` | `uuid` | logical ref to `users(id)`; **no FK** (survives user removal) |
| `updated_by` | `uuid` | logical ref to `users(id)`; **no FK** |
| `is_deleted` | `boolean NOT NULL DEFAULT false` | **soft delete only — no hard delete** |

**Append-only ledgers** (`audit_log`, `security_audit_log`, `service_register_events`, and any
module sub-ledger such as `sr_status_events`, `sr_anchors`, access logs) carry **only**
`created_at` / `created_by` — **no `updated_at`, no `is_deleted`**. No `UPDATE`, no `DELETE`;
enforce via DB grants + triggers. The sole permitted audit mutation is the DPDPA
right-to-erasure **redaction marker** on `audit_log.old_value`.

## 4. Enums (UPPER_SNAKE_CASE values)

- **Platform-wide CLOSED enumerations** → Postgres `CREATE TYPE … AS ENUM` (defined in
  Section 1 of the core; reuse those types, e.g. `employment_status`, `classification_level`,
  `workflow_instance_status`, `sr_event_category`). Do not duplicate a core enum.
- **Tenant-CONFIGURABLE value sets** (designation, cadre, geography, segment, document type,
  event type) → **master tables** with a `text *_code` column and `UNIQUE (tenant_id, *_code)`,
  validated by `VAL-ENUM` / `VAL-MASTER-UNIQUE`. Never a Postgres enum (so a tenant can extend
  without a DDL migration).
- All enum values are `UPPER_SNAKE_CASE`. New module enums follow the same casing.

## 5. Indexes, constraints & foreign keys

- **Index every FK column** and common query columns (`tenant_id`, `entity_id`, `status`,
  `*_date`, business keys).
- Business keys get `UNIQUE` constraints (tenant-scoped where applicable).
- FKs are **explicit** with a deliberate `ON DELETE` action:
  - `tenant_id` / `entity_id` / master refs (cadre, designation, grade, pay_scale) → `RESTRICT`
  - hierarchy / self refs (org parent, reporting manager) → `RESTRICT` or `SET NULL`
  - owner refs that may legitimately vanish → `SET NULL`
- Forward/circular references are resolved with `ALTER TABLE … ADD CONSTRAINT` after both
  tables exist (see core Section 10); use `DEFERRABLE INITIALLY DEFERRED` where a row and its
  child are inserted in one transaction (e.g. `documents.current_version_id`).
- Multi-step writes use **transactions**; list queries use **cursor pagination**
  (`?limit=` default 25, max 100, `cursor`/`next_cursor`).

## 6. Row-Level Security (P02 data-scope substrate)

Apply this template to **every** new tenant-scoped table (it is what the core's DO-block applies):

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
```

- The app connects as a **non-superuser** role and sets per request, from the validated session:
  `SET app.current_tenant_id = '<tenant uuid>';` and `SET app.is_platform_admin = 'true'|'false';`.
- Org-Admin cross-**entity** reach and **field masking** are applied **above** the row filter by
  P02 (`Authorization.check`), on serialization — not in the RLS policy.
- Append-only ledgers are still RLS-scoped (read isolation); their immutability is a separate
  grant/trigger concern.

## 7. Audit, consent & security (P05 / DPDPA)

- Modules **do not define their own `audit_log`** — every INSERT/UPDATE/soft-DELETE on a business
  table is captured by the platform **DB trigger** into `audit_log`; auth/permission/admin events
  into `security_audit_log`. PII is stored **masked**.
- Every request carries `X-Correlation-Id`, written to every audit and log line
  (`correlation_id` column).
- Consent is captured in `consent_records` (immutable: superseded, never deleted); statutory data
  has legally mandated retention and is exempt from erasure (DPDP §17 lawful basis); erasure of
  non-statutory data is a redaction marker, itself audited.

## 8. What module schemas must NOT redefine

These canonical tables live in `00-platform-core.sql`; module schemas **FK to them by id**:

`tenants`, `entities`, `org_units`, `designations`, `cadres`, `grades`, `pay_scales`,
`geo_master`, `segment_master`, `users`, `roles`, `permissions`, `role_permissions`,
`user_roles`, `capability_flags`, `user_capability_flags`, `individual_entitlements`,
`pii_tiers`, `employees`, `employee_dependents`, `workflows`, `workflow_instances`,
`workflow_actions`, `skip_settings`, `sla_settings`, `audit_log`, `security_audit_log`,
`consent_records`, `documents`, `document_versions`, `service_register_events`,
`notifications`, `jobs`, `integration_credentials`, `migration_runs`.

**Ownership notes for the canonical entities other modules reference:**
- `employees` / `employee_dependents` — **owned by G01**; G01's module schema adds the
  governance satellites (attribute-history spine, aadhaar vault, identity docs, positions,
  nominees, …). Other modules reference, read-only, with no divergent field/enum redeclaration.
- `service_register_events` — **owned by G12**; append-only, hash-chained per
  `(tenant_id, employee_id)`. The canonical writer set (G01/G04/G05/G06/G08/G09/G10/G11) posts
  via G12's ingestion contract; **no module mutates it directly**. Sub-ledgers
  (`sr_status_events`, `sr_anchors`, `sr_event_type`, `sr_ingestion_requests`, …) live in 12-G12.
- `documents` / `document_versions` — **owned by G13**; other modules attach via `document_id`
  and store only the reference. The full vault model (storage objects, folders, retention, legal
  holds, security clearances, signatures) lives in 13-G13.
- `workflows` / `workflow_instances` / `workflow_actions` — **P01 engine**; module flows are
  configured W.1 definitions, not new engines.

## 9. Naming

- snake_case table and column names; plural table names (`employees`, `documents`).
- Index prefix `ix_<table>_<column>`; unique-constraint prefix `uq_`; check-constraint prefix
  `ck_`; foreign-key constraint prefix `fk_`.
- Module-unique validation/job/message ids follow the Foundation scheme:
  `VAL-<gov>-*`, `JOB-<gov>-*`, `MSG-<gov>-*`, `ERR-<gov>-*`, registered in the Foundation indexes.
