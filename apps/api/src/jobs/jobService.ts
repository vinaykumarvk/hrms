import { FoundationError, TenantScope, nextId, requireTenantScope } from "../platform/types";

export interface JobRun {
  id: string;
  tenantId: string;
  jobId: string;
  runKey: string;
  status: "SCHEDULED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYING" | "DEAD_LETTER" | "SKIPPED";
  rowsAffected?: number;
  outcomeDetail?: Record<string, unknown>;
}

export class JobService {
  private readonly runs: JobRun[] = [];

  start(scope: TenantScope, input: { jobId: string; runKey: string }): JobRun {
    requireTenantScope(scope);
    const existing = this.runs.find((run) => run.tenantId === scope.tenantId && run.jobId === input.jobId && run.runKey === input.runKey);
    if (existing) {
      return { ...existing, outcomeDetail: existing.outcomeDetail ? { ...existing.outcomeDetail } : undefined };
    }
    const run: JobRun = {
      id: nextId("job", this.runs.length),
      tenantId: scope.tenantId,
      jobId: input.jobId,
      runKey: input.runKey,
      status: "RUNNING",
    };
    this.runs.push(run);
    return { ...run };
  }

  finish(scope: TenantScope, runId: string, input: { rowsAffected: number; outcomeDetail?: Record<string, unknown> }): JobRun {
    const run = this.runs.find((item) => item.tenantId === scope.tenantId && item.id === runId);
    if (!run) {
      throw new FoundationError("NOT_FOUND", "Job run not found");
    }
    run.status = "SUCCEEDED";
    run.rowsAffected = input.rowsAffected;
    run.outcomeDetail = input.outcomeDetail ? { ...input.outcomeDetail } : undefined;
    return { ...run, outcomeDetail: run.outcomeDetail ? { ...run.outcomeDetail } : undefined };
  }
}
