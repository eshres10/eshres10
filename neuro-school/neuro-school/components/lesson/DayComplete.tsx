'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import type { Lesson } from '@/content/types';
import { Illustration } from '@/components/Illustrations';
import { KeyIcon } from '@/components/Icons';

export function DayComplete({
  lesson,
  streak,
  stats,
  reviewOnly,
}: {
  lesson: Lesson;
  streak: number;
  stats: { newIdeas: number; reviewed: number; minutes: number };
  reviewOnly: boolean;
}) {
  const tiles = reviewOnly
    ? [{ n: stats.reviewed, label: 'reviewed', bg: 'var(--mint-soft)', fg: 'var(--mint-ink)' }]
    : [
        { n: stats.newIdeas, label: 'new ideas', bg: 'var(--butter-soft)', fg: 'var(--butter-ink)' },
        { n: stats.reviewed, label: 'reviewed', bg: 'var(--mint-soft)', fg: 'var(--mint-ink)' },
        { n: stats.minutes, label: 'minutes', bg: 'var(--lavender)', fg: 'var(--indigo-ink)' },
      ];

  return (
    <main className="shell" style={{ padding: 'max(56px, env(safe-area-inset-top)) 20px 32px', gap: 20, overflowY: 'auto' }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        style={{ height: 260, borderRadius: 28, background: 'var(--indigo)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Illustration id="flame" label={`Celebration: ${streak} day streak`} />
        <span className="display" style={{ color: '#fff', fontSize: 22, marginTop: -28 }}>
          {streak} day streak
        </span>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 32, letterSpacing: -0.5 }}>{reviewOnly ? 'Review done' : `Day ${lesson.day} done`}</h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {reviewOnly
            ? 'Those memories just got a little stronger.'
            : 'You can now explain why people lose their keys. Most people can’t.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 10 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: t.bg, color: t.fg, borderRadius: 18, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 26 }}>{t.n}</span>
            <span style={{ fontSize: 13 }}>{t.label}</span>
          </div>
        ))}
      </div>

      {!reviewOnly && lesson.tomorrow && (
        <div style={{ background: 'var(--ink)', color: '#fff', borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--butter)' }}>Tomorrow’s mystery</span>
          <span className="display" style={{ fontSize: 20, lineHeight: 1.25 }}>{lesson.tomorrow.title}</span>
          <span style={{ fontSize: 14, lineHeight: 1.5, color: '#C9C7D1' }}>{lesson.tomorrow.teaser}</span>
        </div>
      )}

      {!reviewOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 20, background: 'var(--mint-soft)', color: 'var(--mint-ink)' }}>
          <span style={{ flexShrink: 0, display: 'flex' }}>
            <KeyIcon size={22} />
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.4 }}>
            <strong>Today’s mission:</strong> {lesson.mission}
          </span>
        </div>
      )}

      <Link href="/" className="btn btn-ink" style={{ marginTop: 'auto', flexShrink: 0 }}>
        Back to home
      </Link>
    </main>
  );
}
