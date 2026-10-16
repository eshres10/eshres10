import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, GripVertical, Check, Trash2, Edit2, X, Loader2 } from 'lucide-react';
import {
  useCreateProjectStep,
  useUpdateProjectStep,
  useDeleteProjectStep,
  getGetProjectQueryKey,
  getListProjectsQueryKey
} from '@workspace/api-client-react';

export function ProjectSteps({ project }: { project: any }) {
  const client = useQueryClient();
  const create = useCreateProjectStep();
  const update = useUpdateProjectStep();
  const remove = useDeleteProjectStep();

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const steps = [...(project.steps || [])].sort((a, b) => a.position - b.position);

  const invalidate = () => {
    client.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
    client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    create.mutate(
      {
        projectId: project.id,
        data: {
          title: newTitle.trim(),
          position: steps.length,
          completed: false
        }
      },
      {
        onSuccess: () => {
          setNewTitle('');
          invalidate();
          inputRef.current?.focus();
        }
      }
    );
  };

  const handleToggle = (step: any) => {
    update.mutate(
      {
        projectId: project.id,
        stepId: step.id,
        data: { completed: !step.completed }
      },
      { onSuccess: invalidate }
    );
  };

  const handleSaveEdit = () => {
    if (!editingId || !editTitle.trim()) {
      setEditingId(null);
      return;
    }
    update.mutate(
      {
        projectId: project.id,
        stepId: editingId,
        data: { title: editTitle.trim() }
      },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        }
      }
    );
  };

  const handleDelete = (stepId: number) => {
    if (window.confirm('Delete this step?')) {
      remove.mutate(
        { projectId: project.id, stepId },
        { onSuccess: invalidate }
      );
    }
  };

  const completedCount = steps.filter(s => s.completed).length;
  const totalCount = steps.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="studio-card rounded-xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl text-[#302621]">Construction Steps</h2>
          <p className="mt-1 text-sm text-[#79675c]">Check off your progress as you sew.</p>
        </div>
        <div className="text-right" data-testid="progress-summary">
          <p className="font-mono-custom text-xl text-[#b24761]">{percentage}%</p>
          <p className="text-xs text-[#887566]">{completedCount} of {totalCount} completed</p>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`group flex items-start gap-3 rounded-lg border p-3 transition-colors ${
              step.completed ? 'border-transparent bg-[#e7d9c5]/50' : 'border-[#d4c5b0] bg-white'
            }`}
          >
            <button
              onClick={() => handleToggle(step)}
              data-testid={`toggle-step-${step.id}`}
              className="relative grid min-h-[44px] min-w-[44px] shrink-0 place-items-center sm:min-h-[auto] sm:min-w-[auto] sm:mt-0.5"
              aria-label={step.completed ? "Mark incomplete" : "Mark complete"}
            >
              <div className={`grid h-6 w-6 sm:h-5 sm:w-5 place-items-center rounded border transition-colors ${
                step.completed
                  ? 'border-[#b24761] bg-[#b24761] text-white'
                  : 'border-[#d4c5b0] bg-[#fbf6ed] hover:border-[#b24761]'
              }`}>
                {step.completed && <Check size={14} className="sm:w-3 sm:h-3" strokeWidth={3} />}
              </div>
            </button>

            <div className="min-w-0 flex-1 py-3 sm:py-0">
              {editingId === step.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={handleSaveEdit}
                    data-testid={`input-edit-step-${step.id}`}
                    className="w-full border-b border-[#b24761] bg-transparent pb-1 text-base sm:text-sm text-[#302621] outline-none"
                  />
                </div>
              ) : (
                <p
                  className={`text-base sm:text-sm ${step.completed ? 'text-[#887566] line-through' : 'text-[#302621]'}`}
                  onDoubleClick={() => {
                    setEditTitle(step.title);
                    setEditingId(step.id);
                  }}
                >
                  {step.title}
                </p>
              )}
            </div>

            <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                onClick={() => { setEditTitle(step.title); setEditingId(step.id); }}
                data-testid={`edit-step-${step.id}`}
                className="grid min-h-[44px] min-w-[44px] sm:min-h-[24px] sm:min-w-[24px] place-items-center rounded-md text-[#887566] hover:bg-[#e7d9c5] hover:text-[#302621]"
                aria-label="Edit step"
              >
                <Edit2 size={16} className="sm:w-3 sm:h-3" />
              </button>
              <button
                onClick={() => handleDelete(step.id)}
                data-testid={`delete-step-${step.id}`}
                className="grid min-h-[44px] min-w-[44px] sm:min-h-[24px] sm:min-w-[24px] place-items-center rounded-md text-[#887566] hover:bg-[#f3d9d5] hover:text-[#9d443f]"
                aria-label="Delete step"
              >
                <Trash2 size={16} className="sm:w-3 sm:h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 rounded-lg border border-[#b24761] bg-white p-2">
          <input
            ref={inputRef}
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Sew shoulder seams..."
            data-testid="input-new-step"
            className="flex-1 w-full sm:w-auto bg-transparent px-2 py-2 text-base sm:text-sm text-[#302621] outline-none"
          />
          <div className="flex w-full sm:w-auto gap-2 justify-end">
            <button
              type="submit"
              disabled={create.isPending || !newTitle.trim()}
              data-testid="button-save-step"
              className="min-h-[44px] sm:min-h-[auto] flex-1 sm:flex-none justify-center rounded-md bg-[#b24761] px-4 py-2 sm:px-3 sm:py-1.5 text-sm sm:text-xs font-semibold text-white hover:bg-[#9d3e56] disabled:opacity-50 inline-flex items-center"
            >
              {create.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="grid min-h-[44px] min-w-[44px] sm:min-h-[auto] sm:min-w-[auto] place-items-center rounded-md text-[#887566] hover:bg-[#e7d9c5]"
              aria-label="Cancel"
            >
              <X size={18} className="sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          data-testid="button-add-step"
          className="mt-4 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4c5b0] py-3 text-sm font-semibold text-[#887566] transition-colors hover:border-[#b24761] hover:bg-[#fbf6ed] hover:text-[#b24761]"
        >
          <Plus size={16} /> Add a step
        </button>
      )}
    </div>
  );
}
