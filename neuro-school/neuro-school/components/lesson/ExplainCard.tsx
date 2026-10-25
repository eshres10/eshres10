'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExplainCard } from '@/content/types';
import { gradeWithKeywords, type ExplainFeedback } from '@/lib/grade';
import { MicIcon, SparkIcon, UserIcon } from '@/components/Icons';

const stop = (e: React.PointerEvent) => e.stopPropagation();

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

export function ExplainCardView({
  card,
  onAnswered,
  onNext,
  onSaveForLater,
}: {
  card: ExplainCard;
  onAnswered: () => void;
  onNext: () => void;
  onSaveForLater: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<ExplainFeedback | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    setCanDictate(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const dictate = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = 'en';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      setText((t) => (t ? `${t} ${said}` : said));
      setError('');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const submit = async () => {
    const answer = text.trim();
    if (!answer) {
      setError('Write or say your explanation first');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, text: answer }),
      });
      if (!res.ok) throw new Error();
      setFeedback((await res.json()) as ExplainFeedback);
    } catch {
      setFeedback(gradeWithKeywords(card, answer));
    } finally {
      setLoading(false);
      onAnswered();
    }
  };

  const tryAgain = () => {
    setFeedback(null);
    setShowModel(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--butter)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <UserIcon size={24} color="#7A4A00" strokeWidth={2} />
        </span>
        <div style={{ background: '#fff', borderRadius: '4px 20px 20px 20px', padding: '14px 16px', fontSize: 16, lineHeight: 1.5 }}>
          “{card.friendSays}”
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor={`x-${card.id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--lavender-ink)' }}>
          Explain it to your friend, in your own words
        </label>
        <textarea
          id={`x-${card.id}`}
          rows={4}
          value={text}
          placeholder="So basically…"
          readOnly={!!feedback}
          onPointerDown={stop}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 18,
            border: '2px solid var(--indigo)',
            background: '#fff',
            fontSize: 16,
            lineHeight: 1.5,
            resize: 'none',
          }}
        />
        {error && <span className="err">{error}</span>}
        {!feedback && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              aria-label={listening ? 'Stop dictation' : 'Answer by voice'}
              aria-pressed={listening}
              onClick={dictate}
              disabled={!canDictate}
              title={canDictate ? undefined : 'Voice input is not supported in this browser'}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                background: listening ? 'var(--indigo)' : '#fff',
                color: listening ? '#fff' : 'var(--indigo)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canDictate ? 1 : 0.5,
              }}
            >
              <MicIcon size={20} />
            </button>
            <button
              type="button"
              onClick={() => onSaveForLater(text)}
              style={{ height: 44, padding: '0 16px', borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--lavender-ink)', fontSize: 14, fontWeight: 500 }}
            >
              Save for tonight
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div aria-live="polite" style={{ background: '#fff', borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SparkIcon size={16} color="#fff" />
            </span>
            <strong style={{ fontSize: 14 }}>Tutor feedback</strong>
          </div>
          {feedback.got.map((g) => (
            <Row key={g} tone="good" label="Got it" text={g} />
          ))}
          {feedback.missing.map((m) => (
            <Row key={m} tone="miss" label="Missing" text={m} />
          ))}
          {feedback.missing.length === 0 && <Row tone="good" label="Nailed it" text="That’s a clear explanation your friend would get." />}
          <button
            type="button"
            onClick={() => setShowModel((s) => !s)}
            style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, fontSize: 14, fontWeight: 700, color: 'var(--indigo)', minHeight: 32 }}
          >
            {showModel ? 'Hide model answer' : 'Compare with a model answer'}
          </button>
          {showModel && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>{card.modelAnswer}</p>}
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: feedback ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 10 }}>
        {feedback ? (
          <>
            <button type="button" className="btn btn-outline" onClick={tryAgain}>
              Try again
            </button>
            <button type="button" className="btn btn-ink" onClick={onNext}>
              Finish
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ink" onClick={submit} disabled={loading}>
            {loading ? 'Checking…' : 'Get feedback'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ tone, label, text }: { tone: 'good' | 'miss'; label: string; text: string }) {
  const c = tone === 'good' ? { bg: 'var(--mint-soft)', fg: 'var(--mint-ink)' } : { bg: 'var(--butter-soft)', fg: 'var(--butter-ink)' };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: c.fg, background: c.bg, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}
