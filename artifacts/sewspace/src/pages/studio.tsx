import { useGetDashboard } from '@workspace/api-client-react';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorState, Loading } from '@/components/common';
import { MobileOverview } from '@/components/studio/MobileOverview';
import { AnyRecord } from '@/lib/types';

export function Recent({ title, items, href }: { title: string; items: AnyRecord[]; href: string }) {
  return (
    <section className="studio-card rounded-xl p-6">
      <div className="flex justify-between">
        <h2 className="font-display text-2xl">{title}</h2>
        <Link href={href} data-testid={`link-see-${title}`} className="text-xs font-bold text-red-ink">
          See all <ArrowRight size={14} className="inline" />
        </Link>
      </div>
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.slice(0, 3).map(item => (
            <div key={item.id} data-testid={`row-recent-${item.id}`} className="flex items-center gap-3 border-t border-line pt-3">
              <div className="h-10 w-10 rounded-md bg-peach" />
              <div>
                <p className="text-sm font-semibold">{item.name || item.colorName}</p>
                <p className="text-xs text-muted-foreground">{item.type || item.garmentType}</p>
              </div>
              <ChevronRight size={15} className="ml-auto" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">Nothing new yet — your next favorite could go here.</p>
      )}
    </section>
  );
}

export function Studio() {
  const query = useGetDashboard();
  const dashboard = query.data as AnyRecord | undefined;

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState retry={() => query.refetch()} />;

  const active = dashboard?.activeProject;
  const stats = [
    ['Fabric stash', dashboard?.fabricCount, '/stash/fabrics'],
    ['Threads', dashboard?.threadCount, '/stash/threads'],
    ['Patterns', dashboard?.patternCount, '/patterns'],
    ['Projects', dashboard?.projectCount, '/projects'],
  ];
  const shortcuts = (
    <div
      role="group"
      aria-label="Studio shortcuts"
      className="-mx-4 grid auto-cols-[5.5rem] grid-flow-col snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4"
    >
      {stats.map(([label, count, href]) => (
        <Link
          href={href as string}
          key={label as string}
          data-testid={`card-stat-${label}`}
          className="studio-card flex aspect-square w-[5.5rem] snap-start flex-col justify-between rounded-xl p-3 hover:-translate-y-0.5 sm:aspect-auto sm:w-auto sm:justify-start sm:p-5"
        >
          <span className="eyebrow !text-subtle leading-tight">{label}</span>
          <div className="mt-auto font-display text-2xl sm:mt-6 sm:text-4xl">{count ?? '—'}</div>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">in your studio</p>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <MobileOverview />
      </div>

      <div className="hidden md:block">
        {shortcuts}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          <section className="studio-card overflow-hidden rounded-xl">
            <div className="border-b border-line px-6 py-5">
              <p className="eyebrow">On the machine</p>
              <h2 className="mt-1 font-display text-3xl">{active?.name || 'Start something lovely'}</h2>
            </div>
            {active ? (
              <div className="grid gap-6 p-6 md:grid-cols-[.6fr_1fr]">
                <div className="min-h-[190px] rounded-lg bg-peach bg-[repeating-linear-gradient(45deg,#c08c5d_0_2px,transparent_2px_10px)]" />
                <div className="flex flex-col justify-center">
                  <p className="text-sm leading-6 text-muted-foreground">{active.notes || 'Your notes and little discoveries will live here.'}</p>
                  <div className="mt-8">
                    <div className="mb-2 flex justify-between text-xs">
                      <span>Progress</span>
                      <span>{active.progress || 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-yellow" style={{ width: `${active.progress || 0}%` }} />
                    </div>
                  </div>
                  <Link href="/projects" data-testid="link-continue-project" className="btn btn-quiet mt-7 w-fit">
                    Continue project <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">No active project yet. Your next one starts with a name.</div>
            )}
          </section>

          <section className="rounded-xl bg-ink p-6 text-white">
            <p className="eyebrow !text-yellow">A little magic</p>
            <h2 className="mt-2 font-display text-3xl leading-none">See it before you sew it.</h2>
            <p className="mt-4 text-sm leading-6 text-white">Pair a pattern with something from your stash and sketch the possibility.</p>
            <Link href="/ai-studio" data-testid="link-studio-ai" className="btn btn-primary mt-7">
              Open AI studio <Sparkles size={15} />
            </Link>
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Recent title="Recently added fabrics" items={dashboard?.recentFabrics || []} href="/stash/fabrics" />
          <Recent title="Patterns on your mind" items={dashboard?.recentPatterns || []} href="/patterns" />
        </div>
      </div>
    </>
  );
}
