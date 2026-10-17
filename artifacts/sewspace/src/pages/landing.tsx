import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExploreFeed, useListChallenges, type ChallengeSummary, type FeedPost } from '@workspace/api-client-react';
import { useAuth } from '@clerk/react';
import { Bookmark, Globe, Heart, Lock, MessageCircle, MoreHorizontal, Scissors, Send, Users } from 'lucide-react';
import { Link, Redirect } from 'wouter';
import { STATUS_LABEL, challengeMeta } from '@/components/challenges/parts';
import { Logo } from '@/components/brand/Logo';
import { Garment } from '@/components/brand/Garment';
import { Glyph } from '@/components/onboarding/Shell';
import { PublicHeader } from '@/components/shell/PublicHeader';
import { authHref } from '@/lib/navigation';

// The public home page (docs/design/website: "Landing — signed out"). Signed-in
// people go to Home. Live sections use public data only: Explore's public
// photo posts and the challenge list, both through the public API (blocks and
// visibility apply as everywhere else). The product showcase is an
// illustration built from app pieces and garment drawings: no mockup photos.

const join = () => authHref('sign-up', '/feed');


function Label({ children }: { children: string }) {
  return <span className="inline-flex rounded-full bg-red px-3 py-1 text-[13px] font-semibold text-white">{children}</span>;
}

function Eyebrow({ children, tone = 'text-red-ink' }: { children: string; tone?: string }) {
  return <p className={`text-[12px] font-bold uppercase tracking-[.16em] ${tone}`}>{children}</p>;
}

/** The app in miniature: a post with its tags, a profile, a challenge and a pattern page. */
function Showcase() {
  return (
    <div className="rounded-[36px] bg-peach p-4 sm:p-9" aria-hidden="true">
      <div className="overflow-hidden rounded-[22px] bg-canvas">
        <div className="flex gap-1.5 border-b border-line bg-white px-4 py-3.5"><span className="h-2.5 w-2.5 rounded-full bg-red" /><span className="h-2.5 w-2.5 rounded-full bg-yellow" /><span className="h-2.5 w-2.5 rounded-full bg-blue" /></div>
        <div className="grid gap-6 p-4 sm:p-9 md:grid-cols-3">
          <div className="space-y-3">
            <Label>Tag the pattern & fabric</Label>
            <div className="overflow-hidden rounded-[22px] border border-line bg-white">
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-blue text-sm font-bold text-white">M</span>
                <span className="flex-1 leading-tight"><b className="block text-sm">mara.makes</b><span className="text-xs text-subtle">2h · Public</span></span>
                <MoreHorizontal size={18} />
              </div>
              <div className="relative">
                <Garment name="Dresses" tone="bg-blue-soft" className="aspect-[4/5] w-full" />
                <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">1/4</span>
              </div>
              <div className="px-3.5 pb-4 pt-3">
                <div className="flex items-center gap-4 text-sm font-semibold"><span className="inline-flex items-center gap-1"><Heart size={19} className="fill-red text-red" />312</span><span className="inline-flex items-center gap-1"><MessageCircle size={19} />28</span><Send size={18} /><Bookmark size={18} className="ml-auto" /></div>
                <p className="mt-2.5 text-sm leading-snug"><b>mara.makes</b> Finally finished my drawstring dress. Lengthened the bodice 2cm and it sits perfectly now.</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-canvas px-2.5 py-1">Pattern · Willa Dress</span><span className="rounded-full bg-canvas px-2.5 py-1">Fabric · Cotton lawn</span></div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Profiles with every make</Label>
            <div className="rounded-[22px] border border-line bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-yellow font-display text-xl">J</span>
                <span className="flex-1 leading-tight"><b className="block font-display text-[18px] tracking-[-.03em]">June Okafor</b><span className="text-xs text-subtle">@junesews · 2.4k followers</span></span>
                <span className="rounded-full bg-yellow px-3 py-1.5 text-xs font-bold">Follow</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1 text-center text-xs font-semibold"><span className="rounded-full bg-ink py-1.5 text-white">Posts</span><span className="py-1.5">Makes</span><span className="py-1.5">Used</span></div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {(['Tops', 'Skirts', 'Knits', 'Trousers', 'Dresses', 'Bags', 'Outerwear', 'Mending', 'Tops'] as const).map((g, i) => (
                  <Garment key={i} name={g} tone={['bg-yellow', 'bg-blue-soft', 'bg-peach-soft', 'bg-mist'][i % 4]} className="aspect-square rounded-[10px]" />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Challenges & pattern pages</Label>
            <div className="overflow-hidden rounded-[22px] border border-line bg-white">
              <div className="relative"><Garment name="Outerwear" tone="bg-blue-soft" className="aspect-[12/5] w-full" /><span className="absolute left-3 top-3 rounded-full bg-yellow px-2.5 py-0.5 text-xs font-bold">Active</span></div>
              <div className="p-4">
                <b className="block font-display text-[18px] tracking-[-.03em]">#OctoberDenimChallenge</b>
                <span className="text-xs text-subtle">12 days left · 486 joined</span>
                <span className="mt-3 flex min-h-[40px] items-center justify-center rounded-full bg-ink text-sm font-bold text-white">Join challenge</span>
              </div>
            </div>
            <div className="rounded-[22px] border border-line bg-white p-4 text-xs">
              <div className="flex items-baseline justify-between"><b className="text-[15px]">Willa Dress</b><span className="text-subtle">214 makes</span></div>
              {[['Fit', 92, '4.6'], ['Difficulty', 56, '2.8'], ['Instructions', 86, '4.3']].map(([label, w, v]) => (
                <div key={label} className="mt-2 flex items-center gap-3"><span className="w-20 text-subtle">{label}</span><span className="h-1.5 flex-1 rounded-full bg-line"><span className="block h-full rounded-full bg-blue" style={{ width: `${w}%` }} /></span><b className="w-6 text-right">{v}</b></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
}

function CommunityTile({ post }: { post: FeedPost }) {
  const cover = post.media[0];
  return (
    <Link href={`/posts/${post.id}`} aria-label={`Post by @${post.author.handle}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`}
      className="relative block aspect-square overflow-hidden rounded-[22px] bg-line">
      {cover && <img src={cover.thumbUrl} alt={cover.altText || ''} loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ backgroundColor: cover.color ?? undefined }} />}
      <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="truncate rounded-full bg-white px-2.5 py-1 text-ink">@{post.author.handle}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-ink"><Heart size={12} className="fill-red text-red" aria-hidden="true" />{compact(post.likeCount)}</span>
      </span>
    </Link>
  );
}

function FreshFromTheCommunity() {
  const feed = useQuery({ queryKey: ['landing', 'explore'], queryFn: () => getExploreFeed({ kind: 'photo' }) });
  const posts = (feed.data?.items ?? []).filter(p => p.media.length > 0).slice(0, 10);
  if (!posts.length) return null; // nothing public yet: leave the section out
  return (
    <section aria-labelledby="fresh" className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><Eyebrow>Explore</Eyebrow><h2 id="fresh" className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-.05em] sm:text-[44px]">Fresh from the community</h2></div>
        <Link href="/explore" className="btn btn-line min-h-[44px]">See everything on Explore</Link>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{posts.map(p => <CommunityTile key={p.id} post={p} />)}</div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 pt-24 sm:px-6">
      <div className="text-center"><Eyebrow>How it works</Eyebrow><h2 id="how" className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-.05em] sm:text-[44px]">Sewing depth, social ease</h2></div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <article className="rounded-[34px] bg-white p-7 sm:p-9">
          <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-yellow" aria-hidden="true"><Glyph name="book" /></span>
          <h3 className="mt-7 font-display text-[26px] leading-tight tracking-[-.04em]">Log every make</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-subtle">Pattern, size, fabric and alterations live with the photos, so your notes help the next person too.</p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[18px] bg-canvas p-4 text-sm">
            {[['Pattern', 'Willa Dress'], ['Size', '14, graded to 16 at hip'], ['Fabric', 'Cotton lawn, 2.8 m'], ['Alterations', '+2 cm bodice, 1 cm swayback']].map(([k, v]) => <div key={k} className="contents"><dt className="text-subtle">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
        </article>
        <article className="rounded-[34px] bg-white p-7 sm:p-9">
          <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-blue text-white" aria-hidden="true"><Glyph name="star" /></span>
          <h3 className="mt-7 font-display text-[26px] leading-tight tracking-[-.04em]">Pattern pages that tell the truth</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-subtle">One page per pattern or fabric, gathering every public make and honest ratings for fit, difficulty and instructions.</p>
          <div className="mt-6 space-y-2 rounded-[18px] bg-canvas p-4 text-sm">
            {[['Fit', 92, '4.6'], ['Difficulty', 56, '2.8'], ['Instructions', 86, '4.3']].map(([label, w, v]) => (
              <div key={label} className="flex items-center gap-3"><span className="w-24 text-subtle">{label}</span><span className="h-1.5 flex-1 rounded-full bg-white"><span className="block h-full rounded-full bg-ink" style={{ width: `${w}%` }} /></span><b className="w-7 text-right">{v}</b></div>
            ))}
          </div>
        </article>
        <article className="rounded-[34px] bg-white p-7 sm:p-9">
          <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-peach" aria-hidden="true"><Glyph name="trophy" /></span>
          <h3 className="mt-7 font-display text-[26px] leading-tight tracking-[-.04em]">Challenges that get you sewing</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-subtle">Anyone can start one. Join, submit a make, and cheer on everyone else’s entries.</p>
          <div className="mt-6 flex gap-2" aria-hidden="true">
            {[['12', 'days', true], ['06', 'hours', true], ['486', 'joined', false], ['731', 'entries', false]].map(([n, l, dark]) => (
              <span key={l as string} className={`grid min-w-[64px] flex-1 place-items-center rounded-[14px] px-2 py-2.5 ${dark ? 'bg-ink text-white' : 'bg-canvas'}`}><b className="font-display text-[24px] leading-none">{n}</b><span className="mt-1 text-[11px]">{l}</span></span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

const BADGE = { active: 'bg-yellow text-ink', upcoming: 'border-2 border-blue bg-white text-blue-ink', ended: 'bg-ink/75 text-white' } as const;
const CHALLENGE_ART = ['Outerwear', 'Bags', 'Tops'];

function SomethingToSew() {
  const active = useListChallenges({ status: 'active' });
  const upcoming = useListChallenges({ status: 'upcoming' });
  const ended = useListChallenges({ status: 'ended' });
  const shown = [...(active.data ?? []), ...(upcoming.data ?? []), ...(ended.data ?? [])].slice(0, 3);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="this-month" className="mx-auto max-w-[1200px] px-4 pt-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><Eyebrow>Challenges</Eyebrow><h2 id="this-month" className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-.05em] sm:text-[44px]">Something to sew this month</h2></div>
        <Link href="/challenges" className="btn btn-line min-h-[44px]">All challenges</Link>
      </div>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {shown.map((c, i) => {
          const [when, count] = challengeMeta(c);
          return (
            <Link key={c.slug} href={`/challenges/${c.slug}`} className="overflow-hidden rounded-[30px] bg-white text-ink no-underline hover:outline hover:outline-2 hover:outline-ink">
              <span className="relative block">
                <Garment name={CHALLENGE_ART[i % CHALLENGE_ART.length]} tone={['bg-blue-soft', 'bg-peach-soft', 'bg-mist'][i % 3]} className="aspect-[16/9] w-full" />
                <span className={`absolute left-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE[c.status]}`}>{c.status === 'upcoming' ? 'Upcoming' : STATUS_LABEL[c.status]}</span>
              </span>
              <span className="block p-6">
                <b className="block font-display text-[22px] leading-tight tracking-[-.04em]">#{c.tag}</b>
                {c.description && <span className="mt-2 line-clamp-2 block text-sm text-subtle">{c.description}</span>}
                <span className="mt-3 flex gap-4 text-[13px]"><b>{when}</b><span className="text-subtle">{count}</span></span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function YourRules() {
  const rows = [
    { icon: Globe, tone: 'bg-yellow text-ink', title: 'Public', sub: 'Anyone, even without an account' },
    { icon: Users, tone: 'bg-blue text-white', title: 'Followers', sub: 'Only people who follow you' },
    { icon: Lock, tone: 'bg-ink text-white', title: 'Private · default for stash & patterns', sub: 'Just you', on: true },
  ];
  return (
    <section aria-labelledby="your-rules" className="mx-auto max-w-[1200px] px-4 pt-24 sm:px-6">
      <div className="grid gap-8 rounded-[36px] bg-ink p-7 text-white sm:p-14 md:grid-cols-2 md:items-center">
        <div>
          <Eyebrow tone="text-yellow">Your studio, your rules</Eyebrow>
          <h2 id="your-rules" className="mt-3 font-display text-[34px] leading-[1.02] tracking-[-.05em] sm:text-[48px]">Stash and patterns stay private until you say so.</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/85">Every post, make, stash item and pattern has its own setting. Measurements are never shared. The AI assistant is optional and only reads what you can already see.</p>
        </div>
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.title} className={`flex items-center gap-4 rounded-[22px] bg-white px-5 py-4 text-ink ${r.on ? 'outline outline-[3px] outline-yellow' : ''}`}>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${r.tone}`} aria-hidden="true"><r.icon size={20} /></span>
              <span><b className="block">{r.title}</b><span className="text-sm text-subtle">{r.sub}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => { document.title = 'Seams Club · Where sewists show every make'; }, []);
  if (isLoaded && isSignedIn) return <Redirect to="/feed" replace />;
  return (
    <div className="min-h-[100dvh] pb-10">
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-[1000px] px-4 pt-14 text-center sm:px-6 md:pt-20">
          <Label>The sewing community, all in one studio</Label>
          <h1 className="mt-6 font-display text-[44px] leading-[1.02] tracking-[-.055em] sm:text-[72px] md:text-[92px]">
            Where sewists{' '}
            <span className="relative -top-1 inline-grid h-[.82em] w-[.82em] place-items-center rounded-full bg-yellow align-middle" aria-hidden="true"><Scissors className="h-[45%] w-[45%]" strokeWidth={2.4} /></span>{' '}
            show every make{' '}
            <span className="relative -top-1 inline-grid h-[.78em] w-[.78em] rotate-[-8deg] place-items-center rounded-[.18em] bg-blue align-middle text-white" aria-hidden="true"><Heart className="h-[45%] w-[45%] fill-white" /></span>
          </h1>
          <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-relaxed text-subtle sm:text-[19px]">Post your makes, log every alteration, join challenges, and find out how a pattern really fits from the people who have sewn it.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={join()} className="inline-flex min-h-[52px] items-center rounded-full bg-yellow px-7 text-[16px] font-bold text-ink no-underline">Start sharing — it’s free</Link>
            <Link href="/explore" className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-7 text-[16px] font-bold text-white no-underline">Browse makes</Link>
          </div>
          <p className="mt-4 text-sm text-subtle">No account needed to browse. Sign in to like, comment and join challenges.</p>
        </section>
        <div className="mx-auto mt-14 max-w-[1200px] px-4 sm:px-6"><Showcase /></div>
        <FreshFromTheCommunity />
        <HowItWorks />
        <SomethingToSew />
        <YourRules />
        <section className="mx-auto max-w-[900px] px-4 pt-28 text-center sm:px-6">
          <h2 className="font-display text-[40px] leading-[1.02] tracking-[-.055em] sm:text-[64px]">Your next make is someone’s inspiration.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={join()} className="inline-flex min-h-[52px] items-center rounded-full bg-yellow px-7 text-[16px] font-bold text-ink no-underline">Open your studio</Link>
            <Link href="/explore" className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-7 text-[16px] font-bold text-white no-underline">Look around first</Link>
          </div>
        </section>
      </main>
      <footer className="mx-auto mt-24 max-w-[1200px] px-4 sm:px-6">
        <div className="flex flex-col items-center gap-4 rounded-[30px] bg-white px-6 py-5 text-sm md:flex-row md:justify-between">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            {[['Explore', '/explore'], ['Challenges', '/challenges'], ['Forum', '/forum'], ['Patterns', '/catalog']].map(([l, h]) => <Link key={h} href={h} className="min-h-[44px] content-center text-ink no-underline hover:underline">{l}</Link>)}
          </nav>
          <span className="text-subtle">Made for the hands that make.</span>
        </div>
      </footer>
    </div>
  );
}
