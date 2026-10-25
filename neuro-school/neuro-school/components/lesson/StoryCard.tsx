'use client';

import type { StoryCard } from '@/content/types';
import { Illustration } from '@/components/Illustrations';
import { ArrowRight, CapIcon } from '@/components/Icons';
import styles from './lesson.module.css';

const ART_BG = { coral: '#FFE9E2', lavender: '#ECEAFF', mint: '#DDF5EA', butter: '#FFF1D6' } as const;
const CHIP = {
  butter: { bg: 'var(--butter-soft)', fg: 'var(--butter-ink)' },
  mint: { bg: 'var(--mint-soft)', fg: 'var(--mint-ink)' },
  lavender: { bg: 'var(--lavender)', fg: 'var(--indigo-ink)' },
} as const;

export function StoryCardView({ card, onNext, onDeeper }: { card: StoryCard; onNext: () => void; onDeeper?: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className={styles.cardStack}>
        <div className={styles.stackBack1} />
        <div className={styles.stackBack2} />
        <article className={styles.card}>
          <div className={styles.artPanel} style={{ background: ART_BG[card.illustrationBg] }}>
            <Illustration id={card.illustration} />
          </div>
          <div className={styles.cardText}>
            <h1 className={styles.cardTitle}>{card.title}</h1>
            <p className={styles.cardBody}>{card.body}</p>
          </div>
          {card.chips && (
            <div className={styles.chips}>
              {card.chips.map((c) => (
                <div key={c.label} className={styles.chip} style={{ background: CHIP[c.tone].bg, color: CHIP[c.tone].fg }}>
                  <strong>{c.label}</strong>
                  <span>{c.sub}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
      <div className={styles.footer}>
        {onDeeper ? (
          <button type="button" className={styles.deeperBtn} onClick={onDeeper}>
            <CapIcon size={16} />
            Go deeper
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={styles.swipeHint} onClick={onNext}>
          Swipe to continue <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
