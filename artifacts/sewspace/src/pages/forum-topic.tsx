import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetForumRepliesQueryKey,
  getGetForumTopicQueryKey,
  useCreateForumReply,
  useDeleteForumReply,
  useDeleteForumTopic,
  useGetForumReplies,
  useGetForumTopic,
  useListCatalog,
  useModerateForumTopic,
  useSetAcceptedAnswer,
  type ForumReply,
  type ForumReplyChild,
  type ForumTopic,
} from '@workspace/api-client-react';
import { Check, Loader2, Lock, Pin, Scissors, Share2, Trash2, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { Loading } from '@/components/common';
import { PostCard } from '@/components/feed/PostCard';
import { shareLink } from '@/components/feed/PostActions';
import { BOARDS, errorText, KindBadge, KINDS, Poll, StateBadges, Upvote } from '@/components/forum/parts';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { timeAgo } from '@/lib/time';
import NotFound from '@/pages/not-found';

function ReplyRow({ reply, topic, onReply, child = false }: { reply: ForumReplyChild & { accepted?: boolean }; topic: ForumTopic; onReply?: () => void; child?: boolean }) {
  const client = useQueryClient();
  const remove = useDeleteForumReply();
  const accept = useSetAcceptedAnswer();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => {
    client.invalidateQueries({ queryKey: getGetForumRepliesQueryKey(topic.id) });
    client.invalidateQueries({ queryKey: getGetForumTopicQueryKey(topic.id) });
  };
  const canAccept = topic.isMine && topic.kind === 'question' && !child && !reply.isMine;
  return (
    <div id={`reply-${reply.id}`} className="scroll-mt-28">
      {reply.accepted && <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-yellow px-2.5 py-0.5 text-xs font-bold"><Check size={12} aria-hidden="true" />Accepted by @{topic.author.handle} · it worked</p>}
      <div className="flex gap-3">
        <Link href={`/@${reply.author.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={reply.author.name} avatarUrl={reply.author.avatarUrl} size={child ? 30 : 38} /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm"><Link href={`/@${reply.author.handle}`} className="font-bold text-ink no-underline">@{reply.author.handle}</Link> <span className="text-subtle">· {timeAgo(reply.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed">{reply.body}</p>
          {reply.catalog && (
            <Link href={`/catalog/${reply.catalog.kind}/${reply.catalog.slug}`} className="mt-2 inline-flex min-h-[36px] items-center rounded-full bg-canvas px-3 text-xs font-bold text-ink no-underline">Recommends: {reply.catalog.name}</Link>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Upvote kind="reply" id={reply.id} votes={reply.votes} voted={reply.votedByMe} own={reply.isMine} />
            {onReply && !topic.locked && <button type="button" onClick={onReply} className="min-h-[40px] px-2 font-bold">Reply</button>}
            {canAccept && (
              <button type="button" disabled={accept.isPending} onClick={() => accept.mutate({ id: topic.id, data: { replyId: reply.accepted ? null : reply.id } }, { onSuccess: refresh })}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-line px-3 font-bold">
                <Check size={13} aria-hidden="true" />{reply.accepted ? 'Unmark answer' : 'This worked'}
              </button>
            )}
            {reply.isMine && (confirming
              ? <span className="inline-flex items-center gap-1" role="group" aria-label="Delete this reply?">
                  <button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ id: reply.id }, { onSuccess: refresh })} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-red px-3 font-bold text-white">{remove.isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Delete reply</button>
                  <button type="button" onClick={() => setConfirming(false)} className="min-h-[40px] rounded-full border border-line px-3 font-bold">Keep</button>
                </span>
              : <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-[40px] items-center gap-1 px-2 font-bold text-subtle"><Trash2 size={13} aria-hidden="true" />Delete</button>)}
          </div>
        </div>
        {!reply.isMine && <SafetyMenu kind="forum_reply" targetId={String(reply.id)} what="reply" authorHandle={reply.author.handle} label={`Options for reply by @${reply.author.handle}`} size={40} />}
      </div>
    </div>
  );
}

function ReplyComposer({ topic, replyTo, clearReplyTo, inputRef }: { topic: ForumTopic; replyTo: { id: number; handle: string } | null; clearReplyTo: () => void; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const create = useCreateForumReply();
  const [body, setBody] = useState('');
  const [recommend, setRecommend] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const results = useListCatalog({ kind: 'product', q: search.trim() || undefined }, { query: { enabled: topic.kind === 'recommendation' && search.trim().length > 1 } });
  const patternResults = useListCatalog({ kind: 'pattern', q: search.trim() || undefined }, { query: { enabled: topic.kind === 'recommendation' && search.trim().length > 1 } });
  if (topic.locked) return <p className="flex items-center gap-2 rounded-[20px] bg-canvas p-4 text-sm font-semibold"><Lock size={16} aria-hidden="true" />This topic is locked. No new replies.</p>;
  if (!isSignedIn) {
    return (
      <div className="rounded-[24px] bg-canvas p-5 text-center">
        <p className="font-display text-lg">Know a better way?</p>
        <p className="mt-1 text-sm text-subtle">Sign in to answer. We'll bring you straight back to this thread.</p>
        <button type="button" className="btn btn-primary mt-3" onClick={() => ask({ title: 'Sign in to answer', body: "We'll bring you straight back to this thread." })}>Write an answer</button>
      </div>
    );
  }
  const options = [...(patternResults.data?.items ?? []), ...(results.data?.items ?? [])].slice(0, 8);
  return (
    <form onSubmit={e => {
      e.preventDefault();
      create.mutate({ id: topic.id, data: { body, parentId: replyTo?.id ?? null, catalogId: recommend?.id ?? null } }, {
        onSuccess: () => {
          setBody(''); setRecommend(null); setSearch(''); clearReplyTo();
          client.invalidateQueries({ queryKey: getGetForumRepliesQueryKey(topic.id) });
          client.invalidateQueries({ queryKey: getGetForumTopicQueryKey(topic.id) });
        },
      });
    }} className="space-y-2">
      {replyTo && <p className="flex items-center gap-2 text-xs font-semibold text-subtle">Replying to @{replyTo.handle}<button type="button" onClick={clearReplyTo} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas"><X size={14} /></button></p>}
      <label className="sr-only" htmlFor="forum-reply">Your {topic.kind === 'question' ? 'answer' : 'reply'}</label>
      <textarea id="forum-reply" ref={inputRef} value={body} onChange={e => setBody(e.target.value.slice(0, 5000))} rows={3} className="field resize-y"
        placeholder={topic.kind === 'question' ? 'What worked for you?' : 'Add to the discussion'} />
      {topic.kind === 'recommendation' && !replyTo && (
        recommend
          ? <p className="flex items-center gap-2 text-sm">Recommending <b>{recommend.name}</b><button type="button" onClick={() => setRecommend(null)} aria-label="Remove recommendation" className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas"><X size={14} /></button></p>
          : <div>
              <input value={search} onChange={e => setSearch(e.target.value)} className="field" placeholder="Recommend a pattern or product page (optional)" aria-label="Recommend a page" />
              {options.length > 0 && (
                <ul className="mt-1 rounded-[16px] border border-line">
                  {options.map(o => <li key={o.id}><button type="button" onClick={() => setRecommend({ id: o.id, name: o.name })} className="block min-h-[44px] w-full px-3 text-left text-sm hover:bg-canvas"><b>{o.name}</b>{o.maker && <span className="text-subtle"> · {o.maker}</span>}</button></li>)}
                </ul>
              )}
            </div>
      )}
      {create.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't post. Try again.")}</p>}
      <div className="flex justify-end"><button type="submit" disabled={!body.trim() || create.isPending} className="btn btn-primary disabled:opacity-50">{create.isPending && <Loader2 size={15} className="animate-spin" />}Post {topic.kind === 'question' ? 'answer' : 'reply'}</button></div>
    </form>
  );
}

function AdminTools({ topic }: { topic: ForumTopic }) {
  const client = useQueryClient();
  const moderate = useModerateForumTopic();
  const act = (data: { pinned?: boolean; locked?: boolean }) => moderate.mutate({ id: topic.id, data }, { onSuccess: () => client.invalidateQueries() });
  return (
    <div className="flex flex-wrap gap-2 rounded-[20px] border border-dashed border-ink p-3 text-sm">
      <span className="font-bold">Admin:</span>
      <button type="button" onClick={() => act({ pinned: !topic.pinned })} className="btn btn-line"><Pin size={14} aria-hidden="true" />{topic.pinned ? 'Unpin' : 'Pin'}</button>
      <button type="button" onClick={() => act({ locked: !topic.locked })} className="btn btn-line"><Lock size={14} aria-hidden="true" />{topic.locked ? 'Unlock' : 'Lock'}</button>
    </div>
  );
}

/** A forum topic at /forum/topics/:id. Works signed out. */
export function ForumTopicPage({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const topic = useGetForumTopic(id, { query: { retry: false, enabled: Number.isFinite(id) } });
  const replies = useGetForumReplies(id, { query: { retry: false, enabled: Number.isFinite(id) } });
  const remove = useDeleteForumTopic();
  const input = useRef<HTMLTextAreaElement>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; handle: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (topic.data) document.title = `${topic.data.title} · Forum · SewSpace`; }, [topic.data]);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (replies.data && hash) document.getElementById(hash)?.scrollIntoView();
  }, [replies.data]);

  if (topic.isLoading) return <Loading />;
  if (!topic.data) return <NotFound embedded />;
  const t = topic.data;
  const list: ForumReply[] = replies.data ?? [];
  const share = async () => { if (await shareLink(window.location.href.split('#')[0], t.title)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  return (
    <div className="mx-auto grid max-w-[1232px] gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-subtle">
          <Link href="/forum" className="text-subtle">Forum</Link><span aria-hidden="true"> / </span>
          <Link href={`/forum?board=${t.board}`} className="text-subtle">{BOARDS[t.board]}</Link><span aria-hidden="true"> / </span>{KINDS[t.kind].label}
        </nav>
        <article className="rounded-[30px] bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-1.5"><KindBadge kind={t.kind} /><StateBadges topic={t} /></div>
          <p className="mt-2 text-sm text-subtle">{t.kind === 'question' ? 'Asked' : 'Posted'} by <Link href={`/@${t.author.handle}`} className="font-bold text-ink">@{t.author.handle}</Link> · {timeAgo(t.createdAt)}</p>
          <h1 className="mt-2 font-display text-[clamp(26px,3.4vw,38px)] leading-[1.08] tracking-[-.04em]">{t.title}</h1>
          {t.body && <p className="mt-3 whitespace-pre-line break-words text-[16px] leading-relaxed">{t.body}</p>}
          {t.photos.length > 0 && (
            <div className={`mt-4 grid gap-2 ${t.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {t.photos.map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[18px]" style={{ backgroundColor: p.color ?? undefined }}>
                  <img src={p.url} alt={p.altText} width={p.width} height={p.height} loading="lazy" className="h-full max-h-[560px] w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {t.poll && <div className="mt-4"><Poll topicId={t.id} poll={t.poll} /></div>}
          {(t.catalog || t.make || t.tags.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {t.catalog && <Link href={`/catalog/${t.catalog.kind}/${t.catalog.slug}`} className="rounded-full bg-canvas px-3 py-1.5 font-semibold text-ink no-underline">{t.catalog.kind === 'pattern' ? 'Pattern' : 'Product'} · {t.catalog.name}</Link>}
              {t.make && <Link href={`/makes/${t.make.id}`} className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 font-semibold text-ink no-underline"><Scissors size={13} aria-hidden="true" />Make · {t.make.name}</Link>}
              {t.tags.map(tag => <Link key={tag} href={`/forum?q=${encodeURIComponent(tag)}`} className="rounded-full px-2 py-1.5 text-subtle">#{tag}</Link>)}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Upvote kind="topic" id={t.id} votes={t.votes} voted={t.votedByMe} own={t.isMine} />
            <button type="button" onClick={share} className="btn btn-line">{copied ? <Check size={15} aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}{copied ? 'Link copied' : 'Share'}</button>
            {t.isMine
              ? confirmDelete
                ? <>
                    <button type="button" onClick={() => remove.mutate({ id: t.id }, { onSuccess: () => setLocation('/forum') })} className="btn bg-red text-white">{remove.isPending && <Loader2 size={15} className="animate-spin" />}Delete topic</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-line">Keep</button>
                  </>
                : <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-line text-red-ink"><Trash2 size={15} aria-hidden="true" />Delete</button>
              : <SafetyMenu kind="topic" targetId={String(t.id)} what="topic" authorHandle={t.author.handle} label="More: report or block" leaveOnBlock="/forum" />}
          </div>
          {t.canModerate && <div className="mt-4"><AdminTools topic={t} /></div>}
        </article>

        {t.post && (t.photos.length
          ? <p className="px-2 text-sm text-subtle">Also shared to the feed: <Link href={`/posts/${t.post.id}`} className="font-bold text-ink">see the post</Link></p>
          : <div className="mx-auto max-w-[620px]"><p className="eyebrow mb-2">Shared to the feed</p><PostCard post={t.post} /></div>)}

        <section id="replies" aria-labelledby="replies-title" className="scroll-mt-28 rounded-[30px] bg-white p-5 sm:p-7">
          <h2 id="replies-title" className="font-display text-[22px] tracking-[-.03em]">
            {list.length ? `${t.replies} ${t.kind === 'question' ? (t.replies === 1 ? 'answer' : 'answers') : (t.replies === 1 ? 'reply' : 'replies')}` : t.kind === 'question' ? 'No answers yet' : 'No replies yet'}
          </h2>
          {list.length > 0 && <p className="text-xs text-subtle">{t.kind === 'question' ? 'Accepted answer first, then most helpful' : 'Most upvoted first'}</p>}
          <ul className="mt-4 space-y-6">
            {list.map(r => (
              <li key={r.id}>
                <ReplyRow reply={r} topic={t} onReply={() => { setReplyTo({ id: r.id, handle: r.author.handle }); input.current?.focus(); }} />
                {r.replies.length > 0 && <ul className="ml-12 mt-4 space-y-4">{r.replies.map(c => <li key={c.id}><ReplyRow reply={c} topic={t} child /></li>)}</ul>}
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-5">
            <ReplyComposer topic={t} replyTo={replyTo} clearReplyTo={() => setReplyTo(null)} inputRef={input} />
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        {t.catalog && (
          <section className="rounded-[30px] bg-white p-5">
            <h2 className="eyebrow">{t.catalog.kind === 'pattern' ? 'Pattern in this thread' : 'Product in this thread'}</h2>
            <Link href={`/catalog/${t.catalog.kind}/${t.catalog.slug}`} className="mt-2 block font-display text-xl text-ink no-underline hover:underline">{t.catalog.name}</Link>
            <p className="mt-1 text-sm text-subtle">See reviews, sizing notes and makes.</p>
          </section>
        )}
        <section className="rounded-[30px] bg-white p-5">
          <h2 className="eyebrow">Be kind</h2>
          <p className="mt-2 text-sm text-subtle">Answer the question asked, credit patterns and tutorials, and use Report for anything that breaks the rules.</p>
        </section>
      </aside>
    </div>
  );
}
