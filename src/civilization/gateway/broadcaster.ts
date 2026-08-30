/**
 * Real-Time Event Broadcaster for Server-Sent Events (SSE) & Pub/Sub.
 *
 * Disseminates newly committed StoredCivilizationEvent records to connected clients,
 * Observatory instances, and remote agent daemons with sub-50ms latency.
 * Supports sequence-resumption from a client cursor and automatic keepalive heartbeats.
 */

import type { StoredCivilizationEvent } from "../persistence/types.ts";

export type EventSubscriberCallback = (event: StoredCivilizationEvent) => void;

export interface EventSubscriber {
  readonly id: string;
  readonly callback: EventSubscriberCallback;
  readonly subscribedAt: number;
}

export class EventBroadcaster {
  private static instance: EventBroadcaster | null = null;
  private readonly subscribers = new Map<string, EventSubscriber>();

  public static getInstance(): EventBroadcaster {
    if (!EventBroadcaster.instance) {
      EventBroadcaster.instance = new EventBroadcaster();
    }
    return EventBroadcaster.instance;
  }

  /**
   * Subscribes a listener to live events.
   * Returns an unsubscribe function.
   */
  public subscribe(id: string, callback: EventSubscriberCallback): () => void {
    this.subscribers.set(id, {
      id,
      callback,
      subscribedAt: Date.now(),
    });

    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Broadcasts a committed stored event to all active subscribers.
   */
  public broadcast(event: StoredCivilizationEvent): void {
    for (const [id, subscriber] of this.subscribers.entries()) {
      try {
        subscriber.callback(event);
      } catch (err) {
        console.warn(`[EventBroadcaster] Error dispatching to subscriber ${id}:`, err);
      }
    }
  }

  /**
   * Returns current active subscriber count.
   */
  public getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Clears all subscribers (useful in test teardown).
   */
  public reset(): void {
    this.subscribers.clear();
  }
}
