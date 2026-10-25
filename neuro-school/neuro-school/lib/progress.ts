'use client';

import { useCallback, useEffect, useState } from 'react';

// Local-only progress for the prototype. Swap for Supabase when accounts arrive.
// Ratings are kept as a review log so they can feed an FSRS scheduler (ts-fsrs) later.

export type Rating = 'again' | 'good';

export type ReviewLogEntry = { cardId: string; rating: Rating; at: string };

export type Progress = {
  streak: number;
  lastCompletedOn: string | null; // YYYY-MM-DD, local time
  completedDays: number[];
  reviewLog: ReviewLogEntry[];
  savedForLater: { cardId: string; text: string; at: string }[];
};

const KEY = 'neuro-school:progress:v1';

// The design starts the user mid-course on a 14-day streak.
const DEFAULT: Progress = {
  streak: 14,
  lastCompletedOn: null,
  completedDays: [],
  reviewLog: [],
  savedForLater: [],
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode). The app still works for the session.
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProgress(read());
    setLoaded(true);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const next = fn(prev);
      write(next);
      return next;
    });
  }, []);

  const rate = useCallback(
    (cardId: string, rating: Rating) =>
      update((p) => ({ ...p, reviewLog: [...p.reviewLog, { cardId, rating, at: new Date().toISOString() }] })),
    [update],
  );

  const completeDay = useCallback(
    (day: number) =>
      update((p) => {
        const t = today();
        const alreadyToday = p.lastCompletedOn === t;
        return {
          ...p,
          streak: alreadyToday ? p.streak : p.streak + 1,
          lastCompletedOn: t,
          completedDays: p.completedDays.includes(day) ? p.completedDays : [...p.completedDays, day],
        };
      }),
    [update],
  );

  const saveForLater = useCallback(
    (cardId: string, text: string) =>
      update((p) => ({
        ...p,
        savedForLater: [...p.savedForLater.filter((s) => s.cardId !== cardId), { cardId, text, at: new Date().toISOString() }],
      })),
    [update],
  );

  const doneToday = progress.lastCompletedOn === today();

  return { progress, loaded, rate, completeDay, saveForLater, doneToday };
}
