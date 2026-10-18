import { useId, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  followProfile,
  getGetCatalogPageQueryKey,
  unfollowProfile,
  useGetProfile,
  type CatalogEntry,
  type CatalogMe,
  type CatalogPage,
} from '@workspace/api-client-react';
import { AtSign, ExternalLink, Loader2, Lock, Star, Store } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { Garment } from '@/components/brand/Garment';
import { ALTERATION_LABEL, capitalise } from '@/components/catalog/parts';
import { SaveHeart } from '@/components/catalog/Directory';
import { formatLength } from '@/components/projects/setup';
import { formatPrice } from '@/lib/currency';

// The pattern page's public sections (docs/design/patterns d4–d5, m3–m6).
// Every number here comes from public data (the API decides).

const ART: Record<string, string> = { dresses: 'Dresses', tops: 'Tops', skirts: 'Skirts', trousers: 'Trousers', outerwear: 'Outerwear', knitwear: 'Knits', bags: 'Bags', jumpsuits: 'Dresses', home: 'Home', other: 'Other' };

/** Photos from public makes: thumbnails beside the main photo from 768 px, swipe with dots below. */
export function Gallery({ page }: { page: CatalogPage }) {
  const [current, setCurrent] = useState(0);
  const photos = page.gallery;
  const e = page.entry;
  if (!photos.length) {
    return <Garment name={ART[e.category] ?? 'Tops'} tone="bg-peach-soft" className="min-h-[300px] w-full rounded-[30px] md:min-h-[480px] md:rounded-[40px]" />;
  }
  const main = photos[Math.min(current, photos.length - 1)];
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[92px_minmax(0,1fr)]">
      {photos.length > 1 && (
        <ul aria-label="Photos" className="hidden flex-col gap-2.5 md:flex">
          {photos.map((p, i) => (
            <li key={p.makeId}>
              <button type="button" onClick={() => setCurrent(i)} aria-label={`Photo ${i + 1} of ${photos.length}, from @${p.handle}'s make`} aria-current={i === current ? 'true' : undefined}
                className={`block overflow-hidden rounded-[16px] border-2 ${i === current ? 'border-ink' : 'border-transparent'}`}>
                <img src={p.url} alt="" className="aspect-[3/4] w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative hidden overflow-hidden rounded-[40px] bg-line md:block">
        <img src={main.url} alt={`${e.name} made by @${main.handle}`} className="h-full max-h-[600px] min-h-[480px] w-full object-cover" />
        <Link href={`/makes/${main.makeId}`} className="absolute bottom-4 left-4 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink no-underline">Photos from the club's makes · @{main.handle}</Link>
      </div>
      {/* Phones: swipe through, with dots. */}
      <div className="relative md:hidden">
        <ul aria-label="Photos" className="flex snap-x snap-mandatory overflow-x-auto rounded-[30px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={ev => { const el = ev.currentTarget; setCurrent(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {photos.map((p, i) => (
            <li key={p.makeId} className="w-full shrink-0 snap-center">
              <img src={p.url} alt={`${e.name} made by @${p.handle}, photo ${i + 1} of ${photos.length}`} className="aspect-[4/5] w-full object-cover" />
            </li>
          ))}
        </ul>
        {photos.length > 1 && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((p, i) => <span key={p.makeId} className={`h-2 rounded-full bg-white ${i === current ? 'w-5' : 'w-2 opacity-70'}`} />)}
          </span>
        )}
      </div>
    </div>
  );
}

function FollowDesigner({ page }: { page: CatalogPage }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const d = page.entry.designer!;
  const info = page.designerInfo!;
  if (info.isMe) return null;
  const toggle = async () => {
    if (!ask({ title: `Sign in to follow ${d.name}`, body: "Their new patterns and posts show in your Home feed. You'll come straight back here." })) return;
    setBusy(true);
    try {
      await (info.followedByMe ? unfollowProfile(d.handle) : followProfile(d.handle));
      await client.invalidateQueries({ queryKey: getGetCatalogPageQueryKey(page.entry.kind, page.entry.slug) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={info.followedByMe}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-bold disabled:opacity-60 ${info.followedByMe ? 'border border-ink bg-white text-ink' : 'bg-ink text-white'}`}>
      {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{info.followedByMe ? 'Following' : 'Follow'}
    </button>
  );
}

/** The designer: their account with Follow and their shop / Instagram links, or just the name. */
export function DesignerRow({ page }: { page: CatalogPage }) {
  const e = page.entry;
  const d = e.designer;
  const info = page.designerInfo;
  if (!d || !info) return e.maker ? <p className="mt-2 text-[17px]">by <b>{e.maker}</b></p> : null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <Link href={`/@${d.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={d.name} avatarUrl={d.avatarUrl} size={40} /></Link>
        <span className="min-w-0 flex-1">
          <Link href={`/@${d.handle}`} className="block truncate font-semibold text-ink underline underline-offset-4">{e.maker || d.name}</Link>
          <span className="block truncate text-[13px] text-subtle">Independent designer · {info.patterns} {info.patterns === 1 ? 'pattern' : 'patterns'}</span>
        </span>
        <FollowDesigner page={page} />
      </div>
      {(info.shopUrl || info.instagram) && (
        <p className="mt-2 flex flex-wrap gap-2 pl-[52px] text-[13px]">
          {info.shopUrl && <a href={info.shopUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-[44px] md:min-h-[36px] items-center gap-1.5 rounded-full bg-canvas px-3 font-semibold text-ink no-underline"><Store size={14} aria-hidden="true" />Shop<span className="sr-only"> (opens the designer's shop)</span></a>}
          {info.instagram && <a href={`https://www.instagram.com/${info.instagram}/`} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-[44px] md:min-h-[36px] items-center gap-1.5 rounded-full bg-canvas px-3 font-semibold text-ink no-underline"><AtSign size={14} aria-hidden="true" />{info.instagram}<span className="sr-only"> on Instagram</span></a>}
        </p>
      )}
    </div>
  );
}

/** Rating with review count, public makes, and the share who say true to size. */
export function StatTiles({ entry: e }: { entry: CatalogEntry }) {
  const s = e.stats;
  const sized = s.runsSmall + s.runsTrue + s.runsLarge;
  return (
    <dl className="mt-5 grid grid-cols-3 gap-2">
      <div className="rounded-[20px] bg-ink p-3.5 text-white sm:p-4">
        <dd className="flex items-center gap-1.5 font-display text-[26px] leading-none sm:text-[30px]"><Star size={20} aria-hidden="true" className="fill-yellow text-yellow" />{s.rating !== null ? s.rating.toFixed(1) : '–'}</dd>
        <dt className="mt-2 text-[13px]">{s.reviews} {s.reviews === 1 ? 'review' : 'reviews'}</dt>
      </div>
      <div className="rounded-[20px] bg-canvas p-3.5 sm:p-4"><dd className="font-display text-[26px] leading-none sm:text-[30px]">{s.makes}</dd><dt className="mt-2 text-[13px] text-subtle">public {s.makes === 1 ? 'make' : 'makes'}</dt></div>
      <div className="rounded-[20px] bg-canvas p-3.5 sm:p-4"><dd className="font-display text-[26px] leading-none sm:text-[30px]">{sized ? `${Math.round((s.runsTrue / sized) * 100)}%` : '–'}</dd><dt className="mt-2 text-[13px] text-subtle">say true to size</dt></div>
    </dl>
  );
}

/** Where to get it: the price, the save heart and the designer link (pattern sales aren't open, so nothing is bought here). */
export function GetIt({ entry: e, compact = false }: { entry: CatalogEntry; compact?: boolean }) {
  const free = e.source === 'free';
  const price = !free && e.priceCents !== null && e.currency ? formatPrice(e.priceCents, e.currency) : null;
  const label = free ? 'Download from the designer' : `Get it from ${e.designer?.name ?? (e.maker || 'the designer')}`;
  const button = e.url
    ? <a href={e.url} target="_blank" rel="noopener noreferrer nofollow ugc" className={`inline-flex items-center justify-center gap-2 rounded-full bg-yellow font-bold text-ink no-underline ${compact ? 'min-h-[46px] shrink-0 px-5 text-[15px]' : 'min-h-[52px] w-full px-6 text-[16px] sm:w-auto'}`}>{compact && !free ? 'Get it' : label}<ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
    : null;
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <b className="block font-display text-[22px] leading-none">{free ? 'Free' : price ?? ''}</b>
          <span className="block truncate text-xs text-subtle">{free ? 'From the designer' : price ? `${e.currency} · designer's site` : "On the designer's site"}</span>
        </span>
        {button ?? <SaveHeart entry={e} className="border border-ink" />}
      </div>
    );
  }
  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <b className="block font-display text-[32px] leading-none">{free ? 'Free' : price ?? 'Designer\'s site'}</b>
          {price && <span className="mt-1 block text-[13px] text-subtle">{e.currency} · on the designer's site</span>}
        </span>
        <SaveHeart entry={e} className="h-12 w-12 border border-ink" />
        {button}
      </div>
    </div>
  );
}

/** Top alterations from reviews, as a share of reviews. */
export function Alterations({ page }: { page: CatalogPage }) {
  const total = page.entry.stats.reviews;
  const top = page.alterations.slice(0, 4);
  if (!top.length || !total) return null;
  return (
    <section aria-labelledby="alter-title" className="rounded-[30px] bg-white p-6 sm:p-7">
      <h2 id="alter-title" className="font-display text-[22px] tracking-[-.04em]">Common alterations</h2>
      <p className="mt-1 text-sm text-subtle">From {total} {total === 1 ? 'review' : 'reviews'}</p>
      <ul className="mt-4 space-y-2.5">
        {top.map(a => {
          const pct = Math.round((a.count / total) * 100);
          return (
            <li key={a.id} className="flex items-center gap-3">
              <span className="relative min-h-[44px] md:min-h-[36px] flex-1 overflow-hidden rounded-[12px] bg-canvas">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-peach" style={{ width: `${pct}%` }} />
                <span className="relative flex min-h-[44px] md:min-h-[36px] items-center px-3 text-sm font-semibold">{ALTERATION_LABEL[a.id]}</span>
              </span>
              <b className="w-11 text-right text-sm">{pct}%</b>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FabricsUsed({ page, me }: { page: CatalogPage; me?: CatalogMe | null }) {
  if (!page.fabricsUsed.length && !me) return null;
  return (
    <section aria-labelledby="fabrics-title" className="rounded-[30px] bg-white p-6 sm:p-7">
      <h2 id="fabrics-title" className="font-display text-[22px] tracking-[-.04em]">Fabrics people used</h2>
      {page.fabricsUsed.length
        ? <ul className="mt-4 flex flex-wrap gap-2">{page.fabricsUsed.map(f => <li key={f.name} className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold">{capitalise(f.name)} <span className="font-normal text-subtle">{f.count}</span></li>)}</ul>
        : <p className="mt-2 text-sm text-subtle">No public makes list their fabric yet.</p>}
      {me && <InYourStash me={me} />}
    </section>
  );
}

/** Your own fabric that's long enough. Worked out on the server for you only. */
function InYourStash({ me }: { me: CatalogMe }) {
  const profile = useGetProfile();
  const units = profile.data?.units === 'imperial' ? 'imperial' : 'metric';
  const need = me.fabricNeeded;
  return (
    <div className="mt-5 rounded-[20px] bg-canvas p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold"><Lock size={13} aria-hidden="true" />In your stash · only you see this</h3>
      {!need
        ? <p className="mt-2 px-1 text-[13px] text-subtle">This page doesn't say how much fabric it needs yet.</p>
        : !me.stash.length
          ? <p className="mt-2 px-1 text-[13px] text-subtle">Nothing in your stash is long enough. It needs {formatLength(need.minMetres, units)}{need.maxMetres > need.minMetres + 0.05 ? `–${formatLength(need.maxMetres, units)}` : ''}.</p>
          : <ul className="mt-2 space-y-1.5">
              {me.stash.map(f => (
                <li key={f.id}>
                  <Link href={`/stash/fabric/${f.id}/edit`} className="flex min-h-[46px] items-center gap-2.5 rounded-[14px] bg-white p-1.5 pr-3 text-ink no-underline">
                    {f.imageUrl ? <img src={f.imageUrl} alt="" className="h-[34px] w-[34px] shrink-0 rounded-[10px] object-cover" /> : <span aria-hidden="true" className="h-[34px] w-[34px] shrink-0 rounded-[10px] bg-line" />}
                    <span className="min-w-0 flex-1 truncate text-[13px]"><b>{f.name}</b> · {formatLength(f.metres, units)}</span>
                    <span className="shrink-0 text-xs font-bold">{f.enough === 'all' ? 'Enough' : 'Smaller sizes'}</span>
                  </Link>
                </li>
              ))}
            </ul>}
    </div>
  );
}

/** Inches to the nearest quarter, as a fraction: 30¾. */
export function inches(cm: number): string {
  const q = Math.round((cm / 2.54) * 4);
  return `${Math.floor(q / 4)}${['', '¼', '½', '¾'][q % 4]}`;
}
const cmText = (cm: number) => (Number.isInteger(cm) ? String(cm) : cm.toFixed(1));

/** Body measurements per size, cm or inches (starting on the viewer's unit), scrolling sideways on phones. */
export function SizeChart({ page, me }: { page: CatalogPage; me?: CatalogMe | null }) {
  const highlight = me?.closestSize ?? null;
  const { isSignedIn } = useAuth();
  const profile = useGetProfile({ query: { enabled: Boolean(isSignedIn) } });
  const [chosen, setChosen] = useState<'cm' | 'in' | null>(null);
  const unit = chosen ?? (profile.data?.units === 'imperial' ? 'in' : 'cm');
  const name = useId();
  const sizes = page.sizes;
  if (!sizes.length) return null;
  const rows: Array<[string, 'bustCm' | 'waistCm' | 'hipCm']> = [['Bust', 'bustCm'], ['Waist', 'waistCm'], ['Hip', 'hipCm']];
  const show = (v: number | null) => (v === null ? '–' : unit === 'cm' ? cmText(v) : inches(v));
  return (
    <section aria-labelledby="size-title" className="rounded-[30px] bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="size-title" className="font-display text-[22px] tracking-[-.04em]">Size chart <span className="hidden font-sans text-sm font-normal tracking-normal text-subtle sm:inline">body measurements</span></h2>
        <div role="radiogroup" aria-label="Units" className="flex rounded-full bg-canvas p-1">
          {(['cm', 'in'] as const).map(u => (
            <label key={u} className={`grid h-9 min-w-[48px] cursor-pointer place-items-center rounded-full px-3 text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${unit === u ? 'bg-ink text-white' : ''}`}>
              <input type="radio" name={name} checked={unit === u} onChange={() => setChosen(u)} className="sr-only" />{u}
            </label>
          ))}
        </div>
      </div>
      <div className="-mx-6 mt-4 overflow-x-auto px-6 sm:-mx-7 sm:px-7">
        <table className="w-full min-w-max border-collapse text-center text-sm">
          <caption className="sr-only">Body measurements for each size, in {unit === 'cm' ? 'centimetres' : 'inches'}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2.5 pr-4 text-left font-semibold">Size</th>
              {sizes.map(s => <th key={s.label} scope="col" className={`px-2.5 py-2.5 font-semibold ${highlight === s.label ? 'rounded-t-[10px] bg-yellow' : ''}`}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key]) => (
              <tr key={key} className="border-b border-line last:border-0">
                <th scope="row" className="py-2.5 pr-4 text-left font-semibold">{label}</th>
                {sizes.map(s => <td key={s.label} className={`px-2.5 py-2.5 ${highlight === s.label ? 'bg-yellow/30 font-bold' : ''}`}>{show(s[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {highlight && <p className="mt-3 flex items-center gap-2 text-[13px]"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-[4px] bg-yellow" />Size {highlight} is closest to your saved measurements. Only you see this.</p>}
      {me && !me.hasMeasurements && <p className="mt-3 text-[13px] text-subtle"><Link href="/measurements" className="font-semibold text-ink underline underline-offset-4">Save your measurements</Link> to see which size is closest. They stay private.</p>}
    </section>
  );
}

/** "★ 4.6 from 96 reviews" with the 5-to-1 split (every review counts). */
export function StarSummary({ page }: { page: CatalogPage }) {
  const s = page.entry.stats;
  if (!s.reviews) return null;
  return (
    <div className="rounded-[30px] bg-ink p-6 text-white">
      <p className="flex items-center gap-2 font-display text-[40px] leading-none"><Star size={28} aria-hidden="true" className="fill-yellow text-yellow" />{s.rating?.toFixed(1)}</p>
      <p className="mt-2 text-sm text-white/80">from {s.reviews} {s.reviews === 1 ? 'review' : 'reviews'}</p>
      <ul className="mt-4 space-y-1.5">
        {page.stars.map(r => {
          const pct = Math.round((r.count / s.reviews) * 100);
          return (
            <li key={r.stars} className="grid grid-cols-[14px_1fr_38px] items-center gap-2.5 text-xs">
              <span>{r.stars}</span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-yellow" style={{ width: `${pct}%` }} /></span>
              <span className="text-right">{pct}%<span className="sr-only"> gave {r.stars} {r.stars === 1 ? 'star' : 'stars'}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
