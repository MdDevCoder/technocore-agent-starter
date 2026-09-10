/**
 * Types and Interfaces for Technocore Public Network Synchronization.
 *
 * Provides typed data contracts for raw wire messages, verification outcomes,
 * database persistence models, room cursors, and network synchronization telemetry.
 */

export interface RawPublicWireMessage {
  seq: number;
  nonce?: string;
  did?: string;
  sig?: string;
  text: string;
}

export interface RawPublicRoomResponse {
  room: string;
  messages?: RawPublicWireMessage[];
  count?: number;
  head?: number;
  tail?: number;
}

export type VerificationStatus =
  | "VALID_CRYPTOGRAPHIC"
  | "UNVERIFIABLE_UNSIGNED"
  | "UNVERIFIABLE_UNKNOWN_DID"
  | "INVALID_SIGNATURE"
  | "MALFORMED";

export type ProtocolClassification =
  | "TCLK_CONTRACT_OFFER"
  | "TCLK_CONTRACT_ACCEPT"
  | "TCLK_STEP_EVENT"
  | "TCLK_DISPUTE_EVENT"
  | "CIVILIZATION_EVENT"
  | "CHAT_MESSAGE"
  | "NON_PROTOCOL_JSON"
  | "RAW_TEXT"
  | "UNSUPPORTED_PROTOCOL";

export interface PublicObservationRecord {
  id: string;
  room: string;
  sequence: number;
  nonce: string | null;
  did: string | null;
  signature: string | null;
  text: string;
  observedAt: string;
  verificationStatus: VerificationStatus;
  protocolClassification: ProtocolClassification;
  source: string;
  rawHash: string;
  promotedEventId: string | null;
  createdAt: string;
}

export type RoomSyncStatus = "IDLE" | "SYNCING" | "ERROR" | "GAP_DETECTED";

export interface RoomSyncCursor {
  room: string;
  lastSequence: number;
  oldestObservedSequence: number;
  highestObservedSequence: number;
  status: RoomSyncStatus;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  errorMessage: string | null;
  totalMessagesObserved: number;
  totalMessagesPromoted: number;
  updatedAt: string;
}

export interface NetworkSyncStatus {
  isOnline: boolean;
  networkEndpoint: string;
  discoveredRooms: string[];
  trackedRooms: RoomSyncCursor[];
  totalMessagesObserved: number;
  totalMessagesPromoted: number;
  totalVerifiedValid: number;
  totalInvalidOrUnverifiable: number;
  lastSyncAt: string | null;
  syncLagMs: number | null;
  retentionGapDetected: boolean;
}

export interface SyncOptions {
  rooms?: string[];
  discoverPublicRooms?: boolean;
  maxMessagesPerRoom?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  waitSec?: number;
  maxConcurrentRooms?: number;
}

export interface ContinuousSyncConfig {
  endpoint?: string;
  pollIntervalMs?: number;
  waitSec?: number;
  timeoutMs?: number;
  maxMessagesPerRoom?: number;
  maxConcurrentRooms?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffFactor?: number;
  discoverPublicRooms?: boolean;
}

export type NetworkStreamEventType =
  | "connected"
  | "network-sync-status"
  | "network-observation"
  | "network-cursor"
  | "civilization-event"
  | "ping";

export interface NetworkStreamMessage {
  type: NetworkStreamEventType;
  data: unknown;
  timestamp: string;
  sequence?: number;
}

export type NetworkObservationListener = (observation: PublicObservationRecord) => void;
export type NetworkStatusListener = (status: NetworkSyncStatus) => void;

export interface VerificationPipelineResult {
  status: VerificationStatus;
  classification: ProtocolClassification;
  rawHash: string;
  extractedDid: string | null;
  signature: string | null;
  parsedPayload?: unknown;
  diagnostics?: string;
}

