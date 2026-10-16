import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProjectQueryKey, getListProjectsQueryKey, useSetVisibility } from '@workspace/api-client-react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { VisibilityPicker, type Visibility } from '@/components/visibility';

/** Make log sharing panel: who can see this make, and its public link. */
export function ProjectSharing({ project }: { project: { id: number; visibility: string } }) {
  const client = useQueryClient();
  const setVisibility = useSetVisibility();
  const [copied, setCopied] = useState(false);
  const value = project.visibility as Visibility;
  const link = `${window.location.origin}/makes/${project.id}`;

  const change = (visibility: Visibility) => {
    setVisibility.mutate({ kind: 'project', id: project.id, data: { visibility } }, {
      onSuccess: () => {
        client.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
        client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is still visible to select.
    }
  };

  return (
    <section className="studio-card p-6" aria-labelledby="sharing-title">
      <h2 id="sharing-title" className="eyebrow">Sharing</h2>
      <div className="mt-4">
        <VisibilityPicker value={value} onChange={change} disabled={setVisibility.isPending} legend="Who can see this make"
          note="Measurements and pattern PDFs are never shown." />
      </div>
      {setVisibility.isError && <p role="alert" className="mt-2 text-sm font-semibold text-red-ink">That didn't save. Try again.</p>}
      {value !== 'private' && (
        <div className="mt-4 space-y-2">
          <p className="truncate rounded-2xl bg-canvas px-3 py-2 text-xs text-subtle" title={link}>{link}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn btn-line">{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? 'Copied' : 'Copy link'}</button>
            <Link href={`/makes/${project.id}`} className="btn btn-quiet no-underline"><ExternalLink size={15} aria-hidden="true" />View as others see it</Link>
          </div>
        </div>
      )}
    </section>
  );
}
