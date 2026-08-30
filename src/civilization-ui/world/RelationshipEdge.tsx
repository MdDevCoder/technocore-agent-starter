/**
 * Relationship Edge Component.
 *
 * Renders curved SVG paths representing verifiable interactions:
 * collaborations, proposals, peer reviews, court disputes, and trust relationships.
 */

"use client";

import React from "react";
import type { MapGraphEdge } from "../types.ts";

interface RelationshipEdgeProps {
  readonly edge: MapGraphEdge;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export const RelationshipEdge: React.FC<RelationshipEdgeProps> = ({
  edge,
  fromX,
  fromY,
  toX,
  toY,
}) => {
  // Compute quadratic bezier curve midpoint with offset for natural curve
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null;

  // Perpendicular offset
  const curvature = 0.15;
  const midX = (fromX + toX) / 2 - dy * curvature;
  const midY = (fromY + toY) / 2 + dx * curvature;

  const pathData = `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;

  // Color & dash styling based on interaction type
  let strokeColor = "rgba(79, 227, 193, 0.25)"; // signal cyan
  let strokeDasharray = "none";
  let strokeWidth = 1 + edge.strength * 2;

  switch (edge.type) {
    case "collaboration":
      strokeColor = edge.active ? "rgba(63, 217, 139, 0.7)" : "rgba(63, 217, 139, 0.3)";
      strokeDasharray = "4 4";
      break;
    case "review":
      strokeColor = "rgba(242, 178, 62, 0.6)";
      strokeDasharray = "2 3";
      break;
    case "dispute":
      strokeColor = "rgba(255, 107, 107, 0.8)";
      strokeWidth = 2.5;
      break;
    case "proposal":
      strokeColor = "rgba(79, 227, 193, 0.4)";
      strokeDasharray = "3 3";
      break;
    case "trust":
      strokeColor = "rgba(79, 227, 193, 0.3)";
      break;
    case "assignment":
      strokeColor = "rgba(139, 146, 156, 0.4)";
      break;
  }

  return (
    <g className="transition-all duration-300">
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />
      {edge.active && (
        <circle r={2.5} fill="#4fe3c1">
          <animateMotion dur="2.5s" repeatCount="indefinite" path={pathData} />
        </circle>
      )}
    </g>
  );
};
