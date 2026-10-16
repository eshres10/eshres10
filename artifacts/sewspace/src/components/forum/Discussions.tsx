import { useGetForumDiscussions } from '@workspace/api-client-react';
import { MessagesSquare } from 'lucide-react';
import { Link } from 'wouter';
import { KindBadge } from '@/components/forum/parts';

/** Forum topics about a pattern/product page or a make ("Discussions"). Hidden when there are none. */
export function Discussions({ catalogId, makeId }: { catalogId?: number; makeId?: number }) {
  const topics = useGetForumDiscussions(catalogId ? { catalogId } : { makeId });
  if (!topics.data?.length) return null;
  return (
    <section aria-labelledby="discussions-title" className="rounded-[30px] bg-white p-6">
      <h2 id="discussions-title" className="eyebrow inline-flex items-center gap-1.5"><MessagesSquare size={14} aria-hidden="true" />Discussions</h2>
      <ul className="mt-3 divide-y divide-line">
        {topics.data.map(t => (
          <li key={t.id} className="py-3">
            <div className="flex flex-wrap items-center gap-1.5"><KindBadge kind={t.kind} />{t.solved && <span className="text-xs font-bold">Solved</span>}</div>
            <Link href={`/forum/topics/${t.id}`} className="mt-1 block font-semibold text-ink no-underline hover:underline">{t.title}</Link>
            <p className="text-xs text-subtle">@{t.author.handle} · {t.replies} {t.replies === 1 ? 'reply' : 'replies'}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
