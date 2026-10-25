'use client';

import Link from 'next/link';
import { neuroscience, currentDay, reviewPreview } from '@/content/neuroscience';
import { Illustration } from '@/components/Illustrations';
import { TabBar } from '@/components/TabBar';
import { ArrowRight, CheckIcon, FlameIcon, LockIcon, RefreshIcon } from '@/components/Icons';
import { useProgress } from '@/lib/progress';
import styles from './home.module.css';

export default function Home() {
  const lesson = neuroscience.lessons.find((l) => l.day === currentDay)!;
  const unitIndex = neuroscience.units.findIndex((u) => u.id === lesson.unitId);
  const unit = neuroscience.units[unitIndex];
  const { progress, doneToday } = useProgress();
  const lessonInUnit = doneToday ? 5 : 4;

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <main className="shell">
      <div className={styles.scroll}>
        <header className={styles.header}>
          <div>
            <span className={styles.date}>{dateLine} · your daily lesson</span>
            <h1 className={styles.title}>{neuroscience.title}</h1>
          </div>
          <div className={styles.streak} aria-label={`${progress.streak} day streak`}>
            <FlameIcon size={16} />
            <span>{progress.streak}</span>
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="today-title">
          <div className={styles.heroArt}>
            <Illustration id={lesson.heroIllustration} />
          </div>
          <div className={styles.heroText}>
            <span className={styles.heroMeta}>
              Day {lesson.day} · {unit.title}
            </span>
            <h2 id="today-title" className={styles.heroTitle}>
              {lesson.title}
            </h2>
            <span className={styles.heroMeta}>
              {lesson.minutes} min · {lesson.cards.length} cards · 1 mystery
            </span>
          </div>
          <Link href={`/lesson/${lesson.day}`} className={`btn ${styles.heroBtn}`}>
            {doneToday ? 'Replay today’s lesson' : 'Start today’s lesson'}
            <ArrowRight size={18} strokeWidth={2.4} />
          </Link>
        </section>

        <Link href={`/lesson/${lesson.day}?review=1`} className={styles.review}>
          <span className={styles.reviewIcon}>
            <RefreshIcon size={20} color="#0E5A3E" />
          </span>
          <span className={styles.reviewText}>
            <strong>{reviewPreview.count} cards to review</strong>
            <span>{reviewPreview.topics}</span>
          </span>
          <strong className={styles.reviewTime}>{reviewPreview.minutes} min</strong>
        </Link>

        <section className={styles.path} aria-labelledby="path-title">
          <div className={styles.pathHead}>
            <h3 id="path-title" className={styles.pathTitle}>
              Your path
            </h3>
            <span className={styles.pathMeta}>
              Unit {unitIndex + 1} of {neuroscience.units.length}
            </span>
          </div>
          <ol className={styles.pathList}>
            {neuroscience.units.slice(0, 4).map((u, i) => {
              const state = i < unitIndex ? 'done' : i === unitIndex ? 'current' : 'locked';
              return (
                <li key={u.id} className={styles.pathItem} data-state={state}>
                  {state === 'done' && (
                    <span className={`${styles.dot} ${styles.dotDone}`}>
                      <CheckIcon size={16} />
                    </span>
                  )}
                  {state === 'current' && <span className={`${styles.dot} ${styles.dotCurrent}`}>{i + 1}</span>}
                  {state === 'locked' && (
                    <span className={`${styles.dot} ${styles.dotLocked}`}>
                      <LockIcon size={16} />
                    </span>
                  )}
                  {state === 'current' ? (
                    <span className={styles.current}>
                      <strong>{u.title}</strong>
                      <span className={styles.bar}>
                        <span style={{ width: `${(lessonInUnit / u.lessonCount) * 100}%` }} />
                      </span>
                    </span>
                  ) : (
                    <span className={styles.unitName}>{u.title}</span>
                  )}
                  {state === 'done' && <span className={styles.pathMeta}>Done</span>}
                  {state === 'current' && (
                    <strong className={styles.count}>
                      {lessonInUnit}/{u.lessonCount}
                    </strong>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <TabBar active="today" />
    </main>
  );
}
