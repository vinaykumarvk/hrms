# HRMS Machine-Readable Contracts

Generated from the platform-grounded v3 BRDs (`docs/brd/v3/`) and `docs/brd/PLATFORM_FOUNDATION.md`.
These are the build-time contracts all downstream implementation consumes.

| Contract | File | Contents |
|---|---|---|
| **API (OpenAPI 3.1)** | `openapi/G01.yaml … G14.yaml` | 14 module specs — **1,054 paths, 1,182 operations**. Shared conventions embedded (bearer auth, `/api/v1`, `X-Correlation-Id`, `Idempotency-Key`, cursor pagination, canonical `Error` envelope, 8 reusable standard responses). |
| **Auth matrix** | `auth-matrix.yaml` | 76 roles (34 RBAC v1.7 base + 42 gov additions), 28 capability flags, 4-tier PII ceiling, 98 actions × modules, P02 resolution order, SoD notes. |
| **Error taxonomy** | `error-taxonomy.yaml` | 311 codes: 8 standard HTTP + 8 shared platform + 295 module `ERR-G##-*`/`SR_*`, each mapped to one HTTP status + message. |
| **State machines** | `state-machines.yaml` | 73 lifecycle machines across all 14 modules (states, transitions, guards, side-effects, P01 pattern). |
| **Dependency register** | `dependency-register.yaml` | Per-module services consumed, owned/consumed entities, hard/soft deps, SR role, phase, effort; shared-contract ownership; arbiter. |

Related: `../architecture.md` (system architecture + ADRs), `../phased-plan.md` (dependency-ordered build plan),
`../data-model/` (validated 403-table schema).

## The canonical SR write-port
`POST /api/v1/sr/ingest` is owned by **G12** and is the single write path to the Service Register ledger.
G01/G04/G05/G06/G08/G09/G10/G11 call it with the dedup tuple
`(source_module, source_reference_id, source_event_version)` + `fact_key` (for qualifying-service events) +
the `is_reversal`/`reverses_source_reference_id` correction envelope. See `openapi/G12.yaml` for the authoritative schema.

## Validation
All 14 OpenAPI specs parse as OpenAPI 3.1.0 (several verified with `openapi-spec-validator`); all 4 contract
YAMLs parse with PyYAML. Re-check with:
```bash
python3 -c "import glob,yaml; [yaml.safe_load(open(f)) for f in glob.glob('docs/contracts/**/*.yaml', recursive=True)]"
```
