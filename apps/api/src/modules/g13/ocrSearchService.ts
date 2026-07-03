import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-22B — G13 OCR and permission-aware search at BRD depth
 * (docs/brd/v3/G13-document-management-secure-storage.md FR-008):
 *
 * - ocr_index holds extracted text keyed to a document, tagged with the document's classification.
 * - Search is permission-aware: a result is returned only when the caller's clearance level is at or
 *   above the document's classification. Over-classified hits (e.g. SECRET/TOP_SECRET for an
 *   under-cleared caller) are excluded, and their content never appears in the result set.
 */

export type Classification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";

const CLEARANCE_RANK: Record<Classification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};

/** ocr_index — extracted text for a document with its classification. */
export interface OcrIndexEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  documentId: string;
  classification: Classification;
  text: string;
}

/** A permission-filtered search hit (never carries text above the caller's clearance). */
export interface OcrSearchHit {
  documentId: string;
  classification: Classification;
  snippet: string;
}

export interface OcrSearchRepository {
  index(row: OcrIndexEntry): void;
  all(scope: TenantScope): OcrIndexEntry[];
}

export class InMemoryOcrSearchRepository implements OcrSearchRepository {
  private readonly rows: OcrIndexEntry[] = [];
  private scoped(row: OcrIndexEntry, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  index(row: OcrIndexEntry): void {
    const i = this.rows.findIndex((r) => r.documentId === row.documentId);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  all(scope: TenantScope): OcrIndexEntry[] {
    return this.rows.filter((r) => this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class OcrSearchService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: OcrSearchRepository = new InMemoryOcrSearchRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Index a document's OCR text (typically from a sandboxed OCR pass). */
  indexDocument(actor: ActorContext, input: { documentId: string; classification: Classification; text: string }): OcrIndexEntry {
    this.authorization.check(actor, "g13.ocr.index", actor);
    const entry: OcrIndexEntry = {
      id: this.next("g13-ocr-index"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      documentId: input.documentId,
      classification: input.classification,
      text: input.text,
    };
    this.repo.index(entry);
    this.audit.recordMutation(actor, {
      action: "G13_OCR_INDEXED",
      subjectRef: `ocr_index:${entry.id}`,
      metadata: { documentId: entry.documentId, classification: entry.classification },
    });
    return { ...entry };
  }

  /**
   * Permission-aware search. Only documents at or below the caller's clearance are searched;
   * over-classified documents are excluded and never contribute a snippet.
   */
  search(actor: ActorContext, input: { query: string; clearance: Classification }): { hits: OcrSearchHit[]; excludedCount: number } {
    this.authorization.check(actor, "g13.ocr.search", actor);
    const callerRank = CLEARANCE_RANK[input.clearance];
    const q = input.query.toLowerCase();
    const hits: OcrSearchHit[] = [];
    let excludedCount = 0;
    for (const row of this.repo.all(actor)) {
      const matches = row.text.toLowerCase().includes(q);
      if (!matches) continue;
      if (CLEARANCE_RANK[row.classification] > callerRank) {
        // Over-classified for this caller — excluded, no content leak.
        excludedCount += 1;
        continue;
      }
      const idx = row.text.toLowerCase().indexOf(q);
      const snippet = row.text.slice(Math.max(0, idx - 20), idx + q.length + 20);
      hits.push({ documentId: row.documentId, classification: row.classification, snippet });
    }
    this.audit.recordMutation(actor, {
      action: "G13_OCR_SEARCH",
      subjectRef: `ocr_index:search`,
      metadata: { clearance: input.clearance, hits: hits.length, excluded: excludedCount },
    });
    return { hits, excludedCount };
  }

  listIndex(scope: TenantScope): OcrIndexEntry[] {
    requireTenantScope(scope);
    return this.repo.all(scope);
  }
}
