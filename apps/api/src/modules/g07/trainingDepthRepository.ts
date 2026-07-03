import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";

/**
 * PH-08D G07 depth entities (docs/brd/v3/G07-training-skill-development.md):
 *   (1) skills/competencies taxonomy — skill_categories (§5.2.1), skills (§5.2.2),
 *       competencies (§5.2.4) — plus role competency models (competency_models §5.2.5 with
 *       competency_model_items §5.2.6) and the per-employee skill inventory (employee_skills §5.2.7);
 *   (2) incremental gap analysis — skill_gap_analyses + skill_gap_items (§5.2.9/§5.2.10,
 *       VAL-G07-GAPSIZE: gap_size = max(0, target - current));
 *   (3) the versioned READ-ONLY Gap Contract v1 (FR-G07-024, §10.6) projected from the finalized
 *       gap analysis and consumed by G06/G08 through its contract route, never via G07 internals;
 *   (4) campaign engine basics — training_campaigns (§5.2.29) + campaign_targets (§5.2.31) with
 *       wave assignment and escalation_level (FR-G07-017, JOB-G07-CAMPAIGN).
 * Follows the PH-08A/PH-08C repository pattern: sync interface + in-memory impl (DI default),
 * a durable file-backed impl, and a Postgres impl over migration 0011 (parameterised SQL only).
 */

export type G07MasterStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
export type SkillSource = "SELF" | "MANAGER" | "ASSESSMENT" | "TRAINING" | "CREDENTIAL";
export type GapAnalysisStatus = "DRAFT" | "FINALIZED" | "SUPERSEDED";
export type GapItemSource = "MODEL" | "APPRAISAL" | "MANDATORY";
export type GapScoringMode = "BINARY" | "WEIGHTED";
export type CampaignStatus = "DRAFT" | "LAUNCHED" | "COMPLETED" | "CANCELLED";
export type CampaignTargetStatus = "PENDING" | "NOMINATED" | "COMPLETED" | "EXEMPTED" | "OVERDUE";

/** §5.2.1 skill_categories taxonomy node. */
export interface SkillCategory {
  id: string;
  tenantId: string;
  entityId?: string;
  code: string;
  name: string;
  parentCategoryId?: string;
  status: G07MasterStatus;
}

/** §5.2.2 skills master row (compliance skills carry a default validity for cert renewal). */
export interface SkillMaster {
  id: string;
  tenantId: string;
  entityId?: string;
  skillCategoryId: string;
  code: string;
  name: string;
  isComplianceSkill: boolean;
  defaultValidityMonths?: number;
  status: G07MasterStatus;
}

/** §5.2.4 competencies master row (composes 0..N skills). */
export interface CompetencyMaster {
  id: string;
  tenantId: string;
  entityId?: string;
  code: string;
  name: string;
  competencyType: "FUNCTIONAL" | "BEHAVIOURAL" | "LEADERSHIP" | "DIGITAL";
  linkedSkillIds: string[];
  status: G07MasterStatus;
}

/** §5.2.6 competency_model_items line: target level per competency inside a model. */
export interface CompetencyModelItem {
  competencyId: string;
  targetProficiencyLevel: number;
  isCritical: boolean;
  sequenceNo: number;
}

/** §5.2.5 role competency model (scope ROLE/DESIGNATION/CADRE/ORG_UNIT/GENERIC; versioned). */
export interface CompetencyModel {
  id: string;
  tenantId: string;
  entityId?: string;
  code: string;
  name: string;
  scopeType: "ROLE" | "DESIGNATION" | "CADRE" | "ORG_UNIT" | "GENERIC";
  scopeRef?: string;
  ownerEmployeeId: string;
  version: number;
  reviewDueDate: string;
  items: CompetencyModelItem[];
  status: G07MasterStatus;
}

/** §5.2.7 employee_skills inventory row — one current row per (employee, skill). */
export interface EmployeeSkill {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  skillId: string;
  currentProficiencyLevel: number;
  source: SkillSource;
  validatedBy?: string;
  validatedAt?: string;
  freshnessStatus: "FRESH" | "STALE";
  status: "DECLARED" | "VALIDATED" | "REJECTED";
}

/** §5.2.10 skill_gap_items line (VAL-G07-GAPSIZE: gap_size = max(0, target - current)). */
export interface SkillGapItem {
  id: string;
  tenantId: string;
  skillGapAnalysisId: string;
  competencyId: string;
  targetProficiencyLevel: number;
  currentProficiencyLevel?: number;
  gapSize: number;
  isCritical: boolean;
  discountedForStaleness: boolean;
  source: GapItemSource;
}

/** §5.2.9 skill_gap_analyses header (DRAFT → FINALIZED → SUPERSEDED). */
export interface SkillGapAnalysis {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  competencyModelId: string;
  scoringMode: GapScoringMode;
  modelStaleFlag: boolean;
  criticalGapCount: number;
  generatedOn: string;
  status: GapAnalysisStatus;
}

/** FR-G07-024 / §10.6 Gap Contract v1 item — the read-only shape G06/G08 consume. */
export interface GapContractItem {
  competencyId: string;
  isCritical: boolean;
  gapSize: number;
  discountedForStaleness: boolean;
}

/** FR-G07-024 versioned, read-only Gap Contract projection for G06/G08. */
export interface GapContract {
  id: string;
  tenantId: string;
  entityId?: string;
  contractVersion: number;
  employeeId: string;
  competencyModelId: string;
  skillGapAnalysisId: string;
  generatedOn: string;
  scoringMode: GapScoringMode;
  modelStaleFlag: boolean;
  items: GapContractItem[];
  status: "CURRENT" | "SUPERSEDED";
}

/** §5.2.29 training_campaigns header (mandatory-compliance campaign engine, FR-G07-017). */
export interface TrainingCampaign {
  id: string;
  tenantId: string;
  entityId?: string;
  code: string;
  name: string;
  programCode: string;
  windowStart: string;
  windowEnd: string;
  autoWave: boolean;
  waveSize?: number;
  status: CampaignStatus;
}

/** §5.2.31 campaign_targets per-employee line with wave + escalation_level. */
export interface CampaignTarget {
  id: string;
  tenantId: string;
  trainingCampaignId: string;
  employeeId: string;
  waveNo?: number;
  dueDate: string;
  targetStatus: CampaignTargetStatus;
  escalationLevel: number;
  trainingNominationId?: string;
}

// ---------------------------------------------------------------------------------------
// PH-16E — FR-G07-018 external credentials + append-only credential_verifications ledger,
// FR-G07-020 training_sponsorships service bonds + training_costs BOND_RECOVERY feed to G10.
// ---------------------------------------------------------------------------------------

/** FR-G07-018 AC.2: each verification step is one APPENDED credential_verifications row. */
export type CredentialVerificationAction = "SUBMITTED" | "EVIDENCE_REVIEWED" | "VERIFIED" | "REJECTED";
export type CredentialVerificationMethod = "ISSUER_PORTAL" | "DOCUMENT_REVIEW" | "REGISTRY_LOOKUP" | "ATTESTATION";
export type ExternalCredentialStatus = "PENDING" | "EVIDENCE_REVIEWED" | "VERIFIED" | "REJECTED";
/** §5.2.35 training_sponsorships.obligation_status frozen value set. */
export type SponsorshipObligationStatus = "PROPOSED" | "SANCTIONED" | "ACTIVE" | "FULFILLED" | "BREACHED" | "RECOVERED" | "WAIVED";
export type SponsorshipType = "SPONSORED_PROGRAM" | "STUDY_LEAVE" | "DEPUTATION";
/** §5.2.24 training_costs.cost_type subset consumed here (BOND_RECOVERY is the G10 payable feed). */
export type TrainingCostType = "SPONSORSHIP" | "BOND_RECOVERY";

/** FR-G07-018: certifications row captured with credential_source=EXTERNAL_PROFESSIONAL. */
export interface ExternalCredential {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  title: string;
  issuingBody: string;
  /** VAL-G07-CREDREF: unique per employee (duplicate is 409). */
  externalReferenceNo: string;
  issueDate: string;
  validUntil?: string;
  credentialSource: "EXTERNAL_PROFESSIONAL";
  verificationStatus: ExternalCredentialStatus;
  /** Self-capture creator — can NEVER be the verifier (FR-G07-018 AC.5 SoD). */
  submittedBy: string;
  verifiedBy?: string;
  evidenceDocumentId?: string;
  significantForSr: boolean;
  srEventId?: string;
}

/** §5.2.36 credential_verifications APPEND-ONLY ledger row (BRD rule 9: no UPDATE/DELETE). */
export interface CredentialVerificationEntry {
  id: string;
  tenantId: string;
  certificationId: string;
  verificationAction: CredentialVerificationAction;
  verificationMethod: CredentialVerificationMethod;
  actorId: string;
  comments?: string;
  recordedAt: string;
}

/** §5.2.35 training_sponsorships — service bond; money in INTEGER PAISE (no floats). */
export interface TrainingSponsorship {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  trainingProgramId?: string;
  externalCourseName?: string;
  sponsorshipType: SponsorshipType;
  sponsoredAmountPaise: number;
  startDate: string;
  endDate?: string;
  serviceBondMonths: number;
  completionDate?: string;
  /** Derived on activation: completion_date + service_bond_months (FR-G07-020 BR). */
  bondEndDate?: string;
  /** bond_recovery_amount — liquidated pro-rata on breach (VAL-G07-BOND), integer paise. */
  bondRecoveryAmountPaise?: number;
  obligationStatus: SponsorshipObligationStatus;
  sanctionedBy?: string;
  waiverReason?: string;
}

/** §5.2.24 training_costs row (BOND_RECOVERY with payable_to_payroll=true is the G10 feed). */
export interface TrainingCostEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  trainingSponsorshipId?: string;
  costType: TrainingCostType;
  amountPaise: number;
  payableToPayroll: boolean;
  recordedAt: string;
}

/**
 * PH-08D depth repository contract consumed by TrainingService — taxonomy, models,
 * inventory, gap analyses, gap contracts and campaigns live behind this seam,
 * never in module-local arrays. PH-16E adds external credentials with the append-only
 * credential_verifications ledger, training_sponsorships and the training_costs feed.
 */
export interface TrainingDepthRepository {
  saveSkillCategory(row: SkillCategory): void;
  findSkillCategory(scope: TenantScope, id: string): SkillCategory | undefined;
  saveSkill(row: SkillMaster): void;
  findSkill(scope: TenantScope, id: string): SkillMaster | undefined;
  saveCompetency(row: CompetencyMaster): void;
  findCompetency(scope: TenantScope, id: string): CompetencyMaster | undefined;
  saveCompetencyModel(row: CompetencyModel): void;
  findCompetencyModel(scope: TenantScope, id: string): CompetencyModel | undefined;
  saveEmployeeSkill(row: EmployeeSkill): void;
  findEmployeeSkill(scope: TenantScope, employeeId: string, skillId: string): EmployeeSkill | undefined;
  listEmployeeSkills(scope: TenantScope, employeeId: string): EmployeeSkill[];
  saveGapAnalysis(row: SkillGapAnalysis): void;
  findGapAnalysis(scope: TenantScope, id: string): SkillGapAnalysis | undefined;
  saveGapItem(row: SkillGapItem): void;
  listGapItems(scope: TenantScope, skillGapAnalysisId: string): SkillGapItem[];
  countGapAnalyses(): number;
  saveGapContract(row: GapContract): void;
  /** FR-G07-024 read path: the CURRENT contract for (employee, model) — returned as a frozen copy. */
  findCurrentGapContract(scope: TenantScope, employeeId: string, competencyModelId: string): GapContract | undefined;
  listGapContracts(scope: TenantScope, employeeId: string): GapContract[];
  nextGapContractVersion(scope: TenantScope, employeeId: string, competencyModelId: string): number;
  saveCampaign(row: TrainingCampaign): void;
  findCampaign(scope: TenantScope, id: string): TrainingCampaign | undefined;
  saveCampaignTarget(row: CampaignTarget): void;
  listCampaignTargets(scope: TenantScope, trainingCampaignId: string): CampaignTarget[];
  // PH-16E FR-G07-018 — external credentials + append-only credential_verifications ledger.
  saveExternalCredential(row: ExternalCredential): void;
  findExternalCredential(scope: TenantScope, id: string): ExternalCredential | undefined;
  /** VAL-G07-CREDREF dedup probe: external_reference_no unique per employee. */
  findCredentialByExternalRef(scope: TenantScope, employeeId: string, externalReferenceNo: string): ExternalCredential | undefined;
  listExternalCredentials(scope: TenantScope, employeeId: string): ExternalCredential[];
  /** APPEND-ONLY (BRD rule 9): the ledger exposes append + list only — no update, no delete. */
  appendCredentialVerification(row: Omit<CredentialVerificationEntry, "id">): CredentialVerificationEntry;
  listCredentialVerifications(scope: TenantScope, certificationId: string): CredentialVerificationEntry[];
  // PH-16E FR-G07-020 — training_sponsorships service bonds + training_costs BOND_RECOVERY feed.
  saveSponsorship(row: TrainingSponsorship): void;
  findSponsorship(scope: TenantScope, id: string): TrainingSponsorship | undefined;
  listSponsorships(scope: TenantScope, employeeId?: string): TrainingSponsorship[];
  appendTrainingCost(row: Omit<TrainingCostEntry, "id">): TrainingCostEntry;
  listTrainingCosts(scope: TenantScope, trainingSponsorshipId: string): TrainingCostEntry[];
  /** VAL-G07-BOND gate probe: does a BOND_RECOVERY cost row exist for this sponsorship? */
  hasBondRecoveryCost(scope: TenantScope, trainingSponsorshipId: string): boolean;
}

/** In-memory implementation (DI default, mirrors InMemoryPromotionDepthRepository). */
export class InMemoryTrainingDepthRepository implements TrainingDepthRepository {
  protected readonly skillCategories: SkillCategory[] = [];
  protected readonly skills: SkillMaster[] = [];
  protected readonly competencies: CompetencyMaster[] = [];
  protected readonly competencyModels: CompetencyModel[] = [];
  protected readonly employeeSkills: EmployeeSkill[] = [];
  protected readonly gapAnalyses: SkillGapAnalysis[] = [];
  protected readonly gapItems: SkillGapItem[] = [];
  protected readonly gapContracts: GapContract[] = [];
  protected readonly campaigns: TrainingCampaign[] = [];
  protected readonly campaignTargets: CampaignTarget[] = [];
  protected readonly externalCredentials: ExternalCredential[] = [];
  /** Append-only ledger (BRD rule 9): rows are pushed and never mutated or removed. */
  protected readonly credentialVerifications: CredentialVerificationEntry[] = [];
  protected readonly sponsorships: TrainingSponsorship[] = [];
  /** Append-only cost feed rows (BOND_RECOVERY → G10 payable). */
  protected readonly trainingCosts: TrainingCostEntry[] = [];

  saveSkillCategory(row: SkillCategory): void {
    this.upsert(this.skillCategories, row);
  }

  findSkillCategory(scope: TenantScope, id: string): SkillCategory | undefined {
    return this.copyOf(this.skillCategories.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveSkill(row: SkillMaster): void {
    this.upsert(this.skills, row);
  }

  findSkill(scope: TenantScope, id: string): SkillMaster | undefined {
    return this.copyOf(this.skills.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveCompetency(row: CompetencyMaster): void {
    this.upsert(this.competencies, row);
  }

  findCompetency(scope: TenantScope, id: string): CompetencyMaster | undefined {
    return this.copyOf(this.competencies.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveCompetencyModel(row: CompetencyModel): void {
    this.upsert(this.competencyModels, { ...row, items: row.items.map((item) => ({ ...item })) });
  }

  findCompetencyModel(scope: TenantScope, id: string): CompetencyModel | undefined {
    const model = this.competencyModels.find((item) => item.id === id && this.inScope(item, scope));
    return model ? { ...model, items: model.items.map((item) => ({ ...item })) } : undefined;
  }

  saveEmployeeSkill(row: EmployeeSkill): void {
    this.upsert(this.employeeSkills, row);
  }

  findEmployeeSkill(scope: TenantScope, employeeId: string, skillId: string): EmployeeSkill | undefined {
    return this.copyOf(
      this.employeeSkills.find((item) => item.employeeId === employeeId && item.skillId === skillId && this.inScope(item, scope))
    );
  }

  listEmployeeSkills(scope: TenantScope, employeeId: string): EmployeeSkill[] {
    return this.employeeSkills.filter((item) => item.employeeId === employeeId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  saveGapAnalysis(row: SkillGapAnalysis): void {
    this.upsert(this.gapAnalyses, row);
  }

  findGapAnalysis(scope: TenantScope, id: string): SkillGapAnalysis | undefined {
    return this.copyOf(this.gapAnalyses.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveGapItem(row: SkillGapItem): void {
    this.upsert(this.gapItems, row);
  }

  listGapItems(scope: TenantScope, skillGapAnalysisId: string): SkillGapItem[] {
    return this.gapItems
      .filter((item) => item.skillGapAnalysisId === skillGapAnalysisId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  countGapAnalyses(): number {
    return this.gapAnalyses.length;
  }

  saveGapContract(row: GapContract): void {
    this.upsert(this.gapContracts, { ...row, items: row.items.map((item) => ({ ...item })) });
  }

  findCurrentGapContract(scope: TenantScope, employeeId: string, competencyModelId: string): GapContract | undefined {
    const contract = this.gapContracts.find(
      (item) =>
        item.employeeId === employeeId &&
        item.competencyModelId === competencyModelId &&
        item.status === "CURRENT" &&
        this.inScope(item, scope)
    );
    return contract ? { ...contract, items: contract.items.map((item) => ({ ...item })) } : undefined;
  }

  listGapContracts(scope: TenantScope, employeeId: string): GapContract[] {
    return this.gapContracts
      .filter((item) => item.employeeId === employeeId && this.inScope(item, scope))
      .map((item) => ({ ...item, items: item.items.map((line) => ({ ...line })) }));
  }

  nextGapContractVersion(scope: TenantScope, employeeId: string, competencyModelId: string): number {
    const versions = this.gapContracts
      .filter((item) => item.employeeId === employeeId && item.competencyModelId === competencyModelId && this.inScope(item, scope))
      .map((item) => item.contractVersion);
    return versions.length === 0 ? 1 : Math.max(...versions) + 1;
  }

  saveCampaign(row: TrainingCampaign): void {
    this.upsert(this.campaigns, row);
  }

  findCampaign(scope: TenantScope, id: string): TrainingCampaign | undefined {
    return this.copyOf(this.campaigns.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveCampaignTarget(row: CampaignTarget): void {
    this.upsert(this.campaignTargets, row);
  }

  listCampaignTargets(scope: TenantScope, trainingCampaignId: string): CampaignTarget[] {
    return this.campaignTargets
      .filter((item) => item.trainingCampaignId === trainingCampaignId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  saveExternalCredential(row: ExternalCredential): void {
    this.upsert(this.externalCredentials, row);
  }

  findExternalCredential(scope: TenantScope, id: string): ExternalCredential | undefined {
    return this.copyOf(this.externalCredentials.find((item) => item.id === id && this.inScope(item, scope)));
  }

  findCredentialByExternalRef(scope: TenantScope, employeeId: string, externalReferenceNo: string): ExternalCredential | undefined {
    // VAL-G07-CREDREF: uniqueness is per (tenant, employee, external_reference_no).
    return this.copyOf(
      this.externalCredentials.find(
        (item) => item.employeeId === employeeId && item.externalReferenceNo === externalReferenceNo && this.inScope(item, scope)
      )
    );
  }

  listExternalCredentials(scope: TenantScope, employeeId: string): ExternalCredential[] {
    return this.externalCredentials.filter((item) => item.employeeId === employeeId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  appendCredentialVerification(row: Omit<CredentialVerificationEntry, "id">): CredentialVerificationEntry {
    // APPEND-ONLY (BRD rule 9): insert only — this repository ships no update/delete for the ledger.
    const entry: CredentialVerificationEntry = { ...row, id: `credential-verification-${this.credentialVerifications.length + 1}` };
    this.credentialVerifications.push({ ...entry });
    this.persist();
    return { ...entry };
  }

  listCredentialVerifications(scope: TenantScope, certificationId: string): CredentialVerificationEntry[] {
    return this.credentialVerifications
      .filter((item) => item.certificationId === certificationId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  saveSponsorship(row: TrainingSponsorship): void {
    this.upsert(this.sponsorships, row);
  }

  findSponsorship(scope: TenantScope, id: string): TrainingSponsorship | undefined {
    return this.copyOf(this.sponsorships.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listSponsorships(scope: TenantScope, employeeId?: string): TrainingSponsorship[] {
    return this.sponsorships
      .filter((item) => this.inScope(item, scope) && (!employeeId || item.employeeId === employeeId))
      .map((item) => ({ ...item }));
  }

  appendTrainingCost(row: Omit<TrainingCostEntry, "id">): TrainingCostEntry {
    const entry: TrainingCostEntry = { ...row, id: `training-cost-${this.trainingCosts.length + 1}` };
    this.trainingCosts.push({ ...entry });
    this.persist();
    return { ...entry };
  }

  listTrainingCosts(scope: TenantScope, trainingSponsorshipId: string): TrainingCostEntry[] {
    return this.trainingCosts
      .filter((item) => item.trainingSponsorshipId === trainingSponsorshipId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  hasBondRecoveryCost(scope: TenantScope, trainingSponsorshipId: string): boolean {
    // VAL-G07-BOND gate: BREACHED -> RECOVERED requires this feed row to exist first.
    return this.trainingCosts.some(
      (item) => item.trainingSponsorshipId === trainingSponsorshipId && item.costType === "BOND_RECOVERY" && item.tenantId === scope.tenantId
    );
  }

  /** Durability hook — no-op in memory; the file-backed subclass writes through. */
  protected persist(): void {
    // In-memory repository keeps state in process only.
  }

  protected loadState(state: Partial<ReturnType<InMemoryTrainingDepthRepository["snapshotState"]>>): void {
    this.skillCategories.push(...(state.skillCategories ?? []));
    this.skills.push(...(state.skills ?? []));
    this.competencies.push(...(state.competencies ?? []));
    this.competencyModels.push(...(state.competencyModels ?? []));
    this.employeeSkills.push(...(state.employeeSkills ?? []));
    this.gapAnalyses.push(...(state.gapAnalyses ?? []));
    this.gapItems.push(...(state.gapItems ?? []));
    this.gapContracts.push(...(state.gapContracts ?? []));
    this.campaigns.push(...(state.campaigns ?? []));
    this.campaignTargets.push(...(state.campaignTargets ?? []));
    this.externalCredentials.push(...(state.externalCredentials ?? []));
    this.credentialVerifications.push(...(state.credentialVerifications ?? []));
    this.sponsorships.push(...(state.sponsorships ?? []));
    this.trainingCosts.push(...(state.trainingCosts ?? []));
  }

  protected snapshotState(): {
    skillCategories: SkillCategory[];
    skills: SkillMaster[];
    competencies: CompetencyMaster[];
    competencyModels: CompetencyModel[];
    employeeSkills: EmployeeSkill[];
    gapAnalyses: SkillGapAnalysis[];
    gapItems: SkillGapItem[];
    gapContracts: GapContract[];
    campaigns: TrainingCampaign[];
    campaignTargets: CampaignTarget[];
    externalCredentials: ExternalCredential[];
    credentialVerifications: CredentialVerificationEntry[];
    sponsorships: TrainingSponsorship[];
    trainingCosts: TrainingCostEntry[];
  } {
    return {
      skillCategories: this.skillCategories,
      skills: this.skills,
      competencies: this.competencies,
      competencyModels: this.competencyModels,
      employeeSkills: this.employeeSkills,
      gapAnalyses: this.gapAnalyses,
      gapItems: this.gapItems,
      gapContracts: this.gapContracts,
      campaigns: this.campaigns,
      campaignTargets: this.campaignTargets,
      externalCredentials: this.externalCredentials,
      credentialVerifications: this.credentialVerifications,
      sponsorships: this.sponsorships,
      trainingCosts: this.trainingCosts,
    };
  }

  private copyOf<T extends object>(row: T | undefined): T | undefined {
    return row ? { ...row } : undefined;
  }

  private upsert<T extends { id: string }>(rows: T[], row: T): void {
    const index = rows.findIndex((item) => item.id === row.id);
    if (index < 0) {
      rows.push({ ...row });
    } else {
      rows[index] = { ...row };
    }
    this.persist();
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }
}

/**
 * Durable file-backed implementation: rehydrates depth-entity state from disk on construction
 * and write-through persists after every mutation with an atomic tmp-file + rename swap.
 */
export class FileBackedTrainingDepthRepository extends InMemoryTrainingDepthRepository {
  constructor(private readonly filePath: string) {
    super();
    this.rehydrate();
  }

  private rehydrate(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    this.loadState(JSON.parse(raw) as Parameters<InMemoryTrainingDepthRepository["loadState"]>[0]);
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.snapshotState()), "utf8");
    renameSync(tmpPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over migration 0011_g07_training_depth.sql (faithful subset
// of docs/data-model/07-G07-training-skill-development.sql §5.2). All SQL is parameterised
// ($1, $2, ...); the gap analysis + its items + the Gap Contract projection commit in ONE
// transaction, as do campaign target waves and the JOB-G07-CERTEXPIRY lapsed_mandatory flip.
// ---------------------------------------------------------------------------------------

const INSERT_GAP_ANALYSIS =
  "INSERT INTO g07_skill_gap_analyses (tenant_id, entity_id, employee_id, competency_model_id, scoring_mode, model_stale_flag, " +
  "critical_gap_count, generated_on, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FINALIZED', $9) RETURNING id";

const INSERT_GAP_ITEM =
  "INSERT INTO g07_skill_gap_items (tenant_id, skill_gap_analysis_id, competency_id, target_proficiency_level, " +
  "current_proficiency_level, gap_size, is_critical, discounted_for_staleness, source, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id";

const SUPERSEDE_GAP_CONTRACTS =
  "UPDATE g07_gap_contracts SET status = 'SUPERSEDED', updated_by = $4, updated_at = now() " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND competency_model_id = $3 AND status = 'CURRENT' AND is_deleted = false";

const INSERT_GAP_CONTRACT =
  "INSERT INTO g07_gap_contracts (tenant_id, entity_id, contract_version, employee_id, competency_model_id, skill_gap_analysis_id, " +
  "generated_on, scoring_mode, model_stale_flag, items, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'CURRENT', $11) RETURNING id, contract_version";

const SELECT_CURRENT_GAP_CONTRACT =
  "SELECT id, contract_version, employee_id, competency_model_id, skill_gap_analysis_id, generated_on, scoring_mode, model_stale_flag, items " +
  "FROM g07_gap_contracts WHERE tenant_id = $1 AND employee_id = $2 AND competency_model_id = $3 AND status = 'CURRENT' AND is_deleted = false";

const SELECT_NEXT_CONTRACT_VERSION =
  "SELECT COALESCE(MAX(contract_version), 0) + 1 AS next_version FROM g07_gap_contracts " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND competency_model_id = $3";

const INSERT_CAMPAIGN =
  "INSERT INTO g07_training_campaigns (tenant_id, entity_id, code, name, program_code, window_start, window_end, auto_wave, wave_size, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'LAUNCHED', $10) RETURNING id";

const INSERT_CAMPAIGN_TARGET =
  "INSERT INTO g07_campaign_targets (tenant_id, training_campaign_id, employee_id, wave_no, due_date, target_status, escalation_level, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6) RETURNING id, wave_no";

const ESCALATE_OVERDUE_TARGETS =
  "UPDATE g07_campaign_targets SET escalation_level = escalation_level + 1, target_status = 'OVERDUE', updated_by = $3, updated_at = now() " +
  "WHERE tenant_id = $1 AND training_campaign_id = $2 AND target_status IN ('PENDING','NOMINATED','OVERDUE') AND due_date < $4 " +
  "RETURNING id, employee_id, escalation_level";

/**
 * JOB-G07-CERTEXPIRY: the lapsed_mandatory flip is derived from valid_until evidence in the
 * WHERE clause — never accepted as caller input — and only for un-renewed mandatory certs.
 */
const FLIP_LAPSED_MANDATORY =
  "UPDATE g07_certifications SET status = 'EXPIRED', lapsed_mandatory = (is_mandatory AND renewed_by_certification_id IS NULL), " +
  "updated_by = $2, updated_at = now() " +
  "WHERE tenant_id = $1 AND status = 'ACTIVE' AND valid_until IS NOT NULL AND valid_until < $3 AND is_deleted = false " +
  "RETURNING id, employee_id, is_mandatory, lapsed_mandatory";

/** Postgres-backed PH-08D G07 depth repository over migration 0011 tables. */
export class PgTrainingDepthRepository {
  constructor(private readonly pool: Pool) {}

  /** Gap analysis header + items + versioned Gap Contract projection in ONE transaction. */
  async insertGapAnalysisWithContract(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    competencyModelId: string;
    scoringMode: GapScoringMode;
    modelStaleFlag: boolean;
    generatedOn: string;
    items: Array<{
      competencyId: string;
      targetProficiencyLevel: number;
      currentProficiencyLevel?: number;
      gapSize: number;
      isCritical: boolean;
      discountedForStaleness: boolean;
      source: GapItemSource;
    }>;
    createdBy?: string;
  }): Promise<{ analysisId: string; contractId: string; contractVersion: number }> {
    if (input.items.some((item) => item.gapSize < 0)) {
      throw new FoundationError("VALIDATION_FAILED", "VAL-G07-GAPSIZE: gap_size must be >= 0", { field: "gapSize" });
    }
    return withTransaction(this.pool, async (client) => {
      const criticalGapCount = input.items.filter((item) => item.isCritical && item.gapSize > 0).length;
      const analysis = await client.query(INSERT_GAP_ANALYSIS, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.competencyModelId,
        input.scoringMode,
        input.modelStaleFlag,
        criticalGapCount,
        input.generatedOn,
        input.createdBy ?? null,
      ]);
      const analysisId = (analysis.rows[0] as { id: string }).id;
      for (const item of input.items) {
        await client.query(INSERT_GAP_ITEM, [
          input.tenantId,
          analysisId,
          item.competencyId,
          item.targetProficiencyLevel,
          item.currentProficiencyLevel ?? null,
          item.gapSize,
          item.isCritical,
          item.discountedForStaleness,
          item.source,
          input.createdBy ?? null,
        ]);
      }
      await client.query(SUPERSEDE_GAP_CONTRACTS, [input.tenantId, input.employeeId, input.competencyModelId, input.createdBy ?? null]);
      const versionRow = await client.query(SELECT_NEXT_CONTRACT_VERSION, [input.tenantId, input.employeeId, input.competencyModelId]);
      const contractVersion = Number((versionRow.rows[0] as { next_version: string | number }).next_version);
      const contractItems = input.items
        .filter((item) => item.gapSize > 0)
        .map((item) => ({
          competencyId: item.competencyId,
          isCritical: item.isCritical,
          gapSize: item.gapSize,
          discountedForStaleness: item.discountedForStaleness,
        }));
      const contract = await client.query(INSERT_GAP_CONTRACT, [
        input.tenantId,
        input.entityId ?? null,
        contractVersion,
        input.employeeId,
        input.competencyModelId,
        analysisId,
        input.generatedOn,
        input.scoringMode,
        input.modelStaleFlag,
        JSON.stringify(contractItems),
        input.createdBy ?? null,
      ]);
      return { analysisId, contractId: (contract.rows[0] as { id: string }).id, contractVersion };
    });
  }

  async findCurrentGapContract(tenantId: string, employeeId: string, competencyModelId: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(SELECT_CURRENT_GAP_CONTRACT, [tenantId, employeeId, competencyModelId]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  /** Campaign header + wave-assigned targets commit in ONE transaction — no half-launched campaign. */
  async insertCampaignWithTargets(input: {
    tenantId: string;
    entityId?: string;
    code: string;
    name: string;
    programCode: string;
    windowStart: string;
    windowEnd: string;
    autoWave: boolean;
    waveSize?: number;
    targets: Array<{ employeeId: string; waveNo: number; dueDate: string }>;
    createdBy?: string;
  }): Promise<{ campaignId: string; targetIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const campaign = await client.query(INSERT_CAMPAIGN, [
        input.tenantId,
        input.entityId ?? null,
        input.code,
        input.name,
        input.programCode,
        input.windowStart,
        input.windowEnd,
        input.autoWave,
        input.waveSize ?? null,
        input.createdBy ?? null,
      ]);
      const campaignId = (campaign.rows[0] as { id: string }).id;
      const targetIds: string[] = [];
      for (const target of input.targets) {
        const inserted = await client.query(INSERT_CAMPAIGN_TARGET, [
          input.tenantId,
          campaignId,
          target.employeeId,
          target.waveNo,
          target.dueDate,
          input.createdBy ?? null,
        ]);
        targetIds.push((inserted.rows[0] as { id: string }).id);
      }
      return { campaignId, targetIds };
    });
  }

  async escalateOverdueTargets(input: { tenantId: string; trainingCampaignId: string; asOf: string; updatedBy?: string }): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(ESCALATE_OVERDUE_TARGETS, [input.tenantId, input.trainingCampaignId, input.updatedBy ?? null, input.asOf]);
    return result.rows as Array<Record<string, unknown>>;
  }

  /** JOB-G07-CERTEXPIRY: expire past-validity certs and flip lapsed_mandatory from valid_until evidence. */
  async runCertExpiry(input: { tenantId: string; asOf: string; updatedBy?: string }): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(FLIP_LAPSED_MANDATORY, [input.tenantId, input.updatedBy ?? null, input.asOf]);
    return result.rows as Array<Record<string, unknown>>;
  }

  /**
   * FR-G07-018 (PH-16E): external credential capture in ONE transaction — the VAL-G07-CREDREF
   * dedup re-check (unique external_reference_no per employee, row-locked) plus the certification
   * insert plus the SUBMITTED credential_verifications append commit or roll back together.
   */
  async insertExternalCredentialWithSubmission(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    title: string;
    issuingBody: string;
    externalReferenceNo: string;
    issueDate: string;
    validUntil?: string;
    submittedBy: string;
    evidenceDocumentId?: string;
    createdBy?: string;
  }): Promise<{ certificationId: string; verificationId: string }> {
    return withTransaction(this.pool, async (client) => {
      const duplicate = await client.query(SELECT_CREDENTIAL_BY_EXTERNAL_REF, [input.tenantId, input.employeeId, input.externalReferenceNo]);
      if (duplicate.rows[0]) {
        throw new FoundationError("VAL-G07-CREDREF", "Duplicate external credential reference for this employee", {
          field: "externalReferenceNo",
          details: { employeeId: input.employeeId, externalReferenceNo: input.externalReferenceNo },
        });
      }
      const certification = await client.query(INSERT_EXTERNAL_CREDENTIAL, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.title,
        input.issuingBody,
        input.externalReferenceNo,
        input.issueDate,
        input.validUntil ?? null,
        input.submittedBy,
        input.evidenceDocumentId ?? null,
        input.createdBy ?? null,
      ]);
      const certificationId = (certification.rows[0] as { id: string }).id;
      const verification = await client.query(APPEND_CREDENTIAL_VERIFICATION, [
        input.tenantId,
        certificationId,
        "SUBMITTED",
        "DOCUMENT_REVIEW",
        input.submittedBy,
        null,
        input.createdBy ?? null,
      ]);
      return { certificationId, verificationId: (verification.rows[0] as { id: string }).id };
    });
  }

  /**
   * FR-G07-018 AC.2/AC.5: one verification step = one APPENDED credential_verifications row plus
   * the verification_status move on the certification, in ONE transaction. The verifier != submitter
   * SoD denial uses the platform FORBIDDEN code (the BRD registers no G07-specific code here).
   */
  async appendCredentialVerificationStep(input: {
    tenantId: string;
    certificationId: string;
    verificationAction: "EVIDENCE_REVIEWED" | "VERIFIED" | "REJECTED";
    verificationMethod: string;
    actorId: string;
    comments?: string;
    createdBy?: string;
  }): Promise<{ verificationId: string }> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_EXTERNAL_CREDENTIAL, [input.tenantId, input.certificationId]);
      const row = locked.rows[0] as { id: string; submitted_by: string } | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "External credential not found");
      }
      if (row.submitted_by === input.actorId) {
        throw new FoundationError("FORBIDDEN", "Self-capture creator cannot verify their own credential (SoD)", {
          details: { certificationId: input.certificationId },
        });
      }
      const verification = await client.query(APPEND_CREDENTIAL_VERIFICATION, [
        input.tenantId,
        input.certificationId,
        input.verificationAction,
        input.verificationMethod,
        input.actorId,
        input.comments ?? null,
        input.createdBy ?? null,
      ]);
      await client.query(SET_CREDENTIAL_VERIFICATION_STATUS, [
        input.tenantId,
        input.certificationId,
        input.verificationAction,
        input.verificationAction === "VERIFIED" ? input.actorId : null,
      ]);
      return { verificationId: (verification.rows[0] as { id: string }).id };
    });
  }

  /**
   * FR-G07-020 AC.4: breach in ONE transaction — row-lock the ACTIVE bond, set BREACHED and
   * persist the pro-rata bond_recovery_amount (integer paise, computed by the service).
   */
  async markSponsorshipBreached(input: {
    tenantId: string;
    sponsorshipId: string;
    bondRecoveryAmountPaise: number;
    updatedBy?: string;
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_SPONSORSHIP, [input.tenantId, input.sponsorshipId]);
      const row = locked.rows[0] as { id: string; obligation_status: string } | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "Training sponsorship not found");
      }
      if (row.obligation_status !== "ACTIVE") {
        throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE bond can be marked BREACHED", {
          details: { obligationStatus: row.obligation_status },
        });
      }
      await client.query(SET_SPONSORSHIP_BREACHED, [input.tenantId, input.sponsorshipId, input.bondRecoveryAmountPaise, input.updatedBy ?? null]);
    });
  }

  /** The BOND_RECOVERY cost row feeding G10 (payable_to_payroll=true), integer paise. */
  async insertBondRecoveryCost(input: {
    tenantId: string;
    entityId?: string;
    trainingSponsorshipId: string;
    amountPaise: number;
    createdBy?: string;
  }): Promise<{ costId: string }> {
    const result = await this.pool.query(INSERT_BOND_RECOVERY_COST, [
      input.tenantId,
      input.entityId ?? null,
      input.trainingSponsorshipId,
      input.amountPaise,
      input.createdBy ?? null,
    ]);
    return { costId: (result.rows[0] as { id: string }).id };
  }

  /**
   * VAL-G07-BOND (fail closed, ONE transaction): BREACHED -> RECOVERED is rejected unless a
   * BOND_RECOVERY training_costs row (the G10 feed) already exists for the bond.
   */
  async markSponsorshipRecoveredWithGuard(input: { tenantId: string; sponsorshipId: string; updatedBy?: string }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_SPONSORSHIP, [input.tenantId, input.sponsorshipId]);
      const row = locked.rows[0] as { id: string; obligation_status: string } | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "Training sponsorship not found");
      }
      if (row.obligation_status !== "BREACHED") {
        throw new FoundationError("PRECONDITION_FAILED", "Only a BREACHED bond can move to RECOVERED", {
          details: { obligationStatus: row.obligation_status },
        });
      }
      const feed = await client.query(SELECT_BOND_RECOVERY_COST_EXISTS, [input.tenantId, input.sponsorshipId]);
      if (!feed.rows[0]) {
        throw new FoundationError("VAL-G07-BOND", "BREACHED bond must emit a BOND_RECOVERY cost (G10 feed) before RECOVERED", {
          details: { sponsorshipId: input.sponsorshipId },
        });
      }
      await client.query(SET_SPONSORSHIP_STATUS, [input.tenantId, input.sponsorshipId, "RECOVERED", input.updatedBy ?? null]);
    });
  }
}

// PH-16E parameterised SQL over migration 0032 tables (g07_certifications extension,
// g07_credential_verifications append-only ledger, g07_training_sponsorships, g07_training_costs).

const SELECT_CREDENTIAL_BY_EXTERNAL_REF =
  "SELECT id FROM g07_certifications WHERE tenant_id = $1 AND employee_id = $2 AND external_reference_no = $3 AND is_deleted = false FOR UPDATE";

const INSERT_EXTERNAL_CREDENTIAL =
  "INSERT INTO g07_certifications (tenant_id, entity_id, employee_id, credential_source, title, issuing_body, external_reference_no, issue_date, valid_until, verification_status, submitted_by, evidence_document_id, created_by) " +
  "VALUES ($1, $2, $3, 'EXTERNAL_PROFESSIONAL', $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11) RETURNING id";

const LOCK_EXTERNAL_CREDENTIAL =
  "SELECT id, submitted_by FROM g07_certifications WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const APPEND_CREDENTIAL_VERIFICATION =
  // APPEND-ONLY (BRD rule 9): credential_verifications has INSERT + SELECT only — no UPDATE, no DELETE.
  "INSERT INTO g07_credential_verifications (tenant_id, certification_id, verification_action, verification_method, actor_id, comments, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";

const SET_CREDENTIAL_VERIFICATION_STATUS =
  "UPDATE g07_certifications SET verification_status = $3, verified_by = COALESCE($4, verified_by), updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const LOCK_SPONSORSHIP =
  "SELECT id, obligation_status FROM g07_training_sponsorships WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const SET_SPONSORSHIP_BREACHED =
  // bond_recovery_amount_paise carries the pro-rata liquidated amount (VAL-G07-BOND, integer paise).
  "UPDATE g07_training_sponsorships SET obligation_status = 'BREACHED', bond_recovery_amount_paise = $3, updated_by = $4, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const SET_SPONSORSHIP_STATUS =
  "UPDATE g07_training_sponsorships SET obligation_status = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const INSERT_BOND_RECOVERY_COST =
  "INSERT INTO g07_training_costs (tenant_id, entity_id, training_sponsorship_id, cost_type, amount_paise, payable_to_payroll, created_by) " +
  "VALUES ($1, $2, $3, 'BOND_RECOVERY', $4, true, $5) RETURNING id";

const SELECT_BOND_RECOVERY_COST_EXISTS =
  "SELECT id FROM g07_training_costs WHERE tenant_id = $1 AND training_sponsorship_id = $2 AND cost_type = 'BOND_RECOVERY' AND is_deleted = false LIMIT 1";
