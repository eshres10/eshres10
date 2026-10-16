import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import { ChevronLeft, Pencil, BookOpen, Palette, Package, Ruler, FolderKanban, Loader2 } from 'lucide-react';
import {
  useGetProject,
  useListPatterns,
  useListFabrics,
  useListThreads,
  useListMeasurementProfiles,
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey
} from '@workspace/api-client-react';
import { ProjectFormModal } from './ProjectForm';
import { ProjectSteps } from './ProjectSteps';
import { ProjectPhotos } from './ProjectPhotos';
import { ProjectSharing } from './ProjectSharing';

export function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const id = Number(params?.id);
  const client = useQueryClient();
  const update = useUpdateProject();

  const { data: project, isLoading, isError, refetch } = useGetProject(id, { query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) } });

  const { data: patterns = [] } = useListPatterns();
  const { data: fabrics = [] } = useListFabrics();
  const { data: threads = [] } = useListThreads();
  const { data: measurements = [] } = useListMeasurementProfiles();

  const [formOpen, setFormOpen] = useState(false);

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

  const statusColors: Record<string, string> = {
    planning: 'bg-canvas text-subtle',
    cutting: 'bg-peach text-subtle',
    sewing: 'bg-peach text-ink',
    fitting: 'bg-ink text-white',
    finished: 'bg-yellow text-ink',
  };

  const handleUpdateNotes = (field: string, value: string) => {
    update.mutate(
      { id: project.id, data: { name: project.name, [field]: value || null } },
      {
        onSuccess: () => {
          client.setQueryData(getGetProjectQueryKey(project.id), (old: any) =>
            old ? { ...old, [field]: value || null } : old
          );
        }
      }
    );
  };

  return (
    <div data-testid="project-detail">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/projects" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-subtle hover:text-ink">
          <ChevronLeft size={16} /> <span className="hidden sm:inline">Back to notebook</span><span className="sm:hidden">Back</span>
        </Link>
        <button
          onClick={() => setFormOpen(true)}
          data-testid="button-edit-project"
          className="btn btn-line min-h-[44px] px-3 py-1.5 text-xs sm:min-h-[auto]"
        >
          <Pencil size={14} /> <span className="hidden sm:inline">Edit project details</span><span className="sm:hidden">Edit</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px] xl:grid-cols-[1fr_400px]">
        {/* Main Content Column */}
        <div className="space-y-6">
          {/* Header Card */}
          <div className="studio-card overflow-hidden rounded-xl">
            {project.coverImageUrl && (
              <div className="h-64 w-full bg-peach">
                <img src={project.coverImageUrl} alt={project.name} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="p-6 md:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 font-mono-custom text-[.6rem] uppercase tracking-wider ${statusColors[project.status] || 'bg-canvas text-subtle'}`}>
                  {project.status.replace('_', ' ')}
                </span>
                {project.completedAt && (
                  <span className="font-mono-custom text-[.6rem] uppercase text-subtle">
                    Finished {new Date(project.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <h1 className="font-display text-4xl leading-tight text-ink md:text-5xl">{project.name}</h1>
              {project.description && (
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-subtle">{project.description}</p>
              )}

              {/* Progress Bar inside Header */}
              <div className="mt-8 rounded-lg bg-white p-4">
                <div className="mb-2 flex justify-between font-mono-custom text-xs text-subtle">
                  <span className="uppercase tracking-widest">Overall Progress</span>
                  <span>{project.progress || 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-yellow transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, project.progress || 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <ProjectSteps project={project} />

          <ProjectPhotos project={project} />

        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <ProjectSharing project={project} />
          {/* Materials Card */}
          <div className="studio-card rounded-xl p-6">
            <h3 className="font-display text-2xl text-ink">Materials</h3>
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded bg-canvas text-subtle">
                  <BookOpen size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Pattern</p>
                  {pattern ? (
                    <Link href="/patterns" className="text-sm font-medium text-red-ink hover:underline">{pattern.name}</Link>
                  ) : (
                    <p className="text-sm text-ink">None selected</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded bg-canvas text-subtle">
                  <Palette size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Fabric</p>
                  {fabric ? (
                    <Link href="/stash/fabrics" className="text-sm font-medium text-red-ink hover:underline">{fabric.name} ({fabric.color})</Link>
                  ) : (
                    <p className="text-sm text-ink">None selected</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded bg-canvas text-subtle">
                  <Package size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Thread</p>
                  {thread ? (
                    <Link href="/stash/threads" className="text-sm font-medium text-red-ink hover:underline">{thread.colorName} ({thread.brand})</Link>
                  ) : (
                    <p className="text-sm text-ink">None selected</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded bg-canvas text-subtle">
                  <Ruler size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Measurements</p>
                  {measurement ? (
                    <Link href="/measurements" className="text-sm font-medium text-red-ink hover:underline">{measurement.name}</Link>
                  ) : (
                    <p className="text-sm text-ink">None selected</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Journal Cards */}
          <div className="space-y-4">
            {[
              { id: 'notes', title: 'Notes', placeholder: 'General project notes, things to remember...' },
              { id: 'alterations', title: 'Alterations', placeholder: 'Adjustments made to the pattern...' },
              { id: 'problems', title: 'Problems', placeholder: 'Issues encountered...' },
              { id: 'solutions', title: 'Solutions', placeholder: 'How you fixed them...' }
            ].map((section) => (
              <div key={section.id} className="studio-card rounded-xl p-5">
                <h3 className="font-mono-custom text-[.7rem] uppercase tracking-widest text-subtle">{section.title}</h3>
                <textarea
                  defaultValue={String((project as any)[section.id] || '')}
                  onBlur={(e) => {
                    if (e.target.value !== (project as any)[section.id]) {
                      handleUpdateNotes(section.id, e.target.value);
                    }
                  }}
                  placeholder={section.placeholder}
                  data-testid={`textarea-${section.id}`}
                  className="mt-3 w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-subtle"
                  rows={Math.max(3, String((project as any)[section.id] || '').split('\n').length)}
                />
              </div>
            ))}
          </div>

        </div>
      </div>

      {formOpen && (
        <ProjectFormModal project={project} close={() => setFormOpen(false)} />
      )}
    </div>
  );
}
