import { MAKE_ART } from '@/components/onboarding/copy';

/** A garment line drawing on a tone (stands in for photos: mockup photos are never used). Decorative. */
export function Garment({ name, tone, className = '' }: { name: string; tone: string; className?: string }) {
  return (
    <span className={`grid place-items-center ${tone} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-[45%] w-[45%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={MAKE_ART[name] ?? MAKE_ART.Tops} /></svg>
    </span>
  );
}
