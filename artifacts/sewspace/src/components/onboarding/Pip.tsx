// Pip, the Seams Club mascot: a tomato pincushion. One inline SVG; each pose
// changes the eyes, mouth, arms, tilt and confetti (values from
// docs/design/onboarding/assets/pip/poses.json). Pip is fixed copy and shapes:
// no AI behind it. Colours are design tokens.

export type PipPose = 'wave' | 'curious' | 'excited' | 'thinking' | 'happy' | 'laugh' | 'wink' | 'focus' | 'cheer';

type Pose = {
  el: string; er: string; elFill: boolean; erFill: boolean; elW: number; erW: number; hlL: number; hlR: number; hlY: number;
  m: string; mFill: boolean; al: string; ar: string; alx: number; aly: number; arx: number; ary: number; tilt: string; confetti: boolean; front: boolean;
};

const POSES: Record<PipPose, Pose> = {
  wave: { el: "M43 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M69 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", elFill: true, erFill: true, elW: 0, erW: 0, hlL: 1.6, hlR: 1.6, hlY: 66.8, m: "M52.5 79 Q60 92 67.5 79 Z", mFill: true, al: "M19 77 Q11 83 13 91", ar: "M101 72 Q113 62 110 48", alx: 13, aly: 91, arx: 110, ary: 48, tilt: "rotate(0 60 74)", confetti: false, front: false },
  curious: { el: "M43 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M69 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", elFill: true, erFill: true, elW: 0, erW: 0, hlL: 1.6, hlR: 1.6, hlY: 66.8, m: "M57 82.5 a3 3.6 0 1 0 6 0 a3 3.6 0 1 0 -6 0", mFill: true, al: "M19 77 Q11 83 13 91", ar: "M101 77 Q109 83 107 91", alx: 13, aly: 91, arx: 107, ary: 91, tilt: "rotate(-7 60 74)", confetti: false, front: false },
  excited: { el: "M42 72 Q47 64.5 52 72", er: "M68 72 Q73 64.5 78 72", elFill: false, erFill: false, elW: 3, erW: 3, hlL: 0, hlR: 0, hlY: 66.8, m: "M52.5 79 Q60 92 67.5 79 Z", mFill: true, al: "M19 71 Q8 58 12 45", ar: "M101 71 Q112 58 108 45", alx: 12, aly: 45, arx: 108, ary: 45, tilt: "rotate(0 60 74)", confetti: false, front: false },
  thinking: { el: "M43 67 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M69 67 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", elFill: true, erFill: true, elW: 0, erW: 0, hlL: 1.6, hlR: 1.6, hlY: 63.8, m: "M56 82 Q60 83 64 82", mFill: false, al: "M19 77 Q11 83 13 91", ar: "M90 80 Q92 82 94 84", alx: 13, aly: 91, arx: 60, ary: 74, tilt: "rotate(5 60 74)", confetti: false, front: true },
  happy: { el: "M43 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M69 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", elFill: true, erFill: true, elW: 0, erW: 0, hlL: 1.6, hlR: 1.6, hlY: 66.8, m: "M54 80 Q60 86.5 66 80", mFill: false, al: "M19 77 Q11 83 13 91", ar: "M101 77 Q109 83 107 91", alx: 13, aly: 91, arx: 107, ary: 91, tilt: "rotate(0 60 74)", confetti: false, front: false },
  laugh: { el: "M42 72 Q47 64.5 52 72", er: "M68 72 Q73 64.5 78 72", elFill: false, erFill: false, elW: 3, erW: 3, hlL: 0, hlR: 0, hlY: 66.8, m: "M52.5 79 Q60 92 67.5 79 Z", mFill: true, al: "M19 77 Q11 83 13 91", ar: "M101 77 Q109 83 107 91", alx: 13, aly: 91, arx: 107, ary: 91, tilt: "rotate(-6 60 74)", confetti: false, front: false },
  wink: { el: "M43 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M68 72 Q73 64.5 78 72", elFill: true, erFill: false, elW: 0, erW: 3, hlL: 1.6, hlR: 0, hlY: 66.8, m: "M54 80 Q60 86.5 66 80", mFill: false, al: "M19 77 Q11 83 13 91", ar: "M101 72 Q113 62 110 48", alx: 13, aly: 91, arx: 110, ary: 48, tilt: "rotate(4 60 74)", confetti: false, front: false },
  focus: { el: "M43 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", er: "M69 70 a4 5.2 0 1 0 8 0 a4 5.2 0 1 0 -8 0", elFill: true, erFill: true, elW: 0, erW: 0, hlL: 1.6, hlR: 1.6, hlY: 66.8, m: "M56 82 Q60 83 64 82", mFill: false, al: "M19 77 Q11 83 13 91", ar: "M101 77 Q109 83 107 91", alx: 13, aly: 91, arx: 107, ary: 91, tilt: "rotate(0 60 74)", confetti: false, front: false },
  cheer: { el: "M42 72 Q47 64.5 52 72", er: "M68 72 Q73 64.5 78 72", elFill: false, erFill: false, elW: 3, erW: 3, hlL: 0, hlR: 0, hlY: 66.8, m: "M52.5 79 Q60 92 67.5 79 Z", mFill: true, al: "M19 71 Q8 58 12 45", ar: "M101 71 Q112 58 108 45", alx: 12, aly: 45, arx: 108, ary: 45, tilt: "rotate(0 60 74)", confetti: true, front: false },
};

const MOOD: Record<PipPose, string> = {
  wave: 'friendly and waving', curious: 'curious', excited: 'excited', thinking: 'thoughtful', happy: 'happy',
  laugh: 'laughing', wink: 'cheeky, with a wink', focus: 'focused', cheer: 'delighted',
};

const INK = 'var(--color-ink)';

export function Pip({ pose = 'wave', size = 140, bob = true, className = '' }: { pose?: PipPose; size?: number; bob?: boolean; className?: string }) {
  const p = POSES[pose];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Pip, a tomato pincushion, looking ${MOOD[pose]}`}
      className={`${bob ? 'pip-bob' : ''} shrink-0 overflow-visible ${className}`}>
      <g opacity={p.confetti ? 1 : 0}>
        <rect x="6" y="20" width="6" height="6" rx="1.5" fill="var(--color-blue)" transform="rotate(20 9 23)" />
        <circle cx="104" cy="16" r="3.5" fill="var(--color-peach)" />
        <rect x="98" y="96" width="7" height="4" rx="2" fill="var(--color-yellow)" transform="rotate(-25 101 98)" />
        <circle cx="16" cy="100" r="3" fill="var(--color-red)" />
        <path d="M24 6 l2 5 5 1 -4 3 1 5 -4-3 -4 3 1-5 -4-3 5-1z" fill="var(--color-yellow)" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      <ellipse cx="60" cy="112" rx="30" ry="4" fill={INK} opacity=".12" />
      <g transform={p.tilt}>
        <ellipse cx="49" cy="105" rx="7.5" ry="4.5" fill={INK} />
        <ellipse cx="71" cy="105" rx="7.5" ry="4.5" fill={INK} />
        <path d="M47 46 L37 19" stroke="var(--color-pin)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M61 42 L63 13" stroke="var(--color-pin)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M74 46 L89 22" stroke="var(--color-pin)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="37" cy="18" r="5.2" fill="var(--color-blue)" stroke={INK} strokeWidth="2" />
        <circle cx="63" cy="12" r="5.2" fill="var(--color-peach)" stroke={INK} strokeWidth="2" />
        <circle cx="89.5" cy="21" r="5.2" fill="white" stroke={INK} strokeWidth="2" />
        <path d={p.al} stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d={p.ar} stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <circle cx={p.alx} cy={p.aly} r="3.6" fill={INK} />
        <circle cx={p.arx} cy={p.ary} r="3.6" fill={INK} />
        <path d="M60 38 C84 36 104 50 104 72 C104 92 86 106 60 106 C34 106 16 92 16 72 C16 50 36 36 60 38 Z" fill="var(--color-red)" stroke={INK} strokeWidth="3" />
        <path d="M42 44 C30 60 32 90 45 103 M78 44 C90 60 88 90 75 103" stroke="var(--color-red-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".55" />
        <path d="M60 33 L64.5 39 L72.5 37.5 L67.5 43.5 L72.5 49.5 L63.5 46.5 L60 52.5 L56.5 46.5 L47.5 49.5 L52.5 43.5 L47.5 37.5 L55.5 39 Z" fill="var(--color-yellow)" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        <ellipse cx="36" cy="81" rx="6" ry="3.6" fill="var(--color-peach)" opacity=".85" />
        <ellipse cx="84" cy="81" rx="6" ry="3.6" fill="var(--color-peach)" opacity=".85" />
        <path d={p.el} fill={p.elFill ? INK : 'none'} stroke={INK} strokeWidth={p.elW} strokeLinecap="round" />
        <path d={p.er} fill={p.erFill ? INK : 'none'} stroke={INK} strokeWidth={p.erW} strokeLinecap="round" />
        <circle cx="48.6" cy={p.hlY} r={p.hlL} fill="white" />
        <circle cx="74.6" cy={p.hlY} r={p.hlR} fill="white" />
        <path d={p.m} fill={p.mFill ? INK : 'none'} stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {p.front && <g><path d="M97 82 Q96 93 80 90" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" /><circle cx="79" cy="89.5" r="3.6" fill={INK} /></g>}
      </g>
    </svg>
  );
}
