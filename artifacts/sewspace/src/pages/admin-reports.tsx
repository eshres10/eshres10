import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListReportsQueryKey,
  useGetProfile,
  useListReports,
  useResolveReport,
  type Report,
  type ReportReason,
} from '@workspace/api-client-react';
import { ExternalLink, Flag, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorState, Loading } from '@/components/common';
import { timeAgo } from '@/lib/time';
import NotFound from '@/pages/not-found';

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'removed', label: 'Removed' },
  { id: 'dismissed', label: 'Dismissed' },
] as const;
type Status = (typeof STATUSES)[number]['id'];

const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or hate',
  nudity: 'Nudity or sexual content',
  violence: 'Violence or dangerous acts',
  intellectual_property: 'Copied work or pattern piracy',
  other: 'Something else',
};
const KIND_LABEL = { post: 'Post', comment: 'Comment', profile: 'Profile', review: 'Review', challenge: 'Challenge', topic: 'Forum topic', forum_reply: 'Forum reply' } as const;

function ReportCard({ report }: { report: Report }) {
  const client = useQueryClient();
  const resolve = useResolveReport();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const act = (action: 'remove' | 'dismiss') => resolve.mutate({ id: report.id, data: { action } }, {
    onSuccess: () => STATUSES.forEach(s => client.invalidateQueries({ queryKey: getListReportsQueryKey({ status: s.id }) })),
  });
  const t = report.target;
  return (
    <article className="rounded-[30px] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-ink px-2.5 py-1 text-white">{KIND_LABEL[report.targetKind]}</span>
        <span className="rounded-full bg-peach-soft px-2.5 py-1 text-ink">{REASON_LABEL[report.reason]}</span>
        {report.openReportsOnTarget > 1 && <span className="rounded-full bg-yellow px-2.5 py-1 text-ink">{report.openReportsOnTarget} open reports</span>}
        <span className="ml-auto font-semibold text-subtle">{timeAgo(report.createdAt)}</span>
      </div>

      <div className="mt-4 flex gap-3 rounded-[20px] bg-canvas p-4">
        {t.imageUrl && <img src={t.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-[14px] object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t.authorName ?? 'Unknown'} {t.authorHandle && <span className="font-semibold text-subtle">@{t.authorHandle}</span>}</p>
          {t.text ? <p className="mt-1 line-clamp-6 whitespace-pre-line break-words text-sm">{t.text}</p> : <p className="mt-1 text-sm text-subtle">No text.</p>}
          {t.link
            ? <Link href={t.link} className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-sm font-bold text-blue-ink"><ExternalLink size={14} aria-hidden="true" />Open</Link>
            : !report.stillExists && <p className="mt-2 text-xs font-semibold text-subtle">Already removed. This is a copy from when it was reported.</p>}
        </div>
      </div>

      <p className="mt-3 text-sm"><span className="text-subtle">Reported by</span> <Link href={`/@${report.reporter.handle}`} className="font-semibold">@{report.reporter.handle}</Link></p>
      {report.details && <p className="mt-1 whitespace-pre-line break-words text-sm text-subtle">“{report.details}”</p>}

      {report.status === 'open' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {report.targetKind !== 'profile' && report.stillExists && (
            confirmRemove
              ? <>
                  <button type="button" disabled={resolve.isPending} onClick={() => act('remove')} className="btn bg-red text-white">
                    {resolve.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} aria-hidden="true" />}Yes, remove for everyone
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className="btn btn-line"><X size={15} aria-hidden="true" />Cancel</button>
                </>
              : <button type="button" onClick={() => setConfirmRemove(true)} className="btn bg-red text-white"><Trash2 size={15} aria-hidden="true" />Remove {report.targetKind}</button>
          )}
          {!confirmRemove && (
            <button type="button" disabled={resolve.isPending} onClick={() => act('dismiss')} className="btn btn-line"><ShieldCheck size={15} aria-hidden="true" />Dismiss</button>
          )}
        </div>
      )}
      {report.status !== 'open' && report.resolvedAt && <p className="mt-3 text-xs font-semibold text-subtle">{report.status === 'removed' ? 'Removed' : 'Dismissed'} {timeAgo(report.resolvedAt)}</p>}
      {resolve.isError && <p role="alert" className="mt-2 text-sm font-semibold text-red-ink">That didn't work. Try again.</p>}
    </article>
  );
}

/** Report review for admins (ADMIN_USER_IDS). */
export function AdminReportsPage() {
  const me = useGetProfile();
  const [status, setStatus] = useState<Status>('open');
  const reports = useListReports({ status }, { query: { enabled: Boolean(me.data?.isAdmin) } });
  useEffect(() => { document.title = 'Reports · SewSpace'; }, []);
  if (me.isLoading) return <Loading />;
  if (!me.data?.isAdmin) return <NotFound embedded />;
  return (
    <div className="mx-auto max-w-[760px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-subtle">Removing deletes the post or comment for everyone and closes every open report on it. Removing a challenge deletes it with its entries list (the posts stay). Profiles can only be dismissed; block or contact the person instead.</p>
        <div role="tablist" aria-label="Report status" className="flex gap-1 rounded-full bg-white p-1">
          {STATUSES.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={status === s.id} onClick={() => setStatus(s.id)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-bold ${status === s.id ? 'bg-ink text-white' : 'text-ink'}`}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {reports.isLoading ? <Loading />
          : reports.isError ? <ErrorState retry={() => reports.refetch()} />
          : !reports.data?.length
            ? (
              <div className="grid place-items-center rounded-[30px] bg-white px-6 py-14 text-center">
                <Flag size={28} aria-hidden="true" />
                <p className="mt-3 font-display text-xl">{status === 'open' ? 'No open reports' : 'Nothing here'}</p>
              </div>
            )
            : reports.data.map(r => <ReportCard key={r.id} report={r} />)}
      </div>
    </div>
  );
}
