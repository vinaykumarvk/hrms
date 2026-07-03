import { FoundationError } from "../../platform/types";

/**
 * PH-26A — G13 OCR extraction engine binding
 * (docs/brd/v3/G13-document-management-secure-storage.md FR-008):
 *
 * The OcrProvider is the seam a real OCR engine binds to. PH-22B's search indexed caller-supplied
 * text; this replaces that with an actual extraction step: text comes from the document payload via
 * the provider, not from the caller. `BuiltInOcrProvider` is a deterministic in-process extractor
 * (structured text/UTF-8 payloads); a production deployment binds a sandboxed OCR engine here.
 */

export interface OcrExtractionInput {
  /** MIME type of the document being extracted. */
  mimeType: string;
  /** The raw document bytes (UTF-8 text payloads and structured JSON supported by the built-in). */
  content: string;
}

export interface OcrExtractionResult {
  text: string;
  engine: string;
  pageCount: number;
}

export interface OcrProvider {
  supports(mimeType: string): boolean;
  extract(input: OcrExtractionInput): OcrExtractionResult;
}

/**
 * Deterministic built-in extractor. Supports text/plain and application/json (extracting string
 * values). An unsupported MIME type fails closed (UNSUPPORTED_FORMAT) rather than returning empty
 * text, so an un-extractable document is never silently indexed as blank.
 */
export class BuiltInOcrProvider implements OcrProvider {
  private static readonly SUPPORTED = ["text/plain", "application/json"];

  supports(mimeType: string): boolean {
    return BuiltInOcrProvider.SUPPORTED.includes(mimeType);
  }

  extract(input: OcrExtractionInput): OcrExtractionResult {
    if (!this.supports(input.mimeType)) {
      throw new FoundationError("VALIDATION_FAILED", "UNSUPPORTED_FORMAT: OCR engine cannot extract this MIME type", {
        field: "mimeType",
        details: { mimeType: input.mimeType, supported: BuiltInOcrProvider.SUPPORTED },
      });
    }
    let text: string;
    if (input.mimeType === "application/json") {
      const collected: string[] = [];
      const walk = (v: unknown): void => {
        if (typeof v === "string") collected.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      try {
        walk(JSON.parse(input.content));
      } catch {
        throw new FoundationError("VALIDATION_FAILED", "UNSUPPORTED_FORMAT: JSON payload is malformed", { field: "content" });
      }
      text = collected.join(" ");
    } else {
      text = input.content;
    }
    const pageCount = Math.max(1, Math.ceil(text.length / 3000));
    return { text: text.trim(), engine: "builtin-ocr-v1", pageCount };
  }
}
