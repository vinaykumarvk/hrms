# PH-14 Approval Evidence Redaction Guide

Marker: `REDACTION_REQUIRED`

This guide defines what must be removed before approval evidence can be referenced in the repository. It applies to board minutes, UAT sign-off, target-smoke outputs, incident bridge notes, screenshots, and change tickets.

## Redaction Requirements

| Data class | Action | Owner | Date |
|---|---|---|---|
| Passwords, tokens, private keys, session ids | Remove entirely and rotate if exposed | security-lead | 2026-07-19 |
| Aadhaar, PAN, bank account, pension identifiers | Mask before any repository reference | security-lead | 2026-07-19 |
| Employee medical or disciplinary details | Replace with case id and authorized reference | business-owner | 2026-07-19 |
| Internal infrastructure URLs | Replace with environment label | ops-lead | 2026-07-19 |
| Signatures and personal phone/email | Keep only role, name where approved, and date | release-chair | 2026-07-19 |

## Repository Rule

`NO_SECRETS_OR_PII_IN_REPO`

The repository may contain a redacted evidence reference, not raw human approval evidence. Approval evidence must stay in the approved external system until the release chair and security lead accept the redaction.

## Validation

If any approval evidence contains sensitive content, it must remain quarantined. Human approval is still pending until the board records a decision in the external system.

## Minimum Redacted Reference Shape

| Field | Allowed value |
|---|---|
| Evidence type | UAT decision, release board decision, risk acceptance, target smoke result |
| External reference | ticket id or controlled document id only |
| Decision summary | approved, rejected, or conditional, entered by human process only |
| Sensitive content | not stored in repository |
| Reviewers | release-chair and security-lead names or role references |

The redacted reference must never include raw credentials, payroll values, bank details, Aadhaar/PAN, medical details, disciplinary details, or unmasked screenshots.
