'use client';

import { useState } from 'react';
import type { RecallCard, ReviewCard } from '@/content/types';
import { CheckIcon } from '@/components/Icons';
import styles from './lesson.module.css';

const stop = (e: React.PointerEvent) => e.stopPropagation();

export function QuestionCardView({
  card,
  answered,
  onAnswered,
  onNext,
  onRate,
}: {
  card: ReviewCard | RecallCard;
  answered: boolean;
  onAnswered: () => void;
  onNext: () => void;
  onRate: (r: 'again' | 'good') => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);

  const isReview = card.type === 'review';

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (card.kind !== 'type') return;
    const v = text.trim().toLowerCase();
    if (!v) {
      setError('Enter an answer first');
      return;
    }
    setCorrect(card.answers.some((a) => v.includes(a)));
    onAnswered();
  };

  const pick = (i: number) => {
    if (card.kind !== 'choice' || picked !== null) return;
    setPicked(i);
    setCorrect(i === card.correct);
    onAnswered();
  };

  return (
    <div className={styles.card} style={{ gap: 20, padding: 20 }}>
      <h1 className={styles.question}>{card.prompt}</h1>

      {card.kind === 'choice' ? (
        <div className={styles.options}>
          {card.options.map((o, i) => {
            const state =
              picked === null ? undefined : i === card.correct ? 'correct' : i === picked ? 'wrong' : undefined;
            return (
              <button key={o} type="button" className={styles.option} data-state={state} disabled={picked !== null} onClick={() => pick(i)}>
                {o}
                {state === 'correct' && (
                  <span className={styles.check}>
                    <CheckIcon size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={submitTyped} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor={`a-${card.id}`} className="sr-only">
            Your answer
          </label>
          <input
            id={`a-${card.id}`}
            className={styles.field}
            placeholder="Type your answer"
            autoComplete="off"
            value={text}
            disabled={correct !== null}
            onPointerDown={stop}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
          />
          {error && <span className="err">{error}</span>}
          {correct === null && (
            <button type="submit" className="btn btn-ink">
              Check
            </button>
          )}
        </form>
      )}

      {answered && correct !== null && (
        <div className={styles.feedback} data-good={correct} aria-live="polite">
          <strong>{correct ? 'Nailed it. ' : 'Not quite. '}</strong>
          {card.explanation}
        </div>
      )}

      {answered && correct !== null && (
        <div style={{ marginTop: 'auto' }}>
          {isReview ? (
            <>
              <p className={styles.rateLabel}>How well did you know it?</p>
              <div className={styles.rateRow}>
                <button type="button" className="btn btn-outline" onClick={() => onRate('again')}>
                  Fuzzy
                </button>
                <button type="button" className="btn btn-ink" onClick={() => onRate(correct ? 'good' : 'again')}>
                  Got it
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-ink" style={{ width: '100%' }} onClick={onNext}>
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
