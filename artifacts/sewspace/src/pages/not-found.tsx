import { Link } from 'wouter';
import { PublicHeader } from '@/components/shell/PublicHeader';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh]">
      <PublicHeader />
      <main className="mx-auto grid max-w-[1232px] place-items-center px-4 py-20">
        <section className="w-full max-w-md rounded-[40px] bg-white p-8 text-center">
          <p className="eyebrow">404</p>
          <h1 className="mt-2 font-display text-[32px] leading-tight">This page isn't here</h1>
          <p className="mt-3 text-[15px] text-subtle">It may have moved, or it isn't shared publicly.</p>
          <Link href="/" className="btn btn-primary mt-6 no-underline">Go to SewSpace</Link>
        </section>
      </main>
    </div>
  );
}
