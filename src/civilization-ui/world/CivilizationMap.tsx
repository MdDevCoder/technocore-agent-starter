/**
 * Civilization World Map / Live Graph Canvas.
 *
 * Interactive SVG visualization of the self-organizing agent society.
 * Renders agents, active missions, dynamic teams, dispute nodes, and
 * relevance-filtered interaction edges.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationWorldState } from "../../civilization/world/types.ts";
import type { MapGraphEdge, SelectionTarget } from "../types.ts";
import { AgentNode } from "./AgentNode.tsx";
import { DisputeNode, MissionNode, TeamNode } from "./MissionNode.tsx";
import { RelationshipEdge } from "./RelationshipEdge.tsx";

interface CivilizationMapProps {
  readonly worldState: CivilizationWorldState | null;
  readonly selectedTarget: SelectionTarget;
  readonly onSelectTarget: (target: SelectionTarget) => void;
}

export const CivilizationMap: React.FC<CivilizationMapProps> = ({
  worldState,
  selectedTarget,
  onSelectTarget,
}) => {
  const [filterEdges, setFilterEdges] = useState<"ALL" | "TRUST" | "COLLAB" | "DISPUTE">("ALL");

  const { agentPositions, missionPositions, teamPositions, disputePositions, edges } = useMemo(() => {
    if (!worldState) {
      return {
        agentPositions: new Map(),
        missionPositions: new Map(),
        teamPositions: new Map(),
        disputePositions: new Map(),
        edges: [],
      };
    }

    const width = 760;
    const centerX = width / 2;
    const centerY = 265;
    const radius = 205;

    // 1. Position 9 Agents in Outer Orbit
    const agentDids = Array.from(worldState.population.keys());
    const agentPosMap = new Map<string, { x: number; y: number }>();
    const totalAgents = agentDids.length;

    agentDids.forEach((did, i) => {
      const angle = (i / Math.max(1, totalAgents)) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      agentPosMap.set(did, { x, y });
    });

    // 2. Position Active Missions in Inner Left/Top
    const activeMissions = Array.from(worldState.activeMissions.values());
    const missionPosMap = new Map<string, { x: number; y: number }>();
    activeMissions.forEach((m, i) => {
      const offsetX = (i - (activeMissions.length - 1) / 2) * 115;
      missionPosMap.set(m.missionId, { x: centerX + offsetX, y: centerY - 65 });
    });

    // 3. Position Active Teams in Center
    const activeTeams = Array.from(worldState.activeTeams.values());
    const teamPosMap = new Map<string, { x: number; y: number }>();
    activeTeams.forEach((t, i) => {
      const offsetX = (i - (activeTeams.length - 1) / 2) * 95;
      teamPosMap.set(t.teamId, { x: centerX + offsetX, y: centerY + 15 });
    });

    // 4. Position Active Disputes in Center Bottom
    const activeDisputes = Array.from(worldState.activeDisputes.values());
    const disputePosMap = new Map<string, { x: number; y: number }>();
    activeDisputes.forEach((d, i) => {
      const offsetX = (i - (activeDisputes.length - 1) / 2) * 105;
      disputePosMap.set(d.disputeId, { x: centerX + offsetX, y: centerY + 85 });
    });

    // 5. Build Graph Edges
    const edgeList: MapGraphEdge[] = [];

    // Team assignments & collaborations
    activeTeams.forEach((team) => {
      team.memberDids.forEach((did) => {
        edgeList.push({
          id: `edge_team_${team.teamId}_${did}`,
          from: team.teamId,
          to: did,
          type: "collaboration",
          strength: 0.8,
          active: true,
        });
      });
    });

    // Dispute edges (claimant & respondent to dispute)
    activeDisputes.forEach((dsp) => {
      edgeList.push({
        id: `edge_dsp_clm_${dsp.disputeId}`,
        from: dsp.claimantDid,
        to: dsp.disputeId,
        type: "dispute",
        strength: 0.9,
        active: true,
      });
      edgeList.push({
        id: `edge_dsp_rsp_${dsp.disputeId}`,
        from: dsp.respondentDid,
        to: dsp.disputeId,
        type: "dispute",
        strength: 0.9,
        active: true,
      });
    });

    // Trust Graph Edges (Peer reviews & verified interactions)
    if (worldState.trustGraph && (filterEdges === "ALL" || filterEdges === "TRUST")) {
      worldState.trustGraph.edges.slice(0, 15).forEach((e, idx) => {
        edgeList.push({
          id: `edge_trust_${idx}_${e.sourceDid.slice(0, 6)}_${e.targetDid.slice(0, 6)}`,
          from: e.sourceDid,
          to: e.targetDid,
          type: "trust",
          strength: e.outcome === "positive" ? 0.9 : e.outcome === "negative" ? 0.3 : 0.6,
          active: false,
        });
      });
    }

    return {
      agentPositions: agentPosMap,
      missionPositions: missionPosMap,
      teamPositions: teamPosMap,
      disputePositions: disputePosMap,
      edges: edgeList,
    };
  }, [worldState, filterEdges]);

  if (!worldState) {
    return (
      <div className="flex h-full min-h-[460px] w-full items-center justify-center rounded-lg border border-hairline bg-graphite/50 p-8 text-center">
        <div className="max-w-md space-y-2">
          <div className="mono text-xs text-signal font-bold">AUTHORITATIVE LIVE NETWORK OBSERVATORY</div>
          <p className="text-xs text-muted">
            The World Map visualizes verified multi-agent civilization structures and reputation graphs from cryptographically signed civilization events.
          </p>
          <p className="text-xs text-faint">
            Public network wire traffic is actively streamed in the <span className="text-signal font-bold">NETWORK</span> surface. Toggle <span className="text-amber-400 font-bold">SIMULATION MODE</span> to explore the deterministic 9-agent synthetic graph.
          </p>
        </div>
      </div>
    );
  }

  // Lookup helper for coordinates
  const getNodePos = (id: string): { x: number; y: number } | null => {
    return (
      agentPositions.get(id) ??
      missionPositions.get(id) ??
      teamPositions.get(id) ??
      disputePositions.get(id) ??
      null
    );
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-hairline bg-panel shadow-2xl">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-graphite/60 px-4 py-2.5 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-ink font-bold">GRAPH_TOPOLOGY</span>
          <span className="mono text-xs text-muted font-medium">
            {worldState.population.size} CITIZENS // {worldState.activeMissions.size} MISSIONS // {worldState.activeTeams.size} TEAMS
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {(["ALL", "COLLAB", "DISPUTE", "TRUST"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterEdges(mode)}
              className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterEdges === mode
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Surface */}
      <div className="relative flex-1 cursor-crosshair min-h-0 overflow-hidden">
        <svg
          viewBox="0 0 760 560"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full select-none"
          role="img"
          aria-label="Civilization Autonomous World Map"
        >
          {/* Subtle Grid Lattice */}
          <defs>
            <pattern id="world-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(35, 39, 45, 0.4)" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(79, 227, 193, 0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          <rect width="760" height="560" fill="url(#world-grid)" />
          <circle cx="380" cy="265" r="250" fill="url(#center-glow)" />

          {/* Orbital Guidelines */}
          <circle cx="380" cy="265" r="205" fill="none" stroke="rgba(48, 53, 60, 0.35)" strokeDasharray="3 6" />
          <circle cx="380" cy="265" r="105" fill="none" stroke="rgba(48, 53, 60, 0.2)" strokeDasharray="2 4" />

          {/* Relationship Edges Layer */}
          <g className="edges-layer">
            {edges.map((edge) => {
              const from = getNodePos(edge.from);
              const to = getNodePos(edge.to);
              if (!from || !to) return null;
              return (
                <RelationshipEdge
                  key={edge.id}
                  edge={edge}
                  fromX={from.x}
                  fromY={from.y}
                  toX={to.x}
                  toY={to.y}
                />
              );
            })}
          </g>

          {/* Active Missions Layer */}
          <g className="missions-layer">
            {Array.from(worldState.activeMissions.values()).map((mission) => {
              const pos = missionPositions.get(mission.missionId);
              if (!pos) return null;
              const isSelected = selectedTarget.type === "mission" && selectedTarget.missionId === mission.missionId;
              return (
                <MissionNode
                  key={mission.missionId}
                  x={pos.x}
                  y={pos.y}
                  mission={mission}
                  isSelected={isSelected}
                  onClick={() => onSelectTarget({ type: "mission", missionId: mission.missionId })}
                />
              );
            })}
          </g>

          {/* Active Teams Layer */}
          <g className="teams-layer">
            {Array.from(worldState.activeTeams.values()).map((team) => {
              const pos = teamPositions.get(team.teamId);
              if (!pos) return null;
              const isSelected = selectedTarget.type === "mission" && selectedTarget.missionId === team.missionId;
              return (
                <TeamNode
                  key={team.teamId}
                  x={pos.x}
                  y={pos.y}
                  team={team}
                  isSelected={isSelected}
                  onClick={() => onSelectTarget({ type: "mission", missionId: team.missionId })}
                />
              );
            })}
          </g>

          {/* Active Disputes Layer */}
          <g className="disputes-layer">
            {Array.from(worldState.activeDisputes.values()).map((dispute) => {
              const pos = disputePositions.get(dispute.disputeId);
              if (!pos) return null;
              const isSelected = selectedTarget.type === "court" && selectedTarget.disputeId === dispute.disputeId;
              return (
                <DisputeNode
                  key={dispute.disputeId}
                  x={pos.x}
                  y={pos.y}
                  dispute={dispute}
                  isSelected={isSelected}
                  onClick={() => onSelectTarget({ type: "court", disputeId: dispute.disputeId })}
                />
              );
            })}
          </g>

          {/* Agent Nodes Layer */}
          <g className="agents-layer">
            {Array.from(worldState.population.values()).map((agent) => {
              const pos = agentPositions.get(agent.identity.did);
              if (!pos) return null;
              const rep = worldState.reputations.get(agent.identity.did);
              const isSelected = selectedTarget.type === "agent" && selectedTarget.did === agent.identity.did;
              return (
                <AgentNode
                  key={agent.identity.did}
                  x={pos.x}
                  y={pos.y}
                  profile={agent.profile}
                  reputation={rep}
                  isSelected={isSelected}
                  isAwakened={false}
                  onClick={() => onSelectTarget({ type: "agent", did: agent.identity.did })}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between border-t border-hairline bg-graphite/60 px-4 py-2 text-[10px] text-muted">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-signal" />
            <span>Coordinator</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-verified" />
            <span>Specialist</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-attention" />
            <span>Judge</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-fault" />
            <span>Dispute</span>
          </div>
        </div>

        <div className="mono text-faint">CLICK ANY NODE TO INSPECT DETAILED PROVENANCE</div>
      </div>
    </div>
  );
};
