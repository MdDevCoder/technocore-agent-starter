import React from "react";

interface Sparkle3DIconProps {
  className?: string;
}

export const Sparkle3DIcon: React.FC<Sparkle3DIconProps> = ({ className = "w-5 h-5" }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Gradients for 3D facets of main diamond star */}
        <linearGradient id="facetTopLeft" x1="12" y1="2" x2="4" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="facetTopRight" x1="12" y1="2" x2="20" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF1F2" />
          <stop offset="45%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
        <linearGradient id="facetBottomLeft" x1="4" y1="12" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
        <linearGradient id="facetBottomRight" x1="20" y1="12" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E11D48" />
          <stop offset="50%" stopColor="#BE123C" />
          <stop offset="100%" stopColor="#881337" />
        </linearGradient>

        {/* Center Specular Glint Glow */}
        <radialGradient id="centerGlow" cx="12" cy="12" r="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="35%" stopColor="#FEF08A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>

        {/* Floating Secondary 3D Star */}
        <linearGradient id="secondaryStar" x1="16" y1="3" x2="23" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>

        {/* Micro 3D Sparkle */}
        <linearGradient id="microSparkle" x1="3" y1="14" x2="8" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>

        <filter id="dropShadow3D" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter="url(#dropShadow3D)">
        {/* Main 3D 4-Point Faceted Star */}
        {/* Top-Left Facet */}
        <path d="M12 2 L12 12 L4 12 Z" fill="url(#facetTopLeft)" />
        {/* Top-Right Facet */}
        <path d="M12 2 L20 12 L12 12 Z" fill="url(#facetTopRight)" />
        {/* Bottom-Left Facet */}
        <path d="M4 12 L12 12 L12 22 Z" fill="url(#facetBottomLeft)" />
        {/* Bottom-Right Facet */}
        <path d="M12 12 L20 12 L12 22 Z" fill="url(#facetBottomRight)" />

        {/* Center Specular Glint */}
        <circle cx="12" cy="12" r="3.5" fill="url(#centerGlow)" />
        <circle cx="12" cy="12" r="1.2" fill="#FFFFFF" />

        {/* Secondary Upper-Right 3D Companion Star */}
        <path
          d="M19.5 3.5 L20.5 6.5 L23.5 7.5 L20.5 8.5 L19.5 11.5 L18.5 8.5 L15.5 7.5 L18.5 6.5 Z"
          fill="url(#secondaryStar)"
        />
        <circle cx="19.5" cy="7.5" r="0.8" fill="#FFFFFF" />

        {/* Micro Lower-Left Sparkle */}
        <path
          d="M5.5 15.5 L6 17 L7.5 17.5 L6 18 L5.5 19.5 L5 18 L3.5 17.5 L5 17 Z"
          fill="url(#microSparkle)"
        />
      </g>
    </svg>
  );
};
