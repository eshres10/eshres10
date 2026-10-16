import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogReviewsQueryKey,
  markReviewHelpful,
  unmarkReviewHelpful,
  useAddCatalogPatternToLibrary,
  useGetCatalogPage,
  useGetCatalogReviews,
  type CatalogEntry,
  type CatalogPage,
  type Review,
} from '@workspace/api-client-react';
import { BookmarkPlus, Check, ExternalLink, Loader2, PenLine, Scissors, ThumbsUp } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { capitalise, ReviewForm, Stars } from '@/components/catalog/parts';
import { Loading } from '@/components/common';
import { Discussions } from '@/components/forum/Discussions';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { Sheet } from '@/components/social/Sheet';
import { timeAgo } from '@/lib/time';
import NotFound from '@/pages/not-found';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] bg-white p-6" aria-label={title}>
      <h2 className="eyebrow">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A labelled bar, e.g. "True to size 74%". */
function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
      <span>{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true"><span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} /></span>
      <span className="w-12 text-right font-semibold">{text}</span>
    </div>
  );
}

function HowItSews({ entry }: { entry: CatalogEntry }) {
  const s = entry.stats;
  const scores: Array<[string, number | null, string]> = [
    ['Fit', s.fit, 'how well it fit'],
    ['Instructions', s.instructions, 'how clear'],
    ['Difficulty', s.difficulty, 'how hard'],
  ];
  const sized = s.runsSmall + s.runsTrue + s.runsLarge;
  const pct = (n: number) => `${Math.round((n / sized) * 100)}%`;
  if (!scores.some(([, v]) => v !== null) && !sized) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {scores.some(([, v]) => v !== null) && (
        <Panel title="How it sews">
          <div className="space-y-3">
            {scores.filter(([, v]) => v !== null).map(([label, v]) => <Bar key={label} label={label} value={v!} max={5} text={`${v!.toFixed(1)}/5`} />)}
          </div>
          <p className="mt-3 text-xs text-subtle">Averages from reviews. Difficulty: 1 is easy, 5 is hard.</p>
        </Panel>
      )}
      {sized > 0 && (
        <Panel title="Sizing">
          <div className="space-y-3">
            <Bar label="Runs small" value={s.runsSmall} max={sized} text={pct(s.runsSmall)} />
            <Bar label="True to size" value={s.runsTrue} max={sized} text={pct(s.runsTrue)} />
            <Bar label="Runs large" value={s.runsLarge} max={sized} text={pct(s.runsLarge)} />
          </div>
          <p className="mt-3 text-xs text-subtle">From {sized} review{sized === 1 ? '' : 's'} that said.</p>
        </Panel>
      )}
    </div>
  );
}

function ReviewCard({ review, entry }: { review: Review; entry: CatalogEntry }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [helped, setHelped] = useState(review.helpedByMe);
  const [count, setCount] = useState(review.helpfulCount);
  const toggle = async () => {
    if (!ask({ title: 'Sign in to mark reviews helpful' })) return;
    const next = !helped;
    setHelped(next);
    setCount(c => c + (next ? 1 : -1));
    try {
      const state = next ? await markReviewHelpful(review.id) : await unmarkReviewHelpful(review.id);
      setCount(state.helpfulCount);
      client.invalidateQueries({ queryKey: getGetCatalogReviewsQueryKey(entry.kind, entry.slug) });
    } catch {
      setHelped(!next);
      setCount(c => c + (next ? -1 : 1));
    }
  };
  const details = [
    review.sizeMade && `Made size ${review.sizeMade}`,
    review.sizing && { small: 'Runs small', true: 'True to size', large: 'Runs large' }[review.sizing],
    review.fit && `Fit ${review.fit}/5`,
    review.difficulty && `Difficulty ${review.difficulty}/5`,
    review.instructions && `Instructions ${review.instructions}/5`,
  ].filter(Boolean);
  return (
    <article id={`review-${review.id}`} className="scroll-mt-28 border-t border-line py-5 first:border-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Link href={`/@${review.author.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={review.author.name} avatarUrl={review.author.avatarUrl} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm"><Link href={`/@${review.author.handle}`} className="font-bold text-ink no-underline">@{review.author.handle}</Link> <span className="text-subtle">· {timeAgo(review.updatedAt)}</span></p>
          <div className="mt-1"><Stars value={review.rating} size={15} /></div>
          {details.length > 0 && <p className="mt-1.5 text-xs font-semibold text-subtle">{details.join(' · ')}</p>}
        </div>
        {!review.isMine && <SafetyMenu kind="review" targetId={String(review.id)} what="review" authorHandle={review.author.handle} label={`Options for review by @${review.author.handle}`} size={40} />}
      </div>
      {review.body && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed">{review.body}</p>}
      {review.make && (
        <Link href={`/makes/${review.make.id}`} className="mt-3 flex max-w-sm items-center gap-3 rounded-[18px] bg-canvas p-2 pr-4 text-ink no-underline hover:bg-line">
          {review.make.coverImageUrl
            ? <img src={review.make.coverImageUrl} alt="" className="h-12 w-12 rounded-[12px] object-cover" />
            : <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-peach-soft" aria-hidden="true"><Scissors size={18} /></span>}
          <span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-[.14em] text-red-ink">See the make</span><span className="block truncate text-sm font-bold">{review.make.name}</span></span>
        </Link>
      )}
      {!review.isMine && (
        <button type="button" onClick={toggle} aria-pressed={helped} className={`mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${helped ? 'border-ink bg-yellow' : 'border-line'}`}>
          <ThumbsUp size={14} aria-hidden="true" />Helpful{count > 0 && ` · ${count}`}
        </button>
      )}
      {review.isMine && count > 0 && <p className="mt-3 text-xs text-subtle">{count} found this helpful</p>}
    </article>
  );
}

function Actions({ page }: { page: CatalogPage }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const save = useAddCatalogPatternToLibrary();
  const [reviewing, setReviewing] = useState(false);
  const e = page.entry;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary"
        onClick={() => { if (ask({ title: 'Sign in to write a review', body: "Share how it went. You'll come straight back here." })) setReviewing(true); }}>
        <PenLine size={16} aria-hidden="true" />{page.myReview ? 'Edit your review' : e.kind === 'pattern' ? "I've made this" : 'Write a review'}
      </button>
      {e.kind === 'pattern' && (
        page.inMyLibrary || save.isSuccess
          ? <Link href="/patterns" className="btn btn-line"><Check size={16} aria-hidden="true" />In your library</Link>
          : <button type="button" disabled={save.isPending} className="btn btn-line"
              onClick={() => { if (ask({ title: 'Sign in to save patterns', body: 'Saved patterns go in your private pattern library.' })) save.mutate({ id: e.id }, { onSuccess: () => client.invalidateQueries() }); }}>
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <BookmarkPlus size={16} aria-hidden="true" />}Save to my library
            </button>
      )}
      {reviewing && isSignedIn && (
        <Sheet label="Write a review" onClose={() => setReviewing(false)}>
          <ReviewForm entry={e} current={page.myReview} onDone={() => setReviewing(false)} />
        </Sheet>
      )}
    </div>
  );
}

/** A shared pattern or product page at /catalog/:kind/:slug. Works signed out. */
export function CatalogEntryPage({ kind, slug }: { kind: string; slug: string }) {
  const valid = kind === 'pattern' || kind === 'product';
  const page = useGetCatalogPage(kind as 'pattern', slug, { query: { retry: false, enabled: valid } });
  const reviews = useGetCatalogReviews(kind as 'pattern', slug, { query: { retry: false, enabled: valid } });
  useEffect(() => {
    const e = page.data?.entry;
    if (e) document.title = `${e.name}${e.maker ? ` by ${e.maker}` : ''} · Seams Club`;
  }, [page.data]);
  useEffect(() => {
    if (reviews.data && window.location.hash.startsWith('#review-')) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [reviews.data]);

  if (!valid) return <NotFound embedded />;
  if (page.isLoading) return <Loading />;
  if (!page.data) return <NotFound embedded />;
  const { entry: e, makes, fabricsUsed } = page.data;
  const s = e.stats;
  const cover = makes.find(m => m.coverImageUrl);
  const facts = [capitalise(e.category), e.difficulty && capitalise(e.difficulty), e.sizes && `Sizes ${e.sizes}`, e.fabricTypes, e.yardage].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-[1232px] space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-subtle">
        <Link href={e.kind === 'pattern' ? '/catalog' : '/catalog?kind=product'} className="text-subtle">{e.kind === 'pattern' ? 'Patterns' : 'Fabrics & supplies'}</Link>
        <span aria-hidden="true"> / </span>{capitalise(e.category)}<span aria-hidden="true"> / </span><span className="font-semibold text-ink">{e.name}</span>
      </nav>

      <section className="grid overflow-hidden rounded-[40px] bg-white md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative min-h-[240px] bg-peach-soft">
          {cover?.coverImageUrl
            ? <>
                <img src={cover.coverImageUrl} alt={`${cover.name} by @${cover.owner.handle}`} className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1 text-xs font-semibold">Cover from @{cover.owner.handle}'s make</span>
              </>
            : <span className="absolute inset-0 grid place-items-center" aria-hidden="true"><Scissors size={48} /></span>}
        </div>
        <div className="p-6 sm:p-10">
          <p className="eyebrow">{e.kind === 'pattern' ? 'Sewing pattern' : capitalise(e.category)}</p>
          <h1 className="mt-2 font-display text-[clamp(32px,4vw,52px)] leading-[1.02] tracking-[-.05em]">{e.name}</h1>
          {e.maker && <p className="mt-1 text-[17px]">by <b>{e.maker}</b></p>}
          <div className="mt-4 flex flex-wrap gap-1.5">{facts.map(f => <span key={f} className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold">{f}</span>)}</div>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="rounded-[20px] bg-yellow px-[18px] py-3"><b className="font-display text-xl">{s.rating !== null ? s.rating.toFixed(1) : '–'}</b> <span className="text-sm">overall rating</span></span>
            <span className="rounded-[20px] bg-canvas px-[18px] py-3"><b className="font-display text-xl">{s.makes}</b> <span className="text-sm text-subtle">make{s.makes === 1 ? '' : 's'} shared</span></span>
            <span className="rounded-[20px] bg-canvas px-[18px] py-3"><b className="font-display text-xl">{s.reviews}</b> <span className="text-sm text-subtle">review{s.reviews === 1 ? '' : 's'}</span></span>
          </div>
          {e.description && <p className="mt-5 max-w-xl whitespace-pre-line text-[15px] leading-relaxed">{e.description}</p>}
          <div className="mt-6"><Actions page={page.data} /></div>
          <p className="mt-4 text-sm text-subtle">
            {e.kind === 'pattern' && 'Pattern files are never shared on Seams Club. '}
            {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 font-semibold text-blue-ink">Buy it from the {e.kind === 'pattern' ? 'designer' : 'shop'}<ExternalLink size={13} aria-hidden="true" /></a>}
          </p>
        </div>
      </section>

      {e.kind === 'pattern' && <HowItSews entry={e} />}

      {fabricsUsed.length > 0 && (
        <Panel title="Fabrics people used">
          <div className="flex flex-wrap gap-2">{fabricsUsed.map(f => <span key={f.name} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">{capitalise(f.name)} <span className="text-subtle">· {f.count}</span></span>)}</div>
        </Panel>
      )}

      <section aria-labelledby="makes-title">
        <h2 id="makes-title" className="mb-3 mt-6 font-display text-[26px] tracking-[-.04em]">{makes.length ? `${s.makes} make${s.makes === 1 ? '' : 's'}` : 'Makes'}</h2>
        {makes.length
          ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {makes.map(m => (
                <Link key={m.id} href={`/makes/${m.id}`} className="overflow-hidden rounded-[22px] bg-white text-ink no-underline">
                  <span className="relative block aspect-[4/5] bg-line">
                    {m.coverImageUrl ? <img src={m.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center bg-peach-soft" aria-hidden="true"><Scissors size={28} /></span>}
                  </span>
                  <span className="block p-3">
                    <span className="block truncate text-sm font-bold">@{m.owner.handle}</span>
                    <span className="block truncate text-xs text-subtle">{[m.size && `Size ${m.size}`, m.usedWith].filter(Boolean).join(' · ') || m.name}</span>
                  </span>
                </Link>
              ))}
            </div>
          : <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">No shared makes yet. Link this {e.kind} to one of yours from your studio, and share the make.</p>}
      </section>

      <Discussions catalogId={e.id} />

      <section aria-labelledby="reviews-title" className="rounded-[30px] bg-white p-6">
        <h2 id="reviews-title" className="font-display text-[26px] tracking-[-.04em]">Reviews</h2>
        <div className="mt-4">
          {reviews.isLoading ? <Loader2 className="animate-spin" aria-label="Loading reviews" />
            : !reviews.data?.length ? <p className="text-sm text-subtle">No reviews yet. Made it? Tell people how it went.</p>
            : reviews.data.map(r => <ReviewCard key={r.id} review={r} entry={e} />)}
        </div>
      </section>
    </div>
  );
}
