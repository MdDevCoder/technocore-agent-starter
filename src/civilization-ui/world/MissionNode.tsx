/**
 * Mission, Team, and Dispute Node Components in Civilization Map.
 */

"use client";

import React from "react";
import type { CivilizationMission } from "../../civilization/types/mission.ts";
import type { DynamicTeamState } from "../../civilization/world/types.ts";
import type { DisputePackage } from "../../civilization/court/types.ts";

interface MissionNodeProps {
  readonly x: number;
  readonly y: number;
  readonly mission: CivilizationMission;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export const MissionNode: React.FC<MissionNodeProps> = ({
  x,
  y,
  mission,
  isSelected,
  onClick,
}) => {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      className="cursor-pointer transition-transform duration-200 hover:scale-105"
      role="button"
      tabIndex={0}
      aria-label={`Mission ${mission.title}, Status ${mission.status}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {isSelected && (
        <rect x={-52} y={-27} width={104} height={54} rx={6} fill="none" stroke="#4fe3c1" strokeWidth={2} />
      )}
      <rect
        x={-48}
        y={-24}
        width={96}
        height={48}
        rx={5}
        fill="#16191d"
        stroke={isSelected ? "#4fe3c1" : "#30353c"}
        strokeWidth={1.5}
      />
      {/* Title */}
      <text
        y={-6}
        textAnchor="middle"
        fill="#f8fafc"
        fontSize={10}
        fontFamily="var(--font-sans)"
        fontWeight="600"
      >
        {mission.title.length > 15 ? `${mission.title.slice(0, 13)}..` : mission.title}
      </text>
      {/* Budget / Status */}
      <text
        y={9}
        textAnchor="middle"
        fill="#4fe3c1"
        fontSize={9}
        fontFamily="var(--font-mono)"
        fontWeight="bold"
      >
        {mission.budget ? `${(mission.budget.amount / 1000).toFixed(0)}k FLOP` : "ACTIVE"}
      </text>
      {/* Requirements dot indicators */}
      <g transform="translate(0, 18)">
        {mission.requirements.map((_, i) => (
          <circle key={i} cx={(i - (mission.requirements.length - 1) / 2) * 9} cy={0} r={2.5} fill="#4ade80" />
        ))}
      </g>
    </g>
  );
};

interface TeamNodeProps {
  readonly x: number;
  readonly y: number;
  readonly team: DynamicTeamState;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export const TeamNode: React.FC<TeamNodeProps> = ({
  x,
  y,
  team,
  isSelected,
  onClick,
}) => {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      className="cursor-pointer transition-transform duration-200 hover:scale-105"
      role="button"
      tabIndex={0}
      aria-label={`Team ${team.teamId}, Members: ${team.memberDids.length}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {isSelected && (
        <polygon points="0,-26 26,0 0,26 -26,0" fill="none" stroke="#4ade80" strokeWidth={2} />
      )}
      <polygon points="0,-22 22,0 0,22 -22,0" fill="#16191d" stroke="#4ade80" strokeWidth={1.5} />
      <text
        dy=".3em"
        textAnchor="middle"
        fill="#4ade80"
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight="bold"
      >
        {team.memberDids.length}p
      </text>
      <text
        y={30}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize={8.5}
        fontFamily="var(--font-mono)"
      >
        Team {team.teamId.slice(0, 7)}
      </text>
    </g>
  );
};

interface DisputeNodeProps {
  readonly x: number;
  readonly y: number;
  readonly dispute: DisputePackage;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export const DisputeNode: React.FC<DisputeNodeProps> = ({
  x,
  y,
  dispute,
  isSelected,
  onClick,
}) => {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      className="cursor-pointer transition-transform duration-200 hover:scale-105"
      role="button"
      tabIndex={0}
      aria-label={`Court Dispute ${dispute.disputeId}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {isSelected && (
        <circle r={24} fill="none" stroke="#f87171" strokeWidth={2} />
      )}
      <circle r={20} fill="#16191d" stroke="#f87171" strokeWidth={1.5} className="animate-pulse" />
      <text
        dy=".35em"
        textAnchor="middle"
        fill="#f87171"
        fontSize={12}
      >
        ⚖️
      </text>
      <text
        y={28}
        textAnchor="middle"
        fill="#f87171"
        fontSize={9}
        fontFamily="var(--font-mono)"
        fontWeight="bold"
      >
        COURT
      </text>
    </g>
  );
};
