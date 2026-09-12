"use client";

/**
 * Technocore Agent Workspace: React Hook
 *
 * Provides reactive access to persistent, non-secret workspace configuration,
 * synchronizing with the active AgentSession when an identity is adopted.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAgentSession } from "./AgentSession.tsx";
import {
  createDefaultWorkspace,
  updateWorkspaceProject,
  addWorkspaceActivity,
  updateToolTelemetry,
  computeWorkspaceReadiness,
} from "../workspace/state.ts";
import {
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
  resetWorkspaceStorage,
  exportWorkspaceJson,
  importWorkspaceJson,
} from "../workspace/persistence.ts";
import type {
  WorkspaceState,
  WorkspaceProjectConfig,
  WorkspaceToolTelemetry,
  WorkspaceActivityItem,
} from "../workspace/types.ts";

export interface UseWorkspaceReturn {
  readonly workspace: WorkspaceState;
  readonly isLoaded: boolean;
  readonly updateProject: (updates: Partial<Omit<WorkspaceProjectConfig, "id" | "createdAt">>) => void;
  readonly recordActivity: (activity: Omit<WorkspaceActivityItem, "id" | "timestamp">) => void;
  readonly recordToolUsage: (tool: keyof WorkspaceToolTelemetry, data: Record<string, unknown>) => void;
  readonly resetWorkspace: () => void;
  readonly exportWorkspace: () => string;
  readonly importWorkspace: (jsonStr: string) => { ok: true } | { ok: false; error: string };
}

export function useWorkspace(): UseWorkspaceReturn {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createDefaultWorkspace());
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const session = useAgentSession();

  // Load from local storage on mount
  useEffect(() => {
    const loaded = loadWorkspaceFromStorage();
    setWorkspace(loaded);
    setIsLoaded(true);
  }, []);

  // Synchronize with active AgentSession identity & backup status
  useEffect(() => {
    if (!isLoaded) return;

    const sessionDid = session.identity?.did || null;
    const isBackupVerified = session.backup === "verified";

    setWorkspace((prev) => {
      let changed = false;
      let nextProject = prev.project;

      // Sync public DID if session has one and workspace does not or differs
      if (sessionDid && prev.project.publicDid !== sessionDid) {
        nextProject = { ...prev.project, publicDid: sessionDid };
        changed = true;
      }

      const nextReadiness = computeWorkspaceReadiness(
        nextProject,
        prev.telemetry,
        isBackupVerified,
      );

      // Check if readiness flags changed
      const readinessChanged =
        nextReadiness.identityReady !== prev.readiness.identityReady ||
        nextReadiness.backupReady !== prev.readiness.backupReady ||
        nextReadiness.contributionReady !== prev.readiness.contributionReady;

      if (changed || readinessChanged) {
        const nextState: WorkspaceState = {
          ...prev,
          project: nextProject,
          readiness: nextReadiness,
          lastActiveAt: new Date().toISOString(),
        };
        saveWorkspaceToStorage(nextState);
        return nextState;
      }

      return prev;
    });
  }, [session.identity?.did, session.backup, isLoaded]);

  // Update project configuration
  const updateProject = useCallback(
    (updates: Partial<Omit<WorkspaceProjectConfig, "id" | "createdAt">>) => {
      setWorkspace((prev) => {
        const isBackupVerified = session.backup === "verified";
        const next = updateWorkspaceProject(prev, updates, isBackupVerified);
        saveWorkspaceToStorage(next);
        return next;
      });
    },
    [session.backup],
  );

  // Record an activity item
  const recordActivity = useCallback(
    (activity: Omit<WorkspaceActivityItem, "id" | "timestamp">) => {
      setWorkspace((prev) => {
        const next = addWorkspaceActivity(prev, activity);
        saveWorkspaceToStorage(next);
        return next;
      });
    },
    [],
  );

  // Record tool execution telemetry
  const recordToolUsage = useCallback(
    (tool: keyof WorkspaceToolTelemetry, data: Record<string, unknown>) => {
      setWorkspace((prev) => {
        const isBackupVerified = session.backup === "verified";
        const next = updateToolTelemetry(prev, tool, data, isBackupVerified);
        saveWorkspaceToStorage(next);
        return next;
      });
    },
    [session.backup],
  );

  // Reset workspace
  const resetWorkspace = useCallback(() => {
    const fresh = resetWorkspaceStorage();
    setWorkspace(fresh);
  }, []);

  // Export JSON configuration
  const exportWorkspace = useCallback(() => {
    return exportWorkspaceJson(workspace);
  }, [workspace]);

  // Import JSON configuration
  const importWorkspace = useCallback(
    (jsonStr: string) => {
      const res = importWorkspaceJson(jsonStr);
      if (res.ok) {
        setWorkspace(res.state);
        saveWorkspaceToStorage(res.state);
        return { ok: true as const };
      }
      return res;
    },
    [],
  );

  return useMemo(
    () => ({
      workspace,
      isLoaded,
      updateProject,
      recordActivity,
      recordToolUsage,
      resetWorkspace,
      exportWorkspace,
      importWorkspace,
    }),
    [
      workspace,
      isLoaded,
      updateProject,
      recordActivity,
      recordToolUsage,
      resetWorkspace,
      exportWorkspace,
      importWorkspace,
    ],
  );
}
