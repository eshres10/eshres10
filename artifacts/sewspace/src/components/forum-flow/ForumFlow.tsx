import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createForumTopic,
  useGetProfile,
  useListCatalog,
  useListProjects,
  useListSimilarQuestions,
  type ForumBoard,
  type ForumKind,
  type ForumTopic,
  type ForumTopicSummary,
  type Media,
} from '@workspace/api-client-react';
import { BookOpen, Check, ChevronRight, ImagePlus, Plus, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  DraftNotice,
  FieldCard,
  FlowShell,
  Segmented,
  UploadTile,
  draftLabel,
  fieldProps,
  groupProps,
  useDraft,
  useFlowStep,
  useLeaveGuard,
  useUploads,
  useValidation,
} from '@/components/flow';
import { BOARDS, errorText, KINDS, TopicCard } from '@/components/forum/parts';
import { Switch } from '@/components/post-flow/parts';
import { processPhoto } from '@/lib/photos';
import { BOARD_ORDER, BOARD_SHORT, FLOW_KINDS, KIND_ORDER, normaliseTag, suggestBoard, suggestTags } from './copy';

const STEPS = ['type', 'write', 'where', 'preview'] as const;
type Step = (typeof STEPS)[number];
const LABELS: Record<Step, string> = { type: 'Type', write: 'Write', where: 'Where', preview: 'Preview' };
const MAX_PHOTOS = 10;
const LENGTHS = [{ value: '1', label: '1 day' }, { value: '3', label: '3 days' }, { value: '7', label: '1 week' }] as const;

type Page = { id: number; name: string; kind: 'pattern' | 'product'; maker: string };
interface TopicDraft extends Record<string, unknown> {
  kind: ForumKind | null;
  title: string;
  body: string;
  options: string[];
  pollDays: 1 | 3 | 7;
  photos: Media[];
  shareToFeed: boolean;
  board: ForumBoard | null;
  tags: string[];
  page: Page | null;
  makeId: number | null;
  reached: number;
}

/** Link a shared pattern/product page: a suggestion from the title, or search. */
function PageLink({ value, onChange, title }: { value: Page | null; onChange: (v: Page | null) => void; title: string }) {
  // `title` is the title and body: a page named in either is suggested.
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'pattern' | 'product'>('pattern');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const search = useListCatalog({ kind, q: debounced.trim() || undefined }, { query: { enabled: debounced.trim().length > 1 } });
  // A suggestion: the pattern page whose name appears in the title.
  const words = title.toLowerCase();
  const all = useListCatalog({ kind: 'pattern' }, { query: { enabled: !value && title.trim().length >= 3, staleTime: 60_000 } });
  const suggested = all.data?.items.find(e => e.name.length >= 3 && words.includes(e.name.toLowerCase()));
  const card = (e: { id: number; name: string; kind: 'pattern' | 'product'; maker: string; stats?: { reviews: number } }, linked: boolean) => (
    <div className={`flex items-center gap-3 rounded-[20px] border-2 p-2.5 ${linked ? 'border-ink bg-yellow/15' : 'border-line'}`}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-canvas" aria-hidden="true"><BookOpen size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{e.name}</span><span className="block truncate text-sm text-subtle">{e.kind === 'pattern' ? 'Pattern page' : 'Product page'}{e.maker ? ` · ${e.maker}` : ''}{e.stats ? ` · ${e.stats.reviews} review${e.stats.reviews === 1 ? '' : 's'}` : ''}</span></span>
      <button type="button" aria-pressed={linked} onClick={() => onChange(linked ? null : { id: e.id, name: e.name, kind: e.kind, maker: e.maker })}
        className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-bold ${linked ? 'bg-ink text-white' : 'border-2 border-ink'}`}>{linked ? 'Linked' : 'Link'}</button>
    </div>
  );
  if (value) return card(value, true);
  return (
    <div className="space-y-2">
      {suggested && card(suggested, false)}
      <Segmented<'pattern' | 'product'> aria-label="Page kind" className="bg-canvas" options={[{ value: 'pattern', label: 'Patterns' }, { value: 'product', label: 'Products' }]} value={kind} onChange={setKind} />
      <input value={q} onChange={e => setQ(e.target.value)} className="field" placeholder={kind === 'pattern' ? 'Search pattern pages' : 'Search fabric, tools and shops'} aria-label="Search pages to link" />
      {search.data && debounced.trim().length > 1 && (
        <ul className="max-h-48 overflow-y-auto rounded-[16px] border border-line">
          {search.data.items.slice(0, 8).map(e => (
            <li key={e.id}><button type="button" onClick={() => onChange({ id: e.id, name: e.name, kind: e.kind, maker: e.maker })} className="block min-h-[44px] w-full px-3 text-left text-sm hover:bg-canvas"><b>{e.name}</b>{e.maker && <span className="text-subtle"> · {e.maker}</span>}</button></li>
          ))}
          {!search.data.items.length && <li className="px-3 py-2 text-sm text-subtle">No pages match. You can add one from Patterns &amp; supplies.</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Start a forum discussion (/forum/new, ?board= and ?kind= preselect):
 * Type → Write → Where → Preview, then Done. Forum posts are public.
 */
export function ForumFlow({ initialKind = null, initialBoard = null, onRestart }: { initialKind?: ForumKind | null; initialBoard?: ForumBoard | null; onRestart?: () => void }) {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const me = useGetProfile();
  const projects = useListProjects();
  const [kind, setKind] = useState<ForumKind | null>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [pollDays, setPollDays] = useState<1 | 3 | 7>(3);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [board, setBoard] = useState<ForumBoard | null>(initialBoard);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [makeId, setMakeId] = useState<number | null>(null);
  const [reached, setReached] = useState(initialKind ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<ForumTopic | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const photos = useUploads<Media>((file, opts) => processPhoto(file, opts), { max: MAX_PHOTOS });
  const doneMedia = photos.items.filter(i => i.status === 'done' && i.result).map(i => i.result!);

  // Draft: one per person for this flow. Applied once, before autosave starts.
  const payload: TopicDraft = { kind, title, body, options, pollDays, photos: doneMedia, shareToFeed, board, tags, page, makeId, reached };
  const dirty = Boolean(title.trim() || body.trim() || options.some(o => o.trim()) || photos.items.length || tags.length || page || makeId);
  const [hydrated, setHydrated] = useState(false);
  const [applied, setApplied] = useState(false);
  const draft = useDraft('topic', payload, { enabled: true, active: hydrated && dirty && !done });
  if (!hydrated && draft.loaded !== undefined) {
    const d = draft.loaded?.payload as TopicDraft | undefined;
    if (d && (!initialKind || d.kind === initialKind)) {
      setKind(d.kind ?? initialKind);
      setTitle(String(d.title ?? ''));
      setBody(String(d.body ?? ''));
      setOptions(Array.isArray(d.options) && d.options.length >= 2 ? d.options.slice(0, 6) : ['', '']);
      setPollDays(d.pollDays ?? 3);
      setShareToFeed(d.shareToFeed !== false);
      setBoard(initialBoard ?? d.board ?? null);
      setTags(Array.isArray(d.tags) ? d.tags.slice(0, 5) : []);
      setPage(d.page ?? null);
      setMakeId(d.makeId ?? null);
      setReached(Math.min(d.reached ?? 0, STEPS.length - 1));
      setApplied(true);
      if (Array.isArray(d.photos) && d.photos.length) photos.seed(d.photos.map(m => ({ key: `m${m.id}`, preview: m.thumbUrl, result: m })));
    }
    setHydrated(true);
  }

  const canOpen = (s: Step) => STEPS.indexOf(s) <= reached;
  const flow = useFlowStep(STEPS, { initial: initialKind ? 'write' : 'type', canOpen });
  const step = flow.step;
  const k = kind ? FLOW_KINDS[kind] : null;
  const leave = useLeaveGuard({ dirty: dirty && !done, onLeave: () => setLocation('/forum'), draft: { save: draft.save, discard: () => draft.discard() }, where: 'New discussion' });

  // Suggested board from the type and title words; preselected on reaching Where.
  const suggested = suggestBoard(kind, `${title} ${body}`);
  const filled = options.map(o => o.trim()).filter(Boolean);
  const errors = step === 'write'
    ? {
        photos: kind === 'show_tell' && !photos.items.length && 'Add at least one photo.',
        title: title.trim().length < 3 && 'Add a title of at least 3 characters.',
        options: kind === 'poll' && (filled.length < 2 ? 'Fill in at least 2 options.' : new Set(filled.map(o => o.toLowerCase())).size !== filled.length && 'Each option needs to be different.'),
      }
    : step === 'where'
      ? { board: !board && 'Pick a board.' }
      : {};
  const v = useValidation(errors);
  useEffect(() => { v.reset(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Already asked?": questions with 3+ words, 300 ms after typing stops.
  const [similarQ, setSimilarQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setSimilarQ(title.trim()), 300); return () => clearTimeout(t); }, [title]);
  const wordCount = similarQ.split(/\s+/).filter(Boolean).length;
  const similar = useListSimilarQuestions({ q: similarQ }, { query: { enabled: kind === 'question' && wordCount >= 3 && step === 'write', staleTime: 30_000 } });

  const pickKind = (next: ForumKind) => {
    setKind(next);
    setReached(r => Math.max(r, 1));
    flow.go('write');
  };
  const goTo = (next: Step) => {
    if (next === 'where' && !board) setBoard(suggested);
    setReached(r => Math.max(r, STEPS.indexOf(next)));
    flow.go(next);
  };

  async function submit() {
    if (!kind || !board) return;
    setBusy(true);
    setSubmitError(null);
    const items = kind === 'show_tell' ? await photos.waitAll() : [];
    if (items.some(i => i.status === 'error')) {
      setBusy(false);
      setSubmitError("A photo didn't upload. Retry it or remove it.");
      return;
    }
    try {
      const topic = await createForumTopic({
        kind, board, title: title.trim(), body: body.trim(), tags,
        catalogId: page?.id ?? null, makeId,
        ...(kind === 'poll' ? { pollOptions: filled, pollDays } : {}),
        ...(kind === 'show_tell' ? { shareToFeed, mediaIds: items.map(i => i.result!.id) } : {}),
      });
      await draft.clear();
      client.invalidateQueries();
      setDone(topic);
    } catch (e) {
      setSubmitError(errorText(e, "That didn't post. Try again."));
    } finally {
      setBusy(false);
    }
  }
  const goNext = () => v.attempt(() => {
    if (step === 'preview') { void submit(); return; }
    goTo(STEPS[STEPS.indexOf(step) + 1]);
  });

  const addTag = (raw: string) => {
    const t = normaliseTag(raw);
    setTagDraft('');
    if (!t || tags.length >= 5 || tags.includes(t)) return;
    setTags(c => [...c, t]);
  };
  const tagIdeas = suggestTags(`${title} ${body}`, page?.name, board).filter(t => !tags.includes(t)).slice(0, 4);

  // The topic card as it will appear.
  const summary: ForumTopicSummary = useMemo(() => ({
    id: 0, board: board ?? suggested, kind: kind ?? 'question', title: title.trim() || 'Untitled', excerpt: body.trim().replace(/\s+/g, ' ').slice(0, 220), tags,
    author: { handle: me.data?.handle ?? 'you', name: me.data?.name ?? '', avatarUrl: me.data?.avatarUrl ?? null },
    createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), votes: 0, replies: 0, votedByMe: false,
    solved: false, pinned: false, locked: false, acceptedAnswer: null, topRecommendations: [],
    poll: kind === 'poll' ? { closesAt: new Date(Date.now() + pollDays * 86400_000).toISOString(), open: true, total: 0, revealed: false, myOptionId: null, options: filled.map((label, i) => ({ id: i, label, votes: null })) } : null,
    photos: kind === 'show_tell' ? photos.items.map((i, n) => i.result ?? { id: -n - 1, url: i.preview, thumbUrl: i.preview, width: 800, height: 1000, color: null, altText: '' }) : [],
  }), [board, suggested, kind, title, body, tags, me.data, pollDays, filled.join('\u0000'), photos.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewCard = (
    <div className="space-y-3">
      <TopicCard topic={summary} preview />
      {page && <p className="px-1 text-sm"><span className="rounded-full bg-yellow px-3 py-1 font-bold">{page.name}</span></p>}
      <p className="px-1 text-sm text-subtle">Forum posts are public, like Reddit. Anyone can read them; people need an account to reply.</p>
    </div>
  );

  // ---- Done
  if (done) {
    return (
      <FlowShell title="Posted" steps={[]} current="" canOpen={() => false} onStep={() => undefined} onClose={() => setLocation(`/forum/topics/${done.id}`)} narrow>
        <div className="space-y-3 pt-6 lg:pt-0">
          <div className="rounded-[34px] bg-yellow px-6 py-9 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-yellow" aria-hidden="true"><Check size={28} strokeWidth={3} /></span>
            <h2 className="mt-4 font-display text-[34px] leading-tight tracking-[-.05em]" data-autofocus tabIndex={-1}>Posted in {BOARD_SHORT[done.board]}</h2>
            <p className="mt-2 text-[15px]">{done.kind === 'question' ? "We'll let you know when someone answers. Mark the answer that worked." : "We'll let you know about replies."}</p>
            {done.post && <p className="mt-1 text-[15px]">It's on your feed too.</p>}
          </div>
          <button type="button" onClick={() => setLocation(`/forum/topics/${done.id}`)} className="flex min-h-[56px] w-full items-center justify-center rounded-full bg-ink text-lg font-bold text-white">View your thread</button>
          <button type="button" onClick={() => { setLocation('/forum/new', { replace: true }); onRestart?.(); }} className="flex min-h-[56px] w-full items-center justify-center rounded-full border-2 border-ink text-lg font-bold">Start another</button>
        </div>
      </FlowShell>
    );
  }

  // ---- Type
  const typeStep = (
    <div className="space-y-2.5">
      <h2 className="px-1 pb-1 font-display text-[34px] leading-tight tracking-[-.05em]">What kind of post?</h2>
      {KIND_ORDER.map(id => {
        const K = FLOW_KINDS[id], Icon = KINDS[id].icon;
        return (
          <button key={id} type="button" onClick={() => pickKind(id)} aria-pressed={kind === id}
            className={`flex min-h-[84px] w-full items-center gap-4 rounded-[30px] p-4 text-left lg:min-h-[64px] ${K.card}`}>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] ${K.iconWrap}`} aria-hidden="true"><Icon size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block font-display text-[19px] tracking-[-.03em]">{K.label}</span><span className="block text-sm opacity-85">{K.note}</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  // ---- Write
  const writeStep = k && (
    <div className="space-y-3">
      {kind === 'show_tell' && (
        <FieldCard name="photos" label="Photos" error={v.error('photos')} aside={`${photos.items.length} of ${MAX_PHOTOS}`} group>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" {...groupProps('photos', v.error('photos'))}>
            {photos.items.map((item, i) => (
              <UploadTile key={item.key} item={item} label={`photo ${i + 1}`} className="h-[105px] w-[84px]" onRemove={() => photos.remove(item.key)} onRetry={() => photos.retry(item.key)} />
            ))}
            {photos.items.length < MAX_PHOTOS && (
              <label className="grid h-[105px] w-[84px] shrink-0 cursor-pointer place-items-center rounded-[16px] border-2 border-dashed border-subtle/40 bg-canvas">
                <ImagePlus size={22} aria-hidden="true" /><span className="sr-only">Add photos</span>
                <input id="forum-photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only"
                  onChange={e => { setUploadNote(e.target.files ? photos.add(Array.from(e.target.files)) : null); e.target.value = ''; }} />
              </label>
            )}
          </div>
          {uploadNote && <p className="mt-1 text-sm text-subtle">{uploadNote}</p>}
          <p className="mt-1 text-sm text-subtle">Resized on your phone; location data removed.</p>
        </FieldCard>
      )}
      <FieldCard name="title" label={k.titleLabel} error={v.error('title')} aside={`${title.length} / 140`}>
        <textarea {...fieldProps('title', v.error('title'))} value={title} rows={1} placeholder={k.titlePh} autoComplete="off"
          onChange={e => setTitle(e.target.value.replace(/\s*\n\s*/g, ' ').slice(0, 140))} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
          className="w-full resize-none bg-transparent font-display text-[20px] leading-snug tracking-[-.03em] outline-none [field-sizing:content] placeholder:text-subtle/60" />
      </FieldCard>
      {kind === 'question' && similar.data && similar.data.length > 0 && wordCount >= 3 && (
        <section aria-labelledby="similar-title" className="rounded-[30px] bg-ink p-4 text-white">
          <h2 id="similar-title" className="font-bold">Already asked? These might help</h2>
          <ul className="mt-2 space-y-1">
            {similar.data.map(t => (
              <li key={t.id}>
                <Link href={`/forum/topics/${t.id}`} className="flex min-h-[44px] items-center gap-2.5 rounded-[14px] px-1 text-white no-underline hover:bg-white/10">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.solved ? 'bg-yellow text-ink' : 'bg-white text-ink'}`}>{t.solved ? 'Solved' : 'Open'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className="shrink-0 text-xs text-white/70" aria-label={`${t.replies} answers`}>{t.replies}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {kind === 'poll' && (
        <FieldCard name="options" label="Options" error={v.error('options')} aside={`${options.length} of 6`} group>
          <div className="space-y-2" role="group" {...groupProps('options', v.error('options'))}>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={o} onChange={e => setOptions(c => c.map((x, j) => (j === i ? e.target.value.slice(0, 80) : x)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className="field flex-1" />
                <button type="button" onClick={() => setOptions(c => c.filter((_, j) => j !== i))} disabled={options.length <= 2} aria-label={`Remove option ${i + 1}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas disabled:opacity-35"><X size={15} aria-hidden="true" /></button>
              </div>
            ))}
            {options.length < 6 && <button type="button" onClick={() => setOptions(c => [...c, ''])} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-dashed border-ink px-4 text-sm font-bold"><Plus size={15} aria-hidden="true" />Add option</button>}
          </div>
          <p id="poll-length-label" className="mt-4 text-sm font-semibold text-subtle">Poll closes after</p>
          <Segmented aria-labelledby="poll-length-label" className="mt-1.5 bg-canvas" options={LENGTHS} value={String(pollDays) as '1' | '3' | '7'} onChange={d => setPollDays(Number(d) as 1 | 3 | 7)} />
          <p className="mt-2 text-sm text-subtle">People see results after they vote.</p>
        </FieldCard>
      )}
      <FieldCard name="body" label={k.bodyLabel} aside="optional">
        <textarea {...fieldProps('body')} value={body} onChange={e => setBody(e.target.value.slice(0, 10000))} rows={kind === 'info' ? 8 : 4} placeholder={k.bodyPh}
          className="w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-subtle/60" />
      </FieldCard>
      {kind === 'show_tell' && (
        <div className="flex items-center gap-3 rounded-[30px] bg-white p-4">
          <div className="min-w-0 flex-1"><p className="font-bold">Also share to my feed</p><p className="text-sm text-subtle">As a public post with the same photos</p></div>
          <Switch checked={shareToFeed} onChange={setShareToFeed} label="Also share to my feed" />
        </div>
      )}
      <p className="px-2 text-sm text-subtle">{k.tip}</p>
    </div>
  );

  // ---- Where
  const whereStep = (
    <div className="space-y-3">
      <FieldCard name="board" label="Board" error={v.error('board')} group>
        <div role="radiogroup" {...groupProps('board', v.error('board'))} className="grid grid-cols-2 gap-2">
          {BOARD_ORDER.map(b => (
            <button key={b} type="button" role="radio" aria-checked={board === b} onClick={() => setBoard(b)} title={BOARDS[b]}
              className={`min-h-[52px] rounded-[16px] border-2 px-3 py-1.5 text-left text-[15px] font-bold ${board === b ? 'border-ink bg-yellow' : 'border-line bg-white hover:border-ink'}`}>
              {BOARD_SHORT[b]}
              {b === suggested && <span className="block text-[11px] font-bold text-blue-ink">Suggested</span>}
            </button>
          ))}
        </div>
      </FieldCard>
      <FieldCard name="tags" label="Tags" aside={`${tags.length} of 5`} group>
        <div>
          {tags.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Tags added">
              {tags.map(t => (
                <li key={t} className="inline-flex items-center gap-1 rounded-full bg-ink py-1 pl-3 pr-1 text-sm font-bold text-white">{t}
                  <button type="button" onClick={() => setTags(c => c.filter(x => x !== t))} aria-label={`Remove tag ${t}`} className="grid h-8 w-8 place-items-center rounded-full bg-white/20"><X size={12} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          {tags.length < 5 ? (
            <>
              <div className="flex gap-2">
                <input value={tagDraft} onChange={e => setTagDraft(e.target.value.slice(0, 30))} aria-label="Add a tag" placeholder="Add a tag and press Enter" className="field flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); } }} />
                <button type="button" onClick={() => addTag(tagDraft)} disabled={!normaliseTag(tagDraft)} className="min-h-[48px] rounded-full bg-ink px-5 font-bold text-white disabled:bg-line disabled:text-subtle">Add</button>
              </div>
              {tagIdeas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested tags">
                  {tagIdeas.map(t => <button key={t} type="button" onClick={() => addTag(t)} className="min-h-[36px] rounded-full bg-canvas px-3 text-sm font-bold">+ {t}</button>)}
                </div>
              )}
            </>
          ) : <p className="text-sm font-semibold text-subtle">That's the limit. Remove one to add another.</p>}
        </div>
      </FieldCard>
      <FieldCard name="page" label="Link a pattern or product" aside="optional" group>
        <PageLink value={page} onChange={setPage} title={`${title} ${body}`} />
        <p className="mt-2 text-sm text-subtle">Linked threads show under "Discussions" on that page.</p>
      </FieldCard>
      {projects.data && projects.data.length > 0 && (
        <FieldCard name="make" label="One of your makes" aside="optional">
          <select {...fieldProps('make')} value={makeId ?? ''} onChange={e => setMakeId(e.target.value ? Number(e.target.value) : null)} className="field">
            <option value="">None</option>
            {projects.data.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="mt-2 text-sm text-subtle">Only shown to people who can see the make.</p>
        </FieldCard>
      )}
    </div>
  );

  // ---- Preview
  const previewStep = (
    <div className="space-y-3">
      {previewCard}
      {kind === 'show_tell' && shareToFeed && <p className="px-1 text-sm text-subtle">It will also appear on your feed as a public post.</p>}
      {submitError && <p role="alert" className="px-2 text-sm font-semibold text-red-ink">{submitError}</p>}
    </div>
  );

  const body_ = { type: typeStep, write: writeStep, where: whereStep, preview: previewStep }[step];
  const badge = kind && step !== 'type' ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${KINDS[kind].badge}`}>{FLOW_KINDS[kind].label}</span> : null;
  return (
    <FlowShell
      title="New discussion"
      subtitle={step === 'type' ? 'Pick a type to start' : draftLabel(draft.status)}
      steps={STEPS.map(id => ({ id, label: LABELS[id] }))}
      current={step}
      canOpen={id => canOpen(id as Step)}
      onStep={id => goTo(id as Step)}
      onClose={leave.request}
      onBack={STEPS.indexOf(step) > 0 ? flow.back : undefined}
      primary={step === 'type' ? undefined : {
        label: step === 'preview' ? k?.post ?? 'Post' : 'Next',
        onClick: goNext,
        busy,
        busyLabel: photos.pending ? 'Finishing upload…' : 'Posting…',
      }}
      badge={badge}
      aside={step === 'write' || step === 'where' ? { side: 'right', title: 'Live preview', content: previewCard } : undefined}
    >
      {applied && draft.loaded && step === (initialKind ? 'write' : 'type') && (
        <DraftNotice updatedAt={draft.loaded.updatedAt} summary={(draft.loaded.payload as TopicDraft).title || undefined}
          onStartOver={async () => { await draft.discard({ keepOpen: true }); setLocation('/forum/new', { replace: true }); onRestart?.(); }} />
      )}
      {body_}
      {leave.dialog}
    </FlowShell>
  );
}
