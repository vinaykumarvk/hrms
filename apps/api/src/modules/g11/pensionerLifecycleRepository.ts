import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";

/**
 * PH-15B — BRD G11 FR-12 pensioner master & lifecycle persisted per
 * docs/data-model/11-G11-retirement-pension.sql (migration apps/api/db/migrations/0023):
 *   E14 pen_pensioners        — master row created ON PPO AUTHORISATION (never hand-keyed
 *       detached from a PPO); lifecycle ACTIVE <-> SUSPENDED_NO_LC -> DECEASED ->
 *       CONVERTED_TO_FAMILY (AC1/AC2/AC4);
 *   E15 pen_life_certificates — annual LC/DLC rows with due/grace evaluation; an overdue LC
 *       beyond grace suspends disbursement, submission releases the hold with arrear;
 *   E26 pen_family_members    — the statutory Form 3/14 register; family-pension conversion
 *       derives its beneficiary from statutory_rank here (IR8/BR3), never from nominees.
 * All money is integer paise; date arithmetic is pure integer civil-date math — no floats,
 * no Date parsing.
 */

export type G11PensionerType = "SELF" | "FAMILY";
export type G11PensionerLifecycleStatus =
  | "ACTIVE"
  | "SUSPENDED_NO_LC"
  | "DECEASED"
  | "CONVERTED_TO_FAMILY"
  | "FAMILY_PENSION_ACTIVE"
  | "CEASED";
export type G11DeathSource = "REPORTED" | "DEATH_REGISTRY" | "DBT_ANOMALY" | "LC_FAILURE";
export type G11LcMethod = "JEEVAN_PRAMAAN_DLC" | "PHYSICAL" | "VIDEO_KYC" | "BANK_CERTIFIED";
export type G11LcStatus = "ACTIVE" | "SUPERSEDED";
export type G11DisbursementModel = "M11_COMPUTES_FULL" | "PDA_APPLIES_RELIEF";
export type G11FamilyMemberStatus = "ACTIVE" | "CEASED" | "INELIGIBLE";
export type G11PpoType = "SERVICE_PENSION" | "FAMILY_PENSION";

/** E14 pen_pensioners row — one lifecycle master per PPO-authorised pensioner. */
export interface PenPensioner {
  id: string;
  tenantId: string;
  entityId?: string;
  pensionerNo: string;
  caseId: string;
  employeeId: string;
  /** The authorising PPO — a pensioner row NEVER exists without one (FR-12). */
  ppoId: string;
  ppoNo: string;
  ppoType: G11PpoType;
  pensionerType: G11PensionerType;
  /** Current basic pension in integer paise (updated only by applied revisions/restoration). */
  currentPensionBasicPaise: number;
  /** Current monthly Dearness Relief in integer paise (E30-derived, revision-applied). */
  currentDaReliefPaise: number;
  disbursementModel: G11DisbursementModel;
  /** AC1: yearly LC due date; overdue beyond grace suspends to SUSPENDED_NO_LC. */
  lifeCertValidUntil?: string;
  /** Set while SUSPENDED_NO_LC — the release arrear is counted from this date (AC2). */
  suspendedFrom?: string;
  dateOfDeath?: string;
  deathDetectedSource?: G11DeathSource;
  /** FAMILY rows: the deceased SELF pensioner this row was converted from (AC4). */
  sourcePensionerId?: string;
  /** FAMILY rows: the E26 pen_family_members beneficiary (BR3 hierarchy). */
  familyMemberId?: string;
  /** FAMILY rows: FK to the E10 pen_family_pension_records computation consumed. */
  familyPensionRef?: string;
  lifecycleStatus: G11PensionerLifecycleStatus;
}

/** E15 pen_life_certificates row. */
export interface PenLifeCertificate {
  id: string;
  tenantId: string;
  entityId?: string;
  pensionerId: string;
  certificateYear: number;
  method: G11LcMethod;
  jeevanPramaanId?: string;
  submittedOn: string;
  validUntil: string;
  result: "VALID";
  status: G11LcStatus;
}

/** E26 pen_family_members row (statutory register subset consumed by conversion). */
export interface PenFamilyMember {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  memberName: string;
  relation: string;
  dateOfBirth?: string;
  /** IR8: conversion eligibility order — lowest ACTIVE rank converts first. */
  statutoryRank: number;
  status: G11FamilyMemberStatus;
}

export interface PensionerLifecycleRepository {
  countPensioners(): number;
  countLifeCertificates(): number;
  countFamilyMembers(): number;
  insertPensioner(row: PenPensioner): void;
  savePensioner(row: PenPensioner): void;
  findPensionerById(scope: TenantScope, pensionerId: string): PenPensioner | undefined;
  findPensionerByCase(scope: TenantScope, caseId: string): PenPensioner | undefined;
  listPensioners(scope: TenantScope): PenPensioner[];
  insertFamilyMember(row: PenFamilyMember): void;
  listFamilyMembers(scope: TenantScope, employeeId: string): PenFamilyMember[];
  listLifeCertificates(scope: TenantScope, pensionerId: string): PenLifeCertificate[];
  /**
   * AC2 release path — supersede the prior ACTIVE LC, store the new one, and persist the
   * reactivated pensioner state in ONE atomic unit (a transaction in the Pg repository).
   */
  recordLifeCertificate(certificate: PenLifeCertificate, pensioner: PenPensioner): void;
  /**
   * AC4 death conversion — persist the deceased pensioner's terminal state and the spawned
   * FAMILY pensioner row in ONE atomic unit (a transaction in the Pg repository).
   */
  applyDeathConversion(deceased: PenPensioner, familyPensioner: PenPensioner): void;
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory PensionerLifecycleRepository (same seam as PgPensionerLifecycleRepository). */
export class InMemoryPensionerLifecycleRepository implements PensionerLifecycleRepository {
  private readonly pensioners: PenPensioner[] = [];
  private readonly lifeCertificates: PenLifeCertificate[] = [];
  private readonly familyMembers: PenFamilyMember[] = [];

  countPensioners(): number {
    return this.pensioners.length;
  }

  countLifeCertificates(): number {
    return this.lifeCertificates.length;
  }

  countFamilyMembers(): number {
    return this.familyMembers.length;
  }

  insertPensioner(row: PenPensioner): void {
    this.pensioners.push(row);
  }

  savePensioner(row: PenPensioner): void {
    const index = this.pensioners.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.pensioners.push(row);
      return;
    }
    this.pensioners[index] = row;
  }

  findPensionerById(scope: TenantScope, pensionerId: string): PenPensioner | undefined {
    return this.pensioners.find((item) => rowInScope(item, scope) && item.id === pensionerId);
  }

  findPensionerByCase(scope: TenantScope, caseId: string): PenPensioner | undefined {
    return this.pensioners.find((item) => rowInScope(item, scope) && item.caseId === caseId && item.pensionerType === "SELF");
  }

  listPensioners(scope: TenantScope): PenPensioner[] {
    return this.pensioners.filter((item) => rowInScope(item, scope));
  }

  insertFamilyMember(row: PenFamilyMember): void {
    this.familyMembers.push(row);
  }

  listFamilyMembers(scope: TenantScope, employeeId: string): PenFamilyMember[] {
    return this.familyMembers.filter((item) => rowInScope(item, scope) && item.employeeId === employeeId);
  }

  listLifeCertificates(scope: TenantScope, pensionerId: string): PenLifeCertificate[] {
    return this.lifeCertificates.filter((item) => rowInScope(item, scope) && item.pensionerId === pensionerId);
  }

  recordLifeCertificate(certificate: PenLifeCertificate, pensioner: PenPensioner): void {
    for (const row of this.lifeCertificates) {
      if (row.tenantId === certificate.tenantId && row.pensionerId === certificate.pensionerId && row.status === "ACTIVE") {
        row.status = "SUPERSEDED";
      }
    }
    this.lifeCertificates.push(certificate);
    this.savePensioner(pensioner);
  }

  applyDeathConversion(deceased: PenPensioner, familyPensioner: PenPensioner): void {
    this.savePensioner(deceased);
    this.insertPensioner(familyPensioner);
  }
}

// ---------------------------------------------------------------------------------------
// PURE deterministic civil-date helpers — integer math only (no Date, no floats)
// ---------------------------------------------------------------------------------------

/** ISO date -> days since 1970-01-01 (Howard Hinnant days-from-civil, pure integers). */
export function isoToEpochDays(isoDate: string): number {
  const rawYear = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const year = month <= 2 ? rawYear - 1 : rawYear;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Days since 1970-01-01 -> ISO date (civil-from-days, pure integers). */
export function epochDaysToIso(epochDays: number): string {
  const z = epochDays + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const yearBase = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const year = yearBase + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO date + whole days (grace-window arithmetic, BR1). */
export function addGraceDaysIso(isoDate: string, days: number): string {
  return epochDaysToIso(isoToEpochDays(isoDate) + days);
}

/** Zero-based month index (year*12 + month) for month-wise arrear spans. */
export function monthIndexOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4)) * 12 + (Number(isoDate.slice(5, 7)) - 1);
}

/** Inclusive YYYY-MM keys from the month of `fromIso` to the month of `toIso`. */
export function monthKeysBetween(fromIso: string, toIso: string): string[] {
  const keys: string[] = [];
  for (let index = monthIndexOf(fromIso); index <= monthIndexOf(toIso); index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    keys.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the migration-0023 DDL: pen_pensioners (E14),
// pen_life_certificates (E15), pen_family_members (E26). All SQL is parameterised; the
// LC-submit release and the death conversion each run in ONE transaction. Money columns
// are NUMERIC(15,2); paise conversion happens in SQL — never through float parsing.
// ---------------------------------------------------------------------------------------

const INSERT_PENSIONER =
  "INSERT INTO pen_pensioners (tenant_id, entity_id, pensioner_no, case_id, employee_id, ppo_id, ppo_no, ppo_type, pensioner_type, " +
  "current_pension_basic, current_da_relief, disbursement_model, life_cert_valid_until, source_pensioner_id, family_member_id, " +
  "family_pension_ref, lifecycle_status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::numeric / 100, $11::numeric / 100, $12, $13, $14, $15, $16, $17, $18) RETURNING id";

const SUPERSEDE_ACTIVE_LC =
  "UPDATE pen_life_certificates SET status = 'SUPERSEDED', updated_at = now() WHERE tenant_id = $1 AND pensioner_id = $2 AND status = 'ACTIVE'";

const INSERT_LIFE_CERTIFICATE =
  "INSERT INTO pen_life_certificates (tenant_id, entity_id, pensioner_id, certificate_year, method, jeevan_pramaan_id, submitted_on, " +
  "valid_until, result, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALID', 'ACTIVE', $9) RETURNING id";

const UPDATE_PENSIONER_LC_STATE =
  "UPDATE pen_pensioners SET life_cert_valid_until = $3, suspended_from = $4, lifecycle_status = $5, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const UPDATE_PENSIONER_DEATH =
  "UPDATE pen_pensioners SET date_of_death = $3, death_detected_source = $4, lifecycle_status = 'CONVERTED_TO_FAMILY', updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

/** Postgres-backed G11 pensioner-lifecycle repository (migration 0023). */
export class PgPensionerLifecycleRepository {
  constructor(private readonly pool: Pool) {}

  async insertPensioner(row: PenPensioner, createdBy?: string): Promise<{ pensionerId: string }> {
    const inserted = await this.pool.query(INSERT_PENSIONER, this.pensionerParams(row, createdBy));
    return { pensionerId: (inserted.rows[0] as { id: string }).id };
  }

  /** AC2: supersede + insert LC + reactivate/refresh the pensioner — ONE transaction. */
  async recordLifeCertificate(certificate: PenLifeCertificate, pensioner: PenPensioner, createdBy?: string): Promise<{ lifeCertificateId: string }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(SUPERSEDE_ACTIVE_LC, [certificate.tenantId, certificate.pensionerId]);
      const inserted = await client.query(INSERT_LIFE_CERTIFICATE, [
        certificate.tenantId,
        certificate.entityId ?? null,
        certificate.pensionerId,
        certificate.certificateYear,
        certificate.method,
        certificate.jeevanPramaanId ?? null,
        certificate.submittedOn,
        certificate.validUntil,
        createdBy ?? null,
      ]);
      await client.query(UPDATE_PENSIONER_LC_STATE, [
        pensioner.tenantId,
        pensioner.id,
        pensioner.lifeCertValidUntil ?? null,
        pensioner.suspendedFrom ?? null,
        pensioner.lifecycleStatus,
      ]);
      return { lifeCertificateId: (inserted.rows[0] as { id: string }).id };
    });
  }

  /** AC4: terminal state on the deceased + the spawned FAMILY row — ONE transaction. */
  async applyDeathConversion(deceased: PenPensioner, familyPensioner: PenPensioner, createdBy?: string): Promise<{ familyPensionerId: string }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(UPDATE_PENSIONER_DEATH, [deceased.tenantId, deceased.id, deceased.dateOfDeath, deceased.deathDetectedSource ?? "REPORTED"]);
      const inserted = await client.query(INSERT_PENSIONER, this.pensionerParams(familyPensioner, createdBy));
      return { familyPensionerId: (inserted.rows[0] as { id: string }).id };
    });
  }

  private pensionerParams(row: PenPensioner, createdBy?: string): unknown[] {
    return [
      row.tenantId,
      row.entityId ?? null,
      row.pensionerNo,
      row.caseId,
      row.employeeId,
      row.ppoId,
      row.ppoNo,
      row.ppoType,
      row.pensionerType,
      row.currentPensionBasicPaise,
      row.currentDaReliefPaise,
      row.disbursementModel,
      row.lifeCertValidUntil ?? null,
      row.sourcePensionerId ?? null,
      row.familyMemberId ?? null,
      row.familyPensionRef ?? null,
      row.lifecycleStatus,
      createdBy ?? null,
    ];
  }
}
