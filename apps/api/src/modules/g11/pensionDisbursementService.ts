import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import {
  AccountVerifyMethod,
  AccountVerifyResult,
  PenBankAccountVerification,
  PenDisbursement,
  PenDisbursementLineType,
  PensionDisbursementRepository,
} from "./pensionDisbursementRepository";
import { PensionService } from "./pensionService";

/**
 * PH-09D — G11 FR-14 pre-credit account verification gate (E42, IR16, R15):
 *
 * Before ANY first-credit disbursement line (FIRST_PENSION / GRATUITY / COMMUTED_VALUE /
 * GPF / TERMINAL) transmits, the destination account must hold an ACTIVE, PASSED
 * pen_bank_account_verifications row (PENNY_DROP / NAME_IFSC_MATCH / NPCI_MAPPER). The
 * gate FAILS CLOSED: an absent, failed, or superseded verification blocks the credit with
 * ERR-G11-ACCOUNT-VERIFY (422) — a wrong-account payment is prevented, never detected
 * after the fact. Re-verification on bank-detail change supersedes the prior ACTIVE row.
 *
 * All money is integer paise; name-match scores are integer basis points — no floats.
 */

const VERIFY_METHODS: ReadonlySet<string> = new Set<AccountVerifyMethod>(["PENNY_DROP", "NAME_IFSC_MATCH", "NPCI_MAPPER"]);
const FIRST_CREDIT_LINE_TYPES: ReadonlySet<PenDisbursementLineType> = new Set<PenDisbursementLineType>([
  "FIRST_PENSION",
  "GRATUITY",
  "COMMUTED_VALUE",
  "GPF",
  "TERMINAL",
]);

export class PensionDisbursementService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly pension: PensionService,
    private readonly repository: PensionDisbursementRepository
  ) {}

  /**
   * E42: record one account-verification outcome (the X.3 penny-drop / name-IFSC / NPCI
   * mapper result). A PASSED result becomes the account's ACTIVE row, superseding any
   * prior ACTIVE row (BR1a re-verification); a FAILED result is stored FAILED — it never
   * satisfies the gate.
   */
  recordAccountVerification(
    actor: ActorContext,
    input: {
      caseId: string;
      accountNoMasked: string;
      ifsc: string;
      accountName: string;
      method: AccountVerifyMethod;
      nameMatchScoreBps?: number;
      verifiedName?: string;
      result: AccountVerifyResult;
    }
  ): PenBankAccountVerification {
    this.authorization.check(actor, "g11.account.verify", actor);
    if (!VERIFY_METHODS.has(input.method)) {
      throw new FoundationError("VALIDATION_FAILED", "method must be PENNY_DROP, NAME_IFSC_MATCH, or NPCI_MAPPER", { field: "method" });
    }
    if (input.result !== "PASSED" && input.result !== "FAILED") {
      throw new FoundationError("VALIDATION_FAILED", "result must be PASSED or FAILED", { field: "result" });
    }
    if (input.nameMatchScoreBps !== undefined && (!Number.isInteger(input.nameMatchScoreBps) || input.nameMatchScoreBps < 0 || input.nameMatchScoreBps > 10000)) {
      throw new FoundationError("VALIDATION_FAILED", "nameMatchScoreBps must be an integer between 0 and 10000", { field: "nameMatchScoreBps" });
    }
    const pensionCase = this.pension.getCase(actor, input.caseId);
    // Re-verification supersedes the prior ACTIVE row for the same account (FR-14 BR1a).
    const prior = this.repository.findActiveVerification(actor, input.caseId, input.accountNoMasked, input.ifsc);
    if (prior) {
      prior.status = "SUPERSEDED";
      this.repository.saveVerification(prior);
    }
    const verification: PenBankAccountVerification = {
      id: nextId("pen-account-verification", this.repository.countVerifications()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId: pensionCase.id,
      accountNoMasked: input.accountNoMasked,
      ifsc: input.ifsc,
      accountName: input.accountName,
      method: input.method,
      nameMatchScoreBps: input.nameMatchScoreBps,
      verifiedName: input.verifiedName,
      result: input.result,
      status: input.result === "PASSED" ? "ACTIVE" : "FAILED",
      verifiedAt: pensionCase.separationDate,
    };
    this.repository.saveVerification(verification);
    this.audit.recordMutation(actor, {
      action: "G11_ACCOUNT_VERIFICATION_RECORDED",
      subjectRef: `pen_bank_account_verifications:${verification.id}`,
      metadata: { caseId: pensionCase.id, method: input.method, result: input.result, supersededPriorId: prior?.id },
    });
    return { ...verification };
  }

  /**
   * FR-14 AC1a / IR16 — the pre-credit gate, FAIL CLOSED: a first-credit line transmits
   * ONLY against an ACTIVE PASSED verification for exactly that account. Absent, failed,
   * or superseded verification blocks with ERR-G11-ACCOUNT-VERIFY (422); the case must
   * have reached PPO_ISSUED before any credit is authorised.
   */
  disburse(
    actor: ActorContext,
    input: { caseId: string; lineType: PenDisbursementLineType; accountNoMasked: string; ifsc: string; amountPaise: number }
  ): PenDisbursement {
    this.authorization.check(actor, "g11.disbursement.transmit", actor);
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "amountPaise must be positive integer paise", { field: "amountPaise" });
    }
    if (!FIRST_CREDIT_LINE_TYPES.has(input.lineType) && input.lineType !== "MONTHLY_PENSION") {
      throw new FoundationError("VALIDATION_FAILED", "lineType is not a recognised pension disbursement line type", { field: "lineType" });
    }
    const pensionCase = this.pension.getCase(actor, input.caseId);
    if (pensionCase.status !== "PPO_ISSUED" && pensionCase.status !== "SETTLED") {
      throw new FoundationError("PRECONDITION_FAILED", "Pension disbursement requires an issued PPO");
    }
    const verification = this.repository.findActiveVerification(actor, input.caseId, input.accountNoMasked, input.ifsc);
    if (!verification || verification.result !== "PASSED") {
      // IR16 fail-closed gate: no ACTIVE PASSED E42 row => the credit is blocked, full stop.
      throw new FoundationError("ERR-G11-ACCOUNT-VERIFY", "Account verification has not PASSED for this account — disbursement is blocked", {
        field: "accountNoMasked",
        details: {
          marker: "IR16",
          caseId: pensionCase.id,
          lineType: input.lineType,
          verificationStatus: verification?.status ?? "ABSENT",
        },
      });
    }
    const disbursement: PenDisbursement = {
      id: nextId("pen-disbursement", this.repository.countDisbursements()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId: pensionCase.id,
      employeeId: pensionCase.employeeId,
      lineType: input.lineType,
      accountNoMasked: input.accountNoMasked,
      ifsc: input.ifsc,
      amountPaise: input.amountPaise,
      accountVerificationRef: verification.id,
      status: "TRANSMITTED",
    };
    this.repository.saveDisbursement(disbursement);
    this.audit.recordMutation(actor, {
      action: "G11_PENSION_DISBURSED",
      subjectRef: `pen_disbursements:${disbursement.id}`,
      metadata: { caseId: pensionCase.id, lineType: input.lineType, amountPaise: input.amountPaise, accountVerificationRef: verification.id },
    });
    return { ...disbursement };
  }

  listVerifications(scope: TenantScope, caseId: string): PenBankAccountVerification[] {
    requireTenantScope(scope);
    return this.repository.listVerificationsForCase(scope, caseId).map((row) => ({ ...row }));
  }

  listDisbursements(scope: TenantScope, caseId: string): PenDisbursement[] {
    requireTenantScope(scope);
    return this.repository.listDisbursementsForCase(scope, caseId).map((row) => ({ ...row }));
  }
}
