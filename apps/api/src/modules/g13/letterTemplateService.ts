import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { DocumentVaultService } from "./documentVaultService";

/**
 * Post-hr_admin-goal thin build (`letter_admin`/`g13.letter.author` capability — the same
 * underlying capability, named once under G01 and once under G13 in the audit): author/manage
 * letter templates and merge fields; certify generated copies. Generated letters are stored via
 * the existing G13 document vault (`createDocument`), not a parallel storage mechanism.
 */

export interface LetterTemplate {
  id: string;
  tenantId: string;
  entityId?: string;
  templateCode: string;
  title: string;
  bodyText: string;
  mergeFields: string[];
  status: "ACTIVE" | "RETIRED";
  authoredByUserId: string;
  authoredAt: string;
}

export interface GeneratedLetter {
  id: string;
  tenantId: string;
  entityId?: string;
  templateId: string;
  employeeId: string;
  documentId: string;
  renderedText: string;
  generatedByUserId: string;
  generatedAt: string;
  certifiedByUserId?: string;
  certifiedAt?: string;
}

export class LetterTemplateService {
  private counter = 0;
  private readonly templates: LetterTemplate[] = [];
  private readonly generatedLetters: GeneratedLetter[] = [];

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly documentVault: DocumentVaultService
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }

  /** Author a letter template (merge fields are `{{fieldName}}` placeholders in bodyText). */
  authorTemplate(actor: ActorContext, input: { templateCode: string; title: string; bodyText: string; mergeFields: string[] }): LetterTemplate {
    this.authorization.check(actor, "g13.letter.author", actor);
    if (!input.templateCode?.trim() || !input.bodyText?.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "templateCode and bodyText are required", { field: "templateCode" });
    }
    if (this.templates.some((t) => this.inScope(t, actor) && t.templateCode === input.templateCode && t.status === "ACTIVE")) {
      throw new FoundationError("CONFLICT", "An active template with this code already exists", { field: "templateCode" });
    }
    const template: LetterTemplate = {
      id: this.next("letter-template"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      templateCode: input.templateCode,
      title: input.title,
      bodyText: input.bodyText,
      mergeFields: [...input.mergeFields],
      status: "ACTIVE",
      authoredByUserId: actor.userId,
      authoredAt: new Date().toISOString(),
    };
    this.templates.push(template);
    this.audit.recordMutation(actor, { action: "G13_LETTER_TEMPLATE_AUTHORED", subjectRef: `letter_templates:${template.id}`, metadata: { templateCode: template.templateCode } });
    return { ...template };
  }

  updateTemplate(actor: ActorContext, templateId: string, input: { title?: string; bodyText?: string; mergeFields?: string[] }): LetterTemplate {
    this.authorization.check(actor, "g13.letter.author", actor);
    const template = this.templates.find((t) => t.id === templateId && this.inScope(t, actor));
    if (!template) {
      throw new FoundationError("NOT_FOUND", "Letter template not found");
    }
    if (input.title !== undefined) template.title = input.title;
    if (input.bodyText !== undefined) template.bodyText = input.bodyText;
    if (input.mergeFields !== undefined) template.mergeFields = [...input.mergeFields];
    this.audit.recordMutation(actor, { action: "G13_LETTER_TEMPLATE_UPDATED", subjectRef: `letter_templates:${template.id}` });
    return { ...template };
  }

  listTemplates(actor: ActorContext): LetterTemplate[] {
    this.authorization.check(actor, "g13.letter.author", actor);
    requireTenantScope(actor);
    return this.templates.filter((t) => this.inScope(t, actor)).map((t) => ({ ...t }));
  }

  /** Generate a letter from a template, merging field values, and store it via the document vault. */
  generateLetter(actor: ActorContext, input: { templateId: string; employeeId: string; mergeValues: Record<string, string> }): GeneratedLetter {
    this.authorization.check(actor, "g13.letter.author", actor);
    const template = this.templates.find((t) => t.id === input.templateId && this.inScope(t, actor));
    if (!template) {
      throw new FoundationError("NOT_FOUND", "Letter template not found");
    }
    if (template.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE template can be used to generate a letter");
    }
    const missing = template.mergeFields.filter((field) => input.mergeValues[field] === undefined);
    if (missing.length > 0) {
      throw new FoundationError("VALIDATION_FAILED", `Missing merge values for: ${missing.join(", ")}`, { field: "mergeValues" });
    }
    let renderedText = template.bodyText;
    for (const [field, value] of Object.entries(input.mergeValues)) {
      renderedText = renderedText.split(`{{${field}}}`).join(value);
    }
    const document = this.documentVault.createDocument(actor, {
      title: `${template.title} — ${input.employeeId}`,
      ownerEmployeeId: input.employeeId,
      classification: "CONFIDENTIAL",
      content: renderedText,
    });
    const letter: GeneratedLetter = {
      id: this.next("generated-letter"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      templateId: template.id,
      employeeId: input.employeeId,
      documentId: document.id,
      renderedText,
      generatedByUserId: actor.userId,
      generatedAt: new Date().toISOString(),
    };
    this.generatedLetters.push(letter);
    this.audit.recordMutation(actor, {
      action: "G13_LETTER_GENERATED",
      subjectRef: `generated_letters:${letter.id}`,
      metadata: { templateCode: template.templateCode, employeeId: input.employeeId, documentId: document.id },
    });
    return { ...letter };
  }

  /** Certify a generated copy — the certifier must be a distinct actor from the generator (SoD). */
  certifyGeneratedCopy(actor: ActorContext, letterId: string): GeneratedLetter {
    this.authorization.check(actor, "g13.letter.author", actor);
    const letter = this.generatedLetters.find((l) => l.id === letterId && this.inScope(l, actor));
    if (!letter) {
      throw new FoundationError("NOT_FOUND", "Generated letter not found");
    }
    if (letter.generatedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "The generator of a letter cannot certify their own copy (SoD)", { details: { letterId } });
    }
    if (letter.certifiedByUserId) {
      return { ...letter };
    }
    letter.certifiedByUserId = actor.userId;
    letter.certifiedAt = new Date().toISOString();
    this.audit.recordMutation(actor, { action: "G13_LETTER_CERTIFIED", subjectRef: `generated_letters:${letter.id}` });
    return { ...letter };
  }

  listGeneratedLetters(actor: ActorContext, employeeId: string): GeneratedLetter[] {
    this.authorization.check(actor, "g13.letter.author", actor);
    requireTenantScope(actor);
    return this.generatedLetters.filter((l) => this.inScope(l, actor) && l.employeeId === employeeId).map((l) => ({ ...l }));
  }
}
