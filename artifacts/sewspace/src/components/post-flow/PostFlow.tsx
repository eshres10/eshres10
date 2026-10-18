import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createPost,
  deleteChallengeEntry,
  enterChallenge,
  updatePost,
  useGetChallengePage,
  useGetProfile,
  useListFabrics,
  useListChallenges,
  useListJoinedChallenges,
  useListPatterns,
  useListProjects,
  type FeedPost,
  type Media,
  type PostFabric,
  type PostGarment,
} from '@workspace/api-client-react';
import { BookOpen, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Hash, ImagePlus, Info, Layers, Scissors, Search, Trophy, X } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { CaptionText } from '@/components/feed/CaptionText';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import {
  DraftNotice,
  FlowShell,
  Segmented,
  draftLabel,
  useDraft,
  useFlowStep,
  useLeaveGuard,
  useUploads,
  useValidation,
} from '@/components/flow';
import { appendHashtag, aspectRatio, MAX_HASHTAGS, normaliseHashtag, parseHashtags, removeHashtag } from '@/lib/hashtags';
import { processPhoto } from '@/lib/photos';
import {
  AltTextSheet,
  AudienceCards,
  insertHashtag,
  PhotoCarousel,
  photoSrc,
  PickerSheet,
  ChallengeSheet,
  Switch,
  tagLabel,
  useHashtagAssist,
  type Aspect,
  type Audience,
  type PhotoItem,
} from './parts';

const MAX_PHOTOS = 10;
const MAX_CAPTION = 2200;
const ALL_STEPS = ['photos', 'edit', 'details', 'share'] as const;
type Step = (typeof ALL_STEPS)[number];
const LABELS: Record<Step, string> = { photos: 'Photos', edit: 'Edit', details: 'Details', share: 'Share' };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

interface PostDraft extends Record<string, unknown> {
  kind: 'photo' | 'status';
  caption: string;
  aspect: Aspect;
  photos: Array<{ media: Media; alt: string }>;
  projectId: number | null;
  patternId: number | null;
  fabricId: number | null;
  garment?: PostGarment | null;
  fabric?: PostFabric | null;
  visibility: Audience;
  challenges: string[];
  reached: number;
}

function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

// Explore labels (optional): what was made, and whether the post is about fabric.
const GARMENT_CHOICES: Array<{ value: PostGarment; label: string }> = [
  { value: 'dresses', label: 'Dress' }, { value: 'tops', label: 'Top' }, { value: 'bottoms', label: 'Trousers or skirt' },
  { value: 'outerwear', label: 'Outerwear' }, { value: 'bags', label: 'Bag' },
];
const FABRIC_CHOICES: Array<{ value: PostFabric; label: string }> = [
  { value: 'linen', label: 'Linen' }, { value: 'cotton', label: 'Cotton' }, { value: 'satin', label: 'Satin' },
  { value: 'viscose', label: 'Viscose' }, { value: 'crepe', label: 'Crepe' }, { value: 'haul', label: 'Fabric haul' },
];
/** A make's garment (Quick start choices) as an Explore garment. */
function garmentOf(name: string | null | undefined): PostGarment | null {
  const g = (name ?? '').toLowerCase();
  if (g.startsWith('dress')) return 'dresses';
  if (g.startsWith('top')) return 'tops';
  if (g.startsWith('trouser') || g.startsWith('skirt')) return 'bottoms';
  if (g.startsWith('outerwear')) return 'outerwear';
  if (g.startsWith('bag')) return 'bags';
  return null;
}

function endsIn(date: string): string {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return days <= 1 ? 'ends today' : `ends in ${days} days`;
}

/**
 * New post (/new) and Edit post (/posts/:id/edit): Photos → Edit → Details →
 * Share, then Done. A status skips Edit. New posts keep a private draft; edits
 * change nothing until Save changes.
 */
export function PostFlow({ editing, onRestart }: { editing?: FeedPost; onRestart?: () => void }) {
  const isEdit = Boolean(editing);
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const client = useQueryClient();
  const me = useGetProfile();
  const projects = useListProjects();
  const patterns = useListPatterns();
  const fabrics = useListFabrics();
  const joined = useListJoinedChallenges();
  const paramChallenge = params.get('challenge')?.toLowerCase() || null;
  const extraChallenge = useGetChallengePage(paramChallenge ?? '', { query: { enabled: Boolean(paramChallenge) && !isEdit, retry: false } });

  // Everything the person has entered.
  const [kind, setKind] = useState<'photo' | 'status'>(editing?.kind ?? (params.get('type') === 'status' ? 'status' : 'photo'));
  const [caption, setCaption] = useState(editing?.caption ?? '');
  const [caret, setCaret] = useState(0);
  const [aspect, setAspect] = useState<Aspect>((editing?.aspect as Aspect | undefined) ?? '4:5');
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries((editing?.media ?? []).map(m => [`m${m.id}`, m.altText])));
  const tagged = (k: 'make' | 'pattern' | 'fabric') => editing?.tags.find(t => t.kind === k)?.id ?? null;
  const [projectId, setProjectId] = useState<number | null>(editing ? tagged('make') : Number(params.get('make')) || null);
  const [patternId, setPatternId] = useState<number | null>(editing ? tagged('pattern') : null);
  const [fabricId, setFabricId] = useState<number | null>(editing ? tagged('fabric') : null);
  const [garment, setGarment] = useState<PostGarment | null>(editing?.garment ?? null);
  const [fabric, setFabric] = useState<PostFabric | null>(editing?.fabric ?? null);
  const [visibility, setVisibility] = useState<Audience>((editing?.visibility as Audience | undefined) ?? 'public');
  const [challenges, setChallenges] = useState<string[]>(editing ? editing.challenges.map(c => c.slug) : paramChallenge ? [paramChallenge] : []);
  const [reached, setReached] = useState(isEdit ? ALL_STEPS.length - 1 : 0);
  const [active, setActive] = useState(0);

  const uploads = useUploads<Media>((file, options) => processPhoto(file, options), { max: MAX_PHOTOS });
  const seeded = useRef(false);
  useEffect(() => {
    if (!editing || seeded.current) return;
    seeded.current = true;
    uploads.seed(editing.media.map(m => ({ key: `m${m.id}`, preview: m.thumbUrl, result: m })));
  }, [editing, uploads]);

  // Draft: new posts only. Applied once, before autosave starts.
  const payload: PostDraft = {
    kind, caption, aspect, projectId, patternId, fabricId, garment, fabric, visibility, challenges, reached,
    photos: uploads.items.filter(i => i.status === 'done' && i.result).map(i => ({ media: i.result!, alt: alts[i.key] ?? '' })),
  };
  const dirty = isEdit
    ? caption !== editing!.caption || aspect !== editing!.aspect || visibility !== editing!.visibility || uploads.items.length !== editing!.media.length
      || projectId !== tagged('make') || challenges.join() !== editing!.challenges.map(c => c.slug).join()
      || garment !== (editing!.garment ?? null) || fabric !== (editing!.fabric ?? null)
    : Boolean(caption.trim() || uploads.items.length || projectId || patternId || fabricId);
  const [hydrated, setHydrated] = useState(isEdit);
  const draft = useDraft('post', payload, { enabled: !isEdit, active: hydrated && dirty });
  if (!hydrated && draft.loaded !== undefined) {
    const d = draft.loaded?.payload as PostDraft | undefined;
    if (d) {
      setKind(d.kind === 'status' ? 'status' : 'photo');
      setCaption(String(d.caption ?? ''));
      setAspect(d.aspect ?? '4:5');
      setProjectId(d.projectId ?? (Number(params.get('make')) || null));
      setPatternId(d.patternId ?? null);
      setFabricId(d.fabricId ?? null);
      setGarment(d.garment ?? null);
      setFabric(d.fabric ?? null);
      setVisibility(d.visibility ?? 'public');
      setChallenges([...new Set([...(d.challenges ?? []), ...(paramChallenge ? [paramChallenge] : [])])]);
      setReached(Math.min(d.reached ?? 0, ALL_STEPS.length - 1));
      const photos = Array.isArray(d.photos) ? d.photos : [];
      uploads.seed(photos.map(p => ({ key: `m${p.media.id}`, preview: p.media.thumbUrl, result: p.media })));
      setAlts(Object.fromEntries(photos.map(p => [`m${p.media.id}`, p.alt ?? ''])));
    }
    setHydrated(true);
  }

  // Tagging a make brings its pattern and fabric (new posts; on load too for ?make=).
  const make = projects.data?.find(p => p.id === projectId);
  const pickMake = (id: number | null) => {
    const m = projects.data?.find(p => p.id === id);
    setProjectId(id);
    setPatternId(m ? m.patternId ?? null : null);
    setFabricId(m ? m.fabricId ?? null : null);
    if (m && !garment) setGarment(garmentOf(m.garment));
  };
  useEffect(() => {
    if (isEdit || !make || patternId || fabricId) return;
    setPatternId(make.patternId ?? null);
    setFabricId(make.fabricId ?? null);
  }, [make?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Steps. A status skips Edit (shown struck through).
  const stepIds: readonly Step[] = kind === 'status' ? ['photos', 'details', 'share'] : ALL_STEPS;
  const canOpen = (s: Step) => (kind === 'status' && s === 'edit' ? false : isEdit || ALL_STEPS.indexOf(s) <= reached);
  const flow = useFlowStep(stepIds, { initial: isEdit ? 'details' : 'photos', canOpen: s => canOpen(s) });
  const step = flow.step;
  const stepIndex = ALL_STEPS.indexOf(step);

  const hashtags = parseHashtags(caption);
  const photoCount = uploads.items.length;
  const errors = step === 'photos'
    ? kind === 'photo'
      ? { photos: photoCount === 0 && 'Add at least one photo, or write a status instead.' }
      : { caption: !caption.trim() && 'Write something to post.' }
    : step === 'details'
      ? { caption: (kind === 'status' && !caption.trim() && 'Write something to post.') || (hashtags.length > MAX_HASHTAGS && `Use up to ${MAX_HASHTAGS} hashtags. This caption has ${hashtags.length}.`) }
      : {};
  const v = useValidation(errors);
  useEffect(() => { v.reset(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const challengeConflict = challenges.length > 0 && visibility !== 'public';
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; entered: string[]; notEntered: string[] } | null>(null);

  const leaveTo = () => {
    if (isEdit) setLocation(`/posts/${editing!.id}`);
    else if (window.history.length > 1) window.history.back();
    else setLocation('/feed');
  };
  const leave = useLeaveGuard({
    dirty: dirty && !done,
    onLeave: leaveTo,
    draft: isEdit ? undefined : { save: draft.save, discard: () => draft.discard() },
    where: 'New post',
  });

  const goNext = () => v.attempt(() => {
    if (step === 'share') {
      void submit();
      return;
    }
    const next = stepIds[stepIds.indexOf(step) + 1];
    setReached(r => Math.max(r, ALL_STEPS.indexOf(next)));
    flow.go(next);
  });

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !Array.from(files).length) return;
    const message = uploads.add(Array.from(files));
    setPickMessage(message);
    setKind('photo');
    // On a big screen, choosing photos moves on to ordering them.
    if (!isEdit && step === 'photos' && window.matchMedia('(min-width: 1024px)').matches) {
      setReached(r => Math.max(r, 1));
      flow.go('edit');
    }
  };
  const [pickMessage, setPickMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setSubmitError(null);
    const items = kind === 'photo' ? await uploads.waitAll() : [];
    if (items.some(i => i.status === 'error')) {
      setBusy(false);
      setSubmitError("A photo didn't upload. Retry it or remove it, then share again.");
      return;
    }
    const media = items.map(i => i.result!).filter(Boolean);
    const altTexts = items.filter(i => (alts[i.key] ?? '').trim() || isEdit).map(i => ({ mediaId: i.result!.id, text: (alts[i.key] ?? '').trim() }));
    try {
      if (isEdit) {
        const post = editing!;
        await updatePost(post.id, {
          caption: caption.trim(), visibility, projectId, patternId, fabricId, garment, fabric, aspect, altTexts,
          ...(post.kind === 'photo' ? { mediaIds: media.map(m => m.id) } : {}),
        });
        for (const c of post.challenges.filter(c => !challenges.includes(c.slug))) if (c.entryId) await deleteChallengeEntry(c.entryId).catch(() => undefined);
        const notEntered: string[] = [];
        for (const slug of challenges.filter(s => !post.challenges.some(c => c.slug === s))) await enterChallenge(slug, { postId: post.id }).catch(() => notEntered.push(slug));
        client.invalidateQueries();
        if (notEntered.length) setSubmitError(`Saved, but it couldn't be entered in #${notEntered.join(', #')}.`);
        setLocation(`/posts/${post.id}`);
        return;
      }
      const post = await createPost({
        kind, caption: caption.trim(), visibility, mediaIds: kind === 'photo' ? media.map(m => m.id) : [],
        projectId, patternId, fabricId, garment, fabric, aspect, altTexts: kind === 'photo' ? altTexts : [],
      });
      const entered: string[] = [], notEntered: string[] = [];
      if (visibility === 'public') {
        for (const slug of challenges) await enterChallenge(slug, { postId: post.id }).then(() => entered.push(slug), () => notEntered.push(slug));
      }
      await draft.clear();
      client.invalidateQueries({ queryKey: FEED_KEYS.all });
      client.invalidateQueries();
      setDone({ id: post.id, entered, notEntered });
    } catch (e) {
      setSubmitError(errorText(e, isEdit ? "That didn't save. Try again." : "That didn't post. Try again."));
    } finally {
      setBusy(false);
    }
  }

  // A fresh, empty flow (the page remounts this component).
  const startAnother = () => {
    setLocation('/new', { replace: true });
    onRestart?.();
  };

  // Challenge choices: active ones you joined, the one you came from, and (editing) the post's own.
  const [choosingChallenge, setChoosingChallenge] = useState(false);
  // Every running challenge (the API joins you on entering), loaded when the search opens.
  const running = useListChallenges({ status: 'active' }, { query: { enabled: choosingChallenge || challenges.length > 0, staleTime: 60_000 } });
  const challengeOptions = useMemo(() => {
    const list = (joined.data ?? []).map(c => ({ slug: c.slug, tag: c.tag, title: c.title, endsAt: c.endsAt as string | undefined, joined: true }));
    for (const c of running.data ?? []) if (!list.some(x => x.slug === c.slug)) list.push({ slug: c.slug, tag: c.tag, title: c.title, endsAt: c.endsAt, joined: c.joinedByMe });
    const extra = extraChallenge.data?.challenge;
    if (extra && extra.status === 'active' && !list.some(c => c.slug === extra.slug)) list.push({ slug: extra.slug, tag: extra.tag, title: extra.title, endsAt: extra.endsAt, joined: extra.joinedByMe });
    for (const c of editing?.challenges ?? []) if (!list.some(x => x.slug === c.slug)) list.push({ slug: c.slug, tag: c.tag, title: c.tag, endsAt: undefined, joined: true });
    return list;
  }, [joined.data, running.data, extraChallenge.data, editing]);

  const assist = useHashtagAssist(caption, caret, { projectId, patternId, fabricId, challenge: challenges[0] });
  const items = uploads.items;
  const cover = items[0];
  const handle = me.data?.handle ?? '';

  const [altFor, setAltFor] = useState<PhotoItem | null>(null);
  const [picker, setPicker] = useState<null | 'make' | 'pattern' | 'fabric'>(null);
  const [option, setOption] = useState(0);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const listboxId = useId();
  const audienceTitle = useId();

  // ---- Done --------------------------------------------------------------
  if (done) {
    return (
      <FlowShell title="New post" steps={[]} current="" canOpen={() => false} onStep={() => undefined} onClose={() => setLocation('/feed')}>
        <div className="mx-auto max-w-[560px] space-y-3 pt-6 lg:pt-2">
          <div className="rounded-[34px] bg-yellow px-6 py-9 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-yellow" aria-hidden="true"><Check size={28} strokeWidth={3} /></span>
            <h2 className="mt-4 font-display text-[34px] leading-tight tracking-[-.05em]" data-autofocus tabIndex={-1}>Posted</h2>
            <p className="mx-auto mt-2 max-w-[340px] text-[15px]">
              {done.entered.length > 0 && <>It's also entered in {done.entered.map(s => `#${challengeOptions.find(c => c.slug === s)?.tag ?? s}`).join(', ')}. </>}
              {hashtags.length > 0 ? 'Hashtags in your caption are now linked.' : visibility === 'public' ? 'Anyone can see it.' : visibility === 'followers' ? 'Your followers can see it.' : 'Only you can see it.'}
            </p>
            {done.notEntered.length > 0 && <p className="mt-2 text-sm font-semibold text-red-ink">It couldn't be entered in #{done.notEntered.join(', #')}. Check the challenge is still running.</p>}
          </div>
          <button type="button" onClick={() => setLocation(`/posts/${done.id}`)} className="flex min-h-[56px] w-full items-center justify-center rounded-full bg-ink text-lg font-bold text-white">View post</button>
          <button type="button" onClick={startAnother} className="flex min-h-[56px] w-full items-center justify-center rounded-full border-2 border-ink text-lg font-bold">Start another post</button>
        </div>
      </FlowShell>
    );
  }

  // ---- Shared bits -------------------------------------------------------
  const fileInput = (id: string, capture = false) => (
    <input id={id} type="file" accept={ACCEPT} multiple={!capture} {...(capture ? { capture: 'environment' as const } : {})} className="sr-only" tabIndex={-1}
      onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
  );
  const pick = (id: string) => document.getElementById(id)?.click();

  const statusCard = (
    <div data-field="caption" className={`rounded-[34px] bg-yellow p-5 ${v.error('caption') ? 'outline outline-2 -outline-offset-2 outline-red-ink' : ''}`}>
      <label htmlFor="f-caption" className="text-sm font-bold">What's on your table?</label>
      <textarea id="f-caption" value={caption} onChange={e => { setCaption(e.target.value.slice(0, MAX_CAPTION)); setCaret(e.target.selectionStart); }}
        aria-invalid={v.error('caption') ? true : undefined} aria-describedby={v.error('caption') ? 'f-caption-error' : undefined}
        rows={6} placeholder="A question, a win, a work in progress…"
        className="mt-2 w-full resize-none bg-transparent font-display text-[26px] leading-tight tracking-[-.03em] text-ink outline-none placeholder:text-ink/40" />
      <p className="text-right text-sm font-semibold">{caption.length} / {MAX_CAPTION.toLocaleString()}</p>
      {v.error('caption') && <p id="f-caption-error" className="mt-1 text-sm font-semibold text-red-ink">{v.error('caption')}</p>}
    </div>
  );

  const darkPane = kind === 'photo' && items.length > 0
    ? <div className="flex h-full items-center px-4"><PhotoCarousel items={items} aspect={aspect} alts={alts} index={active} onIndex={setActive} className="max-w-[480px]" /></div>
    : <div className="flex h-full items-center justify-center p-6"><div className="w-full max-w-[420px] rounded-[30px] bg-yellow p-6 font-display text-[24px] leading-tight tracking-[-.03em] text-ink"><CaptionText text={caption || 'Your status shows here.'} linked={false} /></div></div>;

  // ---- Photos ------------------------------------------------------------
  const photosStep = kind === 'status' ? (
    <div className="mx-auto max-w-[620px] space-y-3">
      {statusCard}
      {!isEdit && <button type="button" onClick={() => setKind('photo')} className="btn btn-line min-h-[52px] text-base">Add photos instead</button>}
      <p className="text-[15px] text-subtle">Status posts can use hashtags and tags too. You'll add them next.</p>
    </div>
  ) : (
    <div data-field="photos" className="space-y-3">
      {fileInput('post-photos')}{fileInput('post-camera', true)}
      {/* Phone: big preview over a numbered grid of the photos you chose. */}
      <div className="lg:hidden">
        {items.length === 0 ? (
          <div className={`grid place-items-center rounded-[34px] bg-white px-6 py-12 text-center ${v.error('photos') ? 'outline outline-2 -outline-offset-2 outline-red-ink' : ''}`}>
            <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-yellow" aria-hidden="true"><ImagePlus size={28} /></span>
            <p className="mt-3 font-display text-2xl tracking-[-.04em]">Add up to 10 photos</p>
            <p className="mt-1 text-sm text-subtle">We resize them and strip location data.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => pick('post-photos')} className="btn min-h-[52px] bg-ink px-6 text-base text-white">Choose photos</button>
              <button type="button" onClick={() => pick('post-camera')} aria-label="Take a photo" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ink text-white"><Camera size={22} /></button>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[34px] bg-line" style={{ aspectRatio: String(aspectRatio(aspect, items[0]?.result)) }}>
            <img src={photoSrc(items[Math.min(active, items.length - 1)])} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-4 left-4 rounded-full bg-ink/75 px-3.5 py-1.5 text-sm font-bold text-white">{items.length} of {MAX_PHOTOS} selected</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <h2 className="flex-1 font-display text-xl tracking-[-.04em]">{items.length ? 'Your photos' : ''}</h2>
          {!isEdit && <button type="button" onClick={() => setKind('status')} className="btn btn-line min-h-[48px] text-[15px]">Write a status instead</button>}
          {items.length > 0 && <button type="button" onClick={() => pick('post-camera')} aria-label="Take a photo" className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white"><Camera size={20} /></button>}
        </div>
        {items.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Chosen photos, in order">
            {items.map((item, i) => (
              <li key={item.key} className="relative aspect-square overflow-hidden rounded-[6px] bg-line">
                <button type="button" onClick={() => setActive(i)} aria-label={`Photo ${i + 1}${i === active ? ', showing' : ''}`} className="block h-full w-full">
                  <img src={photoSrc(item, true)} alt="" className={`h-full w-full object-cover ${item.status === 'done' ? '' : 'opacity-60'}`} />
                </button>
                <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-yellow text-sm font-bold">{i + 1}</span>
                {item.status === 'uploading' && <span className="pointer-events-none absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-white/80"><span className="block h-full bg-yellow" style={{ width: `${Math.max(6, item.progress * 100)}%` }} /></span>}
                {item.status === 'error' && <button type="button" onClick={() => uploads.retry(item.key)} className="absolute inset-0 grid place-items-center bg-white/85 text-xs font-bold text-red-ink">Didn't upload · Retry</button>}
              </li>
            ))}
            {items.length < MAX_PHOTOS && (
              <li><button type="button" onClick={() => pick('post-photos')} aria-label="Add photos" className="grid aspect-square w-full place-items-center rounded-[6px] border-2 border-dashed border-subtle/40 bg-white"><ImagePlus size={24} /></button></li>
            )}
          </ul>
        )}
      </div>
      {/* Desktop: a drop zone. */}
      <div className="hidden lg:block">
        <div onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          className={`grid min-h-[520px] place-items-center rounded-[28px] border-2 border-dashed border-subtle/40 bg-canvas/60 p-8 text-center ${v.error('photos') ? 'border-red-ink' : ''}`}>
          <div>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-yellow" aria-hidden="true"><ImagePlus size={34} /></span>
            <p className="mt-4 font-display text-[30px] tracking-[-.05em]">Drag photos here</p>
            <p className="mt-1 text-[15px] text-subtle">Up to 10 · JPG, PNG, WebP or GIF · we resize them and strip location data</p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => pick('post-photos')} className="btn min-h-[50px] bg-ink px-6 text-base text-white">Choose from computer</button>
              {!isEdit && <button type="button" onClick={() => setKind('status')} className="btn btn-line min-h-[50px] px-6 text-base">Write a status instead</button>}
            </div>
            {items.length > 0 && <p className="mt-4 text-sm font-semibold">{items.length} of {MAX_PHOTOS} chosen · <button type="button" className="underline" onClick={() => flow.go('edit')}>Order them</button></p>}
          </div>
        </div>
      </div>
      {pickMessage && <p role="status" className="text-sm font-semibold text-subtle">{pickMessage}</p>}
      {v.error('photos') && <p id="f-photos-error" className="text-sm font-semibold text-red-ink">{v.error('photos')}</p>}
    </div>
  );

  // ---- Edit --------------------------------------------------------------
  const shape = (
    <div className="rounded-[26px] bg-white p-4 lg:p-0">
      <p id="shape-label" className="mb-2 text-sm font-semibold text-subtle">Shape</p>
      <Segmented aria-labelledby="shape-label" className="bg-canvas" value={aspect} onChange={setAspect}
        options={[{ value: '4:5', label: '4:5' }, { value: '1:1', label: '1:1' }, { value: 'original', label: 'Original' }]} />
    </div>
  );
  const moreButton = items.length < MAX_PHOTOS && (
    <button type="button" onClick={() => pick('post-photos-more')} className="flex min-h-[48px] w-full items-center justify-center rounded-full border-2 border-dashed border-subtle/40 text-sm font-bold">
      + Add more photos ({items.length} of {MAX_PHOTOS})
    </button>
  );
  const editStep = (
    <div className="space-y-3">
      {fileInput('post-photos-more')}
      <div className="lg:hidden">
        <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1" aria-label="Photos in order. The first is the cover.">
          {items.map((item, i) => (
            <li key={item.key} className="w-[62%] shrink-0 snap-start rounded-[30px] bg-white p-2">
              <div className="relative overflow-hidden rounded-[22px] bg-line" style={{ aspectRatio: String(aspectRatio(aspect, items[0]?.result)) }}>
                <img src={photoSrc(item)} alt={alts[item.key] || `Photo ${i + 1}`} className={`h-full w-full object-cover ${item.status === 'done' ? '' : 'opacity-60'}`} />
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-yellow px-3 py-0.5 text-sm font-bold">Cover</span>}
                <button type="button" onClick={() => uploads.remove(item.key)} aria-label={`Remove photo ${i + 1}`} className="absolute right-1 top-1 grid h-11 w-11 place-items-center"><span className="grid h-9 w-9 place-items-center rounded-full bg-ink/75 text-white"><X size={16} /></span></button>
                {item.status === 'uploading' && <span className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/80"><span className="block h-full bg-yellow" style={{ width: `${Math.max(6, item.progress * 100)}%` }} /></span>}
                {item.status === 'error' && <button type="button" onClick={() => uploads.retry(item.key)} className="absolute inset-0 grid place-items-center bg-white/85 text-sm font-bold text-red-ink">Didn't upload · Retry</button>}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={() => uploads.move(item.key, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink disabled:border-line disabled:text-subtle"><ChevronLeft size={18} /></button>
                <button type="button" onClick={() => setAltFor(item)} className={`min-h-[44px] flex-1 truncate rounded-full px-3 text-sm font-bold ${alts[item.key] ? 'bg-canvas' : 'bg-yellow'}`}>{alts[item.key] ? <><Check size={14} className="mr-1 inline" aria-hidden="true" />Alt text</> : 'Add alt text'}</button>
                <button type="button" onClick={() => uploads.move(item.key, 1)} disabled={i === items.length - 1} aria-label={`Move photo ${i + 1} later`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink disabled:border-line disabled:text-subtle"><ChevronRight size={18} /></button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden lg:block">
        <h2 className="font-display text-xl tracking-[-.04em]">Order, cover and alt text</h2>
        <p className="mt-1 text-sm text-subtle">The first photo is the cover. Photos keep uploading while you work.</p>
        <ol className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={item.key} className={`flex gap-3 rounded-[20px] border-2 p-2.5 ${i === active ? 'border-ink bg-yellow/15' : 'border-line'}`}>
              <button type="button" onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`} className="relative h-20 w-16 shrink-0 overflow-hidden rounded-[12px] bg-line">
                <img src={photoSrc(item, true)} alt="" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-yellow px-1.5 text-[10px] font-bold">Cover</span>}
              </button>
              <div className="min-w-0 flex-1">
                <label htmlFor={`alt-${item.key}`} className="text-xs font-bold text-subtle">Alt text for photo {i + 1}</label>
                <input id={`alt-${item.key}`} value={alts[item.key] ?? ''} onChange={e => setAlts(a => ({ ...a, [item.key]: e.target.value.slice(0, 500) }))} className="field mt-1 min-h-[40px] py-2 text-sm" placeholder="Describe what's in the photo" />
                {item.status === 'uploading' && <><p className="mt-1.5 text-xs font-bold">Uploading {Math.round(item.progress * 100)}%</p><span className="mt-1 block h-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-ink" style={{ width: `${item.progress * 100}%` }} /></span></>}
                {item.status === 'error' && <p className="mt-1.5 text-xs font-bold text-red-ink">Didn't upload. <button type="button" className="underline" onClick={() => uploads.retry(item.key)}>Retry</button></p>}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => uploads.move(item.key, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`} className="grid h-9 w-9 place-items-center rounded-full border border-ink disabled:border-line disabled:text-subtle"><ChevronUp size={16} /></button>
                <button type="button" onClick={() => uploads.move(item.key, 1)} disabled={i === items.length - 1} aria-label={`Move photo ${i + 1} later`} className="grid h-9 w-9 place-items-center rounded-full border border-ink disabled:border-line disabled:text-subtle"><ChevronDown size={16} /></button>
                <button type="button" onClick={() => uploads.remove(item.key)} aria-label={`Remove photo ${i + 1}`} className="grid h-9 w-9 place-items-center rounded-full bg-canvas"><X size={15} /></button>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {moreButton}
      {shape}
      <p className="flex gap-2 text-[15px] text-subtle lg:text-sm"><Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />Photos keep uploading while you write. Alt text describes the photo for people using screen readers.</p>
      {altFor && <AltTextSheet item={altFor} value={alts[altFor.key] ?? ''} onSave={text => setAlts(a => ({ ...a, [altFor.key]: text }))} onClose={() => setAltFor(null)} />}
    </div>
  );

  // ---- Details -----------------------------------------------------------
  const choose = (tag: string) => {
    const next = insertHashtag(caption, caret, tag);
    setCaption(next.caption);
    setCaret(next.caret);
    setOption(0);
    requestAnimationFrame(() => { captionRef.current?.focus(); captionRef.current?.setSelectionRange(next.caret, next.caret); });
  };
  const [ownTag, setOwnTag] = useState('');
  const atLimit = hashtags.length >= MAX_HASHTAGS;
  const addOwnTag = () => {
    const tag = normaliseHashtag(ownTag);
    if (!tag || atLimit) return;
    setCaption(appendHashtag(caption, tag));
    setOwnTag('');
  };
  const showList = assist.matching && assist.list.length > 0;
  const onCaptionKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showList || !window.matchMedia('(min-width: 1024px)').matches) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOption(o => (o + (e.key === 'ArrowDown' ? 1 : -1) + assist.list.length) % assist.list.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(assist.list[Math.min(option, assist.list.length - 1)].tag);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setCaret(-1);
    }
  };
  const nameOf = <T extends { id: number; name: string }>(list: T[] | undefined, id: number | null) => (id ? list?.find(x => x.id === id)?.name ?? null : null);
  const tagRow = (label: string, Icon: typeof Scissors, kindKey: 'make' | 'pattern' | 'fabric', value: string | null, fromMake: boolean) => (
    <div className="flex min-h-[64px] items-center gap-3 border-b border-line py-2 last:border-0">
      <Icon size={22} aria-hidden="true" />
      <span className="flex-1 text-[17px] font-semibold lg:text-[15px]">{label}</span>
      {value
        ? kindKey === 'make' || !fromMake
          ? <span className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-yellow pl-4 pr-1 font-bold">
              <button type="button" onClick={() => setPicker(kindKey)} className="max-w-[160px] truncate">{value}</button>
              <button type="button" onClick={() => (kindKey === 'make' ? pickMake(null) : kindKey === 'pattern' ? setPatternId(null) : setFabricId(null))} aria-label={`Remove ${label.toLowerCase()} tag`} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white"><X size={15} /></button>
            </span>
          : <button type="button" onClick={() => setPicker(kindKey)} className="max-w-[55%] truncate text-right text-subtle">{value}</button>
        : kindKey === 'make'
          ? <button type="button" onClick={() => setPicker('make')} className="btn btn-line min-h-[48px] text-base">Tag a make</button>
          : <button type="button" onClick={() => setPicker(kindKey)} className="min-h-[44px] text-right text-[15px] text-subtle underline-offset-2 hover:underline">{projectId ? 'Choose' : 'Tag a make to fill this'}</button>}
    </div>
  );
  const detailsStep = (
    <div className="space-y-3">
      <div className="hidden items-center gap-3 lg:flex">
        <UserAvatar name={me.data?.name} avatarUrl={me.data?.avatarUrl} size={36} />
        <span className="font-bold">{handle}</span>
      </div>
      <div data-field="caption" className={`rounded-[34px] bg-white p-4 lg:rounded-none lg:p-0 ${v.error('caption') ? 'outline outline-2 -outline-offset-2 outline-red-ink lg:outline-offset-4' : ''}`}>
        <div className="flex items-center gap-3">
          {kind === 'photo' && cover && <img src={photoSrc(cover, true)} alt="" className="h-14 w-11 rounded-[10px] object-cover lg:hidden" />}
          <label htmlFor="f-caption" className="flex-1 text-sm font-semibold text-subtle">Caption</label>
          <span className="text-sm text-subtle">{caption.length} / {MAX_CAPTION.toLocaleString()}</span>
        </div>
        <div className="relative">
          <textarea ref={captionRef} id="f-caption" value={caption} rows={5}
            onChange={e => { setCaption(e.target.value.slice(0, MAX_CAPTION)); setCaret(e.target.selectionStart); setOption(0); }}
            onSelect={e => setCaret(e.currentTarget.selectionStart)} onKeyDown={onCaptionKey}
            role="combobox" aria-expanded={showList} aria-controls={listboxId} aria-autocomplete="list"
            aria-activedescendant={showList ? `${listboxId}-${Math.min(option, assist.list.length - 1)}` : undefined}
            aria-invalid={v.error('caption') ? true : undefined} aria-describedby={v.error('caption') ? 'f-caption-error' : undefined}
            placeholder="Tell people about it: fabric, alterations, what you'd change. Add #hashtags."
            className="mt-2 w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none lg:rounded-[18px] lg:border lg:border-ink lg:p-3 lg:text-[15px] lg:focus:shadow-[0_0_0_4px_rgba(230,229,30,.55)]" />
          {/* Desktop: matching tags as a listbox under the caption. */}
          <ul id={listboxId} role="listbox" aria-label="Matching hashtags" hidden={!showList}
            className="mt-2 hidden divide-y divide-line overflow-hidden rounded-[18px] border border-ink bg-white lg:block [&[hidden]]:hidden">
            {assist.list.map((t, i) => (
              <li key={t.tag} id={`${listboxId}-${i}`} role="option" aria-selected={i === option}
                onMouseDown={e => { e.preventDefault(); choose(t.tag); }}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 px-3 ${i === option ? 'bg-canvas' : ''}`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-canvas" aria-hidden="true"><Hash size={14} /></span>
                <span className="flex-1 font-bold">{t.tag}</span>
                <span className="text-xs text-subtle">{t.posts ? `${tagLabel(t.posts)} post${t.posts === 1 ? '' : 's'}` : 'new'}</span>
              </li>
            ))}
          </ul>
        </div>
        {v.error('caption') && <p id="f-caption-error" className="mt-2 text-sm font-semibold text-red-ink">{v.error('caption')}</p>}
      </div>

      {/* Hashtags: the post's own (removable), add your own (owner: at most 3), and matches/suggestions. */}
      <div className={`rounded-[34px] bg-white p-4 lg:rounded-none lg:p-0 ${showList ? 'lg:hidden' : ''}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-subtle">Hashtags</p>
          <p className={`text-sm font-bold ${hashtags.length > MAX_HASHTAGS ? 'text-red-ink' : 'text-subtle'}`}>{hashtags.length} / {MAX_HASHTAGS}<span className="lg:hidden"> hashtags</span></p>
        </div>
        {hashtags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Hashtags on this post">
            {hashtags.map(tag => (
              <li key={tag} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-yellow py-1 pl-3.5 pr-1 text-[15px] font-bold">
                #{tag}
                <button type="button" onClick={() => setCaption(removeHashtag(caption, tag))} aria-label={`Remove #${tag}`}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/10"><X size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Add your own hashtag</span>
            <Hash size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input value={ownTag} onChange={e => setOwnTag(e.target.value)} disabled={atLimit} maxLength={51}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOwnTag(); } }}
              placeholder={atLimit ? `${MAX_HASHTAGS} is the most` : 'Add your own'} className="field pl-9 disabled:bg-canvas" autoComplete="off" />
          </label>
          <button type="button" onClick={addOwnTag} disabled={atLimit || !normaliseHashtag(ownTag)} className="btn min-h-[48px] shrink-0 bg-ink px-5 text-white disabled:opacity-40">Add</button>
        </div>
        {!atLimit && assist.list.length > 0 && (
          <>
            <p className="mt-3 text-sm font-semibold text-subtle">{assist.matching ? 'Matching hashtags' : 'Suggested for this post'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {assist.list.map(t => (
                <button key={t.tag} type="button" onClick={() => (assist.matching ? choose(t.tag) : setCaption(appendHashtag(caption, t.tag)))}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-bold ${assist.matching ? 'bg-ink text-white' : 'bg-canvas text-ink'}`}>
                  {!assist.matching && <span aria-hidden="true">+</span>}#{t.tag}{t.posts > 0 && <span className={assist.matching ? 'font-normal text-white/70' : 'font-normal text-subtle'}><span className="sr-only">, </span>{tagLabel(t.posts)}<span className="sr-only"> posts</span></span>}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="mt-2 text-sm text-subtle lg:hidden">Up to {MAX_HASHTAGS}. They're added to your caption and link to their own page.</p>
      </div>

      <div className="rounded-[34px] bg-white p-4 lg:rounded-[20px] lg:border lg:border-line">
        <p className="text-sm font-semibold text-subtle" id="explore-labels">Help people find it on Explore <span className="font-normal">(optional)</span></p>
        <LabelChips label="What did you make?" options={GARMENT_CHOICES} value={garment} onChange={setGarment} />
        <LabelChips label="Is it about fabric?" options={FABRIC_CHOICES} value={fabric} onChange={setFabric} />
      </div>

      <div className="rounded-[34px] bg-white px-4 py-1 lg:rounded-[20px] lg:border lg:border-line">
        {tagRow('Make', Scissors, 'make', nameOf(projects.data, projectId), false)}
        {tagRow('Pattern', BookOpen, 'pattern', nameOf(patterns.data, patternId), Boolean(make && make.patternId === patternId))}
        {tagRow('Fabric', Layers, 'fabric', nameOf(fabrics.data, fabricId), Boolean(make && make.fabricId === fabricId))}
      </div>
      {(projectId || patternId || fabricId) && <p className="px-2 text-sm text-subtle">Tagged items show on the post only for people who can already see them.</p>}

      <div className="flex min-h-[72px] flex-wrap items-center gap-3 rounded-[34px] bg-white px-4 py-3 lg:rounded-[20px] lg:border lg:border-line">
        <Trophy size={22} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[17px] font-semibold lg:text-[15px]">Enter a challenge</span>
        <button type="button" onClick={() => setChoosingChallenge(true)} aria-haspopup="dialog"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-canvas px-4 text-[15px] font-semibold">
          <Search size={16} aria-hidden="true" />{challenges.length ? 'Change' : 'Search'}
        </button>
        {challenges.length > 0 && (
          <ul className="flex w-full flex-wrap gap-2 pl-[34px]" aria-label="Entering">
            {challenges.map(slug => {
              const c = challengeOptions.find(o => o.slug === slug);
              return (
                <li key={slug} className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-yellow py-1 pl-3 pr-1 text-sm font-bold">
                  #{c?.tag ?? slug}{c?.endsAt && <span className="font-normal text-ink/70"> · {endsIn(c.endsAt)}</span>}
                  <button type="button" onClick={() => setChallenges(list => list.filter(s => s !== slug))} aria-label={`Don't enter #${c?.tag ?? slug}`}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/10"><X size={14} aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {choosingChallenge && (
        <ChallengeSheet value={challenges} loading={running.isLoading && joined.isLoading}
          options={challengeOptions.filter(c => c.endsAt).map(c => ({ slug: c.slug, tag: c.tag, title: c.title, detail: endsIn(c.endsAt!), joined: c.joined }))}
          onDone={slugs => { setChallenges(slugs); if (slugs.some(s => !challenges.includes(s))) setVisibility('public'); }}
          onClose={() => setChoosingChallenge(false)} />
      )}

      {picker === 'make' && <PickerSheet title="Tag a make" help="We'll fill in the pattern and fabric from it." items={projects.data} value={projectId}
        image={p => p.coverImageUrl} describe={p => [nameOf(patterns.data, p.patternId ?? null), nameOf(fabrics.data, p.fabricId ?? null)].filter(Boolean).join(' · ') || p.status}
        onPick={p => pickMake(p?.id ?? null)} onClose={() => setPicker(null)} empty="No makes yet. Start one from Projects." />}
      {picker === 'pattern' && <PickerSheet title="Tag a pattern" help="One of the patterns in your library." items={patterns.data} value={patternId} describe={p => p.designer || ''}
        onPick={p => setPatternId(p?.id ?? null)} onClose={() => setPicker(null)} empty="No patterns in your library yet." />}
      {picker === 'fabric' && <PickerSheet title="Tag a fabric" help="One of the fabrics in your stash." items={fabrics.data} value={fabricId} describe={f => [f.type, f.color].filter(Boolean).join(' · ')}
        onPick={f => setFabricId(f?.id ?? null)} onClose={() => setPicker(null)} empty="No fabric in your stash yet." />}
    </div>
  );

  // ---- Share -------------------------------------------------------------
  const pending = uploads.pending;
  const shareStep = (
    <div className="space-y-3">
      <div className="rounded-[34px] bg-white p-4 lg:rounded-none lg:p-0">
        <h2 id={audienceTitle} className="mb-3 font-display text-[24px] tracking-[-.05em] lg:text-xl">Who can see this?</h2>
        <AudienceCards value={visibility} onChange={setVisibility} labelledBy={audienceTitle} />
        {challengeConflict && (
          <div role="alert" className="mt-3 flex items-center gap-3 rounded-[24px] border-2 border-red-ink p-3 pl-4">
            <p className="flex-1 font-semibold text-red-ink">Challenge entries have to be public.</p>
            <button type="button" onClick={() => setVisibility('public')} className="btn min-h-[48px] shrink-0 bg-ink text-white">Make it public</button>
          </div>
        )}
      </div>
      <div className="rounded-[34px] bg-white p-4 lg:hidden">
        <p className="text-sm font-semibold text-subtle">Preview</p>
        <div className="mt-3 flex items-center gap-2.5"><UserAvatar name={me.data?.name} avatarUrl={me.data?.avatarUrl} size={40} /><span className="font-bold">{handle}</span><span className="text-sm text-subtle">· now</span></div>
        {kind === 'photo' && cover && <img src={photoSrc(cover)} alt={alts[cover.key] ?? ''} className="mt-3 w-full rounded-[22px] object-cover" style={{ aspectRatio: String(aspectRatio(aspect, cover.result)) }} />}
        {caption && <p className={`mt-3 whitespace-pre-line break-words ${kind === 'status' ? 'font-display text-[22px] leading-snug tracking-[-.03em]' : 'text-[16px] leading-relaxed'}`}><CaptionText text={caption} linked={false} /></p>}
      </div>
      <div className="hidden rounded-[20px] border border-line p-3.5 lg:block">
        <p className="text-xs font-bold text-subtle">Caption</p>
        <p className="mt-1 whitespace-pre-line break-words text-[15px]"><CaptionText text={caption || '(no caption)'} linked={false} /></p>
        <p className="mt-2 text-xs text-subtle">
          {[`${hashtags.length} hashtag${hashtags.length === 1 ? '' : 's'}`, projectId && `tagged ${nameOf(projects.data, projectId)}`, challenges.length && `entering ${challenges.map(s => `#${s}`).join(', ')}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      {pending && <p className="px-2 text-sm text-subtle">The last photo finishes uploading while you share.</p>}
      {submitError && <p role="alert" className="px-2 text-sm font-semibold text-red-ink">{submitError}</p>}
    </div>
  );

  // ---- Frame -------------------------------------------------------------
  const body = { photos: photosStep, edit: editStep, details: detailsStep, share: shareStep }[step];
  const last = step === 'share';
  const failed = uploads.failed > 0;
  const primary = {
    label: last ? (isEdit ? 'Save changes' : 'Share') : 'Next',
    onClick: goNext,
    disabled: last && (challengeConflict || failed),
    reason: last && challengeConflict ? 'Challenge entries have to be public.' : last && failed ? "A photo didn't upload. Retry or remove it." : undefined,
    busy,
    busyLabel: uploads.pending ? 'Finishing upload…' : isEdit ? 'Saving…' : 'Sharing…',
  };
  const subtitle = isEdit ? 'Nothing changes until you save' : step === 'photos' && draft.status === 'idle' ? (kind === 'status' ? 'A status' : 'Up to 10 photos') : draftLabel(draft.status);
  const showPane = !(step === 'photos' && kind === 'photo');
  return (
    <FlowShell
      title={isEdit ? 'Edit post' : 'New post'}
      subtitle={subtitle}
      steps={ALL_STEPS.map(id => ({ id, label: LABELS[id], skipped: kind === 'status' && id === 'edit' }))}
      current={step}
      canOpen={id => canOpen(id as Step)}
      onStep={id => flow.go(id as Step)}
      onClose={leave.request}
      onBack={stepIds.indexOf(step) > 0 ? flow.back : undefined}
      primary={primary}
      primaryInHeader={!last}
      desktopPrimaryInHeader
      plainDesktop
      steadyHeight
      aside={showPane ? { side: 'left', dark: true, content: darkPane } : undefined}
    >
      {!isEdit && draft.loaded && hydrated && step === 'photos' && (
        <DraftNotice updatedAt={draft.loaded.updatedAt} summary={(draft.loaded.payload as PostDraft).caption?.slice(0, 40) || undefined}
          onStartOver={async () => { await draft.discard({ keepOpen: true }); startAnother(); }} />
      )}
      {body}
      {leave.dialog}
    </FlowShell>
  );
}

/** One optional choice as chips; tapping the chosen one clears it. */
function LabelChips({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: never) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="mt-3">
      <p id={id} className="text-[15px] font-semibold">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange((value === o.value ? null : o.value) as never)}
            className={`min-h-[44px] rounded-full px-4 text-[15px] font-semibold ${value === o.value ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
