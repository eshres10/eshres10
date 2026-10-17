import { Link } from 'wouter';
import { PublicHeader } from '@/components/shell/PublicHeader';

/** 404 page. `embedded` renders just the card, for use inside an existing layout. */
export default function NotFound({ embedded = false }: { embedded?: boolean }) {
  const card = (
        <section className="w-full max-w-md rounded-[40px] bg-white p-8 text-center">
          <p className="eyebrow">404</p>
          <h1 className="mt-2 font-display text-[32px] leading-tight">This page isn't here</h1>
          <p className="mt-3 text-[15px] text-subtle">It may have moved, or it isn't shared publicly.</p>
          <Link href="/" className="btn btn-primary mt-6 no-underline">Go to Seams Club</Link>
        </section>
  );
  if (embedded) return <div className="grid place-items-center py-10">{card}</div>;
  return (
    <div className="min-h-[100dvh]">
      <PublicHeader />
      <main className="mx-auto grid max-w-[1232px] place-items-center px-4 py-20">{card}</main>
    </div>
  );
}
