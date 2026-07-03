import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-23C — G01 phonetic / transliteration search at BRD depth
 * (docs/brd/v3/G01-employee-profile-management.md FR-EPM-025):
 *
 * - A phonetic index stores a Soundex-style code for each employee name so near-homophones
 *   (e.g. "Krishnan" / "Krishnnan", "Smith" / "Smyth") match even when spelling differs.
 * - Transliteration normalises common Indic-Latin variants (aa->a, ee->i, doubled consonants)
 *   before coding, so transliterated spellings collapse to the same phonetic key.
 * - A phonetic=true search returns all employees whose name shares the query's phonetic code.
 */

/** Transliteration normalisation of a name token before phonetic coding. */
export function transliterateNormalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/([a-z])\1+/g, "$1"); // collapse doubled consonants/vowels
}

/** Standard Soundex code (letter + 3 digits) over the primary token. */
export function soundex(name: string): string {
  const token = transliterateNormalise(name).replace(/\s+/g, "");
  if (!token) return "0000";
  const codeOf = (c: string): string => {
    if ("bfpv".includes(c)) return "1";
    if ("cgjkqsxz".includes(c)) return "2";
    if ("dt".includes(c)) return "3";
    if (c === "l") return "4";
    if ("mn".includes(c)) return "5";
    if (c === "r") return "6";
    return ""; // a e i o u h w y
  };
  const first = token[0]!.toUpperCase();
  let prev = codeOf(token[0]!);
  let out = "";
  for (let i = 1; i < token.length && out.length < 3; i++) {
    const code = codeOf(token[i]!);
    if (code && code !== prev) out += code;
    if (token[i] !== "h" && token[i] !== "w") prev = code;
  }
  return (first + out + "000").slice(0, 4);
}

/** phonetic index entry for an employee name. */
export interface PhoneticIndexEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  name: string;
  phoneticCode: string;
}

export interface PhoneticSearchRepository {
  index(row: PhoneticIndexEntry): void;
  byCode(scope: TenantScope, phoneticCode: string): PhoneticIndexEntry[];
}

export class InMemoryPhoneticSearchRepository implements PhoneticSearchRepository {
  private readonly rows: PhoneticIndexEntry[] = [];
  private scoped(row: PhoneticIndexEntry, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  index(row: PhoneticIndexEntry): void {
    const i = this.rows.findIndex((r) => r.employeeId === row.employeeId);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  byCode(scope: TenantScope, phoneticCode: string): PhoneticIndexEntry[] {
    return this.rows.filter((r) => r.phoneticCode === phoneticCode && this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class PhoneticSearchService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: PhoneticSearchRepository = new InMemoryPhoneticSearchRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Index an employee name into the phonetic index. */
  indexName(actor: ActorContext, input: { employeeId: string; name: string }): PhoneticIndexEntry {
    this.authorization.check(actor, "g01.phonetic.index", actor);
    const entry: PhoneticIndexEntry = {
      id: this.next("g01-phonetic-index"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      name: input.name,
      phoneticCode: soundex(input.name),
    };
    this.repo.index(entry);
    return { ...entry };
  }

  /** Phonetic search: returns all indexed employees whose name shares the query's phonetic code. */
  searchPhonetic(actor: ActorContext, input: { query: string }): { phoneticCode: string; hits: PhoneticIndexEntry[] } {
    this.authorization.check(actor, "g01.phonetic.search", actor);
    const phoneticCode = soundex(input.query);
    const hits = this.repo.byCode(actor, phoneticCode);
    this.audit.recordMutation(actor, {
      action: "G01_PHONETIC_SEARCH",
      subjectRef: `phonetic_index:${phoneticCode}`,
      metadata: { phoneticCode, hits: hits.length },
    });
    return { phoneticCode, hits };
  }

  computeCode(scope: TenantScope, name: string): string {
    requireTenantScope(scope);
    return soundex(name);
  }
}
