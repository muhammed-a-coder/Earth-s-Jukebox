import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.4 4.4" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3M9 21h6" />
    </svg>
  );
}

export function SpeakerIcon({ muted = false, ...props }: IconProps & { muted?: boolean }) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      {muted ? (
        <>
          <path d="m16 9 5 5M21 9l-5 5" />
        </>
      ) : (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
          <path d="M18.5 6.5a8 8 0 0 1 0 11" />
        </>
      )}
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.2h.01" />
    </svg>
  );
}

export function OrbitIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)" />
      <circle cx="20.2" cy="7.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.8c.6 4.6 2.6 6.6 7.2 7.2-4.6.6-6.6 2.6-7.2 7.2-.6-4.6-2.6-6.6-7.2-7.2 4.6-.6 6.6-2.6 7.2-7.2Z" />
      <path d="M19 16.5c.2 1.9 1.1 2.8 3 3-1.9.2-2.8 1.1-3 3-.2-1.9-1.1-2.8-3-3 1.9-.2 2.8-1.1 3-3Z" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m4 4 16 8-16 8 3-8z" />
      <path d="M7 12h13" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}
