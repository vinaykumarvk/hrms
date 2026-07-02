import { AuditService } from "../../platform/audit/auditService";
import { FoundationError, TenantScope, inScope, nextId, requireTenantScope } from "../../platform/types";

export interface DocumentLink {
  moduleCode: string;
  entityName: string;
  entityRefId: string;
  linkRole: string;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  docNo: string;
  title: string;
  ownerEmployeeId?: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ORPHANED" | "DISPOSED" | "QUARANTINED";
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";
  currentVersionNo: number;
  contentHash: string;
  isWorm: boolean;
  legalHold: boolean;
  links: DocumentLink[];
}

export interface DocumentRetentionView {
  documentId: string;
  status: DocumentRecord["status"];
  isWorm: boolean;
  legalHold: boolean;
  retentionUntil?: string;
  failClosed: boolean;
}

export interface DocumentVersionView {
  documentId: string;
  versionNo: number;
  contentHash: string;
  status: DocumentRecord["status"];
}

export class DocumentVaultService {
  private readonly documents: DocumentRecord[];
  private readonly retentionExtensions = new Map<string, string>();

  constructor(initial: DocumentRecord[], private readonly audit: AuditService) {
    this.documents = initial.map((doc) => ({ ...doc, links: [...doc.links] }));
  }

  createDocument(
    scope: TenantScope,
    input: {
      title: string;
      ownerEmployeeId?: string;
      classification: DocumentRecord["classification"];
      contentHash: string;
      isWorm?: boolean;
    }
  ): DocumentRecord {
    requireTenantScope(scope);
    const document: DocumentRecord = {
      id: nextId("doc", this.documents.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      docNo: `DOC/PH03/${String(this.documents.length + 1).padStart(4, "0")}`,
      title: input.title,
      ownerEmployeeId: input.ownerEmployeeId,
      status: "ACTIVE",
      classification: input.classification,
      currentVersionNo: 1,
      contentHash: input.contentHash,
      isWorm: Boolean(input.isWorm),
      legalHold: false,
      links: [],
    };
    this.documents.push(document);
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_CREATE", subjectRef: `documents:${document.id}`, metadata: { classification: document.classification } });
    return this.clone(document);
  }

  attach(scope: TenantScope, documentId: string, link: DocumentLink): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    document.links.push({ ...link });
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_ATTACH", subjectRef: `documents:${document.id}`, metadata: { moduleCode: link.moduleCode, entityRefId: link.entityRefId } });
    return this.clone(document);
  }

  list(scope: TenantScope): DocumentRecord[] {
    requireTenantScope(scope);
    return this.documents.filter((document) => inScope(document, scope)).map((document) => this.clone(document));
  }

  listVersions(scope: TenantScope, documentId: string): DocumentVersionView[] {
    const document = this.requireDocument(scope, documentId);
    return [
      {
        documentId: document.id,
        versionNo: document.currentVersionNo,
        contentHash: document.contentHash,
        status: document.status,
      },
    ];
  }

  checkIn(scope: TenantScope, documentId: string, input: { contentHash: string; title?: string }): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold blocks document checkin");
    }
    document.currentVersionNo += 1;
    document.contentHash = input.contentHash;
    if (input.title) {
      document.title = input.title;
    }
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_CHECKIN", subjectRef: `documents:${document.id}`, metadata: { versionNo: document.currentVersionNo } });
    return this.clone(document);
  }

  supersede(scope: TenantScope, documentId: string, replacementDocumentId?: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold blocks supersede");
    }
    document.status = "SUPERSEDED";
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_SUPERSEDE", subjectRef: `documents:${document.id}`, metadata: { replacementDocumentId } });
    return this.clone(document);
  }

  placeLegalHold(scope: TenantScope, documentId: string, reason: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    document.legalHold = true;
    this.audit.recordMutation(scope, { action: "G13_LEGAL_HOLD_PLACE", subjectRef: `documents:${document.id}`, metadata: { reason } });
    return this.clone(document);
  }

  releaseLegalHold(scope: TenantScope, documentId: string, reason: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    document.legalHold = false;
    this.audit.recordMutation(scope, { action: "G13_LEGAL_HOLD_RELEASE", subjectRef: `documents:${document.id}`, metadata: { reason } });
    return this.clone(document);
  }

  getRetention(scope: TenantScope, documentId: string): DocumentRetentionView {
    const document = this.requireDocument(scope, documentId);
    return {
      documentId: document.id,
      status: document.status,
      isWorm: document.isWorm,
      legalHold: document.legalHold,
      retentionUntil: this.retentionExtensions.get(document.id),
      failClosed: document.isWorm || document.legalHold,
    };
  }

  extendRetention(scope: TenantScope, documentId: string, retentionUntil: string, reason: string): DocumentRetentionView {
    const document = this.requireDocument(scope, documentId);
    this.retentionExtensions.set(document.id, retentionUntil);
    this.audit.recordMutation(scope, { action: "G13_RETENTION_EXTEND", subjectRef: `documents:${document.id}`, metadata: { retentionUntil, reason } });
    return this.getRetention(scope, document.id);
  }

  dispose(scope: TenantScope, documentId: string): DocumentRecord {
    const document = this.requireDocument(scope, documentId);
    if (document.legalHold || document.isWorm) {
      throw new FoundationError("PRECONDITION_FAILED", "Legal hold or WORM retention blocks disposal");
    }
    document.status = "DISPOSED";
    this.audit.recordMutation(scope, { action: "G13_DOCUMENT_DISPOSE", subjectRef: `documents:${document.id}` });
    return this.clone(document);
  }

  get(scope: TenantScope, documentId: string): DocumentRecord | null {
    const document = this.documents.find((item) => inScope(item, scope) && item.id === documentId);
    return document ? this.clone(document) : null;
  }

  listByModuleRef(scope: TenantScope, moduleCode: string, entityRefId: string): DocumentRecord[] {
    requireTenantScope(scope);
    return this.documents
      .filter((document) => inScope(document, scope) && document.links.some((link) => link.moduleCode === moduleCode && link.entityRefId === entityRefId))
      .map((document) => this.clone(document));
  }

  count(scope: TenantScope): number {
    requireTenantScope(scope);
    return this.documents.filter((document) => inScope(document, scope)).length;
  }

  private requireDocument(scope: TenantScope, documentId: string): DocumentRecord {
    const document = this.documents.find((item) => inScope(item, scope) && item.id === documentId);
    if (!document) {
      throw new FoundationError("NOT_FOUND", "Document not found");
    }
    return document;
  }

  private clone(document: DocumentRecord): DocumentRecord {
    return { ...document, links: document.links.map((link) => ({ ...link })) };
  }
}
