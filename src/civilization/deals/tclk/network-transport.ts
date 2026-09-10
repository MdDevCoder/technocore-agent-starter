/**
 * TCLK Network Transport and NoteStore Adapter.
 *
 * Connects the @flop-labs/tclk protocol engine and PaperRail to the live
 * Technocore room and KV endpoints without modifying the core state machine.
 */

import type { NoteStore } from "@flop-labs/tclk";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import { kvReadPath, kvSetPath, type RoomReadOptions } from "../../../technocore/profile.ts";
import { postSignedMessage, readRoom, type PostedRecord, type RoomSnapshot } from "../../../technocore/room.ts";
import { createTransport, resolveConfig } from "../../../technocore/config.ts";
import type { TechnocoreTransport } from "../../../technocore/transport.ts";

/**
 * Technocore-backed implementation of @flop-labs/tclk NoteStore.
 * Reads and writes single-line string notes from/to Technocore KV namespaces with CAS semantics.
 */
export class TechnocoreNoteStore implements NoteStore {
  private readonly transport: TechnocoreTransport;

  constructor(transport: TechnocoreTransport) {
    this.transport = transport;
  }

  /**
   * Retrieves a stored note line. Returns null if absent or 404.
   */
  async get(ns: string, key: string): Promise<string | null> {
    try {
      const response = await this.transport.send({
        method: "GET",
        path: kvReadPath(ns, key),
      });

      if (response.status === 404 || !response.ok) {
        return null;
      }

      const trimmed = response.text.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  /**
   * Sets a note line with optional compare-and-set or ifAbsent condition.
   * Returns false when a conditional write loses (e.g. HTTP 409 or conflict).
   */
  async set(
    ns: string,
    key: string,
    value: string,
    condition?: { ifAbsent?: true } | { if?: string },
  ): Promise<boolean> {
    try {
      const condParam = condition
        ? "ifAbsent" in condition && condition.ifAbsent
          ? { ifAbsent: true }
          : "if" in condition && condition.if !== undefined
            ? { if: condition.if }
            : undefined
        : undefined;

      const response = await this.transport.send({
        method: "GET",
        path: kvSetPath(ns, key, value, condParam),
      });

      if (response.status === 409) {
        return false;
      }

      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Network transport adapter bridging TCLK deals to Technocore rooms and KV store.
 */
export class TclkNetworkTransport {
  readonly transport: TechnocoreTransport;
  readonly noteStore: TechnocoreNoteStore;

  constructor(transport?: TechnocoreTransport) {
    this.transport = transport ?? createTransport(resolveConfig());
    this.noteStore = new TechnocoreNoteStore(this.transport);
  }

  /**
   * Fetches room messages from public or private deal rooms.
   */
  async fetchRoomMessages(
    room: string,
    options: RoomReadOptions & { readonly signal?: AbortSignal } = {},
  ): Promise<RoomSnapshot> {
    return readRoom(this.transport, room, options);
  }

  /**
   * Posts an already-signed TCLK message to a room.
   */
  async postSignedFrame(
    room: string,
    message: SignedRoomMessage,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<PostedRecord> {
    return postSignedMessage(this.transport, room, message, options);
  }

  /**
   * Returns the NoteStore interface for PaperRail integration.
   */
  getNoteStore(): NoteStore {
    return this.noteStore;
  }

  /**
   * Probes public reachability of the Technocore transport.
   */
  async isReachable(signal?: AbortSignal): Promise<boolean> {
    try {
      const snapshot = await readRoom(this.transport, "lobby", { limit: 1, signal });
      return snapshot !== null && Array.isArray(snapshot.messages);
    } catch {
      return false;
    }
  }
}
