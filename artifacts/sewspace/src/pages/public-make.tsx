import { useEffect, useState } from 'react';
import { useGetPublicMake } from '@workspace/api-client-react';
import { Check, Circle, Pencil, Share2 } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { Loading } from '@/components/common';
import { PublicHeader } from '@/components/shell/PublicHeader';
import { VisibilityBadge } from '@/components/visibility';
import { swatch } from '@/lib/swatch';
import NotFound from '@/pages/not-found';

const STAGES: Record<string, string> = { planning: 'Planning', cutting: 'Cutting', sewing: 'Sewing', fitting: 'Fitting', finished: 'Finished' };

const KIND_LABEL: Record<string, string> = { pattern: 'Pattern', fabric: 'Fabric', thread: 'Thread' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-line bg-white p-6 sm:p-8">
      <h2 className="eyebrow">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed.
    }
  };
  return (
    <button type="button" onClick={share} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white">
      {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}{copied ? 'Link copied' : 'Share'}
    </button>
  );
}

/** A make (project) as other people see it, at /makes/:id. Works signed out for public makes. */
export function PublicMakePage({ id }: { id: number }) {
  const make = useGetPublicMake(id, { query: { retry: false, enabled: Number.isFinite(id) } });
  const m = make.data;

  useEffect(() => {
    if (m) document.title = `${m.name}${m.owner ? ` by @${m.owner.handle}` : ''} · SewSpace`;
  }, [m]);

  if (make.isLoading) return <><PublicHeader /><main className="mx-auto max-w-[1232px] px-4 pt-7"><Loading /></main></>;
  if (!m) return <NotFound />;

  const doneSteps = m.steps.filter(step => step.completed).length;
  const writeups = ([['About this make', m.description], ['Alterations', m.alterations], ['Notes', m.notes], ['What went wrong', m.problems], ['How I fixed it', m.solutions]] as const)
    .filter(([, text]) => Boolean(text));
  const images = [m.coverImageUrl, ...m.photos.map(p => p.url)].filter((url): url is string => Boolean(url));

  return (
    <div className="min-h-[100dvh] pb-14">
      <PublicHeader />
      <main className="mx-auto max-w-[1232px] space-y-5 px-4 pt-7">
        {m.isOwner && (
          <div className="flex flex-wrap items-center gap-3 rounded-[24px] bg-yellow px-5 py-3 text-sm font-semibold">
            <span className="flex-1">This is how others see your make.</span>
            <VisibilityBadge value={m.visibility} />
            <Link href={`/projects/${m.id}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-4 text-white no-underline"><Pencil size={15} aria-hidden="true" />Edit in studio</Link>
          </div>
        )}

        <section className="overflow-hidden rounded-[40px] bg-white">
          {images.length > 0 && (
            <div className={`grid gap-1 ${images.length > 1 ? 'sm:grid-cols-[2fr_1fr]' : ''}`}>
              <img src={images[0]} alt={m.name} className="aspect-[4/5] max-h-[620px] w-full object-cover sm:aspect-auto sm:h-[520px]" />
              {images.length > 1 && (
                <div className="hidden h-[520px] gap-1 sm:grid" style={{ gridTemplateRows: `repeat(${Math.min(images.length - 1, 2)}, minmax(0, 1fr))` }}>
                  {images.slice(1, 3).map(url => <img key={url} src={url} alt="" className="h-full w-full object-cover" />)}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 pb-8 pt-6 sm:px-10">
            <div className="min-w-0 flex-[1_1_320px]">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-canvas px-2.5 py-1">{STAGES[m.status] ?? m.status}</span>
                {m.size && <span className="rounded-full bg-canvas px-2.5 py-1">Size {m.size}</span>}
                {m.visibility === 'followers' && <VisibilityBadge value="followers" />}
              </div>
              <h1 className="mt-3 font-display text-[clamp(30px,4vw,48px)] leading-[1.05] tracking-[-.05em]">{m.name}</h1>
              {m.owner && (
                <Link href={`/@${m.owner.handle}`} className="mt-3 inline-flex items-center gap-2.5 text-ink no-underline">
                  <UserAvatar name={m.owner.name} avatarUrl={m.owner.avatarUrl} size={32} />
                  <span className="text-sm"><b>{m.owner.name}</b> <span className="text-subtle">@{m.owner.handle}</span></span>
                </Link>
              )}
            </div>
            <ShareButton title={m.name} />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            {writeups.map(([title, text]) => (
              <Section key={title} title={title}><p className="whitespace-pre-line text-[15px] leading-relaxed">{text}</p></Section>
            ))}
            {images.length > 1 && (
              <Section title="Photos">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map(url => <img key={url} src={url} alt="" className="aspect-square w-full rounded-[18px] object-cover" />)}
                </div>
              </Section>
            )}
            {writeups.length === 0 && images.length <= 1 && (
              <Section title="Make log"><p className="text-sm text-subtle">No notes shared for this make yet.</p></Section>
            )}
          </div>
          <div className="space-y-5">
            {m.materials.length > 0 && (
              <Section title="Materials">
                <ul className="space-y-3">
                  {m.materials.map(item => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3">
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-[14px] object-cover" />
                        : <span aria-hidden="true" className="h-12 w-12 rounded-[14px] border border-line" style={{ background: swatch(item.color) }} />}
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-[.16em] text-subtle">{KIND_LABEL[item.kind]}</span>
                        {item.catalog
                          ? <Link href={`/catalog/${item.catalog.kind}/${item.catalog.slug}`} className="block truncate font-semibold text-blue-ink">{item.name}</Link>
                          : <span className="block truncate font-semibold">{item.name}</span>}
                        {item.detail && <span className="block truncate text-xs text-subtle">{item.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {m.steps.length > 0 && (
              <Section title={`Progress · ${doneSteps} of ${m.steps.length} steps`}>
                <ol className="space-y-2">
                  {m.steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm">
                      {step.completed ? <Check size={18} className="mt-0.5 shrink-0 text-blue-ink" aria-label="Done" /> : <Circle size={18} className="mt-0.5 shrink-0 text-subtle" aria-label="Not done yet" />}
                      <span className={step.completed ? 'text-subtle line-through' : ''}>{step.title}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
