import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useGetProfile, useGetPublicProfile } from '@workspace/api-client-react';
import { Check, Grid3x3, Pencil, Scissors, Share2, ShoppingBag } from 'lucide-react';
import { Link } from 'wouter';
import { Loading } from '@/components/common';
import { PublicHeader } from '@/components/shell/PublicHeader';
import NotFound from '@/pages/not-found';

const TABS = [
  { id: 'posts', label: 'Posts', icon: Grid3x3, empty: 'Posts and photos will show here once the feed launches.' },
  { id: 'makes', label: 'Makes', icon: Scissors, empty: 'Finished makes that are shared publicly will show here.' },
  { id: 'used', label: 'Used products', icon: ShoppingBag, empty: 'Fabrics, patterns and tools used in public makes will show here.' },
] as const;

function joined(date: string | Date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} on SewSpace`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };
  return (
    <button type="button" onClick={share} className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-ink px-[22px] text-[15px] font-semibold text-white">
      {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}{copied ? 'Link copied' : 'Share'}
    </button>
  );
}

/** Public profile at /@handle. Readable by anyone; only public fields are ever sent. */
export function PublicProfilePage({ handle }: { handle: string }) {
  const { isSignedIn } = useAuth();
  const profile = useGetPublicProfile(handle, { query: { retry: false } });
  const me = useGetProfile({ query: { enabled: Boolean(isSignedIn) } });
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('posts');
  const p = profile.data;

  useEffect(() => {
    if (p) document.title = `${p.name} (@${p.handle}) · SewSpace`;
  }, [p]);

  if (profile.isLoading) return <><PublicHeader /><main className="mx-auto max-w-[1232px] px-4 pt-7"><Loading /></main></>;
  if (!p) return <NotFound />;

  const isMe = me.data?.handle === p.handle;
  const active = TABS.find(t => t.id === tab)!;
  return (
    <div className="min-h-[100dvh] pb-14">
      <PublicHeader />
      <main className="mx-auto max-w-[1232px] px-4 pt-7">
        <section className="overflow-hidden rounded-[40px] bg-white">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-6 px-5 pb-9 pt-6 sm:px-11 sm:pt-10">
            {p.avatarUrl
              ? <img src={p.avatarUrl} alt="" className="h-32 w-32 rounded-full object-cover" />
              : <span aria-hidden="true" className="grid h-32 w-32 place-items-center rounded-full bg-yellow font-display text-[52px] tracking-[-.04em]">{p.name.charAt(0).toUpperCase()}</span>}
            <div className="min-w-0 flex-[1_1_320px]">
              <h1 className="font-display text-[clamp(30px,3.6vw,44px)] leading-[1.05] tracking-[-.05em]">{p.name}</h1>
              <p className="mt-1 text-[15px] text-subtle">@{p.handle} · Joined {joined(p.joinedAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isMe && <Link href="/settings" className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-yellow px-[26px] text-[15px] font-bold text-ink no-underline"><Pencil size={16} aria-hidden="true" />Edit profile</Link>}
              <ShareButton name={p.name} />
            </div>
            {p.bio && <p className="max-w-[680px] flex-[1_1_100%] whitespace-pre-line text-base leading-relaxed">{p.bio}</p>}
          </div>
        </section>

        <div role="tablist" aria-label="Profile sections" className="mt-[22px] flex max-w-[520px] gap-1 rounded-full bg-white p-[5px]">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="profile-panel" onClick={() => setTab(t.id)}
              className={`min-h-[44px] flex-1 rounded-full text-[15px] font-bold ${tab === t.id ? 'bg-ink text-white' : 'text-ink'}`}>{t.label}</button>
          ))}
        </div>
        <section id="profile-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`} className="mt-5 grid place-items-center rounded-[30px] border border-line bg-white px-6 py-16 text-center">
          <active.icon size={28} aria-hidden="true" />
          <p className="mt-3 font-display text-xl">Coming soon</p>
          <p className="mt-1 max-w-sm text-sm text-subtle">{active.empty}</p>
        </section>
      </main>
    </div>
  );
}
