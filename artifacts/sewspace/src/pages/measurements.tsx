import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListMeasurementProfilesQueryKey, useCreateMeasurementProfile, useDeleteMeasurementProfile, useGetProfile, useListMeasurementProfiles, useUpdateMeasurementProfile } from '@workspace/api-client-react';
import { Loader2, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { ErrorState, Heading, Loading, Modal } from '@/components/common';
import { MobileMeasurements } from '@/components/studio/MobileMeasurements';
import { AnyRecord } from '@/lib/types';

export const measurementFields = [
  ['bust', 'Bust'], ['neck', 'Neck'], ['rise', 'Rise'], ['waist', 'Waist'], ['wrist', 'Wrist'],
  ['height', 'Height'], ['inseam', 'Inseam'], ['fullHip', 'Full hip'], ['highHip', 'High hip'],
  ['upperArm', 'Upper arm'], ['armLength', 'Arm length'], ['underbust', 'Underbust'],
  ['backLength', 'Back length'], ['frontLength', 'Front length'], ['shoulderWidth', 'Shoulder width'],
] as const;

export function MeasurementsPage() {
  const q = useListMeasurementProfiles();
  const profile = useGetProfile();
  const create = useCreateMeasurementProfile();
  const update = useUpdateMeasurementProfile();
  const remove = useDeleteMeasurementProfile();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<AnyRecord>({ measurements: {} });
  const unit = profile.data?.units === 'imperial' ? 'in' : 'cm';

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', recordedAt: new Date().toISOString().slice(0, 10), notes: '', measurements: {} });
    setOpen(true);
  };
  const openEdit = (item: AnyRecord) => {
    setEditing(item);
    setForm({ ...item, measurements: { ...(item.measurements || {}) } });
    setOpen(true);
  };
  // The studio's + on phones opens a new set through ?new=1.
  const [, setLocation] = useLocation();
  const wantsNew = new URLSearchParams(useSearch()).get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    openNew();
    setLocation('/measurements', { replace: true });
  }, [wantsNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => {
    client.invalidateQueries({ queryKey: getListMeasurementProfilesQueryKey() });
    setOpen(false);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { name: form.name, recordedAt: form.recordedAt, notes: form.notes || null, measurements: form.measurements || {} };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: refresh });
    else create.mutate({ data: payload }, { onSuccess: refresh });
  };
  const removeProfile = (id: number) => remove.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMeasurementProfilesQueryKey() }) });
  const deleteProfile = (id: number) => {
    if (window.confirm('Remove this measurement profile?')) removeProfile(id);
  };

  return <>
    <div className="hidden md:block"><Heading eyebrow="Fit / body record" title="Measurements" copy={`Record each measurement separately in ${unit}. Clear labels make profiles easier to update and compare.`} action={<button onClick={openNew} className="btn btn-primary min-h-[44px] w-full md:w-auto" data-testid="button-add-measurements"><Plus size={16} /> Add profile</button>} /></div>
    {/* Phones: set pills, comparison and grouped cards (the mobile + asks with ?new=1; delete asks twice in place). */}
    {!q.isLoading && !q.isError && <div className="md:hidden"><MobileMeasurements sets={q.data ?? []} storedUnit={unit} onNew={openNew} onEdit={openEdit} onDelete={removeProfile} /></div>}
    <div className={q.isLoading || q.isError ? '' : 'hidden md:block'}>
    {q.isLoading ? <Loading /> : q.isError ? <ErrorState retry={() => q.refetch()} /> : !(q.data || []).length ? <div className="studio-card rounded-xl px-5 py-20 text-center"><Ruler className="mx-auto text-red-ink" /><h2 className="mt-5 font-display text-2xl">Start with your measurements</h2><p className="mt-2 text-sm text-muted-foreground">A structured profile makes fitting and pattern adjustments easier.</p><button onClick={openNew} className="btn btn-primary mt-5 min-h-[44px]">Add measurements</button></div> :
      <div className="grid gap-5 xl:grid-cols-2">{(q.data || []).map(item => <article key={item.id} className="studio-card rounded-xl p-5" data-testid={`card-measurements-${item.id}`}><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Recorded {item.recordedAt}</p><h2 className="mt-2 font-display text-2xl">{item.name}</h2></div><div className="flex gap-2"><button onClick={() => openEdit(item)} className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-canvas" aria-label={`Edit ${item.name}`}><Pencil size={16} className="sm:w-3.5 sm:h-3.5" /></button><button onClick={() => deleteProfile(item.id)} className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-canvas text-red-ink" aria-label={`Delete ${item.name}`}><Trash2 size={16} className="sm:w-3.5 sm:h-3.5" /></button></div></div><dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">{measurementFields.map(([key, label]) => <div key={key} className="border-t border-line pt-2"><dt className="text-[.68rem] font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 font-mono-custom text-sm">{item.measurements[key] ?? '—'}{item.measurements[key] != null && <span className="ml-1 text-[.62rem] text-muted-foreground">{unit}</span>}</dd></div>)}</dl>{item.notes && <p className="mt-5 text-sm leading-6 text-muted-foreground">{item.notes}</p>}</article>)}</div>}
    </div>
    {open && <Modal title={editing ? 'Update measurements' : 'Add measurements'} close={() => setOpen(false)}><form onSubmit={save}><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-semibold">Profile name</span><input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="field" data-testid="input-measurement-name" /></label><label><span className="mb-1.5 block text-xs font-semibold">Recorded on</span><input required type="date" value={form.recordedAt || ''} onChange={e => setForm({ ...form, recordedAt: e.target.value })} className="field" data-testid="input-measurement-date" /></label></div><div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-canvas" /><span className="font-mono-custom text-[.65rem] uppercase tracking-[.14em] text-muted-foreground">Body measurements · {unit}</span><span className="h-px flex-1 bg-canvas" /></div><div className="grid gap-4 sm:grid-cols-2">{measurementFields.map(([key, label]) => <label key={key}><span className="mb-1.5 block text-xs font-semibold">{label}</span><div className="relative"><input type="number" min="0" step="0.1" value={form.measurements?.[key] ?? ''} onChange={e => setForm({ ...form, measurements: { ...(form.measurements || {}), [key]: e.target.value === '' ? undefined : Number(e.target.value) } })} className="field pr-10" data-testid={`input-measurement-${key}`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span></div></label>)}</div><label className="mt-5 block"><span className="mb-1.5 block text-xs font-semibold">Notes</span><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="field resize-none" /></label><div className="sticky bottom-0 -mx-5 -mb-5 bg-white/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-line sm:border-none pt-4 sm:pt-6 mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 z-10"><button type="button" onClick={() => setOpen(false)} className="btn btn-line min-h-[44px]">Cancel</button><button type="submit" disabled={create.isPending || update.isPending} className="btn btn-primary min-h-[44px]">{(create.isPending || update.isPending) && <Loader2 size={15} className="animate-spin" />} Save measurements</button></div></form></Modal>}
  </>;
}
