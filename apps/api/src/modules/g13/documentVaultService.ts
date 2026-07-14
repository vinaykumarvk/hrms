import { AuditService } from "../../platform/audit/auditService";
import { ActorContext, FoundationError, TenantScope, inScope, nextId, requireTenantScope, sha256Hex, sha256HexBytes } from "../../platform/types";
import {
  DataSubjectRequestRecord,
  DispositionRecord,
  DocumentAuditRecord,
  DocumentSecurityRepository,
  DsrDocumentOutcome,
  G13AccessAuditAction,
  G13DispositionAction,
  G13DsrType,
  G13ErasureMethod,
  InMemoryDocumentSecurityRepository,
  KeyRotationReport,
  RetentionClassRecord,
  ScanResultRecord,
  SecurityClearanceRecord,
} from "./documentSecurityRepository";

export interface DocumentLink {
  moduleCode: string;
  entityName: string;
  entityRefId: string;
  linkRole: string;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  docNo: string;
  title: string;
  ownerEmployeeId?: string;
  status: "DRAFT" | "PENDING_SCAN" | "ACTIVE" | "SUPERSEDED" | "ORPHANED" | "DELETED" | "DISPOSED" | "QUARANTINED";
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";
  currentVersionNo: number;
  contentHash: string;
  isWorm: boolean;
  legalHold: boolean;
  /** E8/E9 retention class binding — disposition eligibility (FR-009). */
  retentionClassCode?: string;
  /**
   * FR-G13-018: set when a DPDP request resolves — EXEMPT_RETAINED (lattice override) or
   * CRYPTO_SHRED (redaction-marker erasure executed). Mirrors documents.dpdp_erasure_state.
   */
  dpdpErasureState?: G13ErasureMethod;
  links: DocumentLink[];
}

export interface DocumentRetentionView {
  documentId: string;
  status: DocumentRecord["status"];
  isWorm: boolean;
  legalHold: boolean;
  retentionUntil?: string;
  failClosed: boolean;
}

export interface DocumentVersionView {
  documentId: string;
  versionNo: number;
  contentHash: string;
  status: DocumentRecord["status"];
}

/**
 * BRD G13 E2 `document_versions` — append-only immutable version history (DI-2). checkIn APPENDS a
 * new row; existing rows are frozen and there is no update or delete path for them.
 */
export interface DocumentVersionRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  documentId: string;
  versionNo: number;
  title: string;
  contentHash: string;
  versionKind: "ORIGINAL" | "CHECKIN";
  /** Server-assigned append timestamp. */
  recordedAt: string;
  createdBy?: string;
}

/** BRD G13 E14 `checkout_locks` — one ACTIVE lock per document (DI-7); release is explicit. */
export interface CheckoutLockRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  documentId: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
  intentNote?: string;
  status: "ACTIVE" | "RELEASED" | "EXPIRED" | "FORCE_RELEASED";
}

export type DocumentFetchIntent = "VIEW" | "DOWNLOAD";

// FR-G13-016 AC6: VIEW returns a short-TTL, session-bound, watermarked render descriptor — no raw blob.
export interface DocumentViewDescriptor {
  documentId: string;
  intent: "VIEW";
  render: {
    renderToken: string;
    expiresInSeconds: number;
    watermarked: true;
    sessionBound: true;
    disposition: "inline";
  };
}

// FR-G13-016 AC6: DOWNLOAD returns the file grant only, tied to the distinct DOWNLOAD right.
export interface DocumentDownloadGrant {
  documentId: string;
  intent: "DOWNLOAD";
  grant: {
    grantToken: string;
    right: "DOWNLOAD";
    versionNo: number;
    contentHash: string;
    disposition: "attachment";
  };
}

// --- DI-11 scan gate seam (BRD G13 FR-007) -------------------------------------------------

export interface ScanRequest {
  tenantId: string;
  documentId: string;
  versionNo: number;
  bytes: Buffer;
}

export interface ScanOutcome {
  verdict: "CLEAN" | "INFECTED" | "PENDING";
  engine: string;
  threatName?: string;
}

/**
 * DI-11 injectable malware-scan seam: new content enters PENDING_SCAN and only a scan-CLEAN
 * result promotes it to ACTIVE; INFECTED quarantines. Tests inject a deterministic fake;
 * production binds a real scanner behind this interface.
 */
export interface ScanProvider {
  scan(request: ScanRequest): ScanOutcome;
}

/** EICAR standard anti-virus test string (industry marker for scanner verification). */
const EICAR_SIGNATURE = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";

/**
 * Deterministic stub ScanProvider — flags only the EICAR test signature, clearly marked
 * non-production. INTEGRATION DEBT (DI-11): production must bind a real scan engine behind
 * the ScanProvider seam; this stub is not a malware scanner.
 */
export class StubScanProvider implements ScanProvider {
  scan(request: ScanRequest): ScanOutcome {
    const infected = request.bytes.includes(EICAR_SIGNATURE);
    return infected
      ? { verdict: "INFECTED", engine: "stub-scan-provider (non-production)", threatName: "EICAR-Test-File" }
      : { verdict: "CLEAN", engine: "stub-scan-provider (non-production)" };
  }
}

// BRD G13 FR-006 classification lattice: deny-by-default applies from CONFIDENTIAL upward.
const CLASSIFICATION_RANK: Record<DocumentRecord["classification"], number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};
const CLEARANCE_GATED_RANK = CLASSIFICATION_RANK.CONFIDENTIAL;

// DI-14 (BRD G13 FR-014 BR-1): a DELETED, DISPOSED, or ORPHANED document can never be attached.
const NOT_ATTACHABLE_STATUSES: ReadonlyArray<DocumentRecord["status"]> = ["DELETED", "DISPOSED", "ORPHANED"];

const VIEW_RENDER_TTL_SECONDS = 300;

/**
 * P05 right-to-erasure redaction marker (FR-G13-018 AC5): DPDP erasure NEVER physically deletes
 * held content or audit rows — PII is overwritten with this marker and the rows remain.
 */
export const DPDP_REDACTION_MARKER = "[DPDP-REDACTED]";

/** Checkout locks auto-expire (BRD G13 E14 `expires_at`, e.g. +8h) to prevent stuck locks. */
const CHECKOUT_LOCK_TTL_MS = 8 * 60 * 60 * 1000;

/** BRD S3.2 permission-matrix roles with document-domain access beyond "own" (Librarian/Records
 *  Mgr and equivalents), plus the org-wide hr_admin/system override used across other modules. */
const DOCUMENT_ACCESS_OVERRIDE_ROLES = new Set(["hr_admin", "librarian", "records_manager", "system"]);

export class DocumentVaultService {
  private readonly documents: DocumentRecord[];
  // Append-only sub-ledger of immutable version rows (document_versions) — rows are frozen on
  // append and this class exposes no update/delete path for an existing version row.
  private readonly versions: DocumentVersionRecord[] = [];
  private readonly checkoutLocks: CheckoutLockRecord[] = [];
  private readonly retentionExtensions = new Map<string, string>();
  private dispositionSeq = 0;

  constructor(
    initial: DocumentRecord[],
    private readonly audit: AuditService,
    private readonly security: DocumentSecurityRepository = new InMemoryDocumentSecurityRepository(),
    private readonly scanProvider: ScanProvider = new StubScanProvider()
  ) {
    this.documents = initial.map((doc) => ({ ...doc, links: [...doc.links] }));
    for (const document of this.documents) {
      this.appendVersionRow(document, "ORIGINAL", undefined);
    }
  }

  /**
   * BRD G13 FR-005/FR-007 ingest. Two paths:
   *   - `content` (raw bytes as UTF-8 text): the REAL ingest path. content_hash is computed
   *     server-side as SHA-256 over the actual bytes — a caller-supplied hash is never trusted —
   *     and the document enters PENDING_SCAN; only a scan-CLEAN verdict promotes it to ACTIVE
   *     (DI-11); INFECTED quarantines it.
   *   - `contentHash` without bytes: the pre-scanned/migrated registration seam (documents whose
   *     bytes live outside this substrate — module attachments, seed/migration rows). These
   *     register as ACTIVE with PRE_SCANNED provenance recorded on the audit trail.
   */
  createDocument(
    scope: TenantScope,
    input: {
      title: string;
      ownerEmployeeId?: string;
      classification: DocumentRecord["classification"];
      contentHash?: string;
      content?: string;
      isWorm?: boolean;
    }
  ): DocumentRecord {
    requireTenantScope(scope);
    const bytes = input.content !== undefined ? Buffer.from(input.content, "utf8") : undefined;
    if (!bytes && !input.contentHash) {
      throw new FoundationError("VALIDATION_FAILED", "Provide content bytes or, for pre-scanned registration, a contentHash", {
        field: "content",
      });
    }
    // FR-G13-005: on the byte-ingest path the service computes the hash itself; any hash the
    // caller sent alongside the bytes is ignored, never trusted.
    const contentHash = bytes ? sha256HexBytes(bytes) : (input.contentHash as string);
    const document: DocumentRecord = {
      id: nextId("doc", this.documents.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      docNo: `DOC/PH03/${String(this.documents.length + 1).padStart(4, "0")}`,
      title: input.title,
      ownerEmployeeId: input.ownerEmployeeId,
      // DI-11 scan gate: byte ingest is fail-closed — PENDING_SCAN until a CLEAN verdict.
      status: bytes ? "PENDING_SCAN" : "ACTIVE",
      classification: input.classification,
      currentVersionNo: 1,
      contentHash,
      isWorm: Boolean(input.isWorm),
      legalHold: false,
      links: [],
    };
    this.documents.push(document);
    this.appendVersionRow(document, "ORIGINAL", scope.actorUserId);
    this.audit.recordMutation(scope, {
      action: "G13_DOCUMENT_CREATE",
      subjectRef: `documents:${document.id}`,
      metadata: { classification: document.classification, provenance: bytes ? "BYTE_INGEST" : "PRE_SCANNED" },
    });
    if (bytes) {
      this.security.putContent(document.id, document.currentVersionNo, bytes);
      this.runScan(scope, document, bytes);
    }
    return this.clone(document);
  }

  /**
   * Re-runs the DI-11 scan for a document still in PENDING_SCAN (job seam JOB-G13-SCAN retry).
   * Only a CLEAN verdict promotes to ACTIVE; INFECTED quarantines.
   */
  rescan(scope: TenantScope, documentId: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.status !== "PENDING_SCAN") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PENDING_SCAN document can be rescanned", {
        details: { status: document.status },
      });
    }
    const bytes = this.security.getContent(document.id, document.currentVersionNo);
    if (!bytes) {
      throw new FoundationError("PRECONDITION_FAILED", "No stored content available to scan");
    }
    this.runScan(scope, document, bytes);
    return this.clone(document);
  }

  /** DI-11 scan execution: verdict row appended to E15 scan_results; state promoted fail-closed. */
  private runScan(scope: TenantScope, document: DocumentRecord, bytes: Buffer): void {
    let outcome: ScanOutcome;
    try {
      outcome = this.scanProvider.scan({
        tenantId: document.tenantId,
        documentId: document.id,
        versionNo: document.currentVersionNo,
        bytes,
      });
    } catch {
      // Fail-closed: a scanner fault keeps the document PENDING_SCAN (unfetchable), never ACTIVE.
      this.audit.recordSecurity(scope, {
        eventType: "G13_DOCUMENT_SCAN_FAILED",
        result: "FAILED",
        metadata: { documentId: document.id, versionNo: document.currentVersionNo },
      });
      return;
    }
    this.security.appendScanResult({
      tenantId: document.tenantId,
      entityId: document.entityId,
      documentId: document.id,
      versionNo: document.currentVersionNo,
      engine: outcome.engine,
      verdict: outcome.verdict,
      threatName: outcome.threatName,
      integrityVerified: sha256HexBytes(bytes) === document.contentHash,
    });
    if (outcome.verdict === "CLEAN") {
      // DI-11: only a scan-CLEAN result promotes PENDING_SCAN content to ACTIVE.
      document.status = "ACTIVE";
      this.audit.recordMutation(scope, {
        action: "G13_DOCUMENT_SCAN_CLEAN",
        subjectRef: `documents:${document.id}`,
        metadata: { versionNo: document.currentVersionNo, engine: outcome.engine },
      });
      return;
    }
    if (outcome.verdict === "INFECTED") {
      // BRD G13 FR-007: infected files are QUARANTINED, hidden, and Security is notified
      // (MSG-G13-QUARANTINE); fetch is blocked with ERR-G13-MALWARE_DETECTED.
      document.status = "QUARANTINED";
      this.audit.recordSecurity(scope, {
        eventType: "G13_DOCUMENT_QUARANTINED",
        result: "DENIED",
        metadata: {
          documentId: document.id,
          versionNo: document.currentVersionNo,
          messageId: "MSG-G13-QUARANTINE",
          threatName: outcome.threatName,
        },
      });
    }
    // PENDING: remains PENDING_SCAN — fail-closed until a definitive verdict arrives.
  }

  attach(scope: TenantScope, documentId: string, link: DocumentLink): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (NOT_ATTACHABLE_STATUSES.includes(document.status)) {
      // Taxonomy ERR-G13-DOCUMENT_NOT_ATTACHABLE (DI-14): rejected before any link is written.
      throw new FoundationError("CONFLICT", "Document is not attachable in its current lifecycle status", {
        field: "documentId",
        details: { messageId: "ERR-G13-DOCUMENT_NOT_ATTACHABLE", status: document.status },
      });
    }
    document.links.push({ ...link });
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_ATTACH", subjectRef: `documents:${document.id}`, metadata: { moduleCode: link.moduleCode, entityRefId: link.entityRefId } });
    return this.clone(document);
  }

  /** BRD §3.2 permission matrix: Librarian/Records-Mgr/Auditor/etc. get a plain "R" (any
   *  document); Employee gets "R (own)" only. Non-override actors are need-to-know scoped to
   *  documents they own — a plain `g13.document.read` grant (which every employee holds) never
   *  by itself surfaces another employee's document metadata. Documents with no
   *  `ownerEmployeeId` (organisational artefacts with no single personal owner) are unaffected —
   *  the "(own)" restriction has nothing to scope them by. */
  list(scope: TenantScope & { roles?: string[]; permissions?: string[] }): DocumentRecord[] {
    requireTenantScope(scope);
    const inTenant = this.documents.filter((document) => inScope(document, scope));
    const visible = this.isDocumentAccessOverride(scope)
      ? inTenant
      : inTenant.filter((document) => !document.ownerEmployeeId || document.ownerEmployeeId === scope.actorUserId);
    return visible.map((document) => this.clone(document));
  }

  /** Self-service "access personal documents" discovery surface: every document the given
   *  employee owns, newest first. Appraisee-of-the-documents-self or an override role/wildcard
   *  only — this is the same need-to-know scope `list()` now applies for non-override actors,
   *  exposed as an explicit "my documents" query for a specific employee id. */
  listMyDocuments(scope: TenantScope & { roles?: string[]; permissions?: string[] }, employeeId: string): DocumentRecord[] {
    requireTenantScope(scope);
    this.assertSelfOrOverride(scope, employeeId);
    return this.documents.filter((document) => inScope(document, scope) && document.ownerEmployeeId === employeeId).map((document) => this.clone(document));
  }

  private isDocumentAccessOverride(scope: TenantScope & { roles?: string[]; permissions?: string[] }): boolean {
    return Boolean(scope.permissions?.includes("*") || scope.roles?.some((role) => DOCUMENT_ACCESS_OVERRIDE_ROLES.has(role)));
  }

  private assertSelfOrOverride(scope: TenantScope & { roles?: string[]; permissions?: string[] }, employeeId: string): void {
    if (this.isDocumentAccessOverride(scope) || scope.actorUserId === employeeId) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only view your own documents", { field: "employeeId" });
  }

  /** Need-to-know gate (BRD §3.3: "an ACL/relationship grant exists (deny-by-default)... need-to-
   *  know restricts CONFIDENTIAL+ to principals on the document's ACL"). This codebase has no
   *  separate ACL entity; a document's own owner is its ACL for the self-service surface, so a
   *  non-override actor may only `get`/`fetch` a document they own — a classification-level
   *  clearance grant is necessary but not sufficient for someone else's document. */
  private assertOwnerOrOverride(scope: TenantScope & { roles?: string[]; permissions?: string[] }, document: DocumentRecord): void {
    if (this.isDocumentAccessOverride(scope) || !document.ownerEmployeeId || document.ownerEmployeeId === scope.actorUserId) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only access your own documents", { field: "documentId" });
  }

  listVersions(scope: TenantScope, documentId: string): DocumentVersionView[] {
    const document = this.requireDocument(scope, documentId);
    return this.versions
      .filter((version) => version.documentId === document.id)
      .sort((left, right) => left.versionNo - right.versionNo)
      .map((version) => ({
        documentId: document.id,
        versionNo: version.versionNo,
        contentHash: version.contentHash,
        status: document.status,
      }));
  }

  /** Full append-only version rows (immutable — each row is frozen on append). */
  listVersionRows(scope: TenantScope, documentId: string): readonly DocumentVersionRecord[] {
    const document = this.requireDocument(scope, documentId);
    return this.versions.filter((version) => version.documentId === document.id).sort((left, right) => left.versionNo - right.versionNo);
  }

  /**
   * BRD G13 FR-004 checkout: acquires the exclusive edit lock. A document checked out by another
   * actor rejects a conflicting checkout with ERR-G13-DOCUMENT_LOCKED (409). Release is explicit.
   */
  checkout(scope: TenantScope, documentId: string, intentNote?: string): CheckoutLockRecord {
    const document = this.requireDocument(scope, documentId);
    const actor = this.requireActor(scope);
    const active = this.activeLock(document.id);
    if (active) {
      if (active.lockedBy !== actor) {
        throw this.documentLockedError(document.id, active);
      }
      return { ...active };
    }
    const now = Date.now();
    const lock: CheckoutLockRecord = {
      id: nextId("lock", this.checkoutLocks.length),
      tenantId: document.tenantId,
      entityId: document.entityId,
      documentId: document.id,
      lockedBy: actor,
      lockedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CHECKOUT_LOCK_TTL_MS).toISOString(),
      intentNote,
      status: "ACTIVE",
    };
    this.checkoutLocks.push(lock);
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_CHECKOUT", subjectRef: `documents:${document.id}`, metadata: { lockId: lock.id } });
    return { ...lock };
  }

  /** Explicit lock release by the holder — locks are never silently dropped by checkIn. */
  releaseCheckout(scope: TenantScope, documentId: string): CheckoutLockRecord {
    const document = this.requireDocument(scope, documentId);
    const actor = this.requireActor(scope);
    const active = this.activeLock(document.id);
    if (!active) {
      throw new FoundationError("PRECONDITION_FAILED", "Document is not checked out");
    }
    if (active.lockedBy !== actor) {
      throw new FoundationError("FORBIDDEN", "Only the checkout holder may release the lock", {
        details: { documentId: document.id },
      });
    }
    active.status = "RELEASED";
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_CHECKOUT_RELEASE", subjectRef: `documents:${document.id}`, metadata: { lockId: active.id } });
    return { ...active };
  }

  getCheckoutLock(scope: TenantScope, documentId: string): CheckoutLockRecord | null {
    const document = this.requireDocument(scope, documentId);
    const active = this.activeLock(document.id);
    return active ? { ...active } : null;
  }

  checkIn(scope: TenantScope, documentId: string, input: { contentHash?: string; content?: string; title?: string }): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold blocks document checkin");
    }
    // BRD G13 FR-004: a document checked out by another actor rejects conflicting writes.
    const active = this.activeLock(document.id);
    if (active && active.lockedBy !== (scope.actorUserId ?? "")) {
      throw this.documentLockedError(document.id, active);
    }
    const bytes = input.content !== undefined ? Buffer.from(input.content, "utf8") : undefined;
    if (!bytes && !input.contentHash) {
      throw new FoundationError("VALIDATION_FAILED", "Provide content bytes or, for pre-scanned registration, a contentHash", {
        field: "content",
      });
    }
    // Append-only version history: checkIn APPENDS a new immutable version row; the prior rows
    // are never mutated or deleted — the document header only advances its current pointer.
    document.currentVersionNo += 1;
    // FR-G13-005: byte check-ins hash server-side (caller hash never trusted) and re-enter the
    // DI-11 scan gate; hash-only check-ins remain the pre-scanned registration seam.
    document.contentHash = bytes ? sha256HexBytes(bytes) : (input.contentHash as string);
    if (input.title) {
      document.title = input.title;
    }
    this.appendVersionRow(document, "CHECKIN", scope.actorUserId);
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_CHECKIN", subjectRef: `documents:${document.id}`, metadata: { versionNo: document.currentVersionNo } });
    if (bytes) {
      this.security.putContent(document.id, document.currentVersionNo, bytes);
      document.status = "PENDING_SCAN";
      this.runScan(scope, document, bytes);
    }
    return this.clone(document);
  }

  supersede(scope: TenantScope, documentId: string, replacementDocumentId?: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold blocks supersede");
    }
    document.status = "SUPERSEDED";
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_SUPERSEDE", subjectRef: `documents:${document.id}`, metadata: { replacementDocumentId } });
    return this.clone(document);
  }

  placeLegalHold(scope: TenantScope, documentId: string, reason: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    document.legalHold = true;
    this.audit.recordMutation(scope, { action: "G13_LEGAL_HOLD_PLACE", subjectRef: `documents:${document.id}`, metadata: { reason } });
    return this.clone(document);
  }

  releaseLegalHold(scope: TenantScope, documentId: string, reason: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    document.legalHold = false;
    this.audit.recordMutation(scope, { action: "G13_LEGAL_HOLD_RELEASE", subjectRef: `documents:${document.id}`, metadata: { reason } });
    return this.clone(document);
  }

  getRetention(scope: TenantScope, documentId: string): DocumentRetentionView {
    const document = this.requireDocument(scope, documentId);
    return {
      documentId: document.id,
      status: document.status,
      isWorm: document.isWorm,
      legalHold: document.legalHold,
      retentionUntil: this.retentionExtensions.get(document.id),
      failClosed: document.isWorm || document.legalHold,
    };
  }

  extendRetention(scope: TenantScope, documentId: string, retentionUntil: string, reason: string): DocumentRetentionView {
    const document = this.requireDocument(scope, documentId);
    this.retentionExtensions.set(document.id, retentionUntil);
    this.audit.recordMutation(scope, { action: "G13_RETENTION_EXTEND", subjectRef: `documents:${document.id}`, metadata: { retentionUntil, reason } });
    return this.getRetention(scope, document.id);
  }

  dispose(scope: TenantScope, documentId: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold || document.isWorm) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold or WORM retention blocks disposal");
    }
    document.status = "DISPOSED";
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_DISPOSE", subjectRef: `documents:${document.id}` });
    return this.clone(document);
  }

  // FR-G13-016 R2: intent-resolved fetch. VIEW and DOWNLOAD return structurally different bodies and
  // each lands its own access-audit event in the append-only E12 document_audit ledger.
  // Gate order (all fail-closed): lifecycle -> DI-11 scan gate -> FR-006 clearance -> FR-005 integrity.
  fetch(
    scope: TenantScope & { roles?: string[]; permissions?: string[] },
    documentId: string,
    intent: DocumentFetchIntent
  ): DocumentViewDescriptor | DocumentDownloadGrant {
    const document = this.requireDocument(scope, documentId);
    this.assertOwnerOrOverride(scope, document);
    if (document.status === "DISPOSED" || document.status === "DELETED") {
      // Taxonomy ERR-G13-DOCUMENT_DISPOSED: fetch of a disposed document surfaces as NOT_FOUND.
      throw new FoundationError("NOT_FOUND", "Document is no longer available", {
        details: { messageId: "ERR-G13-DOCUMENT_DISPOSED", status: document.status },
      });
    }
    if (document.status === "PENDING_SCAN") {
      // DI-11 fail-closed: content awaiting a scan verdict is not fetchable for normal intents.
      this.appendAccessAudit(scope, document, intent, "DENIED", "SCAN_PENDING");
      throw new FoundationError("PRECONDITION_FAILED", "Document content is pending malware scan; retry after the scan completes", {
        details: { status: "PENDING_SCAN" },
      });
    }
    if (document.status === "QUARANTINED") {
      // BRD G13 FR-007: quarantined (infected) content is hidden and unfetchable.
      this.appendAccessAudit(scope, document, intent, "DENIED", "ERR-G13-MALWARE_DETECTED");
      throw new FoundationError("ERR-G13-MALWARE_DETECTED", "Document is quarantined and cannot be fetched", {
        details: { messageId: "ERR-G13-MALWARE_DETECTED", status: document.status },
      });
    }
    this.requireClearance(scope, document, intent);
    this.verifyContentIntegrity(scope, document, intent);
    // FR-G13-015/016: the access event (actor, document, version, intent) lands in document_audit.
    this.appendAccessAudit(scope, document, intent, "SUCCESS");
    const sessionSeed = `${document.id}:${document.currentVersionNo}:${intent}:${scope.actorUserId ?? ""}:${scope.correlationId ?? ""}`;
    const grantToken = sha256Hex(sessionSeed).slice(0, 32);
    if (intent === "VIEW") {
      this.audit.recordSecurity(scope, {
        eventType: "G13_DOCUMENT_FETCH_VIEW",
        result: "SUCCESS",
        metadata: { documentId: document.id, intent: "VIEW", versionNo: document.currentVersionNo },
      });
      return {
        documentId: document.id,
        intent: "VIEW",
        render: {
          renderToken: grantToken,
          expiresInSeconds: VIEW_RENDER_TTL_SECONDS,
          watermarked: true,
          sessionBound: true,
          disposition: "inline",
        },
      };
    }
    this.audit.recordSecurity(scope, {
      eventType: "G13_DOCUMENT_FETCH_DOWNLOAD",
      result: "SUCCESS",
      metadata: { documentId: document.id, intent: "DOWNLOAD", versionNo: document.currentVersionNo },
    });
    return {
      documentId: document.id,
      intent: "DOWNLOAD",
      grant: {
        grantToken,
        right: "DOWNLOAD",
        versionNo: document.currentVersionNo,
        contentHash: document.contentHash,
        disposition: "attachment",
      },
    };
  }

  /**
   * BRD G13 FR-006 (E21 security_clearances): DENY-BY-DEFAULT classification gate. Access to a
   * CONFIDENTIAL+ document requires an ACTIVE clearance row at or above the document's
   * classification level for the acting user (or one of their roles). Absence of a row denies —
   * it never defaults to allow.
   */
  private requireClearance(scope: TenantScope & { roles?: string[] }, document: DocumentRecord, intent: DocumentFetchIntent): void {
    if (CLASSIFICATION_RANK[document.classification] < CLEARANCE_GATED_RANK) {
      return;
    }
    const now = Date.now();
    const roles = scope.roles ?? [];
    const cleared = this.security.listClearances(document.tenantId).some((clearance) => {
      if (clearance.status !== "ACTIVE") {
        return false;
      }
      if (clearance.validUntil && Date.parse(clearance.validUntil) < now) {
        return false;
      }
      const principalMatch =
        (clearance.principalType === "USER" && clearance.principalRef === scope.actorUserId) ||
        (clearance.principalType === "ROLE" && roles.includes(clearance.principalRef));
      return principalMatch && CLASSIFICATION_RANK[clearance.clearanceLevel] >= CLASSIFICATION_RANK[document.classification];
    });
    if (!cleared) {
      this.appendAccessAudit(scope, document, intent, "DENIED", "ERR-G13-CLEARANCE_INSUFFICIENT");
      this.audit.recordSecurity(scope, {
        eventType: "G13_DOCUMENT_CLEARANCE_DENIED",
        result: "DENIED",
        metadata: { documentId: document.id, classification: document.classification, intent },
      });
      throw new FoundationError("ERR-G13-CLEARANCE_INSUFFICIENT", "Security clearance is insufficient for this document's classification", {
        details: { messageId: "ERR-G13-CLEARANCE_INSUFFICIENT", classification: document.classification },
      });
    }
  }

  /**
   * BRD G13 FR-005/FR-015: every fetch recomputes SHA-256 over the stored bytes and compares it
   * to the recorded content_hash BEFORE returning content. A mismatch withholds the content,
   * quarantines the document, and raises a security audit event.
   */
  private verifyContentIntegrity(scope: TenantScope, document: DocumentRecord, intent: DocumentFetchIntent): void {
    const bytes = this.security.getContent(document.id, document.currentVersionNo);
    if (!bytes) {
      // Pre-scanned/migrated registrations keep their bytes outside this substrate; their hash
      // provenance was recorded at ingest and cannot be re-verified here.
      return;
    }
    const recomputed = sha256HexBytes(bytes);
    if (recomputed !== document.contentHash) {
      document.status = "QUARANTINED";
      this.appendAccessAudit(scope, document, intent, "DENIED", "ERR-G13-INTEGRITY_FAILED");
      this.audit.recordSecurity(scope, {
        eventType: "G13_DOCUMENT_INTEGRITY_FAILED",
        result: "FAILED",
        metadata: { documentId: document.id, versionNo: document.currentVersionNo, intent },
      });
      throw new FoundationError("ERR-G13-INTEGRITY_FAILED", "Stored content failed SHA-256 integrity verification; content withheld", {
        details: { messageId: "ERR-G13-INTEGRITY_FAILED", documentId: document.id },
      });
    }
  }

  /** Appends one E12 document_audit row (append-only, hash-chained; repository owns the chain). */
  private appendAccessAudit(
    scope: TenantScope,
    document: DocumentRecord,
    action: G13AccessAuditAction,
    result: "SUCCESS" | "DENIED",
    denialReason?: string
  ): DocumentAuditRecord {
    return this.security.appendAccessAudit({
      tenantId: document.tenantId,
      entityId: document.entityId,
      documentId: document.id,
      versionNo: document.currentVersionNo,
      action,
      actorUserId: scope.actorUserId ?? "",
      correlationId: scope.correlationId,
      result,
      denialReason,
    });
  }

  /** Read model over the append-only E12 access ledger (VIEW/DOWNLOAD events, R5 chain). */
  listAccessAudit(scope: TenantScope, documentId: string): DocumentAuditRecord[] {
    const document = this.requireDocument(scope, documentId);
    return this.security.listAccessAudit(document.id);
  }

  /** Read model over the append-only E15 scan_results ledger. */
  listScanResults(scope: TenantScope, documentId: string): ScanResultRecord[] {
    const document = this.requireDocument(scope, documentId);
    return this.security.listScanResults(document.id);
  }

  /**
   * BRD G13 FR-006/FR-017 (E21): grant a security clearance. DI-16 SoD: the approving checker
   * must differ from the granting maker; without a distinct approver the row stays
   * PENDING_APPROVAL, which the deny-by-default gate ignores.
   */
  grantSecurityClearance(
    scope: TenantScope,
    input: {
      principalType: "USER" | "ROLE";
      principalRef: string;
      clearanceLevel: DocumentRecord["classification"];
      justification: string;
      approvedBy?: string;
      validUntil?: string;
    }
  ): SecurityClearanceRecord {
    const grantedBy = this.requireActor(scope);
    if (input.approvedBy && input.approvedBy === grantedBy) {
      // DI-16 (ck_clearance_sod): approver must differ from granter.
      throw new FoundationError("ERR-G13-SOD_VIOLATION", "Clearance approval requires a checker different from the granting maker", {
        details: { messageId: "ERR-G13-SOD_VIOLATION" },
      });
    }
    // Service-level idempotency (ck_clearance_unique_active): re-granting the same ACTIVE clearance
    // to the same principal+level returns the existing row instead of creating a duplicate. Previously
    // only the seed wrapper pre-checked this; any other direct caller could create duplicate ACTIVE rows.
    const existingActive = this.security
      .listClearances(scope.tenantId)
      .find(
        (clearance) =>
          clearance.principalType === input.principalType &&
          clearance.principalRef === input.principalRef &&
          clearance.clearanceLevel === input.clearanceLevel &&
          clearance.status === "ACTIVE"
      );
    if (existingActive) {
      return existingActive;
    }
    const clearance = this.security.saveClearance({
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      principalType: input.principalType,
      principalRef: input.principalRef,
      clearanceLevel: input.clearanceLevel,
      status: input.approvedBy ? "ACTIVE" : "PENDING_APPROVAL",
      justification: input.justification,
      grantedBy,
      approvedBy: input.approvedBy,
      validFrom: new Date().toISOString(),
      validUntil: input.validUntil,
    });
    this.audit.recordSecurity(scope, {
      eventType: "G13_CLEARANCE_GRANTED",
      result: "SUCCESS",
      metadata: {
        clearanceId: clearance.id,
        principalType: clearance.principalType,
        principalRef: clearance.principalRef,
        clearanceLevel: clearance.clearanceLevel,
        status: clearance.status,
      },
    });
    return clearance;
  }

  /** Read path for the E21 security_clearances the deny-by-default gate above consults. */
  listSecurityClearances(scope: TenantScope): SecurityClearanceRecord[] {
    requireTenantScope(scope);
    return this.security.listClearances(scope.tenantId);
  }

  /** BRD G13 FR-009 (E8): define a tenant retention class (binds disposition eligibility). */
  defineRetentionClass(
    scope: TenantScope,
    input: { code: string; name: string; retentionPeriodMonths?: number; isPermanent?: boolean; dispositionAction: G13DispositionAction }
  ): RetentionClassRecord {
    requireTenantScope(scope);
    const record = this.security.saveRetentionClass({
      tenantId: scope.tenantId,
      code: input.code,
      name: input.name,
      retentionPeriodMonths: input.retentionPeriodMonths,
      isPermanent: Boolean(input.isPermanent),
      dispositionAction: input.dispositionAction,
    });
    this.audit.recordMutation(scope, { action: "G13_RETENTION_CLASS_DEFINE", subjectRef: `retention_classes:${record.code}` });
    return record;
  }

  /** BRD G13 FR-009 (E9): bind a document to a retention class — prerequisite for disposition. */
  assignRetentionClass(scope: TenantScope, documentId: string, retentionClassCode: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (!this.security.getRetentionClass(document.tenantId, retentionClassCode)) {
      throw new FoundationError("NOT_FOUND", "Retention class not found", { field: "retentionClassCode" });
    }
    document.retentionClassCode = retentionClassCode;
    this.audit.recordMutation(scope, {
      action: "G13_RETENTION_CLASS_ASSIGN",
      subjectRef: `documents:${document.id}`,
      metadata: { retentionClassCode },
    });
    return this.clone(document);
  }

  /**
   * BRD G13 FR-009 (E18 disposition_records): the maker proposes disposition of a document whose
   * retention class makes it eligible. Execution is separately gated on checker approval and hold state.
   */
  proposeDisposition(scope: TenantScope, documentId: string, action?: G13DispositionAction): DispositionRecord {
    const document = this.requireDocument(scope, documentId);
    const proposedBy = this.requireActor(scope);
    if (!document.retentionClassCode) {
      throw new FoundationError("PRECONDITION_FAILED", "Document has no retention class; disposition eligibility is undefined", {
        details: { documentId: document.id },
      });
    }
    const retentionClass = this.security.getRetentionClass(document.tenantId, document.retentionClassCode);
    if (!retentionClass) {
      throw new FoundationError("PRECONDITION_FAILED", "Bound retention class no longer exists", {
        details: { retentionClassCode: document.retentionClassCode },
      });
    }
    if (retentionClass.isPermanent) {
      // Taxonomy ERR-G13-RETENTION_PERMANENT: permanent-class records are never disposition-eligible.
      throw new FoundationError("CONFLICT", "A permanent retention class blocks disposition", {
        details: { messageId: "ERR-G13-RETENTION_PERMANENT", retentionClassCode: retentionClass.code },
      });
    }
    const disposition = this.security.saveDisposition({
      id: nextId("disp", this.dispositionSeq++),
      tenantId: document.tenantId,
      entityId: document.entityId,
      documentId: document.id,
      retentionClassCode: retentionClass.code,
      action: action ?? retentionClass.dispositionAction,
      proposedBy,
      status: "PROPOSED",
    });
    this.audit.recordMutation(scope, {
      action: "G13_DISPOSITION_PROPOSE",
      subjectRef: `disposition_records:${disposition.id}`,
      metadata: { documentId: document.id, action: disposition.action },
    });
    return disposition;
  }

  /**
   * BRD G13 FR-009 SoD (DI-10): the approving checker must differ from the proposing maker —
   * self-approval is rejected with ERR-G13-SOD_VIOLATION (403).
   */
  approveDisposition(scope: TenantScope, dispositionId: string): DispositionRecord {
    const checker = this.requireActor(scope);
    const disposition = this.requireDisposition(scope, dispositionId);
    if (disposition.status !== "PROPOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PROPOSED disposition can be approved", {
        details: { status: disposition.status },
      });
    }
    if (disposition.proposedBy === checker) {
      throw new FoundationError("ERR-G13-SOD_VIOLATION", "Disposition approval requires a checker different from the proposing maker", {
        details: { messageId: "ERR-G13-SOD_VIOLATION", dispositionId: disposition.id },
      });
    }
    disposition.approvedBy = checker;
    disposition.status = "APPROVED";
    this.security.saveDisposition(disposition);
    this.audit.recordMutation(scope, {
      action: "G13_DISPOSITION_APPROVE",
      subjectRef: `disposition_records:${disposition.id}`,
      metadata: { documentId: disposition.documentId },
    });
    return { ...disposition };
  }

  /** Execution: still fail-closed on legal hold / WORM (FR-013) even after checker approval. */
  executeDisposition(scope: TenantScope, dispositionId: string): DispositionRecord {
    this.requireActor(scope);
    const disposition = this.requireDisposition(scope, dispositionId);
    if (disposition.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an APPROVED disposition can be executed", {
        details: { status: disposition.status },
      });
    }
    const document = this.requireDocument(scope, disposition.documentId);
    if (document.legalHold || document.isWorm) {
      disposition.status = "BLOCKED_HOLD";
      this.security.saveDisposition(disposition);
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold or WORM retention blocks disposition execution", {
        details: { messageId: "ERR-G13-LEGAL_HOLD_ACTIVE", documentId: document.id },
      });
    }
    document.status = "DISPOSED";
    disposition.status = "EXECUTED";
    disposition.executedAt = new Date().toISOString();
    disposition.evidenceHash = document.contentHash;
    this.security.saveDisposition(disposition);
    this.appendAccessAudit(scope, document, "DISPOSE", "SUCCESS");
    this.audit.recordMutation(scope, {
      action: "G13_DISPOSITION_EXECUTE",
      subjectRef: `disposition_records:${disposition.id}`,
      metadata: { documentId: document.id, evidenceHash: disposition.evidenceHash },
    });
    return { ...disposition };
  }

  private requireDisposition(scope: TenantScope, dispositionId: string): DispositionRecord {
    requireTenantScope(scope);
    const disposition = this.security.getDisposition(dispositionId);
    if (!disposition || disposition.tenantId !== scope.tenantId) {
      throw new FoundationError("NOT_FOUND", "Disposition record not found");
    }
    return disposition;
  }

  // --- FR-G13-005 key rotation (JOB-G13-KEYROTATE) ------------------------------------------

  /**
   * JOB-G13-KEYROTATE: rotates the master key behind the KeyProvider seam and re-wraps every
   * stored per-object DEK under the new key. Object ciphertext is never re-encrypted or
   * rewritten — previously stored objects still decrypt afterwards (FR-G13-005 AC4).
   */
  rotateEncryptionKeys(scope: TenantScope): KeyRotationReport {
    this.requireActor(scope);
    const report = this.security.rewrapDataKeys();
    this.audit.recordSecurity(scope, {
      eventType: "G13_KEY_ROTATE",
      result: "SUCCESS",
      metadata: { jobId: "JOB-G13-KEYROTATE", kmsKeyId: report.kmsKeyId, rewrappedObjects: report.rewrappedObjects },
    });
    return report;
  }

  // --- FR-G13-018 DPDP data-subject requests + VAL-G13-LATTICE (E22) -------------------------

  /** FR-G13-018 AC1: register a DSR — subject, type, received timestamp (statutory clock). */
  registerDataSubjectRequest(
    scope: TenantScope,
    input: { dataSubjectEmployeeId: string; requestType: G13DsrType; consentRefId?: string }
  ): DataSubjectRequestRecord {
    this.requireActor(scope);
    const receivedAt = new Date().toISOString();
    const request: DataSubjectRequestRecord = {
      id: nextId("dsr", this.security.countDataSubjectRequests()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      dsrNo: `DSR/${receivedAt.slice(0, 4)}/${String(this.security.countDataSubjectRequests() + 1).padStart(4, "0")}`,
      dataSubjectEmployeeId: input.dataSubjectEmployeeId,
      requestType: input.requestType,
      consentRefId: input.consentRefId,
      receivedAt,
      status: "RECEIVED",
      outcomes: [],
    };
    const saved = this.security.saveDataSubjectRequest(request);
    this.audit.recordMutation(scope, {
      action: "G13_DSR_REGISTER",
      subjectRef: `data_subject_requests:${saved.id}`,
      metadata: { dsrNo: saved.dsrNo, requestType: saved.requestType, dataSubjectEmployeeId: saved.dataSubjectEmployeeId },
    });
    return saved;
  }

  /**
   * FR-G13-018 AC2 adjudication (DPO): moves RECEIVED -> UNDER_REVIEW (or REJECTED) and, for
   * ERASURE, evaluates every in-scope document against the VAL-G13-LATTICE precedence —
   * statutory retention / active legal hold / WORM override erasure (EXEMPT_RETAINED with the
   * legal basis recorded); only where none applies is the document marked for erasure.
   */
  adjudicateDataSubjectRequest(
    scope: ActorContext,
    dsrId: string,
    input: { decision?: "PROCEED" | "REJECT"; resolutionNote?: string } = {}
  ): DataSubjectRequestRecord {
    const dpo = this.requireActor(scope);
    // Post-hr_admin-goal fix: `g02.grievance.handle` names a `grievance_officer` capability flag
    // for handling data-subject privacy grievances — this DSR adjudication IS that capability
    // (a DSR is the formal mechanism for a privacy grievance), but the flag was never checked;
    // only the route-level `g13.dsr.adjudicate` permission gated this. Modeled as an additional
    // role string, same convention as every other capability-flag fix this goal.
    if (!scope.permissions?.includes("*") && !scope.roles?.some((role) => role === "grievance_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Adjudicating a data-subject request requires the grievance_officer capability", { field: "actor" });
    }
    const request = this.requireDataSubjectRequest(scope, dsrId);
    if (request.status !== "RECEIVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a RECEIVED data-subject request can be adjudicated", {
        details: { status: request.status },
      });
    }
    request.adjudicatedBy = dpo;
    request.resolutionNote = input.resolutionNote ?? request.resolutionNote;
    if (input.decision === "REJECT") {
      request.status = "REJECTED";
      const saved = this.security.saveDataSubjectRequest(request);
      this.audit.recordMutation(scope, { action: "G13_DSR_REJECT", subjectRef: `data_subject_requests:${saved.id}` });
      return saved;
    }
    request.status = "UNDER_REVIEW";
    if (request.requestType === "ERASURE") {
      const inScopeDocuments = this.documents.filter(
        (document) =>
          inScope(document, scope) &&
          document.ownerEmployeeId === request.dataSubjectEmployeeId &&
          document.status !== "DISPOSED" &&
          document.status !== "DELETED"
      );
      request.outcomes = inScopeDocuments.map((document) => this.evaluateErasureLattice(document));
      request.affectedDocumentCount = request.outcomes.length;
      const bases = request.outcomes.filter((outcome) => outcome.basis).map((outcome) => outcome.basis as string);
      request.legalBasisExemption = bases.length > 0 ? bases.join("; ") : undefined;
    }
    const saved = this.security.saveDataSubjectRequest(request);
    this.audit.recordMutation(scope, {
      action: "G13_DSR_ADJUDICATE",
      subjectRef: `data_subject_requests:${saved.id}`,
      metadata: {
        validationId: "VAL-G13-LATTICE",
        affectedDocumentCount: saved.affectedDocumentCount,
        exempted: saved.outcomes.filter((outcome) => outcome.decision === "EXEMPT_RETAINED").length,
      },
    });
    return saved;
  }

  /**
   * FR-G13-018 execution (custodian, SoD AC7: executor != adjudicating DPO). Without a
   * documentId the whole request executes: exempt documents are recorded EXEMPT_RETAINED with
   * their legal basis; non-exempt documents are erased on the redaction-marker path. With a
   * documentId, a single-document erasure is attempted — if the lattice exempts that document
   * the attempt is BLOCKED with the registered 409 code ERR-G13-ERASURE_EXEMPTED.
   */
  executeDataSubjectRequest(scope: TenantScope, dsrId: string, documentId?: string): DataSubjectRequestRecord {
    const executor = this.requireActor(scope);
    const request = this.requireDataSubjectRequest(scope, dsrId);
    if (request.status !== "UNDER_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an UNDER_REVIEW data-subject request can be executed", {
        details: { status: request.status },
      });
    }
    if (request.requestType !== "ERASURE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ERASURE request has an execution path", {
        details: { requestType: request.requestType },
      });
    }
    if (request.adjudicatedBy === executor) {
      // FR-G13-018 AC7 SoD: the DPO who exempts/adjudicates is never the executing custodian.
      throw new FoundationError("ERR-G13-SOD_VIOLATION", "DSR execution requires a custodian different from the adjudicating DPO", {
        details: { messageId: "ERR-G13-SOD_VIOLATION", dsrId: request.id },
      });
    }
    if (documentId !== undefined) {
      return this.executeSingleDocumentErasure(scope, request, documentId);
    }
    for (const outcome of request.outcomes) {
      const document = this.requireDocument(scope, outcome.documentId);
      if (outcome.decision === "EXEMPT_RETAINED") {
        this.recordExemptRetained(scope, document, outcome);
      } else if (!outcome.executedAt) {
        this.eraseDocumentViaRedactionMarker(scope, document);
        outcome.erasureMethod = "CRYPTO_SHRED";
        outcome.executedAt = new Date().toISOString();
      }
    }
    const exempted = request.outcomes.filter((outcome) => outcome.decision === "EXEMPT_RETAINED").length;
    const erased = request.outcomes.length - exempted;
    request.status = exempted === request.outcomes.length ? "EXEMPTED" : exempted > 0 ? "PARTIALLY_FULFILLED" : "FULFILLED";
    request.erasureMethod = erased > 0 ? "CRYPTO_SHRED" : "EXEMPT_RETAINED";
    request.resolutionNote = `Erased ${erased} document(s) via the P05 redaction-marker path; ${exempted} exempted (EXEMPT_RETAINED).`;
    const saved = this.security.saveDataSubjectRequest(request);
    this.audit.recordMutation(scope, {
      action: "G13_DSR_EXECUTE",
      subjectRef: `data_subject_requests:${saved.id}`,
      metadata: { status: saved.status, erased, exempted, executedBy: executor },
    });
    return saved;
  }

  getDataSubjectRequest(scope: TenantScope, dsrId: string): DataSubjectRequestRecord {
    return this.requireDataSubjectRequest(scope, dsrId);
  }

  listDataSubjectRequests(scope: TenantScope): DataSubjectRequestRecord[] {
    requireTenantScope(scope);
    return this.security.listDataSubjectRequests(scope.tenantId);
  }

  /**
   * VAL-G13-LATTICE (DI-15) — deny-erasure-first precedence: statutory retention, then active
   * legal hold, then WORM override erasure with outcome EXEMPT_RETAINED and a recorded legal
   * basis. Only where none applies is the document marked ERASE (redaction-marker path).
   */
  private evaluateErasureLattice(document: DocumentRecord): DsrDocumentOutcome {
    const retentionClass = document.retentionClassCode
      ? this.security.getRetentionClass(document.tenantId, document.retentionClassCode)
      : null;
    if (retentionClass?.isPermanent) {
      return {
        documentId: document.id,
        decision: "EXEMPT_RETAINED",
        basis: `STATUTORY_RETENTION: permanent retention class ${retentionClass.code}`,
        erasureMethod: "EXEMPT_RETAINED",
      };
    }
    const retentionUntil = this.retentionExtensions.get(document.id);
    if (retentionUntil && Date.parse(retentionUntil) > Date.now()) {
      return {
        documentId: document.id,
        decision: "EXEMPT_RETAINED",
        basis: `STATUTORY_RETENTION: retain-until ${retentionUntil}`,
        erasureMethod: "EXEMPT_RETAINED",
      };
    }
    if (document.legalHold) {
      return {
        documentId: document.id,
        decision: "EXEMPT_RETAINED",
        basis: "LEGAL_HOLD: active legal hold overrides DPDP erasure",
        erasureMethod: "EXEMPT_RETAINED",
      };
    }
    if (document.isWorm) {
      return {
        documentId: document.id,
        decision: "EXEMPT_RETAINED",
        basis: "WORM: object-lock retention overrides DPDP erasure",
        erasureMethod: "EXEMPT_RETAINED",
      };
    }
    return { documentId: document.id, decision: "ERASE" };
  }

  /** Single-document erasure attempt: exempt documents BLOCK with ERR-G13-ERASURE_EXEMPTED (409). */
  private executeSingleDocumentErasure(scope: TenantScope, request: DataSubjectRequestRecord, documentId: string): DataSubjectRequestRecord {
    const outcome = request.outcomes.find((entry) => entry.documentId === documentId);
    if (!outcome) {
      throw new FoundationError("NOT_FOUND", "Document is not in scope of this data-subject request", { field: "documentId" });
    }
    const document = this.requireDocument(scope, documentId);
    if (outcome.decision === "EXEMPT_RETAINED") {
      this.recordExemptRetained(scope, document, outcome);
      this.security.saveDataSubjectRequest(request);
      // Registered taxonomy code (409): DPDP erasure overridden by statutory/hold/WORM basis (R8).
      throw new FoundationError("ERR-G13-ERASURE_EXEMPTED", "DPDP erasure is overridden by a statutory retention, legal hold, or WORM basis", {
        details: { messageId: "ERR-G13-ERASURE_EXEMPTED", documentId: document.id, legalBasisExemption: outcome.basis },
      });
    }
    if (!outcome.executedAt) {
      this.eraseDocumentViaRedactionMarker(scope, document);
      outcome.erasureMethod = "CRYPTO_SHRED";
      outcome.executedAt = new Date().toISOString();
    }
    return this.security.saveDataSubjectRequest(request);
  }

  /** Marks a lattice-exempt document EXEMPT_RETAINED and lands the DENIED ERASURE audit row. */
  private recordExemptRetained(scope: TenantScope, document: DocumentRecord, outcome: DsrDocumentOutcome): void {
    if (document.dpdpErasureState !== "EXEMPT_RETAINED") {
      document.dpdpErasureState = "EXEMPT_RETAINED";
      this.appendAccessAudit(scope, document, "ERASURE", "DENIED", "ERR-G13-ERASURE_EXEMPTED");
      this.audit.recordSecurity(scope, {
        eventType: "G13_DSR_ERASURE_EXEMPTED",
        result: "DENIED",
        metadata: { documentId: document.id, legalBasisExemption: outcome.basis, erasureMethod: "EXEMPT_RETAINED" },
      });
    }
  }

  /**
   * FR-G13-018 AC3/AC5 redaction-marker erasure of a NON-exempt document — never physical
   * deletion: existing audit PII is overwritten with the P05 redaction marker (rows retained),
   * the per-object wrapped DEK is destroyed (crypto-shred, dek_shared=false BR-2), the header
   * title is redacted, and documents.dpdp_erasure_state records the method. The chained
   * document_audit (ERASURE) row lands after redaction so the execution record stays legible.
   */
  private eraseDocumentViaRedactionMarker(scope: TenantScope, document: DocumentRecord): void {
    this.security.applyDpdpRedactionMarker(document.id, DPDP_REDACTION_MARKER);
    this.security.destroyWrappedDek(document.id);
    for (let index = 0; index < this.versions.length; index += 1) {
      const version = this.versions[index];
      if (version && version.documentId === document.id) {
        // Version rows stay (append-only) — only the PII-bearing title is overwritten.
        this.versions[index] = Object.freeze({ ...version, title: DPDP_REDACTION_MARKER });
      }
    }
    document.title = DPDP_REDACTION_MARKER;
    document.dpdpErasureState = "CRYPTO_SHRED";
    document.status = "DISPOSED";
    this.appendAccessAudit(scope, document, "ERASURE", "SUCCESS");
    this.audit.recordMutation(scope, {
      action: "G13_DSR_ERASURE_EXECUTE",
      subjectRef: `documents:${document.id}`,
      metadata: { erasureMethod: "CRYPTO_SHRED", redactionMarker: DPDP_REDACTION_MARKER },
    });
  }

  private requireDataSubjectRequest(scope: TenantScope, dsrId: string): DataSubjectRequestRecord {
    requireTenantScope(scope);
    const request = this.security.getDataSubjectRequest(dsrId);
    if (!request || request.tenantId !== scope.tenantId) {
      throw new FoundationError("NOT_FOUND", "Data-subject request not found");
    }
    return request;
  }

  get(scope: TenantScope & { roles?: string[]; permissions?: string[] }, documentId: string): DocumentRecord | null {
    const document = this.documents.find((item) => inScope(item, scope) && item.id === documentId);
    if (!document) {
      return null;
    }
    this.assertOwnerOrOverride(scope, document);
    return this.clone(document);
  }

  listByModuleRef(scope: TenantScope, moduleCode: string, entityRefId: string): DocumentRecord[] {
    requireTenantScope(scope);
    return this.documents
      .filter((document) => inScope(document, scope) && document.links.some((link) => link.moduleCode === moduleCode && link.entityRefId === entityRefId))
      .map((document) => this.clone(document));
  }

  count(scope: TenantScope): number {
    requireTenantScope(scope);
    return this.documents.filter((document) => inScope(document, scope)).length;
  }

  private requireDocument(scope: TenantScope, documentId: string): DocumentRecord {
    const document = this.documents.find((item) => inScope(item, scope) && item.id === documentId);
    if (!document) {
      throw new FoundationError("NOT_FOUND", "Document not found");
    }
    return document;
  }

  /** Appends one frozen document_versions row for the document's current pointer. */
  private appendVersionRow(document: DocumentRecord, versionKind: DocumentVersionRecord["versionKind"], createdBy: string | undefined): void {
    this.versions.push(
      Object.freeze({
        id: nextId("docver", this.versions.length),
        tenantId: document.tenantId,
        entityId: document.entityId,
        documentId: document.id,
        versionNo: document.currentVersionNo,
        title: document.title,
        contentHash: document.contentHash,
        versionKind,
        recordedAt: new Date().toISOString(),
        createdBy,
      })
    );
  }

  private activeLock(documentId: string): CheckoutLockRecord | undefined {
    const now = Date.now();
    return this.checkoutLocks.find((lock) => lock.documentId === documentId && lock.status === "ACTIVE" && Date.parse(lock.expiresAt) > now);
  }

  private requireActor(scope: TenantScope): string {
    requireTenantScope(scope);
    if (!scope.actorUserId) {
      throw new FoundationError("UNAUTHENTICATED", "Checkout requires an authenticated actor");
    }
    return scope.actorUserId;
  }

  /** Taxonomy ERR-G13-DOCUMENT_LOCKED (409): checked out by another user (BRD G13 error catalogue). */
  private documentLockedError(documentId: string, lock: CheckoutLockRecord): FoundationError {
    return new FoundationError("ERR-G13-DOCUMENT_LOCKED", "Document is checked out by another user", {
      field: "documentId",
      details: { messageId: "ERR-G13-DOCUMENT_LOCKED", documentId, lockedBy: lock.lockedBy, expiresAt: lock.expiresAt },
    });
  }

  private clone(document: DocumentRecord): DocumentRecord {
    return { ...document, links: document.links.map((link) => ({ ...link })) };
  }
}
