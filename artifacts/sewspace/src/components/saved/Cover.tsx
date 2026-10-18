import type { SavedItem } from '@workspace/api-client-react';
import { cardColorClass } from '@/lib/card-colors';

/**
 * One cell of a cover: the photo, or the words on a coloured tile (a words
 * post in its card colour, a thread or anything without a photo on soft
 * yellow), in small Poppins.
 */
export function CoverCell({ item }: { item: SavedItem | undefined }) {
  if (!item) return <span className="block bg-line" />;
  if (item.imageUrl) {
    return <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" style={{ backgroundColor: item.color ?? undefined }} />;
  }
  const tone = item.cardColor ? cardColorClass(item.cardColor) : 'bg-yellow/40 text-ink';
  return (
    <span className={`block h-full overflow-hidden p-2 ${tone}`}>
      <span className="line-clamp-4 font-display text-[11px] leading-tight tracking-[-.02em]">{item.title}</span>
    </span>
  );
}

/** A square, rounded 2×2 cover from the 4 most recent saves (2 px gaps), grey where there's nothing. */
export function SavedCover({ items }: { items: SavedItem[] }) {
  return (
    <span aria-hidden="true" className="grid aspect-square grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[20px] bg-white">
      {[0, 1, 2, 3].map(i => <CoverCell key={i} item={items[i]} />)}
    </span>
  );
}
