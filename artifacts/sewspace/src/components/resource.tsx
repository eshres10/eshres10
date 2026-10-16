import { VisibilityBadge, VisibilityPicker, type Visibility } from '@/components/visibility';
import { uploadFile as storeFile } from '@/lib/upload';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalyzePatternPdf } from '@workspace/api-client-react';
import { Download, FileText, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ErrorState, Heading, Loading, Modal } from '@/components/common';
import { AnyRecord } from '@/lib/types';

export type Field = { key: string; label: string; type?: string; options?: string[]; accept?: string; fileNameKey?: string; attachedLabel?: string; help?: string };
export const REQUIRED_FIELD_KEYS = new Set(['name', 'type', 'color', 'brand', 'colorName', 'garmentType', 'difficulty']);

export function Fields({ fields, value, change, upload, uploading, uploadStatus, activeUploadField }: { fields: Field[]; value: AnyRecord; change: (v: AnyRecord) => void; upload?: (file: File, key: string, fileNameKey?: string) => void; uploading?: boolean; uploadStatus?: string; activeUploadField?: string }) {
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map(f => {
    const isRequired = REQUIRED_FIELD_KEYS.has(f.key);
    const inputProps = { 'aria-required': isRequired || undefined, 'data-testid': `input-${f.key}` };
    if (f.type === 'visibility') return <div key={f.key} className="sm:col-span-2"><VisibilityPicker value={(value[f.key] as Visibility) ?? 'private'} onChange={v => change({ ...value, [f.key]: v })} legend={f.label} note={f.help} /></div>;
    return <label key={f.key} className={f.type === 'textarea' || f.type === 'file' ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-subtle">
        {f.label}{isRequired && <span className="ml-1 text-red-ink" aria-hidden="true">*</span>}
      </span>
      {f.type === 'file' ? <>
        <input type="file" accept={f.accept || 'image/*'} disabled={uploading} onChange={e => { const file = e.target.files?.[0]; if (file && upload) upload(file, f.key, f.fileNameKey); }} {...inputProps} className="field file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-xs" />
        {uploading && activeUploadField === f.key && <span className="mt-1 flex items-center gap-1.5 text-xs text-red-ink"><Loader2 size={12} className="animate-spin" />{uploadStatus || 'Uploading to your private studio…'}</span>}
        {!uploading && uploadStatus && activeUploadField === f.key && <span className={`mt-1 block text-xs ${uploadStatus.startsWith('Could not') ? 'text-red-ink' : 'text-blue-ink'}`}>{uploadStatus}</span>}
        {value[f.key] && <span className="mt-1 block truncate text-xs text-blue-ink">{f.attachedLabel || 'File attached'}{f.fileNameKey && value[f.fileNameKey] ? ` · ${value[f.fileNameKey]}` : ''}</span>}
      </> : f.type === 'textarea' ?
        <textarea rows={3} value={value[f.key] ?? ''} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field resize-none" /> :
        f.options ?
          <select value={value[f.key] ?? f.options[0]} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field">{f.options.map(o => <option value={o} key={o}>{o.replaceAll('_', ' ')}</option>)}</select> :
          <input type={f.type || 'text'} value={value[f.key] ?? ''} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field" />}
    </label>;
  })}</div>;
}

export function Resource({ kind, useQuery, fields, title, meta, extra, create, update, remove, keyFor }: { kind: string; useQuery: (s: string) => any; fields: Field[]; title: (x: AnyRecord) => string; meta: (x: AnyRecord) => string; extra?: (x: AnyRecord) => React.ReactNode; create: any; update: any; remove: any; keyFor: (s: string) => readonly unknown[] }) {
  const [search, setSearch] = useState(''); const [edit, setEdit] = useState<AnyRecord | null>(null); const [open, setOpen] = useState(false); const [menuId, setMenuId] = useState<number | null>(null); const [form, setForm] = useState<AnyRecord>({}); const [uploadingFile, setUploadingFile] = useState(false); const [saveWhenReady, setSaveWhenReady] = useState(false); const [uploadStatus, setUploadStatus] = useState(''); const [activeUploadField, setActiveUploadField] = useState(''); const q = useQuery(search); const client = useQueryClient(); const key = keyFor(search); const analyzePdf = useAnalyzePatternPdf();
  const uploadFile = async (file: File, fieldKey: string, fileNameKey?: string) => {
    const isPdf = fieldKey === 'pdfUrl';
    if (isPdf && (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf'))) {
      setUploadStatus('Could not upload: choose a valid PDF file.');
      return;
    }
    setActiveUploadField(fieldKey);
    setUploadingFile(true);
    setUploadStatus('Uploading to your private studio…');
    try {
      const { url: storedUrl } = await storeFile(file, isPdf ? 'pattern_pdf' : 'image');
      setForm(current => ({ ...current, [fieldKey]: storedUrl, ...(fileNameKey ? { [fileNameKey]: file.name } : {}) }));

      if (isPdf) {
        setUploadStatus('PDF uploaded. AI is reading the pattern details…');
        try {
          const details = await analyzePdf.mutateAsync({ data: { pdfUrl: storedUrl } });
          setForm(current => {
            const prefilled = { ...current };
            Object.entries(details).forEach(([detailKey, detailValue]) => {
              if ((prefilled[detailKey] == null || prefilled[detailKey] === '') && detailValue != null && detailValue !== '') {
                prefilled[detailKey] = detailValue;
              }
            });
            return prefilled;
          });
          setUploadStatus('PDF uploaded and available details were filled in. Review them before saving.');
        } catch {
          setUploadStatus('PDF uploaded, but AI could not read its details. You can still complete and save the form.');
        }
      } else {
        setUploadStatus('Upload complete.');
      }
    } catch (error) {
      setUploadStatus(`Could not upload: ${error instanceof Error ? error.message : 'please try again.'}`);
    } finally {
      setUploadingFile(false);
    }
  };
  const persistForm = () => {
    const payload = { ...form };
    fields.forEach(field => {
      if (field.options && (payload[field.key] == null || payload[field.key] === '')) {
        payload[field.key] = field.options[0];
      }
    });
    const missingFields = fields.filter(field =>
      REQUIRED_FIELD_KEYS.has(field.key) &&
      (payload[field.key] == null || String(payload[field.key]).trim() === '')
    );
    if (missingFields.length) {
      const labels = missingFields.map(field => field.label);
      window.alert(`Please complete the required ${labels.length === 1 ? 'field' : 'fields'}:\n\n${labels.map(label => `• ${label}`).join('\n')}`);
      document.querySelector<HTMLElement>(`[data-testid="input-${missingFields[0].key}"]`)?.focus();
      return;
    }
    Object.keys(payload).forEach(k => {
      if (payload[k] === '') payload[k] = null;
      if (['width', 'quantity', 'yardage', 'progress'].includes(k) && payload[k] !== null) payload[k] = Number(payload[k]);
      if (k === 'measurements' && typeof payload[k] === 'string') {
        try { payload[k] = JSON.parse(payload[k]); } catch { payload[k] = {}; }
      }
    });
    const done = () => {
      client.invalidateQueries({ queryKey: key });
      setOpen(false);
    };
    const failed = (error: unknown) => {
      setActiveUploadField(current => current || fields.find(field => field.type === 'file')?.key || '');
      setUploadStatus(`Could not save entry: ${error instanceof Error ? error.message : 'please check the form and try again.'}`);
    };
    if (edit) update.mutate({ id: edit.id, data: payload }, { onSuccess: done, onError: failed });
    else create.mutate({ data: payload }, { onSuccess: done, onError: failed });
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingFile) {
      setSaveWhenReady(true);
      setUploadStatus('Upload in progress. This entry will save automatically when ready.');
      return;
    }
    persistForm();
  };
  useEffect(() => {
    if (!uploadingFile && saveWhenReady) {
      setSaveWhenReady(false);
      persistForm();
    }
  }, [uploadingFile, saveWhenReady]);
  const del = (id: number) => { if (window.confirm('Remove this from your studio?')) remove.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: key }) }); };
  const add = () => { setEdit(null); setForm({}); setSaveWhenReady(false); setUploadStatus(''); setOpen(true); };
  const downloadDetails = (item: AnyRecord) => {
    const omitted = new Set(['id', 'userId', 'isDemo', 'createdAt', 'updatedAt', 'imageUrl', 'coverImageUrl', 'pdfUrl']);
    const details = Object.entries(item).filter(([key, value]) => !omitted.has(key) && value != null && value !== '').map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
    const url = URL.createObjectURL(new Blob([`${title(item)}\n${'='.repeat(title(item).length)}\n\n${details}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title(item).toLowerCase().replace(/[^a-z0-9]+/g, '-') || kind.toLowerCase().replace(/\s+/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuId(null);
  };
  const openEdit = (item: AnyRecord) => { setEdit(item); setForm(item); setOpen(true); setMenuId(null); };
  return <><Heading eyebrow={kind === 'Fabric stash' ? 'The stash' : 'The library'} title={kind} copy={`Keep the details close. Your ${kind.toLowerCase()} are always one search away.`} action={<button onClick={add} data-testid={`button-add-${kind}`} className="btn btn-primary min-h-[44px] w-full md:w-auto"><Plus size={16} /> Add entry</button>} /><div className="mb-6 flex items-center gap-3"><div className="relative w-full max-w-sm flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" /><input value={search} onChange={e => setSearch(e.target.value)} data-testid={`input-search-${kind}`} placeholder={`Search ${kind.toLowerCase()}…`} className="field pl-9 min-h-[44px]" /></div><span className="font-mono-custom text-xs text-subtle hidden sm:inline">{(q.data || []).length} found</span></div>{q.isLoading ? <Loading /> : q.isError ? <ErrorState retry={() => q.refetch()} /> : (q.data || []).length === 0 ? <div className="studio-card rounded-xl px-5 py-20 text-center" data-testid="state-empty"><Plus className="mx-auto text-red-ink" /><h2 className="mt-5 font-display text-2xl">A little room to fill</h2><p className="mt-2 text-sm text-muted-foreground">Your {kind.toLowerCase()} is waiting for its first entry.</p><button onClick={add} data-testid="button-empty-add" className="btn btn-primary mt-5 min-h-[44px]"><Plus size={15} /> Add entry</button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(q.data || []).map((item: AnyRecord, i: number) => <article key={item.id} data-testid={`card-${kind}-${item.id}`} className="studio-card group overflow-visible rounded-xl"><div className={`relative h-40 overflow-hidden rounded-t-xl ${kind === 'Fabric stash' ? 'bg-peach' : 'bg-peach'}`}>{item.imageUrl || item.coverImageUrl ? <img src={item.imageUrl || item.coverImageUrl} alt={title(item)} className="h-full w-full object-cover" /> : item.pdfUrl ? <><iframe src={`${item.pdfUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title={`${title(item)} PDF preview`} loading="lazy" tabIndex={-1} className="pointer-events-none h-[220%] w-full -translate-y-2 border-0 bg-white" data-testid={`thumbnail-pattern-pdf-${item.id}`} /><span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-ink/90 px-2 py-1 font-mono-custom text-[.55rem] uppercase text-white"><FileText size={11} /> PDF preview</span></> : <div className={`h-full w-full opacity-70 ${i % 3 === 0 ? 'bg-[repeating-linear-gradient(45deg,#ff8562_0_3px,transparent_3px_12px)]' : i % 3 === 1 ? 'bg-[radial-gradient(#000_1.5px,transparent 1.5px)] [background-size:14px_14px]' : 'bg-[repeating-linear-gradient(0deg,#f34646_0_2px,transparent_2px_9px)]'}`} />}<span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 font-mono-custom text-[.6rem] uppercase text-subtle">{item.isDemo ? 'Studio sample' : kind}</span></div><div className="p-4"><div className="flex justify-between gap-3"><div><h3 className="font-display text-[1.45rem] leading-tight">{title(item)}</h3><p className="mt-1 text-xs text-muted-foreground">{meta(item)}</p><VisibilityBadge value={item.visibility} className="mt-2" /></div><div className="relative"><button onClick={() => setMenuId(current => current === item.id ? null : item.id)} data-testid={`button-card-menu-${item.id}`} aria-label={`More options for ${title(item)}`} aria-expanded={menuId === item.id} className="grid h-11 w-11 place-items-center rounded-full text-subtle hover:bg-canvas md:h-8 md:w-8"><MoreHorizontal size={18} /></button>{menuId === item.id && <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-xl md:w-44 md:top-9"><button onClick={() => openEdit(item)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-canvas md:gap-2 md:px-3 md:py-2 md:text-xs"><Pencil size={16} className="md:w-3.5 md:h-3.5" /> Edit entry</button>{item.imageUrl && <a href={item.imageUrl} download={`${title(item)}-photo`} onClick={() => setMenuId(null)} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-canvas md:gap-2 md:px-3 md:py-2 md:text-xs"><Download size={16} className="md:w-3.5 md:h-3.5" /> Download photo</a>}<button onClick={() => downloadDetails(item)} data-testid={`button-download-details-${item.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-canvas md:gap-2 md:px-3 md:py-2 md:text-xs"><FileText size={16} className="md:w-3.5 md:h-3.5" /> Download details</button><button onClick={() => { setMenuId(null); del(item.id); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-red-ink hover:bg-peach-soft md:gap-2 md:px-3 md:py-2 md:text-xs"><Trash2 size={16} className="md:w-3.5 md:h-3.5" /> Delete entry</button></div>}</div></div>{extra?.(item)}</div></article>)}</div>}{open && <Modal title={edit ? `Edit ${kind.replace(/s$/, '').toLowerCase()}` : `Add to ${kind.toLowerCase()}`} close={() => setOpen(false)}><form onSubmit={save} className="flex flex-col h-full"><div className="flex-1"><Fields fields={fields} value={form} change={setForm} upload={uploadFile} uploading={uploadingFile} uploadStatus={uploadStatus} activeUploadField={activeUploadField} /></div><div className="sticky bottom-0 -mx-5 -mb-5 bg-white/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-line sm:border-none pt-4 sm:pt-6 mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end z-10"><button type="button" onClick={() => setOpen(false)} data-testid="button-cancel-form" className="btn btn-line min-h-[44px]">Cancel</button><button type="submit" data-testid="button-save-form" className="btn btn-primary min-h-[44px]" disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending || uploadingFile) && <Loader2 size={15} className="animate-spin" />}{uploadingFile ? (saveWhenReady ? 'Saving when ready…' : 'Save when ready') : 'Save entry'}</button></div></form></Modal>}</>;

}
