import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";

/**
 * PH-09D — G11 pre-credit verification + disbursement persistence (BRD G11 FR-14, R15):
 *   E42 pen_bank_account_verifications (penny-drop / name-IFSC / NPCI-mapper result; IR16:
 *       no FIRST_PENSION / TERMINAL / GRATUITY / GPF / COMMUTED_VALUE line may transmit
 *       unless the account's verification row is PASSED — the gate FAILS CLOSED),
 *   pen_disbursements                  (instruction lines gated by the verification ref).
 * Physical tables per docs/data-model/11-G11-retirement-pension.sql (migration 0017).
 * All money is integer paise; name-match scores are integer basis points — no floats.
 */

export type AccountVerifyMethod = "PENNY_DROP" | "NAME_IFSC_MATCH" | "NPCI_MAPPER";
export type AccountVerifyResult = "PASSED" | "FAILED";
export type AccountVerifyStatus = "ACTIVE" | "SUPERSEDED" | "FAILED";
export type PenDisbursementLineType = "FIRST_PENSION" | "MONTHLY_PENSION" | "GRATUITY" | "COMMUTED_VALUE" | "GPF" | "TERMINAL";
export type PenDisbursementStatus = "AUTHORISED" | "TRANSMITTED";

/** E42 pen_bank_account_verifications row — the pre-credit gate state for one account. */
export interface PenBankAccountVerification {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  accountNoMasked: string;
  ifsc: string;
  accountName: string;
  method: AccountVerifyMethod;
  /** Name-match score in integer basis points (10000 = exact) — never a float. */
  nameMatchScoreBps?: number;
  verifiedName?: string;
  result: AccountVerifyResult;
  status: AccountVerifyStatus;
  verifiedAt: string;
}

/** One pension disbursement instruction line (subset of pen_disbursements). */
export interface PenDisbursement {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  employeeId: string;
  lineType: PenDisbursementLineType;
  accountNoMasked: string;
  ifsc: string;
  amountPaise: number;
  /** IR16 provenance: the PASSED E42 row this credit was gated on. */
  accountVerificationRef: string;
  status: PenDisbursementStatus;
}

export interface PensionDisbursementRepository {
  countVerifications(): number;
  saveVerification(row: PenBankAccountVerification): void;
  listVerificationsForCase(scope: TenantScope, caseId: string): PenBankAccountVerification[];
  findActiveVerification(scope: TenantScope, caseId: string, accountNoMasked: string, ifsc: string): PenBankAccountVerification | undefined;

  countDisbursements(): number;
  saveDisbursement(row: PenDisbursement): void;
  listDisbursementsForCase(scope: TenantScope, caseId: string): PenDisbursement[];
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory PensionDisbursementRepository (same seam as PgPensionDisbursementRepository). */
export class InMemoryPensionDisbursementRepository implements PensionDisbursementRepository {
  private readonly verifications: PenBankAccountVerification[] = [];
  private readonly disbursements: PenDisbursement[] = [];

  countVerifications(): number {
    return this.verifications.length;
  }

  saveVerification(row: PenBankAccountVerification): void {
    const index = this.verifications.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.verifications.push(row);
      return;
    }
    this.verifications[index] = row;
  }

  listVerificationsForCase(scope: TenantScope, caseId: string): PenBankAccountVerification[] {
    return this.verifications.filter((item) => rowInScope(item, scope) && item.caseId === caseId);
  }

  findActiveVerification(scope: TenantScope, caseId: string, accountNoMasked: string, ifsc: string): PenBankAccountVerification | undefined {
    return this.verifications.find(
      (item) =>
        rowInScope(item, scope) &&
        item.caseId === caseId &&
        item.accountNoMasked === accountNoMasked &&
        item.ifsc === ifsc &&
        item.status === "ACTIVE"
    );
  }

  countDisbursements(): number {
    return this.disbursements.length;
  }

  saveDisbursement(row: PenDisbursement): void {
    const index = this.disbursements.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.disbursements.push(row);
      return;
    }
    this.disbursements[index] = row;
  }

  listDisbursementsForCase(scope: TenantScope, caseId: string): PenDisbursement[] {
    return this.disbursements.filter((item) => rowInScope(item, scope) && item.caseId === caseId);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the migration-0017 DDL: pen_bank_account_verifications
// (E42) + pen_disbursements. All SQL is parameterised; recording a verification supersedes
// the prior ACTIVE row for the same account in ONE transaction (re-verification on
// bank-detail change, FR-14 BR1a). Money columns are NUMERIC(15,2); paise conversion
// happens in SQL — never through float parsing.
// ---------------------------------------------------------------------------------------

const SUPERSEDE_ACTIVE_VERIFICATIONS =
  "UPDATE pen_bank_account_verifications SET status = 'SUPERSEDED', updated_at = now() " +
  "WHERE tenant_id = $1 AND case_id = $2 AND account_no_masked = $3 AND ifsc = $4 AND status = 'ACTIVE'";

const INSERT_VERIFICATION =
  "INSERT INTO pen_bank_account_verifications (tenant_id, entity_id, case_id, account_no_masked, ifsc, account_name, method, " +
  "name_match_score, verified_name, result, status, verified_at, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric / 10000, $9, $10, $11, now(), $12) RETURNING id";

const SELECT_ACTIVE_PASSED_VERIFICATION =
  "SELECT id FROM pen_bank_account_verifications WHERE tenant_id = $1 AND case_id = $2 AND account_no_masked = $3 AND ifsc = $4 " +
  "AND status = 'ACTIVE' AND result = 'PASSED' AND is_deleted = false";

const INSERT_PEN_DISBURSEMENT =
  "INSERT INTO pen_disbursements (tenant_id, entity_id, case_id, employee_id, line_type, account_no_masked, ifsc, amount, " +
  "account_verification_ref, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric / 100, $9, $10, $11) RETURNING id";

/** Postgres-backed G11 pre-credit verification + disbursement repository (migration 0017). */
export class PgPensionDisbursementRepository {
  constructor(private readonly pool: Pool) {}

  /** Record a verification, superseding the prior ACTIVE row for the account — ONE transaction. */
  async insertVerification(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    accountNoMasked: string;
    ifsc: string;
    accountName: string;
    method: AccountVerifyMethod;
    nameMatchScoreBps?: number;
    verifiedName?: string;
    result: AccountVerifyResult;
    createdBy?: string;
  }): Promise<{ verificationId: string }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(SUPERSEDE_ACTIVE_VERIFICATIONS, [input.tenantId, input.caseId, input.accountNoMasked, input.ifsc]);
      const inserted = await client.query(INSERT_VERIFICATION, [
        input.tenantId,
        input.entityId ?? null,
        input.caseId,
        input.accountNoMasked,
        input.ifsc,
        input.accountName,
        input.method,
        input.nameMatchScoreBps ?? null,
        input.verifiedName ?? null,
        input.result,
        input.result === "PASSED" ? "ACTIVE" : "FAILED",
        input.createdBy ?? null,
      ]);
      return { verificationId: (inserted.rows[0] as { id: string }).id };
    });
  }

  /** IR16 gate probe: the ACTIVE PASSED verification row for the account, if any. */
  async findActivePassedVerification(tenantId: string, caseId: string, accountNoMasked: string, ifsc: string): Promise<string | undefined> {
    const result = await this.pool.query(SELECT_ACTIVE_PASSED_VERIFICATION, [tenantId, caseId, accountNoMasked, ifsc]);
    return (result.rows[0] as { id: string } | undefined)?.id;
  }

  async insertDisbursement(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    employeeId: string;
    lineType: PenDisbursementLineType;
    accountNoMasked: string;
    ifsc: string;
    amountPaise: number;
    accountVerificationRef: string;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_PEN_DISBURSEMENT, [
      input.tenantId,
      input.entityId ?? null,
      input.caseId,
      input.employeeId,
      input.lineType,
      input.accountNoMasked,
      input.ifsc,
      input.amountPaise,
      input.accountVerificationRef,
      "AUTHORISED",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }
}
