# Prototype Screen → Module Map

Classifies **all 296 PrimeSoft prototype screens** (every `*.txt` in
`reconciliation/prototype-extract/`) into a **government module** (G01–G14 / platform-core /
platform-config) or **out-of-scope commercial** (recruitment, onboarding, separation, IT/service
desk, platform super-admin, payroll). Module labels are best-fit against the gov HRMS BRD set;
the load-bearing axis is **in-gov-scope vs out-of-scope**.

## Summary counts

| Scope | Screens |
|---|---|
| **In gov scope** (G01/G02/G03/G08/G13/platform-core/platform-config) | **183** |
| **Out of scope** (recruitment/onboarding/separation/ITSM/psa/payroll) | **113** |
| **Total** | **296** |

In-gov-scope by module: G01 = 32, G02 = 2,
G03 = 33, G08 = 31,
G13 = 20,
platform-core = 12,
platform-config = 53.

Out-of-scope by group: Recruitment = 45,
Onboarding = 12, Separation = 18,
IT assets & Service Desk = 21,
Platform Super-Admin = 13,
G10 Payroll = 4.

---

## In gov scope (183)

### G01 employee profile / master / directory / org / lifecycle (32)

*Rationale:* Employee golden-record CRUD, directory, org chart, and lifecycle (probation/confirmation) surfaces — core gov HR.

| Screen | Module |
|---|---|
| `add-certification` | G01 employee profile / master / directory / org / lifecycle |
| `add-dependent` | G01 employee profile / master / directory / org / lifecycle |
| `add-disability` | G01 employee profile / master / directory / org / lifecycle |
| `add-education` | G01 employee profile / master / directory / org / lifecycle |
| `add-experience` | G01 employee profile / master / directory / org / lifecycle |
| `add-skill` | G01 employee profile / master / directory / org / lifecycle |
| `add-visa` | G01 employee profile / master / directory / org / lifecycle |
| `bank-entry` | G01 employee profile / master / directory / org / lifecycle |
| `dept-headcount` | G01 employee profile / master / directory / org / lifecycle |
| `dept-view` | G01 employee profile / master / directory / org / lifecycle |
| `directory` | G01 employee profile / master / directory / org / lifecycle |
| `directory-mini-profile` | G01 employee profile / master / directory / org / lifecycle |
| `dob-view` | G01 employee profile / master / directory / org / lifecycle |
| `employee-detail` | G01 employee profile / master / directory / org / lifecycle |
| `employee-master` | G01 employee profile / master / directory / org / lifecycle |
| `hod-employee-detail` | G01 employee profile / master / directory / org / lifecycle |
| `hod-employees` | G01 employee profile / master / directory / org / lifecycle |
| `hr-add-employee` | G01 employee profile / master / directory / org / lifecycle |
| `hr-employee-detail` | G01 employee profile / master / directory / org / lifecycle |
| `hr-project-master` | G01 employee profile / master / directory / org / lifecycle |
| `hrbp-employee-detail` | G01 employee profile / master / directory / org / lifecycle |
| `hrbp-my-employees` | G01 employee profile / master / directory / org / lifecycle |
| `my-org` | G01 employee profile / master / directory / org / lifecycle |
| `my-profile` | G01 employee profile / master / directory / org / lifecycle |
| `my-team` | G01 employee profile / master / directory / org / lifecycle |
| `national-id` | G01 employee profile / master / directory / org / lifecycle |
| `nominees` | G01 employee profile / master / directory / org / lifecycle |
| `org-chart` | G01 employee profile / master / directory / org / lifecycle |
| `probation-approval` | G01 employee profile / master / directory / org / lifecycle |
| `probation-confirmation` | G01 employee profile / master / directory / org / lifecycle |
| `probation-decision` | G01 employee profile / master / directory / org / lifecycle |
| `probation-management` | G01 employee profile / master / directory / org / lifecycle |

### G02 personal-details change workflow (2)

*Rationale:* Governed self-service / HR-on-behalf change requests for sensitive fields — this module.

| Screen | Module |
|---|---|
| `edit-profile` | G02 personal-details change workflow |
| `sensitive-changes` | G02 personal-details change workflow |

### G03 leave & attendance (33)

*Rationale:* Leave apply/approve/config, attendance, shifts, holidays, biometric/geofence — the G03 gov module.

| Screen | Module |
|---|---|
| `apply-leave` | G03 leave & attendance |
| `apply-optional-holiday` | G03 leave & attendance |
| `attendance` | G03 leave & attendance |
| `attendance-approvals` | G03 leave & attendance |
| `attendance-config` | G03 leave & attendance |
| `attendance-lock` | G03 leave & attendance |
| `attendance-policies` | G03 leave & attendance |
| `attendance-reasons` | G03 leave & attendance |
| `attendance-shifts` | G03 leave & attendance |
| `biometric-mgmt` | G03 leave & attendance |
| `calendar` | G03 leave & attendance |
| `checkin-approvals` | G03 leave & attendance |
| `compoff-approvals` | G03 leave & attendance |
| `dept-attendance` | G03 leave & attendance |
| `dept-leave` | G03 leave & attendance |
| `geofencing` | G03 leave & attendance |
| `holiday-admin` | G03 leave & attendance |
| `holiday-calendar` | G03 leave & attendance |
| `holiday-calendar-config` | G03 leave & attendance |
| `leave-balance-adjust` | G03 leave & attendance |
| `leave-config` | G03 leave & attendance |
| `leave-policies` | G03 leave & attendance |
| `leave-reasons` | G03 leave & attendance |
| `leave-revocation` | G03 leave & attendance |
| `my-leave` | G03 leave & attendance |
| `office-attendance` | G03 leave & attendance |
| `pl-encashment` | G03 leave & attendance |
| `request-ot` | G03 leave & attendance |
| `request-regularisation` | G03 leave & attendance |
| `team-attendance` | G03 leave & attendance |
| `team-leave` | G03 leave & attendance |
| `team-member-attendance-history` | G03 leave & attendance |
| `team-member-leave-history` | G03 leave & attendance |

### G08 performance (goals / reviews / calibration / PIP) (31)

*Rationale:* Goal-setting, appraisal cycles, reviews, calibration, normalization and PIP — the G08 gov module.

| Screen | Module |
|---|---|
| `add-goal` | G08 performance (goals / reviews / calibration / PIP) |
| `add-goal-for-reportee` | G08 performance (goals / reviews / calibration / PIP) |
| `admin-add-goal` | G08 performance (goals / reviews / calibration / PIP) |
| `ai-suggest-goals` | G08 performance (goals / reviews / calibration / PIP) |
| `appraisal-review` | G08 performance (goals / reviews / calibration / PIP) |
| `calibration` | G08 performance (goals / reviews / calibration / PIP) |
| `copy-previous-goal` | G08 performance (goals / reviews / calibration / PIP) |
| `copy-previous-goal-mgr` | G08 performance (goals / reviews / calibration / PIP) |
| `dept-performance` | G08 performance (goals / reviews / calibration / PIP) |
| `goal-approvals` | G08 performance (goals / reviews / calibration / PIP) |
| `manager-appraisal-tasks` | G08 performance (goals / reviews / calibration / PIP) |
| `my-goals` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-assign-plan` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-calibration` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-cycle-create` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-cycle-detail` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-exclusions` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-goal-plan-create` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-goal-plan-detail` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-goal-plans` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-metrics` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-normalization` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-pip` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-review-cycles` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-review-status` | G08 performance (goals / reviews / calibration / PIP) |
| `pa-scorecard-pillars` | G08 performance (goals / reviews / calibration / PIP) |
| `pip-cases` | G08 performance (goals / reviews / calibration / PIP) |
| `review-goal-plan` | G08 performance (goals / reviews / calibration / PIP) |
| `reviews` | G08 performance (goals / reviews / calibration / PIP) |
| `self-review` | G08 performance (goals / reviews / calibration / PIP) |
| `start-review` | G08 performance (goals / reviews / calibration / PIP) |

### G13 documents / letters / policy library (20)

*Rationale:* Document admin (da-*), vault, uploads, letters, policy library and acknowledgements — G13.

| Screen | Module |
|---|---|
| `da-ack-campaign` | G13 documents / letters / policy library |
| `da-bulk-letters` | G13 documents / letters / policy library |
| `da-categories` | G13 documents / letters / policy library |
| `da-doc-master` | G13 documents / letters / policy library |
| `da-letter-queue` | G13 documents / letters / policy library |
| `da-merge-fields` | G13 documents / letters / policy library |
| `da-policies` | G13 documents / letters / policy library |
| `da-signoff-tracker` | G13 documents / letters / policy library |
| `da-storage` | G13 documents / letters / policy library |
| `da-templates` | G13 documents / letters / policy library |
| `da-vault` | G13 documents / letters / policy library |
| `da-versioning` | G13 documents / letters / policy library |
| `document-clusters` | G13 documents / letters / policy library |
| `document-upload` | G13 documents / letters / policy library |
| `documents-oversight` | G13 documents / letters / policy library |
| `letters` | G13 documents / letters / policy library |
| `my-letters` | G13 documents / letters / policy library |
| `policies` | G13 documents / letters / policy library |
| `policy-ack` | G13 documents / letters / policy library |
| `upload-document` | G13 documents / letters / policy library |

### platform-core (9)

*Rationale:* Cross-cutting P01/X.2 inbox, tasks, notifications, dashboard, AI chat and settings shared by all gov modules.

| Screen | Module |
|---|---|
| `ai-policy-chat` | platform-core |
| `approvals` | platform-core |
| `bulk-upload` | platform-core |
| `dashboard` | platform-core |
| `escalations` | platform-core |
| `leadership-ai-chat` | platform-core |
| `notifications` | platform-core |
| `settings` | platform-core |
| `tasks` | platform-core |

### platform-core (P05/DPDPA) (2)

*Rationale:* Tamper-evident audit and DPDPA consent ledgers — platform-core.

| Screen | Module |
|---|---|
| `audit-log` | platform-core (P05/DPDPA) |
| `consent-history` | platform-core (P05/DPDPA) |

### platform-core (compliance) (1)

*Rationale:* Statutory POSH grievance/compliance reporting — gov statutory scope.

| Screen | Module |
|---|---|
| `report-posh` | platform-core (compliance) |

### platform-config (53)

*Rationale:* Tenant/module configuration (cfg-*, access-control): workflows, SLA, RBAC, masters, policies for gov modules.

| Screen | Module |
|---|---|
| `access-control` | platform-config |
| `cfg-approval-builder` | platform-config |
| `cfg-approval-flows` | platform-config |
| `cfg-assign` | platform-config |
| `cfg-att-platform` | platform-config |
| `cfg-att-policy` | platform-config |
| `cfg-blackout` | platform-config |
| `cfg-bu` | platform-config |
| `cfg-calibration` | platform-config |
| `cfg-classification` | platform-config |
| `cfg-compoff` | platform-config |
| `cfg-cross-entity` | platform-config |
| `cfg-custom` | platform-config |
| `cfg-decisionmatrix` | platform-config |
| `cfg-depts` | platform-config |
| `cfg-devices` | platform-config |
| `cfg-doc-templates` | platform-config |
| `cfg-document-settings` | platform-config |
| `cfg-duplicity` | platform-config |
| `cfg-entities` | platform-config |
| `cfg-form-builder` | platform-config |
| `cfg-forms` | platform-config |
| `cfg-geo` | platform-config |
| `cfg-geofence` | platform-config |
| `cfg-goal-templates` | platform-config |
| `cfg-grades` | platform-config |
| `cfg-grants` | platform-config |
| `cfg-holiday` | platform-config |
| `cfg-holiday-calendars` | platform-config |
| `cfg-infraction` | platform-config |
| `cfg-integrations` | platform-config |
| `cfg-ip` | platform-config |
| `cfg-leave-platform` | platform-config |
| `cfg-leave-policy` | platform-config |
| `cfg-letterheads` | platform-config |
| `cfg-nid` | platform-config |
| `cfg-notif` | platform-config |
| `cfg-pip` | platform-config |
| `cfg-rating` | platform-config |
| `cfg-rbac` | platform-config |
| `cfg-rbac-role` | platform-config |
| `cfg-review-templates` | platform-config |
| `cfg-shifts` | platform-config |
| `cfg-signers` | platform-config |
| `cfg-skip` | platform-config |
| `cfg-skip-edit` | platform-config |
| `cfg-sla` | platform-config |
| `cfg-sla-edit` | platform-config |
| `cfg-sso` | platform-config |
| `cfg-tenant` | platform-config |
| `cfg-weeklyoff` | platform-config |
| `cfg-workflow-builder` | platform-config |
| `cfg-workflows` | platform-config |

---

## Out of scope — commercial (113)

### Recruitment / TA (45)

*Rationale:* Requisitions, candidates, interviews, offers, recruiter/vendor and referral screens — commercial talent-acquisition, out of gov scope.

| Screen | Module |
|---|---|
| `candidate-profile` | Recruitment / TA |
| `candidates` | Recruitment / TA |
| `cfg-external-rec` | Recruitment / TA |
| `cfg-hiring-leads` | Recruitment / TA |
| `cfg-sources` | Recruitment / TA |
| `create-job` | Recruitment / TA |
| `external-recruiters` | Recruitment / TA |
| `generate-offer` | Recruitment / TA |
| `hiring-flow` | Recruitment / TA |
| `hiring-pipeline` | Recruitment / TA |
| `interview-detail` | Recruitment / TA |
| `interviews` | Recruitment / TA |
| `job-openings` | Recruitment / TA |
| `my-interviews` | Recruitment / TA |
| `my-referrals` | Recruitment / TA |
| `offer-letter` | Recruitment / TA |
| `offer-letters` | Recruitment / TA |
| `ra-add-candidate` | Recruitment / TA |
| `ra-candidates` | Recruitment / TA |
| `ra-document-review` | Recruitment / TA |
| `ra-document-review-detail` | Recruitment / TA |
| `ra-duplicity` | Recruitment / TA |
| `ra-external-recruiters` | Recruitment / TA |
| `ra-interviews` | Recruitment / TA |
| `ra-offer-preview` | Recruitment / TA |
| `ra-offer-queue` | Recruitment / TA |
| `ra-pipeline` | Recruitment / TA |
| `ra-portals` | Recruitment / TA |
| `ra-pre-offer-issue` | Recruitment / TA |
| `ra-pre-offer-queue` | Recruitment / TA |
| `ra-raise-requisition` | Recruitment / TA |
| `ra-recruiter-assignment` | Recruitment / TA |
| `ra-recruiter-reqs` | Recruitment / TA |
| `ra-recruiters` | Recruitment / TA |
| `ra-req-detail` | Recruitment / TA |
| `ra-requisitions` | Recruitment / TA |
| `ra-schedule-interview` | Recruitment / TA |
| `ra-sources` | Recruitment / TA |
| `ra-vendor-onboarding` | Recruitment / TA |
| `rec-overview` | Recruitment / TA |
| `recruiter-profile` | Recruitment / TA |
| `recruitment` | Recruitment / TA |
| `refer` | Recruitment / TA |
| `requisition-approval` | Recruitment / TA |
| `requisitions` | Recruitment / TA |

### Onboarding / pre-joining / BGV (12)

*Rationale:* Pre-joining, joining forms, onboarding workflows and background verification — commercial onboarding, out of scope.

| Screen | Module |
|---|---|
| `bgv` | Onboarding / pre-joining / BGV |
| `bgv-reports` | Onboarding / pre-joining / BGV |
| `bgv-upload` | Onboarding / pre-joining / BGV |
| `cfg-bgv-checklist` | Onboarding / pre-joining / BGV |
| `joining-form-detail` | Onboarding / pre-joining / BGV |
| `joining-forms-approval` | Onboarding / pre-joining / BGV |
| `onboarding-config` | Onboarding / pre-joining / BGV |
| `onboarding-form` | Onboarding / pre-joining / BGV |
| `onboarding-initiate` | Onboarding / pre-joining / BGV |
| `onboarding-oversight` | Onboarding / pre-joining / BGV |
| `onboarding-workflow-forms` | Onboarding / pre-joining / BGV |
| `pre-joining` | Onboarding / pre-joining / BGV |

### Separation / exit / FnF / clearance (18)

*Rationale:* Separation stages, exit interview, absconding, force-separation, FnF and clearance — commercial separation, out of scope.

| Screen | Module |
|---|---|
| `absconding` | Separation / exit / FnF / clearance |
| `cfg-exit-interview-form` | Separation / exit / FnF / clearance |
| `cfg-separation-checklist` | Separation / exit / FnF / clearance |
| `cfg-separation-policy` | Separation / exit / FnF / clearance |
| `cfg-separation-workflow` | Separation / exit / FnF / clearance |
| `clearance-attendance` | Separation / exit / FnF / clearance |
| `clearance-compliance` | Separation / exit / FnF / clearance |
| `clearance-facilities` | Separation / exit / FnF / clearance |
| `clearance-it-assets` | Separation / exit / FnF / clearance |
| `clearance-leave` | Separation / exit / FnF / clearance |
| `exit-interview` | Separation / exit / FnF / clearance |
| `fnf-clearance` | Separation / exit / FnF / clearance |
| `fnf-clearance-hub` | Separation / exit / FnF / clearance |
| `force-separation` | Separation / exit / FnF / clearance |
| `initiate-separation` | Separation / exit / FnF / clearance |
| `separation-finalise` | Separation / exit / FnF / clearance |
| `separation-stage1` | Separation / exit / FnF / clearance |
| `separation-stage2` | Separation / exit / FnF / clearance |

### IT assets & Service Desk (21)

*Rationale:* IT/office asset lifecycle, CMDB, service desk tickets, catalog, knowledge base and visitor mgmt — commercial ITSM, out of scope.

| Screen | Module |
|---|---|
| `cfg-catalog-items` | IT assets & Service Desk |
| `cfg-kb-articles` | IT assets & Service Desk |
| `cfg-sd-config` | IT assets & Service Desk |
| `it-asset-assignment` | IT assets & Service Desk |
| `it-asset-master` | IT assets & Service Desk |
| `it-asset-requests` | IT assets & Service Desk |
| `it-cmdb` | IT assets & Service Desk |
| `it-masters` | IT assets & Service Desk |
| `it-postmortems` | IT assets & Service Desk |
| `kb-article` | IT assets & Service Desk |
| `knowledge-base` | IT assets & Service Desk |
| `my-assets` | IT assets & Service Desk |
| `my-tickets` | IT assets & Service Desk |
| `office-assets` | IT assets & Service Desk |
| `raise-ticket` | IT assets & Service Desk |
| `sd-queue` | IT assets & Service Desk |
| `sd-ticket-work` | IT assets & Service Desk |
| `service-catalog` | IT assets & Service Desk |
| `team-assets` | IT assets & Service Desk |
| `ticket-detail` | IT assets & Service Desk |
| `visitor-mgmt` | IT assets & Service Desk |

### Platform Super-Admin (13)

*Rationale:* psa-* tenant provisioning, licensing, releases, migration and platform monitoring — vendor super-admin, out of scope.

| Screen | Module |
|---|---|
| `psa-analytics` | Platform Super-Admin |
| `psa-environments` | Platform Super-Admin |
| `psa-feature-flags` | Platform Super-Admin |
| `psa-licenses` | Platform Super-Admin |
| `psa-master-data` | Platform Super-Admin |
| `psa-migration` | Platform Super-Admin |
| `psa-migration-detail` | Platform Super-Admin |
| `psa-monitoring` | Platform Super-Admin |
| `psa-provisioning` | Platform Super-Admin |
| `psa-releases` | Platform Super-Admin |
| `psa-security` | Platform Super-Admin |
| `psa-tenant-detail` | Platform Super-Admin |
| `psa-tenants` | Platform Super-Admin |

### G10 Payroll (4)

*Rationale:* Payroll export, TDS, PF/UAN and reimbursements — G10 payroll, treated as commercial/out of gov scope here.

| Screen | Module |
|---|---|
| `payroll-export` | G10 Payroll |
| `pf-uan` | G10 Payroll |
| `reimbursements` | G10 Payroll |
| `tds-tax` | G10 Payroll |
