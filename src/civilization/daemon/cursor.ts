/**
 * Daemon Cursor Checkpoint Manager.
 *
 * Persists and restores sequence cursors so an independent agent daemon can be
 * stopped and restarted without re-processing already acknowledged events or missing gaps.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DidString } from "../types/common.ts";
import type { DaemonCursorRecord } from "./types.ts";

export class DaemonCursorManager {
  private readonly did: DidString;
  private readonly storagePath?: string;
  private currentCursor: DaemonCursorRecord;

  constructor(did: DidString, storagePath?: string) {
    this.did = did;
    this.storagePath = storagePath;
    this.currentCursor = {
      did,
      lastAcknowledgedSequence: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Loads cursor checkpoint from disk if path exists.
   */
  async load(): Promise<DaemonCursorRecord> {
    if (!this.storagePath) {
      return this.currentCursor;
    }

    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(raw) as DaemonCursorRecord;
        if (parsed && typeof parsed.lastAcknowledgedSequence === "number") {
          this.currentCursor = {
            did: this.did,
            lastAcknowledgedSequence: parsed.lastAcknowledgedSequence,
            lastSyncedEventId: parsed.lastSyncedEventId,
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          };
        }
      }
    } catch {
      // In case of corrupt file, fallback safely to existing in-memory cursor
    }

    return this.currentCursor;
  }

  /**
   * Updates the in-memory cursor and writes to disk if storagePath is provided.
   */
  async update(sequenceNum: number, eventId?: string): Promise<DaemonCursorRecord> {
    if (sequenceNum < this.currentCursor.lastAcknowledgedSequence) {
      // Sequence numbers must never regress
      return this.currentCursor;
    }

    this.currentCursor = {
      did: this.did,
      lastAcknowledgedSequence: sequenceNum,
      lastSyncedEventId: eventId ?? this.currentCursor.lastSyncedEventId,
      updatedAt: new Date().toISOString(),
    };

    if (this.storagePath) {
      try {
        const dir = path.dirname(path.resolve(this.storagePath));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.storagePath, JSON.stringify(this.currentCursor, null, 2), "utf-8");
      } catch {
        // Disk write failure shouldn't crash the in-memory daemon loop
      }
    }

    return this.currentCursor;
  }

  getCursor(): DaemonCursorRecord {
    return this.currentCursor;
  }
}
