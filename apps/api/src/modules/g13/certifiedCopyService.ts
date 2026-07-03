import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { DocumentVaultService } from "./documentVaultService";

/**
 * PH-20B — G13 watermarking and certified true copies at BRD depth
 * (docs/brd/v3/G13-document-management-secure-storage.md FR-011):
 *
 * - certified_copies are issued from a source document that is ACTIVE (a DISPOSED/QUARANTINED/
 *   PENDING source cannot be certified — fail closed).
 * - Each certified copy carries a visible watermark stamp (issuing authority + timestamp + a
 *   verification code) and records the issuing authority; the rendering digest binds the watermark
 *   so the copy is tamper-evident.
 */

export interface CertifiedCopy {
  id: string;
  tenantId: string;
  entityId?: string;
  sourceDocumentId: string;
  issuedBy: string;
  issuingAuthority: string;
  purpose: string;
  watermarkText: string;
  verificationCode: string;
  renderingDigest: string;
  issuedAt: string;
}

export interface CertifiedCopyRepository {
  save(row: CertifiedCopy): void;
  find(scope: TenantScope, id: string): CertifiedCopy | undefined;
  listBySource(scope: TenantScope, sourceDocumentId: string): CertifiedCopy[];
}

export class InMemoryCertifiedCopyRepository implements CertifiedCopyRepository {
  private readonly rows: CertifiedCopy[] = [];
  private scoped(row: CertifiedCopy, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: CertifiedCopy): void { this.rows.push({ ...row }); }
  find(scope: TenantScope, id: string): CertifiedCopy | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listBySource(scope: TenantScope, sourceDocumentId: string): CertifiedCopy[] {
    return this.rows.filter((r) => r.sourceDocumentId === sourceDocumentId && this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class CertifiedCopyService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly documentVault: DocumentVaultService,
    private readonly repo: CertifiedCopyRepository = new InMemoryCertifiedCopyRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * Issue a certified true copy of an ACTIVE source document, stamping a watermark and recording
   * the issuing authority. A non-ACTIVE source is rejected fail-closed.
   */
  issueCertifiedCopy(
    actor: ActorContext,
    input: { sourceDocumentId: string; sourceStatus: string; issuingAuthority: string; purpose: string; issuedAt: string }
  ): CertifiedCopy {
    this.authorization.check(actor, "g13.certifiedcopy.issue", actor);
    if (input.sourceStatus !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE source document may be certified", {
        details: { sourceDocumentId: input.sourceDocumentId, sourceStatus: input.sourceStatus },
      });
    }
    const verificationCode = createHash("sha256")
      .update(`${actor.tenantId}|${input.sourceDocumentId}|${this.counter + 1}|${input.issuedAt}`, "utf8")
      .digest("hex")
      .slice(0, 12)
      .toUpperCase();
    const watermarkText = `CERTIFIED TRUE COPY — ${input.issuingAuthority} — ${input.issuedAt} — VERIFY:${verificationCode}`;
    const renderingDigest = createHash("sha256").update(`${input.sourceDocumentId}|${watermarkText}`, "utf8").digest("hex");
    const copy: CertifiedCopy = {
      id: this.next("g13-certified-copy"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      sourceDocumentId: input.sourceDocumentId,
      issuedBy: actor.userId,
      issuingAuthority: input.issuingAuthority,
      purpose: input.purpose,
      watermarkText,
      verificationCode,
      renderingDigest,
      issuedAt: input.issuedAt,
    };
    this.repo.save(copy);
    this.audit.recordMutation(actor, {
      action: "G13_CERTIFIED_COPY_ISSUED",
      subjectRef: `certified_copies:${copy.id}`,
      metadata: { sourceDocumentId: copy.sourceDocumentId, verificationCode: copy.verificationCode },
    });
    return { ...copy };
  }

  listBySource(scope: TenantScope, sourceDocumentId: string): CertifiedCopy[] {
    requireTenantScope(scope);
    return this.repo.listBySource(scope, sourceDocumentId);
  }
}
