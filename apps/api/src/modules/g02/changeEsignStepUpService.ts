import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-17B — G02 strong e-signature and requester step-up authentication
 * (docs/brd/v3/G02-personal-details-modification-workflow.md FR-015 / FR-023):
 *
 * - E-signatures (esignatures): a change-request apply/commit is gated on a valid strong
 *   e-signature. Each signature binds a SHA-256 hash of the signed payload into an append-only
 *   per-request hash-chain (payload_hash + prev_hash); the method must be permitted by policy
 *   (ERR-G02-ESIGN-METHOD) and applying without a signature fails closed (ERR-G02-ESIGN).
 * - Requester step-up (cr_step_up_events): a HIGH/STATUTORY self-service submission requires a
 *   completed step-up challenge within its validity window, else ERR-G02-STEPUP.
 *
 * No secret material is embedded; the SHA-256 chain is over caller-supplied payloads only.
 */

export type EsignMethod = "AADHAAR_OTP" | "DSC" | "HSM";
export type StepUpStatus = "CHALLENGED" | "VERIFIED" | "EXPIRED";

/** esignatures — one append-only signature row per signing, chained by SHA-256. */
export interface ChangeEsignature {
  id: string;
  tenantId: string;
  entityId?: string;
  changeRequestId: string;
  signerUserId: string;
  method: EsignMethod;
  payloadHash: string;
  prevHash: string;
  entryHash: string;
  sequenceNo: number;
  signedAt: string;
}

/** cr_step_up_events — a step-up challenge/verification for a requester submission. */
export interface StepUpEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  changeRequestId: string;
  requesterUserId: string;
  status: StepUpStatus;
  verifiedAt?: string;
  expiresAt: string;
}

export interface ChangeEsignStepUpRepository {
  appendEsignature(row: ChangeEsignature): void;
  listEsignatures(scope: TenantScope, changeRequestId: string): ChangeEsignature[];
  saveStepUp(row: StepUpEvent): void;
  findStepUp(scope: TenantScope, id: string): StepUpEvent | undefined;
  latestVerifiedStepUp(scope: TenantScope, changeRequestId: string, requesterUserId: string): StepUpEvent | undefined;
}

export class InMemoryChangeEsignStepUpRepository implements ChangeEsignStepUpRepository {
  private readonly esigs: ChangeEsignature[] = [];
  private readonly stepups: StepUpEvent[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  appendEsignature(row: ChangeEsignature): void { this.esigs.push({ ...row }); }
  listEsignatures(scope: TenantScope, changeRequestId: string): ChangeEsignature[] {
    return this.esigs.filter((e) => e.changeRequestId === changeRequestId && this.scoped(e, scope)).sort((a, b) => a.sequenceNo - b.sequenceNo).map((e) => ({ ...e }));
  }
  saveStepUp(row: StepUpEvent): void {
    const i = this.stepups.findIndex((s) => s.id === row.id);
    if (i >= 0) this.stepups[i] = { ...row }; else this.stepups.push({ ...row });
  }
  findStepUp(scope: TenantScope, id: string): StepUpEvent | undefined {
    const row = this.stepups.find((s) => s.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  latestVerifiedStepUp(scope: TenantScope, changeRequestId: string, requesterUserId: string): StepUpEvent | undefined {
    const rows = this.stepups.filter((s) => s.changeRequestId === changeRequestId && s.requesterUserId === requesterUserId && s.status === "VERIFIED" && this.scoped(s, scope));
    const last = rows[rows.length - 1];
    return last ? { ...last } : undefined;
  }
}

const GENESIS = "0".repeat(64);
function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export class ChangeEsignStepUpService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: ChangeEsignStepUpRepository = new InMemoryChangeEsignStepUpRepository(),
    private readonly allowedMethods: EsignMethod[] = ["AADHAAR_OTP", "DSC", "HSM"]
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Raise a step-up challenge for a requester submission (valid for validitySeconds). */
  challengeStepUp(
    actor: ActorContext,
    input: { changeRequestId: string; issuedAt: string; expiresAt: string }
  ): StepUpEvent {
    this.authorization.check(actor, "g02.stepup.challenge", actor);
    const event: StepUpEvent = {
      id: this.next("g02-stepup"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      changeRequestId: input.changeRequestId,
      requesterUserId: actor.userId,
      status: "CHALLENGED",
      expiresAt: input.expiresAt,
    };
    this.repo.saveStepUp(event);
    return { ...event };
  }

  verifyStepUp(actor: ActorContext, stepUpId: string, input: { verifiedAt: string }): StepUpEvent {
    this.authorization.check(actor, "g02.stepup.verify", actor);
    const event = this.repo.findStepUp(actor, stepUpId);
    if (!event) throw new FoundationError("NOT_FOUND", "Step-up event not found");
    if (input.verifiedAt > event.expiresAt) {
      event.status = "EXPIRED";
      this.repo.saveStepUp(event);
      throw new FoundationError("ERR-G02-STEPUP", "Step-up challenge expired before verification", { details: { stepUpId } });
    }
    event.status = "VERIFIED";
    event.verifiedAt = input.verifiedAt;
    this.repo.saveStepUp(event);
    this.audit.recordMutation(actor, {
      action: "G02_STEP_UP_VERIFIED",
      subjectRef: `cr_step_up_events:${event.id}`,
      metadata: { changeRequestId: event.changeRequestId },
    });
    return { ...event };
  }

  /**
   * Gate a HIGH/STATUTORY self-service submission on a completed step-up. Throws ERR-G02-STEPUP
   * when no VERIFIED step-up exists for the requester on this request.
   */
  assertStepUpForSubmission(actor: ActorContext, input: { changeRequestId: string; sensitivity: "LOW" | "HIGH" | "STATUTORY" }): void {
    if (input.sensitivity === "LOW") return;
    const verified = this.repo.latestVerifiedStepUp(actor, input.changeRequestId, actor.userId);
    if (!verified) {
      throw new FoundationError("ERR-G02-STEPUP", "A HIGH/STATUTORY self-service submission requires a completed step-up", {
        details: { changeRequestId: input.changeRequestId, sensitivity: input.sensitivity },
      });
    }
  }

  /** Append a strong e-signature, binding a SHA-256 of the payload into the per-request chain. */
  signChange(
    actor: ActorContext,
    input: { changeRequestId: string; method: EsignMethod; payload: unknown; signedAt: string }
  ): ChangeEsignature {
    this.authorization.check(actor, "g02.esign.sign", actor);
    if (!this.allowedMethods.includes(input.method)) {
      throw new FoundationError("ERR-G02-ESIGN-METHOD", "E-signature method is not permitted by policy", {
        details: { method: input.method, allowed: this.allowedMethods },
      });
    }
    const chain = this.repo.listEsignatures(actor, input.changeRequestId);
    const prevHash = chain.length ? chain[chain.length - 1]!.entryHash : GENESIS;
    const sequenceNo = chain.length + 1;
    const payloadHash = sha256Hex(JSON.stringify(input.payload ?? null));
    const entryHash = sha256Hex(`${prevHash}|${payloadHash}|${actor.userId}|${input.method}|${sequenceNo}`);
    const signature: ChangeEsignature = {
      id: this.next("g02-esign"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      changeRequestId: input.changeRequestId,
      signerUserId: actor.userId,
      method: input.method,
      payloadHash,
      prevHash,
      entryHash,
      sequenceNo,
      signedAt: input.signedAt,
    };
    this.repo.appendEsignature(signature);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_ESIGNED",
      subjectRef: `esignatures:${signature.id}`,
      metadata: { method: signature.method, sequenceNo, payloadHash },
    });
    return { ...signature };
  }

  /**
   * Assert the change carries a valid strong e-signature before apply/commit. Throws ERR-G02-ESIGN
   * when no signature exists, and verifies the SHA-256 hash-chain integrity of what is present.
   */
  assertSignedForCommit(actor: ActorContext, changeRequestId: string): ChangeEsignature {
    const chain = this.repo.listEsignatures(actor, changeRequestId);
    if (chain.length === 0) {
      throw new FoundationError("ERR-G02-ESIGN", "The change must be strongly e-signed before commit", {
        details: { changeRequestId },
      });
    }
    let prev = GENESIS;
    for (const sig of chain) {
      const recomputed = sha256Hex(`${prev}|${sig.payloadHash}|${sig.signerUserId}|${sig.method}|${sig.sequenceNo}`);
      if (sig.prevHash !== prev || sig.entryHash !== recomputed) {
        throw new FoundationError("ERR-G02-ESIGN", "E-signature hash-chain integrity check failed", {
          details: { changeRequestId, sequenceNo: sig.sequenceNo },
        });
      }
      prev = sig.entryHash;
    }
    return { ...chain[chain.length - 1]! };
  }

  listEsignatures(scope: TenantScope, changeRequestId: string): ChangeEsignature[] {
    requireTenantScope(scope);
    return this.repo.listEsignatures(scope, changeRequestId);
  }
}
