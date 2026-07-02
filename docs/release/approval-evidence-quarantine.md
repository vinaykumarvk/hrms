# PH-14 Approval Evidence Quarantine

Marker: `APPROVAL_EVIDENCE_QUARANTINE`

This document defines how to handle real approval evidence if it is supplied before the release board process has formally accepted it. PH-14 does not receive real approvals. It prepares quarantine rules so secrets, PII, unredacted signatures, or accidental approval claims do not enter the repository.

## Quarantine Rules

| Evidence type | Repository action | Owner | Date |
|---|---|---|---|
| Signed UAT minutes | Store externally; keep only redacted reference after approval | business-owner | 2026-07-19 |
| CAB/release decision | Store externally; link redacted decision id after board acceptance | release-chair | 2026-07-19 |
| Target-smoke output | Store in approved operations evidence system | ops-lead | 2026-07-19 |
| Screenshots containing PII | Redact before repository reference | security-lead | 2026-07-19 |
| Credentials or tokens | Do not store; rotate if exposed | security-lead | 2026-07-19 |

## Current State

- `HUMAN_APPROVALS_STILL_PENDING`
- `HUMAN_BOARD_ACTION_REQUIRED`
- `GO_LIVE_HUMAN_APPROVAL_PENDING`
- `NO_SECRETS_OR_PII_IN_REPO`

## Handling Procedure

1. If evidence arrives in the repository, stop and quarantine it.
2. Security lead checks for credentials, PII, signatures, and internal URLs.
3. Release chair decides whether a redacted reference can be linked.
4. If a sealed artifact changes, rerun PH-13B and PH-14B.
5. Do not mark the release approved from repository evidence alone.

## Quarantine Register Fields

| Field | Required value |
|---|---|
| Evidence source | external system, meeting minutes, ticket id, or file origin |
| Quarantine reason | sensitive data, missing redaction, unexpected approval, or seal drift |
| Custodian | named human owner |
| Security review | required before repository reference |
| Redacted reference | allowed only after release-chair and security-lead acceptance |

Until this register is completed externally, the repository keeps only the pending markers.
