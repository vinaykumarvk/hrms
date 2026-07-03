import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-18A — G01 Aadhaar vault at BRD depth
 * (docs/brd/v3/G01-employee-profile-management.md FR-EPM-007):
 *
 * - aadhaar_vault stores only a tokenised reference + the last four digits — NEVER the raw
 *   12-digit Aadhaar. The token is a salted SHA-256 (one-way), so the vault cannot be reversed.
 * - Capture runs the Verhoeff checksum (the real Aadhaar check digit); an invalid number is
 *   rejected fail-closed (INVALID_AADHAAR).
 * - Reveal (returning the last-4 / confirming a match) is 4-eyes: a request is raised by one
 *   principal and approved by a distinct second principal (a single actor cannot self-approve).
 * - Verification / reveal events are tracked for expiry alerting.
 */

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 9, 1, 6, 7, 3, 2, 4],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Standard Verhoeff checksum validation over the full 12-digit string. */
export function verhoeffValid(digits: string): boolean {
  if (!/^[0-9]{12}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    const row = VERHOEFF_D[c];
    const pRow = VERHOEFF_P[i % 8];
    if (!row || !pRow) return false;
    const val = pRow[Number(reversed[i])];
    if (val === undefined) return false;
    const next = row[val];
    if (next === undefined) return false;
    c = next;
  }
  return c === 0;
}

export type RevealRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED";

/** aadhaar_vault — tokenised reference; the raw number is never persisted. */
export interface AadhaarVaultEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  token: string;
  lastFour: string;
  verifiedAt?: string;
  expiresAt?: string;
}

/** A 4-eyes reveal request — raised by one principal, approved by a distinct second. */
export interface AadhaarRevealRequest {
  id: string;
  tenantId: string;
  vaultId: string;
  requestedBy: string;
  approvedBy?: string;
  status: RevealRequestStatus;
  purpose: string;
}

export interface AadhaarVaultRepository {
  saveEntry(row: AadhaarVaultEntry): void;
  findByEmployee(scope: TenantScope, employeeId: string): AadhaarVaultEntry | undefined;
  findEntry(scope: TenantScope, id: string): AadhaarVaultEntry | undefined;
  saveReveal(row: AadhaarRevealRequest): void;
  findReveal(scope: TenantScope, id: string): AadhaarRevealRequest | undefined;
}

export class InMemoryAadhaarVaultRepository implements AadhaarVaultRepository {
  private readonly entries: AadhaarVaultEntry[] = [];
  private readonly reveals: AadhaarRevealRequest[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveEntry(row: AadhaarVaultEntry): void {
    const i = this.entries.findIndex((e) => e.id === row.id);
    if (i >= 0) this.entries[i] = { ...row }; else this.entries.push({ ...row });
  }
  findByEmployee(scope: TenantScope, employeeId: string): AadhaarVaultEntry | undefined {
    const row = this.entries.find((e) => e.employeeId === employeeId);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  findEntry(scope: TenantScope, id: string): AadhaarVaultEntry | undefined {
    const row = this.entries.find((e) => e.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  saveReveal(row: AadhaarRevealRequest): void {
    const i = this.reveals.findIndex((r) => r.id === row.id);
    if (i >= 0) this.reveals[i] = { ...row }; else this.reveals.push({ ...row });
  }
  findReveal(scope: TenantScope, id: string): AadhaarRevealRequest | undefined {
    const row = this.reveals.find((r) => r.id === id);
    return row && row.tenantId === scope.tenantId ? { ...row } : undefined;
  }
}

export class AadhaarVaultService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: AadhaarVaultRepository = new InMemoryAadhaarVaultRepository(),
    private readonly tokenSalt: string = process.env.G01_AADHAAR_TOKEN_SALT ?? "ph18a-dev-salt"
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  private tokenise(rawAadhaar: string): string {
    // One-way salted SHA-256 — the vault stores this, never the raw number.
    return createHash("sha256").update(`${this.tokenSalt}|${rawAadhaar}`, "utf8").digest("hex");
  }

  /** Capture an Aadhaar into the vault: Verhoeff-validate, tokenise, store token + last-4 only. */
  captureAadhaar(
    actor: ActorContext,
    input: { employeeId: string; rawAadhaar: string; verifiedAt?: string; expiresAt?: string }
  ): AadhaarVaultEntry {
    this.authorization.check(actor, "g01.aadhaar.capture", actor);
    const raw = (input.rawAadhaar ?? "").replace(/\s+/g, "");
    if (!verhoeffValid(raw)) {
      throw new FoundationError("VALIDATION_FAILED", "INVALID_AADHAAR: Verhoeff checksum failed", {
        field: "rawAadhaar",
        details: { validation: "VERHOEFF" },
      });
    }
    const entry: AadhaarVaultEntry = {
      id: this.next("g01-aadhaar-vault"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      token: this.tokenise(raw),
      lastFour: raw.slice(-4),
      verifiedAt: input.verifiedAt,
      expiresAt: input.expiresAt,
    };
    this.repo.saveEntry(entry);
    this.audit.recordMutation(actor, {
      action: "G01_AADHAAR_VAULTED",
      subjectRef: `aadhaar_vault:${entry.id}`,
      metadata: { lastFour: entry.lastFour }, // never the raw number
    });
    // The raw number is intentionally not returned or retained.
    return { ...entry };
  }

  /** Raise a 4-eyes reveal request. */
  requestReveal(actor: ActorContext, vaultId: string, input: { purpose: string }): AadhaarRevealRequest {
    this.authorization.check(actor, "g01.aadhaar.reveal.request", actor);
    const entry = this.repo.findEntry(actor, vaultId);
    if (!entry) throw new FoundationError("NOT_FOUND", "Aadhaar vault entry not found");
    const request: AadhaarRevealRequest = {
      id: this.next("g01-aadhaar-reveal"),
      tenantId: actor.tenantId,
      vaultId,
      requestedBy: actor.userId,
      status: "REQUESTED",
      purpose: input.purpose,
    };
    this.repo.saveReveal(request);
    return { ...request };
  }

  /**
   * Approve a reveal (4-eyes). The approver must differ from the requester; on approval the
   * masked last-4 is returned. A single actor can never self-approve a reveal.
   */
  approveReveal(actor: ActorContext, revealId: string): { request: AadhaarRevealRequest; maskedAadhaar: string } {
    this.authorization.check(actor, "g01.aadhaar.reveal.approve", actor);
    const request = this.repo.findReveal(actor, revealId);
    if (!request) throw new FoundationError("NOT_FOUND", "Reveal request not found");
    if (request.status !== "REQUESTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Reveal request is not pending");
    }
    if (request.requestedBy === actor.userId) {
      throw new FoundationError("FORBIDDEN", "4-eyes: the reveal requester cannot approve their own reveal", {
        details: { revealId },
      });
    }
    const entry = this.repo.findEntry(actor, request.vaultId);
    if (!entry) throw new FoundationError("NOT_FOUND", "Aadhaar vault entry not found");
    request.status = "APPROVED";
    request.approvedBy = actor.userId;
    this.repo.saveReveal(request);
    this.audit.recordMutation(actor, {
      action: "G01_AADHAAR_REVEALED",
      subjectRef: `aadhaar_vault:${entry.id}`,
      metadata: { revealId, requestedBy: request.requestedBy, approvedBy: actor.userId },
    });
    return { request: { ...request }, maskedAadhaar: `XXXX-XXXX-${entry.lastFour}` };
  }

  getVaultByEmployee(scope: TenantScope, employeeId: string): AadhaarVaultEntry | undefined {
    requireTenantScope(scope);
    return this.repo.findByEmployee(scope, employeeId);
  }
}
