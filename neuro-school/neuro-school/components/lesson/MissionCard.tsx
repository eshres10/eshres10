'use client';

import type { MissionCard } from '@/content/types';
import { KeyIcon } from '@/components/Icons';

export function MissionCardView({ card, onNext }: { card: MissionCard; onNext: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          flex: 1,
          background: 'var(--mint-soft)',
          color: 'var(--mint-ink)',
          borderRadius: 28,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <span
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: 'var(--mint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <KeyIcon size={36} color="#0E5A3E" />
        </span>
        <h1 style={{ fontSize: 30, lineHeight: 1.12, color: 'var(--ink)' }}>{card.title}</h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55 }}>{card.body}</p>
      </div>
      <button type="button" className="btn btn-ink" onClick={onNext}>
        I’ll try it
      </button>
    </div>
  );
}
