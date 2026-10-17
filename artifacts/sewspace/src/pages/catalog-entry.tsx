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
import { Bookmark, Check, ExternalLink, Loader2, Scissors, ThumbsUp } from 'lucide-react';
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

/** One review score as a word: higher fit and instructions are better, higher difficulty is harder. */
function scoreWord(label: string, v: number) {
  if (label === 'Difficulty') return v < 2 ? 'easy' : v < 3.5 ? 'moderate' : 'hard';
  if (label === 'Fit') return v >= 4.5 ? 'great' : v >= 3.5 ? 'good' : v >= 2.5 ? 'okay' : 'poor';
  return v >= 4 ? 'clear' : v >= 3 ? 'okay' : 'unclear';
}

/** Review averages and sizing votes for a pattern, in one card. */
function HowItSews({ entry }: { entry: CatalogEntry }) {
  const s = entry.stats;
  const scores = ([['Fit', s.fit], ['Difficulty', s.difficulty], ['Instructions', s.instructions]] as Array<[string, number | null]>).filter(([, v]) => v !== null) as Array<[string, number]>;
  const sized = s.runsSmall + s.runsTrue + s.runsLarge;
  if (!scores.length && !sized) return null;
  const sizing: Array<[string, number]> = [['Runs small', s.runsSmall], ['True to size', s.runsTrue], ['Runs large', s.runsLarge]];
  const top = Math.max(...sizing.map(([, n]) => n));
  return (
    <section aria-labelledby="sews-title" className="rounded-[30px] bg-white p-6 sm:p-7">
      <h2 id="sews-title" className="font-display text-[22px] tracking-[-.04em]">How it sews</h2>
      {scores.length > 0 && (
        <dl className="mt-4 space-y-3.5">
          {scores.map(([label, v]) => (
            <div key={label}>
              <div className="flex items-baseline justify-between text-[15px]"><dt className="font-medium">{label}</dt><dd><b>{v.toFixed(1)}</b> <span className="text-subtle">{scoreWord(label, v)}</span></dd></div>
              <span aria-hidden="true" className="mt-1.5 block h-2 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-blue" style={{ width: `${(v / 5) * 100}%` }} /></span>
            </div>
          ))}
        </dl>
      )}
      {scores.length > 0 && <p className="mt-3 text-xs text-subtle">Averages from reviews, out of 5. Difficulty: 1 is easy, 5 is hard.</p>}
      {sized > 0 && (
        <>
          <h3 className="mt-5 text-[15px] font-medium">Sizing</h3>
          <ul className="mt-2 grid grid-cols-3 gap-2 text-center text-[13px]">
            {sizing.map(([label, n]) => (
              <li key={label} className={`rounded-[16px] px-2 py-2.5 ${n === top && n > 0 ? 'bg-yellow' : 'bg-canvas'}`}>{label}<b className="block">{Math.round((n / sized) * 100)}%</b></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-subtle">From {sized} review{sized === 1 ? '' : 's'} that said.</p>
        </>
      )}
    </section>
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
    review.sizing && { small: 'Runs small', true: 'True to size', large: 'Runs large' }[review.sizing],
    review.fit && `Fit ${review.fit}/5`,
    review.difficulty && `Difficulty ${review.difficulty}/5`,
    review.instructions && `Instructions ${review.instructions}/5`,
  ].filter(Boolean);
  const when = new Date(review.updatedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return (
    <article id={`review-${review.id}`} className="flex scroll-mt-28 flex-col rounded-[30px] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Link href={`/@${review.author.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={review.author.name} avatarUrl={review.author.avatarUrl} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <Link href={`/@${review.author.handle}`} className="block truncate font-bold text-ink no-underline">@{review.author.handle}</Link>
          <p className="truncate text-[13px] text-subtle">{[review.sizeMade && `Made size ${review.sizeMade}`, when].filter(Boolean).join(' · ')}</p>
        </div>
        {!review.isMine && <SafetyMenu kind="review" targetId={String(review.id)} what="review" authorHandle={review.author.handle} label={`Options for review by @${review.author.handle}`} size={40} />}
      </div>
      <div className="mt-3"><Stars value={review.rating} size={15} /></div>
      {details.length > 0 && <ul className="mt-2.5 flex flex-wrap gap-1.5">{details.map(d => <li key={d as string} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold">{d}</li>)}</ul>}
      {review.body && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed">{review.body}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[13px]">
        {review.make ? <Link href={`/makes/${review.make.id}`} className="font-semibold text-ink underline underline-offset-4">See the make</Link> : <span />}
        {!review.isMine
          ? <button type="button" onClick={toggle} aria-pressed={helped} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${helped ? 'border-ink bg-yellow' : 'border-line'}`}>
              <ThumbsUp size={14} aria-hidden="true" />Helpful{count > 0 && ` · ${count}`}
            </button>
          : count > 0 && <span className="text-subtle">{count} found this helpful</span>}
      </div>
    </article>
  );
}

/** Opens the review sheet (signed out: asks to sign in first). */
function WriteReview({ page, label, className }: { page: CatalogPage; label: string; className: string }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const [reviewing, setReviewing] = useState(false);
  return (
    <>
      <button type="button" className={className}
        onClick={() => { if (ask({ title: 'Sign in to write a review', body: "Share how it went. You'll come straight back here." })) setReviewing(true); }}>
        {label}
      </button>
      {reviewing && isSignedIn && (
        <Sheet label="Write a review" onClose={() => setReviewing(false)}>
          <ReviewForm entry={page.entry} current={page.myReview} onDone={() => setReviewing(false)} />
        </Sheet>
      )}
    </>
  );
}

function Actions({ page }: { page: CatalogPage }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const save = useAddCatalogPatternToLibrary();
  const e = page.entry;
  const big = 'inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[15px] font-bold no-underline disabled:opacity-60';
  return (
    <div className="flex flex-wrap gap-2.5">
      <WriteReview page={page} className={`${big} bg-yellow text-ink`}
        label={page.myReview ? 'Edit your review' : e.kind === 'pattern' ? "I've made this" : 'Write a review'} />
      {e.kind === 'pattern' && (
        page.inMyLibrary || save.isSuccess
          ? <Link href="/patterns" className={`${big} border border-ink bg-white text-ink`}><Check size={16} aria-hidden="true" />In your library</Link>
          : <button type="button" disabled={save.isPending} className={`${big} bg-ink text-white`}
              onClick={() => { if (ask({ title: 'Sign in to save patterns', body: 'Saved patterns go in your private pattern library.' })) save.mutate({ id: e.id }, { onSuccess: () => client.invalidateQueries() }); }}>
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} aria-hidden="true" />}Save to my library
            </button>
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
      <nav aria-label="Breadcrumb" className="hidden text-sm sm:block">
        <Link href={e.kind === 'pattern' ? '/catalog' : '/catalog?kind=product'} className="text-ink underline underline-offset-4">{e.kind === 'pattern' ? 'Patterns' : 'Fabrics & supplies'}</Link>
        <span aria-hidden="true" className="text-subtle"> / </span>{capitalise(e.category)}<span aria-hidden="true" className="text-subtle"> / </span><span className="font-semibold">{e.name}</span>
      </nav>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative min-h-[280px] overflow-hidden rounded-[30px] bg-peach-soft sm:min-h-[340px] md:min-h-[460px] md:rounded-[40px]">
          {cover?.coverImageUrl
            ? <>
                <img src={cover.coverImageUrl} alt={`${cover.name} by @${cover.owner.handle}`} className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute bottom-4 left-4 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">Cover from @{cover.owner.handle}'s make</span>
              </>
            : <span className="absolute inset-0 grid place-items-center" aria-hidden="true"><Scissors size={48} /></span>}
        </div>
        <div className="rounded-[30px] bg-white p-6 sm:p-8 md:rounded-[40px] md:p-10">
          <p className="eyebrow eyebrow-red">{e.kind === 'pattern' ? 'Sewing pattern' : capitalise(e.category)}</p>
          <h1 className="mt-2 font-display text-[clamp(34px,4.2vw,56px)] leading-[1.02] tracking-[-.05em]">{e.name}</h1>
          {e.maker && <p className="mt-2 text-[17px]">by <b className="underline underline-offset-4">{e.maker}</b></p>}
          <div className="mt-4 flex flex-wrap gap-1.5">{facts.map(f => <span key={f} className="rounded-full bg-canvas px-3 py-1.5 text-[13px] font-semibold">{f}</span>)}</div>
          <dl className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-[20px] bg-ink p-4 text-white"><dd className="font-display text-[30px] leading-none">{s.rating !== null ? s.rating.toFixed(1) : '–'}</dd><dt className="mt-2 text-[13px]">overall rating</dt></div>
            <div className="rounded-[20px] bg-canvas p-4"><dd className="font-display text-[30px] leading-none">{s.makes}</dd><dt className="mt-2 text-[13px] text-subtle">public make{s.makes === 1 ? '' : 's'}</dt></div>
            <div className="rounded-[20px] bg-canvas p-4"><dd className="font-display text-[30px] leading-none">{s.reviews}</dd><dt className="mt-2 text-[13px] text-subtle">review{s.reviews === 1 ? '' : 's'}</dt></div>
          </dl>
          {e.description && <p className="mt-5 max-w-xl whitespace-pre-line text-[15px] leading-relaxed">{e.description}</p>}
          <div className="mt-6"><Actions page={page.data} /></div>
          <p className="mt-4 text-sm text-subtle">
            {e.kind === 'pattern' && 'Pattern files are never shared on Seams Club. '}
            {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 text-ink underline underline-offset-4">Buy it from the {e.kind === 'pattern' ? 'designer' : 'shop'}<ExternalLink size={13} aria-hidden="true" /></a>}
          </p>
        </div>
      </section>

      {(e.kind === 'pattern' || fabricsUsed.length > 0) && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {e.kind === 'pattern' && <HowItSews entry={e} />}
          {fabricsUsed.length > 0 && (
            <section aria-labelledby="fabrics-title" className="rounded-[30px] bg-white p-6 sm:p-7">
              <h2 id="fabrics-title" className="font-display text-[22px] tracking-[-.04em]">Fabrics people used</h2>
              <ul className="mt-4 flex flex-wrap gap-2">{fabricsUsed.map(f => <li key={f.name} className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold">{capitalise(f.name)} <span className="font-normal text-subtle">{f.count}</span></li>)}</ul>
            </section>
          )}
        </div>
      )}

      <section aria-labelledby="makes-title">
        <h2 id="makes-title" className="mb-4 mt-8 font-display text-[32px] tracking-[-.05em] sm:text-[40px]">{makes.length ? `${s.makes} make${s.makes === 1 ? '' : 's'}` : 'Makes'}</h2>
        {makes.length
          ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {makes.map(m => (
                <Link key={m.id} href={`/makes/${m.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-[22px] bg-line text-ink no-underline">
                  {m.coverImageUrl ? <img src={m.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center bg-peach-soft" aria-hidden="true"><Scissors size={28} /></span>}
                  <span className="absolute inset-x-2 bottom-2 rounded-[14px] bg-white px-3 py-2">
                    <span className="block truncate text-[13px] font-bold">@{m.owner.handle}</span>
                    <span className="block truncate text-xs text-subtle">{[m.size && `Size ${m.size}`, m.usedWith].filter(Boolean).join(' · ') || m.name}</span>
                  </span>
                </Link>
              ))}
            </div>
          : <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">No shared makes yet. Link this {e.kind} to one of yours from your studio, and share the make.</p>}
      </section>

      <Discussions catalogId={e.id} />

      <section aria-labelledby="reviews-title">
        <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 id="reviews-title" className="font-display text-[32px] tracking-[-.05em] sm:text-[40px]">Reviews</h2>
          <WriteReview page={page.data} label={page.data.myReview ? 'Edit your review' : 'Write a review'} className="inline-flex min-h-[48px] items-center rounded-full bg-yellow px-6 text-[15px] font-bold text-ink" />
        </div>
        {reviews.isLoading ? <Loader2 className="animate-spin" aria-label="Loading reviews" />
          : !reviews.data?.length ? <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">No reviews yet. Made it? Tell people how it went.</p>
          : <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">{reviews.data.map(r => <ReviewCard key={r.id} review={r} entry={e} />)}</div>}
      </section>
    </div>
  );
}
