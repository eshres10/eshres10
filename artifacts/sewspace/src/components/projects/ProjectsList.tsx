import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  FolderKanban, Plus, Search, Scissors, Trash2, Edit2, Pencil
} from 'lucide-react';
import {
  useListProjects,
  useDeleteProject,
  getListProjectsQueryKey
} from '@workspace/api-client-react';
import { ProjectFormModal } from './ProjectForm';
import { VisibilityBadge } from '@/components/visibility';

export function ProjectsList() {
  const [search, setSearch] = useState('');
  const { data: projects = [], isLoading, isError, refetch } = useListProjects();
  const deleteProject = useDeleteProject();
  const client = useQueryClient();
  const [, setLocation] = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  const filtered = projects.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Remove this project from your notebook?')) {
      deleteProject.mutate({ id }, {
        onSuccess: () => client.invalidateQueries({ queryKey: getListProjectsQueryKey() })
      });
    }
  };

  const handleEdit = (e: React.MouseEvent, project: any) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingProject(project);
    setFormOpen(true);
  };

  const statusColors: Record<string, string> = {
    planning: 'bg-canvas text-subtle',
    cutting: 'bg-peach text-subtle',
    sewing: 'bg-peach text-ink',
    fitting: 'bg-ink text-white',
    finished: 'bg-yellow text-ink',
  };

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Link
          href="/projects/new"
          data-testid="button-create-project"
          className="btn btn-primary min-h-[44px] w-full no-underline md:w-auto"
        >
          <Plus size={16} /> Start a project
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-projects"
            placeholder="Search notebook…"
            className="field pl-9"
          />
        </div>
        <span className="font-mono-custom text-xs text-subtle">{filtered.length} found</span>
      </div>

      {isLoading ? (
        <div className="space-y-4" data-testid="state-loading">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-canvas/50" />)}
          </div>
        </div>
      ) : isError ? (
        <div className="studio-card rounded-xl px-5 py-20 text-center" data-testid="state-error">
          <FolderKanban className="mx-auto text-red-ink" size={32} />
          <h2 className="mt-4 font-display text-2xl">The notebook is closed</h2>
          <p className="mt-2 text-sm text-subtle">We could not load your projects right now.</p>
          <button onClick={() => refetch()} data-testid="button-retry" className="btn btn-primary mt-5">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="studio-card rounded-xl px-5 py-20 text-center" data-testid="state-empty">
          <Scissors className="mx-auto text-red-ink" size={32} />
          <h2 className="mt-5 font-display text-2xl text-ink">A blank page</h2>
          <p className="mt-2 text-sm text-subtle">Your notebook is waiting for its first make.</p>
          <Link href="/projects/new" data-testid="button-empty-add" className="btn btn-primary mt-5 no-underline">
            <Plus size={15} /> Start a project
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project: any) => (
            <Link
              href={`/projects/${project.id}`}
              key={project.id}
              data-testid={`card-project-${project.id}`}
              className="studio-card group relative block overflow-hidden rounded-xl transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="relative h-44 w-full bg-peach">
                {project.coverImageUrl ? (
                  <img src={project.coverImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#ff8562_0_2px,transparent_2px_10px)] opacity-20" />
                )}

                <span className={`absolute left-4 top-4 rounded-full px-2.5 py-1 font-mono-custom text-[.6rem] uppercase tracking-wider ${statusColors[project.status] || 'bg-canvas text-subtle'}`}>
                  {project.status.replace('_', ' ')}
                </span>

                <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={(e) => handleEdit(e, project)}
                    data-testid={`button-edit-${project.id}`}
                    className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white md:h-8 md:w-8"
                    aria-label="Edit project"
                  >
                    <Pencil size={16} className="md:w-3.5 md:h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    data-testid={`button-delete-${project.id}`}
                    className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-red-ink shadow-sm hover:bg-red hover:text-white md:h-8 md:w-8"
                    aria-label="Delete project"
                  >
                    <Trash2 size={16} className="md:w-3.5 md:h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-5">
                <h3 className="font-display text-[1.45rem] leading-tight text-ink line-clamp-1">{project.name}</h3>
                <VisibilityBadge value={project.visibility} className="mt-1.5" />

                <div className="mt-4">
                  <div className="mb-2 flex justify-between font-mono-custom text-xs text-subtle">
                    <span>Progress</span>
                    <span>{project.progress || 0}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-yellow transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, project.progress || 0)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between text-xs text-subtle">
                  <span className="font-medium">Open workspace →</span>
                  {project.completedAt && <span>Finished {new Date(project.completedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {formOpen && (
        <ProjectFormModal project={editingProject} close={() => setFormOpen(false)} />
      )}
    </>
  );
}
