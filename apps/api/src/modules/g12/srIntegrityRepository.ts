import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope, inScope } from "../../platform/types";

/**
 * PH-10B G12 integrity-pillar persistence (BRD G12 v2; docs/data-model/
 * 12-G12-digital-service-register.sql; migration 0019_g12_integrity_pillars.sql):
 *   E20 sr_anchors             — append-only external Merkle-root anchors (FR-04)
 *   E21 sr_expected_event_rule — completeness expected-event model (FR-17)
 *   E22 sr_gap_register        — detected gaps + corroboration lifecycle (FR-17)
 *   E11 sr_attestations        — append-only custodian/employee attestations (FR-07)
 *   E14 sr_certified_extracts  — certified true copies with purpose redaction (FR-10)
 * Entity state routes through this repository; the service owns no bare arrays.
 */

export type SrSeverity = "INFO" | "WARN" | "CRITICAL";
export type SrRuleStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
/** Frozen g12_gap_status lifecycle — rows move forward through it, never get deleted. */
export type SrGapStatus = "GAP_FLAGGED" | "UNDER_REVIEW" | "EXPLAINED" | "CLOSED_RECORDED" | "CLOSED_FALSE_POSITIVE";
export type SrAttestationSubject = "EVENT" | "VERIFICATION_CYCLE" | "EXTRACT";
export type SrAttestationKind = "CUSTODIAN_ATTEST" | "EMPLOYEE_VERIFY" | "EMPLOYEE_DISPUTE" | "EXTRACT_SIGN" | "HEIR_VERIFY" | "ASSISTED_VERIFY";
export type SrSignatureMethod = "PKI_QUALIFIED" | "OTP_CONFIRMED" | "SERVER_SIGNED";
export type SrExtractScope = "FULL_SR" | "DATE_RANGE" | "EVENT_CATEGORY" | "SINGLE_EVENT";
export type SrRedactionPolicy = "NONE" | "LOAN_EXCLUDE_DISCIPLINARY" | "PUBLIC_MINIMAL" | "PENSION_FULL" | "COURT_FULL";

/** E20 sr_anchors — append-only; chained per tenant via prev_anchor_hash. */
export interface SrAnchor {
  id: string;
  tenantId: string;
  entityId?: string;
  anchorSeq: number;
  periodFrom: string;
  periodTo: string;
  /** Real Merkle root over per-employee {content head, status head} leaves. */
  merkleRoot: string;
  leafCount: number;
  /** SHA-256 of the ordered leaf list (reconstruction aid). */
  headSnapshotDigest: string;
  /** RFC 3161 token over merkle_root, produced behind the TimestampAuthority seam. */
  tsaTimestampToken: string;
  tsaAuthority: string;
  /** Independent WORM export (G13 document); optional until the WORM writer lands. */
  wormDocumentId?: string;
  prevAnchorHash: string;
  anchorHash: string;
  createdAt: string;
}

/** E21 sr_expected_event_rule — expected events per cadre/service rule (FR-17). */
export interface SrExpectedEventRule {
  id: string;
  tenantId: string;
  entityId?: string;
  ruleCode: string;
  appliesToCadre?: string[];
  /** Event type code the rule expects to see recorded in each cadence period. */
  expectedEventCategory: string;
  /** Recurrence spec (jsonb in the DDL); descriptive at this substrate depth. */
  cadence: Record<string, unknown>;
  /** Event type codes that legitimately explain the absence (e.g. INCREMENT_WITHHELD). */
  suppressedByCategories: string[];
  sourceRuleRef?: string;
  severity: SrSeverity;
  status: SrRuleStatus;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** E22 sr_gap_register — GAP_FLAGGED findings + corroboration lifecycle (FR-17). */
export interface SrGapRegisterEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  ruleId: string;
  expectedPeriodFrom: string;
  expectedPeriodTo: string;
  expectedEventCategory: string;
  gapStatus: SrGapStatus;
  explanationCode?: string;
  resolvedEventId?: string;
  corroboratedBy?: string;
  severity: SrSeverity;
  detectedAt: string;
  closedAt?: string;
}

/** E11 sr_attestations — append-only qualified-signature attestation rows (FR-07). */
export interface SrAttestation {
  id: string;
  tenantId: string;
  entityId?: string;
  subjectType: SrAttestationSubject;
  subjectId: string;
  employeeId: string;
  attestationKind: SrAttestationKind;
  attestedBy: string;
  attestedRole: string;
  signatureMethod: SrSignatureMethod;
  certificateSerial?: string;
  tsaTimestampToken?: string;
  tsaAuthority?: string;
  /** SHA-256 of the attested content snapshot (the chain head / event hash attested). */
  signedDigest: string;
  attestedAt: string;
}

/** One redacted, rendered ledger line inside a certified extract snapshot. */
export interface SrExtractRenderedEvent {
  sequenceNo: number;
  eventTypeCode: string;
  eventDate: string;
  entryHash: string;
  status: string;
  payload: Record<string, unknown>;
}

/** E14 sr_certified_extracts — issued certified copies; revocation-only mutation. */
export interface SrCertifiedExtract {
  id: string;
  tenantId: string;
  entityId?: string;
  extractNo: string;
  employeeId: string;
  scope: SrExtractScope;
  scopeParams?: Record<string, unknown>;
  eventCount: number;
  /** SHA-256 of the rendered ordered content — binds the redacted copy. */
  contentDigest: string;
  redactionPolicy: SrRedactionPolicy;
  /** Event categories excluded by the purpose policy (FR-10). */
  redactedCategories: string[];
  /** Payload fields masked by the P02 field grants (fail-closed). */
  redactedFields: string[];
  /** Entry-chain head hash the extract certifies (offline verification pin). */
  chainHeadHash: string;
  statusChainHeadHash: string;
  anchorId?: string;
  qrVerificationToken: string;
  issuedTo: string;
  purpose?: string;
  revoked: boolean;
  issuedAt: string;
  /** Snapshot of the redacted rendering that content_digest binds. */
  renderedEvents: SrExtractRenderedEvent[];
}

export interface SrIntegrityRepository {
  appendAnchor(anchor: SrAnchor): void;
  latestAnchor(scope: TenantScope): SrAnchor | undefined;
  listAnchors(scope: TenantScope): SrAnchor[];
  countAnchors(): number;

  saveExpectedEventRule(rule: SrExpectedEventRule): void;
  listExpectedEventRules(scope: TenantScope): SrExpectedEventRule[];
  countExpectedEventRules(): number;

  appendGap(gap: SrGapRegisterEntry): void;
  updateGap(gap: SrGapRegisterEntry): void;
  findGap(scope: TenantScope, gapId: string): SrGapRegisterEntry | undefined;
  listGaps(scope: TenantScope, employeeId?: string): SrGapRegisterEntry[];
  countGaps(): number;

  appendAttestation(attestation: SrAttestation): void;
  listAttestations(scope: TenantScope, employeeId: string): SrAttestation[];
  findAttestation(scope: TenantScope, attestationId: string): SrAttestation | undefined;
  countAttestations(): number;

  appendExtract(extract: SrCertifiedExtract): void;
  findExtract(scope: TenantScope, extractId: string): SrCertifiedExtract | undefined;
  listExtracts(scope: TenantScope, employeeId: string): SrCertifiedExtract[];
  countExtracts(): number;
}

export class InMemorySrIntegrityRepository implements SrIntegrityRepository {
  private readonly anchors: SrAnchor[] = [];
  private readonly rules: SrExpectedEventRule[] = [];
  private readonly gaps: SrGapRegisterEntry[] = [];
  private readonly attestations: SrAttestation[] = [];
  private readonly extracts: SrCertifiedExtract[] = [];

  appendAnchor(anchor: SrAnchor): void {
    this.anchors.push(Object.freeze({ ...anchor }));
  }

  latestAnchor(scope: TenantScope): SrAnchor | undefined {
    const rows = this.listAnchors(scope);
    return rows[rows.length - 1];
  }

  listAnchors(scope: TenantScope): SrAnchor[] {
    return this.anchors.filter((row) => row.tenantId === scope.tenantId).sort((left, right) => left.anchorSeq - right.anchorSeq).map((row) => ({ ...row }));
  }

  countAnchors(): number {
    return this.anchors.length;
  }

  saveExpectedEventRule(rule: SrExpectedEventRule): void {
    this.rules.push({ ...rule, suppressedByCategories: [...rule.suppressedByCategories] });
  }

  listExpectedEventRules(scope: TenantScope): SrExpectedEventRule[] {
    return this.rules.filter((rule) => inScope(rule, scope)).map((rule) => ({ ...rule, suppressedByCategories: [...rule.suppressedByCategories] }));
  }

  countExpectedEventRules(): number {
    return this.rules.length;
  }

  appendGap(gap: SrGapRegisterEntry): void {
    this.gaps.push({ ...gap });
  }

  updateGap(gap: SrGapRegisterEntry): void {
    const index = this.gaps.findIndex((row) => row.tenantId === gap.tenantId && row.id === gap.id);
    if (index >= 0) {
      this.gaps[index] = { ...gap };
    }
  }

  findGap(scope: TenantScope, gapId: string): SrGapRegisterEntry | undefined {
    const gap = this.gaps.find((row) => inScope(row, scope) && row.id === gapId);
    return gap ? { ...gap } : undefined;
  }

  listGaps(scope: TenantScope, employeeId?: string): SrGapRegisterEntry[] {
    return this.gaps.filter((row) => inScope(row, scope) && (!employeeId || row.employeeId === employeeId)).map((row) => ({ ...row }));
  }

  countGaps(): number {
    return this.gaps.length;
  }

  appendAttestation(attestation: SrAttestation): void {
    this.attestations.push(Object.freeze({ ...attestation }));
  }

  listAttestations(scope: TenantScope, employeeId: string): SrAttestation[] {
    return this.attestations.filter((row) => inScope(row, scope) && row.employeeId === employeeId).map((row) => ({ ...row }));
  }

  findAttestation(scope: TenantScope, attestationId: string): SrAttestation | undefined {
    const row = this.attestations.find((attestation) => inScope(attestation, scope) && attestation.id === attestationId);
    return row ? { ...row } : undefined;
  }

  countAttestations(): number {
    return this.attestations.length;
  }

  appendExtract(extract: SrCertifiedExtract): void {
    this.extracts.push({ ...extract, renderedEvents: extract.renderedEvents.map((event) => ({ ...event, payload: { ...event.payload } })) });
  }

  findExtract(scope: TenantScope, extractId: string): SrCertifiedExtract | undefined {
    const extract = this.extracts.find((row) => inScope(row, scope) && row.id === extractId);
    return extract ? { ...extract, renderedEvents: extract.renderedEvents.map((event) => ({ ...event, payload: { ...event.payload } })) } : undefined;
  }

  listExtracts(scope: TenantScope, employeeId: string): SrCertifiedExtract[] {
    return this.extracts.filter((row) => inScope(row, scope) && row.employeeId === employeeId).map((row) => ({ ...row }));
  }

  countExtracts(): number {
    return this.extracts.length;
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G12 integrity tables (docs/data-model/
// 12-G12-digital-service-register.sql), migrated by apps/api/db/migrations/
// 0019_g12_integrity_pillars.sql. All SQL is parameterised ($1, $2, ...); multi-step
// writes (anchor append with sequence allocation, gap-scan batch append) run in a single
// transaction.
// ---------------------------------------------------------------------------------------

const SELECT_LATEST_ANCHOR =
  "SELECT id, anchor_seq, merkle_root, anchor_hash FROM sr_anchors WHERE tenant_id = $1 ORDER BY anchor_seq DESC LIMIT 1";

const INSERT_ANCHOR =
  "INSERT INTO sr_anchors (tenant_id, entity_id, anchor_seq, period_from, period_to, merkle_root, leaf_count, head_snapshot_digest, tsa_timestamp_token, tsa_authority, worm_document_id, prev_anchor_hash, anchor_hash, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, tenant_id, anchor_seq, merkle_root, anchor_hash";

const INSERT_EXPECTED_EVENT_RULE =
  "INSERT INTO sr_expected_event_rule (tenant_id, entity_id, rule_code, applies_to_cadre, expected_event_category, cadence, suppressed_by_categories, source_rule_ref, severity, status, effective_from, effective_to) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id";

const INSERT_GAP =
  "INSERT INTO sr_gap_register (tenant_id, entity_id, employee_id, rule_id, expected_period_from, expected_period_to, expected_event_category, gap_status, severity) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id";

const UPDATE_GAP_STATUS =
  "UPDATE sr_gap_register SET gap_status = $3, explanation_code = $4, resolved_event_id = $5, corroborated_by = $6, closed_at = $7, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING id";

const INSERT_ATTESTATION =
  "INSERT INTO sr_attestations (tenant_id, entity_id, subject_type, subject_id, employee_id, attestation_kind, attested_by, attested_role, signature_method, certificate_serial, tsa_timestamp_token, tsa_authority, signed_digest) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id";

const INSERT_EXTRACT =
  "INSERT INTO sr_certified_extracts (tenant_id, entity_id, extract_no, employee_id, scope, scope_params, event_count, content_digest, redaction_policy, redacted_categories, redacted_fields, chain_head_hash, status_chain_head_hash, anchor_id, qr_verification_token, issued_to, purpose) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id";

/**
 * Postgres-backed integrity repository (the persistence seam mirrored by the in-memory
 * implementation the executed suite drives). Anchors allocate their monotonic sequence
 * inside the same transaction as the insert so concurrent anchor jobs cannot fork the
 * anchor chain.
 */
export class PgSrIntegrityRepository {
  constructor(private readonly pool: Pool) {}

  async appendAnchor(anchor: Omit<SrAnchor, "id" | "anchorSeq" | "createdAt"> & { createdBy?: string }): Promise<{ id: string; anchorSeq: number }> {
    return withTransaction(this.pool, async (client) => {
      const latest = await client.query(SELECT_LATEST_ANCHOR, [anchor.tenantId]);
      const anchorSeq = ((latest.rows[0]?.anchor_seq as number | undefined) ?? 0) + 1;
      const inserted = await client.query(INSERT_ANCHOR, [
        anchor.tenantId,
        anchor.entityId ?? null,
        anchorSeq,
        anchor.periodFrom,
        anchor.periodTo,
        anchor.merkleRoot,
        anchor.leafCount,
        anchor.headSnapshotDigest,
        anchor.tsaTimestampToken,
        anchor.tsaAuthority,
        anchor.wormDocumentId ?? null,
        anchor.prevAnchorHash,
        anchor.anchorHash,
        anchor.createdBy ?? null,
      ]);
      return { id: inserted.rows[0].id as string, anchorSeq };
    });
  }

  async insertExpectedEventRule(rule: Omit<SrExpectedEventRule, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_EXPECTED_EVENT_RULE, [
      rule.tenantId,
      rule.entityId ?? null,
      rule.ruleCode,
      rule.appliesToCadre ?? null,
      rule.expectedEventCategory,
      JSON.stringify(rule.cadence),
      rule.suppressedByCategories,
      rule.sourceRuleRef ?? null,
      rule.severity,
      rule.status,
      rule.effectiveFrom,
      rule.effectiveTo ?? null,
    ]);
    return result.rows[0].id as string;
  }

  /** Append one scan's GAP_FLAGGED findings atomically (all-or-nothing per run). */
  async insertGaps(gaps: Array<Omit<SrGapRegisterEntry, "id" | "detectedAt">>): Promise<string[]> {
    return withTransaction(this.pool, async (client) => {
      const ids: string[] = [];
      for (const gap of gaps) {
        const result = await client.query(INSERT_GAP, [
          gap.tenantId,
          gap.entityId ?? null,
          gap.employeeId,
          gap.ruleId,
          gap.expectedPeriodFrom,
          gap.expectedPeriodTo,
          gap.expectedEventCategory,
          gap.gapStatus,
          gap.severity,
        ]);
        ids.push(result.rows[0].id as string);
      }
      return ids;
    });
  }

  async updateGapStatus(gap: Pick<SrGapRegisterEntry, "tenantId" | "id" | "gapStatus" | "explanationCode" | "resolvedEventId" | "corroboratedBy" | "closedAt">): Promise<void> {
    await this.pool.query(UPDATE_GAP_STATUS, [
      gap.tenantId,
      gap.id,
      gap.gapStatus,
      gap.explanationCode ?? null,
      gap.resolvedEventId ?? null,
      gap.corroboratedBy ?? null,
      gap.closedAt ?? null,
    ]);
  }

  async insertAttestation(attestation: Omit<SrAttestation, "id" | "attestedAt">): Promise<string> {
    const result = await this.pool.query(INSERT_ATTESTATION, [
      attestation.tenantId,
      attestation.entityId ?? null,
      attestation.subjectType,
      attestation.subjectId,
      attestation.employeeId,
      attestation.attestationKind,
      attestation.attestedBy,
      attestation.attestedRole,
      attestation.signatureMethod,
      attestation.certificateSerial ?? null,
      attestation.tsaTimestampToken ?? null,
      attestation.tsaAuthority ?? null,
      attestation.signedDigest,
    ]);
    return result.rows[0].id as string;
  }

  async insertExtract(extract: Omit<SrCertifiedExtract, "id" | "issuedAt" | "revoked" | "renderedEvents">): Promise<string> {
    const result = await this.pool.query(INSERT_EXTRACT, [
      extract.tenantId,
      extract.entityId ?? null,
      extract.extractNo,
      extract.employeeId,
      extract.scope,
      extract.scopeParams ? JSON.stringify(extract.scopeParams) : null,
      extract.eventCount,
      extract.contentDigest,
      extract.redactionPolicy,
      extract.redactedCategories,
      extract.redactedFields,
      extract.chainHeadHash,
      extract.statusChainHeadHash,
      extract.anchorId ?? null,
      extract.qrVerificationToken,
      extract.issuedTo,
      extract.purpose ?? null,
    ]);
    return result.rows[0].id as string;
  }
}
