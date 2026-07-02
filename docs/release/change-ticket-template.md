# PH-13 Change Ticket Template

Marker: `CHANGE_TICKET_TEMPLATE`

This template defines the fields the human release board or release manager must complete in the external change-management system. It is a template only; it is not an active change ticket and does not authorize release.

## Ticket Fields

| Field | Required content | OWNER_DATE |
|---|---|---|
| Change title | HRMS release candidate and target environment | release-manager / human meeting date |
| Release candidate | HRMS-RC-PH13 and checksum manifest reference | release-manager / human meeting date |
| Business approver | Name and decision reference | business-owner / human meeting date |
| Release approver | Name and go/no-go decision reference | release-chair / human meeting date |
| Operations owner | Target smoke and rollback owner | ops-lead / human meeting date |
| Security owner | Security residual-risk acceptance | security-lead / human meeting date |
| Migration owner | Migration exception disposition | migration-lead / human meeting date |
| Planned window | Human-approved change window | release-chair / human meeting date |
| Rollback bridge | Human-approved bridge and commander | ops-lead / human meeting date |

## Required Attachments

- PH-13 release-candidate manifest.
- Evidence checksum manifest and verification output.
- PH-12 release-board dossier.
- Go/no-go decision record completed by humans.
- Rollback authorization completed by humans.

## Boundary

`GO_LIVE_HUMAN_APPROVAL_PENDING`

This template cannot be used as approval evidence until a human release manager creates the actual change record in the approved system. `NO_PRODUCTION_CREDENTIALS` are stored here.

