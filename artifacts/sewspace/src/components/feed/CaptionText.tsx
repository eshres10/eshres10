import { Fragment } from 'react';
import { Link } from 'wouter';
import { splitCaption } from '@/lib/hashtags';

/**
 * Caption text with hashtags. Linked to /tags/:tag by default; inside
 * something that is already a link (grid tiles), they're only coloured.
 */
export function CaptionText({ text, linked = true }: { text: string; linked?: boolean }) {
  return (
    <>
      {splitCaption(text).map((part, i) => typeof part === 'string'
        ? <Fragment key={i}>{part}</Fragment>
        : linked
          ? <Link key={i} href={`/tags/${part.tag}`} className="font-semibold text-blue-ink no-underline hover:underline">{part.text}</Link>
          : <span key={i} className="font-semibold text-blue-ink">{part.text}</span>)}
    </>
  );
}
