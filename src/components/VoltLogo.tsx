import React from 'react'

interface VoltLogoProps {
  size?: number
  className?: string
  style?: React.CSSProperties
  showGlow?: boolean
}

export default function VoltLogo({ size = 36, className = '', style = {}, showGlow = true }: VoltLogoProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style
      }}
    >
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          filter: showGlow ? 'drop-shadow(0 4px 14px color-mix(in srgb, var(--accent-solid, #2563eb) 35%, transparent))' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        <defs>
          <linearGradient id="voltLogoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-solid, #2563eb)" />
            <stop offset="100%" stopColor="var(--accent-to, #0284c7)" />
          </linearGradient>
          <linearGradient id="voltLogoGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
        </defs>

        {/* Minimalist Rounded Squircle */}
        <rect
          x="44"
          y="44"
          width="424"
          height="424"
          rx="116"
          fill="url(#voltLogoBgGrad)"
        />

        {/* Soft Glass Rim */}
        <rect
          x="44"
          y="44"
          width="424"
          height="424"
          rx="116"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.28"
          strokeWidth="6"
        />

        {/* Volt: Dynamic Lightning Bolt */}
        <path
          d="M 284 96 L 180 256 L 256 256 L 216 416 L 336 244 L 260 244 Z"
          fill="url(#voltLogoGlow)"
        />

        {/* Get: Downward Speed Chevron */}
        <path
          d="M 334 322 L 366 354 L 334 386"
          fill="none"
          stroke="#ffffff"
          strokeWidth="26"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="rotate(90 350 354)"
          opacity="0.95"
        />
      </svg>
    </div>
  )
}
