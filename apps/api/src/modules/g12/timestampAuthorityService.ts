import { createHash } from "node:crypto";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, nextId } from "../../platform/types";
import { TimestampAuthority, TsaTimestampResult } from "./srIntegrityService";

/**
 * PH-26B — G12 RFC-3161 timestamp authority binding
 * (docs/brd/v3/G12-digital-service-register.md FR-04):
 *
 * PH-10B anchored Merkle roots through a stubbed TimestampAuthority. This binds a concrete
 * `LocalTimestampAuthority` that issues an RFC-3161-shaped timestamp token: the token embeds the
 * messageImprint (the digest), a monotonic serial, and genTime, sealed with a keyed SHA-256
 * signature. `verifyToken` recomputes the signature and checks the messageImprint — a tampered
 * digest fails verification. A production deployment binds an external qualified TSA to the same
 * interface; the token shape and verification contract are unchanged.
 */

interface Rfc3161Token {
  messageImprint: string;
  serial: number;
  genTime: string;
  authority: string;
  signature: string;
}

export class LocalTimestampAuthority implements TimestampAuthority {
  private serial = 0;

  constructor(
    private readonly secret: string = process.env.G12_TSA_SECRET ?? "ph26b-local-tsa-secret",
    private readonly authority: string = "urn:tsa:local:rfc3161",
    private readonly clock: () => Date = () => new Date(0)
  ) {}

  private sign(messageImprint: string, serial: number, genTime: string): string {
    return createHash("sha256").update(`${this.secret}|${messageImprint}|${serial}|${genTime}|${this.authority}`, "utf8").digest("hex");
  }

  timestamp(digestHex: string): TsaTimestampResult {
    this.serial += 1;
    const genTime = this.clock().toISOString();
    const token: Rfc3161Token = {
      messageImprint: digestHex,
      serial: this.serial,
      genTime,
      authority: this.authority,
      signature: this.sign(digestHex, this.serial, genTime),
    };
    return {
      token: Buffer.from(JSON.stringify(token), "utf8").toString("base64"),
      authority: this.authority,
      timestampedAt: genTime,
    };
  }

  /** Verify a token against the digest it should attest. Returns false on any tamper. */
  verifyToken(tokenB64: string, expectedDigestHex: string): { valid: boolean; reason?: string } {
    let parsed: Rfc3161Token;
    try {
      parsed = JSON.parse(Buffer.from(tokenB64, "base64").toString("utf8")) as Rfc3161Token;
    } catch {
      return { valid: false, reason: "MALFORMED_TOKEN" };
    }
    if (parsed.messageImprint !== expectedDigestHex) {
      return { valid: false, reason: "IMPRINT_MISMATCH" };
    }
    const expectedSig = this.sign(parsed.messageImprint, parsed.serial, parsed.genTime);
    if (expectedSig !== parsed.signature) {
      return { valid: false, reason: "SIGNATURE_MISMATCH" };
    }
    return { valid: true };
  }
}

/** Issue/verify RFC-3161 timestamp tokens over an arbitrary payload digest. */
export class TimestampAuthorityService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly tsa: LocalTimestampAuthority = new LocalTimestampAuthority()
  ) {}

  private digestOf(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload ?? null), "utf8").digest("hex");
  }

  /** Issue a timestamp token over the SHA-256 digest of a payload. */
  issueTimestamp(actor: ActorContext, input: { payload: unknown }): { digest: string; token: string; authority: string; timestampedAt: string } {
    this.authorization.check(actor, "g12.tsa.issue", actor);
    const digest = this.digestOf(input.payload);
    const result = this.tsa.timestamp(digest);
    this.counter += 1;
    void nextId("g12-tsa", this.counter);
    this.audit.recordMutation(actor, {
      action: "G12_TSA_TIMESTAMP_ISSUED",
      subjectRef: `tsa_token:${digest.slice(0, 16)}`,
      metadata: { authority: result.authority },
    });
    return { digest, token: result.token, authority: result.authority, timestampedAt: result.timestampedAt };
  }

  /** Verify a timestamp token against a payload — false if the payload/digest was tampered. */
  verifyTimestamp(actor: ActorContext, input: { payload: unknown; token: string }): { valid: boolean; reason?: string } {
    this.authorization.check(actor, "g12.tsa.verify", actor);
    const digest = this.digestOf(input.payload);
    return this.tsa.verifyToken(input.token, digest);
  }
}
