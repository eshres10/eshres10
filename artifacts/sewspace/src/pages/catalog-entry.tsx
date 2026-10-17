import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogReviewsQueryKey,
  markReviewHelpful,
  unmarkReviewHelpful,
  useAddCatalogPatternToLibrary,
  getGetCatalogMeQueryKey,
  useGetCatalogMe,
  useGetCatalogPage,
  useGetCatalogReviews,
  type CatalogEntry,
  type CatalogMe,
  type CatalogPage,
  type Review,
} from '@workspace/api-client-react';
import { Bookmark, Check, ExternalLink, Loader2, Pencil, Scissors, ThumbsUp } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { capitalise, EditEntryForm, ReviewForm, Stars } from '@/components/catalog/parts';
import { Alterations, DesignerRow, FabricsUsed, Gallery, GetIt, SizeChart, StarSummary, StatTiles } from '@/components/catalog/PatternPage';
import { Loading } from '@/components/common';
import { Discussions } from '@/components/forum/Discussions';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { Sheet } from '@/components/social/Sheet';
import { FilterChips } from '@/components/studio/parts';
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
        {review.make ? <Link href={`/makes/${review.make.id}`} className="inline-flex min-h-[44px] items-center font-semibold text-ink underline underline-offset-4">See the make</Link> : <span />}
        {!review.isMine
          ? <button type="button" onClick={toggle} aria-pressed={helped} className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${helped ? 'border-ink bg-yellow' : 'border-line'}`}>
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

const BIG = 'inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[15px] font-bold no-underline disabled:opacity-60';

/**
 * "I've made this": starts a new make with this pattern from your library
 * (added first if needed). Once you have one, it links to it instead.
 */
function MadeIt({ entry: e, me }: { entry: CatalogEntry; me: CatalogMe | undefined }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [, navigate] = useLocation();
  const library = useAddCatalogPatternToLibrary();
  const mine = me?.made[0];
  if (mine) {
    return (
      <Link href={`/projects/${mine.id}`} className={`${BIG} border-2 border-ink bg-ink text-white`}>
        <Check size={16} aria-hidden="true" />{mine.status === 'finished' ? 'You made this' : "You're making this"}
      </Link>
    );
  }
  const start = async () => {
    if (!ask({ title: 'Sign in to add your make', body: "Your make starts private in your studio. You'll come straight back here." })) return;
    try {
      const patternId = me?.libraryPatternId ?? (await library.mutateAsync({ id: e.id })).patternId;
      client.invalidateQueries({ queryKey: getGetCatalogMeQueryKey(e.id) });
      navigate(`/projects/new?pattern=${patternId}`);
    } catch { /* the button stays; the person can try again */ }
  };
  return (
    <button type="button" onClick={start} disabled={library.isPending} className={`${BIG} border-2 border-ink bg-white text-ink`}>
      {library.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}I've made this
    </button>
  );
}

function Actions({ page, me }: { page: CatalogPage; me: CatalogMe | undefined }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const save = useAddCatalogPatternToLibrary();
  const e = page.entry;
  const [editing, setEditing] = useState(false);
  const inLibrary = Boolean(me?.libraryPatternId) || page.inMyLibrary || save.isSuccess;
  return (
    <div className="flex flex-wrap gap-2">
      {e.kind === 'pattern'
        ? <MadeIt entry={e} me={me} />
        : <WriteReview page={page} className={`${BIG} border-2 border-ink bg-white text-ink`} label={page.myReview ? 'Edit your review' : 'Write a review'} />}
      {e.kind === 'pattern' && (
        inLibrary
          ? <Link href="/patterns" className={`${BIG} border border-ink bg-white text-ink`}><Check size={16} aria-hidden="true" />In your library</Link>
          : <button type="button" disabled={save.isPending} className={`${BIG} bg-canvas text-ink`}
              onClick={() => { if (ask({ title: 'Sign in to save patterns', body: 'Saved patterns go in your private pattern library.' })) save.mutate({ id: e.id }, { onSuccess: () => client.invalidateQueries() }); }}>
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} aria-hidden="true" />}Add to my library
            </button>
      )}
      {e.canEdit && <button type="button" onClick={() => setEditing(true)} className={`${BIG} text-ink underline underline-offset-4`}><Pencil size={15} aria-hidden="true" />Edit page</button>}
      {editing && (
        <Sheet label={`Edit ${e.name}`} onClose={() => setEditing(false)}>
          <EditEntryForm entry={e} sizes={page.sizes} onDone={() => setEditing(false)} />
        </Sheet>
      )}
    </div>
  );
}

/** "12", "Size 14", "14, graded to 16" → "12", "14", "14": the size a make was cut in. */
const MAKES_FIRST = 6;

const sizeKey = (size: string) => size.toLowerCase().replace(/^size\s*/, '').trim().split(/[\s,/]+/)[0] ?? '';

/** Makes, newest first or near your size (worked out on the server from your measurements). */
function Makes({ page, me }: { page: CatalogPage; me: CatalogMe | undefined }) {
  const ask = useRequireSignIn();
  const [sort, setSort] = useState<'new' | 'near'>('new');
  const [all, setAll] = useState(false);
  const e = page.entry;
  const near = new Set((me?.nearSizes ?? []).map(sizeKey));
  const matching = sort === 'near' ? page.makes.filter(m => m.size && near.has(sizeKey(m.size))) : page.makes;
  // Six at first (a sideways row on phones), the rest after "See all".
  const shown = all ? matching : matching.slice(0, MAKES_FIRST);
  const pick = (v: 'new' | 'near') => {
    if (v === 'near' && !ask({ title: 'Sign in to see makes near your size', body: 'Your measurements stay private: only you see which size is closest.' })) return;
    setSort(v);
  };
  return (
    <section aria-labelledby="makes-title">
      <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 id="makes-title" className="font-display text-[32px] tracking-[-.05em] sm:text-[40px]">{e.stats.makes ? `${e.stats.makes} ${e.stats.makes === 1 ? 'make' : 'makes'}` : 'Makes'}</h2>
        {e.kind === 'pattern' && page.makes.length > 0 && page.sizes.length > 0 && (
          <FilterChips label="Show makes" value={sort} onChange={pick} options={[{ value: 'new', label: 'Newest' }, { value: 'near', label: 'Near my size' }]} />
        )}
      </div>
      {sort === 'near' && me && !me.closestSize
        ? <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">{me.hasMeasurements ? "Your measurements don't match this size chart." : <><Link href="/measurements" className="font-semibold text-ink underline underline-offset-4">Save your measurements</Link> to see makes near your size. They stay private.</>}</p>
        : shown.length
          ? <>
              {sort === 'near' && me?.closestSize && <p className="-mt-2 mb-3 text-[13px] text-subtle">Sizes {me.nearSizes.join(', ')}: around size {me.closestSize}, your closest. Only you see this.</p>}
              <ul id="makes-list" className={all
                ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6'
                : '-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6'}>
                {shown.map(m => (
                  <li key={m.id} className={all ? 'min-w-0' : 'w-[58vw] max-w-[240px] shrink-0 snap-start sm:w-auto sm:max-w-none'}>
                    <Link href={`/makes/${m.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-[22px] bg-line text-ink no-underline">
                      {m.coverImageUrl ? <img src={m.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center bg-peach-soft" aria-hidden="true"><Scissors size={28} /></span>}
                      <span className="absolute inset-x-2 bottom-2 rounded-[14px] bg-white px-3 py-2">
                        <span className="block truncate text-[13px] font-bold">@{m.owner.handle}</span>
                        <span className="block truncate text-xs text-subtle">{[m.size && `Size ${m.size}`, m.usedWith].filter(Boolean).join(' · ') || m.name}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {matching.length > MAKES_FIRST && (
                <button type="button" aria-expanded={all} aria-controls="makes-list" onClick={() => setAll(v => !v)}
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-full border border-ink bg-white px-5 text-[15px] font-bold">
                  {all ? 'Show fewer' : `See all ${matching.length}`}
                </button>
              )}
            </>
          : <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">{sort === 'near' ? 'No shared makes near your size yet.' : `No shared makes yet. Link this ${e.kind} to one of yours from your studio, and share the make.`}</p>}
    </section>
  );
}

const SOURCE_EYEBROW = { free: 'Free pattern', designer: "Indie pattern · designer's site", seams_club: 'Indie PDF pattern · sold on Seams Club' } as const;

/** A shared pattern or product page at /catalog/:kind/:slug. Works signed out. */
export function CatalogEntryPage({ kind, slug }: { kind: string; slug: string }) {
  const { isSignedIn } = useAuth();
  const valid = kind === 'pattern' || kind === 'product';
  const page = useGetCatalogPage(kind as 'pattern', slug, { query: { retry: false, enabled: valid } });
  const reviews = useGetCatalogReviews(kind as 'pattern', slug, { query: { retry: false, enabled: valid } });
  const entryId = page.data?.entry.id ?? 0;
  // Your own extras (stash, closest size, library, makes): signed in, patterns only.
  const me = useGetCatalogMe(entryId, { query: { enabled: Boolean(isSignedIn) && kind === 'pattern' && entryId > 0, retry: false } });
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
  const { entry: e, makes } = page.data;
  const pattern = e.kind === 'pattern';
  const facts = [capitalise(e.category), e.difficulty && capitalise(e.difficulty), e.sizes && `Sizes ${e.sizes}`, e.fabricTypes, e.yardage].filter(Boolean) as string[];

  return (
    <div className={`mx-auto max-w-[1232px] space-y-4 ${pattern ? (isSignedIn ? 'pb-24 md:pb-0' : 'pb-28 md:pb-0') : ''}`}>
      <nav aria-label="Breadcrumb" className="hidden text-sm sm:block">
        <Link href={pattern ? '/catalog' : '/catalog?kind=product'} className="text-ink underline underline-offset-4">{pattern ? 'Patterns' : 'Fabrics & supplies'}</Link>
        <span aria-hidden="true" className="text-subtle"> / </span>
        <Link href={pattern ? `/catalog?category=${e.category}` : '/catalog?kind=product'} className="text-ink underline underline-offset-4">{capitalise(e.category)}</Link>
        <span aria-hidden="true" className="text-subtle"> / </span><span className="font-semibold">{e.name}</span>
      </nav>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] md:items-start">
        <Gallery page={page.data} />
        <div className="min-w-0 rounded-[30px] bg-white p-6 sm:p-8 md:rounded-[40px] md:p-10">
          <p className="eyebrow eyebrow-red">{pattern ? SOURCE_EYEBROW[e.source] : capitalise(e.category)}</p>
          <h1 className="mt-2 font-display text-[clamp(34px,4.2vw,56px)] leading-[1.02] tracking-[-.05em]">{e.name}</h1>
          <DesignerRow page={page.data} />
          {e.description && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{e.description}</p>}
          <ul className="mt-4 flex flex-wrap gap-1.5">{facts.map(f => <li key={f} className="rounded-full bg-canvas px-3 py-1.5 text-[13px] font-semibold">{f}</li>)}</ul>
          <StatTiles entry={e} />
          {pattern
            ? <GetIt entry={e} />
            : e.url && <p className="mt-5"><a href={e.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 text-ink underline underline-offset-4">Buy it from the shop<ExternalLink size={13} aria-hidden="true" /></a></p>}
          <div className="mt-4"><Actions page={page.data} me={me.data} /></div>
          {pattern && <p className="mt-3 text-[13px] text-subtle">Pattern files are never shared on Seams Club.</p>}
        </div>
      </section>

      {pattern && (
        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          <HowItSews entry={e} />
          <Alterations page={page.data} />
          <FabricsUsed page={page.data} me={me.data} />
        </div>
      )}
      {!pattern && <FabricsUsed page={page.data} />}
      {pattern && <SizeChart page={page.data} me={me.data} />}

      <Makes page={page.data} me={me.data} />

      <Discussions catalogId={e.id} />

      <section aria-labelledby="reviews-title">
        <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 id="reviews-title" className="font-display text-[32px] tracking-[-.05em] sm:text-[40px]">Reviews</h2>
          <WriteReview page={page.data} label={page.data.myReview ? 'Edit your review' : 'Write a review'} className="inline-flex min-h-[48px] items-center rounded-full bg-yellow px-6 text-[15px] font-bold text-ink" />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <StarSummary page={page.data} />
          {reviews.isLoading ? <Loader2 className="animate-spin" aria-label="Loading reviews" />
            : !reviews.data?.length ? <p className="rounded-[30px] bg-white px-6 py-8 text-sm text-subtle">No reviews yet. Made it? Tell people how it went.</p>
            : <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{reviews.data.map(r => <ReviewCard key={r.id} review={r} entry={e} />)}</div>}
        </div>
      </section>

      {pattern && (
        <div className={`fixed z-40 bg-white md:hidden ${isSignedIn
          ? 'inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] rounded-[24px] border border-line px-4 py-2'
          : 'inset-x-0 bottom-0 border-t border-line px-4 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2'}`}>
          <GetIt entry={e} compact />
        </div>
      )}
    </div>
  );
}
