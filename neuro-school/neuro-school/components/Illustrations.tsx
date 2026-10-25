import type { IllustrationId } from '@/content/types';

const DISPLAY = 'Plus Jakarta Sans, sans-serif';

export function Illustration({ id, label }: { id: IllustrationId; label?: string }) {
  switch (id) {
    case 'keys-thought':
      return (
        <svg width="230" height="130" viewBox="0 0 230 130" role="img" aria-label={label ?? 'A set of keys disappearing into a thought bubble'}>
          <circle cx="150" cy="58" r="44" fill="#8C83F5" />
          <circle cx="96" cy="100" r="10" fill="#8C83F5" />
          <circle cx="80" cy="116" r="6" fill="#8C83F5" />
          <circle cx="150" cy="58" r="22" fill="none" stroke="#FFD25A" strokeWidth="7" />
          <rect x="166" y="54" width="46" height="9" rx="4" fill="#FFD25A" />
          <rect x="196" y="63" width="7" height="12" rx="2" fill="#FFD25A" />
          <rect x="184" y="63" width="7" height="9" rx="2" fill="#FFD25A" />
          <path d="M28 40 q14 -14 28 0" stroke="#FF8A6E" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M30 58 q10 -10 20 0" stroke="#FF8A6E" strokeWidth="5" fill="none" strokeLinecap="round" />
          <text x="36" y="92" fontFamily={DISPLAY} fontSize="30" fontWeight="700" fill="#FFFFFF">?</text>
        </svg>
      );
    case 'camera':
      return (
        <svg width="300" height="220" viewBox="0 0 300 220" role="img" aria-label={label ?? 'A camera photographing a set of keys'}>
          <rect x="40" y="70" width="140" height="96" rx="18" fill="#16161A" />
          <rect x="64" y="56" width="40" height="20" rx="6" fill="#16161A" />
          <circle cx="110" cy="118" r="34" fill="#FF6B4A" />
          <circle cx="110" cy="118" r="20" fill="#16161A" />
          <circle cx="118" cy="110" r="6" fill="#FFFFFF" />
          <rect x="150" y="80" width="18" height="10" rx="3" fill="#FFD25A" />
          <path d="M186 104 L232 82 M186 118 L240 118 M186 132 L232 154" stroke="#FF6B4A" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" />
          <circle cx="256" cy="118" r="16" fill="none" stroke="#4B3FE0" strokeWidth="6" />
          <rect x="254" y="132" width="6" height="40" rx="3" fill="#4B3FE0" />
          <rect x="260" y="152" width="10" height="5" rx="2" fill="#4B3FE0" />
          <rect x="260" y="162" width="7" height="5" rx="2" fill="#4B3FE0" />
        </svg>
      );
    case 'shutter':
      return (
        <svg width="300" height="220" viewBox="0 0 300 220" role="img" aria-label={label ?? 'A person looking at their phone while their keys fade away'}>
          <rect x="52" y="40" width="88" height="150" rx="16" fill="#16161A" />
          <rect x="62" y="56" width="68" height="112" rx="8" fill="#FFFFFF" />
          <rect x="72" y="70" width="48" height="8" rx="4" fill="#FF6B4A" />
          <rect x="72" y="88" width="36" height="8" rx="4" fill="#D9D5FF" />
          <rect x="72" y="106" width="44" height="8" rx="4" fill="#D9D5FF" />
          <rect x="72" y="124" width="30" height="8" rx="4" fill="#D9D5FF" />
          <circle cx="132" cy="44" r="12" fill="#FF6B4A" />
          <text x="132" y="49" textAnchor="middle" fontFamily={DISPLAY} fontSize="14" fontWeight="800" fill="#FFFFFF">3</text>
          <circle cx="224" cy="96" r="20" fill="none" stroke="#16161A" strokeWidth="6" strokeDasharray="6 8" opacity="0.45" />
          <rect x="221" y="114" width="6" height="46" rx="3" fill="#16161A" opacity="0.3" />
          <rect x="227" y="138" width="10" height="5" rx="2" fill="#16161A" opacity="0.3" />
          <rect x="227" y="148" width="7" height="5" rx="2" fill="#16161A" opacity="0.3" />
          <path d="M168 70 l20 -14 M172 96 h22 M168 122 l20 14" stroke="#7A4A00" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
        </svg>
      );
    case 'hippocampus':
      return (
        <svg width="300" height="220" viewBox="0 0 300 220" role="img" aria-label={label ?? 'A seahorse-shaped hippocampus filing memory cards like a librarian'}>
          <path d="M116 46 C150 30 186 52 180 86 C176 108 150 112 146 132 C142 156 166 170 160 188 C154 202 132 200 132 186" stroke="#4B3FE0" strokeWidth="22" fill="none" strokeLinecap="round" />
          <circle cx="118" cy="48" r="20" fill="#4B3FE0" />
          <path d="M100 42 L82 36" stroke="#4B3FE0" strokeWidth="12" strokeLinecap="round" />
          <circle cx="122" cy="44" r="4" fill="#FFFFFF" />
          <rect x="196" y="58" width="64" height="44" rx="8" fill="#FFFFFF" stroke="#16161A" strokeWidth="3" />
          <rect x="206" y="70" width="34" height="5" rx="2" fill="#FF6B4A" />
          <rect x="206" y="82" width="44" height="5" rx="2" fill="#D9D5FF" />
          <rect x="204" y="112" width="64" height="44" rx="8" fill="#FFD25A" stroke="#16161A" strokeWidth="3" />
          <rect x="214" y="124" width="40" height="5" rx="2" fill="#16161A" />
          <rect x="214" y="136" width="28" height="5" rx="2" fill="#7A4A00" />
          <rect x="40" y="128" width="64" height="44" rx="8" fill="#7FD8B5" stroke="#16161A" strokeWidth="3" />
          <rect x="50" y="140" width="40" height="5" rx="2" fill="#0E5A3E" />
          <rect x="50" y="152" width="26" height="5" rx="2" fill="#0E5A3E" />
        </svg>
      );
    case 'brain-side':
      return (
        <svg width="320" height="200" viewBox="0 0 320 200" role="img" aria-label={label ?? 'Side view of the brain with the hippocampus highlighted deep in the temporal lobe'}>
          <path d="M70 120 C50 80 80 30 140 28 C190 20 250 34 268 78 C282 112 262 140 230 146 C214 160 186 164 166 152 C140 166 104 160 94 142 C82 140 74 132 70 120 Z" fill="#3A3A45" />
          <path d="M110 60 q20 -14 40 0 M170 48 q22 -10 40 6 M120 96 q30 -10 56 4 M196 90 q22 -6 40 10 M100 124 q20 6 34 -4" stroke="#55556A" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M226 148 C232 172 222 186 206 186 C196 186 196 176 204 172" stroke="#3A3A45" strokeWidth="16" fill="none" strokeLinecap="round" />
          <path d="M142 122 C150 108 176 106 190 118 C200 128 196 142 184 140 C176 138 178 128 186 128" stroke="#FFD25A" strokeWidth="9" fill="none" strokeLinecap="round" />
          <line x1="196" y1="116" x2="262" y2="40" stroke="#FFD25A" strokeWidth="2" />
          <circle cx="262" cy="40" r="4" fill="#FFD25A" />
          <text x="232" y="28" fontFamily="DM Sans, sans-serif" fontSize="13" fontWeight="700" fill="#FFD25A">Hippocampus</text>
          <text x="20" y="190" fontFamily="DM Sans, sans-serif" fontSize="12" fill="#A9A7B3">Medial temporal lobe</text>
        </svg>
      );
    case 'question':
      return (
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="34" fill="#16161A" />
          <text x="36" y="50" textAnchor="middle" fontFamily={DISPLAY} fontSize="40" fontWeight="700" fill="#FFD25A">?</text>
        </svg>
      );
    case 'flame':
      return (
        <svg width="300" height="220" viewBox="0 0 300 220" role="img" aria-label={label ?? 'Celebration with a flame'}>
          <circle cx="40" cy="40" r="8" fill="#FFD25A" />
          <circle cx="262" cy="56" r="6" fill="#7FD8B5" />
          <circle cx="250" cy="176" r="9" fill="#FF8A6E" />
          <circle cx="52" cy="170" r="6" fill="#7FD8B5" />
          <rect x="70" y="92" width="14" height="6" rx="3" fill="#FF8A6E" transform="rotate(-30 77 95)" />
          <rect x="216" y="104" width="14" height="6" rx="3" fill="#FFD25A" transform="rotate(25 223 107)" />
          <rect x="104" y="30" width="12" height="6" rx="3" fill="#7FD8B5" transform="rotate(40 110 33)" />
          <path d="M150 30 C162 66 200 78 200 126 A50 50 0 0 1 100 126 C100 104 112 92 122 84 C122 104 132 114 142 114 C142 82 130 64 150 30 Z" fill="#FF6B4A" />
          <path d="M150 98 C156 116 172 122 172 144 A22 22 0 0 1 128 144 C128 132 136 126 142 122 C144 112 146 106 150 98 Z" fill="#FFD25A" />
        </svg>
      );
  }
}
