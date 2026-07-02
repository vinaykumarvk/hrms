import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { FoundationError } from "../../platform/types";

/**
 * PH-15E — BRD G13 FR-G13-005 envelope encryption (E19 storage_objects).
 *
 * Every stored blob is encrypted with a unique per-object DEK using AES-256-GCM; the DEK is
 * wrapped by a master key behind the injectable KeyProvider seam so only `wrapped_dek` +
 * `kms_key_id` are ever persisted (AC2). Plaintext DEKs and plaintext blobs are never stored,
 * and key bytes are never logged. Master-key rotation re-wraps DEKs WITHOUT re-encrypting or
 * rewriting object bytes (`JOB-G13-KEYROTATE`, AC4). Decryption with a wrong or unknown key
 * fails closed with the registered integrity failure (`ERR-G13-INTEGRITY_FAILED`) and never
 * returns partial plaintext.
 */

/** Persistable wrap result — the ONLY key material ever stored (wrapped_dek + kms_key_id). */
export interface WrappedDataKey {
  /** `wrapped_dek` — the DEK encrypted under the master key (iv || authTag || ciphertext). */
  wrappedDek: Buffer;
  /** `kms_key_id` — reference to the wrapping master-key version (never the key bytes). */
  kmsKeyId: string;
}

/**
 * Injectable key-management seam (like the PH-10C ScanProvider seam): tests inject a
 * deterministic local implementation; production binds a real KMS/HSM client behind this
 * interface. INTEGRATION DEBT (FR-G13-005): real KMS/CMK integration (P04
 * `integration_credentials`, per-domain CMKs, key-DR/escrow) stays behind this seam.
 */
export interface KeyProvider {
  /** The `kms_key_id` new wraps are issued under. */
  currentKeyId(): string;
  /** Wraps a per-object DEK under the current master key; returns wrapped_dek + kms_key_id. */
  wrapDek(dek: Buffer): WrappedDataKey;
  /**
   * Unwraps a stored DEK. A wrong key, unknown `kms_key_id`, or tampered wrap fails closed
   * with `ERR-G13-INTEGRITY_FAILED` — never a partial or garbage DEK.
   */
  unwrapDek(wrapped: WrappedDataKey): Buffer;
  /**
   * JOB-G13-KEYROTATE seam: activates a new master-key version and returns its `kms_key_id`.
   * Prior versions remain unwrap-capable until every stored DEK has been re-wrapped.
   */
  rotateMasterKey(): string;
}

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const DEK_LENGTH = 32; // AES-256 data-encryption key

/**
 * Resolve the local master-key secret: explicit option, then the G13_MASTER_KEY environment
 * variable — key material comes from environment/config, NEVER a hardcoded literal. Outside
 * production a deterministic test-only phrase is derived so suites run without environment
 * setup; production refuses to start without the env secret (same policy as G04_RELAY_HMAC_KEY).
 */
function resolveMasterKeySecret(explicit?: string): string {
  const configured = explicit ?? process.env.G13_MASTER_KEY;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("G13_MASTER_KEY must be set in production");
  }
  return "g13-local-test-master-secret (non-production)";
}

/** Fail-closed unwrap/decrypt error — registered taxonomy code, no key bytes in the message. */
function integrityFailed(reason: string, details: Record<string, unknown> = {}): FoundationError {
  return new FoundationError("ERR-G13-INTEGRITY_FAILED", reason, {
    details: { messageId: "ERR-G13-INTEGRITY_FAILED", ...details },
  });
}

/**
 * Local master-key KeyProvider (this environment's implementation of the seam). Derives a
 * distinct 256-bit wrapping key per key version from the configured secret; wraps/unwraps DEKs
 * with AES-256-GCM. Rotation activates a new version (old versions stay unwrap-capable so
 * JOB-G13-KEYROTATE can re-wrap) — object ciphertext is never touched by rotation.
 */
export class LocalMasterKeyProvider implements KeyProvider {
  private readonly masterKeys = new Map<string, Buffer>();
  private readonly secret: string;
  private readonly keyIdPrefix: string;
  private version = 1;

  constructor(options: { masterKeySecret?: string; keyIdPrefix?: string } = {}) {
    this.secret = resolveMasterKeySecret(options.masterKeySecret);
    this.keyIdPrefix = options.keyIdPrefix ?? "local-master";
    this.masterKeys.set(this.currentKeyId(), this.deriveKey(this.version));
  }

  currentKeyId(): string {
    return `${this.keyIdPrefix}/v${this.version}`;
  }

  wrapDek(dek: Buffer): WrappedDataKey {
    if (dek.length !== DEK_LENGTH) {
      throw new FoundationError("VALIDATION_FAILED", "A data-encryption key must be 32 bytes (AES-256)", { field: "dek" });
    }
    const kmsKeyId = this.currentKeyId();
    const masterKey = this.requireKey(kmsKeyId);
    const iv = randomBytes(GCM_IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    return { wrappedDek: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), kmsKeyId };
  }

  unwrapDek(wrapped: WrappedDataKey): Buffer {
    const masterKey = this.masterKeys.get(wrapped.kmsKeyId);
    if (!masterKey) {
      // Fail closed: an unknown kms_key_id can never yield plaintext.
      throw integrityFailed("Wrapped DEK references an unknown master key", { kmsKeyId: wrapped.kmsKeyId });
    }
    if (wrapped.wrappedDek.length < GCM_IV_LENGTH + GCM_TAG_LENGTH + 1) {
      throw integrityFailed("Wrapped DEK is malformed");
    }
    const iv = wrapped.wrappedDek.subarray(0, GCM_IV_LENGTH);
    const authTag = wrapped.wrappedDek.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH);
    const ciphertext = wrapped.wrappedDek.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH);
    try {
      const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      // Wrong key or tampered wrap: GCM auth-tag verification failed — fail closed, no partial DEK.
      throw integrityFailed("DEK unwrap failed authenticated decryption (wrong key or tampered wrap)", {
        kmsKeyId: wrapped.kmsKeyId,
      });
    }
  }

  rotateMasterKey(): string {
    this.version += 1;
    this.masterKeys.set(this.currentKeyId(), this.deriveKey(this.version));
    return this.currentKeyId();
  }

  private requireKey(kmsKeyId: string): Buffer {
    const key = this.masterKeys.get(kmsKeyId);
    if (!key) {
      throw integrityFailed("Master key version is not available", { kmsKeyId });
    }
    return key;
  }

  /** Derives the 256-bit wrapping key for a version from the configured secret (never stored). */
  private deriveKey(version: number): Buffer {
    return createHash("sha256").update(`g13-master-kek:${this.secret}:v${version}`).digest();
  }
}

/**
 * One encrypted object envelope (FR-G13-005 AC1/AC2). `objectBytes` is
 * iv || authTag || ciphertext of the blob under the per-object DEK; alongside it only
 * `wrapped_dek` + `kms_key_id` are persisted — no plaintext, no plaintext DEK.
 */
export interface EnvelopeObject {
  encryptionAlg: "aes-256-gcm";
  objectBytes: Buffer;
  wrappedDek: Buffer;
  kmsKeyId: string;
}

/** Encrypts a blob with a fresh random per-object DEK (AES-256-GCM) and wraps the DEK. */
export function encryptEnvelope(plaintext: Buffer, keyProvider: KeyProvider): EnvelopeObject {
  const dek = randomBytes(DEK_LENGTH);
  try {
    const iv = randomBytes(GCM_IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const { wrappedDek, kmsKeyId } = keyProvider.wrapDek(dek);
    return {
      encryptionAlg: "aes-256-gcm",
      objectBytes: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]),
      wrappedDek,
      kmsKeyId,
    };
  } finally {
    dek.fill(0); // the plaintext DEK never outlives the operation
  }
}

/**
 * Decrypts an envelope: unwrap the DEK via the KeyProvider, then authenticated AES-256-GCM
 * decryption. A wrong key or tampered bytes fails closed with `ERR-G13-INTEGRITY_FAILED`
 * (auth-tag verification) — partial plaintext is never returned.
 */
export function decryptEnvelope(envelope: EnvelopeObject, keyProvider: KeyProvider): Buffer {
  const dek = keyProvider.unwrapDek({ wrappedDek: envelope.wrappedDek, kmsKeyId: envelope.kmsKeyId });
  try {
    if (envelope.objectBytes.length < GCM_IV_LENGTH + GCM_TAG_LENGTH) {
      throw integrityFailed("Encrypted object is malformed");
    }
    const iv = envelope.objectBytes.subarray(0, GCM_IV_LENGTH);
    const authTag = envelope.objectBytes.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH);
    const ciphertext = envelope.objectBytes.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH);
    try {
      const decipher = createDecipheriv("aes-256-gcm", dek, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw integrityFailed("Object decryption failed auth-tag verification (wrong key or tampered ciphertext)", {
        kmsKeyId: envelope.kmsKeyId,
      });
    }
  } finally {
    dek.fill(0);
  }
}

/**
 * JOB-G13-KEYROTATE re-wrap: unwraps the DEK (old key version) and re-wraps it under the
 * provider's CURRENT master key. The encrypted object bytes are returned untouched — rotation
 * never re-encrypts or rewrites ciphertext (FR-G13-005 AC4).
 */
export function rewrapEnvelope(envelope: EnvelopeObject, keyProvider: KeyProvider): EnvelopeObject {
  const dek = keyProvider.unwrapDek({ wrappedDek: envelope.wrappedDek, kmsKeyId: envelope.kmsKeyId });
  try {
    const { wrappedDek, kmsKeyId } = keyProvider.wrapDek(dek);
    return { encryptionAlg: envelope.encryptionAlg, objectBytes: envelope.objectBytes, wrappedDek, kmsKeyId };
  } finally {
    dek.fill(0);
  }
}
