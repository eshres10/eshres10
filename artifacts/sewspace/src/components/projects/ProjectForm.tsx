import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { VisibilityPicker, type Visibility } from '@/components/visibility';
import { uploadFile } from '@/lib/upload';
import {
  useListPatterns,
  useListFabrics,
  useListThreads,
  useListMeasurementProfiles,
  useCreateProject,
  useUpdateProject,
  getListProjectsQueryKey,
  getGetProjectQueryKey
} from '@workspace/api-client-react';

export function ProjectFormModal({
  project,
  close
}: {
  project?: any,
  close: () => void
}) {
  const isEditing = !!project;
  const client = useQueryClient();
  const create = useCreateProject();
  const update = useUpdateProject();

  const { data: patterns = [] } = useListPatterns();
  const { data: fabrics = [] } = useListFabrics();
  const { data: threads = [] } = useListThreads();
  const { data: measurements = [] } = useListMeasurementProfiles();

  const [form, setForm] = useState<any>({
    name: project?.name || '',
    status: project?.status || 'planning',
    progress: project?.progress || 0,
    patternId: project?.patternId || '',
    fabricId: project?.fabricId || '',
    threadId: project?.threadId || '',
    measurementProfileId: project?.measurementProfileId || '',
    coverImageUrl: project?.coverImageUrl || '',
    description: project?.description || '',
    notes: project?.notes || '',
    alterations: project?.alterations || '',
    problems: project?.problems || '',
    solutions: project?.solutions || '',
    size: project?.size || '',
    visibility: (project?.visibility as Visibility) || 'private'
  });

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');
    try {
      const { url } = await uploadFile(file, 'image');
      setForm((f: any) => ({ ...f, coverImageUrl: url }));
    } catch (err: any) {
      setUploadError(err.message || 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      status: form.status,
      progress: Number(form.progress),
      patternId: form.patternId ? Number(form.patternId) : null,
      fabricId: form.fabricId ? Number(form.fabricId) : null,
      threadId: form.threadId ? Number(form.threadId) : null,
      measurementProfileId: form.measurementProfileId ? Number(form.measurementProfileId) : null,
      coverImageUrl: form.coverImageUrl || null,
      description: form.description || null,
      notes: form.notes || null,
      alterations: form.alterations || null,
      problems: form.problems || null,
      solutions: form.solutions || null,
      size: form.size.trim() || null,
      visibility: form.visibility,
    };

    const done = (data: any) => {
      client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      if (isEditing) {
        client.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      }
      close();
    };

    if (isEditing) {
      update.mutate({ id: project.id, data: payload }, { onSuccess: done });
    } else {
      create.mutate({ data: payload }, { onSuccess: done });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-2xl sm:rounded-xl border border-line bg-white shadow-[0_-8px_40px_rgba(44,30,21,.12)] sm:shadow-[0_24px_80px_rgba(44,30,21,.22)]">
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between rounded-t-2xl sm:rounded-t-xl bg-white/95 px-5 pt-5 pb-4 backdrop-blur sm:px-8 sm:pt-8 sm:pb-6 border-b border-line sm:border-none">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl text-ink">{isEditing ? 'Edit project' : 'Start a project'}</h2>
            <p className="mt-1 text-xs sm:text-sm text-subtle">{isEditing ? 'Update the details of your make.' : 'Log a new make in your notebook.'}</p>
          </div>
          <button onClick={close} data-testid="button-close-dialog" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-canvas" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-0 sm:pb-8">
          <form onSubmit={save} className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Project name <span className="text-red-ink">*</span></span>
              <input
                required
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                data-testid="input-name"
                className="field bg-white"
                placeholder="E.g. Summer Linen Dress"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Stage</span>
              <select
                value={form.status}
                onChange={e => setForm({...form, status: e.target.value})}
                data-testid="input-status"
                className="field bg-white"
              >
                <option value="planning">Planning</option>
                <option value="cutting">Cutting</option>
                <option value="sewing">Sewing</option>
                <option value="fitting">Fitting</option>
                <option value="finished">Finished</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Size made</span>
              <input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} data-testid="input-size" className="field bg-white" placeholder="E.g. 12, graded to 14 at the hip" maxLength={60} />
            </label>

            <div className="md:col-span-2">
              <VisibilityPicker value={form.visibility} onChange={visibility => setForm({ ...form, visibility })}
                legend="Who can see this make" note="Your measurements and pattern PDFs are never shown." />
            </div>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Progress %</span>
              <input
                type="number"
                min="0"
                max="100"
                value={form.progress}
                onChange={e => setForm({...form, progress: e.target.value})}
                data-testid="input-progress"
                className="field bg-white"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Cover image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                disabled={uploading}
                data-testid="input-coverImageUrl"
                className="field file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-xs file:font-semibold bg-white"
              />
              {uploading && <span className="mt-1 flex items-center gap-1 text-xs text-red-ink"><Loader2 size={12} className="animate-spin" /> Uploading…</span>}
              {uploadError && <span className="mt-1 block text-xs text-red-ink">{uploadError}</span>}
              {form.coverImageUrl && !uploading && <span className="mt-1 block text-xs text-blue-ink">Cover image attached</span>}
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Pattern</span>
              <select
                value={form.patternId}
                onChange={e => setForm({...form, patternId: e.target.value})}
                data-testid="input-patternId"
                className="field bg-white"
              >
                <option value="">No pattern selected</option>
                {patterns.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Main fabric</span>
              <select
                value={form.fabricId}
                onChange={e => setForm({...form, fabricId: e.target.value})}
                data-testid="input-fabricId"
                className="field bg-white"
              >
                <option value="">No fabric selected</option>
                {fabrics.map((f: any) => <option key={f.id} value={f.id}>{f.name} ({f.color})</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Primary thread</span>
              <select
                value={form.threadId}
                onChange={e => setForm({...form, threadId: e.target.value})}
                data-testid="input-threadId"
                className="field bg-white"
              >
                <option value="">No thread selected</option>
                {threads.map((t: any) => <option key={t.id} value={t.id}>{t.colorName} ({t.brand})</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Measurement profile</span>
              <select
                value={form.measurementProfileId}
                onChange={e => setForm({...form, measurementProfileId: e.target.value})}
                data-testid="input-measurementProfileId"
                className="field bg-white"
              >
                <option value="">No profile selected</option>
                {measurements.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-subtle">Description</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                data-testid="input-description"
                className="field resize-none bg-white"
                placeholder="What are you making?"
              />
            </label>
          </div>

          <div className="border-t border-line pt-6">
            <h3 className="mb-4 font-mono-custom text-[.7rem] uppercase tracking-[.15em] text-subtle">Journal & Notes</h3>
            <div className="grid gap-5 md:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-subtle">General notes</span>
                <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} data-testid="input-notes" className="field resize-none bg-white" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-subtle">Alterations made</span>
                <textarea rows={3} value={form.alterations} onChange={e => setForm({...form, alterations: e.target.value})} data-testid="input-alterations" className="field resize-none bg-white" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-subtle">Problems encountered</span>
                <textarea rows={3} value={form.problems} onChange={e => setForm({...form, problems: e.target.value})} data-testid="input-problems" className="field resize-none bg-white" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-subtle">Solutions & fixes</span>
                <textarea rows={3} value={form.solutions} onChange={e => setForm({...form, solutions: e.target.value})} data-testid="input-solutions" className="field resize-none bg-white" />
              </label>
            </div>
          </div>

          {(create.isError || update.isError) && (
            <div className="rounded-lg bg-peach-soft p-3 text-sm text-red-ink">
              {create.error?.message || update.error?.message || 'Something went wrong saving the project.'}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 -mb-5 bg-white/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-line pt-4 sm:pt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-8 z-10">
            <button type="button" onClick={close} data-testid="button-cancel-project" className="btn btn-line min-h-[44px]">Cancel</button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending || uploading}
              data-testid="button-save-project"
              className="btn btn-primary min-h-[44px] min-w-[120px]"
            >
              {(create.isPending || update.isPending) ? <Loader2 size={16} className="animate-spin" /> : 'Save project'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
