import { AccountMenuMobile } from '@/components/shell/AccountMenu';
import { useEffect, useRef, useState } from 'react';
import { useListFabrics, useListPatterns, useListProjects, useListThreads } from '@workspace/api-client-react';
import { Menu, Plus, Search, X } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useHideOnScroll } from '@/components/shell/useHideOnScroll';

// "My studio" on phones (Phase S): a full-width top bar with the section's
// title, search and +, the section pills, and (in Shell) a full-width tab bar.
// Desktop keeps the usual shell. The bar talks to the pages through the URL:
// ?q= is the search, and Measurements' + opens ?new=1.

export const STUDIO_SECTIONS = [
  { href: '/studio', pill: 'Overview', title: 'Overview' },
  { href: '/stash/fabrics', pill: 'Fabric', title: 'Fabric stash', add: '/stash/new?kind=fabric', addLabel: 'Add fabric' },
  { href: '/stash/threads', pill: 'Thread', title: 'Thread drawer', add: '/stash/new?kind=thread', addLabel: 'Add thread' },
  { href: '/patterns', pill: 'Patterns', title: 'Pattern library', add: '/stash/new?kind=pattern', addLabel: 'Add a pattern' },
  { href: '/measurements', pill: 'Measurements', title: 'Measurements', add: '/measurements?new=1', addLabel: 'New measurement set' },
] as const;
export type StudioSection = (typeof STUDIO_SECTIONS)[number];

export function studioSection(location: string): StudioSection | undefined {
  return STUDIO_SECTIONS.find(s => s.href === location);
}

/** The "My studio" tab is selected on the five sections and on projects. */
export function inStudio(location: string) {
  return Boolean(studioSection(location)) || location === '/projects' || location.startsWith('/projects/');
}

/** The search term every studio list reads (and the desktop search box writes). */
export function useStudioQuery(): [string, (q: string) => void] {
  const [location, setLocation] = useLocation();
  const q = new URLSearchParams(useSearch()).get('q') ?? '';
  const set = (next: string) => {
    const p = new URLSearchParams(window.location.search);
    if (next) p.set('q', next); else p.delete('q');
    setLocation(`${location}${p.size ? `?${p}` : ''}`, { replace: true });
  };
  return [q, set];
}

/** Overview has no list of its own: search finds things across the studio. */
function OverviewResults({ q }: { q: string }) {
  const term = q.trim().toLowerCase();
  const fabrics = useListFabrics(undefined, { query: { enabled: term.length > 0 } });
  const threads = useListThreads(undefined, { query: { enabled: term.length > 0 } });
  const patterns = useListPatterns(undefined, { query: { enabled: term.length > 0 } });
  const projects = useListProjects({ query: { enabled: term.length > 0 } });
  if (!term) return null;
  const hit = (...fields: Array<string | null | undefined>) => fields.some(f => f?.toLowerCase().includes(term));
  const rows = [
    ...(projects.data ?? []).filter(p => hit(p.name)).map(p => ({ key: `p${p.id}`, href: `/projects/${p.id}`, kind: 'Project', name: p.name })),
    ...(patterns.data ?? []).filter(p => hit(p.name, p.designer)).map(p => ({ key: `pt${p.id}`, href: `/stash/pattern/${p.id}/edit`, kind: 'Pattern', name: p.name })),
    ...(fabrics.data ?? []).filter(f => hit(f.name, f.color, f.type)).map(f => ({ key: `f${f.id}`, href: `/stash/fabric/${f.id}/edit`, kind: 'Fabric', name: f.name })),
    ...(threads.data ?? []).filter(t => hit(t.colorName, t.brand)).map(t => ({ key: `t${t.id}`, href: `/stash/thread/${t.id}/edit`, kind: 'Thread', name: [t.brand, t.colorName].filter(Boolean).join(' ') })),
  ].slice(0, 20);
  const loading = fabrics.isLoading || threads.isLoading || patterns.isLoading || projects.isLoading;
  return (
    <div className="border-b border-line bg-white px-4 pb-3" aria-live="polite">
      {loading ? <p className="py-3 text-sm text-subtle">Searching…</p>
        : !rows.length ? <p className="py-3 text-sm text-subtle">Nothing in your studio matches "{q.trim()}".</p>
        : <ul className="divide-y divide-line">{rows.map(r => (
            <li key={r.key}><Link href={r.href} className="flex min-h-[48px] items-center gap-3 text-ink no-underline">
              <span className="w-[64px] shrink-0 text-xs font-bold uppercase tracking-[.12em] text-subtle">{r.kind}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            </Link></li>
          ))}</ul>}
    </div>
  );
}

/** Phones only: the studio's top bar, search field and section pills. */
export function StudioMobileHeader({ section, onMenuOpen }: { section: StudioSection; onMenuOpen: () => void }) {
  const [q, setQ] = useStudioQuery();
  const [searching, setSearching] = useState(Boolean(q));
  const input = useRef<HTMLInputElement>(null);
  const hidden = useHideOnScroll(true, section.href);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  const add = 'add' in section ? section : null;
  return (
    <div className="contents md:hidden">
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-top))]" />
      <header className={`fixed inset-x-0 top-0 z-40 border-b border-line bg-white pt-[env(safe-area-inset-top)] shadow-float transition-transform duration-200 ease-out ${hidden ? '-translate-y-full' : 'translate-y-0'}`}>
        <div className="flex h-16 items-center gap-2 px-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[20px] leading-tight tracking-[-.04em]">{section.title}</h1>
          </div>
          <button type="button" onClick={() => { if (searching) setQ(''); setSearching(s => !s); }} aria-expanded={searching} aria-controls="studio-search"
            aria-label={searching ? 'Close search' : 'Search my studio'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas">
            {searching ? <X size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
          </button>
          {add && (
            <Link href={add.add} aria-label={add.addLabel} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yellow text-ink">
              <Plus size={22} aria-hidden="true" />
            </Link>
          )}
          <button type="button" onClick={onMenuOpen} aria-label="Open menu" className="grid h-11 w-11 shrink-0 place-items-center text-ink">
            <Menu size={20} aria-hidden="true" />
          </button>
          <AccountMenuMobile />
        </div>
        {searching && (
          <div id="studio-search" className="px-4 pb-3">
            <label className="relative block">
              <span className="sr-only">Search {section.href === '/studio' ? 'my studio' : section.title.toLowerCase()}</span>
              <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input ref={input} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={section.href === '/studio' ? 'Projects, patterns, fabric, thread' : `Search ${section.title.toLowerCase()}`}
                className="field pl-9" onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setSearching(false); } }} />
            </label>
          </div>
        )}
        {searching && section.href === '/studio' && <OverviewResults q={q} />}
      </header>
      <nav aria-label="Studio sections" className="flex gap-2 md:hidden overflow-x-auto px-3 pb-1 pt-3">
        {STUDIO_SECTIONS.map(s => {
          const current = s.href === section.href;
          return (
            <Link key={s.href} href={s.href} aria-current={current ? 'page' : undefined}
              className={`flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[15px] font-bold no-underline ${current ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
              {s.pill}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
