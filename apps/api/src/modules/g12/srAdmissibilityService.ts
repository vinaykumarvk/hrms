import { AuditService } from "../../platform/audit/auditService";
import { FoundationError, TenantScope, nextId, requireTenantScope, sha256Hex, stableStringify } from "../../platform/types";
import {
  SrAdmissibilityRepository,
  SrAuthenticityCertificate,
  SrChainOfCustody,
  SrLtvRenewal,
  SrLtvRenewalKind,
  SrLtvSubject,
  SrLtvTrigger,
  SrSubscription,
  SrSubscriptionMode,
} from "./srAdmissibilityRepository";
import { SrIntegrityService, StubTimestampAuthority, TimestampAuthority } from "./srIntegrityService";
import { ServiceRegisterService } from "./serviceRegisterService";

/** BRD G12 §5.5: statutory citation recorded on every §65B/BSA certificate (E24). */
export const STATUTE_REFERENCE_65B_BSA = "IT Act 2000 s.65B / Bharatiya Sakshya Adhiniyam 2023 s.63";

/**
 * FR-18 AC2: statutory statement of the producing system, generated — never free-typed —
 * for the certificate's system_description block.
 */
export const SR_SYSTEM_DESCRIPTION =
  "gov-HRMS G12 Digital Service Register: append-only SHA-256 hash-chained ledger with " +
  "Merkle-root anchoring (sr_anchors) and RFC 3161 trusted timestamps; entries are produced " +
  "in the ordinary course of operations by authorised source modules over authenticated APIs.";

/** LTV renewal kinds that MUST re-anchor over existing chain heads (FR-19 AC3). */
const RE_ANCHORING_RENEWAL_KINDS: SrLtvRenewalKind[] = ["RE_ANCHOR", "ALGORITHM_MIGRATION"];

const VALID_RENEWAL_KINDS: SrLtvRenewalKind[] = ["LTV_INITIAL", "ARCHIVE_TIMESTAMP", "ALGORITHM_MIGRATION", "RE_ANCHOR"];
const VALID_LTV_SUBJECTS: SrLtvSubject[] = ["EXTRACT", "ATTESTATION", "ANCHOR"];
const VALID_LTV_TRIGGERS: SrLtvTrigger[] = ["SCHEDULE", "CERT_EXPIRY", "ALGO_DEPRECATION", "MANUAL"];

export interface SrSubscriptionInput {
  subscriberModule: string;
  eventCategories: string[];
  deliveryMode?: SrSubscriptionMode;
  secretRef?: string;
}

/** Minimised pull-feed item (FR-13 AC4): identifiers + content reference, never the full payload. */
export interface SrFeedItem {
  feedSeq: number;
  srEventId: string;
  eventCategory: string;
  employeeId: string;
  /** Content reference for the authorised follow-up read — the entry hash, not the payload. */
  contentRef: string;
  /** Set on corrigendum/reversal re-emits so consumers re-read the superseded fact (FR-13 AC5). */
  supersedesEventId?: string;
}

export interface SrFeedPage {
  subscriptionId: string;
  subscriberModule: string;
  sinceSeq: number;
  lastDeliveredSeq: number;
  items: SrFeedItem[];
}

export interface SrLtvRenewalInput {
  subjectType: SrLtvSubject;
  subjectId: string;
  renewalKind: SrLtvRenewalKind;
  priorAlgorithm?: string;
  newAlgorithm?: string;
  triggeredBy?: SrLtvTrigger;
}

/**
 * PH-15D G12 admissibility + longevity pillars on the PH-10B integrity substrate
 * (BRD G12 FR-18/13/19): §65B/BSA authenticity certificates over the VERIFIED chain
 * (E24, GENERATE_65B access-logged, fail-closed on tamper/digest mismatch), the single
 * authenticated pull feed with per-subscriber durable cursors (E16 sr_subscriptions,
 * since_seq/last_delivered_seq, WEBHOOK/MESSAGE_BUS -> SR_DELIVERY_MODE_DEFERRED), and
 * PAdES-LTV / RFC 4998 evidence-record renewals (E25 sr_ltv_renewals) that re-anchor
 * over existing heads without ever recomputing or overwriting a stored hash.
 */
export class SrAdmissibilityService {
  constructor(
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly srIntegrity: SrIntegrityService,
    private readonly repository: SrAdmissibilityRepository,
    private readonly tsa: TimestampAuthority = new StubTimestampAuthority()
  ) {}

  // -------------------------------------------------------------------------------------
  // FR-18: E24 sr_authenticity_certificates — §65B/BSA certificate over the verified chain.
  // -------------------------------------------------------------------------------------

  /**
   * Issue a §65B / Bharatiya Sakshya Adhiniyam certificate for a certified extract.
   * The signature deliberately accepts NO custody narrative: the chain-of-custody block
   * is generated from stored ledger/provenance/attestation data (BR-18.2).
   *
   * Fail-closed gates, in order:
   *   1. BR-18.1 — only a qualified-signed (EXTRACT_SIGN + PKI_QUALIFIED) statutory
   *      extract qualifies; otherwise SR_SIGNATURE_NOT_QUALIFIED.
   *   2. FR-18 AC4 — the certificate digest must match the extract's content_digest,
   *      recomputed from the stored rendered snapshot; otherwise SR_CERT_DIGEST_MISMATCH.
   *   3. FR-18 tamper gate — the underlying chain is VERIFIED FIRST (same FR-04 recompute
   *      path as the integrity endpoint); a tampered chain refuses issuance with
   *      SR_CERT_CHAIN_TAMPERED.
   *   4. FR-18 AC5 — a covering anchor must exist; otherwise SR_ANCHOR_NOT_AVAILABLE.
   */
  issueAuthenticityCertificate(scope: TenantScope, extractId: string): SrAuthenticityCertificate {
    requireTenantScope(scope);
    const extract = this.srIntegrity.getExtract(scope, extractId);
    if (!extract) {
      throw new FoundationError("NOT_FOUND", "Certified extract not found");
    }
    if (extract.revoked) {
      throw new FoundationError("CONFLICT", "A revoked extract cannot receive a certificate", {
        details: { messageId: "SR_EXTRACT_REVOKED", extractId },
      });
    }
    const attestations = this.srIntegrity.listAttestations(scope, extract.employeeId);
    // BR-18.1: statutory extracts only — a qualified EXTRACT_SIGN attestation binding this
    // extract; a PROVISIONAL/server-signed copy never qualifies (SERVER_SIGNED is already
    // banned for statutory attestation kinds upstream).
    const qualifiedSignature = attestations.find(
      (attestation) =>
        attestation.attestationKind === "EXTRACT_SIGN" &&
        attestation.signatureMethod === "PKI_QUALIFIED" &&
        attestation.subjectType === "EXTRACT" &&
        attestation.subjectId === extract.id &&
        Boolean(attestation.certificateSerial)
    );
    if (!qualifiedSignature) {
      throw new FoundationError("VALIDATION_FAILED", "A §65B certificate is only issued for a qualified-signed statutory extract", {
        details: { messageId: "SR_SIGNATURE_NOT_QUALIFIED", extractId },
      });
    }
    // FR-18 AC4: recompute the extract digest from the STORED rendered snapshot; a
    // certificate whose digest would not match the extract is refused fail-closed.
    const recomputedDigest = sha256Hex(stableStringify(extract.renderedEvents));
    if (recomputedDigest !== extract.contentDigest) {
      throw new FoundationError("CONFLICT", "Certificate digest does not match the extract content_digest", {
        details: { messageId: "SR_CERT_DIGEST_MISMATCH", extractId, expected: extract.contentDigest, recomputed: recomputedDigest },
      });
    }
    // Tamper gate: run the FR-04 verify path FIRST — every entry and status hash is
    // recomputed from stored content; a tampered chain refuses issuance.
    const verification = this.srIntegrity.verifyEmployee(scope, extract.employeeId);
    if (verification.result === "FAIL") {
      throw new FoundationError("CONFLICT", "Underlying service register chain failed verification; issuance refused", {
        details: { messageId: "SR_CERT_CHAIN_TAMPERED", extractId, firstFailure: verification.firstFailure },
      });
    }
    // FR-18 AC5: cite the anchor covering the chain head at issue. If the extract was
    // issued before any anchor covered it, the most recent covering anchor is used with a
    // noted lag (BRD FR-18 edge case); no anchor at all refuses issuance.
    const anchors = this.srIntegrity.listAnchors(scope);
    const pinnedAnchor = extract.anchorId ? anchors.find((anchor) => anchor.id === extract.anchorId) : undefined;
    const coveringAnchor = pinnedAnchor ?? anchors[anchors.length - 1];
    if (!coveringAnchor) {
      throw new FoundationError("CONFLICT", "No anchor covers this extract yet; wait for the next anchor run", {
        details: { messageId: "SR_ANCHOR_NOT_AVAILABLE", extractId },
      });
    }
    const chainOfCustody = this.buildChainOfCustody(scope, extract.employeeId);
    const certificateNo = `SR-65B-${String(this.repository.countCertificates() + 1).padStart(6, "0")}`;
    const tsaResult = this.tsa.timestamp(extract.contentDigest);
    const certificate: SrAuthenticityCertificate = {
      id: nextId("sr-65b", this.repository.countCertificates()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      extractId: extract.id,
      certificateNo,
      statuteReference: STATUTE_REFERENCE_65B_BSA,
      contentDigest: extract.contentDigest,
      anchorId: coveringAnchor.id,
      anchorLagNoted: !pinnedAnchor,
      signerIdentity: `${qualifiedSignature.attestedBy} (${qualifiedSignature.attestedRole})`,
      signingCertificateSerial: qualifiedSignature.certificateSerial as string,
      tsaTimestampToken: tsaResult.token,
      tsaAuthority: tsaResult.authority,
      chainOfCustody,
      systemDescription: SR_SYSTEM_DESCRIPTION,
      issuedAt: new Date().toISOString(),
    };
    this.repository.appendCertificate(certificate);
    // FR-18 AC3: issuance is access-logged as GENERATE_65B (g12_access_action).
    this.audit.recordMutation(scope, {
      action: "GENERATE_65B",
      subjectRef: `sr_authenticity_certificates:${certificate.id}`,
      metadata: { extractId: extract.id, certificateNo, anchorId: coveringAnchor.id, statuteReference: certificate.statuteReference },
    });
    return certificate;
  }

  getCertificate(scope: TenantScope, certificateId: string): SrAuthenticityCertificate | undefined {
    requireTenantScope(scope);
    return this.repository.findCertificate(scope, certificateId);
  }

  /** BR-18.2: custody assembled from STORED ingestion/attestation/supersession data only. */
  private buildChainOfCustody(scope: TenantScope, employeeId: string): SrChainOfCustody {
    const entryChain = this.serviceRegister.getEntryChain(scope, employeeId);
    const statusChain = this.serviceRegister.getStatusChain(scope, employeeId);
    const attestations = this.srIntegrity.listAttestations(scope, employeeId);
    return {
      ingestionProvenance: entryChain.map((event) => ({
        srEventId: event.id,
        sequenceNo: event.sequenceNo,
        sourceModule: event.sourceModule,
        sourceReferenceId: event.sourceReferenceId,
        sourceEventVersion: event.sourceEventVersion,
        recordedAt: event.recordedAt,
        entryHash: event.entryHash,
      })),
      supersessionHistory: statusChain
        .filter((row) => row.transitionKind === "SUPERSESSION" || row.toValue !== "ACTIVE")
        .map((row) => ({
          targetEventId: row.targetEventId,
          transitionKind: row.transitionKind,
          fromValue: row.fromValue,
          toValue: row.toValue,
          recordedAt: row.recordedAt,
        })),
      attestationLineage: attestations.map((attestation) => ({
        attestationId: attestation.id,
        attestationKind: attestation.attestationKind,
        signatureMethod: attestation.signatureMethod,
        attestedBy: attestation.attestedBy,
        attestedRole: attestation.attestedRole,
        attestedAt: attestation.attestedAt,
        signedDigest: attestation.signedDigest,
      })),
      systemIdentity: SR_SYSTEM_DESCRIPTION,
      issuingOperator: scope.actorUserId ?? "system",
    };
  }

  // -------------------------------------------------------------------------------------
  // FR-13: E16 sr_subscriptions + the single authenticated pull feed.
  // -------------------------------------------------------------------------------------

  /**
   * Register a pull-feed subscription. Only PULL_FEED is enabled at launch (BR-13.4);
   * WEBHOOK/MESSAGE_BUS registration is rejected with SR_DELIVERY_MODE_DEFERRED until a
   * documented real-time requirement enables it. The subscription starts PAUSED and
   * receives nothing until custodian activation (FR-13 AC1, BR-13.2).
   */
  registerSubscription(scope: TenantScope, input: SrSubscriptionInput): SrSubscription {
    requireTenantScope(scope);
    if (!input.subscriberModule) {
      throw new FoundationError("VALIDATION_FAILED", "subscriberModule is required", { field: "subscriberModule" });
    }
    if (!input.eventCategories || input.eventCategories.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one event category is required", { field: "eventCategories" });
    }
    const deliveryMode = input.deliveryMode ?? "PULL_FEED";
    if (deliveryMode !== "PULL_FEED") {
      // BRD FR-13 AC6 (v2): WEBHOOK/MESSAGE_BUS are deferred behind a documented
      // real-time requirement; registration fails closed with the registered code.
      throw new FoundationError("VALIDATION_FAILED", "Only PULL_FEED delivery is enabled at launch", {
        field: "deliveryMode",
        details: { messageId: "SR_DELIVERY_MODE_DEFERRED", requestedMode: deliveryMode },
      });
    }
    if (this.repository.findSubscriptionByModule(scope, input.subscriberModule)) {
      throw new FoundationError("CONFLICT", "Subscriber module already has a subscription", {
        details: { subscriberModule: input.subscriberModule },
      });
    }
    const now = new Date().toISOString();
    const subscription: SrSubscription = {
      id: nextId("sr-sub", this.repository.countSubscriptions()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      subscriberModule: input.subscriberModule,
      eventCategories: [...input.eventCategories],
      deliveryMode,
      secretRef: input.secretRef,
      lastDeliveredSeq: 0,
      status: "PAUSED",
      createdAt: now,
      updatedAt: now,
    };
    this.repository.saveSubscription(subscription);
    this.audit.recordMutation(scope, {
      action: "G12_SUBSCRIPTION_REGISTER",
      subjectRef: `sr_subscriptions:${subscription.id}`,
      metadata: { subscriberModule: subscription.subscriberModule, deliveryMode, eventCategories: subscription.eventCategories },
    });
    return subscription;
  }

  /** Custodian activation (FR-13 AC1): PAUSED -> ACTIVE; a resumed subscriber replays from its cursor. */
  activateSubscription(scope: TenantScope, subscriptionId: string): SrSubscription {
    requireTenantScope(scope);
    const subscription = this.requireSubscription(scope, subscriptionId);
    if (subscription.status === "RETIRED") {
      throw new FoundationError("CONFLICT", "A retired subscription cannot be activated", {
        details: { messageId: "SR_SUBSCRIPTION_RETIRED", subscriptionId },
      });
    }
    const updated: SrSubscription = { ...subscription, status: "ACTIVE", updatedAt: new Date().toISOString() };
    this.repository.updateSubscription(updated);
    this.audit.recordMutation(scope, {
      action: "G12_SUBSCRIPTION_ACTIVATE",
      subjectRef: `sr_subscriptions:${subscription.id}`,
      metadata: { subscriberModule: subscription.subscriberModule },
    });
    return updated;
  }

  listSubscriptions(scope: TenantScope): SrSubscription[] {
    requireTenantScope(scope);
    return this.repository.listSubscriptions(scope);
  }

  /**
   * Authenticated pull feed (`GET /api/v1/sr/feed?since_seq=`). Scoping is per subscriber:
   * the subscription resolves inside the caller's tenant scope only (no cross-tenant
   * read), events are filtered to the subscription's registered event_categories, cursor
   * state lives on the subscription row (last_delivered_seq), and payloads are minimised
   * to identifiers + a content reference (FR-13 AC3/AC4). An explicit since_seq replays
   * from that point; otherwise delivery resumes after the durable cursor.
   */
  pullFeed(scope: TenantScope, subscriptionId: string, sinceSeq?: number): SrFeedPage {
    requireTenantScope(scope);
    const subscription = this.requireSubscription(scope, subscriptionId);
    if (subscription.status !== "ACTIVE") {
      // BR-13.2: PAUSED/RETIRED subscriptions receive nothing.
      throw new FoundationError("CONFLICT", "Subscription is not active", {
        details: { messageId: "SR_SUBSCRIPTION_NOT_ACTIVE", subscriptionId, status: subscription.status },
      });
    }
    if (sinceSeq !== undefined && (!Number.isInteger(sinceSeq) || sinceSeq < 0)) {
      throw new FoundationError("VALIDATION_FAILED", "since_seq must be a non-negative integer", { field: "since_seq" });
    }
    const effectiveSince = sinceSeq ?? subscription.lastDeliveredSeq;
    const receivesAll = subscription.eventCategories.includes("ALL");
    const items: SrFeedItem[] = this.serviceRegister
      .listFeedEvents(scope)
      .filter((entry) => entry.feedSeq > effectiveSince)
      .filter((entry) => receivesAll || subscription.eventCategories.includes(entry.event.eventTypeCode))
      .map((entry) => ({
        feedSeq: entry.feedSeq,
        srEventId: entry.event.id,
        eventCategory: entry.event.eventTypeCode,
        employeeId: entry.event.employeeId,
        contentRef: entry.event.entryHash,
        supersedesEventId:
          entry.event.reversalOfEventId ??
          (typeof entry.event.payload.originalEventId === "string" ? entry.event.payload.originalEventId : undefined),
      }));
    const highestDelivered = items.reduce((max, item) => Math.max(max, item.feedSeq), effectiveSince);
    const lastDeliveredSeq = Math.max(subscription.lastDeliveredSeq, highestDelivered);
    if (lastDeliveredSeq !== subscription.lastDeliveredSeq) {
      this.repository.updateSubscription({ ...subscription, lastDeliveredSeq, updatedAt: new Date().toISOString() });
    }
    return {
      subscriptionId: subscription.id,
      subscriberModule: subscription.subscriberModule,
      sinceSeq: effectiveSince,
      lastDeliveredSeq,
      items,
    };
  }

  private requireSubscription(scope: TenantScope, subscriptionId: string): SrSubscription {
    // Tenant-scoped lookup: another tenant's subscription id resolves to NOT_FOUND, so a
    // subscriber can never read another tenant's cursor or events through this path.
    const subscription = this.repository.findSubscription(scope, subscriptionId);
    if (!subscription) {
      throw new FoundationError("NOT_FOUND", "Subscription not found");
    }
    return subscription;
  }

  // -------------------------------------------------------------------------------------
  // FR-19: E25 sr_ltv_renewals — additive longevity evidence over existing anchors.
  // -------------------------------------------------------------------------------------

  /**
   * Record an LTV / evidence-record renewal (BR-19.1: renewal never alters original
   * signed bytes — it adds evidence layers). RE_ANCHOR and ALGORITHM_MIGRATION renewals
   * issue a NEW anchor over the EXISTING per-employee chain heads via the standard anchor
   * job; no historical entry_hash is ever recomputed or overwritten — old rows keep
   * verifying under their stored hash while the new anchor binds them forward (FR-19 AC3).
   */
  recordLtvRenewal(scope: TenantScope, runKey: string, input: SrLtvRenewalInput): SrLtvRenewal {
    requireTenantScope(scope);
    if (!VALID_LTV_SUBJECTS.includes(input.subjectType)) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported LTV subject type", { field: "subjectType" });
    }
    if (!VALID_RENEWAL_KINDS.includes(input.renewalKind)) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported LTV renewal kind", { field: "renewalKind" });
    }
    const triggeredBy = input.triggeredBy ?? "MANUAL";
    if (!VALID_LTV_TRIGGERS.includes(triggeredBy)) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported LTV trigger", { field: "triggeredBy" });
    }
    if (input.renewalKind === "ALGORITHM_MIGRATION" && (!input.priorAlgorithm || !input.newAlgorithm)) {
      throw new FoundationError("VALIDATION_FAILED", "ALGORITHM_MIGRATION requires priorAlgorithm and newAlgorithm", {
        field: "newAlgorithm",
      });
    }
    const subjectDigest = this.requireSubjectDigest(scope, input.subjectType, input.subjectId);
    // RE_ANCHOR / ALGORITHM_MIGRATION: a new anchor over the EXISTING chain heads. The
    // anchor job reads current heads and appends a new sr_anchors row — it has no code
    // path that rewrites a stored entry_hash or an earlier anchor.
    let newAnchorId: string | undefined;
    if (RE_ANCHORING_RENEWAL_KINDS.includes(input.renewalKind)) {
      newAnchorId = this.srIntegrity.runAnchorJob(scope, runKey).anchor.id;
    }
    const tsaResult = this.tsa.timestamp(subjectDigest);
    const renewedAt = new Date().toISOString();
    const renewal: SrLtvRenewal = {
      id: nextId("sr-ltv", this.repository.countLtvRenewals()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      renewalKind: input.renewalKind,
      priorAlgorithm: input.priorAlgorithm,
      newAlgorithm: input.newAlgorithm,
      // RFC 4998 evidence-record reference, derived from the renewed evidence itself.
      evidenceRecordRef: `ERS-${sha256Hex(`${input.subjectType}:${input.subjectId}:${input.renewalKind}:${tsaResult.token}`).slice(0, 32)}`,
      tsaTimestampToken: tsaResult.token,
      tsaAuthority: tsaResult.authority,
      newAnchorId,
      triggeredBy,
      renewedAt,
    };
    this.repository.appendLtvRenewal(renewal);
    this.audit.recordMutation(scope, {
      action: "G12_LTV_RENEWAL_APPEND",
      subjectRef: `sr_ltv_renewals:${renewal.id}`,
      metadata: { subjectType: renewal.subjectType, subjectId: renewal.subjectId, renewalKind: renewal.renewalKind, newAnchorId },
    });
    return renewal;
  }

  listLtvRenewals(scope: TenantScope, subjectId?: string): SrLtvRenewal[] {
    requireTenantScope(scope);
    return this.repository.listLtvRenewals(scope, subjectId);
  }

  /** Resolve the digest the fresh archive timestamp binds; the subject must exist (no fabricated evidence). */
  private requireSubjectDigest(scope: TenantScope, subjectType: SrLtvSubject, subjectId: string): string {
    if (subjectType === "EXTRACT") {
      const extract = this.srIntegrity.getExtract(scope, subjectId);
      if (!extract) {
        throw new FoundationError("NOT_FOUND", "LTV subject extract not found");
      }
      return extract.contentDigest;
    }
    if (subjectType === "ANCHOR") {
      const anchor = this.srIntegrity.listAnchors(scope).find((row) => row.id === subjectId);
      if (!anchor) {
        throw new FoundationError("NOT_FOUND", "LTV subject anchor not found");
      }
      return anchor.anchorHash;
    }
    const attestation = this.srIntegrity.getAttestation(scope, subjectId);
    if (!attestation) {
      throw new FoundationError("NOT_FOUND", "LTV subject attestation not found");
    }
    return attestation.signedDigest;
  }
}
