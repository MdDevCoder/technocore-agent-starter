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
        <rect x={-45} y={-25} width={90} height={50} rx={6} fill="none" stroke="#4fe3c1" strokeWidth={2} />
      )}
      <rect
        x={-42}
        y={-22}
        width={84}
        height={44}
        rx={5}
        fill="#16191d"
        stroke={isSelected ? "#4fe3c1" : "#30353c"}
        strokeWidth={1.5}
      />
      {/* Title */}
      <text
        y={-6}
        textAnchor="middle"
        fill="#e6e8eb"
        fontSize={9}
        fontFamily="var(--font-sans)"
        fontWeight="600"
      >
        {mission.title.length > 14 ? `${mission.title.slice(0, 12)}..` : mission.title}
      </text>
      {/* Budget / Status */}
      <text
        y={8}
        textAnchor="middle"
        fill="#4fe3c1"
        fontSize={8}
        fontFamily="var(--font-mono)"
      >
        {mission.budget ? `${(mission.budget.amount / 1000).toFixed(0)}k FLOP` : "ACTIVE"}
      </text>
      {/* Requirements dot indicators */}
      <g transform="translate(0, 16)">
        {mission.requirements.map((_, i) => (
          <circle key={i} cx={(i - (mission.requirements.length - 1) / 2) * 8} cy={0} r={2} fill="#3fd98b" />
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
        <polygon points="0,-24 24,0 0,24 -24,0" fill="none" stroke="#3fd98b" strokeWidth={2} />
      )}
      <polygon points="0,-20 20,0 0,20 -20,0" fill="#16191d" stroke="#3fd98b" strokeWidth={1.5} />
      <text
        dy=".3em"
        textAnchor="middle"
        fill="#3fd98b"
        fontSize={9}
        fontFamily="var(--font-mono)"
        fontWeight="bold"
      >
        {team.memberDids.length}p
      </text>
      <text
        y={28}
        textAnchor="middle"
        fill="#8b929c"
        fontSize={7.5}
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
        <circle r={22} fill="none" stroke="#ff6b6b" strokeWidth={2} />
      )}
      <circle r={18} fill="#16191d" stroke="#ff6b6b" strokeWidth={1.5} className="animate-pulse" />
      <text
        dy=".35em"
        textAnchor="middle"
        fill="#ff6b6b"
        fontSize={11}
      >
        ⚖️
      </text>
      <text
        y={26}
        textAnchor="middle"
        fill="#ff6b6b"
        fontSize={8}
        fontFamily="var(--font-mono)"
        fontWeight="bold"
      >
        COURT
      </text>
    </g>
  );
};
