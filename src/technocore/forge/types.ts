/**
 * Technocore Payload Forge: Type Definitions & Protocol Schemas.
 *
 * Defines operation types, canonicalization metadata, Unicode sweep diffs,
 * multi-language code templates, and validation results.
 */

export type ForgeOperation =
  | "room-message"
  | "lobby-checkin"
  | "contribute-record"
  | "kv-did-register"
  | "detached-proof"
  | "tclk-frame";

export interface SweptCharacter {
  readonly index: number;
  readonly char: string;
  readonly codePoint: string;
  readonly category: string;
  readonly replacement: string;
}

export interface UnicodeSweepReport {
  readonly rawText: string;
  readonly canonicalText: string;
  readonly sweptCharacters: readonly SweptCharacter[];
  readonly rawCodePoints: number;
  readonly canonicalCodePoints: number;
  readonly utf8ByteLength: number;
  readonly utf8Hex: string;
  readonly hasModifications: boolean;
}

export interface ForgeRoomMessageParams {
  readonly room: string;
  readonly nonce: string;
  readonly text: string;
  readonly did?: string;
}

export interface ForgeLobbyCheckInParams {
  readonly did: string;
  readonly nonce: string;
}

export interface ForgeContributeRecordParams {
  readonly url: string;
  readonly topic: string;
  readonly nonce: string;
  readonly did?: string;
}

export interface ForgeKvRegisterParams {
  readonly did: string;
}

export interface ForgeDetachedProofParams {
  readonly artifactUrl: string;
  readonly commit: string;
  readonly did: string;
}

export interface ForgeTclkFrameParams {
  readonly room: string;
  readonly nonce: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly dealId: string;
  readonly sku: string;
  readonly units: number;
  readonly pricePerUnitSats: number;
  readonly currency: string;
  readonly kind: "TCLK_RFQ_V1" | "TCLK_QUOTE_V1" | "TCLK_ACCEPT_V1" | "TCLK_SETTLE_V1";
}

export interface ForgeValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ForgeCanonicalResult {
  readonly operation: ForgeOperation;
  readonly destination: {
    readonly type: "HTTP_POST" | "HTTP_GET" | "LOCAL_FILE";
    readonly path: string;
    readonly room?: string;
  };
  readonly canonicalPayload: string;
  readonly canonicalPayloadBytes: Uint8Array;
  readonly utf8ByteLength: number;
  readonly codePointLength: number;
  readonly hexBytes: string;
  readonly unicodeSweep?: UnicodeSweepReport;
  readonly postBody?: Record<string, unknown>;
  readonly detachedProofBody?: Record<string, unknown>;
  readonly validationIssues: readonly ForgeValidationIssue[];
  readonly isValid: boolean;
}

export interface MultiLanguageSnippets {
  readonly curl: string;
  readonly python: string;
  readonly typescript: string;
  readonly golang: string;
}

export interface ForgeSignedResult extends ForgeCanonicalResult {
  readonly did: string;
  readonly signature: string;
  readonly isEphemeralKey: boolean;
  readonly snippets: MultiLanguageSnippets;
}
