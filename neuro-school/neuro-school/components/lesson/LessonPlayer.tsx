'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import type { Card, Lesson } from '@/content/types';
import { useProgress } from '@/lib/progress';
import { CloseIcon } from '@/components/Icons';
import { QuestionCardView } from './QuestionCard';
import { MysteryCardView } from './MysteryCard';
import { StoryCardView } from './StoryCard';
import { ExplainCardView } from './ExplainCard';
import { MissionCardView } from './MissionCard';
import { DeeperSheet } from './DeeperSheet';
import { DayComplete } from './DayComplete';
import styles from './lesson.module.css';

type Theme = 'paper' | 'coral' | 'lavender';

const themeFor = (c: Card): Theme => (c.type === 'mystery' ? 'coral' : c.type === 'explain' ? 'lavender' : 'paper');

/** Cards that must be answered before the user can move forward. */
const isGated = (c: Card) => c.type === 'review' || c.type === 'recall' || c.type === 'mystery' || c.type === 'explain';

export function LessonPlayer({ lesson, reviewOnly }: { lesson: Lesson; reviewOnly: boolean }) {
  const cards = useMemo(
    () => (reviewOnly ? lesson.cards.filter((c) => c.type === 'review') : lesson.cards),
    [lesson, reviewOnly],
  );
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [deeperOpen, setDeeperOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [nudge, setNudge] = useState(0);
  const { progress, rate, completeDay, saveForLater } = useProgress();

  const card = cards[index];
  const theme = finished ? 'paper' : themeFor(card);
  const canAdvance = !isGated(card) || done[card.id];

  const markDone = useCallback((id: string) => setDone((d) => ({ ...d, [id]: true })), []);

  const go = useCallback(
    (step: 1 | -1, force = false) => {
      if (step === 1 && !force && !canAdvance) {
        setNudge((n) => n + 1);
        return;
      }
      const next = index + step;
      if (next < 0) return;
      if (next >= cards.length) {
        if (!reviewOnly) completeDay(lesson.day);
        setFinished(true);
        return;
      }
      setDirection(step);
      setIndex(next);
    },
    [canAdvance, index, cards.length, completeDay, lesson.day, reviewOnly],
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -90) go(1);
    else if (swipe > 90) go(-1);
  };

  if (finished) {
    const stats = {
      newIdeas: lesson.cards.filter((c) => c.type === 'story').length,
      reviewed: lesson.cards.filter((c) => c.type === 'review').length,
      minutes: lesson.minutes,
    };
    return <DayComplete lesson={lesson} streak={progress.streak} stats={stats} reviewOnly={reviewOnly} />;
  }

  const next = () => go(1, true);

  return (
    <main className={`shell ${styles.player}`} data-theme={theme}>
      <div className={styles.top}>
        <div className={styles.segments} role="progressbar" aria-valuemin={1} aria-valuemax={cards.length} aria-valuenow={index + 1} aria-label="Lesson progress">
          {cards.map((c, i) => (
            <span key={c.id} className={styles.segment} data-on={i <= index} />
          ))}
        </div>
        <div className={styles.topRow}>
          <Link href="/" aria-label="Close lesson" className="icon-btn" style={{ marginLeft: -10 }}>
            <CloseIcon size={22} />
          </Link>
          <Tag card={card} />
          <span style={{ width: 44 }} />
        </div>
      </div>

      <div className={styles.stage}>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={card.id}
            className={styles.slide}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 380, opacity: 0, rotate: d * 4 }),
              center: { x: 0, opacity: 1, rotate: 0 },
              exit: (d: number) => ({ x: d * -380, opacity: 0, rotate: d * -4 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={canAdvance ? 0.7 : 0.15}
            onDragEnd={onDragEnd}
          >
            <motion.div
              key={nudge}
              animate={nudge ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
              transition={{ duration: 0.35 }}
              className={styles.slideInner}
            >
              <CardBody
                card={card}
                answered={!!done[card.id]}
                onAnswered={() => markDone(card.id)}
                onNext={next}
                onRate={(r) => {
                  rate(card.id, r);
                  next();
                }}
                onDeeper={() => setDeeperOpen(true)}
                onSaveForLater={(text) => {
                  saveForLater(card.id, text);
                  markDone(card.id);
                  next();
                }}
                hasDeeper={!!lesson.deeper}
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {!canAdvance && (
        <p className={styles.hint} aria-live="polite">
          Answer to continue
        </p>
      )}

      <AnimatePresence>
        {deeperOpen && lesson.deeper && <DeeperSheet layer={lesson.deeper} onClose={() => setDeeperOpen(false)} />}
      </AnimatePresence>
    </main>
  );
}

function Tag({ card }: { card: Card }) {
  switch (card.type) {
    case 'review':
      return <span className="pill" style={{ background: 'var(--mint-soft)', color: 'var(--mint-ink)' }}>Review · from day {card.fromDay}</span>;
    case 'recall':
      return <span className="pill" style={{ background: 'var(--butter-soft)', color: 'var(--butter-ink)' }}>Recall</span>;
    case 'mystery':
      return <span className="pill" style={{ background: 'var(--ink)', color: '#fff' }}>Mystery · guess first</span>;
    case 'story':
      return <span className="pill" style={{ background: 'var(--lavender)', color: 'var(--indigo)' }}>New idea</span>;
    case 'explain':
      return <span className="pill" style={{ background: 'var(--indigo)', color: '#fff' }}>Explain it back</span>;
    case 'mission':
      return <span className="pill" style={{ background: 'var(--mint-soft)', color: 'var(--mint-ink)' }}>Try it today</span>;
  }
}

type BodyProps = {
  card: Card;
  answered: boolean;
  onAnswered: () => void;
  onNext: () => void;
  onRate: (r: 'again' | 'good') => void;
  onDeeper: () => void;
  onSaveForLater: (text: string) => void;
  hasDeeper: boolean;
};

function CardBody(p: BodyProps) {
  const { card } = p;
  switch (card.type) {
    case 'review':
    case 'recall':
      return <QuestionCardView card={card} answered={p.answered} onAnswered={p.onAnswered} onNext={p.onNext} onRate={p.onRate} />;
    case 'mystery':
      return <MysteryCardView card={card} onAnswered={p.onAnswered} onNext={p.onNext} />;
    case 'story':
      return <StoryCardView card={card} onNext={p.onNext} onDeeper={p.hasDeeper && card.deeper ? p.onDeeper : undefined} />;
    case 'explain':
      return <ExplainCardView card={card} onAnswered={p.onAnswered} onNext={p.onNext} onSaveForLater={p.onSaveForLater} />;
    case 'mission':
      return <MissionCardView card={card} onNext={p.onNext} />;
  }
}
