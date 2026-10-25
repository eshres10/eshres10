type P = { size?: number; strokeWidth?: number; color?: string };

function Svg({ size = 20, strokeWidth = 2.2, color = 'currentColor', children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const ArrowRight = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const ArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const CheckIcon = (p: P) => <Svg strokeWidth={3} {...p}><path d="M5 12l5 5 9-10" /></Svg>;
export const FlameIcon = (p: P) => (
  <Svg {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" /></Svg>
);
export const CapIcon = (p: P) => (
  <Svg {...p}><path d="M3 6l9-3 9 3-9 3-9-3z" /><path d="M7 8v5c0 2 2 3 5 3s5-1 5-3V8" /></Svg>
);
export const LockIcon = (p: P) => (
  <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
);
export const RefreshIcon = (p: P) => (
  <Svg {...p}><path d="M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5" /></Svg>
);
export const MicIcon = (p: P) => (
  <Svg {...p}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
);
export const SparkIcon = (p: P) => <Svg {...p}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></Svg>;
export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
  </Svg>
);
export const CardsIcon = (p: P) => (
  <Svg {...p}><rect x="4" y="5" width="13" height="16" rx="2" /><path d="M8 3h10a2 2 0 0 1 2 2v12" /></Svg>
);
export const UserIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></Svg>
);
export const KeyIcon = (p: P) => (
  <Svg {...p}><circle cx="9" cy="9" r="5" /><path d="M13 13l7 7M17 17l2-2M15 19l2-2" /></Svg>
);
