import { useEffect, useState, type ReactNode } from 'react';
import { useGetProfile } from '@workspace/api-client-react';
import { Bookmark, BookMarked, BookOpen, Compass, Flag, FolderKanban, LayoutGrid, Home, House, Layers, LogOut, Menu, MessageCircle, MessagesSquare, Plus, Ruler, Scissors, Search, Sparkles, Spool, Store, Trophy, X } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import { RequireSignIn } from '@/components/auth/RequireSignIn';
import { PublicHeader } from '@/components/shell/PublicHeader';
import { UserAvatar } from '@/components/avatar';
import { Logo } from '@/components/brand/Logo';
import { currentAppPath } from '@/lib/navigation';
import { basePath } from '@/lib/clerk';
import { useHideOnScroll } from '@/components/shell/useHideOnScroll';
import { inCommunity } from '@/components/shell/CommunityTabs';
import { inStudio, StudioMobileHeader, studioSection } from '@/components/shell/StudioMobile';
import { AccountMenuDesktop, AccountMenuMobile } from '@/components/shell/AccountMenu';

type NavItem = { href: string; label: string; icon: typeof Home };

// Groups follow the design (Community / My studio / Help). Forum, Challenges
// and Saved join Community as their phases ship.
export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Community', items: [
    { href: '/feed', label: 'Home', icon: House },
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/forum', label: 'Forum', icon: MessagesSquare },
    { href: '/challenges', label: 'Challenges', icon: Trophy },
    { href: '/catalog', label: 'Patterns & supplies', icon: BookMarked },
    { href: '/saved', label: 'Saved', icon: Bookmark },
  ] },
  { label: 'My studio', items: [
    { href: '/studio', label: 'Overview', icon: LayoutGrid },
    { href: '/projects', label: 'Projects & makes', icon: FolderKanban },
    { href: '/stash/fabrics', label: 'Fabric stash', icon: Layers },
    { href: '/stash/threads', label: 'Thread drawer', icon: Spool },
    { href: '/patterns', label: 'Pattern library', icon: BookOpen },
    { href: '/measurements', label: 'Measurements', icon: Ruler },
  ] },
  { label: 'Help', items: [
    { href: '/assistant', label: 'Sewing assistant', icon: MessageCircle },
    { href: '/ai-studio', label: 'Outfit preview', icon: Sparkles },
    { href: '/marketplace', label: 'Marketplace', icon: Store },
  ] },
];

// Only shown to admins (ADMIN_USER_IDS); the API checks again.
const adminGroup = { label: 'Admin', items: [{ href: '/admin/reports', label: 'Reports', icon: Flag }] };
const allItems = [...navGroups, adminGroup].flatMap(group => group.items);
const compactToolbarPages = new Set(['/forum', '/catalog', '/challenges', '/projects', '/patterns', '/stash/fabrics', '/stash/threads']);

function isActive(location: string, href: string) {
  return location === href || (href !== '/studio' && location.startsWith(`${href}/`));
}

function useMyProfile() {
  const profile = useGetProfile();
  return profile.data;
}

function SidebarNav({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  const me = useMyProfile();
  const { signOut } = useClerk();
  return (
    <div className="flex h-full flex-col gap-[22px]">
      <Logo href="/studio" />
      {[...navGroups, ...(me?.isAdmin ? [adminGroup] : [])].map(group => (
        <nav key={group.label} aria-label={group.label}>
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[.16em]">{group.label}</div>
          {group.items.map(item => {
            const Icon = item.icon;
            const active = isActive(location, item.href);
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className={`flex min-h-[44px] items-center gap-3 rounded-[18px] px-3 text-sm ${item.label === 'Home' ? 'font-bold' : 'font-semibold'} no-underline ${active ? 'bg-ink text-white' : 'text-ink hover:bg-white/60'}`}>
                <Icon size={18} aria-hidden="true" /><span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ))}
      <Link href="/settings" onClick={onNavigate} data-testid="link-settings" className="mt-auto flex min-h-[52px] items-center gap-3 border-t border-ink px-3 pt-3.5 text-ink no-underline">
        <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{me?.name ?? 'Your profile'}</span>
          <span className="block truncate text-xs">{me?.handle ? `@${me.handle} · ` : ''}Profile &amp; settings</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void signOut({ redirectUrl: basePath || '/' });
        }}
        data-testid="button-sign-out"
        className="flex min-h-[44px] items-center gap-3 rounded-[18px] px-3 text-left text-sm font-semibold text-ink hover:bg-white/60"
      >
        <LogOut size={18} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

/**
 * Phone tab bar. Floating everywhere except the studio, which uses the
 * full-width style from the studio mockups (Phase S; elsewhere stays floating
 * until the owner decides).
 */
function MobileTabBar({ location, full = false }: { location: string; full?: boolean }) {
  const me = useMyProfile();
  const meHref = me?.handle ? `/@${me.handle}` : '/settings';
  const tab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined}
      className={`grid h-12 w-[52px] place-items-center rounded-[18px] ${active ? 'bg-ink text-white' : 'text-ink'}`}>
      <Icon size={22} aria-hidden="true" />
    </Link>
  );
  return (
    <nav aria-label="App" className={full
      ? 'fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-line bg-white px-4 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden'
      : 'fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-[30px] bg-white px-3 py-2 shadow-float md:hidden'}>
      {tab('/feed', 'Home', House, isActive(location, '/feed'))}
      {/* Explore is the door to all community sections (forum, challenges, patterns). */}
      {tab('/explore', 'Explore', Compass, inCommunity(location) || location === '/search')}
      <Link href="/new" aria-label="New post" className="grid h-[52px] w-[58px] place-items-center rounded-[20px] bg-yellow text-ink"><Plus size={26} aria-hidden="true" /></Link>
      {tab('/studio', 'My studio', Scissors, inStudio(location))}
      <Link href={meHref} aria-label="My profile" aria-current={location === meHref ? 'page' : undefined} className="grid h-12 w-[52px] place-items-center rounded-[18px]">
        <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} size={28} />
      </Link>
    </nav>
  );
}

export function ShellFrame({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const profile = useGetProfile();
  const mobileFocus = location === '/new' || location.startsWith('/posts/');
  const profileHeaderHidden = useHideOnScroll(!mobileFocus, location);
  useEffect(() => { setMenuOpen(false); }, [location]);

  // First visit: choose a handle before using the app, then come back here.
  if (profile.data?.needsHandle && location !== '/welcome') {
    return <Redirect to={`/welcome?next=${encodeURIComponent(currentAppPath())}`} replace />;
  }

  const studio = studioSection(location);
  const title = allItems.find(item => isActive(location, item.href))?.label
    ?? ({ '/settings': 'Profile & settings', '/new': 'New post', '/search': 'Search' } as Record<string, string>)[location]
    ?? (location.startsWith('/posts/') ? 'Post' : location.startsWith('/@') ? 'Profile' : 'Seams Club');
  return (
    <div className={`${mobileFocus ? 'min-h-[100dvh] pb-0' : 'min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))]'} md:flex md:items-start md:gap-[18px] md:p-[18px] md:pb-[18px]`}>
      <aside className="sticky top-[18px] hidden h-[calc(100dvh-36px)] w-[260px] shrink-0 overflow-y-auto rounded-[30px] bg-yellow px-4 py-[22px] md:block">
        <SidebarNav location={location} />
      </aside>
      {menuOpen && (
         <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 md:hidden" onClick={e => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
           <aside className="h-full w-[300px] max-w-[85vw] overflow-y-auto rounded-l-[30px] bg-yellow px-4 pb-[calc(1.4rem+env(safe-area-inset-bottom))] pt-[calc(1.4rem+env(safe-area-inset-top))]">
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="float-right grid h-11 w-11 place-items-center rounded-full bg-white"><X size={20} /></button>
            <SidebarNav location={location} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {studio && <StudioMobileHeader key={studio.href} section={studio} onMenuOpen={() => setMenuOpen(true)} />}
        {!mobileFocus && !studio && <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-top))] md:hidden" />}
        <header className={mobileFocus
          ? 'relative z-30 hidden items-center gap-2 rounded-[24px] bg-white py-1.5 pl-3 pr-2 shadow-float md:flex md:static md:mx-0 md:mt-0 md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3'
          : studio
            ? 'hidden items-center gap-2 rounded-[24px] bg-white py-1.5 pl-3 pr-2 shadow-float md:flex md:static md:mx-0 md:mt-0 md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3'
            : `fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 bg-white px-4 pb-2 pt-[env(safe-area-inset-top)] shadow-float transition-transform duration-200 ease-out ${profileHeaderHidden ? '-translate-y-full' : 'translate-y-0'} md:static md:mx-0 md:mt-0 md:h-auto md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3 md:transition-none md:translate-y-0`}>
          {location === '/feed'
            ? <div className="min-w-0 flex-1 md:hidden"><Logo href="/feed" /></div>
            : <h1 className={`min-w-0 flex-1 truncate font-display text-[20px] tracking-[-.04em] md:text-[22px] ${title === 'Home' ? 'font-bold' : ''}`}>{title}</h1>}
          <h1 className={location === '/feed' ? `sr-only md:not-sr-only md:min-w-0 md:flex-1 md:truncate md:font-display md:text-[22px] md:tracking-[-.04em] ${title === 'Home' ? 'md:font-bold' : ''}` : 'hidden'}>{title}</h1>
          {inCommunity(location) && <Link href="/search" aria-label="Search" className="grid h-10 w-10 shrink-0 place-items-center rounded-full md:hidden"><Search size={19} aria-hidden="true" /></Link>}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full md:hidden"><Menu size={19} /></button>
          {location !== '/new' && <Link href="/new" className="hidden min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white no-underline md:inline-flex"><Plus size={16} aria-hidden="true" />New post</Link>}
          <AccountMenuMobile />
          <AccountMenuDesktop />
        </header>
        <main className={`${location === '/new' ? 'mx-auto w-full max-w-7xl px-0 py-0 md:px-2 md:py-8' : location.startsWith('/posts/') ? 'mx-auto flex h-[100dvh] min-h-0 w-full max-w-7xl flex-col overflow-hidden px-3 py-0 md:block md:h-auto md:overflow-visible md:px-2 md:py-8' : compactToolbarPages.has(location) ? 'mx-auto w-full max-w-7xl px-4 pb-6 pt-4 md:px-2 md:pb-8 md:pt-6' : 'mx-auto w-full max-w-7xl px-4 py-6 md:px-2 md:py-8'}`}>{children}</main>
      </div>
      {!mobileFocus && <MobileTabBar location={location} full={Boolean(studio)} />}
    </div>
  );
}

/**
 * Layout for pages anyone can open (explore, posts): the app shell when signed
 * in, the public header when signed out.
 */
export function AdaptiveLayout({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  const postDetail = location.startsWith('/posts/');
  const compactToolbarPage = compactToolbarPages.has(location);
  if (isLoaded && isSignedIn) return <ShellFrame>{children}</ShellFrame>;
  return (
    <div className={`${postDetail ? 'h-[100dvh] overflow-hidden pb-0' : 'min-h-[100dvh] pb-14'}`}>
      <div className={postDetail ? 'hidden md:block' : ''}><PublicHeader /></div>
      <main className={postDetail ? 'mx-auto h-[100dvh] max-w-[1232px] px-3 pt-0 md:h-auto md:px-4 md:pt-7' : `mx-auto max-w-[1232px] px-4 ${compactToolbarPage ? 'pt-4 md:pt-6' : 'pt-7'}`}>{children}</main>
    </div>
  );
}

/** Layout for signed-in pages: private, with the studio sidebar and tab bar. */
export function Shell({ children }: { children: ReactNode }) {
  return <RequireSignIn><ShellFrame>{children}</ShellFrame></RequireSignIn>;
}
