'use client';

import { useState } from 'react';
import type { MysteryCard } from '@/content/types';
import { Illustration } from '@/components/Illustrations';
import { CheckIcon } from '@/components/Icons';

export function MysteryCardView({
  card,
  onAnswered,
  onNext,
}: {
  card: MysteryCard;
  onAnswered: () => void;
  onNext: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    onAnswered();
  };

  const headline =
    picked === null
      ? ''
      : picked === card.correct
        ? 'Sharp instinct. Most people miss this'
        : picked === card.commonGuess
          ? 'Most people guess that one'
          : 'Good guess, but no';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 8px' }}>
        <Illustration id="question" />
        <h1 style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: -0.4 }}>{card.prompt}</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {card.options.map((o, i) => {
          const isCorrect = picked !== null && i === card.correct;
          const isMine = picked === i && !isCorrect;
          const faded = picked !== null && !isCorrect && !isMine;
          return (
            <button
              key={o}
              type="button"
              disabled={picked !== null}
              onClick={() => pick(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                minHeight: 60,
                padding: '14px 18px',
                borderRadius: 18,
                border: `2px solid ${faded ? 'var(--coral-line)' : 'var(--ink)'}`,
                background: isCorrect ? '#fff' : isMine ? 'var(--coral-soft)' : faded ? 'transparent' : '#fff',
                color: faded ? 'var(--coral-ink)' : 'var(--ink)',
                fontSize: 16,
                fontWeight: isCorrect ? 700 : 500,
                textAlign: 'left',
                cursor: picked === null ? 'pointer' : 'default',
                transition: 'background-color .2s, border-color .2s',
              }}
            >
              {o}
              {isMine && <span style={{ fontSize: 13, fontWeight: 700 }}>Your guess</span>}
              {isCorrect && (
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--ink)',
                    color: 'var(--mint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <CheckIcon size={16} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div
          aria-live="polite"
          style={{
            marginTop: 'auto',
            background: 'var(--ink)',
            color: '#fff',
            borderRadius: 24,
            padding: '18px 18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--butter)' }}>{headline}</span>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{card.explanation}</p>
          <button type="button" className="btn btn-white" style={{ height: 48, fontSize: 15 }} onClick={onNext}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
