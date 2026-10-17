import { Link, useLocation } from 'wouter';

/** The community sections. Each is its own page (own URL, meta tags and filters); this bar switches between them. */
export const COMMUNITY_TABS = [
  { href: '/explore', label: 'Explore' },
  { href: '/forum', label: 'Forum' },
  { href: '/challenges', label: 'Challenges' },
  { href: '/catalog', label: 'Patterns' },
] as const;

export function inCommunity(location: string) {
  return COMMUNITY_TABS.some(t => location === t.href || location.startsWith(`${t.href}/`));
}

export function CommunityTabs() {
  const [location] = useLocation();
  // Phones only: from 768 px the sidebar (signed in) or the public header
  // (signed out) already has these links (owner asked to drop it on desktop).
  return (
    <nav aria-label="Community sections" className="mb-5 flex w-full max-w-full gap-1 rounded-full bg-white p-1 sm:w-fit md:hidden">
      {COMMUNITY_TABS.map(t => {
        const active = location === t.href || location.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={`flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-full px-2 text-[14px] font-bold no-underline sm:flex-none sm:px-4 sm:text-[15px] ${active ? 'bg-yellow text-ink' : 'text-ink hover:bg-canvas'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
