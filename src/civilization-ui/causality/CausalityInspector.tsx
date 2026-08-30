/**
 * Interactive Lineage & Causality Inspector Drawer.
 *
 * Visualizes authentic backward-causal provenance chains derived directly from
 * cryptographically signed civilization events. Allows deep inspection of why an agent
 * evolved, why a capability price surged, or how a dispute reached consensus.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type { AgentProfile } from "../../civilization/types/agent.ts";
import type { DidString } from "../../civilization/types/common.ts";
import { CausalLineageEngine } from "../../civilization/causality/engine.ts";
import type { CausalLineageGraph, CausalNode, CausalNodeType } from "../../civilization/causality/types.ts";

interface CausalityInspectorProps {
  readonly entityType: "agent" | "capability" | "dispute" | "mission";
  readonly entityId: string;
  readonly allEvents: readonly CivilizationEvent[];
  readonly population?: ReadonlyMap<DidString, { profile: AgentProfile }>;
  readonly onClose: () => void;
  readonly onSelectEvent?: (eventId: string) => void;
  readonly onSelectAgent?: (did: DidString) => void;
}

export function CausalityInspector({
  entityType,
  entityId,
  allEvents,
  population,
  onClose,
  onSelectEvent,
  onSelectAgent,
}: CausalityInspectorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const lineageEngine = useMemo(() => new CausalLineageEngine(), []);

  const causalGraph: CausalLineageGraph = useMemo(() => {
    const targetType = entityType === "mission" ? "agent" : entityType;
    return lineageEngine.buildCausalGraph({ type: targetType, id: entityId }, allEvents);
  }, [lineageEngine, entityType, entityId, allEvents]);

  const agentLineage = useMemo(() => {
    if (entityType === "agent" && population) {
      return lineageEngine.deriveAgentLineage(entityId, allEvents, population);
    }
    return null;
  }, [lineageEngine, entityType, entityId, allEvents, population]);

  const selectedNode: CausalNode | null = useMemo(() => {
    if (!selectedNodeId) return causalGraph.nodes[0] || null;
    return causalGraph.nodes.find((n: CausalNode) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, causalGraph]);

  const selectedEvent = useMemo(() => {
    if (!selectedNode?.sourceEventId) return null;
    return allEvents.find((e) => e.eventId === selectedNode.sourceEventId) || null;
  }, [selectedNode, allEvents]);

  const getNodeColor = (nodeType: CausalNodeType) => {
    switch (nodeType) {
      case "CAPABILITY_GAP":
        return "border-amber-500/50 bg-amber-500/10 text-amber-400";
      case "LEARNING_INVESTMENT":
        return "border-sky-500/50 bg-sky-500/10 text-sky-400";
      case "BENCHMARK_VERIFICATION":
        return "border-purple-500/50 bg-purple-500/10 text-purple-400";
      case "ATTESTATION":
        return "border-emerald-500/50 bg-emerald-500/10 text-emerald-400";
      case "MISSION_DEMAND":
      case "WORK_EXECUTION":
      case "ECONOMIC_SETTLEMENT":
        return "border-signal/50 bg-signal/10 text-signal";
      case "COURT_DISPUTE":
      case "JUDICIAL_VERDICT":
        return "border-rose-500/50 bg-rose-500/10 text-rose-400";
      default:
        return "border-hairline bg-panel text-ink";
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-signal/30 bg-void/95 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 bg-panel/40">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-signal animate-pulse" />
          <span className="mono text-xs font-bold uppercase tracking-wider text-signal">
            CAUSAL LINEAGE PROVENANCE
          </span>
          <span className="rounded bg-panel px-2 py-0.5 mono text-[10px] text-muted">
            {entityType.toUpperCase()}: {entityId.slice(0, 16)}...
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Causal Graph Flow Timeline */}
        <div className="flex-1 overflow-y-auto p-4 border-r border-hairline/60 space-y-4">
          <div className="flex items-center justify-between">
            <span className="mono text-xs font-semibold text-ink">
              Backward Causal Chain ({causalGraph.nodes.length} Nodes, {causalGraph.edges.length} Causal Links)
            </span>
            <span className="mono text-[10px] text-faint">Derived from Signed Event Stream</span>
          </div>

          {/* Agent Emergence Summary if Agent */}
          {agentLineage && (
            <div className="rounded-lg border border-hairline bg-panel/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="mono text-xs font-bold text-ink">Evolutionary Provenance</span>
                <span className="mono text-[10px] text-emerald-400 font-medium">
                  +{agentLineage.acquiredCapabilities.length} Acquired Capabilities
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mono text-[10px]">
                <div className="rounded bg-void/60 p-2 border border-hairline">
                  <span className="text-faint block">Genesis Baseline:</span>
                  <span className="text-muted">{agentLineage.initialCapabilities.map((c) => c.name).join(", ")}</span>
                </div>
                <div className="rounded bg-void/60 p-2 border border-hairline">
                  <span className="text-faint block">Current Active:</span>
                  <span className="text-signal font-semibold">{agentLineage.currentCapabilities.map((c) => c.name).join(", ")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Nodes */}
          {causalGraph.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center mono text-xs text-muted">
              <span>No direct causal event dependencies recorded for this entity yet.</span>
            </div>
          ) : (
            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline">
              {causalGraph.nodes.map((node: CausalNode) => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`relative pl-8 cursor-pointer transition-all ${
                      isSelected ? "scale-[1.01]" : "opacity-90 hover:opacity-100"
                    }`}
                  >
                    {/* Circle Node Icon on Line */}
                    <div
                      className={`absolute left-2 top-3 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 transition-all ${
                        isSelected
                          ? "border-signal bg-signal shadow-lg shadow-signal/40"
                          : "border-hairline bg-void"
                      }`}
                    />

                    {/* Node Card */}
                    <div
                      className={`rounded-lg border p-3 transition-all ${getNodeColor(node.nodeType)} ${
                        isSelected ? "ring-1 ring-signal shadow-lg" : "hover:border-signal/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="mono text-[10px] font-bold tracking-wider">
                          [{node.nodeType}]
                        </span>
                        <span className="mono text-[9px] text-faint">
                          {node.timestamp.slice(11, 19)} UTC
                        </span>
                      </div>
                      <div className="mono text-xs font-semibold mt-1 text-ink">{node.title}</div>
                      <div className="mono text-[11px] text-muted mt-0.5">{node.summary}</div>

                      {node.sourceEventId && (
                        <div className="mt-2 flex items-center justify-between border-t border-hairline/40 pt-1.5 mono text-[9px]">
                          <span className="text-faint">Event: {node.sourceEventId.slice(0, 16)}...</span>
                          <span className="text-signal hover:underline">Inspect Node →</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Node & Cryptographic Evidence Details */}
        <div className="w-80 flex flex-col overflow-y-auto p-4 bg-void/70 space-y-4">
          <div className="mono text-xs font-bold text-ink border-b border-hairline pb-2">
            Node Cryptographic Evidence
          </div>

          {selectedNode ? (
            <div className="space-y-3 mono text-[11px]">
              <div>
                <span className="text-faint block text-[10px]">Node ID:</span>
                <span className="text-ink break-all select-all font-mono">{selectedNode.id}</span>
              </div>

              <div>
                <span className="text-faint block text-[10px]">Node Category:</span>
                <span className="font-semibold text-signal">{selectedNode.nodeType}</span>
              </div>

              {selectedNode.sourceEventId && (
                <div>
                  <span className="text-faint block text-[10px]">Source Signed Event:</span>
                  <button
                    onClick={() => onSelectEvent?.(selectedNode.sourceEventId!)}
                    className="text-signal hover:underline break-all select-all text-left"
                  >
                    {selectedNode.sourceEventId}
                  </button>
                </div>
              )}

              {selectedEvent && (
                <div className="rounded border border-hairline bg-panel/40 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-faint text-[10px]">Event Type:</span>
                    <span className="text-emerald-400 font-bold text-[10px]">{selectedEvent.eventType}</span>
                  </div>

                  <div>
                    <span className="text-faint block text-[10px]">Author DID:</span>
                    <button
                      onClick={() => onSelectAgent?.(selectedEvent.authorDid)}
                      className="text-muted hover:text-ink text-[10px] break-all text-left"
                    >
                      {selectedEvent.authorDid}
                    </button>
                  </div>

                  <div>
                    <span className="text-faint block text-[10px]">Signature Proof:</span>
                    <span className="text-muted text-[9px] break-all select-all font-mono block bg-void/80 p-1.5 rounded border border-hairline">
                      {selectedEvent.signature.slice(0, 48)}...
                    </span>
                  </div>

                  <div>
                    <span className="text-faint block text-[10px]">Payload:</span>
                    <pre className="text-[9px] text-muted overflow-x-auto bg-void/80 p-1.5 rounded border border-hairline max-h-36">
                      {JSON.stringify(selectedEvent.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                <div>
                  <span className="text-faint block text-[10px]">Calculated Lineage Metadata:</span>
                  <pre className="text-[9px] text-muted overflow-x-auto bg-void/80 p-1.5 rounded border border-hairline max-h-32">
                    {JSON.stringify(selectedNode.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-faint mono text-xs">Select a node to inspect evidence.</div>
          )}
        </div>
      </div>
    </div>
  );
}
