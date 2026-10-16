import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateCatalogEntry,
  useSaveReview,
  useDeleteReview,
  useListProjects,
  type CatalogEntry,
  type CatalogInputKind,
  type Review,
  type ReviewInputSizing,
} from '@workspace/api-client-react';
import { Loader2, Star } from 'lucide-react';

export const PATTERN_CATEGORIES = ['dresses', 'tops', 'trousers', 'skirts', 'jumpsuits', 'outerwear', 'knitwear', 'lingerie', 'activewear', 'menswear', 'kids', 'bags', 'accessories', 'home', 'other'] as const;
export const PRODUCT_CATEGORIES = ['fabric', 'thread', 'notions', 'tools', 'machines', 'other'] as const;

export function catalogPath(entry: { kind: string; slug: string }) {
  return `/catalog/${entry.kind}/${entry.slug}`;
}

export function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

/** Read-only stars, e.g. 4.3 → four full stars. */
export function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  const full = Math.round(value ?? 0);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={value === null ? 'No ratings yet' : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} aria-hidden="true" className={n <= full ? 'fill-ink text-ink' : 'text-line'} />)}
    </span>
  );
}

/** 1–5 picker as a radio group (keyboard friendly), with an optional "skip". */
function ScoreInput({ legend, value, onChange, optional = false, low, high }: {
  legend: string; value: number | null; onChange: (v: number | null) => void; optional?: boolean; low?: string; high?: string;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold">{legend}{optional && <span className="font-normal text-subtle"> (optional)</span>}</legend>
      <div className="mt-1.5 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <label key={n} className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full border text-sm font-bold ${value === n ? 'border-ink bg-yellow' : 'border-line bg-white'}`}>
            <input type="radio" name={legend} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />{n}
          </label>
        ))}
        {optional && value !== null && <button type="button" onClick={() => onChange(null)} className="ml-1 min-h-[44px] px-2 text-xs font-semibold text-subtle">Clear</button>}
      </div>
      {(low || high) && <p className="mt-1 flex justify-between text-[11px] text-subtle"><span>1 = {low}</span><span>5 = {high}</span></p>}
    </fieldset>
  );
}

/** Write or edit your review. Pattern pages also ask about fit, difficulty, instructions and sizing. */
export function ReviewForm({ entry, current, onDone }: { entry: CatalogEntry; current: Review | null; onDone: () => void }) {
  const client = useQueryClient();
  const save = useSaveReview();
  const remove = useDeleteReview();
  const projects = useListProjects();
  const pattern = entry.kind === 'pattern';
  const [rating, setRating] = useState<number | null>(current?.rating ?? null);
  const [fit, setFit] = useState<number | null>(current?.fit ?? null);
  const [difficulty, setDifficulty] = useState<number | null>(current?.difficulty ?? null);
  const [instructions, setInstructions] = useState<number | null>(current?.instructions ?? null);
  const [sizing, setSizing] = useState<ReviewInputSizing | null>(current?.sizing ?? null);
  const [sizeMade, setSizeMade] = useState(current?.sizeMade ?? '');
  const [body, setBody] = useState(current?.body ?? '');
  const [makeId, setMakeId] = useState<number | null>(current?.make?.id ?? null);
  const done = () => { client.invalidateQueries(); onDone(); };
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      if (!rating) return;
      save.mutate({ id: entry.id, data: { rating, fit, difficulty, instructions, sizing, sizeMade: sizeMade.trim() || null, body: body.trim(), makeId } }, { onSuccess: done });
    }}>
      <h2 className="font-display text-2xl">{current ? 'Edit your review of' : 'Review'} {entry.name}</h2>
      <ScoreInput legend="Overall" value={rating} onChange={setRating} low="disappointing" high="love it" />
      {pattern && <>
        <ScoreInput legend="Fit" value={fit} onChange={setFit} optional low="poor" high="spot on" />
        <ScoreInput legend="Difficulty" value={difficulty} onChange={setDifficulty} optional low="easy" high="hard" />
        <ScoreInput legend="Instructions" value={instructions} onChange={setInstructions} optional low="confusing" high="clear" />
        <fieldset>
          <legend className="text-xs font-semibold">Sizing <span className="font-normal text-subtle">(optional)</span></legend>
          <div className="mt-1.5 flex gap-1 rounded-full bg-canvas p-1">
            {([['small', 'Runs small'], ['true', 'True to size'], ['large', 'Runs large']] as const).map(([value, label]) => (
              <label key={value} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-full px-2 text-center text-xs font-bold ${sizing === value ? 'bg-ink text-white' : 'text-ink'}`}>
                <input type="radio" name="sizing" checked={sizing === value} onChange={() => setSizing(value)} onClick={() => sizing === value && setSizing(null)} className="sr-only" />{label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs font-semibold">Size you made <span className="font-normal text-subtle">(optional)</span>
          <input value={sizeMade} onChange={e => setSizeMade(e.target.value.slice(0, 40))} className="field mt-1.5" placeholder="e.g. 12, graded to 14 at hip" />
        </label>
      </>}
      <label className="block text-xs font-semibold">Your review
        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 4000))} rows={4} className="field mt-1.5 resize-y"
          placeholder={pattern ? 'How did it sew? What would you change next time?' : 'How was it to sew with? Would you buy it again?'} />
      </label>
      <label className="block text-xs font-semibold">Show one of your makes <span className="font-normal text-subtle">(optional; only people who can see the make will see it)</span>
        <select value={makeId ?? ''} onChange={e => setMakeId(e.target.value ? Number(e.target.value) : null)} className="field mt-1.5">
          <option value="">None</option>
          {projects.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {(save.isError || remove.isError) && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(save.error ?? remove.error, "That didn't save. Try again.")}</p>}
      <div className="flex flex-wrap gap-2">
        {current && (
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ id: entry.id }, { onSuccess: done })} className="btn btn-line text-red-ink">
            {remove.isPending && <Loader2 size={15} className="animate-spin" />}Delete review
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onDone} className="btn btn-line">Cancel</button>
        <button type="submit" disabled={!rating || save.isPending} className="btn btn-primary disabled:opacity-50">{save.isPending && <Loader2 size={15} className="animate-spin" />}Post review</button>
      </div>
    </form>
  );
}

/** Add a shared page. If one with the same maker and name exists, that one comes back instead. */
export function NewEntryForm({ kind, initial, onCreated, onCancel }: {
  kind: CatalogInputKind;
  initial?: { name?: string; maker?: string; category?: string };
  onCreated: (entry: CatalogEntry) => void;
  onCancel: () => void;
}) {
  const create = useCreateCatalogEntry();
  const categories = kind === 'pattern' ? PATTERN_CATEGORIES : PRODUCT_CATEGORIES;
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    maker: initial?.maker ?? '',
    category: categories.includes(initial?.category as never) ? initial!.category! : categories[0],
    url: '',
    difficulty: '' as '' | 'beginner' | 'intermediate' | 'advanced',
    sizes: '',
  });
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      create.mutate({
        data: {
          kind, name: form.name, maker: form.maker, category: form.category, url: form.url.trim() || null,
          difficulty: kind === 'pattern' && form.difficulty ? form.difficulty : null,
          sizes: kind === 'pattern' ? form.sizes.trim() || null : null,
        },
      }, { onSuccess: onCreated });
    }}>
      <h2 className="font-display text-2xl">Add a {kind === 'pattern' ? 'pattern' : 'product'} page</h2>
      <p className="text-sm text-subtle">Pages are shared by everyone on SewSpace. Only add patterns and products you can name; never upload pattern files.</p>
      <label className="block text-xs font-semibold">Name
        <input value={form.name} onChange={e => set('name', e.target.value)} required maxLength={120} className="field mt-1.5" placeholder={kind === 'pattern' ? 'Willa Dress' : 'Mara 100'} />
      </label>
      <label className="block text-xs font-semibold">{kind === 'pattern' ? 'Designer' : 'Brand'}
        <input value={form.maker} onChange={e => set('maker', e.target.value)} maxLength={120} className="field mt-1.5" placeholder={kind === 'pattern' ? 'Fernhill Patterns' : 'Gütermann'} />
      </label>
      <label className="block text-xs font-semibold">Category
        <select value={form.category} onChange={e => set('category', e.target.value)} className="field mt-1.5">
          {categories.map(c => <option key={c} value={c}>{capitalise(c)}</option>)}
        </select>
      </label>
      {kind === 'pattern' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Difficulty
            <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className="field mt-1.5">
              <option value="">Not sure</option>
              {['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{capitalise(d)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">Sizes
            <input value={form.sizes} onChange={e => set('sizes', e.target.value)} maxLength={80} className="field mt-1.5" placeholder="0–24" />
          </label>
        </div>
      )}
      <label className="block text-xs font-semibold">Where to buy it <span className="font-normal text-subtle">(optional link)</span>
        <input value={form.url} onChange={e => set('url', e.target.value)} type="url" inputMode="url" maxLength={500} className="field mt-1.5" placeholder="https://" />
      </label>
      {create.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't save. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={!form.name.trim() || create.isPending} className="btn btn-primary flex-1 disabled:opacity-50">{create.isPending && <Loader2 size={15} className="animate-spin" />}Add page</button>
      </div>
    </form>
  );
}
