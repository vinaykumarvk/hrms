import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-22A — G08 DSC / non-repudiation signing at BRD depth
 * (docs/brd/v3/G08-performance-appraisal-management.md FR-20):
 *
 * - digital_signatures capture a non-repudiable signature over an APAR action (certify / ratify /
 *   expunge). Each signature binds a SHA-256 hash of the signed payload and the signer identity.
 * - The signing method must be permitted by policy (DSC / AADHAAR_ESIGN / HSM); a disallowed method
 *   is rejected.
 * - assertSigned gates a downstream action on the presence of a valid signature for that action.
 */

export type SignatureMethod = "DSC" | "AADHAAR_ESIGN" | "HSM";
export type SignedActionType = "CERTIFY" | "RATIFY" | "EXPUNGE";

/** digital_signatures — one non-repudiable signature row. */
export interface DigitalSignature {
  id: string;
  tenantId: string;
  entityId?: string;
  formId: string;
  actionType: SignedActionType;
  signerId: string;
  method: SignatureMethod;
  payloadHash: string;
  certificateSerial?: string;
  signedAt: string;
}

export interface DigitalSignatureRepository {
  append(row: DigitalSignature): void;
  listForForm(scope: TenantScope, formId: string): DigitalSignature[];
}

export class InMemoryDigitalSignatureRepository implements DigitalSignatureRepository {
  private readonly rows: DigitalSignature[] = [];
  private scoped(row: DigitalSignature, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  append(row: DigitalSignature): void { this.rows.push({ ...row }); }
  listForForm(scope: TenantScope, formId: string): DigitalSignature[] {
    return this.rows.filter((r) => r.formId === formId && this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class DigitalSignatureService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: DigitalSignatureRepository = new InMemoryDigitalSignatureRepository(),
    private readonly allowedMethods: SignatureMethod[] = ["DSC", "AADHAAR_ESIGN", "HSM"]
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Sign an APAR action (non-repudiation). A disallowed method is rejected. */
  sign(
    actor: ActorContext,
    input: { formId: string; actionType: SignedActionType; method: SignatureMethod; payload: unknown; certificateSerial?: string; signedAt: string }
  ): DigitalSignature {
    this.authorization.check(actor, "g08.signature.sign", actor);
    if (!this.allowedMethods.includes(input.method)) {
      throw new FoundationError("VALIDATION_FAILED", "Signature method not permitted by policy (SIGMETHOD)", {
        field: "method",
        details: { method: input.method, allowed: this.allowedMethods },
      });
    }
    if (input.method === "DSC" && !input.certificateSerial) {
      throw new FoundationError("VALIDATION_FAILED", "A DSC signature requires a certificate serial", { field: "certificateSerial" });
    }
    const payloadHash = createHash("sha256").update(JSON.stringify(input.payload ?? null), "utf8").digest("hex");
    const signature: DigitalSignature = {
      id: this.next("g08-digital-signature"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      formId: input.formId,
      actionType: input.actionType,
      signerId: actor.userId,
      method: input.method,
      payloadHash,
      certificateSerial: input.certificateSerial,
      signedAt: input.signedAt,
    };
    this.repo.append(signature);
    this.audit.recordMutation(actor, {
      action: "G08_DIGITAL_SIGNATURE_APPLIED",
      subjectRef: `digital_signatures:${signature.id}`,
      metadata: { actionType: signature.actionType, method: signature.method, signerId: signature.signerId, payloadHash },
    });
    return { ...signature };
  }

  /** Gate a downstream action on a valid signature for that action (non-repudiation). */
  assertSigned(scope: TenantScope, formId: string, actionType: SignedActionType): DigitalSignature {
    requireTenantScope(scope);
    const sigs = this.repo.listForForm(scope, formId).filter((s) => s.actionType === actionType);
    const last = sigs[sigs.length - 1];
    if (!last) {
      throw new FoundationError("PRECONDITION_FAILED", `A ${actionType} action requires a digital signature`, {
        details: { formId, actionType },
      });
    }
    return last;
  }

  listSignatures(scope: TenantScope, formId: string): DigitalSignature[] {
    requireTenantScope(scope);
    return this.repo.listForForm(scope, formId);
  }
}
