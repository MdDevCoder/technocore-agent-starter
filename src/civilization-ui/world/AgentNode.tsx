/**
 * Agent Node Component in Civilization Map.
 *
 * Visualizes individual cryptographically identified agents with lifecycle halos,
 * reputation badges, role tags, and selection indicators.
 */

"use client";

import React from "react";
import type { AgentProfile, AgentReputation } from "../../civilization/types/agent.ts";

interface AgentNodeProps {
  readonly x: number;
  readonly y: number;
  readonly profile: AgentProfile;
  readonly reputation?: AgentReputation;
  readonly isSelected: boolean;
  readonly isAwakened: boolean;
  readonly onClick: () => void;
}

export const AgentNode: React.FC<AgentNodeProps> = ({
  x,
  y,
  profile,
  reputation,
  isSelected,
  isAwakened,
  onClick,
}) => {
  const score = reputation ? reputation.score.toFixed(0) : "80";
  const initials = profile.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const isCoordinator = profile.role.includes("Coordinator");
  const isJudge = profile.role.includes("Judge");

  const badgeColor = isCoordinator ? "#4fe3c1" : isJudge ? "#f2b23e" : "#3fd98b";

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      className="cursor-pointer transition-transform duration-200 hover:scale-105"
      role="button"
      tabIndex={0}
      aria-label={`Agent ${profile.displayName}, Role ${profile.role}, Reputation ${score}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {/* Outer pulse when awakened */}
      {isAwakened && (
        <circle r={35} fill="none" stroke="#4fe3c1" strokeWidth={1.5} opacity={0.6} className="animate-ping" />
      )}

      {/* Selection highlight ring */}
      {isSelected && (
        <circle r={30} fill="none" stroke="#4fe3c1" strokeWidth={2.5} strokeDasharray="4 2" />
      )}

      {/* Base node background */}
      <circle
        r={24}
        fill="#16191d"
        stroke={isSelected ? "#4fe3c1" : "#23272d"}
        strokeWidth={1.5}
        className="shadow-md"
      />

      {/* Avatar Initials */}
      <text
        textAnchor="middle"
        dy=".35em"
        fill="#f8fafc"
        fontSize={12}
        fontFamily="var(--font-mono)"
        fontWeight="600"
      >
        {initials}
      </text>

      {/* Mini Reputation Pill */}
      <g transform="translate(16, -16)">
        <rect
          x={-11}
          y={-7.5}
          width={22}
          height={15}
          rx={3.5}
          fill="#101215"
          stroke={badgeColor}
          strokeWidth={1}
        />
        <text
          textAnchor="middle"
          dy=".35em"
          fill={badgeColor}
          fontSize={8.5}
          fontFamily="var(--font-mono)"
          fontWeight="bold"
        >
          {score}
        </text>
      </g>

      {/* Agent Name Tag */}
      <text
        y={35}
        textAnchor="middle"
        fill="#f8fafc"
        fontSize={11}
        fontFamily="var(--font-sans)"
        fontWeight="600"
      >
        {profile.displayName}
      </text>

      {/* Subtitle / Role Tag */}
      <text
        y={47}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize={9.5}
        fontFamily="var(--font-mono)"
      >
        {profile.role.length > 20 ? `${profile.role.slice(0, 18)}...` : profile.role}
      </text>
    </g>
  );
};
