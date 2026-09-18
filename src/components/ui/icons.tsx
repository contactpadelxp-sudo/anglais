/** Jeu d'icônes en trait, 1.6px, 24×24 — aucune dépendance externe. */

type P = { className?: string; size?: number };

function base({ size = 18, className }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export const Icon = {
  home: (p: P) => (
    <svg {...base(p)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  list: (p: P) => (
    <svg {...base(p)}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  ),
  chart: (p: P) => (
    <svg {...base(p)}>
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 9v9M17 5v13" />
    </svg>
  ),
  layers: (p: P) => (
    <svg {...base(p)}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
  settings: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  ),
  plus: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  check: (p: P) => (
    <svg {...base(p)}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  ),
  x: (p: P) => (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  left: (p: P) => (
    <svg {...base(p)}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  ),
  right: (p: P) => (
    <svg {...base(p)}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  ),
  up: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  down: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  ),
  clock: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  alert: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  ),
  target: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  wallet: (p: P) => (
    <svg {...base(p)}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M16 13h.01" />
    </svg>
  ),
  trash: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
    </svg>
  ),
  edit: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    </svg>
  ),
  sun: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  ),
  moon: (p: P) => (
    <svg {...base(p)}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  ),
  logout: (p: P) => (
    <svg {...base(p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  ),
  tag: (p: P) => (
    <svg {...base(p)}>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  ),
  code: (p: P) => (
    <svg {...base(p)}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  ),
  repeat: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 10V8a3 3 0 0 1 3-3h10l-3-3M20 14v2a3 3 0 0 1-3 3H7l3 3" />
    </svg>
  ),
  umbrella: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z" />
      <path d="M12 12v6a2.5 2.5 0 0 0 5 0" />
    </svg>
  ),
  circle: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  /** Le bouton Partager d'iOS : le geste d'installation passe par lui. */
  share: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  ),
  download: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  ),
  sparkle: (p: P) => (
    <svg {...base(p)}>
      <path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
    </svg>
  ),
  arrowRight: (p: P) => (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof Icon;

export function StreamIcon({ name, size = 18, className }: { name: string } & P) {
  const Component = (Icon as Record<string, (p: P) => React.JSX.Element>)[name] ?? Icon.circle;
  return <Component size={size} className={className} />;
}
