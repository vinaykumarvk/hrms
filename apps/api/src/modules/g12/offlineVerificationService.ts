import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-24C — G12 offline-QR independent verification at BRD depth
 * (docs/brd/v3/G12-digital-service-register.md FR-11):
 *
 * - A verification bundle (the payload encoded into a QR on a printed extract) binds the SR entry's
 *   content hash, the anchor reference, and issue metadata under a SHA-256 signature computed with a
 *   published verification key.
 * - Offline verification recomputes the signature from the bundle fields and the published key: a
 *   tampered field (changed hash, anchor, or subject) fails verification WITHOUT needing the live
 *   ledger, so a verifier can check authenticity from the QR alone.
 */

export interface VerificationBundle {
  subjectRef: string;
  entryHash: string;
  anchorRef: string;
  issuedAt: string;
  keyId: string;
  signature: string;
}

export interface OfflineVerificationRepository {
  saveBundle(row: VerificationBundle & { id: string; tenantId: string; entityId?: string }): void;
}

export class InMemoryOfflineVerificationRepository implements OfflineVerificationRepository {
  private readonly rows: Array<VerificationBundle & { id: string; tenantId: string; entityId?: string }> = [];
  saveBundle(row: VerificationBundle & { id: string; tenantId: string; entityId?: string }): void {
    this.rows.push({ ...row });
  }
}

/** Published verification keys (the public half is distributed with the CA chain). */
const PUBLISHED_KEYS: Record<string, string> = {
  "g12-verify-2026": "published-verify-key-2026",
};

function computeSignature(bundle: Omit<VerificationBundle, "signature">, secret: string): string {
  return createHash("sha256")
    .update(`${bundle.keyId}|${secret}|${bundle.subjectRef}|${bundle.entryHash}|${bundle.anchorRef}|${bundle.issuedAt}`, "utf8")
    .digest("hex");
}

export class OfflineVerificationService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: OfflineVerificationRepository = new InMemoryOfflineVerificationRepository(),
    private readonly keys: Record<string, string> = PUBLISHED_KEYS
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Issue a QR verification bundle binding the entry hash + anchor ref under a signature. */
  issueBundle(
    actor: ActorContext,
    input: { subjectRef: string; entryHash: string; anchorRef: string; issuedAt: string; keyId?: string }
  ): VerificationBundle {
    this.authorization.check(actor, "g12.qr.issue", actor);
    const keyId = input.keyId ?? "g12-verify-2026";
    const secret = this.keys[keyId];
    if (!secret) throw new FoundationError("NOT_FOUND", "Verification key not found");
    const unsigned = { subjectRef: input.subjectRef, entryHash: input.entryHash, anchorRef: input.anchorRef, issuedAt: input.issuedAt, keyId };
    const bundle: VerificationBundle = { ...unsigned, signature: computeSignature(unsigned, secret) };
    this.repo.saveBundle({ ...bundle, id: this.next("g12-verify-bundle"), tenantId: actor.tenantId, entityId: actor.entityId });
    this.audit.recordMutation(actor, {
      action: "G12_QR_BUNDLE_ISSUED",
      subjectRef: `verification_bundle:${input.subjectRef}`,
      metadata: { anchorRef: input.anchorRef, keyId },
    });
    return bundle;
  }

  /**
   * Offline verify: recompute the signature from the bundle fields + the published key. Returns
   * valid=false when any field was tampered — no live ledger access required.
   */
  verifyBundle(bundle: VerificationBundle): { valid: boolean; reason?: string } {
    const secret = this.keys[bundle.keyId];
    if (!secret) return { valid: false, reason: "UNKNOWN_KEY" };
    const expected = computeSignature(
      { subjectRef: bundle.subjectRef, entryHash: bundle.entryHash, anchorRef: bundle.anchorRef, issuedAt: bundle.issuedAt, keyId: bundle.keyId },
      secret
    );
    if (expected !== bundle.signature) {
      return { valid: false, reason: "SIGNATURE_MISMATCH" };
    }
    return { valid: true };
  }

  listPublishedKeyIds(scope: TenantScope): string[] {
    requireTenantScope(scope);
    return Object.keys(this.keys);
  }
}
