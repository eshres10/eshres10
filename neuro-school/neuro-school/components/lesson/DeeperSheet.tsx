'use client';

import { motion } from 'motion/react';
import { useEffect } from 'react';
import type { DeeperLayer } from '@/content/types';
import { Illustration } from '@/components/Illustrations';
import { ArrowLeft, CapIcon } from '@/components/Icons';

export function DeeperSheet({ layer, onClose }: { layer: DeeperLayer; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deeper-title"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: 'var(--night)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(56px, env(safe-area-inset-top)) 20px 32px',
        gap: 16,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" aria-label="Back to the lesson" className="icon-btn" onClick={onClose} style={{ color: '#fff', marginLeft: -10 }}>
          <ArrowLeft size={22} />
        </button>
        <span className="pill" style={{ background: 'var(--butter)', color: 'var(--ink)' }}>
          <CapIcon size={14} strokeWidth={2.4} />
          Med school mode
        </span>
        <span style={{ width: 44 }} />
      </div>

      <div style={{ height: 230, borderRadius: 24, background: 'var(--night-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Illustration id="brain-side" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 id="deeper-title" style={{ fontSize: 26, lineHeight: 1.15 }}>
          {layer.title}
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#C9C7D1' }}>{layer.intro}</p>
      </div>

      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
        {layer.terms.map((t, i) => (
          <div
            key={t.term}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '14px 0',
              borderTop: '1px solid var(--night-line)',
              borderBottom: i === layer.terms.length - 1 ? '1px solid var(--night-line)' : undefined,
            }}
          >
            <dt style={{ fontSize: 15, fontWeight: 700, color: 'var(--butter)' }}>{t.term}</dt>
            <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--night-text)' }}>{t.definition}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className="btn btn-white" style={{ marginTop: 'auto', flexShrink: 0 }} onClick={onClose}>
        Back to the lesson
      </button>
    </motion.div>
  );
}
