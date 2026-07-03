import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-20C — G02 change-request templates at BRD depth
 * (docs/brd/v3/G02-personal-details-modification-workflow.md FR-014):
 *
 * - change_request_templates capture a reusable set of fields + default values for a common change.
 * - Starting a request from a template pre-fills the item list, filtered to the fields the caller
 *   is permitted to edit (a P02-style allowedFields filter drops disallowed fields).
 * - A deactivated (INACTIVE) template cannot start a request (fail closed).
 */

export type TemplateStatus = "ACTIVE" | "INACTIVE";

/** change_request_templates — a reusable change-request template. */
export interface ChangeRequestTemplate {
  id: string;
  tenantId: string;
  entityId?: string;
  templateCode: string;
  name: string;
  fields: Array<{ fieldCode: string; defaultValue?: string }>;
  status: TemplateStatus;
}

/** The pre-filled item list produced by starting from a template. */
export interface TemplatePrefill {
  templateId: string;
  items: Array<{ fieldCode: string; value?: string }>;
  droppedFields: string[];
}

export interface ChangeRequestTemplateRepository {
  save(row: ChangeRequestTemplate): void;
  find(scope: TenantScope, id: string): ChangeRequestTemplate | undefined;
  list(scope: TenantScope): ChangeRequestTemplate[];
}

export class InMemoryChangeRequestTemplateRepository implements ChangeRequestTemplateRepository {
  private readonly rows: ChangeRequestTemplate[] = [];
  private scoped(row: ChangeRequestTemplate, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: ChangeRequestTemplate): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    const copy = { ...row, fields: row.fields.map((f) => ({ ...f })) };
    if (i >= 0) this.rows[i] = copy; else this.rows.push(copy);
  }
  find(scope: TenantScope, id: string): ChangeRequestTemplate | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row, fields: row.fields.map((f) => ({ ...f })) } : undefined;
  }
  list(scope: TenantScope): ChangeRequestTemplate[] {
    return this.rows.filter((r) => this.scoped(r, scope)).map((r) => ({ ...r, fields: r.fields.map((f) => ({ ...f })) }));
  }
}

export class ChangeRequestTemplateService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: ChangeRequestTemplateRepository = new InMemoryChangeRequestTemplateRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  createTemplate(
    actor: ActorContext,
    input: { templateCode: string; name: string; fields: Array<{ fieldCode: string; defaultValue?: string }> }
  ): ChangeRequestTemplate {
    this.authorization.check(actor, "g02.template.write", actor);
    if (input.fields.length < 1) {
      throw new FoundationError("VALIDATION_FAILED", "A change_request_templates row needs at least one field", { field: "fields" });
    }
    const template: ChangeRequestTemplate = {
      id: this.next("g02-cr-template"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      templateCode: input.templateCode,
      name: input.name,
      fields: input.fields.map((f) => ({ ...f })),
      status: "ACTIVE",
    };
    this.repo.save(template);
    this.audit.recordMutation(actor, {
      action: "G02_CR_TEMPLATE_CREATED",
      subjectRef: `change_request_templates:${template.id}`,
      metadata: { templateCode: template.templateCode, fields: template.fields.length },
    });
    return this.repo.find(actor, template.id)!;
  }

  deactivateTemplate(actor: ActorContext, templateId: string): ChangeRequestTemplate {
    this.authorization.check(actor, "g02.template.write", actor);
    const template = this.require(actor, templateId);
    template.status = "INACTIVE";
    this.repo.save(template);
    this.audit.recordMutation(actor, {
      action: "G02_CR_TEMPLATE_DEACTIVATED",
      subjectRef: `change_request_templates:${template.id}`,
    });
    return { ...template, fields: template.fields.map((f) => ({ ...f })) };
  }

  /**
   * Start a change request from a template. An INACTIVE template is rejected. The pre-filled item
   * list is filtered to allowedFields; disallowed fields are reported as dropped.
   */
  startFromTemplate(actor: ActorContext, templateId: string, input: { allowedFields: string[] }): TemplatePrefill {
    this.authorization.check(actor, "g02.template.start", actor);
    const template = this.require(actor, templateId);
    if (template.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "An INACTIVE template cannot start a change request", {
        details: { templateId, status: template.status },
      });
    }
    const allowed = new Set(input.allowedFields);
    const items: Array<{ fieldCode: string; value?: string }> = [];
    const droppedFields: string[] = [];
    for (const f of template.fields) {
      if (allowed.has(f.fieldCode)) items.push({ fieldCode: f.fieldCode, value: f.defaultValue });
      else droppedFields.push(f.fieldCode);
    }
    return { templateId, items, droppedFields };
  }

  listTemplates(scope: TenantScope): ChangeRequestTemplate[] {
    requireTenantScope(scope);
    return this.repo.list(scope);
  }

  private require(scope: TenantScope, id: string): ChangeRequestTemplate {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Template not found");
    return row;
  }
}
