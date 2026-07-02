import { sha256Hex, stableStringify } from "../../platform/types";
import type { SrEvent, SrStatusEvent } from "./serviceRegisterService";

/**
 * PH-10B pure integrity math for the G12 ledger (BRD G12 FR-04 amended).
 *
 * Everything in this file recomputes hashes FROM STORED CONTENT — verification never
 * compares a stored hash to another stored hash. These functions are shared verbatim by
 * the integrity verify endpoint and JOB-G12-INTEGRITY so both walk the same code path,
 * and they operate on plain row arrays so a tampered COPY of a chain can be verified
 * (and must FAIL) without touching the live ledger.
 */

/** Explicit genesis previous-hash convention (matches the PH-10A ledger substrate). */
export const GENESIS_HASH = "0".repeat(64);

export type SrChainKind = "ENTRY" | "STATUS";

export type SrChainFailureReason = "SEQUENCE_BROKEN" | "LINK_BROKEN" | "HASH_MISMATCH";

export interface SrChainFailure {
  chain: SrChainKind;
  /** Sequence number of the first offending link (sequenceNo / statusSequenceNo). */
  sequenceNo: number;
  reason: SrChainFailureReason;
}

export interface SrChainVerification {
  result: "OK" | "FAIL";
  linksChecked: number;
  firstFailure?: SrChainFailure;
}

/**
 * Recompute the SHA-256 entry hash from stored content. The object shape reproduces
 * exactly what ServiceRegisterService.ingest hashed (canonical stable serialization
 * including the server-stamped recordedAt and previousHash; excluding id/entryHash/status).
 */
export function recomputeEntryHash(event: SrEvent): string {
  return sha256Hex(
    stableStringify({
      tenantId: event.tenantId,
      entityId: event.entityId,
      sequenceNo: event.sequenceNo,
      employeeId: event.employeeId,
      sourceModule: event.sourceModule,
      sourceReferenceId: event.sourceReferenceId,
      sourceEventVersion: event.sourceEventVersion,
      eventTypeCode: event.eventTypeCode,
      eventDate: event.eventDate,
      factKey: event.factKey,
      payload: event.payload,
      documentIds: event.documentIds,
      reversalOfEventId: event.reversalOfEventId,
      recordedAt: event.recordedAt,
      previousHash: event.previousHash,
    })
  );
}

/** Recompute the SHA-256 status hash from stored sr_status_events content (E19 sub-ledger). */
export function recomputeStatusHash(row: SrStatusEvent): string {
  return sha256Hex(
    stableStringify({
      tenantId: row.tenantId,
      entityId: row.entityId,
      employeeId: row.employeeId,
      targetEventId: row.targetEventId,
      statusSequenceNo: row.statusSequenceNo,
      transitionKind: row.transitionKind,
      fromValue: row.fromValue,
      toValue: row.toValue,
      relatedEventId: row.relatedEventId,
      actor: row.actor,
      recordedAt: row.recordedAt,
      prevStatusHash: row.prevStatusHash,
    })
  );
}

interface ChainLink {
  sequenceNo: number;
  previousHash: string;
  storedHash: string;
  recomputedHash: string;
}

function verifyLinks(chain: SrChainKind, links: ChainLink[]): SrChainVerification {
  const ordered = [...links].sort((left, right) => left.sequenceNo - right.sequenceNo);
  let priorHash = GENESIS_HASH;
  let priorSequence = 0;
  for (const link of ordered) {
    if (link.sequenceNo !== priorSequence + 1) {
      return { result: "FAIL", linksChecked: ordered.length, firstFailure: { chain, sequenceNo: link.sequenceNo, reason: "SEQUENCE_BROKEN" } };
    }
    if (link.previousHash !== priorHash) {
      return { result: "FAIL", linksChecked: ordered.length, firstFailure: { chain, sequenceNo: link.sequenceNo, reason: "LINK_BROKEN" } };
    }
    if (link.recomputedHash !== link.storedHash) {
      return { result: "FAIL", linksChecked: ordered.length, firstFailure: { chain, sequenceNo: link.sequenceNo, reason: "HASH_MISMATCH" } };
    }
    priorHash = link.storedHash;
    priorSequence = link.sequenceNo;
  }
  return { result: "OK", linksChecked: ordered.length };
}

/** Walk one employee's content chain recomputing every entry hash; report the first broken link. */
export function verifyEntryChain(events: SrEvent[]): SrChainVerification {
  return verifyLinks(
    "ENTRY",
    events.map((event) => ({
      sequenceNo: event.sequenceNo,
      previousHash: event.previousHash,
      storedHash: event.entryHash,
      recomputedHash: recomputeEntryHash(event),
    }))
  );
}

/** Walk one employee's sr_status_events sub-chain recomputing every status hash. */
export function verifyStatusChain(rows: SrStatusEvent[]): SrChainVerification {
  return verifyLinks(
    "STATUS",
    rows.map((row) => ({
      sequenceNo: row.statusSequenceNo,
      previousHash: row.prevStatusHash,
      storedHash: row.statusHash,
      recomputedHash: recomputeStatusHash(row),
    }))
  );
}

/** One per-employee chain-head leaf: {content head, status head} per BRD G12 E20. */
export interface SrChainHead {
  employeeId: string;
  entryHeadHash: string;
  statusHeadHash: string;
}

/** Canonical SHA-256 leaf over one employee's {content head, status head} pair. */
export function chainHeadLeaf(head: SrChainHead): string {
  return sha256Hex(stableStringify({ employeeId: head.employeeId, entryHeadHash: head.entryHeadHash, statusHeadHash: head.statusHeadHash }));
}

/**
 * REAL Merkle root over chain-head leaves (BRD G12 FR-04 / E20 sr_anchors).
 *
 * Algorithm (documented odd-node rule): leaves are sorted lexicographically for a
 * deterministic tree; each level pairs adjacent nodes left-to-right and hashes
 * SHA-256(leftHex + rightHex); an unpaired trailing node is PROMOTED UNCHANGED to the
 * next level (standard odd-node promotion — no self-pairing/duplication). The empty
 * ledger anchors to the explicit 64-zero genesis digest. A change to any single chain
 * head changes the root.
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return GENESIS_HASH;
  }
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index] ?? GENESIS_HASH;
      const right = level[index + 1];
      if (right !== undefined) {
        next.push(sha256Hex(left + right));
      } else {
        // Odd-node promotion: the unpaired node carries up unchanged.
        next.push(left);
      }
    }
    level = next;
  }
  return level[0] ?? GENESIS_HASH;
}
