import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-24B — G06 correction lineage and recompute cascade at BRD depth
 * (docs/brd/v3/G06-promotion-posting-progression.md FR-018):
 *
 * - A correction to a load-bearing input (e.g. an appointment date) on a FINALISED seniority list
 *   is recorded as a correction_events row, flags the list UNDER_CORRECTION, and cascades: the
 *   affected entries are re-ranked deterministically (appointment date, then service_no) and a new
 *   snapshot is produced with an explicit lineage back to the correction.
 * - A correction against a non-FINALISED list is rejected (SENIORITY_LIST_NOT_FINAL).
 */

export type SeniorityListStatus = "DRAFT" | "FINALISED" | "UNDER_CORRECTION" | "SUPERSEDED";

export interface SeniorityEntry {
  employeeId: string;
  appointmentDate: string;
  serviceNo: string;
  rank: number;
}

/** A snapshot of a seniority list (a correction produces a new versioned snapshot). */
export interface SeniorityList {
  id: string;
  tenantId: string;
  entityId?: string;
  listCode: string;
  version: number;
  status: SeniorityListStatus;
  entries: SeniorityEntry[];
  correctionOfEventId?: string;
}

/** correction_events — the lineage record for a correction that triggered a recompute cascade. */
export interface CorrectionEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  listCode: string;
  fromVersion: number;
  toVersion: number;
  employeeId: string;
  field: string;
  oldValue: string;
  newValue: string;
  affectedEmployeeIds: string[];
  reason: string;
}

export interface CorrectionCascadeRepository {
  saveList(row: SeniorityList): void;
  findCurrentList(scope: TenantScope, listCode: string): SeniorityList | undefined;
  appendCorrection(row: CorrectionEvent): void;
  findCorrection(scope: TenantScope, id: string): CorrectionEvent | undefined;
}

export class InMemoryCorrectionCascadeRepository implements CorrectionCascadeRepository {
  private readonly lists: SeniorityList[] = [];
  private readonly corrections: CorrectionEvent[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveList(row: SeniorityList): void {
    const i = this.lists.findIndex((l) => l.id === row.id);
    const copy = { ...row, entries: row.entries.map((e) => ({ ...e })) };
    if (i >= 0) this.lists[i] = copy; else this.lists.push(copy);
  }
  findCurrentList(scope: TenantScope, listCode: string): SeniorityList | undefined {
    const rows = this.lists.filter((l) => l.listCode === listCode && this.scoped(l, scope) && l.status !== "SUPERSEDED");
    const latest = rows.sort((a, b) => b.version - a.version)[0];
    return latest ? { ...latest, entries: latest.entries.map((e) => ({ ...e })) } : undefined;
  }
  appendCorrection(row: CorrectionEvent): void { this.corrections.push({ ...row }); }
  findCorrection(scope: TenantScope, id: string): CorrectionEvent | undefined {
    const row = this.corrections.find((c) => c.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

function interSeCompare(a: { appointmentDate: string; serviceNo: string }, b: { appointmentDate: string; serviceNo: string }): number {
  if (a.appointmentDate !== b.appointmentDate) return a.appointmentDate < b.appointmentDate ? -1 : 1;
  if (a.serviceNo !== b.serviceNo) return a.serviceNo < b.serviceNo ? -1 : 1;
  return 0;
}

export class CorrectionCascadeService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: CorrectionCascadeRepository = new InMemoryCorrectionCascadeRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Publish a FINALISED seniority list (ranked by the deterministic tie-break). */
  finaliseList(actor: ActorContext, input: { listCode: string; entries: Array<{ employeeId: string; appointmentDate: string; serviceNo: string }> }): SeniorityList {
    this.authorization.check(actor, "g06.seniority.finalise", actor);
    const ranked = [...input.entries].sort(interSeCompare).map((e, i) => ({ ...e, rank: i + 1 }));
    const list: SeniorityList = {
      id: this.next("g06-seniority-list"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      listCode: input.listCode,
      version: 1,
      status: "FINALISED",
      entries: ranked,
    };
    this.repo.saveList(list);
    return this.repo.findCurrentList(actor, input.listCode)!;
  }

  /** Stage a DRAFT seniority list (not yet finalised — corrections are barred until finalisation). */
  createDraftList(actor: ActorContext, input: { listCode: string; entries: Array<{ employeeId: string; appointmentDate: string; serviceNo: string }> }): SeniorityList {
    this.authorization.check(actor, "g06.seniority.draft", actor);
    const ranked = [...input.entries].sort(interSeCompare).map((e, i) => ({ ...e, rank: i + 1 }));
    const list: SeniorityList = {
      id: this.next("g06-seniority-list"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      listCode: input.listCode,
      version: 1,
      status: "DRAFT",
      entries: ranked,
    };
    this.repo.saveList(list);
    return this.repo.findCurrentList(actor, input.listCode)!;
  }

  /**
   * Apply a correction (e.g. a corrected appointment date) and cascade the re-rank. Rejected unless
   * the current list is FINALISED. Produces a new snapshot version linked to a correction_events row.
   */
  applyCorrection(
    actor: ActorContext,
    input: { listCode: string; employeeId: string; newAppointmentDate: string; reason: string }
  ): { list: SeniorityList; correction: CorrectionEvent } {
    this.authorization.check(actor, "g06.correction.apply", actor);
    const current = this.repo.findCurrentList(actor, input.listCode);
    if (!current) throw new FoundationError("NOT_FOUND", "Seniority list not found");
    if (current.status !== "FINALISED") {
      throw new FoundationError("PRECONDITION_FAILED", "SENIORITY_LIST_NOT_FINAL: a correction cascade requires a FINALISED list", {
        details: { listCode: input.listCode, status: current.status },
      });
    }
    const target = current.entries.find((e) => e.employeeId === input.employeeId);
    if (!target) throw new FoundationError("NOT_FOUND", "Employee not present in the seniority list");
    const oldValue = target.appointmentDate;
    const beforeRanks = new Map(current.entries.map((e) => [e.employeeId, e.rank]));

    // Mark the current version UNDER_CORRECTION, then produce a new re-ranked snapshot.
    current.status = "UNDER_CORRECTION";
    this.repo.saveList(current);

    const revisedEntries = current.entries.map((e) => (e.employeeId === input.employeeId ? { ...e, appointmentDate: input.newAppointmentDate } : { ...e }));
    const reRanked = [...revisedEntries].sort(interSeCompare).map((e, i) => ({ ...e, rank: i + 1 }));
    const affectedEmployeeIds = reRanked.filter((e) => beforeRanks.get(e.employeeId) !== e.rank).map((e) => e.employeeId);

    const correctionId = this.next("g06-correction-event");
    const supersededVersion = current.version;
    // Supersede the old snapshot.
    const superseded = { ...current, status: "SUPERSEDED" as SeniorityListStatus };
    this.repo.saveList(superseded);

    const newList: SeniorityList = {
      id: this.next("g06-seniority-list"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      listCode: input.listCode,
      version: supersededVersion + 1,
      status: "FINALISED",
      entries: reRanked,
      correctionOfEventId: correctionId,
    };
    this.repo.saveList(newList);

    const correction: CorrectionEvent = {
      id: correctionId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      listCode: input.listCode,
      fromVersion: supersededVersion,
      toVersion: newList.version,
      employeeId: input.employeeId,
      field: "appointmentDate",
      oldValue,
      newValue: input.newAppointmentDate,
      affectedEmployeeIds,
      reason: input.reason,
    };
    this.repo.appendCorrection(correction);
    this.audit.recordMutation(actor, {
      action: "G06_SENIORITY_CORRECTION_CASCADED",
      subjectRef: `correction_events:${correction.id}`,
      metadata: { affected: affectedEmployeeIds.length, toVersion: newList.version },
    });
    return { list: this.repo.findCurrentList(actor, input.listCode)!, correction };
  }

  getCurrentList(scope: TenantScope, listCode: string): SeniorityList | undefined {
    requireTenantScope(scope);
    return this.repo.findCurrentList(scope, listCode);
  }
}
