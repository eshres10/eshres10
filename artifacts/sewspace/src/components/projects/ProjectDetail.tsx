import React, { useState } from 'react';
import { updateProjectFields, type ProjectDetail as ProjectDetailData } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import { ChevronLeft, Pencil, BookOpen, Palette, Package, Ruler, FolderKanban, Loader2 } from 'lucide-react';
import {
  useGetProject,
  useListPatterns,
  useListFabrics,
  useListThreads,
  useListMeasurementProfiles,
  getGetProjectQueryKey,
  getListProjectsQueryKey
} from '@workspace/api-client-react';
import { ProjectFormModal } from './ProjectForm';
import { ProjectSteps } from './ProjectSteps';
import { ProjectPhotos } from './ProjectPhotos';
import { ProjectSharing } from './ProjectSharing';
import { Journal } from './Journal';
import { SetupChecklist } from './SetupChecklist';

export function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const id = Number(params?.id);
  const client = useQueryClient();

  const { data: project, isLoading, isError, refetch } = useGetProject(id, { query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) } });

  const { data: patterns = [] } = useListPatterns();
  const { data: fabrics = [] } = useListFabrics();
  const { data: threads = [] } = useListThreads();
  const { data: measurements = [] } = useListMeasurementProfiles();

  const [formOpen, setFormOpen] = useState(false);
  const [addSignal, setAddSignal] = useState(0);
  const [stageError, setStageError] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4 p-5 md:p-10" data-testid="state-loading">
        <div className="h-8 w-56 animate-pulse rounded bg-canvas" />
        <div className="h-64 animate-pulse rounded-xl bg-canvas" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="studio-card mx-auto mt-10 max-w-lg rounded-xl px-5 py-20 text-center" data-testid="state-error">
        <FolderKanban className="mx-auto text-red-ink" size={32} />
        <h2 className="mt-4 font-display text-2xl">Project not found</h2>
        <p className="mt-2 text-sm text-subtle">We could not load this project. It may have been removed.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/projects" className="btn btn-line">Back to projects</Link>
          <button onClick={() => refetch()} className="btn btn-primary">Try again</button>
        </div>
      </div>
    );
  }

  const pattern = patterns.find((p: any) => p.id === project.patternId);
  const fabric = fabrics.find((f: any) => f.id === project.fabricId);
  const thread = threads.find((t: any) => t.id === project.threadId);
  const measurement = measurements.find((m: any) => m.id === project.measurementProfileId);

  const stages = ['planning', 'cutting', 'sewing', 'fitting', 'finished'] as const;
  const stepsList = project.steps ?? [];
  const doneSteps = stepsList.filter(st => st.completed).length;
  const changeStage = async (status: (typeof stages)[number]) => {
    setStageError(false);
    try {
      const row = await updateProjectFields(project.id, { status });
      client.setQueryData(getGetProjectQueryKey(project.id), (old: ProjectDetailData | undefined) => (old ? { ...old, ...row, steps: old.steps, photos: old.photos } : old));
      client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    } catch {
      setStageError(true);
    }
  };

  // Phones: one column in reading order. Desktop: the setup list, sharing
  // and materials in the right column. (Columns use display: contents on
  // phones so their cards can be ordered together.)
  return (
    <div data-testid="project-detail" className="mx-auto max-w-[1232px]">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex min-h-[44px] items-center gap-1.5 text-sm">
          <Link href="/projects" className="inline-flex items-center gap-1 text-subtle underline-offset-2 hover:underline"><ChevronLeft size={16} className="lg:hidden" aria-hidden="true" />Projects</Link>
          <span className="hidden text-subtle lg:inline" aria-hidden="true">›</span>
          <span className="hidden font-bold lg:inline">{project.name}</span>
        </nav>
        <button onClick={() => setFormOpen(true)} data-testid="button-edit-project" className="btn btn-line min-h-[44px] px-3 text-xs">
          <Pencil size={14} aria-hidden="true" /> Edit details
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="contents lg:block lg:space-y-4">
          <section className="order-1 flex items-center gap-4 rounded-[30px] bg-white p-4 lg:p-6" aria-labelledby="project-title">
            {project.coverImageUrl && <img src={project.coverImageUrl} alt="" className="h-[150px] w-[120px] shrink-0 rounded-[22px] object-cover lg:h-[175px] lg:w-[140px]" />}
            <div className="min-w-0">
              <label className="sr-only" htmlFor="project-stage">Stage</label>
              <select id="project-stage" value={project.status} onChange={e => changeStage(e.target.value as (typeof stages)[number])}
                className="min-h-[36px] rounded-full bg-canvas px-3 text-sm font-bold">
                {stages.map(st => <option key={st} value={st}>{st[0].toUpperCase() + st.slice(1)}{st === project.status && stepsList.length ? ` · ${project.progress}%` : ''}</option>)}
              </select>
              {stageError && <p role="alert" className="mt-1 text-xs font-semibold text-red-ink">The stage didn't change. Try again.</p>}
              <h1 id="project-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-.05em] lg:text-[44px]">{project.name}</h1>
              <p className="mt-1 text-sm text-subtle">{[project.garment, pattern?.name, project.size ? `Size ${project.size}` : null].filter(Boolean).join(' · ') || 'Add a pattern and size in the setup list.'}</p>
              {stepsList.length > 0 && (
                <div className="mt-3 max-w-[320px]">
                  <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={project.progress}>
                    <div className="h-full rounded-full bg-yellow transition-all" style={{ width: `${project.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-subtle">{doneSteps} of {stepsList.length} steps done</p>
                </div>
              )}
              {project.completedAt && <p className="mt-2 text-xs text-subtle">Finished {new Date(project.completedAt).toLocaleDateString()}</p>}
            </div>
          </section>
          <div className="order-3"><ProjectSteps project={project} addSignal={addSignal} /></div>
          <div className="order-4"><Journal project={project} /></div>
          <div className="order-5"><ProjectPhotos project={project} /></div>
        </div>

        <div className="contents lg:block lg:space-y-4">
          <div className="order-2"><SetupChecklist project={project} onAddOwnStep={() => setAddSignal(n => n + 1)} /></div>
          <div className="order-6"><ProjectSharing project={project} /></div>
          <section className="order-7 rounded-[30px] bg-white p-6" aria-labelledby="materials-title">
            <h2 id="materials-title" className="font-display text-2xl tracking-[-.04em]">Materials</h2>
            <dl className="mt-4 space-y-3">
              {[
                { icon: BookOpen, label: 'Pattern', value: pattern?.name, href: '/patterns' },
                { icon: Palette, label: 'Fabric', value: fabric ? `${fabric.name} (${fabric.color})` : null, href: '/stash/fabrics' },
                { icon: Package, label: 'Thread', value: thread ? `${thread.colorName} (${thread.brand})` : null, href: '/stash/threads' },
                { icon: Ruler, label: 'Measurements', value: measurement?.name, href: '/measurements' },
              ].map(m => (
                <div key={m.label} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas" aria-hidden="true"><m.icon size={16} /></span>
                  <div>
                    <dt className="text-xs font-semibold text-subtle">{m.label}</dt>
                    <dd>{m.value ? <Link href={m.href} className="text-sm font-semibold text-blue-ink hover:underline">{m.value}</Link> : <span className="text-sm">None yet</span>}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {formOpen && <ProjectFormModal project={project} close={() => setFormOpen(false)} />}
    </div>
  );
}
