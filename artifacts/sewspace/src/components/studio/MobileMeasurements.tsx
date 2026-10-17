import { useEffect, useState } from 'react';
import type { MeasurementProfile } from '@workspace/api-client-react';
import { Lock, Plus } from 'lucide-react';
import { Toggle } from './parts';

// Measurements on phones (Phase S4). Values stay stored as they are (in the
// person's profile unit); the cm / in toggle only changes what's shown.
const GROUPS: Array<[string, Array<[string, string]>]> = [
  ['Upper body', [['bust', 'Bust'], ['underbust', 'Underbust'], ['shoulderWidth', 'Shoulder width'], ['neck', 'Neck'], ['upperArm', 'Upper arm']]],
  ['Waist & hips', [['waist', 'Waist'], ['highHip', 'High hip'], ['fullHip', 'Full hip'], ['rise', 'Rise']]],
  ['Lengths', [['height', 'Height'], ['backLength', 'Back length'], ['frontLength', 'Front length'], ['armLength', 'Arm length'], ['inseam', 'Inseam'], ['wrist', 'Wrist']]],
];

type Unit = 'cm' | 'in';
/** Convert a stored value for display: inches to the nearest ¼, centimetres to one decimal. */
function display(value: number, stored: Unit, shown: Unit): number {
  if (stored === shown) return shown === 'in' ? Math.round(value * 4) / 4 : Math.round(value * 10) / 10;
  return shown === 'in' ? Math.round((value / 2.54) * 4) / 4 : Math.round(value * 2.54 * 10) / 10;
}
const monthYear = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function MobileMeasurements({ sets, storedUnit, onNew, onEdit, onDelete }: {
  sets: MeasurementProfile[]; storedUnit: Unit; onNew: () => void; onEdit: (set: MeasurementProfile) => void; onDelete: (id: number) => void;
}) {
  const ordered = [...sets].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id - a.id);
  const [selectedId, setSelectedId] = useState<number | null>(ordered[0]?.id ?? null);
  const [unit, setUnit] = useState<Unit>(storedUnit);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setUnit(storedUnit), [storedUnit]);
  useEffect(() => { if (!ordered.some(s => s.id === selectedId)) setSelectedId(ordered[0]?.id ?? null); }, [sets]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setConfirmDelete(false), [selectedId]);

  const at = ordered.findIndex(s => s.id === selectedId);
  const selected = ordered[at];
  // Compared with the set before it; the oldest set is compared with the one after.
  const other = at >= 0 ? ordered[at + 1] ?? (at > 0 ? ordered[at - 1] : undefined) : undefined;
  const value = (set: MeasurementProfile | undefined, key: string) => {
    const v = (set?.measurements as Record<string, number | undefined> | undefined)?.[key];
    return typeof v === 'number' ? v : null;
  };

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-3 rounded-[22px] bg-ink px-4 py-3 text-[15px] font-bold text-white">
        <Lock size={18} className="shrink-0" aria-hidden="true" />Only you can see these. They never appear on shared makes.
      </p>
      <div role="radiogroup" aria-label="Measurement sets" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ordered.map(s => (
          <button key={s.id} type="button" role="radio" aria-checked={s.id === selectedId} onClick={() => setSelectedId(s.id)}
            className={`min-h-[56px] shrink-0 rounded-[18px] border-2 px-4 py-1.5 text-left ${s.id === selectedId ? 'border-ink bg-yellow' : 'border-transparent bg-white'}`}>
            <span className="block font-bold">{s.name}</span><span className="block text-xs text-subtle">{monthYear(s.recordedAt)}</span>
          </button>
        ))}
        <button type="button" onClick={onNew} className="flex min-h-[56px] shrink-0 items-center gap-1.5 rounded-[18px] border-2 border-dashed border-subtle/40 px-4 font-bold">
          <Plus size={16} aria-hidden="true" />New set
        </button>
      </div>

      {!selected ? (
        <div className="rounded-[26px] bg-white px-5 py-10 text-center">
          <p className="font-display text-xl">No measurements yet</p>
          <p className="mt-1 text-[15px] text-subtle">Record a set to compare as you go. Only you can see them.</p>
          <button type="button" onClick={onNew} className="btn btn-primary mt-4 min-h-[44px]">Add measurements</button>
        </div>
      ) : <>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-subtle">{other ? `Compared with ${other.name} (${monthYear(other.recordedAt)})` : 'Your only set so far'}</p>
          <Toggle label="Units" value={unit} onChange={value => setUnit(value as Unit)} options={[{ value: 'cm', label: 'cm', name: 'Centimetres' }, { value: 'in', label: 'in', name: 'Inches' }]} />
        </div>
        {GROUPS.map(([group, rows]) => (
          <section key={group} aria-label={group} className="rounded-[26px] bg-white px-4 pb-1 pt-4">
            <h2 className="eyebrow text-subtle">{group}</h2>
            <dl className="mt-1 divide-y divide-line">
              {rows.map(([key, label]) => {
                const v = value(selected, key), was = value(other, key);
                const delta = v !== null && was !== null ? display(v - was, storedUnit, unit) : 0;
                return (
                  <div key={key} className="flex min-h-[48px] items-center gap-3">
                    <dt className="flex-1 text-[15px]">{label}</dt>
                    {delta !== 0 && (
                      <dd className={`text-sm font-bold ${delta < 0 ? 'text-blue-ink' : 'text-red-ink'}`} aria-label={`${delta < 0 ? 'down' : 'up'} ${Math.abs(delta)} ${unit}`}>
                        {delta > 0 ? '+' : '−'}{Math.abs(delta)}
                      </dd>
                    )}
                    <dd className="min-w-[72px] text-right font-display text-[20px] tracking-[-.03em]">
                      {v === null ? <span className="text-subtle">—</span> : <>{display(v, storedUnit, unit)}<span className="ml-0.5 text-[15px]">{unit}</span></>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
        {selected.notes && <p className="rounded-[22px] bg-white px-4 py-3 text-sm text-subtle">{selected.notes}</p>}
        <button type="button" onClick={() => onEdit(selected)} className="flex min-h-[56px] w-full items-center justify-center rounded-full bg-yellow text-lg font-bold text-ink">Update measurements</button>
        <button type="button" onClick={() => (confirmDelete ? onDelete(selected.id) : setConfirmDelete(true))}
          className={`flex min-h-[48px] w-full items-center justify-center rounded-full text-sm font-bold ${confirmDelete ? 'bg-red text-white' : 'text-red-ink'}`}>
          {confirmDelete ? `Tap again to delete "${selected.name}"` : 'Delete this set'}
        </button>
      </>}
    </div>
  );
}
