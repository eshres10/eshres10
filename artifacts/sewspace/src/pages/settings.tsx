import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, useGetProfile, useUpdateProfile } from '@workspace/api-client-react';
import { Camera, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { ErrorState, Loading } from '@/components/common';
import { HandleField } from '@/components/profile/HandleField';
import { BlockedAccounts } from '@/components/social/BlockedAccounts';
import { uploadFile } from '@/lib/upload';
import { VisibilityPicker, type Visibility } from '@/components/visibility';

const BIO_MAX = 500;

function errorMessage(error: unknown): string {
  return (error as { data?: { error?: string } })?.data?.error ?? "We couldn't save your changes. Try again.";
}

/** Profile & settings: public identity (name, handle, bio, avatar) and studio preferences. */
export function SettingsPage() {
  const profile = useGetProfile();
  const update = useUpdateProfile();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: '', handle: '', bio: '', avatarUrl: null as string | null, units: 'metric' as 'metric' | 'imperial', experience: '', favoriteGarments: '', defaultPostVisibility: 'public' as Visibility });
  const [handleValid, setHandleValid] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saved, setSaved] = useState(false);
  const onValidity = useCallback((v: boolean) => setHandleValid(v), []);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({ name: p.name, handle: p.handle ?? '', bio: p.bio, avatarUrl: p.avatarUrl, units: p.units, experience: p.experience, favoriteGarments: p.favoriteGarments.join(', '), defaultPostVisibility: p.defaultPostVisibility });
  }, [profile.data]);
  // The account menu's "Posts visible to" opens /settings#privacy.
  const loaded = Boolean(profile.data);
  useEffect(() => { if (loaded && window.location.hash === '#privacy') document.getElementById('privacy')?.scrollIntoView(); }, [loaded]);

  if (profile.isLoading) return <Loading />;
  if (profile.isError || !profile.data) return <ErrorState retry={() => profile.refetch()} />;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setSaved(false); setForm(current => ({ ...current, [key]: value })); };

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const { url } = await uploadFile(file, 'avatar');
      set('avatarUrl', url);
    } catch (error) {
      setUploadError((error as Error).message || "That photo didn't upload. Try a JPG, PNG or WebP under 10 MB.");
    } finally {
      setUploading(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleValid || uploading) return;
    update.mutate({
      data: {
        name: form.name.trim(),
        handle: form.handle,
        bio: form.bio.trim(),
        avatarUrl: form.avatarUrl,
        units: form.units,
        experience: form.experience.trim(),
        favoriteGarments: form.favoriteGarments.split(',').map(item => item.trim()).filter(Boolean),
        defaultPostVisibility: form.defaultPostVisibility,
      },
    }, {
      onSuccess: data => {
        client.setQueryData(getGetProfileQueryKey(), data);
        setSaved(true);
      },
    });
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-[760px] space-y-5">
      <section className="studio-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Public profile</p>
            <p className="mt-1 text-sm text-subtle">Anyone can see your name, handle, bio and photo, even without an account.</p>
          </div>
          {profile.data.handle && <Link href={`/@${profile.data.handle}`} className="btn btn-line"><ExternalLink size={15} aria-hidden="true" />View profile</Link>}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <UserAvatar name={form.name} avatarUrl={form.avatarUrl} size={88} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="btn btn-quiet" data-testid="button-upload-avatar">
              {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}{form.avatarUrl ? 'Change photo' : 'Add photo'}
            </button>
            {form.avatarUrl && <button type="button" onClick={() => set('avatarUrl', null)} className="btn btn-line"><Trash2 size={15} aria-hidden="true" />Remove</button>}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickAvatar} className="sr-only" tabIndex={-1} aria-hidden="true" />
          </div>
          {uploadError && <p role="alert" className="w-full text-sm font-semibold text-red-ink">{uploadError}</p>}
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Name
            <input value={form.name} onChange={e => set('name', e.target.value)} required maxLength={100} autoComplete="name" className="field mt-1.5" data-testid="input-profile-name" />
          </label>
          <HandleField value={form.handle} onChange={value => set('handle', value)} onValidityChange={onValidity} />
          <label className="block text-xs font-semibold sm:col-span-2">Bio
            <textarea value={form.bio} onChange={e => set('bio', e.target.value.slice(0, BIO_MAX))} rows={4} className="field mt-1.5 resize-y" placeholder="What do you love to sew?" data-testid="input-profile-bio" />
            <span className="mt-1 block text-right font-normal text-subtle">{form.bio.length}/{BIO_MAX}</span>
          </label>
        </div>
      </section>

      <section className="studio-card p-6 sm:p-8">
        <p className="eyebrow">Studio preferences</p>
        <p className="mt-1 text-sm text-subtle">Private. Only used to tailor your studio and the assistant.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="text-xs font-semibold">Units</legend>
            <div className="mt-1.5 flex gap-1 rounded-full bg-canvas p-1">
              {(['metric', 'imperial'] as const).map(unit => (
                <label key={unit} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-full text-sm font-bold ${form.units === unit ? 'bg-ink text-white' : 'text-ink'}`}>
                  <input type="radio" name="units" value={unit} checked={form.units === unit} onChange={() => set('units', unit)} className="sr-only" />
                  {unit === 'metric' ? 'Metric (cm, m)' : 'Imperial (in, yd)'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-semibold">Experience
            <select value={form.experience} onChange={e => set('experience', e.target.value)} className="field mt-1.5" data-testid="input-profile-experience">
              {['beginner', 'intermediate', 'advanced'].concat(['beginner', 'intermediate', 'advanced'].includes(form.experience) ? [] : [form.experience]).filter(Boolean).map(level => <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">Favourite garments
            <input value={form.favoriteGarments} onChange={e => set('favoriteGarments', e.target.value)} className="field mt-1.5" placeholder="Dresses, shirts, trousers" data-testid="input-profile-garments" />
          </label>
        </div>
      </section>

      <section id="privacy" aria-labelledby="privacy-title" className="studio-card scroll-mt-28 p-6 sm:p-8">
        <h2 id="privacy-title" className="eyebrow">Privacy</h2>
        <p className="mt-1 text-sm text-subtle">Who new posts are for when you start one. You can still change it on each post.</p>
        <div className="mt-5 max-w-md">
          <VisibilityPicker legend="New posts are visible to" value={form.defaultPostVisibility} onChange={value => set('defaultPostVisibility', value)} />
        </div>
      </section>

      <section className="studio-card flex flex-wrap items-center justify-between gap-3 p-6 sm:p-8">
        <div>
          <p className="eyebrow">Setup with Pip</p>
          <p className="mt-1 text-sm text-subtle">Answer Pip's questions again to get new suggestions. Your answers stay private.</p>
        </div>
        <Link href="/welcome" className="btn btn-line min-h-[44px]">Run setup again</Link>
      </section>

      <BlockedAccounts />

      <div className="sticky bottom-28 z-20 flex flex-wrap items-center justify-end gap-3 rounded-[30px] bg-white/95 p-3 shadow-float backdrop-blur md:bottom-4">
        {update.isError && <p role="alert" className="mr-auto pl-2 text-sm font-semibold text-red-ink">{errorMessage(update.error)}</p>}
        {saved && !update.isError && <p role="status" className="mr-auto pl-2 text-sm font-semibold text-blue-ink">Saved.</p>}
        <button type="submit" disabled={!handleValid || uploading || update.isPending || !form.name.trim()} className="btn btn-primary disabled:opacity-50" data-testid="button-save-profile">
          {update.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Save changes
        </button>
      </div>
    </form>
  );
}
