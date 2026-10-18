import { useState, type ReactNode } from 'react';
import { useGetProfile, useListProjects } from '@workspace/api-client-react';
import { BookOpen, Compass, Flag, FolderKanban, LayoutGrid, Home, House, Layers, MessageCircle, MessagesSquare, PanelLeftClose, PanelLeftOpen, Plus, Ruler, Scissors, Search, ShoppingBag, Sparkles, Spool, Store, Trophy } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { RequireSignIn } from '@/components/auth/RequireSignIn';
import { PublicHeader } from '@/components/shell/PublicHeader';
import { UserAvatar } from '@/components/avatar';
import { Logo } from '@/components/brand/Logo';
import { currentAppPath } from '@/lib/navigation';
import { ChromeContext, EXPLORE_SCROLL, useHideOnScroll } from '@/components/shell/useHideOnScroll';
import { isExploreOverlay } from '@/components/explore/overlay';
import { inCommunity } from '@/components/shell/CommunityTabs';
import { inStudio, StudioMobileHeader, studioSection } from '@/components/shell/StudioMobile';
import { AccountMenuDesktop, AccountMenuMobile, LogOut } from '@/components/shell/AccountMenu';
import { NotificationBellDesktop, NotificationBellMobile } from '@/components/notifications/Notifications';

type NavItem = { href: string; label: string; icon: typeof Home };

// Groups follow the owner's sidebar redesign (October 2026): Community / My studio /
// Selling / Help, then Recent projects. Saved posts lives in the account menu.
export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Community', items: [
    { href: '/feed', label: 'Home', icon: House },
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/forum', label: 'Forum', icon: MessagesSquare },
    { href: '/challenges', label: 'Challenges', icon: Trophy },
    // The pattern directory (owner: "Shop" opens it; nothing is sold on Seams Club yet).
    { href: '/catalog', label: 'Shop', icon: ShoppingBag },
  ] },
  { label: 'My studio', items: [
    { href: '/studio', label: 'Overview', icon: LayoutGrid },
    { href: '/projects', label: 'Projects & makes', icon: FolderKanban },
    { href: '/stash/fabrics', label: 'Fabric stash', icon: Layers },
    { href: '/stash/threads', label: 'Thread drawer', icon: Spool },
    { href: '/patterns', label: 'Pattern library', icon: BookOpen },
    { href: '/measurements', label: 'Measurements', icon: Ruler },
    { href: '/ai-studio', label: 'AI studio', icon: Sparkles },
  ] },
  // Pattern sales aren't built: the dashboard opens the "Coming soon" marketplace page.
  { label: 'Selling', items: [
    { href: '/marketplace', label: 'Seller dashboard', icon: Store },
  ] },
  { label: 'Help', items: [
    { href: '/assistant', label: 'Sewing assistant', icon: MessageCircle },
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

const COLLAPSED_KEY = 'seams.sidebar-collapsed';

/** The desktop sidebar can shrink to an icon rail; remembered on this device. */
function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const set = (next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* private mode: not remembered */ }
  };
  return [collapsed, set];
}

/** Recent: up to three projects still on the go, newest first (the API has no "last edited" time). */
function useRecentProjects() {
  const projects = useListProjects().data ?? [];
  return projects.filter(p => p.status !== 'finished').sort((a, b) => b.id - a.id).slice(0, 3);
}

/**
 * The sidebar (desktop) and the phone ☰ menu. `onToggle` is passed on desktop only:
 * it shows the collapse button, and `collapsed` turns the rows into icons with labels
 * kept for screen readers and tooltips.
 */
function SidebarNav({ location, onNavigate, collapsed = false, onToggle }: { location: string; onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const me = useMyProfile();
  const recent = useRecentProjects();
  const row = (active: boolean) => `flex min-h-[44px] items-center rounded-[16px] text-sm no-underline ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-ink text-white' : 'text-ink hover:bg-white/60'}`;
  const label = (text: string) => <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 leading-tight'}>{text}</span>;
  return (
    <div className="flex h-full flex-col gap-4">
      <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2'}`}>
        {collapsed
          ? <Link href="/feed" aria-label="Seams Club home" className="grid h-11 w-11 place-items-center"><span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[12px] bg-ink font-display text-[22px] leading-none text-yellow">S</span></Link>
          : <Logo href="/feed" />}
        {onToggle && (
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white/60 text-ink hover:bg-white">
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {location !== '/new' && (
        <Link href="/new" onClick={onNavigate} aria-label={collapsed ? 'New post' : undefined} title={collapsed ? 'New post' : undefined}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-ink text-sm font-bold text-white no-underline ${collapsed ? 'px-0' : 'px-4'}`}>
          <Plus size={17} aria-hidden="true" />{!collapsed && 'New post'}
        </Link>
      )}
      {[...navGroups, ...(me?.isAdmin ? [adminGroup] : [])].map(group => (
        <nav key={group.label} aria-label={group.label}>
          <div className={collapsed ? 'mx-3 mb-1.5 border-t border-ink/20' : 'px-3 pb-1 text-[11px] font-bold uppercase tracking-[.16em]'}>{collapsed ? null : group.label}</div>
          {group.items.map(item => {
            const Icon = item.icon;
            const active = isActive(location, item.href);
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className={`${row(active)} ${item.label === 'Home' ? 'font-bold' : 'font-semibold'}`}>
                <Icon size={18} aria-hidden="true" className="shrink-0" />{label(item.label)}
                {item.href === '/marketplace' && !collapsed && <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold">Soon</span>}
              </Link>
            );
          })}
        </nav>
      ))}
      {recent.length > 0 && (
        <nav aria-label="Recent projects">
          <div className={collapsed ? 'mx-3 mb-1.5 border-t border-ink/20' : 'px-3 pb-1 text-[11px] font-bold uppercase tracking-[.16em]'}>{collapsed ? null : 'Recent'}</div>
          {recent.map(p => {
            const href = `/projects/${p.id}`;
            return (
              <Link key={p.id} href={href} onClick={onNavigate} aria-current={location === href ? 'page' : undefined} title={collapsed ? p.name : undefined} className={`${row(location === href)} font-semibold`}>
                {p.coverImageUrl
                  ? <img src={p.coverImageUrl} alt="" className="h-[22px] w-[22px] shrink-0 rounded-[6px] object-cover" />
                  : <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] bg-white/70"><Scissors size={13} /></span>}
                {label(p.name)}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="mt-auto border-t border-ink pt-3">
        <Link href="/settings" onClick={onNavigate} data-testid="link-settings" aria-label={collapsed ? 'Profile & settings' : undefined} title={collapsed ? 'Profile & settings' : undefined}
          className={`flex min-h-[48px] items-center text-ink no-underline ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}>
          <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{me?.name ?? 'Your profile'}</span>
              <span className="block truncate text-xs">{me?.handle ? `@${me.handle} · ` : ''}Profile &amp; settings</span>
            </span>
          )}
        </Link>
        {/* Collapsed, Log out stays in the account menu (avatar, top right). */}
        {!collapsed && (
          <LogOut close={onNavigate} panelClass="bg-white" cancelClass="bg-canvas"
            rowClass="flex min-h-[44px] w-full items-center gap-3 rounded-[16px] px-3 text-left text-sm font-semibold text-ink hover:bg-white/60" />
        )}
      </div>
    </div>
  );
}

/**
 * Phone tab bar. Floating everywhere except the studio, which uses the
 * full-width style from the studio mockups (Phase S; elsewhere stays floating
 * until the owner decides).
 */
function MobileTabBar({ location, full = false, hidden = false }: { location: string; full?: boolean; hidden?: boolean }) {
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
      : `fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-[30px] bg-white px-3 py-2 shadow-float transition-transform duration-[280ms] ease-out motion-reduce:transition-none md:hidden ${hidden ? 'translate-y-[calc(100%+2rem+env(safe-area-inset-bottom))]' : 'translate-y-0'}`}>
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

/** The address the shell lays out for: a post open over Explore keeps Explore's layout underneath. */
function useShellLocation(): string {
  const [location] = useLocation();
  return isExploreOverlay() ? '/explore' : location;
}

export function ShellFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const location = useShellLocation();
  const profile = useGetProfile();
  const mobileFocus = location === '/new' || location.startsWith('/posts/');
  // Explore (owner's brief): the bars slide away on the way down and the filters stay pinned.
  const explore = location === '/explore';
  const profileHeaderHidden = useHideOnScroll(!mobileFocus, location, explore ? EXPLORE_SCROLL : undefined);

  // First visit: choose a handle before using the app, then come back here.
  if (profile.data?.needsHandle && location !== '/welcome') {
    return <Redirect to={`/welcome?next=${encodeURIComponent(currentAppPath())}`} replace />;
  }

  const studio = studioSection(location);
  const title = allItems.find(item => isActive(location, item.href))?.label
    ?? ({ '/settings': 'Profile & settings', '/new': 'New post', '/search': 'Search', '/saved': 'Saved posts', '/notifications': 'Notifications' } as Record<string, string>)[location]
    ?? (location.startsWith('/posts/') ? 'Post' : location.startsWith('/@')
      ? (profile.data?.handle && location.toLowerCase() === `/@${profile.data.handle.toLowerCase()}` ? 'My profile' : 'Profile')
      : 'Seams Club');
  return (
    <ChromeContext.Provider value={{ hidden: profileHeaderHidden, shell: 'app' }}>
    <div className={`${mobileFocus ? 'min-h-[100dvh] pb-0' : 'min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))]'} md:flex md:items-start md:gap-[18px] md:p-[18px] md:pb-[18px]`}>
      <aside aria-label="Main menu" className={`sticky top-[18px] hidden h-[calc(100dvh-36px)] shrink-0 overflow-y-auto rounded-[30px] bg-yellow py-5 md:block ${collapsed ? 'w-[84px] px-3' : 'w-[260px] px-4'}`}>
        <SidebarNav location={location} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      <div className="min-w-0 flex-1">
        {studio && <StudioMobileHeader key={studio.href} section={studio} />}
        {!mobileFocus && !studio && <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-top))] md:hidden" />}
        <header className={mobileFocus
          ? 'relative z-30 hidden items-center gap-2 rounded-[24px] bg-white py-1.5 pl-3 pr-2 shadow-float md:flex md:relative md:z-40 md:mx-0 md:mt-0 md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3'
          : studio
            ? 'hidden items-center gap-2 rounded-[24px] bg-white py-1.5 pl-3 pr-2 shadow-float md:flex md:relative md:z-40 md:mx-0 md:mt-0 md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3'
            : `fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 bg-white px-4 pb-2 pt-[env(safe-area-inset-top)] shadow-float transition-transform ease-out motion-reduce:transition-none ${explore ? 'duration-[280ms]' : 'duration-200'} ${profileHeaderHidden ? '-translate-y-full' : 'translate-y-0'} md:z-40 md:mx-0 md:mt-0 md:h-auto md:gap-3 md:rounded-[30px] md:py-2.5 md:pl-[22px] md:pr-3 ${explore
                ? `md:sticky md:top-[18px] ${profileHeaderHidden ? 'md:-translate-y-[calc(100%+18px)]' : 'md:translate-y-0'}`
                : 'md:relative md:transition-none md:translate-y-0'}`}>
          {location === '/feed'
            ? <div className="min-w-0 flex-1 md:hidden"><Logo href="/feed" /></div>
            : <h1 className={`min-w-0 flex-1 truncate font-display text-[20px] tracking-[-.04em] md:text-[22px] ${title === 'Home' ? 'font-bold' : ''}`}>{title}</h1>}
          <h1 className={location === '/feed' ? `sr-only md:not-sr-only md:min-w-0 md:flex-1 md:truncate md:font-display md:text-[22px] md:tracking-[-.04em] ${title === 'Home' ? 'md:font-bold' : ''}` : 'hidden'}>{title}</h1>
          {inCommunity(location) && <Link href="/search" aria-label="Search" className="grid h-10 w-10 shrink-0 place-items-center rounded-full md:hidden"><Search size={19} aria-hidden="true" /></Link>}
          <NotificationBellMobile className="-mx-0.5" />
          <AccountMenuMobile />
          {location !== '/new' && <Link href="/new" className="hidden min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white no-underline md:inline-flex"><Plus size={16} aria-hidden="true" />New post</Link>}
          <NotificationBellDesktop />
          <AccountMenuDesktop />
        </header>
        <main className={`${location === '/new' ? 'mx-auto w-full max-w-7xl px-0 py-0 md:px-2 md:py-8' : location.startsWith('/posts/') ? 'mx-auto flex h-[100dvh] min-h-0 w-full max-w-7xl flex-col overflow-hidden px-3 py-0 md:block md:h-auto md:overflow-visible md:px-2 md:py-8' : compactToolbarPages.has(location) ? 'mx-auto w-full max-w-7xl px-4 pb-6 pt-4 md:px-2 md:pb-8 md:pt-6' : 'mx-auto w-full max-w-7xl px-4 py-6 md:px-2 md:py-8'}`}>{children}</main>
      </div>
      {!mobileFocus && <MobileTabBar location={location} full={Boolean(studio)} hidden={explore && profileHeaderHidden} />}
    </div>
    </ChromeContext.Provider>
  );
}

/**
 * Layout for pages anyone can open (explore, posts): the app shell when signed
 * in, the public header when signed out.
 */
export function AdaptiveLayout({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useShellLocation();
  const postDetail = location.startsWith('/posts/');
  const compactToolbarPage = compactToolbarPages.has(location);
  const publicHidden = useHideOnScroll(!(isLoaded && isSignedIn), location, location === '/explore' ? EXPLORE_SCROLL : undefined);
  if (isLoaded && isSignedIn) return <ShellFrame>{children}</ShellFrame>;
  return (
    <ChromeContext.Provider value={{ hidden: publicHidden, shell: 'public' }}>
    <div className={`${postDetail ? 'h-[100dvh] overflow-hidden pb-0' : 'min-h-[100dvh] pb-14'}`}>
      <div className={postDetail ? 'hidden md:block' : ''}><PublicHeader hidden={publicHidden} /></div>
      <main className={postDetail ? 'mx-auto h-[100dvh] max-w-[1232px] px-3 pt-0 md:h-auto md:px-4 md:pt-7' : `mx-auto max-w-[1232px] px-4 ${compactToolbarPage ? 'pt-4 md:pt-6' : 'pt-7'}`}>{children}</main>
    </div>
    </ChromeContext.Provider>
  );
}

/** Layout for signed-in pages: private, with the studio sidebar and tab bar. */
export function Shell({ children }: { children: ReactNode }) {
  return <RequireSignIn><ShellFrame>{children}</ShellFrame></RequireSignIn>;
}
