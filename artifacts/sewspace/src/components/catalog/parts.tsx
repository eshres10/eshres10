import { useState } from 'react';
import { useSheetDirty } from '@/components/social/Sheet';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateCatalogEntry,
  useDeleteCatalogEntry,
  useGetProfile,
  useSaveReview,
  useDeleteReview,
  useListProjects,
  useSetCatalogSizes,
  useUpdateCatalogEntry,
  type Alteration,
  type CatalogEntry,
  type CatalogInputKind,
  type CatalogSize,
  type Review,
  type ReviewInputSizing,
} from '@workspace/api-client-react';
import { Globe, Loader2, Star, Trash2 } from 'lucide-react';
import { CURRENCIES, defaultCurrency } from '@/lib/currency';

export const PATTERN_CATEGORIES = ['dresses', 'tops', 'trousers', 'skirts', 'jumpsuits', 'outerwear', 'knitwear', 'lingerie', 'activewear', 'menswear', 'kids', 'bags', 'accessories', 'home', 'other'] as const;
export const PRODUCT_CATEGORIES = ['fabric', 'thread', 'notions', 'tools', 'machines', 'other'] as const;

/** Names for the alterations reviewers pick (the API's fixed list). */
export const ALTERATION_LABEL: Record<Alteration, string> = {
  lengthen_bodice: 'Lengthen bodice', shorten_bodice: 'Shorten bodice', fba: 'Full bust adjustment', sba: 'Small bust adjustment',
  swayback: 'Swayback adjustment', lengthen_skirt: 'Lengthen skirt', shorten_skirt: 'Shorten skirt', grade_sizes: 'Grade between sizes',
  take_in_waist: 'Take in waist', let_out_hips: 'Let out hips', narrow_shoulder: 'Narrow shoulder', lengthen_sleeves: 'Lengthen sleeves',
  shorten_sleeves: 'Shorten sleeves', raise_neckline: 'Raise neckline',
};

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
  const [alterations, setAlterations] = useState<Alteration[]>(current?.alterations ?? []);
  const done = () => { client.invalidateQueries(); onDone(); };
  useSheetDirty(rating !== (current?.rating ?? null) || body !== (current?.body ?? '') || sizeMade !== (current?.sizeMade ?? ''));
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      if (!rating) return;
      save.mutate({ id: entry.id, data: { rating, fit, difficulty, instructions, sizing, sizeMade: sizeMade.trim() || null, body: body.trim(), makeId, ...(pattern ? { alterations } : {}) } }, { onSuccess: done });
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
        <fieldset>
          <legend className="text-xs font-semibold">Alterations you made <span className="font-normal text-subtle">(optional, up to 8)</span></legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(Object.keys(ALTERATION_LABEL) as Alteration[]).map(a => {
              const on = alterations.includes(a);
              return (
                <button key={a} type="button" aria-pressed={on} disabled={!on && alterations.length >= 8}
                  onClick={() => setAlterations(list => (on ? list.filter(x => x !== a) : [...list, a]))}
                  className={`min-h-[40px] rounded-full border px-3 text-xs font-semibold disabled:opacity-40 ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink'}`}>{ALTERATION_LABEL[a]}</button>
              );
            })}
          </div>
        </fieldset>
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
    // No silent default: the person picks a category (unless it came from their own item).
    category: categories.includes(initial?.category as never) ? initial!.category! : '',
    url: '',
    difficulty: '' as '' | 'beginner' | 'intermediate' | 'advanced',
    sizes: '',
    source: 'designer' as 'designer' | 'free',
    price: '',
    currency: defaultCurrency(),
    mine: false,
  });
  const me = useGetProfile().data;
  const set = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  useSheetDirty(Boolean(form.name.trim() || form.maker.trim() || form.url.trim() || form.sizes.trim() || form.price.trim()));
  const priceCents = form.price.trim() ? Math.round(Number(form.price.replace(',', '.')) * 100) : null;
  const priceInvalid = priceCents !== null && !(Number.isFinite(priceCents) && priceCents >= 0 && priceCents <= 100000);
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      if (priceInvalid) return;
      const pattern = kind === 'pattern';
      create.mutate({
        data: {
          kind, name: form.name, maker: form.maker, category: form.category, url: form.url.trim() || null,
          difficulty: pattern && form.difficulty ? form.difficulty : null,
          sizes: pattern ? form.sizes.trim() || null : null,
          ...(pattern ? {
            source: form.source,
            priceCents: form.source === 'designer' ? priceCents : null,
            currency: form.source === 'designer' && priceCents !== null ? form.currency : null,
            designerHandle: form.mine && me?.handle ? me.handle : null,
          } : {}),
        },
      }, { onSuccess: onCreated });
    }}>
      <h2 className="font-display text-2xl">Add a {kind === 'pattern' ? 'pattern' : 'product'} page</h2>
      <div role="note" className="flex gap-2.5 rounded-[16px] bg-yellow px-4 py-3 text-sm">
        <Globe size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p><b>This page will be public.</b> Anyone, signed out too, can see the name, {kind === 'pattern' ? 'designer' : 'brand'} and details you add, and it's listed in the {kind === 'pattern' ? 'pattern directory' : 'catalog'}. Your own {kind === 'pattern' ? 'pattern' : 'item'} in your studio stays private. You can delete the page while nobody else uses it.</p>
      </div>
      <p className="text-sm text-subtle">Only add {kind === 'pattern' ? 'patterns' : 'products'} you can name; never upload pattern files.</p>
      <label className="block text-xs font-semibold">Name
        <input value={form.name} onChange={e => set('name', e.target.value)} required maxLength={120} className="field mt-1.5" placeholder={kind === 'pattern' ? 'Willa Dress' : 'Mara 100'} />
      </label>
      <label className="block text-xs font-semibold">{kind === 'pattern' ? 'Designer' : 'Brand'}
        <input value={form.maker} onChange={e => set('maker', e.target.value)} maxLength={120} className="field mt-1.5" placeholder={kind === 'pattern' ? 'Fernhill Patterns' : 'Gütermann'} />
      </label>
      <label className="block text-xs font-semibold">Category
        <select value={form.category} onChange={e => set('category', e.target.value)} required className="field mt-1.5">
          <option value="" disabled>Choose a category</option>
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
      {kind === 'pattern' && (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold">Where to get it</legend>
          <div role="radiogroup" aria-label="Where to get it" className="flex gap-1 rounded-full bg-canvas p-1">
            {([['designer', "Designer's site"], ['free', 'Free']] as const).map(([value, label]) => (
              <label key={value} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-full text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${form.source === value ? 'bg-ink text-white' : 'text-ink'}`}>
                <input type="radio" name="source" value={value} checked={form.source === value} onChange={() => set('source', value)} className="sr-only" />{label}
              </label>
            ))}
          </div>
          {form.source === 'designer' && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="block text-xs font-semibold">Price <span className="font-normal text-subtle">(optional)</span>
                <input value={form.price} onChange={e => set('price', e.target.value)} inputMode="decimal" maxLength={8} className="field mt-1.5" placeholder="16" aria-invalid={priceInvalid || undefined} />
              </label>
              <label className="block text-xs font-semibold">Currency
                <select value={form.currency} onChange={e => set('currency', e.target.value)} className="field mt-1.5">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              {priceInvalid && <p role="alert" className="col-span-2 text-sm font-semibold text-red-ink">Write the price as a number, up to 1000.</p>}
            </div>
          )}
        </fieldset>
      )}
      {kind === 'pattern' && me?.handle && (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={form.mine} onChange={e => set('mine', e.target.checked)} className="h-5 w-5 accent-ink" />
          I designed this pattern <span className="font-normal text-subtle">(people can follow you from it)</span>
        </label>
      )}
      <label className="block text-xs font-semibold">Where to buy it <span className="font-normal text-subtle">(optional link)</span>
        <input value={form.url} onChange={e => set('url', e.target.value)} type="url" inputMode="url" maxLength={500} className="field mt-1.5" placeholder="https://" />
      </label>
      {create.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't save. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={create.isPending} className="btn btn-primary flex-1 disabled:opacity-50">{create.isPending && <Loader2 size={15} className="animate-spin" />}{create.isPending ? 'Adding…' : 'Add page'}</button>
      </div>
    </form>
  );
}

/**
 * Corrections for the page's creator (or an admin): details, where to get it
 * with a price, "I designed this", and the size chart (body measurements, cm).
 */
export function EditEntryForm({ entry, sizes, onDone }: { entry: CatalogEntry; sizes: CatalogSize[]; onDone: () => void }) {
  const client = useQueryClient();
  const update = useUpdateCatalogEntry();
  const saveSizes = useSetCatalogSizes();
  const me = useGetProfile().data;
  const pattern = entry.kind === 'pattern';
  const [form, setForm] = useState({
    name: entry.name, maker: entry.maker, category: entry.category, difficulty: entry.difficulty ?? '', sizes: entry.sizes ?? '',
    fabricTypes: entry.fabricTypes ?? '', yardage: entry.yardage ?? '', url: entry.url ?? '', description: entry.description,
    source: (entry.source === 'free' ? 'free' : 'designer') as 'designer' | 'free',
    price: entry.priceCents !== null ? String(entry.priceCents / 100) : '', currency: entry.currency ?? defaultCurrency(),
    mine: Boolean(me?.handle && entry.designer?.handle === me.handle),
  });
  const [rows, setRows] = useState(sizes.map(s => ({ label: s.label, bust: s.bustCm?.toString() ?? '', waist: s.waistCm?.toString() ?? '', hip: s.hipCm?.toString() ?? '' })));
  const [error, setError] = useState('');
  const set = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  useSheetDirty(true);
  const categories = pattern ? PATTERN_CATEGORIES : PRODUCT_CATEGORIES;
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
  const priceCents = form.price.trim() ? Math.round(Number(form.price.replace(',', '.')) * 100) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (priceCents !== null && !(Number.isFinite(priceCents) && priceCents >= 0 && priceCents <= 100000)) return setError('Write the price as a number, up to 1000.');
    const chart = rows.filter(r => r.label.trim()).map(r => ({ label: r.label.trim(), bustCm: num(r.bust), waistCm: num(r.waist), hipCm: num(r.hip) }));
    if (chart.some(r => [r.bustCm, r.waistCm, r.hipCm].some(v => v !== null && !(Number.isFinite(v) && v >= 20 && v <= 300)))) return setError('Measurements are in cm, between 20 and 300.');
    try {
      await update.mutateAsync({ id: entry.id, data: {
        name: form.name, maker: form.maker, category: form.category, url: form.url.trim() || null, description: form.description,
        ...(pattern ? {
          difficulty: (form.difficulty || null) as 'beginner' | 'intermediate' | 'advanced' | null,
          sizes: form.sizes.trim() || null, fabricTypes: form.fabricTypes.trim() || null, yardage: form.yardage.trim() || null,
          source: form.source, priceCents: form.source === 'designer' ? priceCents : null,
          currency: form.source === 'designer' && priceCents !== null ? form.currency : null,
          ...(me?.handle && (form.mine || entry.designer?.handle === me.handle) ? { designerHandle: form.mine ? me.handle : null } : {}),
        } : {}),
      } });
      if (pattern) await saveSizes.mutateAsync({ id: entry.id, data: { sizes: chart } });
      await client.invalidateQueries();
      onDone();
    } catch (err) {
      setError(errorText(err, "That didn't save. Try again."));
    }
  };
  const busy = update.isPending || saveSizes.isPending;
  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="font-display text-2xl">Edit {entry.name}</h2>
      <label className="block text-xs font-semibold">Name<input value={form.name} onChange={e => set('name', e.target.value)} required maxLength={120} className="field mt-1.5" /></label>
      <label className="block text-xs font-semibold">{pattern ? 'Designer' : 'Brand'}<input value={form.maker} onChange={e => set('maker', e.target.value)} maxLength={120} className="field mt-1.5" /></label>
      <label className="block text-xs font-semibold">Category
        <select value={form.category} onChange={e => set('category', e.target.value)} className="field mt-1.5">{categories.map(c => <option key={c} value={c}>{capitalise(c)}</option>)}</select>
      </label>
      {pattern && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Difficulty
            <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className="field mt-1.5">
              <option value="">Not sure</option>{['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{capitalise(d)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">Sizes<input value={form.sizes} onChange={e => set('sizes', e.target.value)} maxLength={80} className="field mt-1.5" placeholder="4–30" /></label>
          <label className="block text-xs font-semibold">Fabric types<input value={form.fabricTypes} onChange={e => set('fabricTypes', e.target.value)} maxLength={120} className="field mt-1.5" placeholder="Wovens" /></label>
          <label className="block text-xs font-semibold">Fabric needed<input value={form.yardage} onChange={e => set('yardage', e.target.value)} maxLength={80} className="field mt-1.5" placeholder="2.6–3.4 m" /></label>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold">Where to get it</legend>
          <div role="radiogroup" aria-label="Where to get it" className="flex gap-1 rounded-full bg-canvas p-1">
            {([['designer', "Designer's site"], ['free', 'Free']] as const).map(([value, label]) => (
              <label key={value} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-full text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${form.source === value ? 'bg-ink text-white' : 'text-ink'}`}>
                <input type="radio" name="edit-source" value={value} checked={form.source === value} onChange={() => set('source', value)} className="sr-only" />{label}
              </label>
            ))}
          </div>
          {form.source === 'designer' && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="block text-xs font-semibold">Price <span className="font-normal text-subtle">(optional)</span><input value={form.price} onChange={e => set('price', e.target.value)} inputMode="decimal" maxLength={8} className="field mt-1.5" /></label>
              <label className="block text-xs font-semibold">Currency<select value={form.currency} onChange={e => set('currency', e.target.value)} className="field mt-1.5">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            </div>
          )}
        </fieldset>
        {me?.handle && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={form.mine} onChange={e => set('mine', e.target.checked)} className="h-5 w-5 accent-ink" />I designed this pattern
          </label>
        )}
      </>}
      <label className="block text-xs font-semibold">Where to buy it<input value={form.url} onChange={e => set('url', e.target.value)} type="url" inputMode="url" maxLength={500} className="field mt-1.5" placeholder="https://" /></label>
      <label className="block text-xs font-semibold">Description<textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} maxLength={2000} className="field mt-1.5 resize-y" /></label>
      {pattern && (
        <fieldset>
          <legend className="text-xs font-semibold">Size chart <span className="font-normal text-subtle">(body measurements in cm)</span></legend>
          <div className="mt-1.5 space-y-1.5">
            <div aria-hidden="true" className="grid grid-cols-[1fr_1fr_1fr_1fr_44px] gap-1.5 text-[11px] font-semibold text-subtle"><span>Size</span><span>Bust</span><span>Waist</span><span>Hip</span><span /></div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_44px] gap-1.5">
                {(['label', 'bust', 'waist', 'hip'] as const).map(k => (
                  <input key={k} value={r[k]} aria-label={`${k === 'label' ? 'Size' : capitalise(k)}, row ${i + 1}`} inputMode={k === 'label' ? 'text' : 'decimal'} maxLength={k === 'label' ? 20 : 6}
                    onChange={e => setRows(list => list.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} className="min-h-[44px] w-full min-w-0 rounded-[12px] border border-line px-2 text-sm" />
                ))}
                <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(list => list.filter((_, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-full hover:bg-canvas">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setRows(list => [...list, { label: '', bust: '', waist: '', hip: '' }])} disabled={rows.length >= 60} className="btn btn-line min-h-[40px]">Add a size</button>
          </div>
        </fieldset>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-ink">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={busy} className="btn btn-primary flex-1">{busy && <Loader2 size={15} className="animate-spin" />}Save</button>
      </div>
    </form>
  );
}

/**
 * Delete a page you added, while nobody else uses it (the API checks again).
 * Asks first; your own pattern stays in your library, unlinked.
 */
export function DeletePage({ entry, onDeleted }: { entry: CatalogEntry; onDeleted: () => void }) {
  const client = useQueryClient();
  const remove = useDeleteCatalogEntry();
  const [asking, setAsking] = useState(false);
  return (
    <section aria-labelledby="delete-page-title" className="mt-6 border-t border-line pt-5">
      <h3 id="delete-page-title" className="text-sm font-bold">Delete this page</h3>
      <p className="mt-1 text-sm text-subtle">You added it and nobody else uses it yet, so you can remove it from Seams Club. Your own {entry.kind === 'pattern' ? 'pattern' : 'item'} stays in your studio.</p>
      {!asking
        ? <button type="button" onClick={() => setAsking(true)} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-ink px-4 text-sm font-bold text-red-ink">
            <Trash2 size={15} aria-hidden="true" />Delete page
          </button>
        : <div role="group" aria-label={`Delete ${entry.name}?`} className="mt-3 flex flex-wrap items-center gap-2 rounded-[16px] bg-canvas p-3">
            <p className="min-w-[10rem] flex-1 text-sm font-semibold">Delete "{entry.name}" for everyone? This can't be undone.</p>
            <button type="button" autoFocus onClick={() => setAsking(false)} className="min-h-[44px] rounded-full bg-white px-4 text-sm font-bold">Keep it</button>
            <button type="button" disabled={remove.isPending}
              onClick={() => remove.mutate({ id: entry.id }, { onSuccess: () => { client.invalidateQueries(); onDeleted(); } })}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-red-ink px-4 text-sm font-bold text-white disabled:opacity-60">
              {remove.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}Delete
            </button>
          </div>}
      {remove.isError && <p role="alert" className="mt-2 text-sm font-semibold text-red-ink">{errorText(remove.error, "Couldn't delete the page.")}</p>}
    </section>
  );
}
