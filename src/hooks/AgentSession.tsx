"use client";

/**
 * The one place the onboarding flow keeps its state.
 *
 * Three design decisions that are security decisions in disguise:
 *
 * **The session lives in memory only.** `IdentitySession` is held in React state and nowhere else — not
 * in `localStorage`, not in a cookie, not in a URL. A reload therefore loses it, and the import page
 * exists precisely because that is the correct trade: persisting a signing identity across reloads means
 * persisting key material somewhere a script can read it. The gate copy says so plainly rather than
 * treating the reload as a bug.
 *
 * **Only public facts are persisted.** The activity log stores a DID, rooms, sequences, signatures and
 * links, all of which were published to a public room. `src/activity/log.ts` enforces that with a field
 * allow-list; this provider does not get to widen it.
 *
 * **`refresh()` exists because the session mutates privately.** `IdentitySession` holds its backup state
 * and seed in `#private` fields and changes them in place — which is right, because copying a session
 * object would mean copying a seed. React cannot see those mutations, so any code that calls
 * `exportBackup`, `verifyBackupRestores` or `discardSeed` must call `refresh()` afterwards. The provider
 * then re-reads the getters during render. A `useSyncExternalStore` subscription would be tidier, but it
 * would mean giving the session an observer list, and the session's job is to hold a key, not to notify.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  activityNamespace,
  appendActivity,
  createActivityStore,
  mergeActivity,
  type ActivityStore,
  type RecordActivityInput,
} from "../activity/log.ts";
import type { ContributeOutcome, DetachedProof } from "../flow/contribute.ts";
import { toFlowFailure, type FlowFailure } from "../flow/failure.ts";
import type { IntroduceOutcome } from "../flow/introduce.ts";
import type { VerificationOutcome } from "../flow/verify.ts";
import type { BackupState, IdentitySession } from "../identity/session.ts";
import { createTransport, resolveConfig, type RuntimeConfig } from "../technocore/config.ts";
import type { RegistryPublishResult } from "../technocore/registry.ts";
import type { TechnocoreTransport } from "../technocore/transport.ts";
import type { ActivityEvent } from "../types/activity.ts";
import type { PublicIdentity } from "../types/identity.ts";
import { EMPTY_FLOW_STATE, type FlowState } from "../ui/steps.ts";

/** Everything the flow has actually produced. Each field is `null` until a real operation fills it. */
export interface AgentArtifacts {
  readonly introduction: IntroduceOutcome | null;
  readonly contribution: ContributeOutcome | null;
  readonly proof: DetachedProof | null;
  readonly verification: VerificationOutcome | null;
  /**
   * Latest known directory result. Held separately from `introduction.registry` because it can be
   * retried on its own from the dashboard, and the retry's answer is the current one.
   */
  readonly registry: RegistryPublishResult | null;
}

const NO_ARTIFACTS: AgentArtifacts = {
  introduction: null,
  contribution: null,
  proof: null,
  verification: null,
  registry: null,
};

export type AdoptionKind = "identity-created" | "identity-imported";

export interface AgentSessionValue {
  readonly session: IdentitySession | null;
  readonly identity: PublicIdentity | null;
  readonly origin: "generated" | "imported" | null;
  readonly backup: BackupState;
  readonly hardened: boolean;
  readonly canExportBackup: boolean;
  readonly flowState: FlowState;
  readonly artifacts: AgentArtifacts;
  readonly activity: readonly ActivityEvent[];
  /** `pending` until the first effect has run, so nothing claims a storage guarantee it has not checked. */
  readonly storage: "local" | "memory" | "pending";
  readonly config: RuntimeConfig;
  /** `null` only when configuration is invalid, in which case `transportFailure` explains why. */
  readonly transport: TechnocoreTransport | null;
  readonly transportFailure: FlowFailure | null;

  adopt(session: IdentitySession, kind: AdoptionKind): void;
  /** Drop the identity from this tab, wiping the seed rather than waiting for garbage collection. */
  forget(): void;
  /** Re-read the session's getters after an in-place mutation. */
  refresh(): void;
  log(input: Omit<RecordActivityInput, "did">): void;
  clearHistory(): void;

  setIntroduction(outcome: IntroduceOutcome): void;
  setRegistry(result: RegistryPublishResult): void;
  setContribution(outcome: ContributeOutcome): void;
  setProof(proof: DetachedProof): void;
  setVerification(outcome: VerificationOutcome): void;
}

const AgentSessionContext = createContext<AgentSessionValue | null>(null);

export function AgentSessionProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<IdentitySession | null>(null);
  const [artifacts, setArtifacts] = useState<AgentArtifacts>(NO_ARTIFACTS);
  const [activity, setActivity] = useState<readonly ActivityEvent[]>([]);
  const [namespace, setNamespace] = useState<string | null>(null);
  const [storage, setStorage] = useState<"local" | "memory" | "pending">("pending");

  // Bumped by `refresh()`. Its only job is to invalidate the memo below so the session's getters are
  // read again; the number itself is never displayed.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  // Created on first use, which is always inside an effect, so the server never builds one.
  const storeRef = useRef<ActivityStore | null>(null);
  const store = useCallback((): ActivityStore => {
    storeRef.current ??= createActivityStore();
    return storeRef.current;
  }, []);

  const config = useMemo(() => resolveConfig(), []);

  // `createTransport` validates the configured origin and throws on a bad one. Building it inside a
  // try means a mistyped environment variable renders an explanation instead of a blank error overlay.
  const [transport, transportFailure] = useMemo(() => {
    try {
      return [createTransport(config), null] as const;
    } catch (error) {
      return [null, toFlowFailure(error)] as const;
    }
  }, [config]);

  const did = session?.identity.did ?? null;

  /** Load the stored history for this DID and merge it with anything already logged this session. */
  useEffect(() => {
    if (did === null) {
      setNamespace(null);
      return;
    }

    let cancelled = false;
    void activityNamespace(did).then(
      (resolved) => {
        if (cancelled) return;
        const held = store();
        setNamespace(resolved);
        setStorage(held.kind);
        // The namespace is derived asynchronously, so events can already have been logged by the time
        // it resolves. Neither list may be discarded.
        setActivity((current) => mergeActivity(current, held.load(resolved)));
      },
      () => {
        // A fingerprint requires SHA-256. If that is unavailable the flow has already failed louder
        // elsewhere; here it just means no persistence.
        if (!cancelled) setStorage("memory");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [did, store]);

  useEffect(() => {
    if (namespace === null) return;
    store().save(namespace, activity);
  }, [namespace, activity, store]);

  const log = useCallback(
    (input: Omit<RecordActivityInput, "did">) => {
      if (did === null) return;
      setActivity((current) => appendActivity(current, { ...input, did }));
    },
    [did],
  );

  const adopt = useCallback(
    (next: IdentitySession, kind: AdoptionKind) => {
      // A new identity means a new history. Carrying the previous identity's artifacts forward would
      // let a sequence number from one DID be displayed beside another.
      setArtifacts(NO_ARTIFACTS);
      setActivity(
        appendActivity([], {
          kind,
          did: next.identity.did,
          summary:
            kind === "identity-created"
              ? "Identity created in this browser"
              : "Identity restored from an encrypted backup",
          detail: { fingerprint: next.identity.fingerprint },
        }),
      );
      setNamespace(null);
      setSession(next);
      refresh();
    },
    [refresh],
  );

  const forget = useCallback(() => {
    if (session !== null) {
      try {
        // Force, because the point of this action is to leave nothing behind. The user is warned that
        // an identity without a verified backup is lost for good before this can be reached.
        session.discardSeed({ force: true });
      } catch {
        // Already discarded. Nothing to do.
      }
    }
    setSession(null);
    setArtifacts(NO_ARTIFACTS);
    setActivity([]);
    setNamespace(null);
    refresh();
  }, [session, refresh]);

  const clearHistory = useCallback(() => {
    setActivity([]);
    if (namespace !== null) store().clear(namespace);
  }, [namespace, store]);

  const setIntroduction = useCallback((outcome: IntroduceOutcome) => {
    setArtifacts((current) => ({
      ...current,
      introduction: outcome,
      registry: outcome.registry ?? current.registry,
    }));
  }, []);

  const setRegistry = useCallback((result: RegistryPublishResult) => {
    setArtifacts((current) => ({ ...current, registry: result }));
  }, []);

  const setContribution = useCallback((outcome: ContributeOutcome) => {
    // A new contribution invalidates any previous verification: the verified record is no longer the
    // latest one, and showing a stale green tick would be a false claim about the new record.
    setArtifacts((current) => ({ ...current, contribution: outcome, verification: null }));
  }, []);

  const setProof = useCallback((proof: DetachedProof) => {
    setArtifacts((current) => ({ ...current, proof }));
  }, []);

  const setVerification = useCallback((outcome: VerificationOutcome) => {
    setArtifacts((current) => ({ ...current, verification: outcome }));
  }, []);

  const value = useMemo<AgentSessionValue>(() => {
    const backup: BackupState = session?.backupState ?? "none";
    const flowState: FlowState = session === null
      ? EMPTY_FLOW_STATE
      : {
          hasIdentity: true,
          backup,
          introduced: artifacts.introduction !== null,
          contributed: artifacts.contribution !== null,
          verified: artifacts.verification?.local.verified === true,
        };

    return {
      session,
      identity: session?.identity ?? null,
      origin: session?.origin ?? null,
      backup,
      hardened: session?.hardened ?? false,
      canExportBackup: session?.canExportBackup ?? false,
      flowState,
      artifacts,
      activity,
      storage,
      config,
      transport,
      transportFailure,
      adopt,
      forget,
      refresh,
      log,
      clearHistory,
      setIntroduction,
      setRegistry,
      setContribution,
      setProof,
      setVerification,
    };
    // `version` is a dependency with no reference in the body on purpose: it is what makes the session's
    // privately-mutated getters above be read again. The rule cannot see that, and the lint gate treats
    // warnings as errors, so the exception is declared here rather than left to accumulate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session,
    artifacts,
    activity,
    storage,
    config,
    transport,
    transportFailure,
    adopt,
    forget,
    refresh,
    log,
    clearHistory,
    setIntroduction,
    setRegistry,
    setContribution,
    setProof,
    setVerification,
    version,
  ]);

  return <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>;
}

export function useAgentSession(): AgentSessionValue {
  const value = useContext(AgentSessionContext);
  if (value === null) {
    throw new Error("useAgentSession must be used inside <AgentSessionProvider>.");
  }
  return value;
}
