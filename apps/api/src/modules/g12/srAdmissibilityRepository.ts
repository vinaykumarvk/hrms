import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope, inScope } from "../../platform/types";
import type { SrAnchor } from "./srIntegrityRepository";

/**
 * PH-15D G12 admissibility + longevity persistence (BRD G12 v2; docs/data-model/
 * 12-G12-digital-service-register.sql; migration 0025_g12_admissibility_longevity.sql):
 *   E24 sr_authenticity_certificates — append-only §65B / Bharatiya Sakshya Adhiniyam
 *       certificate-of-authenticity per certified extract (FR-18)
 *   E16 sr_subscriptions             — pull-feed subscriptions + per-subscriber durable
 *       cursor last_delivered_seq (FR-13; PULL_FEED only at launch)
 *   E25 sr_ltv_renewals              — append-only PAdES-LTV / RFC 4998 evidence-record
 *       renewals and crypto-migration re-anchors (FR-19; never rewrites stored hashes)
 * Entity state routes through this repository; the service owns no bare arrays.
 */

export type SrLtvSubject = "EXTRACT" | "ATTESTATION" | "ANCHOR";
export type SrLtvRenewalKind = "LTV_INITIAL" | "ARCHIVE_TIMESTAMP" | "ALGORITHM_MIGRATION" | "RE_ANCHOR";
export type SrLtvTrigger = "SCHEDULE" | "CERT_EXPIRY" | "ALGO_DEPRECATION" | "MANUAL";
export type SrSubscriptionMode = "PULL_FEED" | "WEBHOOK" | "MESSAGE_BUS";
export type SrSubscriptionStatus = "ACTIVE" | "PAUSED" | "RETIRED";

/**
 * BR-18.2 structured chain-of-custody block — ASSEMBLED FROM STORED ledger/provenance/
 * attestation data by the service; never accepted from the caller.
 */
export interface SrChainOfCustody {
  /** One row per ledger entry the extract drew on: ingestion provenance from stored content. */
  ingestionProvenance: Array<{
    srEventId: string;
    sequenceNo: number;
    sourceModule: string;
    sourceReferenceId: string;
    sourceEventVersion: number;
    recordedAt: string;
    entryHash: string;
  }>;
  /** Supersession/annotation history from the sr_status_events sub-ledger. */
  supersessionHistory: Array<{
    targetEventId: string;
    transitionKind: string;
    fromValue: string | null;
    toValue: string;
    recordedAt: string;
  }>;
  /** Custodian/employee attestation lineage over the chain (E11). */
  attestationLineage: Array<{
    attestationId: string;
    attestationKind: string;
    signatureMethod: string;
    attestedBy: string;
    attestedRole: string;
    attestedAt: string;
    signedDigest: string;
  }>;
  /** Statutory statement of the producing system (§65B(2) / BSA s.63 system description). */
  systemIdentity: string;
  issuingOperator: string;
}

/** E24 sr_authenticity_certificates — append-only §65B/BSA certificate rows (FR-18). */
export interface SrAuthenticityCertificate {
  id: string;
  tenantId: string;
  entityId?: string;
  extractId: string;
  certificateNo: string;
  /** Statutory citation, e.g. "IT Act 2000 s.65B / Bharatiya Sakshya Adhiniyam 2023 s.63". */
  statuteReference: string;
  /** Matches the extract's content_digest exactly (FR-18 AC4; mismatch blocks issuance). */
  contentDigest: string;
  /** Covering anchor at issue — proves the record's tamper-evident state (FR-18 AC5). */
  anchorId: string;
  /** True when the extract predates its covering anchor and the most recent anchor is cited with a noted lag. */
  anchorLagNoted: boolean;
  /** Qualified signer (custodian) identity from the EXTRACT_SIGN attestation. */
  signerIdentity: string;
  signingCertificateSerial: string;
  tsaTimestampToken: string;
  tsaAuthority: string;
  chainOfCustody: SrChainOfCustody;
  systemDescription: string;
  /** Signed certificate PDF in G13; optional until the DocumentGen writer lands. */
  documentId?: string;
  issuedAt: string;
}

/** E16 sr_subscriptions — pull-feed registration + durable cursor (FR-13). */
export interface SrSubscription {
  id: string;
  tenantId: string;
  entityId?: string;
  subscriberModule: string;
  /** Subscribed event categories; "ALL" receives every event. */
  eventCategories: string[];
  deliveryMode: SrSubscriptionMode;
  /** Env-reference to an HMAC secret — never the secret value (BR-13.1). */
  secretRef?: string;
  /** Per-subscriber durable cursor for at-least-once pull delivery. */
  lastDeliveredSeq: number;
  status: SrSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

/** E25 sr_ltv_renewals — append-only renewal/re-anchor evidence rows (FR-19). */
export interface SrLtvRenewal {
  id: string;
  tenantId: string;
  entityId?: string;
  subjectType: SrLtvSubject;
  subjectId: string;
  renewalKind: SrLtvRenewalKind;
  priorAlgorithm?: string;
  newAlgorithm?: string;
  /** RFC 4998 evidence-record / archive-timestamp reference. */
  evidenceRecordRef: string;
  tsaTimestampToken: string;
  tsaAuthority: string;
  /** Anchor re-issued over EXISTING chain heads on RE_ANCHOR/ALGORITHM_MIGRATION. */
  newAnchorId?: string;
  triggeredBy: SrLtvTrigger;
  renewedAt: string;
}

export interface SrAdmissibilityRepository {
  appendCertificate(certificate: SrAuthenticityCertificate): void;
  findCertificate(scope: TenantScope, certificateId: string): SrAuthenticityCertificate | undefined;
  listCertificates(scope: TenantScope, extractId?: string): SrAuthenticityCertificate[];
  countCertificates(): number;

  saveSubscription(subscription: SrSubscription): void;
  updateSubscription(subscription: SrSubscription): void;
  findSubscription(scope: TenantScope, subscriptionId: string): SrSubscription | undefined;
  findSubscriptionByModule(scope: TenantScope, subscriberModule: string): SrSubscription | undefined;
  listSubscriptions(scope: TenantScope): SrSubscription[];
  countSubscriptions(): number;

  appendLtvRenewal(renewal: SrLtvRenewal): void;
  listLtvRenewals(scope: TenantScope, subjectId?: string): SrLtvRenewal[];
  countLtvRenewals(): number;
}

export class InMemorySrAdmissibilityRepository implements SrAdmissibilityRepository {
  private readonly certificates: SrAuthenticityCertificate[] = [];
  private readonly subscriptions: SrSubscription[] = [];
  private readonly renewals: SrLtvRenewal[] = [];

  appendCertificate(certificate: SrAuthenticityCertificate): void {
    // Append-only (E24): certificates are frozen at issue; there is no update path.
    this.certificates.push(Object.freeze({ ...certificate }));
  }

  findCertificate(scope: TenantScope, certificateId: string): SrAuthenticityCertificate | undefined {
    const row = this.certificates.find((certificate) => inScope(certificate, scope) && certificate.id === certificateId);
    return row ? { ...row } : undefined;
  }

  listCertificates(scope: TenantScope, extractId?: string): SrAuthenticityCertificate[] {
    return this.certificates.filter((row) => inScope(row, scope) && (!extractId || row.extractId === extractId)).map((row) => ({ ...row }));
  }

  countCertificates(): number {
    return this.certificates.length;
  }

  saveSubscription(subscription: SrSubscription): void {
    this.subscriptions.push({ ...subscription, eventCategories: [...subscription.eventCategories] });
  }

  updateSubscription(subscription: SrSubscription): void {
    const index = this.subscriptions.findIndex((row) => row.tenantId === subscription.tenantId && row.id === subscription.id);
    if (index >= 0) {
      this.subscriptions[index] = { ...subscription, eventCategories: [...subscription.eventCategories] };
    }
  }

  findSubscription(scope: TenantScope, subscriptionId: string): SrSubscription | undefined {
    // Tenant scoping here IS the isolation boundary: a subscriber can never resolve
    // (and therefore never read the cursor of) another tenant's subscription.
    const row = this.subscriptions.find((subscription) => inScope(subscription, scope) && subscription.id === subscriptionId);
    return row ? { ...row, eventCategories: [...row.eventCategories] } : undefined;
  }

  findSubscriptionByModule(scope: TenantScope, subscriberModule: string): SrSubscription | undefined {
    const row = this.subscriptions.find((subscription) => inScope(subscription, scope) && subscription.subscriberModule === subscriberModule);
    return row ? { ...row, eventCategories: [...row.eventCategories] } : undefined;
  }

  listSubscriptions(scope: TenantScope): SrSubscription[] {
    return this.subscriptions.filter((row) => inScope(row, scope)).map((row) => ({ ...row, eventCategories: [...row.eventCategories] }));
  }

  countSubscriptions(): number {
    return this.subscriptions.length;
  }

  appendLtvRenewal(renewal: SrLtvRenewal): void {
    // Append-only (E25): renewals are additive evidence; there is no update/delete path.
    this.renewals.push(Object.freeze({ ...renewal }));
  }

  listLtvRenewals(scope: TenantScope, subjectId?: string): SrLtvRenewal[] {
    return this.renewals.filter((row) => inScope(row, scope) && (!subjectId || row.subjectId === subjectId)).map((row) => ({ ...row }));
  }

  countLtvRenewals(): number {
    return this.renewals.length;
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G12 admissibility tables (docs/data-model/
// 12-G12-digital-service-register.sql), migrated by apps/api/db/migrations/
// 0025_g12_admissibility_longevity.sql. All SQL is parameterised ($1, $2, ...);
// multi-step writes (renewal + re-anchor, cursor advance after a feed read) run in a
// single transaction.
// ---------------------------------------------------------------------------------------

const INSERT_CERTIFICATE =
  "INSERT INTO sr_authenticity_certificates (tenant_id, entity_id, extract_id, certificate_no, statute_reference, content_digest, anchor_id, anchor_lag_noted, signer_identity, signing_certificate_serial, tsa_timestamp_token, tsa_authority, chain_of_custody, system_description, document_id, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id";

const INSERT_SUBSCRIPTION =
  "INSERT INTO sr_subscriptions (tenant_id, entity_id, subscriber_module, event_categories, delivery_mode, secret_ref, last_delivered_seq, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id";

const SELECT_SUBSCRIPTION_CURSOR =
  "SELECT id, last_delivered_seq, status FROM sr_subscriptions WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const UPDATE_SUBSCRIPTION_CURSOR =
  "UPDATE sr_subscriptions SET last_delivered_seq = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND id = $2 RETURNING id";

const UPDATE_SUBSCRIPTION_STATUS =
  "UPDATE sr_subscriptions SET status = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND id = $2 RETURNING id";

const SELECT_LATEST_ANCHOR_SEQ =
  "SELECT anchor_seq, anchor_hash FROM sr_anchors WHERE tenant_id = $1 ORDER BY anchor_seq DESC LIMIT 1";

const INSERT_RENEWAL_ANCHOR =
  "INSERT INTO sr_anchors (tenant_id, entity_id, anchor_seq, period_from, period_to, merkle_root, leaf_count, head_snapshot_digest, tsa_timestamp_token, tsa_authority, prev_anchor_hash, anchor_hash, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id";

const INSERT_LTV_RENEWAL =
  "INSERT INTO sr_ltv_renewals (tenant_id, entity_id, subject_type, subject_id, renewal_kind, prior_algorithm, new_algorithm, evidence_record_ref, tsa_timestamp_token, tsa_authority, new_anchor_id, triggered_by, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id";

/**
 * Postgres-backed admissibility repository (the persistence seam mirrored by the
 * in-memory implementation the executed suite drives). A crypto-migration renewal
 * inserts its new anchor (over EXISTING chain heads — historical rows are never
 * touched: E20/E25 are INSERT-only, there is no UPDATE statement for either) and the
 * sr_ltv_renewals row in ONE transaction so the renewal can never cite an anchor that
 * was not committed with it.
 */
export class PgSrAdmissibilityRepository {
  constructor(private readonly pool: Pool) {}

  async insertCertificate(certificate: Omit<SrAuthenticityCertificate, "id" | "issuedAt"> & { createdBy?: string }): Promise<string> {
    const result = await this.pool.query(INSERT_CERTIFICATE, [
      certificate.tenantId,
      certificate.entityId ?? null,
      certificate.extractId,
      certificate.certificateNo,
      certificate.statuteReference,
      certificate.contentDigest,
      certificate.anchorId,
      certificate.anchorLagNoted,
      certificate.signerIdentity,
      certificate.signingCertificateSerial,
      certificate.tsaTimestampToken,
      certificate.tsaAuthority,
      JSON.stringify(certificate.chainOfCustody),
      certificate.systemDescription,
      certificate.documentId ?? null,
      certificate.createdBy ?? null,
    ]);
    return result.rows[0].id as string;
  }

  async insertSubscription(subscription: Omit<SrSubscription, "id" | "createdAt" | "updatedAt"> & { createdBy?: string }): Promise<string> {
    const result = await this.pool.query(INSERT_SUBSCRIPTION, [
      subscription.tenantId,
      subscription.entityId ?? null,
      subscription.subscriberModule,
      subscription.eventCategories,
      subscription.deliveryMode,
      subscription.secretRef ?? null,
      subscription.lastDeliveredSeq,
      subscription.status,
      subscription.createdBy ?? null,
    ]);
    return result.rows[0].id as string;
  }

  /** Advance one subscriber's durable cursor atomically (row-locked read + write). */
  async advanceSubscriptionCursor(scope: { tenantId: string; actorUserId?: string }, subscriptionId: string, lastDeliveredSeq: number): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const current = await client.query(SELECT_SUBSCRIPTION_CURSOR, [scope.tenantId, subscriptionId]);
      const existing = (current.rows[0]?.last_delivered_seq as number | null) ?? 0;
      if (lastDeliveredSeq > existing) {
        await client.query(UPDATE_SUBSCRIPTION_CURSOR, [scope.tenantId, subscriptionId, lastDeliveredSeq, scope.actorUserId ?? null]);
      }
    });
  }

  async updateSubscriptionStatus(scope: { tenantId: string; actorUserId?: string }, subscriptionId: string, status: SrSubscriptionStatus): Promise<void> {
    await this.pool.query(UPDATE_SUBSCRIPTION_STATUS, [scope.tenantId, subscriptionId, status, scope.actorUserId ?? null]);
  }

  /**
   * Record one LTV renewal; on RE_ANCHOR/ALGORITHM_MIGRATION the new anchor row (over
   * existing chain heads) commits in the SAME transaction as the renewal row.
   */
  async insertLtvRenewalWithAnchor(
    renewal: Omit<SrLtvRenewal, "id" | "renewedAt" | "newAnchorId"> & { createdBy?: string },
    newAnchor?: Omit<SrAnchor, "id" | "anchorSeq" | "createdAt"> & { createdBy?: string }
  ): Promise<{ renewalId: string; newAnchorId?: string }> {
    return withTransaction(this.pool, async (client) => {
      let newAnchorId: string | undefined;
      if (newAnchor) {
        const latest = await client.query(SELECT_LATEST_ANCHOR_SEQ, [newAnchor.tenantId]);
        const anchorSeq = ((latest.rows[0]?.anchor_seq as number | undefined) ?? 0) + 1;
        const inserted = await client.query(INSERT_RENEWAL_ANCHOR, [
          newAnchor.tenantId,
          newAnchor.entityId ?? null,
          anchorSeq,
          newAnchor.periodFrom,
          newAnchor.periodTo,
          newAnchor.merkleRoot,
          newAnchor.leafCount,
          newAnchor.headSnapshotDigest,
          newAnchor.tsaTimestampToken,
          newAnchor.tsaAuthority,
          newAnchor.prevAnchorHash,
          newAnchor.anchorHash,
          newAnchor.createdBy ?? null,
        ]);
        newAnchorId = inserted.rows[0].id as string;
      }
      const result = await client.query(INSERT_LTV_RENEWAL, [
        renewal.tenantId,
        renewal.entityId ?? null,
        renewal.subjectType,
        renewal.subjectId,
        renewal.renewalKind,
        renewal.priorAlgorithm ?? null,
        renewal.newAlgorithm ?? null,
        renewal.evidenceRecordRef,
        renewal.tsaTimestampToken,
        renewal.tsaAuthority,
        newAnchorId ?? null,
        renewal.triggeredBy,
        renewal.createdBy ?? null,
      ]);
      return { renewalId: result.rows[0].id as string, newAnchorId };
    });
  }
}
