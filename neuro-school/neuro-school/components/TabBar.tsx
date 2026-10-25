import Link from 'next/link';
import { CapIcon, CardsIcon, SunIcon, UserIcon } from './Icons';

const tabs = [
  { id: 'today', label: 'Today', href: '/', Icon: SunIcon },
  { id: 'school', label: 'School', href: '/', Icon: CapIcon },
  { id: 'review', label: 'Review', href: '/lesson/14?review=1', Icon: CardsIcon },
  { id: 'you', label: 'You', href: '/', Icon: UserIcon },
];

export function TabBar({ active }: { active: string }) {
  return (
    <nav
      aria-label="Main"
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 12px max(28px, env(safe-area-inset-bottom))',
        background: '#fff',
        borderTop: '1px solid var(--line)',
      }}
    >
      {tabs.map(({ id, label, href, Icon }) => {
        const on = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={on ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              minWidth: 64,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: on ? 700 : 400,
              color: on ? 'var(--ink)' : 'var(--faint)',
              textDecoration: 'none',
            }}
          >
            <Icon size={22} strokeWidth={on ? 2.2 : 2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
