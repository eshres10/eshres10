import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { followProfile, unfollowProfile, useGetExploreBrowse, type BrowseCover, type BrowsePageSewistsItem } from '@workspace/api-client-react';
import { Loader2, Search, X } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { Garment } from '@/components/brand/Garment';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { useModal } from '@/components/flow/modal';

// "Browse by" (owner's Browse brief): a big modal over Explore. Desktop: a
// centred 1080 × 800 card; phones: full screen. The search filters every
// section as you type. Choosing anything closes it and hands the choice back.

export type BrowsePick =
  | { kind: 'sub'; sub: string; label: string }
  | { kind: 'category'; id: string; label: string }
  | { kind: 'tag'; tag: string; label: string }
  | { kind: 'fabric'; id: string; label: string }
  | { kind: 'way'; id: string; label: string };

/** Ways to browse: each applies its filter (popular = most saved this week; the rest are hashtags or free pattern pages). */
export const WAYS = [
  { id: 'popular', title: 'Popular this week', line: 'What everyone is saving', tone: 'bg-yellow text-ink' },
  { id: 'beginner', title: 'Beginner-friendly', line: 'Simple shapes, clear steps', tone: 'bg-blue text-white' },
  { id: 'quick', title: 'Quick makes', line: 'Under 3 hours', tone: 'bg-peach text-ink' },
  { id: 'zerowaste', title: 'Zero waste', line: 'Scraps, offcuts, thrift flips', tone: 'bg-ink text-white' },
  { id: 'hacks', title: 'Pattern hacks', line: 'One pattern, new look', tone: 'bg-red text-ink' },
  { id: 'free', title: 'Free patterns', line: 'No cost to start', tone: 'bg-blue-soft text-ink' },
] as const;

const ART: Record<string, string> = {
  dresses: 'Dresses', shirts: 'Tops', tops: 'Tops', trousers: 'Trousers', skirts: 'Skirts', outerwear: 'Outerwear',
  knitwear: 'Knits', bags: 'Bags', home: 'Home', kids: 'Tops', upcycled: 'Mending', formal: 'Dresses',
};
const TONES = ['bg-yellow/40', 'bg-blue-soft', 'bg-peach-soft'];

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const matches = (q: string, ...texts: Array<string | null | undefined>) => !q || texts.some(t => t?.toLowerCase().includes(q));

function Cover({ cover, className }: { cover: BrowseCover | null; className: string }) {
  return cover ? <img src={cover.thumbUrl} alt="" loading="lazy" className={`object-cover ${className}`} style={{ backgroundColor: cover.color ?? undefined }} /> : null;
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-2">
      <h3 className="font-display text-[22px] tracking-[-.04em] md:text-[24px]">{title}</h3>
      {aside}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SewistRow({ person, index }: { person: BrowsePageSewistsItem; index: number }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!ask({ title: `Sign in to follow ${person.name}`, body: "You'll see their posts in your Home feed." })) return;
    setBusy(true);
    try {
      await (following ? unfollowProfile(person.handle) : followProfile(person.handle));
      setFollowing(!following);
      void client.invalidateQueries({ queryKey: FEED_KEYS.all });
    } finally {
      setBusy(false);
    }
  };
  const tone = ['bg-yellow text-ink', 'bg-blue text-white', 'bg-peach text-ink'][index % 3];
  const detail = person.specialty ?? (person.makes ? `${person.makes} ${person.makes === 1 ? 'make' : 'makes'}` : null);
  return (
    <li className="flex items-center gap-3 rounded-[22px] bg-canvas px-4 py-3">
      {person.avatarUrl
        ? <img src={person.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        : <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-[18px] ${tone}`}>{person.name.trim().charAt(0).toUpperCase() || '?'}</span>}
      <Link href={`/@${person.handle}`} className="min-w-0 flex-1 text-ink no-underline">
        <b className="block truncate text-[15px]">{person.name}</b>
        <span className="block truncate text-[13px] text-subtle">@{person.handle}{detail ? ` · ${detail}` : ''}</span>
      </Link>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={following} aria-label={`${following ? 'Following' : 'Follow'} @${person.handle}`}
        className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[14px] font-bold disabled:opacity-60 ${following ? 'border border-ink bg-white text-ink' : 'bg-ink text-white'}`}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : following ? 'Following' : 'Follow'}
      </button>
    </li>
  );
}

export function BrowseModal({ onClose, onPick }: { onClose: () => void; onPick: (pick: BrowsePick) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, onClose);
  const browse = useGetExploreBrowse({ query: { staleTime: 60_000 } });
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase().replace(/^#/, '');
  const b = browse.data;

  const categories = (b?.categories ?? []).filter(c => matches(q, c.label));
  const trending = (b?.trending ?? []).filter(t => matches(q, t.tag));
  const picked = b?.picked ? b.picked.tags.filter(t => matches(q, t)) : [];
  const ways = WAYS.filter(w => matches(q, w.title, w.line));
  const fabrics = (b?.fabrics ?? []).filter(f => matches(q, f.label));
  const sewists = (b?.sewists ?? []).filter(s => matches(q, s.name, s.handle, s.specialty));
  const nothing = Boolean(b) && !categories.length && !trending.length && !picked.length && !ways.length && !fabrics.length && !sewists.length;

  const chip = 'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[15px] font-bold';
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-ink/50 md:grid md:place-items-center md:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="browse-title"
        className="flex h-[100dvh] w-full flex-col bg-white md:h-[min(800px,calc(100dvh-48px))] md:w-[min(1080px,calc(100vw-48px))] md:rounded-[32px]">
        <header className="shrink-0 border-b border-line px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] md:flex md:items-center md:gap-5 md:border-0 md:px-8 md:pb-2 md:pt-6">
          <div className="flex items-center justify-between gap-3 md:contents">
            <h2 id="browse-title" className="font-display text-[30px] leading-none tracking-[-.05em] md:shrink-0 md:text-[34px]">Browse by</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas md:order-last"><X size={20} aria-hidden="true" /></button>
          </div>
          <label className="relative mt-3 block md:mt-0 md:flex-1">
            <span className="sr-only">Search categories, hashtags, sewists</span>
            <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
            <input data-autofocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search categories, hashtags, sewists"
              className="min-h-[48px] w-full rounded-full bg-canvas pl-11 pr-4 text-[16px] outline-none focus:ring-4 focus:ring-yellow" />
          </label>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">
          {browse.isLoading && <div className="grid place-items-center py-16"><Loader2 className="animate-spin" aria-label="Loading" /></div>}
          {nothing && <p role="status" className="py-16 text-center text-subtle">Nothing matches “{query.trim()}”.</p>}

          {categories.length > 0 && (
            <Section title="Clothing & makes">
              <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-6 md:gap-3">
                {categories.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" aria-label={c.label}
                      onClick={() => onPick(c.sub ? { kind: 'sub', sub: c.sub, label: c.label } : { kind: 'category', id: c.id, label: c.label })}
                      className="relative block aspect-[4/5] w-full overflow-hidden rounded-[20px] text-left">
                      {c.cover ? <Cover cover={c.cover} className="h-full w-full" /> : <Garment name={ART[c.id] ?? 'Tops'} tone={`${TONES[i % 3]} text-ink`} className="h-full w-full" />}
                      <span aria-hidden="true" className="absolute inset-x-2 bottom-2 rounded-[14px] bg-white px-2.5 py-1.5 text-[13px] font-bold leading-tight md:text-[14px]">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(trending.length > 0 || picked.length > 0) && (
            <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
              {trending.length > 0 && (
                <Section title="Trending hashtags">
                  <ul className="flex flex-wrap gap-2">
                    {trending.map(t => (
                      <li key={t.tag}>
                        <button type="button" onClick={() => onPick({ kind: 'tag', tag: t.tag, label: `#${t.tag}` })} className={`${chip} border border-line bg-white text-ink hover:border-ink`}>
                          #{t.tag}<span className="text-[13px] font-semibold text-subtle">{compact.format(t.posts)}{t.posts === 1 ? ' post' : ' posts'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {picked.length > 0 && b?.picked && (
                <Section title="Picked for you" aside={b.picked.because.length > 0 ? <p className="mt-1 text-[14px] text-subtle">Because you save {b.picked.because.join(' and ')}</p> : null}>
                  <ul className="flex flex-wrap gap-2">
                    {picked.map(t => (
                      <li key={t}><button type="button" onClick={() => onPick({ kind: 'tag', tag: t, label: `#${t}` })} className={`${chip} bg-yellow/40 text-ink hover:bg-yellow`}>#{t}</button></li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}

          {ways.length > 0 && (
            <Section title="Ways to browse">
              <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
                {ways.map(w => (
                  <li key={w.id}>
                    <button type="button" onClick={() => onPick({ kind: 'way', id: w.id, label: w.title })}
                      className={`block min-h-[96px] w-full rounded-[22px] p-4 text-left md:min-h-[118px] md:p-5 ${w.tone}`}>
                      <b className="block font-display text-[17px] leading-tight tracking-[-.03em] md:text-[21px]">{w.title}</b>
                      <span className="mt-1 block text-[13px] opacity-90 md:text-[15px]">{w.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {fabrics.length > 0 && (
            <Section title="By fabric">
              <ul className="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-3">
                {fabrics.map((f, i) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => onPick({ kind: 'fabric', id: f.id, label: f.label })}
                      className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] border border-line bg-white p-1.5 pr-3 text-left text-[15px] font-bold hover:border-ink">
                      {f.cover
                        ? <Cover cover={f.cover} className="h-11 w-11 shrink-0 rounded-[12px]" />
                        : <span aria-hidden="true" className={`h-11 w-11 shrink-0 rounded-[12px] ${TONES[i % 3]}`} />}
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {sewists.length > 0 && (
            <Section title="Popular sewists to follow">
              <ul className="grid gap-2.5 md:grid-cols-3 md:gap-3">
                {sewists.map((s, i) => <SewistRow key={s.handle} person={s} index={i} />)}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
